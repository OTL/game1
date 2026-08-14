/* game.js — CHAIN BLAST 本体 */
(function () {
  'use strict';

  var SIZE = 8;
  var N = SIZE * SIZE;
  var LINES_PER_LEVEL = 12;
  var CHARGE_MAX = 55;
  var CLEAR_ANIM = 300;

  var STORE_BEST = 'chainblast.best';
  var STORE_SOUND = 'chainblast.sound';

  /* ───────── DOM ───────── */
  var boardEl = document.getElementById('board');
  var fxEl = document.getElementById('fx');
  var toastEl = document.getElementById('toast');
  var wrapEl = document.getElementById('board-wrap');
  var trayEl = document.getElementById('tray');
  var scoreEl = document.getElementById('score');
  var bestEl = document.getElementById('best');
  var levelEl = document.getElementById('level');
  var levelFill = document.getElementById('level-fill');
  var comboEl = document.getElementById('combo');
  var comboBadge = document.getElementById('combo-badge');
  var chargeFill = document.getElementById('charge-fill');
  var overlay = document.getElementById('overlay');
  var cells = [];
  var slots = [];
  var ghost = null;

  /* ───────── State ───────── */
  var state = null;
  var locked = false;
  var selected = -1;
  var tool = null;
  var drag = null;

  function newState() {
    return {
      grid: new Array(N).fill(null),
      tray: [null, null, null],
      score: 0,
      best: parseInt(localStorage.getItem(STORE_BEST) || '0', 10) || 0,
      combo: 0,
      bestCombo: 0,
      lines: 0,
      level: 1,
      charge: 0,
      power: { hammer: 0, bomb: 0, shuffle: 1 },
      rescueUsed: false,
      over: false
    };
  }

  /* ───────── Helpers ───────── */
  function idx(r, c) { return r * SIZE + c; }
  function rowOf(i) { return (i / SIZE) | 0; }
  function colOf(i) { return i % SIZE; }
  function colorVar(name) { return 'var(--c-' + name + ')'; }

  function makeBlock(color, special) {
    return { color: color, special: special || null, stone: false, hp: 1 };
  }

  function makeStone() {
    return { color: 'stone', special: null, stone: true, hp: 2 };
  }

  /* ───────── Board build & render ───────── */
  function buildBoard() {
    boardEl.innerHTML = '';
    cells = [];
    for (var i = 0; i < N; i++) {
      var d = document.createElement('div');
      d.className = 'cell';
      d.dataset.i = i;
      boardEl.appendChild(d);
      cells.push(d);
    }
  }

  function renderBoard() {
    for (var i = 0; i < N; i++) {
      var cell = cells[i];
      cell.className = 'cell';
      var b = state.grid[i];
      if (!b) { cell.innerHTML = ''; continue; }

      var el = cell.firstChild;
      if (!el || !el.classList || !el.classList.contains('block')) {
        cell.innerHTML = '';
        el = document.createElement('div');
        el.className = 'block';
        cell.appendChild(el);
      }
      el.className = 'block' +
        (b.stone ? ' stone' : '') +
        (b.stone && b.hp === 1 ? ' cracked' : '') +
        (b.special ? ' special' : '');
      el.style.setProperty('--bc', colorVar(b.color));
      el.textContent = b.special === 'bomb' ? '💣' : (b.special === 'star' ? '⭐' : '');
    }
  }

  function renderTray() {
    for (var s = 0; s < 3; s++) {
      var slot = slots[s];
      var piece = state.tray[s];
      slot.innerHTML = '';
      slot.classList.remove('selected', 'dragging', 'dead');
      if (!piece) continue;

      var mini = document.createElement('div');
      mini.className = 'mini';
      mini.style.gridTemplateColumns = 'repeat(' + piece.w + ', auto)';
      var ms = piece.w >= 5 || piece.h >= 5 ? 13 : (piece.w >= 4 || piece.h >= 4 ? 15 : 18);
      mini.style.setProperty('--ms', ms + 'px');

      var map = {};
      piece.cells.forEach(function (p, k) { map[p[0] + ':' + p[1]] = k; });

      for (var r = 0; r < piece.h; r++) {
        for (var c = 0; c < piece.w; c++) {
          var mb = document.createElement('div');
          var k = map[r + ':' + c];
          if (k === undefined) {
            mb.className = 'mb empty';
          } else {
            mb.className = 'mb';
            mb.style.setProperty('--bc', colorVar(piece.color));
            var sp = piece.specials[k];
            if (sp) mb.textContent = sp === 'bomb' ? '💣' : '⭐';
          }
          mini.appendChild(mb);
        }
      }
      slot.appendChild(mini);

      if (selected === s) slot.classList.add('selected');
      if (!anyPlacement(piece)) slot.classList.add('dead');
    }
  }

  function renderHud() {
    scoreEl.textContent = state.score.toLocaleString();
    bestEl.textContent = state.best.toLocaleString();
    levelEl.textContent = state.level;
    levelFill.style.width = ((state.lines % LINES_PER_LEVEL) / LINES_PER_LEVEL * 100) + '%';
    comboEl.textContent = state.combo;
    comboBadge.classList.toggle('on', state.combo > 1);
    chargeFill.style.width = (state.charge / CHARGE_MAX * 100) + '%';

    ['hammer', 'bomb', 'shuffle'].forEach(function (t) {
      var btn = document.querySelector('.pw[data-tool="' + t + '"]');
      document.getElementById('pw-' + t).textContent = state.power[t];
      btn.disabled = state.power[t] <= 0 || state.over;
      btn.classList.toggle('armed', tool === t);
    });
  }

  function render() {
    renderBoard();
    renderTray();
    renderHud();
  }

  /* ───────── Placement rules ───────── */
  function canPlace(piece, r0, c0) {
    for (var k = 0; k < piece.cells.length; k++) {
      var r = r0 + piece.cells[k][0];
      var c = c0 + piece.cells[k][1];
      if (r < 0 || c < 0 || r >= SIZE || c >= SIZE) return false;
      if (state.grid[idx(r, c)]) return false;
    }
    return true;
  }

  function anyPlacement(piece) {
    for (var r = 0; r <= SIZE - piece.h; r++) {
      for (var c = 0; c <= SIZE - piece.w; c++) {
        if (canPlace(piece, r, c)) return true;
      }
    }
    return false;
  }

  function hasAnyMove() {
    for (var s = 0; s < 3; s++) {
      if (state.tray[s] && anyPlacement(state.tray[s])) return true;
    }
    return false;
  }

  /* 配置後に揃うラインを求める（プレビュー・判定共用） */
  function linesAfter(piece, r0, c0) {
    var occ = new Array(N);
    for (var i = 0; i < N; i++) occ[i] = !!state.grid[i];
    if (piece) {
      for (var k = 0; k < piece.cells.length; k++) {
        occ[idx(r0 + piece.cells[k][0], c0 + piece.cells[k][1])] = true;
      }
    }
    var rows = [], cols = [], r, c, full;
    for (r = 0; r < SIZE; r++) {
      full = true;
      for (c = 0; c < SIZE; c++) if (!occ[idx(r, c)]) { full = false; break; }
      if (full) rows.push(r);
    }
    for (c = 0; c < SIZE; c++) {
      full = true;
      for (r = 0; r < SIZE; r++) if (!occ[idx(r, c)]) { full = false; break; }
      if (full) cols.push(c);
    }
    return { rows: rows, cols: cols };
  }

  /* ───────── Tray refill ───────── */
  function refillTray(force) {
    if (!force && state.tray.some(function (p) { return p; })) return;

    for (var attempt = 0; attempt < 30; attempt++) {
      var set = [
        Pieces.createPiece(state.level),
        Pieces.createPiece(state.level),
        Pieces.createPiece(state.level)
      ];
      var fits = set.some(function (p) { return anyPlacement(p); });
      if (fits || attempt === 29) {
        state.tray = set;
        break;
      }
    }
    slots.forEach(function (s) {
      s.classList.remove('refill');
      void s.offsetWidth;
      s.classList.add('refill');
    });
  }

  /* ───────── 特殊ブロックの連鎖展開 ───────── */
  function expandSpecials(baseSet) {
    var all = new Set(baseSet);
    var queue = Array.from(baseSet);
    var triggered = [];

    while (queue.length) {
      var i = queue.shift();
      var b = state.grid[i];
      if (!b || !b.special) continue;
      triggered.push({ i: i, type: b.special });

      var add = [];
      if (b.special === 'bomb') {
        var r = rowOf(i), c = colOf(i);
        for (var dr = -1; dr <= 1; dr++) {
          for (var dc = -1; dc <= 1; dc++) {
            var rr = r + dr, cc = c + dc;
            if (rr >= 0 && cc >= 0 && rr < SIZE && cc < SIZE) add.push(idx(rr, cc));
          }
        }
      } else if (b.special === 'star') {
        var sr = rowOf(i), sc = colOf(i), k;
        for (k = 0; k < SIZE; k++) { add.push(idx(sr, k)); add.push(idx(k, sc)); }
      }

      add.forEach(function (j) {
        if (state.grid[j] && !all.has(j)) {
          all.add(j);
          queue.push(j);
        }
      });
    }
    return { all: all, triggered: triggered };
  }

  /* ───────── 破壊の実行（アニメ → 反映） ───────── */
  function playDestroy(indices, opts, done) {
    opts = opts || {};
    var destroyed = [];
    var damaged = [];

    indices.forEach(function (i) {
      var b = state.grid[i];
      if (!b) return;
      if (b.stone && b.hp > 1 && !opts.force) damaged.push(i);
      else destroyed.push(i);
    });

    destroyed.forEach(function (i) {
      var el = cells[i].firstChild;
      if (el) el.classList.add('clearing');
      spawnParticles(i, state.grid[i].color, destroyed.length > 22 ? 3 : 6);
    });
    damaged.forEach(function (i) {
      var el = cells[i].firstChild;
      if (el) { el.classList.add('cracked'); }
      state.grid[i].hp -= 1;
    });

    setTimeout(function () {
      destroyed.forEach(function (i) { state.grid[i] = null; });
      renderBoard();
      if (done) done();
    }, CLEAR_ANIM);

    return { destroyed: destroyed, damaged: damaged };
  }

  /* ───────── FX ───────── */
  function cellCenter(i) {
    var cr = cells[i].getBoundingClientRect();
    var wr = wrapEl.getBoundingClientRect();
    return { x: cr.left - wr.left + cr.width / 2, y: cr.top - wr.top + cr.height / 2 };
  }

  function spawnParticles(i, color, count) {
    var p = cellCenter(i);
    for (var k = 0; k < count; k++) {
      var el = document.createElement('div');
      el.className = 'particle';
      el.style.left = (p.x - 4) + 'px';
      el.style.top = (p.y - 4) + 'px';
      el.style.setProperty('--pcol', colorVar(color));
      var ang = Math.random() * Math.PI * 2;
      var dist = 30 + Math.random() * 70;
      el.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
      el.style.setProperty('--dy', (Math.sin(ang) * dist + 40) + 'px');
      el.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
      el.style.setProperty('--dur', (0.5 + Math.random() * 0.45) + 's');
      fxEl.appendChild(el);
      (function (node) { setTimeout(function () { node.remove(); }, 1000); })(el);
    }
  }

  function floatScore(i, text) {
    var p = cellCenter(i);
    var el = document.createElement('div');
    el.className = 'float-score';
    el.style.left = p.x + 'px';
    el.style.top = p.y + 'px';
    el.textContent = text;
    fxEl.appendChild(el);
    setTimeout(function () { el.remove(); }, 1000);
  }

  function toast(text) {
    var el = document.createElement('div');
    el.className = 'toast-line';
    el.textContent = text;
    toastEl.appendChild(el);
    setTimeout(function () { el.remove(); }, 1100);
  }

  function shake() {
    wrapEl.classList.remove('shake');
    void wrapEl.offsetWidth;
    wrapEl.classList.add('shake');
  }

  function bumpScore() {
    scoreEl.classList.add('pop');
    setTimeout(function () { scoreEl.classList.remove('pop'); }, 130);
  }

  /* ───────── スコア加算 ───────── */
  function addScore(n) {
    state.score += n;
    if (state.score > state.best) {
      state.best = state.score;
      localStorage.setItem(STORE_BEST, String(state.best));
    }
    bumpScore();
  }

  function addCharge(n) {
    state.charge += n;
    while (state.charge >= CHARGE_MAX) {
      state.charge -= CHARGE_MAX;
      grantPower();
    }
  }

  function grantPower() {
    var pool = ['hammer', 'bomb', 'shuffle'];
    var t = pool[(Math.random() * pool.length) | 0];
    state.power[t] += 1;
    Sound.power();
    toast('POWER UP! ' + (t === 'hammer' ? '🔨' : t === 'bomb' ? '💣' : '🎲'));
  }

  function checkLevel() {
    var lv = 1 + Math.floor(state.lines / LINES_PER_LEVEL);
    if (lv <= state.level) return;
    state.level = lv;
    Sound.levelup();
    toast('LEVEL ' + lv);
    spawnStones(Math.min(1 + Math.floor(lv / 4), 3));
  }

  function spawnStones(count) {
    var empty = [];
    for (var i = 0; i < N; i++) if (!state.grid[i]) empty.push(i);
    if (empty.length < 20) return;
    for (var k = 0; k < count && empty.length; k++) {
      var pick = (Math.random() * empty.length) | 0;
      state.grid[empty[pick]] = makeStone();
      empty.splice(pick, 1);
    }
  }

  /* ───────── ピース配置 ───────── */
  function place(slotIndex, r0, c0) {
    var piece = state.tray[slotIndex];
    if (!piece || !canPlace(piece, r0, c0)) return false;

    piece.cells.forEach(function (p, k) {
      state.grid[idx(r0 + p[0], c0 + p[1])] = makeBlock(piece.color, piece.specials[k]);
    });
    state.tray[slotIndex] = null;
    selected = -1;
    Sound.drop();

    addScore(piece.size);
    renderBoard();

    var found = linesAfter(null, 0, 0);
    if (!found.rows.length && !found.cols.length) {
      /* いきなり0に戻さず1段ずつ減らす（本家より粘れる） */
      if (state.combo > 0) state.combo -= 1;
      finishTurn();
      return true;
    }

    resolveLines(found);
    return true;
  }

  function resolveLines(found) {
    locked = true;

    var base = new Set();
    var lineGroups = [];
    var r, c, i;

    found.rows.forEach(function (r) {
      var g = [];
      for (var c = 0; c < SIZE; c++) { g.push(idx(r, c)); base.add(idx(r, c)); }
      lineGroups.push(g);
    });
    found.cols.forEach(function (c) {
      var g = [];
      for (var r = 0; r < SIZE; r++) { g.push(idx(r, c)); base.add(idx(r, c)); }
      lineGroups.push(g);
    });

    var lineCount = lineGroups.length;

    /* 単色ライン判定 */
    var perfectColor = 0;
    lineGroups.forEach(function (g) {
      var color = null, ok = true;
      for (var k = 0; k < g.length; k++) {
        var b = state.grid[g[k]];
        if (!b || b.stone) { ok = false; break; }
        if (color === null) color = b.color;
        else if (color !== b.color) { ok = false; break; }
      }
      if (ok) perfectColor++;
    });

    /* 特殊ブロックの連鎖 */
    var exp = expandSpecials(base);
    var allIdx = Array.from(exp.all);
    var extra = allIdx.length - base.size;

    state.combo += 1;
    if (state.combo > state.bestCombo) state.bestCombo = state.combo;
    var mult = Math.min(1 + (state.combo - 1) * 0.5, 5);

    var linePts = 10 * lineCount + 15 * lineCount * (lineCount - 1);
    var specialPts = exp.triggered.length * 30 + extra * 5;
    var colorPts = perfectColor * 80;
    var gained = Math.round((linePts + specialPts + colorPts) * mult);

    /* 演出 */
    if (exp.triggered.some(function (t) { return t.type === 'bomb'; })) Sound.blast();
    if (exp.triggered.some(function (t) { return t.type === 'star'; })) Sound.star();
    Sound.clear(state.combo);
    if (lineCount >= 2 || exp.triggered.length) shake();

    if (state.combo > 1) {
      comboBadge.classList.add('bump');
      setTimeout(function () { comboBadge.classList.remove('bump'); }, 200);
      toast('COMBO ×' + state.combo);
    }
    if (perfectColor) toast('PERFECT COLOR!');
    if (lineCount >= 3) toast(lineCount + ' LINES!');
    if (exp.triggered.length >= 2) toast('CHAIN ×' + exp.triggered.length);

    var res = playDestroy(allIdx, {}, function () {
      /* 全消しボーナス */
      var empty = state.grid.every(function (b) { return !b; });
      if (empty) {
        addScore(300);
        toast('ALL CLEAR +300');
        Sound.power();
      }
      finishTurn();
    });

    addScore(gained);
    state.lines += lineCount;
    addCharge(res.destroyed.length);
    checkLevel();
    floatScore(allIdx[(allIdx.length / 2) | 0], '+' + gained + (mult > 1 ? ' ×' + mult : ''));
    renderHud();
  }

  function finishTurn() {
    locked = false;
    refillTray(false);
    render();
    checkStuck();
  }

  function checkStuck() {
    if (state.over) return;
    if (hasAnyMove()) return;

    var hasPower = state.power.hammer > 0 || state.power.bomb > 0 || state.power.shuffle > 0;
    if (hasPower) {
      toast('NO MOVE! 🔧');
      return;
    }
    gameOver();
  }

  /* ───────── ゲームオーバー / レスキュー ───────── */
  function gameOver() {
    state.over = true;
    Sound.over();
    document.getElementById('ov-title').textContent = 'GAME OVER';
    document.getElementById('ov-sub').textContent = '置ける場所がありません' +
      (state.bestCombo > 1 ? ' — 最大コンボ ×' + state.bestCombo : '');
    document.getElementById('ov-score').textContent = state.score.toLocaleString();
    document.getElementById('ov-best').textContent = state.best.toLocaleString();
    document.getElementById('ov-lines').textContent = state.lines;
    var rescue = document.getElementById('ov-rescue');
    rescue.classList.toggle('hidden', state.rescueUsed);
    overlay.classList.remove('hidden');
    renderHud();
  }

  function rescue() {
    state.rescueUsed = true;
    state.over = false;
    overlay.classList.add('hidden');

    var targets = [];
    for (var r = SIZE - 3; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) if (state.grid[idx(r, c)]) targets.push(idx(r, c));
    }
    state.combo = 0;
    locked = true;
    Sound.blast();
    shake();
    playDestroy(targets, { force: true }, function () {
      refillTray(true);
      locked = false;
      render();
      checkStuck();
    });
    toast('RESCUE!');
  }

  /* ───────── パワーアップ ───────── */
  function armTool(t) {
    if (state.over || locked) return;
    if (state.power[t] <= 0) return;

    if (t === 'shuffle') {
      state.power.shuffle -= 1;
      state.combo = 0;
      refillTray(true);
      Sound.pick();
      toast('SHUFFLE 🎲');
      render();
      checkStuck();
      return;
    }
    tool = (tool === t) ? null : t;
    selected = -1;
    render();
  }

  function useToolAt(i) {
    if (!tool || !state.grid[i]) return;
    var t = tool;
    var targets = [];

    if (t === 'hammer') {
      targets = [i];
    } else {
      var r = rowOf(i), c = colOf(i);
      for (var dr = -1; dr <= 1; dr++) {
        for (var dc = -1; dc <= 1; dc++) {
          var rr = r + dr, cc = c + dc;
          if (rr >= 0 && cc >= 0 && rr < SIZE && cc < SIZE && state.grid[idx(rr, cc)]) {
            targets.push(idx(rr, cc));
          }
        }
      }
    }

    var exp = expandSpecials(new Set(targets));
    state.power[t] -= 1;
    tool = null;
    locked = true;
    Sound.blast();
    shake();

    playDestroy(Array.from(exp.all), { force: true }, function () {
      locked = false;
      render();
      checkStuck();
    });
    addScore(exp.triggered.length * 30);
    renderHud();
  }

  /* ───────── ジオメトリ & ドラッグ ───────── */
  function geom() {
    var a = cells[0].getBoundingClientRect();
    var b = cells[1].getBoundingClientRect();
    var d = cells[SIZE].getBoundingClientRect();
    return { left: a.left, top: a.top, size: a.width, px: b.left - a.left, py: d.top - a.top };
  }

  function clearPreview() {
    for (var i = 0; i < N; i++) {
      cells[i].classList.remove('preview', 'bad', 'will-clear', 'target');
      cells[i].style.removeProperty('--pc');
    }
  }

  function showPreview(piece, r0, c0, ok) {
    clearPreview();
    piece.cells.forEach(function (p) {
      var r = r0 + p[0], c = c0 + p[1];
      if (r < 0 || c < 0 || r >= SIZE || c >= SIZE) return;
      var cell = cells[idx(r, c)];
      if (ok) {
        cell.classList.add('preview');
        cell.style.setProperty('--pc', colorVar(piece.color));
      } else {
        cell.classList.add('bad');
      }
    });
    if (!ok) return;

    var found = linesAfter(piece, r0, c0);
    found.rows.forEach(function (r) {
      for (var c = 0; c < SIZE; c++) cells[idx(r, c)].classList.add('will-clear');
    });
    found.cols.forEach(function (c) {
      for (var r = 0; r < SIZE; r++) cells[idx(r, c)].classList.add('will-clear');
    });
  }

  function makeGhost(piece, g) {
    var el = document.createElement('div');
    el.id = 'ghost';
    el.style.gridTemplateColumns = 'repeat(' + piece.w + ', ' + g.size + 'px)';
    el.style.gridAutoRows = g.size + 'px';
    el.style.gap = (g.px - g.size) + 'px';

    var map = {};
    piece.cells.forEach(function (p, k) { map[p[0] + ':' + p[1]] = k; });
    for (var r = 0; r < piece.h; r++) {
      for (var c = 0; c < piece.w; c++) {
        var gb = document.createElement('div');
        var k = map[r + ':' + c];
        if (k === undefined) {
          gb.className = 'gb empty';
        } else {
          gb.className = 'gb';
          gb.style.setProperty('--bc', colorVar(piece.color));
          var sp = piece.specials[k];
          if (sp) gb.textContent = sp === 'bomb' ? '💣' : '⭐';
        }
        el.appendChild(gb);
      }
    }
    document.body.appendChild(el);
    return el;
  }

  function onSlotDown(e) {
    if (locked || state.over || tool) return;
    var slot = e.currentTarget;
    var s = parseInt(slot.dataset.slot, 10);
    var piece = state.tray[s];
    if (!piece) return;

    e.preventDefault();
    Sound.unlock();

    var g = geom();
    var touch = e.pointerType === 'touch';
    var lift = touch ? g.py * 1.35 : 0;

    drag = {
      slot: s,
      piece: piece,
      g: g,
      lift: lift,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      last: null,
      pointerId: e.pointerId,
      el: makeGhost(piece, g),
      target: null
    };
    slot.classList.add('dragging');
    try { slot.setPointerCapture(e.pointerId); } catch (err) { /* 合成イベント等では失敗しうる */ }
    Sound.pick();
    moveDrag(e.clientX, e.clientY);
  }

  function moveDrag(x, y) {
    if (!drag) return;
    var g = drag.g, p = drag.piece;
    var left = x - (p.w * g.px - (g.px - g.size)) / 2;
    var top = y - (p.h * g.py - (g.py - g.size)) / 2 - drag.lift;
    drag.el.style.left = left + 'px';
    drag.el.style.top = top + 'px';

    var c0 = Math.round((left - g.left) / g.px);
    var r0 = Math.round((top - g.top) / g.py);
    var ok = canPlace(p, r0, c0);
    var inRange = r0 > -p.h && c0 > -p.w && r0 < SIZE && c0 < SIZE;

    var key = r0 + ':' + c0 + ':' + ok;
    if (key !== drag.last) {
      drag.last = key;
      if (inRange) showPreview(p, r0, c0, ok);
      else clearPreview();
    }
    drag.target = ok ? { r: r0, c: c0 } : null;
  }

  function onSlotMove(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    e.preventDefault();
    if (Math.abs(e.clientX - drag.startX) > 6 || Math.abs(e.clientY - drag.startY) > 6) {
      drag.moved = true;
    }
    moveDrag(e.clientX, e.clientY);
  }

  function onSlotUp(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    var d = drag;
    drag = null;
    d.el.remove();
    clearPreview();
    slots[d.slot].classList.remove('dragging');

    if (d.target) {
      place(d.slot, d.target.r, d.target.c);
    } else if (!d.moved) {
      /* タップ選択モード */
      selected = (selected === d.slot) ? -1 : d.slot;
      renderTray();
    } else {
      Sound.deny();
      renderTray();
    }
  }

  function onSlotCancel(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    drag.el.remove();
    slots[drag.slot].classList.remove('dragging');
    drag = null;
    clearPreview();
    renderTray();
  }

  /* ───────── 盤面クリック（ツール／タップ配置） ───────── */
  function onBoardClick(e) {
    if (locked || state.over) return;
    var cell = e.target.closest('.cell');
    if (!cell) return;
    var i = parseInt(cell.dataset.i, 10);

    if (tool) { useToolAt(i); return; }

    if (selected >= 0 && state.tray[selected]) {
      var p = state.tray[selected];
      var r0 = rowOf(i) - Math.floor((p.h - 1) / 2);
      var c0 = colOf(i) - Math.floor((p.w - 1) / 2);
      if (canPlace(p, r0, c0)) {
        place(selected, r0, c0);
      } else if (canPlace(p, rowOf(i), colOf(i))) {
        place(selected, rowOf(i), colOf(i));
      } else {
        Sound.deny();
      }
    }
  }

  function onBoardHover(e) {
    if (locked || state.over || drag || tool || selected < 0) return;
    var cell = e.target.closest('.cell');
    if (!cell) return;
    var i = parseInt(cell.dataset.i, 10);
    var p = state.tray[selected];
    if (!p) return;
    var r0 = rowOf(i) - Math.floor((p.h - 1) / 2);
    var c0 = colOf(i) - Math.floor((p.w - 1) / 2);
    showPreview(p, r0, c0, canPlace(p, r0, c0));
  }

  /* ───────── 起動 ───────── */
  function startGame() {
    var best = parseInt(localStorage.getItem(STORE_BEST) || '0', 10) || 0;
    state = newState();
    state.best = best;
    locked = false;
    selected = -1;
    tool = null;
    overlay.classList.add('hidden');
    fxEl.innerHTML = '';
    toastEl.innerHTML = '';
    refillTray(true);
    render();
  }

  function init() {
    buildBoard();
    slots = Array.prototype.slice.call(trayEl.querySelectorAll('.slot'));

    slots.forEach(function (slot) {
      slot.addEventListener('pointerdown', onSlotDown);
      slot.addEventListener('pointermove', onSlotMove);
      slot.addEventListener('pointerup', onSlotUp);
      slot.addEventListener('pointercancel', onSlotCancel);
    });

    boardEl.addEventListener('click', onBoardClick);
    boardEl.addEventListener('pointermove', onBoardHover);
    boardEl.addEventListener('pointerleave', function () {
      if (!drag) clearPreview();
    });

    document.querySelectorAll('.pw').forEach(function (btn) {
      btn.addEventListener('click', function () { armTool(btn.dataset.tool); });
    });

    document.getElementById('btn-restart').addEventListener('click', function () {
      if (state && !state.over && state.score > 0) {
        if (!confirm('最初からやり直しますか？')) return;
      }
      startGame();
    });

    var soundOn = localStorage.getItem(STORE_SOUND) !== '0';
    var sBtn = document.getElementById('btn-sound');
    function syncSound() {
      Sound.setEnabled(soundOn);
      sBtn.textContent = soundOn ? '🔊' : '🔇';
      sBtn.classList.toggle('off', !soundOn);
    }
    sBtn.addEventListener('click', function () {
      soundOn = !soundOn;
      localStorage.setItem(STORE_SOUND, soundOn ? '1' : '0');
      syncSound();
      if (soundOn) Sound.pick();
    });
    syncSound();

    document.getElementById('ov-again').addEventListener('click', startGame);
    document.getElementById('ov-rescue').addEventListener('click', rescue);

    window.addEventListener('pointerdown', function once() {
      Sound.unlock();
      window.removeEventListener('pointerdown', once);
    });

    window.addEventListener('keydown', function (e) {
      if (e.key === 'r' || e.key === 'R') startGame();
      if (e.key === 'Escape') { tool = null; selected = -1; render(); }
      if (e.key === '1') armTool('hammer');
      if (e.key === '2') armTool('bomb');
      if (e.key === '3') armTool('shuffle');
    });

    window.addEventListener('resize', function () { clearPreview(); });

    startGame();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* テスト用に一部を公開 */
  window.__game = {
    getState: function () { return state; },
    place: place,
    canPlace: canPlace
  };
})();
