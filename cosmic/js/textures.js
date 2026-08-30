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

/* 星雲つき星空背景（複数レイヤー、オフスクリーン事前生成） */
function generateStarfieldLayer(w, h, density, seed, nebula) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  const rng = mulberry32(seed);

  if (nebula) {
    const nebColors = ['#3a2a6d', '#1a3a6d', '#5a2a5d', '#204a5a'];
    for (let i = 0; i < 5; i++) {
      const cx = rng() * w, cy = rng() * h;
      const r = (0.25 + rng() * 0.35) * Math.max(w, h);
      const col = hexToRgb(nebColors[i % nebColors.length]);
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, rgbStr(col, 0.22));
      grad.addColorStop(0.5, rgbStr(col, 0.10));
      grad.addColorStop(1, rgbStr(col, 0));
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    }
  }

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
