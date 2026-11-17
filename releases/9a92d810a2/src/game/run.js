'use strict';
// 墨灵 · 游戏 3/13 · run：尺寸；一局与一层的开局；心得的数值；波次；月影；水路与山口

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
  if (G && G.riverDef) compileRivers();
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
const inkRegen = () => 6.5 * (1 + 0.35 * lv('mo')) * BR().regen * (activeVow('ink')?.regen || 1);
const activeVow = id => G.vows.includes(id) ? VOWS.find(v => v.id === id) : null;
const FLOW_WINDOW = 5;
const flowReady = () => G.flowUntil > G.time;
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
    brush, vows: [], tryFlow: false, flowShown: false, earnedFlow: false,
    panels: [], runId: lastRunId, saved: null, ziSet: {}, ziKill: null,
    floor: 1, time: 0, score: 0, combo: 0, comboT: 0, maxCombo: 0,
    ink: 100, sealHp: 5, sealMax: 5, up: {},
    enemies: [], newEnemies: [], shots: [], drops: [], wards: [], fx: [], parts: [], pops: [], counters: [], splashQ: [],
    boss: null, bossType: null, waves: [], waveI: -1, waveStart: 0, pending: [], introT: 0, clearT: 0, flawless: true,
    stats: { kills: 0, strokes: 0, techs: {}, flawless: 0, seals: 0, zi: 0, hurt: {} },
    stroke: null, oldStrokes: [], ts: 1, strokeId: 0, hitStop: 0, deathT: 0, choices: null,
    hint: null, nextHint: null, banner: null, sealShake: 0, god: false, endless: false, lockTipT: -9,
    yi: 0, yiFlash: 0, zj: null, ziFx: null, shan: null, flood: null, allies: [], ziTaught: false,
    log: null, flog: null, panelSeq: 0, resumedFloor: false,
    floorName: null, riverDef: null, rivers: null, groups: {}, restAt: null, segCap: null,
    tideLanes: [], inkBackAt: -99, flowUntil: 0,
  };
}
function newRun(seed, vows, tryFlow) {
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
  G.vows = vowsOpen() ? vowIds(vows) : [];
  G.tryFlow = !!tryFlow && flowOpen();
  G.up = Object.assign({}, BR().up);
  G.ink = inkMax();
  askPersist();
  G.log = newLog();
  profile.runs++; saveProfile();
  washStains(1);
  startFloor(1);
}
function retryRun() { newRun(undefined, G.vows, G.tryFlow); }

function startFloor(n) {
  G.floor = n;
  if (n >= FINAL_FLOOR + 3) award('xujuan');
  screen = 'play';
  ensurePaper();
  washStains(n === 1 ? 1 : 0.72);
  G.enemies = []; G.newEnemies = []; G.shots = []; G.drops = []; G.wards = []; G.counters = []; G.splashQ = [];
  G.boss = null; G.bossDown = null; G.pending = []; G.waveI = -1;
  G.zj = null; G.ziFx = null; G.shan = null; G.flood = null; G.allies = [];
  const def = buildFloor(n, G.vows);
  G.waves = def.waves; G.bossType = def.boss;
  G.floorName = def.name || null; G.riverDef = def.rivers || null; G.groups = {}; G.restAt = null; G.segCap = null;
  G.tideLanes = []; G.inkBackAt = -99; G.flowUntil = 0;
  compileRivers();
  G.introT = 2.8; G.flawless = true; G.ink = inkMax();
  let tip = FLOOR_TIPS[n] || '';
  if (n === 1 && G.vows.length) tip = '戒印 · ' + vowNames(G.vows);
  if (n === 1 && G.tryFlow) tip = G.up.lang ? '试流痕 · 净第一层后可选流痕' : '试流痕 · 先择「浪」，下次择「流痕」';
  if (activeVow('tide') && n === 2) tip = '催潮 · 第二段换为夹口，留心两翼';
  if (activeVow('tide') && n === 5) tip = '催潮 · 第三段从下游另开一条逆流';
  if (n > FINAL_FLOOR && def.boss) tip = '卷终 · ' + BOSS_NAME[def.boss];
  G.banner = { sub: floorTitle(n), title: floorSub(n).replace(' · 卷终', '') + (def.name ? ' · ' + def.name : ''), tip, t: 0, dur: 3.4 };
  G.hint = G.nextHint; G.nextHint = null;
  // 笔意在上一层末尾攒满、还没用过字诀：开层再提示一次
  if (!G.hint && G.yi >= YI_MAX && !G.stats.zi) G.hint = { icon: 'zi', text: '笔意已满 —— 点按墨印（或按空格），写一个「火」字', t: 0 };
  Sound.setKey(chapterOf(n));
  Sound.setPacing('sparse');
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
  G.waveStart = G.time; G.restAt = null;
  Sound.setPacing(G.waveI ? 'tight' : 'sparse');
  if (w.seg) beginSeg(w.seg);
  G.tideLanes = (w.tide || []).map((route, i) => ({
    route, i, at: G.time + Math.min(...w.spawns.filter(s => s.route === route).map(s => s.t)), sounded: false,
  }));
  for (const s of w.spawns) {
    G.pending.push(Object.assign({ at: G.time + s.t }, s));
    if (s.grp) (G.groups[s.grp] || (G.groups[s.grp] = { left: 0, first: null, last: null, freed: false })).left++;
  }
  if (w.hint) { const z = w.hint.zhen && G.up.zhen; G.hint = { icon: z ? 'zhen' : w.hint.icon, text: z ? w.hint.zhen : w.hint.text, t: 0 }; }
}
function releasePending() {
  if (!G.pending.length) return;
  const keep = [];
  for (const p of G.pending) {
    if (p.at > G.time) { keep.push(p); continue; }
    if (p.moon) { spawnMoon(p); continue; }
    if (p.route && G.rivers && G.rivers[p.route]) { spawnOnRiver(p); continue; }
    const sd = riverSide(p), pos = edgePos(sd.side, sd.u, p.along, p.out);
    spawnEnemy(p.type, pos.x, pos.y);
  }
  G.pending = keep;
}
// —— 月影（卷三 · 夜月 · 其一）——
// 墨妖从纸上的月影里现身：现身前 MOON_LEAD 秒月影浮出，越来越浓，外圈刻度走满即现身。
// 月影落在「镇」的三角里：现身的墨妖当场定住，在结界里受灼。
const MOON_LEAD = 3;
function moonPos(p) {
  const a = p.moon[0] * Math.PI / 180, r = Math.min(p.moon[1], Math.min(W, H) / 2 - 44);
  return { x: CX + Math.cos(a) * r, y: CY + Math.sin(a) * r };
}
function spawnMoon(p) {
  const c = moonPos(p), n = p.n || 1;
  const ward = G.wards.find(w => pointInPoly(c.x, c.y, w.poly));
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU + rnd() * 0.6, r = n > 1 ? 14 + rnd() * 12 : 0;
    const e = spawnEnemy(p.type, c.x + Math.cos(a) * r, c.y + Math.sin(a) * r);
    if (ward) e.stun = 2.6;
  }
  inkParts(c.x, c.y, 10, 0, 0, 0.8);
  G.fx.push({ type: 'ring', x: c.x, y: c.y, r: 34, t: 0, dur: 0.45 });
  if (ward) {
    charPop('镇', c.x, c.y - 40, 46);
    Sound.chime();
    if (G.flog) G.flog.mz += n;
  }
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
  if (!last && !G.pending.length && (aliveCount() <= w.nextAt || G.time - G.waveStart > w.maxT)) {
    // 段间留白：清完一段，先留几秒收墨，再起下一段
    if (w.rest && G.restAt == null) G.restAt = G.time + w.rest;
    if (!w.rest || G.time >= G.restAt) nextWave();
  }
  if (last && !G.pending.length && !G.boss && aliveCount() === 0 && !G.enemies.some(e => !e.dead)) floorClear();
}

// —— 水路（卷二 · 江流 · 其一「回潮」）——
// 墨妖随水纹而来：在水上被水流托着走得快，到了岸（或出了回湾）才自己爬向墨印。
const FLOW = 55;          // 水流托着走的速度（世界单位 / 游戏秒）
const EDDY_HOLD = 1.6;    // 同群墨蠹全进了回湾，再打旋多久才一起出湾
const EDDY_MAX = 7;       // 最早一只进湾起，至多等这么久
function riverPt(q) {
  const land = W >= H, L = (land ? W : H) / 2, a = q[0] * L + q[1], b = q[2];
  return land ? { x: CX + a, y: CY + b } : { x: CX - b, y: CY + a };   // 竖屏：整幅转 90°，上游在上
}
// 折线磨圆（两遍 Chaikin），给画水带与水纹用
function smoothLine(P) {
  let L = P;
  for (let k = 0; k < 2; k++) {
    const o = [L[0]];
    for (let i = 0; i < L.length - 1; i++) {
      const a = L[i], b = L[i + 1];
      o.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    o.push(L[L.length - 1]);
    L = o;
  }
  return L;
}
function compileRivers() {
  const D = G.riverDef;
  if (!D) { G.rivers = null; return; }
  const old = G.rivers || {};
  G.rivers = {};
  for (const k in D) {
    const d = D[k], pts = d.pts.map(riverPt), out = (d.out || []).map(riverPt);
    let eddy = null;
    if (d.eddy) {
      const c = riverPt(d.eddy), a = pts[pts.length - 2], b = pts[pts.length - 1];
      // 顺着入湾前的水势打旋
      const dir = Math.sign((b.x - c.x) * (b.y - a.y) - (b.y - c.y) * (b.x - a.x)) || 1;
      eddy = { x: c.x, y: c.y, r: d.eddy[3], dir };
    }
    const line = smoothLine(eddy ? pts.concat([{ x: eddy.x, y: eddy.y }]) : pts);
    const outLine = eddy && out.length ? [{ x: eddy.x, y: eddy.y }].concat(out) : out.length ? [pts[pts.length - 1]].concat(out) : null;
    const end = outLine ? outLine[outLine.length - 1] : pts[pts.length - 1];
    G.rivers[k] = { key: k, kind: d.kind || 'water', pts, out, eddy, line, outLine, end, glow: old[k] ? old[k].glow : 0 };
  }
}
// 横屏写的出生边，竖屏时随水路一起转
function riverSide(p) {
  if (!G.riverDef || W >= H) return p;
  return { side: (p.side + 1) % 4, u: p.side === 0 || p.side === 2 ? p.u : 1 - p.u };
}
function spawnOnRiver(p) {
  const Rv = G.rivers[p.route], a = Rv.pts[0], b = Rv.pts[1];
  const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1, j = p.jit || 0;
  const extra = { route: p.route, leg: 1, phase: 'in', grp: p.grp || null };
  if (Rv.kind === 'pass' && p.type === 'chan') extra.stand = rr(290, 340);   // 墨蟾守在山口里，弹顺着来路飞
  spawnEnemy(p.type, a.x - dy / l * j, a.y + dx / l * j, extra);
  if (p.grp && G.groups[p.grp]) G.groups[p.grp].left--;
}
// 到了这个水路点没有：挨近了，或已经比这个点更靠近下一个点（妖多挤着时不至于在点上打转）；
// 下一处是回湾时，进了湾边就算到
function passed(e, p, nx) {
  if (Math.hypot(p.x - e.x, p.y - e.y) < 30) return true;
  if (!nx) return false;
  const dn = Math.hypot(nx.x - e.x, nx.y - e.y);
  if (nx.r && dn < nx.r + 30) return true;
  return dn < Math.hypot(nx.x - p.x, nx.y - p.y) - 6;
}
// 一只墨妖在水路上的去处：返回要去的点与水流速度；上了岸返回 null（之后直奔墨印）
function riverStep(e) {
  const Rv = G.rivers && G.rivers[e.route];
  if (!Rv) { e.route = null; return null; }
  if (e.phase === 'in') {
    let p = Rv.pts[e.leg];
    while (p && passed(e, p, Rv.pts[e.leg + 1] || (Rv.eddy && { x: Rv.eddy.x, y: Rv.eddy.y, r: Rv.eddy.r }))) p = Rv.pts[++e.leg];
    if (p) return Rv.kind === 'pass' ? { x: p.x, y: p.y, flow: 0, pass: true } : { x: p.x, y: p.y, flow: FLOW };
    if (Rv.eddy && e.grp && G.groups[e.grp] && !G.groups[e.grp].freed) {
      e.phase = 'eddy'; e.orbR = Rv.eddy.r * (0.3 + 0.7 * e.seed);
      const g = G.groups[e.grp];
      if (g.first == null) g.first = G.time;
      g.last = G.time;
    } else { e.phase = 'out'; e.oleg = 0; }
  }
  if (e.phase === 'eddy') {
    const g = G.groups[e.grp];
    if (g && !g.freed) {
      const E = Rv.eddy, a = Math.atan2(e.y - E.y, e.x - E.x) + 0.7 * E.dir;
      return { x: E.x + Math.cos(a) * e.orbR, y: E.y + Math.sin(a) * e.orbR, flow: 16 };
    }
    e.phase = 'out'; e.oleg = 0;
  }
  if (e.phase === 'out') {
    let p = Rv.out[e.oleg];
    while (p && passed(e, p, Rv.out[e.oleg + 1])) p = Rv.out[++e.oleg];
    if (p) return { x: p.x, y: p.y, flow: 20 };
  }
  e.route = null; e.phase = null;
  return null;
}
function updateRivers(dt) {
  if (!G.rivers) return;
  for (const lane of G.tideLanes) if (!lane.sounded && lane.at - G.time <= 1.6) {
    lane.sounded = true;
    Sound.warning(lane.i ? 'tideBack' : 'tideFront', panOf(G.rivers[lane.route].pts[1].x));
  }
  // 回湾：同群的都进了湾、又打旋片刻，才一起出湾
  for (const k in G.groups) {
    const g = G.groups[k];
    if (g.freed) continue;
    let alive = 0, inE = 0;
    for (const L of [G.enemies, G.newEnemies]) for (const e of L) if (!e.dead && e.grp === k && e.route) { alive++; if (e.phase === 'eddy') inE++; }
    if (g.left > 0) continue;
    if (!alive) { g.freed = true; continue; }
    if ((inE === alive && G.time - g.last >= EDDY_HOLD) || (g.first != null && G.time - g.first >= EDDY_MAX)) g.freed = true;
  }
  // 水纹：有墨妖在这条水上、或将在两秒内入水时显出
  for (const k in G.rivers) {
    const Rv = G.rivers[k];
    let on = G.pending.some(p => p.route === k && p.at - G.time < 2.2);
    if (!on) for (const e of G.enemies) if (!e.dead && e.route === k) { on = true; break; }
    Rv.glow += ((on ? 1 : 0) - Rv.glow) * Math.min(1, dt * (on ? 2.2 : 0.9));
  }
}
// 浪：把水上的墨妖沿水路推回上游一段（回湾里的推出湾外，重新入湾）
function riverPush(e, tao) {
  const Rv = G.rivers && G.rivers[e.route];
  if (!Rv) return false;
  if (e.phase === 'eddy' || e.phase === 'out') { e.phase = 'in'; e.leg = Rv.pts.length - 1; }
  e.leg = Math.max(1, e.leg - 1);
  const p = Rv.pts[e.leg - 1], dx = p.x - e.x, dy = p.y - e.y, l = Math.hypot(dx, dy) || 1;
  e.kx += dx / l * 420; e.ky += dy / l * 420; e.stun = Math.max(e.stun, 1.2 + 0.8 * tao);
  return true;
}
