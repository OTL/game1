// バトルエンジン。ターン制・タイプ相性つき。表示は game.js 側でやる。
(function (global) {
  'use strict';

  const WILD_NAMES_SUFFIX = ['', '', '', 'のこども', 'のむれ'];

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  // 野生のモンスターをシードから作る
  function makeFoe(seed, level, opts) {
    opts = opts || {};
    const genome = Species.makeGenome('wild:' + seed);
    const rng = Rng.makeRng('foe:' + seed);
    const lv = clamp(Math.round(level), 2, World.MAX_LEVEL);
    const boost = opts.boost || 1;
    const stage = lv < 10 ? 1 : (lv < 26 ? 2 : 3);
    const branch = rng.pick(['hp', 'atk', 'def', 'spd']);
    const b = genome.base;
    const stats = {
      level: lv,
      hp:  Math.floor(Math.floor(b.hp * 2 * lv / 100 + lv + 10) * boost),
      atk: Math.floor(Math.floor(b.atk * 2 * lv / 100 + 5) * boost),
      def: Math.floor(Math.floor(b.def * 2 * lv / 100 + 5) * boost),
      spd: Math.floor(Math.floor(b.spd * 2 * lv / 100 + 5) * boost)
    };
    return {
      genome: genome,
      name: (opts.title ? opts.title : '') + Species.nameFor(genome, stage, branch) +
            (opts.title ? '' : rng.pick(WILD_NAMES_SUFFIX)),
      look: Species.lookFor(genome, stage, branch),
      types: genome.types,
      stats: stats,
      moves: Species.movesFor(genome, lv),
      boss: !!opts.title
    };
  }

  function wildFor(playerLevel, seedBase) {
    const seed = String(seedBase);
    const rng = Rng.makeRng('lvoff:' + seed);
    const off = rng.int(-2, 3);
    return makeFoe(seed, Math.max(2, playerLevel + off), {});
  }

  // せんだい（図鑑の記録）を そのままの強さで呼び出す。
  // コンディション補正はかけない ＝ いちばん元気だったころの姿で立ちはだかる。
  function ancestorFoe(rec) {
    const genome = Dex.genomeOf(rec);
    const lv = Math.max(2, rec.level);
    const b = genome.base, t = rec.train || { hp: 0, atk: 0, def: 0, spd: 0 };
    const stats = {
      level: lv,
      hp:  Math.max(12, Math.floor((b.hp * 2 + (t.hp || 0)) * lv / 100) + lv + 10),
      atk: Math.floor((b.atk * 2 + (t.atk || 0)) * lv / 100 + 5),
      def: Math.floor((b.def * 2 + (t.def || 0)) * lv / 100 + 5),
      spd: Math.floor((b.spd * 2 + (t.spd || 0)) * lv / 100 + 5)
    };
    return {
      genome: genome,
      name: rec.gen + 'だいめ ' + rec.name,
      look: Dex.lookOf(rec),
      types: genome.types,
      stats: stats,
      moves: Species.movesFor(genome, lv),
      ancestor: true,
      rec: rec
    };
  }

  function damage(attacker, defender, move, rng) {
    const lv = attacker.stats.level;
    const mult = Species.typeMultiplier(move.type, defender.types);
    const stab = attacker.types.indexOf(move.type) >= 0 ? 1.5 : 1;
    const critRate = move.crit || 0.0625;
    const crit = rng() < critRate;
    const rand = 0.85 + rng() * 0.15;
    let d = Math.floor(((2 * lv / 5 + 2) * move.power * attacker.stats.atk / Math.max(1, defender.stats.def)) / 50) + 2;
    d = Math.floor(d * mult * stab * rand * (crit ? 1.6 : 1) * (attacker.boostAtk || 1));
    return { dmg: Math.max(mult === 0 ? 0 : 1, d), mult: mult, crit: crit };
  }

  function create(you, foe, seed) {
    const rng = Rng.makeRng('battle:' + seed);
    const b = {
      you: Object.assign({}, you, { hp: you.stats.hp, maxHp: you.stats.hp, boostAtk: 1 }),
      foe: Object.assign({}, foe, { hp: foe.stats.hp, maxHp: foe.stats.hp, boostAtk: 1 }),
      turnCount: 0,
      over: false,
      win: null,
      cheers: 0,
      rng: rng
    };

    function useMove(atk, def, move, events, sideLabel) {
      events.push({ type: 'msg', text: atk.name + ' の ' + move.name + '！' });
      if (rng() > (move.acc || 1)) {
        events.push({ type: 'miss', side: sideLabel });
        events.push({ type: 'msg', text: 'しかし はずれてしまった！' });
        return;
      }
      const r = damage(atk, def, move, rng);
      def.hp = Math.max(0, def.hp - r.dmg);
      events.push({ type: 'damage', side: sideLabel === 'you' ? 'foe' : 'you', amount: r.dmg, crit: r.crit, mult: r.mult });
      if (r.crit) events.push({ type: 'msg', text: 'きゅうしょに あたった！' });
      const et = Species.effectivenessText(r.mult);
      if (et) events.push({ type: 'msg', text: et });
      if (move.recoil && r.dmg > 0) {
        const rc = Math.max(1, Math.floor(r.dmg * move.recoil));
        atk.hp = Math.max(0, atk.hp - rc);
        events.push({ type: 'damage', side: sideLabel, amount: rc, recoil: true });
        events.push({ type: 'msg', text: atk.name + ' は はんどうで ダメージをうけた！' });
      }
    }

    // 相手の手：効果ばつぐんのわざを選びやすい
    function foeChoice() {
      const scored = b.foe.moves.map((m) => {
        const mult = Species.typeMultiplier(m.type, b.you.types);
        return { m: m, score: m.power * mult * (m.acc || 1) * (0.7 + rng() * 0.6) };
      });
      scored.sort((x, y) => y.score - x.score);
      return rng() < 0.75 ? scored[0].m : rng.pick(b.foe.moves);
    }

    b.turn = function (action) {
      const events = [];
      if (b.over) return events;
      b.turnCount++;

      if (action.type === 'run') {
        const ok = rng() < clamp(0.35 + (b.you.stats.spd - b.foe.stats.spd) / 100, 0.2, 0.9);
        if (ok) {
          b.over = true; b.win = 'run';
          events.push({ type: 'msg', text: 'うまく にげきれた！' });
          events.push({ type: 'end', result: 'run' });
          return events;
        }
        events.push({ type: 'msg', text: 'にげられない！' });
      } else if (action.type === 'cheer') {
        b.cheers++;
        b.you.boostAtk = Math.min(1.6, b.you.boostAtk + 0.15);
        b.you.hp = Math.min(b.you.maxHp, b.you.hp + Math.floor(b.you.maxHp * 0.06));
        events.push({ type: 'msg', text: 'はげました！ ' + b.you.name + ' の こうげきが あがった！' });
        events.push({ type: 'cheer' });
      } else {
        const move = b.you.moves[action.index];
        const youFirst = b.you.stats.spd >= b.foe.stats.spd
          ? true : (rng() < 0.12);   // おそくても たまに先手
        if (youFirst) {
          useMove(b.you, b.foe, move, events, 'you');
          if (b.foe.hp > 0) useMove(b.foe, b.you, foeChoice(), events, 'foe');
        } else {
          useMove(b.foe, b.you, foeChoice(), events, 'foe');
          if (b.you.hp > 0) useMove(b.you, b.foe, move, events, 'you');
        }
        finish(events);
        return events;
      }

      // にげ失敗・おうえん のあとは相手のターン
      useMove(b.foe, b.you, foeChoice(), events, 'foe');
      finish(events);
      return events;
    };

    function finish(events) {
      if (b.foe.hp <= 0) {
        b.over = true; b.win = 'win';
        events.push({ type: 'faint', side: 'foe' });
        events.push({ type: 'msg', text: b.foe.name + ' は たおれた！' });
        events.push({ type: 'end', result: 'win' });
      } else if (b.you.hp <= 0) {
        b.over = true; b.win = 'lose';
        events.push({ type: 'faint', side: 'you' });
        events.push({ type: 'msg', text: b.you.name + ' は めを まわしてしまった…' });
        events.push({ type: 'end', result: 'lose' });
      }
    }

    return b;
  }

  // 勝ったときの経験値
  function rewardExp(foe, kind) {
    const k = kind === 'ancestor' ? 9 : 4.5;
    return Math.round(foe.stats.level * k + 12);
  }

  global.Battle = { create, makeFoe, wildFor, ancestorFoe, rewardExp };
})(window);
