// せかいの状態。
//
// ■ みんなで同じコを育てる仕組み
//   1. 時計はみんな共通。EPOCH からの経過時間で「シーズン番号」が決まり、
//      シーズン番号がそのままタマゴのシードになる。だから世界じゅうのブラウザで
//      まったく同じ種族・色・名前・進化先のモンスターが生まれる。
//   2. 経験値は時間でも自然に増える。誰も来なくても育つし、
//      いつアクセスしても「みんなが育てた結果」に追いつく。
//   3. おせわ・バトルの記録は共有ストレージ（Sync）があればそこに、
//      なければブラウザの localStorage に貯まる。
(function (global) {
  'use strict';

  const KEY = 'monster.world.v1';
  const ME_KEY = 'monster.me.v1';
  const WORLD_EPOCH = Date.UTC(2026, 0, 1, 0, 0, 0);
  const SEASON_MS = 7 * 24 * 60 * 60 * 1000;   // 1 シーズン = 7 日
  const HATCH_EXP = 30;                        // タマゴがかえるのに必要な経験値
  const MAX_LEVEL = 60;

  // おせわパラメータが 100 → 0 になるまでの時間（ミリ秒）
  const TIME_FLOOR = 20;
  const DECAY = { food: 8 * 3600e3, mood: 10 * 3600e3, energy: 13 * 3600e3, clean: 15 * 3600e3 };

  function now() { return Date.now(); }
  function seasonOf(t) { return Math.floor((t - WORLD_EPOCH) / SEASON_MS); }
  function seasonStart(s) { return WORLD_EPOCH + s * SEASON_MS; }

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function freshState(season) {
    return {
      season: season,
      exp: 0,
      care: { food: 80, mood: 80, energy: 90, clean: 90 },
      careAt: seasonStart(season),
      train: { hp: 0, atk: 0, def: 0, spd: 0 },
      actions: { feed: 0, play: 0, bath: 0, sleep: 0, train: 0, pet: 0 },
      battles: { win: 0, lose: 0 },
      bossDay: 0,
      caretakers: {},
      log: [],
      rev: 0
    };
  }

  function normalize(s, season) {
    const f = freshState(season);
    if (!s || s.season !== season) return f;
    s.care = Object.assign({}, f.care, s.care || {});
    s.train = Object.assign({}, f.train, s.train || {});
    s.actions = Object.assign({}, f.actions, s.actions || {});
    s.battles = Object.assign({}, f.battles, s.battles || {});
    s.bossDay = Number(s.bossDay) || 0;
    s.caretakers = s.caretakers || {};
    s.log = Array.isArray(s.log) ? s.log.slice(-40) : [];
    s.exp = Math.max(0, Number(s.exp) || 0);
    s.careAt = Number(s.careAt) || f.careAt;
    s.rev = Number(s.rev) || 0;
    return s;
  }

  // 時間の経過ぶんだけ、おせわパラメータを減らす＆経験値を足す
  function applyTime(s, t) {
    const dt = Math.max(0, t - s.careAt);
    if (dt <= 0) return s;
    // 時間による自然減。ただし「誰かが最低限は見てくれていた」ことにして
    // 20 より下には落とさない（久しぶりに来た人がいきなり詰まないように）。
    Object.keys(DECAY).forEach((k) => {
      const floor = Math.min(s.care[k], TIME_FLOOR);
      s.care[k] = clamp(Math.max(floor, s.care[k] - (dt / DECAY[k]) * 100), 0, 100);
    });
    s.exp += dt / 120000;                   // 2 分で 1 経験値（世界共通のペース）
    s.careAt = t;
    return s;
  }

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

  function stageOf(s) {
    if (s.exp < HATCH_EXP) return 0;
    const l = levelOf(s.exp);
    if (l < 10) return 1;
    if (l < 26) return 2;
    return 3;
  }

  function branchOf(s) {
    const t = s.train;
    let best = 'atk', bv = -1;
    ['hp', 'atk', 'def', 'spd'].forEach((k) => { if (t[k] > bv) { bv = t[k]; best = k; } });
    if (bv === 0) best = 'atk';
    return best;
  }

  // コンディション：おせわが行き届いているほど 1.0 に近づく
  function condition(s) {
    const c = s.care;
    const avg = (c.food + c.mood + c.energy + c.clean) / 4;
    return clamp(0.72 + (avg / 100) * 0.28, 0.72, 1.0);
  }

  function statsOf(genome, s) {
    const lv = levelOf(s.exp);
    const b = genome.base, t = s.train;
    const cond = condition(s);
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

  // ---- 保存まわり -------------------------------------------------------

  function readLocal() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; }
  }
  function writeLocal(s) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* 容量オーバーは無視 */ }
  }

  function me() {
    let m = null;
    try { m = JSON.parse(localStorage.getItem(ME_KEY) || 'null'); } catch (e) { m = null; }
    if (!m || !m.name) {
      m = { name: '', id: Math.random().toString(36).slice(2, 8) };
      writeMe(m);
    }
    return m;
  }
  function writeMe(m) {
    try { localStorage.setItem(ME_KEY, JSON.stringify(m)); } catch (e) { /* 無視 */ }
  }
  function displayName() {
    const m = me();
    return m.name || ('ななしさん#' + m.id);
  }

  // 2 つの状態をぶつからないようにマージする。
  // 累計系は大きいほう、おせわパラメータは新しいほうを採用。
  function merge(a, b) {
    if (!a) return b;
    if (!b) return a;
    if (a.season !== b.season) return a.season > b.season ? a : b;
    const out = JSON.parse(JSON.stringify(a.careAt >= b.careAt ? a : b));
    out.exp = Math.max(a.exp, b.exp);
    ['hp', 'atk', 'def', 'spd'].forEach((k) => { out.train[k] = Math.max(a.train[k], b.train[k]); });
    Object.keys(out.actions).forEach((k) => { out.actions[k] = Math.max(a.actions[k] || 0, b.actions[k] || 0); });
    out.battles.win = Math.max(a.battles.win, b.battles.win);
    out.battles.lose = Math.max(a.battles.lose, b.battles.lose);
    out.bossDay = Math.max(a.bossDay || 0, b.bossDay || 0);
    out.caretakers = Object.assign({}, b.caretakers, a.caretakers);
    Object.keys(b.caretakers || {}).forEach((k) => {
      out.caretakers[k] = Math.max(a.caretakers[k] || 0, b.caretakers[k] || 0);
    });
    const seen = {};
    out.log = (a.log || []).concat(b.log || [])
      .filter((e) => { const k = e.t + '|' + e.text; if (seen[k]) return false; seen[k] = true; return true; })
      .sort((x, y) => x.t - y.t).slice(-40);
    out.rev = Math.max(a.rev, b.rev) + 1;
    return out;
  }

  const World = {
    SEASON_MS, HATCH_EXP, MAX_LEVEL, WORLD_EPOCH,
    now, seasonOf, seasonStart, levelOf, levelProgress, expToReach,
    stageOf, branchOf, statsOf, condition, applyTime, merge,
    me, writeMe, displayName,

    season: null,
    genome: null,
    state: null,

    init: function () {
      const t = now();
      this.season = seasonOf(t);
      this.genome = Species.makeGenome(this.season);
      this.state = normalize(readLocal(), this.season);
      applyTime(this.state, t);
      writeLocal(this.state);
      return this;
    },

    // 外（共有ストレージ）から来た状態を取りこむ
    adopt: function (remote) {
      if (!remote) return false;
      const r = normalize(remote, this.season);
      applyTime(r, now());
      this.state = merge(this.state, r);
      writeLocal(this.state);
      return true;
    },

    tick: function () {
      applyTime(this.state, now());
    },

    save: function () {
      this.state.rev++;
      writeLocal(this.state);
      if (global.Sync) global.Sync.push(this.state);
    },

    addLog: function (text) {
      this.state.log.push({ t: now(), name: displayName(), text: text });
      if (this.state.log.length > 40) this.state.log = this.state.log.slice(-40);
      const n = displayName();
      this.state.caretakers[n] = (this.state.caretakers[n] || 0) + 1;
    },

    ageText: function () {
      const ms = now() - seasonStart(this.season);
      const h = Math.floor(ms / 3600e3);
      const d = Math.floor(h / 24);
      return d > 0 ? (d + '日' + (h % 24) + '時間') : (h + '時間' + Math.floor((ms % 3600e3) / 60000) + '分');
    },

    seasonLeftText: function () {
      const ms = seasonStart(this.season + 1) - now();
      const h = Math.floor(ms / 3600e3);
      const d = Math.floor(h / 24);
      return d > 0 ? (d + '日' + (h % 24) + '時間') : (h + '時間' + Math.floor((ms % 3600e3) / 60000) + '分');
    },

    totalActions: function () {
      const a = this.state.actions;
      return Object.keys(a).reduce((s, k) => s + a[k], 0);
    },

    name: function () {
      return Species.nameFor(this.genome, stageOf(this.state), branchOf(this.state));
    },
    look: function () {
      return Species.lookFor(this.genome, stageOf(this.state), branchOf(this.state));
    },
    stats: function () {
      return statsOf(this.genome, this.state);
    },
    moves: function () {
      return Species.movesFor(this.genome, levelOf(this.state.exp));
    }
  };

  global.World = World;
})(window);
