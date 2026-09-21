// 住人どうしの関係。しらない人 → かおみしり → ともだち → しんゆう、
// そこから かたおもい・こいびと・けっこん・かぞく へと すすんでいく。
// 時間が すぎるあいだの「かってに おきる出来事」も ここで 抽選する。

import { chance, clamp, pick, randInt, rnd, seeded, shuffle } from './rng.js';
import {
  MAX_RESIDENTS,
  REL_LABEL,
  REL_ORDER,
  addAff,
  addLog,
  addNews,
  addResident,
  createResident,
  gainExp,
  getRel,
  getWorld,
  saveSoon,
} from './state.js';
import { childFace, randomFace } from './face.js';
import { foodIds } from './items.js';

// ── こまかい設定 ────────────────────────────────

/** 1 tick に 島ぜんたいで おきる出来事の上限。見ていて いそがしすぎないように。 */
const MAX_EVENTS_PER_TICK = 2;
/** まとめて すすめられる tick 数の上限。 */
const MAX_SIM_TICKS = 400;

/** こいびとが けっこんできるようになるまでの tick 数。 */
const COUPLE_TICKS_FOR_MARRY = 40;
/** けっこん してから 子どもが 生まれるまでの さいたん tick 数。 */
const MARRIED_TICKS_FOR_CHILD = 40;

const CHILD_NAMES = [
  'ひな', 'そら', 'ゆう', 'こはる', 'あおい', 'みなと', 'りん', 'つむぎ',
  'いつき', 'ののか', 'はる', 'かなで', 'しおん', 'ひまり', 'あさひ', 'るい',
  'なぎ', 'ことは', 'ゆずは', 'たいが', 'すず', 'まひろ',
];

// ── きほんの道具 ────────────────────────────────

function residentsOf(world) {
  return (world && world.residents) || [];
}

function indexOf(world, m) {
  return residentsOf(world).findIndex((x) => x.id === m.id);
}

/** 住人は 4 人ずつ 同じ階に すんでいる ものとして あつかう。 */
export function floorOf(world, m) {
  const i = indexOf(world, m);
  return i < 0 ? 0 : Math.floor(i / 4);
}

/** 部屋が どれだけ ちかいか。0..1（1 が となり同士）。 */
export function nearness(world, a, b) {
  const ia = indexOf(world, a);
  const ib = indexOf(world, b);
  if (ia < 0 || ib < 0) return 0.3;
  const d = Math.abs(ia - ib);
  const sameFloor = Math.floor(ia / 4) === Math.floor(ib / 4);
  let n = 1 - Math.min(d, 8) / 10;
  if (sameFloor) n += 0.25;
  return clamp(n, 0.12, 1);
}

/** 性格の あいしょう。0..1。にている ほうが なかよくなりやすい。 */
export function compat(a, b) {
  const p = a.personality || {};
  const q = b.personality || {};
  const near = (x, y) => 1 - Math.abs((x || 0) - (y || 0)) / 200;
  const s =
    near(p.bright, q.bright) * 1.0 +
    near(p.kind, q.kind) * 1.2 +
    near(p.active, q.active) * 0.8 +
    // おしゃべり具合は すこし ちがう ほうが かみあう
    (1 - Math.abs(Math.abs((p.speech || 0) - (q.speech || 0)) - 60) / 140) * 0.6;
  return clamp(s / 3.6, 0, 1);
}

function statusRank(s) {
  const i = REL_ORDER.indexOf(s);
  return i < 0 ? 0 : i;
}

function isPartnered(m) {
  return !!m.partnerId;
}

function isFamily(a, b) {
  if ((a.parents || []).includes(b.id)) return true;
  if ((b.parents || []).includes(a.id)) return true;
  const pa = a.parents || [];
  const pb = b.parents || [];
  if (pa.length && pb.length && pa.some((x) => pb.includes(x))) return true; // きょうだい
  return false;
}

// ── rels の ととのえ ────────────────────────────────

/** 欠けている rels を うめる。セーブを 読んだ あとに よぶ。 */
export function ensureRels(world = getWorld()) {
  const list = residentsOf(world);
  for (const m of list) {
    m.rels = m.rels || {};
    for (const o of list) {
      if (o.id === m.id) continue;
      const r = m.rels[o.id] || {};
      if (typeof r.aff !== 'number') r.aff = 0;
      if (!r.status) r.status = 'stranger';
      if (typeof r.fight !== 'boolean') r.fight = false;
      if (typeof r.met !== 'boolean') r.met = false;
      if (typeof r.ticks !== 'number') r.ticks = 0; // いまの status が つづいた tick 数
      m.rels[o.id] = r;
    }
    // いなくなった 住人の ぶんは かたづける
    for (const id of Object.keys(m.rels)) {
      if (id !== m.id && !list.some((x) => x.id === id)) delete m.rels[id];
    }
    if (m.partnerId && !list.some((x) => x.id === m.partnerId)) m.partnerId = null;
    // かぞく関係は いつでも かぞく
    for (const o of list) {
      if (o.id === m.id) continue;
      if (isFamily(m, o)) {
        const r = getRel(m, o);
        r.status = 'family';
        r.met = true;
        if (r.aff < 55) r.aff = 55;
      }
    }
  }
  return world;
}

/** 好感度から status を つけなおす。こいなどの とくべつな status は そのまま。 */
function refreshStatus(a, b) {
  for (const [x, y] of [[a, b], [b, a]]) {
    const r = getRel(x, y);
    if (['crush', 'couple', 'married', 'family'].includes(r.status)) continue;
    let s = 'stranger';
    if (r.aff >= 70) s = 'bestie';
    else if (r.aff >= 35) s = 'friend';
    else if (r.aff >= 10) s = 'acquaint';
    if (s !== r.status) {
      r.status = s;
      r.ticks = 0;
    }
  }
}

/** 両方向の status のうち すすみの おそい ほうを かえす。 */
export function statusOf(a, b) {
  if (!a || !b || a.id === b.id) return 'stranger';
  const ra = getRel(a, b);
  const rb = getRel(b, a);
  return statusRank(ra.status) <= statusRank(rb.status) ? ra.status : rb.status;
}

/** 好感度の たかいじゅんに ならべた 関係の一覧。 */
export function relationList(m, world = getWorld()) {
  const out = [];
  for (const o of residentsOf(world)) {
    if (o.id === m.id) continue;
    const r = getRel(m, o);
    out.push({
      other: o,
      rel: r,
      label: REL_LABEL[r.status] || REL_LABEL.stranger,
      aff: r.aff,
      fight: !!r.fight,
      status: r.status,
    });
  }
  out.sort((x, y) => y.aff - x.aff);
  return out;
}

// ── プレイヤーの はたらきかけ ────────────────────────────────

/** ふたりを 引きあわせる。 */
export function introduce(a, b) {
  if (!a || !b || a.id === b.id) return { ok: false, text: 'おなじ人どうしは 引きあわせられないよ' };
  const ra = getRel(a, b);
  const rb = getRel(b, a);
  const c = compat(a, b);
  const first = !ra.met;
  const gain = first ? 8 + Math.round(c * 8) : 3 + Math.round(c * 4);
  addAff(a, b, gain);
  ra.met = rb.met = true;
  refreshStatus(a, b);
  const text = first
    ? `${a.name} と ${b.name} は はじめて あいさつを した`
    : `${a.name} と ${b.name} は すこし おしゃべりを した`;
  addNews('🤝', text);
  addLog(a, text);
  addLog(b, text);
  saveSoon();
  return { ok: true, text, aff: ra.aff, status: statusOf(a, b) };
}

/** 告白ボタンを 出してよいか。 */
export function canConfess(a, b) {
  if (!a || !b || a.id === b.id) return false;
  if (isFamily(a, b)) return false;
  if (a.isChild || b.isChild) return false;
  if (isPartnered(a) || isPartnered(b)) return false;
  const ra = getRel(a, b);
  return ra.status === 'crush' && ra.aff >= 55;
}

/** 告白の 成功率。0.4 〜 0.95。 */
export function confessChance(a, b) {
  const ra = getRel(a, b);
  const rb = getRel(b, a);
  const aff = (ra.aff + rb.aff) / 2;
  const c = compat(a, b);
  const lv = Math.min(10, ((a.level || 1) + (b.level || 1)) / 2);
  let p = 0.4 + ((aff - 55) / 45) * 0.25 + c * 0.2 + (lv / 10) * 0.1;
  if (rb.status === 'crush') p += 0.1;
  if (ra.fight || rb.fight) p -= 0.15;
  return clamp(p, 0.4, 0.95);
}

/** 告白させる。 */
export function tryConfess(a, b, world = getWorld()) {
  if (!a || !b || a.id === b.id) return { ok: false, accepted: false, lines: ['だれに つたえるのか わからないよ'] };
  if (isPartnered(a) || isPartnered(b)) {
    return { ok: false, accepted: false, lines: ['もう すてきな あいてが いるみたい'] };
  }
  if (isFamily(a, b)) {
    return { ok: false, accepted: false, lines: ['かぞくどうしだから、ちがう かたちの なかよしだね'] };
  }
  const ra = getRel(a, b);
  const rb = getRel(b, a);
  const p = confessChance(a, b);
  const accepted = chance(p);
  const lines = [`${a.name}「${b.name}… ずっと まえから すきでした！」`];
  if (accepted) {
    ra.status = rb.status = 'couple';
    ra.ticks = rb.ticks = 0;
    a.partnerId = b.id;
    b.partnerId = a.id;
    addAff(a, b, 18);
    lines.push(`${b.name}「わたしも… うれしい！」`);
    lines.push(`ふたりは こいびとに なった！`);
    addNews('💞', `${a.name} と ${b.name} が こいびとに なった！`);
    addLog(a, `${b.name} と こいびとに なった`);
    addLog(b, `${a.name} と こいびとに なった`);
    gainExp(a, 25);
    gainExp(b, 25);
  } else {
    ra.status = 'crush';
    addAff(a, b, -4);
    lines.push(`${b.name}「ごめんね… いまは ともだちで いさせて」`);
    lines.push('また こんど、ちょうせん してみよう');
    addLog(a, `${b.name} に 告白したけど だめだった`);
  }
  refreshStatus(a, b);
  saveSoon();
  return { ok: true, accepted, lines, chance: p };
}

/** けっこんできるか。 */
export function canMarry(a, b) {
  if (!a || !b) return false;
  const ra = getRel(a, b);
  if (ra.status !== 'couple') return false;
  if ((a.level || 1) < 5 || (b.level || 1) < 5) return false;
  return (ra.ticks || 0) >= COUPLE_TICKS_FOR_MARRY;
}

export function marry(a, b, world = getWorld()) {
  const ra = getRel(a, b);
  const rb = getRel(b, a);
  if (ra.status === 'married') return { lines: ['ふたりは もう けっこん しているよ'], ok: false };
  if (ra.status !== 'couple') return { lines: ['まだ こいびとに なっていないみたい'], ok: false };
  ra.status = rb.status = 'married';
  ra.ticks = rb.ticks = 0;
  a.partnerId = b.id;
  b.partnerId = a.id;
  addAff(a, b, 25);
  world.stats.marriages = (world.stats.marriages || 0) + 1;
  const lines = [
    `${a.name} と ${b.name} の けっこんしきが はじまった`,
    'しまじゅうの みんなが おいわいに あつまったよ',
    `${a.name}「これからも よろしくね」`,
    `${b.name}「うん、ずっと いっしょに いようね」`,
  ];
  addNews('💒', `${a.name} と ${b.name} が けっこんした！`);
  addLog(a, `${b.name} と けっこんした`);
  addLog(b, `${a.name} と けっこんした`);
  gainExp(a, 60);
  gainExp(b, 60);
  saveSoon();
  return { lines, ok: true };
}

function childNameFor(world, a, b, r = rnd) {
  const used = new Set(residentsOf(world).map((m) => m.name));
  const pool = shuffle(CHILD_NAMES, r).filter((n) => !used.has(n));
  const base = pool[0] || CHILD_NAMES[randInt(0, CHILD_NAMES.length - 1, r)];
  if (used.has(base)) return base + randInt(2, 9, r);
  return base;
}

/** じょうけんを みたしていれば 子どもが 生まれる。 */
export function tryBearChild(a, b, world = getWorld(), force = false) {
  if (!a || !b) return null;
  const ra = getRel(a, b);
  if (ra.status !== 'married') return null;
  if (residentsOf(world).length >= MAX_RESIDENTS) return null;
  if (a.isChild || b.isChild) return null;
  if (!force) {
    if ((ra.ticks || 0) < MARRIED_TICKS_FOR_CHILD) return null;
    // すでに 子どもが 2 人 いたら もう 生まれない
    const kids = residentsOf(world).filter((m) => (m.parents || []).includes(a.id) && (m.parents || []).includes(b.id));
    if (kids.length >= 2) return null;
    if (!chance(0.05)) return null;
  }
  const r = seeded(a.id + b.id + residentsOf(world).length);
  let face = null;
  try {
    face = childFace(a.face, b.face, r);
  } catch (e) {
    face = randomFace(r);
  }
  let ids = [];
  try {
    ids = foodIds() || [];
  } catch (e) {
    ids = [];
  }
  const name = childNameFor(world, a, b, r);
  const child = createResident({
    name,
    yomi: name,
    gender: pick(['m', 'f', 'x'], r),
    face,
    foodIds: ids,
    personality: {
      bright: clamp(Math.round(((a.personality.bright + b.personality.bright) / 2) + randInt(-30, 30, r)), -100, 100),
      active: clamp(Math.round(((a.personality.active + b.personality.active) / 2) + randInt(-30, 30, r)), -100, 100),
      speech: clamp(Math.round(((a.personality.speech + b.personality.speech) / 2) + randInt(-30, 30, r)), -100, 100),
      kind: clamp(Math.round(((a.personality.kind + b.personality.kind) / 2) + randInt(-30, 30, r)), -100, 100),
    },
  });
  child.isChild = true;
  child.parents = [a.id, b.id];
  const ok = addResident(child);
  if (!ok) return null;
  ensureRels(world);
  for (const p of [a, b]) {
    const rc = getRel(child, p);
    const rp = getRel(p, child);
    rc.status = rp.status = 'family';
    rc.met = rp.met = true;
    rc.aff = rp.aff = 70;
  }
  ra.ticks = 0;
  getRel(b, a).ticks = 0;
  world.stats.children = (world.stats.children || 0) + 1;
  addNews('👶', `${a.name} と ${b.name} に あかちゃん「${child.name}」が 生まれた！`);
  addLog(a, `${child.name} が 生まれた`);
  addLog(b, `${child.name} が 生まれた`);
  gainExp(a, 40);
  gainExp(b, 40);
  saveSoon();
  return child;
}

// ── けんかと なかなおり ────────────────────────────────

export function startFight(a, b, world = getWorld()) {
  if (!a || !b || a.id === b.id) return { ok: false, text: 'けんかの あいてが いないよ' };
  const ra = getRel(a, b);
  const rb = getRel(b, a);
  if (ra.fight) return { ok: false, text: 'もう けんかの さいちゅうだよ' };
  ra.fight = rb.fight = true;
  ra.fightAt = rb.fightAt = Date.now();
  addAff(a, b, -6);
  const text = `${a.name} と ${b.name} が けんかを してしまった…`;
  addNews('💢', text);
  addLog(a, `${b.name} と けんかした`);
  addLog(b, `${a.name} と けんかした`);
  saveSoon();
  return { ok: true, text };
}

export function isFighting(a, b) {
  return !!getRel(a, b).fight;
}

/** 仲裁。choice は 'sideA' | 'sideB' | 'both'。 */
export function mediate(a, b, choice, world = getWorld()) {
  if (!a || !b || a.id === b.id) return { ok: false, lines: ['だれと だれの なかなおりかな？'] };
  const ra = getRel(a, b);
  const rb = getRel(b, a);
  if (!ra.fight) return { ok: false, lines: ['ふたりは けんかを していないよ'] };
  const lines = [];
  let ok = true;
  if (choice === 'both') {
    ra.fight = rb.fight = false;
    addAff(a, b, 12);
    lines.push('「どっちの きもちも わかるよ」と つたえた');
    lines.push(`${a.name}「…そうだね、ごめん」`);
    lines.push(`${b.name}「わたしも いいすぎた。なかなおり しよう」`);
    gainExp(a, 14);
    gainExp(b, 14);
  } else if (choice === 'sideA' || choice === 'sideB') {
    const win = choice === 'sideA' ? a : b;
    const lose = choice === 'sideA' ? b : a;
    ra.fight = rb.fight = false;
    addAff(a, b, 4);
    const rw = getRel(win, lose);
    const rl = getRel(lose, win);
    rw.aff = clamp(rw.aff + 4, -30, 100);
    rl.aff = clamp(rl.aff - 6, -30, 100);
    lines.push(`${win.name} の かたを もった`);
    lines.push(`${win.name}「ありがとう、わかってくれて うれしい」`);
    lines.push(`${lose.name}「うーん… まあ いいけど」`);
    gainExp(win, 12);
    gainExp(lose, 4);
  } else {
    ok = false;
    lines.push('どうするか えらんでね');
  }
  if (ok) {
    refreshStatus(a, b);
    addNews('🕊️', `${a.name} と ${b.name} が なかなおり した`);
    addLog(a, `${b.name} と なかなおり した`);
    addLog(b, `${a.name} と なかなおり した`);
    saveSoon();
  }
  return { ok, lines };
}

// ── 時間が すぎるあいだの 出来事 ────────────────────────────────

function pairWeightedPick(world, r = rnd) {
  const list = residentsOf(world);
  if (list.length < 2) return null;
  const a = pick(list, r);
  // ちかい 部屋の 人ほど えらばれやすい
  const others = list.filter((m) => m.id !== a.id);
  const weights = others.map((o) => nearness(world, a, o));
  let total = 0;
  for (const w of weights) total += w;
  let x = r() * total;
  for (let i = 0; i < others.length; i++) {
    x -= weights[i];
    if (x <= 0) return [a, others[i]];
  }
  return [a, others[others.length - 1]];
}

function bumpTicks(world) {
  for (const m of residentsOf(world)) {
    for (const id of Object.keys(m.rels)) {
      const r = m.rels[id];
      r.ticks = (r.ticks || 0) + 1;
    }
  }
}

/**
 * ticks ぶんの 関係の うごきを まとめて 抽選する。
 * -> [{type, ids, text}]
 */
export function simulateRelations(world = getWorld(), ticks = 1) {
  ensureRels(world);
  const events = [];
  const n = Math.max(0, Math.min(MAX_SIM_TICKS, Math.round(ticks || 0)));
  const list = residentsOf(world);
  if (n <= 0 || list.length < 2) return events;

  for (let t = 0; t < n; t++) {
    bumpTicks(world);
    let made = 0;
    const tries = clamp(Math.round(residentsOf(world).length / 3), 1, 3);
    for (let k = 0; k < tries && made < MAX_EVENTS_PER_TICK; k++) {
      const pair = pairWeightedPick(world);
      if (!pair) break;
      const [a, b] = pair;
      if (a.id === b.id) continue;
      const near = nearness(world, a, b);
      if (!chance(0.3 * near + 0.06)) continue;
      const ev = meetOnce(a, b, world);
      if (ev) {
        events.push(ev);
        made++;
      }
    }
    // けんか中の ふたりは ほうっておくと じわじわ さがる
    for (const m of residentsOf(world)) {
      for (const id of Object.keys(m.rels)) {
        const r = m.rels[id];
        if (r.fight && chance(0.25)) r.aff = clamp(r.aff - 1, -30, 100);
      }
    }
    // こいびと・ふうふの すすみぐあい
    const ev2 = coupleStep(world);
    for (const e of ev2) {
      if (events.length < n * MAX_EVENTS_PER_TICK + 8) events.push(e);
    }
  }
  saveSoon();
  return events;
}

/** ふたりが ばったり であったときの しょり。出来事を かえす（なにも おきなければ null）。 */
function meetOnce(a, b, world) {
  const ra = getRel(a, b);
  const rb = getRel(b, a);
  const c = compat(a, b);
  const before = ra.status;
  const wasMet = ra.met;
  ra.met = rb.met = true;

  if (ra.fight) {
    // けんか中は そっけない
    if (chance(0.18)) {
      ra.fight = rb.fight = false;
      addAff(a, b, 6);
      refreshStatus(a, b);
      const text = `${a.name} と ${b.name} は じぶんたちで なかなおり した`;
      addNews('🕊️', text);
      return { type: 'chat', ids: [a.id, b.id], text };
    }
    return null;
  }

  const delta = Math.round(1 + c * 4 - (chance(0.12) ? 4 : 0));
  addAff(a, b, delta);
  refreshStatus(a, b);

  // しんゆう以上で あいしょうが よければ かたおもいが 生まれる
  for (const [x, y] of [[a, b], [b, a]]) {
    const rx = getRel(x, y);
    if (
      rx.status === 'bestie' &&
      !isPartnered(x) &&
      !isPartnered(y) &&
      !isFamily(x, y) &&
      !x.isChild &&
      !y.isChild &&
      c > 0.55 &&
      chance(0.12 * c)
    ) {
      rx.status = 'crush';
      rx.ticks = 0;
      const text = `${x.name} は ${y.name} の ことが 気になりはじめた`;
      addNews('💗', text);
      addLog(x, text);
      return { type: 'crush', ids: [x.id, y.id], text };
    }
  }

  // かたおもいの 人は じぶんから 告白することも ある
  const crushSide = ra.status === 'crush' ? [a, b] : rb.status === 'crush' ? [b, a] : null;
  if (crushSide && !isPartnered(crushSide[0]) && !isPartnered(crushSide[1]) && chance(0.08)) {
    const res = tryConfess(crushSide[0], crushSide[1], world);
    if (res.accepted) {
      return {
        type: 'married',
        ids: [crushSide[0].id, crushSide[1].id],
        text: `${crushSide[0].name} と ${crushSide[1].name} が こいびとに なった！`,
      };
    }
    return {
      type: 'chat',
      ids: [crushSide[0].id, crushSide[1].id],
      text: `${crushSide[0].name} は ${crushSide[1].name} に 告白したけれど だめだった`,
    };
  }

  // ともだち以上でも まれに けんか
  if (['friend', 'bestie', 'couple', 'married'].includes(ra.status) && chance(0.012)) {
    const res = startFight(a, b, world);
    if (res.ok) return { type: 'fight', ids: [a.id, b.id], text: res.text };
  }

  // ともだちに なった しゅんかん
  if (before !== ra.status && (ra.status === 'friend' || ra.status === 'bestie')) {
    const word = ra.status === 'friend' ? 'ともだち' : 'しんゆう';
    const text = `${a.name} と ${b.name} は ${word}に なった！`;
    addNews('🌟', text);
    addLog(a, text);
    addLog(b, text);
    return { type: 'became_friend', ids: [a.id, b.id], text };
  }

  if (!wasMet || chance(0.25)) {
    const text = `${a.name} と ${b.name} が ろうかで おしゃべりを した`;
    return { type: 'chat', ids: [a.id, b.id], text };
  }
  return null;
}

/** こいびと → けっこん → 子ども の ながれを すこしずつ すすめる。 */
function coupleStep(world) {
  const out = [];
  const list = residentsOf(world);
  const done = new Set();
  for (const a of list) {
    if (!a.partnerId || done.has(a.id)) continue;
    const b = list.find((m) => m.id === a.partnerId);
    if (!b) continue;
    done.add(a.id);
    done.add(b.id);
    const ra = getRel(a, b);
    if (ra.status === 'couple') {
      if (canMarry(a, b) && chance(0.08)) {
        const res = marry(a, b, world);
        if (res.ok) {
          out.push({ type: 'married', ids: [a.id, b.id], text: `${a.name} と ${b.name} が けっこんした！` });
        }
      }
    } else if (ra.status === 'married') {
      const child = tryBearChild(a, b, world);
      if (child) {
        out.push({
          type: 'child',
          ids: [a.id, b.id, child.id],
          text: `${a.name} と ${b.name} に ${child.name} が 生まれた！`,
        });
      }
    }
  }
  return out;
}

export { COUPLE_TICKS_FOR_MARRY, MARRIED_TICKS_FOR_CHILD };
