/* ============================================================
   COSMIC EATER - textures.js
   天体テクスチャ生成（3Dレンダラ向け: 正距円筒図法テクスチャ＋補助テクスチャ）
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

/* ============================================================
 * 単一光源（遠方の恒星）
 * ------------------------------------------------------------
 * ワールド全体で共有する唯一の光源方向。3Dレンダラでは THREE.DirectionalLight の
 * 向きとして直接使う（全天体・パーティクルが同じ方向から照らされる＝写実性の核）。
 * 完全な固定ではなく、超低速に角度が変化する（現実の見た目にはほぼ気付かない速度）。
 * ============================================================ */
const WORLD_LIGHT = {
  baseAngle: -2.05, // ラジアン。左上やや上寄りから
  driftSpeed: 0.00004, // rad/sec（超低速。1時間のプレイでも約8度程度しか動かない）
  angle: -2.05,
  x: 0, y: 0,
};
(function initLight() { WORLD_LIGHT.x = Math.cos(WORLD_LIGHT.angle); WORLD_LIGHT.y = Math.sin(WORLD_LIGHT.angle); })();
function updateWorldLight(t) {
  WORLD_LIGHT.angle = WORLD_LIGHT.baseAngle + t * WORLD_LIGHT.driftSpeed;
  WORLD_LIGHT.x = Math.cos(WORLD_LIGHT.angle);
  WORLD_LIGHT.y = Math.sin(WORLD_LIGHT.angle);
}

/* ============================================================
 * クレーター生成（岩石質の天体: 岩石片/小惑星/準惑星/彗星核）
 * ------------------------------------------------------------
 * 大小さまざまな半径のクレーターを配置し、それぞれ「縁が明るいリム」「底に向かって
 * 暗くなるお椀」を持たせる。u（経度）は周期的（トーラス状）に距離を測り、
 * 正距円筒図法テクスチャの左右端で継ぎ目が出ないようにする。 */
const _craterFieldCache = new Map();
function getCraterField(seed) {
  let c = _craterFieldCache.get(seed);
  if (c) return c;
  const rng = mulberry32((seed * 65599 + 101) >>> 0);
  const count = 10 + ((rng() * 8) | 0);
  const craters = [];
  for (let i = 0; i < count; i++) {
    craters.push({
      u: rng(), v: rng(),
      r: 0.045 + Math.pow(rng(), 2.1) * 0.30, // 半径は小さいものに偏り、稀に大きいものも混じる
      depth: 0.22 + rng() * 0.32,
    });
  }
  _craterFieldCache.set(seed, craters);
  return craters;
}
function craterToroidalDist(u, v, cu, cv, wrapU) {
  let du = u - cu;
  if (wrapU) du = ((du + 0.5) % 1 + 1) % 1 - 0.5;
  const dv = v - cv;
  return Math.hypot(du, dv);
}
/* 戻り値は明るさへの加算的な補正量（-1..1程度）。0=補正なし、正=リムで明るい、負=お椀の底で暗い。 */
function craterShadeAt(u, v, craters, wrapU) {
  let s = 0;
  for (let i = 0; i < craters.length; i++) {
    const c = craters[i];
    const d = craterToroidalDist(u, v, c.u, c.v, wrapU);
    const nd = d / c.r;
    if (nd >= 1) continue;
    const rim = Math.exp(-Math.pow((nd - 0.8) / 0.14, 2)) * 0.5;
    const bowl = -(1 - nd) * c.depth;
    s += rim + bowl;
  }
  return Math.max(-0.72, Math.min(0.55, s));
}
/* このkindにクレーター表現を使うかどうか（岩石質の不整形/小型天体のみ）。
 * comet は base/light がもともと非常に明るい氷色（ほぼ白）のパレットのため、
 * このクレーター表現を使うと明るいリム部分が白飛びしてしまうので対象から外す。 */
function isCrateredKind(kind) {
  return kind === 'rock' || kind === 'asteroid' || kind === 'dwarf';
}

/* ============================================================
 * 正距円筒図法（equirectangular）テクスチャ生成
 * ------------------------------------------------------------
 * u=経度(0..1)・v=緯度(0..1) で、横方向にシームレス（周期的）。
 * THREE.SphereGeometry の既定UVはまさにこの正距円筒図法なので、生成した
 * canvas をそのまま THREE.CanvasTexture として貼り付けるだけで球体になる。
 * ============================================================ */
const EQUI_W = 256, EQUI_H = 128;

function generateEquirectTexture(kind, palette, seed, w, h) {
  w = w || EQUI_W; h = h || EQUI_H;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  const rng = mulberry32(seed);
  const noises = [makeValueNoise(rng, 6), makeValueNoise(rng, 12), makeValueNoise(rng, 24), makeValueNoise(rng, 48)];
  const base = hexToRgb(palette.base);
  const dark = hexToRgb(palette.dark || palette.base);
  const light = hexToRgb(palette.light || '#ffffff');
  const crRim = mixColor(base, { r: 255, g: 255, b: 255 }, 0.32);
  const img = ctx.createImageData(w, h);
  for (let py = 0; py < h; py++) {
    const v = py / h; // 0..1 緯度
    for (let px = 0; px < w; px++) {
      const u = px / w; // 0..1 経度（周期的＝シームレス）
      const idx = (py * w + px) * 4;
      const n = fbm(noises, u, v * 2);
      let col;
      if (kind === 'gasgiant' || kind === 'browndwarf' || kind === 'giant') {
        // 緯度方向の縞模様（自転で経度がずれるため流れて見える）
        const band = Math.sin(v * 22 + n * 3.4) * 0.5 + 0.5;
        col = mixColor(dark, base, band * 0.7 + n * 0.3);
      } else if (kind === 'star' || kind === 'neutron') {
        col = mixColor(base, light, Math.pow(n, 1.3));
      } else if (isCrateredKind(kind)) {
        const craters = getCraterField(seed);
        const cs = craterShadeAt(u, v, craters, true);
        col = mixColor(dark, base, 0.3 + n * 0.55);
        if (cs > 0) col = mixColor(col, crRim, Math.min(1, cs) * 0.7);
        else if (cs < 0) col = mixColor(col, dark, Math.min(1, -cs));
      } else {
        const crater = Math.pow(n, 1.6);
        col = mixColor(dark, base, crater);
      }
      img.data[idx] = Math.max(0, Math.min(255, col.r)); img.data[idx + 1] = Math.max(0, Math.min(255, col.g)); img.data[idx + 2] = Math.max(0, Math.min(255, col.b)); img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

const _equiCache = new Map();
function getEquirectTexture(kind, palette, seedBucket, w, h) {
  w = w || EQUI_W; h = h || EQUI_H;
  const key = kind + '|' + palette.base + '|' + seedBucket + '|' + w + 'x' + h;
  let t = _equiCache.get(key);
  if (!t) {
    t = generateEquirectTexture(kind, palette, seedBucket * 7919 + 31, w, h);
    _equiCache.set(key, t);
    if (_equiCache.size > 200) _equiCache.delete(_equiCache.keys().next().value);
  }
  return t;
}

/* 高さマップ由来の簡易法線マップ（Sobelフィルタ）。SphereGeometry に貼ることで
 * クレーターなどの凹凸を陰影として際立たせる（バンプ相当）。 */
const _normalCache = new Map();
function getNormalTextureFromEquirect(kind, palette, seedBucket, w, h) {
  const key = 'n|' + kind + '|' + palette.base + '|' + seedBucket + '|' + w + 'x' + h;
  let t = _normalCache.get(key);
  if (t) return t;
  const src = getEquirectTexture(kind, palette, seedBucket, w, h);
  const sc = document.createElement('canvas');
  sc.width = src.width; sc.height = src.height;
  const sctx = sc.getContext('2d');
  sctx.drawImage(src, 0, 0);
  const sw = src.width, sh = src.height;
  const sdata = sctx.getImageData(0, 0, sw, sh).data;
  const lum = (x, y) => {
    x = ((x % sw) + sw) % sw; y = Math.max(0, Math.min(sh - 1, y));
    const i = (y * sw + x) * 4;
    return (sdata[i] * 0.299 + sdata[i + 1] * 0.587 + sdata[i + 2] * 0.114) / 255;
  };
  const cv = document.createElement('canvas');
  cv.width = sw; cv.height = sh;
  const ctx = cv.getContext('2d');
  const out = ctx.createImageData(sw, sh);
  const strength = 2.2;
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const l = lum(x - 1, y), r = lum(x + 1, y), u = lum(x, y - 1), d = lum(x, y + 1);
      const nx = (l - r) * strength, ny = (u - d) * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      const i = (y * sw + x) * 4;
      out.data[i] = ((nx / len) * 0.5 + 0.5) * 255;
      out.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      out.data[i + 2] = ((nz / len) * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  _normalCache.set(key, cv);
  if (_normalCache.size > 150) _normalCache.delete(_normalCache.keys().next().value);
  return cv;
}

/* 惑星環: RingGeometry の V座標（内周0→外周1）方向に濃淡・間隙を持つ帯テクスチャ。 */
function generateRingBandTexture(seed) {
  const w = 4, h = 256;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  const rng = mulberry32(seed);
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const t = y / h;
    const band = Math.sin(t * 46 + rng() * 0) * 0.5 + 0.5;
    const gapNoise = rng();
    const a = (0.12 + 0.6 * band) * (gapNoise > 0.12 ? 1 : 0.25);
    const c = mixColor({ r: 210, g: 195, b: 170 }, { r: 255, g: 250, b: 235 }, band * 0.4);
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      img.data[i] = c.r; img.data[i + 1] = c.g; img.data[i + 2] = c.b;
      img.data[i + 3] = Math.max(0, Math.min(255, a * 255));
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

/* 降着円盤テクスチャ（ブラックホール用、環状に貼って回転させる） */
function generateAccretionDisk(seed) {
  const s = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = cv.getContext('2d');
  const rng = mulberry32(seed);
  const cx = s / 2, cy = s / 2;
  ctx.clearRect(0, 0, s, s);
  for (let i = 0; i < 1400; i++) {
    const ang = rng() * Math.PI * 2;
    const rad = (0.22 + Math.pow(rng(), 0.6) * 0.76) * (s / 2);
    const x = cx + Math.cos(ang) * rad;
    const y = cy + Math.sin(ang) * rad;
    const heat = 1 - (rad / (s / 2));
    const col = mixColor(hexToRgb('#5b2bff'), hexToRgb('#ffe6a8'), Math.pow(heat, 1.3));
    ctx.fillStyle = rgbStr(col, 0.55 + heat * 0.45);
    const size = 1 + rng() * 2.6;
    ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
  }
  return cv;
}

/* 柔らかい円形グロー（恒星コロナ・ヒットフラッシュ・レンズ効果などに共用する
 * 白色の放射グラデーション。実際の色はマテリアル側の tint で付ける）。 */
let _glowSpriteTex = null;
function generateGlowSpriteTexture() {
  if (_glowSpriteTex) return _glowSpriteTex;
  const s = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = cv.getContext('2d');
  const grad = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, s, s);
  _glowSpriteTex = cv;
  return cv;
}
