// なやみ・吹き出し。住人の あたまの うえに でる ふきだしを つくって、
// プレイヤーが タップして かいけつする ところ。
// セリフは 性格・関係・もちものを 見て かえる。

import { chance, clamp, pick, randInt, rnd } from './rng.js';
import {
  addLog,
  addMoney,
  addNews,
  gainExp,
  getRel,
  getWorld,
  hungerLabel,
  moodOf,
  personalityName,
  saveSoon,
  speechStyle,
} from './state.js';
import { relationList } from './relations.js';
import { SONGS, TREASURES, WORDS, byId } from './items.js';

export const BUBBLE_KINDS = ['nayami', 'request', 'chat', 'love', 'gift', 'thanks'];

const BUBBLE_ICON = {
  nayami: '💭',
  request: '❗',
  chat: '💬',
  love: '💗',
  gift: '🎁',
  thanks: '✨',
};

/** できのよさ ごとの まんぞくどの ふえかた。はずれでも 0 には しない。 */
const EXP_BY_GRADE = { best: 26, ok: 15, miss: 7 };

// ── ちいさな道具 ────────────────────────────────

function safeList(v) {
  return Array.isArray(v) ? v : [];
}

function itemLabel(it) {
  if (!it) return '';
  if (typeof it === 'string') return it;
  return it.text || it.name || it.label || it.title || it.id || '';
}

function randomTreasureId(r = rnd) {
  const list = safeList(TREASURES);
  if (!list.length) return null;
  const t = pick(list, r);
  return (t && (t.id || t)) || null;
}

/** くちぐせを ひとつ。{id, text} を かえす。 */
function randomWord(r = rnd) {
  const list = safeList(WORDS);
  if (!list.length) return { id: null, text: 'えへへ' };
  const w = pick(list, r);
  return { id: w.id || null, text: itemLabel(w) || 'えへへ' };
}

/** うたを ひとつ。{id, text} を かえす。 */
function randomSong(r = rnd) {
  const list = safeList(SONGS);
  if (!list.length) return { id: null, text: 'しまの うた' };
  const s = pick(list, r);
  return { id: s.id || null, text: itemLabel(s) || 'しまの うた' };
}

/** 好感度の たかい ともだちを ひとり。 */
function friendOf(m, world, minAff = 20) {
  const list = relationList(m, world).filter((x) => x.aff >= minAff);
  return list.length ? list[0].other : null;
}

function randomOther(m, world) {
  const others = (world.residents || []).filter((x) => x.id !== m.id);
  return others.length ? pick(others) : null;
}

function fightTargetOf(m, world) {
  const hit = relationList(m, world).find((x) => x.fight);
  return hit ? hit.other : null;
}

function crushTargetOf(m, world) {
  const hit = relationList(m, world).find((x) => x.status === 'crush');
  return hit ? hit.other : null;
}

/** まだ なかよく なっていない 人。 */
function strangerOf(m, world) {
  const list = relationList(m, world).filter((x) => x.aff < 20 && !x.fight);
  return list.length ? list[list.length - 1].other : null;
}

function opt(key, label, grade, lines, extra) {
  return Object.assign({ key, label, grade, lines: lines || [] }, extra || {});
}

// ── なやみの ていぎ ────────────────────────────────
// need: 'food' | 'clothes' | 'interior' | 'tool' | 'friend' | null
// target: ctx.target に 入れる 住人の えらびかた

export const NAYAMI = [
  {
    id: 'hungry',
    kind: 'nayami',
    title: 'なやみ',
    need: 'food',
    when: (m) => m.hunger < 55,
    lines: (m) => ['おなかが すいたよ…', `いまは ${hungerLabel(m.hunger)} って かんじ`],
    options: [
      opt('give', 'ごはんを あげる', 'best', ['わあ、いただきます！', 'おいしい！ げんきが でたよ'], { fillHunger: 38 }),
      opt('snack', 'おかしで ごまかす', 'ok', ['うーん、まあ これでも いいか', 'ちょっとは まんぷくに なった'], { fillHunger: 14 }),
      opt('later', 'また あとで', 'miss', ['そっかあ… がまん するね'], { fillHunger: 4 }),
    ],
  },
  {
    id: 'clothes',
    kind: 'request',
    title: 'おねがい',
    need: 'clothes',
    when: (m) => (m.clothes && (m.clothes.owned || []).length < 6) || true,
    lines: (m) => ['あたらしい ふくが ほしいなあ', 'いまの ふく、ちょっと あきちゃった'],
    options: [
      opt('give', 'ふくを あげる', 'best', ['うれしい！ さっそく きてみるね', 'どう？ にあってる？']),
      opt('praise', 'いまの ふくを ほめる', 'ok', ['えへへ、そう？ ちょっと うれしいかも']),
      opt('later', 'こんど かってくるね', 'miss', ['うん、まってるね']),
    ],
  },
  {
    id: 'room',
    kind: 'request',
    title: 'おねがい',
    need: 'interior',
    lines: () => ['へやの ようすを かえたいんだ', 'まいにち おなじだと、あきちゃって'],
    options: [
      opt('deco', 'かぐを おいてあげる', 'best', ['すごい！ へやが がらっと かわった', 'ここで ずっと すごしたいな']),
      opt('clean', 'そうじを てつだう', 'ok', ['ありがとう、すっきり したよ']),
      opt('move', 'カーテンを あけてみる', 'ok', ['ひかりが 入って きもちいいね']),
      opt('later', 'いまは そのままで', 'miss', ['うーん、わかった']),
    ],
  },
  {
    id: 'fight',
    kind: 'nayami',
    title: 'なやみ',
    need: null,
    target: fightTargetOf,
    when: (m, world) => !!fightTargetOf(m, world),
    lines: (m, ctx) => [`${ctx.tname} と けんかを しちゃった…`, 'どんな かおで あえば いいのか わからないよ'],
    options: [
      opt('mediate', 'ふたりを なかなおり させる', 'best', ['ありがとう… ちゃんと あやまれたよ', 'また いっしょに あそべる！'], { mediate: 'both' }),
      opt('listen', 'はなしを きいてあげる', 'ok', ['きいてくれて ありがとう', 'すこし きもちが かるく なった']),
      opt('wait', 'じかんぐすりだよ と いう', 'miss', ['…そうだね、すこし まってみる']),
    ],
  },
  {
    id: 'love',
    kind: 'love',
    title: 'こいの なやみ',
    need: null,
    target: crushTargetOf,
    when: (m, world) => !!crushTargetOf(m, world) && !m.partnerId,
    lines: (m, ctx) => [`${ctx.tname} の ことが 気になって しかたないんだ`, 'どうしたら いいのかな…'],
    options: [
      opt('push', '「つたえて みなよ」と せなかを おす', 'best', ['うん、ゆうきを だして みる！', 'ありがとう、しんぱいして くれて'], { crushBoost: 8 }),
      opt('gift', 'プレゼントを すすめる', 'ok', ['なるほど、なにか えらんで みようかな'], { crushBoost: 5 }),
      opt('wait', '「まだ はやいかも」と いう', 'miss', ['…そうかな。もう すこし かんがえる']),
    ],
  },
  {
    id: 'bored',
    kind: 'nayami',
    title: 'なやみ',
    need: null,
    lines: () => ['ひまで ひまで しかたないよ', 'なにか おもしろいこと ないかなあ'],
    options: [
      opt('play', 'いっしょに あそぶ', 'best', ['やった！ たのしい！', 'また あそんでね']),
      opt('friend', 'ともだちを よぶ', 'ok', ['わあ、にぎやかに なった']),
      opt('nap', 'おひるねを すすめる', 'miss', ['ふあ… まあ それも いいか']),
    ],
  },
  {
    id: 'sing',
    kind: 'request',
    title: 'おねがい',
    need: null,
    lines: () => ['うたを うたいたい きぶん！', 'なにか ひとつ おしえてよ'],
    options: [
      opt('teach', 'うたを おしえる', 'best', ['ふんふん… おぼえた！', 'いい うただね、たからものに するよ'], { learnSong: true }),
      opt('hum', 'いっしょに ハミングする', 'ok', ['ふふ、ハモれたね']),
      opt('listen', 'きいてあげる', 'ok', ['きいてくれて うれしい！']),
      opt('later', 'また こんど', 'miss', ['はーい、まってるね']),
    ],
  },
  {
    id: 'travel',
    kind: 'nayami',
    title: 'なやみ',
    need: null,
    lines: () => ['どこか とおくへ 旅行に 行きたいなあ', 'しまの そとって どんな ところだろう'],
    options: [
      opt('send', '旅行に おくりだす', 'best', ['いってきます！', 'おみやげ かってくるね！'], { money: -30, treasure: true }),
      opt('park', 'こうえんに つれていく', 'ok', ['ちかくでも たのしいね']),
      opt('photo', '写真を 見せてあげる', 'ok', ['うわあ、いつか 行ってみたい']),
      opt('later', 'おかねが たまったらね', 'miss', ['うん、こつこつ ためる！']),
    ],
  },
  {
    id: 'money',
    kind: 'request',
    title: 'おねがい',
    need: null,
    lines: () => ['おこづかいが ほしいんだ…', 'ほしい ものが あって'],
    options: [
      opt('give', 'おこづかいを あげる', 'best', ['ありがとう！ たいせつに つかうね'], { money: -40, wallet: 40 }),
      opt('job', 'おてつだいを たのむ', 'ok', ['じぶんで かせぐのも たのしいね'], { wallet: 15 }),
      opt('no', 'がまん しようと いう', 'miss', ['うー、わかった。がまんする']),
    ],
  },
  {
    id: 'sleepless',
    kind: 'nayami',
    title: 'なやみ',
    need: null,
    lines: () => ['ゆうべ ぜんぜん ねむれなかった…', 'めが さえちゃって'],
    options: [
      opt('lullaby', 'こもりうたを うたう', 'best', ['すう… すう…', 'ぐっすり ねむれたよ、ありがとう']),
      opt('milk', 'あたたかい のみものを あげる', 'ok', ['ほっと した。ねむく なってきた']),
      opt('talk', 'よふかしに つきあう', 'miss', ['たのしかったけど、ねむい…']),
    ],
  },
  {
    id: 'word',
    kind: 'request',
    title: 'おねがい',
    need: null,
    lines: () => ['じぶんの くちぐせが ほしいな', 'なにか ことばを おしえてよ'],
    options: [
      opt('teach', 'ことばを おしえる', 'best', ['おぼえた！ さっそく つかってみるね'], { learnWord: true }),
      opt('copy', 'ともだちの まねを すすめる', 'ok', ['えへへ、にてるかな？']),
      opt('later', 'また こんどね', 'miss', ['はーい']),
    ],
  },
  {
    id: 'befriend',
    kind: 'request',
    title: 'おねがい',
    need: 'friend',
    target: strangerOf,
    when: (m, world) => !!strangerOf(m, world),
    lines: (m, ctx) => [`${ctx.tname} と もっと なかよく なりたいな`, 'でも きっかけが ないんだ'],
    options: [
      opt('introduce', 'ふたりを ひきあわせる', 'best', ['ありがとう！ はなせて よかった', 'こんど いっしょに あそぼうって いわれた'], { introduce: true }),
      opt('gift', 'プレゼントを すすめる', 'ok', ['なるほど、なにか えらんで みる'], { affBoost: 6 }),
      opt('watch', 'そっと 見まもる', 'miss', ['うん、じぶんで がんばってみる'], { affBoost: 2 }),
    ],
  },
  {
    id: 'lost',
    kind: 'nayami',
    title: 'なやみ',
    need: null,
    lines: () => ['たいせつな ものを おとしちゃった…', 'どこで なくしたんだろう'],
    options: [
      opt('search', 'いっしょに さがす', 'best', ['あった！ ここに あったよ！', 'いっしょに さがしてくれて ありがとう'], { treasure: true }),
      opt('ask', 'みんなに きいてみる', 'ok', ['だれかが とどけて くれるかも']),
      opt('new', 'あたらしいのを かってあげる', 'ok', ['ありがとう。でも あれが よかったな'], { money: -20 }),
      opt('sorry', 'ざんねんだったね と いう', 'miss', ['うん… しかたないね']),
    ],
  },
  {
    id: 'cold',
    kind: 'nayami',
    title: 'なやみ',
    need: null,
    lines: () => ['こほん、こほん…', 'かぜを ひいちゃったみたい'],
    options: [
      opt('care', 'かんびょうを する', 'best', ['やさしく してくれて うれしい', 'もう すっかり げんきに なったよ'], { fillHunger: 10 }),
      opt('warm', 'あたたかくして ねかせる', 'ok', ['ぬくぬく… ありがとう']),
      opt('food', 'あたたかい スープを あげる', 'ok', ['からだの なかから ぽかぽかする'], { fillHunger: 18 }),
      opt('leave', 'そっと しておく', 'miss', ['ひとりだと ちょっと さびしいな…']),
    ],
  },
  {
    id: 'tool',
    kind: 'request',
    title: 'おねがい',
    need: 'tool',
    lines: () => ['なにか どうぐを つかって みたいんだ', 'めずらしい ものが すきでね'],
    options: [
      opt('give', 'どうぐを わたす', 'best', ['これ すごい！ ずっと さわってられる'], { addBag: true }),
      opt('show', 'つかいかたを 見せる', 'ok', ['なるほど、そうやって つかうのか']),
      opt('later', 'また こんど', 'miss', ['はーい、たのしみに してる']),
    ],
  },
  {
    id: 'callname',
    kind: 'chat',
    title: 'ひとこと',
    need: null,
    lines: (m) => ['ねえねえ、なまえを よんでよ', `${m.name} って、よばれるの すきなんだ`],
    options: [
      opt('call', 'なまえを よぶ', 'best', ['はーい！ うれしい！', 'もういっかい よんで！']),
      opt('nick', 'あだなで よぶ', 'ok', ['えへへ、それも わるくないね']),
      opt('ignore', 'てを ふるだけに する', 'miss', ['むう、こえも きかせてよ']),
    ],
  },
  {
    id: 'photo',
    kind: 'request',
    title: 'おねがい',
    need: null,
    target: friendOf,
    lines: (m, ctx) => ['しゃしんを とりたいな', ctx.target ? `${ctx.tname} と いっしょに うつりたい` : 'かっこよく とってね'],
    options: [
      opt('together', 'ふたりで とる', 'best', ['はいチーズ！', 'いい しゃしんが とれたね'], { affBoost: 8 }),
      opt('solo', 'ひとりで とる', 'ok', ['じょうずに とれてる？']),
      opt('group', 'みんなで とる', 'best', ['わいわい！ たのしい しゃしんに なった']),
      opt('later', 'また こんど', 'miss', ['うん、まってる']),
    ],
  },
  {
    id: 'nightmare',
    kind: 'nayami',
    title: 'なやみ',
    need: null,
    lines: () => ['こわい ゆめを みちゃった…', 'まだ どきどき してる'],
    options: [
      opt('hug', 'そばに いてあげる', 'best', ['あったかい… もう へいきだよ']),
      opt('talk', 'ゆめの はなしを きく', 'ok', ['はなしたら すこし わらえてきた']),
      opt('light', 'あかりを つけておく', 'ok', ['あかるいと あんしん するね']),
      opt('laugh', '「ただの ゆめだよ」と わらう', 'miss', ['うん… わかってるけど さ']),
    ],
  },
  {
    id: 'moving',
    kind: 'nayami',
    title: 'なやみ',
    need: null,
    target: friendOf,
    lines: (m, ctx) => ['この しまを 出ようかなって おもってたんだ', ctx.target ? `${ctx.tname} には まだ いえてない` : 'だれにも いえてないけど'],
    options: [
      opt('stay', '「いてほしい」と つたえる', 'best', ['そんなふうに いってくれるんだ', 'やっぱり ここに いるね！'], { exp: 10 }),
      opt('friend', 'ともだちに あわせる', 'best', ['みんなが いるから、ここが すきなんだ']),
      opt('think', 'いっしょに かんがえる', 'ok', ['ちゃんと きいてくれて ありがとう']),
      opt('ok', '「すきに していいよ」と いう', 'miss', ['…うん、もうすこし かんがえる']),
    ],
  },
  {
    id: 'birthday',
    kind: 'gift',
    title: 'おいわい',
    need: null,
    lines: (m) => ['じつは きょう、たんじょうびなんだ', 'だれかに おいわい してほしいな'],
    options: [
      opt('party', 'パーティーを ひらく', 'best', ['わあ、みんな ありがとう！', 'きょうは さいこうの ひだ！'], { money: -20, treasure: true }),
      opt('gift', 'プレゼントを あげる', 'best', ['あけても いい？ …うれしい！'], { treasure: true }),
      opt('song', 'おいわいの うたを うたう', 'ok', ['てれちゃうな、ありがとう']),
      opt('word', '「おめでとう」と いう', 'miss', ['ふふ、それだけでも うれしいよ']),
    ],
  },
  {
    id: 'thanks',
    kind: 'thanks',
    title: 'おれい',
    need: null,
    target: friendOf,
    lines: (m, ctx) => ['このまえは ありがとう！', ctx.target ? `${ctx.tname} にも つたえたいな` : 'ずっと おれいが いいたかったんだ'],
    options: [
      opt('accept', '「どういたしまして」と いう', 'best', ['えへへ、また たよっても いい？']),
      opt('together', 'いっしょに おれいを いいに行く', 'best', ['ふたりで いえて よかった'], { affBoost: 8 }),
      opt('shy', 'てれて にげる', 'miss', ['あっ、まってよー']),
    ],
  },
];

export function nayamiCount() {
  return NAYAMI.length;
}

function defById(id) {
  return NAYAMI.find((d) => d.id === id) || null;
}

function ctxFor(m, world, def, targetId) {
  let target = null;
  if (targetId) target = (world.residents || []).find((x) => x.id === targetId) || null;
  if (!target && def && def.target) target = def.target(m, world) || null;
  if (!target && def && def.target) target = randomOther(m, world);
  return { target, tname: target ? target.name : 'だれか' };
}

// ── ふきだしを たてる ────────────────────────────────

export function bubbleIcon(bubble) {
  if (!bubble) return '';
  return BUBBLE_ICON[bubble.kind] || '💭';
}

/** じょうけんを みたす 住人に ふきだしを たてる。 */
export function spawnBubbles(world = getWorld(), ticks = 1) {
  const n = clamp(Math.round(ticks || 0), 0, 400);
  if (n <= 0) return [];
  const made = [];
  for (const m of world.residents || []) {
    if (m.bubble) continue;
    // 1 tick あたり 3% ほど。ためた tick ぶんは ひかえめに かさねる。
    const p = clamp(1 - Math.pow(1 - 0.03, n), 0, 0.85);
    if (!chance(p)) continue;
    const b = makeBubble(m, world);
    if (b) {
      m.bubble = b;
      made.push(m);
    }
  }
  if (made.length) saveSoon();
  return made;
}

/** その住人に あう なやみを ひとつ えらんで ふきだしを つくる。 */
export function makeBubble(m, world = getWorld()) {
  const ok = NAYAMI.filter((d) => {
    if (d.when) {
      try {
        if (!d.when(m, world)) return false;
      } catch (e) {
        return false;
      }
    }
    if (d.target && !d.target(m, world) && (world.residents || []).length < 2) return false;
    return true;
  });
  const pool = ok.length ? ok : NAYAMI;
  const d = pick(pool);
  if (!d) return null;
  let target = null;
  if (d.target) {
    try {
      target = d.target(m, world) || null;
    } catch (e) {
      target = null;
    }
  }
  return {
    kind: d.kind,
    id: d.id,
    at: Date.now(),
    targetId: target ? target.id : null,
  };
}

// ── ダイアログ ────────────────────────────────

/** ふきだしを ひらく。game.js は この かたちだけを 見る。 */
export function openBubble(m, world = getWorld()) {
  const b = m.bubble;
  const def = b ? defById(b.id) : null;
  if (!def) {
    return {
      title: 'ひとこと',
      speaker: m,
      lines: [chatLine(m, world)],
      options: [{ key: 'later', label: 'とじる' }],
      needs: null,
    };
  }
  const ctx = ctxFor(m, world, def, b.targetId);
  let lines = [];
  try {
    lines = def.lines(m, ctx) || [];
  } catch (e) {
    lines = ['…'];
  }
  lines = lines.filter(Boolean).map((s) => decorate(m, s));
  return {
    title: def.title || 'なやみ',
    speaker: m,
    lines,
    options: def.options.map((o) => ({ key: o.key, label: o.label })),
    needs: def.need || null,
    target: ctx.target || null,
    nayamiId: def.id,
  };
}

/** えらんだ こたえを しょりする。 */
export function resolveBubble(m, world = getWorld(), key) {
  const b = m.bubble;
  const def = b ? defById(b.id) : null;
  if (!def) {
    m.bubble = null;
    return {
      lines: ['またね！'], exp: 0, money: 0, treasure: null, ok: true,
      reaction: '🙂', clearBubble: true, followUp: null,
    };
  }
  const ctx = ctxFor(m, world, def, b.targetId);
  const o = def.options.find((x) => x.key === key) || def.options[def.options.length - 1];
  const grade = o.grade || 'ok';
  let exp = (EXP_BY_GRADE[grade] || 10) + (o.exp || 0);
  exp += randInt(-2, 3);
  exp = Math.max(3, exp);

  let money = 0;
  let treasure = null;
  const lines = (o.lines || []).map((s) => decorate(m, s));

  // おなかを みたす
  if (o.fillHunger) m.hunger = clamp(m.hunger + o.fillHunger, 0, 100);
  // おかねの やりとり
  if (o.money) {
    if (o.money < 0) {
      if (world.money >= -o.money) {
        addMoney(o.money);
        money = o.money;
      } else {
        lines.push('（でも おかねが たりなかった…）');
        exp = Math.max(3, Math.round(exp * 0.5));
      }
    } else {
      addMoney(o.money);
      money = o.money;
    }
  }
  if (o.wallet) m.wallet = (m.wallet || 0) + o.wallet;
  // うたと ことばを おぼえる
  if (o.learnSong) {
    const s = randomSong();
    m.songs = m.songs || [];
    const key = s.id || s.text;
    if (!m.songs.includes(key)) m.songs.push(key);
    lines.push(`「${s.text}」を おぼえた！`);
  }
  if (o.learnWord) {
    const w = randomWord();
    m.words = m.words || [];
    const key = w.id || w.text;
    if (!m.words.includes(key)) m.words.push(key);
    m.catch = w.text;
    lines.push(`くちぐせが 「${w.text}」に なった！`);
  }
  // たからもの
  if (o.treasure) {
    const t = randomTreasureId();
    if (t) {
      m.treasures = m.treasures || [];
      m.treasures.push(t);
      treasure = t;
      const it = safeCall(() => byId(t));
      lines.push(`${itemLabel(it) || 'たからもの'} を てに いれた！`);
    }
  }
  if (o.addBag) {
    const t = randomTreasureId();
    if (t) {
      m.bag = m.bag || [];
      m.bag.push(t);
    }
  }
  // 関係の うごき
  if (ctx.target) {
    if (o.mediate) {
      // ここでは なかなおりを 直接 あらわす（relations.js の mediate と おなじ ききめ）
      const ra = getRel(m, ctx.target);
      const rb = getRel(ctx.target, m);
      ra.fight = rb.fight = false;
      ra.aff = clamp(ra.aff + 12, -30, 100);
      rb.aff = clamp(rb.aff + 12, -30, 100);
      addNews('🕊️', `${m.name} と ${ctx.target.name} が なかなおり した`);
    }
    if (o.introduce || o.affBoost) {
      const d = o.introduce ? 10 : o.affBoost;
      const ra = getRel(m, ctx.target);
      const rb = getRel(ctx.target, m);
      ra.aff = clamp(ra.aff + d, -30, 100);
      rb.aff = clamp(rb.aff + d, -30, 100);
      ra.met = rb.met = true;
    }
    if (o.crushBoost) {
      const ra = getRel(m, ctx.target);
      ra.aff = clamp(ra.aff + o.crushBoost, -30, 100);
    }
  }

  gainExp(m, exp);
  world.stats.nayami = (world.stats.nayami || 0) + 1;
  m.bubble = null;
  m.lastTalkAt = Date.now();
  addLog(m, `${def.title}を かいけつ した（${o.label}）`);
  saveSoon();

  const reaction = grade === 'best' ? '😄' : grade === 'ok' ? '🙂' : '😅';
  return {
    lines: lines.length ? lines : ['ありがとう！'],
    exp,
    money,
    treasure,
    ok: true,
    reaction,
    clearBubble: true,
    followUp: null,
    grade,
  };
}

function safeCall(fn) {
  try {
    return fn();
  } catch (e) {
    return null;
  }
}

// ── セリフ ────────────────────────────────
//
// だいじな きまり:
//   BASE_LINES / STYLE_LINES / とくべつな セリフは すべて
//   「語尾（よ・ね・な など）の ついていない すなおな かたち」で もつ。
//   語尾は withTail() が 性格に あわせて **かならず 1 つだけ** つける。
//   くちぐせを つける ときは 語尾を つけない（かさならないように）。

/** 性格べつの 語尾。すなおな かたちの あとに そのまま つづけられる ものだけ。 */
const TAIL = {
  genki: ['！', 'よ！', 'ね！', 'なあ！', 'ぞ！'],
  shy: ['…', 'かな…', 'かも…', 'よ…', 'ね…'],
  cool: ['。', 'な。', 'とおもう。', 'けどね。', 'さ。'],
  kind: ['ね', 'よ', 'ねえ', 'ね、ふふ', 'よ、ふふ'],
  normal: ['', 'よ', 'ね', 'なあ', 'かな'],
};

/**
 * だれにでも あう ひとりごと（すなおな かたち）。
 * ※ 文末は い形容詞か 動詞の いいきりに そろえること。
 *   「〜だ」で おわると 「〜だかな」の ように くずれるので つかわない。
 */
const BASE_LINES = [
  'きょうは てんきが いい',
  'そとの かぜが きもちいい',
  'なにか たのしいことを さがしてる',
  'さっき おおきな とりを みた',
  'ごはんの ことばかり かんがえちゃう',
  'この しまは けっこう ひろい',
  'ゆうやけが きれいだった',
  'あしたは なにを しようか まよってる',
  'ちょっと ねむい',
  'いま はなうたを うたってた',
  'かべの もようを かぞえてた',
  'にわの はなが さいてた',
  'あたらしい ふくが ほしくなってきた',
  'うみの おとが きこえる',
  'てを ふってもらえると うれしい',
  'きのうの ゆめは ふしぎだった',
  'すこし せが のびた',
  'あついのより すずしいほうが いい',
  'ほしぞらを みるのが きにいってる',
  'かたづけは あとで やる',
  'ちいさな むしが あるいてた',
  'おさんぽに でかけたい',
  'なんだか わくわく してきた',
  'きょうは のんびり したい',
  'だれかと おしゃべり したい',
  'この しまに きて よかった',
  'あまい ものが たべたい',
  'すっぱい ものも わるくない',
  'おふろが きもちよかった',
  'かみのけが はねてないか きになる',
  'あしおとで だれか わかるように なってきた',
  'ひるねの ばしょを みつけた',
  'ちょっと うたって みたい',
  'あめの おとも すきになってきた',
  'にじが でてたのを みた',
  'ふしぎと げんきが わいてきた',
  'きょうも いちにち がんばりたい',
  'ガラスの むこうを ぼんやり ながめてた',
  'ちいさな しあわせを あつめてる',
  'こんど みんなで あつまりたい',
  'あさ おきたら からだが かるかった',
  'すなはまで かいがらを ひろった',
  'とおくの ふねを めで おいかけてた',
  'あたらしい みちを みつけて うれしかった',
  'きょうは よく わらった',
  'おなじ ゆめを ふたばん つづけて みた',
  'すきな いろが かわってきた',
  'てのひらの しわを かぞえてた',
  'かぜの においが かわった',
  'ひるすぎは いつも ぼーっと しちゃう',
  'あしたの ごはんが まちどおしい',
  'あたらしい ことを おぼえたい',
  'みんなの こえが きこえると あんしんする',
  'ちょっとだけ さみしい',
  'けさは はやおきに せいこうした',
  'よるの しずけさが きにいってる',
];

/** 性格ごとの とくべつな ひとりごと（すなおな かたち）。 */
const STYLE_LINES = {
  genki: [
    'げんきが ありあまってる',
    'きょうは はしりまわりたい',
    'だれかと しょうぶ したい',
    'おおごえで うたいたい',
    'たのしいことを いっぱい したい',
    'じっと していられない',
  ],
  shy: [
    'ひとりの じかんも すきになってきた',
    'ちょっと きんちょう しちゃう',
    'こえが ちいさいって いわれる',
    'そばに いてくれると あんしんする',
    'うまく はなせなくて こまってる',
    'ほんとうは もっと はなしたい',
  ],
  cool: [
    'べつに たいした ことじゃない',
    'しずかなのが いちばん いい',
    'じぶんの ペースで やりたい',
    'そういうのは にがてだ',
    'まあ わるくない',
    'ひとりでも こまらない',
  ],
  kind: [
    'みんなが げんきだと うれしい',
    'こまってる人が いたら てつだいたい',
    'あなたが わらうと うれしい',
    'むりは しないでほしい',
    'いっしょに いられて しあわせだ',
    'みんなの ことが だいすきだ',
  ],
  normal: [
    'とくに かわりは ない',
    'そこそこ たのしく やってる',
    'たまには こういう ひも いい',
    'なんとなく すごしてる',
    'まあ ふつうの いちにちだった',
    'いつもどおり すごしてる',
  ],
};

const END_PUNCT = /[。！？…、]+$/;

/**
 * くちぐせを そえる。もとの 文末の 句読点は いったん とって、
 * 「！」だけ さいごに もどす。「〜だ…かな！ぴょん」の ような くずれを ふせぐ。
 */
function decorate(m, text) {
  if (!text) return '';
  const s = String(text);
  if (!m.catch || s.includes(m.catch) || !chance(0.22)) return s;
  return attachCatch(m, s);
}

function attachCatch(m, text) {
  const s = String(text);
  const hit = s.match(END_PUNCT);
  const punct = hit ? hit[0] : '';
  const body = punct ? s.slice(0, s.length - punct.length) : s;
  const keep = punct.includes('！') ? '！' : punct.includes('？') ? '？' : '';
  return body + ' ' + m.catch + keep;
}

/** すなおな かたちに 性格の 語尾を 1 つだけ つける。 */
function withTail(m, bare) {
  const st = speechStyle(m.personality);
  const tails = TAIL[st] || TAIL.normal;
  const s = String(bare).replace(END_PUNCT, '');
  return s + pick(tails);
}

/** 語尾か くちぐせの どちらか 一方だけを つけて 1 行に しあげる。 */
function finishLine(m, bare) {
  const s = String(bare).replace(END_PUNCT, '');
  if (m.catch && chance(0.22)) return s + ' ' + m.catch;
  return withTail(m, s);
}

/** 独りごと 1 行。性格・関係・もちものを 見て かえる。 */
export function chatLine(m, world = getWorld()) {
  const st = speechStyle(m.personality);
  const pool = BASE_LINES.concat(STYLE_LINES[st] || STYLE_LINES.normal);

  // もちもの・関係から くる とくべつな セリフ（これも すなおな かたち）
  const extra = [];
  if (m.hunger < 30) extra.push('おなかが ぺこぺこに なってきた');
  if (m.hunger > 85) extra.push('おなかが いっぱいで しあわせに なった');
  if ((m.treasures || []).length) extra.push('たからものを ながめてた');
  if ((m.songs || []).length) {
    const sn = itemLabel(safeCall(() => byId(m.songs[0]))) || m.songs[0];
    extra.push(`「${sn}」を よく くちずさんでる`);
  }
  if ((m.words || []).length) extra.push('あたらしい ことばを おぼえた');
  if (m.level >= 5) extra.push(`まんぞくどが レベル ${m.level} に なった`);
  if (m.partnerId) {
    const p = (world.residents || []).find((x) => x.id === m.partnerId);
    if (p) {
      extra.push(`${p.name} と いっしょに いると あんしんする`);
      extra.push(`きょうは ${p.name} と なにを しようか かんがえてる`);
    }
  }
  const rl = relationList(m, world);
  const top = rl[0];
  if (top && top.aff >= 35) extra.push(`${top.other.name} は たよりに なる`);
  const fighting = rl.find((x) => x.fight);
  if (fighting) extra.push(`${fighting.other.name} と けんかを してしまった`);
  const crush = rl.find((x) => x.status === 'crush');
  if (crush) extra.push(`${crush.other.name} の ことを かんがえちゃう`);
  if (m.isChild) extra.push('おおきく なったら なにに なりたいか かんがえてる');
  if (moodOf(m) === 2) extra.push('いまは ちょっと むしゃくしゃ している');
  extra.push(`${personalityName(m.personality)} って よく いわれる`);

  const all = pool.concat(extra, extra); // とくべつな セリフは でやすく
  return finishLine(m, pick(all));
}

/** へやに 入ったときの ひとこと。あいさつは はじめから かたちが できている。 */
const GREET = {
  genki: [
    'やっほー！ きてくれたんだ！', 'まってたよ！ あそぼう！', 'いらっしゃい！ げんき？',
    'うおー！ きた！ きた！', 'ちょうど あいたかったんだ！', 'さあ、なにして あそぶ？',
  ],
  shy: [
    'あ… こんにちは', 'き、きてくれたんだ…', 'えっと、いらっしゃい…',
    'びっくり した… でも うれしい', 'あの… あがって いって', 'ちょっとだけ、いてくれる？',
  ],
  cool: [
    'よう。', 'なんだ、きたのか。', 'ま、ゆっくり していけよ。',
    'しずかに してくれるなら かんげいする。', 'ふん、いい タイミングだ。', 'なにか ようか？',
  ],
  kind: [
    'いらっしゃい、よく きてくれたね', 'あいたかったよ', 'おちゃでも どうぞ、ふふ',
    'つかれてない？ すわってね', 'きょうも ありがとうね', 'あなたの かおを 見ると ほっとする',
  ],
  normal: [
    'やあ、こんにちは', 'きてくれて ありがとう', 'いらっしゃい',
    'おっ、ひさしぶり だね', 'ちょうど ひまして たんだ', 'げんきに してた？',
  ],
};

export function greetLine(m, world = getWorld()) {
  const st = speechStyle(m.personality);
  let s = pick(GREET[st] || GREET.normal);
  if (m.hunger < 25 && chance(0.6)) s = 'おなか すいたよ… なにか ちょうだい';
  else if (m.bubble && chance(0.5)) s = 'ねえ、きいて ほしいことが あるんだ';
  else if (m.pendingGift && chance(0.5)) s = 'レベルが あがったよ！ プレゼント ちょうだい！';
  return decorate(m, s);
}
