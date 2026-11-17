'use strict';
// 墨灵 · 游戏 7/13 · boss：首领：墨蛟、蠹母、墨魇

// —— Boss ——
function newChain(segs, head) {
  return { segs, head, theta: Math.atan2(segs[0].y - CY, segs[0].x - CX), orbitR: Math.min(W, H) * 0.42, spin: rnd() < 0.5 ? 1 : -1, lunge: 0, lungeT: rr(5, 8), teleT: 0, phase: rnd() * 6, seed: rnd() * 20 };
}
function spawnBoss(type) {
  const hm = hpMul();
  Sound.roar(); Sound.setTension(true);
  UI.shake = Math.max(UI.shake, 0.6);
  if (type === 'jiao') {
    const n = 20, segs = [], side = rnd() < 0.5 ? -1 : 1, sy = CY + rr(-0.2, 0.2) * H;
    for (let i = 0; i < n; i++) {
      const hp = Math.round((i === 0 ? 6 : 4) * hm);
      segs.push({ type: 'seg', boss: true, x: side < 0 ? -30 - i * 20 : W + 30 + i * 20, y: sy, r: 17 - i * 0.45, hp, maxHp: hp, t: 0, seed: rnd(), kx: 0, ky: 0, stun: 0, flash: 0, dir: side < 0 ? 0 : Math.PI, dead: false, value: 20, drops: 1, burnT: 0, slow: 1 });
    }
    for (const s of segs) G.newEnemies.push(s);
    const ch = newChain(segs, side < 0 ? 0 : Math.PI);
    ch.lungeT = 6;
    G.boss = { type, name: BOSS_NAME[type], chains: [ch], maxHp: segs.reduce((a, s) => a + s.hp, 0), t: 0, addT: 8 };
  } else if (type === 'mu') {
    const a = rr(0, TAU), far = Math.max(W, H) * 0.7;
    const e = spawnEnemy('du', CX + Math.cos(a) * far, CY + Math.sin(a) * far);
    const hp = Math.round(64 * hm);
    Object.assign(e, { type: 'mu', boss: true, r: 46, hp, maxHp: hp, value: 600, drops: 10, shell: true, shellT: 0, ang: a, orbitR: Math.min(W, H) * 0.3, enter: 0, birthT: 4, spitT: 3, phase: 1, charging: false });
    G.boss = { type, name: BOSS_NAME[type], e, maxHp: hp, t: 0 };
  } else {
    const e = spawnEnemy('du', CX, CY - Math.min(W, H) * 0.33);
    const hp = Math.round(48 * hm);
    Object.assign(e, { type: 'yan', boss: true, r: 40, hp, maxHp: hp, value: 1000, drops: 12, alpha: 0, fade: 'in', hits: 0, tpT: 6, phase: 1, bx: e.x, by: e.y });
    G.boss = { type, name: BOSS_NAME[type], e, maxHp: hp, t: 0, castT: 3, summonT: 8 };
  }
}
function bossHp() {
  const B = G.boss;
  if (!B) return 0;
  if (B.type === 'jiao') { let s = 0; for (const ch of B.chains) for (const g of ch.segs) if (!g.dead) s += Math.max(0, g.hp); return s; }
  return Math.max(0, B.e.hp);
}
function updateBoss(dt) {
  const B = G.boss;
  B.t += dt;
  if (B.type === 'jiao') updateJiao(B, dt);
  else if (B.type === 'mu') updateMu(B, dt);
  else updateYan(B, dt);
}
function updateJiao(B, dt) {
  const next = [];
  for (const ch of B.chains) {
    const runs = [];
    let run = [];
    for (const s of ch.segs) { if (s.dead) { if (run.length) runs.push(run); run = []; } else run.push(s); }
    if (run.length) runs.push(run);
    for (const r of runs) {
      if (r.length < 2) { for (const s of r) kill(s, 'split', 0, 0); continue; }
      if (r[0] === ch.segs[0]) { ch.segs = r; next.push(ch); }
      else {
        const nc = newChain(r, Math.atan2(r[0].y - r[1].y, r[0].x - r[1].x));
        nc.spin = -ch.spin;
        nc.orbitR = clamp(Math.hypot(r[0].x - CX, r[0].y - CY), 150, Math.min(W, H) * 0.45);
        nc.lungeT = rr(3.5, 6);
        next.push(nc);
      }
    }
  }
  B.chains = next;
  if (!next.length) { bossDefeated(null); return; }
  for (const ch of B.chains) moveChain(ch, dt);
  B.addT -= dt;
  if (B.addT <= 0) {
    B.addT = 9;
    const side = ri(0, 3), u = rr(0.2, 0.8);
    for (let i = 0; i < 3; i++) { const p = edgePos(side, u, rr(-30, 30), rr(0, 30)); spawnEnemy('du', p.x, p.y); }
  }
}
function moveChain(ch, dt) {
  const h = ch.segs[0], len = ch.segs.length;
  let spd = (88 + (20 - len) * 5) * speedMul() * (h.slow || 1);
  let tx = CX, ty = CY;
  if (ch.lunge === 1) {
    ch.teleT -= dt; spd *= 0.35;
    if (ch.teleT <= 0) ch.lunge = 2;
  } else if (ch.lunge === 2) {
    spd *= 3.4;
  } else {
    ch.theta += ch.spin * spd / Math.max(80, ch.orbitR) * dt;
    ch.orbitR = Math.max(150, ch.orbitR - 7 * dt);
    tx = CX + Math.cos(ch.theta) * ch.orbitR; ty = CY + Math.sin(ch.theta) * ch.orbitR;
    ch.lungeT -= dt;
    if (ch.lungeT <= 0) { ch.lunge = 1; ch.teleT = 1.0; Sound.roar(); }
  }
  const want = Math.atan2(ty - h.y, tx - h.x) + (ch.lunge ? 0 : Math.sin(G.time * 2.6 + ch.phase) * 0.55);
  ch.head = turnToward(ch.head, want, (ch.lunge === 2 ? 4 : 2.6) * dt);
  h.x += Math.cos(ch.head) * spd * dt; h.y += Math.sin(ch.head) * spd * dt;
  h.dir = ch.head;
  for (let i = 1; i < len; i++) {
    const p = ch.segs[i - 1], s = ch.segs[i];
    const sp = (p.r + s.r) * 0.62;
    const dx = s.x - p.x, dy = s.y - p.y, d = Math.hypot(dx, dy) || 1;
    if (d > sp) { s.x = p.x + dx / d * sp; s.y = p.y + dy / d * sp; }
    s.dir = Math.atan2(p.y - s.y, p.x - s.x);
  }
  const hitR = G.shan ? G.shan.r + h.r * 0.4 : SEAL_R + h.r * 0.8;
  if (Math.hypot(h.x - CX, h.y - CY) < hitR) {
    if (G.shan) { Sound.clink(panOf(h.x)); sparks(h.x, h.y, 8); pop('山屏', h.x, h.y - 30, 18, INK, 0.7, 'num'); }
    else sealHit(1, 'jiao');
    ch.lunge = 0; ch.lungeT = rr(6, 9);
    ch.theta = Math.atan2(h.y - CY, h.x - CX);
    ch.head = ch.theta; ch.orbitR = Math.min(W, H) * 0.42;
    const back = (G.shan ? G.shan.r : SEAL_R) + h.r + 16;
    h.x = CX + Math.cos(ch.theta) * back; h.y = CY + Math.sin(ch.theta) * back;
    inkParts(h.x, h.y, 16, h.x - CX, h.y - CY, 1.2);
  }
}
function updateMu(B, dt) {
  const e = B.e;
  if (e.dead) return;
  const sm = speedMul();
  const phase2 = e.hp < e.maxHp * 0.5;
  if (phase2 && e.phase === 1) { e.phase = 2; Sound.roar(); charPop('怒', e.x, e.y - 84, 60); UI.shake = Math.max(UI.shake, 0.6); }
  e.ang += 0.12 * dt * sm * (phase2 ? 1.4 : 1) * (e.slow || 1);
  const tx = CX + Math.cos(e.ang) * e.orbitR, ty = CY + Math.sin(e.ang) * e.orbitR;
  e.enter = Math.min(1, e.enter + dt * 0.33);
  const k = Math.min(1, dt * (e.enter < 1 ? 0.8 : 2));
  e.x += (tx - e.x) * k; e.y += (ty - e.y) * k;
  e.dir = Math.atan2(CY - e.y, CX - e.x);
  if (!e.shell) { e.shellT -= dt; if (e.shellT <= 0) { e.shell = true; Sound.clink(panOf(e.x)); pop('壳复', e.x, e.y - e.r - 24, 16, '90,80,70', 0.8, 'num'); } }
  if (e.enter < 0.75) return;
  e.birthT -= dt;
  e.sinceSpit = (e.sinceSpit == null ? 9 : e.sinceSpit) + dt;
  // 留缝：产卵不与吐墨挤在一起——将吐（含张口蓄墨）前、刚吐完后都按住不产，免得两头同时要顾
  if (e.birthT <= 0 && e.spitT > MU_WIND + 0.3 && e.sinceSpit > 0.9) {
    e.birthT = phase2 ? 5 : 6.5;
    const n = phase2 ? 5 : 4;
    for (let i = 0; i < n; i++) {
      const a = e.dir + Math.PI + (i - (n - 1) / 2) * 0.6;
      spawnEnemy('du', e.x + Math.cos(a) * e.r, e.y + Math.sin(a) * e.r, { kx: Math.cos(a) * 140, ky: Math.sin(a) * 140, stun: 0.4 });
    }
    if (phase2) spawnEnemy('e', e.x, e.y, { stun: 0.2 });
    Sound.spit(panOf(e.x));
  }
  e.spitT -= dt;
  // 前摇：张口蓄墨 1.3 秒——身子鼓起、口中朱光渐大，纸上先画出每一发的去路（打到印的那几道是朱色）
  const was = e.charging;
  e.charging = e.spitT < MU_WIND;
  e.windK = e.charging ? clamp(1 - e.spitT / MU_WIND, 0, 1) : 0;
  if (e.charging && !was) Sound.charge(panOf(e.x));
  if (e.spitT <= 0) {
    e.spitT = phase2 ? 3.4 : 4.6; e.charging = false; e.windK = 0; e.sinceSpit = 0;
    const v = muVolley(e);
    for (const a of v.angs) {
      const sh = fireShot(v.ox, v.oy, v.ox + Math.cos(a) * 500, v.oy + Math.sin(a) * 500, 95 * sm);
      sh.r = 7; sh.mark = true;   // 蠹母的墨弹大一圈、带朱边，和满地小墨蠹分得开
    }
  }
}
// 一轮扇形墨弹的出口与各发方向（蓄墨时画去路、吐的时候发弹，用的是同一套）
function muVolley(e) {
  const n = e.phase === 2 ? 7 : 5, spread = e.phase === 2 ? 0.9 : 0.6;
  const ox = e.x + Math.cos(e.dir) * e.r, oy = e.y + Math.sin(e.dir) * e.r, angs = [];
  for (let i = 0; i < n; i++) angs.push(e.dir + (i / (n - 1) - 0.5) * spread);
  return { ox, oy, angs };
}
// 从 (ox, oy) 朝 a 飞的墨弹会不会打到印（山屏在时都打不到）
function rayHitsSeal(ox, oy, a, r) {
  if (G.shan) return false;
  const dx = CX - ox, dy = CY - oy, c = Math.cos(a), s = Math.sin(a);
  return dx * c + dy * s > 0 && Math.abs(dx * s - dy * c) < SEAL_R + r * 0.5;
}
function summon(n) {
  const pool = ['du', 'du', 'e', 'chan', 'jia', 'xu', 'lie'];
  for (let i = 0; i < n; i++) { const p = edgePos(ri(0, 3), rr(0.1, 0.9)); spawnEnemy(pick(pool), p.x, p.y); }
}
function makeCounter(delay) {
  const ang = rr(0, TAU), off = rr(-16, 16), R = Math.min(W, H) * 0.46;
  const ux = Math.cos(ang), uy = Math.sin(ang), nx = -uy, ny = ux;
  const c = { ax: CX - ux * R + nx * off, ay: CY - uy * R + ny * off, bx: CX + ux * R + nx * off, by: CY + uy * R + ny * off, t: -delay, dur: 1.7, inked: false, cut: false, fade: 0 };
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    pts.push({ x: lerp(c.ax, c.bx, t) + nx * Math.sin(t * 9 + ang) * 2, y: lerp(c.ay, c.by, t) + ny * Math.sin(t * 9 + ang) * 2, w: 5.5 + 2.5 * Math.sin(t * Math.PI), l: t * 2 * R, d: 0.2 });
  }
  c.pts = pts;
  G.counters.push(c);
}
function updateYan(B, dt) {
  const e = B.e;
  if (e.dead) return;
  const f = e.hp / e.maxHp;
  const ph = f > 0.66 ? 1 : f > 0.33 ? 2 : 3;
  if (ph > e.phase) {
    e.phase = ph; Sound.roar(); UI.shake = Math.max(UI.shake, 0.6);
    charPop(ph === 2 ? '怒' : '狂', e.x, e.y - 90, 64);
    summon(2 + ph);
  }
  e.x = e.bx + Math.sin(e.t * 0.9) * 14; e.y = e.by + Math.sin(e.t * 1.4) * 8;
  if (e.fade === 'out') {
    e.alpha -= dt * 3;
    if (e.alpha <= 0) {
      e.alpha = 0;
      const a = rr(0, TAU), rad = rr(0.26, 0.4) * Math.min(W, H);
      e.bx = CX + Math.cos(a) * rad; e.by = CY + Math.sin(a) * rad;
      e.fade = 'in';
    }
  } else if (e.fade === 'in') {
    e.alpha += dt * 2.5;
    if (e.alpha >= 1) { e.alpha = 1; e.fade = null; e.hits = 0; e.tpT = rr(5, 7) - ph * 0.6; }
  } else {
    e.tpT -= dt;
    if (e.tpT <= 0 || e.hits >= 3) { e.fade = 'out'; inkParts(e.x, e.y, 20, 0, 0, 1); }
  }
  if (e.alpha < 0.05) return;
  B.castT -= dt;
  if (B.castT <= 0) {
    for (let i = 0; i < ph; i++) makeCounter(i * 0.45);
    B.castT = [4.4, 3.8, 3.2][ph - 1];
  }
  B.summonT -= dt;
  if (B.summonT <= 0) { summon(2 + ph); B.summonT = 11 - ph; }
}
function bossDefeated(e) {
  const B = G.boss;
  if (!B) return;
  let x = CX, y = CY;
  if (e) { x = e.x; y = e.y; }
  else if (B.type === 'jiao' && B.lastX != null) { x = B.lastX; y = B.lastY; }
  G.boss = null;
  G.bossDown = B.type;
  award({ jiao: 'fujiao', mu: 'fumu', yan: 'fuyan' }[B.type]);
  for (const c of G.counters) if (!c.inked) { c.cut = true; c.fade = 0; }
  for (const o of G.enemies) if (!o.dead) kill(o, 'boss', o.x - x, o.y - y);
  for (const o of G.newEnemies) o.dead = true;
  for (const s of G.shots) s.dead = true;
  const bonus = 800 * Math.ceil(G.floor / 3);
  G.score += bonus;
  G.sealHp = Math.min(G.sealMax, G.sealHp + 1);
  stampPop('伏', x, y, 96);
  pop(`${B.name}伏诛 +${bonus}`, x, y + 74, 20, CINNABAR, 1.8, 'num');
  pop('印力 +1', CX, CY + 66, 16, CINNABAR, 1.6, 'num');
  for (let i = 0; i < 4; i++) splat(x + vr(-30, 30), y + vr(-30, 30), 30, vr(-1, 1), vr(-1, 1));
  UI.flash = 0.8; UI.flashCol = '255,255,250'; UI.shake = 1;
  G.hitStop = 0.25;
  Sound.bossDown(); Sound.setTension(false);
  buzz([80, 60, 160], true);
}
