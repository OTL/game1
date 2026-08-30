/* ============================================================
   COSMIC EATER - render.js
   背景・天体・エフェクトの描画
   ============================================================ */
'use strict';

function derivePalette(hex) {
  const base = hexToRgb(hex);
  const dark = mixColor(base, { r: 0, g: 0, b: 0 }, 0.55);
  const light = mixColor(base, { r: 255, g: 255, b: 255 }, 0.55);
  const toHex = c => '#' + [c.r, c.g, c.b].map(v => Math.max(0, Math.min(255, v | 0)).toString(16).padStart(2, '0')).join('');
  return { base: hex, dark: toHex(dark), light: toHex(light) };
}

class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.bgLayers = null;
    this.nebulaLayers = null;
    this.ringTex = generateRingTexture(42);
    this.diskTex = generateAccretionDisk(7);
    this.shake = 0;
    this.time = 0;
    this.bgTime = 0;
    this.shootingStars = [];
    this.shootingTimer = 3 + Math.random() * 5;
    this.tint = { r: 5, g: 7, b: 16 };
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.floor(window.innerWidth * dpr);
    this.canvas.height = Math.floor(window.innerHeight * dpr);
    this.canvas.style.width = window.innerWidth + 'px';
    this.canvas.style.height = window.innerHeight + 'px';
    this.dpr = dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.initBackground();
  }

  initBackground() {
    const w = 900, h = 900;
    // 3層以上のパララックス星空。奥のレイヤーほど factor が小さくカメラ追従が弱い＝遠く見える。
    this.bgLayers = [
      { cv: generateStarfieldLayer(w, h, 3, 101), factor: 0.015, size: w, twinkle: false },
      { cv: generateStarfieldLayer(w, h, 7, 202), factor: 0.06, size: w, twinkle: true,
        stars: generateTwinkleStars(w, 26, 5001) },
      { cv: generateStarfieldLayer(w, h, 13, 303), factor: 0.16, size: w, twinkle: true,
        stars: generateTwinkleStars(w, 34, 6002) },
    ];
    // 星雲: 星空とは独立に、ごくゆっくりドリフト＋アルファゆらぎする専用レイヤー
    const nw = 1100, nh = 1100;
    this.nebulaLayers = [
      { cv: generateNebulaLayer(nw, nh, 401), factor: 0.03, size: nw, driftX: 3.2, driftY: -1.6, offX: 0, offY: 0, alphaPhase: 0, alphaSpeed: 0.10 },
      { cv: generateNebulaLayer(nw, nh, 707), factor: 0.05, size: nw, driftX: -2.1, driftY: 2.4, offX: 0, offY: 0, alphaPhase: 2.4, alphaSpeed: 0.07 },
    ];
  }

  worldToScreen(cam, x, y) {
    return {
      x: (x - cam.x) * cam.zoom + this.w / 2,
      y: (y - cam.y) * cam.zoom + this.h / 2,
    };
  }

  addShake(v) { this.shake = Math.min(18, this.shake + v); }

  clear() {
    const ctx = this.ctx;
    ctx.fillStyle = '#03040c';
    ctx.fillRect(0, 0, this.w, this.h);
  }

  /* 進化段階に応じた背景の色調（序盤は暗青 → 恒星帯は暖色寄り → 終盤は深い紫） */
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
    return {
      r: lerp(a.c.r, b.c.r, t),
      g: lerp(a.c.g, b.c.g, t),
      b: lerp(a.c.b, b.c.b, t),
    };
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
      this.shootingStars.push({
        x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
        life: 0, maxLife: 0.55 + Math.random() * 0.35,
      });
    }
    for (let i = this.shootingStars.length - 1; i >= 0; i--) {
      const s = this.shootingStars[i];
      s.life += dt;
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.life >= s.maxLife || s.x < -60 || s.x > this.w + 60 || s.y > this.h + 60) {
        this.shootingStars.splice(i, 1);
      }
    }
  }

  drawShootingStars() {
    const ctx = this.ctx;
    for (const s of this.shootingStars) {
      const t = 1 - s.life / s.maxLife;
      const len = 90 * (0.5 + t * 0.5);
      const spd = Math.hypot(s.vx, s.vy) || 1;
      const dx = -s.vx / spd, dy = -s.vy / spd;
      const grad = ctx.createLinearGradient(s.x, s.y, s.x + dx * len, s.y + dy * len);
      grad.addColorStop(0, `rgba(255,255,255,${(0.9 * t).toFixed(2)})`);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x + dx * len, s.y + dy * len); ctx.stroke();
      ctx.fillStyle = `rgba(255,255,255,${(0.9 * t).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, 1.6, 0, Math.PI * 2); ctx.fill();
    }
  }

  drawBackground(cam, dt, stageIdx) {
    dt = dt || 0;
    this.bgTime += dt;
    const ctx = this.ctx;

    // 星空（3層パララックス、星の瞬き付き）
    for (const layer of this.bgLayers) {
      const size = layer.size;
      const ox = -((cam.x * layer.factor) % size + size) % size;
      const oy = -((cam.y * layer.factor) % size + size) % size;
      for (let x = ox - size; x < this.w + size; x += size) {
        for (let y = oy - size; y < this.h + size; y += size) {
          ctx.drawImage(layer.cv, x, y, size, size);
          if (layer.twinkle && layer.stars) {
            for (const st of layer.stars) {
              const b = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(this.bgTime * st.speed + st.phase));
              ctx.fillStyle = `rgba(255,255,255,${b.toFixed(2)})`;
              ctx.beginPath(); ctx.arc(x + st.x, y + st.y, st.r, 0, Math.PI * 2); ctx.fill();
            }
          }
        }
      }
    }

    // 星雲（独自にゆっくりドリフト＋アルファゆらぎ、星空より遠い視差でスクロール）
    for (const layer of this.nebulaLayers) {
      layer.offX += layer.driftX * dt;
      layer.offY += layer.driftY * dt;
      layer.alphaPhase += dt * layer.alphaSpeed;
      const size = layer.size;
      const parallaxX = cam.x * layer.factor + layer.offX;
      const parallaxY = cam.y * layer.factor + layer.offY;
      const ox = -((parallaxX % size) + size) % size;
      const oy = -((parallaxY % size) + size) % size;
      ctx.globalAlpha = 0.75 + 0.25 * Math.sin(layer.alphaPhase);
      for (let x = ox - size; x < this.w + size; x += size) {
        for (let y = oy - size; y < this.h + size; y += size) {
          ctx.drawImage(layer.cv, x, y, size, size);
        }
      }
    }
    ctx.globalAlpha = 1;

    // 流れ星
    this.updateShootingStars(dt);
    this.drawShootingStars();

    // 進化段階に応じた色調変化（序盤は暗青 → 恒星帯は暖色 → 終盤は深い紫）
    const target = this.targetTintFor(stageIdx || 0);
    const k = 1 - Math.exp(-dt * 0.5);
    this.tint.r = lerp(this.tint.r, target.r, k);
    this.tint.g = lerp(this.tint.g, target.g, k);
    this.tint.b = lerp(this.tint.b, target.b, k);
    ctx.fillStyle = `rgba(${this.tint.r | 0},${this.tint.g | 0},${this.tint.b | 0},0.22)`;
    ctx.fillRect(0, 0, this.w, this.h);
  }

  beginFrame(dt, cam) {
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt * 40);
    const ctx = this.ctx;
    ctx.save();
    if (this.shake > 0.05) {
      const s = this.shake;
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }
  }
  endFrame() { this.ctx.restore(); }

  /* 汎用天体描画 (敵・プレイヤー共通) */
  drawBody(body, sx, sy, sr, cam, opts) {
    opts = opts || {};
    const ctx = this.ctx;
    const kind = body.kind;
    if (sr < 0.4) return;

    // グロー系(恒星・巨星・褐色矮星・中性子星)
    if (kind === 'star' || kind === 'giant' || kind === 'browndwarf' || kind === 'neutron') {
      const flick = 0.9 + Math.sin(this.time * 3 + body.seedBucket) * 0.08;
      const glowR = sr * (kind === 'neutron' ? 5.5 : 2.4) * flick;
      const grad = ctx.createRadialGradient(sx, sy, sr * 0.2, sx, sy, glowR);
      const c = hexToRgb(body.palette ? body.palette.light : '#fff');
      grad.addColorStop(0, rgbStr(c, 0.55));
      grad.addColorStop(0.4, rgbStr(c, 0.22));
      grad.addColorStop(1, rgbStr(c, 0));
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(sx, sy, glowR, 0, Math.PI * 2); ctx.fill();
    }

    if (kind === 'blackhole') {
      this.drawBlackHole(body, sx, sy, sr);
      return;
    }

    this.drawRotatingGlobe(body, sx, sy, sr);

    // 環（惑星の一部にのみ）
    if (body.hasRing) {
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate((body.angle || 0) * 0.3 + 0.5);
      ctx.scale(1, 0.34);
      const rr = sr * 1.9;
      ctx.globalAlpha = 0.85;
      ctx.drawImage(this.ringTex, -rr, -rr * 0.5, rr * 2, rr);
      ctx.restore();
    }

    // 彗星の尾
    if (kind === 'comet' && body.vx !== undefined) {
      const spd = Math.hypot(body.vx, body.vy) || 1;
      const dx = -body.vx / spd, dy = -body.vy / spd;
      const len = sr * 6;
      const grad = ctx.createLinearGradient(sx, sy, sx + dx * len, sy + dy * len);
      grad.addColorStop(0, 'rgba(200,230,255,0.55)');
      grad.addColorStop(1, 'rgba(200,230,255,0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = sr * 0.9;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + dx * len, sy + dy * len); ctx.stroke();
    }

    // ヒットフラッシュ
    if (body.hitFlash > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.7, body.hitFlash);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // 敵対フラグの縁取り
    if (body.isHostile) {
      ctx.strokeStyle = 'rgba(255,80,90,0.75)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx, sy, sr + 1.5, 0, Math.PI * 2); ctx.stroke();
    }
  }

  /* 天体を自転する球体として描画する。
   * 一定サイズ以上（画面内で大きく見える天体）はスライス単位の球面射影＋
   * ライティング／縁の減光／大気の縁光をキャッシュ済みフレームで描き、
   * それ未満の小さい・遠い天体は事前生成テクスチャを単純に回転させる
   * 近似描画にとどめて 60fps を維持する。 */
  drawRotatingGlobe(body, sx, sy, sr) {
    const ctx = this.ctx;
    const kind = body.kind;
    const spinPhase = (body.spinPhase !== undefined ? body.spinPhase : body.angle) || 0;
    const FULL_QUALITY_MIN_SR = 15;

    if (sr < FULL_QUALITY_MIN_SR || kind === 'comet') {
      // 近似描画: 静的テクスチャを緩やかに回転させるだけ（コスト最小）
      const tex = getBodyTexture(kind, body.palette, body.seedBucket % 6);
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(spinPhase * 0.4);
      ctx.drawImage(tex, -sr, -sr, sr * 2, sr * 2);
      ctx.restore();
      return;
    }

    const sizePx = Math.max(32, Math.min(220, Math.round((sr * 2) / 8) * 8));
    const twoPi = Math.PI * 2;
    const norm = ((spinPhase % twoPi) + twoPi) % twoPi;
    const frameIdx = Math.floor((norm / twoPi) * GLOBE_FRAMES) % GLOBE_FRAMES;
    const hasAtmosphere = kind === 'planet' || kind === 'gasgiant' || kind === 'browndwarf' ||
      kind === 'star' || kind === 'giant' || kind === 'neutron';
    const frame = renderGlobeFrame(kind, body.palette, body.seedBucket % 6, sizePx, frameIdx, hasAtmosphere);

    if (kind === 'star') {
      // 表面の対流ゆらぎを安価に近似（明るさの微小な明滅）
      ctx.globalAlpha = 0.92 + Math.sin(this.time * 2.4 + body.seedBucket) * 0.08;
      ctx.drawImage(frame, sx - sr, sy - sr, sr * 2, sr * 2);
      ctx.globalAlpha = 1;
    } else {
      ctx.drawImage(frame, sx - sr, sy - sr, sr * 2, sr * 2);
    }
  }

  drawBlackHole(body, sx, sy, sr) {
    const ctx = this.ctx;
    // 重力レンズ風の暈しリング
    const lensR = sr * 2.6;
    const lens = ctx.createRadialGradient(sx, sy, sr * 0.9, sx, sy, lensR);
    lens.addColorStop(0, 'rgba(155,107,255,0.0)');
    lens.addColorStop(0.55, 'rgba(120,90,220,0.18)');
    lens.addColorStop(0.75, 'rgba(180,150,255,0.10)');
    lens.addColorStop(1, 'rgba(180,150,255,0)');
    ctx.fillStyle = lens;
    ctx.beginPath(); ctx.arc(sx, sy, lensR, 0, Math.PI * 2); ctx.fill();

    // 降着円盤
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(this.time * 0.5);
    const dr = sr * 2.1;
    ctx.globalAlpha = 0.9;
    ctx.drawImage(this.diskTex, -dr, -dr, dr * 2, dr * 2);
    ctx.restore();

    // 事象の地平線（真っ黒）
    const eh = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
    eh.addColorStop(0, '#000000');
    eh.addColorStop(0.85, '#000000');
    eh.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = eh;
    ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
  }

  drawFragment(f, sx, sy, sr) {
    const ctx = this.ctx;
    ctx.fillStyle = f.color;
    ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.arc(sx - sr * 0.3, sy - sr * 0.3, sr * 0.35, 0, Math.PI * 2); ctx.fill();
  }

  drawHpBar(sx, sy, sr, ratio, color) {
    const ctx = this.ctx;
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
    const ctx = this.ctx;
    pool.forEachActive(p => {
      const s = this.worldToScreen(cam, p.x, p.y);
      const t = 1 - p.age / p.life;
      ctx.globalAlpha = p.fade ? Math.max(0, t) : 1;
      const size = (p.shrink ? Math.max(0.2, t) : 1) * p.size * cam.zoom;
      if (p.kind === 'spark') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = size * 0.6;
        ctx.beginPath();
        ctx.moveTo(s.x - p.vx * 0.01, s.y - p.vy * 0.01);
        ctx.lineTo(s.x, s.y);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(s.x, s.y, size, 0, Math.PI * 2); ctx.fill();
      }
    });
    ctx.globalAlpha = 1;
  }

  drawFloatTexts(pool, cam) {
    const ctx = this.ctx;
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
