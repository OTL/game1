// 図鑑。旅立っていったコを 1 匹ずつ記録して、あとから会いにいける場所。
//
// ・記録には ゲノムのシードと血統が入っているので、姿と種族値をいつでも再現できる。
//   → 「せんだいに いどむ」＝ 過去の自分との対戦が、これだけで成立する。
// ・3 代つづけて天寿をまっとうすると、次のタマゴは「でんせつ」の血をひく。
(function (global) {
  'use strict';

  const DEX_KEY = 'monster.dex.v2';
  const MAX = 60;

  function read() {
    try {
      const a = JSON.parse(localStorage.getItem(DEX_KEY) || '[]');
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }
  function write(a) {
    try { localStorage.setItem(DEX_KEY, JSON.stringify(a.slice(-MAX))); } catch (e) { /* 無視 */ }
  }

  // 称号。生きた長さ・ケアミス・伸ばしたもので決まる、その一生の見出し。
  function titleOf(p, genome, dead, lifeMs, level) {
    if (dead.cause === 'age') {
      if (p.careMiss === 0) return { text: 'かんぺきな 一生', rank: 5 };
      if (p.careMiss <= 4) return { text: 'しあわせもの', rank: 4 };
      if (p.careMiss <= 14) return { text: 'てんじゅを まっとうした', rank: 3 };
      return { text: 'ぎりぎりの 七日間', rank: 2 };
    }
    if (lifeMs < 24 * 3600e3) return { text: 'はかなき もの', rank: 0 };
    if (lifeMs < 72 * 3600e3) return { text: 'みじかい 一生', rank: 1 };
    if (level >= 26) return { text: 'つよかったけれど', rank: 1 };
    return { text: 'ちからつきた', rank: 1 };
  }

  // 記録を作る（保存はしない）
  function record(p, genome, dead) {
    const lifeMs = Math.max(0, dead.at - p.bornAt);
    const stage = World.stageOf(p);
    const branch = World.branchOf(p);
    const level = World.levelOf(p.exp);
    const t = titleOf(p, genome, dead, lifeMs, level);
    return {
      seed: p.seed,
      lineage: p.lineage || null,
      gen: p.gen,
      name: Species.nameFor(genome, Math.max(1, stage), branch),
      category: genome.category,
      personality: genome.personality,
      types: genome.types,
      shiny: !!genome.shiny,
      blessed: !!genome.blessed,
      stage: Math.max(1, stage),
      branch: branch,
      level: level,
      exp: Math.floor(p.exp),
      train: Object.assign({}, p.train),
      actions: Object.assign({}, p.actions),
      battles: Object.assign({}, p.battles),
      careMiss: p.careMiss,
      comfortMs: Math.round(p.comfortMs),
      keepsakes: (p.keepsakes || []).slice(-6),
      bornAt: p.bornAt,
      diedAt: dead.at,
      lifeMs: lifeMs,
      cause: dead.cause,
      title: t.text,
      rank: t.rank,
      beaten: 0        // せんだい戦で 何回 たおしたか
    };
  }

  const Dex = {
    all: function () { return read(); },
    count: function () { return read().length; },

    add: function (rec) {
      const a = read();
      a.push(rec);
      write(a);
      return rec;
    },

    update: function (seed, fn) {
      const a = read();
      for (let i = 0; i < a.length; i++) {
        if (a[i].seed === seed) { fn(a[i]); write(a); return a[i]; }
      }
      return null;
    },

    clear: function () { write([]); },

    // 天寿とみなせるか。七日 生きただけでは足りず、ケアミスも少ないこと。
    isFullLife: function (r) { return r.cause === 'age' && r.rank >= 3; },

    // おくりものの割合：まっとうした天寿 1/3 / ぎりぎり 1/4 / 衰弱 1/5
    giftRatio: function (r) {
      if (r.rank >= 3) return 1 / 3;
      if (r.rank >= 2) return 1 / 4;
      return 1 / 5;
    },
    giftRatioText: function (r) {
      if (r.rank >= 3) return '1/3';
      if (r.rank >= 2) return '1/4';
      return '1/5';
    },

    // 直近 3 代がすべて天寿なら、次は「でんせつ」の血をひく
    blessedNext: function () {
      const a = read();
      if (a.length < 3) return false;
      return a.slice(-3).every((r) => Dex.isFullLife(r));
    },

    // 記録からゲノムを復元する
    genomeOf: function (rec) {
      return Species.makeGenome(rec.seed, rec.lineage);
    },

    lookOf: function (rec) {
      return Species.lookFor(this.genomeOf(rec), rec.stage, rec.branch, null);
    },

    // まとめ
    summary: function () {
      const a = read();
      const age = a.filter((r) => Dex.isFullLife(r)).length;
      const best = a.reduce((m, r) => (!m || r.level > m.level ? r : m), null);
      const longest = a.reduce((m, r) => (!m || r.lifeMs > m.lifeMs ? r : m), null);
      return {
        total: a.length,
        age: age,
        weak: a.length - age,
        best: best,
        longest: longest,
        streak: (function () {
          let n = 0;
          for (let i = a.length - 1; i >= 0; i--) { if (Dex.isFullLife(a[i])) n++; else break; }
          return n;
        })()
      };
    },

    record: record,
    titleOf: titleOf
  };

  global.Dex = Dex;
})(window);
