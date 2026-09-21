// 島まるごとの状態。セーブ・ロード・時間経過・住人の生成をここに集約する。
// 依存は rng.js だけ。ほかのモジュールはこのファイルに依存してよいが、
// このファイルからほかを import してはいけない（循環を避けるため）。

import { clamp, pick, pickMany, randInt, seeded, uid } from './rng.js';

export const SAVE_KEY = 'tomodachi-island-v1';
export const MAX_RESIDENTS = 24;

/** 1 tick = 実時間 2 分。おなかや出来事はこの単位で進む。 */
export const TICK_MS = 2 * 60 * 1000;
/** 閉じているあいだの追いつきは最大 12 時間ぶんまで。 */
export const MAX_CATCHUP_TICKS = (12 * 60) / 2;

export const PERSONALITY_AXES = [
  { key: 'bright', minus: 'おっとり', plus: 'あかるい' },
  { key: 'active', minus: 'マイペース', plus: 'アクティブ' },
  { key: 'speech', minus: 'ひかえめ', plus: 'おしゃべり' },
  { key: 'kind', minus: 'クール', plus: 'やさしい' },
];

const PERSONALITY_NAMES = [
  'のんびりや', 'ひとりずき', 'ゆめみがち', 'おだやか',
  'てれや', 'しんちょう', 'ねっけつ', 'せわやき',
  'まじめ', 'こだわりや', 'おちゃめ', 'がんばりや',
  'ムードメーカー', 'あまえんぼ', 'リーダーはだ', 'おひとよし',
];

export function personalityName(p) {
  const i =
    (p.bright >= 0 ? 8 : 0) + (p.active >= 0 ? 4 : 0) + (p.speech >= 0 ? 2 : 0) + (p.kind >= 0 ? 1 : 0);
  return PERSONALITY_NAMES[i];
}

/** 性格から求める「話し方のくせ」。セリフ生成で使う。 */
export function speechStyle(p) {
  if (p.speech > 40 && p.bright > 0) return 'genki';
  if (p.speech < -40) return 'shy';
  if (p.kind < -40) return 'cool';
  if (p.kind > 40) return 'kind';
  return 'normal';
}

export const REL_ORDER = ['stranger', 'acquaint', 'friend', 'bestie', 'crush', 'couple', 'married', 'family'];
export const REL_LABEL = {
  stranger: 'しらない',
  acquaint: 'かおみしり',
  friend: 'ともだち',
  bestie: 'しんゆう',
  crush: 'かたおもい',
  couple: 'こいびと',
  married: 'けっこん',
  family: 'かぞく',
};

/** 満足度レベル n から n+1 に上がるのに必要な経験値。 */
export function expToNext(level) {
  return Math.round(28 + level * 12 + Math.pow(level, 1.55) * 2.2);
}

export function makeFaceSeed() {
  return uid('f');
}

/**
 * 住人をつくる。face は face.js の randomFace() の返り値をそのまま入れる。
 * foodIds は items.js の食べ物 id 配列（好き嫌いの抽選に使う）。
 */
export function createResident({ name, yomi = '', gender = 'x', face, voice, personality, foodIds = [] }) {
  const id = uid('m');
  const r = seeded(id + name);
  const pers = personality || {
    bright: randInt(-100, 100, r),
    active: randInt(-100, 100, r),
    speech: randInt(-100, 100, r),
    kind: randInt(-100, 100, r),
  };
  const tastes = pickMany(foodIds, Math.min(5, foodIds.length), r);
  return {
    id,
    name,
    yomi: yomi || name,
    gender,
    face,
    voice: voice || { pitch: randInt(30, 70, r), speed: randInt(35, 65, r), tone: randInt(0, 3, r) },
    personality: pers,
    catch: null,
    level: 1,
    exp: 0,
    hunger: 70,
    wallet: 0,
    likes: tastes.slice(0, 3),
    dislikes: tastes.slice(3, 5),
    clothes: { current: null, owned: [] },
    room: { theme: 'room_plain', owned: ['room_plain'] },
    bag: [],
    songs: [],
    words: [],
    treasures: [],
    rels: {},
    partnerId: null,
    parents: [],
    isChild: false,
    pendingGift: false,
    bubble: null,
    log: [],
    movedAt: Date.now(),
    lastFedAt: 0,
    lastTalkAt: 0,
  };
}

export function newWorld() {
  return {
    v: 1,
    createdAt: Date.now(),
    lastTick: Date.now(),
    money: 300,
    residents: [],
    news: [],
    fountain: { wishes: 0, level: 1 },
    shops: { refreshedAt: 0, food: [], clothes: [], interior: [] },
    unlocked: { pawn: false, news: false, fountain: false, park: false },
    stats: { marriages: 0, children: 0, minigames: 0, nayami: 0, fed: 0 },
    flags: { ending: false, seenHelp: false },
    settings: { sound: true },
  };
}

let world = newWorld();

export function getWorld() {
  return world;
}

export function setWorld(w) {
  world = w;
}

export function loadWorld() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data || data.v !== 1) return false;
    world = Object.assign(newWorld(), data);
    // 後から増えた欄を埋める
    world.unlocked = Object.assign({ pawn: false, news: false, fountain: false, park: false }, world.unlocked);
    world.stats = Object.assign({ marriages: 0, children: 0, minigames: 0, nayami: 0, fed: 0 }, world.stats);
    for (const m of world.residents) {
      m.rels = m.rels || {};
      m.bag = m.bag || [];
      m.log = m.log || [];
      m.treasures = m.treasures || [];
      m.songs = m.songs || [];
      m.words = m.words || [];
    }
    return true;
  } catch (e) {
    console.warn('セーブの読み込みに失敗しました', e);
    return false;
  }
}

let saveTimer = 0;
export function saveWorld() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(world));
  } catch (e) {
    console.warn('セーブに失敗しました', e);
  }
}
/** 連打しても 1 秒に 1 回しか書かない遅延セーブ。 */
export function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveWorld, 800);
}

export function resetWorld() {
  world = newWorld();
  saveWorld();
}

// ── 住人の出し入れ ────────────────────────────────

export function addResident(m) {
  if (world.residents.length >= MAX_RESIDENTS) return false;
  world.residents.push(m);
  for (const o of world.residents) {
    if (o.id === m.id) continue;
    o.rels[m.id] = o.rels[m.id] || { aff: 0, status: 'stranger', fight: false, met: false };
    m.rels[o.id] = m.rels[o.id] || { aff: 0, status: 'stranger', fight: false, met: false };
  }
  saveSoon();
  return true;
}

export function removeResident(id) {
  world.residents = world.residents.filter((m) => m.id !== id);
  for (const o of world.residents) {
    delete o.rels[id];
    if (o.partnerId === id) o.partnerId = null;
  }
  saveSoon();
}

export function findResident(id) {
  return world.residents.find((m) => m.id === id) || null;
}

// ── 関係 ────────────────────────────────

export function getRel(a, b) {
  if (!a.rels[b.id]) a.rels[b.id] = { aff: 0, status: 'stranger', fight: false, met: false };
  return a.rels[b.id];
}

/** 両方向にまとめて好感度を足す。status の昇格は relations.js の担当。 */
export function addAff(a, b, delta) {
  const ra = getRel(a, b);
  const rb = getRel(b, a);
  ra.aff = clamp(ra.aff + delta, -30, 100);
  rb.aff = clamp(rb.aff + delta, -30, 100);
  ra.met = rb.met = true;
  return ra.aff;
}

// ── 満足度・お金 ────────────────────────────────

/** 満足度を足す。レベルが上がったら pendingGift を立てて上がった数を返す。 */
export function gainExp(m, amount) {
  if (m.level >= 99) return 0;
  m.exp += Math.max(0, Math.round(amount));
  let ups = 0;
  while (m.level < 99 && m.exp >= expToNext(m.level)) {
    m.exp -= expToNext(m.level);
    m.level++;
    ups++;
    m.pendingGift = true;
  }
  if (ups) {
    addNews('🎉', `${m.name} の まんぞくどが レベル ${m.level} に なった`);
    unlockCheck();
  }
  saveSoon();
  return ups;
}

export function addMoney(n) {
  world.money = Math.max(0, world.money + Math.round(n));
  saveSoon();
}

export function canPay(n) {
  return world.money >= n;
}

export function pay(n) {
  if (!canPay(n)) return false;
  world.money -= n;
  saveSoon();
  return true;
}

// ── ニュース ────────────────────────────────

export function addNews(icon, text) {
  world.news.unshift({ t: Date.now(), icon, text });
  if (world.news.length > 120) world.news.length = 120;
}

export function addLog(m, text) {
  m.log.unshift({ t: Date.now(), text });
  if (m.log.length > 30) m.log.length = 30;
}

// ── 施設の解放 ────────────────────────────────

export function unlockCheck() {
  const u = world.unlocked;
  const n = world.residents.length;
  const msgs = [];
  if (!u.news && n >= 3) { u.news = true; msgs.push('📺 ニュースほうそうきょく'); }
  if (!u.pawn && world.stats.minigames >= 2) { u.pawn = true; msgs.push('💰 しちや'); }
  if (!u.park && n >= 5) { u.park = true; msgs.push('🎡 こうえん'); }
  if (!u.fountain && n >= 4 && world.residents.some((m) => m.level >= 3)) {
    u.fountain = true;
    msgs.push('⛲ ねがいの ふんすい');
  }
  for (const s of msgs) addNews('✨', `${s} が つかえるように なった！`);
  return msgs;
}

// ── 時間 ────────────────────────────────

/** 実時間を進めて、経過した tick 数を返す。おなかの減りだけここで処理する。 */
export function advanceTime(now = Date.now()) {
  const elapsed = now - world.lastTick;
  if (elapsed < TICK_MS) return 0;
  const ticks = Math.min(MAX_CATCHUP_TICKS, Math.floor(elapsed / TICK_MS));
  world.lastTick = now - (elapsed % TICK_MS);
  for (const m of world.residents) {
    // 8 時間で満腹から空腹まで落ちる
    m.hunger = clamp(m.hunger - ticks * (100 / 240), 0, 100);
  }
  return ticks;
}

/** 0=ごきげん 1=ふつう 2=ふきげん。おなかと吹き出しの放置で決まる。 */
export function moodOf(m) {
  if (m.hunger < 22) return 2;
  if (m.bubble && m.bubble.kind === 'nayami' && Date.now() - m.bubble.at > 30 * 60 * 1000) return 2;
  if (m.hunger > 70 && !m.bubble) return 0;
  return 1;
}

export const MOOD_LABEL = ['ごきげん', 'ふつう', 'ふきげん'];

export function hungerLabel(h) {
  if (h > 80) return 'まんぷく';
  if (h > 55) return 'ふつう';
  if (h > 30) return 'すこし へった';
  if (h > 12) return 'おなかぺこぺこ';
  return 'はらぺこ';
}
