// ミニゲームあつめ。あそぶと お金と お宝が もらえる。
// このモジュールは じぶんで DOM と スタイルを つくって、
// おわったら ぜんぶ 片づけてから resolve する。
// 外に出すのは MINIGAMES と playMinigame だけ。

import { randInt, pick, shuffle, clamp } from './rng.js';
import { drawFace, randomFace } from './face.js';

/* ══════════════════════════════════════════════
   ゲーム一覧
   ══════════════════════════════════════════════ */

export const MINIGAMES = [
  {
    id: 'daruma',
    name: 'だるまさんが ころんだ',
    emoji: '🚦',
    desc: 'おにが むこうを むいている あいだだけ すすむ。ふりむかれたら とまろう。',
    fee: 0,
  },
  {
    id: 'memory',
    name: 'えあわせ',
    emoji: '🃏',
    desc: 'おなじ 絵を さがして そろえる。手が すくないほど できばえアップ。',
    fee: 0,
  },
  {
    id: 'babanuki',
    name: 'ババぬき',
    emoji: '🂠',
    desc: '島の 3 人と ババぬき。さいごに ジョーカーが のこったら まけ。',
    fee: 0,
  },
  {
    id: 'rhythm',
    name: 'リズムたたき',
    emoji: '🥁',
    desc: 'おちてくる マークを 線に あわせて たたく。60 こ ノーツ。',
    fee: 0,
  },
];

/* ══════════════════════════════════════════════
   スタイル（1 回だけ 注入する。mg- だけに あてる）
   ══════════════════════════════════════════════ */

const STYLE_ID = 'mg-style-v1';
let styleInjected = false;

function ensureStyle() {
  if (styleInjected) return;
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) { styleInjected = true; return; }
  const st = document.createElement('style');
  st.id = STYLE_ID;
  st.textContent = MG_CSS;
  (document.head || document.documentElement).appendChild(st);
  styleInjected = true;
}

const MG_CSS = `
.mg-root{
  align-self:stretch; flex:1 1 auto; max-width:100%; min-width:0;
  --mg-ink:#4a4059; --mg-sub:#8b82a0; --mg-line:#e7ddf2;
  --mg-bg:#fff8fb; --mg-card:#ffffff; --mg-pink:#ffc7dd; --mg-blue:#bfe4ff;
  --mg-mint:#c6f0dd; --mg-lemon:#ffeab0; --mg-grape:#ded0ff; --mg-hot:#ff8fb4;
  position:relative; display:flex; flex-direction:column; gap:10px;
  width:100%; height:100%; min-height:380px; box-sizing:border-box;
  padding:10px; background:linear-gradient(170deg,#fff8fb 0%,#f2f7ff 100%);
  color:var(--mg-ink); font-family:system-ui,-apple-system,"Hiragino Maru Gothic ProN","Yu Gothic",sans-serif;
  -webkit-tap-highlight-color:transparent; overflow:hidden;
}
.mg-root *{box-sizing:border-box;}
.mg-head{display:flex; align-items:center; gap:8px; flex:0 0 auto; min-width:0; flex-wrap:nowrap;}
.mg-title{font-size:clamp(14px,4.2vw,18px); font-weight:800; letter-spacing:.02em;
  flex:0 1 auto; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}
.mg-status{margin-left:auto; font-size:clamp(11px,3.2vw,14px); font-weight:700; color:var(--mg-sub);
  background:#fff; border-radius:999px; padding:6px 10px; border:2px solid var(--mg-line);
  white-space:nowrap; flex:0 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis;}
.mg-quit{flex:0 0 auto; min-height:44px; min-width:72px; padding:0 12px; border:none; border-radius:999px;
  background:#fff; color:var(--mg-sub); font-size:14px; font-weight:800;
  border:2px solid var(--mg-line); cursor:pointer; touch-action:manipulation;}
.mg-quit:active{transform:scale(.96);}
.mg-body{flex:1 1 auto; display:flex; flex-direction:column; gap:10px; min-height:0;}
.mg-stagebox{position:relative; flex:1 1 auto; min-height:150px; border-radius:18px;
  overflow:hidden; background:#eaf6ff; border:3px solid #fff; box-shadow:0 4px 14px rgba(120,110,160,.14);}
.mg-canvas{display:block; width:100%; height:100%; touch-action:none;}
.mg-btn{min-height:52px; padding:10px 18px; border:none; border-radius:16px;
  background:var(--mg-grape); color:#3d3550; font-size:16px; font-weight:800;
  cursor:pointer; touch-action:manipulation; box-shadow:0 3px 0 rgba(120,110,160,.28);}
.mg-btn:active{transform:translateY(2px); box-shadow:0 1px 0 rgba(120,110,160,.28);}
.mg-btn-main{background:var(--mg-hot); color:#fff; font-size:20px; min-height:76px; width:100%;}
.mg-btn-row{display:flex; gap:10px; flex:0 0 auto;}
.mg-btn-row .mg-btn{flex:1;}
.mg-note{font-size:13px; color:var(--mg-sub); text-align:center; line-height:1.5;}
.mg-big{font-size:22px; font-weight:900; text-align:center;}

/* だるま */
.mg-daruma-pad{flex:0 0 auto;}
.mg-beltwrap{flex:1 1 auto; display:flex; align-items:center; justify-content:center;
  min-height:0; min-width:0;}
.mg-belt{flex:0 1 auto; width:100%; aspect-ratio:16/9; min-height:0; max-height:100%; margin:auto;}
.mg-life{font-size:18px; letter-spacing:2px;}

/* えあわせ */
.mg-gridwrap{flex:1 1 auto; display:flex; align-items:center; justify-content:center;
  min-height:0; min-width:0; container-type:size;}
.mg-grid{display:grid; gap:2.2%; width:100%; max-width:100%; margin:auto; container-type:size;
  /* もとの たてよこ比（cq が つかえない ときの ひかえ） */
  aspect-ratio:var(--mg-ar,1); height:auto; max-height:100%;
  /* たてに あきが あれば カードを すこし たてながに して うめる */
  height:min(100%, calc(100cqw * var(--mg-hr, 1)));}
.mg-card{position:relative; border:none; padding:0; border-radius:14px; cursor:pointer;
  background:var(--mg-blue); line-height:1; width:100%; height:100%; min-width:0; min-height:0;
  font-size:clamp(16px,7vmin,38px); font-size:min(9cqmin,46px);
  display:flex; align-items:center; justify-content:center;
  touch-action:manipulation; box-shadow:0 3px 0 rgba(120,110,160,.22); transition:transform .12s;}
.mg-card-back{color:transparent;}
.mg-card-back::after{content:'？'; position:absolute; inset:0; display:flex; align-items:center;
  justify-content:center; color:#6d8fb5; font-size:.7em; font-weight:900;}
.mg-card-open{background:var(--mg-lemon);}
.mg-card-got{background:var(--mg-mint); opacity:.55; box-shadow:none;}
.mg-choice{display:flex; flex-direction:column; gap:12px; align-items:center; justify-content:center;
  flex:1 1 auto;}

/* ババぬき */
.mg-table{flex:1 1 auto; display:flex; flex-direction:column; gap:8px; min-height:0; overflow:auto;}
.mg-seat{display:flex; align-items:center; gap:8px; background:#fff; border:2px solid var(--mg-line);
  border-radius:16px; padding:6px 8px;}
.mg-seat-on{border-color:var(--mg-hot); background:#fff4f8;}
.mg-seat-out{opacity:.5;}
.mg-seat-face{width:52px; height:52px; flex:0 0 auto; border-radius:50%; overflow:hidden; background:#f4eeff;}
.mg-seat-face .mg-canvas{touch-action:auto;}
.mg-seat-info{flex:1 1 auto; min-width:0;}
.mg-seat-name{font-size:14px; font-weight:800; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}
.mg-seat-say{font-size:12px; color:var(--mg-sub); min-height:16px;}
.mg-backs{display:flex; flex-wrap:wrap; gap:4px; justify-content:flex-end; max-width:56%;}
.mg-back{width:26px; height:38px; border:none; border-radius:5px; padding:0;
  background:repeating-linear-gradient(45deg,#9fb6ff 0 5px,#8aa3f0 5px 10px);
  box-shadow:0 2px 0 rgba(90,90,140,.3); cursor:default; touch-action:manipulation;}
.mg-back-pick{cursor:pointer; width:34px; height:48px; animation:mg-bob .9s ease-in-out infinite;}
.mg-back-pick:active{transform:translateY(3px);}
@keyframes mg-bob{0%,100%{transform:translateY(0);}50%{transform:translateY(-4px);}}
.mg-hand{display:flex; flex-wrap:wrap; gap:5px; padding:6px; background:#fff;
  border:2px solid var(--mg-line); border-radius:16px; flex:0 0 auto;}
.mg-pc{width:38px; height:54px; border-radius:7px; background:#fff; border:2px solid #d8d2e6;
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  font-size:15px; font-weight:800; line-height:1.05;}
.mg-pc-red{color:#e0537a;}
.mg-pc-blk{color:#4a4059;}
.mg-pc-joker{background:linear-gradient(160deg,#ffe0f0,#ded0ff); color:#7a4fa8; font-size:20px;}
.mg-pc-new{outline:3px solid var(--mg-hot); outline-offset:1px;}

/* リズム */
.mg-lanes{display:flex; gap:7px; flex:0 0 auto;}
.mg-lane-btn{flex:1; min-height:84px; border:none; border-radius:18px; background:var(--mg-grape);
  box-shadow:0 4px 0 rgba(120,110,160,.3); cursor:pointer; touch-action:manipulation;
  font-size:26px; color:#fff;}
.mg-lane-btn:active,.mg-lane-btn.mg-lane-hit{transform:translateY(3px); background:var(--mg-hot);
  box-shadow:0 1px 0 rgba(120,110,160,.3);}

/* 結果 */
.mg-result{flex:1 1 auto; display:flex; flex-direction:column; align-items:center;
  justify-content:center; gap:10px; text-align:center;}
.mg-result-emoji{font-size:54px; line-height:1;}
.mg-result-head{font-size:24px; font-weight:900;}
.mg-result-line{font-size:16px; font-weight:700; color:var(--mg-sub);}
.mg-prize{display:flex; gap:10px; flex-wrap:wrap; justify-content:center;}
.mg-prize span{background:#fff; border:2px solid var(--mg-line); border-radius:999px;
  padding:8px 16px; font-size:16px; font-weight:800;}
.mg-toast{position:absolute; left:50%; top:42%; transform:translate(-50%,-50%);
  background:rgba(255,255,255,.94); border-radius:18px; padding:10px 20px; font-size:20px;
  font-weight:900; pointer-events:none; box-shadow:0 4px 14px rgba(120,110,160,.24);}
`;

/* ══════════════════════════════════════════════
   こまかい どうぐ
   ══════════════════════════════════════════════ */

function div(cls, text) {
  const d = document.createElement('div');
  if (cls) d.className = cls;
  if (text != null) d.textContent = text;
  return d;
}

function button(cls, text) {
  const b = document.createElement('button');
  b.type = 'button';
  if (cls) b.className = cls;
  if (text != null) b.textContent = text;
  return b;
}

/** canvas を 画面の こまかさ（devicePixelRatio）に あわせる。 */
function fitCanvas(cv) {
  const dprRaw = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  const dpr = clamp(dprRaw, 1, 3);
  const r = cv.getBoundingClientRect ? cv.getBoundingClientRect() : { width: 0, height: 0 };
  const w = Math.max(1, Math.round(r.width || cv.clientWidth || 300));
  const h = Math.max(1, Math.round(r.height || cv.clientHeight || 200));
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
  }
  const c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx: c, w, h };
}

/** face.js が まだ 無い／うまく いかない ときも 止まらないように 包む。 */
function safeFace(ctx, face, opts) {
  try {
    if (face && typeof drawFace === 'function') {
      drawFace(ctx, face, opts);
      return;
    }
  } catch (e) { /* かわりの かおを 描く */ }
  fallbackFace(ctx, opts);
}

function fallbackFace(ctx, o) {
  const s = o.size || 80, cx = o.cx || 0, cy = o.cy || 0;
  ctx.save();
  ctx.fillStyle = '#ffe0c0';
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#35304a';
  ctx.beginPath(); ctx.arc(cx - s * 0.14, cy - s * 0.05, s * 0.045, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + s * 0.14, cy - s * 0.05, s * 0.045, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#c8705c'; ctx.lineWidth = Math.max(1.5, s * 0.035); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(cx, cy + s * 0.06, s * 0.15, 0.25 * Math.PI, 0.75 * Math.PI); ctx.stroke();
  ctx.restore();
}

function safeRandomFace(rand) {
  try {
    if (typeof randomFace === 'function') return randomFace(rand);
  } catch (e) { /* なくても へいき */ }
  return null;
}

/** もらえる お金と お宝を きめる。まけても すこしは もらえる。 */
function reward(win, score, rand) {
  const s = clamp(Math.round(score), 0, 100);
  const base = win ? 130 : 34;
  const span = win ? 250 : 66;
  const coins = clamp(Math.round(base + (s / 100) * span) + randInt(0, 18, rand), 30, 400);
  let treasures = 0;
  if (win) {
    treasures = 1;
    if (s >= 70) treasures = 2;
    if (s >= 92) treasures = 3;
  } else if (s >= 78) {
    treasures = 1;
  }
  return { coins, treasures };
}

const QUIT_RESULT = { win: false, score: 0, coins: 0, treasures: 0, quit: true };

/* ══════════════════════════════════════════════
   ステージ（DOM と 後片づけの めんどうを みる）
   ══════════════════════════════════════════════ */

class Stage {
  constructor(host, title, resolve) {
    ensureStyle();
    this.host = host;
    this.resolveFn = resolve;
    this.ac = new AbortController();
    this.timers = new Set();
    this.intervals = new Set();
    this.rafId = 0;
    this.observers = [];
    this.finished = false;
    this.pending = null;

    host.textContent = '';
    this.root = div('mg-root');
    const head = div('mg-head');
    this.titleEl = div('mg-title', title);
    this.statusEl = div('mg-status', '');
    this.quitBtn = button('mg-quit', 'やめる');
    head.append(this.titleEl, this.statusEl, this.quitBtn);
    this.body = div('mg-body');
    this.root.append(head, this.body);
    host.appendChild(this.root);
    this.on(this.quitBtn, 'click', () => {
      if (this.pending) this.finish(this.pending);
      else this.finish(Object.assign({}, QUIT_RESULT));
    });
  }

  status(text) { this.statusEl.textContent = text; }

  on(target, type, fn, opts) {
    const o = Object.assign({}, opts || {}, { signal: this.ac.signal });
    target.addEventListener(type, fn, o);
  }

  after(ms, fn) {
    const id = setTimeout(() => { this.timers.delete(id); if (!this.finished) fn(); }, ms);
    this.timers.add(id);
    return id;
  }

  every(ms, fn) {
    const id = setInterval(() => { if (!this.finished) fn(); }, ms);
    this.intervals.add(id);
    return id;
  }

  /** まいフレーム よばれる。ステージが おわると じどうで 止まる。 */
  loop(fn) {
    const step = (t) => {
      if (this.finished || this.stopped) { this.rafId = 0; return; }
      this.rafId = requestAnimationFrame(step);
      fn(t);
    };
    this.stopped = false;
    this.rafId = requestAnimationFrame(step);
  }

  /** うごきだけ 止める（画面は のこす）。 */
  stopMotion() {
    this.stopped = true;
    if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = 0; }
    this.timers.forEach((id) => clearTimeout(id));
    this.timers.clear();
    this.intervals.forEach((id) => clearInterval(id));
    this.intervals.clear();
  }

  /** 結果がめん。とじると resolve する。 */
  showResult(win, score, rand, lines) {
    const { coins, treasures } = reward(win, score, rand);
    this.pending = { win, score: clamp(Math.round(score), 0, 100), coins, treasures };
    this.stopMotion();
    this.body.textContent = '';
    const box = div('mg-result');
    box.append(div('mg-result-emoji', win ? '🎉' : '💧'));
    box.append(div('mg-result-head', win ? 'やったね！' : 'ざんねん…'));
    (lines || []).forEach((t) => box.append(div('mg-result-line', t)));
    box.append(div('mg-result-line', 'できばえ ' + this.pending.score + ' てん'));
    const prize = div('mg-prize');
    const c = document.createElement('span'); c.textContent = '🪙 ' + coins;
    prize.append(c);
    const tr = document.createElement('span');
    tr.textContent = treasures > 0 ? '🎁 お宝 ' + treasures + ' こ' : '🎁 お宝は なし';
    prize.append(tr);
    box.append(prize);
    const ok = button('mg-btn mg-btn-main', 'おわる');
    this.on(ok, 'click', () => this.finish(this.pending));
    box.append(ok);
    this.body.append(box);
    this.quitBtn.textContent = 'とじる';
  }

  finish(result) {
    if (this.finished) return;
    this.finished = true;
    this.stopMotion();
    this.observers.forEach((o) => { try { o.disconnect(); } catch (e) { /* もう 無い */ } });
    this.observers.length = 0;
    try { this.ac.abort(); } catch (e) { /* もう 止まっている */ }
    try { this.host.textContent = ''; } catch (e) { /* 消えている */ }
    this.resolveFn(result);
  }
}

/* ══════════════════════════════════════════════
   入口
   ══════════════════════════════════════════════ */

/**
 * ミニゲームを あそぶ。
 * @param {string} id MINIGAMES の id
 * @param {HTMLElement} hostEl この中に 画面を つくる
 * @param {{residents?:Array,main?:Object,rand?:Function}} ctx
 * @returns {Promise<{win:boolean,score:number,coins:number,treasures:number,quit?:boolean}>}
 */
export function playMinigame(id, hostEl, ctx = {}) {
  const rand = typeof ctx.rand === 'function' ? ctx.rand : Math.random;
  const c = {
    residents: Array.isArray(ctx.residents) ? ctx.residents.slice() : [],
    main: ctx.main || null,
    rand,
  };
  if (!hostEl || typeof document === 'undefined') {
    return Promise.resolve(Object.assign({}, QUIT_RESULT));
  }
  const starters = {
    daruma: playDaruma,
    memory: playMemory,
    babanuki: playBabanuki,
    rhythm: playRhythm,
  };
  const starter = starters[id];
  if (!starter) return Promise.resolve(Object.assign({}, QUIT_RESULT));
  return new Promise((resolve) => {
    try {
      starter(hostEl, c, resolve);
    } catch (e) {
      try { hostEl.textContent = ''; } catch (e2) { /* 消えている */ }
      resolve(Object.assign({}, QUIT_RESULT));
    }
  });
}

/* ══════════════════════════════════════════════
   1. だるまさんが ころんだ
   ══════════════════════════════════════════════ */

const CHANT = 'だるまさんが ころんだ';

function playDaruma(host, c, resolve) {
  const st = new Stage(host, '🚦 だるまさん', resolve);
  const rand = c.rand;
  const oni = c.residents.find((r) => r && r !== c.main) || c.residents[0] || null;
  const oniFace = (oni && oni.face) || safeRandomFace(rand);
  const oniName = (oni && oni.name) || 'おに';
  const meFace = (c.main && c.main.face) || safeRandomFace(rand);

  const beltwrap = div('mg-beltwrap');
  const box = div('mg-stagebox mg-belt');
  const cv = document.createElement('canvas');
  cv.className = 'mg-canvas';
  box.append(cv);
  beltwrap.append(box);
  const pad = div('mg-daruma-pad');
  const goBtn = button('mg-btn mg-btn-main', 'すすむ（おしっぱなし）');
  pad.append(goBtn);
  const note = div('mg-note', 'おには「' + CHANT + '」と となえて ふりむくよ。ふりむいたら 手を はなそう。');
  st.body.append(beltwrap, pad, note);

  const S = {
    pos: 0,            // 0..1 すすんだ わりあい
    outs: 0,
    holding: false,
    lastMoveAt: -9999,
    phase: 'away',     // away = むこう向き / watch = こっち向き
    phaseStart: 0,
    phaseLen: 1400,
    flash: 0,
    toast: null,
    toastUntil: 0,
    startAt: 0,
    over: false,
  };
  const LIMIT = 70000; // 70 びょう

  function setStatus() {
    const hearts = '❤️'.repeat(Math.max(0, 3 - S.outs)) + '🖤'.repeat(S.outs);
    const left = Math.max(0, Math.ceil((LIMIT - (now() - S.startAt)) / 1000));
    st.status(hearts + ' ' + left);
  }
  function now() { return (typeof performance !== 'undefined' ? performance.now() : Date.now()); }

  function say(text, ms) { S.toast = text; S.toastUntil = now() + (ms || 900); }

  function nextPhase(t) {
    if (S.phase === 'away') {
      S.phase = 'watch';
      S.phaseLen = 700 + rand() * 900;
      // ふりむいた しゅんかん、うごいて いたら アウト
      if (S.holding || t - S.lastMoveAt < 130) outNow(t);
    } else {
      S.phase = 'away';
      S.phaseLen = 900 + rand() * 1900;
    }
    S.phaseStart = t;
  }

  function outNow(t) {
    if (S.over) return;
    S.outs += 1;
    S.flash = t;
    S.pos = Math.max(0, S.pos - 0.1);
    S.holding = false;
    say('アウト！', 1000);
    if (S.outs >= 3) finishGame(false, t);
  }

  function finishGame(win, t) {
    if (S.over) return;
    S.over = true;
    const used = (t - S.startAt) / 1000;
    let score;
    if (win) {
      score = clamp(Math.round(100 - used * 1.1 - S.outs * 12), 25, 100);
    } else {
      score = clamp(Math.round(S.pos * 55), 0, 60);
    }
    const lines = win
      ? ['ゴールまで たどりついた！', 'アウト ' + S.outs + ' かい／' + used.toFixed(1) + ' びょう']
      : (S.outs >= 3 ? ['3 かい アウトに なって しまった…'] : ['じかん切れ…']);
    st.after(500, () => st.showResult(win, score, rand, lines));
  }

  // すすむ ボタン（おしっぱなし）
  const press = (e) => {
    if (S.over) return;
    if (e.cancelable) e.preventDefault();
    S.holding = true;
    if (S.phase === 'watch') outNow(now());
  };
  const release = () => { S.holding = false; };
  st.on(goBtn, 'pointerdown', press);
  st.on(goBtn, 'pointerup', release);
  st.on(goBtn, 'pointercancel', release);
  st.on(goBtn, 'pointerleave', release);
  st.on(goBtn, 'contextmenu', (e) => e.preventDefault());

  let last = 0;
  st.loop((t) => {
    if (!S.startAt) { S.startAt = t; S.phaseStart = t; last = t; }
    const dt = Math.min(64, t - last);
    last = t;

    if (!S.over) {
      if (S.holding) {
        S.pos = Math.min(1, S.pos + dt * 0.00026);
        S.lastMoveAt = t;
        if (S.pos >= 1) finishGame(true, t);
      }
      if (t - S.phaseStart > S.phaseLen) nextPhase(t);
      if (t - S.startAt > LIMIT) finishGame(false, t);
      setStatus();
    }
    drawDaruma(cv, S, t, { oniFace, oniName, meFace });
  });
}

/** 文字が はみ出さない ように、はばを 測って ちいさくする。 */
function fitText(ctx, text, maxW, startPx, minPx, weight) {
  let px = Math.max(minPx, Math.round(startPx));
  const set = () => { ctx.font = (weight || '700') + ' ' + px + 'px system-ui,sans-serif'; };
  set();
  let guard = 0;
  while (px > minPx && ctx.measureText(text).width > maxW && guard < 200) {
    px -= 1; set(); guard++;
  }
  return px;
}

function drawDaruma(cv, S, t, art) {
  const { ctx, w, h } = fitCanvas(cv);
  const groundY = h * 0.94;
  // そら と じめん
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#d9f0ff');
  sky.addColorStop(1, '#f6fbff');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#cdeecb'; ctx.fillRect(0, groundY, w, h - groundY);
  ctx.fillStyle = '#b7e3b4';
  for (let i = 0; i < 10; i++) {
    ctx.fillRect(((i * 97) % w), groundY + 5 + ((i * 31) % Math.max(6, h - groundY - 8)), 16, 3);
  }

  // キャラクターの おおきさ（ベルトの たかさに あわせて おおきく）
  // かお＋からだは たて size*1.45 ぶんくらい つかう。ベルトに おさまる ぎりぎりまで おおきく。
  const size = Math.max(36, Math.min(h * 0.62, w * 0.28));
  const footY = size * 0.84;   // 中心から 足もとまで
  const headY = size * 0.62;   // 中心から あたまの てっぺんまで

  // ゴール線
  const goalX = w - size * 0.92;
  ctx.strokeStyle = '#ff9fc0'; ctx.lineWidth = 4; ctx.setLineDash([9, 7]);
  ctx.beginPath(); ctx.moveTo(goalX, h * 0.16); ctx.lineTo(goalX, Math.min(h - 2, groundY + 4)); ctx.stroke();
  ctx.setLineDash([]);

  // おに
  const oniX = w - size * 0.44;
  const oniY = Math.max(headY + 2, groundY - footY);
  if (S.phase === 'away') {
    drawBackHead(ctx, oniX, oniY, size);
  } else {
    safeFace(ctx, art.oniFace, {
      size, cx: oniX, cy: oniY, body: true, mood: 2, talking: false, blink: false, t,
    });
  }

  // じぶん
  const meX = size * 0.5 + S.pos * (goalX - size * 0.9);
  const bob = S.holding ? Math.sin(t / 90) * 4 : 0;
  safeFace(ctx, art.meFace, {
    size, cx: meX, cy: Math.max(headY + 2, groundY - footY) + bob, body: true,
    mood: 0, talking: false, blink: false, t,
  });

  // となえ（はばに おさまる 大きさに する）
  const msg = S.phase === 'away' ? CHANT.slice(0, Math.max(1,
    Math.round(CHANT.length * clamp((t - S.phaseStart) / S.phaseLen, 0, 1)))) : 'ふりむいた！ とまれ！';
  const maxW = w - 20;
  fitText(ctx, 'ふりむいた！ とまれ！', maxW, Math.max(13, Math.min(h * 0.14, 30)), 10, '700');
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillStyle = S.phase === 'away' ? '#7a6f92' : '#e04a7a';
  ctx.fillText(msg, 10, 8);

  // アウトの ひかり
  if (t - S.flash < 320) {
    ctx.fillStyle = 'rgba(255,90,120,' + (0.4 * (1 - (t - S.flash) / 320)) + ')';
    ctx.fillRect(0, 0, w, h);
  }
  // ふきだし
  if (S.toast && t < S.toastUntil) {
    fitText(ctx, S.toast, maxW * 0.8, Math.min(h * 0.3, 54), 14, '900');
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,.92)';
    ctx.fillText(S.toast, w / 2, h * 0.44);
    ctx.lineWidth = 3; ctx.strokeStyle = '#e04a7a';
    ctx.strokeText(S.toast, w / 2, h * 0.44);
  }
}

/** うしろを むいた すがた。face.js の からだと おなじ 大きさに そろえてある。 */
function drawBackHead(ctx, cx, cy, size) {
  const s = size / 100;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  const cloth = '#9fc7f0';
  const skin = '#f4cfae';
  // からだ（かたの いちは face.js と そろえる）
  ctx.save();
  ctx.translate(0, 31);
  ctx.beginPath();
  ctx.moveTo(-10, -2);
  ctx.bezierCurveTo(-26, 2, -32, 10, -33, 30);
  ctx.lineTo(-33, 52);
  ctx.lineTo(33, 52);
  ctx.lineTo(33, 30);
  ctx.bezierCurveTo(32, 10, 26, 2, 10, -2);
  ctx.closePath();
  ctx.fillStyle = cloth; ctx.fill();
  ctx.strokeStyle = '#6f96c4'; ctx.lineWidth = 1.2; ctx.stroke();
  // うで
  ctx.fillStyle = '#93bce6';
  for (const d of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(d * 28, 4);
    ctx.quadraticCurveTo(d * 40, 20, d * 36, 40);
    ctx.quadraticCurveTo(d * 30, 42, d * 26, 30);
    ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.ellipse(d * 35, 43, 5.4, 5.4, 0, 0, Math.PI * 2);
    ctx.fillStyle = skin; ctx.fill();
    ctx.fillStyle = '#93bce6';
  }
  ctx.restore();
  // くび
  ctx.fillStyle = '#e8bd9b';
  ctx.beginPath(); ctx.moveTo(-7.4, 11); ctx.lineTo(-6.4, 33); ctx.lineTo(6.4, 33); ctx.lineTo(7.4, 11);
  ctx.closePath(); ctx.fill();
  // みみ（あたまの よこから すこし のぞく）
  ctx.fillStyle = '#e8bd9b';
  for (const d of [-1, 1]) { ctx.beginPath(); ctx.ellipse(d * 31, -16, 4.8, 6.4, 0, 0, Math.PI * 2); ctx.fill(); }
  // あたま（うしろ姿なので ぜんぶ かみ）
  ctx.fillStyle = '#5a4738';
  ctx.beginPath(); ctx.ellipse(0, -18, 32, 34, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(0, -6, 27, 22, 0, 0, Math.PI); ctx.fill();
  // つむじの ハイライト
  ctx.fillStyle = 'rgba(255,255,255,.14)';
  ctx.beginPath(); ctx.ellipse(-9, -34, 13, 8, -0.4, 0, Math.PI * 2); ctx.fill();
  // えりあし
  ctx.fillStyle = '#e8bd9b';
  ctx.beginPath(); ctx.ellipse(0, 14, 9, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/* ══════════════════════════════════════════════
   2. えあわせ（しんけいすいじゃく）
   ══════════════════════════════════════════════ */

const MEMORY_MARKS = [
  '🍓','🍰','🐣','🌻','🐟','🍡','⭐','🍀','🐸','🎈','🍑','🐱',
  '🌙','🍩','🐧','🎀','🍋','🐝','🌈','🍒',
];

function playMemory(host, c, resolve) {
  const st = new Stage(host, '🃏 えあわせ', resolve);
  const rand = c.rand;

  // さいしょに おおきさを えらぶ
  const choose = div('mg-choice');
  choose.append(div('mg-big', 'どのくらいの おおきさで あそぶ？'));
  const easy = button('mg-btn mg-btn-main', 'やさしい 4×4（8 くみ）');
  const hard = button('mg-btn mg-btn-main', 'むずかしい 6×4（12 くみ）');
  choose.append(easy, hard);
  choose.append(div('mg-note', 'せいげん じかんは 90 びょう。手が すくないほど できばえが 上がるよ。'));
  st.body.append(choose);
  st.status('90 びょう しょうぶ');
  st.on(easy, 'click', () => start(4, 4));
  st.on(hard, 'click', () => start(6, 4));

  function start(cols, rows) {
    const pairs = (cols * rows) / 2;
    const marks = shuffle(MEMORY_MARKS, rand).slice(0, pairs);
    const deck = shuffle(marks.concat(marks), rand);
    st.body.textContent = '';

    const wrap = div('mg-gridwrap');
    const grid = div('mg-grid');
    grid.style.gridTemplateColumns = 'repeat(' + cols + ',minmax(0,1fr))';
    grid.style.gridTemplateRows = 'repeat(' + rows + ',minmax(0,1fr))';
    // ばん ぜんたいの たてよこ比。カードは だいたい 3:4。
    grid.style.setProperty('--mg-ar', (cols * 3) + ' / ' + (rows * 4));
    // たてに のびても いい かぎり（カードは 3 : 4.6 まで）
    grid.style.setProperty('--mg-hr', String((rows * 4.6) / (cols * 3)));
    wrap.append(grid);
    const info = div('mg-note', '手かず 0');
    st.body.append(wrap, info);

    const cards = deck.map((mark, i) => {
      const b = button('mg-card mg-card-back', mark);
      b.dataset.i = String(i);
      grid.append(b);
      return { el: b, mark, open: false, got: false };
    });

    let moves = 0;
    let found = 0;
    let first = null;
    let lock = false;
    let left = 90;
    let over = false;

    st.status('のこり 90 びょう');
    st.every(1000, () => {
      left -= 1;
      st.status('のこり ' + Math.max(0, left) + ' びょう');
      if (left <= 0 && !over) end(false);
    });

    function face(card) {
      if (card.got) { card.el.className = 'mg-card mg-card-got'; }
      else if (card.open) { card.el.className = 'mg-card mg-card-open'; }
      else { card.el.className = 'mg-card mg-card-back'; }
    }

    function tap(card) {
      if (over || lock || card.open || card.got) return;
      card.open = true; face(card);
      if (!first) { first = card; return; }
      moves += 1;
      info.textContent = '手かず ' + moves;
      const second = card;
      if (first.mark === second.mark) {
        first.got = true; second.got = true;
        found += 1;
        face(first); face(second);
        first = null;
        if (found >= pairs) end(true);
      } else {
        lock = true;
        const a = first, b = second;
        first = null;
        st.after(620, () => {
          a.open = false; b.open = false;
          face(a); face(b);
          lock = false;
        });
      }
    }

    cards.forEach((card) => st.on(card.el, 'click', () => tap(card)));

    function end(win) {
      if (over) return;
      over = true;
      let score;
      if (win) {
        const extra = Math.max(0, moves - pairs);
        const pen = cols === 4 ? 4.2 : 3.0;
        score = clamp(Math.round(100 - extra * pen + (left / 90) * 14), 20, 100);
      } else {
        score = clamp(Math.round((found / pairs) * 52), 0, 60);
      }
      const lines = win
        ? ['ぜんぶ そろった！ 手かず ' + moves + ' かい', 'のこり じかん ' + Math.max(0, left) + ' びょう']
        : ['そろったのは ' + found + ' / ' + pairs + ' くみ…'];
      st.after(350, () => st.showResult(win, score, rand, lines));
    }
  }
}

/* ══════════════════════════════════════════════
   3. ババぬき
   ══════════════════════════════════════════════ */

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const CPU_NAMES = ['ぴの', 'くるみ', 'もふ', 'たると', 'こはく', 'るる'];
const CPU_STYLES = ['edge', 'mid', 'away'];

function playBabanuki(host, c, resolve) {
  const st = new Stage(host, '🂠 ババぬき', resolve);
  const rand = c.rand;

  /* ── 人を あつめる ───────────────────────── */
  const others = c.residents.filter((r) => r && r !== c.main).slice(0, 3);
  const players = [];
  players.push(mkPlayer(0, (c.main && c.main.name) || 'あなた', (c.main && c.main.face) || safeRandomFace(rand), null));
  for (let i = 1; i <= 3; i++) {
    const r = others[i - 1];
    players.push(mkPlayer(
      i,
      (r && r.name) || pick(CPU_NAMES, rand) + 'さん',
      (r && r.face) || safeRandomFace(rand),
      pick(CPU_STYLES, rand)
    ));
  }
  function mkPlayer(i, name, face, style) {
    return { i, name, face, style, hand: [], done: false, rank: 0, say: '', avoid: {}, lastPicked: -1 };
  }
  const me = players[0];

  /* ── くばる ───────────────────────────────── */
  const deck = [];
  for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) deck.push({ r, s });
  deck.push({ r: 0, s: -1 }); // ジョーカー
  const dealt = shuffle(deck, rand);
  dealt.forEach((card, k) => players[k % 4].hand.push(card));
  players.forEach((p) => { p.hand = shuffle(p.hand, rand); discardAllPairs(p.hand); });

  /* ── 画面 ─────────────────────────────────── */
  const table = div('mg-table');
  const seats = [];
  for (let i = 1; i <= 3; i++) {
    const p = players[i];
    const seat = div('mg-seat');
    const fbox = div('mg-seat-face');
    const fcv = document.createElement('canvas');
    fcv.className = 'mg-canvas';
    fbox.append(fcv);
    const info = div('mg-seat-info');
    const nm = div('mg-seat-name', p.name);
    const sy = div('mg-seat-say', '');
    info.append(nm, sy);
    const backs = div('mg-backs');
    seat.append(fbox, info, backs);
    table.append(seat);
    seats.push({ p, seat, fcv, sy, backs, drawn: false });
  }
  const msgEl = div('mg-note', 'ペアを すてて、さいごに ジョーカーが のこったら まけ。');
  const myRow = div('mg-seat mg-seat-on');
  const myFbox = div('mg-seat-face');
  const myCv = document.createElement('canvas');
  myCv.className = 'mg-canvas';
  myFbox.append(myCv);
  const myInfo = div('mg-seat-info');
  const myName = div('mg-seat-name', me.name + '（あなた）');
  const mySay = div('mg-seat-say', '');
  myInfo.append(myName, mySay);
  const mixBtn = button('mg-quit', '🔀 まぜる');
  myRow.append(myFbox, myInfo, mixBtn);
  const handEl = div('mg-hand');
  st.body.append(table, msgEl, myRow, handEl);

  st.on(mixBtn, 'click', () => {
    me.hand = shuffle(me.hand, rand);
    lastGot = null;
    renderHand();
  });

  // かおは 1 かいだけ 描く（うごかさないので rAF は つかわない）
  st.after(0, () => {
    seats.forEach((s) => paintSeatFace(s.fcv, s.p.face));
    paintSeatFace(myCv, me.face);
  });
  function paintSeatFace(cv, face) {
    const { ctx, w, h } = fitCanvas(cv);
    ctx.clearRect(0, 0, w, h);
    safeFace(ctx, face, {
      size: Math.min(w, h) * 1.05, cx: w / 2, cy: h * 0.55,
      body: false, mood: 1, talking: false, blink: false, t: 0,
    });
  }

  /* ── しんこう ─────────────────────────────── */
  let curIdx = randInt(0, 3, rand);
  let over = false;
  let phase = 'wait';
  let pickSeat = null;
  let lastGot = null;
  let guard = 0;
  const finishOrder = [];

  function activeCount() { return players.filter((p) => !p.done).length; }
  function nextActive(from) {
    for (let k = 1; k <= 4; k++) {
      const p = players[(from + k) % 4];
      if (!p.done && p.hand.length > 0) return p;
    }
    return null;
  }
  function msg(t) { msgEl.textContent = t; }

  function render() {
    seats.forEach((s) => {
      s.seat.className = 'mg-seat' + (s.p.done ? ' mg-seat-out' : (players[curIdx] === s.p ? ' mg-seat-on' : ''));
      s.sy.textContent = s.p.done ? 'あがり！（' + s.p.rank + 'ばん）' : (s.p.say || ('てふだ ' + s.p.hand.length + ' まい'));
      s.backs.textContent = '';
      const pickable = (phase === 'pick' && pickSeat === s);
      s.p.hand.forEach((card, idx) => {
        const b = button('mg-back' + (pickable ? ' mg-back-pick' : ''));
        b.setAttribute('aria-label', pickable ? (idx + 1) + 'まいめを ひく' : 'カード');
        if (pickable) st.on(b, 'click', () => humanPick(s.p, idx));
        else b.disabled = true;
        s.backs.append(b);
      });
    });
    myRow.className = 'mg-seat' + (me.done ? ' mg-seat-out' : (curIdx === 0 ? ' mg-seat-on' : ''));
    mySay.textContent = me.done ? 'あがり！（' + me.rank + 'ばん）' : ('てふだ ' + me.hand.length + ' まい');
    renderHand();
  }

  function renderHand() {
    handEl.textContent = '';
    me.hand.forEach((card) => {
      const el = div('mg-pc ' + (card.r === 0 ? 'mg-pc-joker' : (card.s === 1 || card.s === 2 ? 'mg-pc-red' : 'mg-pc-blk')) +
        (card === lastGot ? ' mg-pc-new' : ''));
      el.textContent = card.r === 0 ? '🃏' : (RANKS[card.r - 1] + SUITS[card.s]);
      handEl.append(el);
    });
    if (me.hand.length === 0) handEl.append(div('mg-note', 'てふだは からっぽ！'));
  }

  function humanPick(target, idx) {
    if (over || phase !== 'pick') return;
    phase = 'wait';
    doDraw(me, target, idx);
  }

  function arrange(p) {
    // CPU の ちょっとした 考え: まぜてから ジョーカーの ばしょを ずらす
    if (p === me) return;
    p.hand = shuffle(p.hand, rand);
    const j = p.hand.findIndex((cd) => cd.r === 0);
    if (j < 0 || p.hand.length < 2) return;
    const n = p.hand.length;
    let to;
    if (p.style === 'edge') to = rand() < 0.5 ? 0 : n - 1;
    else if (p.style === 'mid') to = Math.floor(n / 2);
    else {
      // まえに ひかれた ばしょから いちばん とおい ところへ
      const lp = p.lastPicked >= 0 ? clamp(p.lastPicked, 0, n - 1) : Math.floor(n / 2);
      to = lp < n / 2 ? n - 1 : 0;
    }
    const card = p.hand.splice(j, 1)[0];
    p.hand.splice(clamp(to, 0, p.hand.length), 0, card);
  }

  function cpuChoose(p, target) {
    const n = target.hand.length;
    if (n <= 1) return 0;
    let idx = Math.floor(rand() * n);
    const avoid = p.avoid[target.i];
    for (let k = 0; k < 5 && avoid != null && idx === clamp(avoid, 0, n - 1); k++) {
      idx = Math.floor(rand() * n);
    }
    if (rand() < 0.3) idx = p.style === 'edge' ? (rand() < 0.5 ? 0 : n - 1) : Math.floor(n / 2);
    return clamp(idx, 0, n - 1);
  }

  function doDraw(cur, target, idx) {
    if (over) return;
    const i = clamp(idx, 0, target.hand.length - 1);
    const card = target.hand.splice(i, 1)[0];
    target.lastPicked = i;
    cur.hand.push(card);
    if (cur !== me && card.r === 0) cur.avoid[target.i] = i;
    const paired = discardOne(cur.hand, card);
    lastGot = paired ? null : card;
    if (cur === me) {
      msg(target.name + ' から ' + cardName(card) + ' を ひいた' + (paired ? '。ペアが そろった！' : '。'));
    } else {
      msg(cur.name + ' が ' + target.name + ' から 1 まい ひいた' + (paired ? '。ペア できた！' : '。'));
    }
    if (card.r === 0 && cur !== me) cur.say = 'うっ…';
    else cur.say = '';
    render();
    st.after(650, () => afterDraw(cur, target));
  }

  function afterDraw(cur, target) {
    if (over) return;
    [target, cur].forEach((p) => {
      if (!p.done && p.hand.length === 0) {
        p.done = true;
        finishOrder.push(p);
        p.rank = finishOrder.length;
        msg(p.name + ' が あがり！（' + p.rank + 'ばん）');
      }
    });
    if (activeCount() <= 1) { render(); st.after(500, endGame); return; }
    for (let k = 1; k <= 4; k++) {
      const nx = (curIdx + k) % 4;
      if (!players[nx].done) { curIdx = nx; break; }
    }
    guard += 1;
    if (guard > 400) { endGame(); return; }
    render();
    st.after(350, turn);
  }

  function turn() {
    if (over) return;
    if (activeCount() <= 1) { endGame(); return; }
    const cur = players[curIdx];
    const target = nextActive(curIdx);
    if (!target) { endGame(); return; }
    st.status('のこり ' + activeCount() + ' 人');
    players.forEach((p) => { if (p !== cur) p.say = ''; });
    if (cur === me) {
      arrange(target);
      phase = 'pick';
      pickSeat = seats.find((s) => s.p === target) || null;
      msg('あなたの ばん。' + target.name + ' の カードを 1 まい えらんで タップ。');
      render();
    } else {
      phase = 'wait';
      pickSeat = null;
      msg(cur.name + ' の ばん…');
      render();
      if (target === me) {
        st.after(900, () => { if (!over) doDraw(cur, me, cpuChoose(cur, me)); });
      } else {
        arrange(target);
        st.after(750, () => { if (!over) doDraw(cur, target, cpuChoose(cur, target)); });
      }
    }
  }

  function endGame() {
    if (over) return;
    over = true;
    const loser = players.find((p) => !p.done) || players[3];
    if (loser) { loser.rank = 4; }
    render();
    const win = me.done;
    const rank = me.done ? me.rank : 4;
    const score = [100, 78, 55, 14][clamp(rank - 1, 0, 3)];
    const lines = win
      ? ['あなたは ' + rank + 'ばんめに あがり！', loser ? loser.name + ' が ジョーカーを もって いたよ。' : '']
      : ['さいごに ジョーカーが のこって しまった…'];
    st.after(600, () => st.showResult(win, score, rand, lines.filter(Boolean)));
  }

  st.status('のこり 4 人');
  render();
  st.after(700, turn);
}

function cardName(card) {
  return card.r === 0 ? 'ジョーカー' : (RANKS[card.r - 1] + SUITS[card.s]);
}

/** 引いた カードと おなじ すうじが あれば 2 まいとも すてる。 */
function discardOne(hand, card) {
  for (let i = 0; i < hand.length; i++) {
    const o = hand[i];
    if (o !== card && o.r === card.r && card.r !== 0) {
      hand.splice(i, 1);
      const j = hand.indexOf(card);
      if (j >= 0) hand.splice(j, 1);
      return true;
    }
  }
  return false;
}

/** 手さつの 中の ペアを ぜんぶ すてる。 */
function discardAllPairs(hand) {
  let again = true;
  while (again) {
    again = false;
    outer:
    for (let i = 0; i < hand.length; i++) {
      for (let j = i + 1; j < hand.length; j++) {
        if (hand[i].r !== 0 && hand[i].r === hand[j].r) {
          hand.splice(j, 1);
          hand.splice(i, 1);
          again = true;
          break outer;
        }
      }
    }
  }
}

/* ══════════════════════════════════════════════
   4. リズムたたき
   ══════════════════════════════════════════════ */

const LANE_COLORS = ['#ff9ec4', '#9ed8ff', '#b6eecb', '#ffd98a'];
const LANE_MARKS = ['🍓', '🫐', '🍏', '🍋'];
const NOTE_TOTAL = 60;
const APPROACH = 1500;     // ノーツが 見えてから 線に とどくまで（ミリびょう）
const PERFECT_MS = 65;
const GOOD_MS = 145;
const MISS_MS = 190;

function playRhythm(host, c, resolve) {
  const st = new Stage(host, '🥁 リズムたたき', resolve);
  const rand = c.rand;

  const box = div('mg-stagebox');
  const cv = document.createElement('canvas');
  cv.className = 'mg-canvas';
  box.append(cv);
  const lanes = div('mg-lanes');
  const laneBtns = [];
  for (let i = 0; i < 4; i++) {
    const b = button('mg-lane-btn', LANE_MARKS[i]);
    b.style.background = LANE_COLORS[i];
    lanes.append(b);
    laneBtns.push(b);
  }
  st.body.append(box, lanes, div('mg-note', 'したの ボタンを 線の タイミングで たたこう。キーボードなら D F J K。'));

  /* ── ふりつけを つくる ─────────────────── */
  const beat = 420;
  const notes = [];
  let t0 = 2300;
  let lane = randInt(0, 3, rand);
  for (let i = 0; i < NOTE_TOTAL; i++) {
    notes.push({ lane, time: t0, judged: false, kind: '' });
    const step = pick([1, 1, 1, 0.5, 0.5, 1.5, 2], rand) * beat;
    t0 += step;
    lane = (lane + randInt(1, 3, rand)) % 4;
  }
  const endAt = t0 + 900;

  const S = { perfect: 0, good: 0, miss: 0, combo: 0, maxCombo: 0, judge: '', judgeAt: -9999, over: false };
  let startTime = 0;
  const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  function hitLane(i) {
    if (S.over || !startTime) return;
    const now = clock() - startTime;
    laneBtns[i].classList.add('mg-lane-hit');
    st.after(90, () => laneBtns[i].classList.remove('mg-lane-hit'));
    let best = null, bestDt = 1e9;
    for (const n of notes) {
      if (n.judged || n.lane !== i) continue;
      const dt = Math.abs(n.time - now);
      if (dt < bestDt) { bestDt = dt; best = n; }
    }
    if (!best || bestDt > MISS_MS) return;
    best.judged = true;
    if (bestDt <= PERFECT_MS) { best.kind = 'perfect'; S.perfect++; S.combo++; S.judge = 'PERFECT'; }
    else if (bestDt <= GOOD_MS) { best.kind = 'good'; S.good++; S.combo++; S.judge = 'GOOD'; }
    else { best.kind = 'miss'; S.miss++; S.combo = 0; S.judge = 'MISS'; }
    S.maxCombo = Math.max(S.maxCombo, S.combo);
    S.judgeAt = now;
  }

  laneBtns.forEach((b, i) => {
    st.on(b, 'pointerdown', (e) => { if (e.cancelable) e.preventDefault(); hitLane(i); });
    st.on(b, 'contextmenu', (e) => e.preventDefault());
  });
  const KEYS = { d: 0, f: 1, j: 2, k: 3, D: 0, F: 1, J: 2, K: 3 };
  st.on(window, 'keydown', (e) => {
    if (e.repeat) return;
    const i = KEYS[e.key];
    if (i != null) { e.preventDefault(); hitLane(i); }
  });

  st.loop((raf) => {
    if (!startTime) startTime = clock();
    const now = clock() - startTime;
    // 通りすぎた ノーツは ミス
    for (const n of notes) {
      if (!n.judged && now > n.time + MISS_MS) {
        n.judged = true; n.kind = 'miss'; S.miss++; S.combo = 0;
        S.judge = 'MISS'; S.judgeAt = now;
      }
    }
    const done = S.perfect + S.good + S.miss;
    st.status('コンボ ' + S.combo + '　' + done + '/' + NOTE_TOTAL);
    drawRhythm(cv, notes, S, now);
    if (!S.over && (now > endAt || done >= NOTE_TOTAL)) {
      S.over = true;
      const acc = (S.perfect + S.good * 0.5) / NOTE_TOTAL;
      const score = clamp(Math.round(acc * 100 + (S.maxCombo >= NOTE_TOTAL ? 5 : 0)), 0, 100);
      const win = score >= 60;
      const lines = [
        'PERFECT ' + S.perfect + '　GOOD ' + S.good + '　MISS ' + S.miss,
        'さいだい コンボ ' + S.maxCombo,
      ];
      st.after(600, () => st.showResult(win, score, rand, lines));
    }
  });
}

function drawRhythm(cv, notes, S, now) {
  const { ctx, w, h } = fitCanvas(cv);
  const lineY = h - 26;
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#f6eeff');
  bg.addColorStop(1, '#e8f4ff');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);

  const lw = w / 4;
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i % 2 ? 'rgba(255,255,255,.55)' : 'rgba(255,255,255,.3)';
    ctx.fillRect(i * lw, 0, lw, h);
  }
  // はんてい線
  ctx.strokeStyle = '#ff8fb4'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(4, lineY); ctx.lineTo(w - 4, lineY); ctx.stroke();

  const r = Math.min(lw * 0.3, 22);
  for (const n of notes) {
    if (n.judged) continue;
    const left = n.time - now;
    if (left > APPROACH || left < -MISS_MS) continue;
    const y = lineY - (left / APPROACH) * (lineY - 8);
    const x = n.lane * lw + lw / 2;
    ctx.fillStyle = LANE_COLORS[n.lane];
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 3; ctx.stroke();
  }

  // はんてい ひょうじ
  const age = now - S.judgeAt;
  if (S.judge && age < 520) {
    const a = 1 - age / 520;
    ctx.globalAlpha = a;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '900 ' + Math.round(Math.min(40, h * 0.16)) + 'px system-ui,sans-serif';
    ctx.fillStyle = S.judge === 'PERFECT' ? '#e0537a' : (S.judge === 'GOOD' ? '#3f9ad8' : '#8b82a0');
    ctx.fillText(S.judge, w / 2, h * 0.44);
    ctx.globalAlpha = 1;
  }
  if (S.combo >= 3) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '900 ' + Math.round(Math.min(30, h * 0.12)) + 'px system-ui,sans-serif';
    ctx.fillStyle = 'rgba(122,111,146,.8)';
    ctx.fillText(S.combo + ' コンボ', w / 2, h * 0.22);
  }
}
