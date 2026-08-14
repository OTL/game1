/* pieces.js — ピース定義とランダム生成 */
(function (global) {
  'use strict';

  var COLORS = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink'];

  /* パターン文字列 → セル座標配列 */
  function parse(rows) {
    var cells = [];
    rows.forEach(function (row, r) {
      row.split('').forEach(function (ch, c) {
        if (ch !== '.') cells.push([r, c]);
      });
    });
    return normalize(cells);
  }

  function normalize(cells) {
    var minR = Math.min.apply(null, cells.map(function (p) { return p[0]; }));
    var minC = Math.min.apply(null, cells.map(function (p) { return p[1]; }));
    return cells
      .map(function (p) { return [p[0] - minR, p[1] - minC]; })
      .sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
  }

  /* 時計回り 90 度回転 */
  function rotate(cells) {
    var maxR = Math.max.apply(null, cells.map(function (p) { return p[0]; }));
    return normalize(cells.map(function (p) { return [p[1], maxR - p[0]]; }));
  }

  function key(cells) {
    return cells.map(function (p) { return p.join(','); }).join(' ');
  }

  function dims(cells) {
    return {
      h: Math.max.apply(null, cells.map(function (p) { return p[0]; })) + 1,
      w: Math.max.apply(null, cells.map(function (p) { return p[1]; })) + 1
    };
  }

  /* 基本形。rot:true なら 90/180/270 度の重複しない回転も追加する */
  var BASE = [
    { rows: ['X'], weight: 5, rot: false },
    { rows: ['XX'], weight: 10, rot: true },
    { rows: ['XXX'], weight: 12, rot: true },
    { rows: ['XXXX'], weight: 9, rot: true },
    { rows: ['XXXXX'], weight: 5, rot: true },
    { rows: ['XX', 'XX'], weight: 12, rot: false },
    { rows: ['XXX', 'XXX', 'XXX'], weight: 3, rot: false },
    { rows: ['XX', 'XX', 'XX'], weight: 6, rot: true },
    { rows: ['X.', 'XX'], weight: 12, rot: true },          // 小さいカド
    { rows: ['X..', 'X..', 'XXX'], weight: 8, rot: true },  // 大きい L
    { rows: ['XXX', '.X.'], weight: 8, rot: true },         // T
    { rows: ['XX.', '.XX'], weight: 6, rot: true },         // S
    { rows: ['.XX', 'XX.'], weight: 6, rot: true },         // Z
    { rows: ['X..', 'XXX'], weight: 8, rot: true },         // J
    { rows: ['..X', 'XXX'], weight: 8, rot: true }          // L
  ];

  var PIECES = [];
  var seen = {};

  BASE.forEach(function (def) {
    var cells = parse(def.rows);
    var variants = [cells];
    if (def.rot) {
      var cur = cells;
      for (var i = 0; i < 3; i++) {
        cur = rotate(cur);
        variants.push(cur);
      }
    }
    variants.forEach(function (v) {
      var k = key(v);
      if (seen[k]) return;
      seen[k] = true;
      var d = dims(v);
      PIECES.push({ cells: v, w: d.w, h: d.h, size: v.length, weight: def.weight });
    });
  });

  var TOTAL_WEIGHT = PIECES.reduce(function (a, p) { return a + p.weight; }, 0);

  function randomShape() {
    var t = Math.random() * TOTAL_WEIGHT;
    for (var i = 0; i < PIECES.length; i++) {
      t -= PIECES[i].weight;
      if (t <= 0) return PIECES[i];
    }
    return PIECES[0];
  }

  /**
   * ピースを1つ生成する。
   * level が上がるほど特殊ブロック(ボム/スター)が乗りやすい。
   */
  function createPiece(level) {
    var shape = randomShape();
    var color = COLORS[(Math.random() * COLORS.length) | 0];
    var specials = {};

    var chance = Math.min(0.08 + level * 0.012, 0.22);
    if (shape.size >= 2 && Math.random() < chance) {
      var idx = (Math.random() * shape.cells.length) | 0;
      specials[idx] = Math.random() < 0.62 ? 'bomb' : 'star';
    }

    return {
      id: 'p' + (Math.random().toString(36).slice(2, 9)),
      cells: shape.cells,
      w: shape.w,
      h: shape.h,
      size: shape.size,
      color: color,
      specials: specials
    };
  }

  global.Pieces = {
    COLORS: COLORS,
    ALL: PIECES,
    createPiece: createPiece
  };
})(window);
