'use strict';
// 墨灵 · 游戏 8/13 · update：每帧更新；流程：过层、画卷、择心得、终局、回卷首、暂停

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
    if (G.segCap && (G.segCap.t += rdt) > 3.4) G.segCap = null;
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
  updateRivers(dt);
  if (G.ink < inkMax()) markInsight('mo');
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
    let mx = ux, my = uy, v = e.speed * sm * slow * far, wob = 1;
    const rv = e.route ? riverStep(e) : null;
    if (rv) {
      // 水上：顺着水路走，水流托着走得快，左右晃得少些
      const tx = rv.x - e.x, ty = rv.y - e.y, tl = Math.hypot(tx, ty) || 1;
      mx = tx / tl; my = ty / tl; v = (e.speed * far + rv.flow) * sm * slow; wob = 0.4;
    }
    if (e.type === 'e') {
      const lat = Math.sin(e.t * 3.2 + e.seed * 6) * 1.2 * wob, bx = mx, by = my;
      mx = bx - by * lat; my = by + bx * lat;
      const l = Math.hypot(mx, my); mx /= l; my /= l;
    } else if (e.type === 'du' || e.type === 'lie' || e.type === 'xu') {
      const w = Math.sin(e.t * 2 + e.seed * 9) * 0.35 * wob, c = Math.cos(w), s = Math.sin(w);
      const ox = mx; mx = ox * c - my * s; my = ox * s + my * c;
    } else if (e.type === 'chan' && (!rv || rv.pass) && d <= e.stand) {
      v = 0;
      e.shootT -= dt;
      const was = e.charging;
      e.charging = e.shootT < 0.6;
      if (e.charging && !was) Sound.charge(panOf(e.x));   // 蓄力：鼓腮之外再给一声，背后也听得见
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
    if (s.rev) {
      // 倒卷的墨弹：不伤印、不撞结界，打中第一只墨妖
      const tg = s.tgt;
      if (tg && !tg.dead) {
        const sp = Math.hypot(s.vx, s.vy), b = Math.atan2(s.vy, s.vx);
        const nb = b + clamp(wrapAng(Math.atan2(tg.y - s.y, tg.x - s.x) - b), -3.2 * dt, 3.2 * dt);
        s.vx = Math.cos(nb) * sp; s.vy = Math.sin(nb) * sp;
      }
      s.x += s.vx * dt; s.y += s.vy * dt;
      for (const e of G.enemies) {
        if (e.dead || Math.hypot(e.x - s.x, e.y - s.y) > e.r + s.r) continue;
        s.dead = true;
        inkParts(s.x, s.y, 6, s.vx, s.vy, 0.6);
        if (!isImmune(e, 'lang')) damage(e, s.dmg || 1, 'lang', s.vx, s.vy);
        break;
      }
      if (s.t > 4 || s.x < -80 || s.x > W + 80 || s.y < -80 || s.y > H + 80) s.dead = true;
      continue;
    }
    if (s.held) continue;   // 被笔锋拦着，等收笔
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
    const previous = c.t;
    c.t += dt;
    if (!c.cut && !c.inked && previous <= 0 && c.t > 0) Sound.warning('counter');
    if (!c.cut && !c.inked && c.t >= c.dur) {
      c.inked = true; c.fade = 0;
      if (distToSeg(CX, CY, c.ax, c.ay, c.bx, c.by) < SEAL_R + 10) sealHit(1, 'counter');
      Sound.warning('land');
      pop('逆笔落墨', CX, CY + 54, 21, CINNABAR, 0.9, 'num');
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
  const earned = G.floor === 6 && G.vows.length && !flowOpen();
  if (earned) {
    award('liuhen'); G.earnedFlow = true;
    if (G.log) G.log.earnedFlow = true;
  }
  bankKills();
  G.banner = { sub: floorTitle(G.floor) + ' · ' + floorSub(G.floor).replace(' · 卷终', ''), title: '已净', tip: `清卷 +${bonus}` + (fl ? `　　无瑕 +${fl}` : ''), t: 0, dur: 2.4, clear: true };
  if (earned) G.banner.tip = '新帖解锁 · 流痕 —— 用浪倒卷来弹，下一点即成墨晕';
  for (const d of G.drops) collectDrop(d);
  G.hint = null;
  Sound.arpeggio(true); Sound.setTension(false); Sound.setPacing('close');
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
  // 立戒净了该戒改动最大的那一层（惜墨第三层、催潮第五层）
  const vow = fell || G.endless ? null : G.vows.find(id => VOWS.find(v => v.id === id)?.feat?.floor === G.floor) || null;
  G.panels.push({ cv, floor: G.floor, scene: sceneOf(G.floor), flawless: G.flawless && !fell, fell: !!fell, boss: G.bossDown || null,
    feng: G.feat.feng, guard: G.feat.guard, vow });
  if (vow) gainVowFeat(vow);   // 头一回：当场给战果，结算列入「本局新得」
  if (G.panels.length > 16) G.panels.splice(FINAL_FLOOR, 1);   // 续卷太长：略去较早的续卷段
}
// 评品：三卷尽净称「净卷」，正传九层里另有三层以上无瑕称「墨定」；没通关不评
function scrollRating() {
  if (!G.log?.mainCleared && !G.endless) return null;
  return G.panels.filter(p => p.floor <= FINAL_FLOOR && p.flawless).length >= 3 ? '墨定' : '净卷';
}
function finishScroll(end) {
  if (!G || !G.panels.length) return;
  const rec = { id: G.runId, date: Date.now(), brush: G.brush, score: G.score, floor: G.floor, kills: G.stats.kills, maxCombo: G.maxCombo, end, endless: G.endless, vows: G.vows.slice(), zi: ZI_ORDER.filter(k => G.ziSet[k]), panels: G.panels.length,
    rating: scrollRating(), vowFirst: !!G.vowFirst };
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
  const avail = UPGRADES.filter(u => lv(u.id) < u.max && (!u.req || G.up[u.req]) &&
    (!u.seal || profile.seals[u.seal]) && !(u.id === 'fei' && BR().kubi));
  const tryFlow = !G.flowShown && (G.tryFlow || (G.earnedFlow && G.floor === 6 && G.up.lang));
  const featured = tryFlow && avail.find(u => u.id === (G.up.lang ? 'liuhen' : 'lang'));
  const out = [];
  for (const kind of ['style', 'depth', 'aid']) {
    const group = avail.filter(u => insightKind(u.id) === kind);
    if (!group.length) continue;
    const rescue = kind === 'aid' && G.sealHp * 2 < G.sealMax && group.find(u => u.id === 'bu');
    out.push(rescue || (kind === 'style' && featured) || pick(group));
  }
  const pool = shuffle(avail.filter(u => !out.includes(u)));
  while (out.length < 3 && pool.length) out.push(pool.pop());
  if (out.some(u => u.id === 'liuhen')) G.flowShown = true;
  return shuffle(out);
}
function choose(i) {
  if (screen !== 'choose' || !G.choices) return;
  const u = G.choices[i];
  if (!u) return;
  G.up[u.id] = lv(u.id) + 1;
  if (u.id === 'bu') { G.sealMax++; G.sealHp = Math.min(G.sealMax, G.sealHp + 2); markInsight('bu'); }
  if (u.zi) {
    const Z = ZI[u.zi];
    G.nextHint = { icon: 'zi', text: `字诀可写「${Z.ch}」—— ${Z.desc}`, t: 0 };
  } else if (u.id === 'liuhen') {
    G.nextHint = { icon: 'lang', text: '流痕：先用「浪」倒卷来弹，再轻点', t: 0 };
  } else if (u.unlock) {
    const T = TECH[u.id];
    G.nextHint = { icon: u.id, text: `习得「${T.ch}」—— ${T.desc}`, t: 0 };
  }
  Sound.select();
  if (G.flog) { G.flog.pick = u.id; G.flog.offered = G.choices.map(c => c.id); }
  G.choices = null;
  startFloor(G.floor + 1);
}
function toGameOver() { screen = 'over'; UI.endT = UI.t; recordBest(); bankKills(); capturePanel(true); finishScroll('fall'); noteGoals(); endLog('fall'); dropRun(); }
// 三卷尽净：局面存档撤掉，画心留着（若续卷，接着存）
function toVictory() {
  screen = 'victory'; UI.endT = UI.t;
  // 首通：本局有哪一枚戒还没通关过（双戒通关也算两枚各通一次），或这一组双戒头一回一起通关。先看旧成绩，再记新成绩
  G.vowFirst = G.vows.length > 0 && (G.vows.some(id => !vowCleared(id)) || (G.vows.length > 1 && !profile.vowBest[G.vows.join('+')]?.won));
  if (G.log) G.log.mainCleared = true;
  recordBest(true); finishScroll('win'); noteGoals(); endLog('win'); dropRun(true); Sound.arpeggio(true); Sound.setAmbient(false);
}
function continueEndless() { G.endless = true; if (G.log) G.log.end = null; G.choices = rollUpgrades(); screen = 'choose'; snapRun('choose'); }
function toTitle() { screen = 'title'; UI.titleT = 9; Sound.setAmbient(false); paperKey = ''; }
// 暂停里回卷首：本层开头的存档还在就留着（卷首可「接着画」，从本层开头再来，与关了页再开一样），
// 这半层也记进记录；第一层没有存档，记作中途罢手
function leaveToTitle() {
  cancelStroke();
  if (G && G.log && !G.log.end) {
    const r = loadPending();
    if (r && r.runId === G.runId && r.phase === 'play' && r.floor === G.floor) {
      closeFloorLog();
      r.log = JSON.parse(JSON.stringify(G.log));
      try { localStorage.setItem(RUN_KEY, JSON.stringify(r)); } catch (e) { /* 存不下就只留原存档 */ }
      pendingRun = r;
    } else endLog('quit');
  }
  toTitle();
}
function togglePause() {
  if (screen === 'play') { cancelStroke(); screen = 'pause'; Sound.setAmbient(false); if (G.log) G.log.pauses++; if (G.flog) G.flog.pauses++; }
  else if (screen === 'pause') { screen = 'play'; Sound.setAmbient(true); }
}
