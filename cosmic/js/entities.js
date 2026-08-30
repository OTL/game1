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

/* 準惑星以上（自己重力で丸くなった天体）かどうか。それ未満（岩石片〜小惑星クラス）は
 * 不規則なジャガイモ型でタンブリングさせる。 */
function isSphericalKind(kind) {
  return kind === 'planet' || kind === 'gasgiant' || kind === 'browndwarf' ||
    kind === 'star' || kind === 'giant' || kind === 'neutron' || kind === 'blackhole' || kind === 'dwarf';
}

function makeEnemyBody(kind, mass, x, y, rng) {
  const pal = paletteFor(kind, rng);
  const hostile = kind === 'hostile';
  const irregular = !isSphericalKind(kind); // asteroid / comet(核) / hostile は不規則形状
  return {
    uid: _bodyUid++,
    kind,
    x, y,
    vx: (rng() - 0.5) * (hostile ? 14 : 30),
    vy: (rng() - 0.5) * (hostile ? 14 : 30),
    mass,
    hp: mass,
    maxHp: mass,
    radius: massToRadius(mass),
    angle: rng() * Math.PI * 2,
    spin: (rng() - 0.5) * (hostile ? 0.7 : 0.32),
    // タンブリング用の不規則な角速度ゆらぎ（非等速回転）
    spinWobbleAmp: irregular ? 0.3 + rng() * 0.5 : 0,
    spinWobbleFreq: 0.4 + rng() * 1.1,
    spinWobblePhase: rng() * Math.PI * 2,
    irregularShape: irregular,
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
    spinPhase: 0,
    spinWobblePhase: 0,
    seedBucket: 1,
    hitFlash: 0,
    invuln: 0,
    tailTrail: [],
    upgrades: {},      // id -> level
    playTime: 0,
    absorbedCount: 0,
    totalMassGained: BALANCE.startMass,
    nextLevelMass: BALANCE.startMass * levelUpGrowthFor(1),
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

/* 破片（吸収可能な質量の粒）。運動量保存: 親天体の速度を引き継いだ上に、
 * 爆発による放射状の速度を加える（衝突の運動量保存則）。以後は減速せず、
 * 個々に回転しながら真空を漂う。 */
function makeFragment(x, y, mass, color, rng, baseVx, baseVy) {
  const ang = rng() * Math.PI * 2;
  const spd = 20 + rng() * 60;
  return {
    x, y,
    vx: (baseVx || 0) + Math.cos(ang) * spd,
    vy: (baseVy || 0) + Math.sin(ang) * spd,
    mass, color, alive: true,
    radius: Math.max(2.2, massToRadius(mass) * 0.6),
    life: 22,
    angle: rng() * Math.PI * 2,
    spin: (rng() - 0.5) * 3.2,
  };
}

function spawnFragments(list, x, y, totalMass, color, rng, count, baseVx, baseVy) {
  count = count || Math.min(14, Math.max(3, Math.round(Math.sqrt(totalMass))));
  const per = totalMass / count;
  for (let i = 0; i < count; i++) {
    list.push(makeFragment(
      x + (rng() - 0.5) * 10, y + (rng() - 0.5) * 10, per, color, rng, baseVx, baseVy
    ));
  }
}

/* ============================================================
 * ケプラー運動・簡易重力
 * ------------------------------------------------------------
 * 真空中なので摩擦による減衰は入れない。かわりに、
 *  1) プレイヤーの質量による近傍天体への重力（質量が大きいほどスイングバイ的に軌道が曲がる）
 *  2) 敵天体どうしの近傍限定の簡易引力（緩やかに引き合い、近づきすぎると衝突・破壊）
 * を毎フレーム計算する。天体数は上限が決まっているため O(n^2) でも 60fps を維持できる。
 * ============================================================ */
const GRAV_CONST = 46;           // プレイヤー重力の強さ（見た目重視の調整値。実際のGではない）
const GRAV_PLAYER_RANGE = 1400;  // この距離を超えたら重力計算を打ち切る（遠方カリング）
const GRAV_MIN_R = 40;           // 加速度が発散しないための最小距離
const GRAV_MAX_ACCEL = 900;      // 極端なスイングバイで暴れないための加速度上限
const ENEMY_GRAV_CONST = 5.2;    // 敵同士の簡易相互重力
const ENEMY_GRAV_RANGE = 260;    // 敵同士の重力を計算する近傍半径

function applyPlayerGravity(enemies, player, dt) {
  const gm = GRAV_CONST * player.mass;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (!e.alive) continue;
    const dx = player.x - e.x, dy = player.y - e.y;
    const r2 = dx * dx + dy * dy;
    if (r2 > GRAV_PLAYER_RANGE * GRAV_PLAYER_RANGE) continue;
    const r = Math.sqrt(r2) || 1;
    const rc = Math.max(GRAV_MIN_R, r);
    let a = gm / (rc * rc);
    if (a > GRAV_MAX_ACCEL) a = GRAV_MAX_ACCEL;
    e.vx += (dx / r) * a * dt;
    e.vy += (dy / r) * a * dt;
  }
}

/* 敵同士の近傍限定の簡易引力＋衝突判定。互いに引き合い、めり込むほど近づいたら
 * 大きい方が小さい方を飲み込む（破片を生成、運動量保存）。O(n^2) だが敵数上限が
 * 小さい（30〜40体程度）ため 60fps を維持できる。 */
function updateEnemyMutualGravityAndCollisions(enemies, fragments, palette, rng, dt, onDestroyed) {
  const n = enemies.length;
  for (let i = 0; i < n; i++) {
    const a = enemies[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < n; j++) {
      const b = enemies[j];
      if (!b.alive) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const r2 = dx * dx + dy * dy;
      if (r2 > ENEMY_GRAV_RANGE * ENEMY_GRAV_RANGE) continue;
      const r = Math.sqrt(r2) || 1;
      const sumR = a.radius + b.radius;
      if (r < sumR * 0.92) {
        // 衝突: 大きい方が生き残り、小さい方は破壊されて破片化（運動量保存）
        const big = a.mass >= b.mass ? a : b;
        const small = a.mass >= b.mass ? b : a;
        const totalVx = (a.vx * a.mass + b.vx * b.mass) / (a.mass + b.mass);
        const totalVy = (a.vy * a.mass + b.vy * b.mass) / (a.mass + b.mass);
        const gainedMass = small.mass * 0.4;
        big.mass += gainedMass;
        big.maxHp += gainedMass;
        big.hp = Math.min(big.maxHp, big.hp + gainedMass);
        big.radius = massToRadius(big.mass);
        big.vx = totalVx; big.vy = totalVy;
        small.alive = false;
        spawnFragments(fragments, small.x, small.y, small.mass * 0.6, small.palette.base, rng, undefined, small.vx, small.vy);
        if (onDestroyed) onDestroyed(small, big);
        continue;
      }
      // 引力（見た目重視。あまりに軽い相手同士は無視して計算量・視覚ノイズを抑える）
      const gm = ENEMY_GRAV_CONST * (a.mass + b.mass);
      const rc = Math.max(24, r);
      let acc = gm / (rc * rc);
      if (acc > 260) acc = 260;
      const nx = dx / r, ny = dy / r;
      a.vx += nx * acc * (b.mass / (a.mass + b.mass)) * dt;
      a.vy += ny * acc * (b.mass / (a.mass + b.mass)) * dt;
      b.vx -= nx * acc * (a.mass / (a.mass + b.mass)) * dt;
      b.vy -= ny * acc * (a.mass / (a.mass + b.mass)) * dt;
    }
  }
}
