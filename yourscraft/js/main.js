/* YoursCraft — ゲーム本体
 * クリエイティブモード専用。タブレットのタッチ操作を前提にしつつ、
 * PC のマウス + キーボードでも遊べるようにしてある。
 */
(function (global) {
  'use strict';
  var YC = global.YC;
  var B = YC.Blocks, ID = B.ID, G = YC.Gen, UI = YC.UI, Save = YC.Save, Audio = YC.Audio;
  var DAY_LENGTH = 1200;        /* 1 日 20 分（マイクラと同じ） */
  var REACH = 5.0;              /* 手の届く距離 */
  var VERSION = '1.0';

  var Game = {
    mode: 'boot',
    settings: {
      renderDist: 6, fov: 70, sens: 1.0, brightness: 1.0,
      clouds: true, sound: true, autoJump: true, showCoords: false,
      swapTap: false, res: 1, timeFlow: 'cycle'
    },
    hotbar: [ID.GRASS, ID.DIRT, ID.STONE, ID.COBBLESTONE, ID.OAK_PLANKS, ID.OAK_LOG, ID.GLASS, ID.TORCH, ID.WOOL_RED],
    sel: 0,
    timeOfDay: 0.16,
    day: 0,
    particles: [],
    swing: 0,
    lastSave: 0,
    dirtyChunks: new Set(),
    editCache: new Map(),     /* 読み込み範囲の外に出たチャンクの「変更分」だけを保持する */
    stats: { fps: 0, frames: 0, t0: 0 },
    loadingDone: false
  };
  global.YCGame = Game;

  var el = {};
  function $(id) { return document.getElementById(id); }

  /* ================== 起動 ================== */
  function boot() {
    ['gl', 'hud', 'crosshair', 'hotbar', 'itemname', 'debug', 'toast', 'hint', 'stick', 'knob',
      'rightpad', 'btn-jump', 'btn-up', 'btn-down', 'btn-fly', 'btn-inv', 'btn-pause', 'topright',
      'actionpad', 'btn-break', 'btn-place',
      'title', 'pause', 'settings', 'help', 'inventory', 'loading', 'newworld',
      'water-tint', 'lava-tint', 'logo', 'bar-fill', 'loading-text', 'btn-continue', 'btn-newworld',
      'inv-grid', 'inv-tabs', 'inv-hotbar', 'seed-input', 'sv'].forEach(function (id) { el[id] = $(id); });

    Game.touchUI = isTouch();
    if (Game.touchUI) {
      /* タブレットは画素数が多いので、初期値をひかえめにしておく（設定で変えられる） */
      Game.settings.renderDist = 5;
      Game.settings.res = 0.75;
    } else {
      Game.settings.renderDist = 7;
    }
    try {
      Game.renderer = new YC.Renderer(el.gl);
    } catch (e) {
      showFatal(e.message || String(e));
      return;
    }

    /* ロゴと土の背景 */
    el.logo.src = UI.buildLogo('YoursCraft').toDataURL();
    var dirt = UI.dirtBackgroundURL();
    Array.prototype.forEach.call(document.querySelectorAll('.screen.dirt'), function (s) {
      s.style.backgroundImage = 'url(' + dirt + ')';
    });
    el.sv.textContent = 'v' + VERSION;

    setupUI();
    setupInput();
    window.addEventListener('resize', resize);
    resize();

    Save.open().then(function () {
      return Save.get('meta');
    }).then(function (meta) {
      if (meta && meta.seed !== undefined) {
        Game.savedMeta = meta;
        el['btn-continue'].textContent = 'つづきから';
        el['btn-continue'].hidden = false;
        applySettings(meta.settings);
      } else {
        el['btn-continue'].hidden = true;
      }
      showScreen('title');
      Game.mode = 'title';
      /* タイトルの背景に世界を映すため、ここで読み込みを始める */
      startWorld(meta && meta.seed !== undefined ? meta : null, true);
      requestAnimationFrame(frame);
    });
  }

  function showFatal(msg) {
    var d = document.createElement('div');
    d.className = 'screen dim';
    d.innerHTML = '<div class="panel"><h2>動かせませんでした</h2><p style="font-weight:400;font-size:14px">' +
      'このゲームは WebGL2 に対応したブラウザが必要です（iPad なら iOS 15 以降の Safari、' +
      'Android なら Chrome、PC なら Chrome / Edge / Firefox / Safari）。<br><br>詳細: ' +
      String(msg).replace(/</g, '&lt;') + '</p></div>';
    document.body.appendChild(d);
  }

  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    var dpr = Math.min(window.devicePixelRatio || 1, Game.touchUI ? 1.5 : 2) * Game.settings.res;
    Game.renderer.resize(w, h, dpr);
  }

  /* ================== ワールドの用意 ================== */
  function startWorld(meta, panorama) {
    var seed = meta ? meta.seed : (Math.random() * 0xFFFFFFFF) >>> 0;
    Game.world = new YC.World(seed);
    Game.player = new YC.Player(Game.world);
    Game.dirtyChunks.clear();
    Game.editCache.clear();
    Game.particles.length = 0;
    Game.loadingDone = false;
    Game.pendingSpawn = null;
    Game.worldReady = false;   /* セーブ差分を読み終わるまでチャンク生成を待つ */

    if (meta) {
      if (meta.hotbar && meta.hotbar.length === 9) Game.hotbar = meta.hotbar.slice();
      if (meta.sel !== undefined) Game.sel = meta.sel | 0;
      if (meta.timeOfDay !== undefined) Game.timeOfDay = meta.timeOfDay;
      if (meta.day !== undefined) Game.day = meta.day;
    }
    refreshHotbar();

    /* 保存してあるブロックの変更を、生成前にチャンクへ差し込む */
    return Save.loadAllEdits().then(function (edits) {
      edits.forEach(function (rec, k) {
        var parts = k.split(',');
        var c = Game.world.ensureChunk(parseInt(parts[0], 10), parseInt(parts[1], 10));
        var m = new Map();
        var ia = rec.i, ba = rec.b;
        for (var i = 0; i < ia.length; i++) m.set(ia[i], ba[i]);
        c.edits = m;
        Game.editCache.set(k, m);
        if (c.hasTerrain) {
          /* すでに生成済みなら、その場で差分を当てて作り直す */
          m.forEach(function (v, i) { c.blocks[i] = v; });
          c.lightDirty = true; c.meshDirty = true;
          for (var dx = -1; dx <= 1; dx++) for (var dz = -1; dz <= 1; dz++) Game.world.markDirty(c.cx + dx, c.cz + dz);
        }
      });
      var p = Game.player;
      if (meta && meta.player) {
        p.x = meta.player.x; p.y = meta.player.y; p.z = meta.player.z;
        p.yaw = meta.player.yaw; p.pitch = meta.player.pitch;
        p.flying = !!meta.player.flying;
      } else {
        var sp = Game.world.gen.findSpawn();
        p.x = sp.x; p.y = sp.y; p.z = sp.z;
        p.flying = false;
        Game.pendingSpawn = true;
      }
      if (panorama) {
        Game.panoYaw = 0;
      }
      Game.worldReady = true;
    });
  }

  /* ================== チャンクの読み込み ================== */
  function chunkPipeline(budgetMs) {
    var w = Game.world, p = Game.player;
    if (!w || !Game.worldReady) return;
    var R = Game.settings.renderDist;
    var pcx = Math.floor(p.x / 16), pcz = Math.floor(p.z / 16);
    var t0 = performance.now();

    /* 遠いチャンクを解放 */
    var unloadR = R + 1;
    var toDelete = [];
    w.chunks.forEach(function (c, k) {
      var dx = c.cx - pcx, dz = c.cz - pcz;
      if (Math.abs(dx) > unloadR || Math.abs(dz) > unloadR) {
        if (c.edits && c.edits.size) {
          /* 変更はとっておいて（次に来たとき復元する）、重い配列だけ解放する */
          Game.editCache.set(k, c.edits);
          Game.dirtyChunks.add(k);
        }
        toDelete.push(k);
      }
    });
    for (var i = 0; i < toDelete.length; i++) {
      var c2 = w.chunks.get(toDelete[i]);
      Game.renderer.freeChunk(c2);
      w.chunks.delete(toDelete[i]);
    }

    /* 近い順に地形 → 光 → メッシュ */
    var order = getSpiral(R);
    var readyCount = 0, needCount = 0;
    for (var s = 0; s < order.length; s++) {
      var cx = pcx + order[s][0], cz = pcz + order[s][1];
      var dist = Math.max(Math.abs(order[s][0]), Math.abs(order[s][1]));
      var c3 = w.chunkAt(cx, cz);
      needCount++;
      if (c3 && c3.hasTerrain && !c3.lightDirty && !c3.meshDirty && c3.gl !== null) { readyCount++; continue; }
      if (performance.now() - t0 > budgetMs) break;

      if (!c3 || !c3.hasTerrain) { restoreEdits(cx, cz); w.generateChunk(cx, cz); continue; }
      /* 光とメッシュには、隣の地形も必要 */
      var ok = true;
      for (var dx2 = -1; dx2 <= 1 && ok; dx2++) {
        for (var dz2 = -1; dz2 <= 1; dz2++) {
          var n = w.chunkAt(cx + dx2, cz + dz2);
          if (!n || !n.hasTerrain) { restoreEdits(cx + dx2, cz + dz2); w.generateChunk(cx + dx2, cz + dz2); ok = false; break; }
        }
      }
      if (!ok) continue;
      if (c3.lightDirty || !c3.hasLight) { w.computeLight(c3); continue; }
      /* メッシュは隣の光も要る（境目の明るさをなめらかにするため） */
      var lit = true;
      for (var dx3 = -1; dx3 <= 1 && lit; dx3++) {
        for (var dz3 = -1; dz3 <= 1; dz3++) {
          var n2 = w.chunkAt(cx + dx3, cz + dz3);
          if (n2 && (!n2.hasLight || n2.lightDirty)) { w.computeLight(n2); lit = false; break; }
        }
      }
      if (!lit) continue;
      w.buildMesh(c3);
      Game.renderer.uploadChunk(c3);
    }
    Game.loadProgress = needCount ? readyCount / needCount : 1;
    /* 近場（半径 3）がそろったら遊べる */
    if (!Game.loadingDone) {
      var core = true;
      for (var ddx = -2; ddx <= 2 && core; ddx++) {
        for (var ddz = -2; ddz <= 2; ddz++) {
          var cc = w.chunkAt(pcx + ddx, pcz + ddz);
          if (!cc || !cc.gl) { core = false; break; }
        }
      }
      if (core) {
        Game.loadingDone = true;
        if (Game.pendingSpawn) {
          /* 地面の上に降ろす */
          var yy = G.WH - 1;
          while (yy > 1 && !B.isSolid(w.getBlock(Math.floor(Game.player.x), yy, Math.floor(Game.player.z)))) yy--;
          Game.player.y = yy + 1.02;
          Game.pendingSpawn = false;
        }
      }
    }
  }

  /* いちど読み込み範囲から出たチャンクに戻ってきたとき、変更分を差し込んでから生成する */
  function restoreEdits(cx, cz) {
    var k = cx + ',' + cz;
    var cached = Game.editCache.get(k);
    if (!cached) return;
    var c = Game.world.ensureChunk(cx, cz);
    if (!c.edits) c.edits = cached;
  }

  var spiralCache = {};
  function getSpiral(R) {
    if (spiralCache[R]) return spiralCache[R];
    var out = [];
    for (var dx = -R; dx <= R; dx++) for (var dz = -R; dz <= R; dz++) {
      if (dx * dx + dz * dz <= (R + 0.5) * (R + 0.5)) out.push([dx, dz]);
    }
    out.sort(function (a, b) { return (a[0] * a[0] + a[1] * a[1]) - (b[0] * b[0] + b[1] * b[1]); });
    spiralCache[R] = out;
    return out;
  }

  /* ================== 自動セーブ ================== */
  function collectSave() {
    var p = Game.player;
    return {
      version: 1, seed: Game.world.seed, savedAt: Date.now(),
      player: { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, flying: p.flying },
      hotbar: Game.hotbar.slice(), sel: Game.sel,
      timeOfDay: Game.timeOfDay, day: Game.day,
      settings: Game.settings
    };
  }

  function doSave(silent) {
    if (!Game.world) return Promise.resolve();
    var entries = [['meta', collectSave()]];
    Game.dirtyChunks.forEach(function (k) {
      var parts = k.split(',');
      var cx = parseInt(parts[0], 10), cz = parseInt(parts[1], 10);
      var c = Game.world.chunkAt(cx, cz);
      var edits = (c && c.edits) || Game.editCache.get(k);
      if (!edits || !edits.size) return;
      var n = edits.size;
      var ia = new Uint32Array(n), ba = new Uint8Array(n), j = 0;
      edits.forEach(function (v, i) { ia[j] = i; ba[j] = v; j++; });
      entries.push([YC.SaveKeys.chunk(cx, cz), { i: ia, b: ba }]);
    });
    Game.dirtyChunks.clear();
    Game.world.dirtySave = false;
    Game.lastSave = performance.now();
    if (!silent) toast('セーブしました');
    return Save.putMany(entries).catch(function () {
      toast('セーブできませんでした');
    });
  }

  function autosave() {
    if (Game.mode !== 'play' && Game.mode !== 'inventory') return;
    var now = performance.now();
    if (now - Game.lastSave < 8000) return;
    if (!Game.world.dirtySave && !Game.movedSinceSave) { Game.lastSave = now; return; }
    Game.movedSinceSave = false;
    doSave(true);
    toast('自動セーブ');
  }

  var toastTimer = null;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.classList.remove('show'); }, 1600);
  }
  var hintTimer = null;
  function hint(msg, ms) {
    el.hint.textContent = msg;
    el.hint.style.opacity = '1';
    clearTimeout(hintTimer);
    hintTimer = setTimeout(function () { el.hint.style.opacity = '0'; }, ms || 3800);
  }

  /* ================== 画面の切り替え ================== */
  function showScreen(name) {
    ['title', 'pause', 'settings', 'help', 'inventory', 'loading', 'newworld'].forEach(function (n) {
      el[n].hidden = (n !== name);
    });
    el.hud.hidden = !(name === null || name === 'inventory');
    if (name === null) el.hud.hidden = false;
  }

  function enterPlay() {
    Game.mode = 'play';
    showScreen(null);
    Audio.resume();
    if (!Game.hintShown) {
      Game.hintShown = true;
      hint(isTouch() ? '⛏ こわす / ▣ おく ボタン（画面のタップで置く・長押しで壊すこともできます）' :
        'クリックで画面をつかむ → 左クリックで壊す / 右クリックで置く', 6000);
    }
  }

  function pauseGame() {
    if (Game.mode !== 'play') return;
    Game.mode = 'pause';
    showScreen('pause');
    releasePointerLock();
    doSave(true);
  }

  function isTouch() {
    return ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  }

  /* ================== ホットバーとインベントリ ================== */
  function refreshHotbar() {
    if (!el.hotbar) return;
    el.hotbar.innerHTML = '';
    for (var i = 0; i < 9; i++) {
      var d = document.createElement('div');
      d.className = 'slot' + (i === Game.sel ? ' sel' : '');
      d.dataset.i = i;
      var id = Game.hotbar[i];
      if (id) d.appendChild(UI.blockIcon(id, 48));
      var num = document.createElement('span');
      num.className = 'num';
      num.textContent = (i + 1);
      d.appendChild(num);
      el.hotbar.appendChild(d);
    }
  }

  function selectSlot(i) {
    if (i < 0) i = 8; if (i > 8) i = 0;
    if (i === Game.sel) return;
    Game.sel = i;
    refreshHotbar();
    showItemName();
    Game.handMesh = null;
    Audio.click();
  }

  function showItemName() {
    var id = Game.hotbar[Game.sel];
    var b = B.get(id);
    el.itemname.textContent = b ? b.name : '（空）';
    el.itemname.style.opacity = '1';
    clearTimeout(showItemName.t);
    showItemName.t = setTimeout(function () { el.itemname.style.opacity = '0'; }, 1800);
  }

  var invTab = 0;
  function buildInventory() {
    el['inv-tabs'].innerHTML = '';
    B.TABS.forEach(function (tab, i) {
      var d = document.createElement('div');
      d.className = 'tab' + (i === invTab ? ' on' : '');
      d.appendChild(UI.blockIcon(tab.icon, 32));
      var s = document.createElement('span');
      s.textContent = tab.name;
      d.appendChild(s);
      d.addEventListener('click', function () { invTab = i; buildInventory(); Audio.click(); });
      el['inv-tabs'].appendChild(d);
    });
    el['inv-grid'].innerHTML = '';
    B.TABS[invTab].items.forEach(function (id) {
      var d = document.createElement('div');
      d.className = 'slot';
      d.appendChild(UI.blockIcon(id, 48));
      d.title = B.get(id).name;
      d.addEventListener('click', function () {
        Game.hotbar[Game.sel] = id;
        Game.handMesh = null;
        refreshHotbar();
        buildInvHotbar();
        showItemName();
        Audio.click();
        Game.world.dirtySave = true;
      });
      el['inv-grid'].appendChild(d);
    });
    buildInvHotbar();
  }

  function buildInvHotbar() {
    el['inv-hotbar'].innerHTML = '';
    for (var i = 0; i < 9; i++) {
      var d = document.createElement('div');
      d.className = 'slot' + (i === Game.sel ? ' sel' : '');
      var id = Game.hotbar[i];
      if (id) d.appendChild(UI.blockIcon(id, 48));
      (function (idx) {
        d.addEventListener('click', function () {
          Game.sel = idx; refreshHotbar(); buildInvHotbar(); Audio.click(); Game.handMesh = null;
        });
      })(i);
      el['inv-hotbar'].appendChild(d);
    }
  }

  function openInventory() {
    if (Game.mode !== 'play') return;
    Game.mode = 'inventory';
    buildInventory();
    showScreen('inventory');
    releasePointerLock();
    Audio.open();
  }
  function closeInventory() {
    if (Game.mode !== 'inventory') return;
    Game.mode = 'play';
    showScreen(null);
  }

  /* ================== 設定画面 ================== */
  function applySettings(s) {
    if (!s) return;
    Object.keys(Game.settings).forEach(function (k) {
      if (s[k] !== undefined) Game.settings[k] = s[k];
    });
  }

  function setupUI() {
    el['btn-continue'].addEventListener('click', function () {
      enterPlay();
      if (!Game.loadingDone) { showScreen('loading'); Game.mode = 'loadwait'; }
    });
    el['btn-newworld'].addEventListener('click', function () {
      el['seed-input'].value = '';
      showScreen('newworld');
      Game.mode = 'newworld';
    });
    $('nw-create').addEventListener('click', function () {
      var raw = el['seed-input'].value.trim();
      var seed;
      if (!raw) seed = (Math.random() * 0xFFFFFFFF) >>> 0;
      else if (/^-?\d+$/.test(raw)) seed = (parseInt(raw, 10) >>> 0);
      else {
        seed = 0;
        for (var i = 0; i < raw.length; i++) seed = (seed * 31 + raw.charCodeAt(i)) >>> 0;
      }
      Save.clearAll().then(function () {
        Game.hotbar = [ID.GRASS, ID.DIRT, ID.STONE, ID.COBBLESTONE, ID.OAK_PLANKS, ID.OAK_LOG, ID.GLASS, ID.TORCH, ID.WOOL_RED];
        Game.sel = 0; Game.timeOfDay = 0.16; Game.day = 0;
        Game.world.chunks.forEach(function (c) { Game.renderer.freeChunk(c); });
        return startWorld({ seed: seed, settings: Game.settings }, false);
      }).then(function () {
        Game.savedMeta = collectSave();
        el['btn-continue'].hidden = false;
        el['btn-continue'].textContent = 'つづきから';
        showScreen('loading');
        Game.mode = 'loadwait';
        doSave(true);
      });
    });
    $('nw-cancel').addEventListener('click', function () { showScreen('title'); Game.mode = 'title'; });

    $('btn-help').addEventListener('click', function () { Game.prevMode = Game.mode; showScreen('help'); Game.mode = 'help'; });
    $('btn-settings').addEventListener('click', function () { Game.prevMode = Game.mode; showScreen('settings'); Game.mode = 'settings'; buildSettings(); });
    $('btn-resume').addEventListener('click', function () { enterPlay(); });
    $('btn-pause-settings').addEventListener('click', function () { Game.prevMode = 'pause'; showScreen('settings'); Game.mode = 'settings'; buildSettings(); });
    $('btn-pause-help').addEventListener('click', function () { Game.prevMode = 'pause'; showScreen('help'); Game.mode = 'help'; });
    $('btn-title').addEventListener('click', function () {
      doSave(false);
      Game.mode = 'title';
      showScreen('title');
    });
    $('help-close').addEventListener('click', function () { backFromSub(); });
    $('settings-close').addEventListener('click', function () {
      doSave(true);
      backFromSub();
    });
    $('inv-close').addEventListener('click', closeInventory);
    el['btn-inv'].addEventListener('click', function (e) { e.preventDefault(); openInventory(); });
    el['btn-pause'].addEventListener('click', function (e) { e.preventDefault(); pauseGame(); });

    /* タイトルのボタン（新規だけのとき） */
    document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  function backFromSub() {
    var m = Game.prevMode === 'pause' ? 'pause' : 'title';
    if (Game.prevMode === 'play') { enterPlay(); return; }
    Game.mode = m;
    showScreen(m);
  }

  function buildSettings() {
    var box = $('settings-body');
    box.innerHTML = '';
    function row(label, node, valNode) {
      var r = document.createElement('div');
      r.className = 'row';
      var l = document.createElement('label');
      l.textContent = label;
      r.appendChild(l);
      r.appendChild(node);
      if (valNode) r.appendChild(valNode);
      box.appendChild(r);
      return r;
    }
    function slider(label, key, min, max, step, fmt, onchange) {
      var inp = document.createElement('input');
      inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step;
      inp.value = Game.settings[key];
      var v = document.createElement('span');
      v.className = 'val';
      v.textContent = fmt(Game.settings[key]);
      inp.addEventListener('input', function () {
        Game.settings[key] = parseFloat(inp.value);
        v.textContent = fmt(Game.settings[key]);
        if (onchange) onchange();
      });
      row(label, inp, v);
    }
    function toggle(label, key, onText, offText, onchange) {
      var t = document.createElement('div');
      t.className = 'toggle' + (Game.settings[key] ? ' on' : '');
      t.textContent = Game.settings[key] ? (onText || 'オン') : (offText || 'オフ');
      t.addEventListener('click', function () {
        Game.settings[key] = !Game.settings[key];
        t.className = 'toggle' + (Game.settings[key] ? ' on' : '');
        t.textContent = Game.settings[key] ? (onText || 'オン') : (offText || 'オフ');
        if (onchange) onchange();
      });
      row(label, t);
    }

    var h = document.createElement('h3'); h.textContent = '表示'; box.appendChild(h);
    slider('描画距離', 'renderDist', 3, 12, 1, function (v) { return v + ' チャンク'; });
    slider('視野角', 'fov', 55, 100, 1, function (v) { return v + '°'; });
    slider('明るさ', 'brightness', 0.6, 1.6, 0.05, function (v) { return Math.round(v * 100) + '%'; });
    slider('解像度', 'res', 0.6, 1.0, 0.1, function (v) { return Math.round(v * 100) + '%'; }, resize);
    toggle('雲', 'clouds');
    toggle('座標を表示', 'showCoords');

    var h2 = document.createElement('h3'); h2.textContent = '操作'; box.appendChild(h2);
    slider('視点の速さ', 'sens', 0.4, 2.5, 0.1, function (v) { return v.toFixed(1) + 'x'; });
    toggle('自動ジャンプ', 'autoJump');
    toggle('タップで壊す（長押しで置く）', 'swapTap');

    var h3 = document.createElement('h3'); h3.textContent = 'そのほか'; box.appendChild(h3);
    toggle('効果音', 'sound', 'オン', 'オフ', function () { Audio.enabled = Game.settings.sound; });
    var tf = document.createElement('div');
    tf.className = 'toggle on';
    var names = { cycle: '流れる', day: '昼で固定', night: '夜で固定' };
    tf.textContent = names[Game.settings.timeFlow];
    tf.addEventListener('click', function () {
      var order = ['cycle', 'day', 'night'];
      var i = (order.indexOf(Game.settings.timeFlow) + 1) % 3;
      Game.settings.timeFlow = order[i];
      tf.textContent = names[order[i]];
      if (order[i] === 'day') Game.timeOfDay = 0.22;
      if (order[i] === 'night') Game.timeOfDay = 0.72;
    });
    row('時間', tf);

    var reset = document.createElement('div');
    reset.className = 'toggle';
    reset.textContent = 'この世界を消す';
    reset.style.background = 'linear-gradient(180deg,#c86a6a,#8f3f3f)';
    reset.addEventListener('click', function () {
      if (reset.dataset.armed) {
        Save.clearAll().then(function () { location.reload(); });
      } else {
        reset.dataset.armed = '1';
        reset.textContent = 'ほんとうに消す？';
      }
    });
    row('世界のリセット', reset);
  }

  /* ================== ブロックの設置・破壊 ================== */
  function targetBlock() {
    var p = Game.player;
    var d = p.lookDir();
    return Game.world.raycast(p.x, p.eyeY(), p.z, d[0], d[1], d[2], REACH, false);
  }

  function setBlock(x, y, z, id) {
    if (Game.world.setBlock(x, y, z, id, true)) {
      var k = (x >> 4) + ',' + (z >> 4);
      Game.dirtyChunks.add(k);
      var c = Game.world.chunkAt(x >> 4, z >> 4);
      if (c && c.edits) Game.editCache.set(k, c.edits);
      return true;
    }
    return false;
  }

  function digBlock() {
    var t = Game.target;
    if (!t) return;
    if (t.id === ID.BEDROCK && t.y === 0) { hint('岩盤は壊せません'); return; }
    spawnParticles(t.x, t.y, t.z, t.id);
    setBlock(t.x, t.y, t.z, 0);
    if (Game.settings.sound) Audio.dig(t.id);
    Game.swing = 0.001;
  }

  function isReplaceable(id) {
    return id === 0 || id === ID.WATER || id === ID.LAVA || B.isCross(id);
  }

  function placeBlock() {
    var t = Game.target;
    var id = Game.hotbar[Game.sel];
    if (!t || !id) return;
    var x = t.x + t.nx, y = t.y + t.ny, z = t.z + t.nz;
    if (y < 0 || y >= G.WH) return;
    var cur = Game.world.getBlock(x, y, z);
    if (!isReplaceable(cur)) return;
    var def = B.get(id);
    if (def.solid && Game.player.blocksSpace(x, y, z)) { hint('自分のいる場所には置けません'); return; }
    /* 草花は土や草の上だけ（マイクラと同じ） */
    if (def.render === 'cross' && id !== ID.TORCH) {
      var below = Game.world.getBlock(x, y - 1, z);
      if (below !== ID.GRASS && below !== ID.DIRT && below !== ID.SAND) return;
    }
    if (setBlock(x, y, z, id)) {
      if (Game.settings.sound) Audio.place(id);
      Game.swing = 0.001;
    }
  }

  /* ================== 破片パーティクル ================== */
  function spawnParticles(x, y, z, id) {
    var def = B.get(id);
    if (!def) return;
    var tile = def.faces[0];
    for (var i = 0; i < 12; i++) {
      if (Game.particles.length > 260) break;
      Game.particles.push({
        x: x + 0.15 + Math.random() * 0.7,
        y: y + 0.15 + Math.random() * 0.7,
        z: z + 0.15 + Math.random() * 0.7,
        vx: (Math.random() - 0.5) * 2.4,
        vy: Math.random() * 3.2 + 0.6,
        vz: (Math.random() - 0.5) * 2.4,
        life: 0.55 + Math.random() * 0.6,
        tile: tile,
        u: (Math.random() * 0.72),
        v: (Math.random() * 0.72),
        size: 0.07 + Math.random() * 0.05
      });
    }
  }

  function updateParticles(dt) {
    var ps = Game.particles, w = Game.world;
    for (var i = ps.length - 1; i >= 0; i--) {
      var p = ps[i];
      p.life -= dt;
      if (p.life <= 0) { ps.splice(i, 1); continue; }
      p.vy -= 22 * dt;
      var nx = p.x + p.vx * dt, ny = p.y + p.vy * dt, nz = p.z + p.vz * dt;
      if (B.isSolid(w.getBlock(Math.floor(nx), Math.floor(p.y), Math.floor(p.z)))) { p.vx *= -0.3; nx = p.x; }
      if (B.isSolid(w.getBlock(Math.floor(p.x), Math.floor(ny), Math.floor(p.z)))) {
        if (p.vy < 0) { p.vy = 0; p.vx *= 0.6; p.vz *= 0.6; } else p.vy = 0;
        ny = p.y;
      }
      if (B.isSolid(w.getBlock(Math.floor(p.x), Math.floor(p.y), Math.floor(nz)))) { p.vz *= -0.3; nz = p.z; }
      p.x = nx; p.y = ny; p.z = nz;
    }
  }

  var particleBuf = null;
  function buildParticleMesh(cam) {
    if (!particleBuf) particleBuf = new YC.MeshBuf(4000);
    particleBuf.reset();
    var ps = Game.particles;
    if (!ps.length) return particleBuf;
    /* カメラの右・上ベクトル */
    var yaw = cam.yaw, pitch = cam.pitch;
    var rx = Math.cos(yaw), ry = 0, rz = -Math.sin(yaw);
    var ux = Math.sin(yaw) * Math.sin(pitch), uy = Math.cos(pitch), uz = Math.cos(yaw) * Math.sin(pitch);
    for (var i = 0; i < ps.length; i++) {
      var p = ps[i];
      var s = p.size * (p.life > 0.2 ? 1 : p.life / 0.2);
      var lg = Game.world.getLight(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
      var skyL = lg * 17, blkL = 0;
      var base = particleBuf.nv;
      var uo = p.u, vo = p.v, us = 0.25;
      var cx = p.x, cy = p.y, cz = p.z;
      function vert(sx, sy, u, v) {
        particleBuf.vert(
          cx + (rx * sx + ux * sy) * s, cy + (ry * sx + uy * sy) * s, cz + (rz * sx + uz * sy) * s,
          p.tile, 0, 0, skyL, blkL, 235, 0);
        /* UV は 0/1 ではなく小数なので、直接書き換える */
        var n = particleBuf.nv - 1;
        particleBuf.u8[n * 20 + 14] = Math.round(u * 255);
        particleBuf.u8[n * 20 + 15] = Math.round(v * 255);
      }
      vert(-1, -1, uo, vo + us);
      vert(1, -1, uo + us, vo + us);
      vert(1, 1, uo + us, vo);
      vert(-1, 1, uo, vo);
      particleBuf.quad(base, false);
    }
    return particleBuf;
  }

  /* ================== 手に持っているブロック ================== */
  function buildHandMesh() {
    var id = Game.hotbar[Game.sel];
    var buf = new YC.MeshBuf(200);
    var def = B.get(id);
    if (!def) {
      /* 何も持っていないときは腕を出す */
      var skin = B.texIndex.skin, sleeve = B.texIndex.sleeve;
      cube(buf, -0.16, -0.16, -0.16, 0.16, 0.55, 0.16, [sleeve, sleeve, skin, skin, sleeve, sleeve]);
      return buf;
    }
    if (def.render === 'cross') {
      /* 花などは板状に */
      var t = def.faces[0];
      var base = buf.nv;
      buf.vert(-0.5, -0.5, 0, t, 0, 1, 255, 0, 250, 0);
      buf.vert(0.5, -0.5, 0, t, 1, 1, 255, 0, 250, 0);
      buf.vert(0.5, 0.5, 0, t, 1, 0, 255, 0, 250, 0);
      buf.vert(-0.5, 0.5, 0, t, 0, 0, 255, 0, 250, 0);
      buf.quad(base, false);
      var b2 = buf.nv;
      buf.vert(0.5, -0.5, 0, t, 1, 1, 255, 0, 250, 0);
      buf.vert(-0.5, -0.5, 0, t, 0, 1, 255, 0, 250, 0);
      buf.vert(-0.5, 0.5, 0, t, 0, 0, 255, 0, 250, 0);
      buf.vert(0.5, 0.5, 0, t, 1, 0, 255, 0, 250, 0);
      buf.quad(b2, false);
      return buf;
    }
    cube(buf, -0.5, -0.5, -0.5, 0.5, 0.5, 0.5, def.faces);
    return buf;
  }

  /* 6 面ぶんのタイルを指定して直方体を作る */
  function cube(buf, x0, y0, z0, x1, y1, z1, faces) {
    var shades = [0.72, 0.72, 1.0, 0.5, 0.86, 0.86];
    var quads = [
      [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]],
      [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]],
      [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]],
      [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]],
      [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]],
      [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]]
    ];
    var uvs = [[0, 1], [1, 1], [1, 0], [0, 0]];
    for (var f = 0; f < 6; f++) {
      var base = buf.nv;
      for (var k = 0; k < 4; k++) {
        var p = quads[f][k];
        buf.vert(p[0], p[1], p[2], faces[f], uvs[k][0], uvs[k][1], 255, 0, shades[f] * 255, 0);
      }
      buf.quad(base, false);
    }
  }

  function handMatrix() {
    var m = YC.M4.create();
    var sw = Game.swing;
    var t = sw > 0 ? Math.min(1, sw / 0.26) : 0;
    var swing = Math.sin(t * Math.PI);
    var p = Game.player;
    var id = Game.hotbar[Game.sel];
    var def = B.get(id);
    var isCross = def && def.render === 'cross';

    /* 画面の右下に同じ大きさで出るように、画角と縦横比から位置を逆算する */
    var aspect = Game.renderer.aspect || 1.6;
    var fov = Game.settings.fov * Math.PI / 180;
    var f = 1 / Math.tan(fov / 2);
    var tz = -0.66;
    var touch = Game.touchUI;
    var ndcX = (touch ? 0.52 : 0.68) + Math.sin(p.bob * 2) * 0.014 - swing * 0.18;
    var ndcY = (touch ? -0.46 : -0.74) + Math.abs(Math.cos(p.bob * 2)) * 0.02 - swing * 0.30;
    var tx = ndcX * aspect * (-tz) / f;
    var ty = ndcY * (-tz) / f;
    /* 縦長の画面では相対的に大きくなりすぎるので、少し小さくする */
    var scale = (isCross ? 0.26 : 0.22) * Math.min(1, 0.55 + aspect * 0.45);
    YC.M4.trs(m, tx, ty, tz + swing * 0.1, -0.18 + swing * 0.8, 0.62 - swing * 0.35, scale);
    return m;
  }

  /* ================== 空の色 ================== */
  function skyState() {
    var t = Game.timeOfDay;
    var ang = t * Math.PI * 2;
    var sx = Math.cos(ang), sy = Math.sin(ang), sz = 0.3;
    var len = Math.sqrt(sx * sx + sy * sy + sz * sz);
    var sunDir = [sx / len, sy / len, sz / len];
    var dayness = clamp((sunDir[1] + 0.12) / 0.32, 0, 1);
    var sun = (0.26 + 0.74 * dayness) * Game.settings.brightness;
    var night = 1 - clamp((sunDir[1] + 0.14) / 0.22, 0, 1);
    /* 夕焼けの度合い */
    var dusk = Math.max(0, 1 - Math.abs(sunDir[1]) * 4.5) * (1 - night * 0.4);
    function mix(a, b, k) { return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; }
    var zenDay = [0.28, 0.52, 0.96], zenNight = [0.012, 0.022, 0.075];
    var horDay = [0.68, 0.82, 0.99], horNight = [0.035, 0.05, 0.12];
    var zenith = mix(zenNight, zenDay, dayness);
    var horizon = mix(horNight, horDay, dayness);
    horizon = mix(horizon, [0.95, 0.55, 0.32], dusk * 0.55);
    var fog = mix(horizon, zenith, 0.22);
    return { sunDir: sunDir, sun: clamp(sun, 0, 1.4), night: night, zenith: zenith, horizon: horizon, fog: fog, dayness: dayness };
  }

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /* ================== メインループ ================== */
  var last = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = last ? Math.min((now - last) / 1000, 0.1) : 0.016;
    last = now;

    Game.stats.frames++;
    if (now - Game.stats.t0 > 500) {
      Game.stats.fps = Math.round(Game.stats.frames * 1000 / (now - Game.stats.t0));
      Game.stats.frames = 0; Game.stats.t0 = now;
    }

    var playing = Game.mode === 'play';
    /* 時間の流れ */
    if (Game.settings.timeFlow === 'cycle' && (playing || Game.mode === 'title')) {
      Game.timeOfDay += dt / DAY_LENGTH;
      while (Game.timeOfDay >= 1) { Game.timeOfDay -= 1; Game.day++; }
    }

    /* チャンクの読み込み（読み込み中は多めに時間を使う） */
    var budget = (Game.loadingDone ? 7 : 14);
    chunkPipeline(budget);

    if (Game.mode === 'loadwait') {
      el['bar-fill'].style.width = Math.round((Game.loadProgress || 0) * 100) + '%';
      el['loading-text'].textContent = '地形をつくっています… ' + Math.round((Game.loadProgress || 0) * 100) + '%';
      if (Game.loadingDone) enterPlay();
    }

    if (playing) {
      updateControl(dt);
      Game.player.update(dt, Game.ctrl, {
        autoJump: Game.settings.autoJump,
        onStep: function (id) { if (Game.settings.sound) Audio.step(id); }
      });
      Game.target = targetBlock();
      handleHold(dt, now);
      if (Game.swing > 0) { Game.swing += dt; if (Game.swing > 0.26) Game.swing = 0; }
      var p = Game.player;
      if (Math.abs(p.x - (Game.lastX || 0)) + Math.abs(p.z - (Game.lastZ || 0)) > 1.5) {
        Game.lastX = p.x; Game.lastZ = p.z; Game.movedSinceSave = true;
      }
      autosave();
    } else {
      Game.target = null;
    }
    updateParticles(dt);

    /* カメラ */
    var cam;
    if (Game.mode === 'title' || Game.mode === 'newworld' || (!Game.loadingDone && Game.mode !== 'play')) {
      /* タイトル画面はゆっくり回る風景 */
      Game.panoYaw = (Game.panoYaw || 0) + dt * 0.055;
      var pp = Game.player;
      cam = { x: pp.x, y: pp.y + 15, z: pp.z, yaw: Game.panoYaw, pitch: -0.22 };
    } else {
      var pl = Game.player;
      var bobAmt = pl.onGround ? 0.035 : 0.01;
      cam = {
        x: pl.x + Math.cos(pl.yaw) * Math.sin(pl.bob * 2) * 0.03,
        y: pl.eyeY() + Math.abs(Math.cos(pl.bob * 2)) * bobAmt - bobAmt,
        z: pl.z - Math.sin(pl.yaw) * Math.sin(pl.bob * 2) * 0.03,
        yaw: pl.yaw, pitch: pl.pitch
      };
    }

    var sky = skyState();
    var camBlock = Game.world.getBlock(Math.floor(cam.x), Math.floor(cam.y), Math.floor(cam.z));
    var underwater = camBlock === ID.WATER;
    var inLava = camBlock === ID.LAVA;
    el['water-tint'].style.opacity = underwater ? '1' : '0';
    el['lava-tint'].style.opacity = inLava ? '1' : '0';

    var chunks = [];
    Game.world.chunks.forEach(function (c) { if (c.gl) chunks.push(c); });

    if (!Game.handMesh) Game.handMesh = buildHandMesh();

    var fogColor = underwater ? [0.09, 0.25, 0.5] : (inLava ? [0.55, 0.18, 0.03] : sky.fog);
    Game.renderer.render({
      cam: cam,
      fov: Game.settings.fov + (Game.player.sprinting ? 4 : 0),
      sun: sky.sun,
      night: sky.night,
      sunDir: sky.sunDir,
      moonPhase: ((Game.day % 8) / 8) * 2 - 1,
      sky: { zenith: sky.zenith, horizon: sky.horizon, fog: fogColor },
      chunks: chunks,
      time: now / 1000,
      renderDist: Game.settings.renderDist,
      underwater: underwater || inLava,
      clouds: Game.settings.clouds,
      selection: (playing && Game.target) ? Game.target : null,
      particles: buildParticleMesh(cam),
      hand: playing ? { mesh: Game.handMesh, matrix: handMatrix() } : null
    });

    updateDebug(sky);
  }

  function updateDebug(sky) {
    var show = Game.settings.showCoords && (Game.mode === 'play' || Game.mode === 'inventory');
    el.debug.hidden = !show;
    if (!show) return;
    var p = Game.player, w = Game.world;
    var bx = Math.floor(p.x), by = Math.floor(p.y), bz = Math.floor(p.z);
    var h = w.gen.heightAt(bx, bz);
    var biome = G.BIOME_JA[w.gen.biomeAt(bx, bz, h)];
    var dirs = ['南', '南西', '西', '北西', '北', '北東', '東', '南東'];
    var di = Math.round(((p.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / (Math.PI / 4)) % 8;
    var mins = Math.floor(Game.timeOfDay * 24 * 60 + 6 * 60) % (24 * 60);
    var hh = String(Math.floor(mins / 60)).padStart(2, '0');
    var mm = String(mins % 60).padStart(2, '0');
    var sl = w.getLight(bx, Math.floor(p.eyeY()), bz);
    el.debug.textContent =
      'YoursCraft ' + VERSION + '  |  ' + Game.stats.fps + ' fps\n' +
      'XYZ: ' + p.x.toFixed(1) + ' / ' + p.y.toFixed(1) + ' / ' + p.z.toFixed(1) + '\n' +
      'ブロック: ' + bx + ' ' + by + ' ' + bz + '  チャンク: ' + (bx >> 4) + ',' + (bz >> 4) + '\n' +
      '向き: ' + dirs[di] + '  バイオーム: ' + biome + '\n' +
      '明るさ: ' + sl + '/15   時刻: ' + hh + ':' + mm + '（' + (Game.day + 1) + '日目）\n' +
      '描画: ' + Game.renderer.chunkCount + ' チャンク / ' + Math.round(Game.renderer.triCount / 1000) + 'k 三角形\n' +
      'seed: ' + w.seed + '  ' + (Game.player.flying ? '飛行中' : '歩行中') +
      '  セーブ: ' + (Save.mode === 'idb' ? 'IndexedDB' : 'ブラウザ内');
  }

  /* ================== 操作 ================== */
  Game.ctrl = { moveX: 0, moveZ: 0, jump: false, sneak: false };
  var keys = {};
  var pointers = new Map();
  var lookId = null;
  var stickId = null;
  var holdAction = null, holdSource = null, holdStart = 0, holdLast = 0, holdMoved = 0;
  var lastTouchAt = 0;   /* タッチの直後に来る「合成マウスイベント」を無視するため */
  var TAP_MS = 350;      /* これより短ければ「タップ（置く）」、長ければ「長押し（壊す）」 */
  var TAP_SLOP = 24;     /* タップと認める、押しはじめからのずれ（px） */
  var HOLD_SLOP = 44;    /* 長押しと認める、押しはじめからのずれ（px） */

  /* タッチ端末では、指の操作のあとにブラウザが mousedown/mouseup/mousemove を
     追加で投げてくる（互換のための合成イベント）。これを本物のマウスとして扱うと
     ・置く／壊すが二重に走る（連打のようになる）
     ・ポインタロックがかかって視点が二重に動く
     ということが起きるので、直近にタッチがあったら無視する。 */
  function fromTouch() { return performance.now() - lastTouchAt < 900; }

  function updateControl(dt) {
    var c = Game.ctrl;
    /* キーボード */
    var kx = 0, kz = 0;
    if (keys['KeyW'] || keys['ArrowUp']) kz -= 1;
    if (keys['KeyS'] || keys['ArrowDown']) kz += 1;
    if (keys['KeyA'] || keys['ArrowLeft']) kx -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) kx += 1;
    if (kx || kz) { c.moveX = kx; c.moveZ = kz; }
    else if (stickId === null) { c.moveX = 0; c.moveZ = 0; }
    if (keys['Space']) c.jump = true;
    else if (!Game.btnJump && !Game.btnUp) c.jump = false;
    if (keys['ShiftLeft'] || keys['ShiftRight']) c.sneak = true;
    else if (!Game.btnDown) c.sneak = false;
    Game.player.sprinting = !!(keys['ControlLeft'] || keys['ControlRight'] || Game.stickFull);
  }

  function handleHold(dt, now) {
    if (!holdAction) return;
    if (now - holdLast < (holdAction === 'dig' ? 190 : 260)) return;
    holdLast = now;
    if (holdAction === 'dig') digBlock();
    else placeBlock();
  }

  function setupInput() {
    var canvas = el.gl;
    document.body.classList.toggle('desktop', !isTouch());

    /* ---- キーボード ---- */
    window.addEventListener('keydown', function (e) {
      if (e.target && e.target.tagName === 'INPUT') return;
      keys[e.code] = true;
      if (e.code === 'Escape') {
        if (Game.mode === 'play') pauseGame();
        else if (Game.mode === 'inventory') closeInventory();
        else if (Game.mode === 'settings' || Game.mode === 'help') backFromSub();
        else if (Game.mode === 'pause') enterPlay();
      }
      if (Game.mode !== 'play' && Game.mode !== 'inventory') return;
      if (e.code === 'KeyE') { e.preventDefault(); Game.mode === 'inventory' ? closeInventory() : openInventory(); }
      if (e.code === 'F3') { e.preventDefault(); Game.settings.showCoords = !Game.settings.showCoords; }
      if (e.code === 'KeyF') toggleFly();
      if (e.code === 'Space') {
        var t = performance.now();
        if (t - (Game.lastSpace || 0) < 300) toggleFly();
        Game.lastSpace = t;
      }
      if (e.code.indexOf('Digit') === 0) {
        var n = parseInt(e.code.slice(5), 10);
        if (n >= 1 && n <= 9) selectSlot(n - 1);
      }
    });
    window.addEventListener('keyup', function (e) { keys[e.code] = false; });
    window.addEventListener('wheel', function (e) {
      if (Game.mode !== 'play') return;
      selectSlot(Game.sel + (e.deltaY > 0 ? 1 : -1));
    }, { passive: true });

    /* ---- マウス（ポインタロック） ---- */
    canvas.addEventListener('mousedown', function (e) {
      if (Game.mode !== 'play' || fromTouch()) return;
      /* 本物のマウスを一度も見ていないタッチ端末では、マウス操作系をまるごと使わない
         （ポインタロックがかかると指のドラッグと二重に視点が動いてしまう） */
      if (Game.touchUI && !Game.sawMouse) return;
      if (document.pointerLockElement !== canvas) { canvas.requestPointerLock(); return; }
      if (e.button === 0) { digBlock(); holdAction = 'dig'; holdSource = 'mouse'; holdLast = performance.now(); }
      else if (e.button === 2) { placeBlock(); holdAction = 'place'; holdSource = 'mouse'; holdLast = performance.now(); }
      else if (e.button === 1) { pickBlock(); }
    });
    window.addEventListener('mouseup', function () {
      if (holdSource === 'mouse') { holdAction = null; holdSource = null; }
    });
    document.addEventListener('mousemove', function (e) {
      if (document.pointerLockElement !== canvas || fromTouch()) return;
      /* ロックした直後は、カーソルが画面中央へ飛ぶぶんの大きな移動量が来るので少しの間捨てる */
      if (performance.now() - (Game.lockTime || 0) < 120) return;
      look(e.movementX, e.movementY);
    });
    document.addEventListener('pointerlockchange', function () {
      if (document.pointerLockElement === canvas) { Game.lockTime = performance.now(); return; }
      if (Game.mode === 'play' && !isTouch()) pauseGame();
    });

    /* ---- タッチ ---- */
    canvas.addEventListener('pointerdown', function (e) {
      if (Game.mode !== 'play') return;
      if (e.pointerType === 'mouse') { Game.sawMouse = true; return; }
      /* 合成マウスイベントが飛んでこないようにする（二重入力の元） */
      if (e.cancelable) e.preventDefault();
      lastTouchAt = performance.now();
      capture(canvas, e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: 0, dist: 0 });
      if (lookId === null) lookId = e.pointerId;
      holdStart = performance.now();
      holdMoved = 0;
      Game.pendingTap = e.pointerId;
    });
    canvas.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'mouse') Game.sawMouse = true;
      var p = pointers.get(e.pointerId);
      if (!p) return;
      lastTouchAt = performance.now();
      var dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      p.moved += Math.abs(dx) + Math.abs(dy);
      /* 「動いたか」は押しはじめからの距離で見る。移動量の足し算だと、
         指のわずかなブレが積み上がって、ふつうのタップまで無効になってしまう。 */
      var ox = e.clientX - p.sx, oy = e.clientY - p.sy;
      p.dist = Math.sqrt(ox * ox + oy * oy);
      if (e.pointerId === lookId) look(dx * 1.35, dy * 1.35);
      if (p.dist > TAP_SLOP) {
        holdMoved = 1;
        if (Game.pendingTap === e.pointerId && !holdAction) Game.pendingTap = null;
      }
      /* 長押し中に指を動かしても壊し続ける（Bedrock 版と同じ感じ） */
    });
    function endPointer(e) {
      var p = pointers.get(e.pointerId);
      if (!p) return;
      pointers.delete(e.pointerId);
      var held = performance.now() - p.t;
      if (e.pointerId === lookId) lookId = pointers.size ? pointers.keys().next().value : null;
      if (holdAction && holdSource === 'touch') { holdAction = null; holdSource = null; return; }
      if (Game.pendingTap === e.pointerId && p.dist < TAP_SLOP && held < TAP_MS) {
        /* 短いタップ */
        if (Game.settings.swapTap) digBlock(); else placeBlock();
      }
      Game.pendingTap = null;
    }
    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);

    /* タップを長押しに切り替える監視 */
    setInterval(function () {
      if (Game.mode !== 'play' || holdAction) return;
      if (Game.pendingTap === null || Game.pendingTap === undefined) return;
      var p = pointers.get(Game.pendingTap);
      if (!p) return;
      if (performance.now() - p.t > TAP_MS && p.dist < HOLD_SLOP) {
        holdAction = Game.settings.swapTap ? 'place' : 'dig';
        holdSource = 'touch';
        holdLast = 0;
        Game.pendingTap = null;
      }
    }, 40);

    /* ---- バーチャルスティック ---- */
    var stick = el.stick, knob = el.knob;
    var DEAD = 0.14;          /* 中心付近の遊び。指を置いただけで動き出さないように */
    function stickMove(e) {
      var r = stick.getBoundingClientRect();
      var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      var dx = e.clientX - cx, dy = e.clientY - cy;
      var max = r.width / 2 - 12;
      var d = Math.sqrt(dx * dx + dy * dy) || 0.0001;
      if (d > max) { dx = dx / d * max; dy = dy / d * max; d = max; }
      knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      var t = d / max;
      if (t < DEAD) {
        Game.ctrl.moveX = 0; Game.ctrl.moveZ = 0;
        Game.stickFull = false;
        return;
      }
      var scale = ((t - DEAD) / (1 - DEAD)) / t;   /* 遊びのぶんを引いて再スケール */
      Game.ctrl.moveX = (dx / max) * scale;
      Game.ctrl.moveZ = (dy / max) * scale;
      /* ダッシュは、はっきり外周まで倒したときだけ（戻すときのしきい値は低くしてバタつかせない） */
      Game.stickFull = Game.stickFull ? t > 0.82 : t > 0.95;
    }
    stick.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      if (stickId !== null) return;      /* すでに別の指がスティックを持っているなら奪わない */
      lastTouchAt = performance.now();
      capture(stick, e.pointerId);
      stickId = e.pointerId;
      stickMove(e);
    });
    stick.addEventListener('pointermove', function (e) {
      if (stickId !== e.pointerId) return;
      if (e.pointerType !== 'mouse') lastTouchAt = performance.now();
      stickMove(e);
    });
    function stickEnd(e) {
      if (e && stickId !== e.pointerId) return;
      stickId = null;
      knob.style.transform = 'translate(0,0)';
      Game.ctrl.moveX = 0; Game.ctrl.moveZ = 0;
      Game.stickFull = false;
    }
    stick.addEventListener('pointerup', stickEnd);
    stick.addEventListener('pointercancel', stickEnd);
    stick.addEventListener('lostpointercapture', stickEnd);

    /* ---- 右下のボタン ---- */
    var btnUps = [];      /* 取りこぼしたときに、まとめて離すため */
    function holdBtn(id, onDown, onUp) {
      var b = el[id];
      var heldId = null;
      b.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        if (e.pointerType !== 'mouse') lastTouchAt = performance.now();
        heldId = e.pointerId;
        capture(b, e.pointerId);
        b.classList.add('on');
        onDown();
      });
      function up(e) {
        if (e && heldId !== null && e.pointerId !== heldId) return;
        heldId = null;
        b.classList.remove('on');
        onUp && onUp();
      }
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('lostpointercapture', up);
      btnUps.push(up);
    }
    holdBtn('btn-jump', function () {
      Game.btnJump = true; Game.ctrl.jump = true;
      var t = performance.now();
      if (t - (Game.lastJumpTap || 0) < 320) toggleFly();
      Game.lastJumpTap = t;
    }, function () { Game.btnJump = false; Game.ctrl.jump = false; });
    holdBtn('btn-up', function () { Game.btnUp = true; Game.ctrl.jump = true; }, function () { Game.btnUp = false; Game.ctrl.jump = false; });
    holdBtn('btn-down', function () { Game.btnDown = true; Game.ctrl.sneak = true; }, function () { Game.btnDown = false; Game.ctrl.sneak = false; });
    /* 壊す／置くのボタン。押しっぱなしで連続して効く（画面の長押しと同じ） */
    holdBtn('btn-break', function () {
      digBlock();
      holdAction = 'dig'; holdSource = 'button'; holdLast = performance.now();
    }, function () {
      if (holdSource === 'button') { holdAction = null; holdSource = null; }
    });
    holdBtn('btn-place', function () {
      placeBlock();
      holdAction = 'place'; holdSource = 'button'; holdLast = performance.now();
    }, function () {
      if (holdSource === 'button') { holdAction = null; holdSource = null; }
    });
    el['btn-fly'].addEventListener('click', function (e) { e.preventDefault(); toggleFly(); });

    /* ---- ホットバー（タップで選ぶ・長押しでインベントリ） ---- */
    var hbTimer = null;
    el.hotbar.addEventListener('pointerdown', function (e) {
      var slot = e.target.closest ? e.target.closest('.slot') : null;
      if (!slot) return;
      e.preventDefault();
      var i = parseInt(slot.dataset.i, 10);
      selectSlot(i);
      hbTimer = setTimeout(openInventory, 420);
    });
    el.hotbar.addEventListener('pointerup', function () { clearTimeout(hbTimer); });
    el.hotbar.addEventListener('pointercancel', function () { clearTimeout(hbTimer); });

    /* ---- 保険：ボタンやスティックの上で指が離れなかった場合でも必ず戻す ----
       （pointerup を要素が取りこぼすと「押されっぱなし」になり、
         勝手に歩き続ける・飛び続けるという症状になる） */
    function globalRelease(e) {
      if (stickId === e.pointerId) stickEnd(e);
      for (var i = 0; i < btnUps.length; i++) btnUps[i](e);
      if (pointers.has(e.pointerId)) endPointer(e);
    }
    window.addEventListener('pointerup', globalRelease, true);
    window.addEventListener('pointercancel', globalRelease, true);

    /* ---- 離脱時にセーブ ---- */
    window.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') doSave(true);
    });
    window.addEventListener('pagehide', function () { doSave(true); });
    window.addEventListener('blur', function () {
      keys = {};
      Game.ctrl.jump = false; Game.ctrl.sneak = false;
      Game.ctrl.moveX = 0; Game.ctrl.moveZ = 0;
      Game.btnJump = Game.btnUp = Game.btnDown = false;
      stickEnd(null);
      holdAction = null; holdSource = null;
    });
  }

  /* setPointerCapture は環境によって例外を投げることがあるので包む */
  function capture(elm, id) {
    try { elm.setPointerCapture(id); } catch (e) { /* 使えなくても操作は続けられる */ }
  }

  function look(dx, dy) {
    var p = Game.player;
    /* 1 イベントぶんの移動量が極端に大きいときは切り捨てる（視点が飛ぶのを防ぐ） */
    var LIM = 140;
    if (dx > LIM) dx = LIM; else if (dx < -LIM) dx = -LIM;
    if (dy > LIM) dy = LIM; else if (dy < -LIM) dy = -LIM;
    var s = 0.0032 * Game.settings.sens;
    p.yaw -= dx * s;
    p.pitch -= dy * s;
    var lim = Math.PI / 2 - 0.01;
    if (p.pitch > lim) p.pitch = lim;
    if (p.pitch < -lim) p.pitch = -lim;
    p.yaw = p.yaw % (Math.PI * 2);
  }

  function toggleFly() {
    var p = Game.player;
    p.flying = !p.flying;
    if (!p.flying) p.vy = Math.min(p.vy, 0);
    el['btn-fly'].classList.toggle('on', p.flying);
    hint(p.flying ? '飛行モード（▲▼で上下）' : '歩行モード', 1800);
    Audio.click();
  }

  /* 中クリック：見ているブロックをホットバーへ（マイクラのピック） */
  function pickBlock() {
    var t = Game.target;
    if (!t) return;
    Game.hotbar[Game.sel] = t.id;
    Game.handMesh = null;
    refreshHotbar();
    showItemName();
    Game.world.dirtySave = true;
  }

  function releasePointerLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /* デバッグ・動作確認用に内部関数を少しだけ出しておく */
  /* 入力まわりの不具合を追うためのデバッグ窓口 */
  Game.inputState = function () {
    return { holdAction: holdAction, holdSource: holdSource, pendingTap: Game.pendingTap,
      lookId: lookId, stickId: stickId, pointers: pointers.size, sawMouse: !!Game.sawMouse,
      fromTouch: fromTouch() };
  };
  Game.dig = digBlock;
  Game.refreshHotbar = refreshHotbar;
  Game.place = placeBlock;
  Game.setBlockAt = setBlock;
  Game.enterPlay = enterPlay;
  Game.openInventory = openInventory;
  Game.doSave = doSave;
  Game.pickBlock = pickBlock;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
