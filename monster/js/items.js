// アイテム。ふたつの系統がある。
//
//   ■ どうぐ（つかえるアイテム）
//     おせわの手数を まとめて買いもどすもの。数は少なく、効きめは はっきり。
//     ケアミスを返上する系は いちばん出にくい ―― ここが ゆるいと、この game の
//     「無視した回数で死ぬ」という背骨が 折れてしまうから。
//
//   ■ コレクション（あつめるアイテム）
//     500 種類。強さには 1 ミリも効かない。ただ あつまる。
//     10 の カテゴリ × 接頭 10 × 名詞 5 の 組み合わせで、名前も 見ためも
//     id から 決定的に決まる。画像ファイルは 1 枚も使わず、その場で描く。
//
//   袋の中身は 代をまたいで 残る（そのコのものではなく、あなたのもの）。
//   消えるのは ずかんの「ぜんぶ消して やりなおす」のときだけ。
(function (global) {
  'use strict';

  const BAG_KEY = 'monster.bag.v1';

  // ── レアリティ ───────────────────────────────────────
  const RARITY = [
    { key: 'common', name: 'ふつう',     color: '#8f9ec9' },
    { key: 'uncom',  name: 'めずらしい', color: '#5fd07a' },
    { key: 'rare',   name: 'レア',       color: '#4dd0ff' },
    { key: 'legend', name: 'でんせつ',   color: '#ffcc4d' }
  ];
  // 接頭辞の並び順が そのまま レアリティになる（下にいくほど ありえない言葉）
  const RARITY_OF_PREFIX = [0, 0, 0, 0, 1, 1, 1, 2, 2, 3];

  // ── コレクション 500 種 ──────────────────────────────
  // 接頭 10 × 名詞 5 ＝ カテゴリごとに 50 種。それが 10 カテゴリ。
  const CATS = [
    {
      key: 'stone', name: 'いし', emoji: '🪨', hue: 32,
      nouns: ['こいし', 'けっしょう', 'いわのかけら', 'すなつぶ', 'たま'],
      prefixes: ['まるい', 'ざらざらの', 'ひらたい', 'つめたい', 'よぞらいろの',
                 'きらめく', 'にじいろの', 'ひかりを のむ', 'ほしを やどした', 'でんせつの']
    },
    {
      key: 'leaf', name: 'はっぱ', emoji: '🌿', hue: 118,
      nouns: ['はっぱ', 'わかば', 'おちば', 'しだのは', 'つた'],
      prefixes: ['いろづいた', 'まるまった', 'あなの あいた', 'つゆに ぬれた', 'かおる',
                 'きんいろの', 'ささやく', 'ときを とめる', 'ほしを うつす', 'せかいじゅの']
    },
    {
      key: 'flower', name: 'はな', emoji: '🌸', hue: 330,
      nouns: ['はな', 'つぼみ', 'かふん', 'はなびら', 'はなかんむり'],
      prefixes: ['ちいさな', 'しろい', 'ゆうぐれの', 'あまい', 'つきよの',
                 'ゆめみる', 'うたう', 'きえない', 'ほしぞらの', 'えいえんの']
    },
    {
      key: 'fruit', name: 'きのみ', emoji: '🍇', hue: 350,
      nouns: ['きのみ', 'たね', 'まめ', 'みつ', 'くだもの'],
      prefixes: ['あまい', 'すっぱい', 'ほろにがい', 'まっかな', 'ぴりっとした',
                 'ほしがたの', 'とろける', 'ゆめの', 'にじの', 'でんせつの']
    },
    {
      key: 'shell', name: 'うみ', emoji: '🐚', hue: 196,
      nouns: ['かい', 'さんご', 'しんじゅ', 'ひとで', 'ながれもの'],
      prefixes: ['しろい', 'うずまきの', 'みずいろの', 'しおの かおりの', 'つきの しずくの',
                 'うたう', 'ふかうみの', 'ときの ながれの', 'りゅうぐうの', 'でんせつの']
    },
    {
      key: 'feather', name: 'はね', emoji: '🪶', hue: 210,
      nouns: ['はね', 'うもう', 'ぬけがら', 'す', 'かざきり'],
      prefixes: ['やわらかい', 'しましまの', 'あさひいろの', 'ふわふわの', 'かぜを よぶ',
                 'ぎんいろの', 'そらを きる', 'くもを ぬう', 'ほしを はこぶ', 'でんせつの']
    },
    {
      key: 'star', name: 'そら', emoji: '✨', hue: 48,
      nouns: ['かけら', 'ひかり', 'しずく', 'つぶ', 'かがみ'],
      prefixes: ['ながれぼしの', 'つきの', 'たいようの', 'あけぼのの', 'きたかぜの',
                 'オーロラの', 'にじの', 'ぎんがの', 'ときの', 'そらの はての']
    },
    {
      key: 'toy', name: 'おもちゃ', emoji: '🧸', hue: 14,
      nouns: ['ボール', 'こま', 'つみき', 'ぬいぐるみ', 'ふうせん'],
      prefixes: ['すりきれた', 'いろあせた', 'てづくりの', 'ちいさな', 'ぴかぴかの',
                 'おとの なる', 'ふしぎな', 'ぜんまいじかけの', 'まほうの', 'でんせつの']
    },
    {
      key: 'relic', name: 'むかしのもの', emoji: '🏺', hue: 40,
      nouns: ['かけら', 'かぎ', 'コイン', 'つぼ', 'ちず'],
      prefixes: ['さびた', 'ほこりっぽい', 'いしの', 'どうの', 'ぎんの',
                 'きんの', 'もじの ほられた', 'わすれられた', 'おうの', 'でんせつの']
    },
    {
      key: 'mystery', name: 'ふしぎ', emoji: '🔮', hue: 268,
      nouns: ['すいしょうだま', 'ビン', 'おふだ', 'ランプ', 'とけい'],
      prefixes: ['くもった', 'ゆらめく', 'あおく ひかる', 'ささやく', 'ゆめを みせる',
                 'とけない', 'うらがえしの', 'ときの とまった', 'ほしを とじこめた', 'でんせつの']
    }
  ];

  // 色の名前が 入っている接頭辞は、その色で 描く。
  // 「しろい かい」が むらさきに 光っていたら、さすがに うそなので。
  const TINT = {
    'しろい':        { h: 208, s: 10, l: 84 },
    'まっかな':      { h: 2,   s: 74, l: 56 },
    'きんいろの':    { h: 45,  s: 74, l: 58 },
    'ぎんいろの':    { h: 210, s: 8,  l: 74 },
    'みずいろの':    { h: 192, s: 62, l: 68 },
    'あおく ひかる': { h: 214, s: 72, l: 60 },
    'よぞらいろの':  { h: 234, s: 46, l: 48 },
    'あさひいろの':  { h: 22,  s: 78, l: 62 },
    'いろあせた':    { s: 14,  l: 62 },
    'すりきれた':    { s: 22,  l: 52 },
    'くもった':      { s: 16,  l: 62 },
    'さびた':        { h: 18,  s: 40, l: 44 },
    'ほこりっぽい':  { s: 16,  l: 56 },
    'いしの':        { h: 30,  s: 12, l: 56 },
    'どうの':        { h: 24,  s: 46, l: 48 },
    'ぎんの':        { h: 210, s: 8,  l: 74 },
    'きんの':        { h: 45,  s: 74, l: 58 },
    'つめたい':      { h: 196, s: 40, l: 72 },
    'ほしがたの':    { h: 48,  s: 76, l: 62 }
  };

  const COLLECTIBLES = [];
  const COLLECT_BY_ID = {};
  const BY_CAT = {};
  CATS.forEach((c) => {
    BY_CAT[c.key] = [];
    c.prefixes.forEach((pf, pi) => {
      c.nouns.forEach((nn, ni) => {
        const it = {
          id: c.key + '-' + pi + '-' + ni,
          cat: c.key,
          catName: c.name,
          catEmoji: c.emoji,
          name: pf + ' ' + nn,
          rarity: RARITY_OF_PREFIX[pi],
          pi: pi,
          ni: ni,
          hue: (c.hue + ni * 47 + pi * 13) % 360,
          tint: TINT[pf] || null
        };
        COLLECTIBLES.push(it);
        COLLECT_BY_ID[it.id] = it;
        BY_CAT[c.key].push(it);
      });
    });
  });
  const TOTAL = COLLECTIBLES.length;   // ＝ 500

  const BY_RARITY = [[], [], [], []];
  COLLECTIBLES.forEach((it) => BY_RARITY[it.rarity].push(it));

  // ── どうぐ（つかえるアイテム）────────────────────────
  // rarity は「出やすさ」。3（でんせつ）は ほとんど 出ない。
  function cl(v) { return World.clamp(v, 0, 100); }

  const USABLE = [
    {
      id: 'feast', name: 'ごちそう', emoji: '🍖', rarity: 0,
      desc: 'まんぷく +45 ／ きげん +6',
      apply: function (w) {
        const p = w.state;
        p.care.food = cl(p.care.food + 45);
        p.care.mood = cl(p.care.mood + 6);
        p.exp += 10;
        return { text: 'おなかいっぱいに なった！', burst: '🍖' };
      }
    },
    {
      id: 'salad', name: 'やくそうサラダ', emoji: '🥗', rarity: 0,
      desc: 'まんぷく +22 ／ せいけつ +12',
      apply: function (w) {
        const p = w.state;
        p.care.food = cl(p.care.food + 22);
        p.care.clean = cl(p.care.clean + 12);
        p.exp += 6;
        return { text: 'からだの なかから きれいに なった', burst: '🥗' };
      }
    },
    {
      id: 'ball', name: 'ふわふわボール', emoji: '🧶', rarity: 0,
      desc: 'きげん +38 ／ げんき −4',
      apply: function (w) {
        const p = w.state;
        p.care.mood = cl(p.care.mood + 38);
        p.care.energy = cl(p.care.energy - 4);
        p.exp += 9;
        return { text: 'とびはねて あそんでいる！', burst: '🧶' };
      }
    },
    {
      id: 'soap', name: 'あわあわソープ', emoji: '🧴', rarity: 0,
      desc: 'せいけつが いっきに 100',
      apply: function (w) {
        w.state.care.clean = 100;
        w.state.exp += 7;
        return { text: 'ピカピカに なった！', burst: '🫧' };
      }
    },
    {
      id: 'tea', name: 'ぽかぽかティー', emoji: '☕', rarity: 0,
      desc: 'げんき +36',
      apply: function (w) {
        const p = w.state;
        p.care.energy = cl(p.care.energy + 36);
        p.exp += 6;
        return { text: 'ほっと ひといき ついた', burst: '☕' };
      }
    },
    {
      id: 'pillow', name: 'ゆめみまくら', emoji: '🛌', rarity: 1,
      desc: 'げんきが いっきに 100 ／ まんぷく −8',
      apply: function (w) {
        const p = w.state;
        p.care.energy = 100;
        p.care.food = cl(p.care.food - 8);
        p.exp += 8;
        return { text: 'ぐっすり ねむった。げんきまんたん！', burst: '💤' };
      }
    },
    {
      id: 'candy', name: 'けいけんの アメ', emoji: '🍬', rarity: 1,
      desc: 'けいけんち +70',
      apply: function (w) {
        w.state.exp += 70;
        return { text: 'けいけんちが +70！', burst: '⭐' };
      }
    },
    {
      id: 'drink', name: 'とっくんドリンク', emoji: '🥤', rarity: 1,
      desc: 'いちばん のばしている とっくんが +6（げんきは へらない）',
      apply: function (w) {
        const p = w.state;
        const k = w.branchOf(p);
        if (p.train[k] >= 120) return { error: 'これいじょうは のびない！' };
        p.train[k] = Math.min(120, p.train[k] + 6);
        const label = Species.BRANCHES.filter((b) => b.id === k)[0].label;
        return { text: label + ' +6！', burst: '💪' };
      }
    },
    {
      id: 'charm', name: 'しあわせの おまもり', emoji: '🍀', rarity: 1,
      desc: 'つぎの おでかけの おみやげが 1.5 倍。コレクションも かならず ひろう',
      apply: function (w) {
        bag.buffs.charm = (bag.buffs.charm || 0) + 1;
        return { text: 'おまもりを もたせた。つぎの おでかけが たのしみ', burst: '🍀', keep: true };
      }
    },
    {
      id: 'lens', name: 'たからさがしレンズ', emoji: '🔍', rarity: 2,
      desc: 'つぎの 3 回、かならず コレクションを 見つける（レアも でやすい）',
      apply: function (w) {
        bag.buffs.lens = (bag.buffs.lens || 0) + 3;
        return { text: 'めが よくなった。3 回ぶん', burst: '🔍', keep: true };
      }
    },
    {
      id: 'elixir', name: 'きせきの しずく', emoji: '💧', rarity: 2,
      desc: '4 つの メーターが ぜんぶ +30',
      apply: function (w) {
        const p = w.state;
        World.CARE_KEYS.forEach((k) => { p.care[k] = cl(p.care[k] + 30); });
        p.exp += 12;
        return { text: 'からだじゅうに ちからが もどった！', burst: '💧' };
      }
    },
    {
      id: 'medicine', name: 'いたわりの くすり', emoji: '💊', rarity: 2,
      desc: 'ケアミスを 1 返上する',
      apply: function (w) {
        const p = w.state;
        if (p.careMiss <= 0) return { error: 'ケアミスは ひとつも ない' };
        p.careMiss = Math.max(0, p.careMiss - 1);
        return { text: 'ケアミス −1。ゆるして もらえた', burst: '💗' };
      }
    },
    {
      id: 'candle', name: 'いのりの ロウソク', emoji: '🕯️', rarity: 3,
      desc: 'ケアミスを 3 返上する',
      apply: function (w) {
        const p = w.state;
        if (p.careMiss <= 0) return { error: 'ケアミスは ひとつも ない' };
        p.careMiss = Math.max(0, p.careMiss - 3);
        return { text: 'ケアミス −3。ちいさな きせき', burst: '🕯️' };
      }
    }
  ];
  const USABLE_BY_ID = {};
  USABLE.forEach((u) => { USABLE_BY_ID[u.id] = u; });
  const USABLE_BY_RARITY = [[], [], [], []];
  USABLE.forEach((u) => USABLE_BY_RARITY[u.rarity].push(u));

  // ── 袋 ───────────────────────────────────────────────
  let bag = { v: 1, usable: {}, found: {}, buffs: {}, milestone: 0 };

  function load() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(BAG_KEY) || 'null'); } catch (e) { raw = null; }
    bag = {
      v: 1,
      usable: (raw && raw.usable && typeof raw.usable === 'object') ? raw.usable : {},
      found: (raw && raw.found && typeof raw.found === 'object') ? raw.found : {},
      buffs: (raw && raw.buffs && typeof raw.buffs === 'object') ? raw.buffs : {},
      milestone: (raw && Number(raw.milestone)) || 0
    };
    // 知らない id は そうじしておく（版が変わっても こわれない）
    Object.keys(bag.usable).forEach((k) => { if (!USABLE_BY_ID[k]) delete bag.usable[k]; });
    Object.keys(bag.found).forEach((k) => { if (!COLLECT_BY_ID[k]) delete bag.found[k]; });
    return bag;
  }
  function save() {
    try { localStorage.setItem(BAG_KEY, JSON.stringify(bag)); } catch (e) { /* 無視 */ }
  }
  load();

  function countUsable() {
    return Object.keys(bag.usable).reduce((s, k) => s + (bag.usable[k] || 0), 0);
  }
  function foundCount() { return Object.keys(bag.found).length; }
  function has(id) { return (bag.found[id] || 0) && true; }
  function foundEntry(id) { return bag.found[id] || null; }

  function catProgress(key) {
    const list = BY_CAT[key] || [];
    let n = 0;
    list.forEach((it) => { if (bag.found[it.id]) n++; });
    return { found: n, total: list.length };
  }

  function rarityProgress() {
    const out = RARITY.map(() => ({ found: 0, total: 0 }));
    COLLECTIBLES.forEach((it) => {
      out[it.rarity].total++;
      if (bag.found[it.id]) out[it.rarity].found++;
    });
    return out;
  }

  function addUsable(id, n) {
    if (!USABLE_BY_ID[id]) return;
    bag.usable[id] = Math.min(99, (bag.usable[id] || 0) + (n || 1));
    save();
  }

  // コレクションを 1 つ しまう。20 種ごとに どうぐが 1 つ もらえる。
  function addFound(item, t) {
    const cur = bag.found[item.id];
    const isNew = !cur;
    if (isNew) bag.found[item.id] = { n: 1, t: t || World.now() };
    else cur.n = Math.min(999, (cur.n || 1) + 1);
    let bonus = null;
    if (isNew) {
      const milestones = Math.floor(foundCount() / 20);
      if (milestones > (bag.milestone || 0)) {
        bag.milestone = milestones;
        const pool = USABLE_BY_RARITY[milestones % 4 === 0 ? 2 : 1];
        bonus = pool[milestones % pool.length];
        addUsable(bonus.id, 1);
      }
    }
    save();
    return { item: item, isNew: isNew, bonus: bonus };
  }

  // ── 見つける（ドロップ）──────────────────────────────
  // luck: 0 = ふつう。大きいほど レアに かたよる。
  function pickRarity(rng, luck) {
    const l = luck || 0;
    const w = [
      Math.max(4, 62 - l * 16),
      25 + l * 4,
      10 + l * 7,
      3 + l * 5
    ];
    const total = w[0] + w[1] + w[2] + w[3];
    let r = rng() * total;
    for (let i = 0; i < 4; i++) {
      if (r < w[i]) return i;
      r -= w[i];
    }
    return 0;
  }

  function pickCollectible(rng, luck) {
    const tier = pickRarity(rng, luck);
    const pool = BY_RARITY[tier];
    // まだ 持っていないものを 少しだけ ひいきする（2 回 ひいて 新しいほうを とる）
    const a = pool[Math.floor(rng() * pool.length)];
    const b = pool[Math.floor(rng() * pool.length)];
    if (bag.found[a.id] && !bag.found[b.id]) return b;
    return a;
  }

  function pickUsable(rng, luck) {
    const tier = pickRarity(rng, luck);
    const pool = USABLE_BY_RARITY[tier].length ? USABLE_BY_RARITY[tier] : USABLE_BY_RARITY[0];
    return pool[Math.floor(rng() * pool.length)];
  }

  // opts: { seed, collectChance, usableChance, luck }
  // 返り値: [{kind:'collect', item, isNew, bonus} | {kind:'usable', item}]
  function roll(opts) {
    opts = opts || {};
    const rng = Rng.makeRng('find:' + (opts.seed || (World.now() + ':' + Math.random())));
    const finds = [];
    let luck = opts.luck || 0;
    let collectChance = opts.collectChance === undefined ? 0.35 : opts.collectChance;

    if (opts.lens && bag.buffs.lens > 0) {
      bag.buffs.lens--;
      collectChance = 1;
      luck += 1.2;
      save();
    }

    if (rng() < collectChance) {
      const it = pickCollectible(rng, luck);
      finds.push(Object.assign({ kind: 'collect' }, addFound(it, World.now())));
    }
    if (rng() < (opts.usableChance === undefined ? 0.25 : opts.usableChance)) {
      const u = pickUsable(rng, luck);
      addUsable(u.id, 1);
      finds.push({ kind: 'usable', item: u });
    }
    return finds;
  }

  // おでかけの おみやげ倍率（おまもりを 1 つ 消費する）
  function takeOutingBoost() {
    if (bag.buffs.charm > 0) {
      bag.buffs.charm--;
      save();
      return 1.5;
    }
    return 1;
  }
  function hasCharm() { return (bag.buffs.charm || 0) > 0; }
  function lensLeft() { return bag.buffs.lens || 0; }

  // ── つかう ───────────────────────────────────────────
  function use(world, id) {
    const def = USABLE_BY_ID[id];
    if (!def) return { error: 'そんな どうぐは ない' };
    if (!(bag.usable[id] > 0)) return { error: 'もう もっていない' };
    if (world.isDead()) return { error: 'もう つかえない…' };
    if (world.isOuting()) return { error: 'おでかけ中は つかえない' };
    if (world.stageOf(world.state) === 0 && id !== 'candy') {
      return { error: 'タマゴには まだ つかえない' };
    }
    const r = def.apply(world) || {};
    if (r.error) return r;
    bag.usable[id]--;
    if (bag.usable[id] <= 0) delete bag.usable[id];
    save();
    world.addLog(def.emoji + ' ' + def.name + ' を つかった');
    world.save();
    return { item: def, text: r.text, burst: r.burst || def.emoji };
  }

  function clear() {
    bag = { v: 1, usable: {}, found: {}, buffs: {}, milestone: 0 };
    save();
  }

  // ── アイコンを その場で描く ──────────────────────────
  // 画像ファイルは 使わない。id から 色と かたちが 決まる。
  const OUTLINE = '#20182e';

  function hsl(h, s, l) { return 'hsl(' + ((h % 360) + 360) % 360 + ',' + s + '%,' + l + '%)'; }

  function blob(ctx, cx, cy, r, wobble, seedR) {
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const rr = r * (1 + Math.sin(a * 3 + seedR) * wobble + Math.cos(a * 5 + seedR * 2) * wobble * 0.6);
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * 0.92;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function star(ctx, cx, cy, r, points, inner) {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 ? r * inner : r;
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function paint(ctx, fill) {
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
  }

  const SHAPES = {
    stone: function (ctx, S, c, ni, rng) {
      if (ni === 1) {                       // けっしょう
        ctx.beginPath();
        ctx.moveTo(S * 0.5, S * 0.16); ctx.lineTo(S * 0.74, S * 0.44);
        ctx.lineTo(S * 0.63, S * 0.84); ctx.lineTo(S * 0.37, S * 0.84);
        ctx.lineTo(S * 0.26, S * 0.44); ctx.closePath();
        paint(ctx, c.main);
        ctx.beginPath();
        ctx.moveTo(S * 0.5, S * 0.16); ctx.lineTo(S * 0.5, S * 0.84); ctx.lineTo(S * 0.37, S * 0.84);
        ctx.lineTo(S * 0.26, S * 0.44); ctx.closePath();
        ctx.fillStyle = c.light; ctx.fill();
      } else if (ni === 3) {                // すなつぶ
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2;
          blob(ctx, S * (0.5 + Math.cos(a) * 0.2), S * (0.55 + Math.sin(a) * 0.16), S * 0.09, 0.16, i);
          paint(ctx, i % 2 ? c.light : c.main);
        }
      } else {
        blob(ctx, S * 0.5, S * 0.55, S * (ni === 4 ? 0.3 : 0.32), ni === 4 ? 0.01 : 0.1, ni + 1);
        paint(ctx, c.main);
        ctx.beginPath();
        ctx.ellipse(S * 0.41, S * 0.42, S * 0.11, S * 0.07, -0.5, 0, Math.PI * 2);
        ctx.fillStyle = c.light; ctx.fill();
      }
    },
    leaf: function (ctx, S, c, ni) {
      ctx.save();
      ctx.translate(S * 0.5, S * 0.54);
      ctx.rotate(-0.4 + ni * 0.12);
      ctx.beginPath();
      ctx.moveTo(0, -S * 0.34);
      ctx.quadraticCurveTo(S * 0.30, -S * 0.06, 0, S * 0.34);
      ctx.quadraticCurveTo(-S * 0.30, -S * 0.06, 0, -S * 0.34);
      ctx.closePath();
      paint(ctx, c.main);
      ctx.beginPath();
      ctx.moveTo(0, -S * 0.30); ctx.lineTo(0, S * 0.30);
      ctx.strokeStyle = c.dark; ctx.lineWidth = Math.max(1, S * 0.03);
      ctx.stroke();
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * S * 0.09);
        ctx.lineTo((i % 2 ? 1 : -1) * S * 0.14, i * S * 0.09 + S * 0.06);
        ctx.stroke();
      }
      ctx.restore();
    },
    flower: function (ctx, S, c, ni) {
      const n = 5 + (ni % 3);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        ctx.beginPath();
        ctx.ellipse(S * 0.5 + Math.cos(a) * S * 0.19, S * 0.54 + Math.sin(a) * S * 0.19,
          S * 0.15, S * 0.1, a, 0, Math.PI * 2);
        paint(ctx, c.main);
      }
      ctx.beginPath();
      ctx.arc(S * 0.5, S * 0.54, S * 0.11, 0, Math.PI * 2);
      paint(ctx, c.accent);
    },
    fruit: function (ctx, S, c, ni) {
      if (ni === 3) {                        // みつ
        ctx.beginPath();
        ctx.moveTo(S * 0.5, S * 0.18);
        ctx.quadraticCurveTo(S * 0.80, S * 0.62, S * 0.5, S * 0.84);
        ctx.quadraticCurveTo(S * 0.20, S * 0.62, S * 0.5, S * 0.18);
        ctx.closePath();
        paint(ctx, c.main);
      } else {
        ctx.beginPath();
        ctx.ellipse(S * 0.5, S * 0.58, S * 0.28, S * 0.27, 0, 0, Math.PI * 2);
        paint(ctx, c.main);
        ctx.beginPath();
        ctx.ellipse(S * 0.41, S * 0.47, S * 0.09, S * 0.06, -0.6, 0, Math.PI * 2);
        ctx.fillStyle = c.light; ctx.fill();
      }
      ctx.beginPath();
      ctx.moveTo(S * 0.5, S * 0.32); ctx.lineTo(S * 0.54, S * 0.16);
      ctx.strokeStyle = '#6b4a2f'; ctx.lineWidth = Math.max(1, S * 0.045);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(S * 0.62, S * 0.18, S * 0.1, S * 0.05, -0.5, 0, Math.PI * 2);
      ctx.fillStyle = '#5fd07a'; ctx.strokeStyle = OUTLINE; ctx.lineWidth = Math.max(1, S * 0.03);
      ctx.fill(); ctx.stroke();
    },
    shell: function (ctx, S, c, ni) {
      if (ni === 3) {                        // ひとで
        star(ctx, S * 0.5, S * 0.54, S * 0.32, 5, 0.44);
        paint(ctx, c.main);
        return;
      }
      if (ni === 2) {                        // しんじゅ
        ctx.beginPath();
        ctx.arc(S * 0.5, S * 0.55, S * 0.26, 0, Math.PI * 2);
        paint(ctx, c.light);
        ctx.beginPath();
        ctx.arc(S * 0.42, S * 0.46, S * 0.08, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fill();
        return;
      }
      ctx.beginPath();
      ctx.moveTo(S * 0.5, S * 0.82);
      ctx.arc(S * 0.5, S * 0.8, S * 0.33, Math.PI, Math.PI * 2);
      ctx.closePath();
      paint(ctx, c.main);
      for (let i = 1; i < 5; i++) {
        const a = Math.PI + (i / 5) * Math.PI;
        ctx.beginPath();
        ctx.moveTo(S * 0.5, S * 0.8);
        ctx.lineTo(S * 0.5 + Math.cos(a) * S * 0.31, S * 0.8 + Math.sin(a) * S * 0.31);
        ctx.strokeStyle = c.dark; ctx.lineWidth = Math.max(1, S * 0.025);
        ctx.stroke();
      }
    },
    feather: function (ctx, S, c, ni) {
      ctx.save();
      ctx.translate(S * 0.5, S * 0.5);
      ctx.rotate(0.5 - ni * 0.1);
      ctx.beginPath();
      ctx.ellipse(0, 0, S * 0.14, S * 0.35, 0, 0, Math.PI * 2);
      paint(ctx, c.main);
      ctx.beginPath();
      ctx.moveTo(0, -S * 0.35); ctx.lineTo(0, S * 0.4);
      ctx.strokeStyle = c.dark; ctx.lineWidth = Math.max(1, S * 0.035);
      ctx.stroke();
      for (let i = -3; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * S * 0.1);
        ctx.lineTo((i % 2 ? 1 : -1) * S * 0.12, i * S * 0.1 - S * 0.05);
        ctx.lineWidth = Math.max(1, S * 0.02);
        ctx.stroke();
      }
      ctx.restore();
    },
    star: function (ctx, S, c, ni) {
      if (ni === 2) {                        // しずく
        ctx.beginPath();
        ctx.moveTo(S * 0.5, S * 0.18);
        ctx.quadraticCurveTo(S * 0.78, S * 0.58, S * 0.5, S * 0.82);
        ctx.quadraticCurveTo(S * 0.22, S * 0.58, S * 0.5, S * 0.18);
        ctx.closePath();
        paint(ctx, c.main);
        return;
      }
      if (ni === 4) {                        // かがみ
        ctx.beginPath();
        ctx.ellipse(S * 0.5, S * 0.48, S * 0.26, S * 0.3, 0, 0, Math.PI * 2);
        paint(ctx, c.light);
        ctx.beginPath();
        ctx.rect(S * 0.46, S * 0.74, S * 0.08, S * 0.14);
        paint(ctx, c.dark);
        return;
      }
      star(ctx, S * 0.5, S * 0.52, S * 0.34, ni === 1 ? 8 : (ni === 3 ? 6 : 5), ni === 1 ? 0.3 : 0.42);
      paint(ctx, c.main);
      ctx.beginPath();
      ctx.arc(S * 0.44, S * 0.44, S * 0.05, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fill();
    },
    toy: function (ctx, S, c, ni) {
      if (ni === 1) {                        // こま
        ctx.beginPath();
        ctx.moveTo(S * 0.5, S * 0.86); ctx.lineTo(S * 0.24, S * 0.44);
        ctx.lineTo(S * 0.76, S * 0.44); ctx.closePath();
        paint(ctx, c.main);
        ctx.beginPath();
        ctx.rect(S * 0.46, S * 0.18, S * 0.08, S * 0.28);
        paint(ctx, c.dark);
      } else if (ni === 2) {                 // つみき
        ctx.beginPath(); ctx.rect(S * 0.22, S * 0.5, S * 0.32, S * 0.32); paint(ctx, c.main);
        ctx.beginPath(); ctx.rect(S * 0.48, S * 0.24, S * 0.3, S * 0.3); paint(ctx, c.accent);
      } else if (ni === 3) {                 // ぬいぐるみ
        ctx.beginPath(); ctx.arc(S * 0.33, S * 0.3, S * 0.1, 0, Math.PI * 2); paint(ctx, c.main);
        ctx.beginPath(); ctx.arc(S * 0.67, S * 0.3, S * 0.1, 0, Math.PI * 2); paint(ctx, c.main);
        ctx.beginPath(); ctx.ellipse(S * 0.5, S * 0.55, S * 0.26, S * 0.28, 0, 0, Math.PI * 2); paint(ctx, c.main);
        ctx.fillStyle = OUTLINE;
        ctx.beginPath(); ctx.arc(S * 0.42, S * 0.5, S * 0.035, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(S * 0.58, S * 0.5, S * 0.035, 0, Math.PI * 2); ctx.fill();
      } else if (ni === 4) {                 // ふうせん
        ctx.beginPath();
        ctx.ellipse(S * 0.5, S * 0.42, S * 0.24, S * 0.28, 0, 0, Math.PI * 2);
        paint(ctx, c.main);
        ctx.beginPath();
        ctx.moveTo(S * 0.5, S * 0.7);
        ctx.quadraticCurveTo(S * 0.6, S * 0.8, S * 0.5, S * 0.9);
        ctx.strokeStyle = OUTLINE; ctx.lineWidth = Math.max(1, S * 0.025); ctx.stroke();
      } else {                               // ボール
        ctx.beginPath(); ctx.arc(S * 0.5, S * 0.54, S * 0.3, 0, Math.PI * 2); paint(ctx, c.main);
        ctx.beginPath();
        ctx.moveTo(S * 0.2, S * 0.54); ctx.quadraticCurveTo(S * 0.5, S * 0.34, S * 0.8, S * 0.54);
        ctx.strokeStyle = c.dark; ctx.lineWidth = Math.max(1, S * 0.04); ctx.stroke();
      }
    },
    relic: function (ctx, S, c, ni) {
      if (ni === 1) {                        // かぎ
        ctx.beginPath(); ctx.arc(S * 0.36, S * 0.32, S * 0.16, 0, Math.PI * 2); paint(ctx, c.main);
        ctx.beginPath(); ctx.arc(S * 0.36, S * 0.32, S * 0.06, 0, Math.PI * 2);
        ctx.fillStyle = OUTLINE; ctx.fill();
        ctx.beginPath(); ctx.rect(S * 0.44, S * 0.42, S * 0.08, S * 0.4); paint(ctx, c.main);
        ctx.beginPath(); ctx.rect(S * 0.52, S * 0.62, S * 0.14, S * 0.07); paint(ctx, c.main);
      } else if (ni === 2) {                 // コイン
        ctx.beginPath(); ctx.arc(S * 0.5, S * 0.54, S * 0.3, 0, Math.PI * 2); paint(ctx, c.main);
        ctx.beginPath(); ctx.arc(S * 0.5, S * 0.54, S * 0.19, 0, Math.PI * 2);
        ctx.strokeStyle = c.dark; ctx.lineWidth = Math.max(1, S * 0.04); ctx.stroke();
      } else if (ni === 3) {                 // つぼ
        ctx.beginPath();
        ctx.moveTo(S * 0.36, S * 0.26);
        ctx.quadraticCurveTo(S * 0.16, S * 0.6, S * 0.5, S * 0.86);
        ctx.quadraticCurveTo(S * 0.84, S * 0.6, S * 0.64, S * 0.26);
        ctx.closePath();
        paint(ctx, c.main);
        ctx.beginPath(); ctx.rect(S * 0.34, S * 0.2, S * 0.32, S * 0.08); paint(ctx, c.dark);
      } else if (ni === 4) {                 // ちず
        ctx.beginPath(); ctx.rect(S * 0.2, S * 0.26, S * 0.6, S * 0.48); paint(ctx, c.light);
        ctx.strokeStyle = c.dark; ctx.lineWidth = Math.max(1, S * 0.025);
        ctx.beginPath();
        ctx.moveTo(S * 0.28, S * 0.62); ctx.quadraticCurveTo(S * 0.5, S * 0.34, S * 0.72, S * 0.56);
        ctx.stroke();
        ctx.fillStyle = '#ff6b6b';
        ctx.font = 'bold ' + (S * 0.2) + 'px system-ui';
        ctx.fillText('×', S * 0.64, S * 0.62);
      } else {                               // かけら
        ctx.beginPath();
        ctx.moveTo(S * 0.28, S * 0.72); ctx.lineTo(S * 0.34, S * 0.28);
        ctx.lineTo(S * 0.66, S * 0.34); ctx.lineTo(S * 0.72, S * 0.78);
        ctx.closePath();
        paint(ctx, c.main);
      }
    },
    mystery: function (ctx, S, c, ni) {
      if (ni === 1) {                        // ビン
        ctx.beginPath(); ctx.rect(S * 0.42, S * 0.16, S * 0.16, S * 0.14); paint(ctx, c.dark);
        ctx.beginPath();
        ctx.moveTo(S * 0.38, S * 0.3);
        ctx.quadraticCurveTo(S * 0.18, S * 0.6, S * 0.5, S * 0.86);
        ctx.quadraticCurveTo(S * 0.82, S * 0.6, S * 0.62, S * 0.3);
        ctx.closePath();
        paint(ctx, c.main);
      } else if (ni === 2) {                 // おふだ
        ctx.beginPath(); ctx.rect(S * 0.32, S * 0.16, S * 0.36, S * 0.68); paint(ctx, c.light);
        ctx.strokeStyle = c.accent; ctx.lineWidth = Math.max(1, S * 0.03);
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(S * 0.4, S * (0.34 + i * 0.16));
          ctx.lineTo(S * 0.6, S * (0.34 + i * 0.16));
          ctx.stroke();
        }
      } else if (ni === 3) {                 // ランプ
        ctx.beginPath();
        ctx.ellipse(S * 0.48, S * 0.6, S * 0.26, S * 0.18, 0, 0, Math.PI * 2);
        paint(ctx, c.main);
        ctx.beginPath();
        ctx.moveTo(S * 0.7, S * 0.56); ctx.lineTo(S * 0.88, S * 0.44); ctx.lineTo(S * 0.72, S * 0.64);
        ctx.closePath(); paint(ctx, c.main);
        ctx.beginPath();
        ctx.arc(S * 0.4, S * 0.3, S * 0.08, 0, Math.PI * 2);
        ctx.fillStyle = c.accent; ctx.fill();
      } else if (ni === 4) {                 // とけい
        ctx.beginPath(); ctx.arc(S * 0.5, S * 0.54, S * 0.3, 0, Math.PI * 2); paint(ctx, c.light);
        ctx.strokeStyle = OUTLINE; ctx.lineWidth = Math.max(1, S * 0.04);
        ctx.beginPath(); ctx.moveTo(S * 0.5, S * 0.54); ctx.lineTo(S * 0.5, S * 0.34); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(S * 0.5, S * 0.54); ctx.lineTo(S * 0.66, S * 0.6); ctx.stroke();
      } else {                               // たま
        ctx.beginPath(); ctx.arc(S * 0.5, S * 0.54, S * 0.3, 0, Math.PI * 2); paint(ctx, c.main);
        ctx.beginPath();
        ctx.ellipse(S * 0.4, S * 0.44, S * 0.09, S * 0.06, -0.6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fill();
      }
    }
  };

  function drawIcon(ctx, item, size) {
    const S = size;
    const rar = RARITY[item.rarity];
    ctx.clearRect(0, 0, S, S);

    // うしろの ふだ。レアリティで 色が かわる
    ctx.save();
    ctx.beginPath();
    const r = S * 0.16;
    if (ctx.roundRect) ctx.roundRect(S * 0.04, S * 0.04, S * 0.92, S * 0.92, r);
    else ctx.rect(S * 0.04, S * 0.04, S * 0.92, S * 0.92);
    const g = ctx.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, 'rgba(255,255,255,.10)');
    g.addColorStop(1, 'rgba(0,0,0,.18)');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = rar.color + (item.rarity >= 2 ? 'cc' : '55');
    ctx.lineWidth = Math.max(1, S * 0.03);
    ctx.stroke();
    ctx.restore();

    if (item.rarity === 3) {                 // でんせつは オーラつき
      const ag = ctx.createRadialGradient(S / 2, S / 2, S * 0.1, S / 2, S / 2, S * 0.55);
      ag.addColorStop(0, 'rgba(255,204,77,.35)');
      ag.addColorStop(1, 'rgba(255,204,77,0)');
      ctx.fillStyle = ag;
      ctx.fillRect(0, 0, S, S);
    }

    const tint = item.tint || {};
    const h = tint.h === undefined ? item.hue : tint.h;
    const sat = tint.s === undefined ? (50 + item.rarity * 12) : tint.s;
    const li = tint.l === undefined ? 58 : tint.l;
    const colors = {
      main: hsl(h, sat, li),
      light: hsl(h, Math.max(0, sat - 10), Math.min(90, li + 18)),
      dark: hsl(h, sat, Math.max(18, li - 24)),
      accent: hsl(h + 150, Math.min(90, sat + 10), Math.min(80, li + 4))
    };
    ctx.save();
    ctx.lineWidth = Math.max(1, S * 0.035);
    ctx.lineJoin = 'round';
    const cat = item.cat;
    (SHAPES[cat] || SHAPES.stone)(ctx, S, colors, item.ni, item.pi);
    ctx.restore();
  }

  const iconCache = {};
  function iconDataURL(item, size) {
    const key = item.id + '@' + size;
    if (iconCache[key]) return iconCache[key];
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    drawIcon(c.getContext('2d'), item, size);
    const url = c.toDataURL();
    iconCache[key] = url;
    return url;
  }

  global.Items = {
    RARITY, CATS, COLLECTIBLES, COLLECT_BY_ID, BY_CAT, TOTAL,
    USABLE, USABLE_BY_ID,
    bag: function () { return bag; },
    load, save, clear,
    countUsable, foundCount, has, foundEntry, catProgress, rarityProgress,
    addUsable, addFound, roll, use,
    takeOutingBoost, hasCharm, lensLeft,
    drawIcon, iconDataURL
  };
})(window);
