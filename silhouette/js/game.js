/* 難しいシルエットクイズ
 * 絵文字をキャンバスに描き、不透明ピクセルを全部まっ黒にして
 * シルエットを作る。回転・反転・アスペクト変形・拡大クロップを
 * かけて出題するので、形だけを頼りに当てることになる。
 *
 * モードはふたつ。
 *   solo   … ライフ制のひとり用。ハイスコアを localStorage に保存する。
 *   versus … 1台の画面をふたりで使う早押し対戦。上半分が 2P、下半分が 1P。
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

  // 対戦では出題数だけ差し替える（ライフとヒントは使わない）
  var VS_QUESTIONS = { normal: 7, hard: 7, oni: 9 };

  // 1P はテンキー上段、2P はその下の QWERTY 段
  var KEYS = [
    ['1', '2', '3', '4', '5', '6'],
    ['Q', 'W', 'E', 'R', 'T', 'Y']
  ];
  var PLAYER_LABEL = ['1P', '2P'];

  var el = {};
  ['startView', 'gameView', 'resultView', 'stage', 'choices', 'choices2',
   'score', 'combo', 'lives', 'progress', 'timeBar', 'feedback', 'hintBtn',
   'levelBtns', 'modeBtns', 'tipsSolo', 'tipsVersus', 'hudSolo', 'hudVersus',
   'score1', 'score2', 'progressVs', 'vsNote', 'soloResult', 'versusResult',
   'winnerText', 'finalScore1', 'finalScore2', 'finalSub1', 'finalSub2',
   'resultScore', 'resultBest', 'resultDetail', 'missList', 'missTitle',
   'retryBtn', 'backBtn', 'quitBtn', 'quitBtn2', 'newBest',
   'loading'].forEach(function (id) {
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
  var mode = 'solo';

  function startGame(levelKey, gameMode) {
    var cfg = LEVELS[levelKey];
    var versus = gameMode === 'versus';
    var count = versus ? VS_QUESTIONS[levelKey] : cfg.questions;
    var deck = shuffle(pool.slice()).slice(0, count);

    state = {
      mode: gameMode,
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
      // 対戦用。players[0] が 1P、players[1] が 2P。
      players: [makePlayer(), makePlayer()],
      draws: 0,
      phase: 'play',
      q: null
    };

    el.hudSolo.hidden = versus;
    el.hudVersus.hidden = !versus;
    el.choices2.hidden = !versus;
    el.vsNote.hidden = !versus;
    el.hintBtn.hidden = versus;
    el.choices.classList.toggle('vsMine', versus);

    el.startView.hidden = true;
    el.resultView.hidden = true;
    el.gameView.hidden = false;
    nextQuestion();
  }

  function makePlayer() {
    return { score: 0, correct: 0, combo: 0, maxCombo: 0, wrong: 0, locked: false };
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

    state.players[0].locked = false;
    state.players[1].locked = false;

    state.q = {
      item: item,
      options: options,
      taker: -1,        // 対戦で得点したプレイヤー（-1 はまだ誰も）
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
    fillPanel(el.choices, options, 0);
    if (state.mode === 'versus') fillPanel(el.choices2, options, 1);
  }

  // player は対戦時の担当プレイヤー。ひとり用でも 0 を渡す。
  function fillPanel(panel, options, player) {
    panel.innerHTML = '';
    panel.dataset.count = options.length;
    options.forEach(function (opt, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'choice';
      b.innerHTML = '<span class="key"></span><span class="label"></span>';
      b.querySelector('.key').textContent = KEYS[player][i];
      b.querySelector('.label').textContent = opt.name;
      b.addEventListener('click', function () { answer(opt, player); });
      panel.appendChild(b);
    });
  }

  function panels() {
    return state.mode === 'versus' ? [el.choices, el.choices2] : [el.choices];
  }

  function updateHud() {
    if (state.mode === 'versus') {
      el.score1.textContent = state.players[0].score;
      el.score2.textContent = state.players[1].score;
      el.progressVs.textContent = Math.min(state.index + 1, state.deck.length) +
                                  ' / ' + state.deck.length;
      return;
    }
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
        if (left <= 0) return answer(null, 0);
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

  // opt が null なら時間切れ。player は対戦時の回答者（ひとり用は 0）。
  function answer(opt, player) {
    if (!state || state.phase !== 'play' || state.q.answered) return;
    if (state.mode === 'versus') return answerVersus(opt, player || 0);

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

    revealAnswer(opt, 0);
    draw();
    updateHud();

    setTimeout(function () {
      if (!state) return;
      if (state.lives <= 0) return finish();
      nextQuestion();
    }, ok ? 900 : 1500);
  }

  /* 早押し対戦の判定。
   * 正解した時点でその問題は終わり、押した側だけが得点する。
   * まちがえた側はお手つきとしてその問題を回答できなくなり、
   * 相手だけが残り時間を使って答えられる。
   * ふたりとも外した／時間切れならノーポイントで次へ。
   */
  function answerVersus(opt, player) {
    var q = state.q;
    var me = state.players[player];

    if (opt !== null && me.locked) return;   // お手つき済みは無視

    var left = ratioLeft();

    if (opt === q.item) {
      q.answered = true;
      q.taker = player;
      state.phase = 'judge';
      cancelAnimationFrame(raf);

      me.correct++;
      me.combo++;
      me.maxCombo = Math.max(me.maxCombo, me.combo);
      var gain = Math.round((100 + Math.round(400 * left)) * state.cfg.mult *
                            (1 + (me.combo - 1) * 0.15));
      me.score += gain;
      state.players[1 - player].combo = 0;

      showFeedback(true, gain, player);
      revealAnswer(opt, player);
      draw();
      updateHud();
      setTimeout(function () { if (state) nextQuestion(); }, 1100);
      return;
    }

    if (opt !== null) {
      // お手つき
      me.locked = true;
      me.wrong++;
      me.combo = 0;
      lockPanel(player, opt);
      if (!state.players[1 - player].locked) return;   // 相手にはまだ権利がある
    }

    // 時間切れ、またはふたりともお手つき
    q.answered = true;
    state.phase = 'judge';
    cancelAnimationFrame(raf);
    state.draws++;
    state.players[0].combo = 0;
    state.players[1].combo = 0;
    state.misses.push({ name: q.item.name, picked: opt === null ? '時間切れ' : 'どちらも不正解' });
    showFeedback(false, 0, -1);
    revealAnswer(null, -1);
    draw();
    updateHud();
    setTimeout(function () { if (state) nextQuestion(); }, 1500);
  }

  // お手つきした側のパネルだけを閉じる
  function lockPanel(player, picked) {
    var panel = panels()[player];
    Array.prototype.forEach.call(panel.children, function (b, i) {
      b.disabled = true;
      if (state.q.options[i] === picked) b.classList.add('wrong');
      else b.classList.add('locked');
    });
  }

  // 正解を表示してすべてのパネルを閉じる
  function revealAnswer(picked, taker) {
    panels().forEach(function (panel, pi) {
      Array.prototype.forEach.call(panel.children, function (b, i) {
        var o = state.q.options[i];
        b.disabled = true;
        if (o === state.q.item) {
          b.classList.remove('locked');
          b.classList.add(state.mode === 'versus' && pi === taker ? 'tookit' : 'right');
        } else if (o === picked && pi === taker) {
          b.classList.add('wrong');
        }
      });
    });
  }

  // player を渡すと対戦用に「1P 正解」のように出す
  function showFeedback(ok, gain, player) {
    var q = state.q;
    var who = '';
    if (state.mode === 'versus' && player >= 0) {
      who = '<span class="who p' + (player + 1) + '">' + PLAYER_LABEL[player] + '</span>';
    }
    var mark = ok ? '正解' : (state.mode === 'versus' ? 'ノーポイント' : '不正解');
    el.feedback.hidden = false;
    el.feedback.className = 'feedback ' + (ok ? 'ok' : 'ng');
    el.feedback.innerHTML =
      who +
      '<span class="mark">' + mark + '</span>' +
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
    if (state.mode === 'versus') return finishVersus();

    var best = loadBest();
    var prev = best[state.levelKey] || 0;
    var isNew = state.score > prev;
    if (isNew) { best[state.levelKey] = state.score; saveBest(best); }

    el.gameView.hidden = true;
    el.resultView.hidden = false;
    el.soloResult.hidden = false;
    el.versusResult.hidden = true;
    el.missTitle.textContent = 'まちがえた問題';
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

  function finishVersus() {
    var p1 = state.players[0];
    var p2 = state.players[1];

    el.gameView.hidden = true;
    el.resultView.hidden = false;
    el.soloResult.hidden = true;
    el.versusResult.hidden = false;
    el.missTitle.textContent = '誰も当てられなかった問題';

    el.finalScore1.textContent = p1.score;
    el.finalScore2.textContent = p2.score;
    el.finalSub1.textContent = '正解 ' + p1.correct + '／お手つき ' + p1.wrong;
    el.finalSub2.textContent = '正解 ' + p2.correct + '／お手つき ' + p2.wrong;

    if (p1.score === p2.score) {
      el.winnerText.textContent = '引き分け！';
      el.winnerText.className = 'winner';
    } else {
      var win = p1.score > p2.score ? 0 : 1;
      el.winnerText.innerHTML = '<span class="p' + (win + 1) + 'ink">' +
        PLAYER_LABEL[win] + '</span> の勝ち！';
      el.winnerText.className = 'winner';
    }

    el.resultDetail.textContent =
      LEVELS[state.levelKey].label + '／全 ' + state.deck.length + '問' +
      (state.draws ? '　流れた問題 ' + state.draws : '');

    el.missList.innerHTML = '';
    if (state.misses.length) {
      state.misses.forEach(function (m) {
        var li = document.createElement('li');
        li.textContent = m.name + '（' + m.picked + '）';
        el.missList.appendChild(li);
      });
    } else {
      var li = document.createElement('li');
      li.className = 'perfect';
      li.textContent = '全問どちらかが正解！';
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
    applyMode();
  }

  function showBestOnTitle() {
    var best = loadBest();
    Array.prototype.forEach.call(el.levelBtns.querySelectorAll('button'), function (b) {
      var v = best[b.dataset.level];
      var span = b.querySelector('.best');
      if (mode === 'versus') {
        span.textContent = VS_QUESTIONS[b.dataset.level] + '問勝負';
      } else {
        span.textContent = v ? 'ベスト ' + v : 'ベスト —';
      }
    });
  }

  // 選んだモードに合わせてタイトル画面の表示を切り替える
  function applyMode() {
    Array.prototype.forEach.call(el.modeBtns.querySelectorAll('button'), function (b) {
      b.classList.toggle('on', b.dataset.mode === mode);
    });
    el.tipsSolo.hidden = mode === 'versus';
    el.tipsVersus.hidden = mode !== 'versus';
    showBestOnTitle();
  }

  /* ---------- 入力 ---------- */

  el.modeBtns.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-mode]');
    if (!b) return;
    mode = b.dataset.mode;
    applyMode();
  });
  el.levelBtns.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-level]');
    if (b) startGame(b.dataset.level, mode);
  });
  el.hintBtn.addEventListener('click', useHint);
  el.quitBtn.addEventListener('click', toTitle);
  el.quitBtn2.addEventListener('click', toTitle);
  el.backBtn.addEventListener('click', toTitle);
  el.retryBtn.addEventListener('click', function () {
    startGame(state ? state.levelKey : 'hard', state ? state.mode : mode);
  });

  document.addEventListener('keydown', function (e) {
    if (!state || state.phase !== 'play') return;
    if (state.mode !== 'versus' && (e.key === 'h' || e.key === 'H')) return useHint();

    var key = e.key.length === 1 ? e.key.toUpperCase() : '';
    if (!key) return;
    var last = state.mode === 'versus' ? 1 : 0;
    for (var p = 0; p <= last; p++) {
      var i = KEYS[p].indexOf(key);
      if (i >= 0 && i < panels()[p].children.length) {
        e.preventDefault();
        panels()[p].children[i].click();
        return;
      }
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
    el.modeBtns.hidden = false;
    el.levelBtns.hidden = false;
    applyMode();
  }

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { setTimeout(boot, 0); });
  } else {
    setTimeout(boot, 60);
  }
})();
