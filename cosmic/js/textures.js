/* ============================================================
   COSMIC EATER - textures.js
   オフスクリーンでの天体テクスチャ・背景生成
   ============================================================ */
'use strict';

/* シード付き擬似乱数 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* 単純な値ノイズ（2Dグリッド補間） */
function makeValueNoise(rng, gridSize) {
  const g = [];
  for (let i = 0; i <= gridSize; i++) {
    g.push(new Array(gridSize + 1).fill(0).map(() => rng()));
  }
  function smooth(t) { return t * t * (3 - 2 * t); }
  return function (x, y) {
    // x, y は 0..1
    const gx = x * gridSize, gy = y * gridSize;
    const x0 = Math.floor(gx) % gridSize, y0 = Math.floor(gy) % gridSize;
    const x1 = (x0 + 1) % gridSize, y1 = (y0 + 1) % gridSize;
    const fx = smooth(gx - Math.floor(gx)), fy = smooth(gy - Math.floor(gy));
    const v00 = g[y0][x0], v10 = g[y0][x1], v01 = g[y1][x0], v11 = g[y1][x1];
    const a = v00 + (v10 - v00) * fx;
    const b = v01 + (v11 - v01) * fx;
    return a + (b - a) * fy;
  };
}

function fbm(noiseFns, x, y) {
  let v = 0, amp = 0.5, freq = 1, sum = 0;
  for (const n of noiseFns) {
    v += n((x * freq) % 1, (y * freq) % 1) * amp;
    sum += amp;
    amp *= 0.5; freq *= 2;
  }
  return v / sum;
}

function hexToRgb(hex) {
  const m = hex.replace('#', '');
  const n = parseInt(m.length === 3 ? m.split('').map(c => c + c).join('') : m, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function lerp(a, b, t) { return a + (b - a) * t; }
function mixColor(c1, c2, t) {
  return {
    r: lerp(c1.r, c2.r, t), g: lerp(c1.g, c2.g, t), b: lerp(c1.b, c2.b, t),
  };
}
function rgbStr(c, a) { return `rgba(${c.r | 0},${c.g | 0},${c.b | 0},${a === undefined ? 1 : a})`; }

const TEX_SIZE = 128;

/* 天体テクスチャを 0..1 正規化キャンバスに焼き込む。
 * lightAngle は固定光源方向（ラジアン）。球面陰影も同時に焼く。 */
function generateBodyTexture(kind, palette, seed) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = TEX_SIZE;
  const ctx = cv.getContext('2d');
  const rng = mulberry32(seed);
  const noises = [makeValueNoise(rng, 6), makeValueNoise(rng, 12), makeValueNoise(rng, 24)];
  const cx = TEX_SIZE / 2, cy = TEX_SIZE / 2, R = TEX_SIZE / 2 - 1;
  const img = ctx.createImageData(TEX_SIZE, TEX_SIZE);
  const lightX = -0.55, lightY = -0.6; // 左上から

  const base = hexToRgb(palette.base);
  const dark = hexToRgb(palette.dark || palette.base);
  const light = hexToRgb(palette.light || '#ffffff');

  for (let py = 0; py < TEX_SIZE; py++) {
    for (let px = 0; px < TEX_SIZE; px++) {
      const nx = (px - cx) / R, ny = (py - cy) / R;
      const d2 = nx * nx + ny * ny;
      const idx = (py * TEX_SIZE + px) * 4;
      if (d2 > 1) { img.data[idx + 3] = 0; continue; }
      const nz = Math.sqrt(Math.max(0, 1 - d2));
      // 球面ライティング (半球ランバート近似)
      let ndotl = nx * lightX + ny * lightY + nz * Math.sqrt(Math.max(0, 1 - lightX * lightX - lightY * lightY));
      ndotl = Math.max(0, ndotl);
      const rim = Math.pow(1 - nz, 2.2); // 縁が暗くなる

      // テクスチャノイズ（球面座標にマップして継ぎ目を軽減）
      const u = 0.5 + Math.atan2(ny, nx) / (Math.PI * 2);
      const v = 0.5 + Math.asin(Math.max(-1, Math.min(1, Math.sqrt(d2)))) / Math.PI;
      let n = fbm(noises, u, v * 2);

      let col;
      if (kind === 'gasgiant' || kind === 'browndwarf' || kind === 'giant') {
        // 縞模様
        const band = Math.sin((ny * 7 + n * 2.2)) * 0.5 + 0.5;
        col = mixColor(dark, base, band * 0.7 + n * 0.3);
      } else if (kind === 'star' || kind === 'neutron') {
        col = mixColor(base, light, Math.pow(n, 1.4));
      } else {
        // 岩石系: クレーター風の凹凸
        const crater = Math.pow(n, 1.6);
        col = mixColor(dark, base, crater);
      }
      // シェーディング適用
      let shadeMin = (kind === 'star' || kind === 'neutron') ? 0.55 : 0.12;
      const shade = shadeMin + (1 - shadeMin) * ndotl;
      let r = col.r * shade, g = col.g * shade, b = col.b * shade;
      // ハイライト（恒星系はより明るく発光）
      if (kind === 'star' || kind === 'neutron') {
        r = r + (255 - r) * Math.pow(ndotl, 3) * 0.5;
        g = g + (255 - g) * Math.pow(ndotl, 3) * 0.5;
        b = b + (255 - b) * Math.pow(ndotl, 3) * 0.4;
      }
      // 縁の暗化
      r *= (1 - rim * 0.55); g *= (1 - rim * 0.55); b *= (1 - rim * 0.55);

      img.data[idx] = Math.min(255, r);
      img.data[idx + 1] = Math.min(255, g);
      img.data[idx + 2] = Math.min(255, b);
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

/* テクスチャキャッシュ: kind+パレット+シードバケットごとに複数バリエーションを使い回す */
const _texCache = new Map();
function getBodyTexture(kind, palette, seedBucket) {
  const key = kind + '|' + palette.base + '|' + seedBucket;
  let t = _texCache.get(key);
  if (!t) {
    t = generateBodyTexture(kind, palette, seedBucket * 7919 + 13);
    _texCache.set(key, t);
  }
  return t;
}

/* ============================================================
 * 回転する球体描画（equirectangular テクスチャ + スライス球面投影）
 * ------------------------------------------------------------
 * 1) generateEquirectTexture: 横方向にシームレスな正距円筒図法テクスチャを
 *    オフスクリーンで1回だけ生成（種別・パレット・シードごとにキャッシュ）。
 * 2) renderGlobeFrame: そのテクスチャを、自転位相ごとに縦スライス単位で
 *    球面射影（端に行くほど圧縮）し、ライティング用マスクと大気の縁光を
 *    合成した「1フレーム分の球体画像」を生成してキャッシュする
 *    （フレーム数を離散化することで、大きい天体でも滑らかな自転に見えつつ
 *    毎フレームの再計算コストを避け、60fps を維持する）。
 * ============================================================ */

const EQUI_W = 200, EQUI_H = 100;
const GLOBE_FRAMES = 48; // 自転を離散化するフレーム数（1周 = 48フレーム）

function generateEquirectTexture(kind, palette, seed) {
  const cv = document.createElement('canvas');
  cv.width = EQUI_W; cv.height = EQUI_H;
  const ctx = cv.getContext('2d');
  const rng = mulberry32(seed);
  const noises = [makeValueNoise(rng, 6), makeValueNoise(rng, 12), makeValueNoise(rng, 24)];
  const base = hexToRgb(palette.base);
  const dark = hexToRgb(palette.dark || palette.base);
  const light = hexToRgb(palette.light || '#ffffff');
  const img = ctx.createImageData(EQUI_W, EQUI_H);
  for (let py = 0; py < EQUI_H; py++) {
    const v = py / EQUI_H; // 0..1 緯度
    for (let px = 0; px < EQUI_W; px++) {
      const u = px / EQUI_W; // 0..1 経度（周期的＝シームレス）
      const idx = (py * EQUI_W + px) * 4;
      const n = fbm(noises, u, v * 2);
      let col;
      if (kind === 'gasgiant' || kind === 'browndwarf' || kind === 'giant') {
        // 緯度方向の縞模様（自転で経度がずれるため流れて見える）
        const band = Math.sin(v * 22 + n * 3.4) * 0.5 + 0.5;
        col = mixColor(dark, base, band * 0.7 + n * 0.3);
      } else if (kind === 'star' || kind === 'neutron') {
        col = mixColor(base, light, Math.pow(n, 1.3));
      } else {
        const crater = Math.pow(n, 1.6);
        col = mixColor(dark, base, crater);
      }
      img.data[idx] = col.r; img.data[idx + 1] = col.g; img.data[idx + 2] = col.b; img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

const _equiCache = new Map();
function getEquirectTexture(kind, palette, seedBucket) {
  const key = kind + '|' + palette.base + '|' + seedBucket;
  let t = _equiCache.get(key);
  if (!t) { t = generateEquirectTexture(kind, palette, seedBucket * 7919 + 31); _equiCache.set(key, t); }
  return t;
}

/* ライティング＋縁の減光（limb darkening）マスク。サイズと環境光の下限だけに依存するため
 * 天体の種類・パレット・自転位相に関わらず使い回せる。 */
const _shadeMaskCache = new Map();
function getShadingMask(sizePx, ambientFloor) {
  const key = sizePx + '|' + ambientFloor;
  let m = _shadeMaskCache.get(key);
  if (m) return m;
  const cv = document.createElement('canvas');
  cv.width = cv.height = sizePx;
  const ctx = cv.getContext('2d');
  const R = sizePx / 2;
  const img = ctx.createImageData(sizePx, sizePx);
  const lightX = -0.55, lightY = -0.6;
  const lightZ = Math.sqrt(Math.max(0, 1 - lightX * lightX - lightY * lightY));
  for (let py = 0; py < sizePx; py++) {
    for (let px = 0; px < sizePx; px++) {
      const nx = (px + 0.5 - R) / R, ny = (py + 0.5 - R) / R;
      const idx = (py * sizePx + px) * 4;
      const d2 = nx * nx + ny * ny;
      if (d2 > 1) { img.data[idx + 3] = 0; continue; }
      const nz = Math.sqrt(Math.max(0, 1 - d2));
      let ndotl = nx * lightX + ny * lightY + nz * lightZ;
      ndotl = Math.max(0, ndotl);
      const rim = Math.pow(1 - nz, 2.2); // 縁の減光
      const shade = ambientFloor + (1 - ambientFloor) * ndotl;
      const factor = Math.max(0, shade * (1 - rim * 0.6));
      const v = Math.max(0, Math.min(255, factor * 255));
      img.data[idx] = v; img.data[idx + 1] = v; img.data[idx + 2] = v; img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  _shadeMaskCache.set(key, cv);
  return cv;
}

/* 薄い大気の縁光（惑星以降のみ使用） */
const _atmoCache = new Map();
function getAtmosphereOverlay(sizePx, colorHex) {
  const key = sizePx + '|' + colorHex;
  let m = _atmoCache.get(key);
  if (m) return m;
  const cv = document.createElement('canvas');
  cv.width = cv.height = sizePx;
  const ctx = cv.getContext('2d');
  const R = sizePx / 2;
  const c = hexToRgb(colorHex);
  const grad = ctx.createRadialGradient(R, R, R * 0.84, R, R, R * 1.06);
  grad.addColorStop(0, rgbStr(c, 0));
  grad.addColorStop(0.75, rgbStr(c, 0.30));
  grad.addColorStop(1, rgbStr(c, 0));
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(R, R, R * 1.06, 0, Math.PI * 2); ctx.fill();
  _atmoCache.set(key, cv);
  return cv;
}

/* 自転位相(0..GLOBE_FRAMES-1)ごとの球体フレームをキャッシュしながら生成する。
 * 大きい・近い天体はこの経路（フル品質）で描画し、
 * 小さい・遠い天体は呼び出し側で単純な回転スプライトに近似してコストを抑える。 */
const _globeFrameCache = new Map();
function renderGlobeFrame(kind, palette, seedBucket, sizePx, frameIdx, hasAtmosphere) {
  const key = kind + '|' + palette.base + '|' + seedBucket + '|' + sizePx + '|' + frameIdx + '|' + (hasAtmosphere ? 1 : 0);
  let cv = _globeFrameCache.get(key);
  if (cv) return cv;

  const equi = getEquirectTexture(kind, palette, seedBucket);
  const R = sizePx / 2;
  cv = document.createElement('canvas');
  cv.width = cv.height = sizePx;
  const ctx = cv.getContext('2d');
  const rotation = (frameIdx / GLOBE_FRAMES) * Math.PI * 2;
  const sliceW = Math.max(1, Math.min(4, Math.round(sizePx / 40)));

  for (let x = -R; x < R; x += sliceW) {
    const s = Math.max(-0.999, Math.min(0.999, x / R));
    const nz = Math.sqrt(Math.max(0, 1 - s * s));
    const longitude = rotation + Math.asin(s); // 球面マッピング：端ほど経度変化が急＝テクスチャが圧縮される
    let u = (longitude / (Math.PI * 2)) % 1; if (u < 0) u += 1;
    const srcX = Math.min(equi.width - 1, Math.floor(u * equi.width));
    const visH = Math.max(1, 2 * R * nz); // 円の輪郭に沿って縦幅を絞る
    ctx.drawImage(equi, srcX, 0, 1, equi.height, R + x, R - visH / 2, sliceW, visH);
  }

  // ライティング＋縁の減光を乗算合成
  const ambientFloor = (kind === 'star' || kind === 'neutron') ? 0.55 : 0.14;
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(getShadingMask(sizePx, ambientFloor), 0, 0);
  ctx.globalCompositeOperation = 'source-over';

  // 薄い大気の縁光（惑星以降）
  if (hasAtmosphere) {
    ctx.drawImage(getAtmosphereOverlay(sizePx, palette.light || '#bfe3ff'), 0, 0);
  }

  _globeFrameCache.set(key, cv);
  if (_globeFrameCache.size > 480) {
    _globeFrameCache.delete(_globeFrameCache.keys().next().value);
  }
  return cv;
}

/* リング（環）テクスチャ */
function generateRingTexture(seed) {
  const w = 256, h = 32;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  const rng = mulberry32(seed);
  for (let x = 0; x < w; x++) {
    const t = x / w;
    const a = 0.15 + 0.55 * (Math.sin(t * 40 + rng() * 0) * 0.5 + 0.5) * (rng() > 0.15 ? 1 : 0.3);
    ctx.fillStyle = `rgba(220,205,180,${a.toFixed(3)})`;
    ctx.fillRect(x, 0, 1, h);
  }
  return cv;
}

/* 星空背景レイヤー（星のみ、オフスクリーン事前生成） */
function generateStarfieldLayer(w, h, density, seed) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  const rng = mulberry32(seed);

  const n = Math.floor(w * h * density / 10000);
  for (let i = 0; i < n; i++) {
    const x = rng() * w, y = rng() * h;
    const r = rng() * rng() * 1.6 + 0.25;
    const b = 0.35 + rng() * 0.65;
    ctx.fillStyle = `rgba(255,255,255,${b.toFixed(2)})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    if (r > 1.3) {
      ctx.strokeStyle = `rgba(255,255,255,${(b * 0.25).toFixed(2)})`;
      ctx.beginPath();
      ctx.moveTo(x - r * 3, y); ctx.lineTo(x + r * 3, y);
      ctx.moveTo(x, y - r * 3); ctx.lineTo(x, y + r * 3);
      ctx.stroke();
    }
  }
  return cv;
}

/* ゆっくりドリフト／明滅する星雲レイヤー（星空とは別に、独立した速度で流す） */
function generateNebulaLayer(w, h, seed) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  const rng = mulberry32(seed);
  const nebColors = ['#3a2a6d', '#1a3a6d', '#5a2a5d', '#204a5a', '#3a1a4a'];
  for (let i = 0; i < 6; i++) {
    const cx = rng() * w, cy = rng() * h;
    const r = (0.22 + rng() * 0.32) * Math.max(w, h);
    const col = hexToRgb(nebColors[i % nebColors.length]);
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, rgbStr(col, 0.38));
    grad.addColorStop(0.5, rgbStr(col, 0.18));
    grad.addColorStop(1, rgbStr(col, 0));
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  }
  return cv;
}

/* 星の瞬き用: レイヤー内に散らす小さな星の位置と個別の明滅位相をあらかじめ決めておく */
function generateTwinkleStars(size, count, seed) {
  const rng = mulberry32(seed);
  const stars = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      x: rng() * size, y: rng() * size,
      r: 0.6 + rng() * 1.3,
      phase: rng() * Math.PI * 2,
      speed: 1.2 + rng() * 2.2,
    });
  }
  return stars;
}

/* 降着円盤テクスチャ（ブラックホール用、回転させて使う） */
function generateAccretionDisk(seed) {
  const s = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = cv.getContext('2d');
  const rng = mulberry32(seed);
  const cx = s / 2, cy = s / 2;
  for (let i = 0; i < 900; i++) {
    const ang = rng() * Math.PI * 2;
    const rad = (0.28 + Math.pow(rng(), 0.6) * 0.7) * (s / 2);
    const x = cx + Math.cos(ang) * rad;
    const y = cy + Math.sin(ang) * rad * 0.42;
    const heat = 1 - (rad / (s / 2));
    const col = mixColor(hexToRgb('#5b2bff'), hexToRgb('#ffe6a8'), Math.pow(heat, 1.3));
    ctx.fillStyle = rgbStr(col, 0.5 + heat * 0.5);
    const size = 1 + rng() * 2.4;
    ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
  }
  return cv;
}
