'use strict';
// 墨灵 · 游戏 13/13 · input：输入、调试接口与启动（须最后载入）

// —— 输入 ——
let activeId = null;
function toWorld(e) {
  const r = cv.getBoundingClientRect();
  return { x: (e.clientX - r.left) / K, y: (e.clientY - r.top) / K };
}
function trackMouse(e, p) { UI.mouse.x = p.x; UI.mouse.y = p.y; UI.mouse.in = true; UI.mouse.isMouse = e.pointerType === 'mouse'; }
// 局中落笔：真实指针与自动试玩共用（返回 true 表示开始了一笔）
function penDown(x, y, t) {
  if (G.ziFx && !G.ziFx.applied) return false;
  if (!G.zj && ziReady() && Math.hypot(x - CX, y - CY) < SEAL_SIZE * 0.85) { enterZi(); return false; }
  if (G.zj) zjDown(x, y, t);
  else beginStroke(x, y, t);
  return true;
}
function penMove(x, y, t) {
  if (G.zj && G.zj.cur) { zjPoint(x, y, t); return; }
  if (G.stroke) moveStroke(x, y, t);
}
function penUp() {
  if (G.zj) zjUp();
  else if (G.stroke) endStroke();
}
cv.addEventListener('pointerdown', e => {
  e.preventDefault();
  Sound.init();
  const p = toWorld(e);
  trackMouse(e, p);
  if (e.button === 2) return;
  for (const b of UI.buttons) {
    if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) { b.fn(); return; }
  }
  // 御笔：左手、右手各一指，各自捕获
  if (screen === 'yubi') { if (Yubi.down(e, p)) { try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ } } return; }
  // 卷首：片头里点一下只是跳过片头；开卷要点「落笔开卷」，免得一进来误触就开局、没看见笔匣与设置
  if (screen === 'title') { if (UI.titleT < 2.4) UI.titleT = 9; return; }
  if (screen === 'settings') {
    const sl = UI.sliders.find(q => p.x >= q.x - 14 && p.x <= q.x + q.w + 14 && p.y >= q.y && p.y <= q.y + q.h);
    if (sl) { activeId = e.pointerId; UI.slide = sl; try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ } slideTo(sl, p.x); }
    return;
  }
  if (screen === 'scroll' && UI.view) {
    activeId = e.pointerId;
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
    UI.drag = { x: p.x, ox: UI.view.ox, lx: p.x, lt: e.timeStamp, v: 0 };
    UI.view.vx = 0;
    return;
  }
  if (screen === 'play' && activeId === null && penDown(p.x, p.y, e.timeStamp)) {
    activeId = e.pointerId;
    if (G.log && !G.log.input) G.log.input = e.pointerType || 'mouse';
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
  }
});
cv.addEventListener('pointermove', e => {
  const p = toWorld(e);
  trackMouse(e, p);
  if (screen === 'yubi') {
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    Yubi.move(e, (evs.length ? evs : [e]).map(ev => { const q = toWorld(ev); q.t = ev.timeStamp; return q; }));
    return;
  }
  if (UI.slide && e.pointerId === activeId) { slideTo(UI.slide, p.x); return; }
  if (UI.drag && e.pointerId === activeId && UI.view) {
    const dt = Math.max(1, e.timeStamp - UI.drag.lt) / 1000;
    UI.drag.v = UI.drag.v * 0.5 + ((p.x - UI.drag.lx) / dt) * 0.5;
    UI.drag.lx = p.x; UI.drag.lt = e.timeStamp;
    UI.view.ox = clamp(UI.drag.ox + (p.x - UI.drag.x), 0, viewerMaxOx());
    return;
  }
  if (e.pointerId !== activeId || !G || !(G.stroke || (G.zj && G.zj.cur))) return;
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
  for (const ev of (evs.length ? evs : [e])) {
    const q = toWorld(ev);
    penMove(q.x, q.y, ev.timeStamp);
    if (!G.stroke && !(G.zj && G.zj.cur)) break;
  }
});
const release = e => {
  if (screen === 'yubi') { Yubi.up(e, false); return; }
  if (e.pointerId !== activeId) return;
  activeId = null;
  if (UI.slide) { UI.slide = null; return; }
  if (UI.drag) { if (UI.view) UI.view.vx = clamp(UI.drag.v, -3000, 3000); UI.drag = null; return; }
  if (G) penUp();
};
cv.addEventListener('pointerup', release);
cv.addEventListener('pointercancel', e => {
  if (screen === 'yubi') { Yubi.up(e, true); return; }
  if (e.pointerId !== activeId) return;
  activeId = null; UI.slide = UI.drag = null;
  if (!G) return;
  if (G.zj && G.zj.cur) { G.zj.cur = null; G.zj.idle = 0; Sound.brush(0, false); }
  else cancelStroke();
});
cv.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') UI.mouse.in = false; });
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('wheel', e => {
  if (screen !== 'scroll' || !UI.view) return;
  e.preventDefault();
  UI.view.vx = 0;
  UI.view.ox = clamp(UI.view.ox + e.deltaY - e.deltaX, 0, viewerMaxOx());
}, { passive: false });
window.addEventListener('keydown', e => {
  if (screen === 'yubi') { Yubi.key(e, true); return; }
  const k = e.key.toLowerCase();
  if (screen === 'play' && G && G.zj) {
    // 书写字诀时：Esc 罢笔，退格/Z 撤一笔，空格/回车 落款
    if (k === 'escape') { cancelZi(); return; }
    if (k === 'backspace' || k === 'z') { undoZi(); e.preventDefault(); return; }
    if (k === ' ' || k === 'enter') { finishZi(); e.preventDefault(); return; }
  }
  if (META[screen]) {
    if (k === 'escape' || k === 'backspace') { closeMeta(); return; }
    if (screen === 'vows' && /^[1-2]$/.test(k) && !e.repeat) { toggleVow(VOWS[Number(k) - 1].id); return; }
    if (screen === 'vows' && k === 't' && !e.repeat) { toggleTryFlow(); return; }
    if (screen === 'vows' && k === 'enter' && !e.repeat) { Sound.init(); beginVowRun(); e.preventDefault(); return; }
    if (screen === 'scroll' && UI.view) {
      if (k === 'arrowleft') UI.view.vx = 900;
      else if (k === 'arrowright') UI.view.vx = -900;
      else if (k === 'home') { UI.view.ox = 0; UI.view.vx = 0; }
      else if (k === 'end') { UI.view.ox = viewerMaxOx(); UI.view.vx = 0; }
    }
    if (screen === 'gallery' && UI.gal) {
      if (k === 'arrowleft' || k === 'pageup') UI.gal.page = Math.max(0, UI.gal.page - 1);
      else if (k === 'arrowright' || k === 'pagedown') UI.gal.page++;
    }
    if (k !== 'm') return;
  }
  if (screen === 'title' && (k === 'arrowleft' || k === 'arrowright')) { cycleBrush(k === 'arrowleft' ? -1 : 1); return; }
  if (k === 'm') { Sound.init(); Sound.toggleMute(); }
  else if (k === 'p' || k === 'escape') togglePause();
  else if (k === 'v') { SET.reduceFx = !SET.reduceFx; saveSettings(); }
  else if (screen === 'choose' && (k === '1' || k === '2' || k === '3')) choose(Number(k) - 1);
  else if (k === 'enter' || k === ' ') {
    if (screen === 'title') { Sound.init(); if (pendingRun) resumeRun(); else newRun(); }
    else if (screen === 'over') retryRun();
    else if (screen === 'play' && k === ' ' && ziReady()) enterZi();
    e.preventDefault();
  }
});
window.addEventListener('keyup', e => { if (screen === 'yubi') Yubi.key(e, false); });
document.addEventListener('visibilitychange', () => { if (document.hidden && screen === 'play') togglePause(); if (document.hidden && screen === 'yubi') Yubi.pause(); });
let resizeTimer = 0;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 120); });

// —— 调试 ——
if (DEBUG) {
  window.__ink = {
    get G() { return G; },
    get screen() { return screen; },
    freeze(v) { frozen = v !== false; },
    step(sec) { const n = Math.max(1, Math.round((sec || 1 / 60) * 60)); for (let i = 0; i < n; i++) update(1 / 60); render(); },
    start(seed, vows, tryFlow) { newRun(seed == null ? 1 : seed, vows, tryFlow); },
    floor(n) { if (!G) newRun(1); startFloor(n); },
    skipIntro() { if (G) G.introT = 0.0001; },
    spawn(type, x, y) { const e = spawnEnemy(type, x == null ? CX + 200 : x, y == null ? CY : y); flushEnemies(); return e; },
    boss(type) { spawnBoss(type); flushEnemies(); },
    draw(points, ms) {
      const t0 = performance.now(), dt = (ms || 300) / Math.max(1, points.length - 1);
      beginStroke(points[0].x, points[0].y, t0);
      if (!G.stroke) return null;
      for (let i = 1; i < points.length && G.stroke; i++) moveStroke(points[i].x, points[i].y, t0 + i * dt);
      const kind = G.stroke ? endStroke() : (G.oldStrokes[G.oldStrokes.length - 1] || {}).kind;
      flushEnemies();
      return kind;
    },
    classify(points) { return Gesture.classify(points).kind; },
    yi(v) { G.yi = v == null ? YI_MAX : v; },
    // 模拟写一个字：strokes 为若干笔（世界坐标）；finish=false 时只写不落款
    zi(strokes, finish) {
      if (!G.zj) { G.yi = YI_MAX; enterZi(); }
      if (!G.zj) return null;
      let t = performance.now();
      for (const s of strokes) {
        zjDown(s[0].x, s[0].y, t);
        for (let i = 1; i < s.length; i++) { t += 8; zjPoint(s[i].x, s[i].y, t); }
        zjUp();
      }
      if (finish === false) return 'writing';
      finishZi();
      return G.ziFx ? G.ziFx.key : null;
    },
    glyph(strokes) { return Glyph.recognize(strokes, G ? ziKnown() : undefined); },
    give(id, n) { G.up[id] = lv(id) + (n || 1); },
    pick(i) { choose(i); },
    god(v) { G.god = v !== false; },
    killAll() { for (const e of G.enemies) kill(e, 'debug', 0, 0); flushEnemies(); },
    // 局外：笔匣、印谱、画卷（调试存档与正式存档分开）
    brush(id) { if (id) { profile.brush = id; saveProfile(); } return G ? G.brush : profile.brush; },
    award(id) { if (id === 'all') SEALS.forEach(S => award(S.id)); else award(id); return Object.keys(profile.seals); },
    resetProfile() { localStorage.removeItem(PROFILE_KEY); profile = loadProfile(); saveProfile(); },
    profile() { return JSON.parse(JSON.stringify(profile)); },
    lose() { if (G) { screen = 'dying'; G.sealHp = 0; G.deathT = 0.01; } },
    clearFloor() { if (G && screen === 'play') { for (const e of G.enemies) kill(e, 'debug', 0, 0); flushEnemies(); G.waves = G.waves.map(() => ({ spawns: [], nextAt: 0, maxT: 0 })); G.waveI = G.waves.length - 1; G.pending = []; if (G.boss) bossDefeated(); floorClear(); } },
    panels() { return G ? G.panels.map(p => ({ floor: p.floor, scene: p.scene, boss: p.boss, flawless: p.flawless, fell: p.fell })) : []; },
    saved() { return G && G.saved ? { rec: G.saved.rec, w: G.saved.cv.width, h: G.saved.cv.height, stored: !!G.saved.stored } : null; },
    gallery() { openGallery('title'); },
    view() { openCurrentScroll(screen); },
    yinpu() { openYinpu('title'); },
    title() { toTitle(); },
    scrolls() { return Scroll.list().then(l => l.map(r => ({ id: r.id, floor: r.floor, end: r.end, w: r.w, h: r.h, img: r.img && r.img.size, thumb: r.thumb && r.thumb.size }))); },
    info() {
      return { screen, brush: G && G.brush, floor: G && G.floor, ink: G && Math.round(G.ink), seal: G && G.sealHp, yi: G && Math.round(G.yi), zj: !!(G && G.zj), allies: G && G.allies.length, shan: !!(G && G.shan), enemies: G && G.enemies.length, shots: G && G.shots.length, score: G && G.score, wave: G && G.waveI, waves: G && G.waves.length, boss: G && G.boss && G.boss.type, bossHp: G && bossHp(), ups: G && Object.assign({}, G.up) };
    },
    world() { return { W, H, CX, CY, K, DPR }; },
    circle(cx, cy, r, turns) { const pts = [], n = 60; for (let i = 0; i <= n; i++) { const a = i / n * TAU * (turns || 1.05); pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }); } return pts; },
    line(ax, ay, bx, by) { const pts = [], n = 30; for (let i = 0; i <= n; i++) pts.push({ x: lerp(ax, bx, i / n), y: lerp(ay, by, i / n) }); return pts; },
    bench(n) { const t0 = performance.now(); for (let i = 0; i < (n || 60); i++) render(); return (performance.now() - t0) / (n || 60); },
    notice(t) { UI.notice = { text: t || '画面有些卡顿 —— 暂停 → 设置 → 画质选「省电」会流畅些', t: 0 }; },
    // —— 局中存档与试玩记录 ——
    checkpoint() { try { return JSON.parse(localStorage.getItem(RUN_KEY)); } catch (e) { return null; } },
    pending() { pendingRun = loadPending(); return pendingRun; },   // 重读存档，相当于重开页面后的卷首
    resume() { resumeRun(); return screen; },
    log() {
      if (!G || !G.log) return null;
      if (!G.log.end) closeFloorLog();
      return Object.assign(compactLog(G.log), G.log.end ? {} : { end: 'open', floor: G.floor, score: G.score });
    },
    records() { return records.slice(); },
    yubi() { Yubi.start(); return Yubi.state; },
    // —— 自动试玩（tools/bot.js、tools/sim.mjs）：与真实指针同一条落笔路径 ——
    tick(rdt) { update(rdt || 1 / 60); },
    pen: {
      down(x, y, t) { return screen === 'play' && !!G && penDown(x, y, t); },
      move(x, y, t) { if (screen === 'play' && G) penMove(x, y, t); },
      up() { if (G) penUp(); },
    },
    calc: { inkMax, brushDmg, BR, isImmune, ziKnown, ziReady, ziBox, speedMul, lv, SEAL_R, SEAL_SIZE, YI_MAX, unlocked: () => ({ lei: !!G.up.lei, lang: !!G.up.lang, zhen: !!G.up.zhen }) },
  };
  // ?debug&bot：机器人在浏览器里当面试玩
  if (/[?&]bot\b/.test(location.search)) {
    const s = document.createElement('script');
    s.src = 'tools/bot.js';
    s.onload = () => { window.__bot = MolingBot.create(window.__ink); };
    document.body.appendChild(s);
  }
}

// —— 启动 ——
resize();
let last = performance.now();
function frame(now) {
  const rdt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  if (!frozen) { if (window.__bot) window.__bot.step(rdt); update(rdt); watchPerf(rdt); }
  render();
  if (!window.__inkStarted) { window.__inkStarted = true; if (document.documentElement) document.documentElement.dataset.gameReady = GAME_VERSION; const el = document.getElementById('boot-err'); if (el) el.remove(); }   // 开卷了：撤掉 index.html 里的出错提示
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
