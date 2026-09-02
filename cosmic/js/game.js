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
    hitStop: 0,          // 激突時のヒットストップ残り秒数（実時間）
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

  const CONTACT_DPS = 20;      // 衛星（satellites）が敵に削られる際の基準値としてのみ使用
  // 実機フィードバック対応（HPバーが機能していない・一撃死かほぼ無傷かの二択）:
  // 以前は1.45という低い倍率で「即吸収」と「拮抗（かつ絶対量ダメージで実質減らない）」
  // に二分されており、質量比0.7〜1.0程度の獲物すら常に一撃だった。ここは「本当に
  // 豆粒のような格下（質量比およそ0.2以下）だけをテンポ維持のため一撃にする」
  // 閾値まで引き上げ、それ以外はすべて後述の割合ベースの拮抗ダメージ処理に回す。
  const INSTAKILL_RATIO = 5; // これ以上大きければ即吸収（相手が自分のおよそ1/5以下の質量）
  // ---- 激突・跳ね返り（実機フィードバック対応: 「ぶつかったときに激突し、跳ね返る感じに」）----
  // 接触中に毎フレーム弱く押し合うだけだった衝突を、接触の瞬間に撃力（インパルス）を与えて
  // 運動量保存で弾き合う「激突」に変更した。質量比に応じて、格下は跳ね返され、格上には
  // 跳ね返される。
  const IMPACT_RESTITUTION = 0.72;   // 反発係数（接近速度のうち跳ね返りに変わる割合）
  const IMPACT_MIN_SEP_SPEED = 170;  // 静止状態からそっと触れても最低これだけの相対速度で弾く(px/s)
  const IMPACT_KNOCK_DECAY = 3.2;    // 跳ね返り速度の減衰率(1/s)。大きいほど早く止まる
  const IMPACT_KNOCK_MAX = 520;      // 跳ね返り速度の上限(px/s)
  const IMPACT_BURST_SECONDS = 0.5;  // 激突1回で「接触何秒ぶん」の割合ダメージを与えるか
  const IMPACT_HITSTOP_MAX = 0.085;  // 強い激突でのヒットストップ最大秒数
  // 拮抗ダメージ（相手の最大HPに対する割合/秒）。質量の絶対値に依存させず「質量比」
  // だけで討伐に必要な接触回数が決まるようにする（大きな敵ほど絶対量として何十秒も
  // 削れない、という不具合の直接の修正）。ratio(=有効質量/相手質量)が1（同格）で
  // 5〜10回、2（相手が半分弱）で2〜4回程度の接触で倒せることを目安に調整した値。
  const ENEMY_DMG_FRAC = 3.3;    // ratio=1 のとき、相手の最大HPの約330%/秒を削る基準値
  // （実機フィードバック対応: 実際の接触は「くっつき続ける」のではなく、押し返し・
  // 軌道の乱れにより1フレーム前後の短い接触が繰り返される「連続タップ」に近い挙動
  // だったため、当初の理論値（継続接触0.4秒あたり1ヒット想定）の約9倍に較正し直した。
  // 実機（Playwright操作）計測で質量比0.8/0.3/同格/脅威それぞれの実際の接触回数を
  // 確認して調整した値。cosmic/README.md 参照。）
  const ENEMY_DMG_EXP_HI = 1.427; // ratio>=1（有利）側は急に強くなる（格下ほど速く倒せる）
  const ENEMY_DMG_EXP_LO = 0.12;  // ratio<1（不利）側はゆるやかに（脅威でも根気よく削れば倒せる）
  // 被ダメージ（自分の最大HPに対する割合/秒）。1/ratio（相手が自分よりどれだけ格上か）
  // が1（同格）のとき約108%/秒、格上になるほど急激に危険になるようにする（同上の較正）。
  const PLAYER_DMG_FRAC = 1.08;
  const PLAYER_DMG_EXP_HI = 1.427;
  const PLAYER_DMG_EXP_LO = 0.12;
  function ratioDamageFactor(ratio, frac, expHi, expLo) {
    return ratio >= 1 ? frac * Math.pow(ratio, expHi) : frac * Math.pow(Math.max(ratio, 0.001), expLo);
  }

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
    // 実機フィードバック対応: 以前は「hostileがstageIdx>=1限定」なせいで、stageIdx===0の
    // ときだけ hostile 用に予約されていたはずの r<0.10 の範囲もそのまま comet 判定に
    // 落ちてしまい（累積しきい値がずれていた）、序盤ほど彗星が多く出る逆転現象が起きていた。
    // 各区分の確率を明示的な累積しきい値で計算し直し、あわせて序盤（岩石片〜小惑星）は
    // 彗星の出現頻度そのものを抑える（ユーザーフィードバック「狙いすぎ・序盤で受動的に
    // 大量の質量を得てしまう」への対応）。
    const hostileChance = player.stageIdx >= 1 ? 0.10 : 0;
    const cometChance = player.stageIdx <= 1 ? 0.06 : 0.16;
    const planetChance = player.stageIdx >= 2 ? 0.30 : 0;
    let acc = 0;
    if (r < (acc += hostileChance)) return 'hostile';
    if (r < (acc += cometChance)) return 'comet';
    if (r < (acc += planetChance)) return 'planet';
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
      let mass = rollEnemyMass(state.enemyScaleMass, forceNonThreat);
      // 実機フィードバック対応: 序盤（岩石片〜小惑星）の彗星は質量そのものも抑え、
      // 「最初に彗星に突撃されて食われ、勝手にレベルアップしてしまう」ことを防ぐ。
      if (kind === 'comet' && player.stageIdx <= 1) {
        mass *= player.stageIdx === 0 ? 0.35 : 0.6;
      }
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
        // 実機フィードバック対応（「彗星が自機に向かって突撃してくる。狙いすぎ」）:
        // 以前はプレイヤー位置から一定オフセット以内の点を明示的に狙う軌道だったため、
        // 常にプレイヤー付近を通る「狙い撃ち」になっていた。進行方向をプレイヤー位置と
        // 完全に無関係なランダム方向にし、最接近距離（プレイヤーとの垂直オフセット）も
        // 広い範囲からランダムに選ぶことで「視界をランダムな方向・オフセットで横切る」
        // 軌道にする。近傍を通ることはあっても、直撃コースになるのはごく稀（12%の
        // 抽選に当たった上でオフセットも小さく出た場合のみ）にとどめる。
        const dirAng = rng() * Math.PI * 2;
        const dirX = Math.cos(dirAng), dirY = Math.sin(dirAng);
        const perpX = -dirY, perpY = dirX;
        const closeCall = rng() < 0.12;
        const closestApproach = spawnR * (closeCall ? rng() * 0.25 : 0.25 + rng() * 0.85);
        const side = rng() < 0.5 ? 1 : -1;
        const cometSpeed = 240 + rng() * 140;
        body.vx = dirX * cometSpeed;
        body.vy = dirY * cometSpeed;
        // 上で決めた進行方向・最接近距離を通る直線上、スポーン半径だけ手前に配置し直す
        // （x,yは元々プレイヤー中心のランダムな点だったため、狙い撃ちにならないよう再配置する）。
        const closestX = player.x + perpX * closestApproach * side;
        const closestY = player.y + perpY * closestApproach * side;
        body.x = closestX - dirX * r;
        body.y = closestY - dirY * r;
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
    // 吸収エフェクト: 破壊した天体の見かけ半径に応じて火花の数・速度・フラッシュの
    // 規模をスケールする（大物ほど派手に、豆粒ほど控えめに）。
    const destroyScale = clamp(enemy.radius / 14, 0.6, 3.2);
    const sparkCount = Math.round(clamp(8 + enemy.radius * 0.9, 8, 34));
    for (let i = 0; i < sparkCount; i++) {
      const a = rng() * Math.PI * 2, spd = (60 + rng() * 220) * (0.6 + destroyScale * 0.25);
      state.particles.spawn({
        x: enemy.x, y: enemy.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
        size: (2 + rng() * 3) * (0.8 + destroyScale * 0.3), color: enemy.palette.light || '#fff',
        life: 0.32 + rng() * 0.28, gravity: 26,
      });
    }
    renderer.spawnImpactFlash(enemy.x, enemy.y, enemy.radius * (1 + destroyScale * 0.25), enemy.palette.light || '#fff6d8');
    if (enemy.radius > 16) renderer.spawnShockwave(enemy.x, enemy.y, enemy.radius, enemy.palette.light || '#dff2ff');
    checkLevelUp(player);
  }

  function damageEnemy(enemy, amount, player, sparkColor) {
    // 溶岩惑星: 与えたダメージ（実際に削れたHP分。オーバーキル分は含めない）の
    // 一定割合を自分の質量に変換する。以前は即吸収時のみの特殊処理だったが、
    // 説明文「与えたダメージの%を自分の質量に変換する」に合わせ、あらゆる
    // ダメージ源（接触・波動・衛星など）に一律で効くようにした。
    const lavaLv = upLevel(player, 'lava');
    let lavaHit = false;
    if (lavaLv > 0) {
      const realDealt = Math.min(amount, Math.max(0, enemy.hp));
      if (realDealt > 0) {
        const bonus = creditMass(player, realDealt * (upVal('lava', lavaLv) / 100), enemy.x, enemy.y);
        if (bonus > 0.15) { queueFloat('gain-lava', enemy.x, enemy.y + 12, bonus, '#ff9a5c'); lavaHit = true; }
      }
    }
    // 被弾フラッシュの立ち上がり（前フレームまで消えていた）だけを検出し、接触点に
    // 小さな火花を出す。接触が続く間は毎フレーム再点火しないため、連続ヒットでも
    // パーティクルが際限なく増えない。
    const wasFresh = enemy.hitFlash <= 0;
    enemy.hp -= amount;
    enemy.hitFlash = 0.25;
    queueFloat('enemy-' + enemy.uid, enemy.x, enemy.y - enemy.radius - 14, amount, '#ffd9a0');
    if (wasFresh && amount > 0.2) {
      const dx = player.x - enemy.x, dy = player.y - enemy.y;
      const d = Math.hypot(dx, dy) || 1;
      const cx = enemy.x + (dx / d) * enemy.radius, cy = enemy.y + (dy / d) * enemy.radius;
      // 属性色分け: 溶岩ダメージ変換が発動していれば橙、指定色（オーロラ/磁気嵐/フレア等）
      // があればそれ、なければ対象自身のパレット色。
      const color = sparkColor || (lavaHit ? '#ff8a3c' : (enemy.palette.light || '#ffd9a0'));
      for (let i = 0; i < 4; i++) {
        const a = rng() * Math.PI * 2, spd = 30 + rng() * 70;
        state.particles.spawn({ x: cx, y: cy, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, size: 1.6 + rng() * 2, color, life: 0.22 + rng() * 0.16, gravity: 10 });
      }
    }
    if (enemy.hp <= 0 && enemy.alive) killEnemy(enemy, player);
  }

  function applyPlayerDamage(player, amount, source) {
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
    // 被弾フラッシュの立ち上がりだけを検出して接触点に控えめな火花・赤いリムフラッシュ・
    // ごく小さめの画面シェイクを出す（連続接触中は毎フレーム再点火しない）。
    const wasFresh = player.hitFlash <= 0;
    player.hp -= dmg;
    player.hitFlash = 0.3;
    if (dmg > 0.4) queueFloat('player-dmg', player.x, player.y - playerRadius(player) - 6, dmg, '#ff6b7a');
    if (wasFresh && dmg > 0.15) {
      const pr = playerRadius(player);
      let cx = player.x, cy = player.y;
      if (source) {
        const dx = source.x - player.x, dy = source.y - player.y;
        const d = Math.hypot(dx, dy) || 1;
        cx = player.x + (dx / d) * pr; cy = player.y + (dy / d) * pr;
      }
      for (let i = 0; i < 6; i++) {
        const a = rng() * Math.PI * 2, spd = 40 + rng() * 90;
        state.particles.spawn({ x: cx, y: cy, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, size: 1.8 + rng() * 2.4, color: '#ff8a7a', life: 0.26 + rng() * 0.18, gravity: 14 });
      }
      renderer.spawnImpactFlash(cx, cy, pr * 0.55, '#ff5a5a');
      renderer.addShake(clamp(dmg * 0.35, 0.4, 3));
    }
    if (player.hp <= 0) handlePlayerDeath(player);
  }

  function resolveCollision(player, enemy, dt, speedRatio) {
    if (!enemy.alive) return;
    const pr = playerRadius(player), er = enemy.radius;
    const d = dist(player, enemy);
    if (d > pr + er) { enemy.inContact = false; return; }
    const ramBoost = 1 + (upVal('ramspeed', upLevel(player, 'ramspeed')) / 100) * speedRatio * 0.5;
    const effMass = player.mass * ramBoost;
    const ratio = effMass / enemy.mass;

    if (ratio >= INSTAKILL_RATIO) {
      // 豆粒のような格下はテンポ維持のため一撃で吸収する。
      damageEnemy(enemy, enemy.hp * 99, player);
      return;
    }

    // 拮抗〜脅威: 相手の最大HPに対する割合ダメージ/秒として計算するため、質量の
    // 絶対値に関わらず「質量比」だけで討伐に必要な接触回数が決まる。相手がどれほど
    // 格上でも(ENEMY_DMG_EXP_LOによりゆるやかに)常に多少は削れるため、根気よく
    // 当たり続ければいずれ倒せる（＝以前の「押し返すだけで一切減らない」を解消）。
    const off = offenseMultiplier(player, speedRatio);
    const enemyRate = enemy.maxHp * ratioDamageFactor(ratio, ENEMY_DMG_FRAC, ENEMY_DMG_EXP_HI, ENEMY_DMG_EXP_LO) * off.mult;
    const playerRate = playerMaxHp(player) * ratioDamageFactor(1 / ratio, PLAYER_DMG_FRAC, PLAYER_DMG_EXP_HI, PLAYER_DMG_EXP_LO);

    // 法線: 相手→自機
    const nx = (player.x - enemy.x) / (d || 1), ny = (player.y - enemy.y) / (d || 1);
    const m1 = effMass, m2 = enemy.mass;
    const w1 = m2 / (m1 + m2), w2 = m1 / (m1 + m2); // 軽い方ほど大きく動く

    const fresh = !enemy.inContact;
    enemy.inContact = true;
    let dmgToEnemy = enemyRate * dt, dmgToPlayer = playerRate * dt;
    if (fresh) {
      // ---- 激突（接触の瞬間だけ） ----
      // 法線方向の接近速度（跳ね返り分の速度も含める）から撃力を求め、運動量保存で弾く。
      const rvx = (player.vx + (player.kvx || 0)) - (enemy.vx + (enemy.kvx || 0));
      const rvy = (player.vy + (player.kvy || 0)) - (enemy.vy + (enemy.kvy || 0));
      const approach = Math.max(0, -(rvx * nx + rvy * ny));
      const sep = Math.max(approach * IMPACT_RESTITUTION, IMPACT_MIN_SEP_SPEED);
      const dv = approach + sep; // 相対速度の変化量（接近→分離）
      applyKnock(player, nx * dv * w1, ny * dv * w1);
      applyKnock(enemy, -nx * dv * w2, -ny * dv * w2);
      // 激突の瞬間は移動慣性もいったん打ち消す（相手に向かって進んでいた勢いを殺す）。
      const vn = player.vx * nx + player.vy * ny;
      if (vn < 0) { player.vx -= nx * vn; player.vy -= ny * vn; }

      // 激突の強さ（0〜約1.6）: 接近速度が自機最高速に対してどれくらいか
      const impact = clamp(approach / BALANCE.moveMaxSpeed, 0, 1.6);
      // 一瞬で離れてしまうため、激突1回ぶんの瞬間ダメージを加算する（強くぶつかるほど多め）。
      const burst = IMPACT_BURST_SECONDS * (0.5 + impact * 0.7);
      dmgToEnemy += enemyRate * burst;
      dmgToPlayer += playerRate * burst;
      spawnImpactEffects(player, enemy, nx, ny, impact, ratio, w1, w2);
    }
    damageEnemy(enemy, dmgToEnemy, player);
    if (off.isCrit) showFloat(enemy.x, enemy.y - enemy.radius - 26, '会心!', '#ffe066');
    applyPlayerDamage(player, dmgToPlayer, enemy);

    // めり込み解消: 重なりぶんを質量比で分担して即座に離す（軽い方が大きく退く）。
    const overlap = pr + er - d;
    if (overlap > 0) {
      player.x += nx * overlap * w1; player.y += ny * overlap * w1;
      enemy.x -= nx * overlap * w2; enemy.y -= ny * overlap * w2;
    }
  }

  /* 跳ね返り速度（kvx/kvy）を加算する。通常の移動速度とは別枠で持ち、最高速度の
   * クランプや摩擦の影響を受けずに IMPACT_KNOCK_DECAY で独自に減衰する。 */
  function applyKnock(body, ix, iy) {
    body.kvx = (body.kvx || 0) + ix;
    body.kvy = (body.kvy || 0) + iy;
    const k = Math.hypot(body.kvx, body.kvy);
    if (k > IMPACT_KNOCK_MAX) { body.kvx *= IMPACT_KNOCK_MAX / k; body.kvy *= IMPACT_KNOCK_MAX / k; }
  }
  function decayKnock(body, dt) {
    if (!body.kvx && !body.kvy) return;
    const f = Math.exp(-IMPACT_KNOCK_DECAY * dt);
    body.kvx *= f; body.kvy *= f;
    if (Math.abs(body.kvx) < 0.5 && Math.abs(body.kvy) < 0.5) { body.kvx = 0; body.kvy = 0; }
  }
  /* 激突時の天体変形（法線方向につぶれてから伸びる減衰振動）。描画側 render.js が参照する。 */
  function setSquash(body, nx, ny, amount, dur) {
    body.squashT = dur; body.squashDur = dur;
    body.squashAmt = amount; body.squashAngle = Math.atan2(ny, nx);
  }
  function tickSquash(body, dt) { if (body.squashT > 0) body.squashT -= dt; }

  /* 激突エフェクト: 接触点の閃光・衝撃波・接線方向に飛び散る火花・シェイク・ヒットストップ・
   * 天体のスカッシュ。impact は接近速度/最高速（0〜1.6）、w1/w2 は自機/相手の動く割合。 */
  function spawnImpactEffects(player, enemy, nx, ny, impact, ratio, w1, w2) {
    const pr = playerRadius(player), er = enemy.radius;
    const cx = enemy.x + nx * er, cy = enemy.y + ny * er;
    const outmatched = ratio < 1;                 // 自機が格下＝「跳ね返される」側
    const sizeScale = clamp(Math.min(pr, er) / 14, 0.6, 3);
    const strength = 0.45 + impact;               // 見た目全体のスケール
    const color = outmatched ? '#ffb08a' : (enemy.palette.light || '#fff6d8');

    renderer.spawnImpactFlash(cx, cy, Math.min(pr, er) * (0.9 + impact * 0.7), color);
    if (impact > 0.35 || Math.max(pr, er) > 18) {
      renderer.spawnShockwave(cx, cy, Math.max(pr, er) * (0.5 + impact * 0.35), outmatched ? '#ffc9b0' : '#dff2ff');
    }
    // 火花: 接触面に沿って（接線方向へ）両側に飛び散る＋法線方向に少量の破片
    const tx = -ny, ty = nx;
    const sparkCount = Math.round(clamp((10 + impact * 16) * (0.7 + sizeScale * 0.3), 8, 40));
    for (let i = 0; i < sparkCount; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const spread = (rng() - 0.5) * 1.1;
      const dx = tx * side * Math.cos(spread) + nx * Math.sin(spread);
      const dy = ty * side * Math.cos(spread) + ny * Math.sin(spread);
      const spd = (90 + rng() * 260) * (0.55 + strength * 0.45);
      state.particles.spawn({
        x: cx, y: cy, vx: dx * spd, vy: dy * spd,
        size: (1.8 + rng() * 2.8) * (0.8 + sizeScale * 0.25), color: rng() < 0.5 ? color : '#fff6d8',
        life: 0.28 + rng() * 0.3, gravity: 18,
      });
    }
    for (let i = 0; i < 4; i++) {
      const side = i < 2 ? 1 : -1, a = (rng() - 0.5) * 0.6;
      const dx = nx * side * Math.cos(a) + tx * Math.sin(a), dy = ny * side * Math.cos(a) + ty * Math.sin(a);
      const spd = (60 + rng() * 120) * strength;
      state.particles.spawn({ x: cx, y: cy, vx: dx * spd, vy: dy * spd, size: 2.5 + rng() * 3, color: enemy.palette.light || '#fff', life: 0.35 + rng() * 0.3, gravity: 30 });
    }
    // 画面シェイク: 衝撃の強さと、自機がどれだけ弾かれたか（格上にぶつかるほど大きい）
    renderer.addShake(clamp(2.5 + impact * 5 + w1 * 4 + (outmatched ? 2 : 0), 2.5, 13));
    // ヒットストップ: 強めの激突だけ一瞬止めて「激突感」を出す（弱い接触では入れない）
    if (impact > 0.4) state.hitStop = Math.max(state.hitStop, Math.min(IMPACT_HITSTOP_MAX, 0.035 + impact * 0.04));
    // スカッシュ: 軽い方ほど大きくつぶれる
    const amt = clamp(0.12 + impact * 0.22, 0.12, 0.42);
    setSquash(player, nx, ny, amt * clamp(w1 * 2, 0.45, 1.25), 0.32);
    setSquash(enemy, nx, ny, amt * clamp(w2 * 2, 0.45, 1.25), 0.32);
    if (impact >= 0.9) showFloat(cx, cy - Math.min(pr, er) - 6, '激突!', outmatched ? '#ffb08a' : '#fff1c9');
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
    player.x = 0; player.y = 0; player.vx = 0; player.vy = 0; player.kvx = 0; player.kvy = 0;
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
      // 画面座標の差分をそのままワールドに使うと3Dカメラでは上下が反転するため、
      // タッチ位置をワールド座標に射影してから方向を求める
      let dx, dy;
      if (renderer.ready) {
        const wt = renderer.screenToWorld(state.pointerX, state.pointerY);
        const wc = renderer.screenToWorld(renderer.w / 2, renderer.h / 2);
        dx = wt.x - wc.x; dy = wt.y - wc.y;
      } else {
        dx = state.pointerX - renderer.w / 2; dy = state.pointerY - renderer.h / 2;
      }
      const dScreen = Math.hypot(state.pointerX - renderer.w / 2, state.pointerY - renderer.h / 2);
      const d = Math.hypot(dx, dy);
      if (dScreen > 6 && d > 0.0001) {
        const thrustBonus = upVal('thrust', upLevel(player, 'thrust')) / 100;
        const accel = BALANCE.moveAccel * (1 + thrustBonus);
        const nx = dx / d, ny = dy / d;
        const pull = clamp(dScreen / 160, 0.25, 1);
        player.vx += nx * accel * pull * dt;
        player.vy += ny * accel * pull * dt;
      }
    }
    const thrustBonus = upVal('thrust', upLevel(player, 'thrust')) / 100;
    const maxSpeed = BALANCE.moveMaxSpeed * (1 + thrustBonus);
    const spd = Math.hypot(player.vx, player.vy);
    if (spd > maxSpeed) { player.vx *= maxSpeed / spd; player.vy *= maxSpeed / spd; }
    player.vx *= BALANCE.friction; player.vy *= BALANCE.friction;
    // 跳ね返り速度は最高速クランプ・摩擦の対象外（別枠で減衰）。
    decayKnock(player, dt);
    player.x += (player.vx + (player.kvx || 0)) * dt; player.y += (player.vy + (player.kvy || 0)) * dt;
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

  // 実機フィードバック対応（「破片が自機の近くで消えてしまう」）: 破片には寿命
  // (life=22秒)があり、プレイヤーへ吸い寄せられている最中・目の前まで来ている最中でも
  // 容赦なく寿命切れで消えていた（吸収判定 d<pr*0.9 に届く直前で life<=0 になり、
  // 何の見返りもなく消滅する）のが直接の原因。画面内+αの「安全半径」にいる破片は
  // 寿命を消費しないようにし、寿命が尽きて消えるのは安全半径の外（見えない・触れられない
  // 遠方）にいる破片だけに限定する。個体数上限による間引き（pruneBodyCounts）は元々
  // プレイヤーから遠いものから優先して削るため、近傍の破片はそちらでも保護される。
  function fragmentSafeRadiusFor() {
    return Math.max(renderer.w, renderer.h) / Math.max(0.05, state.camera.zoom) * 0.65;
  }
  function updateFragments(player, dt) {
    const range = gravityRangeFor(player);
    const spd = gravitySpeedFor(player);
    const pr = playerRadius(player);
    const safeR = fragmentSafeRadiusFor();
    for (let i = state.fragments.length - 1; i >= 0; i--) {
      const f = state.fragments[i];
      const d = dist(f, player);
      if (d >= safeR) f.life -= dt;
      f.age = (f.age || 0) + dt;
      if (d < range) {
        const nx = (player.x - f.x) / (d || 1), ny = (player.y - f.y) / (d || 1);
        const pull = spd * (1 - d / range + 0.2);
        f.vx += nx * pull * dt * 6; f.vy += ny * pull * dt * 6;
      }
      f.x += f.vx * dt; f.y += f.vy * dt;
      f.angle = (f.angle || 0) + (f.spin || 0) * dt;
      if (d < pr * 0.9 || (d >= safeR && f.life <= 0)) {
        if (d < pr * 1.4) {
          const gained = creditMass(player, f.mass, f.x, f.y);
          if (gained > 0.15) queueFloat('gain-fragment', player.x, player.y - pr - 4, gained, '#bfe3ff');
        }
        state.fragments.splice(i, 1);
      }
    }
  }

  /* ---------- 彗星の尾（発光パーティクルの連続放出） ----------
   * 実機フィードバック対応（3D化後の彗星の尾がチープ・向き確認）: 以前は先細りの
   * 平面2枚を核に追従させるだけの表現で単調だった。核から反太陽方向
   * （-WORLD_LIGHT、太陽の方向 WORLD_LIGHT の逆）へ発光パーティクルを連続放出し、
   * 拡散・フェードしながら流れる「写真で見る彗星の尾」に近い見た目にする。
   * イオンの尾: 反太陽方向へまっすぐ・細く・青白く。
   * ダストの尾: 反太陽方向から進行方向の逆側へ少し曲げ、太く・白っぽく・緩くカーブ。
   * 既存の衝突エフェクトと同じ state.particles プール（上限あり、短寿命）を共有する。
   * 核から離れた（画面外遠方の）彗星では放出しない。 */
  function updateCometTails(dt) {
    for (const e of state.enemies) {
      if (!e.alive || e.kind !== 'comet') continue;
      const camDx = e.x - state.camera.x, camDy = e.y - state.camera.y;
      if (camDx * camDx + camDy * camDy > 2800 * 2800) continue;
      // 反太陽方向（太陽の方向 WORLD_LIGHT の逆）
      const adx = -WORLD_LIGHT.x, ady = -WORLD_LIGHT.y;
      const spd = Math.hypot(e.vx || 0, e.vy || 0);
      const vdx = spd > 1 ? e.vx / spd : adx, vdy = spd > 1 ? e.vy / spd : ady;
      // ダストの尾: 反太陽方向を軸に、進行方向の逆側へわずかに曲げる
      const bendX = adx * 0.72 - vdx * 0.28, bendY = ady * 0.72 - vdy * 0.28;
      const bendLen = Math.hypot(bendX, bendY) || 1;
      const bx = bendX / bendLen, by = bendY / bendLen;
      const sizeScale = clamp(e.radius / 14, 0.5, 3.2);
      const speedScale = clamp(0.6 + spd / 260, 0.6, 1.8);

      // イオンの尾: 細く・速く・青白い粒子をまっすぐ反太陽方向へ
      e.ionTailAcc = (e.ionTailAcc || 0) + dt;
      const ionInterval = 0.045 / speedScale;
      const ionAng = Math.atan2(ady, adx);
      while (e.ionTailAcc >= ionInterval) {
        e.ionTailAcc -= ionInterval;
        const ang = ionAng + (rng() - 0.5) * 0.10;
        const spdP = (120 + rng() * 90) * sizeScale;
        state.particles.spawn({
          x: e.x + adx * e.radius * 0.5, y: e.y + ady * e.radius * 0.5,
          vx: Math.cos(ang) * spdP + e.vx * 0.15, vy: Math.sin(ang) * spdP + e.vy * 0.15,
          size: (1.1 + rng() * 1.2) * sizeScale, color: '#bfe3ff',
          life: 0.32 + rng() * 0.22, gravity: 0,
        });
      }

      // ダストの尾: 太く・遅く・白っぽい粒子を緩くカーブする方向へ、広がりを持たせて
      e.dustTailAcc = (e.dustTailAcc || 0) + dt;
      const dustInterval = 0.075 / speedScale;
      const dustAng = Math.atan2(by, bx);
      while (e.dustTailAcc >= dustInterval) {
        e.dustTailAcc -= dustInterval;
        const ang = dustAng + (rng() - 0.5) * 0.55;
        const spdP = (50 + rng() * 55) * sizeScale;
        state.particles.spawn({
          x: e.x + bx * e.radius * 0.5, y: e.y + by * e.radius * 0.5,
          vx: Math.cos(ang) * spdP + e.vx * 0.1, vy: Math.sin(ang) * spdP + e.vy * 0.1,
          size: (2 + rng() * 2.2) * sizeScale, color: '#eef2fb',
          life: 0.5 + rng() * 0.3, gravity: 0,
        });
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
      // ただし激突で受けた跳ね返り（kvx/kvy）だけは別枠で減衰させ、弾かれたあと元の漂流に戻す。
      decayKnock(e, dt);
      e.x += (e.vx + (e.kvx || 0)) * dt; e.y += (e.vy + (e.kvy || 0)) * dt;
      if (e.hitFlash > 0) e.hitFlash -= dt * 2.2;
      tickSquash(e, dt);
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
        coneDamage(player, playerRadius(player) * 8, upVal('flare', flareLv), 1.05, '#ff8a3c');
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
        coneDamage(player, playerRadius(player) * 9, upVal('cme', cmeLv), 0.6, '#ffe066');
      }
    }
    // 彗星の尾
    const tailLv = upLevel(player, 'tail');
    if (tailLv > 0 && Math.hypot(player.vx, player.vy) > 40) {
      pulseDamage(player, playerRadius(player) * 1.5, upVal('tail', tailLv) * dt, '#c9e8ff', false, true);
    }
    player.invuln = Math.max(0, player.invuln - dt);
    if (player.hitFlash > 0) player.hitFlash -= dt * 2.2;
    tickSquash(player, dt);
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
        damageEnemy(e, dmg, player, color);
        if (knockback && e.mass < player.mass * 0.5) {
          const nx = (e.x - player.x) / (d || 1), ny = (e.y - player.y) / (d || 1);
          e.vx += nx * 90; e.vy += ny * 90;
        }
      }
    }
    if (!silent) {
      // パルスの効果範囲は3D側の衝撃波リングで可視化する。
      // 旧: kind:'ring' のパーティクルは3D描画では点として扱われ実質見えなかった
      // （「オーロラ帯でてなくない？」フィードバックの原因）。
      // spawnShockwave は radius*0.5→*2.6 に拡大するため、0.4倍を渡すと
      // 最終的におおよそ効果範囲まで広がる。
      renderer.spawnShockwave(player.x, player.y, radius * 0.4, color);
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

  function coneDamage(player, range, dmg, halfAngle, color) {
    halfAngle = halfAngle || 0.6;
    const dir = Math.hypot(player.vx, player.vy) > 5 ? Math.atan2(player.vy, player.vx) : player.angle;
    for (const e of state.enemies) {
      if (!e.alive) continue;
      const d = dist(player, e);
      if (d > range) continue;
      const ang = Math.atan2(e.y - player.y, e.x - player.x);
      let diff = Math.abs(ang - dir);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      if (diff < halfAngle) damageEnemy(e, dmg, player, color);
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
      // ヒットストップ: 強い激突の直後だけゲーム時間をほぼ止める（閃光・衝撃波は実時間で進む）。
      if (state.hitStop > 0) { state.hitStop = Math.max(0, state.hitStop - dt); dt *= 0.1; }
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
        // 敵同士の衝突・破壊: 大きめの天体同士ほど派手に（火花＋閃光＋薄い衝撃波リング）。
        const scale = clamp(small.radius / 14, 0.6, 3);
        const sparkCount = Math.round(clamp(6 + small.radius * 0.7, 6, 26));
        for (let i = 0; i < sparkCount; i++) {
          const a = rng() * Math.PI * 2, spd = (50 + rng() * 180) * (0.6 + scale * 0.25);
          state.particles.spawn({
            x: small.x, y: small.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
            size: (1.8 + rng() * 2.6) * (0.8 + scale * 0.25), color: small.palette.light || '#fff',
            life: 0.3 + rng() * 0.25, gravity: 20,
          });
        }
        renderer.spawnImpactFlash(small.x, small.y, small.radius * (1 + scale * 0.2), big.palette.light || '#fff6d8');
        if (small.radius > 14 || big.radius > 22) {
          renderer.spawnShockwave(small.x, small.y, Math.max(small.radius, big.radius * 0.6), '#dff2ff');
        }
      }, player, screenRadiusCapFor());
      pruneBodyCounts(state.enemies, state.fragments, player);
      updateEnemyAI(player, dt);
      updateCometTails(dt);
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
        // 所有マークの線の円は「惑星に◯がついてるの変」フィードバックで廃止。
        // 捕獲衛星は自機周回の動きとHUD（保有数）で識別できる。
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
        angle: player.angle, spinPhase: player.spinPhase || 0, hitFlash: player.hitFlash,
        hitFlashColor: player.hitFlashColor, hasRing: upLevel(player, 'rings') > 0 && stage.key !== 'rock',
        vx: player.vx, vy: player.vy,
        squashT: player.squashT, squashDur: player.squashDur, squashAmt: player.squashAmt, squashAngle: player.squashAngle,
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
