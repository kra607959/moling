'use strict';
// 墨灵 · 游戏 11/13 · hud：界面：墨条与印、图例、卡顿提示、引导、层首、择心得、暂停、终局

// —— 界面 ——
function drawHUD() {
  const c = ctx;
  const x0 = 22, y0 = 18;
  // 墨
  txt('墨', x0 + 10, y0 + 9, 22, INK);
  // 窄屏（竖屏手机）上墨条随层名宽度收窄，避免数字与层名相撞
  const title = floorTitle(G.floor) + ' · ' + floorSub(G.floor) + (G.floorName ? ' · ' + G.floorName : '');
  ctx.font = `bold 17px ${FONT}`;
  const titleHalf = ctx.measureText(title).width / 2;
  const bx = x0 + 28, bh = 14, f = clamp(G.ink / inkMax(), 0, 1);
  const bw = Math.round(clamp(CX - titleHalf - bx - 56, 96, 200));
  const low = f < 0.2;
  c.strokeStyle = low && Math.sin(UI.t * 10) > 0 ? `rgba(${CINNABAR},0.9)` : `rgba(${INK},0.45)`; c.lineWidth = 1.2;
  Art.roundRect(c, bx, y0 + 2, bw, bh, 7); c.stroke();
  if (f > 0.01) {
    c.fillStyle = `rgba(${INK},0.86)`;
    Art.roundRect(c, bx + 2, y0 + 4, Math.max(4, (bw - 4) * f), bh - 4, 5); c.fill();
    c.strokeStyle = `rgba(${PAPER},0.35)`; c.lineWidth = 0.8;
    c.beginPath(); c.moveTo(bx + 6, y0 + 7); c.lineTo(bx + Math.max(6, (bw - 4) * f * 0.8), y0 + 7); c.stroke();
  }
  txt(String(Math.floor(G.ink)), bx + bw + 8, y0 + 9, 14, INK, 'left', 0.7, 'normal');
  // 印
  txt('印', x0 + 10, y0 + 36, 18, CINNABAR);
  for (let i = 0; i < G.sealMax; i++) {
    c.fillStyle = i < G.sealHp ? `rgba(${CINNABAR},0.9)` : `rgba(${CINNABAR},0.16)`;
    c.fillRect(bx + i * 14, y0 + 30, 10, 10);
  }
  // 层
  txt(title, CX, y0 + 9, 17, INK, 'center', 0.85);
  if (!G.bossType && G.waves.length > 1) {
    for (let i = 0; i < G.waves.length; i++) {
      c.fillStyle = i <= G.waveI ? `rgba(${INK},0.75)` : `rgba(${INK},0.18)`;
      c.beginPath(); c.arc(CX + (i - (G.waves.length - 1) / 2) * 12, y0 + 27, 3, 0, TAU); c.fill();
    }
  }
  // 手编层的段名：起段时淡淡写出，片刻即隐
  if (G.segCap && screen === 'play') {
    const st = G.segCap.t, a = Math.min(1, st / 0.4) * clamp((3.4 - st) / 0.8, 0, 1);
    txt(Array.from(G.segCap.text).join(' '), CX, y0 + 54, 24, INK, 'center', 0.7 * a);
  }
  // 分
  txt(String(G.score), W - 66, y0 + 9, 22, INK, 'right');
  txt('分', W - 66 - ctx.measureText(String(G.score)).width - 14, y0 + 10, 15, INK, 'center', 0.6);
  if (G.combo >= 2) {
    const a = clamp(G.comboT / 0.8, 0.3, 1);
    txt(`${G.combo} 连 · 笔势 ×${comboMult().toFixed(1)}`, W - 66, y0 + 34, 15, CINNABAR, 'right', a);
  }
  // 暂停键
  const px = W - 46, py = y0 - 4, ps = 30;
  const hov = hovering(px, py, ps, ps);
  c.strokeStyle = `rgba(${INK},${hov ? 0.8 : 0.4})`; c.lineWidth = 1.3;
  c.beginPath(); c.arc(px + ps / 2, py + ps / 2, ps / 2 - 2, 0, TAU); c.stroke();
  c.fillStyle = `rgba(${INK},${hov ? 0.85 : 0.55})`;
  c.fillRect(px + ps / 2 - 5, py + ps / 2 - 6, 3, 12); c.fillRect(px + ps / 2 + 2, py + ps / 2 - 6, 3, 12);
  if (screen === 'play') UI.buttons.push({ x: px, y: py, w: ps, h: ps, fn: togglePause });
  // Boss
  if (G.boss) {
    const bw2 = Math.min(360, W * 0.42), bxx = CX - bw2 / 2, byy = y0 + 46;
    const bf = clamp(bossHp() / G.boss.maxHp, 0, 1);
    txt(G.boss.name, CX, byy - 8, 16, CINNABAR, 'center', 0.95);
    c.strokeStyle = `rgba(${CINNABAR},0.6)`; c.lineWidth = 1;
    c.strokeRect(bxx, byy + 2, bw2, 7);
    c.fillStyle = `rgba(${CINNABAR},0.85)`; c.fillRect(bxx + 1, byy + 3, (bw2 - 2) * bf, 5);
    if (G.boss.type === 'mu' && G.boss.e && !G.boss.e.shell) txt('壳破', bxx + bw2 + 24, byy + 6, 13, CINNABAR, 'center', 0.6 + 0.4 * Math.sin(UI.t * 8));
  }
  drawLegend();
  drawHint();
  drawBanner();
}

function drawLegend() {
  const list = (BR().noZhan ? ['feng', 'dian'] : ['zhan', 'feng', 'dian']).concat(['lei', 'lang', 'zhen'].filter(k => G.up[k]));
  const y = H - 42;
  list.forEach((k, i) => {
    const x = 40 + i * 52;
    ctx.fillStyle = 'rgba(250,245,232,0.5)';
    Art.roundRect(ctx, x - 22, y - 26, 44, 52, 6); ctx.fill();
    Art.drawIcon(ctx, k, x, y - 7, 26, 1, 0.7, k === 'feng' || k === 'zhen' ? CINNABAR : INK);
    txt(TECH[k].ch, x, y + 16, 13, INK, 'center', 0.8);
  });
  // 字诀：能写的字，笔意满时朱红
  const full = G.yi >= YI_MAX;
  ziKnown().forEach((k, i) => {
    const x = 40 + list.length * 52 + 14 + i * 40;
    if (x > W - 30) return;
    ctx.fillStyle = 'rgba(250,245,232,0.5)';
    Art.roundRect(ctx, x - 17, y - 26, 34, 52, 6); ctx.fill();
    txt(ZI[k].ch, x, y - 6, 22, full ? CINNABAR : INK, 'center', full ? 0.9 : 0.45);
    txt(ZI[k].name, x, y + 16, 12, INK, 'center', 0.6, 'normal');
  });
}

// 卡顿提示：开局后若常掉到 40 帧以下，提示一次可换省电画质（每台设备只提示一次）
const perf = { n: 0, slow: 0 };
function watchPerf(rdt) {
  if (screen === 'play' && G && G.flog && !document.hidden) {
    const f = G.flog, sg = f.segs && f.segs[f.segs.length - 1], slow = rdt > 0.025;
    f.frames++; if (slow) f.slow++;
    if (sg) { sg.frames = (sg.frames || 0) + 1; if (slow) sg.slow = (sg.slow || 0) + 1; }   // 手编层按段记，看最忙的一段卡不卡
  }
  if (SET.perfHinted || SET.quality === 'lo' || screen !== 'play' || document.hidden) return;
  perf.n++;
  if (rdt > 0.025) perf.slow++;
  if (perf.n < 300) return;
  if (perf.slow > perf.n * 0.4) {
    SET.perfHinted = true; saveSettings();
    UI.notice = { text: '画面有些卡顿 —— 暂停 → 设置 → 画质选「省电」会流畅些', t: 0 };
  }
  perf.n = perf.slow = 0;
}
function drawNotice() {
  const n = UI.notice;
  if (!n) return;
  const a = clamp(Math.min(n.t * 3, (7 - n.t) / 0.5), 0, 1), y = 96;
  ctx.font = `bold 17px ${FONT}`;
  const w = Math.min(W - 40, ctx.measureText(n.text).width + 40);
  ctx.fillStyle = `rgba(250,245,232,${0.92 * a})`;
  Art.roundRect(ctx, CX - w / 2, y - 20, w, 40, 8); ctx.fill();
  ctx.strokeStyle = `rgba(${CINNABAR},${0.6 * a})`; ctx.lineWidth = 1.2; ctx.stroke();
  txt(n.text, CX, y + 1, 17, INK, 'center', a);
}

function drawHint() {
  const h = G.hint;
  if (!h || screen !== 'play') return;
  const a = Math.min(1, h.t * 2) * (h.t > 18 ? 0.45 : 1);
  const y = H - 112;
  ctx.font = `bold 19px ${FONT}`;
  const tw = ctx.measureText(h.text).width, w = Math.min(W - 40, tw + 76);
  ctx.fillStyle = `rgba(250,245,232,${0.82 * a})`;
  Art.roundRect(ctx, CX - w / 2, y - 23, w, 46, 8); ctx.fill();
  ctx.strokeStyle = `rgba(${INK},${0.3 * a})`; ctx.lineWidth = 1; ctx.stroke();
  const prog = Math.min(1, (UI.t % 1.8) / 1.3);
  if (h.icon === 'zi') miniStamp('字', CX - w / 2 + 30, y, 26, a);
  else Art.drawIcon(ctx, h.icon, CX - w / 2 + 30, y, 30, prog, 0.9 * a, h.icon === 'feng' || h.icon === 'zhen' ? CINNABAR : INK);
  txt(h.text, CX - w / 2 + 54, y + 1, 19, INK, 'left', a);
}

function drawBanner() {
  const b = G.banner;
  if (!b) return;
  const a = Math.min(1, b.t / 0.3) * Math.min(1, (b.dur - b.t) / 0.6);
  const y = H * 0.3;
  // 层首提示放不下一行（手机竖屏）就折成两行：有分号从分号处折，否则按宽度折
  let tips = b.tip ? [b.tip] : [];
  if (b.tip) {
    ctx.font = `bold 18px ${FONT}`;
    if (ctx.measureText(b.tip).width > W - 48) {
      const k = b.tip.indexOf('；');
      tips = k > 0 ? [b.tip.slice(0, k + 1), b.tip.slice(k + 1)] : wrap(b.tip, W - 48, 18);
    }
  }
  const lo = Math.max(0, tips.length - 1) * 26;
  const g = ctx.createLinearGradient(0, y - 90, 0, y + 90 + lo);
  g.addColorStop(0, `rgba(${PAPER},0)`); g.addColorStop(0.5, `rgba(${PAPER},${0.78 * a})`); g.addColorStop(1, `rgba(${PAPER},0)`);
  ctx.fillStyle = g; ctx.fillRect(0, y - 90, W, 180 + lo);
  txt(b.sub, CX, y - 44, 20, INK, 'center', 0.8 * a);
  txt(b.title, CX, y + 4, 56, b.clear ? CINNABAR : INK, 'center', a);
  tips.forEach((s, i) => txt(s, CX, y + 54 + i * 26, 18, INK, 'center', 0.85 * a));
}

function drawOverlay() {
  if (screen === 'choose') drawChoose();
  else if (screen === 'pause') drawPause();
  else if (screen === 'over') drawOver();
  else if (screen === 'victory') drawVictory();
}

function cardLayout() {
  const n = G.choices.length;
  if (W >= H) {
    const cw = 196, ch = 280, gap = 26, tot = n * cw + (n - 1) * gap, x0 = CX - tot / 2, y0 = CY - ch / 2 + 24;
    return G.choices.map((u, i) => ({ x: x0 + i * (cw + gap), y: y0, w: cw, h: ch, u, horiz: true }));
  }
  const cw = Math.min(600, W - 60), ch = 124, gap = 18, tot = n * ch + (n - 1) * gap, y0 = CY - tot / 2 + 30;
  return G.choices.map((u, i) => ({ x: CX - cw / 2, y: y0 + i * (ch + gap), w: cw, h: ch, u, horiz: false }));
}
function drawChoose() {
  wash(0.84);
  const L = cardLayout();
  const topY = Math.min(H * 0.16, L[0].y - 70);
  txt('择一心得', CX, topY, 40, INK);
  txt(`${floorTitle(G.floor)} · ${floorSub(G.floor).replace(' · 卷终', '')} 已净　—　点选一项（或按 1 / 2 / 3）`, CX, topY + 38, 16, INK, 'center', 0.65, 'normal');
  L.forEach((r, i) => {
    const hov = hovering(r.x, r.y, r.w, r.h);
    const lift = hov ? -6 : 0;
    const x = r.x, y = r.y + lift, u = r.u;
    ctx.fillStyle = 'rgba(250,246,234,0.97)';
    Art.roundRect(ctx, x, y, r.w, r.h, 8); ctx.fill();
    ctx.strokeStyle = hov ? `rgba(${CINNABAR},0.9)` : `rgba(${INK},0.4)`; ctx.lineWidth = hov ? 2 : 1.2; ctx.stroke();
    const col = u.unlock ? CINNABAR : INK;
    const have = lv(u.id);
    if (r.horiz) {
      txt(String(i + 1), x + 16, y + 18, 13, INK, 'center', 0.4, 'normal');
      if (u.zi) miniStamp('字', x + r.w - 30, y + 30, 24, 0.8);
      else if (u.unlock) { Art.drawIcon(ctx, u.id, x + r.w - 30, y + 30, 26, 1, 0.6, CINNABAR); }
      txt(u.ch, x + r.w / 2, y + 82, 76, col);
      txt(u.name, x + r.w / 2, y + 152, 22, INK);
      wrap(u.desc, r.w - 34, 15).forEach((ln, k) => txt(ln, x + r.w / 2, y + 188 + k * 22, 15, INK, 'center', 0.78, 'normal'));
      if (u.max > 1) txt(`已得 ${have} / ${u.max}`, x + r.w / 2, y + r.h - 18, 12, INK, 'center', 0.45, 'normal');
    } else {
      txt(u.ch, x + 58, y + r.h / 2, 64, col);
      txt(u.name, x + 112, y + 34, 22, INK, 'left');
      wrap(u.desc, r.w - 140, 15).forEach((ln, k) => txt(ln, x + 112, y + 66 + k * 22, 15, INK, 'left', 0.78, 'normal'));
      if (u.max > 1) txt(`已得 ${have} / ${u.max}`, x + r.w - 16, y + 22, 12, INK, 'right', 0.45, 'normal');
      txt(String(i + 1), x + 14, y + 16, 13, INK, 'center', 0.4, 'normal');
    }
    UI.buttons.push({ x: r.x, y: r.y, w: r.w, h: r.h, fn: () => choose(i) });
  });
}

function drawPause() {
  wash(0.86);
  const ps = PS(), y0 = ps > 1 ? H * 0.2 : H * 0.17;   // 竖屏放大
  txt('暂停', CX, y0, 46 * ps, INK);
  txt(`执笔：${BR().name} · ${BR().tag}`, CX, y0 + 34 * ps, 14 * ps, INK, 'center', 0.55, 'normal');
  const list = ['zhan', 'feng', 'dian', 'lei', 'lang', 'zhen'];
  const rowH = 46 * ps, top = y0 + 70 * ps;
  const colW = Math.min(560 * ps, W - 40), x0 = CX - colW / 2;
  list.forEach((k, i) => {
    const T = TECH[k], known = (['zhan', 'feng', 'dian'].includes(k) || G.up[k]) && !(k === 'zhan' && BR().noZhan);
    const y = top + i * rowH;
    Art.drawIcon(ctx, k, x0 + 24 * ps, y, 28 * ps, 1, known ? 0.8 : 0.2, k === 'feng' || k === 'zhen' ? CINNABAR : INK);
    txt(T.ch, x0 + 70 * ps, y, 26 * ps, known ? INK : '150,140,130');
    txt(known ? `${T.shape} —— ${T.desc}` : `${T.shape} —— ${k === 'zhan' && BR().noZhan ? BR().name + '笔头太大，不成斩' : '尚未习得'}`, x0 + 100 * ps, y + 1, 16 * ps, INK, 'left', known ? 0.8 : 0.35, 'normal');
  });
  // 字诀一行：会写的字朱红，未习得的灰
  {
    const y = top + list.length * rowH;
    miniStamp('字', x0 + 24 * ps, y, 24 * ps, 0.8);
    txt('诀', x0 + 70 * ps, y, 26 * ps, INK);
    let x = x0 + 100 * ps;
    for (const k of ZI_ORDER) {
      const known = k === 'huo' || G.up['zi_' + k];
      txt(ZI[k].ch, x + 10 * ps, y, 22 * ps, known ? CINNABAR : '150,140,130', 'center', known ? 0.95 : 0.4);
      txt(ZI[k].name, x + 30 * ps, y + 1, 15 * ps, INK, 'left', known ? 0.8 : 0.3, 'normal');
      x += 64 * ps;
    }
    if (x + 4 + 90 * ps < x0 + colW) txt('笔意满时点印', x + 4, y + 1, 14 * ps, INK, 'left', 0.5, 'normal');
  }
  const ups = UPGRADES.filter(u => !u.unlock && lv(u.id)).map(u => u.name + (lv(u.id) > 1 ? '×' + lv(u.id) : ''));
  let uy = top + (list.length + 1) * rowH + 6 * ps;
  if (ups.length) wrap('心得：' + ups.join('　'), W - 60, 15 * ps).forEach((ln, i) => { txt(ln, CX, uy, 15 * ps, INK, 'center', 0.6, 'normal'); uy += 22 * ps; });
  const by = Math.max(top + (list.length + 1) * rowH + 36 * ps, uy + 8 * ps), bh = 42 * ps, fs = 19 * ps;
  const bs = Math.min(ps, (W - 40) / 580), g = 12 * bs;
  let bx = CX - (100 + 120 + 120 + 90 + 90 + 48) * bs / 2;
  button('继续', bx, by, 100 * bs, bh, togglePause, true, fs); bx += 100 * bs + g;
  button('重新开卷', bx, by, 120 * bs, bh, () => newRun(), false, fs); bx += 120 * bs + g;
  button('回到卷首', bx, by, 120 * bs, bh, leaveToTitle, false, fs); bx += 120 * bs + g;
  button('设置', bx, by, 90 * bs, bh, () => openSettings('pause'), false, fs); bx += 90 * bs + g;
  button(Sound.isMuted() ? '开声' : '静音', bx, by, 90 * bs, bh, () => { Sound.init(); Sound.toggleMute(); }, false, fs);
  if (ps === 1) txt('P / Esc 暂停或继续　·　M 静音　·　V 减弱震屏与闪光' + (SET.reduceFx ? '（已减弱）' : ''), CX, by + 70, 14, INK, 'center', 0.55, 'normal');
}

function statLines() {
  return [
    `所至　${floorTitle(G.floor)} · ${floorSub(G.floor).replace(' · 卷终', '')}`,
    `得分　${G.score}　　最佳　${best.score}`,
    `伏妖　${G.stats.kills}　　最高连击　${G.maxCombo}　　封印　${G.stats.seals}　　无瑕　${G.stats.flawless} 层`,
  ];
}
function drawStamp(ch, x, y, s, a) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(-0.06);
  ctx.fillStyle = `rgba(${CINNABAR},${0.92 * a})`; Art.roundRect(ctx, -s * 0.6, -s * 0.6, s * 1.2, s * 1.2, s * 0.08); ctx.fill();
  ctx.strokeStyle = `rgba(245,233,218,${0.9 * a})`; ctx.lineWidth = s * 0.04; Art.roundRect(ctx, -s * 0.5, -s * 0.5, s, s, s * 0.04); ctx.stroke();
  txt(ch, 0, s * 0.03, s * 0.75, '245,233,218', 'center', a);
  ctx.restore();
}
// 一排按钮居中；竖屏放不下就折成几排。返回末排底边
function buttonRow(list, y, ps) {
  const g = 12 * ps, bh = 46 * ps, fs = 19 * ps, rows = [[]];
  let w = 0;
  for (const b of list) {
    const bw = b.w * ps;
    if (rows[rows.length - 1].length && w + g + bw > W - 40) { rows.push([]); w = 0; }
    w += (w ? g : 0) + bw; rows[rows.length - 1].push(b);
  }
  rows.forEach((row, i) => {
    let x = CX - (row.reduce((a, b) => a + b.w * ps, 0) + g * (row.length - 1)) / 2;
    for (const b of row) { button(b.label, x, y + i * (bh + g), b.w * ps, bh, b.fn, b.primary, fs); x += b.w * ps + g; }
  });
  return y + rows.length * (bh + g) - g;
}
// 局终的字：竖屏放大，长行折开
function endLines(lines, y, ps) {
  for (const s of lines) for (const ln of wrap(s, W - 60, 17 * ps)) { txt(ln, CX, y, 17 * ps, INK, 'center', 0.8, 'normal'); y += 30 * ps; }
  return y;
}
function endButtons(list, y, ps, note) {
  const a = clamp((UI.t - (UI.endT || 0) - 0.5) / 0.35, 0, 1);   // 半秒后才浮出：印碎时手指多半还在纸上
  if (a <= 0) return;
  ctx.globalAlpha = a;
  const yb = buttonRow(list, y, ps);
  txt(note, CX, yb + 30 * ps, 14 * ps, INK, 'center', 0.5, 'normal');
  ctx.globalAlpha = 1;
}
function drawOver() {
  wash(0.8);
  const ps = PS(), y0 = H * (ps > 1 ? 0.22 : 0.26);
  drawStamp('碎', CX, y0, 96 * ps, 1);
  txt('印碎卷残', CX, y0 + 96 * ps, 34 * ps, INK);
  const y = endLines(statLines(), y0 + 150 * ps, ps);
  endButtons([
    { label: '再落一笔', w: 130, fn: () => newRun(), primary: true },
    { label: '观卷', w: 108, fn: () => openCurrentScroll('over') },
    { label: '回到卷首', w: 130, fn: toTitle },
  ], y + 20 * ps, ps, '此局墨迹已裱成画卷，存入卷库');
}
function drawVictory() {
  wash(0.8);
  const ps = PS(), y0 = H * (ps > 1 ? 0.2 : 0.24);
  drawStamp('復', CX, y0, 96 * ps, 1);
  txt('画卷已净', CX, y0 + 96 * ps, 36 * ps, INK);
  let y = endLines(['三卷墨妖尽伏。纸上的墨迹，渐渐淡回山水。'], y0 + 136 * ps, ps);
  y = endLines(statLines(), y + 10 * ps, ps);
  endButtons([
    { label: '续卷（无尽）', w: 160, fn: continueEndless, primary: true },
    { label: '观卷', w: 108, fn: () => openCurrentScroll('victory') },
    { label: '重新开卷', w: 130, fn: () => newRun() },
    { label: '回到卷首', w: 130, fn: toTitle },
  ], y + 20 * ps, ps, '九层墨迹已裱成画卷，存入卷库；续卷终了时卷尾续接');
}
