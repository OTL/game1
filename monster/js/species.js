// 種族データ：タイプ、相性、わざ、名前、そして「ゲノム」からの種族生成。
// ゲノムはシード 1 個から決まるので、同じシーズンなら誰が見ても同じモンスターになる。
(function (global) {
  'use strict';

  const TYPES = [
    { id: 'fire',   name: 'ほのお',   color: '#ff7a45', hue: 16  },
    { id: 'water',  name: 'みず',     color: '#4aa8ff', hue: 208 },
    { id: 'grass',  name: 'くさ',     color: '#5fd07a', hue: 132 },
    { id: 'elec',   name: 'でんき',   color: '#ffd43b', hue: 48  },
    { id: 'rock',   name: 'いわ',     color: '#c2a17a', hue: 32  },
    { id: 'sky',    name: 'ひこう',   color: '#9ec8ff', hue: 216 },
    { id: 'dark',   name: 'あく',     color: '#8f7ad6', hue: 268 },
    { id: 'fairy',  name: 'フェアリー', color: '#ff9ad5', hue: 328 }
  ];

  const TYPE_BY_ID = {};
  TYPES.forEach((t) => { TYPE_BY_ID[t.id] = t; });

  // こうげき側 → ぼうぎょ側 の倍率。書いていない組み合わせは 1 倍。
  const CHART = {
    fire:  { grass: 2, fairy: 2, water: 0.5, rock: 0.5 },
    water: { fire: 2, rock: 2, grass: 0.5, elec: 0.5 },
    grass: { water: 2, rock: 2, fire: 0.5, sky: 0.5 },
    elec:  { water: 2, sky: 2, grass: 0.5, elec: 0.5 },
    rock:  { fire: 2, sky: 2, grass: 0.5, water: 0.5 },
    sky:   { grass: 2, dark: 2, elec: 0.5, rock: 0.5 },
    dark:  { elec: 2, rock: 2, fairy: 0.5, dark: 0.5 },
    fairy: { dark: 2, grass: 2, fire: 0.5, elec: 0.5 }
  };

  // わざが相手の 2 タイプそれぞれに何倍か、を掛け合わせる
  function typeMultiplier(moveType, defTypes) {
    let m = 1;
    const row = CHART[moveType] || {};
    defTypes.forEach((t) => { m *= (row[t] !== undefined ? row[t] : 1); });
    return m;
  }

  function effectivenessText(m) {
    if (m >= 4) return 'こうかは ばつぐんだ！！';
    if (m > 1) return 'こうかは ばつぐんだ！';
    if (m === 0) return 'こうかが ないようだ…';
    if (m < 0.5) return 'こうかは いまひとつのようだ…';
    if (m < 1) return 'こうかは いまひとつだ…';
    return '';
  }

  // わざプール。power は威力、acc は命中率。
  const MOVES = {
    normal: [
      { name: 'たいあたり',   power: 40, acc: 1.0 },
      { name: 'ずつき',       power: 55, acc: 0.95 },
      { name: 'とっしん',     power: 75, acc: 0.9, recoil: 0.25 },
      { name: 'すてみタックル', power: 95, acc: 0.85, recoil: 0.33 }
    ],
    fire:  [
      { name: 'ひのこ',       power: 45, acc: 1.0 },
      { name: 'かえんほうしゃ', power: 70, acc: 0.95 },
      { name: 'だいもんじ',   power: 95, acc: 0.8 }
    ],
    water: [
      { name: 'みずでっぽう', power: 45, acc: 1.0 },
      { name: 'なみのり',     power: 70, acc: 0.95 },
      { name: 'ハイドロポンプ', power: 100, acc: 0.75 }
    ],
    grass: [
      { name: 'はっぱカッター', power: 45, acc: 1.0 },
      { name: 'タネマシンガン', power: 65, acc: 0.95 },
      { name: 'ソーラービーム', power: 100, acc: 0.8 }
    ],
    elec:  [
      { name: 'でんきショック', power: 45, acc: 1.0 },
      { name: '１０まんボルト', power: 72, acc: 0.95 },
      { name: 'かみなり',     power: 100, acc: 0.7 }
    ],
    rock:  [
      { name: 'いわおとし',   power: 50, acc: 0.95 },
      { name: 'いわなだれ',   power: 72, acc: 0.9 },
      { name: 'ストーンエッジ', power: 95, acc: 0.75, crit: 0.25 }
    ],
    sky:   [
      { name: 'つばさでうつ', power: 48, acc: 1.0 },
      { name: 'エアスラッシュ', power: 68, acc: 0.95 },
      { name: 'ブレイブバード', power: 95, acc: 0.9, recoil: 0.33 }
    ],
    dark:  [
      { name: 'かみつく',     power: 48, acc: 1.0 },
      { name: 'あくのはどう', power: 70, acc: 0.95 },
      { name: 'ふいうち',     power: 90, acc: 0.85, crit: 0.2 }
    ],
    fairy: [
      { name: 'ようせいのかぜ', power: 45, acc: 1.0 },
      { name: 'マジカルシャイン', power: 70, acc: 0.95 },
      { name: 'ムーンフォース', power: 92, acc: 0.85 }
    ]
  };

  // 名前生成：カタカナの音節をつないで、それっぽい名前にする
  const HEAD = ['ピ', 'モ', 'ク', 'リ', 'ゾ', 'ガ', 'メ', 'ヒ', 'ヤ', 'ル', 'ネ', 'ボ', 'チ', 'サ', 'ド', 'ウ', 'フ', 'ボ', 'ボ', 'テ'];
  const MID  = ['ル', 'ラ', 'ミ', 'ポ', 'ケ', 'ズ', 'ノ', 'コ', 'ワ', 'ジ', 'デ', 'ム', 'ペ', 'シ', 'ト', 'バ', 'ヨ', 'ギ'];
  const TAIL = ['ン', 'ス', 'ト', 'ラ', 'ム', 'ク', 'リ', 'ザ', 'ド', 'ピ', 'モ', 'フ', 'ゴ', 'キ'];

  function makeName(rng, stage) {
    let n = rng.pick(HEAD) + rng.pick(MID);
    if (stage >= 2 || rng.chance(0.5)) n += rng.pick(MID);
    n += rng.pick(TAIL);
    if (stage >= 3 && rng.chance(0.45)) n += rng.pick(TAIL);
    return n;
  }

  const BODY_PLANS = ['blob', 'beast', 'biped', 'wing', 'serpent', 'bug'];
  const CATEGORIES = {
    blob:    ['まんまる', 'ぷにぷに', 'おだんご'],
    beast:   ['けもの', 'よつあし', 'こじゅう'],
    biped:   ['にそくほこう', 'こわっぱ', 'ちいさなせんし'],
    wing:    ['つばさ', 'そらとび', 'はばたき'],
    serpent: ['へび', 'ながむし', 'とぐろ'],
    bug:     ['むし', 'ろっぽん', 'かぶと']
  };

  // 進化の分岐：最終形は「いちばん伸ばしたステータス」で変わる
  const BRANCHES = [
    { id: 'atk', name: 'ちからがた', label: 'こうげき',  suffix: 'ガイ' },
    { id: 'def', name: 'まもりがた', label: 'ぼうぎょ',  suffix: 'ゴン' },
    { id: 'spd', name: 'はやさがた', label: 'すばやさ',  suffix: 'リュウ' },
    { id: 'hp',  name: 'たいりょくがた', label: 'たいりょく', suffix: 'ドン' }
  ];

  // ゲノム：1 つのシードから、そのモンスターの一生ぶんの設計図を作る
  function makeGenome(seed) {
    const rng = Rng.makeRng('genome:' + seed);
    const t1 = rng.pick(TYPES);
    let t2 = null;
    if (rng.chance(0.45)) {
      const rest = TYPES.filter((t) => t.id !== t1.id);
      t2 = rng.pick(rest);
    }
    const plan = rng.pick(BODY_PLANS);

    // 種族値（合計はだいたい一定になるように配分）
    const weights = [rng() + 0.4, rng() + 0.4, rng() + 0.4, rng() + 0.4];
    const sum = weights.reduce((a, b) => a + b, 0);
    const total = 200;
    const base = {
      hp:  Math.round(28 + (weights[0] / sum) * total),
      atk: Math.round(14 + (weights[1] / sum) * total),
      def: Math.round(14 + (weights[2] / sum) * total),
      spd: Math.round(14 + (weights[3] / sum) * total)
    };

    // 見ため（スプライト）用のパラメータ
    const look = {
      plan: plan,
      hue: t1.hue + rng.int(-16, 16),
      hue2: (t2 ? t2.hue : t1.hue + rng.int(90, 180)) + rng.int(-12, 12),
      sat: rng.int(52, 78),
      light: rng.int(50, 62),
      earType: rng.int(0, 4),      // 0 なし / 1 まるみみ / 2 とがりみみ / 3 つの / 4 しょっかく
      tailType: rng.int(0, 4),
      eyeType: rng.int(0, 3),
      wing: plan === 'wing' ? 1 : (rng.chance(0.22) ? 1 : 0),
      belly: rng.chance(0.7) ? 1 : 0,
      spots: rng.int(0, 3),
      chubby: rng() * 0.5 + 0.8,
      headBig: rng() * 0.35 + 0.85,
      cheek: rng.chance(0.5) ? 1 : 0,
      eggPattern: rng.int(0, 3),
      eggHue: rng.int(0, 359)
    };

    const names = [
      null,
      makeName(Rng.makeRng('n1:' + seed), 1),
      makeName(Rng.makeRng('n2:' + seed), 2),
      null // 最終形は分岐ごとに決める
    ];
    const finalNames = {};
    BRANCHES.forEach((b) => {
      const r = Rng.makeRng('n3:' + b.id + ':' + seed);
      finalNames[b.id] = makeName(r, 3);
    });

    return {
      seed: seed,
      types: t2 ? [t1.id, t2.id] : [t1.id],
      base: base,
      look: look,
      names: names,
      finalNames: finalNames,
      category: rng.pick(CATEGORIES[plan]),
      shiny: Rng.makeRng('shiny:' + seed)() < 0.05
    };
  }

  // ステージと分岐から、いまの姿の名前を返す
  function nameFor(genome, stage, branchId) {
    if (stage <= 0) return 'タマゴ';
    if (stage === 1) return genome.names[1];
    if (stage === 2) return genome.names[2];
    return genome.finalNames[branchId] || genome.finalNames.atk;
  }

  // ステージ・分岐に応じて見ためを少しずつ変える
  function lookFor(genome, stage, branchId) {
    const l = Object.assign({}, genome.look);
    l.stage = stage;
    l.branch = branchId;
    if (stage >= 3) {
      if (branchId === 'atk') { l.horn = 1; l.chubby *= 1.05; }
      if (branchId === 'def') { l.armor = 1; l.chubby *= 1.2; }
      if (branchId === 'spd') { l.slim = 1; l.chubby *= 0.82; l.wing = 1; }
      if (branchId === 'hp')  { l.chubby *= 1.3; }
    }
    if (genome.shiny) { l.hue = (l.hue + 150) % 360; l.sat = Math.min(92, l.sat + 18); }
    return l;
  }

  // わざ構成：ノーマル 1 個＋自分のタイプのわざを、レベルに応じて強いものから
  function movesFor(genome, level) {
    const pool = [];
    const tier = level < 12 ? 0 : (level < 26 ? 1 : 2);
    genome.types.forEach((t) => {
      const list = MOVES[t];
      pool.push(list[Math.min(tier, list.length - 1)]);
      if (tier > 0) pool.push(list[Math.max(0, tier - 1)]);
    });
    pool.push(MOVES.normal[Math.min(tier + (level >= 34 ? 1 : 0), MOVES.normal.length - 1)]);
    const typed = [];
    genome.types.forEach((t) => { typed.push(t); typed.push(t); });
    typed.push('normal');
    const out = [];
    const seen = {};
    for (let i = 0; i < pool.length && out.length < 4; i++) {
      if (seen[pool[i].name]) continue;
      seen[pool[i].name] = true;
      out.push(Object.assign({ type: typed[i] || 'normal' }, pool[i]));
    }
    return out;
  }

  global.Species = {
    TYPES, TYPE_BY_ID, MOVES, BRANCHES,
    typeMultiplier, effectivenessText,
    makeGenome, nameFor, lookFor, movesFor, makeName
  };
})(window);
