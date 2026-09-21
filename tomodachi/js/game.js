// トモダチアイランド — 統合役。
// 画面の切り替え、DOM の組み立て、時間の進行、各モジュールの呼び出しをここで束ねる。

import { chance, clamp, pick, pickMany, randInt, rnd, seeded, shuffle } from './rng.js';
import {
  MAX_RESIDENTS, MOOD_LABEL, REL_LABEL,
  addMoney, addNews, addLog, addResident, advanceTime, canPay, createResident,
  expToNext, findResident, gainExp, getRel, getWorld, hungerLabel, loadWorld,
  moodOf, pay, personalityName, removeResident, resetWorld, saveSoon, saveWorld, unlockCheck,
} from './state.js';
import { FACE_FIELDS, childFace, drawFace, randomFace } from './face.js';
import {
  CLOTHES, FOODS, INTERIORS, SONGS, TOOLS, TREASURES, WORDS,
  byId, categoryOf, foodIds, foodReaction, priceOf, randomStock,
} from './items.js';
import {
  canConfess, ensureRels, introduce, marry, mediate, relationList,
  simulateRelations, tryBearChild, tryConfess,
} from './relations.js';
import { bubbleIcon, chatLine, greetLine, openBubble, resolveBubble, spawnBubbles } from './nayami.js';
import { MINIGAMES, playMinigame } from './minigames.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

const W = () => getWorld();
let currentId = null;      // いま部屋を見ている住人
let editing = null;        // 住人づくりの下書き
let rafId = 0;

// ══ 画面きりかえ ══════════════════════════════

const VIEWS = ['title', 'create', 'island', 'room'];
function show(name) {
  for (const v of VIEWS) $('view-' + v).hidden = v !== name;
  window.scrollTo(0, 0);
}

// ══ トースト ══════════════════════════════

function toast(text, icon = '✨') {
  const t = el('div', 'toast');
  t.textContent = `${icon} ${text}`;
  $('toasts').appendChild(t);
  setTimeout(() => {
    t.classList.add('is-out');
    setTimeout(() => t.remove(), 400);
  }, 2400);
}

// ══ モーダル ══════════════════════════════

let modalOnClose = null;
function openModal(title, buildBody, foots = [], onClose = null) {
  $('modal-title').textContent = title;
  const body = $('modal-body');
  body.innerHTML = '';
  if (typeof buildBody === 'function') buildBody(body);
  else if (buildBody instanceof Node) body.appendChild(buildBody);
  const foot = $('modal-foot');
  foot.innerHTML = '';
  for (const f of foots) {
    const b = el('button', 'btn ' + (f.primary ? 'btn-primary' : ''), f.label);
    b.type = 'button';
    b.addEventListener('click', () => f.onClick && f.onClick());
    if (f.disabled) b.disabled = true;
    foot.appendChild(b);
  }
  modalOnClose = onClose;
  $('modal-layer').hidden = false;
}

function closeModal() {
  $('modal-layer').hidden = true;
  $('modal-body').innerHTML = '';
  const cb = modalOnClose;
  modalOnClose = null;
  if (cb) cb();
}

// ══ 汎用の一覧 ══════════════════════════════

function listRow({ icon, main, sub, right, onClick, cls = '' }) {
  const row = el('div', 'list-row ' + cls);
  if (icon != null) {
    const i = el('div', 'l-icon');
    if (icon instanceof Node) i.appendChild(icon);
    else i.textContent = icon;
    row.appendChild(i);
  }
  const mid = el('div', 'l-mid');
  mid.appendChild(el('div', 'l-main', main));
  if (sub) mid.appendChild(el('div', 'l-sub', sub));
  row.appendChild(mid);
  if (right != null) {
    const r = el('div', 'l-right');
    if (right instanceof Node) r.appendChild(right);
    else r.textContent = right;
    row.appendChild(r);
  }
  if (onClick) {
    row.tabIndex = 0;
    row.addEventListener('click', onClick);
  }
  return row;
}

function emptyNote(text) {
  return el('p', 'empty-note', text);
}

// ══ 声（読み上げ） ══════════════════════════════

function speak(m, text) {
  if (!W().settings.sound) return;
  try {
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(String(text).replace(/[！？…、。]/g, ' '));
    u.lang = 'ja-JP';
    u.pitch = clamp(0.4 + (m.voice.pitch / 100) * 1.4, 0.1, 2);
    u.rate = clamp(0.7 + (m.voice.speed / 100) * 0.9, 0.3, 2);
    u.volume = 0.85;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch (e) {
    /* 読み上げが使えない環境でも黙って続ける */
  }
}

// ══ 住人づくり ══════════════════════════════

function newDraft() {
  return {
    name: '',
    gender: 'x',
    face: randomFace(),
    personality: { bright: 0, active: 0, speech: 0, kind: 0 },
    voice: { pitch: 50, speed: 50, tone: 0 },
  };
}

function openCreate() {
  editing = newDraft();
  $('inp-name').value = '';
  for (const b of document.querySelectorAll('#seg-gender .seg-btn')) {
    b.classList.toggle('is-on', b.dataset.v === 'x');
  }
  selectTab('face');
  buildFacePane();
  buildPersPane();
  buildVoicePane();
  show('create');
}

function selectTab(name) {
  for (const t of document.querySelectorAll('#create-tabs .tab')) {
    t.classList.toggle('is-on', t.dataset.tab === name);
  }
  $('pane-face').hidden = name !== 'face';
  $('pane-pers').hidden = name !== 'pers';
  $('pane-voice').hidden = name !== 'voice';
}

function miniFaceCanvas(face, size = 52) {
  const c = el('canvas', 'mini-face');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = size * dpr;
  c.height = size * dpr;
  c.style.width = size + 'px';
  c.style.height = size + 'px';
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  try {
    drawFace(ctx, face, { size, cx: size / 2, cy: size / 2, mood: 1 });
  } catch (e) {
    /* 顔が描けなくても一覧は出す */
  }
  return c;
}

function buildFacePane() {
  const pane = $('pane-face');
  pane.innerHTML = '';
  for (const f of FACE_FIELDS) {
    const row = el('div', 'field');
    row.appendChild(el('span', 'field-label', f.label));
    if (f.type === 'swatch' && Array.isArray(f.colors)) {
      const sw = el('div', 'swatches');
      f.colors.forEach((col, i) => {
        const b = el('button', 'swatch' + (editing.face[f.key] === i ? ' is-on' : ''));
        b.type = 'button';
        b.style.background = col;
        b.setAttribute('aria-label', f.label + ' ' + (i + 1));
        b.addEventListener('click', () => {
          editing.face[f.key] = i;
          buildFacePane();
        });
        sw.appendChild(b);
      });
      row.appendChild(sw);
    } else {
      const grid = el('div', 'part-picker');
      for (let i = 0; i < f.max; i++) {
        const b = el('button', 'part-btn' + (editing.face[f.key] === i ? ' is-on' : ''));
        b.type = 'button';
        b.setAttribute('aria-label', f.label + ' ' + (i + 1));
        b.appendChild(miniFaceCanvas(Object.assign({}, editing.face, { [f.key]: i }), 46));
        b.addEventListener('click', () => {
          editing.face[f.key] = i;
          buildFacePane();
        });
        grid.appendChild(b);
      }
      row.appendChild(grid);
    }
    pane.appendChild(row);
  }
}

const PERS_SLIDERS = [
  { key: 'bright', minus: 'おっとり', plus: 'あかるい' },
  { key: 'active', minus: 'マイペース', plus: 'アクティブ' },
  { key: 'speech', minus: 'ひかえめ', plus: 'おしゃべり' },
  { key: 'kind', minus: 'クール', plus: 'やさしい' },
];

function buildPersPane() {
  const pane = $('pane-pers');
  pane.innerHTML = '';
  const name = el('p', 'pers-name', 'せいかく：' + personalityName(editing.personality));
  pane.appendChild(name);
  for (const s of PERS_SLIDERS) {
    const row = el('div', 'slider-row');
    row.appendChild(el('span', 'sl-minus', s.minus));
    const r = document.createElement('input');
    r.type = 'range';
    r.min = '-100';
    r.max = '100';
    r.step = '5';
    r.value = String(editing.personality[s.key]);
    r.addEventListener('input', () => {
      editing.personality[s.key] = Number(r.value);
      name.textContent = 'せいかく：' + personalityName(editing.personality);
    });
    row.appendChild(r);
    row.appendChild(el('span', 'sl-plus', s.plus));
    pane.appendChild(row);
  }
  const b = el('button', 'btn', '🎲 せいかくも おまかせ');
  b.type = 'button';
  b.addEventListener('click', () => {
    for (const s of PERS_SLIDERS) editing.personality[s.key] = randInt(-100, 100);
    buildPersPane();
  });
  pane.appendChild(b);
}

function buildVoicePane() {
  const pane = $('pane-voice');
  pane.innerHTML = '';
  const defs = [
    { key: 'pitch', minus: 'ひくい', plus: 'たかい' },
    { key: 'speed', minus: 'ゆっくり', plus: 'はやい' },
  ];
  for (const d of defs) {
    const row = el('div', 'slider-row');
    row.appendChild(el('span', 'sl-minus', d.minus));
    const r = document.createElement('input');
    r.type = 'range';
    r.min = '0';
    r.max = '100';
    r.value = String(editing.voice[d.key]);
    r.addEventListener('input', () => { editing.voice[d.key] = Number(r.value); });
    row.appendChild(r);
    row.appendChild(el('span', 'sl-plus', d.plus));
    pane.appendChild(row);
  }
  const b = el('button', 'btn btn-primary', '🔊 こえを きいてみる');
  b.type = 'button';
  b.addEventListener('click', () => {
    const nm = ($('inp-name').value || 'なまえなし').trim();
    speak({ voice: editing.voice }, `こんにちは、${nm} です`);
  });
  pane.appendChild(b);
  pane.appendChild(el('p', 'note', 'ブラウザの読み上げを使います。使えない環境では静かなままです。'));
}

function animCreate() {
  const c = $('create-canvas');
  if (!c || $('view-create').hidden || !editing) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const size = 330;
  if (c.width !== size * dpr) {
    c.width = size * dpr;
    c.height = size * dpr;
    c.style.width = '100%';
    c.style.maxWidth = size + 'px';
  }
  const ctx = c.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);
  const t = performance.now();
  try {
    drawFace(ctx, editing.face, {
      size: size * 0.55, cx: size / 2, cy: size * 0.34,
      mood: 0, blink: Math.sin(t / 900) > 0.985, t, body: true,
    });
  } catch (e) {
    /* 顔モジュールが描けなくても画面は生かす */
  }
}

function finishCreate() {
  const name = $('inp-name').value.trim();
  if (!name) {
    toast('なまえを 入れてください', '✏️');
    $('inp-name').focus();
    return;
  }
  if (W().residents.length >= MAX_RESIDENTS) {
    toast('マンションが まんしつです', '🏢');
    return;
  }
  const m = createResident({
    name,
    gender: editing.gender,
    face: editing.face,
    voice: editing.voice,
    personality: editing.personality,
    foodIds: foodIds(),
  });
  addResident(m);
  ensureRels(W());
  addNews('🎉', `${m.name} が 島に ひっこしてきた！`);
  unlockCheck();
  saveWorld();
  editing = null;
  show('island');
  renderIsland();
  toast(`${m.name} が やってきた！`, '🏝️');
  speak(m, `${m.name} です。よろしくね`);
}

// ══ そうこ（島のもちもの） ══════════════════════════════

function storage() {
  const w = W();
  if (!w.storage) w.storage = {};
  return w.storage;
}

function addItem(id, n = 1) {
  const s = storage();
  s[id] = (s[id] || 0) + n;
  saveSoon();
}

function takeItem(id, n = 1) {
  const s = storage();
  if ((s[id] || 0) < n) return false;
  s[id] -= n;
  if (s[id] <= 0) delete s[id];
  saveSoon();
  return true;
}

function itemsOf(cat) {
  return Object.keys(storage())
    .filter((id) => categoryOf(id) === cat)
    .map((id) => ({ item: byId(id), n: storage()[id] }))
    .filter((x) => x.item);
}

// ══ 島 ══════════════════════════════

function renderIsland() {
  const w = W();
  $('money').textContent = w.money;
  $('money2').textContent = w.money;
  const days = Math.max(1, Math.ceil((Date.now() - w.createdAt) / 86400000));
  $('daycount').textContent = `${days}日め ・ ${w.residents.length}人`;
  renderRooms();
  renderFacilities();
}

function renderRooms() {
  const host = $('rooms');
  host.innerHTML = '';
  const w = W();
  for (const m of w.residents) {
    const cell = el('button', 'room-cell');
    cell.type = 'button';
    const inner = el('div', 'room-cell-inner');
    const theme = byId(m.room.theme) || byId('room_plain');
    if (theme && theme.bg) inner.style.background = theme.bg;
    const cv = miniFaceCanvas(m.face, 92);
    cv.classList.add('room-thumb');
    cv.style.width = '';
    cv.style.height = '';
    inner.appendChild(cv);
    inner.appendChild(el('div', 'room-cell-name', m.name));
    cell.appendChild(inner);
    if (m.pendingGift) {
      const g = el('div', 'room-cell-bubble bubble-pop', '🎁');
      cell.appendChild(g);
    } else if (m.bubble) {
      const b = el('div', 'room-cell-bubble bubble-pop', bubbleIcon(m.bubble));
      cell.appendChild(b);
    }
    const mood = moodOf(m);
    if (mood === 2) cell.appendChild(el('div', 'room-cell-mood', '💢'));
    cell.addEventListener('click', () => enterRoom(m.id));
    host.appendChild(cell);
  }
  const add = el('button', 'room-cell is-empty');
  add.type = 'button';
  const addInner = el('div', 'room-cell-inner');
  addInner.appendChild(el('div', 'room-cell-empty', '＋'));
  addInner.appendChild(el('div', 'room-cell-name', w.residents.length >= MAX_RESIDENTS ? 'まんしつ' : '住人をよぶ'));
  add.appendChild(addInner);
  add.addEventListener('click', () => {
    if (w.residents.length >= MAX_RESIDENTS) toast('これ以上は 入れません', '🏢');
    else openCreate();
  });
  host.appendChild(add);
}

const FACILITIES = [
  { id: 'food', emoji: '🍙', name: 'たべものや', open: () => openShop('food') },
  { id: 'cloth', emoji: '👕', name: 'ふくや', open: () => openShop('clothes') },
  { id: 'inter', emoji: '🛋️', name: 'インテリアや', open: () => openShop('interior') },
  { id: 'tool', emoji: '🧰', name: 'どうぐや', open: () => openShop('tool') },
  { id: 'pawn', emoji: '💰', name: 'しちや', key: 'pawn', open: openPawn, hint: 'ミニゲームで 2 回あそぶと ひらく' },
  { id: 'news', emoji: '📺', name: 'ニュース', key: 'news', open: openNews, hint: '住人が 3 人に なるとひらく' },
  { id: 'park', emoji: '🎡', name: 'こうえん', key: 'park', open: openPark, hint: '住人が 5 人に なるとひらく' },
  { id: 'fountain', emoji: '⛲', name: 'ふんすい', key: 'fountain', open: openFountain, hint: '住人 4 人＋だれかが Lv3 で ひらく' },
  { id: 'store', emoji: '🧺', name: 'そうこ', open: openStorage },
  { id: 'rel', emoji: '💞', name: 'かんけい', open: openRelations },
  { id: 'cfg', emoji: '⚙️', name: 'せってい', open: openSettings },
];

function renderFacilities() {
  const host = $('facilities');
  host.innerHTML = '';
  const w = W();
  for (const f of FACILITIES) {
    const locked = f.key && !w.unlocked[f.key];
    const b = el('button', 'fac-btn' + (locked ? ' is-locked' : ''));
    b.type = 'button';
    b.appendChild(el('span', 'fac-emoji', locked ? '🔒' : f.emoji));
    b.appendChild(el('span', 'fac-name', f.name));
    b.addEventListener('click', () => {
      if (locked) toast(f.hint || 'まだ ひらいていません', '🔒');
      else f.open();
    });
    host.appendChild(b);
  }
}

// ══ お店 ══════════════════════════════

const SHOP_META = {
  food: { title: '🍙 たべものや', src: () => FOODS, n: 14, refresh: 30 },
  clothes: { title: '👕 ふくや', src: () => CLOTHES, n: 12, refresh: 60 },
  interior: { title: '🛋️ インテリアや', src: () => INTERIORS, n: 10, refresh: 90 },
  tool: { title: '🧰 どうぐや', src: () => TOOLS, n: 99, refresh: 0 },
};

function stockFor(kind) {
  const w = W();
  const meta = SHOP_META[kind];
  if (kind === 'tool') return TOOLS.map((t) => t.id);
  if (!w.shopTime) w.shopTime = {};
  const now = Date.now();
  const stale = now - (w.shopTime[kind] || 0) > meta.refresh * 60000;
  if (!w.shops[kind] || !w.shops[kind].length || stale) {
    w.shopTime[kind] = now;
    const rand = seeded(kind + Math.floor(now / (meta.refresh * 60000)));
    const stock = safe(() => randomStock(kind, meta.n, rand), null) || pickMany(meta.src(), meta.n, rand);
    w.shops[kind] = stock.map((x) => (typeof x === 'string' ? x : x.id));
    saveSoon();
  }
  return w.shops[kind];
}

function openShop(kind) {
  const meta = SHOP_META[kind];
  const ids = stockFor(kind);
  openModal(meta.title, (body) => {
    body.appendChild(el('p', 'note', `もっているお金：🪙 ${W().money}`));
    const grid = el('div', 'shop-grid');
    for (const id of ids) {
      const it = byId(id);
      if (!it) continue;
      const price = priceOf(id);
      const card = el('button', 'shop-item' + (W().money < price ? ' is-poor' : ''));
      card.type = 'button';
      card.appendChild(el('span', 'si-emoji', it.emoji || '🎁'));
      card.appendChild(el('span', 'si-name', it.name));
      card.appendChild(el('span', 'si-price', '🪙 ' + price));
      const have = storage()[id] || 0;
      if (have) card.appendChild(el('span', 'si-have', '×' + have));
      card.addEventListener('click', () => {
        if (!pay(price)) { toast('お金が たりません', '🪙'); return; }
        addItem(id, 1);
        toast(`${it.name} を 買った`, it.emoji || '🛍️');
        renderIsland();
        openShop(kind);
      });
      grid.appendChild(card);
    }
    body.appendChild(grid);
    body.appendChild(el('p', 'note', '買ったものは「そうこ」に入ります。部屋を訪ねて わたしてください。'));
  }, [{ label: 'とじる', onClick: closeModal }]);
}

function openPawn() {
  openModal('💰 しちや', (body) => {
    const list = itemsOf('treasure');
    if (!list.length) {
      body.appendChild(emptyNote('売れる お宝が ありません。ミニゲームで あつめよう。'));
      return;
    }
    const wrap = el('div', 'list');
    for (const { item, n } of list) {
      const btn = el('button', 'btn btn-small', '売る');
      btn.type = 'button';
      btn.addEventListener('click', () => {
        if (!takeItem(item.id, 1)) return;
        addMoney(item.value || 50);
        toast(`${item.name} を 🪙${item.value || 50} で 売った`, '💰');
        renderIsland();
        openPawn();
      });
      wrap.appendChild(listRow({
        icon: item.emoji || '💎',
        main: item.name + ' ×' + n,
        sub: '★'.repeat(item.rarity || 1),
        right: btn,
      }));
    }
    body.appendChild(wrap);
  }, [{ label: 'とじる', onClick: closeModal }]);
}

function openNews() {
  openModal('📺 島のニュース', (body) => {
    const w = W();
    if (!w.news.length) { body.appendChild(emptyNote('まだ ニュースは ありません。')); return; }
    const wrap = el('div', 'list');
    for (const n of w.news.slice(0, 60)) {
      const row = listRow({ icon: n.icon, main: n.text, sub: timeAgo(n.t), cls: 'news-item' });
      wrap.appendChild(row);
    }
    body.appendChild(wrap);
  }, [{ label: 'とじる', onClick: closeModal }]);
}

function timeAgo(t) {
  const d = Date.now() - t;
  if (d < 60000) return 'たったいま';
  if (d < 3600000) return Math.floor(d / 60000) + ' 分まえ';
  if (d < 86400000) return Math.floor(d / 3600000) + ' 時間まえ';
  return Math.floor(d / 86400000) + ' 日まえ';
}

const STORE_CATS = [
  ['food', '🍙 たべもの'],
  ['clothes', '👕 ふく'],
  ['interior', '🛋️ インテリア'],
  ['tool', '🧰 どうぐ'],
  ['treasure', '💎 お宝'],
];

function openStorage() {
  openModal('🧺 そうこ', (body) => {
    let any = false;
    for (const [cat, label] of STORE_CATS) {
      const list = itemsOf(cat);
      if (!list.length) continue;
      any = true;
      body.appendChild(el('h4', null, label));
      const grid = el('div', 'shop-grid');
      for (const { item, n } of list) {
        const card = el('div', 'shop-item');
        if (cat === 'interior') {
          const sw = el('span', 'si-swatch');
          sw.style.background = item.bg || '#eee';
          card.appendChild(sw);
        } else {
          card.appendChild(el('span', 'si-emoji', item.emoji || '🎁'));
        }
        card.appendChild(el('span', 'si-name', item.name));
        card.appendChild(el('span', 'si-have', '×' + n));
        grid.appendChild(card);
      }
      body.appendChild(grid);
    }
    if (!any) body.appendChild(emptyNote('そうこは からっぽです。お店で 買ってきてください。'));
    else body.appendChild(el('p', 'note', 'わたすのは 住人の部屋からです。'));
  }, [{ label: 'とじる', onClick: closeModal }]);
}

function openRelations() {
  openModal('💞 島の かんけい', (body) => {
    const w = W();
    const pairs = [];
    for (let i = 0; i < w.residents.length; i++) {
      for (let j = i + 1; j < w.residents.length; j++) {
        const a = w.residents[i], b = w.residents[j];
        const r = getRel(a, b);
        if (r.status === 'stranger' && r.aff <= 0) continue;
        pairs.push({ a, b, r });
      }
    }
    pairs.sort((x, y) => y.r.aff - x.r.aff);
    if (!pairs.length) { body.appendChild(emptyNote('まだ だれも 知り合っていません。')); return; }
    const wrap = el('div', 'list');
    for (const p of pairs.slice(0, 60)) {
      const badge = el('span', 'rel-badge', REL_LABEL[p.r.status] || p.r.status);
      if (['crush', 'couple', 'married'].includes(p.r.status)) badge.classList.add('is-love');
      if (p.r.fight) badge.classList.add('is-fight');
      wrap.appendChild(listRow({
        icon: miniFaceCanvas(p.a.face, 40),
        main: `${p.a.name} と ${p.b.name}`,
        sub: 'なかよし度 ' + Math.round(p.r.aff) + (p.r.fight ? ' ／ けんか中' : ''),
        right: badge,
      }));
    }
    body.appendChild(wrap);
  }, [{ label: 'とじる', onClick: closeModal }]);
}

function openSettings() {
  openModal('⚙️ せってい', (body) => {
    const w = W();
    const b1 = el('button', 'btn', (w.settings.sound ? '🔊 こえ：オン' : '🔇 こえ：オフ'));
    b1.type = 'button';
    b1.addEventListener('click', () => {
      w.settings.sound = !w.settings.sound;
      saveWorld();
      openSettings();
    });
    body.appendChild(b1);
    body.appendChild(el('p', 'note', 'セーブはこのブラウザの中だけです。'));
    const b2 = el('button', 'btn btn-danger', '島を さいしょから やりなおす');
    b2.type = 'button';
    b2.addEventListener('click', () => {
      openModal('ほんとうに やりなおしますか？', (bd) => {
        bd.appendChild(el('p', null, '住人も 思い出も ぜんぶ 消えます。もとには もどせません。'));
      }, [
        { label: 'やめる', onClick: openSettings },
        { label: '消してやりなおす', primary: true, onClick: () => { resetWorld(); closeModal(); boot(true); } },
      ]);
    });
    body.appendChild(b2);
  }, [{ label: 'とじる', onClick: closeModal }]);
}

function openHelp() {
  openModal('？ あそびかた', (body) => {
    const lines = [
      ['🧑‍🎨', '住人をつくる', '「＋ 住人」から、顔・性格・声を決めて島に呼びます。24 人まで住めます。'],
      ['💭', '吹き出しをタップ', '部屋の上に出た吹き出しが「なやみ」。聞いてあげると まんぞくどが上がります。'],
      ['🍙', 'ごはんをあげる', 'お店で買って、部屋でわたします。好物なら まんぞくどが どんと上がります。'],
      ['🎁', 'レベルアップ', 'Lv が上がると プレゼントを 1 つ選べます。服・部屋・どうぐ・歌・口ぐせ。'],
      ['💞', 'なかよくなる', '住人どうしは かってに 友達になったり けんかしたり 恋をしたりします。手助けしてあげて。'],
      ['🎡', 'ミニゲーム', 'こうえんで あそぶと お宝とお金。お宝は しちやで 売れます。'],
      ['⛲', 'ゴール', 'ねがいの ふんすいで 100 回 願いを かなえると、宇宙ツアーへ 行けます。'],
      ['⏱️', '時間', '2 分で 1 こま。とじているあいだも 最大 12 時間ぶんまで 島は動いています。'],
    ];
    const wrap = el('div', 'list');
    for (const [i, a, b] of lines) wrap.appendChild(listRow({ icon: i, main: a, sub: b }));
    body.appendChild(wrap);
  }, [{ label: 'とじる', onClick: closeModal }]);
}

// ══ ねがいの ふんすい ══════════════════════════════

const WISH_COST = 120;

function openFountain() {
  const w = W();
  openModal('⛲ ねがいの ふんすい', (body) => {
    const lv = 1 + Math.floor(w.fountain.wishes / 10);
    w.fountain.level = lv;
    body.appendChild(el('p', 'fountain-wish', `かなえた ねがい：${w.fountain.wishes} / 100`));
    const g = el('div', 'wish-gauge');
    const i = el('i');
    i.style.width = Math.min(100, w.fountain.wishes) + '%';
    g.appendChild(i);
    body.appendChild(g);
    body.appendChild(el('p', 'note', `ふんすい Lv ${lv}　—　コインを 🪙${WISH_COST} 投げると 願いが ひとつ かないます。`));
    const wishes = [
      { t: '住人みんなが ごきげんに なりますように', run: () => { for (const m of w.residents) m.hunger = Math.max(m.hunger, 85); } },
      { t: 'みんなが すこし なかよく なりますように', run: () => { for (const a of w.residents) for (const b of w.residents) if (a !== b) getRel(a, b).aff = clamp(getRel(a, b).aff + 3, -30, 100); } },
      { t: 'お宝が ころがりこみますように', run: () => { const t = pick(TREASURES); addItem(t.id, 1); toast(`${t.name} を みつけた！`, t.emoji || '💎'); } },
      { t: 'だれかの まんぞくどが 上がりますように', run: () => { if (w.residents.length) { const m = pick(w.residents); gainExp(m, 30 + lv * 6); toast(`${m.name} の まんぞくどが 上がった`, '💗'); } } },
      { t: 'けんかが おさまりますように', run: () => { for (const a of w.residents) for (const k in a.rels) a.rels[k].fight = false; } },
    ];
    const wrap = el('div', 'list');
    for (const ws of wishes) {
      wrap.appendChild(listRow({
        icon: '🌟', main: ws.t, right: '🪙' + WISH_COST,
        onClick: () => {
          if (!pay(WISH_COST)) { toast('コインが たりません', '🪙'); return; }
          ws.run();
          w.fountain.wishes++;
          addNews('⛲', `ふんすいに ねがいを かけた（${w.fountain.wishes} 回目）`);
          saveWorld();
          renderIsland();
          if (w.fountain.wishes >= 100 && !w.flags.ending) { showEnding(); return; }
          openFountain();
        },
      }));
    }
    body.appendChild(wrap);
  }, [{ label: 'とじる', onClick: closeModal }]);
}

function showEnding() {
  const w = W();
  w.flags.ending = true;
  addNews('🚀', '島のみんなで 宇宙ツアーに 出発した！');
  saveWorld();
  openModal('🚀 宇宙ツアー', (body) => {
    body.appendChild(el('p', null, 'ふんすいが まばゆく 光って、島ぜんたいが ふわりと 浮かびました。'));
    body.appendChild(el('p', null, `${w.residents.length} 人の 住人と いっしょに、ロケットは 星の海へ。`));
    const st = el('div', 'list');
    st.appendChild(listRow({ icon: '💒', main: 'けっこん', right: w.stats.marriages + ' 組' }));
    st.appendChild(listRow({ icon: '👶', main: 'うまれた子', right: w.stats.children + ' 人' }));
    st.appendChild(listRow({ icon: '💭', main: 'きいた なやみ', right: w.stats.nayami + ' 件' }));
    st.appendChild(listRow({ icon: '🍙', main: 'あげた ごはん', right: w.stats.fed + ' 回' }));
    st.appendChild(listRow({ icon: '🎮', main: 'あそんだ ミニゲーム', right: w.stats.minigames + ' 回' }));
    body.appendChild(st);
    body.appendChild(el('p', 'note', 'おわりでは ありません。島は これからも つづきます。'));
  }, [{ label: 'ありがとう', primary: true, onClick: closeModal }]);
}

// ══ こうえん（ミニゲーム） ══════════════════════════════

function openPark() {
  openModal('🎡 こうえん', (body) => {
    const wrap = el('div', 'list');
    for (const g of MINIGAMES) {
      wrap.appendChild(listRow({
        icon: g.emoji, main: g.name, sub: g.desc,
        right: '▶',
        onClick: () => { closeModal(); startMinigame(g.id); },
      }));
    }
    body.appendChild(wrap);
  }, [{ label: 'とじる', onClick: closeModal }]);
}

async function startMinigame(id) {
  const w = W();
  const host = $('game-host');
  host.innerHTML = '';
  $('game-layer').hidden = false;
  let res = null;
  try {
    res = await playMinigame(id, host, {
      residents: shuffle(w.residents).slice(0, 3),
      main: currentId ? findResident(currentId) : w.residents[0] || null,
      rand: rnd,
    });
  } catch (e) {
    console.error('ミニゲームで例外', e);
  }
  $('game-layer').hidden = true;
  host.innerHTML = '';
  if (!res || res.quit) { renderIsland(); return; }
  w.stats.minigames++;
  if (res.coins) addMoney(res.coins);
  const got = [];
  for (let i = 0; i < (res.treasures || 0); i++) {
    const t = pick(TREASURES);
    addItem(t.id, 1);
    got.push(t);
  }
  unlockCheck();
  saveWorld();
  openModal(res.win ? '🎉 かった！' : 'おつかれさま', (body) => {
    body.appendChild(el('p', null, `できばえ ${Math.round(res.score || 0)} 点`));
    body.appendChild(el('p', null, `🪙 ${res.coins || 0} もらった`));
    if (got.length) {
      const wrap = el('div', 'list');
      for (const t of got) wrap.appendChild(listRow({ icon: t.emoji || '💎', main: t.name, sub: '★'.repeat(t.rarity || 1) }));
      body.appendChild(wrap);
    }
  }, [{ label: 'とじる', primary: true, onClick: () => { closeModal(); renderIsland(); } }]);
}

// ══ 部屋 ══════════════════════════════

function enterRoom(id) {
  currentId = id;
  const m = findResident(id);
  if (!m) { show('island'); return; }
  show('room');
  renderRoom();
  const line = safe(() => greetLine(m, W()), `${m.name}「やあ」`);
  sayInRoom(m, line);
  m.lastTalkAt = Date.now();
  if (m.pendingGift) setTimeout(() => openGift(m), 700);
}

function safe(fn, fallback) {
  try {
    const v = fn();
    return v == null ? fallback : v;
  } catch (e) {
    console.warn(e);
    return fallback;
  }
}

function renderRoom() {
  const m = findResident(currentId);
  if (!m) { show('island'); return; }
  $('money2').textContent = W().money;
  $('r-name').textContent = m.name + (m.isChild ? '（こども）' : '');
  $('r-pers').textContent = personalityName(m.personality);
  $('r-mood').textContent = MOOD_LABEL[moodOf(m)];
  $('r-level').textContent = m.level;
  const need = expToNext(m.level);
  $('r-exp-fill').style.width = Math.min(100, (m.exp / need) * 100) + '%';
  $('r-hunger-label').textContent = hungerLabel(m.hunger);
  $('r-hunger-fill').style.width = m.hunger + '%';
  const theme = byId(m.room.theme) || byId('room_plain');
  const bg = $('room-bg');
  bg.style.background = (theme && theme.bg) || '#ffe9c9';
  const bub = $('room-bubble');
  if (m.pendingGift) {
    bub.hidden = false;
    bub.textContent = '🎁';
    bub.onclick = () => openGift(m);
  } else if (m.bubble) {
    bub.hidden = false;
    bub.textContent = safe(() => bubbleIcon(m.bubble), '💭');
    bub.onclick = () => openBubbleDialog(m);
  } else {
    bub.hidden = true;
    bub.onclick = null;
  }
  renderRoomActions(m);
}

let talkUntil = 0;
function sayInRoom(m, text) {
  const sp = $('speech');
  sp.textContent = text;
  sp.hidden = false;
  talkUntil = performance.now() + 2600;
  speak(m, String(text).replace(/^.*?「|」$/g, ''));
  clearTimeout(sayInRoom._t);
  sayInRoom._t = setTimeout(() => { sp.hidden = true; }, 3200);
}

function animRoom() {
  if ($('view-room').hidden) return;
  const m = findResident(currentId);
  if (!m) return;
  const c = $('room-canvas');
  const rect = c.getBoundingClientRect();
  const size = Math.max(160, Math.min(rect.width || 320, 460));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (c.width !== Math.round(size * dpr)) {
    c.width = Math.round(size * dpr);
    c.height = Math.round(size * dpr);
  }
  const ctx = c.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);
  const t = performance.now();
  const clothes = byId(m.clothes.current);
  try {
    drawFace(ctx, m.face, {
      size: size * 0.55,
      cx: size / 2 + Math.sin(t / 1400) * 5,
      cy: size * 0.34 + Math.sin(t / 700) * 3,
      body: true,
      mood: moodOf(m),
      talking: t < talkUntil && Math.sin(t / 110) > 0,
      blink: Math.sin(t / 1100) > 0.99,
      t,
      clothesColor: clothes && clothes.color ? clothes.color : undefined,
    });
  } catch (e) {
    /* 描けなくても操作は続けられる */
  }
}

const ROOM_ACTIONS = [
  { emoji: '💬', name: 'はなす', run: actTalk },
  { emoji: '🍙', name: 'ごはん', run: actFeed },
  { emoji: '👕', name: 'ふく', run: actClothes },
  { emoji: '🛋️', name: 'もようがえ', run: actInterior },
  { emoji: '🧰', name: 'どうぐ', run: actTool },
  { emoji: '💞', name: 'なかよし', run: actRelations },
  { emoji: '📄', name: 'プロフィール', run: actProfile },
  { emoji: '🪙', name: 'おこづかい', run: actAllowance },
];

function renderRoomActions(m) {
  const host = $('room-actions');
  host.innerHTML = '';
  for (const a of ROOM_ACTIONS) {
    const b = el('button', 'fac-btn');
    b.type = 'button';
    b.appendChild(el('span', 'fac-emoji', a.emoji));
    b.appendChild(el('span', 'fac-name', a.name));
    b.addEventListener('click', () => a.run(m));
    host.appendChild(b);
  }
}

function actTalk(m) {
  const line = safe(() => chatLine(m, W()), 'きょうは いい天気だね');
  sayInRoom(m, line);
  if (Date.now() - m.lastTalkAt > 5 * 60000) {
    gainExp(m, 3);
    m.lastTalkAt = Date.now();
  }
  renderRoom();
}

function pickItemModal(title, cat, onPick, note) {
  const list = itemsOf(cat);
  openModal(title, (body) => {
    if (note) body.appendChild(el('p', 'note', note));
    if (!list.length) {
      body.appendChild(emptyNote('そうこが からっぽです。お店で 買ってきてください。'));
      return;
    }
    const grid = el('div', 'shop-grid');
    for (const { item, n } of list) {
      const card = el('button', 'shop-item');
      card.type = 'button';
      card.appendChild(el('span', 'si-emoji', item.emoji || '🎁'));
      card.appendChild(el('span', 'si-name', item.name));
      card.appendChild(el('span', 'si-have', '×' + n));
      card.addEventListener('click', () => { closeModal(); onPick(item); });
      grid.appendChild(card);
    }
    body.appendChild(grid);
  }, [{ label: 'やめる', onClick: closeModal }]);
}

function actFeed(m) {
  pickItemModal('🍙 なにを あげる？', 'food', (item) => {
    if (!takeItem(item.id, 1)) return;
    const w = W();
    const rea = safe(() => foodReaction(m, item.id), { taste: 'normal', exp: 10, face: '😋', line: 'おいしい！' });
    m.hunger = clamp(m.hunger + 26, 0, 100);
    m.lastFedAt = Date.now();
    w.stats.fed++;
    gainExp(m, rea.exp);
    addLog(m, `${item.name} を たべた（${rea.line}）`);
    sayInRoom(m, `${rea.face} ${rea.line}`);
    if (rea.taste === 'love' || rea.taste === 'hate') {
      addNews(rea.taste === 'love' ? '😍' : '😖', `${m.name} は ${item.name} が ${rea.taste === 'love' ? '大すき' : '苦手'} だった`);
    }
    saveWorld();
    renderRoom();
  }, `おなか：${hungerLabel(m.hunger)}`);
}

function actClothes(m) {
  openModal('👕 ふく', (body) => {
    const owned = m.clothes.owned.map(byId).filter(Boolean);
    body.appendChild(el('p', 'note', 'そうこから わたすか、持っている服に 着がえます。'));
    if (owned.length) {
      const grid = el('div', 'shop-grid');
      for (const it of owned) {
        const card = el('button', 'shop-item' + (m.clothes.current === it.id ? ' is-sel' : ''));
        card.type = 'button';
        card.appendChild(el('span', 'si-emoji', it.emoji || '👕'));
        card.appendChild(el('span', 'si-name', it.name));
        card.addEventListener('click', () => {
          m.clothes.current = it.id;
          gainExp(m, 4);
          sayInRoom(m, 'にあうかな？');
          saveWorld();
          closeModal();
          renderRoom();
        });
        grid.appendChild(card);
      }
      body.appendChild(grid);
    } else {
      body.appendChild(emptyNote('まだ 服を 持っていません。'));
    }
  }, [
    { label: 'そうこから わたす', primary: true, onClick: () => {
      closeModal();
      pickItemModal('👕 どの服を わたす？', 'clothes', (item) => {
        if (!takeItem(item.id, 1)) return;
        m.clothes.owned.push(item.id);
        m.clothes.current = item.id;
        gainExp(m, 16);
        addLog(m, `${item.name} を もらった`);
        sayInRoom(m, `${item.name}！ うれしい！`);
        saveWorld();
        renderRoom();
      });
    } },
    { label: 'とじる', onClick: closeModal },
  ]);
}

function actInterior(m) {
  openModal('🛋️ もようがえ', (body) => {
    const owned = m.room.owned.map(byId).filter(Boolean);
    const grid = el('div', 'shop-grid');
    for (const it of owned) {
      const card = el('button', 'shop-item' + (m.room.theme === it.id ? ' is-sel' : ''));
      card.type = 'button';
      const sw = el('span', 'si-swatch');
      sw.style.background = it.bg || '#eee';
      card.appendChild(sw);
      card.appendChild(el('span', 'si-name', it.name));
      card.addEventListener('click', () => {
        m.room.theme = it.id;
        gainExp(m, 4);
        saveWorld();
        closeModal();
        renderRoom();
      });
      grid.appendChild(card);
    }
    body.appendChild(grid);
  }, [
    { label: 'そうこから わたす', primary: true, onClick: () => {
      closeModal();
      pickItemModal('🛋️ どの部屋に する？', 'interior', (item) => {
        if (!takeItem(item.id, 1)) return;
        if (!m.room.owned.includes(item.id)) m.room.owned.push(item.id);
        m.room.theme = item.id;
        gainExp(m, 18);
        addLog(m, `部屋を ${item.name} に した`);
        sayInRoom(m, 'すてきな 部屋に なった！');
        saveWorld();
        renderRoom();
      });
    } },
    { label: 'とじる', onClick: closeModal },
  ]);
}

function actTool(m) {
  pickItemModal('🧰 どうぐを わたす', 'tool', (item) => {
    if (!takeItem(item.id, 1)) return;
    m.bag.push(item.id);
    gainExp(m, 14);
    addLog(m, `${item.name} を もらった`);
    sayInRoom(m, `${item.name} だ！ つかってみるね`);
    saveWorld();
    renderRoom();
  });
}

function actAllowance(m) {
  const amount = 50 + m.level * 10;
  openModal('🪙 おこづかい', (body) => {
    body.appendChild(el('p', null, `${m.name} に 🪙${amount} を わたしますか？`));
    body.appendChild(el('p', 'note', `島のお金：🪙${W().money}　／　${m.name} の さいふ：🪙${m.wallet}`));
  }, [
    { label: 'やめる', onClick: closeModal },
    { label: 'わたす', primary: true, onClick: () => {
      if (!pay(amount)) { toast('お金が たりません', '🪙'); return; }
      m.wallet += amount;
      gainExp(m, 10);
      sayInRoom(m, 'わーい！ ありがとう！');
      saveWorld();
      closeModal();
      renderRoom();
      renderIsland();
    } },
  ]);
}

function actProfile(m) {
  openModal('📄 ' + m.name + ' の プロフィール', (body) => {
    const wrap = el('div', 'list');
    wrap.appendChild(listRow({ icon: miniFaceCanvas(m.face, 44), main: m.name, sub: personalityName(m.personality) }));
    wrap.appendChild(listRow({ icon: '💗', main: 'まんぞくど', right: 'Lv ' + m.level }));
    wrap.appendChild(listRow({ icon: '🍽️', main: '好きな たべもの', sub: m.likes.map((i) => (byId(i) || {}).name).filter(Boolean).join('、') || '—' }));
    wrap.appendChild(listRow({ icon: '🙅', main: '苦手な たべもの', sub: m.dislikes.map((i) => (byId(i) || {}).name).filter(Boolean).join('、') || '—' }));
    if (m.catch) wrap.appendChild(listRow({ icon: '💬', main: '口ぐせ', sub: m.catch }));
    if (m.songs.length) wrap.appendChild(listRow({ icon: '🎵', main: 'うたえる歌', sub: m.songs.map((i) => (byId(i) || {}).name).filter(Boolean).join('、') }));
    if (m.bag.length) wrap.appendChild(listRow({ icon: '🧰', main: 'もちもの', sub: m.bag.map((i) => (byId(i) || {}).name).filter(Boolean).join('、') }));
    wrap.appendChild(listRow({ icon: '🪙', main: 'さいふ', right: '🪙' + m.wallet }));
    body.appendChild(wrap);
    if (m.log.length) {
      body.appendChild(el('h4', null, 'さいきんの できごと'));
      const lg = el('div', 'list');
      for (const l of m.log.slice(0, 10)) lg.appendChild(listRow({ icon: '·', main: l.text, sub: timeAgo(l.t) }));
      body.appendChild(lg);
    }
  }, [
    { label: '引っこす（島から出す）', onClick: () => confirmMoveOut(m) },
    { label: 'とじる', primary: true, onClick: closeModal },
  ]);
}

function confirmMoveOut(m) {
  openModal('ほんとうに 引っこしますか？', (body) => {
    body.appendChild(el('p', null, `${m.name} は 島から いなくなります。もどせません。`));
  }, [
    { label: 'やめる', onClick: () => actProfile(m) },
    { label: '引っこす', onClick: () => {
      addNews('🚚', `${m.name} が 島を でていった`);
      removeResident(m.id);
      saveWorld();
      closeModal();
      show('island');
      renderIsland();
    } },
  ]);
}

// ══ なかよし ══════════════════════════════

function actRelations(m) {
  openModal('💞 ' + m.name + ' の 人間かんけい', (body) => {
    const list = safe(() => relationList(m, W()), []);
    if (!list.length) { body.appendChild(emptyNote('まだ だれとも 知り合っていません。')); return; }
    const wrap = el('div', 'list');
    for (const r of list) {
      const other = r.other;
      const badge = el('span', 'rel-badge', r.label || REL_LABEL[r.rel.status] || '—');
      if (['crush', 'couple', 'married', 'family'].includes(r.rel.status)) badge.classList.add('is-love');
      if (r.rel.fight) badge.classList.add('is-fight');
      wrap.appendChild(listRow({
        icon: miniFaceCanvas(other.face, 42),
        main: other.name,
        sub: 'なかよし度 ' + Math.round(r.aff != null ? r.aff : r.rel.aff),
        right: badge,
        onClick: () => openPairActions(m, other),
      }));
    }
    body.appendChild(wrap);
  }, [{ label: 'とじる', onClick: closeModal }]);
}

function openPairActions(a, b) {
  const rel = getRel(a, b);
  openModal(`${a.name} と ${b.name}`, (body) => {
    body.appendChild(el('p', 'note', `いまの かんけい：${REL_LABEL[rel.status] || rel.status}（なかよし度 ${Math.round(rel.aff)}）`));
    const wrap = el('div', 'dialog-options');
    const opt = (label, fn) => {
      const btn = el('button', 'opt-btn', label);
      btn.type = 'button';
      btn.addEventListener('click', fn);
      wrap.appendChild(btn);
    };
    opt('🤝 ふたりを 引き合わせる', () => {
      const r = safe(() => introduce(a, b), { ok: true, text: 'なかよく なったみたい。' });
      showLines([r.text || 'なかよく なったみたい。'], () => { saveWorld(); openPairActions(a, b); });
    });
    if (rel.fight) {
      opt('🕊️ けんかを 仲裁する', () => openMediate(a, b));
    }
    if (safe(() => canConfess(a, b), false)) {
      opt('💘 告白を 後おしする', () => {
        const r = safe(() => tryConfess(a, b, W()), { ok: false, accepted: false, lines: ['うまく いかなかった…'] });
        showLines(r.lines || [], () => {
          saveWorld();
          renderIsland();
          openPairActions(a, b);
        });
      });
    }
    if (rel.status === 'couple' && a.level >= 5 && b.level >= 5) {
      opt('💒 けっこんを すすめる', () => {
        const r = safe(() => marry(a, b, W()), { lines: [`${a.name} と ${b.name} は けっこんした！`] });
        showLines(r.lines || [], () => { saveWorld(); renderIsland(); closeModal(); });
      });
    }
    if (rel.status === 'married') {
      opt('👶 こどもの話を する', () => {
        const child = safe(() => tryBearChildSafe(a, b), null);
        if (child) {
          showLines([`${a.name} と ${b.name} に あかちゃんが 生まれた！`, `なまえは ${child.name}。`], () => {
            saveWorld();
            renderIsland();
            closeModal();
          });
        } else {
          showLines(['「そのうちね」と 笑っている。'], () => openPairActions(a, b));
        }
      });
    }
    body.appendChild(wrap);
  }, [{ label: 'もどる', onClick: () => actRelations(a) }]);
}

function tryBearChildSafe(a, b) {
  return safe(() => tryBearChild(a, b, W()), null);
}

function openMediate(a, b) {
  openModal('🕊️ 仲裁', (body) => {
    body.appendChild(el('p', null, `${a.name} と ${b.name} が けんかしています。どうしますか？`));
    const wrap = el('div', 'dialog-options');
    const choices = [
      { key: 'sideA', label: `${a.name} の 味方を する` },
      { key: 'sideB', label: `${b.name} の 味方を する` },
      { key: 'both', label: 'ふたりとも なだめる' },
    ];
    for (const c of choices) {
      const btn = el('button', 'opt-btn', c.label);
      btn.type = 'button';
      btn.addEventListener('click', () => {
        const r = safe(() => mediate(a, b, c.key, W()), { ok: true, lines: ['なんとか おさまった。'] });
        showLines(r.lines || [], () => { saveWorld(); renderIsland(); openPairActions(a, b); });
      });
      wrap.appendChild(btn);
    }
    body.appendChild(wrap);
  }, [{ label: 'やめる', onClick: () => openPairActions(a, b) }]);
}

// ══ セリフ表示 ══════════════════════════════

function speakerStrip(m) {
  const strip = el('div', 'speaker-strip');
  strip.appendChild(miniFaceCanvas(m.face, 52));
  const t = el('div', 'speaker-meta');
  t.appendChild(el('b', null, m.name));
  t.appendChild(el('span', null, personalityName(m.personality)));
  strip.appendChild(t);
  return strip;
}

function showLines(lines, done, speaker) {
  const arr = Array.isArray(lines) ? lines.filter(Boolean) : [String(lines)];
  openModal('　', (body) => {
    if (speaker) body.appendChild(speakerStrip(speaker));
    const host = el('div', 'dialog-lines');
    body.appendChild(host);
    arr.forEach((t, i) => {
      setTimeout(() => {
        const p = el('p', 'dialog-line', t);
        host.appendChild(p);
        if (speaker && i === 0) speak(speaker, t);
      }, i * 260);
    });
  }, [{ label: 'つぎへ', primary: true, onClick: () => { closeModal(); if (done) done(); } }]);
}

// ══ 吹き出し（なやみ） ══════════════════════════════

function openBubbleDialog(m) {
  const w = W();
  const dlg = safe(() => openBubble(m, w), null);
  if (!dlg) { m.bubble = null; renderRoom(); return; }
  openModal(dlg.title || '💭', (body) => {
    body.appendChild(speakerStrip(m));
    const host = el('div', 'dialog-lines');
    body.appendChild(host);
    for (const t of dlg.lines || []) host.appendChild(el('p', 'dialog-line', t));
    if ((dlg.lines || []).length) speak(m, dlg.lines[0]);
    const opts = el('div', 'dialog-options');
    for (const o of dlg.options || [{ key: 'ok', label: 'わかった' }]) {
      const btn = el('button', 'opt-btn', o.label);
      btn.type = 'button';
      btn.addEventListener('click', () => handleBubbleChoice(m, dlg, o.key));
      opts.appendChild(btn);
    }
    body.appendChild(opts);
  }, []);
}

function handleBubbleChoice(m, dlg, key) {
  const w = W();
  const needCat = dlg.needs;
  const needing = needCat && key !== 'later' && key !== 'no' && key !== 'cancel';
  const finish = () => {
    const res = safe(() => resolveBubble(m, w, key), { lines: ['ありがとう。'], exp: 8, ok: true, clearBubble: true });
    if (res.exp) gainExp(m, res.exp);
    if (res.money) addMoney(res.money);
    if (res.treasure) addItem(res.treasure, 1);
    if (res.clearBubble !== false) m.bubble = null;
    w.stats.nayami++;
    addLog(m, (dlg.title || 'なやみ') + ' を きいた');
    saveWorld();
    showLines(res.lines || ['ありがとう。'], () => { renderRoom(); renderIsland(); }, m);
  };
  if (needing && ['food', 'clothes', 'interior', 'tool'].includes(needCat)) {
    closeModal();
    pickItemModal('なにを わたす？', needCat, (item) => {
      if (!takeItem(item.id, 1)) return;
      if (needCat === 'food') { m.hunger = clamp(m.hunger + 26, 0, 100); w.stats.fed++; }
      if (needCat === 'clothes') { m.clothes.owned.push(item.id); m.clothes.current = item.id; }
      if (needCat === 'interior') { if (!m.room.owned.includes(item.id)) m.room.owned.push(item.id); m.room.theme = item.id; }
      if (needCat === 'tool') m.bag.push(item.id);
      gainExp(m, 10);
      finish();
    });
    return;
  }
  closeModal();
  finish();
}

// ══ レベルアップの プレゼント ══════════════════════════════

function giftChoices(m) {
  const rand = seeded(m.id + m.level);
  return [
    { cat: 'interior', emoji: '🛋️', name: 'インテリア', items: pickMany(INTERIORS.filter((x) => x.price > 0), 3, rand) },
    { cat: 'tool', emoji: '🧰', name: 'どうぐ', items: pickMany(TOOLS, 3, rand) },
    { cat: 'song', emoji: '🎵', name: 'うた', items: pickMany(SONGS, 3, rand) },
    { cat: 'word', emoji: '💬', name: '口ぐせ', items: pickMany(WORDS, 3, rand) },
  ];
}

function openGift(m) {
  openModal(`🎉 ${m.name} が Lv ${m.level} に なった！`, (body) => {
    body.appendChild(el('p', null, 'おいわいに ひとつ プレゼントしよう。'));
    const grid = el('div', 'gift-grid');
    for (const g of giftChoices(m)) {
      const card = el('button', 'gift-card');
      card.type = 'button';
      card.appendChild(el('span', 'gc-emoji', g.emoji));
      card.appendChild(el('span', 'gc-name', g.name));
      card.addEventListener('click', () => openGiftPick(m, g));
      grid.appendChild(card);
    }
    body.appendChild(grid);
  }, [{ label: 'あとで', onClick: closeModal }]);
}

function openGiftPick(m, g) {
  openModal(g.emoji + ' ' + g.name, (body) => {
    const grid = el('div', 'shop-grid');
    for (const it of g.items) {
      if (!it) continue;
      const card = el('button', 'shop-item');
      card.type = 'button';
      if (g.cat === 'word') {
        card.appendChild(el('span', 'si-emoji', '💬'));
        card.appendChild(el('span', 'si-name', it.text));
      } else if (g.cat === 'interior') {
        const sw = el('span', 'si-swatch');
        sw.style.background = it.bg || '#eee';
        card.appendChild(sw);
        card.appendChild(el('span', 'si-name', it.name));
      } else {
        card.appendChild(el('span', 'si-emoji', it.emoji || '🎁'));
        card.appendChild(el('span', 'si-name', it.name));
      }
      card.addEventListener('click', () => {
        if (g.cat === 'word') { m.catch = it.text; sayInRoom(m, `${it.text}！`); }
        else if (g.cat === 'song') { if (!m.songs.includes(it.id)) m.songs.push(it.id); sayInRoom(m, `${it.name} を おぼえた！`); }
        else if (g.cat === 'tool') { m.bag.push(it.id); sayInRoom(m, `${it.name} だ！`); }
        else { if (!m.room.owned.includes(it.id)) m.room.owned.push(it.id); m.room.theme = it.id; sayInRoom(m, 'いい部屋に なった！'); }
        m.pendingGift = false;
        addLog(m, `Lv ${m.level} の おいわいを もらった`);
        saveWorld();
        closeModal();
        renderRoom();
        renderIsland();
      });
      grid.appendChild(card);
    }
    body.appendChild(grid);
  }, [{ label: 'もどる', onClick: () => openGift(m) }]);
}

// ══ 時間の進行 ══════════════════════════════

function tick() {
  const w = W();
  const ticks = advanceTime();
  if (ticks > 0) {
    safe(() => spawnBubbles(w, ticks), null);
    safe(() => simulateRelations(w, ticks), []);
    unlockCheck();
    saveWorld();
    if (!$('view-island').hidden) renderIsland();
    if (!$('view-room').hidden) renderRoom();
  }
}

function loop() {
  animCreate();
  animRoom();
  rafId = requestAnimationFrame(loop);
}

// ══ 起動 ══════════════════════════════

function wire() {
  $('btn-start').addEventListener('click', () => {
    if (W().residents.length === 0) openCreate();
    else { show('island'); renderIsland(); }
  });
  $('btn-continue').addEventListener('click', () => { show('island'); renderIsland(); });
  $('btn-title-help').addEventListener('click', openHelp);
  $('btn-help').addEventListener('click', openHelp);
  $('btn-add').addEventListener('click', () => {
    if (W().residents.length >= MAX_RESIDENTS) toast('マンションが まんしつです', '🏢');
    else openCreate();
  });
  $('btn-create-cancel').addEventListener('click', () => {
    editing = null;
    if (W().residents.length) { show('island'); renderIsland(); }
    else show('title');
  });
  $('btn-create-done').addEventListener('click', finishCreate);
  $('btn-face-random').addEventListener('click', () => {
    editing.face = randomFace();
    buildFacePane();
  });
  $('btn-room-back').addEventListener('click', () => { currentId = null; show('island'); renderIsland(); });
  $('modal-close').addEventListener('click', closeModal);
  $('modal-layer').addEventListener('click', (e) => { if (e.target === $('modal-layer')) closeModal(); });
  for (const t of document.querySelectorAll('#create-tabs .tab')) {
    t.addEventListener('click', () => selectTab(t.dataset.tab));
  }
  for (const b of document.querySelectorAll('#seg-gender .seg-btn')) {
    b.addEventListener('click', () => {
      editing.gender = b.dataset.v;
      for (const o of document.querySelectorAll('#seg-gender .seg-btn')) o.classList.toggle('is-on', o === b);
    });
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  window.addEventListener('beforeunload', saveWorld);
}

function decorateTitle() {
  const card = document.querySelector('.title-card');
  if (!card || card.querySelector('.title-faces')) return;
  const strip = el('div', 'title-faces');
  const w = W();
  const faces = w.residents.length
    ? w.residents.slice(0, 5).map((m) => m.face)
    : Array.from({ length: 5 }, (_, i) => randomFace(seeded('title' + i + new Date().toDateString())));
  for (const f of faces) strip.appendChild(miniFaceCanvas(f, 56));
  const buttons = card.querySelector('.title-buttons');
  card.insertBefore(strip, buttons);
}

function boot(fresh = false) {
  const had = fresh ? false : loadWorld();
  const w = W();
  ensureRels(w);
  $('btn-continue').hidden = !(had && w.residents.length);
  if (had && w.residents.length) {
    tick();
    show('island');
    renderIsland();
  } else {
    decorateTitle();
    show('title');
  }
}

wire();
boot();
tick();
setInterval(tick, 15000);
loop();

// 動作確認用のフック。遊びかたには影響しない。
window.__td = {
  world: W, tick, renderIsland, renderRoom, enterRoom,
  openBubbleDialog, openGift, openShop, openPark, openFountain, startMinigame, addItem, toast,
};
