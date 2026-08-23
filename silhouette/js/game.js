/* 難しいシルエットクイズ
 * 絵文字をキャンバスに描き、不透明ピクセルを全部まっ黒にして
 * シルエットを作る。回転・反転・アスペクト変形・拡大クロップを
 * かけて出題するので、形だけを頼りに当てることになる。
 */
(function () {
  'use strict';

  var SRC = 480;          // シルエット元画像のサイズ
  var VIEW = 460;         // 表示キャンバスの論理サイズ
  var STORE_KEY = 'silhouette-quiz-best-v1';

  var LEVELS = {
    normal: {
      label: 'ふつう',
      questions: 10,
      lives: 3,
      time: 12,
      rot: 30 * Math.PI / 180,
      mirror: 0.25,
      zoom: 1.7,
      squash: 0,
      choices: 4,
      mult: 1
    },
    hard: {
      label: 'むずかしい',
      questions: 10,
      lives: 3,
      time: 9,
      rot: Math.PI,
      mirror: 0.5,
      zoom: 2.8,
      squash: 0.12,
      choices: 4,
      mult: 1.6
    },
    oni: {
      label: '鬼',
      questions: 12,
      lives: 2,
      time: 7,
      rot: Math.PI,
      mirror: 0.5,
      zoom: 4.2,
      squash: 0.3,
      choices: 6,
      mult: 2.5
    }
  };

  var el = {};
  ['startView', 'gameView', 'resultView', 'stage', 'choices', 'score', 'combo',
   'lives', 'progress', 'timeBar', 'feedback', 'hintBtn', 'levelBtns',
   'resultScore', 'resultBest', 'resultDetail', 'missList', 'retryBtn',
   'backBtn', 'quitBtn', 'newBest', 'loading'].forEach(function (id) {
    el[id] = document.getElementById(id);
  });

  var canvas = el.stage;
  var ctx = canvas.getContext('2d');

  /* ---------- シルエット生成 ---------- */

  var EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",' +
                   '"Noto Emoji","EmojiOne Color","Android Emoji",sans-serif';
  var cache = {};

  function buildSilhouette(emoji) {
    if (cache[emoji]) return cache[emoji];

    var c = document.createElement('canvas');
    c.width = c.height = SRC;
    var g = c.getContext('2d', { willReadFrequently: true });
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = Math.round(SRC * 0.72) + 'px ' + EMOJI_FONT;
    g.fillText(emoji, SRC / 2, SRC / 2);

    var img = g.getImageData(0, 0, SRC, SRC);
    var d = img.data;
    var minX = SRC, minY = SRC, maxX = -1, maxY = -1, ink = 0;

    for (var y = 0; y < SRC; y++) {
      for (var x = 0; x < SRC; x++) {
        var i = (y * SRC + x) * 4;
        if (d[i + 3] > 70) {
          d[i] = d[i + 1] = d[i + 2] = 0;
          d[i + 3] = 255;
          ink++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        } else {
          d[i + 3] = 0;
        }
      }
    }
    g.putImageData(img, 0, 0);

    var info = null;
    if (ink > SRC * SRC * 0.008 && maxX > minX && maxY > minY) {
      info = {
        canvas: c,
        x: minX, y: minY,
        w: maxX - minX + 1,
        h: maxY - minY + 1,
        hash: fingerprint(d, minX, minY, maxX - minX + 1, maxY - minY + 1)
      };
    }
    cache[emoji] = info;
    return info;
  }

  // 8×8 に落として「ここにインクがあるか」のビット列にする。
  // 絵文字が出ない環境では全部が同じ豆腐□になるので、
  // 同じ指紋のお題をまとめて捨てるために使う。
  function fingerprint(data, bx, by, bw, bh) {
    var bits = '';
    for (var gy = 0; gy < 8; gy++) {
      for (var gx = 0; gx < 8; gx++) {
        var px = Math.floor(bx + (gx + 0.5) * bw / 8);
        var py = Math.floor(by + (gy + 0.5) * bh / 8);
        bits += data[(py * SRC + px) * 4 + 3] > 70 ? '1' : '0';
      }
    }
    return bits;
  }

  /* ---------- お題プールの用意 ---------- */

  var pool = [];

  function preparePool() {
    var seen = {};
    window.SILHOUETTE_ITEMS.forEach(function (it) {
      var info = buildSilhouette(it[0]);
      if (!info) return;
      if (seen[info.hash]) return;   // 同じ形＝描画に失敗している可能性が高い
      seen[info.hash] = true;
      pool.push({ emoji: it[0], name: it[1], group: it[2], art: info });
    });
  }

  /* ---------- ちいさな道具 ---------- */

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function rand(a, b) { return a + Math.random() * (b - a); }

  function loadBest() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function saveBest(obj) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(obj)); } catch (e) {}
  }

  /* ---------- ゲーム状態 ---------- */

  var state = null;
  var raf = 0;

  function startGame(levelKey) {
    var cfg = LEVELS[levelKey];
    var deck = shuffle(pool.slice()).slice(0, cfg.questions);

    state = {
      levelKey: levelKey,
      cfg: cfg,
      deck: deck,
      index: -1,
      score: 0,
      combo: 0,
      maxCombo: 0,
      correct: 0,
      lives: cfg.lives,
      misses: [],
      phase: 'play',
      q: null
    };

    el.startView.hidden = true;
    el.resultView.hidden = true;
    el.gameView.hidden = false;
    nextQuestion();
  }

  function nextQuestion() {
    state.index++;
    if (state.index >= state.deck.length) return finish();

    var item = state.deck[state.index];
    var cfg = state.cfg;

    // まぎらわしい選択肢は同じグループから優先して取る
    var same = shuffle(pool.filter(function (p) {
      return p.group === item.group && p.name !== item.name;
    }));
    var other = shuffle(pool.filter(function (p) {
      return p.group !== item.group;
    }));
    var options = [item].concat(same, other).slice(0, cfg.choices);
    shuffle(options);

    state.q = {
      item: item,
      options: options,
      angle: rand(-cfg.rot, cfg.rot),
      flip: Math.random() < cfg.mirror ? -1 : 1,
      squash: 1 + rand(-cfg.squash, cfg.squash),
      focusX: rand(-0.28, 0.28),
      focusY: rand(-0.28, 0.28),
      start: performance.now(),
      hinted: false,
      answered: false
    };
    state.phase = 'play';

    renderChoices(options);
    el.hintBtn.disabled = false;
    el.feedback.className = 'feedback';
    el.feedback.hidden = true;
    updateHud();
    loop();
  }

  function renderChoices(options) {
    el.choices.innerHTML = '';
    el.choices.dataset.count = options.length;
    options.forEach(function (opt, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'choice';
      b.innerHTML = '<span class="key">' + (i + 1) + '</span>' +
                    '<span class="label"></span>';
      b.querySelector('.label').textContent = opt.name;
      b.addEventListener('click', function () { answer(opt); });
      el.choices.appendChild(b);
    });
  }

  function updateHud() {
    el.score.textContent = state.score;
    el.combo.textContent = state.combo > 1 ? '×' + state.combo : '—';
    el.lives.innerHTML = '♥'.repeat(state.lives) +
      '<span class="dead">' + '♥'.repeat(state.cfg.lives - state.lives) + '</span>';
    el.progress.textContent = Math.min(state.index + 1, state.deck.length) +
                              ' / ' + state.deck.length;
  }

  /* ---------- 描画ループ ---------- */

  function ratioLeft() {
    var t = (performance.now() - state.q.start) / 1000;
    return Math.max(0, 1 - t / state.cfg.time);
  }

  function loop() {
    cancelAnimationFrame(raf);
    var step = function () {
      if (!state) return;
      draw();
      if (state.phase === 'play') {
        var left = ratioLeft();
        el.timeBar.style.width = (left * 100).toFixed(2) + '%';
        el.timeBar.classList.toggle('danger', left < 0.3);
        if (left <= 0) return answer(null);
        raf = requestAnimationFrame(step);
      }
    };
    raf = requestAnimationFrame(step);
  }

  function draw() {
    var q = state.q;
    var art = q.item.art;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== VIEW * dpr) {
      canvas.width = canvas.height = VIEW * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, VIEW, VIEW);

    // 制限時間が減るほどズームが引いて、形が見えてくる
    var progress = state.phase === 'play' ? 1 - ratioLeft() : 1;
    if (q.hinted || state.phase !== 'play') progress = 1;
    var ease = Math.min(1, progress / 0.75);
    var zoom = state.cfg.zoom + (1 - state.cfg.zoom) * ease;

    var margin = 0.82;
    var fit = Math.min(VIEW / art.w, VIEW / art.h) * margin;
    var s = fit * zoom;
    var away = state.cfg.zoom > 1 ? (zoom - 1) / (state.cfg.zoom - 1) : 0;

    ctx.save();
    ctx.translate(VIEW / 2, VIEW / 2);
    ctx.translate(-q.focusX * art.w * s * away, -q.focusY * art.h * s * away);
    ctx.rotate(q.angle);
    ctx.scale(q.flip * s * q.squash, s / q.squash);
    ctx.drawImage(art.canvas, art.x, art.y, art.w, art.h,
                  -art.w / 2, -art.h / 2, art.w, art.h);
    ctx.restore();
  }

  /* ---------- 回答 ---------- */

  function answer(opt) {
    if (!state || state.phase !== 'play' || state.q.answered) return;
    state.q.answered = true;
    state.phase = 'judge';
    cancelAnimationFrame(raf);
    el.hintBtn.disabled = true;

    var q = state.q;
    var ok = opt === q.item;
    var left = ratioLeft();

    if (ok) {
      state.correct++;
      state.combo++;
      state.maxCombo = Math.max(state.maxCombo, state.combo);
      var base = 100 + Math.round(400 * left);       // 早いほど高い
      if (q.hinted) base = Math.round(base * 0.5);   // ヒントは半減
      var gain = Math.round(base * state.cfg.mult * (1 + (state.combo - 1) * 0.15));
      state.score += gain;
      showFeedback(true, gain);
    } else {
      state.combo = 0;
      state.lives--;
      state.misses.push({ name: q.item.name, picked: opt ? opt.name : '時間切れ' });
      showFeedback(false, 0);
    }

    Array.prototype.forEach.call(el.choices.children, function (b, i) {
      var o = q.options[i];
      b.disabled = true;
      if (o === q.item) b.classList.add('right');
      else if (o === opt) b.classList.add('wrong');
    });

    draw();
    updateHud();

    setTimeout(function () {
      if (!state) return;
      if (state.lives <= 0) return finish();
      nextQuestion();
    }, ok ? 900 : 1500);
  }

  function showFeedback(ok, gain) {
    var q = state.q;
    el.feedback.hidden = false;
    el.feedback.className = 'feedback ' + (ok ? 'ok' : 'ng');
    el.feedback.innerHTML =
      '<span class="mark">' + (ok ? '正解' : '不正解') + '</span>' +
      '<span class="emoji">' + q.item.emoji + '</span>' +
      '<span class="name">' + q.item.name + '</span>' +
      (ok ? '<span class="gain">+' + gain + '</span>' : '');
  }

  function useHint() {
    if (!state || state.phase !== 'play' || state.q.hinted) return;
    state.q.hinted = true;
    el.hintBtn.disabled = true;
  }

  /* ---------- 結果 ---------- */

  function finish() {
    cancelAnimationFrame(raf);
    var best = loadBest();
    var prev = best[state.levelKey] || 0;
    var isNew = state.score > prev;
    if (isNew) { best[state.levelKey] = state.score; saveBest(best); }

    el.gameView.hidden = true;
    el.resultView.hidden = false;
    el.newBest.hidden = !isNew;
    el.resultScore.textContent = state.score;
    el.resultBest.textContent = Math.max(prev, state.score);
    el.resultDetail.textContent =
      LEVELS[state.levelKey].label + '／正解 ' + state.correct + ' / ' +
      state.deck.length + '　最大コンボ ×' + Math.max(state.maxCombo, 1) +
      (state.lives <= 0 ? '　（ライフ切れ）' : '');

    el.missList.innerHTML = '';
    if (state.misses.length) {
      state.misses.forEach(function (m) {
        var li = document.createElement('li');
        li.textContent = m.name + ' を「' + m.picked + '」と回答';
        el.missList.appendChild(li);
      });
    } else {
      var li = document.createElement('li');
      li.className = 'perfect';
      li.textContent = 'ノーミス！';
      el.missList.appendChild(li);
    }
  }

  function toTitle() {
    cancelAnimationFrame(raf);
    state = null;
    el.gameView.hidden = true;
    el.resultView.hidden = true;
    el.startView.hidden = false;
    showBestOnTitle();
  }

  function showBestOnTitle() {
    var best = loadBest();
    Array.prototype.forEach.call(el.levelBtns.querySelectorAll('button'), function (b) {
      var v = best[b.dataset.level];
      var span = b.querySelector('.best');
      span.textContent = v ? 'ベスト ' + v : 'ベスト —';
    });
  }

  /* ---------- 入力 ---------- */

  el.levelBtns.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-level]');
    if (b) startGame(b.dataset.level);
  });
  el.hintBtn.addEventListener('click', useHint);
  el.quitBtn.addEventListener('click', toTitle);
  el.backBtn.addEventListener('click', toTitle);
  el.retryBtn.addEventListener('click', function () {
    startGame(state ? state.levelKey : 'hard');
  });

  document.addEventListener('keydown', function (e) {
    if (!state || state.phase !== 'play') return;
    if (e.key === 'h' || e.key === 'H') return useHint();
    var n = parseInt(e.key, 10);
    if (n >= 1 && n <= el.choices.children.length) {
      el.choices.children[n - 1].click();
    }
  });

  window.addEventListener('blur', function () {
    if (state && state.phase === 'play') cancelAnimationFrame(raf);
  });
  window.addEventListener('focus', function () {
    if (state && state.phase === 'play') loop();
  });

  /* ---------- 起動 ---------- */

  // 絵文字フォントの読み込みを待ってからシルエットを焼く
  function boot() {
    preparePool();
    if (pool.length < 8) {
      el.loading.innerHTML =
        'この環境では絵文字フォントが見つからず、シルエットを作れませんでした。' +
        '別のブラウザでお試しください。';
      return;
    }
    el.loading.hidden = true;
    el.levelBtns.hidden = false;
    showBestOnTitle();
  }

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { setTimeout(boot, 0); });
  } else {
    setTimeout(boot, 60);
  }
})();
