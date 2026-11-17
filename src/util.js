'use strict';
// 通用数学 / 几何 / 随机工具。经典脚本，函数挂在全局，供其他脚本与 Node 测试共用。

var TAU = Math.PI * 2;

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function smooth01(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
function easeOut(t) { t = clamp(t, 0, 1); return 1 - (1 - t) * (1 - t) * (1 - t); }
function easeOutBack(t) { t = clamp(t, 0, 1) - 1; const c = 1.9; return 1 + (c + 1) * t * t * t + c * t * t; }
function wrapAng(a) { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; }
function turnToward(cur, want, maxStep) { const d = wrapAng(want - cur); return cur + clamp(d, -maxStep, maxStep); }

// —— 可复现的随机数（玩法用），视觉随机直接用 Math.random ——
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
var rng = mulberry32((Date.now() ^ 0x9e3779b9) >>> 0);
function seedRng(s) { rng = mulberry32(s >>> 0); }
function rnd() { return rng(); }
function rr(a, b) { return a + (b - a) * rng(); }
function ri(a, b) { return a + Math.floor((b - a + 1) * rng()); }
function pick(arr) { return arr[Math.floor(rng() * arr.length)]; }
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
  return arr;
}
function vr(a, b) { return a + (b - a) * Math.random(); }

// —— 几何 ——
function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = clamp(t, 0, 1);
  const x = ax + dx * t - px, y = ay + dy * t - py;
  return Math.sqrt(x * x + y * y);
}

function distToPolyline(px, py, pts) {
  if (pts.length === 1) return Math.hypot(px - pts[0].x, py - pts[0].y);
  let m = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = distToSeg(px, py, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
    if (d < m) m = d;
  }
  return m;
}

// 线段 AB 与 CD 的交点；不相交返回 null
function segIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
  const rx = bx - ax, ry = by - ay, sx = dx - cx, sy = dy - cy;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return null;
  const qx = cx - ax, qy = cy - ay;
  const t = (qx * sy - qy * sx) / den;
  const u = (qx * ry - qy * rx) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: ax + rx * t, y: ay + ry * t, t, u };
}

function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function polyArea(poly) {
  let s = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) s += poly[j].x * poly[i].y - poly[i].x * poly[j].y;
  return s / 2;
}

function pathLength(pts, closed) {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  if (closed && pts.length > 1) s += Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y);
  return s;
}

function centroidOf(pts) {
  let x = 0, y = 0;
  for (const p of pts) { x += p.x; y += p.y; }
  return { x: x / pts.length, y: y / pts.length };
}
