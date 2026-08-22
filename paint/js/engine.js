/* engine.js — レイヤー・描画・表示変形・履歴を持つお絵かきエンジン。
   ・レイヤーは下から順に layers[0], layers[1], ... （配列の末尾が一番上）
   ・1 ストロークはまず scratch（作業用キャンバス）に不透明で描き、
     指を離したときにまとめて不透明度・合成方法つきでレイヤーへ転写する。
     こうすると重ね塗りで濃くならず、半透明のペンがきれいに出る。       */
const Engine = (function () {

  const view = document.getElementById('view');
  const vctx = view.getContext('2d');

  let W = 1280, H = 960;                 // 作品（キャンバス）のピクセルサイズ
  let dpr = 1;
  const layers = [];
  let active = 0;
  let seq = 0;
  let bg = '#ffffff';

  let scratch, sctx;                     // ストロークの作業用
  let snap, snapctx;                     // ストローク前のレイヤー控え（Undo 用）
  let prev, prevctx;                     // 消しゴム/マーカーのプレビュー合成用
  let flat, flatctx;                     // 書き出し・バケツ・サムネ用の合成先

  const tf = { scale: 1, tx: 0, ty: 0 };
  const undoStack = [], redoStack = [];
  const UNDO_MAX = 50;

  let stroke = null;
  let dirty = true;
  const handlers = {};

  let brush = Brushes.get('pen');
  const opt = { color: '#222222', size: 8, opacity: 1, stabilizer: 3, symmetry: 'none' };

  /* ---------- イベント ---------- */
  function on(name, fn) { (handlers[name] || (handlers[name] = [])).push(fn); }
  function emit(name, arg) { (handlers[name] || []).forEach(fn => fn(arg)); }

  /* ---------- 生成 ---------- */
  function makeCanvas(w, h) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    return cv;
  }

  function makeLayer(name) {
    const cv = makeCanvas(W, H);
    return {
      id: ++seq,
      name: name || ('レイヤー ' + (seq)),
      canvas: cv,
      ctx: cv.getContext('2d'),
      visible: true,
      opacity: 1
    };
  }

  function init(w, h) {
    W = w; H = h;
    layers.length = 0;
    seq = 0;
    scratch = makeCanvas(W, H); sctx = scratch.getContext('2d');
    snap = makeCanvas(W, H); snapctx = snap.getContext('2d');
    prev = makeCanvas(W, H); prevctx = prev.getContext('2d');
    flat = makeCanvas(W, H); flatctx = flat.getContext('2d');
    layers.push(makeLayer('レイヤー 1'));
    active = 0;
    undoStack.length = redoStack.length = 0;
    fitView();
    changed();
  }

  function size() { return { w: W, h: H }; }

  /* ---------- 表示 ---------- */
  function resizeView() {
    const rect = view.parentElement.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    view.width = Math.max(1, Math.round(rect.width * dpr));
    view.height = Math.max(1, Math.round(rect.height * dpr));
    view.style.width = rect.width + 'px';
    view.style.height = rect.height + 'px';
    dirty = true;
  }

  function fitView() {
    const rect = view.parentElement.getBoundingClientRect();
    const s = Math.min(rect.width / W, rect.height / H) * 0.92;
    tf.scale = s;
    tf.tx = (rect.width - W * s) / 2;
    tf.ty = (rect.height - H * s) / 2;
    dirty = true;
    emit('view');
  }

  function clampView() {
    const rect = view.parentElement.getBoundingClientRect();
    const margin = 80;
    tf.tx = Math.min(rect.width - margin, Math.max(margin - W * tf.scale, tf.tx));
    tf.ty = Math.min(rect.height - margin, Math.max(margin - H * tf.scale, tf.ty));
  }

  function zoomAt(factor, cx, cy) {
    const s = Math.max(0.05, Math.min(16, tf.scale * factor));
    const k = s / tf.scale;
    tf.tx = cx - (cx - tf.tx) * k;
    tf.ty = cy - (cy - tf.ty) * k;
    tf.scale = s;
    clampView();
    dirty = true;
    emit('view');
  }

  function panBy(dx, dy) {
    tf.tx += dx; tf.ty += dy;
    clampView();
    dirty = true;
  }

  function toCanvas(clientX, clientY) {
    const rect = view.getBoundingClientRect();
    return {
      x: (clientX - rect.left - tf.tx) / tf.scale,
      y: (clientY - rect.top - tf.ty) / tf.scale
    };
  }

  function render() {
    if (!dirty) return;
    dirty = false;
    vctx.setTransform(1, 0, 0, 1, 0, 0);
    vctx.clearRect(0, 0, view.width, view.height);
    vctx.save();
    vctx.translate(tf.tx * dpr, tf.ty * dpr);
    vctx.scale(tf.scale * dpr, tf.scale * dpr);
    vctx.imageSmoothingEnabled = tf.scale < 3;

    vctx.fillStyle = bg;
    vctx.fillRect(0, 0, W, H);

    for (let i = 0; i < layers.length; i++) {
      const L = layers[i];
      if (!L.visible || L.opacity <= 0) continue;
      const drawingHere = stroke && i === stroke.layerIndex;
      if (drawingHere && brushNeedsPreview(stroke.brush)) {
        prevctx.setTransform(1, 0, 0, 1, 0, 0);
        prevctx.globalCompositeOperation = 'source-over';
        prevctx.globalAlpha = 1;
        prevctx.clearRect(0, 0, W, H);
        prevctx.drawImage(L.canvas, 0, 0);
        prevctx.globalCompositeOperation = stroke.brush.composite;
        prevctx.globalAlpha = stroke.opacity;
        prevctx.drawImage(scratch, 0, 0);
        prevctx.globalCompositeOperation = 'source-over';
        prevctx.globalAlpha = 1;
        vctx.globalAlpha = L.opacity;
        vctx.drawImage(prev, 0, 0);
      } else {
        vctx.globalAlpha = L.opacity;
        vctx.drawImage(L.canvas, 0, 0);
        if (drawingHere) {
          vctx.globalAlpha = L.opacity * stroke.opacity;
          vctx.drawImage(scratch, 0, 0);
        }
      }
    }
    vctx.globalAlpha = 1;
    vctx.restore();

    // 用紙のふち
    vctx.setTransform(1, 0, 0, 1, 0, 0);
    vctx.strokeStyle = 'rgba(255,255,255,0.22)';
    vctx.lineWidth = 1;
    vctx.strokeRect(tf.tx * dpr - 0.5, tf.ty * dpr - 0.5, W * tf.scale * dpr + 1, H * tf.scale * dpr + 1);
  }

  function brushNeedsPreview(b) {
    return b.composite !== 'source-over';
  }

  function loop() {
    render();
    requestAnimationFrame(loop);
  }

  function invalidate() { dirty = true; }

  function changed() {
    dirty = true;
    emit('change');
  }

  /* ---------- レイヤー操作 ---------- */
  function getLayers() { return layers; }
  function getActiveIndex() { return active; }
  function activeLayer() { return layers[active]; }
  function setActive(i) {
    if (i < 0 || i >= layers.length) return;
    active = i;
    changed();
  }

  function pushCmd(cmd) {
    undoStack.push(cmd);
    if (undoStack.length > UNDO_MAX) undoStack.shift();
    redoStack.length = 0;
    emit('history');
  }

  function addLayer() {
    if (layers.length >= 12) return false;
    const L = makeLayer();
    const at = active + 1;
    layers.splice(at, 0, L);
    active = at;
    pushCmd({
      undo() { layers.splice(at, 1); active = Math.min(at - 1, layers.length - 1); changed(); },
      redo() { layers.splice(at, 0, L); active = at; changed(); }
    });
    changed();
    return true;
  }

  function duplicateLayer() {
    if (layers.length >= 12) return false;
    const src = activeLayer();
    const L = makeLayer(src.name + ' のコピー');
    L.ctx.drawImage(src.canvas, 0, 0);
    L.opacity = src.opacity;
    const at = active + 1;
    layers.splice(at, 0, L);
    active = at;
    pushCmd({
      undo() { layers.splice(at, 1); active = at - 1; changed(); },
      redo() { layers.splice(at, 0, L); active = at; changed(); }
    });
    changed();
    return true;
  }

  function deleteLayer() {
    if (layers.length <= 1) return false;
    const at = active;
    const L = layers[at];
    layers.splice(at, 1);
    active = Math.max(0, at - 1);
    pushCmd({
      undo() { layers.splice(at, 0, L); active = at; changed(); },
      redo() { layers.splice(at, 1); active = Math.max(0, at - 1); changed(); }
    });
    changed();
    return true;
  }

  function moveLayer(dir) {
    const to = active + dir;
    if (to < 0 || to >= layers.length) return false;
    const from = active;
    const swap = () => {
      const t = layers[from]; layers[from] = layers[to]; layers[to] = t;
    };
    swap();
    active = to;
    pushCmd({
      undo() { swap(); active = from; changed(); },
      redo() { swap(); active = to; changed(); }
    });
    changed();
    return true;
  }

  function mergeDown() {
    if (active === 0) return false;
    const upper = layers[active], lower = layers[active - 1];
    const before = lower.ctx.getImageData(0, 0, W, H);
    const lowerOpacity = lower.opacity;
    lower.ctx.globalAlpha = upper.opacity;
    lower.ctx.drawImage(upper.canvas, 0, 0);
    lower.ctx.globalAlpha = 1;
    const after = lower.ctx.getImageData(0, 0, W, H);
    const at = active;
    layers.splice(at, 1);
    active = at - 1;
    pushCmd({
      undo() {
        lower.ctx.putImageData(before, 0, 0);
        lower.opacity = lowerOpacity;
        layers.splice(at, 0, upper);
        active = at;
        changed();
      },
      redo() {
        lower.ctx.putImageData(after, 0, 0);
        layers.splice(at, 1);
        active = at - 1;
        changed();
      }
    });
    changed();
    return true;
  }

  function setLayerVisible(i, v) {
    const L = layers[i];
    const before = L.visible;
    L.visible = v;
    pushCmd({
      undo() { L.visible = before; changed(); },
      redo() { L.visible = v; changed(); }
    });
    changed();
  }

  /* 不透明度はドラッグ中にどんどん変わるので、変更中は履歴に積まない */
  function setLayerOpacity(i, v, commit, startValue) {
    layers[i].opacity = v;
    dirty = true;
    if (commit && startValue !== undefined && startValue !== v) {
      const L = layers[i];
      pushCmd({
        undo() { L.opacity = startValue; changed(); },
        redo() { L.opacity = v; changed(); }
      });
    }
    emit('change');
  }

  function renameLayer(i, name) {
    layers[i].name = name;
    emit('change');
  }

  function clearLayer() {
    const L = activeLayer();
    const before = L.ctx.getImageData(0, 0, W, H);
    L.ctx.clearRect(0, 0, W, H);
    pushCmd({
      undo() { L.ctx.putImageData(before, 0, 0); changed(); },
      redo() { L.ctx.clearRect(0, 0, W, H); changed(); }
    });
    changed();
  }

  function clearAll() {
    const snapshots = layers.map(L => ({ L, data: L.ctx.getImageData(0, 0, W, H) }));
    const beforeBg = bg;
    layers.forEach(L => L.ctx.clearRect(0, 0, W, H));
    pushCmd({
      undo() { snapshots.forEach(s => s.L.ctx.putImageData(s.data, 0, 0)); bg = beforeBg; changed(); },
      redo() { layers.forEach(L => L.ctx.clearRect(0, 0, W, H)); changed(); }
    });
    changed();
  }

  function setBackground(color) {
    const before = bg;
    if (before === color) return;
    bg = color;
    pushCmd({
      undo() { bg = before; changed(); },
      redo() { bg = color; changed(); }
    });
    changed();
  }

  function getBackground() { return bg; }

  /* ---------- 履歴 ---------- */
  function undo() {
    const cmd = undoStack.pop();
    if (!cmd) return;
    cmd.undo();
    redoStack.push(cmd);
    emit('history');
  }

  function redo() {
    const cmd = redoStack.pop();
    if (!cmd) return;
    cmd.redo();
    undoStack.push(cmd);
    emit('history');
  }

  function canUndo() { return undoStack.length > 0; }
  function canRedo() { return redoStack.length > 0; }

  /* ピクセル書き換えの前後を、変化した矩形ぶんだけ履歴に積む */
  function beginPixelEdit() {
    snapctx.setTransform(1, 0, 0, 1, 0, 0);
    snapctx.globalCompositeOperation = 'source-over';
    snapctx.globalAlpha = 1;
    snapctx.clearRect(0, 0, W, H);
    snapctx.drawImage(activeLayer().canvas, 0, 0);
  }

  function commitPixelEdit(box) {
    if (!box) return;
    const x = Math.max(0, Math.floor(box.minX)), y = Math.max(0, Math.floor(box.minY));
    const w = Math.min(W, Math.ceil(box.maxX)) - x, h = Math.min(H, Math.ceil(box.maxY)) - y;
    if (w <= 0 || h <= 0) return;
    const L = activeLayer();
    const before = snapctx.getImageData(x, y, w, h);
    const after = L.ctx.getImageData(x, y, w, h);
    pushCmd({
      undo() { L.ctx.putImageData(before, x, y); changed(); },
      redo() { L.ctx.putImageData(after, x, y); changed(); }
    });
  }

  /* ---------- ブラシ設定 ---------- */
  function setBrush(id) { brush = Brushes.get(id); }
  function getBrush() { return brush; }
  function setOption(k, v) { opt[k] = v; }
  function getOption(k) { return opt[k]; }

  /* ---------- ストローク ---------- */
  function drawable() {
    const L = activeLayer();
    return L && L.visible && L.opacity > 0.01;
  }

  function beginStroke(x, y, pressure) {
    if (stroke) endStroke();
    if (!drawable()) return false;
    beginPixelEdit();
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.globalCompositeOperation = 'source-over';
    sctx.globalAlpha = 1;
    sctx.clearRect(0, 0, W, H);
    stroke = {
      brush,
      color: opt.color,
      opacity: opt.opacity,
      size: opt.size,
      symmetry: opt.symmetry,
      smooth: Math.pow(Math.max(0, Math.min(10, opt.stabilizer)) / 10, 0.7),
      layerIndex: active,
      sx: x, sy: y,
      lastX: x, lastY: y,
      lastR: 0,
      carry: 0,
      speed: 0,
      points: 0,
      box: null
    };
    stampPoint(x, y, pressure, true);
    dirty = true;
    return true;
  }

  function moveStroke(x, y, pressure) {
    if (!stroke) return;
    // 手ブレ補正: 生の座標へ少しずつ追従させる
    const k = 1 - stroke.smooth * 0.86;
    stroke.sx += (x - stroke.sx) * k;
    stroke.sy += (y - stroke.sy) * k;
    stampLine(stroke.sx, stroke.sy, pressure);
    dirty = true;
  }

  function endStroke() {
    if (!stroke) return;
    const s = stroke;
    const L = layers[s.layerIndex];
    if (s.box && L) {
      L.ctx.globalCompositeOperation = s.brush.composite;
      L.ctx.globalAlpha = s.opacity;
      L.ctx.drawImage(scratch, 0, 0);
      L.ctx.globalCompositeOperation = 'source-over';
      L.ctx.globalAlpha = 1;
    }
    stroke = null;
    if (s.box) {
      const pad = s.size + 4;
      commitPixelEdit({
        minX: s.box.minX - pad, minY: s.box.minY - pad,
        maxX: s.box.maxX + pad, maxY: s.box.maxY + pad
      });
      emit('stroke', s);
    }
    changed();
  }

  function cancelStroke() {
    if (!stroke) return;
    stroke = null;
    sctx.clearRect(0, 0, W, H);
    dirty = true;
  }

  function isDrawing() { return !!stroke; }

  function widthFor(pressure) {
    const b = stroke.brush;
    const base = stroke.size / 2;
    if (b.pressure <= 0) return base;
    // 筆圧が取れない環境では速度で代用する（速いほど細い）
    const p = pressure > 0 && pressure !== 0.5 ? pressure
      : Math.max(0.25, 1 - Math.min(1, stroke.speed / 45));
    return base * (1 - b.pressure + b.pressure * Math.max(0.05, p));
  }

  function grow(x, y, r) {
    const b = stroke.box || (stroke.box = { minX: 1e9, minY: 1e9, maxX: -1e9, maxY: -1e9 });
    if (x - r < b.minX) b.minX = x - r;
    if (y - r < b.minY) b.minY = y - r;
    if (x + r > b.maxX) b.maxX = x + r;
    if (y + r > b.maxY) b.maxY = y + r;
  }

  function stampOne(x, y, r) {
    stroke.brush.stamp(sctx, x, y, r, stroke.color);
    grow(x, y, r);
    if (stroke.symmetry === 'x' || stroke.symmetry === 'xy') {
      stroke.brush.stamp(sctx, W - x, y, r, stroke.color);
      grow(W - x, y, r);
    }
    if (stroke.symmetry === 'y' || stroke.symmetry === 'xy') {
      stroke.brush.stamp(sctx, x, H - y, r, stroke.color);
      grow(x, H - y, r);
    }
    if (stroke.symmetry === 'xy') {
      stroke.brush.stamp(sctx, W - x, H - y, r, stroke.color);
      grow(W - x, H - y, r);
    }
  }

  function stampPoint(x, y, pressure, first) {
    const r = widthFor(pressure);
    stampOne(x, y, r);
    stroke.lastX = x; stroke.lastY = y; stroke.lastR = r;
    stroke.points++;
    if (first) { stroke.sx = x; stroke.sy = y; }
  }

  function stampLine(x, y, pressure) {
    const dx = x - stroke.lastX, dy = y - stroke.lastY;
    const dist = Math.hypot(dx, dy);
    if (dist <= 0.001) return;
    stroke.speed += (dist - stroke.speed) * 0.35;
    const r = widthFor(pressure);
    const nx = dx / dist, ny = dy / dist;
    const startR = stroke.lastR;
    let pos = 0;
    // 直前のスタンプからの距離（carry）が間隔に達するたびに 1 つ置く
    for (let guard = 0; guard < 4000; guard++) {
      const t = pos / dist;
      const rr = startR + (r - startR) * t;
      const step = Math.max(0.6, Math.max(rr, 0.5) * 2 * stroke.brush.spacing);
      const need = step - stroke.carry;
      if (pos + need > dist) { stroke.carry += dist - pos; break; }
      pos += need;
      stroke.carry = 0;
      const t2 = pos / dist;
      stampOne(stroke.lastX + nx * pos, stroke.lastY + ny * pos, startR + (r - startR) * t2);
      stroke.points++;
    }
    stroke.lastX = x; stroke.lastY = y; stroke.lastR = r;
  }

  /* ---------- 合成（書き出し・バケツ・サムネ） ---------- */
  function flatten(withBg) {
    flatctx.setTransform(1, 0, 0, 1, 0, 0);
    flatctx.globalCompositeOperation = 'source-over';
    flatctx.globalAlpha = 1;
    flatctx.clearRect(0, 0, W, H);
    if (withBg !== false) {
      flatctx.fillStyle = bg;
      flatctx.fillRect(0, 0, W, H);
    }
    layers.forEach(L => {
      if (!L.visible || L.opacity <= 0) return;
      flatctx.globalAlpha = L.opacity;
      flatctx.drawImage(L.canvas, 0, 0);
    });
    flatctx.globalAlpha = 1;
    return flat;
  }

  function pickColor(x, y) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= W || y >= H) return null;
    const d = flatten(true).getContext('2d').getImageData(x, y, 1, 1).data;
    return Color.toHex(d[0], d[1], d[2]);
  }

  /* バケツ塗り: 見えている絵から領域を判定し、色はアクティブレイヤーに置く */
  function fillAt(x, y, tolerance) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    if (!drawable()) return false;
    const src = flatten(true).getContext('2d').getImageData(0, 0, W, H).data;
    const idx = (y * W + x) * 4;
    const sr = src[idx], sg = src[idx + 1], sb = src[idx + 2];
    const tol = (tolerance === undefined ? 32 : tolerance);
    const tol2 = tol * tol * 3;
    const mask = new Uint8Array(W * H);
    const stack = new Int32Array(W * H);
    let sp = 0;
    stack[sp++] = y * W + x;
    mask[y * W + x] = 1;
    let minX = x, maxX = x, minY = y, maxY = y;
    while (sp > 0) {
      const p = stack[--sp];
      const px = p % W, py = (p / W) | 0;
      if (px < minX) minX = px; if (px > maxX) maxX = px;
      if (py < minY) minY = py; if (py > maxY) maxY = py;
      const neigh = [p - 1, p + 1, p - W, p + W];
      for (let n = 0; n < 4; n++) {
        const q = neigh[n];
        if (q < 0 || q >= W * H) continue;
        if (n === 0 && px === 0) continue;
        if (n === 1 && px === W - 1) continue;
        if (mask[q]) continue;
        const i = q * 4;
        const dr = src[i] - sr, dg = src[i + 1] - sg, db = src[i + 2] - sb;
        if (dr * dr + dg * dg + db * db <= tol2) {
          mask[q] = 1;
          stack[sp++] = q;
        }
      }
    }
    // 1px ふくらませて、アンチエイリアスの縁に隙間が残らないようにする
    const grown = Uint8Array.from(mask);
    for (let py = 0; py < H; py++) {
      for (let px = 0; px < W; px++) {
        const p = py * W + px;
        if (mask[p]) continue;
        if ((px > 0 && mask[p - 1]) || (px < W - 1 && mask[p + 1]) ||
            (py > 0 && mask[p - W]) || (py < H - 1 && mask[p + W])) grown[p] = 1;
      }
    }
    minX = Math.max(0, minX - 1); minY = Math.max(0, minY - 1);
    maxX = Math.min(W - 1, maxX + 1); maxY = Math.min(H - 1, maxY + 1);

    beginPixelEdit();
    const L = activeLayer();
    const bw = maxX - minX + 1, bh = maxY - minY + 1;
    const out = L.ctx.getImageData(minX, minY, bw, bh);
    const od = out.data;
    const c = Color.toRGB(opt.color);
    const a = opt.opacity;
    for (let py = 0; py < bh; py++) {
      for (let px = 0; px < bw; px++) {
        if (!grown[(py + minY) * W + (px + minX)]) continue;
        const i = (py * bw + px) * 4;
        const da = od[i + 3] / 255;
        const na = a + da * (1 - a);
        od[i] = (c.r * a + od[i] * da * (1 - a)) / na;
        od[i + 1] = (c.g * a + od[i + 1] * da * (1 - a)) / na;
        od[i + 2] = (c.b * a + od[i + 2] * da * (1 - a)) / na;
        od[i + 3] = na * 255;
      }
    }
    L.ctx.putImageData(out, minX, minY);
    commitPixelEdit({ minX, minY, maxX: maxX + 1, maxY: maxY + 1 });
    changed();
    emit('stroke', { fill: true });
    return true;
  }

  /* ---------- 書き出し / 復元 ---------- */
  function toDataURL(type, quality) {
    return flatten(true).toDataURL(type || 'image/png', quality);
  }

  function thumbnail(maxSize, type, quality) {
    const src = flatten(true);
    const s = Math.min(maxSize / W, maxSize / H, 1);
    const cv = makeCanvas(Math.max(1, Math.round(W * s)), Math.max(1, Math.round(H * s)));
    const c = cv.getContext('2d');
    c.imageSmoothingQuality = 'high';
    c.drawImage(src, 0, 0, cv.width, cv.height);
    return cv.toDataURL(type || 'image/jpeg', quality || 0.8);
  }

  function layerThumbnail(L, w) {
    const s = Math.min(w / W, w / H);
    const cv = makeCanvas(Math.max(1, Math.round(W * s)), Math.max(1, Math.round(H * s)));
    const c = cv.getContext('2d');
    c.drawImage(L.canvas, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/png');
  }

  /* 描いた面積のざっくり計算（お題チャレンジの採点に使う） */
  function coverage() {
    const d = flatten(false).getContext('2d').getImageData(0, 0, W, H).data;
    let painted = 0, total = 0;
    for (let y = 0; y < H; y += 4) {
      for (let x = 0; x < W; x += 4) {
        total++;
        if (d[(y * W + x) * 4 + 3] > 16) painted++;
      }
    }
    return total ? painted / total : 0;
  }

  function serialize() {
    return {
      w: W, h: H, bg,
      active,
      layers: layers.map(L => ({
        name: L.name, visible: L.visible, opacity: L.opacity,
        data: L.canvas.toDataURL('image/png')
      }))
    };
  }

  function restore(data, done) {
    if (!data || !data.layers || !data.layers.length) { done && done(false); return; }
    W = data.w; H = data.h; bg = data.bg || '#ffffff';
    scratch = makeCanvas(W, H); sctx = scratch.getContext('2d');
    snap = makeCanvas(W, H); snapctx = snap.getContext('2d');
    prev = makeCanvas(W, H); prevctx = prev.getContext('2d');
    flat = makeCanvas(W, H); flatctx = flat.getContext('2d');
    layers.length = 0;
    seq = 0;
    undoStack.length = redoStack.length = 0;
    let pending = data.layers.length;
    data.layers.forEach((info, i) => {
      const L = makeLayer(info.name);
      L.visible = info.visible !== false;
      L.opacity = typeof info.opacity === 'number' ? info.opacity : 1;
      layers[i] = L;
      const img = new Image();
      img.onload = img.onerror = () => {
        if (img.width) L.ctx.drawImage(img, 0, 0);
        if (--pending === 0) {
          active = Math.min(data.active || 0, layers.length - 1);
          fitView();
          changed();
          done && done(true);
        }
      };
      img.src = info.data;
    });
  }

  requestAnimationFrame(loop);

  return {
    view, on, init, size, resizeView, fitView, zoomAt, panBy, toCanvas, invalidate,
    getTransform: () => tf,
    getLayers, getActiveIndex, setActive, addLayer, duplicateLayer, deleteLayer,
    moveLayer, mergeDown, setLayerVisible, setLayerOpacity, renameLayer,
    clearLayer, clearAll, setBackground, getBackground,
    undo, redo, canUndo, canRedo,
    setBrush, getBrush, setOption, getOption,
    beginStroke, moveStroke, endStroke, cancelStroke, isDrawing,
    fillAt, pickColor, flatten, toDataURL, thumbnail, layerThumbnail, coverage,
    serialize, restore
  };
})();
