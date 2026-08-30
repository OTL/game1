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

/* ============================================================
 * 単一光源（遠方の恒星）
 * ------------------------------------------------------------
 * ワールド全体で共有する唯一の光源方向。全天体・塵パーティクルは
 * この同じ方向から照らされる（写実性の核）。カメラは回転しないため
 * スクリーン座標系でも常にこの向きのまま保たれる。
 * 完全な固定ではなく、超低速に角度が変化する（現実の見た目には
 * ほぼ気付かない速度）。
 * ============================================================ */
const WORLD_LIGHT = {
  baseAngle: -2.05, // ラジアン。左上やや上寄りから
  driftSpeed: 0.00004, // rad/sec（超低速。1時間のプレイでも約8度程度しか動かない）
  angle: -2.05,
  x: 0, y: 0,
};
const LIGHT_BUCKET_STEP = 0.015; // シェーディングマスクのキャッシュ粒度（この刻みでのみ再生成）
(function initLight() { WORLD_LIGHT.x = Math.cos(WORLD_LIGHT.angle); WORLD_LIGHT.y = Math.sin(WORLD_LIGHT.angle); })();
function updateWorldLight(t) {
  WORLD_LIGHT.angle = WORLD_LIGHT.baseAngle + t * WORLD_LIGHT.driftSpeed;
  WORLD_LIGHT.x = Math.cos(WORLD_LIGHT.angle);
  WORLD_LIGHT.y = Math.sin(WORLD_LIGHT.angle);
}

const TEX_SIZE = 128;

/* ---------- 不規則形状（岩石片〜小惑星クラス） ----------
 * 多角形＋ノイズ変形の輪郭を、方向ごとの半径係数（調和級数の和）として
 * シード固定で保持する。これをテクスチャのクリップ形状にも、当たり判定の
 * 概形イメージにも共通で使う。 */
const _irregularShapeCache = new Map();
function getIrregularShapeParams(seed) {
  let p = _irregularShapeCache.get(seed);
  if (p) return p;
  const rng = mulberry32(seed * 104729 + 7);
  const harmonics = [];
  const nH = 3 + ((rng() * 2) | 0);
  for (let i = 0; i < nH; i++) {
    harmonics.push({ k: 2 + i + ((rng() * 2) | 0), amp: 0.08 + rng() * 0.17, phase: rng() * Math.PI * 2 });
  }
  p = { harmonics };
  _irregularShapeCache.set(seed, p);
  return p;
}
function irregularRadiusFactor(params, theta) {
  let f = 1;
  for (const h of params.harmonics) f += h.amp * Math.sin(theta * h.k + h.phase);
  return Math.max(0.52, Math.min(1.38, f));
}

/* 天体の「アルベド」テクスチャ（方向性の光は焼き込まない）。
 * 自転／タンブリングで自由に回転させても、後段で固定方向のシェーディング
 * マスクを重ねるだけで常に同じ光源方向を保てるようにするための土台。
 * irregular=true の場合は不規則な輪郭でクリップし、ジャガイモ型になる。 */
function generateAlbedoShapeTexture(kind, palette, seed, irregular) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = TEX_SIZE;
  const ctx = cv.getContext('2d');
  const rng = mulberry32(seed);
  const noises = [makeValueNoise(rng, 6), makeValueNoise(rng, 12), makeValueNoise(rng, 24)];
  const cx = TEX_SIZE / 2, cy = TEX_SIZE / 2, R = TEX_SIZE / 2 - 1;
  const img = ctx.createImageData(TEX_SIZE, TEX_SIZE);
  const base = hexToRgb(palette.base);
  const dark = hexToRgb(palette.dark || palette.base);
  const light = hexToRgb(palette.light || '#ffffff');
  const shapeParams = irregular ? getIrregularShapeParams(seed) : null;

  for (let py = 0; py < TEX_SIZE; py++) {
    for (let px = 0; px < TEX_SIZE; px++) {
      const nx = (px - cx) / R, ny = (py - cy) / R;
      const idx = (py * TEX_SIZE + px) * 4;
      const d = Math.hypot(nx, ny);
      let edge = 1;
      if (shapeParams) edge = irregularRadiusFactor(shapeParams, Math.atan2(ny, nx));
      if (d > edge) { img.data[idx + 3] = 0; continue; }
      const d2 = Math.min(1, d * d);
      const nz = Math.sqrt(Math.max(0, 1 - d2));
      const rim = Math.pow(1 - nz, 2.0); // 視線角度による縁の減光（光源方向とは無関係）

      const u = 0.5 + Math.atan2(ny, nx) / (Math.PI * 2);
      const v = 0.5 + Math.asin(Math.max(-1, Math.min(1, d))) / Math.PI;
      const n = fbm(noises, u, v * 2);

      let col;
      if (kind === 'gasgiant' || kind === 'browndwarf' || kind === 'giant') {
        const band = Math.sin((ny * 7 + n * 2.2)) * 0.5 + 0.5;
        col = mixColor(dark, base, band * 0.7 + n * 0.3);
      } else if (kind === 'star' || kind === 'neutron') {
        col = mixColor(base, light, Math.pow(n, 1.4));
      } else {
        const crater = Math.pow(n, 1.6);
        col = mixColor(dark, base, crater);
      }
      let r = col.r, g = col.g, b = col.b;
      r *= (1 - rim * 0.35); g *= (1 - rim * 0.35); b *= (1 - rim * 0.35);
      img.data[idx] = Math.min(255, r);
      img.data[idx + 1] = Math.min(255, g);
      img.data[idx + 2] = Math.min(255, b);
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

/* テクスチャキャッシュ: kind+パレット+シードバケット+不規則フラグごとに使い回す */
const _albedoCache = new Map();
function getAlbedoTexture(kind, palette, seedBucket, irregular) {
  const key = kind + '|' + palette.base + '|' + seedBucket + '|' + (irregular ? 1 : 0);
  let t = _albedoCache.get(key);
  if (!t) {
    t = generateAlbedoShapeTexture(kind, palette, seedBucket * 7919 + 13, !!irregular);
    _albedoCache.set(key, t);
  }
  return t;
}

/* 近似描画（小さい／不規則な天体）用の「形状×固定シェーディング」を合成済みフレームとして
 * 離散回転位相ごとにキャッシュする。renderGlobeFrame と同じ狙い：毎フレーム2回描画（形状＋
 * マスクの multiply 合成）する代わりに、1回の drawImage で済ませて描画コストを抑える。 */
const NEAR_FRAMES = 32;
const _nearFrameCache = new Map();
function getNearBodyFrame(kind, palette, seedBucket, irregular, sizePx, frameIdx) {
  const bucket = currentLightBucket();
  const key = kind + '|' + palette.base + '|' + seedBucket + '|' + (irregular ? 1 : 0) + '|' + sizePx + '|' + frameIdx + '|' + bucket;
  let cv = _nearFrameCache.get(key);
  if (cv) return cv;
  const tex = getAlbedoTexture(kind, palette, seedBucket, irregular);
  cv = document.createElement('canvas');
  cv.width = cv.height = sizePx;
  const ctx = cv.getContext('2d');
  const rotation = (frameIdx / NEAR_FRAMES) * Math.PI * 2;
  const r = sizePx / 2;
  ctx.save();
  ctx.translate(r, r);
  ctx.rotate(rotation);
  ctx.drawImage(tex, -r, -r, sizePx, sizePx);
  ctx.restore();
  const ambientFloor = (kind === 'star' || kind === 'neutron') ? 0.6 : 0.16;
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(getShadingMask(sizePx, ambientFloor), 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  _nearFrameCache.set(key, cv);
  if (_nearFrameCache.size > 600) _nearFrameCache.delete(_nearFrameCache.keys().next().value);
  return cv;
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
 * 天体の種類・パレット・自転位相に関わらず使い回せる。
 * 光源方向は WORLD_LIGHT（ワールド共通の唯一の光源）を参照する。全天体・全パーティクルが
 * この同じ方向マスクを使うことで、写実的な「単一光源の一貫したライティング」を実現する。
 * 角度は LIGHT_BUCKET_STEP 刻みで量子化してキャッシュし、超低速ドリフトでも
 * 毎フレーム再生成しないようにする。 */
const _shadeMaskCache = new Map();
function currentLightBucket() { return Math.round(WORLD_LIGHT.angle / LIGHT_BUCKET_STEP); }
function getShadingMask(sizePx, ambientFloor) {
  const bucket = currentLightBucket();
  const key = sizePx + '|' + ambientFloor + '|' + bucket;
  let m = _shadeMaskCache.get(key);
  if (m) return m;
  const angle = bucket * LIGHT_BUCKET_STEP;
  const lightX = Math.cos(angle), lightY = Math.sin(angle);
  const cv = document.createElement('canvas');
  cv.width = cv.height = sizePx;
  const ctx = cv.getContext('2d');
  const R = sizePx / 2;
  const img = ctx.createImageData(sizePx, sizePx);
  const lightZ = 0.35; // 光源をやや手前寄りに置き、球全体にほどよい満ち欠けを作る
  const lightLen = Math.hypot(lightX, lightY, lightZ);
  const lx = lightX / lightLen, ly = lightY / lightLen, lz = lightZ / lightLen;
  for (let py = 0; py < sizePx; py++) {
    for (let px = 0; px < sizePx; px++) {
      const nx = (px + 0.5 - R) / R, ny = (py + 0.5 - R) / R;
      const idx = (py * sizePx + px) * 4;
      const d2 = nx * nx + ny * ny;
      if (d2 > 1) { img.data[idx + 3] = 0; continue; }
      const nz = Math.sqrt(Math.max(0, 1 - d2));
      let ndotl = nx * lx + ny * ly + nz * lz;
      ndotl = Math.max(0, ndotl);
      const rim = Math.pow(1 - nz, 2.2); // 縁の減光
      // 夜側は完全な黒ではなく背景光でわずかに見える程度に留める
      const shade = ambientFloor + (1 - ambientFloor) * ndotl;
      const factor = Math.max(0, shade * (1 - rim * 0.55));
      const v = Math.max(0, Math.min(255, factor * 255));
      img.data[idx] = v; img.data[idx + 1] = v; img.data[idx + 2] = v; img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  _shadeMaskCache.set(key, cv);
  if (_shadeMaskCache.size > 240) _shadeMaskCache.delete(_shadeMaskCache.keys().next().value);
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

/* 天の川風の微光の帯（横長の一枚絵、背景に一本だけ配置してごく薄くドリフトさせる） */
function generateMilkyWayBand(w, h, seed) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  const rng = mulberry32(seed);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-0.32);
  const bw = w * 1.25, bh = h * 0.42;
  const grad = ctx.createLinearGradient(0, -bh / 2, 0, bh / 2);
  grad.addColorStop(0, 'rgba(180,190,220,0)');
  grad.addColorStop(0.5, 'rgba(200,205,230,0.10)');
  grad.addColorStop(1, 'rgba(180,190,220,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
  // 微光の粒（帯に沿って密度を持たせる、彩度は低く白寄り）
  for (let i = 0; i < 2600; i++) {
    const x = (rng() - 0.5) * bw;
    const yFold = Math.pow(rng(), 1.8) * (rng() < 0.5 ? -1 : 1);
    const y = yFold * bh / 2;
    const b = 0.05 + rng() * 0.16;
    ctx.fillStyle = `rgba(210,215,235,${b.toFixed(3)})`;
    ctx.beginPath(); ctx.arc(x, y, 0.4 + rng() * 0.7, 0, Math.PI * 2); ctx.fill();
  }
  // 暗黒星雲風の欠け（帯の中に走る暗い筋）
  for (let i = 0; i < 4; i++) {
    const x = (rng() - 0.5) * bw;
    const y = (rng() - 0.5) * bh * 0.6;
    const rw = bw * (0.08 + rng() * 0.1), rh = bh * (0.4 + rng() * 0.3);
    const dgrad = ctx.createRadialGradient(x, y, 0, x, y, rw);
    dgrad.addColorStop(0, 'rgba(3,4,10,0.35)');
    dgrad.addColorStop(1, 'rgba(3,4,10,0)');
    ctx.fillStyle = dgrad;
    ctx.save(); ctx.translate(x, y); ctx.scale(1, rh / rw); ctx.beginPath(); ctx.arc(0, 0, rw, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  ctx.restore();
  return cv;
}

/* 漂う微細な塵パーティクル群（多層パララックス、光源方向で明るさが変わる）。
 * 各粒はゆっくり自転しており、法線と WORLD_LIGHT の内積で輝度が変化する。
 * 位置はカメラ相対のタイル空間に保持し、タイルの外に出たら反対側へラップする。 */
function generateDustField(count, seed) {
  const rng = mulberry32(seed);
  const dust = [];
  for (let i = 0; i < count; i++) {
    dust.push({
      x: (rng() - 0.5) * 1,  // タイル内 0..1 正規化座標（描画時にタイルサイズを掛ける）
      y: (rng() - 0.5) * 1,
      normal: rng() * Math.PI * 2,
      spin: (rng() - 0.5) * 0.6,
      size: 0.6 + rng() * 1.6,
      driftAng: rng() * Math.PI * 2,
      driftSpd: 3 + rng() * 10,
    });
  }
  return dust;
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
