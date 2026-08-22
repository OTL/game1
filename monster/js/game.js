// 画面まわり。おせわ・数値表示・バトル演出。
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));

  // ── 初期化 ───────────────────────────────────────────
  World.init();

  let prevLevel = World.levelOf(World.state.exp);
  let prevStage = World.stageOf(World.state);

  Sync.start(function (remote) {
    const before = { lv: World.levelOf(World.state.exp), st: World.stageOf(World.state) };
    if (World.adopt(remote)) {
      prevLevel = before.lv; prevStage = before.st;
      refresh();
    }
  });
  Sync.onStatus(function (text, online) {
    const el = $('sync-status');
    el.textContent = text;
    el.classList.toggle('on', !!online);
  });

  // ── ステージ描画 ─────────────────────────────────────
  const stage = $('stage');
  const sctx = stage.getContext('2d');
  const SW = stage.width, SH = stage.height;

  const particles = [];
  let anim = null;                 // {kind, until}
  let stars = null;

  function skyColors(hour) {
    if (hour < 5)  return ['#0a1030', '#141d40', '#1d2a4d'];
    if (hour < 8)  return ['#2b2a5e', '#6b4a72', '#e0906b'];
    if (hour < 16) return ['#2e5da8', '#5c9bd8', '#a8d5f0'];
    if (hour < 19) return ['#31306b', '#8a4f7d', '#e08a5a'];
    return ['#0c1236', '#1a2350', '#2a3364'];
  }

  function drawStage(ts) {
    const hour = new Date().getHours();
    const sky = skyColors(hour);
    const grad = sctx.createLinearGradient(0, 0, 0, SH);
    grad.addColorStop(0, sky[0]);
    grad.addColorStop(0.55, sky[1]);
    grad.addColorStop(1, sky[2]);
    sctx.fillStyle = grad;
    sctx.fillRect(0, 0, SW, SH);

    // 星（夜だけ）
    if (hour >= 19 || hour < 5) {
      if (!stars) {
        const r = Rng.makeRng('stars');
        stars = [];
        for (let i = 0; i < 60; i++) stars.push([r() * SW, r() * SH * 0.6, r()]);
      }
      stars.forEach((s, i) => {
        sctx.globalAlpha = 0.35 + 0.5 * Math.abs(Math.sin(ts / 900 + i));
        sctx.fillStyle = '#fff';
        sctx.fillRect(s[0], s[1], 2, 2);
      });
      sctx.globalAlpha = 1;
      sctx.fillStyle = '#ffeaa7';
      sctx.beginPath(); sctx.arc(SW - 90, 70, 26, 0, Math.PI * 2); sctx.fill();
      sctx.fillStyle = sky[0];
      sctx.beginPath(); sctx.arc(SW - 78, 62, 24, 0, Math.PI * 2); sctx.fill();
    } else {
      sctx.fillStyle = 'rgba(255,255,255,.16)';
      [[110, 90, 42], [180, 76, 30], [470, 110, 36], [530, 96, 26]].forEach((c) => {
        sctx.beginPath(); sctx.arc(c[0], c[1], c[2], 0, Math.PI * 2); sctx.fill();
      });
    }

    // おか と じめん
    sctx.fillStyle = 'rgba(20,40,30,.35)';
    sctx.beginPath();
    sctx.ellipse(160, SH - 120, 240, 90, 0, 0, Math.PI * 2);
    sctx.ellipse(520, SH - 130, 200, 80, 0, 0, Math.PI * 2);
    sctx.fill();
    const gg = sctx.createLinearGradient(0, SH - 150, 0, SH);
    gg.addColorStop(0, '#3f7a4e');
    gg.addColorStop(1, '#26523a');
    sctx.fillStyle = gg;
    sctx.fillRect(0, SH - 150, SW, 150);
    sctx.fillStyle = 'rgba(255,255,255,.06)';
    for (let x = 0; x < SW; x += 24) {
      sctx.fillRect(x + ((x / 24) % 2) * 8, SH - 148 + ((x / 24) % 3) * 6, 10, 3);
    }

    // モンスター
    const size = 320;
    const gy = SH - 132;                      // 足もとの y
    const x = SW / 2 - size / 2;
    const y = gy - size * Sprite.GROUND / Sprite.GRID;

    const t = ts / 1000;
    const stageNo = World.stageOf(World.state);
    const sleepy = World.state.care.energy < 18;
    let bob = Math.sin(t * (sleepy ? 1.1 : 2.0)) * (stageNo === 0 ? 0 : 1.4);
    let squash = 0;
    if (anim && ts < anim.until) {
      const p = 1 - (anim.until - ts) / anim.dur;
      if (anim.kind === 'hop') { bob -= Math.abs(Math.sin(p * Math.PI * 2)) * 9; squash = Math.sin(p * Math.PI * 4) * 0.06; }
      if (anim.kind === 'eat') { squash = Math.abs(Math.sin(p * Math.PI * 5)) * 0.1; }
      if (anim.kind === 'shake') { squash = Math.sin(p * Math.PI * 8) * 0.05; }
      if (anim.kind === 'evolve') { squash = Math.sin(p * Math.PI * 10) * 0.12; }
    } else if (anim && ts >= anim.until) {
      anim = null;
    }

    const blinkPhase = (ts % 3800);
    const blink = stageNo > 0 && (blinkPhase < 130 || (sleepy));

    Sprite.drawShadow(sctx, x, y, size, sleepy ? 0.18 : 0.26);
    Sprite.draw(sctx, World.look(), x, y, size, { bob: bob, squash: squash, blink: blink, time: t });

    // ねているしるし
    if (sleepy && stageNo > 0) {
      sctx.font = 'bold 26px system-ui';
      sctx.fillStyle = 'rgba(255,255,255,.8)';
      for (let i = 0; i < 3; i++) {
        const p = ((ts / 1600) + i / 3) % 1;
        sctx.globalAlpha = 1 - p;
        sctx.fillText('Z', SW / 2 + 70 + p * 40, gy - 190 - p * 60);
      }
      sctx.globalAlpha = 1;
    }

    // パーティクル
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= 16;
      p.x += p.vx; p.y += p.vy; p.vy += 0.06;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      sctx.globalAlpha = clamp(p.life / 700, 0, 1);
      sctx.font = p.size + 'px system-ui';
      sctx.textAlign = 'center';
      sctx.fillText(p.ch, p.x, p.y);
    }
    sctx.globalAlpha = 1;
    sctx.textAlign = 'left';
  }

  function burst(ch, n, spread) {
    for (let i = 0; i < n; i++) {
      particles.push({
        ch: ch,
        x: SW / 2 + (Math.random() - 0.5) * (spread || 120),
        y: SH - 250 - Math.random() * 40,
        vx: (Math.random() - 0.5) * 1.6,
        vy: -1.6 - Math.random() * 1.4,
        life: 900 + Math.random() * 400,
        size: 20 + Math.random() * 14
      });
    }
  }

  function flash(text, color) {
    const el = $('fx-text');
    el.textContent = text;
    el.style.color = color || 'var(--accent)';
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 1400);
  }

  // ── 画面更新 ─────────────────────────────────────────
  const BAR_DEFS = [
    { key: 'food',   label: 'まんぷく', color: '#ffb454' },
    { key: 'mood',   label: 'きげん',   color: '#ff6ad5' },
    { key: 'energy', label: 'げんき',   color: '#5fd07a' },
    { key: 'clean',  label: 'せいけつ', color: '#4dd0ff' }
  ];

  function refresh() {
    const s = World.state;
    const g = World.genome;
    const stageNo = World.stageOf(s);
    const prog = World.levelProgress(s.exp);
    const st = World.stats();

    $('season-no').textContent = World.season - World.seasonOf(World.WORLD_EPOCH) + 1;
    $('season-left').textContent = World.seasonLeftText();

    $('mon-name').textContent = World.name() + (g.shiny ? ' ✨' : '');
    $('mon-level').textContent = prog.level;
    $('mon-age').textContent = World.ageText();
    $('mon-cat').textContent = stageNo === 0 ? 'なぞの タマゴ' : (g.category + 'ポケ');

    const badges = $('mon-types');
    badges.innerHTML = '';
    if (stageNo > 0) {
      g.types.forEach((tid) => {
        const t = Species.TYPE_BY_ID[tid];
        const b = document.createElement('span');
        b.className = 'badge';
        b.textContent = t.name;
        b.style.background = t.color;
        badges.appendChild(b);
      });
    } else {
      const b = document.createElement('span');
      b.className = 'badge';
      b.style.background = '#8f9ec9';
      b.textContent = 'あと ' + Math.max(0, Math.ceil(World.HATCH_EXP - s.exp)) + ' で かえる';
      badges.appendChild(b);
    }

    $('exp-fill').style.width = (prog.ratio * 100) + '%';
    $('exp-text').textContent = 'EXP ' + prog.cur + ' / ' + prog.need + '（つうさん ' + Math.floor(s.exp) + '）';

    // メーター
    const bars = $('bars');
    if (!bars.childElementCount) {
      BAR_DEFS.forEach((d) => {
        bars.insertAdjacentHTML('beforeend',
          '<div class="bar-row"><span class="lbl">' + d.label + '</span>' +
          '<span class="bar"><i id="bar-' + d.key + '"></i></span>' +
          '<span class="val" id="val-' + d.key + '">0</span></div>');
      });
    }
    BAR_DEFS.forEach((d) => {
      const v = s.care[d.key];
      const el = $('bar-' + d.key);
      el.style.width = v + '%';
      el.style.background = v < 25 ? '#ff6b6b' : d.color;
      $('val-' + d.key).textContent = Math.round(v);
    });
    $('cond-val').textContent = Math.round(World.condition(s) * 100) + '%';

    $('st-hp').textContent = st.hp;
    $('st-atk').textContent = st.atk;
    $('st-def').textContent = st.def;
    $('st-spd').textContent = st.spd;
    ['hp', 'atk', 'def', 'spd'].forEach((k) => {
      $('tr-' + k).textContent = s.train[k] ? 'とっくん +' + s.train[k] : '';
    });

    const br = World.branchOf(s);
    const brDef = Species.BRANCHES.filter((x) => x.id === br)[0];
    $('branch-hint').textContent = stageNo >= 3
      ? 'いまの すがた: ' + brDef.name + '（' + brDef.label + 'を いちばん のばした）'
      : 'このままだと Lv.26 で ' + brDef.name + ' に しんかする';

    const mv = $('moves');
    mv.innerHTML = '';
    if (stageNo > 0) {
      World.moves().forEach((m) => {
        const t = m.type === 'normal' ? { name: 'ノーマル', color: '#b9c3dd' } : Species.TYPE_BY_ID[m.type];
        mv.insertAdjacentHTML('beforeend',
          '<div class="move-chip" style="border-color:' + t.color + '55"><b>' + m.name + '</b>' +
          '<small>' + t.name + ' / いりょく ' + m.power + '</small></div>');
      });
    }

    // みんなの きろく
    const a = s.actions;
    $('counters').innerHTML =
      '<div class="counter"><b>' + World.totalActions() + '</b><span>おせわ 回数</span></div>' +
      '<div class="counter"><b>' + s.battles.win + '</b><span>かち</span></div>' +
      '<div class="counter"><b>' + s.battles.lose + '</b><span>まけ</span></div>';

    const ranks = Object.keys(s.caretakers).map((k) => [k, s.caretakers[k]])
      .sort((x, y) => y[1] - x[1]).slice(0, 5);
    $('rank').innerHTML = ranks.length
      ? ranks.map((r) => '<li>' + esc(r[0]) + ' <b>' + r[1] + '</b></li>').join('')
      : '<li class="empty">まだ だれも おせわしていない</li>';

    const log = s.log.slice(-14).reverse();
    $('log').innerHTML = log.length
      ? log.map((e) => '<li><time>' + hhmm(e.t) + '</time><b>' + esc(e.name) + '</b> ' + esc(e.text) + '</li>').join('')
      : '<li class="empty">できごとは まだない</li>';

    $('who-name').textContent = World.displayName();

    // ボタンの有効・無効
    document.querySelectorAll('.act').forEach((b) => {
      b.disabled = stageNo === 0 && b.dataset.act !== 'pet';
    });
    document.querySelectorAll('.tr').forEach((b) => {
      b.disabled = stageNo === 0 || s.care.energy < 18 || s.train[b.dataset.train] >= 120;
    });
    $('btn-wild').disabled = stageNo === 0 || s.care.energy < 12;
    const bossDone = s.bossDay === Battle.dayNumber();
    $('btn-boss').disabled = stageNo === 0 || s.care.energy < 12 || bossDone;
    $('btn-boss').textContent = bossDone ? '👑 きょうの ぬしは たおした！' : '👑 きょうの ぬしに いどむ';

    checkGrowth();
  }

  function checkGrowth() {
    const lv = World.levelOf(World.state.exp);
    const stg = World.stageOf(World.state);
    if (stg > prevStage) {
      anim = { kind: 'evolve', until: performance.now() + 1600, dur: 1600 };
      burst('✨', 24, 220);
      flash(stg === 1 ? 'タマゴが かえった！' : 'おや…？ ' + World.name() + ' に しんかした！', '#6affc0');
      Sprite.cache && Sprite.cache.clear && Sprite.cache.clear();
    } else if (lv > prevLevel) {
      burst('⭐', 8, 140);
      flash('Lv.' + lv + ' に あがった！', '#ffcc4d');
    }
    prevLevel = lv; prevStage = stg;
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  function hhmm(t) {
    const d = new Date(t);
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }

  // ── おせわ ───────────────────────────────────────────
  const ACTIONS = {
    feed:  { need: { food: 92 }, care: { food: 28, mood: 2 }, exp: 8, emoji: '🍚', anim: 'eat',
             log: 'ごはんを あげた', full: 'おなかが いっぱいみたい…' },
    snack: { need: { food: 98 }, care: { food: 12, mood: 12, clean: -5 }, exp: 5, emoji: '🍰', anim: 'eat',
             log: 'おやつを あげた', full: 'もう たべられないよ〜' },
    play:  { cost: { energy: 12 }, care: { mood: 24, energy: -12, food: -6 }, exp: 11, emoji: '🎾', anim: 'hop',
             log: 'あそんであげた', tired: 'つかれていて あそべない…' },
    bath:  { need: { clean: 96 }, care: { clean: 42, mood: -3 }, exp: 6, emoji: '🫧', anim: 'shake',
             log: 'おふろに いれた', full: 'ピカピカだから いらないみたい' },
    sleep: { care: { energy: 46, food: -8, mood: 3 }, exp: 6, emoji: '💤', anim: 'shake',
             log: 'ねかしつけた' },
    pet:   { care: { mood: 8 }, exp: 3, emoji: '❤️', anim: 'hop', log: 'なでた', cool: 1200 }
  };

  let lastAct = 0;

  function doAction(key) {
    const def = ACTIONS[key];
    const s = World.state;
    const nowT = Date.now();
    if (nowT - lastAct < (def.cool || 500)) return;
    lastAct = nowT;
    World.tick();

    if (def.need) {
      const k = Object.keys(def.need)[0];
      if (s.care[k] >= def.need[k]) { flash(def.full, '#ff9f9f'); return; }
    }
    if (def.cost) {
      const k = Object.keys(def.cost)[0];
      if (s.care[k] < def.cost[k]) { flash(def.tired, '#ff9f9f'); return; }
    }
    Object.keys(def.care).forEach((k) => {
      s.care[k] = clamp(s.care[k] + def.care[k], 0, 100);
    });
    s.exp += def.exp;
    s.actions[key === 'snack' ? 'feed' : key] = (s.actions[key === 'snack' ? 'feed' : key] || 0) + 1;
    World.addLog(def.log);
    World.save();

    burst(def.emoji, key === 'pet' ? 3 : 7, 130);
    anim = { kind: def.anim, until: performance.now() + 600, dur: 600 };
    refresh();
  }

  function doTrain(stat) {
    const s = World.state;
    World.tick();
    if (s.care.energy < 18) { flash('げんきが たりない…', '#ff9f9f'); return; }
    if (s.train[stat] >= 120) { flash('これいじょうは のびない！', '#ff9f9f'); return; }
    s.train[stat] = Math.min(120, s.train[stat] + 4);
    s.care.energy = clamp(s.care.energy - 18, 0, 100);
    s.care.food = clamp(s.care.food - 10, 0, 100);
    s.care.mood = clamp(s.care.mood + 4, 0, 100);
    s.exp += 14;
    s.actions.train++;
    const label = Species.BRANCHES.filter((b) => b.id === stat)[0].label;
    World.addLog(label + 'の とっくんを した');
    World.save();
    burst('💪', 6, 120);
    anim = { kind: 'hop', until: performance.now() + 600, dur: 600 };
    flash(label + ' +4', '#ff6ad5');
    refresh();
  }

  document.getElementById('actions').addEventListener('click', (e) => {
    const b = e.target.closest('.act');
    if (b && !b.disabled) doAction(b.dataset.act);
  });
  document.querySelector('.train-btns').addEventListener('click', (e) => {
    const b = e.target.closest('.tr');
    if (b && !b.disabled) doTrain(b.dataset.train);
  });

  // ── バトル ───────────────────────────────────────────
  const bOverlay = $('battle-overlay');
  const bcv = $('battle-canvas');
  const bctx = bcv.getContext('2d');
  const BW = bcv.width, BH = bcv.height;
  let battle = null, bQueue = [], bBusy = false, bShake = 0, bFaint = { you: 0, foe: 0 };
  let hpShown = { you: 0, foe: 0 };
  let skipWait = false;

  function startBattle(boss) {
    const s = World.state;
    World.tick();
    if (s.care.energy < 12) { flash('げんきが たりない…', '#ff9f9f'); return; }
    s.care.energy = clamp(s.care.energy - 12, 0, 100);
    s.care.food = clamp(s.care.food - 5, 0, 100);

    const st = World.stats();
    const you = {
      name: World.name(), look: World.look(), types: World.genome.types,
      stats: st, moves: World.moves()
    };
    const foe = boss ? Battle.todaysBoss(st.level)
                     : Battle.wildFor(st.level, s.battles.win + s.battles.lose);
    battle = Battle.create(you, foe, s.season + ':' + (s.battles.win + s.battles.lose) + ':' + (boss ? 'b' : 'w'));
    battle.isBoss = !!boss;
    hpShown = { you: battle.you.hp, foe: battle.foe.hp };
    bFaint = { you: 0, foe: 0 };
    bOverlay.hidden = false;
    setMsg((boss ? '👑 ' : 'やせいの ') + foe.name + ' が あらわれた！');
    renderCmd();
    refresh();
  }

  function setMsg(text) { $('battle-msg').textContent = text; }

  function renderCmd() {
    const cmd = $('battle-cmd');
    cmd.innerHTML = '';
    if (!battle) return;
    if (bBusy) {
      // 演出が終わるまでは 何も押せない（ごほうびの反映まえに閉じられないように）
      cmd.insertAdjacentHTML('beforeend', '<button class="wide" disabled>…</button>');
    } else if (battle.over) {
      cmd.insertAdjacentHTML('beforeend', '<button class="wide" data-cmd="close">とじる</button>');
    } else {
      battle.you.moves.forEach((m, i) => {
        const t = m.type === 'normal' ? { name: 'ノーマル' } : Species.TYPE_BY_ID[m.type];
        cmd.insertAdjacentHTML('beforeend',
          '<button data-cmd="move" data-i="' + i + '">' + m.name +
          '<small>' + t.name + ' / いりょく ' + m.power + ' / 命中 ' + Math.round(m.acc * 100) + '%</small></button>');
      });
      cmd.insertAdjacentHTML('beforeend',
        '<button data-cmd="cheer">📣 みんなで おうえん<small>こうげき +15% ＆ すこし かいふく</small></button>' +
        '<button data-cmd="run">🏃 にげる<small>すばやさで せいこう率が かわる</small></button>');
    }
  }

  $('battle-cmd').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled || !battle) return;
    const c = b.dataset.cmd;
    if (c === 'close') { closeBattle(); return; }
    if (bBusy) return;
    let action;
    if (c === 'move') action = { type: 'move', index: Number(b.dataset.i) };
    else if (c === 'cheer') action = { type: 'cheer' };
    else action = { type: 'run' };
    const events = battle.turn(action);
    bBusy = true; renderCmd();
    playEvents(events, () => { bBusy = false; renderCmd(); });
  });

  $('battle-msg').addEventListener('click', () => { skipWait = true; });

  function wait(ms, done) {
    const t0 = performance.now();
    skipWait = false;
    (function step() {
      if (skipWait || performance.now() - t0 >= ms) { skipWait = false; done(); return; }
      requestAnimationFrame(step);
    })();
  }

  function playEvents(list, done) {
    let i = 0;
    (function next() {
      if (i >= list.length) { done(); return; }
      const ev = list[i++];
      if (ev.type === 'msg') { setMsg(ev.text); wait(950, next); }
      else if (ev.type === 'damage') { bShake = 14; wait(520, next); }
      else if (ev.type === 'miss') { bShake = 4; wait(200, next); }
      else if (ev.type === 'cheer') { wait(200, next); }
      else if (ev.type === 'faint') { bFaint[ev.side] = 1; wait(700, next); }
      else if (ev.type === 'end') { finishBattle(ev.result); wait(300, next); }
      else next();
    })();
  }

  function finishBattle(result) {
    const s = World.state;
    if (result === 'win') {
      const gain = Battle.rewardExp(battle.foe, battle.isBoss);
      s.exp += gain;
      s.battles.win++;
      s.care.mood = clamp(s.care.mood + 10, 0, 100);
      if (battle.isBoss) s.bossDay = Battle.dayNumber();
      World.addLog((battle.isBoss ? 'ぬしの ' : '') + battle.foe.name + ' に かった（+' + gain + ' EXP）');
      setMsg('かった！ けいけんち ' + gain + ' を てにいれた！');
    } else if (result === 'lose') {
      s.battles.lose++;
      s.care.mood = clamp(s.care.mood - 14, 0, 100);
      s.care.energy = clamp(s.care.energy - 10, 0, 100);
      s.exp += Math.round(battle.foe.stats.level * 1.2);
      World.addLog(battle.foe.name + ' に まけた…');
      setMsg('まけてしまった… でも すこし つよくなった。');
    } else {
      World.addLog('たびの とちゅうで ひきかえした');
    }
    World.save();
    refresh();
  }

  function closeBattle() {
    bOverlay.hidden = true;
    battle = null;
    refresh();
  }

  function drawBar(ctx, x, y, w, cur, max, label, lvl) {
    ctx.fillStyle = 'rgba(6,10,24,.78)';
    ctx.strokeStyle = '#4a5ea3';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, 52, 10); else ctx.rect(x, y, w, 52);
    ctx.fill(); ctx.stroke();

    ctx.fillStyle = '#e9eefb';
    ctx.font = 'bold 15px system-ui';
    ctx.fillText(label, x + 12, y + 20);
    ctx.font = '13px system-ui';
    ctx.fillStyle = '#8f9ec9';
    ctx.fillText('Lv.' + lvl, x + w - 46, y + 20);

    const r = clamp(cur / max, 0, 1);
    ctx.fillStyle = '#0d1428';
    ctx.fillRect(x + 12, y + 28, w - 24, 9);
    ctx.fillStyle = r > 0.5 ? '#5fd07a' : (r > 0.2 ? '#ffcc4d' : '#ff6b6b');
    ctx.fillRect(x + 12, y + 28, (w - 24) * r, 9);
    ctx.fillStyle = '#cfe0ff';
    ctx.font = '11px system-ui';
    ctx.fillText(Math.round(cur) + ' / ' + max, x + 12, y + 48);
  }

  function drawBattle(ts) {
    if (!battle) return;
    const shakeX = bShake > 0 ? (Math.random() - 0.5) * bShake : 0;
    bShake = Math.max(0, bShake - 1);

    const g = bctx.createLinearGradient(0, 0, 0, BH);
    g.addColorStop(0, '#2a3f7a'); g.addColorStop(1, '#5a7fbf');
    bctx.fillStyle = g; bctx.fillRect(0, 0, BW, BH);
    bctx.fillStyle = 'rgba(30,60,45,.5)';
    bctx.beginPath(); bctx.ellipse(BW * 0.72, BH * 0.42, 150, 34, 0, 0, Math.PI * 2); bctx.fill();
    bctx.beginPath(); bctx.ellipse(BW * 0.26, BH * 0.86, 190, 42, 0, 0, Math.PI * 2); bctx.fill();

    // なめらかに HP を減らす
    ['you', 'foe'].forEach((k) => {
      hpShown[k] += (battle[k].hp - hpShown[k]) * 0.18;
      if (Math.abs(hpShown[k] - battle[k].hp) < 0.5) hpShown[k] = battle[k].hp;
    });

    const t = ts / 1000;
    // あいて
    const fs = 150;
    bctx.save();
    bctx.globalAlpha = bFaint.foe ? 0.25 : 1;
    bctx.translate(shakeX, bFaint.foe ? 18 : 0);
    Sprite.drawShadow(bctx, BW * 0.72 - fs / 2, BH * 0.42 - fs * Sprite.GROUND / Sprite.GRID, fs, 0.22);
    Sprite.draw(bctx, battle.foe.look, BW * 0.72 - fs / 2, BH * 0.42 - fs * Sprite.GROUND / Sprite.GRID, fs,
      { bob: Math.sin(t * 2) * 1.2, time: t });
    bctx.restore();

    // じぶん
    const ys = 210;
    bctx.save();
    bctx.globalAlpha = bFaint.you ? 0.25 : 1;
    bctx.translate(shakeX, bFaint.you ? 22 : 0);
    Sprite.drawShadow(bctx, BW * 0.26 - ys / 2, BH * 0.88 - ys * Sprite.GROUND / Sprite.GRID, ys, 0.26);
    Sprite.draw(bctx, battle.you.look, BW * 0.26 - ys / 2, BH * 0.88 - ys * Sprite.GROUND / Sprite.GRID, ys,
      { bob: Math.sin(t * 2.2) * 1.4, flip: true, time: t });
    bctx.restore();

    drawBar(bctx, 24, 18, 300, hpShown.foe, battle.foe.maxHp, battle.foe.name, battle.foe.stats.level);
    drawBar(bctx, BW - 324, BH - 76, 300, hpShown.you, battle.you.maxHp, battle.you.name, battle.you.stats.level);

    // タイプ表示
    bctx.font = '12px system-ui';
    bctx.fillStyle = '#cfe0ff';
    bctx.fillText(battle.foe.types.map((t2) => Species.TYPE_BY_ID[t2].name).join('・'), 24, 88);
    bctx.fillText(battle.you.types.map((t2) => Species.TYPE_BY_ID[t2].name).join('・'), BW - 324, BH - 86);
  }

  $('btn-wild').addEventListener('click', () => startBattle(false));
  $('btn-boss').addEventListener('click', () => startBattle(true));

  // ── ダイアログ ───────────────────────────────────────
  $('btn-help').addEventListener('click', () => {
    let cur = '';
    try { cur = localStorage.getItem('monster.syncUrl') || ''; } catch (e) { cur = ''; }
    $('sync-url').value = cur;
    $('help-overlay').hidden = false;
  });
  $('help-close').addEventListener('click', () => { $('help-overlay').hidden = true; });
  $('help-overlay').addEventListener('click', (e) => {
    if (e.target === $('help-overlay')) $('help-overlay').hidden = true;
  });
  $('sync-save').addEventListener('click', () => {
    Sync.setUrl($('sync-url').value.trim());
  });
  $('btn-who').addEventListener('click', () => {
    const m = World.me();
    const v = window.prompt('あなたの なまえ（おせわログに のこります）', m.name || '');
    if (v === null) return;
    m.name = v.trim().slice(0, 16);
    World.writeMe(m);
    refresh();
  });

  // ── ループ ───────────────────────────────────────────
  function loop(ts) {
    drawStage(ts);
    if (!bOverlay.hidden) drawBattle(ts);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // 1 分ごとに時間経過をとりこむ
  setInterval(() => {
    const before = World.levelOf(World.state.exp);
    World.tick();
    if (World.levelOf(World.state.exp) !== before) World.save();
    refresh();
  }, 20000);

  refresh();
})();
