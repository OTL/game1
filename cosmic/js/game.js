/* ============================================================
   COSMIC EATER - game.js
   メインループ・入力・戦闘・UI 制御
   ============================================================ */
'use strict';

(function () {
  const canvas = document.getElementById('game-canvas');
  const renderer = new Renderer(canvas);

  const rng = mulberry32((Date.now() ^ 0x9e3779b9) >>> 0);

  /* ---------- ゲーム状態 ---------- */
  const state = {
    running: false,
    paused: false,
    player: null,
    enemies: [],
    fragments: [],
    particles: new ParticlePool(500),
    floats: new FloatTextPool(80),
    camera: { x: 0, y: 0, zoom: 1 },
    lastTs: 0,
    saveTimer: 0,
    cleared: false,
    dead: false,
    pointerActive: false,
    pointerX: 0, pointerY: 0,
    lockonTarget: null,
    dmgAgg: new Map(),   // 同一対象への連続ヒットを合算して表示するための集計（enemy uid / 'player' / 'gain'）
    missCooldown: 0,
    // 実機フィードバック対応（第2回・サイズ分布の再設計）: 敵のスポーン基準質量は
    // プレイヤーの実際の質量に瞬時に追従させず、緩やかに遅れて追いつく別変数として保持する。
    // これにより「進化直後に敵が一斉に強くなる」体感を防ぐ。質量は指数的に増え続けるため、
    // 生の質量ではなく対数（log(mass)）をEMAで平滑化する（質量そのものを平滑化すると、
    // 終盤の急成長期に敵が置き去りになり、ratioが際限なく0へ近づいてしまうことを
    // 実機テストで確認したため）。log空間での平滑化は、質量の成長率が一定なら
    // 「プレイヤー質量に対する敵基準質量の比」が一定値に収束する扱いやすい性質を持つ。
    enemyScaleMass: BALANCE.startMass,
    enemyScaleLogMass: Math.log(BALANCE.startMass),
  };

  const CONTACT_DPS = 20;      // 基準戦闘ダメージ/秒（同質量同士）
  const INSTAKILL_RATIO = 1.45; // これ以上大きければ即吸収

  /* ---------- ユーティリティ ---------- */
  const $ = id => document.getElementById(id);
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function fmtTime(sec) {
    sec = Math.floor(sec);
    const m = Math.floor(sec / 60), s = sec % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }
  function fmtMass(m) {
    if (m >= 1e9) return (m / 1e9).toFixed(2) + 'B';
    if (m >= 1e6) return (m / 1e6).toFixed(2) + 'M';
    if (m >= 1e3) return (m / 1e3).toFixed(1) + 'K';
    return Math.floor(m).toString();
  }
  function upLevel(player, id) { return player.upgrades[id] || 0; }
  function upVal(id, lv) {
    if (lv <= 0) return 0;
    const def = UPGRADES.find(u => u.id === id);
    return def.vals[Math.min(lv, def.maxLv) - 1];
  }

  /* ---------- プレイヤー初期化／セーブ復元 ---------- */
  function newPlayer() {
    const p = makePlayer();
    p.checkpointMass = p.mass;
    p.checkpointStageIdx = 0;
    p.checkpointUpgrades = {};
    p.checkpointHp = p.hp;
    return p;
  }

  function applySaveData(p, data) {
    p.mass = data.mass;
    p.hp = data.hp;
    p.stageIdx = data.stageIdx || 0;
    p.upgrades = data.upgrades || {};
    p.playTime = data.playTime || 0;
    p.absorbedCount = data.absorbedCount || 0;
    p.totalMassGained = data.totalMassGained || data.mass;
    p.nextLevelMass = data.nextLevelMass || data.mass * levelUpGrowthFor(data.level || 1);
    p.level = data.level || 1;
    p.reviveUsed = !!data.reviveUsed;
    p.mode = gameModeOrDefault(data.mode);
    p.endless = !!data.endless;
    p.checkpointMass = data.checkpointMass || data.mass;
    p.checkpointStageIdx = data.checkpointStageIdx || p.stageIdx;
    p.checkpointUpgrades = data.checkpointUpgrades || Object.assign({}, p.upgrades);
    p.checkpointHp = data.checkpointHp || playerMaxHp(p);
    p.capturedSatellites = (data.capturedSatellites || []).map(s => Object.assign({
      angle: rng() * Math.PI * 2, x: p.x, y: p.y,
    }, s));
  }

  /* ---------- 敵生成 ---------- */
  function pickEnemyKind(player) {
    const r = rng();
    if (player.stageIdx >= 1 && r < 0.10) return 'hostile';
    if (r < 0.10 + 0.16) return 'comet';
    if (player.stageIdx >= 2 && r < 0.10 + 0.16 + 0.30) return 'planet';
    return 'asteroid';
  }

  /* 敵1体の質量倍率。実機フィードバック対応（第2回・サイズ分布の再設計）:
   * 「大半（7〜8割）は自分より小さい餌、2割前後は同格〜やや大きい、明確に大きい
   * 脅威は近傍に同時1〜2体まで」という目標分布に沿って抽選する。基準質量には
   * 実際のプレイヤー質量ではなく、緩やかに遅れて追従する `scaleMass`
   * （state.enemyScaleMass）を使うことで、進化直後に敵が一斉に強くなる体感を防ぐ。
   * 画面占有率の上限（screenRadiusCapFor）は表示半径（enemyVisualRadius）側で
   * 別途クランプする（trySpawnEnemies・updateEnemyMutualGravityAndCollisions参照）。 */
  function rollEnemyMass(scaleMass, forceNonThreat) {
    const r = rng();
    let mult;
    if (forceNonThreat || r < BALANCE.preyChance) {
      mult = BALANCE.preyMassMultRange[0] + rng() * (BALANCE.preyMassMultRange[1] - BALANCE.preyMassMultRange[0]);
    } else if (r < BALANCE.preyChance + BALANCE.evenChance) {
      mult = BALANCE.evenMassMultRange[0] + rng() * (BALANCE.evenMassMultRange[1] - BALANCE.evenMassMultRange[0]);
    } else {
      mult = BALANCE.threatMassMultRange[0] + rng() * (BALANCE.threatMassMultRange[1] - BALANCE.threatMassMultRange[0]);
    }
    const mass = Math.max(0.3, scaleMass * mult);
    return Math.min(mass, scaleMass * BALANCE.enemyMassCapMult);
  }

  /* 近傍の敵1体が画面短辺に対して占めてよい直径の割合（BALANCE.maxEnemyScreenFrac）
   * から求めたワールド半径の上限。カメラのズームが変わっても、常に「画面を覆う
   * 巨大な敵」の表示半径そのものをこの値でクランプする（enemyVisualRadiusと組み合わせて
   * 使う。質量そのものは戦闘バランス用に別途 enemyMassCapMult でクランプする）。 */
  function screenRadiusCapFor() {
    const shortSide = Math.min(renderer.w, renderer.h);
    return (shortSide * BALANCE.maxEnemyScreenFrac * 0.5) / Math.max(0.05, state.camera.zoom);
  }

  function spawnRadiusFor(player) {
    const base = Math.max(renderer.w, renderer.h) / state.camera.zoom;
    return base * 0.75;
  }

  /* プレイヤー近傍（画面内に見えやすい範囲）に居る敵の数。密度上限の判定に使う。 */
  function nearEnemyCount(player, radius) {
    let n = 0;
    for (const e of state.enemies) if (e.alive && dist(e, player) < radius) n++;
    return n;
  }

  /* プレイヤー近傍に居る「脅威」（質量がプレイヤーのBALANCE.threatRatioThreshold倍以上）の数。
   * 目標分布「脅威は同時に1〜2体まで」を維持するための判定に使う。 */
  function nearThreatCount(player, radius) {
    let n = 0;
    const th = player.mass * BALANCE.threatRatioThreshold;
    for (const e of state.enemies) if (e.alive && e.mass >= th && dist(e, player) < radius) n++;
    return n;
  }

  function trySpawnEnemies(player) {
    const maxEnemies = BALANCE.maxEnemies;
    if (state.enemies.length >= maxEnemies) return;
    const spawnR = spawnRadiusFor(player);
    // 画面内密度の上限: 近傍に既に十分な数がいる場合はスポーンを控える
    // （分裂・合体の連鎖と合わせて「画面が敵で埋まる」ことを防ぐ）。
    if (nearEnemyCount(player, spawnR * 0.65) >= BALANCE.nearViewSoftCap) return;
    const radiusCap = screenRadiusCapFor();
    const tries = 2;
    for (let i = 0; i < tries && state.enemies.length < maxEnemies; i++) {
      const kind = pickEnemyKind(player);
      // 近傍にすでに「脅威」枠が上限数いる場合は、今回のスポーンは強制的に
      // 非脅威（餌寄り）にロールし直す（目標分布: 脅威は同時1〜2体まで）。
      const threatsNear = nearThreatCount(player, spawnR * 0.85);
      // エンドレスモード（ブラックホール到達後）はBALANCE.endlessThreatChanceで指定した
      // 確率でのみ「脅威」個体を許可する（既定0=常に非脅威）。「脅威なし or わずか」で
      // 何でも吸い込めるブラックホールとして遊べるようにする。
      const forceNonThreat = threatsNear >= BALANCE.maxThreatsNear ||
        (player.endless && rng() >= BALANCE.endlessThreatChance);
      const mass = rollEnemyMass(state.enemyScaleMass, forceNonThreat);
      // 質量比が大きい「脅威」個体ほど、外周寄りの遠い位置にのみスポーンさせる。
      // ＝ プレイヤーより大幅に大きい敵は近接遭遇せず「遠くの存在」として現れる。
      const threatRatio = mass / player.mass;
      const farBias = threatRatio > 1.4 ? 0.68 : 0.5;
      const ang = rng() * Math.PI * 2;
      const r = spawnR * (farBias + rng() * (0.98 - farBias));
      const x = player.x + Math.cos(ang) * r;
      const y = player.y + Math.sin(ang) * r;
      const body = makeEnemyBody(kind, mass, x, y, rng, player);
      // 画面短辺の40%を超える表示半径にはしない（近接に巨大な敵を出さない安全弁）。
      if (body.radius > radiusCap) body.radius = radiusCap;
      if (kind === 'planet' && rng() < 0.35) body.hasRing = true;
      if (kind === 'comet') {
        // 彗星は速めに視界を横切らせる: プレイヤー付近を通過する直線的な高速軌道
        const aimAng = rng() * Math.PI * 2;
        const aimOffset = spawnR * (0.15 + rng() * 0.5);
        const aimX = player.x + Math.cos(aimAng) * aimOffset;
        const aimY = player.y + Math.sin(aimAng) * aimOffset;
        const ddx = aimX - x, ddy = aimY - y;
        const dd = Math.hypot(ddx, ddy) || 1;
        const cometSpeed = 240 + rng() * 140;
        body.vx = (ddx / dd) * cometSpeed;
        body.vy = (ddy / dd) * cometSpeed;
      }
      state.enemies.push(body);
    }
  }

  function despawnFarEnemies(player) {
    const limit = spawnRadiusFor(player) * 1.5;
    state.enemies = state.enemies.filter(e => e.alive && dist(e, player) < limit);
  }

  /* ---------- 戦闘処理 ---------- */
  const CRIT_MULTIPLIER = 2.2; // 「核融合暴走」発動時のダメージ倍率（説明文と一致させる）

  function offenseMultiplier(player, speedRatio) {
    let mult = 1;
    mult += upVal('rings', upLevel(player, 'rings')) / 100;
    const ramLv = upLevel(player, 'ramspeed');
    if (ramLv > 0) mult += (upVal('ramspeed', ramLv) / 100) * speedRatio;
    // 核融合暴走: 説明文どおり「%の確率でダメージが2.2倍」になる確率発動のクリティカル
    // （以前は確率ではなく常時わずかに加算される別物の効果になっていたため修正）。
    const critLv = upLevel(player, 'critical');
    let isCrit = false;
    if (critLv > 0 && rng() * 100 < upVal('critical', critLv)) {
      mult *= CRIT_MULTIPLIER;
      isCrit = true;
    }
    return { mult, isCrit };
  }

  function creditMass(player, amount, x, y) {
    amount = Math.max(0, amount) * (1 + upVal('efficiency', upLevel(player, 'efficiency')) / 100);
    amount *= massGainMultiplierFor(player.mode, player.stageIdx);
    player.mass += amount;
    player.totalMassGained += amount;
    return amount;
  }

  function showFloat(x, y, text, color) { state.floats.spawn(x, y, text, color); }

  /* ---------- ダメージ数値 / MISS 表示の集計（スパム対策） ----------
   * 実機フィードバック対応: 同じ相手への連続ヒットや、シールドの連続MISS判定が
   * 毎フレーム表示されると数値が画面を埋め尽くしてしまう。実際のダメージ計算は
   * 毎フレーム行いつつ、表示だけは対象ごとに集計してBALANCE.floatFlushInterval
   * 秒に1回、合算した数値をまとめて1つ出す。 */
  function queueFloat(key, x, y, amount, color) {
    let e = state.dmgAgg.get(key);
    if (!e) { e = { amount: 0, x, y, color, t: 0 }; state.dmgAgg.set(key, e); }
    e.amount += amount; e.x = x; e.y = y; e.color = color;
  }
  function flushFloatAggregates(dt) {
    for (const [key, e] of state.dmgAgg) {
      e.t += dt;
      if (e.t >= BALANCE.floatFlushInterval) {
        if (e.amount > 0.15) {
          const prefix = key === 'player-dmg' ? '-' : '+';
          showFloat(e.x, e.y, prefix + fmtMass(Math.abs(e.amount)), e.color);
        }
        state.dmgAgg.delete(key);
      }
    }
  }

  function killEnemy(enemy, player, viaContact) {
    enemy.alive = false;
    const directRatio = 0.55;
    const direct = enemy.mass * directRatio;
    const gained = creditMass(player, direct, enemy.x, enemy.y);
    // 実機フィードバック対応（第3回・数値表示バグ）: 以前はキル・破片吸収・溶岩・衛星
    // 吸収などあらゆる質量獲得を同じ 'player-gain' キーに集計していたため、画面のどこかで
    // 起きた無関係な複数の獲得（例: 遠くの敵を1体倒した直後に近くの破片を何十個も
    // 吸収する等）が0.35秒の間に一つの数値へ合算され、「+32.59M」のような自機の質量を
    // 大きく超える実態と乖離した数値が表示される原因になっていた。以後は獲得の種類ごとに
    // 別のキーで集計する（同種の連続ヒットはこれまでどおりまとめて表示しつつ、種類の違う
    // 獲得同士は混ざらない）。
    queueFloat('gain-kill', enemy.x, enemy.y - enemy.radius - 4, gained, '#8fe3ff');
    spawnFragments(state.fragments, enemy.x, enemy.y, enemy.mass * (1 - directRatio), enemy.palette, rng, undefined, enemy.vx, enemy.vy);
    player.absorbedCount++;
    renderer.addShake(clamp(enemy.mass / player.mass * 6, 1, 8));
    for (let i = 0; i < 10; i++) {
      const a = rng() * Math.PI * 2, spd = 40 + rng() * 120;
      state.particles.spawn({
        x: enemy.x, y: enemy.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
        size: 2 + rng() * 3, color: enemy.palette.light || '#fff', life: 0.5 + rng() * 0.4,
      });
    }
    checkLevelUp(player);
  }

  function damageEnemy(enemy, amount, player) {
    // 溶岩惑星: 与えたダメージ（実際に削れたHP分。オーバーキル分は含めない）の
    // 一定割合を自分の質量に変換する。以前は即吸収時のみの特殊処理だったが、
    // 説明文「与えたダメージの%を自分の質量に変換する」に合わせ、あらゆる
    // ダメージ源（接触・波動・衛星など）に一律で効くようにした。
    const lavaLv = upLevel(player, 'lava');
    if (lavaLv > 0) {
      const realDealt = Math.min(amount, Math.max(0, enemy.hp));
      if (realDealt > 0) {
        const bonus = creditMass(player, realDealt * (upVal('lava', lavaLv) / 100), enemy.x, enemy.y);
        if (bonus > 0.15) queueFloat('gain-lava', enemy.x, enemy.y + 12, bonus, '#ff9a5c');
      }
    }
    enemy.hp -= amount;
    enemy.hitFlash = 0.25;
    queueFloat('enemy-' + enemy.uid, enemy.x, enemy.y - enemy.radius - 14, amount, '#ffd9a0');
    if (enemy.hp <= 0 && enemy.alive) killEnemy(enemy, player);
  }

  function applyPlayerDamage(player, amount) {
    if (player.invuln > 0) return;
    const shieldLv = upLevel(player, 'shield');
    if (shieldLv > 0 && rng() * 100 < upVal('shield', shieldLv)) {
      if (state.missCooldown <= 0) {
        showFloat(player.x, player.y - playerRadius(player) - 6, 'MISS', '#8fe3ff');
        state.missCooldown = BALANCE.missFlushInterval;
      }
      return;
    }
    const crustLv = upLevel(player, 'crust');
    const reduce = upVal('crust', crustLv) / 100;
    const dmg = amount * (1 - reduce);
    player.hp -= dmg;
    player.hitFlash = 0.3;
    if (dmg > 0.4) queueFloat('player-dmg', player.x, player.y - playerRadius(player) - 6, dmg, '#ff6b7a');
    if (player.hp <= 0) handlePlayerDeath(player);
  }

  function resolveCollision(player, enemy, dt, speedRatio) {
    if (!enemy.alive) return;
    const pr = playerRadius(player), er = enemy.radius;
    const d = dist(player, enemy);
    if (d > pr + er) return;
    const ramBoost = 1 + (upVal('ramspeed', upLevel(player, 'ramspeed')) / 100) * speedRatio * 0.5;
    const effMass = player.mass * ramBoost;
    const ratio = effMass / enemy.mass;

    if (ratio >= INSTAKILL_RATIO) {
      damageEnemy(enemy, enemy.hp * 99, player);
    } else if (ratio <= 1 / INSTAKILL_RATIO) {
      // 押し返し
      const nx = (player.x - enemy.x) / (d || 1), ny = (player.y - enemy.y) / (d || 1);
      player.vx += nx * 40 * dt * 30;
      player.vy += ny * 40 * dt * 30;
      const dmg = CONTACT_DPS * (enemy.mass / effMass) * 0.55 * dt;
      applyPlayerDamage(player, dmg);
    } else {
      // 拮抗した戦闘
      const off = offenseMultiplier(player, speedRatio);
      const dmgToEnemy = CONTACT_DPS * ratio * off.mult * dt;
      const dmgToPlayer = CONTACT_DPS / ratio * dt;
      damageEnemy(enemy, dmgToEnemy, player);
      if (off.isCrit) showFloat(enemy.x, enemy.y - enemy.radius - 26, '会心!', '#ffe066');
      applyPlayerDamage(player, dmgToPlayer);
      const nx = (player.x - enemy.x) / (d || 1), ny = (player.y - enemy.y) / (d || 1);
      enemy.x -= nx * 30 * dt; enemy.y -= ny * 30 * dt;
    }
  }

  function handlePlayerDeath(player) {
    if (!player.reviveUsed && upLevel(player, 'revive') > 0) {
      player.reviveUsed = true;
      player.hp = playerMaxHp(player) * 0.5;
      player.invuln = 2.5;
      showToast('不死の芯が発動！ 半分のHPで復活した。');
      renderer.addShake(10);
      return;
    }
    // 直前の進化段階の頭に戻す
    player.mass = player.checkpointMass;
    player.stageIdx = player.checkpointStageIdx;
    player.upgrades = Object.assign({}, player.checkpointUpgrades);
    player.hp = player.checkpointHp;
    player.nextLevelMass = Math.max(player.mass * levelUpGrowthFor(player.level), player.mass + 1);
    player.invuln = 2.5;
    player.x = 0; player.y = 0; player.vx = 0; player.vy = 0;
    state.enemies = [];
    state.fragments.length = 0;
    // 死亡直後は敵のスポーン基準質量も即座に新しい（低い）質量へ合わせる。
    // これをしないと、追従が遅れたままの高い基準値で敵がスポーンし続けてしまう。
    state.enemyScaleMass = player.mass;
    state.enemyScaleLogMass = Math.log(Math.max(1e-6, player.mass));
    showToast('力尽きた… 「' + currentStage(player).name + '」の始まりからやり直す。');
    saveGame(player);
  }

  /* ---------- レベルアップ / 進化 ---------- */
  function checkLevelUp(player) {
    const prevStage = player.stageIdx;
    player.stageIdx = stageIndexForMass(player.mass);
    if (player.stageIdx > prevStage) onEvolve(player, prevStage);
    if (player.mass >= player.nextLevelMass && !state.paused) openLevelUp(player);
  }

  function onEvolve(player, prevStageIdx) {
    player.checkpointMass = STAGES[player.stageIdx].mass;
    player.checkpointStageIdx = player.stageIdx;
    player.checkpointUpgrades = Object.assign({}, player.upgrades);
    player.hp = playerMaxHp(player);
    player.checkpointHp = player.hp;
    renderer.addShake(14);
    showToast('進化した！ 「' + STAGES[player.stageIdx].name + '」になった');
    if (STAGES[player.stageIdx].isFinal) triggerClear(player);
    saveGame(player);
  }

  function weightedPickUpgrades(player, count) {
    const rarityWeight = { common: 10, rare: 4, epic: 1.6 };
    const pool = UPGRADES.filter(u => {
      if (u.minStage && player.stageIdx < u.minStage) return false;
      const lv = upLevel(player, u.id);
      return lv < u.maxLv;
    });
    const picks = [];
    const work = pool.slice();
    for (let i = 0; i < count && work.length; i++) {
      let total = 0;
      const weights = work.map(u => { const w = rarityWeight[u.rarity] || 1; total += w; return w; });
      let r = rng() * total, idx = 0;
      for (; idx < weights.length; idx++) { r -= weights[idx]; if (r <= 0) break; }
      idx = Math.min(idx, work.length - 1);
      picks.push(work[idx]);
      work.splice(idx, 1);
    }
    return picks;
  }

  function openLevelUp(player) {
    state.paused = true;
    const picks = weightedPickUpgrades(player, 3);
    const cardsEl = $('cards');
    cardsEl.innerHTML = '';
    if (picks.length === 0) {
      // 取得できる物が無ければそのままレベルだけ進める
      player.level++;
      player.nextLevelMass = player.mass * levelUpGrowthFor(player.level);
      state.paused = false;
      return;
    }
    for (const u of picks) {
      const lv = upLevel(player, u.id);
      const nextLv = lv + 1;
      const div = document.createElement('div');
      div.className = 'card ' + u.rarity;
      div.innerHTML = `
        <div class="card-icon">${u.icon}</div>
        <div class="card-body">
          <div class="card-title">${u.name} <span class="card-rarity ${u.rarity}">${u.rarity.toUpperCase()}</span>${lv > 0 ? ` <span class="card-rarity">Lv${nextLv}</span>` : ''}</div>
          <div class="card-desc">${u.desc(u.vals[Math.min(nextLv, u.maxLv) - 1])}</div>
          <button class="card-pick">選択</button>
        </div>`;
      div.querySelector('.card-pick').addEventListener('click', () => {
        player.upgrades[u.id] = nextLv;
        if (u.id === 'moon' || u.id === 'binary') rebuildSatellites(player);
        player.level++;
        player.nextLevelMass = player.mass * levelUpGrowthFor(player.level);
        $('levelup-modal').classList.add('hidden');
        state.paused = false;
        refreshUpgradeIcons(player);
      });
      cardsEl.appendChild(div);
    }
    $('levelup-modal').classList.remove('hidden');
  }

  function rebuildSatellites(player) {
    player.satellites = [];
    const moonLv = upLevel(player, 'moon');
    for (let i = 0; i < moonLv; i++) {
      player.satellites.push({ angle: (Math.PI * 2 / Math.max(1, moonLv)) * i, dist: 1.8 + i * 0.5, speed: 1.4, kind: 'moon' });
    }
    const binLv = upLevel(player, 'binary');
    for (let i = 0; i < binLv; i++) {
      player.satellites.push({ angle: Math.PI * i, dist: 3.2 + i * 0.8, speed: 0.7, kind: 'binary' });
    }
  }

  function refreshUpgradeIcons(player) {
    const el = $('upgrade-list');
    el.innerHTML = '';
    for (const id of Object.keys(player.upgrades)) {
      const lv = player.upgrades[id];
      if (!lv) continue;
      const def = UPGRADES.find(u => u.id === id);
      if (!def) continue;
      const d = document.createElement('div');
      d.className = 'upg-icon';
      d.title = def.name;
      d.innerHTML = `${def.icon}<span class="lv">${lv}</span>`;
      el.appendChild(d);
    }
  }

  /* ---------- クリア / エンドレスモード ----------
   * 実機フィードバック対応（第3回）: 「ブラックホールになった後も遊びたい」への対応。
   * クリア（ブラックホール到達）後のリザルト画面に「そのまま遊ぶ」ボタンを追加し、
   * 選ぶとブラックホールのままプレイを継続できるエンドレスモードへ移行する。
   * 以前はクリアと同時に clearSave() でセーブを破棄していたが、エンドレス継続と
   * リロード後の復元を両立するため、クリア後もセーブは維持したままにする
   * （「もう一度あそぶ」で新しい周回を始める場合は startGame(true, ...) 側で
   * 明示的に clearSave() される）。 */
  function populateResultStats(player) {
    $('res-time').textContent = fmtTime(player.playTime);
    $('res-count').textContent = player.absorbedCount;
    $('res-mass').textContent = fmtMass(player.mass);
    $('res-level').textContent = player.level;
    if (player.endless) {
      $('result-sub').textContent = 'すべてを飲み込む存在として、宇宙を漂い続けている。';
      $('res-time-label').textContent = '総プレイ時間';
      $('res-count-label').textContent = '総吸収数';
      $('res-mass-label').textContent = '現在の質量';
      $('btn-result-endless').textContent = 'プレイに戻る';
    } else {
      $('result-sub').textContent = 'すべてを飲み込む存在になった。';
      $('res-time-label').textContent = '総プレイ時間';
      $('res-count-label').textContent = '吸収した天体';
      $('res-mass-label').textContent = '最終質量';
      $('btn-result-endless').textContent = 'そのまま遊ぶ（エンドレス）';
    }
  }

  function triggerClear(player) {
    state.cleared = true;
    state.paused = true;
    populateResultStats(player);
    $('result-screen').classList.remove('hidden');
    saveGame(player);
  }

  /* 「そのまま遊ぶ」: ブラックホールとしてエンドレスモードへ移行し、プレイを再開する。
   * 既にエンドレス中に（一時停止メニューから）リザルトを開き直しただけの場合も、
   * このボタンは単にプレイへ戻るボタンとして機能する（冪等）。 */
  function continueEndless(player) {
    player.endless = true;
    state.cleared = false;
    state.paused = false;
    $('result-screen').classList.add('hidden');
    saveGame(player);
  }

  /* ---------- 入力 ---------- */
  function bindInput() {
    function down(x, y) { state.pointerActive = true; state.pointerX = x; state.pointerY = y; }
    function move(x, y) { if (state.pointerActive) { state.pointerX = x; state.pointerY = y; } }
    function up() { state.pointerActive = false; }

    canvas.addEventListener('pointerdown', e => { down(e.clientX, e.clientY); canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => move(e.clientX, e.clientY));
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    window.addEventListener('blur', up);

    // 捕獲: PCはQキー、スマホは画面上の捕獲ボタン
    window.addEventListener('keydown', e => {
      if (e.key === 'q' || e.key === 'Q') { if (state.player) tryCapture(state.player); }
    });
    $('btn-capture').addEventListener('pointerdown', e => {
      e.stopPropagation();
      if (state.player) tryCapture(state.player);
    });
  }

  /* ---------- 更新処理 ---------- */
  function updatePlayerMovement(player, dt) {
    if (state.pointerActive) {
      const dx = state.pointerX - renderer.w / 2, dy = state.pointerY - renderer.h / 2;
      const d = Math.hypot(dx, dy);
      if (d > 6) {
        const thrustBonus = upVal('thrust', upLevel(player, 'thrust')) / 100;
        const accel = BALANCE.moveAccel * (1 + thrustBonus);
        const nx = dx / d, ny = dy / d;
        const pull = clamp(d / 160, 0.25, 1);
        player.vx += nx * accel * pull * dt;
        player.vy += ny * accel * pull * dt;
      }
    }
    const thrustBonus = upVal('thrust', upLevel(player, 'thrust')) / 100;
    const maxSpeed = BALANCE.moveMaxSpeed * (1 + thrustBonus);
    const spd = Math.hypot(player.vx, player.vy);
    if (spd > maxSpeed) { player.vx *= maxSpeed / spd; player.vy *= maxSpeed / spd; }
    player.vx *= BALANCE.friction; player.vy *= BALANCE.friction;
    player.x += player.vx * dt; player.y += player.vy * dt;
    if (spd > 8) player.angle = Math.atan2(player.vy, player.vx);
    return clamp(spd / maxSpeed, 0, 1);
  }

  function gravityRangeFor(player) {
    let bonus = upVal('gravity', upLevel(player, 'gravity')) / 100;
    bonus += upVal('gwave', upLevel(player, 'gwave')) / 100;
    return BALANCE.fragmentAbsorbRange * (1 + bonus) * (1 + player.stageIdx * 0.12);
  }
  function gravitySpeedFor(player) {
    const bonus = upVal('magnetic', upLevel(player, 'magnetic')) / 100;
    return BALANCE.fragmentAbsorbSpeed * (1 + bonus);
  }

  function updateFragments(player, dt) {
    const range = gravityRangeFor(player);
    const spd = gravitySpeedFor(player);
    const pr = playerRadius(player);
    for (let i = state.fragments.length - 1; i >= 0; i--) {
      const f = state.fragments[i];
      f.life -= dt;
      f.age = (f.age || 0) + dt;
      const d = dist(f, player);
      if (d < range) {
        const nx = (player.x - f.x) / (d || 1), ny = (player.y - f.y) / (d || 1);
        const pull = spd * (1 - d / range + 0.2);
        f.vx += nx * pull * dt * 6; f.vy += ny * pull * dt * 6;
      }
      f.x += f.vx * dt; f.y += f.vy * dt;
      f.angle = (f.angle || 0) + (f.spin || 0) * dt;
      if (d < pr * 0.9 || f.life <= 0) {
        if (d < pr * 1.4) {
          const gained = creditMass(player, f.mass, f.x, f.y);
          if (gained > 0.15) queueFloat('gain-fragment', player.x, player.y - pr - 4, gained, '#bfe3ff');
        }
        state.fragments.splice(i, 1);
      }
    }
  }

  function updateEnemyAI(player, dt) {
    for (const e of state.enemies) {
      if (!e.alive) continue;
      // タンブリング: 不規則形状の天体は非等速の回転（角速度に周期的なゆらぎ）
      if (e.spinWobbleAmp) {
        e.spinWobblePhase += e.spinWobbleFreq * dt;
        e.angle += (e.spin + e.spinWobbleAmp * Math.sin(e.spinWobblePhase)) * dt;
      } else {
        e.angle += e.spin * dt;
      }
      e.tailPhase += dt;
      if (e.isHostile) {
        e.aiTimer -= dt;
        const d = dist(e, player);
        const aggroR = 620; // 敵の索敵範囲は固定（プレイヤー側の「重力感知」はロックオン・警戒表示にのみ作用する）
        if (d < aggroR && e.mass < player.mass * INSTAKILL_RATIO * 1.3) {
          // 弱いなら逃げる、強ければ追う
          const flee = e.mass < player.mass ? -1 : 1;
          const nx = (player.x - e.x) / (d || 1), ny = (player.y - e.y) / (d || 1);
          e.vx += nx * flee * 70 * dt;
          e.vy += ny * flee * 70 * dt;
        }
      }
      // 真空中なので速度は減衰させない（ケプラー運動のまま漂流・公転させる）。
      e.x += e.vx * dt; e.y += e.vy * dt;
      if (e.hitFlash > 0) e.hitFlash -= dt * 2.2;
    }
  }

  function updatePassives(player, dt) {
    const fx = player.fx;
    // 希少鉱脈
    const veinsLv = upLevel(player, 'veins');
    if (veinsLv > 0) {
      fx.veinsTimer -= dt;
      if (fx.veinsTimer <= 0) {
        fx.veinsTimer = upVal('veins', veinsLv);
        const gained = creditMass(player, player.mass * 0.006 + 1, player.x, player.y);
        showFloat(player.x, player.y - playerRadius(player) - 20, '鉱脈 +' + fmtMass(gained), '#c9a2ff');
      }
    }
    // 地殻再生
    const regenLv = upLevel(player, 'regen');
    if (regenLv > 0) {
      player.hp = Math.min(playerMaxHp(player), player.hp + playerMaxHp(player) * (upVal('regen', regenLv) / 100) * dt);
    }
    // オーロラ帯
    const auroraLv = upLevel(player, 'aurora');
    if (auroraLv > 0) {
      fx.auroraTimer -= dt;
      if (fx.auroraTimer <= 0) {
        fx.auroraTimer = 4;
        pulseDamage(player, playerRadius(player) * 5, upVal('aurora', auroraLv), '#8fe3c9');
      }
    }
    // 磁気嵐
    const stormLv = upLevel(player, 'stormfield');
    if (stormLv > 0) {
      fx.stormTimer -= dt;
      if (fx.stormTimer <= 0) {
        fx.stormTimer = 6;
        pulseDamage(player, playerRadius(player) * 6, upVal('stormfield', stormLv), '#ffd18f', true);
      }
    }
    // 太陽フレア: 説明文どおり「進行方向へ扇状」に放つ（全方位のpulseDamageではなく、
    // cmeより広い扇形のconeDamageを使う）。
    const flareLv = upLevel(player, 'flare');
    if (flareLv > 0) {
      fx.flareTimer -= dt;
      if (fx.flareTimer <= 0) {
        fx.flareTimer = 5;
        coneDamage(player, playerRadius(player) * 8, upVal('flare', flareLv), 1.05);
        const dir = Math.hypot(player.vx, player.vy) > 5 ? Math.atan2(player.vy, player.vx) : player.angle;
        for (let i = -3; i <= 3; i++) {
          const a = dir + i * 0.15;
          state.particles.spawn({ x: player.x, y: player.y, vx: Math.cos(a) * 200, vy: Math.sin(a) * 200, size: 4, color: '#ffb15c', life: 0.4 });
        }
      }
    }
    // コロナ質量放出
    const cmeLv = upLevel(player, 'cme');
    if (cmeLv > 0) {
      fx.cmeTimer -= dt;
      if (fx.cmeTimer <= 0) {
        fx.cmeTimer = 3.2;
        coneDamage(player, playerRadius(player) * 9, upVal('cme', cmeLv));
      }
    }
    // 彗星の尾
    const tailLv = upLevel(player, 'tail');
    if (tailLv > 0 && Math.hypot(player.vx, player.vy) > 40) {
      pulseDamage(player, playerRadius(player) * 1.5, upVal('tail', tailLv) * dt, '#c9e8ff', false, true);
    }
    player.invuln = Math.max(0, player.invuln - dt);
    if (player.hitFlash > 0) player.hitFlash -= dt * 2.2;
    // 自転（球体テクスチャの流れ用の位相）。序盤2段階は不規則形状のため、
    // 非等速のタンブリングになるようゆらぎを加える。
    const stageKey = currentStage(player).key;
    if (stageKey === 'rock' || stageKey === 'asteroid') {
      player.spinWobblePhase = (player.spinWobblePhase || 0) + 0.9 * dt;
      player.spinPhase = (player.spinPhase || 0) + (0.22 + 0.16 * Math.sin(player.spinWobblePhase)) * dt;
    } else {
      player.spinPhase = (player.spinPhase || 0) + 0.16 * dt;
    }
  }

  function pulseDamage(player, radius, dmg, color, knockback, silent) {
    for (const e of state.enemies) {
      if (!e.alive) continue;
      const d = dist(player, e);
      if (d < radius) {
        damageEnemy(e, dmg, player);
        if (knockback && e.mass < player.mass * 0.5) {
          const nx = (e.x - player.x) / (d || 1), ny = (e.y - player.y) / (d || 1);
          e.vx += nx * 90; e.vy += ny * 90;
        }
      }
    }
    if (!silent) {
      state.particles.spawn({ x: player.x, y: player.y, size: radius * 0.02, color, life: 0.5, vx: 0, vy: 0, kind: 'ring' });
      for (let i = 0; i < 8; i++) {
        const a = rng() * Math.PI * 2;
        state.particles.spawn({ x: player.x + Math.cos(a) * radius * 0.3, y: player.y + Math.sin(a) * radius * 0.3, vx: Math.cos(a) * 40, vy: Math.sin(a) * 40, color, size: 3, life: 0.4 });
      }
    }
  }

  /* ---------- 衛星（アップグレード「衛星」「伴星」＋捕獲した天体） ----------
   * 実機フィードバック対応: 惑星以上で解放される「捕獲」で得た衛星は、自分の
   * 周りを公転しながら (1) 敵に接触ダメージを与え、(2) 近くの破片（小天体）を
   * 自動で引き寄せて質量を手伝って回収する。強い敵に接触され続けると破壊されうる。
   * 既存の「衛星」アップグレードは汎用の小型衛星として player.satellites に残し、
   * 捕獲した天体は player.capturedSatellites で別管理しつつ同じ公転・接触damageの
   * 仕組みを共有する（HUDでは合算して表示）。 */
  function updateSatellites(player, dt) {
    const pr = playerRadius(player);
    // 汎用衛星（アップグレード由来）
    for (const s of player.satellites) {
      s.angle += s.speed * dt;
      s.x = player.x + Math.cos(s.angle) * pr * s.dist;
      s.y = player.y + Math.sin(s.angle) * pr * s.dist;
      const dmg = s.kind === 'binary' ? upVal('binary', upLevel(player, 'binary')) : upVal('moon', upLevel(player, 'moon')) * 4;
      const pullRange = s.kind === 'binary' ? pr * 4.5 : 0;
      for (const e of state.enemies) {
        if (!e.alive) continue;
        const d = dist(s, e);
        if (d < e.radius + 8) damageEnemy(e, dmg * dt * 3, player);
        // 伴星: 説明文どおり周囲の敵を弱く引き寄せる引力を持つ（弱い敵のみ、強い敵には効かない）
        if (pullRange > 0 && d < pullRange && d > 1 && e.mass < player.mass * 0.8) {
          const nx = (s.x - e.x) / d, ny = (s.y - e.y) / d;
          const pull = 70 * (1 - d / pullRange);
          e.vx += nx * pull * dt; e.vy += ny * pull * dt;
        }
      }
    }
    // 捕獲した天体
    for (let i = player.capturedSatellites.length - 1; i >= 0; i--) {
      const s = player.capturedSatellites[i];
      s.angle += s.speed * dt;
      s.x = player.x + Math.cos(s.angle) * pr * s.dist;
      s.y = player.y + Math.sin(s.angle) * pr * s.dist;
      s.spinPhase = (s.spinPhase || 0) + 0.5 * dt;
      if (s.hitFlash > 0) s.hitFlash -= dt * 2.2;

      const contactDmg = s.mass * 0.09;
      for (const e of state.enemies) {
        if (!e.alive) continue;
        const d = dist(s, e);
        if (d < e.radius + s.radius) {
          damageEnemy(e, contactDmg * dt, player);
          // 十分に強い敵が触れ続けると衛星も破壊されうる
          if (e.mass > s.mass * 1.3) {
            s.hp -= CONTACT_DPS * (e.mass / s.mass) * 0.35 * dt;
            s.hitFlash = 0.25;
          }
        }
      }
      // 近くの破片（小天体）を自動吸収する手伝い
      const helpRange = s.radius + 70;
      for (let fi = state.fragments.length - 1; fi >= 0; fi--) {
        const f = state.fragments[fi];
        const fd = dist(f, s);
        if (fd > helpRange) continue;
        const nx = (s.x - f.x) / (fd || 1), ny = (s.y - f.y) / (fd || 1);
        f.vx += nx * 140 * dt; f.vy += ny * 140 * dt;
        if (fd < s.radius * 1.1) {
          const gained = creditMass(player, f.mass, s.x, s.y);
          if (gained > 0.15) queueFloat('gain-satellite', s.x, s.y, gained, '#8fe3c9');
          state.fragments.splice(fi, 1);
        }
      }

      if (s.hp <= 0) {
        spawnFragments(state.fragments, s.x, s.y, s.mass * 0.5, s.palette, rng, undefined, 0, 0);
        player.capturedSatellites.splice(i, 1);
        renderer.addShake(5);
        showToast(s.name + ' の衛星が破壊された…');
      }
    }
  }

  /* ---------- 彗星の尾アップグレードの視覚的な軌跡 ----------
   * 実機フィードバック対応: 「彗星の尾」アップグレード（tail）は移動軌跡に接触ダメージ
   * 判定（pulseDamage、半径 playerRadius*1.5）を持つが、これまで対応する見た目が
   * 存在しなかった。実際に見える発光プラズマの帯を自機の後ろに描画し、判定範囲と
   * 見た目のサイズを一致させる。 */
  function updateTailTrail(player, dt) {
    const tailLv = upLevel(player, 'tail');
    if (tailLv <= 0) { player.tailTrail.length = 0; return; }
    const moving = Math.hypot(player.vx, player.vy) > 40;
    if (moving) {
      player.tailTrail.push({ x: player.x, y: player.y, age: 0 });
    }
    const maxAge = 0.7;
    for (let i = player.tailTrail.length - 1; i >= 0; i--) {
      const t = player.tailTrail[i];
      t.age += dt;
      if (t.age > maxAge) player.tailTrail.splice(i, 1);
    }
    if (player.tailTrail.length > 60) player.tailTrail.splice(0, player.tailTrail.length - 60);
  }

  function coneDamage(player, range, dmg, halfAngle) {
    halfAngle = halfAngle || 0.6;
    const dir = Math.hypot(player.vx, player.vy) > 5 ? Math.atan2(player.vy, player.vx) : player.angle;
    for (const e of state.enemies) {
      if (!e.alive) continue;
      const d = dist(player, e);
      if (d > range) continue;
      const ang = Math.atan2(e.y - player.y, e.x - player.x);
      let diff = Math.abs(ang - dir);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      if (diff < halfAngle) damageEnemy(e, dmg, player);
    }
  }

  /* ---------- ロックオンHUD ---------- */
  function captureRangeFor(player) {
    return Math.max(BALANCE.captureRangeMin, playerRadius(player) * BALANCE.captureRangeMult);
  }
  function canCapture(player, target) {
    if (!target || !target.alive || target.isHostile) return false;
    if (!captureUnlockedFor(player.stageIdx)) return false;
    if (player.capturedSatellites.length >= captureCapacityFor(player.stageIdx)) return false;
    if (target.mass > player.mass * BALANCE.captureMassRatio) return false;
    return dist(player, target) <= captureRangeFor(player);
  }

  /* 重力感知アップグレードの範囲（ロックオンパネルの有効距離、および画面外の
   * 強大な敵を警戒表示する距離）。sense のレベルに応じて拡大する。 */
  function senseRangeFor(player) {
    const bonus = upVal('sense', upLevel(player, 'sense')) / 100;
    return 900 * (1 + bonus);
  }

  function updateLockonUI(player) {
    let nearest = null, nd = Infinity;
    const senseR = senseRangeFor(player);
    let nearestThreat = null, ntd = Infinity;
    const threatMassTh = player.mass * BALANCE.threatRatioThreshold;
    for (const e of state.enemies) {
      if (!e.alive) continue;
      const d = dist(player, e);
      if (d < nd) { nd = d; nearest = e; }
      // 重力感知: 画面外にいる強大な敵（脅威）を警戒表示するための最近接個体を探す
      if (e.mass >= threatMassTh && d < ntd && d <= senseR) { ntd = d; nearestThreat = e; }
    }
    state.lockonTarget = nearest;
    // 画面内にすでに見えている脅威は警戒表示の対象外（見えているので警戒の意味がない）
    if (nearestThreat) {
      const sp = renderer.worldToScreen(state.camera, nearestThreat.x, nearestThreat.y);
      const margin = 80;
      const onScreen = sp.x > -margin && sp.x < renderer.w + margin && sp.y > -margin && sp.y < renderer.h + margin;
      state.distantThreat = onScreen ? null : nearestThreat;
    } else {
      state.distantThreat = null;
    }
    const panel = $('lockon');
    const captureEl = $('btn-capture');
    if (!nearest || nd > senseR) {
      panel.classList.add('hidden');
      captureEl.classList.add('hidden');
      return;
    }
    panel.classList.remove('hidden');
    $('lockon-name').textContent = nearest.name;
    $('lockon-fill').style.width = clamp(nearest.hp / nearest.maxHp * 100, 0, 100) + '%';
    const capturable = canCapture(player, nearest);
    let rel = nearest.mass > player.mass * INSTAKILL_RATIO ? '⚠ 危険' : (nearest.mass < player.mass / INSTAKILL_RATIO ? '捕食可能' : '拮抗');
    if (capturable) rel = '🛰 捕獲可能';
    $('lockon-sub').textContent = fmtMass(nearest.mass) + ' 質量 ・ ' + rel;
    panel.classList.toggle('capturable', capturable);
    if (captureUnlockedFor(player.stageIdx)) {
      captureEl.classList.remove('hidden');
      captureEl.classList.toggle('ready', capturable);
      captureEl.disabled = !capturable;
    } else {
      captureEl.classList.add('hidden');
    }
  }

  /* ---------- 捕獲（衛星化） ---------- */
  function tryCapture(player) {
    if (state.paused || state.cleared) return;
    const target = state.lockonTarget;
    if (!canCapture(player, target)) return;
    target.alive = false;
    const idx = state.enemies.indexOf(target);
    if (idx >= 0) state.enemies.splice(idx, 1);
    player.capturedSatellites.push({
      uid: target.uid, kind: target.kind, palette: target.palette, name: target.name,
      mass: target.mass, hp: target.mass, maxHp: target.mass,
      radius: target.radius, angle: rng() * Math.PI * 2,
      dist: 2.4 + player.capturedSatellites.length * 0.9, speed: 0.9 + rng() * 0.3,
      hasRing: !!target.hasRing, seedBucket: target.seedBucket, irregularShape: target.irregularShape,
      spinPhase: 0, hitFlash: 0,
    });
    renderer.addShake(6);
    for (let i = 0; i < 14; i++) {
      const a = rng() * Math.PI * 2, spd = 30 + rng() * 90;
      state.particles.spawn({ x: target.x, y: target.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, size: 2 + rng() * 3, color: '#8fe3c9', life: 0.5 + rng() * 0.3 });
    }
    showToast(target.name + ' を衛星として捕獲した！');
    saveGame(player);
  }

  /* ---------- HUD更新 ---------- */
  function updateHud(player) {
    const stage = currentStage(player);
    $('stage-name').textContent = stage.name;
    $('hud-level').textContent = player.level;
    const maxHp = playerMaxHp(player);
    $('hp-fill').style.width = clamp(player.hp / maxHp * 100, 0, 100) + '%';
    $('hp-text').textContent = Math.ceil(Math.max(0, player.hp)) + ' / ' + Math.ceil(maxHp);
    const nextStage = STAGES[Math.min(player.stageIdx + 1, STAGES.length - 1)];
    const span = Math.max(nextStage.mass - stage.mass, 1);
    const t = stage.isFinal ? 1 : clamp((player.mass - stage.mass) / span, 0, 1);
    $('mass-fill').style.width = (t * 100) + '%';
    $('mass-text').textContent = '質量 ' + fmtMass(player.mass);
    $('play-time').textContent = fmtTime(player.playTime);
    $('mode-badge').textContent = GAME_MODES[player.mode].label;

    const satEl = $('satellite-hud');
    const cap = captureCapacityFor(player.stageIdx);
    if (cap <= 0) {
      satEl.classList.add('hidden');
    } else {
      satEl.classList.remove('hidden');
      satEl.innerHTML = '🛰 ' + player.capturedSatellites.length + ' / ' + cap;
    }

    // エンドレスモード: 総吸収数・質量をHUDに表示する（左上のパネルを縦に積む）。
    const endlessEl = $('endless-hud');
    if (player.endless) {
      endlessEl.classList.remove('hidden');
      endlessEl.innerHTML = '🕳 総吸収 ' + player.absorbedCount + ' ・ 質量 ' + fmtMass(player.mass);
    } else {
      endlessEl.classList.add('hidden');
    }
    // 左上のパネル群（ロックオン / 保有衛星 / エンドレス統計）が表示状態に応じて
    // 重ならないよう、上から順に積み直す。
    let stackTop = 78;
    const lockonEl = $('lockon');
    if (!lockonEl.classList.contains('hidden')) stackTop += 74;
    if (!satEl.classList.contains('hidden')) { satEl.style.top = stackTop + 'px'; stackTop += 40; }
    if (player.endless) endlessEl.style.top = stackTop + 'px';
  }

  function showToast(text) {
    const el = $('death-toast');
    el.textContent = text;
    el.classList.remove('hidden');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => el.classList.add('hidden'), 2600);
  }

  /* ---------- メインループ ---------- */
  /* 1フレーム分のゲームロジック更新（rAFベースのstep()から呼び出す）。 */
  function updateFrame(player, dt) {
    if (!state.paused && !state.cleared) {
      player.playTime += dt;
      // 敵のスポーン基準質量を、実際のプレイヤー質量へ緩やかに（遅れて）追従させる（log空間で平滑化）。
      state.enemyScaleLogMass += (Math.log(Math.max(1e-6, player.mass)) - state.enemyScaleLogMass) * Math.min(1, dt / BALANCE.enemyScaleLagSeconds);
      state.enemyScaleMass = Math.exp(state.enemyScaleLogMass);
      const speedRatio = updatePlayerMovement(player, dt);
      state.speedRatio = speedRatio;
      trySpawnEnemies(player);
      despawnFarEnemies(player);
      // 重力波アップグレード: 敵にも破片と同様に強く働く重力（説明文の「敵と破片を引き寄せる」を実装）
      const gwaveMult = 1 + upVal('gwave', upLevel(player, 'gwave')) / 100;
      applyPlayerGravity(state.enemies, player, dt, gwaveMult);
      updateEnemyMutualGravityAndCollisions(state.enemies, state.fragments, null, rng, dt, (small, big) => {
        renderer.addShake(clamp(small.mass / Math.max(1, player.mass) * 2, 0.5, 4));
      }, player, screenRadiusCapFor());
      pruneBodyCounts(state.enemies, state.fragments, player);
      updateEnemyAI(player, dt);
      for (const e of state.enemies) resolveCollision(player, e, dt, speedRatio);
      updateFragments(player, dt);
      updatePassives(player, dt);
      updateSatellites(player, dt);
      updateTailTrail(player, dt);
      checkLevelUp(player);
      state.particles.update(dt);
      state.floats.update(dt);
      flushFloatAggregates(dt);
      state.missCooldown = Math.max(0, state.missCooldown - dt);

      state.saveTimer -= dt;
      if (state.saveTimer <= 0) { state.saveTimer = BALANCE.autosaveInterval; saveGame(player); }

      // カメラ追従
      const targetZoom = currentStage(player).camZoom;
      state.camera.zoom += (targetZoom - state.camera.zoom) * Math.min(1, dt * 1.5);
      state.camera.x += (player.x - state.camera.x) * Math.min(1, dt * 6);
      state.camera.y += (player.y - state.camera.y) * Math.min(1, dt * 6);

      updateLockonUI(player);
      updateHud(player);
    }
  }

  function step(ts) {
    if (!state.running) return;
    requestAnimationFrame(step);
    let dt = state.lastTs ? (ts - state.lastTs) / 1000 : 0;
    state.lastTs = ts;
    dt = Math.min(dt, 0.05);
    const player = state.player;
    updateFrame(player, dt);
    render(player, dt);
  }

  function render(player, dt) {
    renderer.clear();
    renderer.drawBackground(state.camera, dt || 0, player.stageIdx);
    renderer.beginFrame(1 / 60, state.camera);
    const cam = state.camera;
    // 実機フィードバック対応（最優先・描画はみ出しバグ）: ワールド半径やカメラズームの
    // 計算がどこかで想定外の値になったとしても、画面上に描く天体の表示半径は
    // 常にこの絶対上限（画面短辺の42%＝直径で84%）で頭打ちにする。真因は破片の
    // 半径に上限が無かったことだった（FRAGMENT_MAX_RADIUS参照）が、screenRadiusCapFor()
    // による敵専用のワールド側クランプと合わせて、想定外の巨大表示を構造的に
    // 発生させないための二重・三重の安全弁として残す。
    const hardMaxSr = Math.min(renderer.w, renderer.h) * 0.42;

    // 破片
    for (const f of state.fragments) {
      const s = renderer.worldToScreen(cam, f.x, f.y);
      renderer.drawFragment(f, s.x, s.y, Math.min(hardMaxSr, Math.max(1.5, f.radius * cam.zoom)));
    }

    // 敵（画面外カリング）
    const margin = 140;
    for (const e of state.enemies) {
      if (!e.alive) continue;
      const s = renderer.worldToScreen(cam, e.x, e.y);
      const sr = Math.min(hardMaxSr, e.radius * cam.zoom);
      if (s.x < -margin - sr || s.x > renderer.w + margin + sr || s.y < -margin - sr || s.y > renderer.h + margin + sr) continue;
      renderer.drawBody(e, s.x, s.y, sr, cam);
      if (sr > 6) renderer.drawHpBar(s.x, s.y, sr, e.hp / e.maxHp, e.isHostile ? '#ff6b7a' : '#5ce0a0');
    }
    // ※ 固定の点線軌道円によるロックオン表示は実機フィードバックで完全廃止。
    // ロックオン情報は左上のHUDパネル（#lockon）のみで表示する。

    // 衛星（アップグレード由来の汎用衛星）
    for (const sat of player.satellites) {
      const s = renderer.worldToScreen(cam, sat.x || player.x, sat.y || player.y);
      renderer.ctx.fillStyle = sat.kind === 'binary' ? '#ffd18f' : '#cfd6ff';
      renderer.ctx.beginPath();
      renderer.ctx.arc(s.x, s.y, (sat.kind === 'binary' ? 10 : 6) * cam.zoom, 0, Math.PI * 2);
      renderer.ctx.fill();
    }
    // 捕獲した衛星（自分の天体として描画。画面を埋めないよう半径をプレイヤーの
    // 1.1倍までにクランプする）
    {
      const capMaxR = playerRadius(player) * 1.1;
      for (const sat of player.capturedSatellites) {
        const s = renderer.worldToScreen(cam, sat.x, sat.y);
        const sr = Math.min(hardMaxSr, Math.min(sat.radius, capMaxR) * cam.zoom);
        renderer.drawBody(sat, s.x, s.y, sr, cam);
        renderer.ctx.strokeStyle = 'rgba(140,230,190,0.8)';
        renderer.ctx.lineWidth = 1.6;
        renderer.ctx.beginPath(); renderer.ctx.arc(s.x, s.y, sr + 2.5, 0, Math.PI * 2); renderer.ctx.stroke();
      }
    }

    // 彗星の尾アップグレードの視覚的な軌跡（発光プラズマの帯、ダメージ判定範囲と一致）
    if (upLevel(player, 'tail') > 0 && player.tailTrail.length > 1) {
      renderer.drawTail(cam, player.tailTrail, playerRadius(player) * 1.5);
    }

    // プレイヤー
    {
      const stage = currentStage(player);
      const s = renderer.worldToScreen(cam, player.x, player.y);
      const sr = Math.min(hardMaxSr, playerRadius(player) * cam.zoom);
      // 加速衝突アップグレード: 最大速度に近いほど自機後方に加速光を灯す（「高速移動」の体感化）。
      const ramLv = upLevel(player, 'ramspeed');
      const spdR = state.speedRatio || 0;
      if (ramLv > 0 && spdR > 0.6) {
        const boostT = clamp((spdR - 0.6) / 0.4, 0, 1);
        const dir = Math.atan2(player.vy, player.vx);
        const bx = s.x - Math.cos(dir) * sr * 1.4, by = s.y - Math.sin(dir) * sr * 1.4;
        const grad = renderer.ctx.createRadialGradient(bx, by, 0, bx, by, sr * (1.4 + boostT));
        grad.addColorStop(0, `rgba(255,220,140,${(0.55 * boostT).toFixed(2)})`);
        grad.addColorStop(1, 'rgba(255,220,140,0)');
        renderer.ctx.fillStyle = grad;
        renderer.ctx.beginPath();
        renderer.ctx.arc(bx, by, sr * (1.4 + boostT), 0, Math.PI * 2);
        renderer.ctx.fill();
      }
      const pseudo = {
        kind: stage.kind, palette: derivePalette(stage.color), seedBucket: stage.key.length * 13 + player.stageIdx,
        angle: player.angle, spinPhase: player.spinPhase || 0, hitFlash: player.hitFlash, hasRing: upLevel(player, 'rings') > 0 && stage.key !== 'rock',
        vx: player.vx, vy: player.vy,
        // 序盤2段階（岩石片・小惑星）は不規則形状でタンブリング、準惑星進化時に球になる
        irregularShape: stage.key === 'rock' || stage.key === 'asteroid',
      };
      if (player.invuln > 0 && Math.floor(player.invuln * 10) % 2 === 0) {
        renderer.ctx.globalAlpha = 0.45;
      }
      renderer.drawBody(pseudo, s.x, s.y, sr, cam);
      renderer.ctx.globalAlpha = 1;
    }

    renderer.drawParticles(state.particles, cam);
    renderer.drawFloatTexts(state.floats, cam);

    // 重力感知アップグレード: 画面外にいる強大な敵（脅威）を画面端の矢印で警戒表示する
    if (state.distantThreat && state.distantThreat.alive) {
      drawThreatWarning(player, state.distantThreat, cam);
    }

    renderer.endFrame();
  }

  /* 画面端に警戒の矢印とおおよその距離を表示する（重力感知アップグレードの効果）。 */
  function drawThreatWarning(player, threat, cam) {
    const ctx = renderer.ctx;
    const cx = renderer.w / 2, cy = renderer.h / 2;
    const ang = Math.atan2(threat.y - player.y, threat.x - player.x);
    const margin = 46;
    const halfW = renderer.w / 2 - margin, halfH = renderer.h / 2 - margin;
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const t = Math.min(halfW / Math.max(1e-4, Math.abs(dx)), halfH / Math.max(1e-4, Math.abs(dy)));
    const ax = cx + dx * t, ay = cy + dy * t;
    const pulse = 0.55 + 0.35 * Math.sin(renderer.time * 6);
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(ang);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#ff5c66';
    ctx.beginPath();
    ctx.moveTo(14, 0); ctx.lineTo(-8, -9); ctx.lineTo(-8, 9); ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
    const d = dist(player, threat);
    ctx.textAlign = 'center';
    ctx.font = '700 11px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,110,120,0.9)';
    ctx.fillText(fmtMass(d) + 'm 警戒', ax - dx * 20, ay - dy * 20 + 4);
  }

  /* ---------- 起動 / メニュー ---------- */
  function startGame(fresh, mode) {
    const player = newPlayer();
    if (!fresh) {
      const data = loadGame();
      if (data) applySaveData(player, data);
    } else {
      clearSave();
      player.mode = gameModeOrDefault(mode);
    }
    rebuildSatellites(player);
    state.player = player;
    state.enemies = [];
    state.fragments.length = 0;
    state.enemyScaleMass = player.mass;
    state.enemyScaleLogMass = Math.log(Math.max(1e-6, player.mass));
    state.camera.x = player.x; state.camera.y = player.y;
    state.camera.zoom = currentStage(player).camZoom;
    state.cleared = false; state.dead = false; state.paused = false;
    state.lastTs = 0;
    $('title-screen').classList.add('hidden');
    $('result-screen').classList.add('hidden');
    $('pause-modal').classList.add('hidden');
    refreshUpgradeIcons(player);
    updateHud(player);
    if (!state.running) { state.running = true; requestAnimationFrame(step); }
    // 実機フィードバック対応（第3回・エンドレスモード）: セーブが「ブラックホールに
    // 到達済みだが、まだ『そのまま遊ぶ』を選んでいない」状態だった場合（クリア後に
    // リザルト画面を閉じずにリロードした等）、黙って続行せず、もう一度リザルト画面を
    // 出して選択させる（クリアという区切りをきちんと見せるため）。
    if (!fresh && !player.endless && player.stageIdx >= STAGES.length - 1) {
      state.cleared = true;
      state.paused = true;
      populateResultStats(player);
      $('result-screen').classList.remove('hidden');
    }
  }

  function bindUI() {
    $('btn-continue').addEventListener('click', () => startGame(false));
    $('btn-newgame').addEventListener('click', () => startGame(true, 'normal'));
    $('btn-newgame-fast').addEventListener('click', () => startGame(true, 'fast'));
    $('btn-menu').addEventListener('click', () => {
      // クリア直後（まだそのまま遊ぶ/やり直すを選んでいない）はメニューを出さない。
      // エンドレスに移行した後は state.cleared が false に戻るので通常どおり開ける。
      if (state.cleared) return;
      state.paused = true;
      $('btn-pause-result').classList.toggle('hidden', !(state.player && state.player.endless));
      $('pause-modal').classList.remove('hidden');
    });
    $('btn-resume').addEventListener('click', () => {
      state.paused = false;
      $('pause-modal').classList.add('hidden');
    });
    $('btn-pause-result').addEventListener('click', () => {
      $('pause-modal').classList.add('hidden');
      if (state.player) populateResultStats(state.player);
      $('result-screen').classList.remove('hidden');
    });
    $('btn-restart-confirm').addEventListener('click', () => {
      $('pause-modal').classList.add('hidden');
      startGame(true, state.player ? state.player.mode : 'normal');
    });
    $('btn-result-restart').addEventListener('click', () => startGame(true, state.player ? state.player.mode : 'normal'));
    $('btn-result-endless').addEventListener('click', () => {
      if (state.player) continueEndless(state.player);
    });

    if (hasSave()) $('btn-continue').classList.remove('hidden');
  }

  window.addEventListener('resize', () => renderer.resize());
  renderer.resize();
  bindInput();
  bindUI();
})();
