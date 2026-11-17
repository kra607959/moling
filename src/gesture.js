'use strict';
// 笔势识别：把一笔原始轨迹分类为 点 / 斩 / 拂 / 封 / 镇 / 雷 / 浪。
// 依赖 util.js 中的几何函数。所有长度单位为世界单位（短边 = 720）。

var Gesture = (function () {
  const STEP = 6;               // 重采样间距
  const CORNER_K = 3;           // 拐角检测窗口（点数）
  const CORNER_OPEN = 1.4;      // 开放笔画的拐角阈值（弧度，约 80°）
  const CORNER_LOOP = 0.85;     // 闭合图形的拐角阈值（约 49°）

  function resample(raw, step) {
    if (!raw.length) return [];
    const out = [{ x: raw[0].x, y: raw[0].y }];
    let px = raw[0].x, py = raw[0].y, carry = 0;
    for (let i = 1; i < raw.length; i++) {
      const qx = raw[i].x, qy = raw[i].y;
      const segLen = Math.hypot(qx - px, qy - py);
      let d0 = 0;
      while (segLen > 0 && carry + (segLen - d0) >= step) {
        d0 += step - carry;
        carry = 0;
        const t = d0 / segLen;
        out.push({ x: px + (qx - px) * t, y: py + (qy - py) * t });
      }
      carry += segLen - d0;
      px = qx; py = qy;
    }
    const last = raw[raw.length - 1], lo = out[out.length - 1];
    if (Math.hypot(last.x - lo.x, last.y - lo.y) > step * 0.35) out.push({ x: last.x, y: last.y });
    return out;
  }

  function resampleClosed(poly, n) {
    const per = pathLength(poly, true);
    const ring = poly.concat([poly[0]]);
    const r = resample(ring, per / n);
    return r.slice(0, n);
  }

  function turn(a, b, c) {
    const h1 = Math.atan2(b.y - a.y, b.x - a.x);
    const h2 = Math.atan2(c.y - b.y, c.x - b.x);
    return wrapAng(h2 - h1);
  }

  // 局部极大的大转角点
  function cornerList(P, k, thresh, cyclic) {
    const n = P.length;
    const ang = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let a = i - k, c = i + k;
      if (cyclic) { a = ((a % n) + n) % n; c = c % n; }
      else if (a < 0 || c >= n) continue;
      ang[i] = turn(P[a], P[i], P[c]);
    }
    const out = [];
    for (let i = 0; i < n; i++) {
      const v = Math.abs(ang[i]);
      if (v < thresh) continue;
      let ok = true;
      for (let d = -k; d <= k && ok; d++) {
        if (!d) continue;
        let j = i + d;
        if (cyclic) j = ((j % n) + n) % n;
        else if (j < 0 || j >= n) continue;
        const w = Math.abs(ang[j]);
        if (w > v || (w === v && d < 0)) ok = false;
      }
      if (ok) out.push({ i, a: ang[i] });
    }
    return out;
  }

  // 去掉起笔/收笔处的小勾，以及挨得太近的拐角
  function filterArms(cs, n, L) {
    const minIdx = Math.max(18, 0.08 * L) / STEP;
    let list = cs.filter(c => c.i >= minIdx && (n - 1 - c.i) >= minIdx);
    const out = [];
    for (const c of list) {
      const prev = out[out.length - 1];
      if (prev && c.i - prev.i < minIdx) {
        if (Math.abs(c.a) > Math.abs(prev.a)) out[out.length - 1] = c;
      } else out.push(c);
    }
    return out;
  }

  // 平滑后的累计航向（已展开），用于抗抖动地度量转角
  function headingProfile(P) {
    const n = P.length;
    const h = [];
    for (let i = 0; i < n - 1; i++) h.push(Math.atan2(P[i + 1].y - P[i].y, P[i + 1].x - P[i].x));
    for (let i = 1; i < h.length; i++) h[i] = h[i - 1] + wrapAng(h[i] - h[i - 1]);
    return h.map((_, i) => {
      let sum = 0, c = 0;
      for (let j = i - 2; j <= i + 2; j++) if (j >= 0 && j < h.length) { sum += h[j]; c++; }
      return sum / c;
    });
  }

  // 转角是否集中在拐点附近（折线）而非连续分布（波浪）。
  // 拐点窗口内的净转角（抖动正负相消）/ 全笔各段弯曲之和。
  function cornerConcentration(s, runs, cs) {
    if (!cs.length) return 0;
    const m = s.length;
    let near = 0;
    for (const c of cs) near += Math.abs(s[Math.min(m - 1, c.i + 4)] - s[Math.max(0, c.i - 5)]);
    let total = 0;
    for (const r of runs) total += Math.abs(r);
    return total > 0 ? Math.min(1, near / total) : 0;
  }

  // 弯曲方向交替的各段净转角（合并掉抖动造成的小段）
  function turnRuns(s) {
    let runs = [];
    let cur = 0;
    for (let i = 1; i < s.length; i++) {
      const d = s[i] - s[i - 1];
      if (cur === 0 || Math.sign(d) === Math.sign(cur) || Math.abs(d) < 0.004) cur += d;
      else { runs.push(cur); cur = d; }
    }
    if (cur) runs.push(cur);
    const MIN = 0.35;
    for (;;) {
      if (runs.length <= 1) break;
      let mi = -1, mv = Infinity;
      for (let i = 0; i < runs.length; i++) { const v = Math.abs(runs[i]); if (v < MIN && v < mv) { mv = v; mi = i; } }
      if (mi < 0) break;
      if (mi === 0) { runs[1] += runs[0]; runs.splice(0, 1); }
      else if (mi === runs.length - 1) { runs[mi - 1] += runs[mi]; runs.splice(mi, 1); }
      else { runs[mi - 1] += runs[mi] + runs[mi + 1]; runs.splice(mi, 2); }
      const m = [];
      for (const r of runs) { if (m.length && Math.sign(r) === Math.sign(m[m.length - 1])) m[m.length - 1] += r; else m.push(r); }
      runs = m;
    }
    return runs;
  }

  function lobeCount(P) {
    if (P.length < 6) return 0;
    return turnRuns(headingProfile(P)).filter(r => Math.abs(r) > 0.7).length;
  }

  // 自交形成的最大闭环
  function findLoop(P) {
    const n = P.length;
    let best = null;
    for (let j = 2; j < n - 1; j++) {
      const c = P[j], d = P[j + 1];
      for (let i = 0; i < j - 1; i++) {
        const a = P[i], b = P[i + 1];
        const h = segIntersect(a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y);
        if (!h) continue;
        const poly = [{ x: h.x, y: h.y }];
        for (let m = i + 1; m <= j; m++) poly.push(P[m]);
        const area = Math.abs(polyArea(poly));
        if (!best || area > best.area) best = { poly, area };
      }
    }
    return best;
  }

  function closedShape(P, L) {
    let loop = findLoop(P);
    if (!loop) {
      const a = P[0], b = P[P.length - 1];
      const gap = Math.hypot(a.x - b.x, a.y - b.y);
      if (L > 90 && gap < Math.max(26, 0.2 * L)) loop = { poly: P.slice(), area: Math.abs(polyArea(P)) };
    }
    if (!loop) return null;
    const per = pathLength(loop.poly, true);
    if (loop.area < 900 || per < 0.45 * L || loop.area / (per * per) < 0.03) return null;
    loop.per = per;
    return loop;
  }

  function loopKind(loop) {
    const Q = 4 * Math.PI * loop.area / (loop.per * loop.per);
    const R = resampleClosed(loop.poly, 64);
    const cs = cornerList(R, CORNER_K, CORNER_LOOP, true);
    return { corners: cs.length, Q, tri: cs.length === 3 && Q < 0.82, pts: cs.map(c => R[c.i]) };
  }

  function classify(raw, opts) {
    opts = opts || {};
    const un = opts.unlocked || { lei: true, lang: true, zhen: true };
    const P = resample(raw, STEP);
    const L = pathLength(P);
    const res = { kind: 'fu', P, L, S: 0, dir: { x: 1, y: 0 }, corners: [] };
    if (P.length < 2 || L < 12) { res.kind = 'dian'; return res; }
    const a = P[0], b = P[P.length - 1];
    const chord = Math.hypot(b.x - a.x, b.y - a.y);
    res.S = chord / L;
    if (chord > 0) res.dir = { x: (b.x - a.x) / chord, y: (b.y - a.y) / chord };

    const loop = closedShape(P, L);
    if (loop) {
      const lk = loopKind(loop);
      res.poly = loop.poly; res.area = loop.area; res.Q = lk.Q; res.loopCorners = lk.corners; res.isTri = lk.tri;
      res.kind = lk.tri && un.zhen ? 'zhen' : 'feng';
      if (lk.tri) res.triPts = lk.pts;
      return res;
    }

    let cs = cornerList(P, CORNER_K, CORNER_OPEN, false);
    cs = filterArms(cs, P.length, L);
    res.corners = cs.map(c => P[c.i]);
    const prof = P.length >= 6 ? headingProfile(P) : [];
    const runs = prof.length ? turnRuns(prof) : [];
    res.conc = cornerConcentration(prof, runs, cs);
    res.lobes = runs.filter(r => Math.abs(r) > 0.7).length;
    const zig = cs.length >= 2 && res.conc >= 0.6;
    const wave = !zig && res.lobes >= 3 && res.S > 0.3;
    res.shape = zig ? 'zig' : wave ? 'wave' : res.S >= 0.9 && L >= 50 ? 'line' : 'curve';
    if (zig && un.lei) res.kind = 'lei';
    else if (wave && un.lang) res.kind = 'lang';
    else if (res.S >= 0.9 && L >= 50) res.kind = 'zhan';
    else res.kind = 'fu';
    return res;
  }

  return { classify, resample, lobeCount, cornerList, findLoop, STEP };
})();
