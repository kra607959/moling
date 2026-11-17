'use strict';
// 墨灵 · 游戏 2/13 · log：试玩记录；局中存档（页面被系统收走后「接着画」）

// —— 试玩记录：每局按层记下用时、失印、笔法、字诀与所择心得；设置页导出给开发者（只存本机）——
const REC_KEY = DEBUG ? 'moling.records.debug' : 'moling.records';
const REC_MAX = 40;
let records = (function () {
  try { const a = JSON.parse(localStorage.getItem(REC_KEY)); return Array.isArray(a) ? a : []; } catch (e) { return []; }
})();
function saveRecord(log) {
  const i = records.findIndex(r => r.id === log.id);
  if (i >= 0) records[i] = log; else records.push(log);
  if (records.length > REC_MAX) records.splice(0, records.length - REC_MAX);
  try { localStorage.setItem(REC_KEY, JSON.stringify(records)); } catch (e) { /* 忽略 */ }
}
// 小数留一位，去掉内部用的起点字段
const compactLog = L => JSON.parse(JSON.stringify(L, (k, v) => (k === 'kills0' || k === 't0' || k === 'lost0' ? undefined : typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 10) / 10 : v)));
function deviceInfo() {
  if (typeof navigator === 'undefined') return { os: 'sim' };
  const ua = navigator.userAgent || '';
  const os = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'ios'
    : /Android/.test(ua) ? 'android' : /Windows/.test(ua) ? 'windows' : /Mac OS X/.test(ua) ? 'mac' : /Linux/.test(ua) ? 'linux' : 'other';
  return { os, w: Math.round(window.innerWidth), h: Math.round(window.innerHeight), dpr: window.devicePixelRatio || 1, touch: navigator.maxTouchPoints || 0, app: standalone(), quality: SET.quality, reduceFx: SET.reduceFx };
}
function newLog() {
  const dev = deviceInfo();
  if (persisted != null) dev.persist = persisted;
  return { v: 1, ver: GAME_VERSION, id: G.runId, start: new Date().toISOString(), brush: G.brush, vows: G.vows.slice(), ...(G.tryFlow ? { tryFlow: true } : {}), dev, input: null, resumes: 0, pauses: 0, floors: [], end: null, scroll: { view: 0, save: 0 } };
}
// 申请持久存储：印谱、卷库、试玩记录只在本机，免得浏览器清理空间时被一并清掉（结果记进设备信息）
let persisted = null;
function askPersist() {
  if (persisted != null || typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.persist) return;
  persisted = false;
  navigator.storage.persisted().then(p => p || navigator.storage.persist()).then(p => {
    persisted = !!p;
    if (G && G.log && G.log.dev) G.log.dev.persist = persisted;
  }).catch(() => {});
}
// 观卷、存图也记进本局（局已结束时补存一次）
function logScroll(k) {
  if (!G || !G.log) return;
  if (!G.log.scroll) G.log.scroll = { view: 0, save: 0 };
  G.log.scroll[k]++;
  if (G.log.end) saveRecord(compactLog(G.log));
}
// 只记确实参与本层动作的心得，不把选中等同用过。
function markInsight(...ids) {
  if (!G?.flog) return;
  for (const id of ids) if (G.up[id]) (G.flog.used ||= {})[id] = true;
}
function beginFloorLog(n) {
  if (!G.log) return;
  G.flog = {
    n, kills0: G.stats.kills, t0: G.time, rt: 0, gt: 0, lost: 0, hurt: {},
    used: {}, strokes: 0, techs: {}, hits: 0, len: 0, dur: 0, multi: 0, dry: 0, locked: 0,
    zi: { open: 0, ok: 0, fail: 0, cancel: 0, keys: {} }, pauses: 0, frames: 0, slow: 0, resumed: !!G.resumedFloor, clear: false, near: 0,
    hui: 0, chain: 0, mz: 0,   // 回澜倒卷的墨弹、雷雨连劈、月影里被镇住的墨妖
    bends: [],   // 两个以上弯的笔：[认作, 弯数, 弯跨, 弯距, 拐角笔速÷全笔笔速×100]，校准雷与浪用
  };
  if (G.floorName) G.flog.tpl = G.floorName;
  G.resumedFloor = false;
  G.log.floors.push(G.flog);
}
function closeFloorLog() {
  const f = G && G.flog;
  if (!f) return;
  f.kills = G.stats.kills - f.kills0;
  f.gt = G.time - f.t0;
  closeSeg();
}
// 手编层的分段：每段的游戏用时与失印（每次都按当前重算，开下一段时上一段就定下了）
function closeSeg() {
  const f = G && G.flog, sg = f && f.segs && f.segs[f.segs.length - 1];
  if (sg) { sg.gt = G.time - sg.t0; sg.lost = f.lost - sg.lost0; }
}
function beginSeg(name) {
  const f = G.flog;
  if (f) { closeSeg(); (f.segs || (f.segs = [])).push({ name, t0: G.time, lost0: f.lost }); }
  G.segCap = { text: name, t: 0 };
}
function endLog(end) {
  if (!G || !G.log || G.log.end) return;
  closeFloorLog();
  if (end === 'win') G.log.mainCleared = true;
  if (end === 'fall' && G.flog) G.flog.died = true;
  Object.assign(G.log, { end, endless: G.endless, floor: G.floor, score: G.score, kills: G.stats.kills, maxCombo: G.maxCombo, zi: G.stats.zi, up: Object.assign({}, G.up), endAt: new Date().toISOString() });
  saveRecord(compactLog(G.log));
}
function exportRecords() {
  const list = records.slice();
  if (G && G.log && !G.log.end) { closeFloorLog(); list.push(Object.assign(compactLog(G.log), { end: 'open', floor: G.floor, score: G.score })); }
  if (!list.length) { UI.recMsg = { text: '还没有记录 —— 打完一局再来导出', t: UI.t }; Sound.dry(); return; }
  const d = new Date(), p2 = v => String(v).padStart(2, '0');
  const name = `墨灵试玩记录-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}.json`;
  const blob = new Blob([JSON.stringify({ game: 'moling', kind: 'playtest', v: 1, exported: d.toISOString(), records: list })], { type: 'application/json' });
  // 手机上用系统分享（可直接发给开发者）；电脑上存成文件
  const ua = navigator.userAgent || '', mobile = /Android|iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  let file = null;
  try { file = new File([blob], name, { type: 'application/json' }); } catch (e) { /* 旧浏览器 */ }
  if (mobile && file && navigator.canShare && navigator.canShare({ files: [file] })) navigator.share({ files: [file], title: '墨灵试玩记录' }).catch(() => {});
  else Scroll.download(blob, name);
  UI.recMsg = { text: `已导出 ${list.length} 局`, t: UI.t };
  Sound.stamp();
}
function clearRecords() {
  if (UI.t - (UI.recDel || -9) > 3) { UI.recDel = UI.t; Sound.dry(); return; }
  UI.recDel = -9;
  records = [];
  try { localStorage.removeItem(REC_KEY); } catch (e) { /* 忽略 */ }
  UI.recMsg = { text: '已清空', t: UI.t };
  Sound.thunder(0);
}

// —— 局中存档：第二层起每层开头、择心得时各存一份。页面被系统收走后，卷首可「接着画」（从那一层开头重来）。
// 局面只存要紧的数（印力、心得、分数、笔意……）；已截下的画心另存进 IndexedDB，接着画时画卷不缺段。
const RUN_KEY = DEBUG ? 'moling.run.debug' : 'moling.run';
const RUN_FIELDS = ['brush', 'vows', 'tryFlow', 'flowShown', 'earnedFlow', 'vowFirst', 'gained', 'bestAt', 'runId', 'floor', 'time', 'score', 'combo', 'comboT', 'maxCombo', 'sealHp', 'sealMax', 'up', 'yi', 'stats', 'ziSet', 'ziTaught', 'endless', 'banked', 'log'];
function loadPending() {
  try {
    const r = JSON.parse(localStorage.getItem(RUN_KEY));
    return r && r.v === 1 && r.floor >= 1 && BRUSHES[r.brush] ? r : null;
  } catch (e) { return null; }
}
let pendingRun = loadPending();
const PanelDB = (function () {
  const NAME = DEBUG ? 'moling-run-debug' : 'moling-run';
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') { rej(new Error('无 IndexedDB')); return; }
    const r = indexedDB.open(NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('panels');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
  function run(mode, fn) {
    return open().then(db => new Promise((res, rej) => {
      const t = db.transaction('panels', mode), q = fn(t.objectStore('panels'));
      t.oncomplete = () => res(q.result);
      t.onerror = t.onabort = () => rej(t.error);
    }));
  }
  return {
    put: (k, v) => run('readwrite', st => st.put(v, k)).catch(() => {}),
    get: k => run('readonly', st => st.get(k)).catch(() => null),
    clear: () => run('readwrite', st => st.clear()).catch(() => {}),
  };
})();
function storePanel(p) {
  if (typeof indexedDB === 'undefined' || !p.cv || !p.cv.toBlob) return;
  Scroll.toBlob(p.cv, 'image/png').then(b => { if (b) PanelDB.put(p.key, b); });
}
function loadPanel(p) {
  PanelDB.get(p.key).then(b => (b ? Scroll.loadImage(b) : null))
    .then(img => { if (img) p.cv.getContext('2d').drawImage(img, 0, 0, Scroll.PW, Scroll.PH); }).catch(() => {});
}
function snapRun(phase) {
  if (!G) return;
  const r = { v: 1, ver: GAME_VERSION, phase, savedAt: Date.now() };
  for (const k of RUN_FIELDS) r[k] = G[k];
  if (phase === 'choose' && G.choices) r.choices = G.choices.map(u => u.id);
  r.panels = G.panels.map(p => {
    if (!p.key) { p.key = G.runId + ':' + (++G.panelSeq); storePanel(p); }
    return { key: p.key, floor: p.floor, scene: p.scene, flawless: p.flawless, fell: p.fell, boss: p.boss, feng: p.feng, guard: p.guard, vow: p.vow };
  });
  r.panelSeq = G.panelSeq;
  try { localStorage.setItem(RUN_KEY, JSON.stringify(r)); } catch (e) { /* 存不下就算了 */ }
}
// keepPanels：只撤局面（印将碎时；或三卷尽净、可能还要续卷时）
function dropRun(keepPanels) {
  pendingRun = null;
  try { localStorage.removeItem(RUN_KEY); } catch (e) { /* 忽略 */ }
  if (!keepPanels) PanelDB.clear();
}
function resumeRun() {
  const r = pendingRun;
  if (!r) return;
  pendingRun = null;
  askPersist();
  seedRng((r.runId + r.floor * 7919 + (r.log ? r.log.resumes + 1 : 0) * 131) >>> 0);
  G = blankRun(r.brush);
  for (const k of RUN_FIELDS) if (r[k] !== undefined) G[k] = r[k];
  G.vows = vowIds(G.vows);
  G.panelSeq = r.panelSeq || 0;
  G.panels = (r.panels || []).map(m => { const p = Object.assign({ cv: Art.makeCanvas(Scroll.PW, Scroll.PH) }, m); loadPanel(p); return p; });
  if (!G.log) G.log = newLog();
  G.log.resumes++;
  G.ink = inkMax();
  washStains(1);
  Sound.select();
  const choices = r.phase === 'choose' && r.choices ? r.choices.map(id => UPGRADES.find(u => u.id === id)).filter(Boolean) : [];
  if (choices.length) {
    G.choices = choices;
    G.flog = G.log.floors[G.log.floors.length - 1] || null;
    screen = 'choose';
    ensurePaper();
    Sound.setKey(chapterOf(G.floor));
    return;
  }
  if (r.phase === 'choose') { startFloor(G.floor + 1); return; }
  G.resumedFloor = true;
  startFloor(G.floor);
}
function resumeLine(r) {
  const at = `${floorTitle(r.floor)} · ${floorSub(r.floor).replace(' · 卷终', '')}`;
  const B = BRUSHES[r.brush] || BRUSHES.jian;
  return r.phase === 'choose' ? `上回净了 ${at}，正择心得　·　${B.name}　·　${r.score} 分`
    : `上回画到 ${at}　·　${B.name}　·　${r.score} 分　·　从此层开头接着画`;
}
