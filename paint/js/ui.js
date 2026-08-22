/* ui.js — 画面まわり（ツール・色・レイヤー・入力・お題チャレンジ）の配線 */
(function () {

  const $ = sel => document.querySelector(sel);
  const stage = $('#stage');
  const view = $('#view');
  const ring = $('#ring');
  const toastEl = $('#toast');

  const SESSION_KEY = 'game1.paint.session';
  const RECENT_KEY = 'game1.paint.recent';

  const TOOLS = [
    { id: 'pen', label: 'ペン', icon: '🖊️', key: 'b' },
    { id: 'brush', label: '筆', icon: '🖌️', key: 'n' },
    { id: 'pencil', label: '鉛筆', icon: '✏️', key: 'p' },
    { id: 'marker', label: 'マーカー', icon: '🖍️', key: 'm' },
    { id: 'air', label: 'エア', icon: '💨', key: 'a' },
    { id: 'eraser', label: '消しゴム', icon: '🧽', key: 'e' },
    { id: 'fill', label: '塗り', icon: '🪣', key: 'g' },
    { id: 'spoit', label: 'スポイト', icon: '💧', key: 'i' },
    { id: 'hand', label: '移動', icon: '✋', key: 'h' }
  ];

  const PALETTE = [
    '#000000', '#4a4a4a', '#8a8a8a', '#c8c8c8', '#ffffff', '#7c4a1e', '#c8763c', '#f0b27a',
    '#e02020', '#ff6b6b', '#ff8fab', '#ff6ad5', '#a349e0', '#5b3fd6', '#2f6ee0', '#4dd0ff',
    '#1fb59a', '#2fbf5a', '#8fdc4a', '#ffd166', '#ff9f1c', '#ffe9c9', '#12233f', '#f2f7ff'
  ];

  let tool = 'pen';
  const brushSettings = {};   // ブラシごとに太さ・不透明度を覚えておく
  Brushes.list.forEach(b => { brushSettings[b.id] = { size: b.size, opacity: b.opacity }; });

  let hsv = { h: 210, s: 0.85, v: 0.16 };
  let color = Color.hsvToHex(hsv.h, hsv.s, hsv.v);
  let tolerance = 32;
  let recent = [];

  /* ---------- 小物 ---------- */
  let toastTimer = 0;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1400);
  }

  function openModal(id) { $(id).hidden = false; }
  function closeModal(id) { $(id).hidden = true; }
  document.querySelectorAll('.modal').forEach(m => {
    m.addEventListener('click', e => {
      if (e.target === m || e.target.hasAttribute('data-close')) m.hidden = true;
    });
  });

  /* ---------- ツール ---------- */
  const toolList = $('#tool-list');
  TOOLS.forEach(t => {
    const b = document.createElement('button');
    b.className = 'tool';
    b.dataset.tool = t.id;
    b.title = t.label + '（' + t.key.toUpperCase() + '）';
    b.innerHTML = '<span>' + t.icon + '</span><small>' + t.label + '</small>';
    b.addEventListener('click', () => setTool(t.id));
    toolList.appendChild(b);
  });

  function isBrushTool(id) { return !!Brushes.byId[id]; }

  function setTool(id) {
    tool = id;
    toolList.querySelectorAll('.tool').forEach(b => b.classList.toggle('active', b.dataset.tool === id));
    if (isBrushTool(id)) {
      Engine.setBrush(id);
      const st = brushSettings[id];
      const b = Brushes.get(id);
      inSize.min = b.minSize; inSize.max = b.maxSize;
      inSize.value = st.size;
      inOpacity.value = Math.round(st.opacity * 100);
      Engine.setOption('size', st.size);
      Engine.setOption('opacity', st.opacity);
      syncBrushLabels();
    }
    $('#field-tolerance').hidden = id !== 'fill';
    view.style.cursor = id === 'hand' ? 'grab' : id === 'spoit' ? 'copy' : 'crosshair';
    drawBrushPreview();
  }

  /* ---------- ブラシ設定 ---------- */
  const inSize = $('#in-size'), inOpacity = $('#in-opacity'), inStab = $('#in-stab'), inTol = $('#in-tol');

  function syncBrushLabels() {
    $('#val-size').textContent = inSize.value;
    $('#val-opacity').textContent = inOpacity.value;
    $('#val-stab').textContent = inStab.value;
    $('#val-tol').textContent = inTol.value;
  }

  inSize.addEventListener('input', () => {
    const v = +inSize.value;
    Engine.setOption('size', v);
    if (isBrushTool(tool)) brushSettings[tool].size = v;
    syncBrushLabels();
    drawBrushPreview();
  });
  inOpacity.addEventListener('input', () => {
    const v = +inOpacity.value / 100;
    Engine.setOption('opacity', v);
    if (isBrushTool(tool)) brushSettings[tool].opacity = v;
    syncBrushLabels();
    drawBrushPreview();
  });
  inStab.addEventListener('input', () => {
    Engine.setOption('stabilizer', +inStab.value);
    syncBrushLabels();
  });
  inTol.addEventListener('input', () => {
    tolerance = +inTol.value;
    syncBrushLabels();
  });

  $('#seg-symmetry').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    $('#seg-symmetry').querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
    Engine.setOption('symmetry', b.dataset.v);
  });

  /* ブラシのサンプル線 */
  const bpCanvas = $('#brush-preview');
  const bpCtx = bpCanvas.getContext('2d');
  const bpTemp = document.createElement('canvas');
  bpTemp.width = bpCanvas.width; bpTemp.height = bpCanvas.height;
  const bpTctx = bpTemp.getContext('2d');

  function drawBrushPreview() {
    const w = bpCanvas.width, h = bpCanvas.height;
    bpCtx.clearRect(0, 0, w, h);
    bpCtx.fillStyle = '#f6f7fb';
    bpCtx.fillRect(0, 0, w, h);
    if (!isBrushTool(tool)) {
      bpCtx.fillStyle = '#8a94ad';
      bpCtx.font = '13px sans-serif';
      bpCtx.textAlign = 'center';
      bpCtx.fillText(TOOLS.find(t => t.id === tool).label + 'ツール', w / 2, h / 2 + 4);
      return;
    }
    const b = Brushes.get(tool);
    const st = brushSettings[tool];
    const r = Math.min(20, Math.max(1, st.size / 2));
    const c = b.erase ? '#9aa3b8' : color;
    bpTctx.clearRect(0, 0, w, h);
    const n = 120;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = 14 + t * (w - 28);
      const y = h / 2 + Math.sin(t * Math.PI * 2) * (h / 2 - r - 6);
      const taper = b.pressure > 0 ? Math.sin(Math.PI * Math.min(1, Math.max(0.02, t))) * 0.7 + 0.3 : 1;
      b.stamp(bpTctx, x, y, Math.max(0.5, r * taper), c);
    }
    bpCtx.globalAlpha = st.opacity;
    bpCtx.drawImage(bpTemp, 0, 0);
    bpCtx.globalAlpha = 1;
  }

  /* ---------- 色 ---------- */
  const svCanvas = $('#sv'), svCtx = svCanvas.getContext('2d');
  const hueCanvas = $('#hue'), hueCtx = hueCanvas.getContext('2d');
  const hexInput = $('#hex');

  function drawHue() {
    const g = hueCtx.createLinearGradient(0, 0, 0, hueCanvas.height);
    for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, Color.hsvToHex(i * 60, 1, 1));
    hueCtx.fillStyle = g;
    hueCtx.fillRect(0, 0, hueCanvas.width, hueCanvas.height);
    const y = (hsv.h / 360) * hueCanvas.height;
    hueCtx.strokeStyle = '#fff';
    hueCtx.lineWidth = 2;
    hueCtx.strokeRect(1, Math.max(1, Math.min(hueCanvas.height - 3, y - 2)), hueCanvas.width - 2, 4);
  }

  function drawSV() {
    const w = svCanvas.width, h = svCanvas.height;
    svCtx.fillStyle = Color.hsvToHex(hsv.h, 1, 1);
    svCtx.fillRect(0, 0, w, h);
    const gw = svCtx.createLinearGradient(0, 0, w, 0);
    gw.addColorStop(0, 'rgba(255,255,255,1)');
    gw.addColorStop(1, 'rgba(255,255,255,0)');
    svCtx.fillStyle = gw;
    svCtx.fillRect(0, 0, w, h);
    const gb = svCtx.createLinearGradient(0, 0, 0, h);
    gb.addColorStop(0, 'rgba(0,0,0,0)');
    gb.addColorStop(1, 'rgba(0,0,0,1)');
    svCtx.fillStyle = gb;
    svCtx.fillRect(0, 0, w, h);
    const x = hsv.s * w, y = (1 - hsv.v) * h;
    svCtx.beginPath();
    svCtx.arc(x, y, 6, 0, Math.PI * 2);
    svCtx.strokeStyle = '#fff';
    svCtx.lineWidth = 2;
    svCtx.stroke();
    svCtx.beginPath();
    svCtx.arc(x, y, 8, 0, Math.PI * 2);
    svCtx.strokeStyle = 'rgba(0,0,0,0.6)';
    svCtx.lineWidth = 1;
    svCtx.stroke();
  }

  function setColor(hex, fromPicker) {
    color = hex;
    Engine.setOption('color', hex);
    if (!fromPicker) {
      const c = Color.toRGB(hex);
      hsv = Color.rgbToHsv(c.r, c.g, c.b);
    }
    $('#current-color').style.background = hex;
    hexInput.value = hex;
    drawSV(); drawHue();
    markSwatches();
    drawBrushPreview();
  }

  function pointerValue(canvas, e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))
    };
  }

  function dragCanvas(canvas, fn) {
    let on = false;
    canvas.addEventListener('pointerdown', e => {
      on = true;
      canvas.setPointerCapture(e.pointerId);
      fn(pointerValue(canvas, e));
      e.preventDefault();
    });
    canvas.addEventListener('pointermove', e => { if (on) fn(pointerValue(canvas, e)); });
    canvas.addEventListener('pointerup', () => { on = false; });
    canvas.addEventListener('pointercancel', () => { on = false; });
  }

  dragCanvas(svCanvas, p => {
    hsv.s = p.x; hsv.v = 1 - p.y;
    setColor(Color.hsvToHex(hsv.h, hsv.s, hsv.v), true);
  });
  dragCanvas(hueCanvas, p => {
    hsv.h = p.y * 360;
    setColor(Color.hsvToHex(hsv.h, hsv.s, hsv.v), true);
  });

  hexInput.addEventListener('change', () => {
    const v = hexInput.value.trim();
    if (/^#?[0-9a-fA-F]{6}$/.test(v)) {
      setColor(v[0] === '#' ? v.toLowerCase() : '#' + v.toLowerCase());
      pushRecent(color);
    } else {
      hexInput.value = color;
    }
  });

  const paletteEl = $('#palette'), recentEl = $('#recent');
  PALETTE.forEach(c => {
    const b = document.createElement('button');
    b.style.background = c;
    b.dataset.color = c;
    b.title = c;
    b.addEventListener('click', () => { setColor(c); pushRecent(c); });
    paletteEl.appendChild(b);
  });

  function loadRecent() {
    try { recent = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch (e) { recent = []; }
    renderRecent();
  }

  function pushRecent(c) {
    recent = [c].concat(recent.filter(x => x !== c)).slice(0, 16);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent)); } catch (e) { /* 保存できなくても続行 */ }
    renderRecent();
  }

  function renderRecent() {
    recentEl.innerHTML = '';
    recent.forEach(c => {
      const b = document.createElement('button');
      b.style.background = c;
      b.dataset.color = c;
      b.title = c;
      b.addEventListener('click', () => setColor(c));
      recentEl.appendChild(b);
    });
    markSwatches();
  }

  function markSwatches() {
    document.querySelectorAll('.swatches button').forEach(b => {
      b.classList.toggle('on', b.dataset.color === color);
    });
  }

  $('#btn-bg').addEventListener('click', () => {
    Engine.setBackground(color);
    toast('背景色を変えました');
  });

  /* ---------- タブ ---------- */
  document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === t));
      document.querySelectorAll('.tab-pane').forEach(p => {
        p.classList.toggle('active', p.dataset.pane === t.dataset.tab);
      });
      $('#panel').classList.remove('collapsed');
    });
  });
  $('#panel-toggle').addEventListener('click', () => {
    const p = $('#panel');
    p.classList.toggle('collapsed');
    $('#panel-toggle').textContent = p.classList.contains('collapsed') ? '▴' : '▾';
    setTimeout(() => { Engine.resizeView(); }, 30);
  });

  /* ---------- レイヤーパネル ---------- */
  const layerList = $('#layer-list');
  const inLyOp = $('#in-lyop');
  let lyOpStart = null;
  let thumbTimer = 0;

  function renderLayers() {
    const layers = Engine.getLayers();
    const act = Engine.getActiveIndex();
    layerList.innerHTML = '';
    layers.forEach((L, i) => {
      const row = document.createElement('div');
      row.className = 'layer' + (i === act ? ' active' : '');
      row.innerHTML =
        '<button class="eye' + (L.visible ? '' : ' off') + '" title="表示切替">' + (L.visible ? '👁' : '🚫') + '</button>' +
        '<span class="thumb"><img alt=""></span>' +
        '<span class="meta"><b class="nm"></b><span class="op">' + Math.round(L.opacity * 100) + '%</span></span>';
      row.querySelector('.nm').textContent = L.name;
      row.querySelector('img').src = Engine.layerThumbnail(L, 92);
      row.querySelector('.eye').addEventListener('click', e => {
        e.stopPropagation();
        Engine.setLayerVisible(i, !L.visible);
      });
      row.addEventListener('click', () => Engine.setActive(i));
      layerList.appendChild(row);
    });
    inLyOp.value = Math.round(layers[act].opacity * 100);
    $('#val-lyop').textContent = inLyOp.value;
  }

  function scheduleLayerRender() {
    clearTimeout(thumbTimer);
    thumbTimer = setTimeout(renderLayers, 120);
  }

  inLyOp.addEventListener('pointerdown', () => { lyOpStart = Engine.getLayers()[Engine.getActiveIndex()].opacity; });
  inLyOp.addEventListener('input', () => {
    $('#val-lyop').textContent = inLyOp.value;
    Engine.setLayerOpacity(Engine.getActiveIndex(), +inLyOp.value / 100, false);
  });
  inLyOp.addEventListener('change', () => {
    Engine.setLayerOpacity(Engine.getActiveIndex(), +inLyOp.value / 100, true, lyOpStart);
    lyOpStart = null;
  });

  $('#ly-add').addEventListener('click', () => { if (!Engine.addLayer()) toast('レイヤーは 12 枚までです'); });
  $('#ly-dup').addEventListener('click', () => { if (!Engine.duplicateLayer()) toast('レイヤーは 12 枚までです'); });
  $('#ly-up').addEventListener('click', () => Engine.moveLayer(1));
  $('#ly-down').addEventListener('click', () => Engine.moveLayer(-1));
  $('#ly-merge').addEventListener('click', () => { if (!Engine.mergeDown()) toast('いちばん下のレイヤーです'); });
  $('#ly-clear').addEventListener('click', () => Engine.clearLayer());
  $('#ly-del').addEventListener('click', () => { if (!Engine.deleteLayer()) toast('最後の 1 枚は消せません'); });

  /* ---------- 履歴ボタン ---------- */
  $('#btn-undo').addEventListener('click', () => Engine.undo());
  $('#btn-redo').addEventListener('click', () => Engine.redo());
  function syncHistory() {
    $('#btn-undo').disabled = !Engine.canUndo();
    $('#btn-redo').disabled = !Engine.canRedo();
  }

  /* ---------- 表示操作 ---------- */
  $('#btn-fit').addEventListener('click', () => Engine.fitView());
  $('#btn-zoom-in').addEventListener('click', () => zoomCenter(1.25));
  $('#btn-zoom-out').addEventListener('click', () => zoomCenter(1 / 1.25));
  function zoomCenter(f) {
    const r = stage.getBoundingClientRect();
    Engine.zoomAt(f, r.width / 2, r.height / 2);
  }
  function syncZoom() {
    $('#zoom-label').textContent = Math.round(Engine.getTransform().scale * 100) + '%';
  }

  /* ---------- キャンバスへの入力 ---------- */
  const pointers = new Map();
  let mode = null;             // 'draw' | 'pan' | 'gesture'
  let panLast = null;
  let gesture = null;
  let spaceDown = false;

  function pos(e) { return Engine.toCanvas(e.clientX, e.clientY); }

  stage.addEventListener('contextmenu', e => e.preventDefault());

  stage.addEventListener('pointerdown', e => {
    // キャンバスの上に重ねた UI（お題バーなど）のクリックは邪魔しない
    if (e.target !== view) return;
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1 && e.button !== 2) return;
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 2) {
      Engine.cancelStroke();
      mode = 'gesture';
      gesture = twoFingerState();
      return;
    }
    if (pointers.size > 2) return;

    const wantPan = tool === 'hand' || spaceDown ||
      (e.pointerType === 'mouse' && (e.button === 1 || e.button === 2));
    if (wantPan) {
      mode = 'pan';
      panLast = { x: e.clientX, y: e.clientY };
      view.style.cursor = 'grabbing';
      return;
    }
    const p = pos(e);
    if (tool === 'spoit') {
      mode = 'pick';
      pickAt(p);
      return;
    }
    if (tool === 'fill') {
      mode = 'fill';
      if (!Engine.fillAt(p.x, p.y, tolerance)) toast('このレイヤーは非表示です');
      return;
    }
    mode = 'draw';
    if (!Engine.beginStroke(p.x, p.y, e.pressure)) {
      mode = null;
      toast('非表示のレイヤーには描けません');
    }
  });

  stage.addEventListener('pointermove', e => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    updateRing(e);

    if (mode === 'gesture') { handleGesture(); return; }
    if (mode === 'pan') {
      Engine.panBy(e.clientX - panLast.x, e.clientY - panLast.y);
      panLast = { x: e.clientX, y: e.clientY };
      return;
    }
    if (mode === 'pick') { pickAt(pos(e)); return; }
    if (mode !== 'draw' || !Engine.isDrawing()) return;
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of events) {
      const p = Engine.toCanvas(ev.clientX, ev.clientY);
      Engine.moveStroke(p.x, p.y, ev.pressure);
    }
  });

  function endPointer(e) {
    pointers.delete(e.pointerId);
    if (mode === 'draw') Engine.endStroke();
    if (mode === 'pick' && tool === 'spoit') pushRecent(color);
    if (pointers.size === 0) {
      mode = null;
      gesture = null;
      view.style.cursor = tool === 'hand' ? 'grab' : tool === 'spoit' ? 'copy' : 'crosshair';
    } else if (pointers.size === 1 && mode === 'gesture') {
      gesture = null;
      mode = 'pan';
      const only = pointers.values().next().value;
      panLast = { x: only.x, y: only.y };
    }
  }
  stage.addEventListener('pointerup', endPointer);
  stage.addEventListener('pointercancel', endPointer);
  stage.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') ring.hidden = true; });

  function twoFingerState() {
    const pts = [...pointers.values()];
    return {
      dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1,
      mid: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }
    };
  }

  function handleGesture() {
    if (pointers.size < 2 || !gesture) return;
    const now = twoFingerState();
    const r = stage.getBoundingClientRect();
    Engine.zoomAt(now.dist / gesture.dist, now.mid.x - r.left, now.mid.y - r.top);
    Engine.panBy(now.mid.x - gesture.mid.x, now.mid.y - gesture.mid.y);
    gesture = now;
  }

  stage.addEventListener('wheel', e => {
    e.preventDefault();
    const r = stage.getBoundingClientRect();
    Engine.zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });

  function pickAt(p) {
    const c = Engine.pickColor(p.x, p.y);
    if (c) setColor(c);
  }

  function updateRing(e) {
    if (e.pointerType !== 'mouse' || !isBrushTool(tool)) { ring.hidden = true; return; }
    const d = Math.max(6, Engine.getOption('size') * Engine.getTransform().scale);
    const r = stage.getBoundingClientRect();
    ring.hidden = false;
    ring.style.width = ring.style.height = d + 'px';
    ring.style.left = (e.clientX - r.left) + 'px';
    ring.style.top = (e.clientY - r.top) + 'px';
  }

  /* ---------- キーボード ---------- */
  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Space') { spaceDown = true; return; }
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') {
      e.preventDefault();
      e.shiftKey ? Engine.redo() : Engine.undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); Engine.redo(); return; }
    if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); exportPNG(); return; }
    if (e.ctrlKey || e.metaKey) return;
    if (k === '[' || k === ']') {
      const step = Math.max(1, Math.round(+inSize.value * 0.15));
      inSize.value = Math.max(+inSize.min, Math.min(+inSize.max, +inSize.value + (k === ']' ? step : -step)));
      inSize.dispatchEvent(new Event('input'));
      toast('太さ ' + inSize.value + 'px');
      return;
    }
    const t = TOOLS.find(x => x.key === k);
    if (t) setTool(t.id);
  });
  window.addEventListener('keyup', e => {
    if (e.code === 'Space') {
      spaceDown = false;
      if (mode === 'pan' && tool !== 'hand') { mode = null; }
    }
  });

  /* ---------- 保存 / メニュー ---------- */
  function stamp() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes());
  }

  function download(dataURL, name) {
    const a = document.createElement('a');
    a.href = dataURL;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function exportPNG() {
    download(Engine.toDataURL('image/png'), 'おえかき_' + stamp() + '.png');
    toast('PNG を保存しました');
  }

  $('#btn-export').addEventListener('click', exportPNG);
  $('#btn-menu').addEventListener('click', () => openModal('#modal-menu'));
  $('#mn-export').addEventListener('click', () => { closeModal('#modal-menu'); exportPNG(); });
  $('#mn-help').addEventListener('click', () => { closeModal('#modal-menu'); openModal('#modal-help'); });
  $('#mn-gallery').addEventListener('click', () => { closeModal('#modal-menu'); showGallery(); });
  $('#mn-challenge').addEventListener('click', () => { closeModal('#modal-menu'); openChallenge(); });
  $('#mn-new').addEventListener('click', () => {
    closeModal('#modal-menu');
    if (confirm('いま描いている絵を全部消します。よろしいですか？（元に戻すで戻せます）')) {
      Engine.clearAll();
      toast('まっさらにしました');
    }
  });

  /* ---------- お題チャレンジ ---------- */
  const chBar = $('#challenge-bar');
  let pendingTheme = Challenge.randomTheme();
  let timeLimit = 180;
  let lastResult = null;

  function openChallenge() {
    $('#theme-text').textContent = pendingTheme;
    openModal('#modal-challenge');
  }
  $('#btn-challenge').addEventListener('click', openChallenge);
  $('#theme-reroll').addEventListener('click', () => {
    pendingTheme = Challenge.randomTheme(pendingTheme);
    $('#theme-text').textContent = pendingTheme;
  });
  $('#seg-time').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    $('#seg-time').querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
    timeLimit = +b.dataset.v;
  });

  $('#ch-start').addEventListener('click', () => {
    closeModal('#modal-challenge');
    if ($('#ch-fresh').checked) Engine.clearAll();
    Challenge.start({
      theme: pendingTheme,
      limit: timeLimit,
      onTick: updateChallengeBar,
      onEnd: showResult
    });
    $('#ch-theme').textContent = '🎯 ' + pendingTheme;
    chBar.hidden = false;
    toast(timeLimit ? 'よーいスタート！' : '好きなだけ描こう');
  });

  $('#ch-finish').addEventListener('click', () => Challenge.finish(true));

  function fmt(sec) {
    sec = Math.max(0, Math.ceil(sec));
    return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
  }

  function updateChallengeBar(left, limited) {
    const el = $('#ch-time');
    el.textContent = (limited ? '' : '+') + fmt(left);
    el.classList.toggle('warn', limited && left <= 30 && left > 10);
    el.classList.toggle('hot', limited && left <= 10);
  }

  function showResult(res) {
    chBar.hidden = true;
    lastResult = res;
    Engine.endStroke();
    $('#rs-title').textContent = res.early ? '⏱ 時間内に完成！' : '⏰ しゅうりょう！';
    $('#rs-img').src = Engine.thumbnail(720, 'image/jpeg', 0.85);
    $('#rs-rank').textContent = res.rank;
    $('#rs-theme').textContent = 'お題「' + res.theme + '」 / ' + res.total + ' 点';
    const ul = $('#rs-scores');
    ul.innerHTML = '';
    res.breakdown.forEach(([label, pt, max]) => {
      const li = document.createElement('li');
      li.innerHTML = '<span></span><b>' + pt + ' / ' + max + '</b>';
      li.firstChild.textContent = label;
      ul.appendChild(li);
    });
    $('#rs-comment').textContent = res.comment;
    openModal('#modal-result');
  }

  $('#rs-export').addEventListener('click', exportPNG);
  $('#rs-save').addEventListener('click', () => {
    if (!lastResult) return;
    const ok = Challenge.addToGallery({
      id: 'g' + Date.now(),
      theme: lastResult.theme,
      rank: lastResult.rank,
      total: lastResult.total,
      date: new Date().toLocaleDateString('ja-JP'),
      img: Engine.thumbnail(420, 'image/jpeg', 0.72)
    });
    closeModal('#modal-result');
    toast(ok ? 'ギャラリーに残しました' : '保存できませんでした（容量オーバー）');
  });

  function showGallery() {
    const items = Challenge.loadGallery();
    const el = $('#gallery');
    el.innerHTML = '';
    if (!items.length) {
      el.innerHTML = '<p class="empty">まだ作品がありません。🎯 お題チャレンジで描いて残してみましょう。</p>';
    }
    items.forEach(it => {
      const d = document.createElement('div');
      d.className = 'gal-item';
      d.innerHTML =
        '<img alt="">' +
        '<div class="gal-meta"><b></b><span>' + it.rank + ' / ' + it.total + '点</span></div>' +
        '<div class="gal-actions"><button data-a="dl">保存</button><button data-a="rm">削除</button></div>';
      d.querySelector('img').src = it.img;
      d.querySelector('b').textContent = it.theme;
      d.querySelector('[data-a="dl"]').addEventListener('click', () => download(it.img, 'おえかき_' + it.theme + '.jpg'));
      d.querySelector('[data-a="rm"]').addEventListener('click', () => {
        Challenge.removeFromGallery(it.id);
        showGallery();
      });
      el.appendChild(d);
    });
    openModal('#modal-gallery');
  }

  /* ---------- 自動保存 ---------- */
  let saveTimer = 0;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 1200);
  }
  function save() {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(Engine.serialize()));
    } catch (e) {
      // 容量が足りないときは自動保存をあきらめる（描画は続けられる）
    }
  }
  window.addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

  /* ---------- 起動 ---------- */
  function defaultSize() {
    const portrait = window.innerHeight > window.innerWidth;
    const long = 1280, short = 960;
    return portrait ? { w: short, h: long } : { w: long, h: short };
  }

  Engine.on('change', () => { scheduleLayerRender(); scheduleSave(); });
  Engine.on('history', () => { syncHistory(); scheduleSave(); });
  Engine.on('view', syncZoom);
  Engine.on('stroke', s => {
    if (!s.fill) pushRecent(color);
    Challenge.noteStroke(Engine.getBrush().erase ? null : color);
  });

  window.addEventListener('resize', () => {
    Engine.resizeView();
    syncZoom();
  });

  function boot() {
    Engine.resizeView();
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { saved = null; }
    const finish = () => {
      setTool('pen');
      setColor(color);
      Engine.setOption('stabilizer', +inStab.value);
      syncBrushLabels();
      renderLayers();
      syncHistory();
      syncZoom();
      drawBrushPreview();
    };
    if (saved) {
      Engine.restore(saved, ok => {
        if (!ok) { const s = defaultSize(); Engine.init(s.w, s.h); }
        finish();
        if (ok) toast('前回の続きから開きました');
      });
    } else {
      const s = defaultSize();
      Engine.init(s.w, s.h);
      finish();
    }
    loadRecent();
  }

  boot();
})();
