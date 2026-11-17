'use strict';
// 墨灵 · 主循环、实体、笔法、Boss、界面与输入。

(function () {
  const cv = document.getElementById('c');
  const ctx = cv.getContext('2d');
  const DEBUG = /[?&]debug\b/.test(location.search);

  let DPR = 1, K = 1, W = 720, H = 720, CX = 360, CY = 360;
  const paperCv = document.createElement('canvas');
  const stainCv = document.createElement('canvas');
  const stainCtx = stainCv.getContext('2d');
  let sealCv = null, paperKey = '';

  const SEAL_R = 30, SEAL_SIZE = 58;
  const INK_PER_UNIT = 0.05;
  const YI_MAX = 100;        // 笔意满值
  const ZI_IDLE = 1.0;       // 停笔多久（真实秒）即视为写完
  const ZI_LIMIT = 9;        // 字诀书写时限（真实秒）
  const ZI_APPLY = 0.45;     // 成字后多久落下效果
  const BOSS_NAME = { jiao: '墨蛟', mu: '蠹母', yan: '墨魇' };

  let G = null;             // 当前一局
  let screen = 'title';     // title | play | dying | clear | choose | pause | over | victory
  let frozen = false;
  const UI = { t: 0, titleT: 0, buttons: [], shake: 0, flash: 0, flashCol: '255,255,250', mouse: { x: -99, y: -99, in: false, isMouse: true }, toasts: [], sliders: [], slide: null, gal: null, view: null, back: 'title', drag: null };
  const META = { gallery: 1, scroll: 1, yinpu: 1, settings: 1 };   // 局外界面：卷库、观卷、印谱、设置

  const CRACKS = (function () {
    const R = mulberry32(99), out = [];
    for (let i = 0; i < 18; i++) {
      let x = (R() - 0.5) * 36, y = (R() - 0.5) * 36, a = R() * TAU;
      const pts = [{ x, y }];
      for (let k = 0; k < 4; k++) {
        a += (R() - 0.5) * 1.4;
        const l = 5 + R() * 9;
        x = clamp(x + Math.cos(a) * l, -27, 27); y = clamp(y + Math.sin(a) * l, -27, 27);
        pts.push({ x, y });
      }
      out.push(pts);
    }
    return out;
  })();

  // —— 存档 ——
  function loadBest() {
    try { return Object.assign({ score: 0, floor: 0 }, JSON.parse(localStorage.getItem('moling.best')) || {}); }
    catch (e) { return { score: 0, floor: 0 }; }
  }
  let best = loadBest();
  function recordBest() {
    if (!G || DEBUG) return;   // 调试模式（含无敌、跳关）不计入最佳
    best.score = Math.max(best.score, G.score);
    best.floor = Math.max(best.floor, G.floor);
    try { localStorage.setItem('moling.best', JSON.stringify(best)); } catch (e) { /* 忽略 */ }
  }

  // —— 设置（存本机）：reduceFx 减弱震屏与闪白，quality 画质 hi 精细 / lo 省电，vibrate 震动 ——
  const SET = (function () {
    const base = { reduceFx: false, quality: 'hi', vibrate: true };
    try { return Object.assign(base, JSON.parse(localStorage.getItem('moling.settings')) || {}); } catch (e) { return base; }
  })();
  function saveSettings() { try { localStorage.setItem('moling.settings', JSON.stringify(SET)); } catch (e) { /* 忽略 */ } }
  const partCap = () => (SET.quality === 'lo' ? 260 : 700);

  // —— 印谱与笔匣（局外存档；调试模式另存一份，不碰正式存档）——
  const PROFILE_KEY = DEBUG ? 'moling.profile.debug' : 'moling.profile';
  function loadProfile() {
    const base = { seals: {}, brush: 'jian', kills: 0, runs: 0 };
    try {
      const p = JSON.parse(localStorage.getItem(PROFILE_KEY));
      if (p && typeof p === 'object') return Object.assign(base, p, { seals: Object.assign({}, p.seals) });
    } catch (e) { /* 忽略 */ }
    return base;
  }
  let profile = loadProfile();
  function saveProfile() { try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch (e) { /* 忽略 */ } }
  const brushOpen = id => !!BRUSHES[id] && (!BRUSHES[id].seal || !!profile.seals[BRUSHES[id].seal]);
  const sealCount = () => SEALS.filter(S => profile.seals[S.id]).length;
  function award(id) {
    if (profile.seals[id]) return;
    const S = SEALS.find(x => x.id === id);
    if (!S) return;
    profile.seals[id] = Date.now();
    saveProfile();
    UI.toasts.push({ S, t: 0 });
    Sound.stamp(); Sound.bell(12, 0.2);
  }
  // 本局伏妖数并入累计（每清一层、每局终了各记一次）
  function bankKills() {
    if (!G) return;
    profile.kills += G.stats.kills - (G.banked || 0);
    G.banked = G.stats.kills;
    saveProfile();
  }
  const sealArtCache = {};
  function sealArt(text, px, opts) {
    const key = text + px + JSON.stringify(opts || {});
    return sealArtCache[key] || (sealArtCache[key] = Art.nameSeal(text, px, opts));
  }

  // —— 震动（安卓等支持 navigator.vibrate 的设备；iPhone 的网页不支持）——
  const canBuzz = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  let buzzAt = -1e9;
  function buzz(pattern, strong) {
    if (!canBuzz || !SET.vibrate || window.__bot) return;
    const now = performance.now();
    if (!strong && now - buzzAt < 80) return;   // 连斩时限频，不连成一片
    buzzAt = now;
    try { navigator.vibrate(pattern); } catch (e) { /* 忽略 */ }
  }

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
  const compactLog = L => JSON.parse(JSON.stringify(L, (k, v) => (k === 'kills0' || k === 't0' ? undefined : typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 10) / 10 : v)));
  function deviceInfo() {
    if (typeof navigator === 'undefined') return { os: 'sim' };
    const ua = navigator.userAgent || '';
    const os = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'ios'
      : /Android/.test(ua) ? 'android' : /Windows/.test(ua) ? 'windows' : /Mac OS X/.test(ua) ? 'mac' : /Linux/.test(ua) ? 'linux' : 'other';
    return { os, w: Math.round(window.innerWidth), h: Math.round(window.innerHeight), dpr: window.devicePixelRatio || 1, touch: navigator.maxTouchPoints || 0, app: standalone(), quality: SET.quality, reduceFx: SET.reduceFx };
  }
  function newLog() {
    return { v: 1, id: G.runId, start: new Date().toISOString(), brush: G.brush, dev: deviceInfo(), input: null, resumes: 0, pauses: 0, floors: [], end: null };
  }
  function beginFloorLog(n) {
    if (!G.log) return;
    G.flog = {
      n, kills0: G.stats.kills, t0: G.time, rt: 0, gt: 0, lost: 0, hurt: {},
      strokes: 0, techs: {}, hits: 0, len: 0, dur: 0, multi: 0, dry: 0, locked: 0,
      zi: { open: 0, ok: 0, fail: 0, cancel: 0, keys: {} }, pauses: 0, frames: 0, slow: 0, resumed: !!G.resumedFloor, clear: false,
    };
    G.resumedFloor = false;
    G.log.floors.push(G.flog);
  }
  function closeFloorLog() {
    const f = G && G.flog;
    if (!f) return;
    f.kills = G.stats.kills - f.kills0;
    f.gt = G.time - f.t0;
  }
  function endLog(end) {
    if (!G || !G.log || G.log.end) return;
    closeFloorLog();
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
  const RUN_FIELDS = ['brush', 'runId', 'floor', 'time', 'score', 'combo', 'comboT', 'maxCombo', 'sealHp', 'sealMax', 'up', 'yi', 'stats', 'ziSet', 'ziTaught', 'endless', 'banked', 'log'];
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
    const r = { v: 1, phase, savedAt: Date.now() };
    for (const k of RUN_FIELDS) r[k] = G[k];
    if (phase === 'choose' && G.choices) r.choices = G.choices.map(u => u.id);
    r.panels = G.panels.map(p => {
      if (!p.key) { p.key = G.runId + ':' + (++G.panelSeq); storePanel(p); }
      return { key: p.key, floor: p.floor, scene: p.scene, flawless: p.flawless, fell: p.fell, boss: p.boss };
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
    seedRng((r.runId + r.floor * 7919 + (r.log ? r.log.resumes + 1 : 0) * 131) >>> 0);
    G = blankRun(r.brush);
    for (const k of RUN_FIELDS) if (r[k] !== undefined) G[k] = r[k];
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

  // —— 尺寸 ——
  function resize() {
    // 画布铺满安全区（index.html 的 #stage 已让开刘海与底部横条）
    const box = cv.parentElement;
    const cw = Math.max(16, (box && box.clientWidth) || window.innerWidth || 0), ch = Math.max(16, (box && box.clientHeight) || window.innerHeight || 0);
    DPR = Math.min(SET.quality === 'lo' ? 1 : 2, window.devicePixelRatio || 1);   // 省电画质：不按高分屏加倍
    const pw = Math.round(cw * DPR), ph = Math.round(ch * DPR);
    let old = null;
    if (stainCv.width > 1) { old = Art.makeCanvas(stainCv.width, stainCv.height); old.getContext('2d').drawImage(stainCv, 0, 0); }
    cv.width = pw; cv.height = ph;
    cv.style.width = cw + 'px'; cv.style.height = ch + 'px';
    K = Math.min(cw, ch) / 720;
    W = cw / K; H = ch / K; CX = W / 2; CY = H / 2;
    stainCv.width = pw; stainCv.height = ph;
    if (old) stainCtx.drawImage(old, 0, 0, pw, ph);
    paperCv.width = pw; paperCv.height = ph; paperKey = '';
    sealCv = Art.buildSeal(Math.round(SEAL_SIZE * K * DPR * 1.6));
  }
  function currentScene() { return G && screen !== 'title' && !META[screen] ? sceneOf(G.floor) : 1; }
  function ensurePaper() {
    const key = currentScene() + ':' + paperCv.width + 'x' + paperCv.height;
    if (key !== paperKey) { Art.buildPaper(paperCv, W, H, K * DPR, currentScene()); paperKey = key; }
  }
  function stain(fn) { stainCtx.setTransform(DPR * K, 0, 0, DPR * K, 0, 0); fn(stainCtx); }
  function washStains(f) {
    stainCtx.save(); stainCtx.setTransform(1, 0, 0, 1, 0, 0);
    stainCtx.globalCompositeOperation = 'destination-out';
    stainCtx.fillStyle = `rgba(0,0,0,${f})`; stainCtx.fillRect(0, 0, stainCv.width, stainCv.height);
    stainCtx.restore();
  }

  // —— 一局 ——
  const lv = k => (G.up[k] || 0);
  const BR = () => BRUSHES[G.brush] || BRUSHES.jian;
  const inkMax = () => BR().inkMax + 25 * lv('yan');
  const inkRegen = () => 6.5 * (1 + 0.35 * lv('mo')) * BR().regen;
  const pickR = () => (lv('xi') ? 40 : 20);
  // 秃笔：墨越少越狠（半墨 +1，两成 +2），取代「飞白」
  const kubiDmg = () => (!BR().kubi ? 0 : G.ink < inkMax() * 0.2 ? 2 : G.ink < inkMax() * 0.5 ? 1 : 0);
  const brushDmg = () => 1 + (BR().heavy || 0) + lv('nong') + (lv('fei') && G.ink < inkMax() * 0.3 ? 1 : 0) + kubiDmg();
  const speedMul = () => 1 + 0.035 * (Math.min(G.floor, FINAL_FLOOR) - 1) + (G.floor > FINAL_FLOOR ? 0.03 * (G.floor - FINAL_FLOOR) : 0);
  const hpMul = () => (G.floor > FINAL_FLOOR ? 1 + 0.35 * Math.ceil((G.floor - FINAL_FLOOR) / 3) : 1);
  const comboMult = () => 1 + 0.1 * Math.min(G.combo, 30);
  const panOf = x => clamp((x - CX) / (W / 2), -1, 1) * 0.7;
  const ziKnown = () => ZI_ORDER.filter(k => k === 'huo' || G.up['zi_' + k]);
  const ziReady = () => G.yi >= YI_MAX && !G.zj && !G.ziFx && G.introT <= 0;
  const ziLimit = () => ZI_LIMIT + 4 * lv('kuang');

  let lastRunId = 0;   // 一局的编号（取开局时刻，同一毫秒连开也不重号）
  function blankRun(brush) {
    lastRunId = Math.max(Date.now(), lastRunId + 1);
    return {
      brush, panels: [], runId: lastRunId, saved: null, ziSet: {}, ziKill: null,
      floor: 1, time: 0, score: 0, combo: 0, comboT: 0, maxCombo: 0,
      ink: 100, sealHp: 5, sealMax: 5, up: {},
      enemies: [], newEnemies: [], shots: [], drops: [], wards: [], fx: [], parts: [], pops: [], counters: [], splashQ: [],
      boss: null, bossType: null, waves: [], waveI: -1, waveStart: 0, pending: [], introT: 0, clearT: 0, flawless: true,
      stats: { kills: 0, strokes: 0, techs: {}, flawless: 0, seals: 0, zi: 0, hurt: {} },
      stroke: null, oldStrokes: [], ts: 1, strokeId: 0, hitStop: 0, deathT: 0, choices: null,
      hint: null, nextHint: null, banner: null, sealShake: 0, god: false, endless: false, lockTipT: -9,
      yi: 0, yiFlash: 0, zj: null, ziFx: null, shan: null, flood: null, allies: [], ziTaught: false,
      log: null, flog: null, panelSeq: 0, resumedFloor: false,
    };
  }
  function newRun(seed) {
    // 上一局没打完就新开：记作「中途罢手」；卷首弃了没接着画的局：记作「弃卷」
    if (G) endLog('quit');
    if (pendingRun && pendingRun.log && !(G && G.runId === pendingRun.runId)) {
      const L = pendingRun.log;
      Object.assign(L, { end: 'abandon', floor: pendingRun.floor, score: pendingRun.score, endAt: new Date().toISOString() });
      saveRecord(compactLog(L));
    }
    dropRun();
    if (seed != null) seedRng(seed);
    const brush = brushOpen(profile.brush) ? profile.brush : 'jian';
    G = blankRun(brush);
    G.up = Object.assign({}, BR().up);
    G.ink = inkMax();
    G.log = newLog();
    profile.runs++; saveProfile();
    washStains(1);
    startFloor(1);
  }

  function startFloor(n) {
    G.floor = n;
    if (n >= FINAL_FLOOR + 3) award('xujuan');
    screen = 'play';
    ensurePaper();
    washStains(n === 1 ? 1 : 0.72);
    G.enemies = []; G.newEnemies = []; G.shots = []; G.drops = []; G.wards = []; G.counters = []; G.splashQ = [];
    G.boss = null; G.bossDown = null; G.pending = []; G.waveI = -1;
    G.zj = null; G.ziFx = null; G.shan = null; G.flood = null; G.allies = [];
    const def = buildFloor(n);
    G.waves = def.waves; G.bossType = def.boss;
    G.introT = 2.8; G.flawless = true; G.ink = inkMax();
    let tip = FLOOR_TIPS[n] || '';
    if (n > FINAL_FLOOR && def.boss) tip = '卷终 · ' + BOSS_NAME[def.boss];
    G.banner = { sub: floorTitle(n), title: floorSub(n).replace(' · 卷终', ''), tip, t: 0, dur: 3.4 };
    G.hint = G.nextHint; G.nextHint = null;
    // 笔意在上一层末尾攒满、还没用过字诀：开层再提示一次
    if (!G.hint && G.yi >= YI_MAX && !G.stats.zi) G.hint = { icon: 'zi', text: '笔意已满 —— 点按墨印（或按空格），写一个「火」字', t: 0 };
    Sound.setKey(chapterOf(n));
    Sound.setAmbient(true);
    Sound.setTension(false);
    if (n >= 2) snapRun('play');
    beginFloorLog(n);
  }

  // —— 波次 ——
  function edgePos(side, u, along, out) {
    const m = 26 + (out || 0), a = along || 0;
    switch (side) {
      case 0: return { x: clamp(u * W + a, 12, W - 12), y: -m };
      case 1: return { x: W + m, y: clamp(u * H + a, 12, H - 12) };
      case 2: return { x: clamp(u * W + a, 12, W - 12), y: H + m };
      default: return { x: -m, y: clamp(u * H + a, 12, H - 12) };
    }
  }
  function nextWave() {
    G.waveI++;
    const w = G.waves[G.waveI];
    if (!w) return;
    G.waveStart = G.time;
    for (const s of w.spawns) G.pending.push(Object.assign({ at: G.time + s.t }, s));
    if (w.hint) G.hint = { icon: w.hint.icon, text: w.hint.text, t: 0 };
  }
  function releasePending() {
    if (!G.pending.length) return;
    const keep = [];
    for (const p of G.pending) {
      if (p.at <= G.time) { const pos = edgePos(p.side, p.u, p.along, p.out); spawnEnemy(p.type, pos.x, pos.y); }
      else keep.push(p);
    }
    G.pending = keep;
  }
  function aliveCount() {
    let n = G.newEnemies.length;
    for (const e of G.enemies) if (!e.dead && !e.boss) n++;
    return n;
  }
  function waveProgress() {
    if (screen !== 'play' || G.introT > 0 || G.waveI < 0) return;
    const w = G.waves[G.waveI];
    const last = G.waveI >= G.waves.length - 1;
    if (!last && !G.pending.length && (aliveCount() <= w.nextAt || G.time - G.waveStart > w.maxT)) nextWave();
    if (last && !G.pending.length && !G.boss && aliveCount() === 0 && !G.enemies.some(e => !e.dead)) floorClear();
  }

  // —— 实体 ——
  function spawnEnemy(type, x, y, extra) {
    const D = ENEMY[type];
    let hp = D.hp + (G.floor >= 7 && (type === 'jia' || type === 'lie') ? 1 : 0);
    hp = Math.round(hp * hpMul());
    const e = {
      type, x, y, r: D.r, hp, maxHp: hp, speed: D.speed * rr(0.9, 1.1), value: D.value, drops: D.drops,
      t: 0, seed: rnd(), kx: 0, ky: 0, stun: 0, flash: 0, dir: Math.atan2(CY - y, CX - x), dead: false, boss: false, burnT: 0, slow: 1,
    };
    if (type === 'chan') { e.stand = rr(185, 245); e.shootT = rr(1.2, 2.2); e.charging = false; }
    if (extra) Object.assign(e, extra);
    G.newEnemies.push(e);
    return e;
  }

  function isImmune(e, src) {
    if (e.type === 'seg') return src === 'feng' || src === 'dian' || src === 'po';   // 墨蛟：封不住、点不透，唯横斩
    if (e.type === 'xu') return src === 'brush' || src === 'zhan' || src === 'lang' || src === 'po';
    if (e.type === 'mu' && e.shell) return src === 'brush' || src === 'zhan' || src === 'lang' || src === 'po' || src === 'ren';
    if (e.type === 'yan' && (e.fade || e.alpha < 0.6)) return true;
    return false;
  }

  // 蛟鳞顺滑：笔顺着蛟身划过（夹角不到约 37°）会滑开，须横斩才断
  function glances(e, dx, dy) {
    if (e.type !== 'seg') return false;
    const l = Math.hypot(dx, dy);
    if (l < 0.01) return false;
    if (Math.abs((Math.cos(e.dir) * dx + Math.sin(e.dir) * dy) / l) <= 0.8) return false;
    if (!e.clinkAt || G.time - e.clinkAt > 0.3) {
      e.clinkAt = G.time;
      Sound.clink(panOf(e.x));
      sparks(e.x, e.y, 4);
      if (!G.glanceT || G.time - G.glanceT > 0.6) { G.glanceT = G.time; pop('顺鳞', e.x, e.y - e.r - 14, 16, '90,80,70', 0.6, 'num'); }
    }
    return true;
  }

  function damage(e, n, src, kx, ky) {
    if (e.dead || n <= 0) return false;
    if (isImmune(e, src)) {
      if ((src === 'brush' || src === 'zhan' || (e.type === 'seg' && src !== 'po')) && (!e.clinkAt || G.time - e.clinkAt > 0.25)) {
        e.clinkAt = G.time;
        Sound.clink(panOf(e.x));
        sparks(e.x, e.y, 6);
        if (e.type === 'seg') { if (!G.glanceT || G.time - G.glanceT > 0.6) { G.glanceT = G.time; pop(src === 'feng' ? '封不住' : '点不透', e.x, e.y - e.r - 14, 16, '90,80,70', 0.7, 'num'); } }
        else if (e.type === 'xu') pop('穿', e.x, e.y - e.r - 12, 16, '90,80,70', 0.6, 'num');
        else if (e.type === 'mu') pop('墨壳', e.x, e.y - e.r - 20, 16, '90,80,70', 0.7, 'num');
      }
      return false;
    }
    if (src === 'feng' && e.type === 'mu' && e.shell) {
      e.shell = false; e.shellT = 5.5;
      pop('壳破', e.x, e.y - e.r - 26, 24, CINNABAR, 1.1, 'num');
      inkParts(e.x, e.y, 30, 0, 0, 1.6);
    }
    e.hp -= n; e.flash = 1;
    if (!e.boss && (kx || ky)) { const l = Math.hypot(kx, ky) || 1; e.kx += kx / l * 70; e.ky += ky / l * 70; }
    inkParts(e.x, e.y, 2 + n * 2, kx, ky, 0.8);
    if (e.type === 'yan') e.hits = (e.hits || 0) + 1;
    if (e.hp <= 0) kill(e, src, kx || 0, ky || 0);
    else Sound.hit(panOf(e.x));
    return true;
  }

  const STROKE_SRC = { brush: 1, zhan: 1, feng: 1, dian: 1, lei: 1, lang: 1 };
  function kill(e, src, kx, ky) {
    if (e.dead) return;
    e.dead = true; e.hp = 0;
    G.stats.kills++;
    G.combo++; G.comboT = 2.6; G.maxCombo = Math.max(G.maxCombo, G.combo);
    if (G.combo >= 50) award('lianzhu');
    if (G.stroke && STROKE_SRC[src]) G.stroke.kills = (G.stroke.kills || 0) + 1;
    if ((src === 'zi' || src === 'ren') && G.ziKill && G.time - G.ziKill.t < 14 && ++G.ziKill.n >= 10) award('yizi');
    if (profile.kills + G.stats.kills - (G.banked || 0) >= 1000) award('qianyao');
    const gain = Math.round(e.value * comboMult());
    G.score += gain;
    // 一笔斩过蛟身多节时，飘字只留第一节，免得叠成一团
    const segBurst = e.type === 'seg' && G.time - (G.segPopT || -9) < 0.3;
    if (e.type === 'seg' && !segBurst) G.segPopT = G.time;
    if (!segBurst) pop('+' + gain, e.x, e.y - e.r - 6, 13, '90,80,70', 0.9, 'num');
    Sound.pluck(Math.min(G.combo + 2, 16), 0.3, panOf(e.x));
    splat(e.x, e.y, e.r, kx || 0, ky || 0);
    for (let i = 0; i < e.drops; i++) spawnDrop(e.x, e.y);
    if (e.type === 'lie') {
      for (let i = 0; i < 3; i++) {
        const a = i / 3 * TAU + rnd();
        spawnEnemy('du', e.x + Math.cos(a) * 8, e.y + Math.sin(a) * 8, { kx: Math.cos(a) * 170, ky: Math.sin(a) * 170, stun: 0.35 });
      }
    }
    if (e.type === 'seg' && !segBurst) pop('断', e.x, e.y - 24, 22, INK, 0.7, 'num');
    if (lv('po') && src !== 'boss') G.splashQ.push({ x: e.x, y: e.y, r: e.r + 46, from: e });
    // 字诀与纸人所杀不再生笔意，免得一字接一字
    if (src !== 'zi' && src !== 'ren' && src !== 'boss' && src !== 'split' && src !== 'debug') addYi(2.4);
    G.hitStop = Math.max(G.hitStop, e.boss ? 0.05 : 0.025);
    buzz(e.type === 'seg' && !segBurst ? 30 : e.boss ? 40 : 12);
    if (e.type === 'mu' || e.type === 'yan') bossDefeated(e);
  }

  function addYi(v) {
    if (G.zj || G.ziFx) return;
    const was = G.yi;
    G.yi = Math.min(YI_MAX, G.yi + v * (1 + 0.4 * lv('yiqi')) * (BR().yi || 1));
    if (was < YI_MAX && G.yi >= YI_MAX) {
      G.yiFlash = 1;
      Sound.ziReady();
      pop('笔意已满', CX, CY - SEAL_SIZE * 0.5 - 30, 17, CINNABAR, 1.4, 'num');
      if (!G.ziTaught) {
        G.ziTaught = true;
        G.hint = { icon: 'zi', text: '笔意已满 —— 点按墨印（或按空格），写一个「火」字', t: 0 };
      }
    }
  }

  function enemyHitsSeal(e) {
    e.dead = true;
    splat(e.x, e.y, e.r, CX - e.x, CY - e.y);
    sealHit(1, e.type);
  }

  function sealHit(n, src) {
    if (screen !== 'play' || G.god) return;
    if (G.shan) {
      // 群山环印：伤不到印
      if (!G.shan.blockT || G.time - G.shan.blockT > 0.4) { G.shan.blockT = G.time; pop('山屏', CX, CY - 64, 18, INK, 0.7, 'num'); Sound.clink(0); }
      return;
    }
    G.sealHp -= n; G.flawless = false; G.combo = 0; G.comboT = 0;
    G.stats.hurt[src || '?'] = (G.stats.hurt[src || '?'] || 0) + n;
    if (G.flog) { G.flog.lost += n; G.flog.hurt[src || '?'] = (G.flog.hurt[src || '?'] || 0) + n; }
    G.sealShake = 1; UI.shake = Math.max(UI.shake, 0.9); UI.flash = 0.6; UI.flashCol = CINNABAR;
    Sound.sealHit();
    buzz(G.sealHp <= 0 ? [90, 60, 240] : [50, 40, 70], true);
    pop('-' + n, CX + 36, CY - 44, 24, CINNABAR, 1, 'num');
    if (G.sealHp <= 0) {
      G.sealHp = 0; screen = 'dying'; G.deathT = 1.8;
      endLog('fall');
      dropRun(true);   // 印将碎：立刻撤掉局中存档，关掉重开躲不过这一劫
      cancelStroke(); G.zj = null;
      Sound.gameOver(); Sound.setAmbient(false); Sound.setTension(false);
    }
  }

  function fireShot(x, y, tx, ty, speed) {
    const dx = tx - x, dy = ty - y, d = Math.hypot(dx, dy) || 1;
    G.shots.push({ x, y, vx: dx / d * speed, vy: dy / d * speed, r: 6, dead: false, t: 0 });
    Sound.spit(panOf(x));
  }
  function cutShot(sh, quiet) {
    if (sh.dead) return;
    sh.dead = true;
    G.score += 5;
    inkParts(sh.x, sh.y, 6, sh.vx, sh.vy, 0.6);
    if (!quiet) { Sound.cut(panOf(sh.x)); pop('截', sh.x, sh.y - 16, 18, INK, 0.5, 'num'); }
  }
  function spawnDrop(x, y) {
    G.drops.push({ x, y, vx: rr(-70, 70), vy: rr(-70, 70), t: 0, life: 6.5, v: 5 * (lv('xi') ? 1.5 : 1), dead: false });
  }
  function collectDrop(d) {
    if (d.dead) return;
    d.dead = true;
    G.ink = Math.min(inkMax(), G.ink + d.v);
    G.fx.push({ type: 'fly', x: d.x, y: d.y, t: 0, dur: 0.45 });
    Sound.drop(panOf(d.x));
  }

  // —— 视觉小件 ——
  function inkParts(x, y, n, kx, ky, force) {
    const l = Math.hypot(kx || 0, ky || 0), base = l ? Math.atan2(ky, kx) : 0;
    for (let i = 0; i < n && G.parts.length < partCap(); i++) {
      const a = l ? base + vr(-0.8, 0.8) : vr(0, TAU), sp = vr(60, 260) * force;
      G.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: vr(0.8, 2.6), life: vr(0.25, 0.6), stamp: Math.random() < 0.6, col: INK });
    }
  }
  function sparks(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = vr(0, TAU), sp = vr(80, 200);
      G.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: vr(0.8, 1.6), life: vr(0.15, 0.3), stamp: false, col: CINNABAR });
    }
  }
  function splat(x, y, r, kx, ky) {
    const l = Math.hypot(kx, ky), dir = l ? Math.atan2(ky, kx) : 0;
    stain(c => {
      c.fillStyle = `rgba(${INK},0.3)`;
      Art.blobPath(c, x, y, r * 0.9, 0, Math.random() * 10, 0.25); c.fill();
      const n = 8 + Math.round(r);
      for (let i = 0; i < n; i++) {
        const a = l ? dir + vr(-0.9, 0.9) : vr(0, TAU);
        const ds = r * vr(0.9, 3.4), s = Math.max(0.5, vr(0.8, 3.2) * (1 - ds / (r * 4.2)));
        c.beginPath(); c.ellipse(x + Math.cos(a) * ds, y + Math.sin(a) * ds, s * 1.8, s, a, 0, TAU); c.fill();
      }
    });
    inkParts(x, y, 8 + r, kx, ky, 1.3);
  }
  function pop(text, x, y, size, col, dur, kind) {
    G.pops.push({ text, x: clamp(x, 34, W - 34), y: clamp(y, 44, H - 30), size, col: col || INK, dur: dur || 1, t: 0, kind: kind || 'num', rot: vr(-0.12, 0.12) });
  }
  const charPop = (ch, x, y, size) => pop(ch, x, y, size, INK, 1.0, 'char');
  const stampPop = (ch, x, y, size) => pop(ch, x, y, size, CINNABAR, 1.25, 'stamp');

  // —— 落笔 ——
  function beginStroke(x, y, t) {
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
    s.pts.push({ x, y, w: s.w * 0.5, l: s.len, d: dry });
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
      for (const sh of G.shots) if (!sh.dead && distToSeg(sh.x, sh.y, a.x, a.y, b.x, b.y) < sh.r + bw + 2) cutShot(sh);
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
    if ((s.kills || 0) >= 3 && s.lowInk) award('kubi');
    if ((s.kills || 0) >= 3) buzz(Math.min(70, 20 + 10 * s.kills), true);
    const f = G.flog;
    if (f) { f.strokes++; f.techs[res.kind] = (f.techs[res.kind] || 0) + 1; f.len += s.len; f.dur += Math.max(UI.t - (s.rt0 || UI.t), (s.lastT - s.t0) / 1000 || 0); if (s.hit.size) f.hits++; f.multi = Math.max(f.multi, s.kills || 0); }
    G.oldStrokes.push({ pts: s.pts, t: 0, seed: s.seed, kind: res.kind, stamped: false });
    G.stroke = null;
    return res.kind;
  }
  function cancelStroke() {
    if (!G || !G.stroke) return;
    G.oldStrokes.push({ pts: G.stroke.pts, t: 0.2, seed: G.stroke.seed, kind: 'cancel', stamped: false });
    G.stroke = null;
    Sound.brush(0, false);
  }

  // —— 笔法 ——
  function applyTech(res, s) {
    const k = res.kind;
    G.stats.techs[k] = (G.stats.techs[k] || 0) + 1;
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

  function techDian(s) {
    const p = s.pts[0];
    const r = Math.max(10, s.blot);
    const dmg = (r < 18 ? 1 : r < 32 ? 2 : 3) + (BR().dian.big && r >= 52 ? 1 : 0);
    for (const e of G.enemies) if (!e.dead && Math.hypot(e.x - p.x, e.y - p.y) < r + e.r * 0.6) damage(e, dmg, 'dian', e.x - p.x, e.y - p.y);
    for (const sh of G.shots) if (!sh.dead && Math.hypot(sh.x - p.x, sh.y - p.y) < r + sh.r) cutShot(sh, true);
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
    for (const sh of G.shots) if (!sh.dead && distToSeg(sh.x, sh.y, ax, ay, bx, by) < sh.r + 9) cutShot(sh);
    G.fx.push({ type: 'slash', ax, ay, bx, by, t: 0, dur: 0.4 });
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    charPop('斩', mx - d.y * 48, my + d.x * 48, 64);
    Sound.swish(0.6, panOf(mx));
    if (n) { G.hitStop = Math.max(G.hitStop, 0.05); UI.shake = Math.max(UI.shake, 0.25); }
  }

  function techFeng(res, s) {
    const poly = res.poly, c = centroidOf(poly);
    let n = 0;
    // 先收圈内原有的墨滴，本次封杀掉落的墨滴仍需笔锋去收
    for (const d of G.drops) if (!d.dead && pointInPoly(d.x, d.y, poly)) collectDrop(d);
    for (const e of G.enemies) {
      if (!e.dead && pointInPoly(e.x, e.y, poly)) { if (damage(e, 3 + (BR().fengDmg || 0), 'feng', e.x - c.x, e.y - c.y)) n++; }
    }
    for (const sh of G.shots) if (!sh.dead && pointInPoly(sh.x, sh.y, poly)) cutShot(sh, true);
    G.fx.push({ type: 'feng', poly, cx: c.x, cy: c.y, t: 0, dur: 0.7 });
    stampPop('封', c.x, c.y, 54);
    stain(cx => {
      cx.save(); cx.translate(c.x, c.y); cx.rotate(vr(-0.15, 0.15));
      cx.fillStyle = `rgba(${CINNABAR},0.13)`; Art.roundRect(cx, -18, -18, 36, 36, 4); cx.fill();
      cx.restore();
    });
    Sound.bell(10 + Math.min(n, 4), 0.26); Sound.stamp();
    G.stats.seals += n;
    if (n >= 5) award('wufeng');
    if (n >= 3) {
      const bonus = n * 15;
      G.score += bonus;
      pop(`${cnNum(n)}妖同封 +${bonus}`, c.x, c.y + 52, 18, CINNABAR, 1.2, 'num');
      addYi(1.2 * n);
      if (lv('yuan')) { G.ink = Math.min(inkMax(), G.ink + s.cost); pop('圆融 · 墨回', c.x, c.y + 76, 16, INK, 1.2, 'num'); }
    }
    if (n) G.hitStop = Math.max(G.hitStop, 0.06);
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
    const d2 = e => (e.x - c.x) * (e.x - c.x) + (e.y - c.y) * (e.y - c.y);
    const cand = G.enemies.filter(e => !e.dead && !isImmune(e, 'lei') && d2(e) < 340 * 340).sort((a, b) => d2(a) - d2(b)).slice(0, n);
    const origins = res.corners && res.corners.length ? res.corners : [P[0], P[P.length - 1]];
    cand.forEach((e, i) => {
      const o = origins[i % origins.length];
      G.fx.push({ type: 'bolt', pts: boltPath(o.x, o.y, e.x, e.y), t: 0, dur: 0.45 });
      damage(e, 2, 'lei', e.x - o.x, e.y - o.y);
    });
    if (!cand.length) { const e = P[P.length - 1]; G.fx.push({ type: 'bolt', pts: boltPath(e.x, e.y - 160, e.x, e.y), t: 0, dur: 0.4 }); }
    charPop('雷', c.x, c.y - 56, 64);
    UI.flash = 0.45; UI.flashCol = '255,255,250'; UI.shake = Math.max(UI.shake, 0.5);
    Sound.thunder(panOf(c.x));
  }

  function techLang(res) {
    const P = res.P, d = res.dir, band = 70, tao = lv('tao');
    for (const e of G.enemies) {
      if (e.dead || e.type === 'xu') continue;
      if (distToPolyline(e.x, e.y, P) < band + e.r) {
        if (!e.boss) { e.kx += d.x * 380; e.ky += d.y * 380; e.stun = Math.max(e.stun, 1 + 0.8 * tao); }
        if (tao) damage(e, 1, 'lang', d.x, d.y);
      }
    }
    for (const sh of G.shots) if (!sh.dead && distToPolyline(sh.x, sh.y, P) < band) cutShot(sh, true);
    G.fx.push({ type: 'wave', pts: P.map(p => ({ x: p.x, y: p.y })), dx: d.x, dy: d.y, t: 0, dur: 0.8 });
    const c = centroidOf(P);
    charPop('浪', c.x - d.y * 64, c.y + d.x * 64, 64);
    Sound.wave(panOf(c.x));
  }

  function techZhen(res) {
    const poly = res.poly, c = centroidOf(poly), gang = lv('gang');
    G.wards.push({ poly, cx: c.x, cy: c.y, t: 0, dur: 6 + 4 * gang, burn: gang ? 2 : 1 });
    charPop('镇', c.x, c.y, 60);
    Sound.chime();
  }

  function cutCounter(c, x, y) {
    c.cut = true; c.fade = 0;
    charPop('截', x, y - 34, 56);
    buzz(35, true);
    Sound.cut(panOf(x)); Sound.swish(0.5, panOf(x));
    G.score += 50;
    pop('+50', x, y + 22, 14, '90,80,70', 0.8, 'num');
  }

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
    if (e.birthT <= 0) {
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
    e.charging = e.spitT < 0.7;
    if (e.spitT <= 0) {
      e.spitT = phase2 ? 3.4 : 4.6; e.charging = false;
      const n = phase2 ? 7 : 5, spread = phase2 ? 0.9 : 0.6;
      const ox = e.x + Math.cos(e.dir) * e.r, oy = e.y + Math.sin(e.dir) * e.r;
      for (let i = 0; i < n; i++) {
        const a = e.dir + (i / (n - 1) - 0.5) * spread;
        fireShot(ox, oy, ox + Math.cos(a) * 500, oy + Math.sin(a) * 500, 95 * sm);
      }
    }
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

  // —— 更新 ——
  function update(rdt) {
    UI.t += rdt;
    UI.shake = Math.max(0, UI.shake - rdt * 2.5);
    UI.flash = Math.max(0, UI.flash - rdt * 2.2);
    if (UI.toasts.length) { UI.toasts[0].t += rdt; if (UI.toasts[0].t > 3.8) UI.toasts.shift(); }
    if (UI.notice && (UI.notice.t += rdt) > 7) UI.notice = null;
    if (screen === 'title' || META[screen]) { UI.titleT += rdt; if (screen === 'scroll') updateViewer(rdt); return; }
    if (!G) return;
    const live = screen === 'play' || screen === 'dying';
    const drawing = !!(G.stroke && !G.stroke.done);
    const still = G.zj || (G.ziFx && !G.ziFx.applied);   // 字诀入定：光阴几乎停住
    const target = screen === 'dying' ? 0.3 : still ? 0.04 : drawing ? (lv('ding') ? 0.28 : 0.45) : 1;
    G.ts += (target - G.ts) * Math.min(1, rdt * 12);
    let dt = 0;
    if (live) { dt = rdt * G.ts; if (G.hitStop > 0) { G.hitStop -= rdt; dt *= 0.1; } }
    const frozenUi = screen === 'pause' || screen === 'choose';
    if (screen === 'play') { updateStroke(rdt); updateZi(rdt); }
    if (!frozenUi) {
      updateZiFx(rdt);
      G.yiFlash = Math.max(0, G.yiFlash - rdt * 1.2);
      updateOldStrokes(rdt);
      updateFx(rdt);
      updateParts(live ? dt : rdt);
      if (G.banner) { G.banner.t += rdt; if (G.banner.t > G.banner.dur) G.banner = null; }
      if (G.hint) G.hint.t += rdt;
      G.sealShake = Math.max(0, G.sealShake - rdt * 3);
    }
    if (screen === 'play') updatePlay(dt, rdt);
    else if (screen === 'dying') { updateWorld(dt); G.deathT -= rdt; if (G.deathT <= 0) toGameOver(); }
    else if (screen === 'clear') { G.clearT -= rdt; if (G.clearT <= 0) afterClear(); }
  }
  function updatePlay(dt, rdt) {
    G.time += dt;
    if (G.flog) G.flog.rt += rdt;
    if (G.introT > 0) {
      G.introT -= rdt;
      if (G.introT <= 0) { if (G.bossType) spawnBoss(G.bossType); nextWave(); }
    }
    releasePending();
    G.ink = Math.min(inkMax(), G.ink + inkRegen() * dt);
    if (G.comboT > 0) { G.comboT -= dt; if (G.comboT <= 0) G.combo = 0; }
    processContacts();
    updateWorld(dt);
    waveProgress();
  }
  function updateWorld(dt) {
    updateEnemies(dt);
    if (G.boss) {
      if (G.boss.type === 'jiao' && G.boss.chains[0]) { G.boss.lastX = G.boss.chains[0].segs[0].x; G.boss.lastY = G.boss.chains[0].segs[0].y; }
      updateBoss(dt);
    }
    updateShots(dt);
    updateDrops(dt);
    updateFlood(dt);
    updateAllies(dt);
    if (G.shan) { G.shan.t += dt; if (G.shan.t >= G.shan.dur) G.shan = null; }
    for (const w of G.wards) w.t += dt;
    G.wards = G.wards.filter(w => w.t < w.dur);
    updateCounters(dt);
    processSplash();
    flushEnemies();
  }
  function flushEnemies() {
    if (G.newEnemies.length) { for (const e of G.newEnemies) G.enemies.push(e); G.newEnemies.length = 0; }
    if (G.enemies.some(e => e.dead)) G.enemies = G.enemies.filter(e => !e.dead);
    if (G.shots.some(s => s.dead)) G.shots = G.shots.filter(s => !s.dead);
    if (G.drops.some(d => d.dead)) G.drops = G.drops.filter(d => !d.dead);
  }
  function updateEnemies(dt) {
    const sm = speedMul();
    for (const e of G.enemies) {
      if (e.dead) continue;
      e.t += dt;
      if (e.flash > 0) e.flash = Math.max(0, e.flash - dt * 5);
      let slow = 1;
      for (const w of G.wards) {
        if (pointInPoly(e.x, e.y, w.poly)) {
          slow = 0.35; e.burnT += dt * w.burn;
          if (e.burnT >= 1) { e.burnT -= 1; damage(e, 1, 'zhen'); }
          break;
        }
      }
      if (e.wet > 0) { e.wet -= dt; slow *= 0.5; }
      if (e.fire > 0) {
        e.fire -= dt; e.fireT += dt;
        if (Math.random() < dt * 12) flameParts(e.x, e.y - e.r * 0.4, 1, e.r * 0.6);
        if (e.fireT >= 1) { e.fireT -= 1; damage(e, 1, 'zi', 0, -1); }
      }
      e.slow = slow;
      if (e.dead || e.boss) continue;
      e.x += e.kx * dt; e.y += e.ky * dt;
      const f = Math.exp(-5 * dt); e.kx *= f; e.ky *= f;
      if (e.stun > 0) { e.stun -= dt; continue; }
      const dx = CX - e.x, dy = CY - e.y, d = Math.hypot(dx, dy) || 1;
      const ux = dx / d, uy = dy / d;
      // 远处赶路加速：长边（竖屏的上下、横屏的左右）出生的墨妖不至于走太久
      const far = 1 + clamp((d - 460) / 260, 0, 1) * 1.2;
      let mx = ux, my = uy, v = e.speed * sm * slow * far;
      if (e.type === 'e') {
        const lat = Math.sin(e.t * 3.2 + e.seed * 6) * 1.2;
        mx = ux - uy * lat; my = uy + ux * lat;
        const l = Math.hypot(mx, my); mx /= l; my /= l;
      } else if (e.type === 'du' || e.type === 'lie' || e.type === 'xu') {
        const w = Math.sin(e.t * 2 + e.seed * 9) * 0.35, c = Math.cos(w), s = Math.sin(w);
        const ox = mx; mx = ox * c - my * s; my = ox * s + my * c;
      } else if (e.type === 'chan' && d <= e.stand) {
        v = 0;
        e.shootT -= dt;
        e.charging = e.shootT < 0.6;
        if (e.shootT <= 0) { fireShot(e.x + ux * e.r, e.y + uy * e.r, CX, CY, 105 * sm); e.shootT = rr(2.8, 3.6); e.charging = false; }
      }
      e.x += mx * v * dt; e.y += my * v * dt;
      e.dir = turnToward(e.dir, Math.atan2(my, mx), dt * 6);
      if (G.shan) {
        // 撞山：推回山外，每秒至多伤一次
        const ox = e.x - CX, oy = e.y - CY, od = Math.hypot(ox, oy) || 1, lim = G.shan.r + e.r;
        if (od < lim) {
          e.x = CX + ox / od * lim; e.y = CY + oy / od * lim;
          e.kx += ox / od * 140; e.ky += oy / od * 140; e.stun = Math.max(e.stun, 0.3);
          if (!e.shanT || G.time - e.shanT > 1) { e.shanT = G.time; damage(e, 1, 'zi', ox, oy); inkParts(e.x, e.y, 6, ox, oy, 0.7); }
        }
        continue;
      }
      if (d < SEAL_R + e.r * 0.6) enemyHitsSeal(e);
    }
    const L = G.enemies;
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      if (a.dead || a.boss) continue;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j];
        if (b.dead || b.boss) continue;
        const dx = b.x - a.x, dy = b.y - a.y, md = (a.r + b.r) * 0.85, d2 = dx * dx + dy * dy;
        if (d2 < md * md && d2 > 0.01) {
          const d = Math.sqrt(d2), p = (md - d) * 0.5;
          a.x -= dx / d * p; a.y -= dy / d * p; b.x += dx / d * p; b.y += dy / d * p;
        }
      }
    }
  }
  function updateShots(dt) {
    for (const s of G.shots) {
      if (s.dead) continue;
      s.t += dt;
      for (const w of G.wards) if (pointInPoly(s.x, s.y, w.poly)) { s.dead = true; inkParts(s.x, s.y, 5, 0, 0, 0.5); sparks(s.x, s.y, 3); break; }
      if (s.dead) continue;
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (G.shan && Math.hypot(s.x - CX, s.y - CY) < G.shan.r + 8) { s.dead = true; inkParts(s.x, s.y, 5, -s.vx, -s.vy, 0.5); sparks(s.x, s.y, 3); continue; }
      if (Math.hypot(s.x - CX, s.y - CY) < SEAL_R + s.r * 0.5) { s.dead = true; splat(s.x, s.y, 5, s.vx, s.vy); sealHit(1, 'shot'); }
      if (s.x < -80 || s.x > W + 80 || s.y < -80 || s.y > H + 80) s.dead = true;
    }
  }
  function updateDrops(dt) {
    for (const d of G.drops) {
      if (d.dead) continue;
      d.t += dt;
      d.x += d.vx * dt; d.y += d.vy * dt;
      const f = Math.exp(-4 * dt); d.vx *= f; d.vy *= f;
      d.x = clamp(d.x, 14, W - 14); d.y = clamp(d.y, 14, H - 14);
      if (d.t > d.life) d.dead = true;
    }
  }
  function updateCounters(dt) {
    for (const c of G.counters) {
      c.t += dt;
      if (!c.cut && !c.inked && c.t >= c.dur) {
        c.inked = true; c.fade = 0;
        if (distToSeg(CX, CY, c.ax, c.ay, c.bx, c.by) < SEAL_R + 10) sealHit(1, 'counter');
        Sound.swish(0.7, 0);
        UI.shake = Math.max(UI.shake, 0.4);
        stain(s => Art.brush(s, c.pts, 0.08, INK, 3));
      }
      if (c.cut || c.inked) c.fade += dt;
    }
    if (G.counters.length) G.counters = G.counters.filter(c => c.fade < 1);
  }
  function processSplash() {
    let guard = 0;
    while (G.splashQ.length && guard++ < 60) {
      const s = G.splashQ.shift();
      G.fx.push({ type: 'ring', x: s.x, y: s.y, r: s.r, t: 0, dur: 0.35 });
      for (const e of G.enemies) {
        if (!e.dead && e !== s.from && Math.hypot(e.x - s.x, e.y - s.y) < s.r + e.r) damage(e, 1, 'po', e.x - s.x, e.y - s.y);
      }
    }
  }
  function updateOldStrokes(rdt) {
    for (const o of G.oldStrokes) {
      o.t += rdt;
      if (!o.stamped && o.t > 0.25) { o.stamped = true; stain(c => Art.brush(c, o.pts, 0.07, INK, o.seed)); }
    }
    if (G.oldStrokes.length) G.oldStrokes = G.oldStrokes.filter(o => o.t < 1.3);
  }
  function updateFx(rdt) {
    for (const f of G.fx) f.t += rdt;
    if (G.fx.length) G.fx = G.fx.filter(f => f.t < f.dur);
    for (const p of G.pops) p.t += rdt;
    if (G.pops.length) G.pops = G.pops.filter(p => p.t < p.dur);
  }
  function updateParts(dt) {
    if (!G.parts.length || dt <= 0) return;
    const land = [];
    for (const p of G.parts) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      const f = Math.exp(-6 * dt); p.vx *= f; p.vy *= f;
      p.life -= dt;
      if (p.life <= 0 && p.stamp) land.push(p);
    }
    if (land.length) stain(c => { c.fillStyle = `rgba(${INK},0.3)`; for (const p of land) { c.beginPath(); c.arc(p.x, p.y, p.r, 0, TAU); c.fill(); } });
    G.parts = G.parts.filter(p => p.life > 0);
  }

  // —— 流程 ——
  function floorClear() {
    screen = 'clear'; G.clearT = 2.4;
    cancelStroke(); cancelZi();
    const bonus = 100 * G.floor;
    let fl = 0;
    if (G.flawless) { fl = 150 * G.floor; G.stats.flawless++; }
    G.score += bonus + fl;
    if (G.flog) { G.flog.clear = true; G.flog.flawless = G.flawless; }
    closeFloorLog();
    if (G.floor === 1) award('chuqi');
    if (G.stats.flawless >= 3) award('wuxia');
    bankKills();
    G.banner = { sub: floorTitle(G.floor) + ' · ' + floorSub(G.floor).replace(' · 卷终', ''), title: '已净', tip: `清卷 +${bonus}` + (fl ? `　　无瑕 +${fl}` : ''), t: 0, dur: 2.4, clear: true };
    for (const d of G.drops) collectDrop(d);
    G.hint = null;
    Sound.arpeggio(true); Sound.setTension(false);
    recordBest();
  }
  // —— 画卷：每层终了截下印周围的墨迹，一局终了裱成手卷 ——
  function capturePanel(fell) {
    if (!G) return;
    const pw = Scroll.PW, ph = Scroll.PH, WW = Scroll.WORLD_W, WH = Scroll.WORLD_H;
    const cv = Art.makeCanvas(pw, ph), c = cv.getContext('2d');
    const sc = DPR * K, f = pw / WW;
    const wx = CX - WW / 2, wy = CY - WH / 2;
    const x0 = Math.max(0, wx), y0 = Math.max(0, wy), x1 = Math.min(W, wx + WW), y1 = Math.min(H, wy + WH);
    if (x1 > x0 && y1 > y0) c.drawImage(stainCv, x0 * sc, y0 * sc, (x1 - x0) * sc, (y1 - y0) * sc, (x0 - wx) * f, (y0 - wy) * f, (x1 - x0) * f, (y1 - y0) * f);
    G.panels.push({ cv, floor: G.floor, scene: sceneOf(G.floor), flawless: G.flawless && !fell, fell: !!fell, boss: G.bossDown || null });
    if (G.panels.length > 16) G.panels.splice(FINAL_FLOOR, 1);   // 续卷太长：略去较早的续卷段
  }
  function finishScroll(end) {
    if (!G || !G.panels.length) return;
    const rec = { id: G.runId, date: Date.now(), brush: G.brush, score: G.score, floor: G.floor, kills: G.stats.kills, maxCombo: G.maxCombo, end, endless: G.endless, zi: ZI_ORDER.filter(k => G.ziSet[k]), panels: G.panels.length };
    let cv;
    try { cv = Scroll.compose(rec, G.panels); } catch (e) { console.warn('画卷装裱失败', e); return; }
    const saved = G.saved = { rec, cv, stored: null };
    Scroll.store(rec, cv).then(full => { saved.stored = full; }).catch(e => console.warn('画卷入库失败', e));
  }

  function afterClear() {
    capturePanel(false);
    if (G.floor === FINAL_FLOOR && !G.endless) { toVictory(); return; }
    G.choices = rollUpgrades();
    screen = 'choose';
    snapRun('choose');
  }
  function rollUpgrades() {
    const avail = UPGRADES.filter(u => lv(u.id) < u.max && (!u.req || G.up[u.req]) && !(u.id === 'fei' && BR().kubi));
    const unlocks = avail.filter(u => u.unlock);
    const out = [];
    if (unlocks.length && (G.floor <= 6 || rnd() < 0.5)) out.push(pick(unlocks));
    if (G.sealHp <= G.sealMax - 2 && rnd() < 0.7) { const bu = avail.find(u => u.id === 'bu'); if (bu && !out.includes(bu)) out.push(bu); }
    const pool = shuffle(avail.filter(u => !out.includes(u)));
    while (out.length < 3 && pool.length) out.push(pool.pop());
    return shuffle(out);
  }
  function choose(i) {
    if (screen !== 'choose' || !G.choices) return;
    const u = G.choices[i];
    if (!u) return;
    G.up[u.id] = lv(u.id) + 1;
    if (u.id === 'bu') { G.sealMax++; G.sealHp = Math.min(G.sealMax, G.sealHp + 2); }
    if (u.zi) {
      const Z = ZI[u.zi];
      G.nextHint = { icon: 'zi', text: `字诀可写「${Z.ch}」—— ${Z.desc}`, t: 0 };
    } else if (u.unlock) {
      const T = TECH[u.id];
      G.nextHint = { icon: u.id, text: `习得「${T.ch}」—— ${T.desc}`, t: 0 };
    }
    Sound.select();
    if (G.flog) { G.flog.pick = u.id; G.flog.offered = G.choices.map(c => c.id); }
    G.choices = null;
    startFloor(G.floor + 1);
  }
  function toGameOver() { screen = 'over'; recordBest(); bankKills(); capturePanel(true); finishScroll('fall'); endLog('fall'); dropRun(); }
  // 三卷尽净：局面存档撤掉，画心留着（若续卷，接着存）
  function toVictory() { screen = 'victory'; recordBest(); finishScroll('win'); endLog('win'); dropRun(true); Sound.arpeggio(true); Sound.setAmbient(false); }
  function continueEndless() { G.endless = true; if (G.log) G.log.end = null; G.choices = rollUpgrades(); screen = 'choose'; snapRun('choose'); }
  function toTitle() { screen = 'title'; UI.titleT = 0; Sound.setAmbient(false); paperKey = ''; }
  function togglePause() {
    if (screen === 'play') { cancelStroke(); screen = 'pause'; Sound.setAmbient(false); if (G.log) G.log.pauses++; if (G.flog) G.flog.pauses++; }
    else if (screen === 'pause') { screen = 'play'; Sound.setAmbient(true); }
  }

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
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ensurePaper();
    ctx.drawImage(paperCv, 0, 0);
    if (screen === 'title' || !G || META[screen]) {
      ctx.setTransform(s, 0, 0, s, 0, 0);
      if (screen === 'gallery') drawGallery();
      else if (screen === 'scroll') drawViewer();
      else if (screen === 'yinpu') drawYinpu();
      else if (screen === 'settings') drawSettings();
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
    for (const w of G.wards) drawWard(w);
    for (const k of G.counters) drawCounter(k);
    for (const d of G.drops) if (!d.dead) Art.drawDrop(c, d, t);
    drawSeal();
    if (G.shan) drawShan(G.shan);
    if (G.flood) drawFlood(G.flood);
    for (const e of G.enemies) if (!e.dead && e.type !== 'seg') Art.drawEnemy(c, e, t);
    if (G.boss && G.boss.type === 'jiao') for (const ch of G.boss.chains) Art.drawChain(c, ch, t);
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

  // —— 界面 ——
  function drawHUD() {
    const c = ctx;
    const x0 = 22, y0 = 18;
    // 墨
    txt('墨', x0 + 10, y0 + 9, 22, INK);
    // 窄屏（竖屏手机）上墨条随层名宽度收窄，避免数字与层名相撞
    const title = floorTitle(G.floor) + ' · ' + floorSub(G.floor);
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
    if (screen === 'play' && G && G.flog && !document.hidden) { G.flog.frames++; if (rdt > 0.025) G.flog.slow++; }
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
    const g = ctx.createLinearGradient(0, y - 90, 0, y + 90);
    g.addColorStop(0, `rgba(${PAPER},0)`); g.addColorStop(0.5, `rgba(${PAPER},${0.78 * a})`); g.addColorStop(1, `rgba(${PAPER},0)`);
    ctx.fillStyle = g; ctx.fillRect(0, y - 90, W, 180);
    txt(b.sub, CX, y - 44, 20, INK, 'center', 0.8 * a);
    txt(b.title, CX, y + 4, 56, b.clear ? CINNABAR : INK, 'center', a);
    if (b.tip) txt(b.tip, CX, y + 54, 18, INK, 'center', 0.85 * a);
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
    const bs = Math.min(ps, (W - 40) / 460), g = 12 * bs;
    let bx = CX - (100 + 120 + 90 + 90 + 36) * bs / 2;
    button('继续', bx, by, 100 * bs, bh, togglePause, true, fs); bx += 100 * bs + g;
    button('重新开卷', bx, by, 120 * bs, bh, () => newRun(), false, fs); bx += 120 * bs + g;
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
  function drawOver() {
    wash(0.8);
    drawStamp('碎', CX, H * 0.26, 96, 1);
    txt('印碎卷残', CX, H * 0.26 + 96, 34, INK);
    statLines().forEach((s, i) => txt(s, CX, H * 0.26 + 150 + i * 30, 17, INK, 'center', 0.8, 'normal'));
    const by = H * 0.26 + 260;
    button('再落一笔', CX - 196, by, 130, 46, () => newRun(), true);
    button('观卷', CX - 54, by, 108, 46, () => openCurrentScroll('over'));
    button('回到卷首', CX + 66, by, 130, 46, toTitle);
    txt('此局墨迹已裱成画卷，存入卷库', CX, by + 70, 14, INK, 'center', 0.5, 'normal');
  }
  function drawVictory() {
    wash(0.8);
    drawStamp('復', CX, H * 0.24, 96, 1);
    txt('画卷已净', CX, H * 0.24 + 96, 36, INK);
    txt('三卷墨妖尽伏。纸上的墨迹，渐渐淡回山水。', CX, H * 0.24 + 136, 17, INK, 'center', 0.75, 'normal');
    statLines().forEach((s, i) => txt(s, CX, H * 0.24 + 176 + i * 30, 17, INK, 'center', 0.8, 'normal'));
    const by = H * 0.24 + 290;
    button('续卷（无尽）', CX - 226, by, 160, 46, continueEndless, true);
    button('观卷', CX - 54, by, 108, 46, () => openCurrentScroll('victory'));
    button('重新开卷', CX + 66, by, 140, 46, () => newRun());
    txt('九层墨迹已裱成画卷，存入卷库；续卷终了时卷尾续接', CX, by + 70, 14, INK, 'center', 0.5, 'normal');
  }

  // —— 卷首：题名、笔匣 ——
  const PS = () => (H > W * 1.15 ? 1.4 : 1);   // 竖屏手机上局外界面的字与卡片放大
  function titleLayout() {
    const portrait = H > W * 1.15;
    const size = Math.min(170, W * 0.2);
    const ty = portrait ? H * 0.22 : H * 0.235;
    const rackY = portrait ? H * 0.46 : ty + size * 0.74 + 44;
    const gap = Math.min(118, (W - 70) / BRUSH_ORDER.length);
    const L = portrait ? 150 : 116;
    return { size, ty, rackY, gap, L, infoY: rackY + L + 40, startY: portrait ? H * 0.8 : H * 0.865 };
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
      const ps = PS(), bh = 46 * ps, w1 = 150 * ps, w2 = 130 * ps, g = 16 * ps, bx = CX - (w1 + w2 + g) / 2;
      if (a2 > 0.3) {
        c.globalAlpha = a2;
        button('接着画', bx, Lt.startY - bh / 2, w1, bh, resumeRun, true, 20 * ps);
        button('新开一卷', bx + w1 + g, Lt.startY - bh / 2, w2, bh, () => newRun(), false, 20 * ps);
        c.globalAlpha = 1;
      }
    } else txt('点击空白处 · 落笔开卷', CX, Lt.startY, 22, INK, 'center', a2 * (0.45 + 0.4 * Math.sin(t * 3) ** 2));
    // 卷库、印谱
    if (a2 > 0.05) {
      c.globalAlpha = a2;
      if (installEvt) button('装到主屏', 22, 18, 116, 40, () => { const ev = installEvt; installEvt = null; ev.prompt(); });
      else if (iosBrowser()) txt('Safari「分享」→「添加到主屏幕」，断网也能玩', 22, 38, 13, INK, 'left', 0.5, 'normal');
      button('设置', W - 300, 18, 86, 40, () => openSettings('title'));
      button('卷库', W - 204, 18, 86, 40, () => openGallery('title'));
      button('印谱', W - 108, 18, 86, 40, () => openYinpu('title'));
      txt(`${sealCount()} / ${SEALS.length}`, W - 65, 72, 13, INK, 'center', 0.5, 'normal');
      c.globalAlpha = 1;
    }
    if (pendingRun) txt(resumeLine(pendingRun), CX, H - 52, 15, INK, 'center', 0.7, 'normal');
    else txt('鼠标或手指按住拖动作画　·　← → 换笔　·　P 暂停　·　M 静音' + (Sound.isMuted() ? '（已静音）' : ''), CX, H - 52, 14, INK, 'center', 0.5, 'normal');
    if (best.score) txt(`最佳　${best.score} 分　·　至第 ${best.floor} 层`, CX, H - 28, 14, INK, 'center', 0.5, 'normal');
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
    const fs = 15 * ps, lh = 22 * ps;
    if (open) {
      txt(`${B.name}　·　${B.tag}`, CX, y, 24 * ps, INK, 'center', a);
      const lines = ps > 1 ? B.perks : wrap(B.perks.join('　·　'), W - 60, fs);
      lines.forEach((ln, k) => txt(ln, CX, y + 34 * ps + k * lh, fs, INK, 'center', 0.72 * a, 'normal'));
    } else {
      const S = SEALS.find(x => x.id === B.seal);
      txt(`${B.name}　·　未得`, CX, y, 24 * ps, INK, 'center', 0.45 * a);
      wrap(`印谱「${S.ch}」：${S.cond} —— 得印即得此笔`, W - 60, fs).forEach((ln, k) => txt(ln, CX, y + 34 * ps + k * lh, fs, INK, 'center', 0.72 * a, 'normal'));
    }
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
    if (r.endless) return `续卷至第${cnNum(r.floor - FINAL_FLOOR)}层`;
    if (r.end === 'win') return '三卷尽净';
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
    g.list.slice(g.page * Lg.per, (g.page + 1) * Lg.per).forEach((r, i) => {
      const x = Lg.x, y = Lg.top + i * (Lg.chh + Lg.gap), w = Lg.cw, h = Lg.chh;
      const hov = hovering(x, y, w, h);
      ctx.fillStyle = `rgba(250,246,234,${hov ? 0.98 : 0.86})`; Art.roundRect(ctx, x, y, w, h, 8); ctx.fill();
      ctx.strokeStyle = hov ? `rgba(${CINNABAR},0.85)` : `rgba(${INK},0.35)`; ctx.lineWidth = hov ? 2 : 1.1; ctx.stroke();
      const infoW = Math.min(300 * ps, w * 0.44), tw = w - infoW - 10, th = h - 16 * ps;
      const img = g.thumbs.get(r.id);
      if (img) {
        const k = th / img.height, sw = Math.min(img.width, tw / k);
        ctx.drawImage(img, img.width - sw, 0, sw, img.height, x + w - 8 - sw * k, y + 8 * ps, sw * k, th);
      } else { ctx.fillStyle = '#2d2823'; ctx.fillRect(x + w - 8 - tw, y + 8 * ps, tw, th); }
      const B = BRUSHES[r.brush] || BRUSHES.jian;
      txt(Scroll.dateCn(r.date), x + 16, y + 26 * ps, 17 * ps, INK, 'left', 0.9);
      txt(`${B.name}　·　${resultText(r)}`, x + 16, y + 56 * ps, 15 * ps, r.end === 'win' ? CINNABAR : INK, 'left', 0.8, 'normal');
      txt(`${r.score} 分　·　伏妖 ${r.kills}　·　${new Date(r.date).toTimeString().slice(0, 5)}`, x + 16, y + 84 * ps, 14 * ps, INK, 'left', 0.6, 'normal');
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
    txt(`${Scroll.dateCn(r.date)}　·　${B.name}　·　${resultText(r)}　·　${r.score} 分`, CX, Lv.top - 24, 15, INK, 'center', 0.65, 'normal');
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
    if (screen === 'title') { if (!pendingRun) newRun(); return; }
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
    if (e.pointerId !== activeId) return;
    activeId = null;
    if (UI.slide) { UI.slide = null; return; }
    if (UI.drag) { if (UI.view) UI.view.vx = clamp(UI.drag.v, -3000, 3000); UI.drag = null; return; }
    if (G) penUp();
  };
  cv.addEventListener('pointerup', release);
  cv.addEventListener('pointercancel', release);
  cv.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') UI.mouse.in = false; });
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('wheel', e => {
    if (screen !== 'scroll' || !UI.view) return;
    e.preventDefault();
    UI.view.vx = 0;
    UI.view.ox = clamp(UI.view.ox + e.deltaY - e.deltaX, 0, viewerMaxOx());
  }, { passive: false });
  window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (screen === 'play' && G && G.zj) {
      // 书写字诀时：Esc 罢笔，退格/Z 撤一笔，空格/回车 落款
      if (k === 'escape') { cancelZi(); return; }
      if (k === 'backspace' || k === 'z') { undoZi(); e.preventDefault(); return; }
      if (k === ' ' || k === 'enter') { finishZi(); e.preventDefault(); return; }
    }
    if (META[screen]) {
      if (k === 'escape' || k === 'backspace') { closeMeta(); return; }
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
      else if (screen === 'over') newRun();
      else if (screen === 'play' && k === ' ' && ziReady()) enterZi();
      e.preventDefault();
    }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && screen === 'play') togglePause(); });
  let resizeTimer = 0;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 120); });

  // —— 调试 ——
  if (DEBUG) {
    window.__ink = {
      get G() { return G; },
      get screen() { return screen; },
      freeze(v) { frozen = v !== false; },
      step(sec) { const n = Math.max(1, Math.round((sec || 1 / 60) * 60)); for (let i = 0; i < n; i++) update(1 / 60); render(); },
      start(seed) { newRun(seed == null ? 1 : seed); },
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
      resetProfile() { profile = { seals: {}, brush: 'jian', kills: 0, runs: 0 }; saveProfile(); },
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
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
