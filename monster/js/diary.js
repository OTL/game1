// るすばん日記。
//
// タブを閉じているあいだに何があったかを、時刻つきの短文にして帰ってきた人に見せる。
// これは「ケアミスの請求書」であると同時に、いちばん愛着がわく装置でもある。
// 文体は そのコの性格（genome.personality）で変わる。
(function (global) {
  'use strict';

  const MIN = 60e3, HOUR = 3600e3;
  const MAX_ENTRIES = 10;

  // 呼んだのに 応えてもらえなかった
  const MISS_TEXT = {
    food:   ['おなかが すいて ないていた', 'ごはんの おさらを ずっと みていた', 'からっぽの おさらを つついていた'],
    mood:   ['たいくつで ころころ ころがっていた', 'ひとりで あそぼうとして やめた', 'なにもする ことがなかった'],
    energy: ['ふらふらしながら 立っていた', 'ねむいのに ねむれずにいた', 'めを こすっていた'],
    clean:  ['よごれを きに していた', 'じぶんで きれいに しようとしていた', 'すみっこで もぞもぞしていた']
  };

  // 性格ごとの、なんでもない時間のようす
  const FLAVOR = {
    amae: [
      'げんかんの ほうを なんども みていた',
      'クッションに もぐりこんで まるくなっていた',
      'だれかの においの するものに よりそっていた',
      'ちいさな こえで なにか いっていた'
    ],
    yancha: [
      'へやじゅうを ぜんそくりょくで はしっていた',
      'たかい ところから とびおりて しりもちを ついた',
      'かべに むかって とっしんの れんしゅうを していた',
      'なにかを ひっくりかえした（はんせいは していない）'
    ],
    nonbiri: [
      'ひなたで のびきって ねていた',
      'くもが うごくのを ずっと みていた',
      'あくびを 3かい した',
      'なにも しない じかんを たんのうしていた'
    ],
    shikkari: [
      'じぶんの ねどこを きちんと ととのえていた',
      'おさらを ならべなおしていた',
      'たいそうを してから ねた',
      'とっくんの ポーズを ひとりで さらっていた'
    ],
    sabishi: [
      'まどの そとの とりを ずっと みていた',
      'ドアの おとが するたび かおを あげた',
      'かげぼうしと あそんでいた',
      'ちいさく ためいきを ついた'
    ],
    kuishin: [
      'たなの うえの においを かいでいた',
      'ゆめの なかで もぐもぐ していた',
      'おやつの ふくろの おとを ききまちがえた',
      'おさらを ぴかぴかに なめていた'
    ]
  };

  const NIGHT = [
    'まるくなって ねていた',
    'すやすや ねていた',
    'ねごとで なまえを よんだ（きこえなかった）',
    'いちど めを さまして また ねた'
  ];

  const OUTING_ROAD = {
    short: ['ちかくの はらっぱを ひとまわり した', 'かどの ねこと にらめっこ した', 'みずたまりを とびこえた'],
    mid:   ['もりの おくまで あるいた', 'しらない みちを えらんでみた', 'おおきな きの したで やすんだ', 'かわで あしを ひやした'],
    long:  ['やまの むこうまで いってみた', 'たびの とちゅうで ひとばん あかした', 'ちずに ない みずうみを みつけた', 'とおくの まちの においを おぼえた']
  };

  function hhmm(t) {
    const d = new Date(t);
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }

  function isNight(t) { return World.isNight(t); }

  // fromT〜toT のあいだの日記を作る。
  // events は state.advance() が返した ケアミス・帰宅 のタネ。
  function build(pet, genome, fromT, toT, events) {
    const rng = Rng.makeRng('diary:' + pet.seed + ':' + Math.round(fromT / MIN));
    const pool = FLAVOR[genome.personality] || FLAVOR.nonbiri;
    const entries = [];
    let misses = 0;

    (events || []).forEach((e) => {
      if (e.kind === 'miss') {
        misses++;
        const list = MISS_TEXT[e.key] || MISS_TEXT.mood;
        entries.push({ t: e.t, kind: 'miss', text: rng.pick(list) + '（だれも こなかった）' });
      } else if (e.kind === 'home') {
        entries.push({ t: e.t, kind: 'home', text: 'おでかけから かえってきた。げんかんで まっている' });
      }
    });

    // おでかけ中の道中
    const o = pet.outing;
    if (o) {
      const a = Math.max(fromT, o.startedAt);
      const b = Math.min(toT, o.endsAt);
      const roads = OUTING_ROAD[o.kind] || OUTING_ROAD.mid;
      const n = o.kind === 'long' ? 3 : (o.kind === 'mid' ? 2 : 1);
      for (let i = 0; i < n && b > a; i++) {
        entries.push({ t: a + ((i + 0.5) / n) * (b - a), kind: 'road', text: rng.pick(roads) });
      }
    }

    // なんでもない時間。2〜4 時間に 1 つくらい。
    const span = Math.max(0, toT - fromT);
    const slots = Math.min(6, Math.floor(span / (2.5 * HOUR)));
    for (let i = 0; i < slots; i++) {
      const t = fromT + ((i + 0.35 + rng() * 0.3) / slots) * span;
      const outing = o && t >= o.startedAt && t < o.endsAt;
      if (outing) continue;
      entries.push({ t: t, kind: 'flavor', text: isNight(t) ? rng.pick(NIGHT) : rng.pick(pool) });
    }

    entries.sort((a, b) => a.t - b.t);

    // 多すぎるときは ケアミスを 優先して残す
    let out = entries;
    if (out.length > MAX_ENTRIES) {
      const keep = out.filter((e) => e.kind === 'miss' || e.kind === 'home');
      const rest = out.filter((e) => e.kind !== 'miss' && e.kind !== 'home');
      out = keep.concat(rest.slice(0, Math.max(0, MAX_ENTRIES - keep.length)))
        .sort((a, b) => a.t - b.t)
        .slice(-MAX_ENTRIES);
    }

    return {
      from: fromT,
      to: toT,
      misses: misses,
      entries: out.map((e) => ({ t: Math.round(e.t), kind: e.kind, time: hhmm(e.t), text: e.text }))
    };
  }

  global.Diary = { build, hhmm };
})(window);
