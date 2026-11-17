'use strict';
// 墨灵 · 游戏 6/13 · zi：字诀：书写、成字、火 / 山 / 水 / 人的效果与纸人

// —— 字诀 ——
// 笔意满时点印入定：光阴几乎停住，在米字格里写一个真字；停笔片刻即识字。
function ziBox() {
  const S = Math.min(W * 0.86, H * 0.62);   // 竖屏时格子放大，便于手指书写
  return { x: CX - S / 2, y: CY - S / 2, S };
}
function enterZi() {
  if (screen !== 'play' || !ziReady()) return;
  cancelStroke();
  G.zj = { t: 0, limit: ziLimit(), strokes: [], cur: null, idle: 0, fading: [], msg: null, msgT: 0, tries: 0, lastT: 0 };
  G.hint = null;
  if (G.flog) G.flog.zi.open++;
  Sound.ziEnter();
}
function zjPoint(x, y, t) {
  const z = G.zj, s = z.cur;
  const lp = s.pts[s.pts.length - 1];
  const d = Math.hypot(x - lp.x, y - lp.y);
  if (d < 2) return;
  const dtp = Math.max(4, t - z.lastT) / 1000;
  s.speed = s.speed * 0.6 + (d / dtp) * 0.4;
  z.lastT = t;
  s.len += d;
  const tw = clamp(15 - (s.speed - 100) * 0.006, 5, 15);
  s.w = s.w * 0.6 + tw * 0.4;
  s.pts.push({ x, y, w: s.w * 0.5, l: s.len, d: clamp((s.speed - 1100) / 2000, 0, 0.3) });
  Sound.brush(s.speed, true);
}
function zjDown(x, y, t) {
  const z = G.zj;
  if (!z || z.cur) return;
  z.cur = { pts: [{ x, y, w: 5, l: 0, d: 0 }], len: 0, speed: 0, w: 10, seed: Math.random() * 50 };
  z.lastT = t; z.idle = 0;
}
function zjUp() {
  const z = G.zj;
  if (!z || !z.cur) return;
  const s = z.cur;
  if (s.pts.length === 1) { const p = s.pts[0]; s.pts[0].w = 6; s.pts.push({ x: p.x + 4, y: p.y + 6, w: 4, l: 7, d: 0 }); }   // 一点
  z.strokes.push(s); z.cur = null; z.idle = 0;
  Sound.brush(0, false);
}
function undoZi() {
  const z = G.zj;
  if (!z || z.cur || !z.strokes.length) return;
  const s = z.strokes.pop();
  z.fading.push({ s, t: 0 });
  z.idle = 0;
  Sound.dry();
}
function cancelZi() {
  if (!G.zj) return;
  if (G.flog) G.flog.zi.cancel++;
  for (const s of G.zj.strokes) G.oldStrokes.push({ pts: s.pts, t: 0.2, seed: s.seed, kind: 'cancel', stamped: true });
  G.zj = null;
  Sound.brush(0, false);
}
function finishZi() {
  const z = G.zj;
  if (!z) return;
  if (z.cur) zjUp();
  if (!z.strokes.length) { cancelZi(); return; }
  const res = Glyph.recognize(z.strokes.map(s => s.pts), ziKnown());
  if (res.key) castZi(res.key);
  else failZi();
}
function failZi() {
  const z = G.zj;
  z.tries++;
  if (G.flog) G.flog.zi.fail++;
  for (const s of z.strokes) z.fading.push({ s, t: 0 });
  z.strokes = []; z.idle = 0;
  Sound.ziFail();
  if (z.limit - z.t < 2) {
    G.zj = null;
    G.yi = YI_MAX * 0.6;
    pop('字不成形 · 笔意散去四成', CX, CY - 70, 18, CINNABAR, 1.6, 'num');
    return;
  }
  z.msg = ziKnown().length === 1 ? '字不成形 —— 照着描红再写' : '字不成形 —— 再写一次';
  z.msgT = 0;
}
function castZi(key) {
  const z = G.zj;
  G.zj = null;
  G.yi = lv('kuang') ? YI_MAX * 0.2 : 0;
  G.stats.zi++;
  G.ziSet[key] = 1;
  Sound.duck(0.3, 1.6);
  if (G.flog) { G.flog.zi.ok++; G.flog.zi.keys[key] = (G.flog.zi.keys[key] || 0) + 1; }
  if (ZI_ORDER.every(k => G.ziSet[k])) award('sizi');
  const B = ziBox();
  G.ziFx = { key, strokes: z.strokes, t: 0, applied: false, box: B };
  Sound.ziCast(key);
  // 字迹淡淡留在纸上，右下落一方朱印
  stain(c => {
    for (const s of z.strokes) Art.brush(c, s.pts, 0.08, INK, s.seed);
    c.save(); c.translate(B.x + B.S - 30, B.y + B.S - 30); c.rotate(-0.08);
    c.fillStyle = `rgba(${CINNABAR},0.3)`; Art.roundRect(c, -15, -15, 30, 30, 3); c.fill();
    c.font = `bold 20px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = 'rgba(245,233,218,0.5)'; c.fillText(ZI[key].ch, 0, 1);
    c.restore();
  });
}
function updateZi(rdt) {
  const z = G.zj;
  if (!z) return;
  z.t += rdt; z.msgT += rdt;
  for (const f of z.fading) f.t += rdt;
  z.fading = z.fading.filter(f => f.t < 0.6);
  if (!z.cur && z.strokes.length) {
    z.idle += rdt;
    if (z.idle >= ZI_IDLE) { finishZi(); return; }
  }
  if (z.t >= z.limit) {
    if (z.cur) zjUp();
    if (z.strokes.length) finishZi(); else cancelZi();
  }
}
function updateZiFx(rdt) {
  const f = G.ziFx;
  if (!f) return;
  f.t += rdt;
  if (!f.applied && f.t >= ZI_APPLY) {
    f.applied = true;
    if (screen === 'play') applyZi(f.key);
  }
  if (f.t >= 1.5) G.ziFx = null;
}
function applyZi(key) {
  markInsight('zi_' + key, 'kuang');
  const Z = ZI[key];
  stampPop(Z.ch, CX, CY - Math.min(W, H) * 0.2, 84);
  G.hitStop = Math.max(G.hitStop, 0.08);
  G.ziKill = { t: G.time, n: 0 };
  buzz(45, true);
  if (key === 'huo') ziHuo();
  else if (key === 'shan') ziShan();
  else if (key === 'shui') ziShui();
  else ziRen();
}

function flameParts(x, y, n, spread) {
  for (let i = 0; i < n && G.parts.length < partCap(); i++) {
    G.parts.push({ x: x + vr(-spread, spread), y: y + vr(-spread, spread) * 0.6, vx: vr(-30, 30), vy: vr(-150, -50), r: vr(1.2, 3.4), life: vr(0.3, 0.7), stamp: false, col: Math.random() < 0.65 ? CINNABAR : '200,110,60' });
  }
}
function ziHuo() {
  const segs = [];
  for (const e of G.enemies) {
    if (e.dead) continue;
    if (e.type === 'seg') { segs.push(e); continue; }
    flameParts(e.x, e.y, 10, e.r);
    if (damage(e, e.boss ? 4 : 2, 'zi', e.x - CX, e.y - CY) && !e.dead) { e.fire = e.boss ? 2.2 : 3.2; e.fireT = 0; }
  }
  if (segs.length && G.boss && G.boss.chains) {
    const heads = new Set(G.boss.chains.map(ch => ch.segs[0]));
    shuffle(segs.filter(s => !heads.has(s))).slice(0, 3).forEach(s => {
      flameParts(s.x, s.y, 14, s.r);
      if (damage(s, 1, 'zi', 0, 0) && !s.dead) { s.fire = 1.6; s.fireT = 0; }
    });
  }
  for (const sh of G.shots) if (!sh.dead) { flameParts(sh.x, sh.y, 4, 4); cutShot(sh, true); }
  UI.flash = 0.75; UI.flashCol = '255,214,170'; UI.shake = Math.max(UI.shake, 0.8);
}
function ziShan() {
  const n = 11, peaks = [];
  for (let i = 0; i < n; i++) peaks.push({ a: i / n * TAU + rr(-0.08, 0.08), w: rr(40, 58), h: rr(36, 58), seed: rnd() * 10, delay: rr(0, 0.18) });
  G.shan = { t: 0, dur: 10, r: 104, peaks };
  UI.shake = Math.max(UI.shake, 0.9);
  for (const sh of G.shots) if (!sh.dead && Math.hypot(sh.x - CX, sh.y - CY) < 150) cutShot(sh, true);
}
function ziShui() {
  G.flood = { t: 0, dur: 1.5, R: Math.hypot(W, H) / 2 + 60, hit: new Set() };
  G.ink = inkMax();
  for (const sh of G.shots) if (!sh.dead) cutShot(sh, true);
  UI.flash = 0.4; UI.flashCol = '220,230,236';
  pop('墨量回满', CX, CY + SEAL_SIZE * 0.5 + 34, 16, INK, 1.4, 'num');
}
function ziRen() {
  G.allies = [0, 1, 2].map(i => ({ a: i / 3 * TAU, x: CX, y: CY, vx: 0, vy: 0, state: 'orbit', tgt: null, cd: 0.25 + i * 0.2, life: 12, t: 0, seed: rnd() * 10, face: 1 }));
  for (const m of G.allies) { m.x = CX + Math.cos(m.a) * 20; m.y = CY + Math.sin(m.a) * 20; }
}

function updateFlood(dt) {
  const f = G.flood;
  if (!f) return;
  f.t += dt;
  const front = f.R * easeOut(Math.min(1, f.t / 1.1));
  for (const e of G.enemies) {
    if (e.dead || f.hit.has(e)) continue;
    const dx = e.x - CX, dy = e.y - CY, d = Math.hypot(dx, dy) || 1;
    if (d > front) continue;
    f.hit.add(e);
    e.wet = 6;
    if (!e.boss) { e.kx += dx / d * 560; e.ky += dy / d * 560; e.stun = Math.max(e.stun, 0.8); }
    if (e.type !== 'seg') damage(e, e.boss ? 2 : 1, 'zi', dx, dy);
  }
  if (f.t >= f.dur) G.flood = null;
}
function pickAllyTarget(m) {
  const taken = new Set(G.allies.filter(o => o !== m && o.tgt).map(o => o.tgt));
  let best = null, bd = Infinity;
  for (const pass of [0, 1, 2]) {
    for (const e of G.enemies) {
      if (e.dead || e.x < -20 || e.x > W + 20 || e.y < -20 || e.y > H + 20) continue;
      if (pass < 2 && e.boss) continue;           // 先护印、清小妖，无小妖时才扑向首领
      if (pass === 0 && taken.has(e)) continue;   // 尽量各打各的
      if (isImmune(e, 'ren')) continue;
      const d = Math.hypot(e.x - CX, e.y - CY);
      if (d < bd) { bd = d; best = e; }
    }
    if (best) return best;
  }
  return null;
}
function updateAllies(dt) {
  if (!G.allies.length) return;
  for (const m of G.allies) {
    m.t += dt; m.life -= dt; m.cd -= dt;
    if (m.tgt && (m.tgt.dead || isImmune(m.tgt, 'ren'))) { m.tgt = null; m.state = 'orbit'; }
    let tx, ty, spd;
    if (m.state === 'dash' && m.tgt) {
      tx = m.tgt.x; ty = m.tgt.y; spd = 560;
      if (Math.hypot(tx - m.x, ty - m.y) < m.tgt.r + 12) {
        const e = m.tgt;
        damage(e, 1, 'ren', e.x - m.x, e.y - m.y);
        sparks(e.x, e.y, 5);
        Sound.cut(panOf(e.x));
        m.cd = e.boss ? 1.1 : 0.4; m.tgt = null; m.state = 'orbit';
      }
    } else {
      m.a += dt * 1.7;
      tx = CX + Math.cos(m.a) * 78; ty = CY + Math.sin(m.a) * 78; spd = 320;
      if (m.cd <= 0 && m.life > 0.8) { m.tgt = pickAllyTarget(m); if (m.tgt) m.state = 'dash'; else m.cd = 0.3; }
    }
    const dx = tx - m.x, dy = ty - m.y, d = Math.hypot(dx, dy);
    const step = Math.min(d, spd * dt);
    if (d > 0.01) { m.x += dx / d * step; m.y += dy / d * step; if (Math.abs(dx) > 2) m.face = dx > 0 ? 1 : -1; }
    for (const sh of G.shots) if (!sh.dead && Math.hypot(sh.x - m.x, sh.y - m.y) < 18) cutShot(sh, true);
  }
  G.allies = G.allies.filter(m => m.life > 0);
}
