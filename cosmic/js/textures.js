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

/* ============================================================
 * クレーター生成（岩石質の天体: 岩石片/小惑星/準惑星/彗星核）— 実機フィードバック対応（第3回）
 * ------------------------------------------------------------
 * 以前は低オクターブの値ノイズ（fbm、グリッドサイズ6が主成分）をそのまま
 * mixColor(dark, base, noise^1.6) に通していたため、数個の大きく滑らかな明暗の
 * 塊が「白い斑点が数個貼り付いたサッカーボール」に見えてしまっていた。
 * 代わりに、大小さまざまな半径のクレーターを明示的にいくつも配置し、それぞれ
 * 「縁が明るいリム」「底に向かって暗くなるお椀」を持たせることで、月や小惑星の
 * 写真に近い凹凸のある見た目にする。u（経度相当）は周期的（トーラス状）に
 * 距離を測り、球面/正距円筒図法のどちらでも継ぎ目が出ないようにする。 */
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
/* このkindにクレーター表現を使うかどうか（岩石質の不整形/小型天体のみ。
 * 惑星以降は既存の穏やかなノイズ地形のままにする）。
 * 注意: comet は base/light がもともと非常に明るい氷色（ほぼ白）のパレットのため、
 * このクレーター表現をそのまま使うと明るいリム部分が白飛びしてしまい、直そうとした
 * 「白い斑点」の問題を別の形で再現してしまう（実機フィードバック対応の副作用を実機
 * 検証時に発見・修正）。そのため comet は対象から外し、従来の穏やかなノイズ地形のまま
 * にする。 */
function isCrateredKind(kind) {
  return kind === 'rock' || kind === 'asteroid' || kind === 'dwarf';
}

/* ============================================================
 * LOD（テクスチャ解像度の段階） — 実機フィードバック対応
 * ------------------------------------------------------------
 * 「巨大な敵がモザイク状にボケる」問題は、固定の低解像度テクスチャキャッシュを
 * 引き伸ばして描画していたことが原因だった。画面上での表示半径（sizePx、
 * devicePixelRatio 込み）に応じて、元になるソーステクスチャの解像度そのものを
 * 段階的に上げることで、近くで大きく見える天体ほどクレーターなどのディテールが
 * きちんと見えるようにする。 */
const NEAR_MAX_SIZE = 160;  // 近似描画（小さい／不規則天体）の最大キャンバスサイズ
const GLOBE_MAX_SIZE = 480; // フル品質球体描画の最大キャンバスサイズ
function albedoTexSizeFor(sizePx) {
  if (sizePx <= 40) return 96;
  if (sizePx <= 90) return 160;
  return 256;
}
function equiResFor(sizePx) {
  if (sizePx <= 64) return { w: 140, h: 70 };
  if (sizePx <= 140) return { w: 240, h: 120 };
  if (sizePx <= 260) return { w: 420, h: 210 };
  return { w: 680, h: 340 };
}

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
function generateAlbedoShapeTexture(kind, palette, seed, irregular, texSize) {
  texSize = texSize || TEX_SIZE;
  const cv = document.createElement('canvas');
  cv.width = cv.height = texSize;
  const ctx = cv.getContext('2d');
  const rng = mulberry32(seed);
  const noises = [makeValueNoise(rng, 6), makeValueNoise(rng, 12), makeValueNoise(rng, 24)];
  const cx = texSize / 2, cy = texSize / 2, R = texSize / 2 - 1;
  const img = ctx.createImageData(texSize, texSize);
  const base = hexToRgb(palette.base);
  const dark = hexToRgb(palette.dark || palette.base);
  const light = hexToRgb(palette.light || '#ffffff');
  // クレーターのリム（縁）を明るくする際の目標色。パレット自体の light（例: 彗星の
  // ほぼ純白のハイライト色）をそのまま使うと、明るいパレットで白飛びしてしまう
  // （実機検証で発見）。base からほどよく明るくした色に固定することで、どのパレットでも
  // 白飛びせず一貫した「リムが少し明るい」見た目になるようにする。
  const crRim = mixColor(base, { r: 255, g: 255, b: 255 }, 0.32);
  const shapeParams = irregular ? getIrregularShapeParams(seed) : null;

  for (let py = 0; py < texSize; py++) {
    for (let px = 0; px < texSize; px++) {
      const nx = (px - cx) / R, ny = (py - cy) / R;
      const idx = (py * texSize + px) * 4;
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
      } else if (isCrateredKind(kind)) {
        // 実機フィードバック対応（第3回）: 多オクターブノイズで岩肌の下地を作った上に、
        // 明示的なクレーター（縁が明るく底が暗い）を重ねる。乗算ではなく mixColor で
        // dark/light の範囲内に収まるようブレンドすることで、パレットの色域を超えて
        // 白飛びすることがないようにしている（乗算方式では明るい下地色で白飛びし、
        // 直そうとした「白い斑点」を再現してしまうことを実機検証で発見・修正した）。
        const craters = getCraterField(seed);
        const cs = craterShadeAt(u, v, craters, true);
        col = mixColor(dark, base, 0.3 + n * 0.55);
        if (cs > 0) col = mixColor(col, crRim, Math.min(1, cs) * 0.7);
        else if (cs < 0) col = mixColor(col, dark, Math.min(1, -cs));
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
function getAlbedoTexture(kind, palette, seedBucket, irregular, texSize) {
  texSize = texSize || TEX_SIZE;
  const key = kind + '|' + palette.base + '|' + seedBucket + '|' + (irregular ? 1 : 0) + '|' + texSize;
  let t = _albedoCache.get(key);
  if (!t) {
    t = generateAlbedoShapeTexture(kind, palette, seedBucket * 7919 + 13, !!irregular, texSize);
    _albedoCache.set(key, t);
    // 実機フィードバック対応（最優先・描画はみ出しバグ）: このキャッシュは以前は無制限に
    // 増え続けており（kind×パレット×seedBucket×形状×解像度の組み合わせ分）、長時間の
    // プレイやエンドレスモードでオフスクリーンcanvasの総メモリ使用量が肥大化し続けていた。
    // モバイル実機ではcanvasの総メモリが上限を超えるとGPU側でテクスチャが破損・差し替え
    // られる不具合が起きうるため、他のLODキャッシュ（_nearFrameCache等）と同様に
    // 上限件数を設けて古いものから破棄する。
    if (_albedoCache.size > 200) _albedoCache.delete(_albedoCache.keys().next().value);
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
  const tex = getAlbedoTexture(kind, palette, seedBucket, irregular, albedoTexSizeFor(sizePx));
  cv = document.createElement('canvas');
  cv.width = cv.height = sizePx;
  const ctx = cv.getContext('2d');
  const rotation = (frameIdx / NEAR_FRAMES) * Math.PI * 2;
  const r = sizePx / 2;
  ctx.save();
  ctx.translate(r, r);
  ctx.rotate(rotation);
  ctx.drawImage(tex, -r, -r, sizePx, sizePx);
  const ambientFloor = (kind === 'star' || kind === 'neutron') ? 0.6 : 0.16;
  ctx.globalCompositeOperation = 'multiply';
  // getShadingMask は常にワールド座標の光源方向を向く必要があるため、ここでは
  // 現在の回転をキャンセルしてから描く（回転で一緒に回ってしまうと光源方向が
  // ずれてしまう）。
  ctx.rotate(-rotation);
  ctx.drawImage(getShadingMask(sizePx, ambientFloor), -r, -r, sizePx, sizePx);
  // 実機フィードバック対応（第3回・白い斑点の真因）: 不規則形状（ジャガイモ型）の
  // アルベドテクスチャは、輪郭の外側や凹んだくびれ部分が透明（alpha=0）になっている。
  // ここまでの 'multiply' 合成は、透明な下地に対しても不透明なシェーディングマスクを
  // そのまま乗せてしまい、くびれ部分だけ真っ白／真っ黒のマスク色がそのまま透けて
  // 見える（大きな白い斑点に見える）不具合の直接の原因だった。'destination-in' で
  // 元のアルベド形状のアルファをもう一度重ねることで、輪郭の外側・くびれの内側を
  // 確実に透明へ戻す。
  ctx.rotate(rotation);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(tex, -r, -r, sizePx, sizePx);
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
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

function generateEquirectTexture(kind, palette, seed, w, h) {
  w = w || EQUI_W; h = h || EQUI_H;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  const rng = mulberry32(seed);
  // 高解像度タイル（大きく表示される天体）ほど、より細かいノイズ格子を1段追加して
  // クレーター等のディテールが潰れないようにする。
  const noises = [makeValueNoise(rng, 6), makeValueNoise(rng, 12), makeValueNoise(rng, 24)];
  if (w > EQUI_W) noises.push(makeValueNoise(rng, 48));
  const base = hexToRgb(palette.base);
  const dark = hexToRgb(palette.dark || palette.base);
  const light = hexToRgb(palette.light || '#ffffff');
  const crRim = mixColor(base, { r: 255, g: 255, b: 255 }, 0.32); // 上のgenerateAlbedoShapeTextureと同じ理由
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
    // 実機フィードバック対応（最優先・描画はみ出しバグ）: 正距円筒図法テクスチャは
    // 最大680x340pxとサイズが大きく、無制限に溜め続けるとメモリ使用量が肥大化する
    // （_albedoCacheと同じ理由）。上限件数を設けて古いものから破棄する。
    if (_equiCache.size > 150) _equiCache.delete(_equiCache.keys().next().value);
  }
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
  if (_atmoCache.size > 100) _atmoCache.delete(_atmoCache.keys().next().value);
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

  const res = equiResFor(sizePx);
  const equi = getEquirectTexture(kind, palette, seedBucket, res.w, res.h);
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

/* ゆっくりドリフト／明滅する星雲レイヤー（星空とは別に、独立した速度で流す）。
 *
 * 実機フィードバック対応（第3回・背景の市松模様）: 原因は、このタイル画像がトーラス状に
 * シームレスではなかったこと。各星雲の光暈（radial gradient）はタイル中央付近ほど明るく
 * タイル端に近づくほど暗く途切れており、drawBackground() 側でこの同じタイルを敷き詰めて
 * 描画すると、タイル境界を挟んで明暗が周期的に変化する＝大きな正方形のムラ（市松模様）
 * として見えていた。修正: 各光暈をキャンバスの上下左右斜めの計9箇所（自分自身＋8方向の
 * 隣接コピー）に描画することで、タイル端をまたぐ光暈も反対側の端に continuous に
 * 繋がるようにする（トーラス状ラップ）。これによりどの倍率・位置でタイルを敷き詰めても
 * 境界に不連続な明暗の段差が生じない。 */
function generateNebulaLayer(w, h, seed) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  const rng = mulberry32(seed);
  const nebColors = ['#3a2a6d', '#1a3a6d', '#5a2a5d', '#204a5a', '#3a1a4a'];
  const wrapOffsets = [-w, 0, w];
  const wrapOffsetsY = [-h, 0, h];
  for (let i = 0; i < 6; i++) {
    const cx = rng() * w, cy = rng() * h;
    const r = (0.22 + rng() * 0.32) * Math.max(w, h);
    const col = hexToRgb(nebColors[i % nebColors.length]);
    for (const ox of wrapOffsets) {
      for (const oy of wrapOffsetsY) {
        const bx = cx + ox, by = cy + oy;
        if (bx + r < 0 || bx - r > w || by + r < 0 || by - r > h) continue;
        const grad = ctx.createRadialGradient(bx, by, 0, bx, by, r);
        grad.addColorStop(0, rgbStr(col, 0.38));
        grad.addColorStop(0.5, rgbStr(col, 0.18));
        grad.addColorStop(1, rgbStr(col, 0));
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fill();
      }
    }
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
