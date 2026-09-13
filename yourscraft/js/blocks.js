/* YoursCraft — ブロック定義とテクスチャ生成
 * 画像ファイルは一切使わず、16x16 のドット絵をコードで描いて
 * WebGL の 2D 配列テクスチャ（1 ブロック面 = 1 レイヤー）に積む。
 */
(function (global) {
  'use strict';
  var YC = global.YC || (global.YC = {});
  var mulberry32 = YC.mulberry32;

  var TS = 16; /* テクスチャ 1 枚の辺 */

  /* ---------- ピクセル描画のちいさなヘルパ ---------- */
  function Px() { this.d = new Uint8ClampedArray(TS * TS * 4); }
  Px.prototype.set = function (x, y, r, g, b, a) {
    if (x < 0 || y < 0 || x >= TS || y >= TS) return;
    var i = ((y | 0) * TS + (x | 0)) * 4;
    this.d[i] = r; this.d[i + 1] = g; this.d[i + 2] = b; this.d[i + 3] = a === undefined ? 255 : a;
  };
  Px.prototype.get = function (x, y) {
    var i = ((y | 0) * TS + (x | 0)) * 4;
    return [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]];
  };
  Px.prototype.blend = function (x, y, r, g, b, a) {
    if (x < 0 || y < 0 || x >= TS || y >= TS) return;
    var i = ((y | 0) * TS + (x | 0)) * 4;
    var s = a;
    this.d[i] = this.d[i] * (1 - s) + r * s;
    this.d[i + 1] = this.d[i + 1] * (1 - s) + g * s;
    this.d[i + 2] = this.d[i + 2] * (1 - s) + b * s;
    this.d[i + 3] = Math.max(this.d[i + 3], 255 * s);
  };

  function hex(c) {
    return [parseInt(c.substr(1, 2), 16), parseInt(c.substr(3, 2), 16), parseInt(c.substr(5, 2), 16)];
  }
  /* 単色 + ざらつき。マイクラのテクスチャはどれもこの「下地 + ノイズ」が基本 */
  function grain(px, color, amount, rnd, alpha) {
    var c = hex(color);
    for (var y = 0; y < TS; y++) {
      for (var x = 0; x < TS; x++) {
        var v = (rnd() - 0.5) * 2 * amount;
        px.set(x, y, c[0] + v, c[1] + v, c[2] + v, alpha === undefined ? 255 : alpha);
      }
    }
  }
  /* まばらな点。石炭や花のような「粒」の表現 */
  function speck(px, color, count, rnd, size) {
    var c = hex(color);
    size = size || 1;
    for (var i = 0; i < count; i++) {
      var x = (rnd() * TS) | 0, y = (rnd() * TS) | 0;
      for (var dy = 0; dy < size; dy++) {
        for (var dx = 0; dx < size; dx++) {
          var v = (rnd() - 0.5) * 20;
          px.set(x + dx, y + dy, c[0] + v, c[1] + v, c[2] + v, 255);
        }
      }
    }
  }
  function rect(px, x0, y0, w, h, color, jitter, rnd) {
    var c = hex(color);
    for (var y = y0; y < y0 + h; y++) {
      for (var x = x0; x < x0 + w; x++) {
        var v = jitter ? (rnd() - 0.5) * jitter : 0;
        px.set(x, y, c[0] + v, c[1] + v, c[2] + v, 255);
      }
    }
  }
  function line(px, x0, y0, x1, y1, color) {
    var c = hex(color);
    var dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    var sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    var err = dx - dy;
    for (;;) {
      px.set(x0, y0, c[0], c[1], c[2], 255);
      if (x0 === x1 && y0 === y1) break;
      var e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
  }

  /* ---------- テクスチャ一覧 ---------- */
  /* 名前 → 描画関数。順番がそのままテクスチャ配列のレイヤー番号になる */
  var TEX = {};
  function def(name, fn) { TEX[name] = fn; }

  def('grass_top', function (px, rnd) {
    grain(px, '#8ab259', 20, rnd);
    speck(px, '#7ba449', 40, rnd);
    speck(px, '#98c168', 34, rnd);
    speck(px, '#6d9440', 22, rnd);
  });
  def('dirt', function (px, rnd) {
    grain(px, '#8a6240', 20, rnd);
    speck(px, '#7a5435', 30, rnd);
    speck(px, '#9a7150', 22, rnd);
  });
  def('grass_side', function (px, rnd) {
    grain(px, '#8a6240', 20, rnd);
    speck(px, '#7a5435', 26, rnd);
    /* 上辺に草をかぶせる。ふちをギザギザにするのが肝 */
    for (var x = 0; x < TS; x++) {
      var h = 3 + ((rnd() * 3) | 0);
      for (var y = 0; y < h; y++) {
        var c = hex(rnd() < 0.5 ? '#8ab259' : '#6d9440');
        var v = (rnd() - 0.5) * 18;
        px.set(x, y, c[0] + v, c[1] + v, c[2] + v, 255);
      }
    }
  });
  def('stone', function (px, rnd) {
    grain(px, '#7f7f7f', 14, rnd);
    speck(px, '#6e6e6e', 26, rnd, 2);
    speck(px, '#8d8d8d', 20, rnd, 2);
  });
  def('cobblestone', function (px, rnd) {
    grain(px, '#6f6f6f', 10, rnd);
    /* 丸石らしい石ころのかたまりを置く */
    var blobs = [[1, 1, 5, 4], [8, 0, 6, 5], [0, 6, 4, 5], [5, 6, 5, 4], [11, 6, 5, 5], [2, 12, 6, 4], [9, 12, 6, 4]];
    for (var i = 0; i < blobs.length; i++) {
      var b = blobs[i];
      var base = rnd() < 0.5 ? '#8a8a8a' : '#979797';
      rect(px, b[0], b[1], b[2], b[3], base, 22, rnd);
      for (var x = b[0]; x < b[0] + b[2]; x++) px.blend(x, b[1] + b[3] - 1, 60, 60, 60, 0.45);
      for (var y = b[1]; y < b[1] + b[3]; y++) px.blend(b[0] + b[2] - 1, y, 60, 60, 60, 0.35);
    }
  });
  def('mossy_cobblestone', function (px, rnd) {
    TEX.cobblestone(px, rnd);
    for (var i = 0; i < 90; i++) {
      var x = (rnd() * TS) | 0, y = (rnd() * TS) | 0;
      px.blend(x, y, 90, 130, 60, 0.55);
    }
  });
  def('stone_bricks', function (px, rnd) {
    grain(px, '#7b7b7b', 12, rnd);
    var c = '#6a6a6a';
    rect(px, 0, 7, TS, 1, c, 8, rnd);
    rect(px, 0, 15, TS, 1, c, 8, rnd);
    rect(px, 7, 0, 1, 8, c, 8, rnd);
    rect(px, 3, 8, 1, 8, c, 8, rnd);
    rect(px, 11, 8, 1, 8, c, 8, rnd);
    speck(px, '#8b8b8b', 18, rnd);
  });
  def('sand', function (px, rnd) {
    grain(px, '#dcd0a0', 12, rnd);
    speck(px, '#cfc08c', 40, rnd);
    speck(px, '#e8dcb0', 24, rnd);
  });
  def('sandstone_top', function (px, rnd) {
    grain(px, '#e0d6a8', 10, rnd);
    speck(px, '#d3c896', 30, rnd);
  });
  def('sandstone_side', function (px, rnd) {
    grain(px, '#ded4a4', 8, rnd);
    rect(px, 0, 0, TS, 4, '#e6ddb2', 10, rnd);
    rect(px, 0, 4, TS, 1, '#c9bd8a', 6, rnd);
    for (var i = 0; i < 40; i++) {
      var x = (rnd() * TS) | 0, y = 5 + ((rnd() * 11) | 0);
      px.blend(x, y, 195, 182, 132, 0.6);
    }
  });
  def('gravel', function (px, rnd) {
    grain(px, '#8b8481', 16, rnd);
    speck(px, '#6f6763', 40, rnd, 2);
    speck(px, '#a39c98', 30, rnd, 2);
    speck(px, '#5d5754', 20, rnd);
  });
  def('oak_log_side', function (px, rnd) {
    grain(px, '#6b5334', 14, rnd);
    for (var x = 0; x < TS; x++) {
      if (rnd() < 0.45) {
        var col = rnd() < 0.5 ? '#5a4529' : '#7b6140';
        line(px, x, 0, x, TS - 1, col);
      }
    }
    speck(px, '#4c3a22', 26, rnd);
  });
  def('oak_log_top', function (px, rnd) {
    grain(px, '#b08a4f', 12, rnd);
    var cx = 8, cy = 8;
    for (var y = 0; y < TS; y++) {
      for (var x = 0; x < TS; x++) {
        var r = Math.sqrt((x - cx + 0.5) * (x - cx + 0.5) + (y - cy + 0.5) * (y - cy + 0.5));
        if ((r | 0) % 3 === 0) px.blend(x, y, 140, 108, 60, 0.6);
        if (r > 7.2) px.blend(x, y, 90, 68, 40, 0.7);
      }
    }
  });
  def('birch_log_side', function (px, rnd) {
    grain(px, '#d7d2c4', 10, rnd);
    for (var i = 0; i < 7; i++) {
      var y = (rnd() * TS) | 0, w = 2 + ((rnd() * 5) | 0), x = (rnd() * (TS - w)) | 0;
      rect(px, x, y, w, 1, '#4b4740', 10, rnd);
    }
    speck(px, '#bdb8ab', 26, rnd);
  });
  def('birch_log_top', function (px, rnd) {
    grain(px, '#c8b184', 10, rnd);
    for (var y = 0; y < TS; y++) for (var x = 0; x < TS; x++) {
      var r = Math.sqrt((x - 7.5) * (x - 7.5) + (y - 7.5) * (y - 7.5));
      if ((r | 0) % 3 === 0) px.blend(x, y, 160, 138, 100, 0.5);
      if (r > 7.2) px.blend(x, y, 215, 210, 196, 0.85);
    }
  });
  def('spruce_log_side', function (px, rnd) {
    grain(px, '#4b3520', 12, rnd);
    for (var x = 0; x < TS; x++) if (rnd() < 0.45) line(px, x, 0, x, TS - 1, rnd() < 0.5 ? '#3c2a19' : '#5a4028');
    speck(px, '#31220f', 20, rnd);
  });
  def('spruce_log_top', function (px, rnd) {
    grain(px, '#8a6c44', 12, rnd);
    for (var y = 0; y < TS; y++) for (var x = 0; x < TS; x++) {
      var r = Math.sqrt((x - 7.5) * (x - 7.5) + (y - 7.5) * (y - 7.5));
      if ((r | 0) % 3 === 0) px.blend(x, y, 110, 86, 54, 0.6);
      if (r > 7.2) px.blend(x, y, 70, 50, 30, 0.8);
    }
  });
  /* 葉は「穴あき」なのが見た目の決め手。アルファを抜く */
  function leaves(base, dark, light) {
    return function (px, rnd) {
      grain(px, base, 20, rnd);
      speck(px, dark, 60, rnd);
      speck(px, light, 40, rnd);
      for (var y = 0; y < TS; y++) {
        for (var x = 0; x < TS; x++) {
          if (rnd() < 0.16) px.set(x, y, 0, 0, 0, 0);
        }
      }
    };
  }
  def('oak_leaves', leaves('#4b7a26', '#35591a', '#619535'));
  def('birch_leaves', leaves('#5f8f28', '#47701a', '#77a83f'));
  def('spruce_leaves', leaves('#2f5a26', '#20421a', '#417033'));
  function planks(base, dark, light) {
    return function (px, rnd) {
      grain(px, base, 10, rnd);
      for (var y = 0; y < TS; y++) {
        if (y % 4 === 3) rect(px, 0, y, TS, 1, dark, 8, rnd);
      }
      for (var i = 0; i < 26; i++) {
        var x = (rnd() * TS) | 0, y2 = (rnd() * TS) | 0;
        px.blend(x, y2, hex(light)[0], hex(light)[1], hex(light)[2], 0.5);
      }
      /* 板の継ぎ目を縦にも入れる */
      rect(px, 5, 0, 1, 3, dark, 6, rnd);
      rect(px, 11, 4, 1, 3, dark, 6, rnd);
      rect(px, 3, 8, 1, 3, dark, 6, rnd);
      rect(px, 9, 12, 1, 3, dark, 6, rnd);
    };
  }
  def('oak_planks', planks('#b08b52', '#8a6a3b', '#c4a06a'));
  def('birch_planks', planks('#d5c58e', '#b3a06a', '#e3d6a8'));
  def('spruce_planks', planks('#7a5b38', '#5e4526', '#8e6d47'));
  def('water', function (px, rnd) {
    grain(px, '#2f63d8', 10, rnd, 200);
    for (var i = 0; i < 40; i++) {
      var x = (rnd() * TS) | 0, y = (rnd() * TS) | 0;
      px.blend(x, y, 120, 170, 255, 0.35);
    }
  });
  def('lava', function (px, rnd) {
    grain(px, '#d4530f', 16, rnd);
    for (var i = 0; i < 26; i++) {
      var x = (rnd() * TS) | 0, y = (rnd() * TS) | 0, s = 1 + ((rnd() * 3) | 0);
      rect(px, x, y, s, s, rnd() < 0.6 ? '#ff9b2a' : '#ffd24a', 20, rnd);
    }
    speck(px, '#8e2f06', 30, rnd);
  });
  def('glass', function (px, rnd) {
    for (var y = 0; y < TS; y++) for (var x = 0; x < TS; x++) px.set(x, y, 0, 0, 0, 0);
    /* 枠とハイライトだけ描いて、あとは透明 */
    for (var i = 0; i < TS; i++) {
      px.set(i, 0, 214, 236, 245, 235); px.set(i, 15, 190, 214, 226, 235);
      px.set(0, i, 214, 236, 245, 235); px.set(15, i, 190, 214, 226, 235);
    }
    line(px, 3, 11, 10, 4, '#ffffff');
    line(px, 4, 11, 11, 4, '#eaf6ff');
    for (var k = 0; k < 28; k++) {
      var x2 = (rnd() * TS) | 0, y2 = (rnd() * TS) | 0;
      px.set(x2, y2, 230, 244, 250, 70);
    }
  });
  def('bricks', function (px, rnd) {
    grain(px, '#b7b2ab', 8, rnd);  /* モルタル */
    var rows = [0, 4, 8, 12];
    for (var r = 0; r < rows.length; r++) {
      var off = (r % 2) ? 4 : 0;
      for (var bx = -8; bx < TS; bx += 8) {
        rect(px, bx + off, rows[r], 7, 3, '#96604a', 18, rnd);
      }
    }
  });
  def('snow', function (px, rnd) {
    grain(px, '#f2fafc', 6, rnd);
    speck(px, '#e4eff4', 30, rnd);
    speck(px, '#ffffff', 26, rnd);
  });
  def('ice', function (px, rnd) {
    grain(px, '#8ec5f2', 12, rnd, 225);
    for (var i = 0; i < 6; i++) {
      line(px, (rnd() * TS) | 0, 0, (rnd() * TS) | 0, TS - 1, '#c3e2fb');
    }
    speck(px, '#a9d5f7', 24, rnd);
  });
  def('bedrock', function (px, rnd) {
    grain(px, '#575757', 12, rnd);
    speck(px, '#2f2f2f', 44, rnd, 2);
    speck(px, '#7a7a7a', 34, rnd, 2);
    speck(px, '#111111', 20, rnd);
  });
  function ore(color, dark) {
    return function (px, rnd) {
      TEX.stone(px, rnd);
      var blobs = 5 + ((rnd() * 3) | 0);
      for (var i = 0; i < blobs; i++) {
        var x = 1 + ((rnd() * 12) | 0), y = 1 + ((rnd() * 12) | 0);
        var w = 2 + ((rnd() * 2) | 0), h = 2 + ((rnd() * 2) | 0);
        rect(px, x, y, w, h, color, 26, rnd);
        for (var xx = x; xx < x + w; xx++) px.blend(xx, y + h - 1, hex(dark)[0], hex(dark)[1], hex(dark)[2], 0.6);
      }
    };
  }
  def('coal_ore', ore('#2b2b2b', '#101010'));
  def('iron_ore', ore('#d8a184', '#a06e50'));
  def('gold_ore', ore('#fcee4b', '#c2a319'));
  def('diamond_ore', ore('#5cdbe6', '#2b93a5'));
  def('redstone_ore', ore('#e02b2b', '#8c1010'));
  def('emerald_ore', ore('#33d16a', '#149141'));
  def('obsidian', function (px, rnd) {
    grain(px, '#17131f', 10, rnd);
    speck(px, '#2b2140', 40, rnd);
    speck(px, '#0a0810', 30, rnd);
    speck(px, '#4a3a6b', 12, rnd);
  });
  def('glowstone', function (px, rnd) {
    grain(px, '#b58330', 14, rnd);
    for (var i = 0; i < 26; i++) {
      var x = (rnd() * TS) | 0, y = (rnd() * TS) | 0, s = 1 + ((rnd() * 2) | 0);
      rect(px, x, y, s, s, rnd() < 0.5 ? '#ffe9a0' : '#ffcf62', 20, rnd);
    }
  });
  def('sea_lantern', function (px, rnd) {
    grain(px, '#9fd3c7', 10, rnd);
    var pat = [[2, 2], [11, 2], [2, 11], [11, 11], [6, 6]];
    for (var i = 0; i < pat.length; i++) rect(px, pat[i][0], pat[i][1], 3, 3, '#eafbf6', 12, rnd);
    speck(px, '#7fb9ad', 22, rnd);
  });
  def('bookshelf', function (px, rnd) {
    TEX.oak_planks(px, rnd);
    rect(px, 0, 3, TS, 5, '#4a3520', 10, rnd);
    rect(px, 0, 9, TS, 5, '#4a3520', 10, rnd);
    var cols = ['#b23c3c', '#3c62b2', '#b2a03c', '#3ca05c', '#8a3cb2', '#c06a2a'];
    for (var r = 0; r < 2; r++) {
      var y = r === 0 ? 3 : 9;
      var x = 0;
      while (x < TS) {
        var w = 1 + ((rnd() * 2) | 0);
        rect(px, x, y, w, 5, cols[(rnd() * cols.length) | 0], 16, rnd);
        x += w + 1;
      }
    }
  });
  def('crafting_table_top', function (px, rnd) {
    TEX.oak_planks(px, rnd);
    rect(px, 0, 0, TS, 2, '#6b5130', 10, rnd);
    for (var i = 0; i <= 3; i++) {
      rect(px, 2 + i * 4, 3, 1, 12, '#6b5130', 8, rnd);
      rect(px, 2, 3 + i * 4, 12, 1, '#6b5130', 8, rnd);
    }
  });
  def('crafting_table_side', function (px, rnd) {
    TEX.oak_planks(px, rnd);
    rect(px, 1, 4, 5, 4, '#8a6a3b', 12, rnd);
    line(px, 9, 5, 12, 5, '#d9d9d9');
    line(px, 11, 6, 11, 10, '#8a6a3b');
  });
  def('pumpkin_side', function (px, rnd) {
    grain(px, '#c4721b', 10, rnd);
    for (var x = 0; x < TS; x += 3) rect(px, x, 0, 1, TS, '#9e5710', 10, rnd);
    speck(px, '#d98a2c', 24, rnd);
  });
  def('pumpkin_top', function (px, rnd) {
    grain(px, '#c4721b', 10, rnd);
    for (var y = 0; y < TS; y++) for (var x = 0; x < TS; x++) {
      var r = Math.sqrt((x - 7.5) * (x - 7.5) + (y - 7.5) * (y - 7.5));
      if ((r | 0) % 4 === 0) px.blend(x, y, 150, 85, 16, 0.5);
    }
    rect(px, 6, 6, 4, 4, '#7a5a28', 14, rnd);
  });
  def('cactus_side', function (px, rnd) {
    grain(px, '#4f7f36', 12, rnd);
    rect(px, 0, 0, 1, TS, '#3d6628', 8, rnd);
    rect(px, 15, 0, 1, TS, '#3d6628', 8, rnd);
    for (var i = 0; i < 16; i++) {
      var x = 2 + ((rnd() * 12) | 0), y = (rnd() * TS) | 0;
      px.set(x, y, 220, 230, 200, 255);
    }
  });
  def('cactus_top', function (px, rnd) {
    grain(px, '#5f8f3e', 10, rnd);
    rect(px, 5, 5, 6, 6, '#74a44e', 12, rnd);
  });
  def('tnt_side', function (px, rnd) {
    grain(px, '#b33b34', 12, rnd);
    rect(px, 0, 5, TS, 6, '#f2f2f2', 8, rnd);
    /* TNT の文字をドットで */
    var glyphs = [
      [[0, 0], [1, 0], [2, 0], [1, 1], [1, 2], [1, 3]],
      [[0, 0], [0, 1], [0, 2], [0, 3], [1, 1], [2, 0], [2, 1], [2, 2], [2, 3]],
      [[0, 0], [1, 0], [2, 0], [1, 1], [1, 2], [1, 3]]
    ];
    for (var g = 0; g < 3; g++) {
      var ox = 2 + g * 4, oy = 6;
      for (var i = 0; i < glyphs[g].length; i++) {
        px.set(ox + glyphs[g][i][0], oy + glyphs[g][i][1], 30, 30, 30, 255);
      }
    }
    rect(px, 0, 0, TS, 1, '#8f2b25', 8, rnd);
    rect(px, 0, 15, TS, 1, '#8f2b25', 8, rnd);
  });
  def('tnt_top', function (px, rnd) {
    grain(px, '#b33b34', 12, rnd);
    rect(px, 3, 3, 10, 10, '#9c2f29', 10, rnd);
    rect(px, 6, 6, 4, 4, '#f2f2f2', 8, rnd);
  });
  def('clay', function (px, rnd) {
    grain(px, '#a4a7b6', 10, rnd);
    speck(px, '#9498a8', 28, rnd, 2);
  });
  def('terracotta', function (px, rnd) {
    grain(px, '#985e43', 12, rnd);
    speck(px, '#8a5238', 30, rnd, 2);
    speck(px, '#a86d50', 20, rnd);
  });
  def('quartz', function (px, rnd) {
    grain(px, '#eceae2', 6, rnd);
    speck(px, '#e0ddd2', 30, rnd, 2);
    speck(px, '#f8f7f2', 20, rnd);
  });
  def('gold_block', function (px, rnd) {
    grain(px, '#f7d33f', 10, rnd);
    rect(px, 0, 0, TS, 1, '#fff0a0', 6, rnd);
    rect(px, 0, 15, TS, 1, '#c9a41c', 6, rnd);
    speck(px, '#ffeb8a', 20, rnd, 2);
  });
  def('iron_block', function (px, rnd) {
    grain(px, '#d7d7d7', 8, rnd);
    rect(px, 0, 0, TS, 1, '#f0f0f0', 6, rnd);
    rect(px, 0, 15, TS, 1, '#b0b0b0', 6, rnd);
    speck(px, '#c4c4c4', 22, rnd, 2);
  });
  def('diamond_block', function (px, rnd) {
    grain(px, '#63e0d5', 10, rnd);
    var gems = [[3, 3], [10, 3], [3, 10], [10, 10], [6, 6]];
    for (var i = 0; i < gems.length; i++) {
      rect(px, gems[i][0], gems[i][1], 3, 3, '#bdf6f0', 10, rnd);
      px.blend(gems[i][0] + 2, gems[i][1] + 2, 30, 120, 120, 0.5);
    }
  });
  function wool(color) {
    return function (px, rnd) {
      grain(px, color, 16, rnd);
      for (var i = 0; i < 70; i++) {
        var x = (rnd() * TS) | 0, y = (rnd() * TS) | 0;
        px.blend(x, y, 255, 255, 255, 0.12);
      }
      for (var j = 0; j < 40; j++) {
        var x2 = (rnd() * TS) | 0, y2 = (rnd() * TS) | 0;
        px.blend(x2, y2, 0, 0, 0, 0.1);
      }
    };
  }
  var WOOLS = {
    white: '#e9ecec', red: '#b02e26', orange: '#f9801d', yellow: '#fed83d',
    lime: '#80c71f', green: '#5e7c16', cyan: '#169c9c', lightblue: '#3ab3da',
    blue: '#3c44aa', purple: '#8932b8', magenta: '#c74ebd', pink: '#f38baa',
    brown: '#835432', gray: '#5e6367', lightgray: '#9d9d97', black: '#1d1d21'
  };
  Object.keys(WOOLS).forEach(function (k) { def('wool_' + k, wool(WOOLS[k])); });

  /* 十字スプライト（花や草）。背景は透明 */
  def('poppy', function (px, rnd) {
    for (var y = 0; y < TS; y++) for (var x = 0; x < TS; x++) px.set(x, y, 0, 0, 0, 0);
    line(px, 8, 15, 8, 7, '#3f7a2a');
    px.set(6, 11, 63, 122, 42, 255); px.set(10, 9, 63, 122, 42, 255);
    px.set(5, 10, 79, 138, 52, 255); px.set(11, 8, 79, 138, 52, 255);
    var p = [[7, 4], [8, 4], [9, 4], [6, 5], [7, 5], [8, 5], [9, 5], [10, 5], [7, 6], [8, 6], [9, 6], [8, 3]];
    for (var i = 0; i < p.length; i++) px.set(p[i][0], p[i][1], 200 + rnd() * 40, 40, 40, 255);
    px.set(8, 5, 40, 30, 30, 255);
  });
  def('dandelion', function (px, rnd) {
    for (var y = 0; y < TS; y++) for (var x = 0; x < TS; x++) px.set(x, y, 0, 0, 0, 0);
    line(px, 8, 15, 8, 7, '#3f7a2a');
    px.set(6, 12, 63, 122, 42, 255); px.set(10, 10, 63, 122, 42, 255);
    var p = [[7, 4], [8, 4], [9, 4], [6, 5], [7, 5], [8, 5], [9, 5], [10, 5], [7, 6], [8, 6], [9, 6]];
    for (var i = 0; i < p.length; i++) px.set(p[i][0], p[i][1], 250, 215 + rnd() * 20, 60, 255);
    px.set(8, 4, 255, 250, 180, 255);
  });
  def('tall_grass', function (px, rnd) {
    for (var y = 0; y < TS; y++) for (var x = 0; x < TS; x++) px.set(x, y, 0, 0, 0, 0);
    for (var i = 0; i < 9; i++) {
      var x0 = 1 + ((rnd() * 14) | 0);
      var h = 6 + ((rnd() * 8) | 0);
      var bend = rnd() < 0.5 ? -1 : 1;
      var c = rnd() < 0.5 ? '#7fae4f' : '#638d3a';
      for (var k = 0; k < h; k++) {
        var xx = x0 + ((k / 4) | 0) * bend;
        var cc = hex(c);
        px.set(xx, 15 - k, cc[0], cc[1], cc[2], 255);
      }
    }
  });
  def('sapling', function (px, rnd) {
    for (var y = 0; y < TS; y++) for (var x = 0; x < TS; x++) px.set(x, y, 0, 0, 0, 0);
    line(px, 8, 15, 8, 9, '#6b5334');
    for (var i = 0; i < 40; i++) {
      var x2 = 3 + ((rnd() * 10) | 0), y2 = 3 + ((rnd() * 7) | 0);
      var d = Math.abs(x2 - 8) + Math.abs(y2 - 6);
      if (d > 6) continue;
      var c = rnd() < 0.5 ? '#48781f' : '#5f9430';
      var cc = hex(c);
      px.set(x2, y2, cc[0], cc[1], cc[2], 255);
    }
  });
  def('torch', function (px, rnd) {
    for (var y = 0; y < TS; y++) for (var x = 0; x < TS; x++) px.set(x, y, 0, 0, 0, 0);
    rect(px, 7, 8, 2, 8, '#6b5334', 10, rnd);
    rect(px, 7, 6, 2, 2, '#ffdf6b', 0, rnd);
    px.set(7, 5, 255, 240, 180, 255); px.set(8, 5, 255, 240, 180, 255);
    px.blend(6, 6, 255, 200, 80, 0.5); px.blend(9, 6, 255, 200, 80, 0.5);
  });
  def('skin', function (px, rnd) {
    grain(px, '#c98a55', 8, rnd);
    speck(px, '#b87c4a', 20, rnd);
  });
  def('sleeve', function (px, rnd) {
    grain(px, '#3a8fb5', 10, rnd);
    speck(px, '#2f7897', 18, rnd);
  });

  /* ---------- レイヤー番号の割り当て ---------- */
  var texNames = Object.keys(TEX);
  var texIndex = {};
  texNames.forEach(function (n, i) { texIndex[n] = i; });

  /* 生成したピクセルデータ（アイコン描画でも使う） */
  var texData = null;
  function buildTextures() {
    if (texData) return texData;
    texData = [];
    for (var i = 0; i < texNames.length; i++) {
      var px = new Px();
      var rnd = mulberry32(0x9e3779b9 ^ (i * 2654435761));
      TEX[texNames[i]](px, rnd);
      texData.push(px.d);
    }
    return texData;
  }

  /* ---------- ブロック定義 ---------- */
  /* render: 'cube' | 'cross' | 'liquid'
   * solid : 当たり判定あり
   * opaque: 光を止める（不透明）
   * light : 自分で光る強さ 0-15
   */
  var BLOCKS = [];
  function block(id, name, opts) {
    var t = opts.tex;
    var def2 = {
      id: id,
      name: name,
      render: opts.render || 'cube',
      solid: opts.solid !== false,
      opaque: opts.opaque !== false,
      light: opts.light || 0,
      sound: opts.sound || 'stone',
      tint: opts.tint || null,
      /* 面ごとのテクスチャ [+X,-X,+Y,-Y,+Z,-Z] */
      faces: null,
      tex: t
    };
    var top = opts.top || t, bottom = opts.bottom || opts.top || t, side = opts.side || t;
    def2.faces = [side, side, top, bottom, side, side].map(function (n) { return texIndex[n]; });
    def2.iconTex = { top: texIndex[top], side: texIndex[side] };
    BLOCKS[id] = def2;
    return def2;
  }

  var ID = {
    AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, COBBLESTONE: 4, MOSSY_COBBLESTONE: 5,
    STONE_BRICKS: 6, SAND: 7, SANDSTONE: 8, GRAVEL: 9,
    OAK_LOG: 10, OAK_LEAVES: 11, OAK_PLANKS: 12,
    BIRCH_LOG: 13, BIRCH_LEAVES: 14, BIRCH_PLANKS: 15,
    SPRUCE_LOG: 16, SPRUCE_LEAVES: 17, SPRUCE_PLANKS: 18,
    WATER: 19, LAVA: 20, GLASS: 21, BRICKS: 22, SNOW: 23, ICE: 24, BEDROCK: 25,
    COAL_ORE: 26, IRON_ORE: 27, GOLD_ORE: 28, DIAMOND_ORE: 29, REDSTONE_ORE: 30, EMERALD_ORE: 31,
    OBSIDIAN: 32, GLOWSTONE: 33, SEA_LANTERN: 34, BOOKSHELF: 35, CRAFTING_TABLE: 36,
    PUMPKIN: 37, CACTUS: 38, TNT: 39, CLAY: 40, TERRACOTTA: 41, QUARTZ: 42,
    GOLD_BLOCK: 43, IRON_BLOCK: 44, DIAMOND_BLOCK: 45,
    POPPY: 46, DANDELION: 47, TALL_GRASS: 48, SAPLING: 49, TORCH: 50
  };
  var WOOL_START = 51;

  block(ID.GRASS, '草ブロック', { tex: 'grass_side', top: 'grass_top', bottom: 'dirt', side: 'grass_side', sound: 'grass' });
  block(ID.DIRT, '土', { tex: 'dirt', sound: 'gravel' });
  block(ID.STONE, '石', { tex: 'stone' });
  block(ID.COBBLESTONE, '丸石', { tex: 'cobblestone' });
  block(ID.MOSSY_COBBLESTONE, '苔石', { tex: 'mossy_cobblestone' });
  block(ID.STONE_BRICKS, '石レンガ', { tex: 'stone_bricks' });
  block(ID.SAND, '砂', { tex: 'sand', sound: 'sand' });
  block(ID.SANDSTONE, '砂岩', { tex: 'sandstone_side', top: 'sandstone_top', side: 'sandstone_side' });
  block(ID.GRAVEL, '砂利', { tex: 'gravel', sound: 'gravel' });
  block(ID.OAK_LOG, 'オークの原木', { tex: 'oak_log_side', top: 'oak_log_top', side: 'oak_log_side', sound: 'wood' });
  block(ID.OAK_LEAVES, 'オークの葉', { tex: 'oak_leaves', opaque: false, sound: 'grass' });
  block(ID.OAK_PLANKS, 'オークの板材', { tex: 'oak_planks', sound: 'wood' });
  block(ID.BIRCH_LOG, 'シラカバの原木', { tex: 'birch_log_side', top: 'birch_log_top', side: 'birch_log_side', sound: 'wood' });
  block(ID.BIRCH_LEAVES, 'シラカバの葉', { tex: 'birch_leaves', opaque: false, sound: 'grass' });
  block(ID.BIRCH_PLANKS, 'シラカバの板材', { tex: 'birch_planks', sound: 'wood' });
  block(ID.SPRUCE_LOG, 'トウヒの原木', { tex: 'spruce_log_side', top: 'spruce_log_top', side: 'spruce_log_side', sound: 'wood' });
  block(ID.SPRUCE_LEAVES, 'トウヒの葉', { tex: 'spruce_leaves', opaque: false, sound: 'grass' });
  block(ID.SPRUCE_PLANKS, 'トウヒの板材', { tex: 'spruce_planks', sound: 'wood' });
  block(ID.WATER, '水', { tex: 'water', render: 'liquid', solid: false, opaque: false, sound: 'water' });
  block(ID.LAVA, '溶岩', { tex: 'lava', render: 'liquid', solid: false, opaque: false, light: 15, sound: 'water' });
  block(ID.GLASS, 'ガラス', { tex: 'glass', opaque: false, sound: 'glass' });
  block(ID.BRICKS, 'レンガ', { tex: 'bricks' });
  block(ID.SNOW, '雪ブロック', { tex: 'snow', sound: 'snow' });
  block(ID.ICE, '氷', { tex: 'ice', opaque: false, sound: 'glass' });
  block(ID.BEDROCK, '岩盤', { tex: 'bedrock' });
  block(ID.COAL_ORE, '石炭鉱石', { tex: 'coal_ore' });
  block(ID.IRON_ORE, '鉄鉱石', { tex: 'iron_ore' });
  block(ID.GOLD_ORE, '金鉱石', { tex: 'gold_ore' });
  block(ID.DIAMOND_ORE, 'ダイヤモンド鉱石', { tex: 'diamond_ore' });
  block(ID.REDSTONE_ORE, 'レッドストーン鉱石', { tex: 'redstone_ore' });
  block(ID.EMERALD_ORE, 'エメラルド鉱石', { tex: 'emerald_ore' });
  block(ID.OBSIDIAN, '黒曜石', { tex: 'obsidian' });
  block(ID.GLOWSTONE, 'グロウストーン', { tex: 'glowstone', light: 15, sound: 'glass' });
  block(ID.SEA_LANTERN, 'シーランタン', { tex: 'sea_lantern', light: 15, sound: 'glass' });
  block(ID.BOOKSHELF, '本棚', { tex: 'bookshelf', top: 'oak_planks', side: 'bookshelf', sound: 'wood' });
  block(ID.CRAFTING_TABLE, '作業台', { tex: 'crafting_table_side', top: 'crafting_table_top', side: 'crafting_table_side', sound: 'wood' });
  block(ID.PUMPKIN, 'カボチャ', { tex: 'pumpkin_side', top: 'pumpkin_top', side: 'pumpkin_side', sound: 'wood' });
  block(ID.CACTUS, 'サボテン', { tex: 'cactus_side', top: 'cactus_top', side: 'cactus_side', sound: 'grass' });
  block(ID.TNT, 'TNT', { tex: 'tnt_side', top: 'tnt_top', side: 'tnt_side', sound: 'grass' });
  block(ID.CLAY, '粘土', { tex: 'clay', sound: 'gravel' });
  block(ID.TERRACOTTA, 'テラコッタ', { tex: 'terracotta' });
  block(ID.QUARTZ, 'クォーツブロック', { tex: 'quartz' });
  block(ID.GOLD_BLOCK, '金ブロック', { tex: 'gold_block', sound: 'metal' });
  block(ID.IRON_BLOCK, '鉄ブロック', { tex: 'iron_block', sound: 'metal' });
  block(ID.DIAMOND_BLOCK, 'ダイヤモンドブロック', { tex: 'diamond_block', sound: 'metal' });
  block(ID.POPPY, 'ポピー', { tex: 'poppy', render: 'cross', solid: false, opaque: false, sound: 'grass' });
  block(ID.DANDELION, 'タンポポ', { tex: 'dandelion', render: 'cross', solid: false, opaque: false, sound: 'grass' });
  block(ID.TALL_GRASS, '草', { tex: 'tall_grass', render: 'cross', solid: false, opaque: false, sound: 'grass' });
  block(ID.SAPLING, '苗木', { tex: 'sapling', render: 'cross', solid: false, opaque: false, sound: 'grass' });
  block(ID.TORCH, '松明', { tex: 'torch', render: 'cross', solid: false, opaque: false, light: 14, sound: 'wood' });

  /* 羊毛 16 色 */
  var WOOL_JA = {
    white: '白', red: '赤', orange: 'オレンジ', yellow: '黄', lime: '黄緑', green: '緑',
    cyan: '青緑', lightblue: '空色', blue: '青', purple: '紫', magenta: '赤紫', pink: '桃',
    brown: '茶', gray: '灰', lightgray: '薄灰', black: '黒'
  };
  var woolIds = [];
  Object.keys(WOOLS).forEach(function (k, i) {
    var id = WOOL_START + i;
    block(id, WOOL_JA[k] + 'の羊毛', { tex: 'wool_' + k, sound: 'wool' });
    ID['WOOL_' + k.toUpperCase()] = id;
    woolIds.push(id);
  });

  for (var i = 0; i < BLOCKS.length; i++) if (!BLOCKS[i]) BLOCKS[i] = null;

  function isAir(id) { return id === 0; }
  function get(id) { return BLOCKS[id] || null; }
  function isOpaque(id) { var b = BLOCKS[id]; return !!(b && b.opaque); }
  function isSolid(id) { var b = BLOCKS[id]; return !!(b && b.solid); }
  function isLiquid(id) { var b = BLOCKS[id]; return !!(b && b.render === 'liquid'); }
  function isCross(id) { var b = BLOCKS[id]; return !!(b && b.render === 'cross'); }
  function lightOf(id) { var b = BLOCKS[id]; return b ? b.light : 0; }

  /* クリエイティブのインベントリ分類（マイクラのタブ構成をまねる） */
  var TABS = [
    {
      name: '建材', icon: ID.STONE_BRICKS, items: [
        ID.STONE, ID.COBBLESTONE, ID.MOSSY_COBBLESTONE, ID.STONE_BRICKS, ID.BRICKS,
        ID.SANDSTONE, ID.QUARTZ, ID.TERRACOTTA, ID.CLAY, ID.OAK_PLANKS, ID.BIRCH_PLANKS,
        ID.SPRUCE_PLANKS, ID.GLASS, ID.OBSIDIAN, ID.BEDROCK, ID.SNOW, ID.ICE
      ]
    },
    {
      name: '自然', icon: ID.GRASS, items: [
        ID.GRASS, ID.DIRT, ID.SAND, ID.GRAVEL, ID.STONE,
        ID.OAK_LOG, ID.BIRCH_LOG, ID.SPRUCE_LOG, ID.OAK_LEAVES, ID.BIRCH_LEAVES, ID.SPRUCE_LEAVES,
        ID.WATER, ID.LAVA, ID.CACTUS, ID.PUMPKIN,
        ID.COAL_ORE, ID.IRON_ORE, ID.GOLD_ORE, ID.DIAMOND_ORE, ID.REDSTONE_ORE, ID.EMERALD_ORE
      ]
    },
    {
      name: '装飾', icon: ID.TORCH, items: [
        ID.TORCH, ID.GLOWSTONE, ID.SEA_LANTERN, ID.CRAFTING_TABLE, ID.BOOKSHELF, ID.TNT,
        ID.POPPY, ID.DANDELION, ID.TALL_GRASS, ID.SAPLING,
        ID.GOLD_BLOCK, ID.IRON_BLOCK, ID.DIAMOND_BLOCK
      ]
    },
    { name: '色', icon: ID.WOOL_RED, items: woolIds }
  ];

  YC.Blocks = {
    TS: TS,
    ID: ID,
    list: BLOCKS,
    get: get,
    isAir: isAir,
    isOpaque: isOpaque,
    isSolid: isSolid,
    isLiquid: isLiquid,
    isCross: isCross,
    lightOf: lightOf,
    texNames: texNames,
    texIndex: texIndex,
    buildTextures: buildTextures,
    TABS: TABS,
    woolIds: woolIds
  };
})(typeof window !== 'undefined' ? window : globalThis);
