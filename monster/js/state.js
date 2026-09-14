// せかいの状態 ―― といっても、ここにあるのは「いま あなたが育てている 1 匹」だけ。
//
// ■ 設計の背骨
//   1. データは 100% このブラウザ（localStorage）。サーバも共有もない。
//   2. 時間は実時間。タブを閉じているあいだも、そのコは生きている。
//   3. 死ぬ。ただし死因は「時間」ではなく「呼ばれたのに応えなかった回数（ケアミス）」。
//      メーター直結で殺すと、8 時間ねただけで詰む。本家たまごっちが偉いのはここ。
//   4. 救済が 2 枚：夜（22〜7 時）はモンスターも寝るのでコールが出ない。
//      おでかけ中もコールが出ない。放置したいときは、送り出してから閉じる。
//   5. 旅立ったら図鑑に残り、とっくんと見ための一部を次のタマゴに遺す。
(function (global) {
  'use strict';

  const PET_KEY = 'monster.pet.v2';
  const CLOCK_KEY = 'monster.clock.v2';

  const MIN = 60e3;
  const HOUR = 3600e3;

  const LIFESPAN = 168 * HOUR;      // 天寿 ＝ 7 日
  const MISS_DEATH = 30;            // ケアミスが これに達すると 衰弱して旅立つ
  const MISS_WEAK = 20;             // これを超えると「よわり」状態
  const CALL_AT = 25;               // メーターが これを切ると コールが出る
  const MISS_IV_ONLINE = 30 * MIN;  // 見ているのに 無視しつづけた場合の間隔
  const MISS_IV_OFFLINE = 3 * HOUR; // 留守のあいだの間隔
  const MISS_ABSENCE_BASE = 4;      // 12 時間までの留守で増えるケアミスの上限
  const MISS_ABSENCE_MAX = 14;      // どれだけ長い留守でも これ以上は増えない
  const NIGHT_FROM = 22, NIGHT_TO = 7;
  const NIGHT_RATE = 1 / 3;         // 夜・おでかけ中の 減りかた
  const HATCH_EXP = 30;
  const MAX_LEVEL = 60;
  const MEND_COOL = HOUR;           // 「かいふく」で ケアミスを 1 減らせる間隔
  const EXP_MS = 120000;            // 2 分で 1 経験値
  const AWAY_MS = 3 * MIN;          // これ以上あいたら「留守だった」とみなす

  // おせわパラメータが 100 → 0 になるまでの時間
  const DECAY = { food: 8 * HOUR, mood: 10 * HOUR, energy: 13 * HOUR, clean: 15 * HOUR };
  const CARE_KEYS = ['food', 'mood', 'energy', 'clean'];
  const CARE_LABEL = { food: 'まんぷく', mood: 'きげん', energy: 'げんき', clean: 'せいけつ' };
  const CALL_LABEL = { food: 'おなかが すいた', mood: 'さびしい', energy: 'ねむい', clean: 'よごれちゃった' };

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  // ---- 単調時計 ---------------------------------------------------------
  // 端末の時計を戻されても ケアミスがチャラにならないように、
  // 「これまでに見たいちばん新しい時刻」より前には戻らない now() を使う。
  let clockFloor = 0;
  let clockSavedAt = 0;
  try { clockFloor = Number(localStorage.getItem(CLOCK_KEY)) || 0; } catch (e) { clockFloor = 0; }

  function now() {
    const t = Date.now();
    if (t < clockFloor) return clockFloor;
    clockFloor = t;
    if (t - clockSavedAt > 30e3) {
      clockSavedAt = t;
      try { localStorage.setItem(CLOCK_KEY, String(t)); } catch (e) { /* 無視 */ }
    }
    return t;
  }

  // 1 回の留守で増やしていい ケアミスの上限。
  // ひと晩（〜12 時間）は 4 で頭打ち ＝ 寝ているあいだに死なない。
  // そこから先は 3 時間ごとに 1 ずつ増える ＝ 何日も放りっぱなしにすると ちゃんと死ぬ。
  function absenceCap(ms) {
    if (ms <= 12 * HOUR) return MISS_ABSENCE_BASE;
    return Math.min(MISS_ABSENCE_MAX,
      MISS_ABSENCE_BASE + Math.floor((ms - 12 * HOUR) / (3 * HOUR)));
  }

  function isNight(t) {
    const h = new Date(t).getHours();
    return h >= NIGHT_FROM || h < NIGHT_TO;
  }

  // ---- タマゴを作る -----------------------------------------------------

  function freshPet(opts) {
    opts = opts || {};
    const t = opts.bornAt || now();
    const gift = opts.gift || { hp: 0, atk: 0, def: 0, spd: 0 };
    return {
      v: 2,
      seed: opts.seed || ('egg:' + t + ':' + Math.floor(Math.random() * 1e9)),
      lineage: opts.lineage || null,
      gen: opts.gen || 1,
      gift: gift,
      bornAt: t,
      careAt: t,
      seenAt: t,
      exp: 0,
      care: { food: 85, mood: 85, energy: 95, clean: 95 },
      train: { hp: gift.hp, atk: gift.atk, def: gift.def, spd: gift.spd },
      actions: { feed: 0, play: 0, bath: 0, sleep: 0, train: 0, pet: 0, outing: 0 },
      battles: { win: 0, lose: 0, ghost: 0 },
      careMiss: 0,
      missAccum: 0,
      comfortMs: 0,
      lastMend: 0,
      outing: null,
      keepsakes: [],      // おでかけで拾った「おもいで」
      log: [],
      dead: null
    };
  }

  function normalize(p) {
    if (!p || p.v !== 2 || !p.seed) return null;
    const f = freshPet({ bornAt: p.bornAt || now() });
    p.care = Object.assign({}, f.care, p.care || {});
    p.train = Object.assign({}, f.train, p.train || {});
    p.actions = Object.assign({}, f.actions, p.actions || {});
    p.battles = Object.assign({}, f.battles, p.battles || {});
    p.gift = Object.assign({}, f.gift, p.gift || {});
    p.exp = Math.max(0, Number(p.exp) || 0);
    p.gen = Number(p.gen) || 1;
    p.careAt = Number(p.careAt) || p.bornAt;
    p.seenAt = Number(p.seenAt) || p.careAt;
    p.careMiss = Math.max(0, Number(p.careMiss) || 0);
    p.missAccum = Math.max(0, Number(p.missAccum) || 0);
    p.comfortMs = Math.max(0, Number(p.comfortMs) || 0);
    p.lastMend = Number(p.lastMend) || 0;
    p.keepsakes = Array.isArray(p.keepsakes) ? p.keepsakes.slice(-12) : [];
    p.log = Array.isArray(p.log) ? p.log.slice(-40) : [];
    if (p.outing && !(p.outing.endsAt > 0)) p.outing = null;
    return p;
  }

  // ---- 時間を進める -----------------------------------------------------
  //
  // 5 分きざみで、そのときの状況（夜／おでかけ中／ふつう）を見ながら進める。
  // 返り値は「そのあいだに起きたこと」＝ るすばん日記のタネ。
  function advance(p, target, offline, cap) {
    const events = [];
    if (p.dead) return events;
    let t = p.careAt;
    if (target <= t) { p.careAt = Math.max(t, target); return events; }

    const STEP = 5 * MIN;
    const iv = offline ? MISS_IV_OFFLINE : MISS_IV_ONLINE;
    const limit = offline ? (cap === undefined ? MISS_ABSENCE_BASE : cap) : Infinity;
    let absenceMiss = 0;
    let guard = 0;
    let wasOuting = !!(p.outing && t < p.outing.endsAt);

    while (t < target && guard++ < 40000) {
      const next = Math.min(target, t + STEP);
      const dt = next - t;
      const mid = t + dt / 2;

      const outing = !!(p.outing && mid < p.outing.endsAt);
      if (wasOuting && !outing) events.push({ t: p.outing.endsAt, kind: 'home' });
      wasOuting = outing;

      const night = isNight(mid);
      const egg = p.exp < HATCH_EXP;
      const rate = (outing || night) ? NIGHT_RATE : 1;

      CARE_KEYS.forEach((k) => {
        p.care[k] = clamp(p.care[k] - (dt / DECAY[k]) * 100 * rate, 0, 100);
      });

      // おでかけ中は 自然な経験値が入らない（安全だが のびない）
      if (!outing) p.exp += (dt / EXP_MS) * (night ? 0.6 : 1);

      // コール判定。タマゴ・夜・おでかけ中は 呼ばない ＝ ケアミスも出ない
      const awake = !night && !outing && !egg;
      let worst = null, worstV = 999;
      if (awake) {
        CARE_KEYS.forEach((k) => {
          if (p.care[k] < CALL_AT && p.care[k] < worstV) { worst = k; worstV = p.care[k]; }
        });
      }
      if (worst) {
        p.missAccum += dt;
        while (p.missAccum >= iv) {
          p.missAccum -= iv;
          if (absenceMiss >= limit) { p.missAccum = 0; break; }
          p.careMiss++;
          absenceMiss++;
          events.push({ t: next, kind: 'miss', key: worst });
          if (p.careMiss >= MISS_DEATH) break;
        }
      } else {
        p.missAccum = 0;   // 応えた／呼んでいない あいだは たまらない
      }

      const avg = (p.care.food + p.care.mood + p.care.energy + p.care.clean) / 4;
      if (avg >= 80) p.comfortMs += dt;

      t = next;
      if (p.careMiss >= MISS_DEATH) break;
    }
    p.careAt = t;
    return events;
  }

  // ---- 成長 -------------------------------------------------------------

  function expToReach(level) {
    if (level <= 1) return 0;
    return Math.round(18 * Math.pow(level - 1, 1.55));
  }
  function levelOf(exp) {
    let l = 1;
    while (l < MAX_LEVEL && exp >= expToReach(l + 1)) l++;
    return l;
  }
  function levelProgress(exp) {
    const l = levelOf(exp);
    if (l >= MAX_LEVEL) return { level: l, cur: 1, need: 1, ratio: 1 };
    const a = expToReach(l), b = expToReach(l + 1);
    return { level: l, cur: Math.floor(exp - a), need: b - a, ratio: clamp((exp - a) / (b - a), 0, 1) };
  }
  function stageOf(p) {
    if (p.exp < HATCH_EXP) return 0;
    const l = levelOf(p.exp);
    if (l < 10) return 1;
    if (l < 26) return 2;
    return 3;
  }
  function branchOf(p) {
    const t = p.train;
    let best = 'atk', bv = -1;
    ['hp', 'atk', 'def', 'spd'].forEach((k) => { if (t[k] > bv) { bv = t[k]; best = k; } });
    if (bv === 0) best = 'atk';
    return best;
  }

  function condition(p) {
    const c = p.care;
    const avg = (c.food + c.mood + c.energy + c.clean) / 4;
    let v = 0.72 + (avg / 100) * 0.28;
    if (p.careMiss >= MISS_WEAK) v *= 0.55;    // よわり：ステータスがごっそり落ちる
    return clamp(v, 0.2, 1.0);
  }

  function statsOf(genome, p) {
    const lv = levelOf(p.exp);
    const b = genome.base, t = p.train;
    const cond = condition(p);
    const st = {
      level: lv,
      hp:  Math.floor((b.hp * 2 + t.hp) * lv / 100) + lv + 10,
      atk: Math.floor(((b.atk * 2 + t.atk) * lv / 100 + 5) * cond),
      def: Math.floor(((b.def * 2 + t.def) * lv / 100 + 5) * cond),
      spd: Math.floor(((b.spd * 2 + t.spd) * lv / 100 + 5) * cond)
    };
    st.hp = Math.max(12, st.hp);
    return st;
  }

  // ---- 保存 -------------------------------------------------------------

  function readPet() {
    try { return normalize(JSON.parse(localStorage.getItem(PET_KEY) || 'null')); } catch (e) { return null; }
  }
  function writePet(p) {
    try { localStorage.setItem(PET_KEY, JSON.stringify(p)); } catch (e) { /* 無視 */ }
  }

  function durText(ms) {
    ms = Math.max(0, ms);
    const h = Math.floor(ms / HOUR);
    const d = Math.floor(h / 24);
    if (d > 0) return d + '日' + (h % 24) + '時間';
    if (h > 0) return h + '時間' + Math.floor((ms % HOUR) / MIN) + '分';
    return Math.floor(ms / MIN) + '分';
  }

  // ---- 公開 -------------------------------------------------------------

  const World = {
    LIFESPAN, MISS_DEATH, MISS_WEAK, CALL_AT, HATCH_EXP, MAX_LEVEL,
    CARE_KEYS, CARE_LABEL, CALL_LABEL, DECAY, MEND_COOL, AWAY_MS,
    now, isNight, durText, clamp, absenceCap,
    levelOf, levelProgress, expToReach, stageOf, branchOf, statsOf, condition,

    state: null,
    genome: null,
    awayMs: 0,          // 直前の留守時間（0 なら 留守ではなかった）
    awayEvents: [],     // そのあいだに起きたこと

    init: function () {
      let p = readPet();
      if (!p) p = freshPet({});
      this.state = p;
      this.genome = Species.makeGenome(p.seed, p.lineage);

      const t = now();
      const gap = t - p.seenAt;
      this.awayMs = gap > AWAY_MS ? gap : 0;
      this.awayEvents = advance(p, t, this.awayMs > 0, absenceCap(gap));
      this.checkDeath();
      p.seenAt = t;
      writePet(p);
      return this;
    },

    tick: function () {
      const p = this.state;
      if (p.dead) return;
      advance(p, now(), false);
      p.seenAt = now();
      this.checkDeath();
    },

    save: function () {
      writePet(this.state);
    },

    addLog: function (text) {
      this.state.log.push({ t: now(), text: text });
      if (this.state.log.length > 40) this.state.log = this.state.log.slice(-40);
    },

    // ---- 生と死 ----------------------------------------------------------

    isWeak: function () { return !this.state.dead && this.state.careMiss >= MISS_WEAK; },
    isOuting: function () { return !!(this.state.outing && now() < this.state.outing.endsAt); },
    isDead: function () { return !!this.state.dead; },

    // いま鳴いているメーター（つよい順）
    callKeys: function () {
      const p = this.state;
      if (p.dead || this.isOuting() || isNight(now()) || stageOf(p) === 0) return [];
      return CARE_KEYS.filter((k) => p.care[k] < CALL_AT)
        .sort((a, b) => p.care[a] - p.care[b]);
    },

    ageMs: function () { return now() - this.state.bornAt; },
    lifeLeftMs: function () { return Math.max(0, this.state.bornAt + LIFESPAN - now()); },
    lifeRatio: function () { return clamp((now() - this.state.bornAt) / LIFESPAN, 0, 1); },

    checkDeath: function () {
      const p = this.state;
      if (p.dead) return p.dead;
      if (stageOf(p) === 0 && p.careMiss < MISS_DEATH) {
        // タマゴは死なない（コールも出ないので、ここには来ないはず）
      }
      if (p.careMiss >= MISS_DEATH) {
        p.dead = { at: now(), cause: 'weak' };
      } else if (now() - p.bornAt >= LIFESPAN) {
        p.dead = { at: p.bornAt + LIFESPAN, cause: 'age' };
      }
      if (p.dead) writePet(p);
      return p.dead;
    },

    // ケアミスをひとつ返上する（全メーター 90 以上のときだけ、1 時間に 1 回）
    tryMend: function () {
      const p = this.state;
      if (p.dead || p.careMiss <= 0) return false;
      if (now() - p.lastMend < MEND_COOL) return false;
      const ok = CARE_KEYS.every((k) => p.care[k] >= 90);
      if (!ok) return false;
      p.careMiss = Math.max(0, p.careMiss - 1);
      p.lastMend = now();
      return true;
    },

    // 旅立ち → 図鑑に記録して、次のタマゴを迎える。おくりものを返す。
    nextGeneration: function () {
      const p = this.state;
      const dead = p.dead || { at: now(), cause: 'weak' };
      const record = Dex.record(p, this.genome, dead);
      Dex.add(record);

      const rng = Rng.makeRng('heir:' + p.seed + ':' + dead.at);
      // おくりものは「七日 生きたか」ではなく「どう生きたか」で決まる。
      // 一度も来ないまま七日たっても、それは天寿とは呼ばない。
      const ratio = Dex.giftRatio(record);
      const gift = {};
      ['hp', 'atk', 'def', 'spd'].forEach((k) => {
        gift[k] = Math.min(48, Math.floor(p.train[k] * ratio));
      });
      const trait = Species.pickTrait(this.genome, rng);
      const blessed = Dex.blessedNext();

      const child = freshPet({
        seed: 'egg:' + dead.at + ':' + rng.int(0, 1e9),
        gift: gift,
        gen: p.gen + 1,
        bornAt: now(),
        lineage: {
          parentSeed: p.seed,
          parentName: record.name,
          traits: (function () { const o = {}; o[trait.key] = trait.value; return o; })(),
          depth: (p.lineage && p.lineage.depth ? p.lineage.depth : 0) + 1,
          blessed: blessed
        }
      });
      this.state = child;
      this.genome = Species.makeGenome(child.seed, child.lineage);
      this.awayMs = 0;
      this.awayEvents = [];
      writePet(child);
      return { record: record, gift: gift, trait: trait, blessed: blessed };
    },

    // 図鑑を空にして 1 代目からやり直す
    resetAll: function () {
      Dex.clear();
      if (global.Items) Items.clear();
      const p = freshPet({});
      this.state = p;
      this.genome = Species.makeGenome(p.seed, null);
      this.awayMs = 0;
      this.awayEvents = [];
      writePet(p);
    },

    // ---- 見えかた --------------------------------------------------------

    ageText: function () { return durText(this.ageMs()); },
    lifeLeftText: function () { return durText(this.lifeLeftMs()); },

    name: function () {
      return Species.nameFor(this.genome, stageOf(this.state), branchOf(this.state));
    },
    look: function () {
      const sad = this.callKeys().length > 0;
      return Species.lookFor(this.genome, stageOf(this.state), branchOf(this.state),
        { sad: sad, weak: this.isWeak() });
    },
    stats: function () { return statsOf(this.genome, this.state); },
    moves: function () { return Species.movesFor(this.genome, levelOf(this.state.exp)); },
    totalActions: function () {
      const a = this.state.actions;
      return Object.keys(a).reduce((s, k) => s + (a[k] || 0), 0);
    }
  };

  global.World = World;
})(window);
