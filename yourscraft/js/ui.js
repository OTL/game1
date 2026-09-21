/* YoursCraft — 画面部品（アイコン生成・ロゴ・メニュー・インベントリ） */
(function (global) {
  'use strict';
  var YC = global.YC || (global.YC = {});
  var B = YC.Blocks;

  /* ---------- テクスチャ → キャンバス ---------- */
  var texCanvasCache = {};
  function texCanvas(layer, shade) {
    var key = layer + ':' + shade;
    if (texCanvasCache[key]) return texCanvasCache[key];
    var TS = B.TS;
    var data = B.buildTextures()[layer];
    var cv = document.createElement('canvas');
    cv.width = TS; cv.height = TS;
    var ctx = cv.getContext('2d');
    var img = ctx.createImageData(TS, TS);
    for (var i = 0; i < data.length; i += 4) {
      img.data[i] = data[i] * shade;
      img.data[i + 1] = data[i + 1] * shade;
      img.data[i + 2] = data[i + 2] * shade;
      img.data[i + 3] = data[i + 3];
    }
    ctx.putImageData(img, 0, 0);
    texCanvasCache[key] = cv;
    return cv;
  }

  /* ---------- ブロックのアイコン（立体に見える斜め向き） ---------- */
  var iconCache = {};
  /* キャンバス要素は DOM の 1 か所にしか置けないので、使うときは必ず複製を返す */
  function blockIcon(id, size) {
    var src = iconSource(id, size);
    var cv = document.createElement('canvas');
    cv.width = size; cv.height = size;
    cv.getContext('2d').drawImage(src, 0, 0);
    return cv;
  }
  function iconSource(id, size) {
    var key = id + '@' + size;
    if (iconCache[key]) return iconCache[key];
    var def = B.get(id);
    var cv = document.createElement('canvas');
    cv.width = size; cv.height = size;
    var ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    if (!def) { iconCache[key] = cv; return cv; }

    if (def.render === 'cross' || def.iconFlat !== null) {
      /* 花や草・ドアはそのまま平面で（マイクラのアイテム表示と同じ） */
      var flat = def.iconFlat !== null ? def.iconFlat : def.faces[0];
      ctx.drawImage(texCanvas(flat, 1), 0, 0, size, size);
      iconCache[key] = cv;
      return cv;
    }

    var S = size * 0.94, ox = (size - S) / 2, oy = (size - S) / 2;
    var top = texCanvas(def.iconTex.top, 1);
    var left = texCanvas(def.iconTex.side, 0.72);
    var right = texCanvas(def.iconTex.side, 0.86);
    var TS = B.TS;
    function face(img, a, b, c, d, e, f) {
      ctx.save();
      ctx.setTransform(a / TS, b / TS, c / TS, d / TS, e + ox, f + oy);
      ctx.drawImage(img, 0, 0);
      ctx.restore();
    }
    /* 上面 */
    face(top, S / 2, S / 4, -S / 2, S / 4, S / 2, 0);
    /* 左面 */
    face(left, S / 2, S / 4, 0, S / 2, 0, S / 4);
    /* 右面 */
    face(right, S / 2, -S / 4, 0, S / 2, S / 2, S / 2);
    iconCache[key] = cv;
    return cv;
  }

  /* ---------- タイトルロゴ（文字をブロックで組む） ---------- */
  function buildLogo(text) {
    var CELL = 11;
    var fs = 120;
    var off = document.createElement('canvas');
    var octx = off.getContext('2d');
    octx.font = '900 ' + fs + 'px "Arial Black", Impact, system-ui, sans-serif';
    var w = Math.ceil(octx.measureText(text).width) + 20;
    off.width = w; off.height = Math.ceil(fs * 1.35);
    octx = off.getContext('2d');
    octx.font = '900 ' + fs + 'px "Arial Black", Impact, system-ui, sans-serif';
    octx.textBaseline = 'top';
    octx.fillStyle = '#fff';
    octx.fillText(text, 10, 6);
    var img = octx.getImageData(0, 0, off.width, off.height);

    /* 粗いマスに落として「ブロック」にする */
    var gw = Math.ceil(off.width / CELL), gh = Math.ceil(off.height / CELL);
    var mask = new Uint8Array(gw * gh);
    for (var gy = 0; gy < gh; gy++) {
      for (var gx = 0; gx < gw; gx++) {
        var hit = 0, n = 0;
        for (var y = gy * CELL; y < (gy + 1) * CELL && y < off.height; y++) {
          for (var x = gx * CELL; x < (gx + 1) * CELL && x < off.width; x++) {
            n++;
            if (img.data[(y * off.width + x) * 4 + 3] > 110) hit++;
          }
        }
        mask[gy * gw + gx] = (n && hit / n > 0.42) ? 1 : 0;
      }
    }
    /* 空の行を詰める */
    var minY = gh, maxY = -1, minX = gw, maxX = -1;
    for (var j = 0; j < gh; j++) for (var i = 0; i < gw; i++) {
      if (mask[j * gw + i]) {
        if (j < minY) minY = j; if (j > maxY) maxY = j;
        if (i < minX) minX = i; if (i > maxX) maxX = i;
      }
    }
    if (maxY < 0) { minX = minY = 0; maxX = gw - 1; maxY = gh - 1; }
    var ow = (maxX - minX + 1) * CELL, oh = (maxY - minY + 1) * CELL + 6;
    var cv = document.createElement('canvas');
    cv.width = ow; cv.height = oh;
    var ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    var stone = texCanvas(B.texIndex.stone, 1);
    var stoneDark = texCanvas(B.texIndex.stone, 0.55);
    for (var gy2 = minY; gy2 <= maxY; gy2++) {
      for (var gx2 = minX; gx2 <= maxX; gx2++) {
        if (!mask[gy2 * gw + gx2]) continue;
        var px = (gx2 - minX) * CELL, py = (gy2 - minY) * CELL;
        /* 下に落ちる影（立体に見せる） */
        ctx.drawImage(stoneDark, px + 4, py + 5, CELL, CELL);
      }
    }
    for (var gy3 = minY; gy3 <= maxY; gy3++) {
      for (var gx3 = minX; gx3 <= maxX; gx3++) {
        if (!mask[gy3 * gw + gx3]) continue;
        var px2 = (gx3 - minX) * CELL, py2 = (gy3 - minY) * CELL;
        ctx.drawImage(stone, px2, py2, CELL, CELL);
        /* ふちの明暗 */
        ctx.fillStyle = 'rgba(255,255,255,0.28)';
        if (!mask[(gy3 - 1) * gw + gx3]) ctx.fillRect(px2, py2, CELL, 2);
        if (!mask[gy3 * gw + gx3 - 1]) ctx.fillRect(px2, py2, 2, CELL);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        if (gy3 + 1 > maxY || !mask[(gy3 + 1) * gw + gx3]) ctx.fillRect(px2, py2 + CELL - 2, CELL, 2);
        if (gx3 + 1 > maxX || !mask[gy3 * gw + gx3 + 1]) ctx.fillRect(px2 + CELL - 2, py2, 2, CELL);
      }
    }
    return cv;
  }

  /* ---------- メニューの土背景 ---------- */
  function dirtBackgroundURL() {
    var cv = document.createElement('canvas');
    cv.width = 64; cv.height = 64;
    var ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    var dirt = texCanvas(B.texIndex.dirt, 1);
    for (var y = 0; y < 4; y++) for (var x = 0; x < 4; x++) ctx.drawImage(dirt, x * 16, y * 16, 16, 16);
    return cv.toDataURL();
  }

  YC.UI = {
    texCanvas: texCanvas,
    blockIcon: blockIcon,
    iconSource: iconSource,
    buildLogo: buildLogo,
    dirtBackgroundURL: dirtBackgroundURL
  };
})(typeof window !== 'undefined' ? window : globalThis);
