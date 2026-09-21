// 乱数まわり。シード付きなので「その住人らしさ」を毎回おなじに再現できる。

export function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/** 文字列シードから決定的な乱数関数をつくる。 */
export function seeded(seedStr) {
  const seed = xmur3(String(seedStr))();
  let a = seed || 1;
  return function rand() {
    a |= 0;
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t = t ^ (t >>> 15);
    t = Math.imul(t, 0x735a2d97);
    return ((t ^ (t >>> 15)) >>> 0) / 4294967296;
  };
}

export const rnd = () => Math.random();
export const randInt = (a, b, r = rnd) => a + Math.floor(r() * (b - a + 1));
export const pick = (arr, r = rnd) => arr[Math.floor(r() * arr.length)];

export function pickMany(arr, n, r = rnd) {
  const pool = arr.slice();
  const out = [];
  while (out.length < n && pool.length) {
    out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  }
  return out;
}

export function shuffle(arr, r = rnd) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function chance(p, r = rnd) {
  return r() < p;
}

export function uid(prefix = 'r') {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e6).toString(36);
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
