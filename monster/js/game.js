// 画面まわり。おせわ・おでかけ・日記・おわかれ・ずかん・バトル演出。
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));
  const MIN = 60e3;

  // ── 初期化 ───────────────────────────────────────────
  World.init();

  let prevLevel = World.levelOf(World.state.exp);
  let prevStage = World.stageOf(World.state);
  let lastDiary = null;
  let dexMode = 'view';        // 'view' | 'pick'

  // ── ステージ描画 ─────────────────────────────────────
  const stage = $('stage');
  const sctx = stage.getContext('2d');
  const SW = stage.width, SH = stage.height;

  const particles = [];
  let anim = null;                 // {kind, until, dur}
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

    const gy = SH - 132;
    const size = 320;
    const x = SW / 2 - size / 2;
    const y = gy - size * Sprite.GROUND / Sprite.GRID;
    const t = ts / 1000;

    // おでかけ中は そこにいない
    if (World.isOuting()) {
      sctx.globalAlpha = 0.9;
      sctx.font = 'bold 26px system-ui';
      sctx.textAlign = 'center';
      sctx.fillStyle = 'rgba(255,255,255,.85)';
      sctx.fillText('おでかけ中', SW / 2, gy - 120);
      sctx.font = '16px system-ui';
      sctx.fillStyle = 'rgba(255,255,255,.6)';
      sctx.fillText('あと ' + World.durText(Outing.leftMs(World)), SW / 2, gy - 90);
      // 足あと
      for (let i = 0; i < 6; i++) {
        const p = ((ts / 2600) + i / 6) % 1;
        sctx.globalAlpha = 0.5 * (1 - p);
        sctx.beginPath();
        sctx.ellipse(SW / 2 + p * 240, gy - 10 + Math.sin(i) * 6, 7, 4, 0, 0, Math.PI * 2);
        sctx.fill();
      }
      sctx.globalAlpha = 1;
      sctx.textAlign = 'left';
      drawParticles(ts);
      return;
    }

    const stageNo = World.stageOf(World.state);
    const sleepy = World.state.care.energy < 18 || World.isNight(Date.now());
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
    const blink = stageNo > 0 && (blinkPhase < 130 || sleepy);

    Sprite.drawShadow(sctx, x, y, size, sleepy ? 0.18 : 0.26);
    Sprite.draw(sctx, World.look(), x, y, size, { bob: bob, squash: squash, blink: blink, time: t });

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

    // コール中は あたまの上で 💢 が はねる
    const calls = World.callKeys();
    if (calls.length) {
      const p = Math.abs(Math.sin(ts / 380));
      sctx.font = 'bold 40px system-ui';
      sctx.textAlign = 'center';
      sctx.fillText('💢', SW / 2 + 96, gy - 210 - p * 10);
      sctx.textAlign = 'left';
    }

    drawParticles(ts);
  }

  function drawParticles(ts) {
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

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  function hhmm(t) {
    const d = new Date(t);
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }
  function ymd(t) {
    const d = new Date(t);
    return (d.getMonth() + 1) + '/' + d.getDate();
  }

  function refresh() {
    const s = World.state;
    const g = World.genome;
    const stageNo = World.stageOf(s);
    const prog = World.levelProgress(s.exp);
    const st = World.stats();
    const outing = World.isOuting();
    const dead = World.isDead();
    const weak = World.isWeak();
    const calls = World.callKeys();

    // ── いのち
    $('gen-no').textContent = s.gen;
    $('life-left').textContent = dead ? 'ー' : World.lifeLeftText();
    $('life-fill').style.width = ((1 - World.lifeRatio()) * 100) + '%';
    $('miss-val').textContent = s.careMiss;
    $('miss-max').textContent = World.MISS_DEATH;
    $('miss-dots').innerHTML = (function () {
      const n = 10;
      const filled = Math.round(clamp(s.careMiss / World.MISS_DEATH, 0, 1) * n);
      let html = '';
      for (let i = 0; i < n; i++) {
        const cls = i < filled ? (s.careMiss >= World.MISS_WEAK ? 'dot bad' : 'dot on') : 'dot';
        html += '<i class="' + cls + '"></i>';
      }
      return html;
    })();
    document.querySelector('.lifeline').classList.toggle('weak', weak);

    // ── なまえまわり
    $('mon-name').textContent = World.name() + (g.shiny ? ' ✨' : '') + (g.blessed ? ' 👑' : '');
    $('mon-level').textContent = prog.level;
    $('mon-age').textContent = World.ageText();
    $('mon-cat').textContent = stageNo === 0 ? 'なぞの タマゴ' : (g.category + 'ポケ');
    $('mon-pers').textContent = stageNo === 0 ? '' : Species.personalityName(g);

    const lin = $('lineage');
    if (s.lineage && s.lineage.parentName) {
      const key = Object.keys(s.lineage.traits || {})[0];
      lin.hidden = false;
      lin.innerHTML = '👪 ' + esc(s.lineage.parentName) + ' の子。' +
        (key ? '<b>' + esc(Species.TRAIT_LABEL[key] || key) + '</b> を うけついだ。' : '') +
        (s.gift && (s.gift.hp + s.gift.atk + s.gift.def + s.gift.spd) > 0
          ? ' とっくんの おくりものつき。' : '') +
        (g.blessed ? ' <b class="bless">でんせつの 血をひく</b>' : '');
    } else {
      lin.hidden = true;
    }

    $('exp-fill').style.width = (prog.ratio * 100) + '%';
    $('exp-text').textContent = 'EXP ' + prog.cur + ' / ' + prog.need + '（つうさん ' + Math.floor(s.exp) + '）';

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

    // ── コール表示
    const co = $('callout');
    if (calls.length && !dead) {
      co.hidden = false;
      co.textContent = '💢 ' + calls.map((k) => World.CALL_LABEL[k]).join(' / ');
      document.title = '💢 ' + World.CALL_LABEL[calls[0]] + ' — たまごっち';
    } else {
      co.hidden = true;
      document.title = 'たまごっち — 七日間、いきものを ひとり育てる';
    }
    $('nightmark').hidden = !(World.isNight(Date.now()) && !outing && !dead);

    // ── メーター
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
      el.style.background = v < World.CALL_AT ? '#ff6b6b' : d.color;
      $('val-' + d.key).textContent = Math.round(v);
    });
    $('cond-val').textContent = Math.round(World.condition(s) * 100) + '%';
    $('cond-note').textContent = weak
      ? 'よわっている… ステータスが おちている。4 つとも 90 以上にすると ケアミスを 1 返上できる'
      : 'おせわが行きとどくほど 数値が のびる';
    $('cond-val').style.color = weak ? 'var(--red)' : '';

    // ── ステータス
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

    // ── きろく
    $('counters').innerHTML =
      '<div class="counter"><b>' + World.totalActions() + '</b><span>おせわ 回数</span></div>' +
      '<div class="counter"><b>' + s.battles.win + '</b><span>かち</span></div>' +
      '<div class="counter"><b>' + s.battles.lose + '</b><span>まけ</span></div>';

    const keeps = (s.keepsakes || []).slice().reverse();
    $('keeps').innerHTML = keeps.length
      ? keeps.map((k) => '<li>' + esc(k.text) + '<time>' + ymd(k.t) + '</time></li>').join('')
      : '<li class="empty">まだ なにも ひろっていない</li>';

    const log = s.log.slice(-14).reverse();
    $('log').innerHTML = log.length
      ? log.map((e) => '<li><time>' + hhmm(e.t) + '</time>' + esc(e.text) + '</li>').join('')
      : '<li class="empty">できごとは まだない</li>';

    $('dex-count').textContent = Dex.count();
    $('bag-count').textContent = Items.countUsable();
    $('coll-count').textContent = Items.foundCount();
    if (!$('bag-overlay').hidden) renderBag();

    // ── おでかけ
    const box = $('outbox');
    const field = $('playfield');
    if (s.outing) {
      box.hidden = false;
      field.hidden = true;
      const c = Outing.BY_ID[s.outing.kind];
      const back = Outing.isBack(World);
      $('out-title').textContent = (c ? c.emoji + ' ' + c.name : 'おでかけ') + (back ? ' — かえってきた！' : ' に おでかけ中');
      $('out-left').textContent = back ? '' : 'あと ' + World.durText(Outing.leftMs(World));
      $('out-fill').style.width = (Outing.progress(World) * 100) + '%';
      $('btn-claim').hidden = !back;
      $('btn-recall').hidden = back;
    } else {
      box.hidden = true;
      field.hidden = false;
    }

    // ── おでかけボタン
    const oc = $('outcourses');
    if (!oc.childElementCount) {
      Outing.COURSES.forEach((c) => {
        oc.insertAdjacentHTML('beforeend',
          '<button class="oc" data-out="' + c.id + '">' + c.emoji + ' <b>' + c.name + '</b>' +
          '<small>' + c.desc + ' / げんき −' + c.energy + '</small></button>');
      });
    }
    document.querySelectorAll('.oc').forEach((b) => {
      const c = Outing.BY_ID[b.dataset.out];
      b.disabled = dead || outing || stageNo === 0 || s.care.energy < c.energy;
    });

    // ── ボタンの有効・無効
    document.querySelectorAll('.act').forEach((b) => {
      b.disabled = dead || (stageNo === 0 && b.dataset.act !== 'pet');
    });
    document.querySelectorAll('.tr').forEach((b) => {
      b.disabled = dead || stageNo === 0 || s.care.energy < 18 || s.train[b.dataset.train] >= 120;
    });
    $('btn-wild').disabled = dead || stageNo === 0 || s.care.energy < 12;
    $('btn-ancestor').disabled = dead || stageNo === 0 || s.care.energy < 12 || Dex.count() === 0;
    $('btn-ancestor').textContent = Dex.count() === 0
      ? '🕯️ せんだいは まだ いない' : '🕯️ せんだいに いどむ';

    checkGrowth();
  }

  function checkGrowth() {
    const lv = World.levelOf(World.state.exp);
    const stg = World.stageOf(World.state);
    if (stg > prevStage) {
      anim = { kind: 'evolve', until: performance.now() + 1600, dur: 1600 };
      burst('✨', 24, 220);
      flash(stg === 1 ? 'タマゴが かえった！' : 'おや…？ ' + World.name() + ' に しんかした！', '#6affc0');
    } else if (lv > prevLevel) {
      burst('⭐', 8, 140);
      flash('Lv.' + lv + ' に あがった！', '#ffcc4d');
    }
    prevLevel = lv; prevStage = stg;
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
    if (World.isDead()) { showBye(); return; }

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
    const ak = key === 'snack' ? 'feed' : key;
    s.actions[ak] = (s.actions[ak] || 0) + 1;
    World.addLog(def.log);

    // ぜんぶ 90 以上なら ケアミスを ひとつ 返上できる
    if (World.tryMend()) {
      burst('💗', 10, 160);
      flash('ごきげんが かんぺきに なった！ ケアミス −1', '#6affc0');
      World.addLog('ごきげんが かんぺきに なった（ケアミス −1）');
    }
    World.save();

    burst(def.emoji, key === 'pet' ? 3 : 7, 130);
    anim = { kind: def.anim, until: performance.now() + 600, dur: 600 };
    // おせわの ついでに、ものおきや にわで 何かを 見つけることがある
    findQuietly('care:' + key, key === 'pet' ? 0.02 : 0.05);
    refresh();
  }

  function doTrain(stat) {
    const s = World.state;
    World.tick();
    if (World.isDead()) { showBye(); return; }
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

  $('actions').addEventListener('click', (e) => {
    const b = e.target.closest('.act');
    if (b && !b.disabled) doAction(b.dataset.act);
  });
  document.querySelector('.train-btns').addEventListener('click', (e) => {
    const b = e.target.closest('.tr');
    if (b && !b.disabled) doTrain(b.dataset.train);
  });

  // ── おでかけ ─────────────────────────────────────────
  $('outcourses').addEventListener('click', (e) => {
    const b = e.target.closest('.oc');
    if (!b || b.disabled) return;
    World.tick();
    if (World.isDead()) { showBye(); return; }
    const r = Outing.start(World, b.dataset.out);
    if (!r) return;
    if (r.error) { flash(r.error, '#ff9f9f'); return; }
    burst('👋', 6, 140);
    flash(r.course.emoji + ' ' + r.course.name + ' に おくりだした', '#4dd0ff');
    refresh();
  });

  const OUT_FIND = {
    short: { c: 0.50, u: 0.30 },
    mid:   { c: 0.75, u: 0.50 },
    long:  { c: 0.95, u: 0.75 }
  };

  function claimOuting(early) {
    const kind = World.state.outing ? World.state.outing.kind : 'mid';
    const cond = World.state.outing ? World.state.outing.cond : 0.8;
    const r = Outing.claim(World, early);
    if (!r) return;
    const w = OUT_FIND[kind] || OUT_FIND.mid;
    const ratio = r.early ? 0.5 : 1;
    r.finds = (r.exp > 0 || !r.early)
      ? Items.roll({
          seed: World.state.seed + ':out:' + Date.now(),
          collectChance: w.c * ratio + (r.charm ? 0.5 : 0),
          usableChance: w.u * ratio,
          luck: (r.rare ? 1 : 0) + (r.charm ? 0.6 : 0) + Math.max(0, cond - 0.75) * 3,
          lens: true
        })
      : [];
    logFinds(r.finds);
    showGift(r);
    refresh();
  }
  $('btn-claim').addEventListener('click', () => claimOuting(false));
  $('btn-recall').addEventListener('click', () => {
    if (!window.confirm('よびもどすと おみやげが へります。いい？')) return;
    claimOuting(true);
  });

  // ── アイテムを 見つける ──────────────────────────────
  function findRow(f) {
    if (f.kind === 'usable') {
      return '<div class="giftrow item"><b>' + f.item.emoji + ' ' + esc(f.item.name) + '</b>' +
        '<span>どうぐに くわわった</span></div>';
    }
    const rar = Items.RARITY[f.item.rarity];
    return '<div class="giftrow item"><b><img class="ficon" src="' + Items.iconDataURL(f.item, 48) +
      '" alt="" width="34" height="34">' + esc(f.item.name) + '</b>' +
      '<span style="color:' + rar.color + '">' + rar.name +
      (f.isNew ? ' / はじめて！' : ' / もっている') + '</span></div>';
  }

  function logFinds(finds) {
    finds.forEach((f) => {
      if (f.kind === 'usable') {
        World.addLog(f.item.emoji + ' ' + f.item.name + ' を ひろった');
      } else {
        World.addLog('🧺 ' + f.item.name + ' を ひろった' + (f.isNew ? '（はじめて！）' : ''));
      }
      if (f.bonus) World.addLog('🎁 コレクション ' + Items.foundCount() + ' 種の ごほうび: ' + f.bonus.name);
    });
    if (finds.length) World.save();
  }

  // おせわの ついでに 見つかることがある（ちいさく、しずかに）
  function findQuietly(tag, chance) {
    const finds = Items.roll({
      seed: World.state.seed + ':' + tag + ':' + Date.now(),
      collectChance: chance, usableChance: chance * 0.7, luck: 0
    });
    if (!finds.length) return;
    logFinds(finds);
    const f = finds[0];
    burst(f.kind === 'usable' ? f.item.emoji : '🧺', 5, 130);
    flash(f.kind === 'usable'
      ? f.item.emoji + ' ' + f.item.name + ' を ひろった！'
      : '🧺 ' + f.item.name + (f.isNew ? ' を はじめて ひろった！' : ' を ひろった'),
      f.kind === 'usable' ? '#6affc0' : '#4dd0ff');
  }

  function showFindSheet(title, finds) {
    $('gift-title').textContent = title;
    $('gift-body').innerHTML = finds.map(findRow).join('');
    $('gift-overlay').hidden = false;
  }

  function showGift(r) {
    $('gift-title').textContent = r.early ? 'よびもどした' : (r.rare ? '🌟 すごい おみやげ！' : 'おかえり！');
    const rows = [];
    if (r.exp > 0) rows.push('<div class="giftrow"><b>+' + r.exp + '</b><span>けいけんち</span></div>');
    if (r.stat) rows.push('<div class="giftrow"><b>' + r.statLabel + ' +' + r.gain + '</b><span>とっくんの おみやげ</span></div>');
    if (r.keepsake) rows.push('<div class="giftrow keep"><b>' + esc(r.keepsake) + '</b><span>おもいでに くわわった</span></div>');
    (r.finds || []).forEach((f) => rows.push(findRow(f)));
    if (r.charm) rows.push('<div class="giftrow"><b>🍀 1.5 ばい</b><span>おまもりが きいた</span></div>');
    if (!rows.length) rows.push('<div class="giftrow"><b>なにも なかった</b><span>すぐ もどってきたから…</span></div>');
    $('gift-body').innerHTML = rows.join('');
    $('gift-overlay').hidden = false;
  }
  $('gift-close').addEventListener('click', () => { $('gift-overlay').hidden = true; });

  // ── るすばん日記 ─────────────────────────────────────
  function buildDiary() {
    if (World.awayMs <= 0) return null;
    const to = World.now();
    const from = to - World.awayMs;
    return Diary.build(World.state, World.genome, from, to, World.awayEvents);
  }

  function showDiary(d) {
    if (!d) {
      $('diary-span').textContent = 'いまのところ、るすの あいだの できごとは ありません。';
      $('diary-list').innerHTML = '';
      $('diary-sum').textContent = '';
      $('diary-overlay').hidden = false;
      return;
    }
    $('diary-span').textContent =
      ymd(d.from) + ' ' + hhmm(d.from) + ' 〜 ' + ymd(d.to) + ' ' + hhmm(d.to) +
      '（' + World.durText(d.to - d.from) + 'の るす）';
    $('diary-list').innerHTML = d.entries.length
      ? d.entries.map((e) =>
          '<li class="' + e.kind + '"><time>' + e.time + '</time>' + esc(e.text) + '</li>').join('')
      : '<li class="empty">とくに なにも なかった</li>';
    $('diary-sum').innerHTML = d.misses > 0
      ? '<b class="bad">ケアミス +' + d.misses + '</b> — 呼んだのに こなかった回数。いまは ' +
        World.state.careMiss + ' / ' + World.MISS_DEATH + '。'
      : '<b class="good">ケアミス なし</b> — よく もちこたえた。';
    $('diary-overlay').hidden = false;
  }
  $('diary-close').addEventListener('click', () => { $('diary-overlay').hidden = true; });
  $('btn-diary').addEventListener('click', () => showDiary(lastDiary));

  // ── おわかれ ─────────────────────────────────────────
  let byeShown = false;

  function showBye() {
    if (byeShown) return;
    const p = World.state;
    const dead = p.dead;
    if (!dead) return;
    byeShown = true;

    const rec = Dex.record(p, World.genome, dead);
    $('bye-title').textContent = Dex.isFullLife(rec) ? '🌾 てんじゅを まっとうした' : '🕯️ おわかれ';

    const c = $('bye-canvas');
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.globalAlpha = 0.75;
    Sprite.draw(ctx, Species.lookFor(World.genome, rec.stage, rec.branch, null), 0, 0, c.width, {});
    ctx.globalAlpha = 1;

    const ratio = Dex.giftRatioText(rec);
    $('bye-body').innerHTML =
      '<h3>' + esc(rec.name) + '</h3>' +
      '<p class="byetitle">「' + esc(rec.title) + '」</p>' +
      '<div class="byestats">' +
      '<div><b>' + World.durText(rec.lifeMs) + '</b><span>いきた 時間</span></div>' +
      '<div><b>Lv.' + rec.level + '</b><span>さいしゅう</span></div>' +
      '<div><b>' + rec.careMiss + '</b><span>ケアミス</span></div>' +
      '<div><b>' + rec.battles.win + '勝' + rec.battles.lose + '敗</b><span>せんせき</span></div>' +
      '</div>' +
      '<p class="byenote">' +
      (Dex.isFullLife(rec)
        ? '七日を いきぬいた。'
        : dead.cause === 'age'
          ? '七日は いきた。けれど 呼ばれたのに こなかった回数が ' + rec.careMiss + ' 回。'
          : 'ケアミスが ' + World.MISS_DEATH + ' に とどいてしまった。') +
      'とっくんの <b>' + ratio + '</b> と 見ための とくちょうを 1 つ、つぎの タマゴに のこしていく。' +
      '</p>';
    $('bye-overlay').hidden = false;
    refresh();
  }

  $('bye-close').addEventListener('click', () => {
    const r = World.nextGeneration();
    byeShown = false;
    $('bye-overlay').hidden = true;
    prevLevel = 1; prevStage = 0;
    lastDiary = null;
    burst('🥚', 14, 180);
    flash('あたらしい タマゴが やってきた', '#6affc0');
    if (r.blessed) setTimeout(() => flash('👑 でんせつの 血を ひいている…！', '#ffcc4d'), 1500);
    refresh();
  });

  // ── ずかん ───────────────────────────────────────────
  function causeMark(r) { return Dex.isFullLife(r) ? '👑' : (r.cause === 'age' ? '🥀' : '💀'); }

  function renderDex(mode) {
    dexMode = mode || 'view';
    const list = Dex.all().slice().reverse();
    const sum = Dex.summary();
    $('dex-sum').innerHTML =
      '<div class="counter"><b>' + sum.total + '</b><span>のこした 代</span></div>' +
      '<div class="counter"><b>' + sum.age + '</b><span>てんじゅ</span></div>' +
      '<div class="counter"><b>' + sum.weak + '</b><span>すいじゃく</span></div>' +
      '<div class="counter"><b>' + sum.streak + '</b><span>てんじゅ れんぞく</span></div>' +
      (sum.streak >= 2 && sum.streak < 3
        ? '<p class="dexhint">あと ' + (3 - sum.streak) + ' 代 てんじゅを つづけると、つぎの タマゴは でんせつの 血を ひく。</p>'
        : '');

    $('dex-list').innerHTML = list.length ? list.map((r) => {
      const img = Sprite.toDataURL(Dex.lookOf(r), 72);
      const types = r.types.map((t) => Species.TYPE_BY_ID[t].name).join('・');
      return '<div class="dexcard ' + (Dex.isFullLife(r) ? 'age' : 'weak') + '">' +
        '<img src="' + img + '" alt="" width="72" height="72">' +
        '<div class="dexinfo">' +
        '<b>' + r.gen + 'だいめ ' + esc(r.name) + (r.shiny ? ' ✨' : '') + (r.blessed ? ' 👑' : '') + '</b>' +
        '<span class="dextitle">' + causeMark(r) + ' ' + esc(r.title) + '</span>' +
        '<span class="dexmeta">' + types + ' / Lv.' + r.level + ' / ' + World.durText(r.lifeMs) +
        ' / ケアミス ' + r.careMiss + '</span>' +
        '<span class="dexmeta">' + ymd(r.bornAt) + ' 〜 ' + ymd(r.diedAt) +
        (r.beaten ? ' / いどんで かった ' + r.beaten + ' 回' : '') + '</span>' +
        (r.keepsakes && r.keepsakes.length
          ? '<span class="dexmeta keeps">' + r.keepsakes.map((k) => esc(k.text)).join('、') + '</span>' : '') +
        '</div>' +
        (dexMode === 'pick'
          ? '<button class="dexgo" data-seed="' + esc(r.seed) + '">いどむ</button>'
          : '') +
        '</div>';
    }).join('') : '<p class="empty">まだ 1 代も 旅立っていない。</p>';

    $('dex-overlay').hidden = false;
  }

  $('btn-dex').addEventListener('click', () => renderDex('view'));
  $('dex-close').addEventListener('click', () => { $('dex-overlay').hidden = true; });
  $('dex-list').addEventListener('click', (e) => {
    const b = e.target.closest('.dexgo');
    if (!b) return;
    const rec = Dex.all().filter((r) => r.seed === b.dataset.seed)[0];
    if (!rec) return;
    $('dex-overlay').hidden = true;
    startBattle('ancestor', rec);
  });
  $('dex-reset').addEventListener('click', () => {
    if (!window.confirm('ずかんも いまの コも ぜんぶ 消えます。ほんとうに いい？')) return;
    World.resetAll();
    byeShown = false;
    prevLevel = 1; prevStage = 0;
    lastDiary = null;
    $('dex-overlay').hidden = true;
    refresh();
  });

  // ── バトル ───────────────────────────────────────────
  const bOverlay = $('battle-overlay');
  const bcv = $('battle-canvas');
  const bctx = bcv.getContext('2d');
  const BW = bcv.width, BH = bcv.height;
  let battle = null, bBusy = false, bShake = 0, bFaint = { you: 0, foe: 0 };
  let pendingFinds = [];
  let hpShown = { you: 0, foe: 0 };
  let skipWait = false;

  function startBattle(kind, rec) {
    const s = World.state;
    World.tick();
    if (World.isDead()) { showBye(); return; }
    if (s.care.energy < 12) { flash('げんきが たりない…', '#ff9f9f'); return; }
    s.care.energy = clamp(s.care.energy - 12, 0, 100);
    s.care.food = clamp(s.care.food - 5, 0, 100);

    const st = World.stats();
    const you = {
      name: World.name(), look: World.look(), types: World.genome.types,
      stats: st, moves: World.moves()
    };
    const n = s.battles.win + s.battles.lose;
    const foe = kind === 'ancestor'
      ? Battle.ancestorFoe(rec)
      : Battle.wildFor(st.level, s.seed + ':' + n);
    battle = Battle.create(you, foe, s.seed + ':' + n + ':' + kind);
    battle.kind = kind;
    battle.rec = rec || null;
    hpShown = { you: battle.you.hp, foe: battle.foe.hp };
    bFaint = { you: 0, foe: 0 };
    bOverlay.hidden = false;
    setMsg(kind === 'ancestor'
      ? '🕯️ ' + foe.name + ' が すがたを あらわした！'
      : 'やせいの ' + foe.name + ' が あらわれた！');
    renderCmd();
    refresh();
  }

  function setMsg(text) { $('battle-msg').textContent = text; }

  function renderCmd() {
    const cmd = $('battle-cmd');
    cmd.innerHTML = '';
    if (!battle) return;
    if (bBusy) {
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
        '<button data-cmd="cheer">👏 はげます<small>こうげき +15% ＆ すこし かいふく</small></button>' +
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
    const anc = battle.kind === 'ancestor';
    if (result === 'win') {
      const gain = Battle.rewardExp(battle.foe, battle.kind);
      s.exp += gain;
      s.battles.win++;
      s.care.mood = clamp(s.care.mood + 10, 0, 100);
      if (anc) {
        s.battles.ghost = (s.battles.ghost || 0) + 1;
        Dex.update(battle.rec.seed, (r) => { r.beaten = (r.beaten || 0) + 1; });
        s.keepsakes.push({ t: World.now(), text: '🕯️ ' + battle.rec.name +' を こえた しるし' });
        if (s.keepsakes.length > 12) s.keepsakes = s.keepsakes.slice(-12);
      }
      pendingFinds = Items.roll({
        seed: s.seed + ':win:' + Date.now(),
        collectChance: anc ? 1 : 0.40,
        usableChance: anc ? 0.5 : 0.25,
        luck: (anc ? 1 : 0) + battle.foe.stats.level / 45,
        lens: true
      });
      logFinds(pendingFinds);
      World.addLog(battle.foe.name + ' に かった（+' + gain + ' EXP）');
      setMsg('かった！ けいけんち ' + gain + ' を てにいれた！' +
        (pendingFinds.length ? ' おとしものも ひろった。' : ''));
    } else if (result === 'lose') {
      s.battles.lose++;
      s.care.mood = clamp(s.care.mood - 14, 0, 100);
      s.care.energy = clamp(s.care.energy - 10, 0, 100);
      s.exp += Math.round(battle.foe.stats.level * 1.2);
      World.addLog(battle.foe.name + ' に まけた…');
      setMsg(anc ? 'まだ せんだいには とどかない…' : 'まけてしまった… でも すこし つよくなった。');
    } else {
      World.addLog('たびの とちゅうで ひきかえした');
    }
    World.save();
    refresh();
  }

  function closeBattle() {
    bOverlay.hidden = true;
    battle = null;
    if (pendingFinds.length) {
      const f = pendingFinds;
      pendingFinds = [];
      showFindSheet('⚔️ たたかいの おとしもの', f);
    }
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
    if (battle.kind === 'ancestor') { g.addColorStop(0, '#2a2247'); g.addColorStop(1, '#4a3f6e'); }
    else { g.addColorStop(0, '#2a3f7a'); g.addColorStop(1, '#5a7fbf'); }
    bctx.fillStyle = g; bctx.fillRect(0, 0, BW, BH);
    bctx.fillStyle = 'rgba(30,60,45,.5)';
    bctx.beginPath(); bctx.ellipse(BW * 0.72, BH * 0.42, 150, 34, 0, 0, Math.PI * 2); bctx.fill();
    bctx.beginPath(); bctx.ellipse(BW * 0.26, BH * 0.86, 190, 42, 0, 0, Math.PI * 2); bctx.fill();

    ['you', 'foe'].forEach((k) => {
      hpShown[k] += (battle[k].hp - hpShown[k]) * 0.18;
      if (Math.abs(hpShown[k] - battle[k].hp) < 0.5) hpShown[k] = battle[k].hp;
    });

    const t = ts / 1000;
    const fs = 150;
    bctx.save();
    // せんだいは すこし すきとおっている
    bctx.globalAlpha = bFaint.foe ? 0.25 : (battle.kind === 'ancestor' ? 0.82 : 1);
    bctx.translate(shakeX, bFaint.foe ? 18 : 0);
    Sprite.drawShadow(bctx, BW * 0.72 - fs / 2, BH * 0.42 - fs * Sprite.GROUND / Sprite.GRID, fs, 0.22);
    Sprite.draw(bctx, battle.foe.look, BW * 0.72 - fs / 2, BH * 0.42 - fs * Sprite.GROUND / Sprite.GRID, fs,
      { bob: Math.sin(t * 2) * 1.2, time: t });
    bctx.restore();

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

    bctx.font = '12px system-ui';
    bctx.fillStyle = '#cfe0ff';
    bctx.fillText(battle.foe.types.map((t2) => Species.TYPE_BY_ID[t2].name).join('・'), 24, 88);
    bctx.fillText(battle.you.types.map((t2) => Species.TYPE_BY_ID[t2].name).join('・'), BW - 324, BH - 86);
  }

  $('btn-wild').addEventListener('click', () => startBattle('wild', null));
  $('btn-ancestor').addEventListener('click', () => {
    if (Dex.count() === 0) return;
    renderDex('pick');
  });

  // ── どうぐ ───────────────────────────────────────────
  function renderBag() {
    const bag = Items.bag();
    const owned = Items.USABLE.filter((u) => bag.usable[u.id] > 0);
    const buffs = [];
    if (Items.hasCharm()) buffs.push('🍀 おまもりが きいている（つぎの おでかけ 1.5 倍）');
    if (Items.lensLeft() > 0) buffs.push('🔍 レンズが きいている（あと ' + Items.lensLeft() + ' 回）');
    $('bag-note').innerHTML = (buffs.length ? '<b class="bagbuff">' + buffs.join(' ／ ') + '</b><br>' : '') +
      'おでかけ・バトル・おせわの ついでに ひろえます。' +
      (World.isOuting() ? '<b class="bagwarn"> いまは おでかけ中なので つかえません。</b>' : '');

    $('bag-list').innerHTML = owned.length ? owned.map((u) => {
      const rar = Items.RARITY[u.rarity];
      return '<div class="bagcard">' +
        '<span class="bagemoji">' + u.emoji + '</span>' +
        '<div class="baginfo"><b>' + esc(u.name) + ' <i class="bagn">×' + bag.usable[u.id] + '</i></b>' +
        '<span>' + esc(u.desc) + '</span>' +
        '<span class="bagrar" style="color:' + rar.color + '">' + rar.name + 'の どうぐ</span></div>' +
        '<button class="bagbtn" data-use="' + u.id + '">つかう</button>' +
        '</div>';
    }).join('') : '<p class="empty">どうぐは まだ ひとつも ない。おでかけに 送り出すのが いちばんの ちかみち。</p>';
  }

  $('btn-bag').addEventListener('click', () => { renderBag(); $('bag-overlay').hidden = false; });
  $('bag-close').addEventListener('click', () => { $('bag-overlay').hidden = true; });
  $('bag-list').addEventListener('click', (e) => {
    const b = e.target.closest('.bagbtn');
    if (!b) return;
    World.tick();
    if (World.isDead()) { $('bag-overlay').hidden = true; showBye(); return; }
    const r = Items.use(World, b.dataset.use);
    if (r.error) { renderBag(); flash(r.error, '#ff9f9f'); return; }
    if (World.tryMend()) {
      World.addLog('ごきげんが かんぺきに なった（ケアミス −1）');
      burst('💗', 8, 150);
    }
    burst(r.burst, 8, 150);
    anim = { kind: 'hop', until: performance.now() + 600, dur: 600 };
    flash(r.text, '#6affc0');
    renderBag();
    refresh();
  });

  // ── コレクション ─────────────────────────────────────
  let collCat = Items.CATS[0].key;
  let collPick = null;

  function renderColl() {
    const total = Items.TOTAL;
    const found = Items.foundCount();
    const rp = Items.rarityProgress();
    $('coll-sum').innerHTML =
      '<div class="counter"><b>' + found + ' / ' + total + '</b><span>あつめた</span></div>' +
      rp.map((r, i) =>
        '<div class="counter"><b style="color:' + Items.RARITY[i].color + '">' + r.found + ' / ' + r.total +
        '</b><span>' + Items.RARITY[i].name + '</span></div>').join('') +
      '<div class="collbar"><i style="width:' + (found / total * 100) + '%"></i></div>';

    $('coll-tabs').innerHTML = Items.CATS.map((c) => {
      const p = Items.catProgress(c.key);
      return '<button class="colltab' + (c.key === collCat ? ' on' : '') + '" data-cat="' + c.key + '">' +
        c.emoji + ' ' + c.name + '<small>' + p.found + '/' + p.total + '</small></button>';
    }).join('');

    $('coll-grid').innerHTML = Items.BY_CAT[collCat].map((it) => {
      const got = Items.foundEntry(it.id);
      const rar = Items.RARITY[it.rarity];
      if (!got) {
        return '<button class="collcell miss" data-item="' + it.id + '" title="まだ みつけていない">' +
          '<span class="qmark" style="color:' + rar.color + '55">？</span></button>';
      }
      return '<button class="collcell r' + it.rarity + '" data-item="' + it.id + '">' +
        '<img src="' + Items.iconDataURL(it, 96) + '" alt="" width="48" height="48">' +
        (got.n > 1 ? '<i class="cn">×' + got.n + '</i>' : '') + '</button>';
    }).join('');

    const it = collPick ? Items.COLLECT_BY_ID[collPick] : null;
    if (!it) {
      $('coll-info').innerHTML = '<span class="empty">マスを えらぶと 名前が でます。' +
        '20 種 あつめるごとに どうぐが 1 つ もらえます。</span>';
    } else {
      const got = Items.foundEntry(it.id);
      const rar = Items.RARITY[it.rarity];
      $('coll-info').innerHTML = got
        ? '<img src="' + Items.iconDataURL(it, 96) + '" alt="" width="44" height="44">' +
          '<div><b>' + esc(it.name) + '</b><span style="color:' + rar.color + '">' + rar.name +
          ' / ' + it.catEmoji + ' ' + it.catName + ' / ' + got.n + ' こ</span>' +
          '<span class="collwhen">はじめて みつけた: ' + ymd(got.t) + '</span></div>'
        : '<div><b>？？？</b><span style="color:' + rar.color + '">' + rar.name +
          ' / ' + it.catEmoji + ' ' + it.catName + '</span>' +
          '<span class="collwhen">まだ みつけていない</span></div>';
    }
  }

  $('btn-coll').addEventListener('click', () => { renderColl(); $('coll-overlay').hidden = false; });
  $('coll-close').addEventListener('click', () => { $('coll-overlay').hidden = true; });
  $('coll-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('.colltab');
    if (!b) return;
    collCat = b.dataset.cat; collPick = null;
    renderColl();
  });
  $('coll-grid').addEventListener('click', (e) => {
    const b = e.target.closest('.collcell');
    if (!b) return;
    collPick = b.dataset.item;
    renderColl();
  });

  // ── ダイアログ ───────────────────────────────────────
  $('btn-help').addEventListener('click', () => { $('help-overlay').hidden = false; });
  $('help-close').addEventListener('click', () => { $('help-overlay').hidden = true; });
  [['help-overlay'], ['diary-overlay'], ['gift-overlay'], ['dex-overlay'],
   ['bag-overlay'], ['coll-overlay']].forEach((a) => {
    const el = $(a[0]);
    el.addEventListener('click', (e) => { if (e.target === el) el.hidden = true; });
  });

  // ── ループ ───────────────────────────────────────────
  function loop(ts) {
    drawStage(ts);
    if (!bOverlay.hidden) drawBattle(ts);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // 20 秒ごとに 実時間を とりこむ
  setInterval(() => {
    if (World.isDead()) { showBye(); return; }
    const before = World.levelOf(World.state.exp);
    const wasOut = !!World.state.outing;
    World.tick();
    if (World.isDead()) { showBye(); return; }
    if (World.levelOf(World.state.exp) !== before) World.save();
    if (wasOut && Outing.isBack(World)) World.save();
    refresh();
  }, 20000);

  // ── スタート ─────────────────────────────────────────
  refresh();

  if (World.isDead()) {
    showBye();
  } else {
    lastDiary = buildDiary();
    if (lastDiary && (lastDiary.misses > 0 || (World.awayMs > 30 * MIN && lastDiary.entries.length))) {
      showDiary(lastDiary);
    }
  }
})();
