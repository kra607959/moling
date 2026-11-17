'use strict';
// 墨灵 · 游戏 12/13 · screens：卷首与笔匣、印谱、装到主屏、设置、卷库、观卷、得印提示

// —— 卷首：题名、笔匣 ——
const PS = () => (H > W * 1.15 ? 1.4 : 1);   // 竖屏手机上局外界面的字与卡片放大
function titleLayout() {
  const portrait = H > W * 1.15;
  const size = Math.min(170, W * 0.2);
  const ty = portrait ? H * 0.22 : H * 0.235;
  const rackY = portrait ? H * 0.41 : ty + size * 0.74 + 44;
  const gap = Math.min(118, (W - 70) / BRUSH_ORDER.length);
  const L = portrait ? 120 : 116;
  const infoY = rackY + L + 34, ps = PS();
  // 开卷按钮排在笔说明之下：按五支笔里说明最长的那支留位，点选别的笔时按钮不跳；
  // 也不压到底下那行操作提示（H - 52）
  const rows = Math.max(...BRUSH_ORDER.map(id => rackInfo(id, ps).lines.length));
  const info = rackInfo(profile.brush, ps), lh = (ps > 1 ? 18 : 22) * ps;
  const infoBottom = infoY + 22 * ps + info.first + (rows - 1) * lh + 8 * ps;
  const half = 25 * ps;   // 开卷按钮半高
  const startY = Math.min(H - 52 - 12 * ps - half, Math.max(portrait ? H * 0.81 : H * 0.865, infoBottom + 16 * ps + half));
  return { size, ty, rackY, gap, L, infoY, startY };
}
// 笔挂下的说明：已得的笔列手感，未得的写怎么得；drawRack 照此画，titleLayout 照此留位
function rackInfo(id, ps) {
  const B = BRUSHES[id], fs = 15 * ps;
  if (brushOpen(id)) return { lines: ps > 1 ? B.perks : wrap(B.perks.join('　·　'), W - 60, fs), first: (ps > 1 ? 27 : 34) * ps };
  const S = SEALS.find(x => x.id === B.seal);
  return { lines: wrap(`印谱「${S.ch}」：${S.cond} —— 得印即得此笔`, W - 60, fs), first: 34 * ps };
}
function shownBrush() { return UI.peek && UI.t - UI.peek.t < 4 ? UI.peek.id : profile.brush; }
function selectBrush(id) {
  if (brushOpen(id)) { profile.brush = id; saveProfile(); UI.peek = null; Sound.select(); }
  else { UI.peek = { id, t: UI.t }; Sound.dry(); }
}
function cycleBrush(d) {
  const open = BRUSH_ORDER.filter(brushOpen);
  const i = open.indexOf(profile.brush);
  selectBrush(open[(i + d + open.length) % open.length]);
}
function drawTitle() {
  const c = ctx, t = UI.titleT, Lt = titleLayout();
  const size = Lt.size, y = Lt.ty;
  for (let i = 0; i < 2; i++) {
    const ch = '墨灵'[i], x = CX + (i - 0.5) * size * 1.04;
    const p = clamp((t - i * 0.45) / 0.9, 0, 1);
    if (p <= 0) continue;
    c.save();
    c.beginPath(); c.rect(x - size, y - size * 0.62, size * 2, size * 1.24 * easeOut(p)); c.clip();
    txt(ch, x + 5, y + 6, size, INK, 'center', 0.12);
    txt(ch, x, y, size, INK, 'center', 0.95);
    c.restore();
  }
  if (t > 1.4) {
    const p = clamp((t - 1.4) / 0.22, 0, 1), s = lerp(1.7, 1, easeOut(p)) * 58;
    c.save(); c.globalAlpha = p; c.translate(CX + size * 1.18, y + size * 0.36); c.rotate(-0.06);
    c.drawImage(sealCv, -s / 2, -s / 2, s, s);
    c.restore();
  }
  const a1 = clamp((t - 1.6) / 0.6, 0, 1);
  txt('以笔为刃　·　以墨为命', CX, y + size * 0.74, 22, INK, 'center', 0.8 * a1);
  const a2 = clamp((t - 1.9) / 0.6, 0, 1);
  drawRack(Lt, a2);
  if (pendingRun) {
    // 上回的局还在：点空白处不开新局，免得误触丢了进度
    const ps = PS(), bh = 46 * ps, w1 = 150 * ps, w2 = 130 * ps, g = 16 * ps;
    const w3 = vowsOpen() ? 130 * ps : 0, bx = CX - (w1 + w2 + g + (w3 ? w3 + g : 0)) / 2;
    if (a2 > 0.3) {
      c.globalAlpha = a2;
      button('接着画', bx, Lt.startY - bh / 2, w1, bh, resumeRun, true, 20 * ps);
      button('新开一卷', bx + w1 + g, Lt.startY - bh / 2, w2, bh, () => newRun(), false, 20 * ps);
      if (w3) button('戒印挑战', bx + w1 + w2 + 2 * g, Lt.startY - bh / 2, w3, bh, () => openVows('title'), false, 20 * ps);
      c.globalAlpha = 1;
    }
  } else if (a2 > 0.3) {
    const ps = PS(), bh = 50 * ps, bw = 180 * ps, w2 = vowsOpen() ? 130 * ps : 0, gap = 16 * ps;
    const x = CX - (bw + (w2 ? w2 + gap : 0)) / 2;
    c.globalAlpha = a2;
    button('落笔开卷', x, Lt.startY - bh / 2, bw, bh, () => newRun(), true, 22 * ps);
    if (w2) button('戒印挑战', x + bw + gap, Lt.startY - bh / 2, w2, bh, () => openVows('title'), false, 20 * ps);
    c.globalAlpha = 1;
  }
  // 设置、卷库、印谱（竖屏手机上放大，手指点得中）
  if (a2 > 0.05) {
    const ps = PS(), bw = 86 * ps, bh = 40 * ps, g = 10 * ps, fs = 19 * ps;
    c.globalAlpha = a2;
    if (installEvt) button('装到主屏', 22, 18, 116 * ps, bh, () => { const ev = installEvt; installEvt = null; ev.prompt(); }, false, fs);
    else if (iosBrowser()) txt('Safari「分享」→「添加到主屏幕」，断网也能玩', 22, 38, 13 * ps, INK, 'left', 0.5, 'normal');
    button('设置', W - 22 - 3 * bw - 2 * g, 18, bw, bh, () => openSettings('title'), false, fs);
    button('卷库', W - 22 - 2 * bw - g, 18, bw, bh, () => openGallery('title'), false, fs);
    button('印谱', W - 22 - bw, 18, bw, bh, () => openYinpu('title'), false, fs);
    txt(`${sealCount()} / ${SEALS.length}`, W - 22 - bw / 2, 18 + bh + 14 * ps, 13 * ps, INK, 'center', 0.5, 'normal');
    c.globalAlpha = 1;
  }
  if (pendingRun) txt(resumeLine(pendingRun), CX, H - 52, 15, INK, 'center', 0.7, 'normal');
  else txt('鼠标或手指按住拖动作画　·　← → 换笔　·　P 暂停　·　M 静音' + (Sound.isMuted() ? '（已静音）' : ''), CX, H - 52, 14, INK, 'center', 0.5, 'normal');
  if (best.score) txt(`最佳　${best.score} 分　·　至第 ${best.floor} 层`, CX, H - 28, 14, INK, 'center', 0.5, 'normal');
  txt('v' + GAME_VERSION, W - 12, H - 12, 11, INK, 'right', 0.32, 'normal');
}
function drawRack(Lt, a) {
  if (a <= 0) return;
  const c = ctx, n = BRUSH_ORDER.length, half = (n / 2) * Lt.gap + 14;
  const ry = Lt.rackY, x0 = CX - half, x1 = CX + half;
  c.save(); c.globalAlpha = a;
  // 笔挂：横杆、两柱、底座
  const wood = (y0, h) => { const g = c.createLinearGradient(0, y0, 0, y0 + h); g.addColorStop(0, '#8a5d3b'); g.addColorStop(0.5, '#5e3d26'); g.addColorStop(1, '#3d2617'); return g; };
  c.fillStyle = wood(ry + 6, Lt.L + 10);
  c.fillRect(x0 - 2, ry + 2, 7, Lt.L + 12); c.fillRect(x1 - 5, ry + 2, 7, Lt.L + 12);
  c.fillStyle = wood(ry + Lt.L + 12, 9); Art.roundRect(c, x0 - 18, ry + Lt.L + 12, x1 - x0 + 36, 9, 3); c.fill();
  c.fillStyle = wood(ry - 4, 9); Art.roundRect(c, x0 - 14, ry - 4, x1 - x0 + 28, 9, 4); c.fill();
  c.restore();
  const sel = profile.brush, shown = shownBrush();
  BRUSH_ORDER.forEach((id, i) => {
    const x = CX + (i - (n - 1) / 2) * Lt.gap, open = brushOpen(id);
    const bx = x - Lt.gap / 2 + 4, by = ry - 8, bw = Lt.gap - 8, bh = Lt.L + 40;
    const hov = hovering(bx, by, bw, bh);
    const amp = id === sel ? 0.05 : hov ? 0.07 : 0.015;
    const sway = Math.sin(UI.t * (id === sel ? 1.8 : 1.2) + i * 1.7) * amp;
    const bs = 1.3 * (PS() > 1 ? 1.2 : 1);
    c.save(); c.translate(x, ry + 3); c.scale(bs, bs);
    Art.drawBrush(c, id, 0, 0, (Lt.L - (id === 'dou' ? 0 : 8)) / bs, a, sway, !open);
    c.restore();
    if (open) txt(BRUSHES[id].ch, x, ry + Lt.L + 32, 17, id === sel ? CINNABAR : INK, 'center', a * (id === sel ? 1 : 0.6));
    else txt('？', x, ry + Lt.L + 32, 15, INK, 'center', a * 0.35, 'normal');
    if (id === shown) { c.strokeStyle = `rgba(${open ? CINNABAR : INK},${0.6 * a})`; c.lineWidth = 1.4; c.beginPath(); c.moveTo(x - 14, ry + Lt.L + 44); c.lineTo(x + 14, ry + Lt.L + 44); c.stroke(); }
    if (a > 0.5) UI.buttons.push({ x: bx, y: by, w: bw, h: bh, fn: () => selectBrush(id) });
  });
  const B = BRUSHES[shown], open = brushOpen(shown), ps = PS(), y = Lt.infoY + 22 * ps;
  const fs = 15 * ps, lh = (PS() > 1 ? 18 : 22) * ps, info = rackInfo(shown, ps);
  txt(`${B.name}　·　${open ? B.tag : '未得'}`, CX, y, 24 * ps, INK, 'center', (open ? 1 : 0.45) * a);
  info.lines.forEach((ln, k) => txt(ln, CX, y + info.first + k * lh, fs, INK, 'center', 0.72 * a, 'normal'));
}

// —— 印谱 ——
// —— 装到主屏（安卓 Chrome 给安装提示；iPhone 只能从 Safari 分享菜单添加）——
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });
window.addEventListener('appinstalled', () => { installEvt = null; });
function standalone() {
  if (typeof navigator === 'undefined') return true;
  return navigator.standalone === true || !!(window.matchMedia && matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches);
}
const iosBrowser = () => typeof navigator !== 'undefined' && /iP(hone|ad|od)/.test(navigator.userAgent) && !standalone();

// —— 设置 ——
function openSettings(from) { UI.back = from; screen = 'settings'; UI.titleT = 9; UI.slide = null; Sound.select(); }
function setQuality(q) {
  if (SET.quality === q) return;
  SET.quality = q; saveSettings();
  if (G && G.parts.length > partCap()) G.parts.length = partCap();
  resize();
}
function settingsLayout() {
  const ps = PS(), n = 6 + (canBuzz ? 1 : 0), cw = Math.min(W - 48, 600 * ps);
  const rowH = Math.min(74 * ps, (H - 200 * ps) / n);
  const top = Math.max(110 * ps, CY - (n * rowH + 186 * ps) / 2 + 96 * ps);
  return { ps, cw, x: CX - cw / 2, rowH, top, lw: 132 * ps };
}
function drawSettings() {
  const L = settingsLayout(), ps = L.ps, cx0 = L.x + L.lw, cw = L.cw - L.lw;
  UI.sliders = [];
  txt('设置', CX, L.top - 76 * ps, 40 * ps, INK);
  let y = L.top;
  const label = (t, sub) => {
    txt(t, L.x, y - (sub ? 9 * ps : 0), 20 * ps, INK, 'left', 0.9);
    if (sub) txt(sub, L.x, y + 15 * ps, 12 * ps, INK, 'left', 0.5, 'normal');
  };
  // 音量：一道墨痕，拖动或点按
  const slider = (k, t) => {
    label(t);
    const v = Sound.volume(k), tw = cw - 64 * ps, th = 5 * ps;
    ctx.fillStyle = `rgba(${INK},0.14)`; Art.roundRect(ctx, cx0, y - th / 2, tw, th, th / 2); ctx.fill();
    ctx.fillStyle = `rgba(${INK},0.78)`; Art.roundRect(ctx, cx0, y - th / 2, Math.max(th, tw * v), th, th / 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx0 + tw * v, y, 11 * ps, 0, TAU); ctx.fillStyle = `rgba(${INK},0.92)`; ctx.fill();
    txt(Sound.isMuted() ? '静音' : Math.round(v * 100) + '%', cx0 + tw + 16 * ps, y, 16 * ps, INK, 'left', 0.7, 'normal');
    UI.sliders.push({ k, x: cx0, w: tw, y: y - 24 * ps, h: 48 * ps });
    y += L.rowH;
  };
  // 多选一
  const seg = (t, sub, opts, cur, pick) => {
    label(t, sub);
    const gap = 10 * ps, bw = Math.min(150 * ps, (cw - gap * (opts.length - 1)) / opts.length), bh = 42 * ps;
    opts.forEach((o, i) => button(o[0], cx0 + i * (bw + gap), y - bh / 2, bw, bh, () => { pick(o[1]); Sound.select(); }, o[1] === cur, 17 * ps));
    y += L.rowH;
  };
  slider('mus', '音乐');
  slider('sfx', '音效');
  seg('声音', null, [['开', false], ['静音', true]], Sound.isMuted(), v => { Sound.init(); if (Sound.isMuted() !== v) Sound.toggleMute(); });
  seg('震屏闪白', '受击、落雷、伏妖时', [['正常', false], ['减弱', true]], SET.reduceFx, v => { SET.reduceFx = v; saveSettings(); });
  seg('画质', SET.quality === 'lo' ? '降分辨率、少粒子' : '高分屏原样绘制', [['精细', 'hi'], ['省电', 'lo']], SET.quality, setQuality);
  if (canBuzz) seg('震动', '命中、伤印、伏妖时', [['开', true], ['关', false]], SET.vibrate, v => { SET.vibrate = v; saveSettings(); if (v) buzz(40, true); });
  {
    // 试玩记录：导出给开发者看；手机上走系统分享
    const m = UI.recMsg && UI.t - UI.recMsg.t < 3 ? UI.recMsg.text : `本机已记 ${records.length} 局`;
    label('试玩记录', m);
    const gap = 10 * ps, bw = Math.min(150 * ps, (cw - gap) / 2), bh = 42 * ps;
    button('导出', cx0, y - bh / 2, bw, bh, exportRecords, false, 17 * ps);
    button(UI.t - (UI.recDel || -9) < 3 ? '再按清空' : '清空', cx0 + bw + gap, y - bh / 2, bw, bh, clearRecords, false, 17 * ps);
    y += L.rowH;
  }
  const bw = 100 * ps, bh = 42 * ps;
  button('返回', CX - bw / 2, Math.min(H - 70 * ps, y + 10 * ps), bw, bh, closeMeta, false, 19 * ps);
  txt('设置只存在这台设备上　·　Esc 返回', CX, Math.min(H - 18 * ps, y + 80 * ps), 13 * ps, INK, 'center', 0.45, 'normal');
}
function slideTo(sl, x) {
  Sound.setVolume(sl.k, clamp((x - sl.x) / sl.w, 0, 1));
  if (Sound.isMuted()) Sound.toggleMute();
  // 试听：音效轨落一滴墨，音乐轨拨一声弦（限频）
  if (UI.t - (UI.slideT || 0) > 0.12) { UI.slideT = UI.t; Sound.preview(sl.k); }
}
function openVows(from) {
  if (!vowsOpen()) return;
  UI.back = from; UI.vows = from === 'victory' ? G.vows.slice() : [];
  UI.tryFlow = false;
  screen = 'vows'; Sound.select();
}
function toggleVow(id) {
  UI.vows = vowIds(UI.vows.includes(id) ? UI.vows.filter(v => v !== id) : [...UI.vows, id]);
  Sound.select();
}
function beginVowRun() {
  if (!UI.vows.length && !UI.tryFlow) return;
  Sound.stamp();
  newRun(undefined, UI.vows, UI.tryFlow);
}
function toggleTryFlow() { if (flowOpen()) { UI.tryFlow = !UI.tryFlow; Sound.select(); } }
function tryFlowRun() { if (flowOpen()) { Sound.stamp(); newRun(undefined, [], true); } }
function drawVows() {
  const ps = PS(), w = Math.min(548 * ps, W - 60), x = CX - w / 2, top = CY - 207 * ps;
  txt('立 戒 印', CX, top, 42 * ps, INK);
  txt('选一枚或两枚，改写这一卷的打法', CX, top + 43 * ps, 19 * ps, INK);
  txt('此卷执笔：' + (BRUSHES[profile.brush] || BRUSHES.jian).name, CX, top + 72 * ps, 15 * ps, INK, 'center', 0.65, 'normal');
  VOWS.forEach((v, i) => {
    const y = top + (103 + 81 * i) * ps, on = UI.vows.includes(v.id), done = vowCleared(v.id);
    button('', x, y, w, 70 * ps, () => toggleVow(v.id), false);
    miniStamp(v.name[0], x + 31 * ps, y + 35 * ps, 36 * ps, on ? 0.92 : 0.5);
    txt(v.name + '　·　' + v.tag, x + 58 * ps, y + 22 * ps, 20 * ps, on ? CINNABAR : INK, 'left');
    txt((done ? '已通关 · ' : '') + (on ? '已选' : '未选'), x + w - 16 * ps, y + 22 * ps, 15 * ps, CINNABAR, 'right', on || done ? 1 : 0.5);
    txt(v.detail, x + 58 * ps, y + 48 * ps, 15 * ps, INK, 'left', 0.86, 'normal');
  });
  if (flowOpen()) button(UI.tryFlow ? '✓ 试流痕 · 本卷优先遇见字帖' : '试流痕 · 点选后本卷优先择帖', CX - 166 * ps, top + 267 * ps,
    332 * ps, 40 * ps, toggleTryFlow, UI.tryFlow, 16 * ps);
  else txt('首次立戒净第六层，可解锁新心得「流痕」', CX, top + 285 * ps, 16 * ps, CINNABAR);
  const record = profile.vowBest[UI.vows.join('+')];
  if (record) txt(`此组合最佳：${record.score} 分 · 全局第 ${record.floor} 层${record.won ? ' · 已净正传' : ''}`, CX, top + 323 * ps, 14 * ps, INK, 'center', 0.65, 'normal');
  const y = top + 345 * ps;
  button('返回', CX - 140 * ps, y, 100 * ps, 48 * ps, closeMeta, false, 18 * ps);
  if (UI.vows.length || UI.tryFlow) button(UI.vows.length ? '立印开卷 · ' + UI.vows.length + ' 枚' : '试帖开卷',
    CX - 20 * ps, y, 168 * ps, 48 * ps, beginVowRun, true, 18 * ps);
  else txt('先选一枚戒印', CX + 64 * ps, y + 24 * ps, 17 * ps, INK, 'center', 0.65);
  if (pendingRun) txt('新开后会替换未完成的上一卷。', CX, y + 71 * ps, 14 * ps, INK, 'center', 0.65, 'normal');
}
function openYinpu(from) { UI.back = from; screen = 'yinpu'; UI.titleT = 9; Sound.select(); }
function closeMeta() {
  const to = UI.back || 'title';
  UI.view = null; UI.drag = null;
  if (to === 'gallery') { openGallery(UI.gal ? UI.gal.from : 'title', true); return; }
  screen = to === 'title' || !G ? 'title' : to;
  if (screen === 'title') UI.titleT = 9;
  Sound.select();
}
function drawYinpu() {
  const n = SEALS.length, cols = W >= 1040 ? 6 : W >= 700 && H < W ? 4 : 3, ps = PS();
  const rows = Math.ceil(n / cols), cw = Math.min(170 * ps, (W - 60) / cols), ch = Math.min(176 * ps, (H - 230) / rows);
  const x0 = CX - cols * cw / 2, y0 = Math.max(118, CY - rows * ch / 2 + 10);
  txt('印谱', CX, y0 - 70 * ps, 40 * ps, INK);
  txt(`已得 ${sealCount()} / ${n}　·　累计伏妖 ${profile.kills}`, CX, y0 - 34 * ps, 15 * ps, INK, 'center', 0.6, 'normal');
  const ss = Math.min(64 * ps, ch * 0.42), fs = 13 * ps, lh = 18 * ps;
  SEALS.forEach((S, i) => {
    const cx = x0 + (i % cols + 0.5) * cw, cy = y0 + Math.floor(i / cols) * ch;
    const got = !!profile.seals[S.id];
    const art = sealArt(S.ch, 128, got ? { seed: i + 3, bai: i % 3 !== 2 } : { seed: i + 3, bai: false, color: '150,140,128' });
    ctx.save(); ctx.globalAlpha = got ? 0.95 : 0.35; ctx.translate(cx, cy + ss / 2 + 4); ctx.rotate(got ? (i % 2 ? -0.04 : 0.03) : 0);
    ctx.drawImage(art, -ss / 2, -ss / 2, ss, ss); ctx.restore();
    const lines = wrap(S.cond, cw - 14, fs).slice(0, 2);
    lines.forEach((ln, k) => txt(ln, cx, cy + ss + 22 * ps + k * lh, fs, INK, 'center', got ? 0.8 : 0.5, 'normal'));
    if (S.brush) txt(`得笔 · ${BRUSHES[S.brush].name}`, cx, cy + ss + 24 * ps + lines.length * lh, fs, got ? CINNABAR : INK, 'center', got ? 0.9 : 0.4);
  });
  button('返回', CX - 50 * ps, Math.min(H - 70 * ps, y0 + rows * ch + 16), 100 * ps, 42 * ps, closeMeta);
}

// —— 卷库 ——
function openGallery(from, keep) {
  const old = UI.gal;
  UI.back = from; screen = 'gallery'; UI.titleT = 9;
  UI.gal = { list: keep && old ? old.list : null, page: keep && old ? old.page : 0, thumbs: keep && old ? old.thumbs : new Map(), from };
  const g = UI.gal;
  Scroll.list().then(list => {
    g.list = list;
    for (const r of list) if (!g.thumbs.has(r.id) && r.thumb) Scroll.loadImage(r.thumb).then(b => g.thumbs.set(r.id, b)).catch(() => {});
  });
  if (!keep) Sound.select();
}
function galleryLayout() {
  const ps = PS(), cw = Math.min(W - 48, 920), chh = 108 * ps, gap = 14 * ps, top = 118 * ps;
  const per = Math.max(1, Math.floor((H - top - 110 * ps) / (chh + gap)));
  return { cw, chh, gap, top, per, ps, x: CX - cw / 2 };
}
function resultText(r) {
  if (r.endless) return `续卷至第${cnNum(r.floor - FINAL_FLOOR)}层` + (r.rating ? ' · ' + r.rating : '');
  if (r.end === 'win') return '三卷尽净' + (r.rating ? ' · ' + r.rating : '');
  return '印碎于' + Scroll.placeName(r.floor);
}
function drawGallery() {
  const g = UI.gal, Lg = galleryLayout(), ps = Lg.ps;
  txt('卷库', CX, 50 * ps, 40 * ps, INK);
  if (!g.list) { txt('取卷中…', CX, CY, 20 * ps, INK, 'center', 0.6); button('返回', CX - 50 * ps, H - 76 * ps, 100 * ps, 42 * ps, closeMeta); return; }
  if (g.list.length) txt(`共 ${g.list.length} 卷　·　点选展卷`, CX, 86 * ps, 15 * ps, INK, 'center', 0.6, 'normal');
  else wrap('卷库尚空 —— 一局终了，纸上墨迹自会裱成画卷', W - 60, 19 * ps).forEach((ln, k) => txt(ln, CX, CY + k * 28 * ps, 19 * ps, INK, 'center', 0.7));
  const pages = Math.max(1, Math.ceil(g.list.length / Lg.per));
  g.page = clamp(g.page, 0, pages - 1);
  // 左栏按本页最宽的一行留位，缩略图让出来；窄屏把分隔号收紧
  const w = Lg.cw, h = Lg.chh, sep = w < 480 ? '·' : '　·　';
  const cards = g.list.slice(g.page * Lg.per, (g.page + 1) * Lg.per).map(r => {
    const B = BRUSHES[r.brush] || BRUSHES.jian;
    return { r, line2: `${B.name}${sep}${resultText(r)}${r.vows?.length ? ' · 戒印' : ''}`,
      line3: `${r.score} 分${sep}伏妖 ${r.kills}${sep}${new Date(r.date).toTimeString().slice(0, 5)}` };
  });
  let textW = 0;
  for (const c of cards) {
    ctx.font = `${15 * ps}px ${FONT}`; textW = Math.max(textW, ctx.measureText(c.line2).width);
    ctx.font = `${14 * ps}px ${FONT}`; textW = Math.max(textW, ctx.measureText(c.line3).width);
  }
  const infoW = Math.min(w * 0.7, Math.max(Math.min(300 * ps, w * 0.44), textW + 30)), tw = w - infoW - 10, th = h - 16 * ps;
  cards.forEach(({ r, line2, line3 }, i) => {
    const x = Lg.x, y = Lg.top + i * (Lg.chh + Lg.gap);
    const hov = hovering(x, y, w, h);
    ctx.fillStyle = `rgba(250,246,234,${hov ? 0.98 : 0.86})`; Art.roundRect(ctx, x, y, w, h, 8); ctx.fill();
    ctx.strokeStyle = hov ? `rgba(${CINNABAR},0.85)` : `rgba(${INK},0.35)`; ctx.lineWidth = hov ? 2 : 1.1; ctx.stroke();
    const img = g.thumbs.get(r.id);
    if (img) {
      const k = th / img.height, sw = Math.min(img.width, tw / k);
      ctx.drawImage(img, img.width - sw, 0, sw, img.height, x + w - 8 - sw * k, y + 8 * ps, sw * k, th);
    } else { ctx.fillStyle = '#2d2823'; ctx.fillRect(x + w - 8 - tw, y + 8 * ps, tw, th); }
    txt(Scroll.dateCn(r.date), x + 16, y + 26 * ps, 17 * ps, INK, 'left', 0.9);
    txt(line2, x + 16, y + 56 * ps, 15 * ps, r.end === 'win' ? CINNABAR : INK, 'left', 0.8, 'normal');
    txt(line3, x + 16, y + 84 * ps, 14 * ps, INK, 'left', 0.6, 'normal');
    UI.buttons.push({ x, y, w, h, fn: () => openViewer(r, 'gallery') });
  });
  const by = H - 76 * ps, bw = 100 * ps, bh = 42 * ps;
  if (pages > 1) {
    button('上一页', CX - bw / 2 - 20 - bw, by, bw, bh, () => { g.page = Math.max(0, g.page - 1); });
    button('下一页', CX + bw / 2 + 20, by, bw, bh, () => { g.page = Math.min(pages - 1, g.page + 1); });
    txt(`${g.page + 1} / ${pages}`, CX, by - 18 * ps, 14 * ps, INK, 'center', 0.55, 'normal');
  }
  button('返回', CX - bw / 2, by, bw, bh, closeMeta);
}

// —— 观卷 ——
function openViewer(r, from) {
  UI.back = from; screen = 'scroll'; UI.drag = null;
  const v = UI.view = { rec: r, img: null, ox: 0, vx: 0, t: 0, del: -9, stored: r.img ? r : null };
  if (r.img) Scroll.loadImage(r.img).then(b => { v.img = b; v.t = 0; Sound.ziEnter(); }).catch(() => { v.err = true; });
  Sound.select();
}
function openCurrentScroll(from) {
  if (!G || !G.saved) return;
  const s = G.saved;
  openViewer(s.rec, from);
  UI.view.img = s.cv; UI.view.saved = s;
  logScroll('view');
  Sound.ziEnter();
}
function viewerLayout() {
  const dh = Math.min(H * 0.6, 540, W * 0.9);
  return { dh, top: H * 0.47 - dh / 2 };
}
function viewerMaxOx() {
  const v = UI.view;
  if (!v || !v.img) return 0;
  return Math.max(0, v.img.width * viewerLayout().dh / v.img.height - W);
}
function exportScroll() {
  const v = UI.view;
  if (!v || !v.img) return;
  const blob = v.stored ? v.stored.img : v.saved && v.saved.stored ? v.saved.stored.img : null;
  if (v.saved) logScroll('save');
  if (blob) Scroll.download(blob, Scroll.fileName(v.rec));
  else if (v.saved) Scroll.toBlob(v.saved.cv, 'image/jpeg', 0.86).then(b => Scroll.download(b, Scroll.fileName(v.rec)));
  v.toast = UI.t;
  Sound.stamp();
}
function deleteScroll() {
  const v = UI.view;
  if (UI.t - v.del > 3) { v.del = UI.t; Sound.dry(); return; }
  Scroll.remove(v.rec.id).then(() => { if (UI.gal && UI.gal.list) UI.gal.list = UI.gal.list.filter(r => r.id !== v.rec.id); closeMeta(); });
  Sound.thunder(0);
}
function updateViewer(rdt) {
  const v = UI.view;
  if (!v) return;
  v.t += rdt;
  if (!UI.drag && Math.abs(v.vx) > 1) { v.ox += v.vx * rdt; v.vx *= Math.exp(-rdt * 4); }
  v.ox = clamp(v.ox, 0, viewerMaxOx());
}
function drawViewer() {
  const v = UI.view, Lv = viewerLayout(), r = v.rec, B = BRUSHES[r.brush] || BRUSHES.jian;
  txt('墨灵图', CX, Lv.top - 58, 32, INK);
  // 窄屏放不下：先收紧分隔号，再省去日期
  const parts = [Scroll.dateCn(r.date), B.name, resultText(r), `${r.score} 分`];
  ctx.font = `15px ${FONT}`;
  let head = parts.join('　·　');
  if (ctx.measureText(head).width > W - 32) head = parts.join('·');
  if (ctx.measureText(head).width > W - 32) head = parts.slice(1).join('·');
  txt(head, CX, Lv.top - 24, 15, INK, 'center', 0.65, 'normal');
  ctx.fillStyle = '#2d2823'; ctx.fillRect(0, Lv.top, W, Lv.dh);
  if (!v.img) txt(v.err ? '此卷已损' : '展卷中…', CX, Lv.top + Lv.dh / 2, 20, '235,225,205', 'center', 0.8);
  else {
    const k = Lv.dh / v.img.height, dw = v.img.width * k;
    const x = dw <= W ? CX - dw / 2 : W - dw + v.ox;
    const p = easeOut(clamp(v.t / 1.5, 0, 1));
    const l = Math.max(x, 0), r0 = Math.min(x + dw, W), rx = lerp(r0, l, p);
    ctx.save(); ctx.beginPath(); ctx.rect(rx, Lv.top, W - rx, Lv.dh); ctx.clip();
    ctx.drawImage(v.img, x, Lv.top, dw, Lv.dh);
    ctx.restore();
    if (p < 1) {
      // 正在展开的卷轴
      const g = ctx.createLinearGradient(rx - 12, 0, rx + 10, 0);
      g.addColorStop(0, '#3b2416'); g.addColorStop(0.5, '#a0714a'); g.addColorStop(1, '#2e1c11');
      ctx.fillStyle = g; ctx.fillRect(rx - 12, Lv.top + Lv.dh * 0.05, 22, Lv.dh * 0.9);
      ctx.fillStyle = '#dfe6d4'; ctx.fillRect(rx - 9, Lv.top + Lv.dh * 0.02, 16, Lv.dh * 0.04); ctx.fillRect(rx - 9, Lv.top + Lv.dh * 0.94, 16, Lv.dh * 0.04);
    }
    const max = viewerMaxOx();
    if (max > 0) {
      const bw = Math.min(360, W - 80), bx = CX - bw / 2, y = Lv.top + Lv.dh + 20;
      const hw = Math.max(24, bw * W / dw), f = 1 - v.ox / max;
      ctx.fillStyle = `rgba(${INK},0.15)`; Art.roundRect(ctx, bx, y - 2, bw, 4, 2); ctx.fill();
      ctx.fillStyle = `rgba(${INK},0.6)`; Art.roundRect(ctx, bx + (bw - hw) * f, y - 3, hw, 6, 3); ctx.fill();
      txt('拖动观卷 · ← → 亦可 · 自右向左读', CX, y + 22, 13, INK, 'center', 0.5, 'normal');
    }
  }
  const by = Math.min(H - 64, Lv.top + Lv.dh + 64);
  const canDel = UI.back === 'gallery';
  const xs = canDel ? [CX - 196, CX - 60, CX + 76] : [CX - 128, CX + 8];
  button('存为图片', xs[0], by, 120, 44, exportScroll, true);
  if (canDel) button(UI.t - v.del < 3 ? '再按焚卷' : '焚卷', xs[1], by, 120, 44, deleteScroll);
  button('返回', xs[canDel ? 2 : 1], by, 120, 44, closeMeta);
  if (v.toast != null && UI.t - v.toast < 2.2) txt('已存 ' + Scroll.fileName(r), CX, by + 64, 14, INK, 'center', 0.6, 'normal');
}

// —— 得印提示 ——
function drawToasts() {
  const T = UI.toasts[0];
  if (!T) return;
  const a = Math.min(1, T.t / 0.25) * Math.min(1, (3.8 - T.t) / 0.4);
  const w = 286, h = 64, x = W - 22 - w + (1 - easeOut(Math.min(1, T.t / 0.3))) * 60, y = 88;
  ctx.save(); ctx.globalAlpha = clamp(a, 0, 1);
  ctx.fillStyle = 'rgba(250,246,234,0.96)'; Art.roundRect(ctx, x, y, w, h, 8); ctx.fill();
  ctx.strokeStyle = `rgba(${CINNABAR},0.7)`; ctx.lineWidth = 1.4; ctx.stroke();
  const s = 46, st = clamp((T.t - 0.15) / 0.25, 0, 1), sc = lerp(1.6, 1, easeOut(st));
  ctx.save(); ctx.translate(x + 36, y + h / 2); ctx.rotate(-0.05); ctx.scale(sc, sc);
  ctx.globalAlpha *= st; ctx.drawImage(sealArt(T.S.ch, 128, { seed: 9 }), -s / 2, -s / 2, s, s); ctx.restore();
  txt(`印谱 · ${T.S.ch}`, x + 70, y + 22, 18, INK, 'left');
  if (T.S.brush) txt(`得笔：${BRUSHES[T.S.brush].name} —— 卷首笔匣可选`, x + 70, y + 46, 13, CINNABAR, 'left', 0.95, 'normal');
  else if (T.S.insight) txt('新心得已得 · 下局可直接试帖', x + 70, y + 46, 13, CINNABAR, 'left', 0.95, 'normal');
  else txt(T.S.cond, x + 70, y + 46, 13, INK, 'left', 0.7, 'normal');
  ctx.restore();
}

function drawCursor() {
  const m = UI.mouse;
  if (!m.in || !m.isMouse || (G && (G.stroke || (G.zj && G.zj.cur)))) return;
  ctx.fillStyle = `rgba(${INK},0.6)`;
  ctx.beginPath(); ctx.arc(m.x, m.y, 3.5, 0, TAU); ctx.fill();
  ctx.strokeStyle = `rgba(${INK},0.25)`; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(m.x, m.y, 9, 0, TAU); ctx.stroke();
}
