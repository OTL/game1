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
    this.ringTex = generateRingTexture(42);
    this.diskTex = generateAccretionDisk(7);
    this.shake = 0;
    this.time = 0;
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
    this.bgLayers = [
      { cv: generateStarfieldLayer(w, h, 4, 101, true), factor: 0.02, size: w },
      { cv: generateStarfieldLayer(w, h, 8, 202, false), factor: 0.08, size: w },
      { cv: generateStarfieldLayer(w, h, 14, 303, false), factor: 0.18, size: w },
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

  drawBackground(cam) {
    const ctx = this.ctx;
    for (const layer of this.bgLayers) {
      const size = layer.size;
      const ox = -((cam.x * layer.factor) % size + size) % size;
      const oy = -((cam.y * layer.factor) % size + size) % size;
      for (let x = ox - size; x < this.w + size; x += size) {
        for (let y = oy - size; y < this.h + size; y += size) {
          ctx.drawImage(layer.cv, x, y, size, size);
        }
      }
    }
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

    const tex = getBodyTexture(kind, body.palette, body.seedBucket % 6);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(body.angle || 0);
    ctx.drawImage(tex, -sr, -sr, sr * 2, sr * 2);
    ctx.restore();

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
