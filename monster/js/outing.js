// おでかけ。「放置」を 資源に変える仕組み。
//
//   ・おでかけ中は コールが出ない ＝ ケアミスが増えない。寝る前・出かける前の逃げ道。
//   ・そのかわり 経験値の自然増が止まる。安全だが のびない、というトレードオフ。
//   ・おみやげの量は「出発したときの コンディション」に比例する。
//     だらしなく送り出すと ろくなものを持って帰ってこない。
(function (global) {
  'use strict';

  const MIN = 60e3, HOUR = 3600e3;

  const COURSES = [
    { id: 'short', name: 'さんぽ',     ms: 30 * MIN, energy: 15, train: 2,  emoji: '🌿',
      desc: '30ぷん / ちかくを ひとまわり' },
    { id: 'mid',   name: 'もりへ',     ms: 3 * HOUR,  energy: 25, train: 5,  emoji: '🌳',
      desc: '3じかん / もりの おくまで' },
    { id: 'long',  name: 'とおくへ',   ms: 8 * HOUR,  energy: 35, train: 10, emoji: '🏔️',
      desc: '8じかん / ひとばん かけて' }
  ];
  const BY_ID = {};
  COURSES.forEach((c) => { BY_ID[c.id] = c; });

  const KEEPSAKE = [
    'まるい こいし', 'いろづいた はっぱ', 'ながれぼしの かけら', 'とりの おとした はね',
    'あまい きのみ', 'ひかる つゆ', 'かわいた ぼうしの かた', 'みずうみの すな',
    'だれかの おとした リボン', 'ふしぎな かたちの えだ'
  ];
  const RARE_KEEPSAKE = [
    '🌟 きんいろの きのみ', '🌟 うたう かい', '🌟 ちいさな おうかん', '🌟 とけない こおり'
  ];

  function canGo(world) {
    const p = world.state;
    if (p.dead || p.outing) return false;
    if (world.stageOf(p) === 0) return false;
    return true;
  }

  function start(world, id) {
    const c = BY_ID[id];
    const p = world.state;
    if (!c || !canGo(world)) return null;
    if (p.care.energy < c.energy) return { error: 'げんきが たりない…' };

    p.care.energy = World.clamp(p.care.energy - c.energy, 0, 100);
    p.care.food = World.clamp(p.care.food + 10, 0, 100);   // おべんとうを もたせる
    const t = World.now();
    p.outing = {
      kind: c.id,
      startedAt: t,
      endsAt: t + c.ms,
      cond: world.condition(p)
    };
    p.actions.outing = (p.actions.outing || 0) + 1;
    world.addLog(c.emoji + ' ' + c.name + ' に おくりだした');
    world.save();
    return { course: c };
  }

  function isBack(world) {
    const o = world.state.outing;
    return !!(o && World.now() >= o.endsAt);
  }
  function leftMs(world) {
    const o = world.state.outing;
    return o ? Math.max(0, o.endsAt - World.now()) : 0;
  }
  function progress(world) {
    const o = world.state.outing;
    if (!o) return 0;
    const total = o.endsAt - o.startedAt;
    return World.clamp((World.now() - o.startedAt) / total, 0, 1);
  }

  // おみやげを受けとる。early=true なら 途中で呼びもどした扱い。
  function claim(world, early) {
    const p = world.state;
    const o = p.outing;
    if (!o) return null;
    const c = BY_ID[o.kind] || COURSES[1];
    const ratio = early ? progress(world) : 1;
    p.outing = null;
    if (ratio < 0.05) {
      world.addLog('おでかけを とりやめた');
      world.save();
      return { course: c, early: true, exp: 0, stat: null, gain: 0, keepsake: null };
    }

    const rng = Rng.makeRng('outing:' + p.seed + ':' + o.startedAt);
    const durH = (c.ms / HOUR) * ratio;
    const condF = 0.45 + o.cond * 0.75;
    const rare = rng.chance(0.1);
    // しあわせの おまもりを 持たせていれば おみやげが 1.5 倍（1 回で なくなる）
    const charm = (global.Items && Items.takeOutingBoost) ? Items.takeOutingBoost() : 1;
    const mult = (rare ? 2 : 1) * charm;

    const exp = Math.round(durH * 7 * condF * mult);
    const statKey = rng.pick(['hp', 'atk', 'def', 'spd']);
    const gain = Math.max(1, Math.round(c.train * ratio * condF * mult));

    p.exp += exp;
    p.train[statKey] = Math.min(120, p.train[statKey] + gain);
    p.care.mood = World.clamp(p.care.mood + 18, 0, 100);
    p.care.clean = World.clamp(p.care.clean - 20 * ratio, 0, 100);
    p.care.food = World.clamp(p.care.food - 12 * ratio, 0, 100);
    p.care.energy = World.clamp(p.care.energy - 10 * ratio, 0, 100);

    let keepsake = null;
    if (rare || rng.chance(0.35)) {
      keepsake = rare ? rng.pick(RARE_KEEPSAKE) : rng.pick(KEEPSAKE);
      p.keepsakes.push({ t: World.now(), text: keepsake });
      if (p.keepsakes.length > 12) p.keepsakes = p.keepsakes.slice(-12);
    }

    const label = Species.BRANCHES.filter((b) => b.id === statKey)[0].label;
    world.addLog((early ? 'おでかけから よびもどした' : c.emoji + ' ' + c.name + ' から かえってきた') +
      '（+' + exp + ' EXP / ' + label + ' +' + gain + '）');
    world.save();

    return {
      course: c, early: !!early, rare: rare, charm: charm > 1,
      exp: exp, stat: statKey, statLabel: label, gain: gain, keepsake: keepsake
    };
  }

  global.Outing = { COURSES, BY_ID, canGo, start, isBack, leftMs, progress, claim };
})(window);
