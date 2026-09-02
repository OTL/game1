/* ============================================================
   COSMIC EATER - render.js
   WebGL (Three.js) による3D描画レイヤー
   ------------------------------------------------------------
   ゲームロジック（game.js / entities.js）は2Dの位置・速度・衝突判定のまま
   何も変えず、この Renderer だけが「2D世界の座標」を実際の3D空間の
   XY平面（Z=0）上に配置されたメッシュとして描画する。
   カメラは高い位置から見下ろす狭FOVの Perspective カメラ（わずかに傾けて
   立体感を出す）。HPバー・浮遊ダメージ数・ロックオン矢印・彗星の尾
   アップグレードの軌跡など、画面に張り付くUI的な表現は引き続き
   2Dオーバーレイ canvas（#overlay-canvas、WebGLキャンバスの上に重ねる）で描く。
   ============================================================ */
'use strict';

let THREE = null;

function derivePalette(hex) {
  const base = hexToRgb(hex);
  const dark = mixColor(base, { r: 0, g: 0, b: 0 }, 0.55);
  const light = mixColor(base, { r: 255, g: 255, b: 255 }, 0.55);
  const toHex = c => '#' + [c.r, c.g, c.b].map(v => Math.max(0, Math.min(255, v | 0)).toString(16).padStart(2, '0')).join('');
  return { base: hex, dark: toHex(dark), light: toHex(light) };
}

/* ---------- シェーダ ---------- */
const STAR_VERT = `
uniform vec2 uCamera;
uniform float uFactor;
uniform float uTile;
uniform float uSize;
uniform float uDepth;
varying float vAlpha;
void main() {
  vec2 shift = uCamera * uFactor;
  vec2 wrapped = mod(position.xy - shift + uTile * 0.5, uTile) - uTile * 0.5;
  vec3 worldPos = vec3(wrapped + uCamera, -uDepth);
  vec4 mvPosition = modelViewMatrix * vec4(worldPos, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  float d = max(1.0, -mvPosition.z);
  gl_PointSize = uSize * (900.0 / d);
  vAlpha = clamp(1.3 - d / 6000.0, 0.2, 1.0);
}`;
const STAR_FRAG = `
precision mediump float;
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(uColor, a * uOpacity * vAlpha);
}`;

const PARTICLE_VERT = `
attribute vec3 aColor;
attribute float aSize;
attribute float aAlpha;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (700.0 / max(1.0, -mv.z));
  gl_Position = projectionMatrix * mv;
}`;
const PARTICLE_FRAG = `
precision mediump float;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(vColor, a * vAlpha);
}`;

const ATMO_VERT = `
varying vec3 vNormal;
varying vec3 vViewDir;
void main() {
  vNormal = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vViewDir = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const ATMO_FRAG = `
precision mediump float;
uniform vec3 uColor;
varying vec3 vNormal;
varying vec3 vViewDir;
void main() {
  float rim = 1.0 - max(dot(normalize(vNormal), normalize(vViewDir)), 0.0);
  float a = pow(rim, 2.1);
  gl_FragColor = vec4(uColor, a * 0.85);
}`;

/* ---------- ジオメトリ生成ヘルパー ---------- */
function buildRadialRingGeometry(innerR, outerR, segments) {
  const positions = [], uvs = [], indices = [];
  for (let i = 0; i <= segments; i++) {
    const th = (i / segments) * Math.PI * 2;
    const ct = Math.cos(th), st = Math.sin(th);
    positions.push(ct * innerR, st * innerR, 0); uvs.push(i / segments, 0);
    positions.push(ct * outerR, st * outerR, 0); uvs.push(i / segments, 1);
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
    indices.push(a, b, c, b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setIndex(indices);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}
/* 降着円盤用: 正方形画像(x,yで生成した見下ろし円盤)をそのまま貼れるよう、
 * UVを「中心からの直交座標」に対応させる（角度×半径の帯ではなく円盤画像として貼る）。 */
function buildPolarDiskGeometry(innerR, outerR, segments) {
  const positions = [], uvs = [], indices = [];
  for (let i = 0; i <= segments; i++) {
    const th = (i / segments) * Math.PI * 2;
    const ct = Math.cos(th), st = Math.sin(th);
    positions.push(ct * innerR, st * innerR, 0);
    uvs.push(0.5 + 0.5 * (ct * innerR / outerR), 0.5 + 0.5 * (st * innerR / outerR));
    positions.push(ct * outerR, st * outerR, 0);
    uvs.push(0.5 + 0.5 * ct, 0.5 + 0.5 * st);
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
    indices.push(a, b, c, b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setIndex(indices);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}
/* 不規則な岩塊（小惑星・破片・彗星核・敵対天体）: Icosahedron を球面調和風の
 * 正弦波の合成で変形し、ジャガイモ型のローポリ形状を作る。シードごとに数種を
 * キャッシュして使い回す（インスタンス的な使い回し。フルの InstancedMesh 化は
 * 未実装だが、天体総数の上限が低いため個別 Mesh のままでも 60fps を維持できる）。 */
function buildIrregularGeometry(seedBucket) {
  const geo = new THREE.IcosahedronGeometry(1, 2);
  const rng = mulberry32(seedBucket * 104729 + 7);
  const nTerms = 4 + ((rng() * 3) | 0);
  const terms = [];
  for (let i = 0; i < nTerms; i++) {
    terms.push({
      ax: rng() * 2 - 1, ay: rng() * 2 - 1, az: rng() * 2 - 1,
      freq: 1 + ((rng() * 3) | 0), amp: 0.09 + rng() * 0.16, phase: rng() * Math.PI * 2,
    });
  }
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    let f = 1;
    for (const t of terms) {
      const d = v.x * t.ax + v.y * t.ay + v.z * t.az;
      f += t.amp * Math.sin(d * t.freq * Math.PI * 2 + t.phase);
    }
    f = Math.max(0.55, Math.min(1.32, f));
    v.multiplyScalar(f);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ready = false;
    this.webglError = false;
    this.time = 0;
    this.bgTime = 0;
    this.shake = 0;
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.dpr = 1;
    this._lastZoom = 1;
    this.tint = { r: 5, g: 7, b: 16 };
    this.shootingStars = [];
    this.shootingTimer = 3 + Math.random() * 5;
    this._bodyCursor = 0;
    this._fragCursor = 0;

    this.overlayCanvas = document.getElementById('overlay-canvas');
    if (!this.overlayCanvas) {
      this.overlayCanvas = document.createElement('canvas');
      this.overlayCanvas.id = 'overlay-canvas';
      canvas.insertAdjacentElement('afterend', this.overlayCanvas);
    }
    this.octx = this.overlayCanvas.getContext('2d');
    this.ctx = this.octx; // game.js は renderer.ctx を直接使ってオーバーレイに描く

    import('../vendor/three.module.min.js').then(mod => {
      THREE = mod;
      try {
        this.initThree();
      } catch (e) {
        console.error('WebGL初期化に失敗しました', e);
        this.showWebglFallback();
      }
    }).catch(err => {
      console.error('three.js の読み込みに失敗しました', err);
      this.showWebglFallback();
    });
  }

  showWebglFallback() {
    this.webglError = true;
    if (this._fallbackShown) return;
    this._fallbackShown = true;
    const div = document.createElement('div');
    div.id = 'webgl-fallback';
    div.style.cssText = 'position:fixed;inset:0;z-index:999;display:flex;align-items:center;justify-content:center;' +
      'background:#05040f;color:#eef0ff;text-align:center;padding:24px;font:16px/1.7 system-ui,sans-serif;';
    div.innerHTML = '<div>この端末・ブラウザは WebGL に対応していないため、<br>コズミック・イーターの3D描画を表示できません。<br>' +
      '別のブラウザ（Chrome / Safari 最新版など）でお試しください。</div>';
    document.body.appendChild(div);
  }

  /* ============================================================
   * 初期化（Three.js 読み込み後）
   * ============================================================ */
  initThree() {
    let gl3d;
    try {
      gl3d = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance', alpha: false });
    } catch (e) { this.showWebglFallback(); return; }
    if (!gl3d || !gl3d.getContext()) { this.showWebglFallback(); return; }
    this.renderer3d = gl3d;
    this.renderer3d.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer3d.autoClear = true;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x03040c);
    this.fov = 24;      // 狭FOV = 望遠寄り。奥行きの歪みを抑えつつ立体感を出す
    this.tilt = 0.20;   // 見下ろしからのわずかな傾き（ラジアン、約11.5度）
    this.camera = new THREE.PerspectiveCamera(this.fov, this.w / this.h, 1, 200000);
    this.camera.up.set(0, 0, 1);

    this.sun = new THREE.DirectionalLight(0xffffff, 2.6);
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.ambient = new THREE.AmbientLight(0x3a4468, 0.55);
    this.scene.add(this.ambient);

    this.worldGroup = new THREE.Group(); this.scene.add(this.worldGroup);
    this.bgGroup = new THREE.Group(); this.scene.add(this.bgGroup);

    this._texCache = new Map();
    this.glowTex = new THREE.CanvasTexture(generateGlowSpriteTexture());

    this.buildSharedAssets();
    this.buildBackground();
    this.bodyPool = [];
    for (let i = 0; i < 48; i++) this.bodyPool.push(this.buildBodySlot());
    this.fragPool = [];
    for (let i = 0; i < 70; i++) this.fragPool.push(this.buildBodySlot());
    this.buildParticleSystem();
    this.buildImpactPools();

    this._v3 = new THREE.Vector3();
    this.ready = true;
    if (this._pendingSize) this._applyThreeSize();
  }

  buildSharedAssets() {
    this.sphereGeo = new THREE.SphereGeometry(1, 28, 18);
    this.irregularGeos = [];
    for (let i = 0; i < 6; i++) this.irregularGeos.push(buildIrregularGeometry(i));
    this.ringGeo = buildRadialRingGeometry(1.3, 2.3, 64);
    this.ringMat = new THREE.MeshStandardMaterial({
      map: new THREE.CanvasTexture(generateRingBandTexture(42)),
      transparent: true, side: THREE.DoubleSide, roughness: 1, metalness: 0, depthWrite: false,
    });
    this.ringMat.map.wrapS = THREE.RepeatWrapping;
    this.ringMat.map.wrapT = THREE.ClampToEdgeWrapping;

    this.diskGeo = buildPolarDiskGeometry(1.15, 2.6, 64);
    this.diskMat = new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(generateAccretionDisk(7)),
      transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
    });

    this.circleGeo = new THREE.BufferGeometry();
    { const pts = []; const N = 48; for (let i = 0; i <= N; i++) { const a = (i / N) * Math.PI * 2; pts.push(Math.cos(a), Math.sin(a), 0); }
      this.circleGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); }
    this.hostileMat = new THREE.LineBasicMaterial({ color: 0xff505a, transparent: true, opacity: 0.85 });

    this.bhHorizonMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    this.bhGlowMat = new THREE.SpriteMaterial({
      map: this.glowTex, color: 0x9b6bff, transparent: true, opacity: 0.35,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
  }

  /* ---------- 背景: 星空(Points, カメラ追従の無限タイル) + 星雲/天の川(スプライト) ---------- */
  buildBackground() {
    this.starLayers = [];
    const specs = [
      { count: 900, size: 1.6, depth: 3400, factor: 0.05, opacity: 0.8, color: 0xffffff, tile: 3400, seed: 101 },
      { count: 700, size: 2.1, depth: 1900, factor: 0.14, opacity: 0.85, color: 0xdfe6ff, tile: 2400, seed: 202 },
      { count: 480, size: 2.6, depth: 950, factor: 0.30, opacity: 0.95, color: 0xffffff, tile: 1700, seed: 303 },
    ];
    for (const sp of specs) {
      const positions = new Float32Array(sp.count * 3);
      const rng = mulberry32(sp.seed);
      for (let i = 0; i < sp.count; i++) {
        positions[i * 3] = (rng() - 0.5) * sp.tile;
        positions[i * 3 + 1] = (rng() - 0.5) * sp.tile;
        positions[i * 3 + 2] = 0;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uCamera: { value: new THREE.Vector2() }, uFactor: { value: sp.factor }, uTile: { value: sp.tile },
          uSize: { value: sp.size }, uDepth: { value: sp.depth }, uColor: { value: new THREE.Color(sp.color) },
          uOpacity: { value: sp.opacity },
        },
        vertexShader: STAR_VERT, fragmentShader: STAR_FRAG,
        transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
      });
      const pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false;
      pts.renderOrder = -100;
      this.bgGroup.add(pts);
      this.starLayers.push(pts);
    }

    // 星雲（固定配置のビルボード。実際のカメラ移動による本物の遠近パララックスに任せる）
    const nebColors = [0x3a2a6d, 0x1a3a6d, 0x5a2a5d, 0x204a5a, 0x3a1a4a];
    const nrng = mulberry32(909);
    this.nebulaSprites = [];
    for (let i = 0; i < 10; i++) {
      const tex = new THREE.CanvasTexture(generateGlowSpriteTexture());
      const mat = new THREE.SpriteMaterial({
        map: tex, color: nebColors[i % nebColors.length], transparent: true, opacity: 0.4 + nrng() * 0.2,
        depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
      });
      const spr = new THREE.Sprite(mat);
      spr.position.set((nrng() - 0.5) * 9000, (nrng() - 0.5) * 9000, -(3500 + nrng() * 2500));
      spr.scale.set(2600 + nrng() * 2600, 2600 + nrng() * 2600, 1);
      spr.renderOrder = -95;
      this.bgGroup.add(spr);
      this.nebulaSprites.push(spr);
    }

    // 天の川（横長の帯を1枚、遠景に固定配置）
    const mwCv = this.buildMilkyWayTexture();
    const mwMat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(mwCv), transparent: true, opacity: 0.6, depthWrite: false, depthTest: false });
    this.milkyWaySprite = new THREE.Sprite(mwMat);
    this.milkyWaySprite.scale.set(16000, 16000 * (mwCv.height / mwCv.width), 1);
    this.milkyWaySprite.position.set(0, 0, -8000);
    this.milkyWaySprite.renderOrder = -99;
    this.bgGroup.add(this.milkyWaySprite);
  }

  buildMilkyWayTexture() {
    const w = 1600, h = 900;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    const rng = mulberry32(909);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-0.32);
    const bw = w * 1.25, bh = h * 0.42;
    const grad = ctx.createLinearGradient(0, -bh / 2, 0, bh / 2);
    grad.addColorStop(0, 'rgba(180,190,220,0)');
    grad.addColorStop(0.5, 'rgba(200,205,230,0.5)');
    grad.addColorStop(1, 'rgba(180,190,220,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
    for (let i = 0; i < 3000; i++) {
      const x = (rng() - 0.5) * bw;
      const yFold = Math.pow(rng(), 1.8) * (rng() < 0.5 ? -1 : 1);
      const y = yFold * bh / 2;
      const b = 0.08 + rng() * 0.3;
      ctx.fillStyle = `rgba(210,215,235,${b.toFixed(3)})`;
      ctx.beginPath(); ctx.arc(x, y, 0.5 + rng() * 0.9, 0, Math.PI * 2); ctx.fill();
    }
    for (let i = 0; i < 4; i++) {
      const x = (rng() - 0.5) * bw, y = (rng() - 0.5) * bh * 0.6;
      const rw = bw * (0.08 + rng() * 0.1), rh = bh * (0.4 + rng() * 0.3);
      const dgrad = ctx.createRadialGradient(x, y, 0, x, y, rw);
      dgrad.addColorStop(0, 'rgba(3,4,10,0.5)');
      dgrad.addColorStop(1, 'rgba(3,4,10,0)');
      ctx.fillStyle = dgrad;
      ctx.save(); ctx.translate(x, y); ctx.scale(1, rh / rw); ctx.beginPath(); ctx.arc(0, 0, rw, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    ctx.restore();
    return cv;
  }

  /* ---------- 天体1体分の使い回しスロット ---------- */
  buildBodySlot() {
    const group = new THREE.Group();
    const sphereMat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, transparent: true });
    const sphereMesh = new THREE.Mesh(this.sphereGeo, sphereMat);
    const irrMat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, transparent: true });
    const irrMesh = new THREE.Mesh(this.irregularGeos[0], irrMat);
    irrMesh.visible = false;
    const atmoMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0xbfe3ff) } },
      vertexShader: ATMO_VERT, fragmentShader: ATMO_FRAG,
      transparent: true, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const atmoMesh = new THREE.Mesh(this.sphereGeo, atmoMat);
    atmoMesh.visible = false;
    const glowMat = new THREE.SpriteMaterial({ map: this.glowTex, color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending });
    const glowSprite = new THREE.Sprite(glowMat);
    glowSprite.visible = false;
    const ringMesh = new THREE.Mesh(this.ringGeo, this.ringMat);
    ringMesh.visible = false;
    const hostileRing = new THREE.LineLoop(this.circleGeo, this.hostileMat);
    hostileRing.visible = false;
    const bhHorizon = new THREE.Mesh(this.sphereGeo, this.bhHorizonMat); bhHorizon.visible = false;
    const bhDisk = new THREE.Mesh(this.diskGeo, this.diskMat); bhDisk.visible = false;
    const bhGlow = new THREE.Sprite(this.bhGlowMat.clone()); bhGlow.visible = false;

    group.add(sphereMesh, irrMesh, atmoMesh, glowSprite, ringMesh, hostileRing, bhHorizon, bhDisk, bhGlow);
    group.visible = false;
    this.worldGroup.add(group);
    return {
      group, sphereMesh, sphereMat, irrMesh, irrMat, atmoMesh, atmoMat, glowSprite, glowMat,
      ringMesh, hostileRing, bhHorizon, bhDisk, bhGlow,
      texKey: null, irrGeoIdx: -1,
    };
  }

  buildParticleSystem() {
    const MAX = 500;
    this._particleMax = MAX;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(MAX), 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(MAX), 1).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VERT, fragmentShader: PARTICLE_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.particlePoints = new THREE.Points(geo, mat);
    this.particlePoints.frustumCulled = false;
    this.worldGroup.add(this.particlePoints);
  }

  /* ---------- 衝突エフェクト: 閃光スプライト・衝撃波リングの使い回しプール ----------
   * 火花（岩片スパーク）は既存の state.particles（ParticlePool→Points）をそのまま使い、
   * ここでは「短寿命の閃光」と「広がる衝撃波リング」のみを少数のオブジェクトを
   * 使い回すプールとして持つ（衝突のたびに新規Meshを生成しない）。 */
  buildImpactPools() {
    const FLASH_MAX = 14;
    this.flashPool = [];
    for (let i = 0; i < FLASH_MAX; i++) {
      const mat = new THREE.SpriteMaterial({
        map: this.glowTex, color: 0xffffff, transparent: true, opacity: 0,
        depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.visible = false;
      sprite.renderOrder = 40;
      this.worldGroup.add(sprite);
      this.flashPool.push({ sprite, mat, life: 0, maxLife: 0.001, baseScale: 1, active: false });
    }
    this._flashCursor = 0;

    const SHOCK_MAX = 6;
    this.shockGeo = buildRadialRingGeometry(0.82, 1, 48);
    this.shockPool = [];
    for (let i = 0; i < SHOCK_MAX; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide,
        depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(this.shockGeo, mat);
      mesh.visible = false;
      mesh.renderOrder = 39;
      this.worldGroup.add(mesh);
      this.shockPool.push({ mesh, mat, life: 0, maxLife: 0.001, r0: 1, r1: 2, active: false });
    }
    this._shockCursor = 0;
  }

  /* 接触点の短い閃光（数フレームで消える）。radiusは天体の見かけ半径（ワールド単位）。 */
  spawnImpactFlash(x, y, radius, color) {
    if (!this.ready) return;
    const slot = this.flashPool[this._flashCursor];
    this._flashCursor = (this._flashCursor + 1) % this.flashPool.length;
    slot.active = true;
    slot.life = 0;
    slot.maxLife = 0.16 + Math.min(0.14, radius * 0.004);
    slot.baseScale = Math.max(3, radius * 2.4);
    slot.sprite.position.set(x, y, 0.06);
    slot.sprite.scale.setScalar(slot.baseScale);
    slot.mat.color.set(color || '#fff6d8');
    slot.mat.opacity = 0.95;
    slot.sprite.visible = true;
  }

  /* ワールド平面上に広がって急速にフェードする薄い衝撃波リング。 */
  spawnShockwave(x, y, radius, color) {
    if (!this.ready) return;
    const slot = this.shockPool[this._shockCursor];
    this._shockCursor = (this._shockCursor + 1) % this.shockPool.length;
    slot.active = true;
    slot.life = 0;
    slot.maxLife = 0.42;
    slot.r0 = Math.max(1, radius * 0.5);
    slot.r1 = Math.max(slot.r0 * 1.5, radius * 2.6);
    slot.mesh.position.set(x, y, 0.045);
    slot.mesh.scale.setScalar(slot.r0);
    slot.mat.color.set(color || '#dff2ff');
    slot.mat.opacity = 0.5;
    slot.mesh.visible = true;
  }

  updateImpactEffects(dt) {
    if (!this.ready) return;
    for (const s of this.flashPool) {
      if (!s.active) continue;
      s.life += dt;
      const t = s.life / s.maxLife;
      if (t >= 1) { s.active = false; s.sprite.visible = false; continue; }
      s.mat.opacity = 0.95 * (1 - t * t);
      s.sprite.scale.setScalar(s.baseScale * (1 + t * 0.6));
    }
    for (const s of this.shockPool) {
      if (!s.active) continue;
      s.life += dt;
      const t = s.life / s.maxLife;
      if (t >= 1) { s.active = false; s.mesh.visible = false; continue; }
      const r = lerp(s.r0, s.r1, 1 - (1 - t) * (1 - t));
      s.mesh.scale.setScalar(r);
      s.mat.opacity = 0.5 * (1 - t);
    }
  }

  /* ============================================================
   * サイズ・カメラ
   * ============================================================ */
  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.dpr = dpr;
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.overlayCanvas.width = Math.floor(this.w * dpr);
    this.overlayCanvas.height = Math.floor(this.h * dpr);
    this.overlayCanvas.style.width = this.w + 'px';
    this.overlayCanvas.style.height = this.h + 'px';
    this.octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!this.ready) { this._pendingSize = true; return; }
    this._applyThreeSize();
  }
  _applyThreeSize() {
    this.renderer3d.setPixelRatio(this.dpr);
    this.renderer3d.setSize(this.w, this.h, true);
    this.camera.aspect = this.w / this.h;
    this.camera.updateProjectionMatrix();
  }

  updateCamera(cam) {
    this._lastZoom = cam.zoom || 1;
    const fovRad = this.fov * Math.PI / 180;
    const d = (this.h * 0.5) / (Math.max(0.02, this._lastZoom) * Math.tan(fovRad / 2));
    let shakeX = 0, shakeY = 0;
    if (this.shake > 0.05) {
      shakeX = (Math.random() - 0.5) * this.shake;
      shakeY = (Math.random() - 0.5) * this.shake;
    }
    const camY = cam.y - d * Math.sin(this.tilt) + shakeY;
    const camZ = d * Math.cos(this.tilt);
    this.camera.position.set(cam.x + shakeX, camY, camZ);
    this.camera.lookAt(cam.x, cam.y, 0);
    this.camera.updateMatrixWorld();

    const lightDist = 600;
    this.sun.position.set(cam.x + WORLD_LIGHT.x * lightDist, cam.y + WORLD_LIGHT.y * lightDist, 260);
    this.sun.target.position.set(cam.x, cam.y, 0);
    this.sun.target.updateMatrixWorld();

    for (const p of this.starLayers) p.material.uniforms.uCamera.value.set(cam.x, cam.y);
  }

  worldToScreen(cam, x, y) {
    if (!this.ready) {
      return { x: (x - cam.x) * cam.zoom + this.w / 2, y: (y - cam.y) * cam.zoom + this.h / 2 };
    }
    this._v3.set(x, y, 0).project(this.camera);
    return { x: (this._v3.x * 0.5 + 0.5) * this.w, y: (1 - (this._v3.y * 0.5 + 0.5)) * this.h };
  }

  screenToWorld(sx, sy) {
    const ndcX = (sx / this.w) * 2 - 1;
    const ndcY = -(sy / this.h) * 2 + 1;
    const v = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(this.camera);
    const dir = v.sub(this.camera.position).normalize();
    const t = dir.z !== 0 ? -this.camera.position.z / dir.z : 0;
    return { x: this.camera.position.x + dir.x * t, y: this.camera.position.y + dir.y * t };
  }

  addShake(v) { this.shake = Math.min(18, this.shake + v); }

  clear() {
    if (this.octx) this.octx.clearRect(0, 0, this.w, this.h);
  }

  /* ============================================================
   * 背景（星空・星雲・天の川は3D、色調ワッシュ・流れ星はオーバーレイ）
   * ============================================================ */
  targetTintFor(stageIdx) {
    const stops = [
      { s: 0, c: { r: 4, g: 7, b: 18 } },
      { s: 3, c: { r: 6, g: 12, b: 30 } },
      { s: 5, c: { r: 30, g: 16, b: 10 } },
      { s: 6, c: { r: 42, g: 22, b: 8 } },
      { s: 7, c: { r: 34, g: 12, b: 10 } },
      { s: 8, c: { r: 22, g: 8, b: 34 } },
      { s: 9, c: { r: 20, g: 4, b: 34 } },
    ];
    let a = stops[0], b = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++) {
      if (stageIdx >= stops[i].s && stageIdx <= stops[i + 1].s) { a = stops[i]; b = stops[i + 1]; break; }
    }
    const span = Math.max(1, b.s - a.s);
    const t = Math.max(0, Math.min(1, (stageIdx - a.s) / span));
    return { r: lerp(a.c.r, b.c.r, t), g: lerp(a.c.g, b.c.g, t), b: lerp(a.c.b, b.c.b, t) };
  }

  updateShootingStars(dt) {
    this.shootingTimer -= dt;
    if (this.shootingTimer <= 0) {
      this.shootingTimer = 7 + Math.random() * 14;
      const fromTop = Math.random() < 0.7;
      const x = fromTop ? Math.random() * this.w : (Math.random() < 0.5 ? -20 : this.w + 20);
      const y = fromTop ? -20 : Math.random() * this.h * 0.6;
      const ang = Math.PI * 0.22 + Math.random() * 0.35 + (x > this.w / 2 ? Math.PI * 0.5 : 0);
      const spd = 620 + Math.random() * 340;
      this.shootingStars.push({ x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life: 0, maxLife: 0.55 + Math.random() * 0.35 });
    }
    for (let i = this.shootingStars.length - 1; i >= 0; i--) {
      const s = this.shootingStars[i];
      s.life += dt; s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.life >= s.maxLife || s.x < -60 || s.x > this.w + 60 || s.y > this.h + 60) this.shootingStars.splice(i, 1);
    }
  }
  drawShootingStars() {
    const ctx = this.octx;
    for (const s of this.shootingStars) {
      const t = 1 - s.life / s.maxLife;
      const len = 90 * (0.5 + t * 0.5);
      const spd = Math.hypot(s.vx, s.vy) || 1;
      const dx = -s.vx / spd, dy = -s.vy / spd;
      const grad = ctx.createLinearGradient(s.x, s.y, s.x + dx * len, s.y + dy * len);
      grad.addColorStop(0, `rgba(255,255,255,${(0.9 * t).toFixed(2)})`);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = grad; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x + dx * len, s.y + dy * len); ctx.stroke();
      ctx.fillStyle = `rgba(255,255,255,${(0.9 * t).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, 1.6, 0, Math.PI * 2); ctx.fill();
    }
  }

  drawBackground(cam, dt, stageIdx) {
    dt = dt || 0;
    this.bgTime += dt;
    updateWorldLight(this.bgTime);
    if (this.ready) {
      for (const p of this.starLayers) p.material.uniforms.uCamera.value.set(cam.x, cam.y);
    }
    this.updateShootingStars(dt);
    this.drawShootingStars();

    const target = this.targetTintFor(stageIdx || 0);
    const k = 1 - Math.exp(-dt * 0.5);
    this.tint.r = lerp(this.tint.r, target.r, k);
    this.tint.g = lerp(this.tint.g, target.g, k);
    this.tint.b = lerp(this.tint.b, target.b, k);
    const ctx = this.octx;
    ctx.fillStyle = `rgba(${this.tint.r | 0},${this.tint.g | 0},${this.tint.b | 0},0.20)`;
    ctx.fillRect(0, 0, this.w, this.h);
  }

  /* ============================================================
   * フレーム制御
   * ============================================================ */
  beginFrame(dt, cam) {
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt * 40);
    this._bodyCursor = 0;
    this._fragCursor = 0;
    if (!this.ready) return;
    this.updateCamera(cam);
    this.updateImpactEffects(dt);
  }
  endFrame() {
    if (!this.ready) return;
    for (let i = this._bodyCursor; i < this.bodyPool.length; i++) this.bodyPool[i].group.visible = false;
    for (let i = this._fragCursor; i < this.fragPool.length; i++) this.fragPool[i].group.visible = false;
    this.renderer3d.render(this.scene, this.camera);
  }

  /* ============================================================
   * テクスチャ適用
   * ============================================================ */
  applyTexture(material, kind, palette, seedBucket) {
    const w = 256, h = 128;
    const cv = getEquirectTexture(kind, palette, seedBucket, w, h);
    let tex = this._texCache.get(cv);
    if (!tex) {
      tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      tex.anisotropy = 4;
      this._texCache.set(cv, tex);
    }
    material.map = tex;
    const ncv = getNormalTextureFromEquirect(kind, palette, seedBucket, w, h);
    let ntex = this._texCache.get(ncv);
    if (!ntex) {
      ntex = new THREE.CanvasTexture(ncv);
      ntex.wrapS = THREE.RepeatWrapping;
      this._texCache.set(ncv, ntex);
    }
    material.normalMap = ntex;
    material.normalScale = material.normalScale || new THREE.Vector2(0.55, 0.55);
    material.needsUpdate = true;
  }

  applyHitFlash(material, body) {
    const hf = body.hitFlash || 0;
    if (hf > 0) {
      // プレイヤーは赤いリムフラッシュ（hitFlashColor）、敵などは既定で白系フラッシュ。
      material.emissive.set(body.hitFlashColor || '#ffffff');
      material.emissiveMap = null;
      material.emissiveIntensity = Math.min(1.0, hf * 1.3);
    }
  }
  applyAlpha(material) {
    const a = this.ctx.globalAlpha;
    material.opacity = (typeof a === 'number') ? a : 1;
  }

  /* ============================================================
   * 天体描画（プレイヤー・敵・捕獲衛星 / 破片）
   * ============================================================ */
  updateBodySlot(slot, body, kind, worldX, worldY, worldR, opts) {
    slot.group.position.set(worldX, worldY, 0);
    slot.group.visible = true;
    // 激突スカッシュ（game.js の setSquash が付与）: 衝突法線の方向へつぶれてから伸びる
    // 減衰振動を、グループ全体の非等方スケールで表現する。グループを法線方向へ回転させて
    // X軸をつぶすため、内側のメッシュの自転角からその回転分を差し引いて見た目の自転を保つ。
    let sq = 0, sqA = 0;
    if (kind !== 'blackhole' && body.squashT > 0 && body.squashDur > 0) {
      const p = 1 - body.squashT / body.squashDur;
      sq = (body.squashAmt || 0) * Math.sin(p * Math.PI * 2) * (1 - p);
      sqA = body.squashAngle || 0;
    }
    slot.group.rotation.z = sqA;
    slot.group.scale.set(1 - sq, 1 + sq * 0.6, 1);
    slot.sphereMesh.visible = false; slot.irrMesh.visible = false; slot.atmoMesh.visible = false;
    slot.glowSprite.visible = false; slot.ringMesh.visible = false; slot.hostileRing.visible = false;
    slot.bhHorizon.visible = false; slot.bhDisk.visible = false; slot.bhGlow.visible = false;

    if (kind === 'blackhole') {
      slot.bhHorizon.visible = true; slot.bhHorizon.scale.setScalar(worldR);
      slot.bhDisk.visible = true; slot.bhDisk.scale.setScalar(worldR);
      slot.bhDisk.rotation.x = 1.15;
      slot.bhDisk.rotation.z = this.time * 0.5;
      slot.bhGlow.visible = true; slot.bhGlow.scale.setScalar(worldR * 5.2);
      return;
    }

    const palette = body.palette || derivePalette(body.color || '#8f8578');
    const seedBucket = (body.seedBucket || 0) % 6;
    const texKey = kind + '|' + palette.base + '|' + seedBucket;
    const irregular = !!body.irregularShape;
    const spinPhase = (body.spinPhase !== undefined ? body.spinPhase : body.angle) || 0;

    if (irregular) {
      if (slot.irrGeoIdx !== seedBucket) { slot.irrMesh.geometry = this.irregularGeos[seedBucket]; slot.irrGeoIdx = seedBucket; }
      if (slot.texKey !== texKey) { this.applyTexture(slot.irrMat, kind, palette, seedBucket); slot.texKey = texKey; }
      slot.irrMesh.visible = true;
      slot.irrMesh.scale.setScalar(worldR);
      slot.irrMesh.rotation.z = spinPhase - sqA;
      slot.irrMesh.rotation.x = spinPhase * 0.37;
      slot.irrMat.emissive.set(0x000000); slot.irrMat.emissiveMap = null;
      this.applyHitFlash(slot.irrMat, body);
      this.applyAlpha(slot.irrMat);
    } else {
      if (slot.texKey !== texKey) { this.applyTexture(slot.sphereMat, kind, palette, seedBucket); slot.texKey = texKey; }
      slot.sphereMesh.visible = true;
      slot.sphereMesh.scale.setScalar(worldR);
      slot.sphereMesh.rotation.z = spinPhase - sqA;

      const isGlowKind = kind === 'star' || kind === 'giant' || kind === 'browndwarf' || kind === 'neutron';
      if (isGlowKind) {
        slot.sphereMat.emissive.set(palette.light || '#ffffff');
        slot.sphereMat.emissiveMap = slot.sphereMat.map;
        slot.sphereMat.emissiveIntensity = (kind === 'neutron' ? 1.5 : 0.95) * (0.9 + Math.sin(this.time * 2.4 + seedBucket) * 0.08);
        slot.glowSprite.visible = true;
        slot.glowMat.color.set(palette.light || '#ffffff');
        slot.glowMat.opacity = 0.6;
        slot.glowSprite.scale.setScalar(worldR * (kind === 'neutron' ? 5.5 : 2.6) * 2);
      } else {
        slot.sphereMat.emissive.set(0x000000);
        slot.sphereMat.emissiveMap = null;
      }
      this.applyHitFlash(slot.sphereMat, body);
      this.applyAlpha(slot.sphereMat);

      // 大気は柔らかいグロースプライトで表現する。
      // 旧実装（裏面シェーダのシェル球）は縁のグラデーションにならず、天体の周りに
      // 硬い輪郭の円環として見える不具合があったため廃止（恒星系は既にglowSpriteあり）。
      const hasAtmo = kind === 'planet' || kind === 'gasgiant';
      if (hasAtmo && !isGlowKind) {
        slot.glowSprite.visible = true;
        slot.glowMat.color.set(palette.light || '#bfe3ff');
        slot.glowMat.opacity = 0.16;
        slot.glowSprite.scale.setScalar(worldR * 3.4);
      }
    }

    if (body.hasRing) {
      slot.ringMesh.visible = true;
      slot.ringMesh.scale.setScalar(worldR);
      slot.ringMesh.rotation.x = 1.15;
      slot.ringMesh.rotation.z = (body.angle || 0) * 0.3 + 0.5 - sqA;
    }
    // 彗星のコマ（核を包む淡いガス状の光暈）。尾本体は game.js 側で反太陽方向へ
    // 連続放出される発光パーティクル（既存の state.particles プールを共有）で表現する
    // （以前の「先細り平面2枚」は単調でチープだったため置き換えた）。
    if (kind === 'comet') {
      slot.glowSprite.visible = true;
      slot.glowMat.color.set(palette.light || '#cfe8ff');
      slot.glowMat.opacity = 0.32;
      slot.glowSprite.scale.setScalar(worldR * 3.2);
    }
    // 敵対天体の警告は硬い円のワイヤではなく、赤い淡いグローの脈動で示す
    // （実機フィードバック「惑星に◯がついてるの変」対応）
    if (body.isHostile && !slot.glowSprite.visible) {
      slot.glowSprite.visible = true;
      slot.glowMat.color.set('#ff5560');
      slot.glowMat.opacity = 0.2 + 0.08 * Math.sin(this.time * 5 + (body.seedBucket || 0));
      slot.glowSprite.scale.setScalar(worldR * 3.0);
    }
  }

  drawBody(body, sx, sy, sr, cam, opts) {
    if (!this.ready) return;
    if (sr < 0.4) return;
    if (this._bodyCursor >= this.bodyPool.length) return;
    const slot = this.bodyPool[this._bodyCursor++];
    const world = this.screenToWorld(sx, sy);
    const wr = Math.max(0.3, sr / Math.max(0.0001, this._lastZoom));
    this.updateBodySlot(slot, body, body.kind, world.x, world.y, wr, opts);
  }

  drawFragment(f, sx, sy, sr) {
    if (!this.ready) return;
    if (this._fragCursor >= this.fragPool.length) return;
    const slot = this.fragPool[this._fragCursor++];
    const world = this.screenToWorld(sx, sy);
    const wr = Math.max(0.25, sr / Math.max(0.0001, this._lastZoom));
    const pal = f.palette || derivePalette(f.color || '#8f8578');
    const pseudo = { irregularShape: true, seedBucket: f.seedBucket || 0, palette: pal, spinPhase: f.angle || 0, hitFlash: 0 };
    this.updateBodySlot(slot, pseudo, 'asteroid', world.x, world.y, wr, {});
  }

  /* ============================================================
   * オーバーレイ（HPバー・浮遊テキスト・彗星の尾アップグレードの軌跡）
   * ============================================================ */
  drawTail(cam, trail, dmgRadius) {
    const ctx = this.octx;
    const n = trail.length;
    if (n < 2) return;
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 0; i < n - 1; i++) {
      const a = trail[i], b = trail[i + 1];
      const ta = Math.max(0, 1 - a.age / 0.7);
      const sa = this.worldToScreen(cam, a.x, a.y);
      const sb = this.worldToScreen(cam, b.x, b.y);
      const w = Math.max(1, dmgRadius * cam.zoom * (0.3 + ta * 0.7));
      const grad = ctx.createLinearGradient(sa.x, sa.y, sb.x, sb.y);
      grad.addColorStop(0, `rgba(160,220,255,${(ta * 0.55).toFixed(2)})`);
      grad.addColorStop(1, `rgba(210,240,255,${(ta * 0.7).toFixed(2)})`);
      ctx.strokeStyle = grad; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(sa.x, sa.y); ctx.lineTo(sb.x, sb.y); ctx.stroke();
    }
    const tail = trail[n - 1];
    const st = this.worldToScreen(cam, tail.x, tail.y);
    const coreR = Math.max(1.5, dmgRadius * cam.zoom * 0.45);
    const grad2 = ctx.createRadialGradient(st.x, st.y, 0, st.x, st.y, coreR);
    grad2.addColorStop(0, 'rgba(230,250,255,0.75)');
    grad2.addColorStop(1, 'rgba(230,250,255,0)');
    ctx.fillStyle = grad2;
    ctx.beginPath(); ctx.arc(st.x, st.y, coreR, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  drawHpBar(sx, sy, sr, ratio, color) {
    const ctx = this.octx;
    const w = Math.max(24, sr * 1.6), h = 4;
    const x = sx - w / 2, y = sy - sr - 12;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color || '#5ce0a0';
    ctx.fillRect(x, y, w * Math.max(0, ratio), h);
  }

  drawParticles(pool, cam) {
    if (!this.ready) return;
    const g = this.particlePoints.geometry;
    const pos = g.attributes.position.array;
    const col = g.attributes.aColor.array;
    const siz = g.attributes.aSize.array;
    const alp = g.attributes.aAlpha.array;
    let i = 0;
    const max = this._particleMax;
    pool.forEachActive(p => {
      if (i >= max) return;
      const t = 1 - p.age / p.life;
      const a = p.fade ? Math.max(0, t) : 1;
      const sizeMul = p.shrink ? Math.max(0.2, t) : 1;
      const c = hexToRgb(p.color || '#ffffff');
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = 0.03;
      col[i * 3] = c.r / 255; col[i * 3 + 1] = c.g / 255; col[i * 3 + 2] = c.b / 255;
      siz[i] = Math.max(0.6, p.size * sizeMul * 2.4);
      alp[i] = Math.max(0, Math.min(1, a));
      i++;
    });
    g.setDrawRange(0, i);
    g.attributes.position.needsUpdate = true;
    g.attributes.aColor.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
    g.attributes.aAlpha.needsUpdate = true;
  }

  drawFloatTexts(pool, cam) {
    const ctx = this.octx;
    ctx.textAlign = 'center';
    ctx.font = '700 15px "Segoe UI", system-ui, sans-serif';
    pool.forEachActive(p => {
      const s = this.worldToScreen(cam, p.x, p.y);
      const t = 1 - p.age / p.life;
      ctx.globalAlpha = Math.max(0, t);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, s.x, s.y);
    });
    ctx.globalAlpha = 1;
  }
}
