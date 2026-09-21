// かおの絵をぜんぶコードで描くモジュール。
// 画像ファイルはひとつも使わず、Canvas 2D の曲線だけで似顔絵をつくる。
// 座標は「一辺 100 の正方形」を基準にした相対値なので、48px でも 480px でも同じ形になる。

const LINE = '#4a3a3a'; // りんかくの色（くらい茶いろ）
const LINE_SOFT = '#6b5450'; // すこしうすい線
const WHITE = '#fffdfa';

/** はだの色。うすい順にならべてある。 */
const SKIN_COLORS = [
  '#ffeede', '#ffe0c0', '#fbd2a8', '#f2bf8d',
  '#e0a273', '#c9855a', '#a66743', '#7d4b30',
];

/** かみの色。 */
const HAIR_COLORS = [
  '#3a2b28', '#5c4033', '#7b4f2c', '#a9713f',
  '#d8a64a', '#f0dfb4', '#8f3a3a', '#c96a86',
  '#5a7fb8', '#9fa3ad',
];

/** めの色。 */
const EYE_COLORS = [
  '#3a2b28', '#6b4a33', '#a9713f', '#3f7fbf',
  '#2f9e7a', '#7a5ea8', '#b0424a', '#5a6572',
];

/** パーツの定義。作成画面の UI はこの配列から自動でつくられる。 */
export const FACE_FIELDS = [
  { key: 'skin', label: 'はだの色', max: 8, type: 'swatch', colors: SKIN_COLORS },
  { key: 'hair', label: 'かみがた', max: 24, type: 'part' },
  { key: 'hairColor', label: 'かみの色', max: 10, type: 'swatch', colors: HAIR_COLORS },
  { key: 'eye', label: 'め', max: 20, type: 'part' },
  { key: 'eyeColor', label: 'めの色', max: 8, type: 'swatch', colors: EYE_COLORS },
  { key: 'brow', label: 'まゆげ', max: 14, type: 'part' },
  { key: 'nose', label: 'はな', max: 10, type: 'part' },
  { key: 'mouth', label: 'くち', max: 16, type: 'part' },
  { key: 'faceShape', label: 'りんかく', max: 10, type: 'part' },
  { key: 'extra', label: 'めがね・ひげ', max: 10, type: 'part' }, // 0 = なし
  { key: 'blush', label: 'ほお', max: 3, type: 'part' },
];

const FIELD_BY_KEY = {};
for (const f of FACE_FIELDS) FIELD_BY_KEY[f.key] = f;

// ---------------------------------------------------------------- 小さな道具

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function idx(v, max) {
  const n = Math.floor(Number(v));
  if (!isFinite(n)) return 0;
  return clamp(n, 0, max - 1);
}

/** 16 進の色を明るく/くらくする。amt は -1..1。 */
function shade(hex, amt) {
  const h = String(hex).replace('#', '');
  const full = h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h;
  let r = parseInt(full.slice(0, 2), 16);
  let g = parseInt(full.slice(2, 4), 16);
  let b = parseInt(full.slice(4, 6), 16);
  if (!isFinite(r) || !isFinite(g) || !isFinite(b)) return '#cccccc';
  const to = amt >= 0 ? 255 : 0;
  const k = Math.abs(amt);
  r = Math.round(r + (to - r) * k);
  g = Math.round(g + (to - g) * k);
  b = Math.round(b + (to - b) * k);
  const hx = (n) => clamp(n, 0, 255).toString(16).padStart(2, '0');
  return '#' + hx(r) + hx(g) + hx(b);
}

/** 半とうめいの色をつくる（rgba 文字列）。 */
function alpha(hex, a) {
  const h = String(hex).replace('#', '');
  const full = h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h;
  const r = parseInt(full.slice(0, 2), 16) || 0;
  const g = parseInt(full.slice(2, 4), 16) || 0;
  const b = parseInt(full.slice(4, 6), 16) || 0;
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
}

function ell(ctx, x, y, rx, ry, rot) {
  ctx.beginPath();
  if (typeof ctx.ellipse === 'function') {
    ctx.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot || 0, 0, Math.PI * 2);
  } else {
    ctx.arc(x, y, Math.abs(rx), 0, Math.PI * 2);
  }
}

function fillEll(ctx, x, y, rx, ry, rot, color) {
  ell(ctx, x, y, rx, ry, rot);
  ctx.fillStyle = color;
  ctx.fill();
}

function strokeEll(ctx, x, y, rx, ry, rot, color, w) {
  ell(ctx, x, y, rx, ry, rot);
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.stroke();
}

/** なめらかな弧をひく。bend が大きいほど下にふくらむ。 */
function arcLine(ctx, x1, y1, x2, y2, bend, color, w) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.quadraticCurveTo((x1 + x2) / 2, (y1 + y2) / 2 + bend, x2, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.stroke();
}

// ---------------------------------------------------------- かおの API

/** すべての key をもった、でたらめな顔をつくる。 */
export function randomFace(rand = Math.random) {
  const r = typeof rand === 'function' ? rand : Math.random;
  const f = {};
  for (const fld of FACE_FIELDS) {
    f[fld.key] = clamp(Math.floor(r() * fld.max), 0, fld.max - 1);
  }
  // めがね・ひげは「なし」が出やすいほうが自然。
  if (r() < 0.5) f.extra = 0;
  if (r() < 0.45) f.blush = 0;
  return f;
}

/** 足りない key をうめて、はんいにおさめた顔を返す。 */
function normalize(face) {
  const src = face && typeof face === 'object' ? face : {};
  const f = {};
  for (const fld of FACE_FIELDS) {
    f[fld.key] = src[fld.key] == null ? 0 : idx(src[fld.key], fld.max);
  }
  return f;
}

/** ふたりの子どもの顔。パーツは 50/50、色は中間によせる。 */
export function childFace(faceA, faceB, rand = Math.random) {
  const r = typeof rand === 'function' ? rand : Math.random;
  const a = normalize(faceA);
  const b = normalize(faceB);
  const f = {};
  for (const fld of FACE_FIELDS) {
    const va = a[fld.key];
    const vb = b[fld.key];
    if (fld.type === 'swatch') {
      // 色は親のあいだの、ちかい値にする。
      let v = Math.round((va + vb) / 2);
      if (r() < 0.34) v += r() < 0.5 ? -1 : 1;
      f[fld.key] = clamp(v, 0, fld.max - 1);
    } else {
      f[fld.key] = r() < 0.5 ? va : vb;
      // たまに、どちらにも似ていない子が生まれる。
      if (r() < 0.1) f[fld.key] = clamp(Math.floor(r() * fld.max), 0, fld.max - 1);
    }
  }
  // 子どもはめがね・ひげなしが多く、ほおはあかい。
  if (r() < 0.75) f.extra = 0;
  if (r() < 0.6) f.blush = 1;
  return f;
}

// ------------------------------------------------------------- りんかく

/** りんかく 10 しゅるいの形のパラメータ。 */
const SHAPES = [
  // たまご
  { hw: 27, hh: 32, topW: 0.62, cheek: 0.08, jawW: 0.62, chinY: 0.90 },
  // まんまる
  { hw: 29, hh: 29, topW: 0.80, cheek: 0.10, jawW: 0.80, chinY: 0.92 },
  // しかく
  { hw: 28, hh: 31, topW: 0.86, cheek: 0.30, jawW: 0.92, chinY: 0.96 },
  // ほそおもて
  { hw: 23, hh: 35, topW: 0.60, cheek: 0.00, jawW: 0.50, chinY: 0.86 },
  // えらはり（ベース形）
  { hw: 29, hh: 30, topW: 0.58, cheek: 0.34, jawW: 0.86, chinY: 0.94 },
  // さかさ三角（あごほそめ）
  { hw: 29, hh: 32, topW: 0.80, cheek: -0.10, jawW: 0.40, chinY: 0.80 },
  // よこながまる
  { hw: 31, hh: 27, topW: 0.78, cheek: 0.10, jawW: 0.72, chinY: 0.92 },
  // あごとがり
  { hw: 26, hh: 34, topW: 0.66, cheek: 0.02, jawW: 0.30, chinY: 0.72 },
  // ふっくら
  { hw: 30, hh: 32, topW: 0.72, cheek: 0.24, jawW: 0.78, chinY: 0.95 },
  // だいだい形（ほおぷっくり）
  { hw: 28, hh: 30, topW: 0.70, cheek: 0.36, jawW: 0.66, chinY: 0.90 },
];

function facePath(ctx, g) {
  const { hw, hh, topW, cheek, jawW, chinY } = g;
  const cy = cheek * hh;
  ctx.beginPath();
  ctx.moveTo(0, -hh);
  ctx.bezierCurveTo(hw * topW, -hh, hw, -hh * 0.5, hw, cy);
  ctx.bezierCurveTo(hw, hh * (chinY - 0.28), hw * jawW, hh * chinY, 0, hh);
  ctx.bezierCurveTo(-hw * jawW, hh * chinY, -hw, hh * (chinY - 0.28), -hw, cy);
  ctx.bezierCurveTo(-hw, -hh * 0.5, -hw * topW, -hh, 0, -hh);
  ctx.closePath();
}

// ------------------------------------------------------------------- め

function eyeWhite(ctx, x, y, rx, ry) {
  fillEll(ctx, x, y, rx, ry, 0, WHITE);
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1.05;
  ctx.stroke();
}

function pupil(ctx, x, y, r, color, hi) {
  fillEll(ctx, x, y, r, r, 0, color);
  fillEll(ctx, x, y, r * 0.45, r * 0.45, 0, shade(color, -0.55));
  if (hi !== false) {
    fillEll(ctx, x - r * 0.33, y - r * 0.36, r * 0.3, r * 0.3, 0, 'rgba(255,255,255,0.9)');
  }
}

function lashes(ctx, x, y, rx, ry, side, many) {
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1.2;
  const n = many ? 3 : 2;
  for (let i = 0; i < n; i++) {
    const a = -0.5 - i * 0.42;
    const sx = x + side * Math.cos(a) * rx * 1.0;
    const sy = y + Math.sin(a) * ry * 1.0;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + side * 3.0, sy - 2.4);
    ctx.stroke();
  }
}

/**
 * かたほうの目をえがく。
 * side は +1 が右目（画面むかって右）。
 */
function drawEye(ctx, kind, x, y, side, eyeCol, blink) {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  if (blink && kind !== 7 && kind !== 13) {
    // まばたきは、どのめでも「ふせたまつ毛」でひょうげんする。
    arcLine(ctx, x - 6.4, y, x + 6.4, y, 3.0, LINE, 1.6);
    ctx.restore();
    return;
  }

  switch (kind) {
    case 0: // まるめ（きほん）
      eyeWhite(ctx, x, y, 5.6, 6.2);
      pupil(ctx, x, y + 0.3, 3.2, eyeCol);
      break;
    case 1: // おおきなまる
      eyeWhite(ctx, x, y, 7.0, 7.6);
      pupil(ctx, x, y + 0.5, 4.3, eyeCol);
      break;
    case 2: // ちいさな点め
      fillEll(ctx, x, y, 2.3, 2.5, 0, LINE);
      break;
    case 3: // よこながアーモンド
      eyeWhite(ctx, x, y, 7.2, 4.4);
      pupil(ctx, x, y, 3.2, eyeCol);
      break;
    case 4: // たれめ
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(side * 0.28);
      eyeWhite(ctx, 0, 0, 6.0, 5.2);
      pupil(ctx, 0, 0.6, 3.2, eyeCol);
      ctx.restore();
      break;
    case 5: // つりめ
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-side * 0.3);
      eyeWhite(ctx, 0, 0, 6.2, 4.8);
      pupil(ctx, 0, 0, 3.1, eyeCol);
      ctx.restore();
      break;
    case 6: // ねむそう（はんめ）
      eyeWhite(ctx, x, y + 1.0, 6.0, 4.2);
      pupil(ctx, x, y + 1.6, 3.0, eyeCol, false);
      ctx.beginPath();
      ctx.moveTo(x - 6.6, y - 1.6);
      ctx.lineTo(x + 6.6, y - 1.6);
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 1.8;
      ctx.stroke();
      break;
    case 7: // にっこり（^ ^）
      arcLine(ctx, x - 6.2, y + 1.6, x + 6.2, y + 1.6, -7.4, LINE, 1.9);
      break;
    case 8: // きらきら
      eyeWhite(ctx, x, y, 6.4, 7.0);
      pupil(ctx, x, y, 4.0, eyeCol, false);
      fillEll(ctx, x - 1.4, y - 1.8, 1.7, 1.9, 0, 'rgba(255,255,255,0.95)');
      fillEll(ctx, x + 1.6, y + 1.8, 0.9, 1.0, 0, 'rgba(255,255,255,0.8)');
      break;
    case 9: // まつげ すこし
      eyeWhite(ctx, x, y, 6.0, 6.0);
      pupil(ctx, x, y, 3.4, eyeCol);
      lashes(ctx, x, y, 6.0, 6.0, side, false);
      break;
    case 10: // まつげ たっぷり
      eyeWhite(ctx, x, y, 6.4, 6.4);
      pupil(ctx, x, y, 3.6, eyeCol);
      lashes(ctx, x, y, 6.4, 6.4, side, true);
      arcLine(ctx, x - 6.6, y - 3.4, x + 6.6, y - 4.6, -1.4, LINE, 2.0);
      break;
    case 11: // しかくめ
      ctx.beginPath();
      ctx.rect(x - 5.4, y - 5.0, 10.8, 10.0);
      ctx.fillStyle = WHITE;
      ctx.fill();
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.beginPath();
      ctx.rect(x - 2.0, y - 2.2, 4.0, 4.4);
      ctx.fillStyle = eyeCol;
      ctx.fill();
      break;
    case 12: // うるうる おおきめ
      eyeWhite(ctx, x, y, 7.4, 8.2);
      pupil(ctx, x, y + 0.6, 5.0, eyeCol, false);
      fillEll(ctx, x - 2.0, y - 2.4, 2.1, 2.3, 0, 'rgba(255,255,255,0.95)');
      fillEll(ctx, x + 2.2, y + 2.6, 1.3, 1.4, 0, 'rgba(255,255,255,0.75)');
      break;
    case 13: // ほそい線め
      ctx.beginPath();
      ctx.moveTo(x - 6.4, y);
      ctx.lineTo(x + 6.4, y);
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 2.0;
      ctx.stroke();
      break;
    case 14: // 三白眼
      eyeWhite(ctx, x, y, 6.2, 5.6);
      pupil(ctx, x, y - 1.6, 2.8, eyeCol, false);
      break;
    case 15: // ぐるぐる
      eyeWhite(ctx, x, y, 6.4, 6.4);
      ctx.beginPath();
      for (let i = 0; i <= 54; i++) {
        const a = (i / 54) * Math.PI * 4;
        const rr = 0.6 + (i / 54) * 4.4;
        const px = x + Math.cos(a) * rr;
        const py = y + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = eyeCol;
      ctx.lineWidth = 1.3;
      ctx.stroke();
      break;
    case 16: // ちいさいたれめ
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(side * 0.34);
      eyeWhite(ctx, 0, 0, 4.4, 3.8);
      pupil(ctx, 0, 0.4, 2.4, eyeCol, false);
      ctx.restore();
      break;
    case 17: // びっくり（しろめ ひろい）
      eyeWhite(ctx, x, y, 7.2, 7.8);
      pupil(ctx, x, y, 2.4, eyeCol, false);
      break;
    case 18: // かたほうウインク
      if (side > 0) {
        arcLine(ctx, x - 6.2, y + 1.4, x + 6.2, y + 1.4, -6.8, LINE, 1.9);
      } else {
        eyeWhite(ctx, x, y, 6.0, 6.4);
        pupil(ctx, x, y, 3.4, eyeCol);
      }
      break;
    default: // 19 ジト目
      eyeWhite(ctx, x, y + 0.6, 6.2, 4.6);
      pupil(ctx, x, y + 0.8, 3.0, eyeCol, false);
      ctx.beginPath();
      ctx.moveTo(x - 6.8, y - 2.6);
      ctx.lineTo(x + 6.8, y - 3.4);
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - 6.2, y - 5.6);
      ctx.lineTo(x + 6.2, y - 6.2);
      ctx.strokeStyle = alpha(LINE, 0.6);
      ctx.lineWidth = 1.1;
      ctx.stroke();
      break;
  }
  ctx.restore();
}

// ---------------------------------------------------------------- まゆげ

/**
 * かたほうのまゆげ。mood 0=ごきげん 1=ふつう 2=ふきげん。
 * うちがわ（鼻より）は side*-1 のほう。
 */
function drawBrow(ctx, kind, x, y, side, col, mood) {
  const w = 8.6;
  const inX = x - side * w; // うちがわ
  const outX = x + side * w; // そとがわ
  // きぶんで、うちがわの高さが上下する。
  const tilt = mood === 0 ? -1.6 : mood === 2 ? 3.6 : 0;
  const lift = mood === 0 ? -1.4 : mood === 2 ? 1.2 : 0;
  const iy = y + tilt + lift;
  const oy = y - (mood === 2 ? 1.8 : 0) + lift;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = col;
  ctx.fillStyle = col;

  const soft = (bend, lw) => {
    ctx.beginPath();
    ctx.moveTo(inX, iy);
    ctx.quadraticCurveTo((inX + outX) / 2, (iy + oy) / 2 + bend, outX, oy);
    ctx.lineWidth = lw;
    ctx.stroke();
  };

  switch (kind) {
    case 0: soft(-2.6, 2.4); break; // ふつうのアーチ
    case 1: soft(0, 2.2); break; // まっすぐ
    case 2: soft(-5.0, 2.6); break; // まるいアーチ
    case 3: soft(2.6, 2.4); break; // への字（ハの字）
    case 4: soft(-2.4, 4.2); break; // ふとい
    case 5: soft(-2.2, 1.3); break; // ほそい
    case 6: { // かくかく（角ばり）
      ctx.beginPath();
      ctx.moveTo(inX, iy + 1.2);
      ctx.lineTo(x - side * 1.0, oy - 2.6);
      ctx.lineTo(outX, oy - 0.4);
      ctx.lineWidth = 2.6;
      ctx.stroke();
      break;
    }
    case 7: { // みじかい
      ctx.beginPath();
      ctx.moveTo(x - side * 4.6, iy);
      ctx.quadraticCurveTo(x, iy - 2.2, x + side * 4.6, oy);
      ctx.lineWidth = 2.8;
      ctx.stroke();
      break;
    }
    case 8: { // ながい
      ctx.beginPath();
      ctx.moveTo(x - side * 10.4, iy + 0.6);
      ctx.quadraticCurveTo(x, iy - 3.0, x + side * 11.0, oy - 0.6);
      ctx.lineWidth = 2.1;
      ctx.stroke();
      break;
    }
    case 9: { // つりあがり
      ctx.beginPath();
      ctx.moveTo(inX, iy + 2.6);
      ctx.quadraticCurveTo(x, iy - 0.6, outX, oy - 3.2);
      ctx.lineWidth = 2.5;
      ctx.stroke();
      break;
    }
    case 10: { // さがりまゆ（やさしい）
      ctx.beginPath();
      ctx.moveTo(inX, iy - 2.4);
      ctx.quadraticCurveTo(x, iy + 0.8, outX, oy + 3.0);
      ctx.lineWidth = 2.4;
      ctx.stroke();
      break;
    }
    case 11: { // まるい かたまり
      ctx.save();
      ctx.translate(x, (iy + oy) / 2);
      ctx.rotate(side * 0.1);
      fillEll(ctx, 0, 0, 7.4, 2.4, 0, col);
      ctx.restore();
      break;
    }
    case 12: { // 三日月（こまゆ）
      ctx.beginPath();
      ctx.moveTo(x - side * 6.0, iy + 1.0);
      ctx.quadraticCurveTo(x, iy - 5.2, x + side * 6.0, oy + 1.0);
      ctx.quadraticCurveTo(x, iy - 2.6, x - side * 6.0, iy + 1.0);
      ctx.fill();
      break;
    }
    default: { // 13 もじゃもじゃ
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 6; i++) {
        const t = i / 5;
        const px = inX + (outX - inX) * t;
        const py = iy + (oy - iy) * t - Math.sin(t * Math.PI) * 2.4;
        ctx.beginPath();
        ctx.moveTo(px, py + 2.0);
        ctx.lineTo(px + side * 1.0, py - 2.4);
        ctx.stroke();
      }
      soft(-2.2, 2.0);
      break;
    }
  }
  ctx.restore();
}

// ------------------------------------------------------------------ はな

function drawNose(ctx, kind, x, y, skin) {
  const dark = shade(skin, -0.32);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = LINE_SOFT;
  ctx.fillStyle = LINE_SOFT;
  switch (kind) {
    case 0: // ちいさな点
      fillEll(ctx, x, y, 1.5, 1.5, 0, LINE_SOFT);
      break;
    case 1: // 三角
      ctx.beginPath();
      ctx.moveTo(x, y - 3.2);
      ctx.lineTo(x + 2.8, y + 2.2);
      ctx.lineTo(x - 2.8, y + 2.2);
      ctx.closePath();
      ctx.fillStyle = dark;
      ctx.fill();
      break;
    case 2: // まるはな
      fillEll(ctx, x, y, 3.4, 3.0, 0, shade(skin, -0.14));
      strokeEll(ctx, x, y, 3.4, 3.0, 0, LINE_SOFT, 1.0);
      fillEll(ctx, x - 1.1, y - 1.0, 1.0, 0.9, 0, 'rgba(255,255,255,0.7)');
      break;
    case 3: // とがりはな
      ctx.beginPath();
      ctx.moveTo(x - 0.4, y - 5.0);
      ctx.quadraticCurveTo(x + 3.2, y + 0.6, x + 1.0, y + 2.4);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      break;
    case 4: // よこ線
      ctx.beginPath();
      ctx.moveTo(x - 3.0, y + 1.2);
      ctx.lineTo(x + 3.0, y + 1.2);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      break;
    case 5: // Lの字
      ctx.beginPath();
      ctx.moveTo(x - 1.2, y - 3.4);
      ctx.lineTo(x - 1.2, y + 1.4);
      ctx.lineTo(x + 2.6, y + 1.8);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      break;
    case 6: // わしばな
      ctx.beginPath();
      ctx.moveTo(x - 1.0, y - 6.0);
      ctx.bezierCurveTo(x + 3.6, y - 2.6, x + 2.0, y + 1.0, x + 0.6, y + 2.6);
      ctx.quadraticCurveTo(x - 1.4, y + 3.4, x - 2.6, y + 2.0);
      ctx.lineWidth = 1.4;
      ctx.stroke();
      break;
    case 7: // ひろいはな（あな ふたつ）
      fillEll(ctx, x - 2.4, y + 0.8, 1.5, 1.1, -0.3, LINE_SOFT);
      fillEll(ctx, x + 2.4, y + 0.8, 1.5, 1.1, 0.3, LINE_SOFT);
      arcLine(ctx, x - 3.6, y - 1.2, x + 3.6, y - 1.2, 2.4, alpha(LINE_SOFT, 0.5), 1.1);
      break;
    case 8: // U の字
      ctx.beginPath();
      ctx.moveTo(x - 2.6, y - 2.0);
      ctx.quadraticCurveTo(x, y + 3.4, x + 2.6, y - 2.0);
      ctx.lineWidth = 1.6;
      ctx.stroke();
      break;
    default: // 9 ボタンばな
      fillEll(ctx, x, y + 0.4, 2.6, 2.6, 0, shade(skin, -0.2));
      fillEll(ctx, x - 0.9, y - 0.6, 0.9, 0.9, 0, 'rgba(255,255,255,0.85)');
      arcLine(ctx, x - 4.4, y + 2.2, x - 2.0, y + 2.6, 1.0, alpha(LINE_SOFT, 0.45), 1.0);
      arcLine(ctx, x + 2.0, y + 2.6, x + 4.4, y + 2.2, 1.0, alpha(LINE_SOFT, 0.45), 1.0);
      break;
  }
  ctx.restore();
}

// ------------------------------------------------------------------ くち

const LIP = '#c8646b';
const MOUTH_IN = '#a34a55';
const TONGUE = '#e08a95';
const TOOTH = '#fffdf6';

function openMouth(ctx, x, y, w, h, curve) {
  ctx.beginPath();
  ctx.moveTo(x - w, y);
  ctx.quadraticCurveTo(x, y - curve, x + w, y);
  ctx.quadraticCurveTo(x, y + h, x - w, y);
  ctx.closePath();
  ctx.fillStyle = MOUTH_IN;
  ctx.fill();
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  // した
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x - w, y);
  ctx.quadraticCurveTo(x, y - curve, x + w, y);
  ctx.quadraticCurveTo(x, y + h, x - w, y);
  ctx.closePath();
  ctx.clip();
  fillEll(ctx, x, y + h * 0.85, w * 0.66, h * 0.5, 0, TONGUE);
  ctx.restore();
}

/** mood と talking をかならず反映するくち。 */
function drawMouth(ctx, kind, x, y, mood, talking) {
  // き分け: ごきげんは上むきの弧、ふきげんは下むき。
  const k = mood === 0 ? 1 : mood === 2 ? -1 : 0;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = LINE;
  ctx.fillStyle = LINE;

  // しゃべっているときは、くちの形ごとに大きさをかえてあける。
  if (talking) {
    const wide = [5.2, 7.4, 4.6, 5.0, 7.0, 3.4, 3.2, 6.0, 5.6, 8.0, 5.0, 6.6, 5.8, 4.4, 6.4, 5.4][kind] || 5.4;
    const high = 5.2 + (mood === 0 ? 1.8 : mood === 2 ? -0.8 : 0);
    openMouth(ctx, x, y, wide, high, k * 2.2 - 0.6);
    if (kind === 4 || kind === 11) {
      // 歯のみえるくちは、しゃべっても歯がのぞく。
      ctx.save();
      ctx.beginPath();
      ctx.rect(x - wide, y - 1.4, wide * 2, 2.2);
      ctx.clip();
      ctx.fillStyle = TOOTH;
      ctx.fillRect(x - wide, y - 1.4, wide * 2, 2.2);
      ctx.restore();
    }
    ctx.restore();
    return;
  }

  switch (kind) {
    case 0: // にっこり弧
      arcLine(ctx, x - 6.0, y - k * 1.2, x + 6.0, y - k * 1.2, 5.0 * (k || 0.35) + (k === -1 ? -1.0 : 0), LINE, 1.9);
      break;
    case 1: // おおきなわらい
      openMouth(ctx, x, y - 1.0, 7.2, 6.0 + k * 1.6, -3.4 * (k >= 0 ? 1 : -1));
      break;
    case 2: // 一もんじ
      if (k === 0) {
        ctx.beginPath();
        ctx.moveTo(x - 5.4, y);
        ctx.lineTo(x + 5.4, y);
        ctx.lineWidth = 2.0;
        ctx.stroke();
      } else {
        arcLine(ctx, x - 5.4, y, x + 5.4, y, k * 3.6, LINE, 2.0);
      }
      break;
    case 3: // への字
      arcLine(ctx, x - 5.6, y + 1.2, x + 5.6, y + 1.2, k >= 0 ? 2.2 : -4.2, LINE, 2.0);
      break;
    case 4: { // にひひ（歯みせ）
      const h = 4.2 + k * 1.2;
      ctx.beginPath();
      ctx.moveTo(x - 6.6, y - 1.6);
      ctx.lineTo(x + 6.6, y - 1.6);
      ctx.quadraticCurveTo(x, y + h, x - 6.6, y - 1.6);
      ctx.closePath();
      ctx.fillStyle = TOOTH;
      ctx.fill();
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 1.3;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - 2.2, y - 1.6);
      ctx.lineTo(x - 2.2, y + 1.6);
      ctx.moveTo(x + 2.2, y - 1.6);
      ctx.lineTo(x + 2.2, y + 1.4);
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = alpha(LINE, 0.4);
      ctx.stroke();
      break;
    }
    case 5: // ちいさいまる
      fillEll(ctx, x, y, 2.6, 2.8 + k * 0.6, 0, MOUTH_IN);
      strokeEll(ctx, x, y, 2.6, 2.8 + k * 0.6, 0, LINE, 1.1);
      break;
    case 6: // とがりぐち（う）
      ctx.beginPath();
      ctx.moveTo(x - 3.4, y);
      ctx.quadraticCurveTo(x, y - 3.4 - k, x + 3.4, y);
      ctx.quadraticCurveTo(x, y + 3.6 + k, x - 3.4, y);
      ctx.closePath();
      ctx.fillStyle = LIP;
      ctx.fill();
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 1.1;
      ctx.stroke();
      break;
    case 7: { // ねこぐち（w）
      const d = k * 1.4;
      ctx.beginPath();
      ctx.moveTo(x - 6.4, y - d);
      ctx.quadraticCurveTo(x - 3.2, y + 3.6 + d, x, y - 0.4 - d);
      ctx.quadraticCurveTo(x + 3.2, y + 3.6 + d, x + 6.4, y - d);
      ctx.lineWidth = 1.8;
      ctx.stroke();
      break;
    }
    case 8: // ニヤリ（かたあがり）
      ctx.beginPath();
      ctx.moveTo(x - 6.0, y + 1.4 - k * 1.0);
      ctx.quadraticCurveTo(x, y + 2.4 + k * 1.6, x + 6.2, y - 2.2 - k * 1.2);
      ctx.lineWidth = 1.9;
      ctx.stroke();
      break;
    case 9: // あんぐり大ぐち
      openMouth(ctx, x, y, 8.0, 8.4 + k * 1.4, -1.0);
      break;
    case 10: // くちびる あつめ
      ctx.beginPath();
      ctx.moveTo(x - 6.0, y);
      ctx.quadraticCurveTo(x - 3.0, y - 3.6, x, y - 1.0);
      ctx.quadraticCurveTo(x + 3.0, y - 3.6, x + 6.0, y);
      ctx.quadraticCurveTo(x, y + 5.0 + k * 1.2, x - 6.0, y);
      ctx.closePath();
      ctx.fillStyle = LIP;
      ctx.fill();
      ctx.strokeStyle = shade(LIP, -0.35);
      ctx.lineWidth = 1.0;
      ctx.stroke();
      break;
    case 11: { // ぎざぎざ歯
      const h = 4.6;
      ctx.beginPath();
      ctx.moveTo(x - 6.8, y - 1.4);
      ctx.lineTo(x + 6.8, y - 1.4);
      ctx.quadraticCurveTo(x, y + h + k * 1.2, x - 6.8, y - 1.4);
      ctx.closePath();
      ctx.fillStyle = MOUTH_IN;
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.beginPath();
      ctx.moveTo(x - 6.8, y - 1.4);
      for (let i = 0; i < 6; i++) {
        const sx = x - 6.8 + (13.6 / 6) * i;
        ctx.lineTo(sx + 13.6 / 12, y + 1.8);
        ctx.lineTo(sx + 13.6 / 6, y - 1.4);
      }
      ctx.closePath();
      ctx.fillStyle = TOOTH;
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(x - 6.8, y - 1.4);
      ctx.lineTo(x + 6.8, y - 1.4);
      ctx.quadraticCurveTo(x, y + h + k * 1.2, x - 6.8, y - 1.4);
      ctx.stroke();
      break;
    }
    case 12: // ベーっと した出し
      arcLine(ctx, x - 5.2, y - 0.6, x + 5.2, y - 0.6, 3.6 + k * 1.6, LINE, 1.8);
      ctx.beginPath();
      ctx.moveTo(x - 2.4, y + 1.4);
      ctx.quadraticCurveTo(x, y + 7.2 + k, x + 2.4, y + 1.4);
      ctx.closePath();
      ctx.fillStyle = TONGUE;
      ctx.fill();
      ctx.strokeStyle = shade(TONGUE, -0.4);
      ctx.lineWidth = 0.9;
      ctx.stroke();
      break;
    case 13: // くの字 ちいさめ
      ctx.beginPath();
      ctx.moveTo(x - 3.4, y - k * 1.2);
      ctx.lineTo(x + 0.4, y + 1.8 + k * 0.8);
      ctx.lineTo(x + 3.6, y - 1.0 - k * 1.2);
      ctx.lineWidth = 1.8;
      ctx.stroke();
      break;
    case 14: // 三日月わらい（ふとめ）
      ctx.beginPath();
      ctx.moveTo(x - 6.8, y - 1.6);
      ctx.quadraticCurveTo(x, y + 6.4 + k * 2.0, x + 6.8, y - 1.6);
      ctx.quadraticCurveTo(x, y + 2.4 + k * 1.2, x - 6.8, y - 1.6);
      ctx.closePath();
      ctx.fillStyle = LINE;
      ctx.fill();
      break;
    default: { // 15 くちびる（リップ）
      ctx.beginPath();
      ctx.moveTo(x - 6.4, y);
      ctx.quadraticCurveTo(x - 3.2, y - 4.4, x, y - 1.2);
      ctx.quadraticCurveTo(x + 3.2, y - 4.4, x + 6.4, y);
      ctx.quadraticCurveTo(x + 3.0, y + 4.8 + k, x, y + 5.2 + k);
      ctx.quadraticCurveTo(x - 3.0, y + 4.8 + k, x - 6.4, y);
      ctx.closePath();
      ctx.fillStyle = shade(LIP, 0.05);
      ctx.fill();
      ctx.strokeStyle = shade(LIP, -0.4);
      ctx.lineWidth = 1.0;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - 6.4, y);
      ctx.quadraticCurveTo(x, y + 1.0, x + 6.4, y);
      ctx.lineWidth = 0.9;
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

// ------------------------------------------------------------------ ほお

function drawBlush(ctx, kind, g, skin) {
  if (!kind) return;
  const x = g.hw * 0.66;
  const y = g.hh * 0.28;
  ctx.save();
  if (kind === 1) {
    ctx.globalAlpha = 0.55;
    fillEll(ctx, -x, y, 5.4, 3.4, 0, '#ff9aa6');
    fillEll(ctx, x, y, 5.4, 3.4, 0, '#ff9aa6');
  } else {
    ctx.strokeStyle = alpha('#f07b8a', 0.8);
    ctx.lineWidth = 1.3;
    ctx.lineCap = 'round';
    for (let s = -1; s <= 1; s += 2) {
      for (let i = 0; i < 3; i++) {
        const px = s * (x - 3.0 + i * 3.0);
        ctx.beginPath();
        ctx.moveTo(px - 1.2, y + 2.2);
        ctx.lineTo(px + 1.2, y - 2.2);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- かみがた

/** かみのカテゴリ 24 しゅるい。後ろがみ（顔より奥）。 */
function drawHairBack(ctx, kind, g, col) {
  const hw = g.hw;
  const hh = g.hh;
  const dark = shade(col, -0.25);
  ctx.save();
  ctx.fillStyle = dark;
  ctx.strokeStyle = shade(col, -0.45);
  ctx.lineWidth = 1.0;
  ctx.lineJoin = 'round';

  const longMass = (len, wide) => {
    ctx.beginPath();
    ctx.moveTo(-hw * wide, -hh * 0.3);
    ctx.bezierCurveTo(-hw * (wide + 0.22), hh * 0.6, -hw * (wide + 0.05), len, -hw * 0.5, len);
    ctx.lineTo(hw * 0.5, len);
    ctx.bezierCurveTo(hw * (wide + 0.05), len, hw * (wide + 0.22), hh * 0.6, hw * wide, -hh * 0.3);
    ctx.closePath();
    ctx.fill();
  };

  switch (kind) {
    case 5: longMass(hh * 2.1, 1.02); break; // ロングストレート
    case 6: { // ロングウェーブ
      longMass(hh * 1.9, 1.06);
      ctx.beginPath();
      ctx.moveTo(-hw * 1.18, hh * 0.5);
      ctx.quadraticCurveTo(-hw * 1.5, hh * 1.2, -hw * 1.0, hh * 1.85);
      ctx.quadraticCurveTo(-hw * 0.7, hh * 1.4, -hw * 0.9, hh * 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(hw * 1.18, hh * 0.5);
      ctx.quadraticCurveTo(hw * 1.5, hh * 1.2, hw * 1.0, hh * 1.85);
      ctx.quadraticCurveTo(hw * 0.7, hh * 1.4, hw * 0.9, hh * 0.6);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 7: { // ツインテール
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * hw * 0.92, -hh * 0.42);
        ctx.bezierCurveTo(s * hw * 1.9, -hh * 0.2, s * hw * 2.05, hh * 0.9, s * hw * 1.15, hh * 1.5);
        ctx.bezierCurveTo(s * hw * 1.5, hh * 0.7, s * hw * 1.2, hh * 0.1, s * hw * 0.85, -hh * 0.1);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      break;
    }
    case 8: { // ポニーテール
      ctx.beginPath();
      ctx.moveTo(hw * 0.7, -hh * 0.6);
      ctx.bezierCurveTo(hw * 1.8, -hh * 0.9, hw * 2.0, hh * 0.5, hw * 1.15, hh * 1.35);
      ctx.bezierCurveTo(hw * 1.55, hh * 0.4, hw * 1.25, -hh * 0.2, hw * 0.6, -hh * 0.3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 9: { // おだんご
      fillEll(ctx, 0, -hh * 1.32, hw * 0.46, hw * 0.4, 0, dark);
      ctx.stroke();
      longMass(hh * 0.5, 0.98);
      break;
    }
    case 10: { // アフロ
      fillEll(ctx, 0, -hh * 0.42, hw * 1.42, hh * 1.16, 0, dark);
      break;
    }
    case 14: { // ウルフ（えりあしながめ）
      ctx.beginPath();
      ctx.moveTo(-hw * 0.98, hh * 0.1);
      ctx.quadraticCurveTo(-hw * 0.9, hh * 1.3, -hw * 0.2, hh * 1.42);
      ctx.lineTo(hw * 0.2, hh * 1.42);
      ctx.quadraticCurveTo(hw * 0.9, hh * 1.3, hw * 0.98, hh * 0.1);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 15: { // サイドテール
      ctx.beginPath();
      ctx.moveTo(-hw * 0.9, -hh * 0.5);
      ctx.bezierCurveTo(-hw * 2.0, -hh * 0.3, -hw * 1.9, hh * 0.9, -hw * 1.0, hh * 1.2);
      ctx.bezierCurveTo(-hw * 1.5, hh * 0.4, -hw * 1.2, -hh * 0.1, -hw * 0.75, -hh * 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 16: { // おさげ（みつあみ）
      for (const s of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
          fillEll(ctx, s * (hw * 0.98 + i * 1.2), hh * (0.45 + i * 0.32), hw * 0.2, hh * 0.2, 0, dark);
        }
      }
      longMass(hh * 0.55, 1.0);
      break;
    }
    case 17: longMass(hh * 1.45, 1.03); break; // ぱっつん＋セミロング
    case 18: { // くるくるカール
      longMass(hh * 1.25, 1.0);
      for (const s of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
          fillEll(ctx, s * hw * (1.02 + (i % 2) * 0.16), hh * (0.55 + i * 0.28), hw * 0.28, hh * 0.24, 0, dark);
        }
      }
      break;
    }
    case 22: { // おおきなリボンのついた ハーフアップ
      longMass(hh * 1.55, 1.0);
      break;
    }
    case 23: { // ながいウェーブ＋わけめ
      longMass(hh * 2.0, 1.08);
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * hw * 1.1, hh * 0.9);
        ctx.quadraticCurveTo(s * hw * 1.45, hh * 1.5, s * hw * 0.95, hh * 2.05);
        ctx.quadraticCurveTo(s * hw * 0.8, hh * 1.5, s * hw * 0.85, hh * 1.0);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    default:
      break;
  }
  ctx.restore();
}

/** まえがみ・あたまの上。顔よりも手前にえがく。 */
function drawHairFront(ctx, kind, g, col) {
  const hw = g.hw;
  const hh = g.hh;
  const hi = shade(col, 0.22);
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.fillStyle = col;
  ctx.strokeStyle = shade(col, -0.35);
  ctx.lineWidth = 1.0;

  // あたまをおおうキャップ。fringe(y) までがかみ。
  const cap = (topScale, sideScale) => {
    const w = hw * (sideScale == null ? 1.04 : sideScale);
    const h = hh * (topScale == null ? 1.05 : topScale);
    ctx.beginPath();
    ctx.moveTo(-w, hh * 0.04);
    ctx.bezierCurveTo(-w, -h * 0.78, -w * 0.62, -h * 1.1, 0, -h * 1.1);
    ctx.bezierCurveTo(w * 0.62, -h * 1.1, w, -h * 0.78, w, hh * 0.04);
  };

  const closeFringe = (yLeft, yRight, bend) => {
    ctx.quadraticCurveTo(0, hh * 0.04 + bend, -hw * 1.04, hh * 0.04);
    ctx.closePath();
    ctx.fill();
  };

  switch (kind) {
    case 0: { // ぼうず
      cap(0.92, 1.0);
      ctx.lineTo(hw * 1.0, -hh * 0.42);
      ctx.quadraticCurveTo(0, -hh * 0.2, -hw * 1.0, -hh * 0.42);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 1: { // ショート
      cap(1.03, 1.05);
      ctx.lineTo(hw * 1.05, -hh * 0.2);
      ctx.quadraticCurveTo(hw * 0.5, -hh * 0.52, 0, -hh * 0.5);
      ctx.quadraticCurveTo(-hw * 0.5, -hh * 0.48, -hw * 1.05, -hh * 0.22);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 2: { // ショート（わけめ）
      cap(1.03, 1.06);
      ctx.lineTo(hw * 1.06, -hh * 0.14);
      ctx.quadraticCurveTo(hw * 0.2, -hh * 0.34, -hw * 0.28, -hh * 0.82);
      ctx.quadraticCurveTo(-hw * 0.6, -hh * 0.3, -hw * 1.06, -hh * 0.1);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 3: { // マッシュ（まるいおかっぱ）
      cap(1.06, 1.1);
      ctx.lineTo(hw * 1.1, hh * 0.1);
      ctx.quadraticCurveTo(0, -hh * 0.36, -hw * 1.1, hh * 0.1);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 4: { // みじかいおかっぱ（ぱっつん）
      cap(1.02, 1.08);
      ctx.lineTo(hw * 1.08, -hh * 0.06);
      ctx.lineTo(-hw * 1.08, -hh * 0.06);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 5: { // ロングストレート
      cap(1.04, 1.06);
      ctx.lineTo(hw * 1.06, hh * 0.22);
      ctx.quadraticCurveTo(hw * 0.55, -hh * 0.3, 0, -hh * 0.52);
      ctx.quadraticCurveTo(-hw * 0.55, -hh * 0.3, -hw * 1.06, hh * 0.22);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 6: { // ロングウェーブ
      cap(1.05, 1.08);
      ctx.bezierCurveTo(hw * 0.9, -hh * 0.2, hw * 0.4, -hh * 0.62, -hw * 0.1, -hh * 0.5);
      ctx.bezierCurveTo(-hw * 0.6, -hh * 0.38, -hw * 0.8, hh * 0.0, -hw * 1.08, hh * 0.24);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 7: { // ツインテール
      cap(1.03, 1.05);
      ctx.lineTo(hw * 1.05, -hh * 0.2);
      ctx.quadraticCurveTo(hw * 0.4, -hh * 0.62, 0, -hh * 0.44);
      ctx.quadraticCurveTo(-hw * 0.4, -hh * 0.62, -hw * 1.05, -hh * 0.2);
      ctx.closePath();
      ctx.fill();
      // むすびめ
      for (const s of [-1, 1]) {
        fillEll(ctx, s * hw * 0.96, -hh * 0.42, hw * 0.16, hh * 0.14, 0, shade(col, -0.45));
      }
      break;
    }
    case 8: { // ポニーテール
      cap(1.03, 1.04);
      ctx.lineTo(hw * 1.04, -hh * 0.26);
      ctx.quadraticCurveTo(hw * 0.1, -hh * 0.7, -hw * 0.5, -hh * 0.38);
      ctx.quadraticCurveTo(-hw * 0.85, -hh * 0.2, -hw * 1.04, -hh * 0.16);
      ctx.closePath();
      ctx.fill();
      fillEll(ctx, hw * 0.78, -hh * 0.62, hw * 0.16, hh * 0.13, 0, shade(col, -0.45));
      break;
    }
    case 9: { // おだんごあたま
      cap(1.0, 1.02);
      ctx.lineTo(hw * 1.02, -hh * 0.3);
      ctx.quadraticCurveTo(0, -hh * 0.62, -hw * 1.02, -hh * 0.3);
      ctx.closePath();
      ctx.fill();
      fillEll(ctx, 0, -hh * 1.3, hw * 0.4, hw * 0.35, 0, col);
      ctx.stroke();
      break;
    }
    case 10: { // アフロ
      fillEll(ctx, 0, -hh * 0.5, hw * 1.34, hh * 1.06, 0, col);
      // もこもこ
      for (let i = 0; i < 12; i++) {
        const a = Math.PI + (i / 11) * Math.PI;
        fillEll(ctx, Math.cos(a) * hw * 1.3, -hh * 0.5 + Math.sin(a) * hh * 1.0, hw * 0.3, hw * 0.28, 0, col);
      }
      break;
    }
    case 11: { // はねぐせ（やわらかスパイク）
      cap(1.0, 1.05);
      ctx.lineTo(hw * 1.05, -hh * 0.26);
      ctx.quadraticCurveTo(0, -hh * 0.56, -hw * 1.05, -hh * 0.26);
      ctx.closePath();
      ctx.fill();
      for (let i = 0; i < 5; i++) {
        const px = -hw * 0.8 + (i * hw * 1.6) / 4;
        ctx.beginPath();
        ctx.moveTo(px - 3.4, -hh * 1.0);
        ctx.quadraticCurveTo(px + 2.0, -hh * 1.32, px + 5.2, -hh * 1.12);
        ctx.quadraticCurveTo(px + 1.0, -hh * 1.04, px + 3.0, -hh * 0.92);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 12: { // とがりスパイク
      ctx.beginPath();
      ctx.moveTo(-hw * 1.06, hh * 0.0);
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        const px = -hw * 1.06 + t * hw * 2.12;
        const base = -hh * (0.95 - Math.pow(Math.abs(t - 0.5) * 2, 2) * 0.35);
        ctx.lineTo(px - hw * 0.06, base);
        ctx.lineTo(px + hw * 0.04, base - hh * 0.34);
        ctx.lineTo(px + hw * 0.14, base);
      }
      ctx.lineTo(hw * 1.06, hh * 0.0);
      ctx.quadraticCurveTo(0, -hh * 0.42, -hw * 1.06, hh * 0.0);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 13: { // モヒカン
      ctx.beginPath();
      ctx.moveTo(-hw * 0.24, -hh * 0.85);
      ctx.quadraticCurveTo(-hw * 0.2, -hh * 1.62, 0, -hh * 1.66);
      ctx.quadraticCurveTo(hw * 0.2, -hh * 1.62, hw * 0.24, -hh * 0.85);
      ctx.closePath();
      ctx.fill();
      // よこは かりあげ
      ctx.globalAlpha = 0.5;
      cap(0.9, 1.0);
      ctx.lineTo(hw * 1.0, -hh * 0.5);
      ctx.quadraticCurveTo(0, -hh * 0.3, -hw * 1.0, -hh * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      break;
    }
    case 14: { // ウルフ
      cap(1.02, 1.06);
      ctx.lineTo(hw * 1.06, -hh * 0.1);
      ctx.quadraticCurveTo(hw * 0.5, -hh * 0.58, hw * 0.08, -hh * 0.34);
      ctx.quadraticCurveTo(-hw * 0.4, -hh * 0.66, -hw * 1.06, -hh * 0.12);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 15: { // サイドテール
      cap(1.02, 1.05);
      ctx.lineTo(hw * 1.05, -hh * 0.18);
      ctx.quadraticCurveTo(hw * 0.2, -hh * 0.66, -hw * 0.6, -hh * 0.44);
      ctx.lineTo(-hw * 1.05, -hh * 0.3);
      ctx.closePath();
      ctx.fill();
      fillEll(ctx, -hw * 0.86, -hh * 0.5, hw * 0.15, hh * 0.13, 0, shade(col, -0.45));
      break;
    }
    case 16: { // おさげ（ぱっつん前がみ）
      cap(1.02, 1.06);
      ctx.lineTo(hw * 1.06, -hh * 0.02);
      ctx.lineTo(-hw * 1.06, -hh * 0.02);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 17: { // ぱっつん前がみ＋セミロング
      cap(1.04, 1.07);
      ctx.lineTo(hw * 1.07, hh * 0.06);
      ctx.lineTo(hw * 0.72, -hh * 0.1);
      ctx.lineTo(-hw * 0.72, -hh * 0.1);
      ctx.lineTo(-hw * 1.07, hh * 0.06);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 18: { // くるくるカール
      cap(1.02, 1.05);
      ctx.lineTo(hw * 1.05, -hh * 0.2);
      ctx.quadraticCurveTo(0, -hh * 0.56, -hw * 1.05, -hh * 0.2);
      ctx.closePath();
      ctx.fill();
      for (let i = 0; i < 7; i++) {
        const a = Math.PI + (i / 6) * Math.PI;
        fillEll(ctx, Math.cos(a) * hw * 0.98, -hh * 0.6 + Math.sin(a) * hh * 0.62, hw * 0.26, hw * 0.24, 0, col);
      }
      break;
    }
    case 19: { // オールバック
      cap(1.0, 1.04);
      ctx.lineTo(hw * 1.04, -hh * 0.44);
      ctx.quadraticCurveTo(0, -hh * 0.98, -hw * 1.04, -hh * 0.44);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = shade(col, -0.4);
      ctx.lineWidth = 0.9;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(i * hw * 0.32, -hh * 0.98);
        ctx.quadraticCurveTo(i * hw * 0.36, -hh * 1.2, i * hw * 0.28, -hh * 1.32);
        ctx.stroke();
      }
      break;
    }
    case 20: { // うすい（よこだけ のこったかみ）
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * hw * 1.05, hh * 0.06);
        ctx.quadraticCurveTo(s * hw * 1.14, -hh * 0.66, s * hw * 0.62, -hh * 0.82);
        ctx.quadraticCurveTo(s * hw * 0.86, -hh * 0.42, s * hw * 0.88, hh * 0.04);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 21: { // ヘルメットがた（まるくそろえた）
      cap(1.08, 1.12);
      ctx.lineTo(hw * 1.12, hh * 0.3);
      ctx.quadraticCurveTo(hw * 0.9, hh * 0.34, hw * 0.86, -hh * 0.04);
      ctx.quadraticCurveTo(0, -hh * 0.4, -hw * 0.86, -hh * 0.04);
      ctx.quadraticCurveTo(-hw * 0.9, hh * 0.34, -hw * 1.12, hh * 0.3);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 22: { // ハーフアップ＋リボン
      cap(1.03, 1.06);
      ctx.lineTo(hw * 1.06, -hh * 0.14);
      ctx.quadraticCurveTo(hw * 0.3, -hh * 0.62, -hw * 0.2, -hh * 0.5);
      ctx.quadraticCurveTo(-hw * 0.7, -hh * 0.4, -hw * 1.06, -hh * 0.14);
      ctx.closePath();
      ctx.fill();
      // リボン
      const rx = hw * 0.74;
      const ry = -hh * 0.92;
      ctx.fillStyle = '#e4697f';
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx - hw * 0.34, ry - hh * 0.18);
      ctx.lineTo(rx - hw * 0.34, ry + hh * 0.16);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx + hw * 0.34, ry - hh * 0.18);
      ctx.lineTo(rx + hw * 0.34, ry + hh * 0.16);
      ctx.closePath();
      ctx.fill();
      fillEll(ctx, rx, ry, hw * 0.1, hw * 0.1, 0, '#f393a5');
      break;
    }
    default: { // 23 ながいウェーブ＋わけめ
      cap(1.05, 1.08);
      ctx.bezierCurveTo(hw * 1.0, hh * 0.1, hw * 0.5, -hh * 0.5, hw * 0.05, -hh * 0.88);
      ctx.bezierCurveTo(-hw * 0.4, -hh * 0.5, -hw * 0.8, hh * 0.05, -hw * 1.08, hh * 0.2);
      ctx.closePath();
      ctx.fill();
      break;
    }
  }

  // つやを、ひとすじ。
  if (kind !== 20 && kind !== 13) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = hi;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(-hw * 0.5, -hh * 0.92);
    ctx.quadraticCurveTo(0, -hh * 1.14, hw * 0.5, -hh * 0.92);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
  // closeFringe は使わないが、形をそろえるための保険。
  void closeFringe;
}

// ------------------------------------------------- めがね・ひげ（extra）

function drawExtra(ctx, kind, g, eyeY, mouthY, hairCol) {
  if (!kind) return;
  const ex = g.hw * 0.44;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const bridge = (y, w) => {
    ctx.beginPath();
    ctx.moveTo(-w, y);
    ctx.quadraticCurveTo(0, y - 2.0, w, y);
    ctx.stroke();
  };
  const arms = (y, w) => {
    ctx.beginPath();
    ctx.moveTo(-ex - w, y);
    ctx.lineTo(-g.hw * 1.02, y - 1.6);
    ctx.moveTo(ex + w, y);
    ctx.lineTo(g.hw * 1.02, y - 1.6);
    ctx.stroke();
  };

  const beardCol = shade(hairCol, -0.12);

  switch (kind) {
    case 1: // まるメガネ
      ctx.strokeStyle = '#4a4038';
      ctx.lineWidth = 1.8;
      strokeEll(ctx, -ex, eyeY, 8.2, 8.2, 0, '#4a4038', 1.8);
      strokeEll(ctx, ex, eyeY, 8.2, 8.2, 0, '#4a4038', 1.8);
      bridge(eyeY, ex - 8.2);
      arms(eyeY, 8.2);
      break;
    case 2: // しかくメガネ
      ctx.strokeStyle = '#3c3630';
      ctx.lineWidth = 2.0;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.rect(s * ex - 9.0, eyeY - 6.6, 18.0, 13.2);
        ctx.stroke();
      }
      bridge(eyeY - 1.0, ex - 9.0);
      arms(eyeY - 2.0, 9.0);
      break;
    case 3: // ふちなしメガネ
      ctx.strokeStyle = alpha('#7d8a93', 0.85);
      ctx.lineWidth = 1.2;
      for (const s of [-1, 1]) {
        ell(ctx, s * ex, eyeY, 8.4, 6.4, 0);
        ctx.fillStyle = 'rgba(210,235,245,0.22)';
        ctx.fill();
        ctx.stroke();
      }
      bridge(eyeY - 1.0, ex - 8.4);
      arms(eyeY - 1.4, 8.4);
      break;
    case 4: // サングラス
      ctx.fillStyle = 'rgba(38,36,44,0.88)';
      ctx.strokeStyle = '#26242c';
      ctx.lineWidth = 2.0;
      for (const s of [-1, 1]) {
        ell(ctx, s * ex, eyeY, 9.0, 6.8, 0);
        ctx.fill();
        ctx.stroke();
      }
      ctx.strokeStyle = '#26242c';
      bridge(eyeY - 2.0, ex - 9.0);
      arms(eyeY - 2.4, 9.0);
      // 光のはんしゃ
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 1.6;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * ex - 4.4, eyeY + 2.4);
        ctx.lineTo(s * ex - 1.2, eyeY - 3.0);
        ctx.stroke();
      }
      break;
    case 5: // ほそいメガネ
      ctx.strokeStyle = '#5a5248';
      ctx.lineWidth = 1.3;
      for (const s of [-1, 1]) {
        ell(ctx, s * ex, eyeY, 8.6, 4.4, 0);
        ctx.stroke();
      }
      bridge(eyeY - 0.6, ex - 8.6);
      arms(eyeY - 1.0, 8.6);
      break;
    case 6: // くちひげ
      ctx.fillStyle = beardCol;
      ctx.beginPath();
      ctx.moveTo(0, mouthY - 5.4);
      ctx.quadraticCurveTo(-4.0, mouthY - 8.6, -9.4, mouthY - 6.0);
      ctx.quadraticCurveTo(-4.6, mouthY - 3.0, 0, mouthY - 3.4);
      ctx.quadraticCurveTo(4.6, mouthY - 3.0, 9.4, mouthY - 6.0);
      ctx.quadraticCurveTo(4.0, mouthY - 8.6, 0, mouthY - 5.4);
      ctx.fill();
      break;
    case 7: // あごひげ
      ctx.fillStyle = beardCol;
      ctx.beginPath();
      ctx.moveTo(-5.2, mouthY + 5.0);
      ctx.quadraticCurveTo(0, mouthY + 4.0, 5.2, mouthY + 5.0);
      ctx.quadraticCurveTo(4.2, g.hh * 1.02, 0, g.hh * 1.06);
      ctx.quadraticCurveTo(-4.2, g.hh * 1.02, -5.2, mouthY + 5.0);
      ctx.fill();
      break;
    case 8: { // もじゃもじゃ ほおひげ
      ctx.fillStyle = beardCol;
      ctx.beginPath();
      ctx.moveTo(-g.hw * 0.96, g.hh * 0.06);
      ctx.quadraticCurveTo(-g.hw * 0.9, g.hh * 1.06, 0, g.hh * 1.12);
      ctx.quadraticCurveTo(g.hw * 0.9, g.hh * 1.06, g.hw * 0.96, g.hh * 0.06);
      ctx.quadraticCurveTo(g.hw * 0.6, g.hh * 0.5, g.hw * 0.4, g.hh * 0.34);
      ctx.quadraticCurveTo(0, g.hh * 0.62, -g.hw * 0.4, g.hh * 0.34);
      ctx.quadraticCurveTo(-g.hw * 0.6, g.hh * 0.5, -g.hw * 0.96, g.hh * 0.06);
      ctx.fill();
      break;
    }
    default: { // 9 メガネ＋くちひげ
      ctx.strokeStyle = '#4a4038';
      ctx.lineWidth = 1.7;
      for (const s of [-1, 1]) {
        ell(ctx, s * ex, eyeY, 8.0, 6.2, 0);
        ctx.stroke();
      }
      bridge(eyeY - 1.0, ex - 8.0);
      arms(eyeY - 1.4, 8.0);
      ctx.fillStyle = beardCol;
      ctx.beginPath();
      ctx.moveTo(0, mouthY - 5.0);
      ctx.quadraticCurveTo(-5.0, mouthY - 9.0, -10.0, mouthY - 5.2);
      ctx.quadraticCurveTo(-5.0, mouthY - 2.6, 0, mouthY - 3.0);
      ctx.quadraticCurveTo(5.0, mouthY - 2.6, 10.0, mouthY - 5.2);
      ctx.quadraticCurveTo(5.0, mouthY - 9.0, 0, mouthY - 5.0);
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}

// ------------------------------------------------------------------ からだ

const DEFAULT_CLOTHES = '#7fa8d8';

function drawBody(ctx, g, skin, clothesColor, t) {
  const col = clothesColor || DEFAULT_CLOTHES;
  const neckY = g.hh * 0.9;
  const shoulderY = g.hh + 16;
  // こきゅうで すこしだけ ふくらむ
  const breath = 1 + Math.sin((t || 0) / 900) * 0.02;

  ctx.save();
  // くび
  ctx.fillStyle = shade(skin, -0.1);
  ctx.beginPath();
  ctx.moveTo(-7.4, neckY - 2);
  ctx.lineTo(-6.4, shoulderY);
  ctx.lineTo(6.4, shoulderY);
  ctx.lineTo(7.4, neckY - 2);
  ctx.closePath();
  ctx.fill();

  // からだ
  ctx.save();
  ctx.translate(0, shoulderY);
  ctx.scale(breath, 1);
  ctx.beginPath();
  ctx.moveTo(-10, -2);
  ctx.bezierCurveTo(-26, 2, -32, 10, -33, 30);
  ctx.lineTo(-33, 52);
  ctx.lineTo(33, 52);
  ctx.lineTo(33, 30);
  ctx.bezierCurveTo(32, 10, 26, 2, 10, -2);
  ctx.closePath();
  ctx.fillStyle = col;
  ctx.fill();
  ctx.strokeStyle = shade(col, -0.35);
  ctx.lineWidth = 1.2;
  ctx.stroke();
  // えり
  ctx.beginPath();
  ctx.moveTo(-9, -1.6);
  ctx.quadraticCurveTo(0, 8, 9, -1.6);
  ctx.strokeStyle = shade(col, -0.4);
  ctx.lineWidth = 1.6;
  ctx.stroke();
  // うで
  ctx.fillStyle = shade(col, -0.08);
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * 28, 4);
    ctx.quadraticCurveTo(s * 40, 20, s * 36, 40);
    ctx.quadraticCurveTo(s * 30, 42, s * 26, 30);
    ctx.closePath();
    ctx.fill();
    fillEll(ctx, s * 35, 43, 5.4, 5.4, 0, shade(skin, -0.05));
  }
  ctx.restore();
  ctx.restore();
}

// ------------------------------------------------------------------ 本体

/**
 * かおをえがく。
 * opts: size, cx, cy, body, mood, talking, blink, t, clothesColor, flip
 */
export function drawFace(ctx, face, opts = {}) {
  if (!ctx) return;
  const canvas = ctx.canvas || {};
  const cw = canvas.width || opts.size || 100;
  const ch = canvas.height || opts.size || 100;
  const size = opts.size || cw || 100;
  const cx = opts.cx == null ? cw / 2 : opts.cx;
  const cy = opts.cy == null ? ch / 2 : opts.cy;
  const f = normalize(face);
  const t = opts.t || 0;
  const mood = clamp(Math.floor(opts.mood || 0), 0, 2);
  const withBody = !!opts.body;

  ctx.save();
  try {
    ctx.translate(cx, cy);
    const s = size / 100;
    ctx.scale(opts.flip ? -s : s, s);
    if (typeof ctx.lineJoin !== 'undefined') ctx.lineJoin = 'round';
    if (typeof ctx.lineCap !== 'undefined') ctx.lineCap = 'round';

    // からだを出すときは、かおを上によせる。
    if (withBody) ctx.translate(0, -18);
    // ふんわり ゆれる
    const sway = Math.sin(t / 1100) * 1.2;
    const bob = Math.sin(t / 820) * 0.9;

    const skin = SKIN_COLORS[f.skin] || SKIN_COLORS[0];
    const hairCol = HAIR_COLORS[f.hairColor] || HAIR_COLORS[0];
    const eyeCol = EYE_COLORS[f.eyeColor] || EYE_COLORS[0];
    const g = SHAPES[f.faceShape] || SHAPES[0];

    if (withBody) drawBody(ctx, g, skin, opts.clothesColor, t);

    ctx.save();
    ctx.translate(sway, bob);
    if (t) ctx.rotate(Math.sin(t / 1400) * 0.02);

    // うしろがみ
    drawHairBack(ctx, f.hair, g, hairCol);

    // みみ
    for (const sdir of [-1, 1]) {
      fillEll(ctx, sdir * g.hw * 0.99, g.hh * 0.04, 4.4, 5.8, 0, shade(skin, -0.05));
      ell(ctx, sdir * g.hw * 0.99, g.hh * 0.04, 4.4, 5.8, 0);
      ctx.strokeStyle = alpha(LINE, 0.55);
      ctx.lineWidth = 1.0;
      ctx.stroke();
      arcLine(ctx, sdir * g.hw * 0.99, g.hh * 0.04 - 2.4, sdir * g.hw * 0.99, g.hh * 0.04 + 2.4,
        -sdir * 2.2, alpha(LINE, 0.4), 0.9);
    }

    // かおの ちいさな かげ（りんかくの中）
    facePath(ctx, g);
    ctx.fillStyle = skin;
    ctx.fill();
    ctx.save();
    facePath(ctx, g);
    ctx.clip();
    ctx.globalAlpha = 0.35;
    fillEll(ctx, 0, g.hh * 1.1, g.hw * 1.2, g.hh * 0.6, 0, shade(skin, -0.18));
    ctx.globalAlpha = 1;
    ctx.restore();
    facePath(ctx, g);
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // ほお
    drawBlush(ctx, f.blush, g, skin);

    // め
    const eyeX = g.hw * 0.44;
    const eyeY = -g.hh * 0.06;
    drawEye(ctx, f.eye, -eyeX, eyeY, -1, eyeCol, !!opts.blink);
    drawEye(ctx, f.eye, eyeX, eyeY, 1, eyeCol, !!opts.blink);

    // まゆげ
    const browY = eyeY - 11.5;
    const browCol = shade(hairCol, -0.18);
    drawBrow(ctx, f.brow, -eyeX, browY, -1, browCol, mood);
    drawBrow(ctx, f.brow, eyeX, browY, 1, browCol, mood);

    // はな
    drawNose(ctx, f.nose, 0, g.hh * 0.16, skin);

    // くち
    const mouthY = g.hh * 0.5;
    drawMouth(ctx, f.mouth, 0, mouthY, mood, !!opts.talking);

    // まえがみ
    drawHairFront(ctx, f.hair, g, hairCol);

    // めがね・ひげ
    drawExtra(ctx, f.extra, g, eyeY, mouthY, hairCol);

    ctx.restore();
  } finally {
    ctx.restore();
  }
}

/** かおだけの PNG dataURL。サムネイルに使う。 */
export function faceToDataURL(face, size = 96) {
  let cv = null;
  if (typeof document !== 'undefined' && document.createElement) {
    cv = document.createElement('canvas');
    cv.width = size;
    cv.height = size;
  } else {
    return '';
  }
  const ctx = cv.getContext && cv.getContext('2d');
  if (!ctx) return '';
  ctx.clearRect(0, 0, size, size);
  drawFace(ctx, face, { size: size * 0.92, cx: size / 2, cy: size / 2 + size * 0.02 });
  try {
    return cv.toDataURL('image/png');
  } catch (e) {
    return '';
  }
}
