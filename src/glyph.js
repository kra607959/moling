'use strict';
// 字诀识别：把几笔笔迹当作一团点云，与字帖模板逐点配对（$P 点云识别的思路）。
// 只看字形，不计笔顺与笔向，也容得下连笔；但不容旋转——字是正着写的。

var Glyph = (function () {
  const N = 48;                 // 每字重采样点数
  const WSUM = (N + 1) / 2;     // 配对权重之和：把总距离化为“平均每点偏差”（单位：字宽）
  const ACCEPT = 0.10;          // 平均偏差低于此值方算成字
  const STROKE_PEN = 0.018;     // 笔数与模板每差一笔的罚分
  const MIN_STROKE = 0.12;      // 过短的一笔（点、轻触）按此长度计，免得点画在点云里消失

  // 字帖：单位方格（y 向下）内的笔画；每字收录几种常见写法
  const BOOK = {
    huo: [
      [[[0.22, 0.30], [0.30, 0.47]], [[0.80, 0.24], [0.68, 0.46]],
        [[0.50, 0.05], [0.50, 0.30], [0.46, 0.52], [0.34, 0.74], [0.08, 0.96]], [[0.50, 0.50], [0.62, 0.70], [0.78, 0.86], [0.96, 0.96]]],
      [[[0.15, 0.28], [0.26, 0.44]], [[0.86, 0.26], [0.74, 0.44]],
        [[0.52, 0.02], [0.50, 0.42], [0.30, 0.78], [0.04, 0.94]], [[0.50, 0.46], [0.72, 0.78], [0.96, 0.94]]],
      [[[0.18, 0.40], [0.30, 0.56]], [[0.84, 0.36], [0.70, 0.56]],
        [[0.50, 0.04], [0.48, 0.45], [0.32, 0.76], [0.06, 0.96]], [[0.48, 0.55], [0.70, 0.80], [0.95, 0.96]]],
      // 连笔：撇写完折回中腰再出捺
      [[[0.22, 0.30], [0.30, 0.47]], [[0.80, 0.24], [0.68, 0.46]],
        [[0.50, 0.05], [0.47, 0.50], [0.32, 0.76], [0.08, 0.96], [0.30, 0.72], [0.49, 0.52], [0.70, 0.80], [0.96, 0.96]]],
    ],
    shan: [
      [[[0.50, 0.04], [0.50, 0.90]], [[0.10, 0.34], [0.10, 0.90], [0.90, 0.90]], [[0.90, 0.34], [0.90, 0.90]]],
      [[[0.50, 0.04], [0.50, 0.90]], [[0.10, 0.34], [0.10, 0.90]], [[0.10, 0.90], [0.90, 0.90]], [[0.90, 0.34], [0.90, 0.90]]],
      [[[0.50, 0.04], [0.50, 0.90]], [[0.10, 0.34], [0.10, 0.90], [0.90, 0.90], [0.90, 0.34]]],
      [[[0.50, 0.12], [0.50, 0.86]], [[0.04, 0.42], [0.06, 0.86], [0.94, 0.86]], [[0.94, 0.40], [0.94, 0.86]]],
    ],
    shui: [
      [[[0.50, 0.03], [0.50, 0.88], [0.42, 0.80]], [[0.12, 0.34], [0.38, 0.34], [0.08, 0.78]],
        [[0.86, 0.20], [0.58, 0.46]], [[0.58, 0.44], [0.75, 0.70], [0.96, 0.92]]],
      [[[0.50, 0.03], [0.50, 0.88], [0.42, 0.80]], [[0.12, 0.34], [0.38, 0.34], [0.08, 0.78]],
        [[0.86, 0.20], [0.58, 0.46], [0.75, 0.70], [0.96, 0.92]]],
      [[[0.50, 0.03], [0.50, 0.88], [0.42, 0.80]], [[0.36, 0.36], [0.08, 0.76]],
        [[0.86, 0.22], [0.58, 0.46]], [[0.58, 0.44], [0.75, 0.70], [0.96, 0.92]]],
    ],
    ren: [
      [[[0.52, 0.04], [0.50, 0.32], [0.38, 0.62], [0.20, 0.82], [0.04, 0.96]], [[0.48, 0.42], [0.62, 0.66], [0.78, 0.84], [0.96, 0.96]]],
      [[[0.50, 0.04], [0.44, 0.40], [0.28, 0.72], [0.04, 0.94]], [[0.45, 0.30], [0.60, 0.62], [0.80, 0.86], [0.96, 0.94]]],
      [[[0.04, 0.96], [0.28, 0.55], [0.50, 0.05], [0.72, 0.55], [0.96, 0.96]]],
    ],
  };

  function len(s) { let L = 0; for (let i = 1; i < s.length; i++) L += Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y); return L; }

  // 过短的一笔换成一小段，方向取原笔向（无方向时取“点”的右下向）
  function padShort(strokes) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of strokes) for (const p of s) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
    const size = Math.max(maxX - minX, maxY - minY) || 1, minL = size * MIN_STROKE;
    return strokes.map(s => {
      const L = len(s);
      if (L >= minL) return s;
      const a = s[0], b = s[s.length - 1];
      let dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d < 1e-6) { dx = 0.5; dy = 0.86; } else { dx /= d; dy /= d; }
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      return [{ x: mx - dx * minL / 2, y: my - dy * minL / 2 }, { x: mx + dx * minL / 2, y: my + dy * minL / 2 }];
    });
  }

  // 按总笔长等距取 n 点；笔与笔之间的空隙不计长度
  function resample(strokes, n) {
    let L = 0;
    for (const s of strokes) L += len(s);
    const out = [];
    if (L <= 1e-9) {
      const flat = [];
      for (const s of strokes) for (const p of s) flat.push(p);
      for (let i = 0; i < n; i++) { const p = flat[i % flat.length]; out.push({ x: p.x, y: p.y }); }
      return out;
    }
    const I = L / (n - 1);
    let D = 0;
    for (const s of strokes) {
      let prev = { x: s[0].x, y: s[0].y };
      if (!out.length) out.push({ x: prev.x, y: prev.y });
      for (let i = 1; i < s.length; i++) {
        const cur = s[i];
        let d = Math.hypot(cur.x - prev.x, cur.y - prev.y);
        while (d > 0 && D + d >= I && out.length < n) {
          const t = (I - D) / d;
          const q = { x: prev.x + t * (cur.x - prev.x), y: prev.y + t * (cur.y - prev.y) };
          out.push(q);
          prev = q; d = Math.hypot(cur.x - prev.x, cur.y - prev.y); D = 0;
        }
        D += d; prev = { x: cur.x, y: cur.y };
      }
    }
    const lastS = strokes[strokes.length - 1], last = lastS[lastS.length - 1];
    while (out.length < n) out.push({ x: last.x, y: last.y });
    return out;
  }

  // 等比缩到单位大小，重心归零
  function normalize(P) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of P) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
    const s = Math.max(maxX - minX, maxY - minY) || 1;
    let cx = 0, cy = 0;
    const Q = P.map(p => { const q = { x: (p.x - minX) / s, y: (p.y - minY) / s }; cx += q.x; cy += q.y; return q; });
    cx /= Q.length; cy /= Q.length;
    for (const q of Q) { q.x -= cx; q.y -= cy; }
    return Q;
  }

  function prep(strokes) {
    const S = strokes.filter(s => s && s.length).map(s => s.map(p => ({ x: p.x, y: p.y })));
    if (!S.length) return null;
    return { pts: normalize(resample(padShort(S), N)), ns: S.length };
  }

  function cloudDist(A, B, start, best) {
    const matched = new Uint8Array(N);
    let sum = 0, i = start;
    do {
      let idx = -1, m = Infinity;
      const a = A[i];
      for (let j = 0; j < N; j++) {
        if (matched[j]) continue;
        const dx = a.x - B[j].x, dy = a.y - B[j].y, d = dx * dx + dy * dy;
        if (d < m) { m = d; idx = j; }
      }
      matched[idx] = 1;
      sum += (1 - ((i - start + N) % N) / N) * Math.sqrt(m);
      if (sum >= best) return sum;
      i = (i + 1) % N;
    } while (i !== start);
    return sum;
  }
  // bound：已知更优者的距离，超过即提前放弃
  function greedy(A, B, bound) {
    const step = Math.floor(Math.sqrt(N));
    let min = bound == null ? Infinity : bound;
    for (let i = 0; i < N; i += step) {
      min = Math.min(min, cloudDist(A, B, i, min));
      min = Math.min(min, cloudDist(B, A, i, min));
    }
    return bound != null && min >= bound ? Infinity : min;   // 未胜过已知更优者：记为无穷，免得浮点误差打乱名次
  }

  const TEMPLATES = [];
  for (const key in BOOK) {
    for (const v of BOOK[key]) {
      TEMPLATES.push(Object.assign({ key }, prep(v.map(s => s.map(([x, y]) => ({ x, y }))))));
    }
  }

  // strokes：若干笔，每笔为 {x,y} 数组；allowed：可识别的字（缺省为全部）
  // 返回 { key（未成字为 null）, score, ranking: [{key, score}] }
  function recognize(strokes, allowed) {
    const g = prep(strokes || []);
    if (!g) return { key: null, score: Infinity, ranking: [] };
    const best = {};
    let bestS = Infinity;
    for (const T of TEMPLATES) {
      if (allowed && !allowed.includes(T.key)) continue;
      const pen = STROKE_PEN * Math.abs(g.ns - T.ns);
      // 只求最优者精确；其余字的分数是剪枝后的下界，仅供参考
      const s = greedy(g.pts, T.pts, bestS < Infinity ? Math.max(0, (bestS - pen) * WSUM) : null) / WSUM + pen;
      if (best[T.key] == null || s < best[T.key]) best[T.key] = s;
      if (s < bestS) bestS = s;
    }
    const ranking = Object.keys(best).map(key => ({ key, score: best[key] })).sort((a, b) => a.score - b.score);
    const top = ranking[0];
    return { key: top && top.score < ACCEPT ? top.key : null, score: top ? top.score : Infinity, ranking };
  }

  return { recognize, BOOK, N, ACCEPT, prep };
})();
