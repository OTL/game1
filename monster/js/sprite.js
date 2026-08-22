// ドット絵ジェネレータ。
// 64x64 のグリッドに図形を描き、フチどり＋陰影を自動でつけて
// ポケモンっぽい正面向きのスプライトに仕上げる。画像ファイルは 1 枚も使わない。
(function (global) {
  'use strict';

  const G = 64;          // グリッドの一辺
  const CX = 32;         // 中心
  const GROUND = 60;     // 足もとの高さ

  // パレット番号
  const E = 0, BODY = 1, BODY_L = 2, BODY_D = 3, ACC = 4, ACC_D = 5,
        BELLY = 6, HORN = 7, EYE_W = 8, PUPIL = 9, MOUTH = 10, CHEEK = 11, LINE = 12;

  function hsl(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s = Math.max(0, Math.min(100, s)) / 100;
    l = Math.max(0, Math.min(100, l)) / 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60)       { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else              { r = c; b = x; }
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
  }

  function palette(look) {
    const h = look.hue, s = look.sat, l = look.light;
    const p = [];
    p[E]      = [0, 0, 0, 0];
    p[BODY]   = hsl(h, s, l);
    p[BODY_L] = hsl(h + 6, s - 8, l + 13);
    p[BODY_D] = hsl(h - 6, s + 6, l - 17);
    p[ACC]    = hsl(look.hue2, s + 4, l + 4);
    p[ACC_D]  = hsl(look.hue2 - 6, s + 8, l - 15);
    p[BELLY]  = hsl(h + 24, 42, 89);
    p[HORN]   = hsl(h + 30, 38, 84);
    p[EYE_W]  = [255, 255, 255];
    p[PUPIL]  = hsl(h, 30, 16);
    p[MOUTH]  = hsl(h - 10, 40, 22);
    p[CHEEK]  = hsl(348, 78, 70);
    p[LINE]   = hsl(h, 40, 15);
    return p.map((c) => (c.length === 4 ? c : [c[0], c[1], c[2], 255]));
  }

  // ---- 描画プリミティブ -------------------------------------------------

  function makeGrid() { return new Uint8Array(G * G); }
  function put(g, x, y, c) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= G || y >= G) return;
    g[y * G + x] = c;
  }
  function get(g, x, y) {
    if (x < 0 || y < 0 || x >= G || y >= G) return E;
    return g[y * G + x];
  }

  function ellipse(g, cx, cy, rx, ry, c) {
    rx = Math.max(0.6, rx); ry = Math.max(0.6, ry);
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1.0) put(g, x, y, c);
      }
    }
  }
  // 左右対称に 2 個描く
  function sym(g, dx, cy, rx, ry, c) {
    ellipse(g, CX - dx, cy, rx, ry, c);
    ellipse(g, CX + dx, cy, rx, ry, c);
  }
  function rect(g, x0, y0, w, h, c) {
    for (let y = Math.round(y0); y < Math.round(y0 + h); y++) {
      for (let x = Math.round(x0); x < Math.round(x0 + w); x++) put(g, x, y, c);
    }
  }
  function symRect(g, dx, y0, w, h, c) {
    rect(g, CX - dx - w / 2, y0, w, h, c);
    rect(g, CX + dx - w / 2, y0, w, h, c);
  }
  // 先細りの三角（つの・しっぽ・つばさの先に使う）
  function spike(g, x0, y0, x1, y1, w, c) {
    const steps = Math.max(3, Math.round(Math.hypot(x1 - x0, y1 - y0) * 2));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const r = Math.max(0.5, w * (1 - t));
      ellipse(g, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r, r, c);
    }
  }
  function symSpike(g, dx0, y0, dx1, y1, w, c) {
    spike(g, CX - dx0, y0, CX - dx1, y1, w, c);
    spike(g, CX + dx0, y0, CX + dx1, y1, w, c);
  }

  // ---- パーツ -----------------------------------------------------------

  function drawEyes(g, hx, hy, hr, look, closed) {
    const dx = hr * 0.44;
    const ey = hy - hr * 0.05;
    const big = look.eyeType === 0 ? 1.15 : (look.eyeType === 1 ? 1.0 : 0.85);
    const rx = Math.max(1.4, hr * 0.24 * big);
    const ry = Math.max(1.6, hr * 0.30 * big);
    if (closed) {
      for (const s of [-1, 1]) {
        for (let i = -Math.round(rx); i <= Math.round(rx); i++) {
          put(g, hx + s * dx + i, ey + Math.round(Math.abs(i) * 0.4) - 1, PUPIL);
        }
      }
      return;
    }
    for (const s of [-1, 1]) {
      const ex = hx + s * dx;
      ellipse(g, ex, ey, rx, ry, EYE_W);
      // 黒目は少し下＆内寄り
      ellipse(g, ex - s * rx * 0.12, ey + ry * 0.18, rx * 0.62, ry * 0.62, PUPIL);
      // ハイライト
      put(g, ex - s * rx * 0.35, ey - ry * 0.4, EYE_W);
      if (look.eyeType === 3) {   // つり目：まぶたのライン
        for (let i = -Math.round(rx); i <= Math.round(rx); i++) {
          put(g, ex + i, ey - ry - (s > 0 ? Math.round(i * 0.3) : Math.round(-i * 0.3)), LINE);
        }
      }
    }
  }

  function drawMouth(g, hx, hy, hr, look) {
    const my = hy + hr * 0.48;
    const w = Math.max(1, Math.round(hr * 0.18));
    for (let i = -w; i <= w; i++) {
      put(g, hx + i, my + Math.round(Math.abs(i) * 0.55), MOUTH);
    }
    if (look.stage >= 3 && look.branch === 'atk') {  // きば
      put(g, hx - w - 1, my + 1, HORN);
      put(g, hx + w + 1, my + 1, HORN);
    }
  }

  function drawEars(g, hx, hy, hr, look) {
    const t = look.earType;
    if (t === 1) {                     // まるみみ
      sym(g, hr * 0.72, hy - hr * 0.72, hr * 0.3, hr * 0.3, BODY);
      sym(g, hr * 0.72, hy - hr * 0.72, hr * 0.16, hr * 0.16, ACC);
    } else if (t === 2) {              // とがりみみ
      symSpike(g, hr * 0.6, hy - hr * 0.55, hr * 1.0, hy - hr * 1.6, hr * 0.26, BODY);
    } else if (t === 3) {              // つの
      symSpike(g, hr * 0.42, hy - hr * 0.75, hr * 0.62, hy - hr * 1.55, hr * 0.2, HORN);
    } else if (t === 4) {              // しょっかく
      symSpike(g, hr * 0.32, hy - hr * 0.85, hr * 0.95, hy - hr * 1.95, hr * 0.16, ACC);
      sym(g, hr * 0.95, hy - hr * 1.95, hr * 0.3, hr * 0.3, ACC);
    }
    if (look.horn) {                   // 進化ぶんの大きなツノ
      spike(g, CX, hy - hr * 0.95, CX, hy - hr * 1.9, hr * 0.24, HORN);
    }
    if (look.stage >= 3 && look.branch === 'spd') {  // ヒレ状のたてがみ
      symSpike(g, hr * 0.9, hy, hr * 1.5, hy - hr * 0.8, hr * 0.18, ACC);
    }
  }

  function drawHead(g, hx, hy, hr, look, closed, merged) {
    if (!merged) ellipse(g, hx, hy, hr * 1.02, hr, BODY);
    drawEars(g, hx, hy, hr, look);
    if (look.stage >= 3 && look.branch === 'def') {   // ひたいのプレート
      ellipse(g, hx, hy - hr * 0.55, hr * 0.7, hr * 0.28, HORN);
    }
    drawEyes(g, hx, hy, hr, look, closed);
    drawMouth(g, hx, hy, hr, look);
    if (look.cheek) {
      sym(g, hr * 0.78, hy + hr * 0.22, hr * 0.2, hr * 0.14, CHEEK);
    }
  }

  // 別レイヤーに描いて、先にフチどりしてから合成する。
  // こうすると つばさ や しっぽ が からだに溶けこまず、輪郭が出る。
  function layer(g, fn) {
    const tmp = makeGrid();
    fn(tmp);
    outline(tmp);
    for (let i = 0; i < tmp.length; i++) if (tmp[i] !== E) g[i] = tmp[i];
  }

  function drawTail(g, x, y, r, look) {
    const t = look.tailType;
    if (t === 0) return;
    if (t === 1) {                     // ほそながい
      spike(g, x, y, x + r * 2.6, y - r * 1.7, r * 0.4, BODY);
    } else if (t === 2) {              // さきっぽが玉
      spike(g, x, y, x + r * 2.2, y - r * 1.5, r * 0.3, BODY);
      ellipse(g, x + r * 2.4, y - r * 1.65, r * 0.5, r * 0.5, ACC);
    } else if (t === 3) {              // ふさふさ
      ellipse(g, x + r * 1.3, y - r * 0.6, r * 0.8, r * 0.65, ACC);
      ellipse(g, x + r * 2.1, y - r * 1.4, r * 0.62, r * 0.58, ACC);
    } else {                           // ぎざぎざ
      spike(g, x, y, x + r * 1.7, y - r * 0.4, r * 0.42, BODY);
      spike(g, x + r * 1.7, y - r * 0.4, x + r * 2.5, y - r * 1.6, r * 0.3, ACC);
    }
  }

  function drawWings(g, cy, r, look) {
    const big = look.stage >= 3 ? 1.15 : 0.95;
    const wr = r * 0.7 * big;
    sym(g, r * 1.2, cy - r * 0.4, wr * 0.78, wr * 1.0, ACC_D);
    symSpike(g, r * 1.15, cy - r * 0.5, r * 1.85 * big, cy - r * 1.45 * big, r * 0.32, ACC_D);
    symSpike(g, r * 1.25, cy - r * 0.05, r * 1.95 * big, cy - r * 0.6 * big, r * 0.24, ACC_D);
  }

  function drawBelly(g, cx, cy, rx, ry, look) {
    if (!look.belly) return;
    ellipse(g, cx, cy + ry * 0.22, rx * 0.58, ry * 0.62, BELLY);
  }

  function drawSpots(g, cx, cy, rx, ry, look) {
    if (!look.spots) return;
    const r = Rng.makeRng('spots:' + look.hue + look.plan + look.spots);
    for (let i = 0; i < look.spots * 2; i++) {
      const a = r() * Math.PI * 2;
      const d = 0.4 + r() * 0.4;
      ellipse(g, cx + Math.cos(a) * rx * d, cy + Math.sin(a) * ry * d * 0.8,
              rx * 0.15, ry * 0.13, ACC);
    }
  }

  // ---- からだのかたち ---------------------------------------------------

  function buildBody(g, look, closed) {
    const s = look.stage <= 1 ? 0.66 : (look.stage === 2 ? 0.82 : 1.0);
    const chub = look.chubby * (look.slim ? 0.85 : 1);
    const R = 13 * s * chub;              // からだの基準半径
    const headScale = (look.stage <= 1 ? 1.28 : (look.stage === 2 ? 1.05 : 0.9)) * look.headBig;

    if (look.wing) layer(g, (t) => drawWings(t, GROUND - R * 1.3, R, look));

    if (look.plan === 'blob') {
      const cy = GROUND - R * 1.0;
      layer(g, (t) => drawTail(t, CX + R * 0.35, cy + R * 0.45, R * 0.55, look));   // しっぽは からだの うしろ
      ellipse(g, CX, cy, R * 1.12, R * 1.02, BODY);
      sym(g, R * 0.62, GROUND - R * 0.12, R * 0.36, R * 0.2, BODY);   // あんよ
      drawBelly(g, CX, cy + R * 0.1, R * 1.0, R * 0.9, look);
      drawSpots(g, CX, cy, R * 1.0, R * 0.9, look);
      drawHead(g, CX, cy - R * 0.18, R * 0.82 * headScale, look, closed, true);

    } else if (look.plan === 'beast') {
      const cy = GROUND - R * 0.95;
      layer(g, (t) => drawTail(t, CX + R * 0.6, cy - R * 0.15, R * 0.65, look));
      symRect(g, R * 0.75, cy + R * 0.3, Math.max(2, R * 0.34), R * 0.85, BODY_D); // うしろあし
      ellipse(g, CX, cy, R * 1.25, R * 0.82, BODY);
      symRect(g, R * 0.85, cy + R * 0.35, Math.max(2, R * 0.36), R * 0.75, BODY);  // まえあし
      sym(g, R * 0.85, GROUND - R * 0.1, R * 0.26, R * 0.16, BODY_D);
      drawBelly(g, CX, cy + R * 0.15, R * 1.0, R * 0.7, look);
      drawSpots(g, CX, cy, R * 1.1, R * 0.7, look);
      const hr = R * 0.72 * headScale;
      drawHead(g, CX, cy - R * 0.95 - hr * 0.35, hr, look, closed, false);
      ellipse(g, CX, cy - R * 0.8, R * 0.42, R * 0.35, BODY);  // くび

    } else if (look.plan === 'biped') {
      const cy = GROUND - R * 1.15;
      layer(g, (t) => drawTail(t, CX + R * 0.3, cy + R * 0.6, R * 0.6, look));
      symRect(g, R * 0.42, cy + R * 0.55, Math.max(2, R * 0.34), R * 0.72, BODY);  // あし
      sym(g, R * 0.5, GROUND - R * 0.1, R * 0.28, R * 0.16, BODY_D);
      ellipse(g, CX, cy, R * 0.82, R * 1.0, BODY);                                  // どうたい
      symSpike(g, R * 0.78, cy - R * 0.35, R * 1.25, cy + R * 0.5, R * 0.26, BODY); // うで
      drawBelly(g, CX, cy + R * 0.1, R * 0.72, R * 0.9, look);
      drawSpots(g, CX, cy, R * 0.7, R * 0.9, look);
      const hr = R * 0.78 * headScale;
      drawHead(g, CX, cy - R * 1.05 - hr * 0.3, hr, look, closed, false);

    } else if (look.plan === 'wing') {
      const cy = GROUND - R * 1.15;
      layer(g, (t) => drawTail(t, CX + R * 0.3, cy + R * 0.45, R * 0.6, look));
      ellipse(g, CX, cy, R * 0.9, R * 0.95, BODY);
      symSpike(g, R * 0.3, GROUND - R * 0.45, R * 0.45, GROUND - R * 0.02, R * 0.16, HORN);
      sym(g, R * 0.45, GROUND - R * 0.05, R * 0.3, R * 0.12, HORN);
      drawBelly(g, CX, cy + R * 0.15, R * 0.8, R * 0.85, look);
      drawSpots(g, CX, cy, R * 0.8, R * 0.8, look);
      const hr = R * 0.7 * headScale;
      drawHead(g, CX, cy - R * 0.95 - hr * 0.25, hr, look, closed, false);

    } else if (look.plan === 'serpent') {
      for (let i = 0; i < 4; i++) {
        const t = i / 3;
        const rr = R * (0.95 - t * 0.3);
        const off = Math.sin(i * 1.7) * R * 0.35;
        ellipse(g, CX + off, GROUND - R * 0.4 - i * R * 0.62, rr, rr * 0.55, i % 2 ? BODY_D : BODY);
      }
      drawBelly(g, CX, GROUND - R * 0.7, R * 0.55, R * 0.4, look);
      const hr = R * 0.7 * headScale;
      drawHead(g, CX + Math.sin(3 * 1.7) * R * 0.35, GROUND - R * 0.4 - 3.6 * R * 0.62 - hr * 0.4,
               hr, look, closed, false);

    } else { // bug
      const cy = GROUND - R * 0.9;
      symSpike(g, R * 0.5, cy, R * 1.3, cy + R * 0.7, R * 0.14, BODY_D);
      symSpike(g, R * 0.5, cy + R * 0.2, R * 1.35, cy + R * 0.95, R * 0.14, BODY_D);
      ellipse(g, CX, cy + R * 0.35, R * 0.85, R * 0.65, BODY);
      ellipse(g, CX, cy - R * 0.4, R * 0.72, R * 0.6, ACC);
      drawSpots(g, CX, cy + R * 0.3, R * 0.7, R * 0.55, look);
      const hr = R * 0.62 * headScale;
      drawHead(g, CX, cy - R * 1.15 - hr * 0.2, hr, look, closed, false);
    }

    if (look.armor) {  // まもりがた：かたのプレート
      sym(g, R * 0.95, GROUND - R * 1.5, R * 0.45, R * 0.3, HORN);
    }
  }

  function buildEgg(g, look, t) {
    const wob = Math.sin(t * 2.2) * 1.2;
    const cy = GROUND - 15;
    // タマゴのかたち（上が細い）
    for (let y = -17; y <= 15; y++) {
      const ny = y / 17;
      const w = 12.5 * Math.sqrt(Math.max(0, 1 - ny * ny)) * (ny < 0 ? 0.88 + 0.12 * (1 + ny) : 1);
      for (let x = -Math.ceil(w); x <= Math.ceil(w); x++) {
        put(g, CX + x + wob, cy + y, BODY);
      }
    }
    const p = look.eggPattern;
    if (p === 0) {           // みずたま
      for (let i = 0; i < 7; i++) {
        const r = Rng.makeRng('egg' + look.eggHue + i);
        ellipse(g, CX + wob + (r() - 0.5) * 18, cy + (r() - 0.5) * 26, 2.6, 2.6, ACC);
      }
    } else if (p === 1) {    // よこじま
      for (let y = -8; y <= 10; y += 7) rect(g, CX - 13 + wob, cy + y, 26, 3, ACC);
      for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
        if (get(g, x, y) === ACC && get(g, x, y - 1) === E) put(g, x, y, E);
      }
    } else if (p === 2) {    // ぎざぎざ
      for (let x = -13; x <= 13; x++) {
        put(g, CX + x + wob, cy + 2 + (Math.abs((x % 6) - 3) - 1.5) * 1.6, ACC);
        put(g, CX + x + wob, cy + 3 + (Math.abs((x % 6) - 3) - 1.5) * 1.6, ACC);
      }
    } else {                 // ほし
      spike(g, CX + wob, cy - 6, CX + wob, cy + 2, 3.2, ACC);
      spike(g, CX - 7 + wob, cy - 1, CX + 7 + wob, cy - 1, 2.4, ACC);
    }
    // ハイライト
    ellipse(g, CX - 5 + wob, cy - 8, 2.6, 3.6, BODY_L);
  }

  // ---- しあげ（陰影とフチどり） -----------------------------------------

  const SHADE_LIGHT = {}; SHADE_LIGHT[BODY] = BODY_L; SHADE_LIGHT[ACC] = ACC;
  const SHADE_DARK  = {}; SHADE_DARK[BODY] = BODY_D; SHADE_DARK[ACC] = ACC_D; SHADE_DARK[BELLY] = BELLY;

  function shade(g) {
    const src = g.slice();
    for (let y = 0; y < G; y++) {
      for (let x = 0; x < G; x++) {
        const c = src[y * G + x];
        if (c !== BODY && c !== ACC) continue;
        const upEmpty = src[(y - 1) * G + x] === undefined || y === 0 || src[(y - 1) * G + x] === E;
        const downEmpty = y >= G - 1 || src[(y + 1) * G + x] === E || src[(y + 2) * G + x] === E;
        if (upEmpty && SHADE_LIGHT[c] !== undefined) g[y * G + x] = SHADE_LIGHT[c];
        else if (downEmpty && SHADE_DARK[c] !== undefined) g[y * G + x] = SHADE_DARK[c];
      }
    }
  }

  function outline(g) {
    const src = g.slice();
    for (let y = 0; y < G; y++) {
      for (let x = 0; x < G; x++) {
        if (src[y * G + x] !== E) continue;
        if (get(src, x - 1, y) !== E || get(src, x + 1, y) !== E ||
            get(src, x, y - 1) !== E || get(src, x, y + 1) !== E) {
          g[y * G + x] = LINE;
        }
      }
    }
  }

  // ---- 公開 API ---------------------------------------------------------

  const cache = new Map();

  function build(look, closed, t) {
    const key = JSON.stringify(look) + '|' + (closed ? 1 : 0) + '|' + (look.stage <= 0 ? Math.round(t * 4) : 0);
    if (cache.has(key)) return cache.get(key);
    const g = makeGrid();
    if (look.stage <= 0) buildEgg(g, look, t || 0);
    else buildBody(g, look, closed);
    shade(g);
    outline(g);
    const pal = palette(look);
    const img = { grid: g, pal: pal };
    if (cache.size > 240) cache.clear();
    cache.set(key, img);
    return img;
  }

  // オフスクリーンの 64x64 キャンバスに焼いてから拡大描画する
  const off = document.createElement('canvas');
  off.width = G; off.height = G;
  const offCtx = off.getContext('2d');

  function bake(img) {
    const data = offCtx.createImageData(G, G);
    const d = data.data;
    for (let i = 0; i < G * G; i++) {
      const c = img.pal[img.grid[i]] || [0, 0, 0, 0];
      d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = c[3];
    }
    offCtx.putImageData(data, 0, 0);
    return off;
  }

  // ctx に描く。x,y は描画エリアの左上、size は一辺のピクセル数。
  function draw(ctx, look, x, y, size, opts) {
    opts = opts || {};
    const img = build(look, !!opts.blink, opts.time || 0);
    bake(img);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    const scale = size / G;
    if (opts.flip) {
      ctx.translate(x + size, y);
      ctx.scale(-1, 1);
      ctx.translate(-x, -y);
    }
    const dy = (opts.bob || 0) * scale;
    const sq = opts.squash || 0;   // つぶれ具合（あそび・こうげき用）
    ctx.drawImage(off, 0, 0, G, G,
      x - size * sq * 0.5, y + dy + size * sq,
      size * (1 + sq), size * (1 - sq));
    ctx.restore();
  }

  function drawShadow(ctx, x, y, size, alpha) {
    ctx.save();
    ctx.fillStyle = 'rgba(10,14,30,' + (alpha === undefined ? 0.28 : alpha) + ')';
    ctx.beginPath();
    ctx.ellipse(x + size / 2, y + size * (GROUND + 2) / G, size * 0.22, size * 0.045, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // アイコンなど、単体の PNG が欲しいとき用
  function toDataURL(look, size) {
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    draw(c.getContext('2d'), look, 0, 0, size, {});
    return c.toDataURL();
  }

  global.Sprite = { draw, drawShadow, toDataURL, GRID: G, GROUND };
})(window);
