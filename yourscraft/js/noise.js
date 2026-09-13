/* YoursCraft — 疑似乱数とノイズ
 * 依存なし。ワールドは seed から完全に再現できるようにしてある
 * （セーブデータは「seed + 変更したブロックだけ」で済む）。
 */
(function (global) {
  'use strict';
  var YC = global.YC || (global.YC = {});

  /* 32bit 整数のハッシュ。座標から決定的な乱数を作るのに使う。
     単純な掛け算だと軸に沿って規則が出る（鉱石が一直線に並ぶなど）ので、
     FNV 風に混ぜたあと最後に撹拌する。 */
  function hash3(x, y, z) {
    var h = 0x811c9dc5;
    h = Math.imul(h ^ (x | 0), 0x01000193);
    h = Math.imul(h ^ (y | 0), 0x01000193);
    h = Math.imul(h ^ (z | 0), 0x01000193);
    h ^= h >>> 15; h = Math.imul(h, 0x2545f491);
    h ^= h >>> 13; h = Math.imul(h, 0x9e3779b1);
    return (h ^ (h >>> 16)) >>> 0;
  }
  function hash2(x, y) { return hash3(x, y, 0); }

  /* [0,1) の決定的な乱数 */
  function rand2(seed, x, y) { return hash3(x, y, seed) / 4294967296; }
  function rand3(seed, x, y, z) { return hash3(x ^ (seed * 31), y, z + seed) / 4294967296; }

  /* mulberry32: 小さくて質の良い PRNG */
  function mulberry32(a) {
    a = a >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Perlin ノイズ（2D / 3D） */
  function Noise(seed) {
    var rnd = mulberry32(seed >>> 0);
    var p = new Uint8Array(256);
    var i;
    for (i = 0; i < 256; i++) p[i] = i;
    for (i = 255; i > 0; i--) {
      var j = (rnd() * (i + 1)) | 0;
      var t = p[i]; p[i] = p[j]; p[j] = t;
    }
    this.perm = new Uint8Array(512);
    for (i = 0; i < 512; i++) this.perm[i] = p[i & 255];
    this.seed = seed >>> 0;
  }

  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function grad2(h, x, y) {
    switch (h & 7) {
      case 0: return x + y;
      case 1: return -x + y;
      case 2: return x - y;
      case 3: return -x - y;
      case 4: return x;
      case 5: return -x;
      case 6: return y;
      default: return -y;
    }
  }
  function grad3(h, x, y, z) {
    switch (h & 15) {
      case 0: return x + y;
      case 1: return -x + y;
      case 2: return x - y;
      case 3: return -x - y;
      case 4: return x + z;
      case 5: return -x + z;
      case 6: return x - z;
      case 7: return -x - z;
      case 8: return y + z;
      case 9: return -y + z;
      case 10: return y - z;
      case 11: return -y - z;
      case 12: return x + y;
      case 13: return -y + z;
      case 14: return -x + y;
      default: return -y - z;
    }
  }

  Noise.prototype.perlin2 = function (x, y) {
    var p = this.perm;
    var xi = Math.floor(x), yi = Math.floor(y);
    var xf = x - xi, yf = y - yi;
    xi &= 255; yi &= 255;
    var u = fade(xf), v = fade(yf);
    var aa = p[p[xi] + yi], ab = p[p[xi] + yi + 1];
    var ba = p[p[xi + 1] + yi], bb = p[p[xi + 1] + yi + 1];
    var x1 = lerp(grad2(aa, xf, yf), grad2(ba, xf - 1, yf), u);
    var x2 = lerp(grad2(ab, xf, yf - 1), grad2(bb, xf - 1, yf - 1), u);
    return lerp(x1, x2, v) * 0.7;
  };

  Noise.prototype.perlin3 = function (x, y, z) {
    var p = this.perm;
    var xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    var xf = x - xi, yf = y - yi, zf = z - zi;
    xi &= 255; yi &= 255; zi &= 255;
    var u = fade(xf), v = fade(yf), w = fade(zf);
    var a = p[xi] + yi, aa = p[a] + zi, ab = p[a + 1] + zi;
    var b = p[xi + 1] + yi, ba = p[b] + zi, bb = p[b + 1] + zi;
    var x1 = lerp(grad3(p[aa], xf, yf, zf), grad3(p[ba], xf - 1, yf, zf), u);
    var x2 = lerp(grad3(p[ab], xf, yf - 1, zf), grad3(p[bb], xf - 1, yf - 1, zf), u);
    var y1 = lerp(x1, x2, v);
    x1 = lerp(grad3(p[aa + 1], xf, yf, zf - 1), grad3(p[ba + 1], xf - 1, yf, zf - 1), u);
    x2 = lerp(grad3(p[ab + 1], xf, yf - 1, zf - 1), grad3(p[bb + 1], xf - 1, yf - 1, zf - 1), u);
    var y2 = lerp(x1, x2, v);
    return lerp(y1, y2, w) * 0.8;
  };

  /* 複数オクターブの合成 */
  Noise.prototype.fbm2 = function (x, y, oct, lac, gain) {
    oct = oct || 4; lac = lac || 2; gain = gain === undefined ? 0.5 : gain;
    var sum = 0, amp = 1, norm = 0, fx = x, fy = y;
    for (var i = 0; i < oct; i++) {
      sum += this.perlin2(fx, fy) * amp;
      norm += amp;
      amp *= gain; fx *= lac; fy *= lac;
    }
    return sum / norm;
  };

  Noise.prototype.fbm3 = function (x, y, z, oct, lac, gain) {
    oct = oct || 3; lac = lac || 2; gain = gain === undefined ? 0.5 : gain;
    var sum = 0, amp = 1, norm = 0;
    for (var i = 0; i < oct; i++) {
      sum += this.perlin3(x, y, z) * amp;
      norm += amp;
      amp *= gain; x *= lac; y *= lac; z *= lac;
    }
    return sum / norm;
  };

  /* 尾根ノイズ（山脈用） */
  Noise.prototype.ridged2 = function (x, y, oct) {
    oct = oct || 4;
    var sum = 0, amp = 1, norm = 0;
    for (var i = 0; i < oct; i++) {
      var n = 1 - Math.abs(this.perlin2(x, y)) * 2;
      sum += n * n * amp;
      norm += amp;
      amp *= 0.5; x *= 2; y *= 2;
    }
    return sum / norm;
  };

  YC.Noise = Noise;
  YC.mulberry32 = mulberry32;
  YC.hash2 = hash2;
  YC.hash3 = hash3;
  YC.rand2 = rand2;
  YC.rand3 = rand3;
})(typeof window !== 'undefined' ? window : globalThis);
