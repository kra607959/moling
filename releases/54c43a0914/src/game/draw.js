'use strict';
// 墨灵 · 游戏 9/13 · draw：绘制：文字与按钮、整帧、字诀书写界面、纸面与墨印

// —— 绘制 ——
function txt(s, x, y, size, col, align, alpha, weight) {
  ctx.font = `${weight === 'normal' ? '' : 'bold '}${size}px ${FONT}`;
  ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = `rgba(${col || INK},${alpha == null ? 1 : alpha})`;
  ctx.fillText(s, x, y);
}
const NO_START = '，。、；：！？）」』》';
function wrap(s, maxW, size) {
  ctx.font = `${size}px ${FONT}`;
  const lines = [];
  let cur = '';
  for (const ch of s) {
    if (cur && ctx.measureText(cur + ch).width > maxW && !NO_START.includes(ch)) { lines.push(cur); cur = ch; }
    else cur += ch;
  }
  if (cur) lines.push(cur);
  return lines;
}
function hovering(x, y, w, h) { return UI.mouse.in && UI.mouse.x >= x && UI.mouse.x <= x + w && UI.mouse.y >= y && UI.mouse.y <= y + h; }
function button(label, x, y, w, h, fn, primary, fs) {
  const hov = hovering(x, y, w, h);
  ctx.fillStyle = primary ? `rgba(${CINNABAR},${hov ? 1 : 0.88})` : `rgba(250,245,232,${hov ? 1 : 0.86})`;
  Art.roundRect(ctx, x, y, w, h, 6); ctx.fill();
  ctx.strokeStyle = primary ? `rgba(${CINNABAR},1)` : `rgba(${INK},${hov ? 0.8 : 0.45})`;
  ctx.lineWidth = 1.4; ctx.stroke();
  txt(label, x + w / 2, y + h / 2 + 1, fs || 19, primary ? '250,240,228' : INK);
  UI.buttons.push({ x, y, w, h, fn });
}
function wash(a) { ctx.fillStyle = `rgba(${PAPER},${a})`; ctx.fillRect(0, 0, W, H); }

function render() {
  UI.buttons = [];
  const s = DPR * K;
  if (screen === 'yubi') { Yubi.draw(); ctx.setTransform(s, 0, 0, s, 0, 0); drawToasts(); drawCursor(); return; }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ensurePaper();
  ctx.drawImage(paperCv, 0, 0);
  if (screen === 'title' || !G || META[screen]) {
    ctx.setTransform(s, 0, 0, s, 0, 0);
    if (screen === 'gallery') drawGallery();
    else if (screen === 'scroll') drawViewer();
    else if (screen === 'yinpu') drawYinpu();
    else if (screen === 'settings') drawSettings();
    else if (screen === 'vows') drawVows();
    else drawTitle();
    drawToasts();
    drawCursor();
    return;
  }
  ctx.drawImage(stainCv, 0, 0);
  let sx = 0, sy = 0;
  if (UI.shake > 0 && !SET.reduceFx) { const m = UI.shake * UI.shake * 7; sx = vr(-m, m); sy = vr(-m, m); }
  ctx.setTransform(s, 0, 0, s, sx * s, sy * s);
  drawWorld();
  ctx.setTransform(s, 0, 0, s, 0, 0);
  if (UI.flash > 0 && !SET.reduceFx) { ctx.fillStyle = `rgba(${UI.flashCol},${UI.flash * 0.3})`; ctx.fillRect(0, 0, W, H); }
  drawHUD();
  if (G.zj || G.ziFx) drawZi();
  drawOverlay();
  drawToasts();
  drawNotice();
  drawCursor();
}

// —— 字诀书写界面 ——
function miniStamp(ch, x, y, s, a) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(-0.06);
  ctx.fillStyle = `rgba(${CINNABAR},${0.9 * a})`; Art.roundRect(ctx, -s / 2, -s / 2, s, s, s * 0.1); ctx.fill();
  txt(ch, 0, s * 0.04, s * 0.68, '245,233,218', 'center', a);
  ctx.restore();
}
function drawZi() {
  const c = ctx, z = G.zj, f = G.ziFx;
  const B = f ? f.box : ziBox(), S = B.S;
  // 出现 / 收起
  const a = z ? Math.min(1, z.t / 0.22) : clamp(1 - (f.t - 0.25) / 0.6, 0, 1);
  if (a > 0) {
    c.fillStyle = `rgba(28,24,20,${0.36 * a})`; c.fillRect(0, 0, W, H);
    // 纸
    c.save();
    c.shadowColor = `rgba(0,0,0,${0.25 * a})`; c.shadowBlur = 18;
    c.fillStyle = `rgba(244,236,216,${0.95 * a})`; c.fillRect(B.x, B.y, S, S);
    c.restore();
    c.strokeStyle = `rgba(${CINNABAR},${0.75 * a})`; c.lineWidth = 2.4; c.strokeRect(B.x + 6, B.y + 6, S - 12, S - 12);
    c.lineWidth = 1; c.strokeRect(B.x + 11, B.y + 11, S - 22, S - 22);
    // 米字格
    c.setLineDash([7, 7]); c.strokeStyle = `rgba(${CINNABAR},${0.22 * a})`; c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(B.x + 11, CY); c.lineTo(B.x + S - 11, CY); c.moveTo(CX, B.y + 11); c.lineTo(CX, B.y + S - 11);
    c.moveTo(B.x + 11, B.y + 11); c.lineTo(B.x + S - 11, B.y + S - 11); c.moveTo(B.x + S - 11, B.y + 11); c.lineTo(B.x + 11, B.y + S - 11);
    c.stroke(); c.setLineDash([]);
    const known = ziKnown();
    // 只会一个字时给描红
    if (known.length === 1) txt(ZI[known[0]].ch, CX, CY + S * 0.03, S * 0.78, CINNABAR, 'center', 0.1 * a);
    // 标题
    txt('字 诀', CX, B.y - 46, 30, '245,236,220', 'center', a);
    txt('在格中写一个字　·　停笔即成', CX, B.y - 18, 15, '245,236,220', 'center', 0.75 * a, 'normal');
    // 可写之字
    const gy = B.y + S + 34, gw = 66, gx0 = CX - (known.length - 1) * gw / 2;
    known.forEach((k, i) => {
      const x = gx0 + i * gw;
      miniStamp(ZI[k].ch, x, gy, 34, a);
      txt(ZI[k].name, x, gy + 30, 13, '245,236,220', 'center', 0.8 * a, 'normal');
    });
    if (z) {
      // 时限
      const left = clamp(1 - z.t / z.limit, 0, 1);
      c.fillStyle = `rgba(${CINNABAR},${0.8 * a})`; c.fillRect(B.x + 11, B.y + S - 9, (S - 22) * left, 3);
      // 停笔计时：右下角的印慢慢盖实
      if (!z.cur && z.strokes.length) {
        const p = clamp(z.idle / ZI_IDLE, 0, 1);
        c.strokeStyle = `rgba(${CINNABAR},0.8)`; c.lineWidth = 2;
        c.beginPath(); c.arc(B.x + S - 30, B.y + S - 30, 11, -Math.PI / 2, -Math.PI / 2 + TAU * p); c.stroke();
      }
      if (z.msg && z.msgT < 2.2) txt(z.msg, CX, B.y + 34, 18, CINNABAR, 'center', Math.min(1, (2.2 - z.msgT) * 2));
      // 按钮：撤笔 / 罢笔 / 落款
      const by = gy + 54, bw = 84, bh = 34;
      if (by + bh < H - 4) {
        const items = [['撤笔', undoZi], ['罢笔', cancelZi], ['落款', finishZi]];
        items.forEach(([label, fn], i) => {
          const x = CX + (i - 1) * (bw + 14) - bw / 2;
          const hov = hovering(x, by, bw, bh);
          c.fillStyle = `rgba(244,236,216,${hov ? 0.95 : 0.75})`; Art.roundRect(c, x, by, bw, bh, 6); c.fill();
          txt(label, x + bw / 2, by + bh / 2 + 1, 16, i === 2 ? CINNABAR : INK, 'center', 0.9);
          UI.buttons.push({ x, y: by, w: bw, h: bh, fn });
        });
      }
    }
  }
  // 笔迹
  if (z) {
    for (const fd of z.fading) Art.brush(c, fd.s.pts, 0.9 * (1 - fd.t / 0.6), INK, fd.s.seed);
    for (const s of z.strokes) Art.brush(c, s.pts, 0.95, INK, s.seed);
    if (z.cur && z.cur.pts.length > 1) Art.brush(c, z.cur.pts, 0.95, INK, z.cur.seed, false);
    else if (z.cur) { c.fillStyle = `rgba(${INK},0.9)`; c.beginPath(); c.arc(z.cur.pts[0].x, z.cur.pts[0].y, 5, 0, TAU); c.fill(); }
  } else if (f) {
    // 成字：字迹放大、加浓，随后化入纸中
    const p = f.t, sc = 1 + 0.12 * easeOut(Math.min(1, p / 0.5)), al = p < 0.5 ? 1 : clamp(1 - (p - 0.5) / 0.9, 0, 1);
    c.save(); c.translate(CX, CY); c.scale(sc, sc); c.translate(-CX, -CY);
    for (const s of f.strokes) Art.brush(c, s.pts, al, INK, s.seed);
    c.restore();
    const st = clamp(p / 0.18, 0, 1);
    if (p < 1.2) miniStamp(ZI[f.key].ch, B.x + S - 30, B.y + S - 30, 30 * lerp(1.8, 1, easeOut(st)), st * clamp((1.2 - p) / 0.3, 0, 1));
  }
}

function drawWorld() {
  const c = ctx, t = UI.t;
  if (G.rivers) for (const k in G.rivers) { const Rv = G.rivers[k]; (Rv.kind === 'pass' ? Art.drawPass : Art.drawRiver)(c, Rv, t, Rv.glow, CX, CY); }
  if (screen === 'play') drawTideLanes();
  for (const p of G.pending) {
    if (!p.moon) continue;
    const k = 1 - (p.at - G.time) / MOON_LEAD;
    if (k > 0) { const q = moonPos(p); Art.drawMoon(c, q.x, q.y, Math.min(1, k), t, p.n || 1); }
  }
  for (const w of G.wards) drawWard(w);
  for (const k of G.counters) drawCounter(k);
  for (const d of G.drops) if (!d.dead) Art.drawDrop(c, d, t);
  drawSeal();
  if (G.boss && G.boss.type === 'mu') drawMuAim(G.boss.e);
  if (G.shan) drawShan(G.shan);
  if (G.flood) drawFlood(G.flood);
  for (const e of G.enemies) if (!e.dead && e.type !== 'seg') Art.drawEnemy(c, e, t);
  // 浸湿的墨妖：身上一圈水光（导雷）
  c.lineWidth = 1.6;
  for (const e of G.enemies) {
    if (e.dead || !(e.wet > 0)) continue;
    c.strokeStyle = `rgba(40,52,62,${Math.min(1, e.wet) * (0.32 + 0.12 * Math.sin(t * 6 + e.seed * 9))})`;
    c.beginPath(); c.arc(e.x, e.y, e.r + 5, 0.3, Math.PI - 0.3); c.stroke();
  }
  if (G.boss && G.boss.type === 'jiao') for (const ch of G.boss.chains) {
    Art.drawChain(c, ch, t);
    c.save(); c.lineWidth = 2; c.strokeStyle = `rgba(${CINNABAR},0.8)`;
    for (const s of ch.segs) if (!s.dead && s.hp <= 2 && s.hp < s.maxHp) {
      const dx = -Math.sin(s.dir), dy = Math.cos(s.dir);
      c.beginPath();
      for (const k of [-1, 1]) {
        c.moveTo(s.x + dx * s.r * k * 0.65, s.y + dy * s.r * k * 0.65);
        c.lineTo(s.x + dx * s.r * k * 1.35, s.y + dy * s.r * k * 1.35);
      }
      c.stroke();
    }
    c.restore();
  }
  for (const e of G.enemies) if (!e.dead && e.fire > 0) drawFlame(e);
  for (const m of G.allies) drawPaperMan(m);
  for (const sh of G.shots) if (!sh.dead) Art.drawShot(c, sh);
  drawFx();
  for (const o of G.oldStrokes) {
    const a = o.t < 0.25 ? 0.94 : 0.94 * (1 - (o.t - 0.25) / 1.05);
    Art.brush(c, o.pts, Math.max(0, a), INK, o.seed);
  }
  if (G.stroke) drawLiveStroke(G.stroke);
  for (const p of G.parts) {
    c.fillStyle = `rgba(${p.col},${Math.min(1, p.life * 3) * 0.9})`;
    c.beginPath(); c.arc(p.x, p.y, p.r, 0, TAU); c.fill();
  }
  drawPops();
}

// 两道口各有自己的提示；先开用实线，后开用双线，静音时也能认。
function drawTideLanes() {
  const c = ctx;
  for (const lane of G.tideLanes) {
    const dt = lane.at - G.time;
    if (dt > 2.3 || dt < -1.8) continue;
    const Rv = G.rivers[lane.route], p = Rv.pts[1], q = Rv.pts[2];
    const z = Math.atan2(q.y - p.y, q.x - p.x), dx = Math.cos(z), dy = Math.sin(z);
    const x = clamp(p.x, 42, W - 42), y = clamp(p.y, 104, H - 70);
    const a = clamp((2.3 - dt) / 0.55, 0, 1) * clamp((dt + 1.8) / 0.65, 0, 1);
    c.save(); c.translate(x, y); c.rotate(z); c.lineCap = c.lineJoin = 'round';
    c.lineWidth = 5; c.strokeStyle = `rgba(${lane.i ? CINNABAR : '47,76,81'},${a * 0.9})`;
    for (let i = 0; i <= lane.i; i++) {
      const ax = 7 - i * 16;
      c.beginPath(); c.moveTo(ax - 14, -13); c.lineTo(ax, 0); c.lineTo(ax - 14, 13); c.stroke();
    }
    c.restore();
    const tx = clamp(x - dy * 30, 48, W - 48), ty = clamp(y + dx * 30, 110, H - 55);
    c.fillStyle = `rgba(${PAPER},${a * 0.95})`; Art.roundRect(c, tx - 26, ty - 12, 52, 24, 5); c.fill();
    txt(lane.i ? '后开' : '先开', tx, ty, 16, lane.i ? CINNABAR : '47,76,81', 'center', a);
  }
}

// 蠹母蓄墨时的去路：虚线由口向外长出，打到印的几道朱色、偏开的淡墨；将吐前一闪
function drawMuAim(e) {
  if (!e || e.dead || !e.charging || !(e.windK > 0)) return;
  const c = ctx, k = e.windK, v = muVolley(e);
  const L = (Math.hypot(CX - v.ox, CY - v.oy) + 90) * Math.min(1, 0.3 + k * 1.1);
  const blink = k > 0.8 ? 0.55 + 0.45 * Math.sin(UI.t * 22) ** 2 : 1;
  c.save(); c.lineCap = 'round'; c.setLineDash([10, 9]); c.lineDashOffset = -UI.t * 46;
  for (const a of v.angs) {
    const hit = rayHitsSeal(v.ox, v.oy, a, 7), fx = Math.cos(a), fy = Math.sin(a);
    c.strokeStyle = hit ? `rgba(${CINNABAR},${(0.2 + 0.55 * k) * blink})` : `rgba(${INK},${0.07 + 0.13 * k})`;
    c.lineWidth = hit ? 2.4 : 1.3;
    c.beginPath(); c.moveTo(v.ox + fx * 14, v.oy + fy * 14); c.lineTo(v.ox + fx * L, v.oy + fy * L); c.stroke();
  }
  c.restore();
}

function drawLiveStroke(s) {
  const c = ctx;
  if (s.blot > 0) {
    const p = s.pts[0];
    const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, s.blot);
    g.addColorStop(0, `rgba(${INK},0.85)`); g.addColorStop(0.75, `rgba(${INK},0.55)`); g.addColorStop(1, `rgba(${INK},0)`);
    c.fillStyle = g;
    Art.blobPath(c, p.x, p.y, s.blot, UI.t * 3, s.seed, 0.06); c.fill();
  }
  Art.brush(c, s.pts, 0.95, INK, s.seed, false);
}

function drawSeal() {
  const c = ctx, sh = G.sealShake, sz = SEAL_SIZE;
  const ox = sh ? vr(-1, 1) * sh * 4 : 0, oy = sh ? vr(-1, 1) * sh * 4 : 0;
  c.fillStyle = 'rgba(90,30,20,0.10)';
  c.beginPath(); c.arc(CX + 2, CY + 3, sz * 0.66, 0, TAU); c.fill();
  c.save();
  c.translate(CX + ox, CY + oy); c.rotate(-0.05);
  if (screen === 'dying' || screen === 'over') c.globalAlpha = screen === 'over' ? 0.55 : 0.6 + 0.4 * Math.sin(UI.t * 30) ** 2;
  c.drawImage(sealCv, -sz / 2, -sz / 2, sz, sz);
  const lost = G.sealMax - G.sealHp;
  if (lost > 0) {
    c.strokeStyle = `rgba(${PAPER},0.9)`; c.lineWidth = 1.3; c.lineCap = 'round';
    c.beginPath();
    for (let i = 0; i < Math.min(CRACKS.length, lost * 3); i++) { const P = CRACKS[i]; c.moveTo(P[0].x, P[0].y); for (let k = 1; k < P.length; k++) c.lineTo(P[k].x, P[k].y); }
    c.stroke();
  }
  c.restore();
  for (let i = 0; i < G.sealMax; i++) {
    const x = CX + (i - (G.sealMax - 1) / 2) * 11, y = CY + sz / 2 + 13;
    c.fillStyle = i < G.sealHp ? `rgba(${CINNABAR},0.9)` : `rgba(${CINNABAR},0.18)`;
    c.fillRect(x - 3.5, y - 3.5, 7, 7);
  }
  // 来弹：1.6 秒内会打到印上的墨弹，在印外对着它来的方向亮一道朱弧，越近越浓越粗
  if (!G.shan) {
    c.lineCap = 'round';
    for (const s of G.shots) {
      if (s.dead || s.rev || s.held) continue;
      const tti = shotImpactTime(s);
      if (tti > SHOT_CUE_T) continue;
      const a = Math.atan2(s.y - CY, s.x - CX), w = clamp(1 - tti / SHOT_CUE_T, 0, 1);
      c.strokeStyle = `rgba(${CINNABAR},${0.22 + 0.6 * w})`; c.lineWidth = 2 + 2.4 * w;
      c.beginPath(); c.arc(CX, CY, sz * 0.8 + 9, a - 0.2, a + 0.2); c.stroke();
    }
  }
  // 笔意：绕印一圈，满则朱红脉动
  const R = sz * 0.8, f = clamp(G.yi / YI_MAX, 0, 1), full = f >= 1;
  c.lineCap = 'round';
  c.strokeStyle = `rgba(${INK},0.08)`; c.lineWidth = 3;
  c.beginPath(); c.arc(CX, CY, R, 0, TAU); c.stroke();
  if (f > 0.005) {
    const pulse = full ? 0.55 + 0.4 * Math.sin(UI.t * 5) ** 2 : 0.5;
    c.strokeStyle = full ? `rgba(${CINNABAR},${pulse})` : `rgba(${INK},0.5)`; c.lineWidth = full ? 3.6 : 3;
    c.beginPath(); c.arc(CX, CY, R, -Math.PI / 2, -Math.PI / 2 + TAU * f); c.stroke();
  }
  if (G.yiFlash > 0) {
    c.strokeStyle = `rgba(${CINNABAR},${0.6 * G.yiFlash})`; c.lineWidth = 2;
    c.beginPath(); c.arc(CX, CY, R + (1 - G.yiFlash) * 40, 0, TAU); c.stroke();
  }
  if (full && !G.zj && !G.ziFx && screen === 'play') {
    txt(UI.mouse.isMouse ? '点印 · 字诀（空格）' : '点印 · 字诀', CX, CY + sz / 2 + 32, 13, CINNABAR, 'center', 0.45 + 0.4 * Math.sin(UI.t * 4) ** 2);
  }
}
