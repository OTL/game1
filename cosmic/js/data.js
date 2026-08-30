/* ============================================================
   COSMIC EATER - data.js
   進化段階・アップグレード・敵種別などの静的データ定義
   ============================================================ */
'use strict';

/* ---------- 進化段階 ----------
 * mass: この質量に到達したら進化する（0番目は初期状態）
 * name / desc: 表示名と説明
 * color: そのステージのテーマカラー（UI用）
 * radiusBase: 見た目上の基準半径係数
 * worldScale: 敵の質量レンジやワールドの広がりの係数
 * kind: 描画方式の種別
 */
const STAGES = [
  { key: 'rock',      name: '岩石片',       desc: '宇宙を漂う小さな岩のかけら。',           mass: 0,        color: '#9a8f7d', radiusBase: 9,   worldScale: 1,      kind: 'rock',    maxHp: 30,  camZoom: 1.0 },
  { key: 'asteroid',  name: '小惑星',       desc: 'いくつもの岩が集まり形を成した。',       mass: 60,       color: '#a99a7f', radiusBase: 13,  worldScale: 2.2,    kind: 'rock',    maxHp: 55,  camZoom: 0.92 },
  { key: 'dwarf',     name: '準惑星',       desc: '重力で丸くなり始めた小さな星。',         mass: 320,      color: '#b48a63', radiusBase: 19,  worldScale: 5,      kind: 'dwarf',   maxHp: 95,  camZoom: 0.84 },
  { key: 'planet',    name: '惑星',         desc: '大気と地形を持つ一人前の星。',           mass: 1600,     color: '#4f8fd1', radiusBase: 27,  worldScale: 11,     kind: 'planet',  maxHp: 160, camZoom: 0.76 },
  { key: 'gasgiant',  name: '巨大ガス惑星', desc: '渦巻くガスの縞模様をまとう巨大な星。',   mass: 8000,     color: '#d9a35c', radiusBase: 38,  worldScale: 24,     kind: 'gasgiant',maxHp: 280, camZoom: 0.68 },
  { key: 'browndwarf',name: '褐色矮星',     desc: '恒星になり損ねた、燻る赤い星。',         mass: 38000,    color: '#c9573f', radiusBase: 50,  worldScale: 55,     kind: 'browndwarf',maxHp:480, camZoom: 0.6 },
  { key: 'star',      name: '恒星',         desc: '自ら光を放つ、灼熱の炎の球。',           mass: 170000,   color: '#ffd15c', radiusBase: 62,  worldScale: 120,    kind: 'star',    maxHp: 820, camZoom: 0.52 },
  { key: 'giant',     name: '巨星',         desc: '膨張しきった、老いた巨大な星。',         mass: 750000,   color: '#ff7a45', radiusBase: 80,  worldScale: 260,    kind: 'giant',   maxHp: 1400,camZoom: 0.44 },
  { key: 'neutron',   name: '中性子星',     desc: '崩壊した芯が放つ、極小で強烈な光。',     mass: 3200000,  color: '#bfe3ff', radiusBase: 34,  worldScale: 560,    kind: 'neutron', maxHp: 2400,camZoom: 0.4 },
  { key: 'blackhole', name: 'ブラックホール', desc: 'すべてを飲み込む、時空の果て。',       mass: 13000000, color: '#9b6bff', radiusBase: 46,  worldScale: 1200,   kind: 'blackhole', maxHp: 4000, camZoom: 0.36, isFinal: true },
];

function stageIndexForMass(mass) {
  let idx = 0;
  for (let i = 0; i < STAGES.length; i++) {
    if (mass >= STAGES[i].mass) idx = i; else break;
  }
  return idx;
}

/* ---------- アップグレード ----------
 * rarity: common / rare / epic
 * maxLv: 重複取得できる最大レベル
 * minStage: このステージ番号以上で出現（省略時0）
 * effect(state, lv): レベルに応じた効果量を返すヘルパーは各所で個別参照
 */
const UPGRADES = [
  { id: 'lava',       name: '溶岩惑星',       icon: '🌋', rarity: 'rare',   maxLv: 3,
    desc: v => `与えたダメージの${v}%を自分の質量に変換する。`,
    vals: [15, 25, 35] },
  { id: 'rings',       name: '惑星環',         icon: '💫', rarity: 'common', maxLv: 5,
    desc: v => `惑星環が衝撃を増幅し、接触時の与ダメージ +${v}%。`,
    vals: [10, 20, 30, 40, 50] },
  { id: 'veins',       name: '希少鉱脈',       icon: '💎', rarity: 'common', maxLv: 5,
    desc: v => `${v}秒ごとに自動で質量を獲得する。`,
    vals: [4.0, 3.4, 2.9, 2.5, 2.2] },
  { id: 'gravity',     name: '重力場強化',     icon: '🌀', rarity: 'common', maxLv: 5,
    desc: v => `破片・小天体を引き寄せる範囲が +${v}%。`,
    vals: [25, 50, 80, 115, 160] },
  { id: 'crust',       name: '硬質地殻',       icon: '🛡️', rarity: 'common', maxLv: 5,
    desc: v => `被ダメージを ${v}% 軽減する。`,
    vals: [8, 15, 22, 28, 34] },
  { id: 'moon',        name: '衛星',           icon: '🌙', rarity: 'rare',   maxLv: 3,
    desc: v => `周回する衛星が${v}体、触れた敵にダメージを与える。`,
    vals: [1, 2, 3] },
  { id: 'magnetic',    name: '磁場収束',       icon: '🧲', rarity: 'common', maxLv: 4,
    desc: v => `吸引速度が +${v}% 上昇する。`,
    vals: [30, 60, 95, 140] },
  { id: 'aurora',      name: 'オーロラ帯',     icon: '🌈', rarity: 'rare',   maxLv: 3,
    desc: v => `周期的に周囲の敵へ${v}のダメージを与える波動を放つ。`,
    vals: [8, 16, 28] },
  { id: 'thrust',      name: '推進機関',       icon: '🚀', rarity: 'common', maxLv: 5,
    desc: v => `移動速度と加速が +${v}% 上昇する。`,
    vals: [10, 20, 30, 40, 50] },
  { id: 'regen',       name: '地殻再生',       icon: '💗', rarity: 'common', maxLv: 5,
    desc: v => `毎秒 最大HPの${v}% を自動回復する。`,
    vals: [0.6, 1.2, 1.9, 2.6, 3.4] },
  { id: 'critical',    name: '核融合暴走',     icon: '💥', rarity: 'rare',   maxLv: 3,
    desc: v => `${v}%の確率で衝突ダメージが2.2倍になる（会心）。`,
    vals: [12, 20, 28] },
  { id: 'density',     name: '密度増加',       icon: '⚛️', rarity: 'common', maxLv: 5,
    desc: v => `最大HPが +${v}% 増加する。`,
    vals: [12, 24, 36, 48, 60] },
  { id: 'tail',        name: '彗星の尾',       icon: '☄️', rarity: 'common', maxLv: 3,
    desc: v => `移動軌跡が敵に触れると${v}のダメージ。`,
    vals: [6, 12, 20] },
  { id: 'shield',      name: '隕石シールド',   icon: '🪨', rarity: 'rare',   maxLv: 3,
    desc: v => `${v}%の確率で被ダメージを完全に無効化する。`,
    vals: [10, 18, 26] },
  { id: 'ramspeed',    name: '加速衝突',       icon: '⚡', rarity: 'common', maxLv: 4,
    desc: v => `移動速度が最大速度に近いほど衝突ダメージが上昇（最大 +${v}%）。自機に加速光が灯る。`,
    vals: [20, 40, 65, 95] },
  { id: 'efficiency',  name: '質量転換効率',   icon: '♻️', rarity: 'common', maxLv: 5,
    desc: v => `吸収する質量が +${v}% 増加する。`,
    vals: [8, 16, 25, 34, 44] },
  { id: 'sense',       name: '重力感知',       icon: '📡', rarity: 'common', maxLv: 3,
    desc: v => `対象ロックオンの範囲が +${v}% 拡大し、画面外の強大な敵を警戒表示する。`,
    vals: [30, 60, 100] },
  { id: 'stormfield',  name: '磁気嵐',         icon: '🌪️', rarity: 'rare',   maxLv: 3,
    desc: v => `周期的に周囲の弱い敵を吹き飛ばし${v}のダメージ。`,
    vals: [10, 18, 28] },
  { id: 'flare',       name: '太陽フレア',     icon: '🔥', rarity: 'epic', maxLv: 3, minStage: 6,
    desc: v => `恒星の力で周期的に進行方向へ扇状の炎を放ち${v}のダメージ。`,
    vals: [40, 70, 110] },
  { id: 'cme',         name: 'コロナ質量放出', icon: '🌟', rarity: 'epic', maxLv: 3, minStage: 6,
    desc: v => `進行方向へ高エネルギー粒子を放出し${v}のダメージ。`,
    vals: [35, 60, 95] },
  { id: 'gwave',       name: '重力波',         icon: '🌌', rarity: 'epic', maxLv: 3, minStage: 8,
    desc: v => `周囲の敵と破片を引き寄せる重力の強さ・範囲が +${v}%。`,
    vals: [60, 100, 150] },
  { id: 'binary',      name: '伴星',           icon: '✨', rarity: 'epic', maxLv: 2,
    desc: v => `伴星が浮遊し、触れた敵に${v}のダメージ、周囲の敵を弱く引き寄せる。`,
    vals: [30, 55] },
  { id: 'revive',      name: '不死の芯',       icon: '🕊️', rarity: 'epic', maxLv: 1,
    desc: () => `一度だけ、HPが0になっても半分のHPで復活する。`,
    vals: [1] },
];

/* ---------- 敵種別 ---------- */
const ENEMY_KINDS = ['asteroid', 'comet', 'planet', 'hostile'];

const BALANCE = {
  startMass: 1,
  startHp: 30,
  moveAccel: 620,          // px/s^2 プレイヤー加速度
  moveMaxSpeed: 230,       // px/s プレイヤー最大速度
  friction: 0.90,
  worldRadiusMult: 8,      // カメラ半径に対する敵スポーン距離倍率
  enemyDensity: 1,
  fragmentAbsorbRange: 90,
  fragmentAbsorbSpeed: 260,
  // レベルアップに必要な質量倍率は levelUpGrowthFor() でレベルに応じて逓増させる
  levelUpGrowthBase: 1.9,  // レベル1での倍率
  levelUpGrowthStep: 0.11, // レベルが上がるごとの倍率の増分
  levelUpGrowthMax: 3.6,   // 倍率の上限（終盤の頭打ち）
  autosaveInterval: 6,     // 秒

  // ---- 実機フィードバック対応: 個体数・サイズの上限 ----
  maxEnemies: 20,           // ワールド内に同時に存在できる敵の総数上限
  maxFragments: 40,         // ワールド内の破片（吸収可能な質量粒）総数上限
  maxTotalBodies: 55,       // 敵+破片の合計上限。超過分は遠方から間引く
  nearViewSoftCap: 13,      // プレイヤー近傍（スポーン圏内側）に同時に居てよい敵の目安上限
  enemyMassCapMult: 2.0,    // 敵1体の質量はプレイヤー質量のこの倍率を超えない（分裂連鎖・肥大化の防止）

  // ---- 実機フィードバック対応（第2回）: サイズ分布の再設計 ----
  // 目標分布: 7〜8割は自分より小さい「餌」、2割前後は同格〜やや大きい、
  // 明確に自分より大きい「脅威」は近傍に同時1〜2体まで。
  preyMassMultRange: [0.15, 0.65],   // 餌（小さい）: 質量倍率レンジ
  evenMassMultRange: [0.7, 1.3],     // 拮抗（同格〜やや大きい）: 質量倍率レンジ
  threatMassMultRange: [1.4, 2.0],   // 脅威（明確に大きい）: 質量倍率レンジ（enemyMassCapMultで最終クランプ）
  preyChance: 0.76,                  // 餌が出現する確率
  evenChance: 0.19,                  // 拮抗が出現する確率（残り≒0.05が脅威）
  threatRatioThreshold: 1.3,         // これ以上の質量比を「脅威」個体として数える閾値
  maxThreatsNear: 2,                 // プレイヤー近傍に同時に存在してよい「脅威」個体数の上限
  // 敵のスポーン基準質量（log空間）がプレイヤー質量に追従するまでの時定数（秒）。
  // 進化直後に敵が一斉に強くなる体感を防ぐため、緩やかに遅れて追いつかせる。
  // 実機テストで時定数を大きくしすぎると（質量は指数的に増え続けるため）終盤の
  // 急成長期に敵が常に置き去りになり「脅威が一切出現しない」まで緊張感が失われる
  // ことを確認したため、あくまで軽い平滑化に留める短めの値にしている。
  enemyScaleLagSeconds: 3,
  maxEnemyScreenFrac: 0.4,           // 近傍の敵1体が画面短辺に対して占めてよい直径の割合の上限

  // ---- ダメージ数値・MISS表示のスパム対策 ----
  floatFlushInterval: 0.35, // この秒数ごとに同一対象への連続ヒットを合算して1回だけ表示する
  missFlushInterval: 0.5,   // MISS表示の最小間隔

  // ---- 捕獲メカニクス（惑星以上で解放） ----
  captureMassRatio: 0.35,   // 対象の質量がプレイヤー質量のこの割合以下なら捕獲可能
  captureRangeMin: 260,     // 捕獲可能距離の下限（世界座標）
  captureRangeMult: 9,      // プレイヤー半径に対する捕獲可能距離の係数
};

/* レベルアップに必要な質量倍率（レベルが進むほど急になる指数カーブ）。 */
function levelUpGrowthFor(level) {
  return Math.min(BALANCE.levelUpGrowthMax, BALANCE.levelUpGrowthBase + Math.max(1, level) * BALANCE.levelUpGrowthStep);
}

/* ---------- ゲームモード ----------
 * 通常モード: クリアまで約60分を狙ったペース。獲得質量に massGainMultiplier を掛けて
 * 相対成長率（1秒あたり質量が何%増えるか）を下げることで、進化しきい値・レベルカーブは
 * そのままに全体の所要時間だけを引き伸ばす。
 * 加速モード（お試し）: 従来の速いペース（実機フィードバックで指摘された「03:53で恒星Lv13」
 * 相当の速度）をそのまま残し、短時間で最後まで試したいプレイヤー向けに選択可能にする。
 * ※ 値は node scripts/simulate-pacing.js による実測シミュレーションで調整済み
 *   （詳細は README.md 参照）。 */
const GAME_MODES = {
  normal: { id: 'normal', label: '通常モード' },
  fast:   { id: 'fast',   label: '加速モード（お試し）' },
};
function gameModeOrDefault(id) { return GAME_MODES[id] ? id : 'normal'; }

/* 通常モードの進化段階ごとの質量獲得倍率。序盤（岩石片〜準惑星）は比較的高い倍率で
 * 数分単位のテンポを保ちつつ、後半（恒星以降）は倍率を下げて1段階 8〜10分程度まで
 * 引き伸ばす。cosmic/tools/simulate-pacing.js による実測シミュレーションで
 * 合計クリア時間が約60分になるよう調整済み（詳細はREADME参照）。 */
const NORMAL_STAGE_PACING_MULT = [0.3955, 0.11, 0.088, 0.066, 0.0564, 0.0476, 0.0367, 0.0345, 0.0367];
function massGainMultiplierFor(modeId, stageIdx) {
  if (modeId === 'fast') return 1.0;
  const arr = NORMAL_STAGE_PACING_MULT;
  return arr[Math.min(Math.max(0, stageIdx), arr.length - 1)];
}

/* ---------- 捕獲（衛星化）----------
 * 進化段階が「惑星」(index 3) 以上になったら解放。保有できる捕獲数は進化段階に応じて増える。 */
function captureUnlockedFor(stageIdx) { return stageIdx >= 3; }
function captureCapacityFor(stageIdx) {
  if (stageIdx < 3) return 0;
  if (stageIdx <= 4) return 1;   // 惑星・巨大ガス惑星
  if (stageIdx === 5) return 2;  // 褐色矮星
  if (stageIdx === 6) return 3;  // 恒星
  if (stageIdx === 7) return 4;  // 巨星
  if (stageIdx === 8) return 5;  // 中性子星
  return 6;                      // ブラックホール
}
