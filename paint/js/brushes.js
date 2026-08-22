/* brushes.js — ブラシ定義とスタンプ（点）描画。
   1 ストロークは「小さなスタンプを一定間隔で並べる」ことで描く。
   同じ見た目のスタンプは何度も使うので、オフスクリーンに焼いてキャッシュする。 */
const Brushes = (function () {

  /* ---------- スタンプのスプライトキャッシュ ---------- */
  const cache = new Map();
  const CACHE_MAX = 240;

  function cacheGet(key, make) {
    let sp = cache.get(key);
    if (sp) return sp;
    sp = make();
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(key, sp);
    return sp;
  }

  function rgba(color, a) {
    const c = Color.toRGB(color);
    return `rgba(${c.r},${c.g},${c.b},${a})`;
  }

  /* 半径 r、やわらかさ softness の円スプライトを作る */
  function roundSprite(color, alpha, r, softness) {
    const R = Math.max(0.5, r);
    const size = Math.ceil(R * 2) + 2;
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    const c = size / 2;
    if (softness <= 0.02) {
      ctx.fillStyle = rgba(color, alpha);
      ctx.beginPath();
      ctx.arc(c, c, R, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const g = ctx.createRadialGradient(c, c, Math.max(0, R * (1 - softness)), c, c, R);
      g.addColorStop(0, rgba(color, alpha));
      g.addColorStop(0.75, rgba(color, alpha * (softness > 0.8 ? 0.35 : 0.75)));
      g.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    }
    return cv;
  }

  /* 鉛筆用: 粒状のざらつきを持つスプライト */
  function grainSprite(color, alpha, r) {
    const R = Math.max(0.5, r);
    const size = Math.ceil(R * 2) + 2;
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    const c = size / 2;
    const img = ctx.createImageData(size, size);
    const col = Color.toRGB(color);
    const d = img.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - c + 0.5, dy = y - c + 0.5;
        const dist = Math.sqrt(dx * dx + dy * dy) / R;
        if (dist > 1) continue;
        // 中心ほど濃く、そこにノイズを掛ける
        const falloff = 1 - dist * dist * 0.85;
        const noise = 0.35 + Math.random() * 0.65;
        const a = alpha * falloff * noise;
        const i = (y * size + x) * 4;
        d[i] = col.r; d[i + 1] = col.g; d[i + 2] = col.b;
        d[i + 3] = Math.max(0, Math.min(255, a * 255)) | 0;
      }
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }

  function drawSprite(ctx, sp, x, y) {
    ctx.drawImage(sp, x - sp.width / 2, y - sp.height / 2);
  }

  /* ---------- ブラシ定義 ----------
     spacing   : 半径に対するスタンプ間隔
     pressure  : 筆圧・速度で太さがどれだけ変わるか (0=変わらない)
     alpha     : スタンプ 1 つあたりの濃さ（重ねると濃くなる）
     composite : レイヤーに転写するときの合成方法                       */
  const list = [
    {
      id: 'pen', name: 'ペン', icon: '🖊️',
      size: 8, minSize: 1, maxSize: 120, opacity: 1,
      spacing: 0.12, pressure: 0.35, alpha: 1, softness: 0.12, composite: 'source-over',
      stamp(ctx, x, y, r, color, seed) {
        const q = Math.max(1, Math.round(r * 2));
        drawSprite(ctx, cacheGet('pen|' + color + '|' + q, () => roundSprite(color, 1, q / 2, 0.12)), x, y);
      }
    },
    {
      id: 'brush', name: '筆', icon: '🖌️',
      size: 22, minSize: 1, maxSize: 200, opacity: 0.9,
      spacing: 0.08, pressure: 0.8, alpha: 1, softness: 0.35, composite: 'source-over',
      stamp(ctx, x, y, r, color) {
        const q = Math.max(1, Math.round(r * 2));
        drawSprite(ctx, cacheGet('brush|' + color + '|' + q, () => roundSprite(color, 1, q / 2, 0.35)), x, y);
      }
    },
    {
      id: 'pencil', name: '鉛筆', icon: '✏️',
      size: 6, minSize: 1, maxSize: 90, opacity: 0.85,
      spacing: 0.35, pressure: 0.5, alpha: 0.75, softness: 0.3, composite: 'source-over',
      stamp(ctx, x, y, r, color) {
        const q = Math.max(1, Math.round(r * 2));
        // ざらつきの違うスプライトを数種類まわして、同じ模様の繰り返しを避ける
        const v = (Math.random() * 4) | 0;
        const sp = cacheGet('pencil|' + color + '|' + q + '|' + v, () => grainSprite(color, 0.9, q / 2));
        drawSprite(ctx, sp, x + (Math.random() - 0.5) * r * 0.3, y + (Math.random() - 0.5) * r * 0.3);
      }
    },
    {
      id: 'marker', name: 'マーカー', icon: '🖍️',
      size: 30, minSize: 4, maxSize: 200, opacity: 0.5,
      spacing: 0.06, pressure: 0, alpha: 1, softness: 0.03, composite: 'multiply',
      stamp(ctx, x, y, r, color) {
        const q = Math.max(1, Math.round(r * 2));
        drawSprite(ctx, cacheGet('mk|' + color + '|' + q, () => roundSprite(color, 1, q / 2, 0.03)), x, y);
      }
    },
    {
      id: 'air', name: 'エアブラシ', icon: '💨',
      size: 60, minSize: 4, maxSize: 300, opacity: 0.8,
      spacing: 0.05, pressure: 0.25, alpha: 0.055, softness: 1, composite: 'source-over',
      stamp(ctx, x, y, r, color) {
        const q = Math.max(2, Math.round(r * 2));
        drawSprite(ctx, cacheGet('air|' + color + '|' + q, () => roundSprite(color, 0.055, q / 2, 1)), x, y);
      }
    },
    {
      id: 'eraser', name: '消しゴム', icon: '🧽',
      size: 40, minSize: 2, maxSize: 300, opacity: 1,
      spacing: 0.1, pressure: 0.3, alpha: 1, softness: 0.15, composite: 'destination-out',
      erase: true,
      stamp(ctx, x, y, r) {
        const q = Math.max(1, Math.round(r * 2));
        drawSprite(ctx, cacheGet('er|' + q, () => roundSprite('#000000', 1, q / 2, 0.15)), x, y);
      }
    }
  ];

  const byId = {};
  list.forEach(b => { byId[b.id] = b; });

  return {
    list, byId,
    get(id) { return byId[id] || byId.pen; },
    clearCache() { cache.clear(); }
  };
})();
