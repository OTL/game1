/* challenge.js — お題チャレンジ（お題・タイマー・採点）とギャラリー保存。
   採点は「絵のうまさ」ではなく、描き込み・色づかい・時間の使い方といった
   数えられるものだけを見て、遊びの評価をつける。                        */
const Challenge = (function () {

  const THEMES = [
    'ねこ', 'いぬ', 'ドラゴン', 'ロボット', '宇宙飛行士', 'まほうつかい',
    '海の中の街', '空飛ぶ島', '夜の観覧車', 'おばけ屋敷', '未来の乗り物',
    'たべものの山', 'いちごのケーキ', 'ラーメン', '花畑', '深海魚',
    '雨の日の傘', '真夏の入道雲', '雪だるまの家族', '流れ星に願いごと',
    '恐竜のさんぽ', '忍者の修行', '海賊船', 'お城とドラゴン', '森の妖精',
    '自分の顔（想像で）', '好きなキャラクターの後ろ姿', 'ふしぎな植物',
    'ペンギンの行列', 'カメラを持ったクマ', 'ギターを弾くタコ',
    '朝ごはんのテーブル', '雨上がりの虹', '線路のある風景', '窓辺のねこ',
    'まっしろな迷路', '巨大キノコの森', '月面のティータイム',
    '走るスニーカー', 'こわくないオバケ', 'たのしそうな傘の行進',
    'ゆめの中の階段', '空を泳ぐクジラ', 'ロボットとねこの友情'
  ];

  const GALLERY_KEY = 'game1.paint.gallery';
  const GALLERY_MAX = 12;

  let state = null;      // { theme, limit, startedAt, strokes, colors:Set, timer }
  let onTick = null, onEnd = null;

  function randomTheme(exclude) {
    let t = THEMES[(Math.random() * THEMES.length) | 0];
    let guard = 0;
    while (t === exclude && guard++ < 8) t = THEMES[(Math.random() * THEMES.length) | 0];
    return t;
  }

  function start(opts) {
    stop();
    onTick = opts.onTick;
    onEnd = opts.onEnd;
    state = {
      theme: opts.theme,
      limit: opts.limit | 0,
      startedAt: Date.now(),
      strokes: 0,
      colors: new Set(),
      timer: setInterval(tick, 250)
    };
    tick();
    return state;
  }

  function tick() {
    if (!state) return;
    const elapsed = (Date.now() - state.startedAt) / 1000;
    const left = state.limit ? Math.max(0, state.limit - elapsed) : elapsed;
    onTick && onTick(left, state.limit > 0);
    if (state.limit && elapsed >= state.limit) finish(false);
  }

  function noteStroke(color) {
    if (!state) return;
    state.strokes++;
    if (color) state.colors.add(color);
  }

  function isActive() { return !!state; }
  function current() { return state; }

  function stop() {
    if (state && state.timer) clearInterval(state.timer);
    state = null;
  }

  function finish(early) {
    if (!state) return;
    const s = state;
    const elapsed = (Date.now() - s.startedAt) / 1000;
    stop();
    const result = score({
      theme: s.theme,
      limit: s.limit,
      elapsed,
      strokes: s.strokes,
      colors: s.colors.size,
      coverage: Engine.coverage(),
      layers: Engine.getLayers().length,
      early: !!early
    });
    onEnd && onEnd(result);
  }

  /* ---------- 採点 ---------- */
  function score(d) {
    const strokePt = Math.min(30, Math.round(d.strokes / 3));
    const colorPt = Math.min(20, d.colors * 3);
    const coverPt = Math.round(Math.min(1, d.coverage / 0.42) * 30);
    const layerPt = Math.min(10, (d.layers - 1) * 5);
    let timePt = 0;
    if (d.limit) {
      // 時間ぎりぎりまで描いた／早く仕上げた、どちらもえらい
      const used = Math.min(1, d.elapsed / d.limit);
      timePt = d.early ? Math.round(6 + used * 4) : Math.round(used * 10);
    } else {
      timePt = Math.min(10, Math.round(d.elapsed / 30));
    }
    const total = strokePt + colorPt + coverPt + layerPt + timePt;
    const rank = total >= 88 ? 'S' : total >= 72 ? 'A' : total >= 54 ? 'B' : total >= 32 ? 'C' : 'D';

    const lines = [];
    if (d.strokes < 10) lines.push('まだ描きはじめたばかり。線をもっと重ねると世界が広がります。');
    else if (d.strokes > 120) lines.push('線の量がすごい。細部までよく描き込みました。');
    if (d.colors >= 6) lines.push('色数もたっぷり。カラフルで見ごたえがあります。');
    else if (d.colors <= 2) lines.push('少ない色でまとめるのも味。次はもう 1 色足してみる？');
    if (d.coverage > 0.55) lines.push('画面いっぱいに描けていて迫力あり。');
    else if (d.coverage < 0.08) lines.push('余白がたっぷり。背景を足すと印象が変わります。');
    if (d.layers >= 3) lines.push('レイヤーを分けて描けているのは上級者のやりかた。');
    if (d.early && d.limit) lines.push('時間内に「できた！」を押せたのでボーナス +6。');
    if (!lines.length) lines.push('いいバランスで描けました。');

    return {
      theme: d.theme, total, rank, early: d.early,
      elapsed: Math.round(d.elapsed),
      limit: d.limit,
      comment: lines.slice(0, 3).join(' '),
      breakdown: [
        ['描き込み（線の数 ' + d.strokes + '）', strokePt, 30],
        ['色づかい（' + d.colors + ' 色）', colorPt, 20],
        ['画面の使いかた（' + Math.round(d.coverage * 100) + '%）', coverPt, 30],
        ['レイヤー活用（' + d.layers + ' 枚）', layerPt, 10],
        ['時間の使いかた', timePt, 10]
      ]
    };
  }

  /* ---------- ギャラリー（localStorage） ---------- */
  function loadGallery() {
    try {
      return JSON.parse(localStorage.getItem(GALLERY_KEY) || '[]');
    } catch (e) { return []; }
  }

  function saveGallery(items) {
    try {
      localStorage.setItem(GALLERY_KEY, JSON.stringify(items));
      return true;
    } catch (e) {
      return false;
    }
  }

  function addToGallery(entry) {
    const items = loadGallery();
    items.unshift(entry);
    while (items.length > GALLERY_MAX) items.pop();
    // 容量オーバーのときは古いものから捨てて入れ直す
    while (items.length && !saveGallery(items)) items.pop();
    return items.length > 0;
  }

  function removeFromGallery(id) {
    const items = loadGallery().filter(it => it.id !== id);
    saveGallery(items);
    return items;
  }

  return {
    THEMES, randomTheme, start, stop, finish, noteStroke, isActive, current,
    loadGallery, addToGallery, removeFromGallery
  };
})();
