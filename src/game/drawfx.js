'use strict';
// 墨灵 · 游戏 10/13 · drawfx：绘制：字诀效果、结界与反笔、各种特效与飘字

// —— 字诀效果的绘制 ——
function drawShan(s) {
  const c = ctx;
  const end = s.dur - s.t, fade = end < 1.5 ? (end / 1.5) * (0.6 + 0.4 * Math.sin(UI.t * 16) ** 2) : 1;
  c.strokeStyle = `rgba(${INK},${0.06 * fade})`; c.lineWidth = 22;
  c.beginPath(); c.arc(CX, CY, s.r, 0, TAU); c.stroke();
  const order = s.peaks.slice().sort((a, b) => Math.sin(a.a) - Math.sin(b.a));   // 先画上方的山，下方的压在前面
  for (const p of order) {
    const k = easeOutBack(clamp((s.t - p.delay) / 0.45, 0, 1));
    if (k <= 0) continue;
    const bx = CX + Math.cos(p.a) * s.r, by = CY + Math.sin(p.a) * s.r * 0.94 + 12;
    const h = p.h * k, w = p.w;
    const g = c.createLinearGradient(0, by - h, 0, by);
    g.addColorStop(0, `rgba(${INK},${0.82 * fade})`); g.addColorStop(1, `rgba(${INK},${0.06 * fade})`);
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(bx - w / 2, by);
    const R = mulberry32(Math.floor(p.seed * 1000));
    const n = 6;
    for (let i = 1; i < n; i++) {
      const t = i / n, x = bx - w / 2 + w * t;
      const top = Math.sin(t * Math.PI) ** 1.3;
      c.lineTo(x, by - h * top * (0.78 + 0.22 * R()) - (i === 3 ? h * 0.12 : 0));
    }
    c.lineTo(bx + w / 2, by);
    c.closePath(); c.fill();
    c.strokeStyle = `rgba(${INK},${0.35 * fade})`; c.lineWidth = 1;
    c.beginPath(); c.moveTo(bx - w * 0.05, by - h * 0.85); c.lineTo(bx - w * 0.18, by - h * 0.3); c.moveTo(bx + w * 0.12, by - h * 0.7); c.lineTo(bx + w * 0.2, by - h * 0.25); c.stroke();
  }
}
function drawFlood(f) {
  const c = ctx;
  const p = Math.min(1, f.t / 1.1), front = f.R * easeOut(p), a = 1 - f.t / f.dur;
  c.fillStyle = `rgba(70,90,100,${0.06 * a})`;
  c.beginPath(); c.arc(CX, CY, front, 0, TAU); c.fill();
  for (let k = 0; k < 4; k++) {
    const r = front - k * 26;
    if (r <= 0) continue;
    c.strokeStyle = `rgba(40,55,65,${(0.55 - k * 0.12) * a})`; c.lineWidth = 3.2 - k * 0.6;
    c.beginPath();
    for (let i = 0; i <= 90; i++) {
      const ang = i / 90 * TAU, rr2 = r + Math.sin(ang * 14 + f.t * 9 + k) * 5;
      const x = CX + Math.cos(ang) * rr2, y = CY + Math.sin(ang) * rr2;
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.stroke();
  }
}
function drawFlame(e) {
  const c = ctx, t = UI.t, a = Math.min(1, e.fire * 2);
  for (let i = 0; i < 3; i++) {
    const ox = (i - 1) * e.r * 0.55, h = e.r * (1.1 + 0.45 * Math.sin(t * 13 + i * 2 + e.seed * 9)), w = e.r * 0.42;
    const x = e.x + ox, y = e.y - e.r * 0.2;
    c.fillStyle = `rgba(${i === 1 ? CINNABAR : '205,120,60'},${0.55 * a})`;
    c.beginPath();
    c.moveTo(x - w, y);
    c.quadraticCurveTo(x - w * 0.6, y - h * 0.6, x + Math.sin(t * 9 + i) * w * 0.4, y - h);
    c.quadraticCurveTo(x + w * 0.6, y - h * 0.6, x + w, y);
    c.closePath(); c.fill();
  }
}
function drawPaperMan(m) {
  const c = ctx;
  const a = Math.min(1, m.t / 0.3) * Math.min(1, m.life / 0.8);
  const sc = 1.45 * (m.t < 0.3 ? easeOutBack(m.t / 0.3) : 1);
  const tilt = m.state === 'dash' ? 0.35 * m.face : Math.sin(m.t * 7 + m.seed) * 0.12;
  c.save();
  c.translate(m.x, m.y); c.rotate(tilt); c.scale(sc * m.face, sc);
  c.fillStyle = `rgba(90,30,20,${0.12 * a})`;
  c.beginPath(); c.ellipse(1, 18, 9, 3, 0, 0, TAU); c.fill();
  c.fillStyle = `rgba(${CINNABAR},${0.95 * a})`;
  c.beginPath(); c.arc(0, -11, 5.2, 0, TAU); c.fill();                                   // 头
  c.beginPath();
  c.moveTo(-7, -5); c.lineTo(7, -5); c.lineTo(13, 1 + Math.sin(m.t * 10) * 2); c.lineTo(8, 0);   // 右臂
  c.lineTo(6, 8); c.lineTo(7, 16); c.lineTo(2, 16); c.lineTo(0, 10);                              // 右腿
  c.lineTo(-2, 16); c.lineTo(-7, 16); c.lineTo(-6, 8);                                            // 左腿
  c.lineTo(-8, 0); c.lineTo(-13, 1 - Math.sin(m.t * 10) * 2); c.closePath();                     // 左臂
  c.fill();
  c.fillStyle = `rgba(245,233,218,${0.9 * a})`;                                            // 剪纸镂空
  c.beginPath(); c.moveTo(0, -2); c.lineTo(3, 2); c.lineTo(0, 6); c.lineTo(-3, 2); c.closePath(); c.fill();
  for (const ex of [-1.8, 1.8]) { c.beginPath(); c.arc(ex, -11.5, 0.9, 0, TAU); c.fill(); }
  c.restore();
}

function polyPath(c, poly) {
  c.beginPath();
  c.moveTo(poly[0].x, poly[0].y);
  for (let i = 1; i < poly.length; i++) c.lineTo(poly[i].x, poly[i].y);
  c.closePath();
}

function drawWard(w) {
  const c = ctx, p = w.t / w.dur;
  const a = Math.min(1, w.t / 0.3) * (p > 0.8 ? (1 - p) / 0.2 : 1) * (p > 0.8 ? 0.6 + 0.4 * Math.sin(UI.t * 18) ** 2 : 1);
  polyPath(c, w.poly);
  c.fillStyle = `rgba(${CINNABAR},${0.08 * a})`; c.fill();
  c.strokeStyle = `rgba(${CINNABAR},${0.7 * a})`; c.lineWidth = 2.2; c.lineJoin = 'round'; c.stroke();
  c.save(); c.translate(2, 2); c.strokeStyle = `rgba(${CINNABAR},${0.25 * a})`; c.lineWidth = 1; c.stroke(); c.restore();
  txt('镇', w.cx, w.cy, 40, CINNABAR, 'center', 0.2 * a);
}

function drawCounter(k) {
  if (k.t < 0) return;
  const c = ctx, p = clamp(k.t / k.dur, 0, 1);
  if (!k.inked && !k.cut) {
    // 预警：红色虚线 + 从两端向印收拢的引线，两端相会时落墨
    c.setLineDash([9, 7]);
    c.strokeStyle = `rgba(${CINNABAR},${0.3 + 0.35 * Math.sin(UI.t * 12) ** 2})`; c.lineWidth = 2;
    c.beginPath(); c.moveTo(k.ax, k.ay); c.lineTo(k.bx, k.by); c.stroke();
    c.setLineDash([]);
    const mx = (k.ax + k.bx) / 2, my = (k.ay + k.by) / 2, e = p * p * 0.9 + p * 0.1;
    c.strokeStyle = `rgba(${CINNABAR},0.85)`; c.lineWidth = 3.2; c.lineCap = 'round';
    c.beginPath();
    c.moveTo(k.ax, k.ay); c.lineTo(lerp(k.ax, mx, e), lerp(k.ay, my, e));
    c.moveTo(k.bx, k.by); c.lineTo(lerp(k.bx, mx, e), lerp(k.by, my, e));
    c.stroke();
    c.fillStyle = `rgba(${CINNABAR},0.9)`;
    for (const [x, y] of [[lerp(k.ax, mx, e), lerp(k.ay, my, e)], [lerp(k.bx, mx, e), lerp(k.by, my, e)]]) { c.beginPath(); c.arc(x, y, 4.5, 0, TAU); c.fill(); }
  } else if (k.inked) {
    Art.brush(c, k.pts, 0.9 * (1 - k.fade), INK, 5);
  } else {
    const a = 1 - k.fade, half = Math.floor(k.pts.length / 2);
    const nx = -(k.by - k.ay), ny = k.bx - k.ax, l = Math.hypot(nx, ny) || 1;
    const off = k.fade * 26;
    const sh = (pts, s) => pts.map(q => ({ x: q.x + nx / l * off * s, y: q.y + ny / l * off * s, w: q.w * 0.35, l: q.l, d: 0.6 }));
    Art.brush(c, sh(k.pts.slice(0, half), 1), 0.45 * a, CINNABAR, 5);
    Art.brush(c, sh(k.pts.slice(half), -1), 0.45 * a, CINNABAR, 5);
  }
}

function drawFx() {
  const c = ctx;
  for (const f of G.fx) {
    const p = f.t / f.dur;
    switch (f.type) {
      case 'slash': {
        const a = 1 - p;
        const pts = [];
        for (let i = 0; i <= 14; i++) {
          const t = i / 14;
          pts.push({ x: lerp(f.ax, f.bx, t), y: lerp(f.ay, f.by, t), w: 4.5 * Math.sin(t * Math.PI) + 0.5, l: t * 300, d: 0.5 });
        }
        Art.brush(c, pts, 0.85 * a, INK, 9);
        c.strokeStyle = `rgba(255,252,240,${a})`; c.lineWidth = 1.3;
        c.beginPath(); c.moveTo(lerp(f.ax, f.bx, 0.08), lerp(f.ay, f.by, 0.08)); c.lineTo(lerp(f.ax, f.bx, 0.92), lerp(f.ay, f.by, 0.92)); c.stroke();
        break;
      }
      case 'feng': {
        const sc = 1 - easeOut(p) * 0.35;
        c.save(); c.translate(f.cx, f.cy); c.scale(sc, sc); c.translate(-f.cx, -f.cy);
        polyPath(c, f.poly);
        c.fillStyle = `rgba(${INK},${0.22 * (1 - p)})`; c.fill();
        c.strokeStyle = `rgba(${CINNABAR},${0.85 * (1 - p)})`; c.lineWidth = 2.5 / sc; c.stroke();
        c.restore();
        break;
      }
      case 'bolt': {
        const a = p < 0.15 ? 1 : 1 - (p - 0.15) / 0.85;
        c.lineJoin = 'round'; c.lineCap = 'round';
        c.beginPath(); c.moveTo(f.pts[0].x, f.pts[0].y); for (let i = 1; i < f.pts.length; i++) c.lineTo(f.pts[i].x, f.pts[i].y);
        c.strokeStyle = `rgba(${INK},${0.14 * a})`; c.lineWidth = 12; c.stroke();
        c.strokeStyle = `rgba(${INK},${0.95 * a})`; c.lineWidth = 3.4 * a + 0.8; c.stroke();
        c.strokeStyle = `rgba(255,252,240,${0.7 * a})`; c.lineWidth = 0.8; c.stroke();
        const e = f.pts[f.pts.length - 1];
        c.fillStyle = `rgba(${INK},${0.5 * a})`; c.beginPath(); c.arc(e.x, e.y, 10 * (1 - p) + 3, 0, TAU); c.fill();
        break;
      }
      case 'wave': {
        for (let k = 0; k < 3; k++) {
          const off = p * 90 + k * 20, a = (1 - p) * (0.55 - k * 0.14);
          if (a <= 0) continue;
          c.strokeStyle = `rgba(40,50,60,${a})`; c.lineWidth = 2.6 - k * 0.6;
          c.beginPath();
          f.pts.forEach((q, i) => {
            const x = q.x + f.dx * off, y = q.y + f.dy * off + Math.sin(i * 0.5 + p * 8) * 2;
            i ? c.lineTo(x, y) : c.moveTo(x, y);
          });
          c.stroke();
        }
        break;
      }
      case 'ring': {
        c.strokeStyle = `rgba(${INK},${0.5 * (1 - p)})`; c.lineWidth = 2;
        c.beginPath(); c.arc(f.x, f.y, f.r * easeOut(p), 0, TAU); c.stroke();
        break;
      }
      case 'blot': {
        c.strokeStyle = `rgba(${INK},${0.4 * (1 - p)})`; c.lineWidth = 1.5;
        c.beginPath(); c.arc(f.x, f.y, f.r * (1 + p * 0.6), 0, TAU); c.stroke();
        break;
      }
      case 'burst': {
        // 群封墨爆：朱边墨圈外扩；五只以上加飞溅墨线，八只以上再一圈
        const e = easeOut(Math.min(1, p * 1.3)), a = 1 - p, R0 = f.r * (1 + 0.32 * e);
        c.strokeStyle = `rgba(${CINNABAR},${0.75 * a})`; c.lineWidth = 3 + f.tier;
        c.beginPath(); c.arc(f.x, f.y, R0, 0, TAU); c.stroke();
        c.strokeStyle = `rgba(${INK},${0.35 * a})`; c.lineWidth = 8 + 3 * f.tier;
        c.beginPath(); c.arc(f.x, f.y, R0 - 6, 0, TAU); c.stroke();
        if (f.tier >= 2) {
          const n = 10 + 6 * f.tier;
          c.strokeStyle = `rgba(${INK},${0.55 * a})`; c.lineCap = 'round';
          for (let i = 0; i < n; i++) {
            const ang = i / n * TAU + f.x * 0.01, l0 = R0 + 4, l1 = R0 + 10 + 22 * e * (0.6 + 0.4 * Math.sin(i * 7.3));
            c.lineWidth = 2.4 * a + 0.6;
            c.beginPath(); c.moveTo(f.x + Math.cos(ang) * l0, f.y + Math.sin(ang) * l0); c.lineTo(f.x + Math.cos(ang) * l1, f.y + Math.sin(ang) * l1); c.stroke();
          }
        }
        if (f.tier >= 3) {
          c.strokeStyle = `rgba(${CINNABAR},${0.45 * a})`; c.lineWidth = 1.6;
          c.beginPath(); c.arc(f.x, f.y, R0 * (1 + 0.25 * e), 0, TAU); c.stroke();
        }
        break;
      }
      case 'split': {
        // 截断的墨弹：两截向两侧飞开、淡去
        const l = Math.hypot(f.vx, f.vy) || 1, ux = f.vx / l, uy = f.vy / l, e = easeOut(p), a = 1 - p;
        for (const sd of [-1, 1]) {
          const x = f.x + (-uy * sd * 16 + ux * 10) * e, y = f.y + (ux * sd * 16 + uy * 10) * e;
          c.save(); c.translate(x, y); c.rotate(Math.atan2(uy, ux) + sd * 0.9 * e);
          c.fillStyle = `rgba(${INK},${0.85 * a})`;
          c.beginPath(); c.arc(0, 0, f.r * 0.8, sd < 0 ? Math.PI : 0, sd < 0 ? TAU : Math.PI); c.closePath(); c.fill();
          c.restore();
        }
        c.strokeStyle = `rgba(255,252,240,${0.9 * a})`; c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(f.x - uy * 12, f.y + ux * 12); c.lineTo(f.x + uy * 12, f.y - ux * 12); c.stroke();
        break;
      }
      case 'gap': {
        // 差一点合拢：首尾之间画一道朱色虚线，告诉玩家缺口在哪
        const a = p < 0.2 ? p / 0.2 : 1 - (p - 0.2) / 0.8;
        c.setLineDash([4, 5]); c.strokeStyle = `rgba(${CINNABAR},${0.7 * a})`; c.lineWidth = 2;
        c.beginPath(); c.moveTo(f.ax, f.ay); c.lineTo(f.bx, f.by); c.stroke(); c.setLineDash([]);
        break;
      }
      case 'fly': {
        const e = easeOut(p) * easeOut(p);
        const x = lerp(f.x, 60, e), y = lerp(f.y, 29, e) - Math.sin(p * Math.PI) * 30;
        c.fillStyle = `rgba(${INK},${0.85 * (1 - p * 0.5)})`;
        c.beginPath(); c.arc(x, y, 3.5 * (1 - p * 0.5), 0, TAU); c.fill();
        break;
      }
      default: break;
    }
  }
}

function drawPops() {
  const c = ctx;
  for (const p of G.pops) {
    const q = p.t / p.dur;
    if (p.kind === 'num') {
      txt(p.text, p.x, p.y - q * 26, p.size, p.col, 'center', 1 - q * q);
    } else if (p.kind === 'char') {
      const sc = 1.5 - 0.5 * easeOutBack(Math.min(1, q * 4));
      const a = q < 0.6 ? 1 : 1 - (q - 0.6) / 0.4;
      c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.scale(sc, sc);
      txt(p.text, 3, 4, p.size, INK, 'center', 0.14 * a);
      txt(p.text, 0, 0, p.size, INK, 'center', 0.92 * a);
      c.restore();
    } else {
      const sc = q < 0.12 ? lerp(1.8, 1, easeOut(q / 0.12)) : 1;
      const a = q < 0.7 ? 1 : 1 - (q - 0.7) / 0.3;
      const s = p.size;
      c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.scale(sc, sc);
      c.fillStyle = `rgba(${CINNABAR},${0.9 * a})`;
      Art.roundRect(c, -s * 0.6, -s * 0.6, s * 1.2, s * 1.2, s * 0.08); c.fill();
      c.strokeStyle = `rgba(245,233,218,${0.85 * a})`; c.lineWidth = s * 0.04;
      Art.roundRect(c, -s * 0.5, -s * 0.5, s, s, s * 0.04); c.stroke();
      txt(p.text, 0, s * 0.03, s * 0.72, '245,233,218', 'center', a);
      c.restore();
    }
  }
}
