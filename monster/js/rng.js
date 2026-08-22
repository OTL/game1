// 決定的な乱数まわり。
// 同じシードなら、誰のブラウザでも必ず同じ結果になる。
// 「世界じゅうで同じタマゴを育てる」仕組みはこれに乗っている。
(function (global) {
  'use strict';

  // 文字列 → 32bit ハッシュ（FNV-1a 風）
  function hashString(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  // mulberry32: 小さくて質のそこそこ良い PRNG
  function makeRng(seed) {
    let a = typeof seed === 'string' ? hashString(seed) : (seed >>> 0);
    if (a === 0) a = 0x9e3779b9;
    const rng = function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    rng.int = function (min, max) {           // min 以上 max 以下
      return min + Math.floor(rng() * (max - min + 1));
    };
    rng.pick = function (arr) {
      return arr[Math.floor(rng() * arr.length)];
    };
    rng.chance = function (p) {
      return rng() < p;
    };
    rng.shuffle = function (arr) {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const t = out[i]; out[i] = out[j]; out[j] = t;
      }
      return out;
    };
    return rng;
  }

  global.Rng = { makeRng, hashString };
})(window);
