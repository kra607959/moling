'use strict';
// 笔势识别：把一笔原始轨迹分类为 点 / 斩 / 拂 / 封 / 镇 / 雷 / 浪。
// 依赖 util.js 中的几何函数。所有长度单位为世界单位（短边 = 720）。

var Gesture = (function () {
  const STEP = 6;               // 重采样间距
  const CORNER_K = 3;           // 拐角检测窗口（点数）
  const CORNER_OPEN = 1.4;      // 开放笔画的拐角阈值（弧度，约 80°）
  const CORNER_LOOP = 0.85;     // 闭合图形的拐角阈值（约 49°）
  const SPAN = 28;              // 弯的跨度（转过七成角所用笔长）低于此为折角
  const GAP_FAR = 70;           // 弯距超过此，才用跨度分折线与波浪
  const BEND_PART = 0.7;        // 量弯的跨度：转过本弯多少成的角

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

  // 各个「弯」：同向转动的一段（抖动造成的小段并入两邻）。每个弯记下转角最集中的跨度：
  // 折线的弯集中在一两个点上（尖），波浪的弯摊在半个波长上（圆）。用「跨度 ÷ 弯距」量尖圆，
  // 不依赖拐角的度数阈值——手指画得快、拐角只转七八十度时，旧的拐角检测常常漏掉，锯齿就被当成了波浪。
  function bendList(P, L) {
    const n = P.length;
    if (n < 6) return [];
    // 先把点的位置抹平（±2 点，约 ±12 单位），压住手抖，再取航向
    const W = [1, 2, 3, 2, 1], Q = P.map((_, i) => {
      let x = 0, y = 0, w = 0;
      for (let d = -2; d <= 2; d++) { const j = i + d; if (j < 0 || j >= n) continue; x += P[j].x * W[d + 2]; y += P[j].y * W[d + 2]; w += W[d + 2]; }
      return { x: x / w, y: y / w };
    });
    const s = [];
    for (let i = 0; i < n - 1; i++) s.push(Math.atan2(Q[i + 1].y - Q[i].y, Q[i + 1].x - Q[i].x));
    for (let i = 1; i < s.length; i++) s[i] = s[i - 1] + wrapAng(s[i] - s[i - 1]);
    let runs = [];
    for (let i = 1; i < s.length; i++) {
      const d = s[i] - s[i - 1], cur = runs[runs.length - 1];
      if (cur && (Math.sign(d) === Math.sign(cur.t) || Math.abs(d) < 0.004 || cur.t === 0)) { cur.t += d; cur.b = i; }
      else runs.push({ a: i - 1, b: i, t: d });
    }
    const merge = () => {
      const m = [];
      for (const r of runs) { const q = m[m.length - 1]; if (q && Math.sign(r.t) === Math.sign(q.t)) { q.t += r.t; q.b = r.b; } else m.push(r); }
      runs = m;
    };
    merge();
    for (;;) {
      if (runs.length <= 1) break;
      let mi = -1, mv = 0.35;
      for (let i = 0; i < runs.length; i++) { const v = Math.abs(runs[i].t); if (v < mv) { mv = v; mi = i; } }
      if (mi < 0) break;
      if (mi === 0) { runs[1].t += runs[0].t; runs[1].a = runs[0].a; runs.splice(0, 1); }
      else if (mi === runs.length - 1) { runs[mi - 1].t += runs[mi].t; runs[mi - 1].b = runs[mi].b; runs.splice(mi, 1); }
      else { const q = runs[mi - 1]; q.t += runs[mi].t + runs[mi + 1].t; q.b = runs[mi + 1].b; runs.splice(mi, 2); }
      merge();
    }
    const edge = Math.max(18, 0.08 * L) / STEP;
    const out = [];
    for (const r of runs) {
      if (Math.abs(r.t) <= 0.7) continue;
      // 最短的一段，转过本弯七成的角（末端按比例插值，精度好过一个采样间距）
      const need = BEND_PART * Math.abs(r.t);
      let best = r.b - r.a, bc = (r.a + r.b) / 2;
      for (let i = r.a; i < r.b; i++) {
        for (let j = i + 1; j <= r.b && j - 1 - i < best; j++) {
          const got = Math.abs(s[j] - s[i]);
          if (got < need) continue;
          const prev = Math.abs(s[j - 1] - s[i]), f = got > prev ? (need - prev) / (got - prev) : 1;
          const w = j - 1 - i + f;
          if (w < best) { best = w; bc = i + w / 2; }
          break;
        }
      }
      if (bc < edge || bc > n - 1 - edge) continue;   // 起笔、收笔处的小勾不算弯
      out.push({ i: Math.round(bc), t: r.t, span: best * STEP });
    }
    // 尖度：每个弯的跨度 ÷ 与相邻弯的平均距离
    for (let k = 0; k < out.length; k++) {
      const ds = [];
      if (k > 0) ds.push(out[k].i - out[k - 1].i);
      if (k < out.length - 1) ds.push(out[k + 1].i - out[k].i);
      const gap = ds.length ? ds.reduce((x, y) => x + y, 0) / ds.length * STEP : L;
      out[k].sharp = out[k].span / Math.max(gap, 1);
    }
    return out;
  }

  // 弯顶处的笔速 ÷ 全笔笔速中位数（原始点带时间 t 才算）。人有意折笔时会在拐角减速，留作校准
  function bendSpeed(raw, bends) {
    if (!raw.length || raw[0].t == null || raw[raw.length - 1].t - raw[0].t < 30) return null;
    const cum = [0];
    for (let i = 1; i < raw.length; i++) cum.push(cum[i - 1] + Math.hypot(raw[i].x - raw[i - 1].x, raw[i].y - raw[i - 1].y));
    const tAt = l => {
      let i = 1;
      while (i < raw.length - 1 && cum[i] < l) i++;
      const f = cum[i] > cum[i - 1] ? clamp((l - cum[i - 1]) / (cum[i] - cum[i - 1]), 0, 1) : 0;
      return raw[i - 1].t + (raw[i].t - raw[i - 1].t) * f;
    };
    const tot = cum[cum.length - 1], H = 12;
    const v = l => { const a = Math.max(0, l - H), b = Math.min(tot, l + H), dt = tAt(b) - tAt(a); return dt > 0 ? (b - a) / dt : null; };
    const all = [];
    for (let l = H; l < tot - H; l += 2 * H) { const q = v(l); if (q) all.push(q); }
    if (all.length < 3) return null;
    all.sort((x, y) => x - y);
    const vm = all[all.length >> 1];
    const at = bends.map(b => v(b.i * STEP)).filter(q => q).sort((x, y) => x - y);
    return at.length && vm > 0 ? at[at.length >> 1] / vm : null;
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
    // 折线还是波浪。弯与弯相距够远（> GAP_FAR）时看弯有多尖：转过七成角所用的笔长（中位数）。
    // 手指画的折角哪怕圆一点，也在二十几个单位内转完；波浪的弯摊在半个波长上。
    // 弯挨得近的小笔画，两种形状本就难分，仍用拐角度数加转角集中度（偏向认作浪）。
    // 仿真手指笔迹（拐角倒圆 0–16 单位、采样间距 4–12、手抖），常规大小：锯齿认作雷约 93%、
    // 波浪认作浪约 96%；旧法锯齿只认得出约 65%。真人的拐角还会减速，记进试玩记录（vr）待校准。
    const bends = bendList(P, L), nb = bends.length;
    const mid = a => a.slice().sort((x, y) => x - y)[a.length >> 1];
    const span = nb ? mid(bends.map(b => b.span)) : 99, sh = nb ? mid(bends.map(b => b.sharp)) : 1;
    const gap = nb >= 2 ? mid(bends.slice(1).map((b, k) => (b.i - bends[k].i) * STEP)) : 0;
    const far = nb >= 2 && gap > GAP_FAR;
    // 弯要铺开在笔上：直线收笔处卷个小圈，两个弯挤在末端，不算折线
    const spread = nb >= 2 ? ((bends[nb - 1].i - bends[0].i) * STEP + gap) / L : 1;
    const zig = spread >= 0.35 && (far ? span < SPAN : cs.length >= 2 && res.conc >= 0.6);
    const wave = !zig && Math.max(nb, res.lobes) >= 3 && res.S > 0.3;
    if (zig && far) res.corners = bends.map(b => P[b.i]);   // 雷从拐角落下
    if (nb >= 2) res.bend = { n: nb, span, sharp: sh, gap, vr: bendSpeed(raw, bends) };
    res.shape = zig ? 'zig' : wave ? 'wave' : res.S >= 0.9 && L >= 50 ? 'line' : 'curve';
    if (zig && un.lei) res.kind = 'lei';
    else if (wave && un.lang) res.kind = 'lang';
    else if (res.S >= 0.9 && L >= 50) res.kind = 'zhan';
    else res.kind = 'fu';
    // 差一点合拢：像在画圈（同向转过约 230° 以上），首尾却没接上
    if (res.kind === 'fu' && res.shape === 'curve' && L > 120 && prof.length) {
      const turnTot = Math.abs(prof[prof.length - 1] - prof[0]);
      if (turnTot > 4.0 && chord < 0.5 * L) res.near = true;
    }
    return res;
  }

  return { classify, resample, lobeCount, cornerList, findLoop, STEP };
})();
