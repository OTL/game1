/* YoursCraft — チャンク管理・光の計算・メッシュ生成
 *
 * ・1 チャンクは 16 x 96 x 16。縦分割はしない（高さが 96 なので十分速い）
 * ・光は「空の光(skyLight)」と「ブロックの光(blockLight)」を別々に持ち、
 *   頂点属性として渡す。こうすると昼夜が変わってもメッシュを作り直さずに済む
 * ・AO（面の隅の影）付きのスムースライティングで、マイクラの陰影に寄せている
 */
(function (global) {
  'use strict';
  var YC = global.YC || (global.YC = {});
  var B = YC.Blocks, ID = B.ID, G = YC.Gen;
  var CH = G.CH, WH = G.WH;
  var CHM = CH - 1;

  function key(cx, cz) { return cx + ',' + cz; }
  function lidx(x, y, z) { return (y * CH + z) * CH + x; }

  /* ---------------- チャンク ---------------- */
  function Chunk(cx, cz) {
    this.cx = cx; this.cz = cz;
    this.blocks = new Uint8Array(CH * WH * CH);
    this.heights = new Uint8Array(CH * CH);
    this.skyLight = new Uint8Array(CH * WH * CH);
    this.blockLight = new Uint8Array(CH * WH * CH);
    this.hasTerrain = false;
    this.hasLight = false;
    this.meshDirty = true;
    this.lightDirty = true;
    this.edits = null;      /* Map<index, blockId> プレイヤーが変えたところだけ */
    this.gl = null;         /* 描画側が持つバッファ */
    this.maxY = WH - 1;
    this.empty = false;
  }
  Chunk.prototype.get = function (x, y, z) {
    if (y < 0 || y >= WH) return 0;
    return this.blocks[lidx(x, y, z)];
  };

  /* ---------------- ワールド ---------------- */
  function World(seed) {
    this.seed = seed >>> 0;
    this.gen = new G.Generator(this.seed);
    this.chunks = new Map();
    this.dirtySave = false;
    /* 光の計算用の作業バッファ（毎回作らず使いまわす） */
    this.PAD = 6;
    var W = CH + this.PAD * 2;
    this.lw = W;
    this._lb = new Uint8Array(W * W * WH);
    this._ls = new Uint8Array(W * W * WH);
    this._lbl = new Uint8Array(W * W * WH);
    /* 光の幅優先探索用のリングバッファ。同じセルが何度も入るので余裕をもたせる */
    this._queue = new Int32Array(W * W * WH * 2);
    this._qh = 0; this._qt = 0; this._qn = 0;
  }

  World.prototype.chunkAt = function (cx, cz) { return this.chunks.get(key(cx, cz)) || null; };

  World.prototype.ensureChunk = function (cx, cz) {
    var k = key(cx, cz);
    var c = this.chunks.get(k);
    if (!c) { c = new Chunk(cx, cz); this.chunks.set(k, c); }
    return c;
  };

  /* 地形生成（+ セーブされた変更の適用） */
  World.prototype.generateChunk = function (cx, cz) {
    var c = this.ensureChunk(cx, cz);
    if (c.hasTerrain) return c;
    this.gen.generate(cx, cz, c.blocks, c.heights);
    if (c.edits) {
      c.edits.forEach(function (v, i) { c.blocks[i] = v; });
      c.recomputeHeights = true;
    }
    var maxY = 0;
    for (var i = 0; i < c.heights.length; i++) if (c.heights[i] > maxY) maxY = c.heights[i];
    if (c.edits) {
      /* 変更で上に積まれているかもしれないので、編集分も見る */
      c.edits.forEach(function (v, i) {
        var y = (i / (CH * CH)) | 0;
        if (v !== 0 && y > maxY) maxY = y;
      });
    }
    c.maxY = Math.min(WH - 1, maxY + 1);
    c.hasTerrain = true;
    return c;
  };

  World.prototype.getBlock = function (wx, wy, wz) {
    if (wy < 0 || wy >= WH) return 0;
    var cx = wx >> 4, cz = wz >> 4;
    var c = this.chunks.get(key(cx, cz));
    if (!c || !c.hasTerrain) return 0;
    return c.blocks[lidx(wx & CHM, wy, wz & CHM)];
  };

  World.prototype.getLight = function (wx, wy, wz) {
    if (wy < 0 || wy >= WH) return 15;
    var c = this.chunks.get(key(wx >> 4, wz >> 4));
    if (!c || !c.hasLight) return 15;
    var i = lidx(wx & CHM, wy, wz & CHM);
    return Math.max(c.skyLight[i], c.blockLight[i]);
  };

  /* ブロックを置く / 壊す。まわりのチャンクも作り直しの対象にする */
  World.prototype.setBlock = function (wx, wy, wz, id, record) {
    if (wy < 0 || wy >= WH) return false;
    var cx = wx >> 4, cz = wz >> 4;
    var c = this.chunks.get(key(cx, cz));
    if (!c || !c.hasTerrain) return false;
    var lx = wx & CHM, lz = wz & CHM;
    /* ここはチャンク内のローカル座標で引く。ワールド座標の z を渡すと、
       チャンクの外（z が 0〜15 以外）で置く・壊すが別の場所に書かれてしまう。 */
    var i = lidx(lx, wy, lz);
    if (c.blocks[i] === id) return false;
    c.blocks[i] = id;
    if (record !== false) {
      if (!c.edits) c.edits = new Map();
      c.edits.set(i, id);
      this.dirtySave = true;
    }
    if (id !== 0 && wy > c.maxY) c.maxY = Math.min(WH - 1, wy + 1);
    var hi = lz * CH + lx;
    if (id !== 0 && wy > c.heights[hi]) c.heights[hi] = wy;
    else if (id === 0 && wy === c.heights[hi]) {
      var y = wy;
      while (y > 0 && c.blocks[lidx(lx, y, lz)] === 0) y--;
      c.heights[hi] = y;
    }
    /* 光を作り直し、隣のチャンクのメッシュにも影響するので印をつける */
    this.markDirty(cx, cz);
    if (lx === 0) this.markDirty(cx - 1, cz);
    if (lx === CHM) this.markDirty(cx + 1, cz);
    if (lz === 0) this.markDirty(cx, cz - 1);
    if (lz === CHM) this.markDirty(cx, cz + 1);
    if (lx === 0 && lz === 0) this.markDirty(cx - 1, cz - 1);
    if (lx === CHM && lz === 0) this.markDirty(cx + 1, cz - 1);
    if (lx === 0 && lz === CHM) this.markDirty(cx - 1, cz + 1);
    if (lx === CHM && lz === CHM) this.markDirty(cx + 1, cz + 1);
    return true;
  };

  World.prototype.markDirty = function (cx, cz) {
    var c = this.chunks.get(key(cx, cz));
    if (!c) return;
    c.meshDirty = true;
    c.lightDirty = true;
  };

  /* ---------------- 光の計算 ----------------
   * チャンクの外側 PAD ブロック分も含めて計算し、中央部分だけ取り出す。
   * こうすると隣のチャンクの計算順に依存せず、継ぎ目が出にくい。
   */
  World.prototype.computeLight = function (c) {
    var PAD = this.PAD, W = this.lw;
    var blocks = this._lb, sky = this._ls, blk = this._lbl, q = this._queue;
    var ox = c.cx * CH - PAD, oz = c.cz * CH - PAD;
    var x, y, z, i, id;

    /* 1) ブロックを作業バッファへ集める */
    for (z = 0; z < W; z++) {
      for (x = 0; x < W; x++) {
        var wx = ox + x, wz = oz + z;
        var src = this.chunks.get(key(wx >> 4, wz >> 4));
        var sx = wx & CHM, sz = wz & CHM;
        var colBase = (z * W + x);
        if (!src || !src.hasTerrain) {
          for (y = 0; y < WH; y++) blocks[y * W * W + colBase] = 0;
        } else {
          var sb = src.blocks;
          for (y = 0; y < WH; y++) blocks[y * W * W + colBase] = sb[(y * CH + sz) * CH + sx];
        }
      }
    }
    sky.fill(0); blk.fill(0);

    this._qh = 0; this._qt = 0; this._qn = 0;
    var self = this;
    function push(idx2) { self._qpush(idx2); }

    /* 2) 空の光：上から落とす */
    for (z = 0; z < W; z++) {
      for (x = 0; x < W; x++) {
        var level = 15;
        for (y = WH - 1; y >= 0; y--) {
          i = y * W * W + z * W + x;
          id = blocks[i];
          if (B.isOpaque(id)) break;
          if (id === ID.WATER || id === ID.ICE) level = Math.max(0, level - 2);
          sky[i] = level;
          if (level > 0) push(i);
          if (level === 0) break;
        }
      }
    }
    /* 3) 空の光：横方向に広げる */
    this._spread(sky, blocks, W);

    /* 4) ブロックの光：光源から広げる */
    this._qh = 0; this._qt = 0; this._qn = 0;
    for (i = 0; i < blocks.length; i++) {
      var em = B.lightOf(blocks[i]);
      if (em > 0) { blk[i] = em; this._qpush(i); }
    }
    this._spread(blk, blocks, W);

    /* 5) 中央のチャンク分を取り出す */
    var skyOut = c.skyLight, blkOut = c.blockLight;
    for (y = 0; y <= c.maxY + 1 && y < WH; y++) {
      for (z = 0; z < CH; z++) {
        for (x = 0; x < CH; x++) {
          var si = y * W * W + (z + PAD) * W + (x + PAD);
          var di = (y * CH + z) * CH + x;
          skyOut[di] = sky[si];
          blkOut[di] = blk[si];
        }
      }
    }
    /* maxY より上は空の光いっぱい */
    for (y = c.maxY + 2; y < WH; y++) {
      for (z = 0; z < CH; z++) for (x = 0; x < CH; x++) {
        var di2 = (y * CH + z) * CH + x;
        skyOut[di2] = 15; blkOut[di2] = 0;
      }
    }
    c.hasLight = true;
    c.lightDirty = false;
  };

  World.prototype._qpush = function (i) {
    var cap = this._queue.length;
    if (this._qn >= cap) return;           /* 万一あふれたら捨てる（光が少し暗くなるだけ） */
    this._queue[this._qt] = i;
    this._qt = (this._qt + 1) % cap;
    this._qn++;
  };

  /* 幅優先で光を広げる */
  World.prototype._spread = function (light, blocks, W) {
    var WW = W * W;
    var q = this._queue, cap = q.length;
    while (this._qn > 0) {
      var i = q[this._qh];
      this._qh = (this._qh + 1) % cap;
      this._qn--;
      var l = light[i];
      if (l <= 1) continue;
      var y = (i / WW) | 0;
      var r = i - y * WW;
      var z = (r / W) | 0;
      var x = r - z * W;
      for (var d = 0; d < 6; d++) {
        var nx = x, ny = y, nz = z;
        if (d === 0) nx++; else if (d === 1) nx--;
        else if (d === 2) ny++; else if (d === 3) ny--;
        else if (d === 4) nz++; else nz--;
        if (nx < 0 || nz < 0 || nx >= W || nz >= W || ny < 0 || ny >= WH) continue;
        var ni = ny * WW + nz * W + nx;
        var nid = blocks[ni];
        if (B.isOpaque(nid)) continue;
        var dec = 1;
        if (nid === ID.WATER || nid === ID.ICE) dec = 2;
        var nl = l - dec;
        if (nl <= light[ni]) continue;
        light[ni] = nl;
        this._qpush(ni);
      }
    }
  };

  /* ---------------- メッシュ生成 ---------------- */
  /* 面の定義。o=面の原点, u/v=面上の2軸 */
  var FACES = [
    { n: [1, 0, 0], o: [1, 0, 1], u: [0, 0, -1], v: [0, 1, 0], shade: 0.72 },  /* +X */
    { n: [-1, 0, 0], o: [0, 0, 0], u: [0, 0, 1], v: [0, 1, 0], shade: 0.72 },  /* -X */
    { n: [0, 1, 0], o: [0, 1, 1], u: [1, 0, 0], v: [0, 0, -1], shade: 1.0 },   /* +Y */
    { n: [0, -1, 0], o: [0, 0, 0], u: [1, 0, 0], v: [0, 0, 1], shade: 0.5 },   /* -Y */
    { n: [0, 0, 1], o: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], shade: 0.86 },   /* +Z */
    { n: [0, 0, -1], o: [1, 0, 0], u: [-1, 0, 0], v: [0, 1, 0], shade: 0.86 }  /* -Z */
  ];
  var CORNERS = [[0, 0], [1, 0], [1, 1], [0, 1]];

  var VSTRIDE = 20; /* 1 頂点 20 バイト */

  function MeshBuf(maxVerts) {
    this.ab = new ArrayBuffer(maxVerts * VSTRIDE);
    this.f32 = new Float32Array(this.ab);
    this.u16 = new Uint16Array(this.ab);
    this.u8 = new Uint8Array(this.ab);
    this.idx = new Uint32Array(maxVerts * 3);
    this.nv = 0;
    this.ni = 0;
  }
  MeshBuf.prototype.reset = function () { this.nv = 0; this.ni = 0; };
  MeshBuf.prototype.vert = function (x, y, z, tile, u, v, skyL, blkL, shade, wave) {
    var n = this.nv;
    var f = n * 5;
    this.f32[f] = x; this.f32[f + 1] = y; this.f32[f + 2] = z;
    this.u16[n * 10 + 6] = tile;
    var b = n * VSTRIDE;
    this.u8[b + 14] = u ? 255 : 0;
    this.u8[b + 15] = v ? 255 : 0;
    this.u8[b + 16] = skyL;
    this.u8[b + 17] = blkL;
    this.u8[b + 18] = shade;
    this.u8[b + 19] = wave ? 255 : 0;
    this.nv++;
    return n;
  };
  MeshBuf.prototype.quad = function (a, flip) {
    var ix = this.idx, n = this.ni;
    if (flip) {
      ix[n] = a + 1; ix[n + 1] = a + 2; ix[n + 2] = a + 3;
      ix[n + 3] = a + 1; ix[n + 4] = a + 3; ix[n + 5] = a;
    } else {
      ix[n] = a; ix[n + 1] = a + 1; ix[n + 2] = a + 2;
      ix[n + 3] = a; ix[n + 4] = a + 2; ix[n + 5] = a + 3;
    }
    this.ni += 6;
  };
  MeshBuf.prototype.take = function () {
    if (this.nv === 0) return null;
    return {
      verts: new Uint8Array(this.ab.slice(0, this.nv * VSTRIDE)),
      idx: this.idx.slice(0, this.ni),
      count: this.ni
    };
  };

  var bufs = null;
  function getBufs() {
    if (!bufs) {
      bufs = { opaque: new MeshBuf(120000), cutout: new MeshBuf(60000), trans: new MeshBuf(40000) };
    }
    return bufs;
  }

  /* 隣のブロックから見て、この面を描く必要があるか */
  function faceVisible(self, other) {
    if (other === 0) return true;
    var bo = B.list[other];
    if (!bo) return true;
    if (bo.render === 'cross') return true;
    if (self === other) return false;              /* ガラス同士・葉同士は内側を省く */
    if (self === ID.WATER && bo.render === 'liquid') return false;
    if (!bo.opaque) return true;
    return false;
  }

  World.prototype.buildMesh = function (c) {
    var bs = getBufs();
    bs.opaque.reset(); bs.cutout.reset(); bs.trans.reset();
    var blocks = c.blocks;
    var ox = c.cx * CH, oz = c.cz * CH;
    var self = this;
    var maxY = Math.min(WH - 1, c.maxY + 1);

    /* 隣接チャンクを手元に取っておく（境界のブロック参照が速くなる） */
    var nb = {};
    for (var dx = -1; dx <= 1; dx++) for (var dz = -1; dz <= 1; dz++) {
      nb[dx + ',' + dz] = this.chunks.get(key(c.cx + dx, c.cz + dz)) || null;
    }
    function blockAt(x, y, z) { /* チャンク内ローカル座標（範囲外は隣から） */
      if (y < 0 || y >= WH) return 0;
      if (x >= 0 && x < CH && z >= 0 && z < CH) return blocks[(y * CH + z) * CH + x];
      var ccx = x < 0 ? -1 : (x >= CH ? 1 : 0);
      var ccz = z < 0 ? -1 : (z >= CH ? 1 : 0);
      var n = nb[ccx + ',' + ccz];
      if (!n || !n.hasTerrain) return 0;
      return n.blocks[(y * CH + (z & CHM)) * CH + (x & CHM)];
    }
    function lightAt(x, y, z) {
      if (y < 0) return 0;
      if (y >= WH) return 0xF0;
      var n, lx, lz;
      if (x >= 0 && x < CH && z >= 0 && z < CH) { n = c; lx = x; lz = z; }
      else {
        var ccx = x < 0 ? -1 : (x >= CH ? 1 : 0);
        var ccz = z < 0 ? -1 : (z >= CH ? 1 : 0);
        n = nb[ccx + ',' + ccz];
        lx = x & CHM; lz = z & CHM;
      }
      if (!n || !n.hasLight) return 0xF0;
      var i = (y * CH + lz) * CH + lx;
      return (n.skyLight[i] << 4) | n.blockLight[i];
    }

    var x, y, z, d, k;
    for (y = 0; y <= maxY; y++) {
      for (z = 0; z < CH; z++) {
        for (x = 0; x < CH; x++) {
          var id = blocks[(y * CH + z) * CH + x];
          if (id === 0) continue;
          var def = B.list[id];
          if (!def) continue;

          if (def.render === 'cross') {
            var lgt = lightAt(x, y, z);
            this._cross(bs.cutout, ox + x, y, oz + z, def.faces[0], lgt);
            continue;
          }

          var isWater = id === ID.WATER;
          var isLiquid = def.render === 'liquid';
          var buf = (id === ID.WATER || id === ID.ICE) ? bs.trans : (def.opaque ? bs.opaque : bs.cutout);
          var topCut = isLiquid && blockAt(x, y + 1, z) !== id ? 0.875 : 1;

          for (d = 0; d < 6; d++) {
            var f = FACES[d];
            var nxl = x + f.n[0], nyl = y + f.n[1], nzl = z + f.n[2];
            var other = blockAt(nxl, nyl, nzl);
            if (!faceVisible(id, other)) continue;
            if (isLiquid && d === 3 && other !== 0 && !B.isCross(other)) continue;

            var tile = def.faces[d];
            var nl = lightAt(nxl, nyl, nzl);
            var baseIdx = buf.nv;
            var ao = [0, 0, 0, 0];
            for (k = 0; k < 4; k++) {
              var cu = CORNERS[k][0], cv = CORNERS[k][1];
              var su = cu ? 1 : -1, sv = cv ? 1 : -1;
              var s1x = nxl + f.u[0] * su, s1y = nyl + f.u[1] * su, s1z = nzl + f.u[2] * su;
              var s2x = nxl + f.v[0] * sv, s2y = nyl + f.v[1] * sv, s2z = nzl + f.v[2] * sv;
              var cxx = s1x + f.v[0] * sv, cyy = s1y + f.v[1] * sv, czz = s1z + f.v[2] * sv;
              var o1 = B.isOpaque(blockAt(s1x, s1y, s1z));
              var o2 = B.isOpaque(blockAt(s2x, s2y, s2z));
              var oc = B.isOpaque(blockAt(cxx, cyy, czz));
              var aov = (o1 && o2) ? 0 : 3 - ((o1 ? 1 : 0) + (o2 ? 1 : 0) + (oc ? 1 : 0));
              ao[k] = aov;

              /* 隅ごとに 4 セルの光を平均（スムースライティング） */
              var sSum = nl >> 4, bSum = nl & 15, cnt = 1;
              if (!o1) { var l1 = lightAt(s1x, s1y, s1z); sSum += l1 >> 4; bSum += l1 & 15; cnt++; }
              if (!o2) { var l2 = lightAt(s2x, s2y, s2z); sSum += l2 >> 4; bSum += l2 & 15; cnt++; }
              if (!oc && !(o1 && o2)) { var l3 = lightAt(cxx, cyy, czz); sSum += l3 >> 4; bSum += l3 & 15; cnt++; }
              var skyL = (sSum / cnt) * 17;
              var blkL = (bSum / cnt) * 17;

              var aoMul = [0.5, 0.68, 0.84, 1.0][aov];
              var shade = f.shade * aoMul * 255;

              var px = ox + x + f.o[0] + f.u[0] * cu + f.v[0] * cv;
              var py = y + f.o[1] + f.u[1] * cu + f.v[1] * cv;
              var pz = oz + z + f.o[2] + f.u[2] * cu + f.v[2] * cv;
              if (isLiquid && topCut < 1 && py > y + 0.5) py = y + topCut;
              buf.vert(px, py, pz, tile, cu, 1 - cv, skyL, blkL, shade, isWater);
            }
            buf.quad(baseIdx, ao[0] + ao[2] > ao[1] + ao[3]);
          }
        }
      }
    }

    c.meshData = {
      opaque: bs.opaque.take(),
      cutout: bs.cutout.take(),
      trans: bs.trans.take()
    };
    c.meshDirty = false;
    c.empty = !c.meshData.opaque && !c.meshData.cutout && !c.meshData.trans;
    return c.meshData;
  };

  /* 花や草の十字スプライト。裏からも見えるように両面ぶん出す */
  World.prototype._cross = function (buf, wx, y, wz, tile, lgt) {
    var skyL = (lgt >> 4) * 17, blkL = (lgt & 15) * 17;
    var shade = 0.98 * 255;
    var a = 0.1465, b2 = 0.8535;
    var quads = [
      [[a, 0, a], [b2, 0, b2]],
      [[a, 0, b2], [b2, 0, a]]
    ];
    for (var qi = 0; qi < 2; qi++) {
      var p0 = quads[qi][0], p1 = quads[qi][1];
      for (var side = 0; side < 2; side++) {
        var s = side === 0 ? 0 : 1;
        var base = buf.nv;
        var A = s ? p1 : p0, Bp = s ? p0 : p1;
        buf.vert(wx + A[0], y, wz + A[2], tile, 0, 1, skyL, blkL, shade, 0);
        buf.vert(wx + Bp[0], y, wz + Bp[2], tile, 1, 1, skyL, blkL, shade, 0);
        buf.vert(wx + Bp[0], y + 1, wz + Bp[2], tile, 1, 0, skyL, blkL, shade, 0);
        buf.vert(wx + A[0], y + 1, wz + A[2], tile, 0, 0, skyL, blkL, shade, 0);
        buf.quad(base, false);
      }
    }
  };

  /* ---------------- 視線のレイキャスト（見ているブロックを探す） ---------------- */
  World.prototype.raycast = function (ox, oy, oz, dx, dy, dz, maxDist, wantLiquid) {
    var x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    var stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    var tDeltaX = dx === 0 ? Infinity : Math.abs(1 / dx);
    var tDeltaY = dy === 0 ? Infinity : Math.abs(1 / dy);
    var tDeltaZ = dz === 0 ? Infinity : Math.abs(1 / dz);
    var tMaxX = dx === 0 ? Infinity : ((dx > 0 ? (x + 1 - ox) : (ox - x)) / Math.abs(dx));
    var tMaxY = dy === 0 ? Infinity : ((dy > 0 ? (y + 1 - oy) : (oy - y)) / Math.abs(dy));
    var tMaxZ = dz === 0 ? Infinity : ((dz > 0 ? (z + 1 - oz) : (oz - z)) / Math.abs(dz));
    var face = [0, 0, 0];
    var t = 0;
    for (var step = 0; step < 256; step++) {
      var id = this.getBlock(x, y, z);
      if (id !== 0) {
        var def = B.list[id];
        var pass = def && def.render === 'liquid' && !wantLiquid;
        if (!pass) {
          return { x: x, y: y, z: z, id: id, nx: face[0], ny: face[1], nz: face[2], dist: t };
        }
      }
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        t = tMaxX; if (t > maxDist) break;
        x += stepX; tMaxX += tDeltaX; face = [-stepX, 0, 0];
      } else if (tMaxY < tMaxZ) {
        t = tMaxY; if (t > maxDist) break;
        y += stepY; tMaxY += tDeltaY; face = [0, -stepY, 0];
      } else {
        t = tMaxZ; if (t > maxDist) break;
        z += stepZ; tMaxZ += tDeltaZ; face = [0, 0, -stepZ];
      }
      if (y < 0 || y >= WH) break;
    }
    return null;
  };

  YC.MeshBuf = MeshBuf;
  YC.World = World;
  YC.Chunk = Chunk;
  YC.chunkKey = key;
  YC.VSTRIDE = VSTRIDE;
})(typeof window !== 'undefined' ? window : globalThis);
