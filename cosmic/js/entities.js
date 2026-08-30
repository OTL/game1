/* ============================================================
   COSMIC EATER - entities.js
   天体・破片・パーティクルの生成と更新ロジック
   ============================================================ */
'use strict';

const NAME_PARTS_A = ['カイ', 'ゼノ', 'ルナ', 'ヴェガ', 'アステ', 'ノヴァ', 'ドラコ', 'シリウス', 'オリ', 'ネビュ', 'クロノ', 'ティタ', 'エウロ', 'ガイア', 'ヘリオ'];
const NAME_PARTS_B = ['ロイド', 'リア', 'ウス', 'ゼル', 'ノン', 'ィナ', 'クス', 'ラ', 'ドン', 'ィス', 'ムーン', 'ベルグ', 'ソール', 'ナイト'];
function randomBodyName(rng) {
  return NAME_PARTS_A[(rng() * NAME_PARTS_A.length) | 0] + NAME_PARTS_B[(rng() * NAME_PARTS_B.length) | 0];
}

/* 質量→半径 (立方根スケール。見やすさのため係数調整) */
function massToRadius(mass) {
  return 6 * Math.pow(Math.max(mass, 0.4), 1 / 3);
}

const ENEMY_PALETTES = {
  asteroid: [
    { base: '#9a8f7d', dark: '#4c463c', light: '#cfc4ab' },
    { base: '#8a7e73', dark: '#3d3831', light: '#c2b6a2' },
  ],
  comet: [
    { base: '#bfe3ff', dark: '#5a86a8', light: '#ffffff' },
  ],
  planet: [
    { base: '#4f8fd1', dark: '#1e3a5c', light: '#bfe3ff' },
    { base: '#5cae6b', dark: '#234a2c', light: '#c9f2bd' },
    { base: '#c96f4a', dark: '#5c2c1e', light: '#ffcda8' },
    { base: '#a56fd6', dark: '#3c2159', light: '#e6c9ff' },
  ],
  hostile: [
    { base: '#d1495f', dark: '#4a1420', light: '#ff9aa8' },
  ],
};

function paletteFor(kind, rng) {
  const arr = ENEMY_PALETTES[kind] || ENEMY_PALETTES.asteroid;
  return arr[(rng() * arr.length) | 0];
}

let _bodyUid = 1;

function makeEnemyBody(kind, mass, x, y, rng) {
  const pal = paletteFor(kind, rng);
  const hostile = kind === 'hostile';
  return {
    uid: _bodyUid++,
    kind,
    x, y,
    vx: (rng() - 0.5) * (hostile ? 10 : 26),
    vy: (rng() - 0.5) * (hostile ? 10 : 26),
    mass,
    hp: mass,
    maxHp: mass,
    radius: massToRadius(mass),
    angle: rng() * Math.PI * 2,
    spin: (rng() - 0.5) * (hostile ? 0.6 : 0.25),
    seedBucket: (rng() * 10000) | 0,
    palette: pal,
    name: randomBodyName(rng),
    alive: true,
    isHostile: hostile,
    aiTimer: rng() * 2,
    tailPhase: rng() * 10,
    hitFlash: 0,
    despawnTimer: 0,
  };
}

function makePlayer(stage) {
  return {
    uid: 0,
    x: 0, y: 0, vx: 0, vy: 0,
    mass: BALANCE.startMass,
    hp: STAGES[0].maxHp,
    stageIdx: 0,
    angle: -Math.PI / 2,
    spin: 0.2,
    seedBucket: 1,
    hitFlash: 0,
    invuln: 0,
    tailTrail: [],
    upgrades: {},      // id -> level
    playTime: 0,
    absorbedCount: 0,
    totalMassGained: BALANCE.startMass,
    nextLevelMass: BALANCE.startMass * BALANCE.levelUpGrowth,
    level: 1,
    reviveUsed: false,
    fx: { veinsTimer: 0, auroraTimer: 0, stormTimer: 0, flareTimer: 0, cmeTimer: 0 },
    satellites: [], // {angle, dist}
  };
}

function currentStage(player) { return STAGES[player.stageIdx]; }

function playerMaxHp(player) {
  const base = currentStage(player).maxHp;
  const densityLv = player.upgrades.density || 0;
  const mult = 1 + (densityLv > 0 ? UPGRADES.find(u => u.id === 'density').vals[densityLv - 1] / 100 : 0);
  return base * mult;
}

function playerRadius(player) {
  const stage = currentStage(player);
  // ステージ内での相対成長も少し見た目に反映
  const nextMass = STAGES[Math.min(player.stageIdx + 1, STAGES.length - 1)].mass;
  const span = Math.max(nextMass - stage.mass, 1);
  const t = Math.min(1, (player.mass - stage.mass) / span);
  return stage.radiusBase * (0.85 + t * 0.3);
}

/* ---------- パーティクルプール ---------- */
class ParticlePool {
  constructor(max) {
    this.max = max;
    this.pool = new Array(max);
    for (let i = 0; i < max; i++) this.pool[i] = { active: false };
    this.cursor = 0;
  }
  spawn(opts) {
    const p = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % this.max;
    Object.assign(p, {
      active: true, life: opts.life || 0.6, age: 0,
      x: opts.x, y: opts.y, vx: opts.vx || 0, vy: opts.vy || 0,
      size: opts.size || 3, color: opts.color || '#fff',
      gravity: opts.gravity || 0, fade: opts.fade !== false, shrink: opts.shrink !== false,
      kind: opts.kind || 'dot',
    });
    return p;
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      const p = this.pool[i];
      if (!p.active) continue;
      p.age += dt;
      if (p.age >= p.life) { p.active = false; continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      p.vx *= 0.98; p.vy *= 0.98;
    }
  }
  forEachActive(fn) {
    for (let i = 0; i < this.max; i++) if (this.pool[i].active) fn(this.pool[i]);
  }
}

/* 浮遊ダメージ数値 */
class FloatTextPool {
  constructor(max) {
    this.max = max; this.pool = [];
    for (let i = 0; i < max; i++) this.pool.push({ active: false });
    this.cursor = 0;
  }
  spawn(x, y, text, color) {
    const p = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % this.max;
    Object.assign(p, { active: true, x, y, text, color: color || '#fff', age: 0, life: 0.9 });
  }
  update(dt) {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.age += dt;
      p.y -= 34 * dt;
      if (p.age >= p.life) p.active = false;
    }
  }
  forEachActive(fn) { for (const p of this.pool) if (p.active) fn(p); }
}

/* 破片（吸収可能な質量の粒） */
function makeFragment(x, y, mass, color, rng) {
  const ang = rng() * Math.PI * 2;
  const spd = 20 + rng() * 60;
  return {
    x, y,
    vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
    mass, color, alive: true,
    radius: Math.max(2.2, massToRadius(mass) * 0.6),
    life: 20,
  };
}

function spawnFragments(list, x, y, totalMass, color, rng, count) {
  count = count || Math.min(14, Math.max(3, Math.round(Math.sqrt(totalMass))));
  const per = totalMass / count;
  for (let i = 0; i < count; i++) {
    list.push(makeFragment(
      x + (rng() - 0.5) * 10, y + (rng() - 0.5) * 10, per, color, rng
    ));
  }
}
