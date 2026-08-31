#!/usr/bin/env node
/* ============================================================
 * COSMIC EATER - simulate-pacing.js
 * ------------------------------------------------------------
 * 実際のブラウザを使わずに「質量獲得レート」を確率的に近似シミュレーションし、
 * 通常モード / 加速モードのクリアまでの所要時間を見積もるための開発用ツール。
 * ゲーム本体の実行には一切関与しない（README.md の "ペーシング調整" 節から参照）。
 *
 * モデル: 毎秒 ATTEMPT_RATE 回、プレイヤーは近傍の天体と接触を試みる。
 * 相手の質量は rollEnemyMass() と同じ分布でプレイヤー質量からロールする。
 *  - ratio(effMass/enemyMass) >= INSTAKILL_RATIO → 即吸収（killEnemy と同じ 55% を直接獲得）
 *  - それ以外（拮抗〜脅威）                        → CONTESTED_WIN_RATE の確率で撃破成功
 * 実機フィードバック対応（HPバーが機能していない・一撃死かほぼ無傷かの二択）で
 * 実際の戦闘（game.js の resolveCollision）を「即死/即吸収」と「相手の最大HPに対する
 * 割合ダメージで持久戦になる拮抗」の二区分に再設計し、INSTAKILL_RATIOを1.45→5へ
 * 引き上げた（豆粒級の格下＝質量比およそ0.2以下だけを一撃にする）。このシミュレータも
 * 同じ閾値に合わせ、以前「retreat（質量比0.69以下は離脱・質量獲得ゼロ）」としていた
 * 帯を含めて全て「拮抗」（根気よく当たれば通常は撃破できる＝CONTESTED_WIN_RATEの確率で
 * 成功）として扱う（実際の新戦闘は格上相手でも必ずいくらかは削れるため、離脱一択には
 * ならない）。CONTESTED_WIN_RATEは変更前とほぼ同じ全体ペーシング（通常61分/加速5.4分）
 * になるよう再較正した値。
 * 実行: node cosmic/tools/simulate-pacing.js
 * ============================================================ */
'use strict';

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STAGE_MASSES = [0, 60, 320, 1600, 8000, 38000, 170000, 1000000, 4200000, 13000000];
const STAGE_NAMES = ['岩石片', '小惑星', '準惑星', '惑星', '巨大ガス惑星', '褐色矮星', '恒星', '巨星', '中性子星', 'ブラックホール'];

const INSTAKILL_RATIO = 5;
const DIRECT_RATIO = 0.55;
const EFFICIENCY_AVG_BONUS = 0.18; // 質量転換効率アップグレード等の平均上乗せを大まかに織り込む
const ATTEMPT_RATE = 0.281;        // 1秒あたりの接触試行回数（実機フィードバックの実測値: 03:53で恒星Lv13到達 から逆算）
const CONTESTED_WIN_RATE = 0.66;   // 拮抗（旧・離脱帯を含む）を根気よく削り切って吸収できる確率
const ENEMY_MASS_CAP_MULT = 2.0;   // data.js の BALANCE.enemyMassCapMult と合わせる（実機フィードバック第2回で4→2に引き下げ）
// data.js の BALANCE.prey/even/threatMassMultRange, prey/evenChance と合わせる（サイズ分布の再設計）
const PREY_RANGE = [0.15, 0.65], EVEN_RANGE = [0.7, 1.3], THREAT_RANGE = [1.4, 2.0];
const PREY_CHANCE = 0.76, EVEN_CHANCE = 0.19;

function rollEnemyMassMult(rng) {
  const r = rng();
  if (r < PREY_CHANCE) return PREY_RANGE[0] + rng() * (PREY_RANGE[1] - PREY_RANGE[0]);
  if (r < PREY_CHANCE + EVEN_CHANCE) return EVEN_RANGE[0] + rng() * (EVEN_RANGE[1] - EVEN_RANGE[0]);
  return Math.min(ENEMY_MASS_CAP_MULT, THREAT_RANGE[0] + rng() * (THREAT_RANGE[1] - THREAT_RANGE[0]));
}

function simulate(multiplierFn, seed, maxSeconds) {
  const rng = mulberry32(seed);
  let mass = 1;
  let t = 0;
  const dt = 1; // 1秒刻み
  const reach = new Array(STAGE_MASSES.length).fill(null);
  let stageIdx = 0;
  while (t < maxSeconds && stageIdx < STAGE_MASSES.length - 1) {
    const massGainMultiplier = multiplierFn(stageIdx);
    // 1秒間に ATTEMPT_RATE 回の接触試行（端数は確率で1回追加）
    const attempts = Math.floor(ATTEMPT_RATE) + (rng() < (ATTEMPT_RATE % 1) ? 1 : 0);
    for (let i = 0; i < attempts; i++) {
      const mult = rollEnemyMassMult(rng);
      const enemyMass = Math.max(0.3, mass * mult);
      const ratio = mass / enemyMass;
      let gained = 0;
      if (ratio >= INSTAKILL_RATIO) {
        gained = enemyMass * DIRECT_RATIO;
      } else {
        // 拮抗〜脅威（旧・離脱帯を含む）: 根気よく当たり続ければ通常は撃破できる。
        if (rng() < CONTESTED_WIN_RATE) gained = enemyMass * DIRECT_RATIO;
      }
      if (gained > 0) mass += gained * (1 + EFFICIENCY_AVG_BONUS) * massGainMultiplier;
    }
    t += dt;
    while (stageIdx < STAGE_MASSES.length - 1 && mass >= STAGE_MASSES[stageIdx + 1]) {
      stageIdx++;
      if (reach[stageIdx] === null) reach[stageIdx] = t;
    }
  }
  return { reach, finalT: t, finalMass: mass, cleared: stageIdx >= STAGE_MASSES.length - 1 };
}

function summarize(label, multiplierFn, seeds, maxSeconds) {
  const results = seeds.map(s => simulate(multiplierFn, s, maxSeconds));
  const clearTimes = results.filter(r => r.cleared).map(r => r.finalT);
  const avgClear = clearTimes.length ? clearTimes.reduce((a, b) => a + b, 0) / clearTimes.length : null;
  console.log(`\n=== ${label} ===`);
  console.log(`  クリア到達: ${clearTimes.length}/${seeds.length} 試行`);
  if (avgClear !== null) {
    console.log(`  平均クリア時間: ${(avgClear / 60).toFixed(1)} 分 (${avgClear.toFixed(0)}秒)`);
  }
  // 各ステージ到達時間の平均（到達できた試行のみ）
  const avgReach = new Array(STAGE_MASSES.length).fill(null);
  for (let i = 1; i < STAGE_MASSES.length; i++) {
    const times = results.map(r => r.reach[i]).filter(v => v !== null);
    if (!times.length) continue;
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    avgReach[i] = avg;
    console.log(`    ${STAGE_NAMES[i].padEnd(8, '　')}: 平均 ${(avg / 60).toFixed(2)} 分 (${times.length}/${seeds.length})`);
  }
  // 中性子星「区間だけ」の所要時間（巨星到達 → 中性子星到達 と 中性子星到達 → クリアの2区間）
  const giantIdx = STAGE_NAMES.indexOf('巨星'), neutronIdx = STAGE_NAMES.indexOf('中性子星');
  if (avgReach[giantIdx] !== null && avgReach[neutronIdx] !== null) {
    console.log(`  >>> 中性子星区間（中性子星到達→クリア）= ${((avgReach[neutronIdx + 1] - avgReach[neutronIdx]) / 60).toFixed(2)} 分`);
  }
}

const NORMAL_STAGE_PACING_MULT = [0.3955, 0.11, 0.088, 0.066, 0.0564, 0.0476, 0.0367, 0.036, 0.029];
const FAST_MODE_SPEEDUP = 12.7;

const seeds = Array.from({ length: 200 }, (_, i) => i * 7919 + 13);
summarize('加速モード（お試し・通常モードと同じ比率で一律短縮）',
  (stageIdx) => NORMAL_STAGE_PACING_MULT[Math.min(stageIdx, NORMAL_STAGE_PACING_MULT.length - 1)] * FAST_MODE_SPEEDUP,
  seeds, 3600);
summarize('通常モード（段階別倍率）', (stageIdx) => NORMAL_STAGE_PACING_MULT[Math.min(stageIdx, NORMAL_STAGE_PACING_MULT.length - 1)], seeds, 8000);
