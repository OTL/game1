/* YoursCraft — 地形生成
 * seed だけから同じ世界が再現できる（セーブは「変更したブロック」だけで足りる）。
 */
(function (global) {
  'use strict';
  var YC = global.YC || (global.YC = {});
  var B = YC.Blocks, ID = B.ID;

  var CH = 16;          /* チャンクの一辺 */
  var WH = 96;          /* 世界の高さ */
  var SEA = 34;         /* 海面 */

  function idx(x, y, z) { return (y * CH + z) * CH + x; }
  function smoothstep(a, b, t) {
    t = (t - a) / (b - a);
    if (t < 0) t = 0; else if (t > 1) t = 1;
    return t * t * (3 - 2 * t);
  }

  var BIOME = {
    OCEAN: 0, BEACH: 1, PLAINS: 2, FOREST: 3, DESERT: 4, SNOWY: 5, MOUNTAIN: 6
  };
  var BIOME_JA = ['海', '砂浜', '平原', '森', '砂漠', '雪原', '山岳'];

  function Generator(seed) {
    seed = seed >>> 0;
    this.seed = seed;
    this.nCont = new YC.Noise(seed + 1);
    this.nHill = new YC.Noise(seed + 2);
    this.nMt = new YC.Noise(seed + 3);
    this.nMtMask = new YC.Noise(seed + 4);
    this.nTemp = new YC.Noise(seed + 5);
    this.nHum = new YC.Noise(seed + 6);
    this.nCaveA = new YC.Noise(seed + 7);
    this.nCaveB = new YC.Noise(seed + 8);
    this.nCavern = new YC.Noise(seed + 9);
    this.nDirt = new YC.Noise(seed + 10);
    this._hCache = new Map();
  }

  Generator.prototype.heightAt = function (x, z) {
    var key = x * 8192 + z;
    var c = this._hCache.get(key);
    if (c !== undefined) return c;
    var cont = this.nCont.fbm2(x * 0.0032, z * 0.0032, 4);
    var hill = this.nHill.fbm2(x * 0.017, z * 0.017, 3);
    var mt = this.nMt.ridged2(x * 0.0055, z * 0.0055, 4);
    var mask = smoothstep(0.05, 0.45, this.nMtMask.fbm2(x * 0.0021, z * 0.0021, 2) + 0.18);
    var h = SEA + cont * 15 + hill * 4.5 + mt * mask * 36 - 2;
    h = Math.round(h);
    if (h < 5) h = 5;
    if (h > WH - 12) h = WH - 12;
    if (this._hCache.size > 40000) this._hCache.clear();
    this._hCache.set(key, h);
    return h;
  };

  Generator.prototype.biomeAt = function (x, z, h) {
    if (h === undefined) h = this.heightAt(x, z);
    var temp = this.nTemp.fbm2(x * 0.0016, z * 0.0016, 3);
    var hum = this.nHum.fbm2(x * 0.0019 + 40, z * 0.0019 - 40, 3);
    if (h < SEA - 1) return BIOME.OCEAN;
    if (h <= SEA + 1) return BIOME.BEACH;
    if (h > SEA + 27) return BIOME.MOUNTAIN;
    if (temp > 0.22 && hum < 0.06) return BIOME.DESERT;
    if (temp < -0.24) return BIOME.SNOWY;
    if (hum > 0.09) return BIOME.FOREST;
    return BIOME.PLAINS;
  };

  /* 洞窟。細いトンネル + 深いところの大空洞 */
  Generator.prototype.isCave = function (x, y, z) {
    if (y < 2 || y > WH - 20) return false;
    var a = this.nCaveA.perlin3(x * 0.045, y * 0.075, z * 0.045);
    var b = this.nCaveB.perlin3(x * 0.045 + 71.3, y * 0.075 + 13.7, z * 0.045 - 44.1);
    if (a * a + b * b < 0.0022) return true;
    if (y < 30) {
      var c = this.nCavern.fbm3(x * 0.028, y * 0.05, z * 0.028, 3);
      if (c > 0.42 - (30 - y) * 0.004) return true;
    }
    return false;
  };

  /* 鉱石と土・砂利の混ざりは「鉱脈」として塊で置く。
     1 ブロックずつ確率で置くと点々になってしまい、マイクラらしくない。 */
  var VEINS = [
    { id: ID.COAL_ORE, n: 15, min: 4, max: 11, yMin: 5, yMax: 54 },
    { id: ID.IRON_ORE, n: 11, min: 3, max: 8, yMin: 3, yMax: 46 },
    { id: ID.GOLD_ORE, n: 3, min: 2, max: 7, yMin: 2, yMax: 28 },
    { id: ID.REDSTONE_ORE, n: 4, min: 3, max: 8, yMin: 2, yMax: 18 },
    { id: ID.DIAMOND_ORE, n: 1, min: 2, max: 6, yMin: 2, yMax: 15, chance: 0.75 },
    { id: ID.EMERALD_ORE, n: 1, min: 1, max: 3, yMin: 2, yMax: 12, chance: 0.3 },
    { id: ID.GRAVEL, n: 3, min: 16, max: 40, yMin: 4, yMax: 50 },
    { id: ID.DIRT, n: 3, min: 16, max: 40, yMin: 4, yMax: 50 }
  ];

  Generator.prototype.veins = function (cx, cz, blocks) {
    var rnd = YC.mulberry32(YC.hash3(cx, cz, this.seed + 4242));
    for (var k = 0; k < VEINS.length; k++) {
      var v = VEINS[k];
      var count = v.n;
      if (v.chance !== undefined && rnd() > v.chance) count = 0;
      for (var i = 0; i < count; i++) {
        var x = (rnd() * CH) | 0, z = (rnd() * CH) | 0;
        var y = v.yMin + ((rnd() * (v.yMax - v.yMin)) | 0);
        var len = v.min + ((rnd() * (v.max - v.min + 1)) | 0);
        for (var s = 0; s < len; s++) {
          if (x >= 0 && x < CH && z >= 0 && z < CH && y > 0 && y < WH) {
            var idx2 = idx(x, y, z);
            if (blocks[idx2] === ID.STONE) blocks[idx2] = v.id;
          }
          /* ランダムウォークで伸ばす（横に広がりやすくする） */
          var d = rnd();
          if (d < 0.34) x += rnd() < 0.5 ? 1 : -1;
          else if (d < 0.68) z += rnd() < 0.5 ? 1 : -1;
          else y += rnd() < 0.5 ? 1 : -1;
        }
      }
    }
  };

  /* チャンク 1 枚分の地形を作る */
  Generator.prototype.generate = function (cx, cz, blocks, heights) {
    var ox = cx * CH, oz = cz * CH;
    blocks.fill(0);
    for (var z = 0; z < CH; z++) {
      for (var x = 0; x < CH; x++) {
        var wx = ox + x, wz = oz + z;
        var h = this.heightAt(wx, wz);
        var biome = this.biomeAt(wx, wz, h);
        var soilDepth = 3 + ((this.nDirt.perlin2(wx * 0.1, wz * 0.1) + 1) * 1.5 | 0);
        var top, soil;
        switch (biome) {
          case BIOME.DESERT: top = ID.SAND; soil = ID.SANDSTONE; break;
          case BIOME.BEACH: top = ID.SAND; soil = ID.SAND; break;
          case BIOME.OCEAN: top = ID.SAND; soil = ID.SAND; break;
          case BIOME.SNOWY: top = ID.SNOW; soil = ID.DIRT; break;
          case BIOME.MOUNTAIN: top = h > SEA + 36 ? ID.SNOW : ID.STONE; soil = ID.STONE; break;
          default: top = ID.GRASS; soil = ID.DIRT;
        }
        for (var y = 0; y <= h; y++) {
          var id;
          if (y === 0) id = ID.BEDROCK;
          else if (y < 3 && YC.rand3(this.seed + 77, wx, y, wz) < 0.6 - y * 0.18) id = ID.BEDROCK;
          else if (y === h) id = top;
          else if (y > h - soilDepth) id = soil;
          else id = ID.STONE;
          if (id !== ID.BEDROCK && y > 0 && y < h && this.isCave(wx, y, wz)) {
            /* 深いところの洞窟の底には溶岩をためる（暗い坑道の灯りになる） */
            id = y <= 8 ? ID.LAVA : 0;
          }
          blocks[idx(x, y, z)] = id;
        }
        /* 海と湖 */
        if (h < SEA) {
          for (var wy = h + 1; wy <= SEA; wy++) blocks[idx(x, wy, z)] = ID.WATER;
          if (biome === BIOME.SNOWY || (biome === BIOME.OCEAN && this.nTemp.fbm2(wx * 0.0016, wz * 0.0016, 3) < -0.24)) {
            blocks[idx(x, SEA, z)] = ID.ICE;
          }
        }
        heights[z * CH + x] = Math.max(h, h < SEA ? SEA : h);
      }
    }
    this.veins(cx, cz, blocks);
    this.decorate(cx, cz, blocks, heights);
    /* 高さマップを作り直す（飾りで背が伸びるため） */
    for (var zz = 0; zz < CH; zz++) {
      for (var xx = 0; xx < CH; xx++) {
        var hy = 0;
        for (var y2 = WH - 1; y2 >= 0; y2--) {
          if (blocks[idx(xx, y2, zz)] !== 0) { hy = y2; break; }
        }
        heights[zz * CH + xx] = hy;
      }
    }
  };

  /* 木・花・サボテンなど。木は隣のチャンクにまたがるので 1 チャンク分外側まで見る */
  Generator.prototype.decorate = function (cx, cz, blocks, heights) {
    var self = this;
    var ox = cx * CH, oz = cz * CH;

    function setLocal(x, y, z, id, replaceHard) {
      if (x < 0 || z < 0 || x >= CH || z >= CH || y < 0 || y >= WH) return;
      var i = idx(x, y, z);
      var cur = blocks[i];
      if (!replaceHard && cur !== 0 && cur !== ID.WATER && !B.isCross(cur) && cur !== ID.OAK_LEAVES &&
        cur !== ID.BIRCH_LEAVES && cur !== ID.SPRUCE_LEAVES) return;
      blocks[i] = id;
    }

    /* --- 木 --- */
    for (var dz = -CH; dz < CH * 2; dz++) {
      for (var dx = -CH; dx < CH * 2; dx++) {
        var wx = ox + dx, wz = oz + dz;
        var r = YC.rand2(this.seed + 131, wx, wz);
        if (r > 0.06) continue;                       /* まず粗くふるいにかける（重いので） */
        var h = this.heightAt(wx, wz);
        var biome = this.biomeAt(wx, wz, h);
        var density;
        switch (biome) {
          case BIOME.FOREST: density = 0.055; break;
          case BIOME.PLAINS: density = 0.006; break;
          case BIOME.SNOWY: density = 0.03; break;
          case BIOME.MOUNTAIN: density = 0.008; break;
          default: density = 0;
        }
        if (r > density) continue;
        if (h <= SEA + 1) continue;
        var rnd = YC.mulberry32(YC.hash3(wx, wz, this.seed + 999));
        var kind = biome === BIOME.SNOWY ? 2 : (rnd() < 0.25 ? 1 : 0);
        this.tree(dx, h + 1, dz, kind, rnd, setLocal);
      }
    }

    /* --- 草花・サボテン・松明のない自然物 --- */
    for (var z = 0; z < CH; z++) {
      for (var x = 0; x < CH; x++) {
        var wx2 = ox + x, wz2 = oz + z;
        var hh = this.heightAt(wx2, wz2);
        if (hh <= SEA) continue;
        var top = blocks[idx(x, hh, z)];
        var above = hh + 1 < WH ? blocks[idx(x, hh + 1, z)] : 0;
        if (above !== 0) continue;
        var bm = this.biomeAt(wx2, wz2, hh);
        var rr = YC.rand2(this.seed + 313, wx2, wz2);
        if (bm === BIOME.DESERT) {
          if (rr < 0.006 && top === ID.SAND) {
            var ch2 = 2 + ((YC.rand2(this.seed + 4, wx2, wz2) * 2) | 0);
            for (var k = 0; k < ch2; k++) setLocal(x, hh + 1 + k, z, ID.CACTUS);
          } else if (rr < 0.012) {
            setLocal(x, hh + 1, z, ID.TALL_GRASS);
          }
        } else if (top === ID.GRASS) {
          if (rr < 0.02) setLocal(x, hh + 1, z, ID.POPPY);
          else if (rr < 0.042) setLocal(x, hh + 1, z, ID.DANDELION);
          else if (rr < 0.20) setLocal(x, hh + 1, z, ID.TALL_GRASS);
          else if (rr < 0.2012) setLocal(x, hh + 1, z, ID.PUMPKIN);
          else if (rr < 0.2022) setLocal(x, hh + 1, z, ID.SAPLING);
        }
      }
    }
  };

  /* 木を 1 本生やす。kind 0=オーク 1=シラカバ 2=トウヒ */
  Generator.prototype.tree = function (x, y, z, kind, rnd, set) {
    var logId = [ID.OAK_LOG, ID.BIRCH_LOG, ID.SPRUCE_LOG][kind];
    var leafId = [ID.OAK_LEAVES, ID.BIRCH_LEAVES, ID.SPRUCE_LEAVES][kind];
    var trunk = kind === 2 ? 7 + ((rnd() * 4) | 0) : (kind === 1 ? 5 + ((rnd() * 3) | 0) : 4 + ((rnd() * 2) | 0));
    var i, dy, dx, dz;
    for (i = 0; i < trunk; i++) set(x, y + i, z, logId, true);

    if (kind === 2) {
      /* トウヒ：円すい形 */
      var layers = trunk - 2;
      for (i = 0; i < layers; i++) {
        var yy = y + trunk - 1 - i;
        var rad = i === 0 ? 0 : Math.min(3, 1 + ((i / 2.2) | 0));
        if (i % 3 === 2) rad = Math.max(0, rad - 1);
        for (dx = -rad; dx <= rad; dx++) {
          for (dz = -rad; dz <= rad; dz++) {
            if (Math.abs(dx) + Math.abs(dz) > rad + 1) continue;
            if (dx === 0 && dz === 0 && yy < y + trunk) continue;
            set(x + dx, yy, z + dz, leafId);
          }
        }
      }
      set(x, y + trunk, z, leafId);
    } else {
      /* オーク・シラカバ：丸い樹冠 */
      var top = y + trunk;
      for (dy = -2; dy <= 1; dy++) {
        var r = dy <= -1 ? 2 : (dy === 0 ? 2 : 1);
        for (dx = -r; dx <= r; dx++) {
          for (dz = -r; dz <= r; dz++) {
            var d = Math.abs(dx) + Math.abs(dz);
            if (d > r + 1) continue;
            if (d === r + 1 && rnd() < 0.5) continue;
            if (dx === 0 && dz === 0 && dy < 1) continue;
            set(x + dx, top + dy, z + dz, leafId);
          }
        }
      }
      set(x, top + 1, z, leafId);
    }
  };

  /* スポーン地点をさがす（陸で、水没していないところ） */
  Generator.prototype.findSpawn = function () {
    for (var r = 0; r < 400; r++) {
      var ang = r * 2.39996;
      var dist = r * 3;
      var x = Math.round(Math.cos(ang) * dist);
      var z = Math.round(Math.sin(ang) * dist);
      var h = this.heightAt(x, z);
      var b = this.biomeAt(x, z, h);
      if (h > SEA + 2 && b !== BIOME.OCEAN && b !== BIOME.MOUNTAIN) {
        return { x: x + 0.5, y: h + 2.2, z: z + 0.5 };
      }
    }
    return { x: 0.5, y: SEA + 4, z: 0.5 };
  };

  YC.Gen = {
    Generator: Generator,
    CH: CH, WH: WH, SEA: SEA,
    BIOME: BIOME, BIOME_JA: BIOME_JA,
    idx: idx
  };
})(typeof window !== 'undefined' ? window : globalThis);
