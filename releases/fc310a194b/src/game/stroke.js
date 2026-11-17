'use strict';
// 墨灵 · 游戏 5/13 · stroke：落笔（笔迹、墨耗、触碰）；笔法：斩、封、点、雷、浪、镇

// —— 落笔 ——
function beginStroke(x, y, t) {
  if (G.ink > BR().inkMax) markInsight('yan');
  markInsight('ding');
  if (G.ink < 1.5) { pop('墨尽', x, y - 20, 18, INK, 0.7, 'num'); Sound.dry(); if (G.flog) G.flog.dry++; return; }
  G.stroke = { id: ++G.strokeId, rt0: UI.t, t0: t, pts: [], hit: new Set(), len: 0, cost: 1, lastT: t, lastMoveRT: UI.t, stillT: 0, blot: 0, moved: false, done: false, proc: 1, speed: 0, w: 10, seed: Math.random() * 50, dryOut: false };
  G.ink -= 1;
  G.stroke.lowInk = G.ink < inkMax() * 0.2;   // 枯笔之印：落笔时墨不足两成
  pushPt(x, y);
  G.stats.strokes++;
}
function pushPt(x, y) {
  const s = G.stroke;
  const inkF = clamp(G.ink / inkMax(), 0, 1);
  const tw = clamp(16 - (s.speed - 120) * 0.0075, 4, 16) * (0.7 + 0.3 * Math.min(1, inkF * 3.3)) * BR().w;
  s.w = s.pts.length ? s.w * 0.62 + tw * 0.38 : tw;
  const dry = Math.min(0.95, clamp((0.3 - inkF) / 0.3, 0, 1) * 0.75 + clamp((s.speed - 900) / 1800, 0, 0.35) + (BR().dry || 0));
  s.pts.push({ x, y, w: s.w * 0.5, l: s.len, d: dry, t: s.lastT });   // t：识别时量拐角减速
}
function moveStroke(x, y, t) {
  const s = G.stroke;
  if (!s || s.done) return;
  const lp = s.pts[s.pts.length - 1];
  let d = Math.hypot(x - lp.x, y - lp.y);
  if (d < 1.5) return;
  const dtp = Math.max(4, t - s.lastT) / 1000;
  s.speed = s.speed * 0.6 + (d / dtp) * 0.4;
  s.lastT = t; s.lastMoveRT = UI.t; s.stillT = 0;
  let cost = d * INK_PER_UNIT * BR().ink;
  if (cost >= G.ink) {
    const f = Math.max(0, G.ink) / cost;
    x = lp.x + (x - lp.x) * f; y = lp.y + (y - lp.y) * f; d *= f; cost = Math.max(0, G.ink); s.dryOut = true;
  }
  G.ink -= cost; s.cost += cost; s.len += d;
  if (s.len > 10) s.moved = true;
  pushPt(x, y);
  Sound.brush(s.speed, true);
  if (s.dryOut) { pop('墨尽', x, y - 18, 16, INK, 0.6, 'num'); Sound.dry(); if (G.flog) G.flog.dry++; endStroke(); }
}
function updateStroke(rdt) {
  const s = G.stroke;
  if (!s || s.done) return;
  if (UI.t - s.lastMoveRT > 0.06) { s.speed *= Math.exp(-rdt * 10); Sound.brush(s.speed, true); }
  if (!s.moved) {
    s.stillT += rdt;
    const DI = BR().dian;
    if (s.stillT > 0.12 && s.blot < DI.max) {
      const c = rdt * 16 * BR().ink;
      if (G.ink >= c) { G.ink -= c; s.cost += c; s.blot = Math.min(DI.max, Math.max(10, s.blot) + rdt * DI.rate); }
      else endStroke();
    }
  } else if (UI.t - s.lastMoveRT > 0.18) {
    const lp = s.pts[s.pts.length - 1];
    if (lp.w < 9) { lp.w += rdt * 6; const c = rdt * 6; G.ink = Math.max(0, G.ink - c); s.cost += c; }
  }
}
function processContacts() {
  const s = G.stroke;
  if (!s || s.done) return;
  const P = s.pts;
  const dmg = brushDmg();
  for (let i = Math.max(1, s.proc); i < P.length; i++) {
    const a = P[i - 1], b = P[i];
    const bw = b.w + 2, kx = b.x - a.x, ky = b.y - a.y;
    for (const e of G.enemies) {
      if (e.dead || s.hit.has(e)) continue;
      if (distToSeg(e.x, e.y, a.x, a.y, b.x, b.y) < e.r + bw) { s.hit.add(e); if (!glances(e, kx, ky)) damage(e, dmg, 'brush', kx, ky); }
    }
    for (const sh of G.shots) if (!sh.dead && !sh.rev && !sh.held && distToSeg(sh.x, sh.y, a.x, a.y, b.x, b.y) < sh.r + bw + 2) {
      // 会「浪」时，笔锋碰到的墨弹先拦住，收笔再定：成浪则倒卷回去，否则照常截断
      if (G.up.lang) { sh.held = s.id; (s.held || (s.held = [])).push(sh); } else cutPenShot(sh);
    }
    for (const d of G.drops) if (!d.dead && distToSeg(d.x, d.y, a.x, a.y, b.x, b.y) < pickR()) collectDrop(d);
    for (const c of G.counters) {
      if (!c.cut && !c.inked && c.t > 0 && segIntersect(a.x, a.y, b.x, b.y, c.ax, c.ay, c.bx, c.by)) cutCounter(c, b.x, b.y);
    }
  }
  s.proc = P.length;
}
function endStroke() {
  const s = G && G.stroke;
  if (!s || s.done) return;
  if (screen === 'play') processContacts();
  s.done = true;
  Sound.brush(0, false);
  let res;
  if (!s.moved) res = { kind: 'dian', P: [s.pts[0]], L: 0, corners: [] };
  else res = Gesture.classify(s.pts, { unlocked: { lei: !!G.up.lei, lang: !!G.up.lang, zhen: !!G.up.zhen } });
  if (res.kind === 'zhan' && BR().noZhan) res = Object.assign({}, res, { kind: 'fu' });
  s.kind = res.kind;
  if (screen === 'play') applyTech(res, s);
  if (s.held) for (const sh of s.held) if (!sh.dead && sh.held === s.id) { sh.held = 0; cutPenShot(sh); }
  if ((s.kills || 0) >= 3 && s.lowInk) award('kubi');
  if ((s.kills || 0) >= 3) buzz(Math.min(70, 20 + 10 * s.kills), true);
  const f = G.flog;
  if (f && res.bend && f.bends && f.bends.length < 80) { const b = res.bend; f.bends.push([res.kind, b.n, Math.round(b.span), Math.round(b.gap), b.vr == null ? null : Math.round(b.vr * 100)]); }
  if (f) { f.strokes++; f.techs[res.kind] = (f.techs[res.kind] || 0) + 1; f.len += s.len; f.dur += Math.max(UI.t - (s.rt0 || UI.t), (s.lastT - s.t0) / 1000 || 0); if (s.hit.size) f.hits++; f.multi = Math.max(f.multi, s.kills || 0); }
  G.oldStrokes.push({ pts: s.pts, t: 0, seed: s.seed, kind: res.kind, stamped: false });
  G.stroke = null;
  return res.kind;
}
function cancelStroke() {
  if (!G || !G.stroke) return;
  if (G.stroke.held) for (const sh of G.stroke.held) sh.held = 0;   // 拦住的墨弹放走
  G.oldStrokes.push({ pts: G.stroke.pts, t: 0.2, seed: G.stroke.seed, kind: 'cancel', stamped: false });
  G.stroke = null;
  Sound.brush(0, false);
}

// —— 笔法 ——
function applyTech(res, s) {
  const k = res.kind;
  G.stats.techs[k] = (G.stats.techs[k] || 0) + 1;
  if (['lei', 'lang', 'zhen'].includes(k)) markInsight(k);
  switch (k) {
    case 'dian': techDian(s); break;
    case 'zhan': techZhan(res); break;
    case 'feng': techFeng(res, s); break;
    case 'lei': techLei(res); break;
    case 'lang': techLang(res); break;
    case 'zhen': techZhen(res); break;
    default: {
      if (s.hit.size) Sound.swish(0.3, panOf(s.pts[s.pts.length - 1].x));
      const lockedTip = res.shape === 'zig' && !G.up.lei ? '雷' : res.shape === 'wave' && !G.up.lang ? '浪' : null;
      if (lockedTip && G.flog) G.flog.locked++;
      if (res.near && !lockedTip) nearClosed(res, s);
      if (lockedTip && G.time - G.lockTipT > 4) {
        G.lockTipT = G.time;
        const p = s.pts[s.pts.length - 1];
        pop(`尚未习得「${lockedTip}」`, p.x, p.y - 24, 16, '90,80,70', 1.2, 'num');
      }
    }
  }
  if (k === 'feng' && res.isTri && !G.up.zhen && G.time - G.lockTipT > 4) {
    G.lockTipT = G.time;
    const c = centroidOf(res.poly);
    pop('三角为「镇」，尚未习得', c.x, c.y + 70, 15, '90,80,70', 1.2, 'num');
  }
}

// 画圈差一点合拢：在缺口处标一道虚线、提示一句（三秒内只提示一次），并记进试玩记录
function nearClosed(res, s) {
  if (G.flog) G.flog.near++;
  const a = s.pts[0], b = s.pts[s.pts.length - 1];
  G.fx.push({ type: 'gap', ax: a.x, ay: a.y, bx: b.x, by: b.y, t: 0, dur: 1.1 });
  if (G.time - (G.nearTipT || -9) > 3) {
    G.nearTipT = G.time;
    pop('差一点合拢', (a.x + b.x) / 2, (a.y + b.y) / 2 - 26, 17, '90,80,70', 1.2, 'num');
  }
}

function vowInkBack(source, x, y) {
  if (!activeVow('ink') || G.time < G.inkBackAt + 1.5) return;
  const n = Math.min(6, inkMax() - G.ink);
  if (n < 1) return;
  G.ink += n; G.inkBackAt = G.time;
  G.fx.push({ type: 'fly', x, y, vow: true, t: 0, dur: 0.48 });
  pop('惜墨 +' + Math.floor(n), x, y - 32, 18, CINNABAR, 1, 'num');
  Sound.drop(panOf(x));
  if (G.flog) {
    const paid = G.flog.vowInk ||= {};
    paid[source] = (paid[source] || 0) + n;
  }
}
// 笔下截断墨弹：冲着印来的记作护印（画卷战果），立惜墨时正要撞印的还返墨
function cutPenShot(sh, quiet) {
  const t = shotImpactTime(sh);
  if (t < Infinity) G.feat.guard++;   // 冲着印来的都算护印；惜墨只返正要撞印的
  cutShot(sh, quiet);
  if (t <= SHOT_CUE_T && activeVow('ink')) vowInkBack('cut', sh.x, sh.y);
}
function techDian(s) {
  const p = s.pts[0];
  let ring;
  for (let i = G.fx.length - 1; i >= 0; i--) {
    const f = G.fx[i];
    if (f.type === 'feng' && f.charged && f.t < f.dur && pointInPoly(p.x, p.y, f.poly)) { ring = f; break; }
  }
  if (ring) {
    ring.charged = false; ring.dur = Math.min(ring.dur, ring.t + 0.16);
    const before = G.stats.kills;
    for (const e of G.enemies) if (!e.dead && pointInPoly(e.x, e.y, ring.poly)) damage(e, 2, 'dian', e.x - p.x, e.y - p.y);
    if (G.stats.kills - before >= 3) vowInkBack('ring', ring.cx, ring.cy);
    for (const sh of G.shots) if (!sh.dead && pointInPoly(sh.x, sh.y, ring.poly)) cutPenShot(sh, true);
    G.fx.push({ type: 'burst', x: ring.cx, y: ring.cy, r: ring.rad, tier: 2, t: 0, dur: 0.5 });
    pop('点引封圈', ring.cx, ring.cy - 34, 18, CINNABAR, 0.85, 'num'); Sound.chord(5, panOf(p.x));
    if (G.flog) G.flog.fengdian = (G.flog.fengdian || 0) + 1;
  }
  const flow = flowReady() && s.blot < 18;
  const r = flow ? 26 : Math.max(10, s.blot);
  if (flow) {
    G.flowUntil = 0;
    markInsight('liuhen');
    if (G.flog) G.flog.flow = (G.flog.flow || 0) + 1;
    G.fx.push({ type: 'ring', x: p.x, y: p.y, r: 33, t: 0, dur: 0.55 });
    pop('流痕', p.x, p.y - 30, 23, '40,52,62', 0.9, 'num');
  }
  const dmg = (r < 18 ? 1 : r < 32 ? 2 : 3) + (BR().dian.big && r >= 52 ? 1 : 0);
  for (const e of G.enemies) if (!e.dead && Math.hypot(e.x - p.x, e.y - p.y) < r + e.r * 0.6) damage(e, dmg, 'dian', e.x - p.x, e.y - p.y);
  for (const sh of G.shots) if (!sh.dead && Math.hypot(sh.x - p.x, sh.y - p.y) < r + sh.r) cutPenShot(sh, true);
  for (const d of G.drops) if (!d.dead && Math.hypot(d.x - p.x, d.y - p.y) < r + pickR()) collectDrop(d);
  stain(c => { c.fillStyle = `rgba(${INK},0.42)`; Art.blobPath(c, p.x, p.y, r * 0.8, 0, Math.random() * 9, 0.18); c.fill(); });
  G.fx.push({ type: 'blot', x: p.x, y: p.y, r, t: 0, dur: 0.5 });
  inkParts(p.x, p.y, 6 + r * 0.4, 0, 0, 0.6 + r / 40);
  Sound.drip(r >= 18);
  if (r >= 18) charPop('点', p.x, p.y - r - 28, 40 + r * 0.4);
}

function techZhan(res) {
  const P = res.P, a = P[0], b = P[P.length - 1], d = res.dir;
  const ext = 0.15 + 0.25 * lv('feng2') + (BR().zhanExt || 0);
  const ax = a.x - d.x * res.L * ext, ay = a.y - d.y * res.L * ext;
  const bx = b.x + d.x * res.L * ext, by = b.y + d.y * res.L * ext;
  const dmg = 1 + lv('feng2');
  let n = 0;
  for (const e of G.enemies) if (!e.dead && distToSeg(e.x, e.y, ax, ay, bx, by) < e.r + 9 && !glances(e, d.x, d.y)) { if (damage(e, dmg, 'zhan', d.x, d.y)) n++; }
  for (const sh of G.shots) if (!sh.dead && distToSeg(sh.x, sh.y, ax, ay, bx, by) < sh.r + 9) cutPenShot(sh);
  G.fx.push({ type: 'slash', ax, ay, bx, by, t: 0, dur: 0.4 });
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  if (!(G.stroke && G.stroke.cuts)) charPop('斩', mx - d.y * 48, my + d.x * 48, 64);   // 这一笔截了墨弹：只留「截」字，不叠「斩」
  Sound.swish(0.6, panOf(mx));
  if (n) { markInsight('feng2'); G.hitStop = Math.max(G.hitStop, 0.05); UI.shake = Math.max(UI.shake, 0.25); }
}

function techFeng(res, s) {
  const poly = res.poly, c = centroidOf(poly);
  let n = 0;
  // 先收圈内原有的墨滴，本次封杀掉落的墨滴仍需笔锋去收
  for (const d of G.drops) if (!d.dead && pointInPoly(d.x, d.y, poly)) collectDrop(d);
  G.batch = [];
  for (const e of G.enemies) {
    if (!e.dead && pointInPoly(e.x, e.y, poly)) { if (damage(e, 3 + (BR().fengDmg || 0), 'feng', e.x - c.x, e.y - c.y)) n++; }
  }
  const batch = G.batch;
  G.batch = null;
  let rad = 0;
  for (const q of poly) rad = Math.max(rad, Math.hypot(q.x - c.x, q.y - c.y));
  for (const sh of G.shots) if (!sh.dead && pointInPoly(sh.x, sh.y, poly)) cutPenShot(sh, true);
  const broken = G.enemies.some(e => !e.dead && e.type === 'seg' && pointInPoly(e.x, e.y, poly));
  G.fx.push({ type: 'feng', poly, cx: c.x, cy: c.y, rad, charged: !broken, broken, t: 0, dur: 1.4 });
  stampPop('封', c.x, c.y, 54);
  stain(cx => {
    cx.save(); cx.translate(c.x, c.y); cx.rotate(vr(-0.15, 0.15));
    cx.fillStyle = `rgba(${CINNABAR},0.13)`; Art.roundRect(cx, -18, -18, 36, 36, 4); cx.fill();
    cx.restore();
  });
  Sound.bell(10 + Math.min(n, 4), 0.26); Sound.stamp();
  G.stats.seals += n;
  if (n >= 5) award('wufeng');
  // 群封：三只以上合成一声和弦、一圈朱边墨爆，按 3 / 5 / 8 只分三档；飘字挪到圈外，不压在妖身上
  const kills = batch.length;
  G.feat.feng = Math.max(G.feat.feng, kills);
  if (kills >= 3) {
    const tier = kills >= 8 ? 3 : kills >= 5 ? 2 : 1;
    Sound.chord(kills, panOf(c.x));
    G.fx.push({ type: 'burst', x: c.x, y: c.y, r: rad, tier, t: 0, dur: 0.75 + 0.15 * tier });
    if (tier >= 2) { UI.shake = Math.max(UI.shake, 0.2 + 0.15 * tier); Sound.duck(0.35, 0.9); }
    buzz(tier === 3 ? [30, 30, 60] : 25 + 10 * tier, true);
  } else for (const b of batch) Sound.pluck(b.i, 0.3, b.pan);
  if (n >= 3) {
    const bonus = n * 15;
    G.score += bonus;
    const ly = c.y + rad + 24 > H - 40 ? c.y - rad - 24 : c.y + rad + 24;
    pop(`${cnNum(n)}妖同封 +${bonus}`, c.x, ly, 18 + 2 * Math.min(3, n >> 2), CINNABAR, 1.3, 'num');
    addYi(1.2 * n);
    if (lv('yuan')) { markInsight('yuan'); G.ink = Math.min(inkMax(), G.ink + s.cost); pop('圆融 · 墨回', c.x, ly + (ly > c.y ? 24 : -24), 16, INK, 1.2, 'num'); }
  }
  if (n) G.hitStop = Math.max(G.hitStop, n >= 8 ? 0.1 : n >= 5 ? 0.08 : 0.06);
}

function boltPath(x1, y1, x2, y2) {
  const pts = [{ x: x1, y: y1 }], n = 9;
  const dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
  for (let i = 1; i < n; i++) {
    const t = i / n, off = vr(-1, 1) * Math.min(26, l * 0.12) * Math.sin(t * Math.PI);
    pts.push({ x: x1 + dx * t + nx * off, y: y1 + dy * t + ny * off });
  }
  pts.push({ x: x2, y: y2 });
  return pts;
}
function techLei(res) {
  const P = res.P, c = centroidOf(P);
  const n = 3 + 2 * lv('jing');
  markInsight('jing');
  const d2 = e => (e.x - c.x) * (e.x - c.x) + (e.y - c.y) * (e.y - c.y);
  const cand = G.enemies.filter(e => !e.dead && !isImmune(e, 'lei') && d2(e) < 340 * 340).sort((a, b) => d2(a) - d2(b)).slice(0, n);
  const origins = res.corners && res.corners.length ? res.corners : [P[0], P[P.length - 1]];
  cand.forEach((e, i) => {
    const o = origins[i % origins.length];
    G.fx.push({ type: 'bolt', pts: boltPath(o.x, o.y, e.x, e.y), t: 0, dur: 0.45 });
    damage(e, 2, 'lei', e.x - o.x, e.y - o.y);
  });
  if (!cand.length) { const e = P[P.length - 1]; G.fx.push({ type: 'bolt', pts: boltPath(e.x, e.y - 160, e.x, e.y), t: 0, dur: 0.4 }); }
  // 雷雨：被浪（或「水」）浸湿的墨妖导雷，劈中一只湿妖，雷顺着水汽连到三百单位内的其他湿妖
  const wet = cand.filter(e => e.wet > 0);
  if (wet.length) {
    const hit = new Set(cand), chain = [];
    for (const e of G.enemies) {
      if (chain.length >= 8) break;
      if (e.dead || hit.has(e) || !(e.wet > 0) || isImmune(e, 'lei')) continue;
      let src = null, bd = 300 * 300;
      for (const w of wet) { const q = (w.x - e.x) ** 2 + (w.y - e.y) ** 2; if (q < bd) { bd = q; src = w; } }
      if (src) chain.push([src, e]);
    }
    for (const [a, e] of chain) {
      G.fx.push({ type: 'bolt', pts: boltPath(a.x, a.y, e.x, e.y), t: 0, dur: 0.4 });
      damage(e, 1, 'lei', e.x - a.x, e.y - a.y);
    }
    if (chain.length) {
      pop('雷雨', c.x, c.y - 100, 22, '40,52,62', 1, 'num');
      if (G.flog) G.flog.chain += chain.length;
    }
  }
  charPop('雷', c.x, c.y - 56, 64);
  UI.flash = 0.45; UI.flashCol = '255,255,250'; UI.shake = Math.max(UI.shake, 0.5);
  Sound.thunder(panOf(c.x));
}

// 浪：推开墨妖、伤其一点、浸湿（迟滞，且引雷）；浪头扫过的墨弹倒卷回去打妖（回澜）
const WET_T = 3.5;
function techLang(res) {
  const P = res.P, d = res.dir, band = 70, tao = lv('tao');
  if (tao) markInsight('tao');
  let up = null;
  for (const e of G.enemies) {
    if (e.dead || e.type === 'xu') continue;
    if (distToPolyline(e.x, e.y, P) < band + e.r) {
      // 水上的墨妖逆流推回上游（山口里的推回口里）；平地上的顺着笔势推开
      const Rv = e.route && G.rivers && G.rivers[e.route];
      if (!e.boss && Rv && riverPush(e, tao)) { if (Rv.kind !== 'pass') up = up || e; }
      else if (!e.boss) { e.kx += d.x * 380; e.ky += d.y * 380; e.stun = Math.max(e.stun, 1 + 0.8 * tao); }
      e.wet = Math.max(e.wet || 0, WET_T);
      damage(e, 1 + tao, 'lang', d.x, d.y);
    }
  }
  if (up) pop('逆流', up.x, up.y - up.r - 22, 18, '40,52,62', 0.9, 'num');
  let back = null, nb = 0;
  for (const sh of G.shots) if (!sh.dead && !sh.rev && distToPolyline(sh.x, sh.y, P) < band) {
    if (shotImpactTime(sh) < Infinity) G.feat.guard++;   // 倒卷一发冲着印来的弹，也算护印
    reflectShot(sh, tao); back = back || sh; nb++;
  }
  if (back) {
    if (lv('liuhen')) G.flowUntil = G.time + FLOW_WINDOW;
    pop(nb > 1 ? `回澜 ×${nb}` : '回澜', back.x, back.y - 26, 20, '40,52,62', 1, 'num');
    Sound.snap(panOf(back.x));
    if (G.flog) G.flog.hui += nb;
  }
  G.fx.push({ type: 'wave', pts: P.map(p => ({ x: p.x, y: p.y })), dx: d.x, dy: d.y, t: 0, dur: 0.8 });
  const c = centroidOf(P);
  charPop('浪', c.x - d.y * 64, c.y + d.x * 64, 64);
  Sound.wave(panOf(c.x));
}

function techZhen(res) {
  const poly = res.poly, c = centroidOf(poly), gang = lv('gang');
  if (gang) markInsight('gang');
  G.wards.push({ poly, cx: c.x, cy: c.y, t: 0, dur: 6 + 4 * gang, burn: gang ? 2 : 1 });
  charPop('镇', c.x, c.y, 60);
  Sound.chime();
}

function cutCounter(c, x, y) {
  c.cut = true; c.fade = 0;
  charPop('截', x, y - 34, 56);
  pop('逆笔已断', x, y - 70, 18, CINNABAR, 0.8, 'num');
  buzz(35, true);
  Sound.warning('cut', panOf(x));
  G.score += 50;
  pop('+50', x, y + 22, 14, '90,80,70', 0.8, 'num');
}
