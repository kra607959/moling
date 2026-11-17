'use strict';
// 墨灵 · 御笔（横屏双指试作）
// 横版卷轴射击：笔尖自左向右飞，墨妖从右边来。
//   左手：左半屏任意处按住相对拖动，笔尖跟着走；笔尖自动连射墨点。电脑上方向键 / WASD。
//   右手：在纸上落笔，一横成斩、一圈成封、一点成墨；落笔按住时光阴放慢到四成，按住越久耗墨越多。
//   墨弹贴着笔尖擦过回墨；三点命，一段远山约九十秒。
// 与正传分开：不碰 G（正传的局）、印谱与局中存档；只共用画布、画法、声音、手势识别和试玩记录（记作 mode: 'yubi'）。
const Yubi = (function () {
  const LIVES = 3, INK_MAX = 100;
  const REGEN = 9;            // 不落笔时每（游戏）秒回墨
  const HOLD_DRAIN = 8;       // 落笔按住时每（真实）秒耗墨：凝时不白给
  const LEN_COST = 0.035;     // 每单位笔长耗墨
  const COST = { zhan: 4, feng: 6, dian: 3, fu: 0 };
  const SLOW = 0.4;           // 落笔凝时
  const HIT_R = 5, GRAZE_R = 30;
  const SHIP_MAX = 1100;      // 笔尖追向目标的最高速度（每游戏秒）
  const KEY_SPEED = 540;
  const SENS = 1.25;          // 左手相对拖动的倍率：拇指挪一寸，笔尖走一寸二
  const FIRE_DT = 0.1, SHOT_SP = 1000;
  const BRUSH_L = 74;
  const SEGS = [{ name: '一线', t0: 0 }, { name: '两翼', t0: 31 }, { name: '群峰', t0: 62 }];

  let S = null;
  const keys = {};
  let bg = null;

  // —— 关卡：远山，三段。全部写死，弹路可背可练 ——
  function stageEvents() {
    const ev = [];
    const line = (t, y, n, gap, sp) => { for (let i = 0; i < n; i++) ev.push({ t: t + i * gap, k: 'du', y, sp: sp || 190 }); };
    const wave = (t, y, n, gap, amp, shoot) => { for (let i = 0; i < n; i++) ev.push({ t: t + i * gap, k: 'e', y, amp, shoot: !!shoot, ph: i * 0.7 }); };
    const turret = (t, y, pat, hold, stop) => ev.push({ t, k: 'chan', y, pat, hold, stop: stop || 0.8 });
    // 一线：直飞的成排墨蠹，先教对准；后半两只蟾，教躲瞄准弹
    line(2.5, 0.35, 5, 0.45); line(5.5, 0.65, 5, 0.45);
    wave(9, 0.5, 6, 0.4, 0.18);
    line(13, 0.3, 4, 0.5); line(13, 0.7, 4, 0.5);
    turret(16, 0.3, 'aim3', 9, 0.8);
    wave(19, 0.72, 6, 0.4, 0.12);
    line(23, 0.5, 6, 0.4);
    turret(25, 0.7, 'aim3', 8, 0.82);
    wave(28, 0.3, 5, 0.4, 0.12);
    // 两翼：上下夹击，蟾开扇；会吐弹的墨蛾
    turret(32, 0.5, 'fan5', 10, 0.84);
    wave(33, 0.25, 6, 0.38, 0.1); wave(34, 0.75, 6, 0.38, 0.1);
    line(38, 0.4, 6, 0.32, 240);
    turret(40, 0.2, 'aim3', 8, 0.8); turret(41, 0.8, 'aim3', 8, 0.8);
    wave(45, 0.5, 8, 0.36, 0.25, true);
    turret(50, 0.3, 'fan5', 9, 0.82); line(51, 0.7, 6, 0.38);
    wave(55, 0.6, 6, 0.4, 0.2, true);
    line(57, 0.25, 5, 0.4); line(57, 0.75, 5, 0.4);
    // 群峰：两蟾对开扇，墨蠹成群，末了大蟾
    turret(63, 0.25, 'fan5', 10, 0.84); turret(63.5, 0.75, 'fan5', 10, 0.84);
    line(66, 0.5, 8, 0.3, 230);
    wave(70, 0.4, 8, 0.34, 0.2, true);
    turret(73, 0.5, 'aim3', 8, 0.8);
    for (const y of [0.2, 0.5, 0.8]) line(76, y, 4, 0.42);
    ev.push({ t: 80, k: 'king', y: 0.5, stop: 0.78, hold: 18 });
    return ev.sort((a, b) => a.t - b.t);
  }
  const EVENTS = stageEvents();
  const LAST_T = EVENTS[EVENTS.length - 1].t;

  // —— 开局 / 收局 ——
  function start() {
    const prev = records.filter(r => r.mode === 'yubi' && r.endAt).pop();
    const now = Date.now();
    S = {
      phase: 'intro', introT: 0, t: 0, realT: 0, ts: 1, evI: 0,
      ship: { x: W * 0.22, y: H * 0.5, vy: 0, inv: 0, fireT: 0 }, tx: W * 0.22, ty: H * 0.5,
      lives: LIVES, ink: INK_MAX, score: 0,
      enemies: [], bullets: [], shots: [], parts: [], pops: [], trails: [],
      mover: null, pen: null, input: null, dieT: 0, clearT: 0, bgX: 0, flash: 0,
      stat: { kills: 0, fired: 0, cut: 0, absorb: 0, graze: 0, hit: 0, dodged: 0, drawT: 0, moveT: 0, strokes: { zhan: 0, feng: 0, dian: 0, fu: 0 }, dry: 0, frames: 0, slow: 0 },
      segs: SEGS.map(s => ({ name: s.name, t: 0, rt: 0, hits: 0, kills: 0, graze: 0, cut: 0, drawT: 0, frames: 0, slow: 0 })),
      log: { v: 1, mode: 'yubi', ver: GAME_VERSION, id: now, start: new Date(now).toISOString(), dev: deviceInfo(), brush: profile.brush,
        gap: prev ? Math.round((now - Date.parse(prev.endAt)) / 1000) : null, after: prev ? prev.end : null },
    };
    for (const k in keys) delete keys[k];
    screen = 'yubi'; UI.flash = 0; UI.shake = 0;
    Sound.setAmbient(false);
  }
  // 手机上进全屏并锁横屏（安卓 Chrome 可以；iPhone 不支持，就靠「请横过来」的提示）
  function enter() {
    Sound.init();
    try {
      const el = document.documentElement, coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
      if (coarse && el.requestFullscreen && !document.fullscreenElement) {
        const so = window.screen && window.screen.orientation;   // 全局 screen 是游戏的界面名，这里要浏览器的
        el.requestFullscreen().then(() => (so && so.lock ? so.lock('landscape') : null)).catch(() => {});
      }
    } catch (e) { /* 忽略 */ }
    start();
  }
  function leave() {
    if (S && S.phase !== 'result' && S.t > 3) finish('quit', true);
    S = null;
    try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {}); } catch (e) { /* 忽略 */ }
    screen = 'title'; UI.titleT = 9;
  }
  function finish(end, silent) {
    if (S.ended) return;
    S.ended = true;
    S.pen = S.mover = null;
    const st = S.stat;
    S.rating = end === 'win' ? (S.lives === LIVES ? '墨定' : '净卷') : null;
    if (end === 'win') S.score += S.lives * 500 + (S.lives === LIVES ? 1000 : 0);
    const r1 = v => Math.round(v * 10) / 10;
    Object.assign(S.log, {
      end, t: r1(S.t), realT: r1(S.realT), score: S.score, lost: LIVES - S.lives, rating: S.rating, input: S.input,
      kills: st.kills, shots: { fired: st.fired, cut: st.cut, absorb: st.absorb, graze: st.graze, hit: st.hit, dodged: st.dodged },
      strokes: Object.assign({}, st.strokes), dry: st.dry, drawT: r1(st.drawT), moveT: r1(st.moveT), frames: st.frames, slow: st.slow,
      segs: S.segs.filter((g, i) => i === 0 || S.t >= SEGS[i].t0).map(g => Object.assign({}, g, { t: r1(g.t), rt: r1(g.rt), drawT: r1(g.drawT) })),
      endAt: new Date().toISOString(),
    });
    saveRecord(S.log);
    if (!silent) { S.phase = 'result'; UI.endT = UI.t; if (end === 'win') Sound.arpeggio(true); }
  }
  function pause() { if (S && (S.phase === 'play' || S.phase === 'intro')) { S.resume = S.phase; S.phase = 'pause'; S.pen = null; S.mover = null; Sound.brush(0, false); } }
  function resume() { if (S && S.phase === 'pause') S.phase = S.resume || 'play'; }

  // —— 输入 ——
  const seg = () => { let i = 0; while (i + 1 < SEGS.length && S.t >= SEGS[i + 1].t0) i++; return S.segs[i]; };
  const live = () => S && (S.phase === 'play' || S.phase === 'intro');
  function down(e, p) {
    if (!live()) return false;
    const touch = e.pointerType !== 'mouse';
    if (!S.input) S.input = touch ? 'touch' : 'mouse';
    if (touch && !S.mover && p.x < W * 0.42) {
      S.mover = { id: e.pointerId, fx: p.x, fy: p.y, sx: S.tx, sy: S.ty, x: p.x, y: p.y, x0: p.x, y0: p.y };
      return true;
    }
    if (!S.pen) return penDown(e.pointerId, p.x, p.y, e.timeStamp);
    return false;
  }
  function move(e, list) {
    if (!S) return;
    if (S.mover && e.pointerId === S.mover.id) {
      const p = list[list.length - 1], m = S.mover;
      m.x = p.x; m.y = p.y;
      const B = bounds();
      let tx = m.sx + (p.x - m.fx) * SENS, ty = m.sy + (p.y - m.fy) * SENS;
      // 顶到边：把起点挪过来，手指一回头笔尖就跟着回头
      if (tx < B.x0 || tx > B.x1) { tx = clamp(tx, B.x0, B.x1); m.fx = p.x - (tx - m.sx) / SENS; }
      if (ty < B.y0 || ty > B.y1) { ty = clamp(ty, B.y0, B.y1); m.fy = p.y - (ty - m.sy) / SENS; }
      S.tx = tx; S.ty = ty;
      return;
    }
    if (S.pen && e.pointerId === S.pen.id) for (const p of list) { penMove(p.x, p.y, p.t); if (!S.pen) break; }
  }
  function up(e, cancel) {
    if (!S) return;
    if (S.mover && e.pointerId === S.mover.id) S.mover = null;
    else if (S.pen && e.pointerId === S.pen.id) penUp(cancel);
  }
  function key(e, isDown) {
    const k = e.key.toLowerCase();
    const dirKey = { arrowleft: 1, arrowright: 1, arrowup: 1, arrowdown: 1, a: 1, d: 1, w: 1, s: 1 };
    if (dirKey[k]) { keys[k] = isDown; if (isDown && S && !S.input) S.input = 'mouse'; e.preventDefault(); return; }
    if (!isDown || e.repeat) return;
    if (k === 'm') { Sound.init(); Sound.toggleMute(); }
    else if (k === 'escape' || k === 'p') { if (!S) return; if (S.phase === 'pause') resume(); else if (S.phase === 'result') leave(); else pause(); }
    else if ((k === 'enter' || k === ' ') && S && S.phase === 'result') { start(); e.preventDefault(); }
  }
  function bounds() { return { x0: 30, x1: W * 0.78, y0: 34, y1: H - 30 }; }

  // —— 落笔 ——
  function penDown(id, x, y, t) {
    if (S.ink < 2) { pop('墨尽', x, y - 20, 18, INK); Sound.dry(); S.stat.dry++; return false; }
    S.pen = { id, pts: [], len: 0, held: 0, blot: 0, moved: false, speed: 0, lastT: t, seed: Math.random() * 50 };
    pushPt(x, y, t);
    return true;
  }
  function pushPt(x, y, t) {
    const P = S.pen, w = clamp(7.5 - P.speed * 0.0035, 2.6, 7.5);
    P.pts.push({ x, y, w: P.pts.length ? P.pts[P.pts.length - 1].w * 0.6 + w * 0.4 : w, d: S.ink < INK_MAX * 0.25 ? 0.5 : 0.08, l: P.len, t });
  }
  function penMove(x, y, t) {
    const P = S.pen, lp = P.pts[P.pts.length - 1];
    const d = Math.hypot(x - lp.x, y - lp.y);
    if (d < 1.5) return;
    P.speed = P.speed * 0.6 + (d / (Math.max(4, t - P.lastT) / 1000)) * 0.4;
    P.lastT = t; P.len += d;
    if (P.len > 12) P.moved = true;
    S.ink -= d * LEN_COST;
    pushPt(x, y, t);
    Sound.brush(P.speed, true);
    if (S.ink <= 0) { S.ink = 0; pop('墨尽', x, y - 18, 16, INK); Sound.dry(); penUp(false); }
  }
  function penUp(cancel) {
    const P = S.pen;
    S.pen = null;
    Sound.brush(0, false);
    if (cancel || !P || !P.pts.length) return;
    const res = Gesture.classify(P.pts, { unlocked: {} });
    const kind = !P.moved ? 'dian' : res.kind === 'dian' ? 'dian' : res.kind;
    S.ink = Math.max(0, S.ink - (COST[kind] || 0));
    S.stat.strokes[kind] = (S.stat.strokes[kind] || 0) + 1;
    const sg = seg();
    let cut = 0, absorb = 0;
    const hurt = (e, n) => damage(e, n, true);
    if (kind === 'dian') {
      const p = P.pts[0], r = Math.max(26, P.blot);
      for (const b of S.bullets) if (!b.dead && Math.hypot(b.x - p.x, b.y - p.y) < r + b.r) { b.dead = true; cut++; splash(b.x, b.y, 3); }
      for (const e of S.enemies) if (!e.dead && Math.hypot(e.x - p.x, e.y - p.y) < r + e.r) hurt(e, Math.round(2 + r / 14));
      burst(p.x, p.y, r);
      Sound.drip(r > 45);
    } else if (kind === 'feng' && res.poly) {
      for (const b of S.bullets) if (!b.dead && pointInPoly(b.x, b.y, res.poly)) { b.dead = true; absorb++; inkBack(b.x, b.y); }
      for (const e of S.enemies) if (!e.dead && pointInPoly(e.x, e.y, res.poly)) hurt(e, 6);
      S.ink = Math.min(INK_MAX, S.ink + absorb * 2);
      S.trails.push({ pts: P.pts, t: 0, seed: P.seed, ring: true });
      Sound.chord(Math.max(3, absorb), panOf(centroidOf(res.poly).x));
      if (absorb) pop(`收墨 +${absorb * 2}`, centroidOf(res.poly).x, centroidOf(res.poly).y, 18, CINNABAR);
    } else {
      const band = kind === 'zhan' ? 16 : 10, dmg = kind === 'zhan' ? 4 : 1;
      for (const b of S.bullets) if (!b.dead && distToPolyline(b.x, b.y, P.pts) < band + b.r) { b.dead = true; cut++; splash(b.x, b.y, 3); }
      for (const e of S.enemies) if (!e.dead && distToPolyline(e.x, e.y, P.pts) < e.r + (kind === 'zhan' ? 12 : 4)) hurt(e, dmg);
      S.trails.push({ pts: P.pts, t: 0, seed: P.seed, zhan: kind === 'zhan' });
      if (kind === 'zhan') Sound.cut(panOf(P.pts[0].x)); else Sound.swish(0.5, panOf(P.pts[0].x));
    }
    S.stat.cut += cut; S.stat.absorb += absorb; sg.cut += cut + absorb;
    if (cut >= 3) pop(`截弹 ${cut}`, P.pts[P.pts.length - 1].x, P.pts[P.pts.length - 1].y - 24, 18, INK);
  }

  // —— 更新 ——
  function update(rdt) {
    if (!S) return;
    S.flash = Math.max(0, S.flash - rdt * 2);
    const portrait = H > W * 1.02;
    if (portrait && live()) pause();
    if (S.phase === 'pause' || S.phase === 'result') { updateFx(rdt * 0.2); return; }
    if (!document.hidden) {
      S.stat.frames++; if (rdt > 0.025) S.stat.slow++;
      const g = seg(); g.frames++; if (rdt > 0.025) g.slow++;
    }
    const target = S.phase === 'dying' ? 0.25 : S.phase === 'clearing' ? 0.6 : S.pen ? SLOW : 1;
    S.ts += (target - S.ts) * Math.min(1, rdt * 14);
    const dt = rdt * S.ts;
    S.realT += rdt;
    if (S.phase === 'intro' && (S.introT += rdt) > 2.2) S.phase = 'play';
    // 墨：落笔按住按真实时间耗，点墨按住越久晕得越大
    if (S.pen) {
      const P = S.pen;
      P.held += rdt; S.stat.drawT += rdt; if (S.phase === 'play') seg().drawT += rdt;
      S.ink -= HOLD_DRAIN * rdt;
      if (!P.moved && P.held > 0.12 && P.blot < 72) { P.blot = Math.max(26, P.blot) + rdt * 60; S.ink -= rdt * 12; }
      if (S.ink <= 0) { S.ink = 0; pop('墨尽', P.pts[P.pts.length - 1].x, P.pts[P.pts.length - 1].y - 18, 16, INK); Sound.dry(); penUp(false); }
    } else S.ink = Math.min(INK_MAX, S.ink + REGEN * dt);
    if (S.mover || keyDir().x || keyDir().y) S.stat.moveT += rdt;
    S.bgX += dt;
    moveShip(dt);
    if (S.phase === 'play') {
      S.t += dt; const g = seg(); g.t += dt; g.rt += rdt;
      while (S.evI < EVENTS.length && EVENTS[S.evI].t <= S.t) spawn(EVENTS[S.evI++]);
    }
    if (S.phase !== 'dying') fire(dt);
    updateEnemies(dt);
    updateShots(dt);
    updateBullets(dt);
    updateFx(dt);
    S.ship.inv = Math.max(0, S.ship.inv - dt);
    if (S.phase === 'dying' && (S.dieT -= rdt) <= 0) finish('fall');
    if (S.phase === 'play' && S.evI >= EVENTS.length && !S.enemies.some(e => !e.dead)) {
      S.phase = 'clearing'; S.clearT = 1.4;
      for (const b of S.bullets) if (!b.dead) { b.dead = true; inkBack(b.x, b.y); }
      pop('远山已净', W / 2, H * 0.42, 34, INK, 1.6);
    }
    if (S.phase === 'clearing' && (S.clearT -= rdt) <= 0) finish('win');
  }
  function keyDir() {
    const x = (keys.arrowright || keys.d ? 1 : 0) - (keys.arrowleft || keys.a ? 1 : 0);
    const y = (keys.arrowdown || keys.s ? 1 : 0) - (keys.arrowup || keys.w ? 1 : 0);
    return { x, y };
  }
  function moveShip(dt) {
    const sh = S.ship, B = bounds(), kd = keyDir();
    if (kd.x || kd.y) {
      const n = Math.hypot(kd.x, kd.y);
      S.tx = clamp(S.tx + kd.x / n * KEY_SPEED * dt, B.x0, B.x1); S.ty = clamp(S.ty + kd.y / n * KEY_SPEED * dt, B.y0, B.y1);
      if (S.mover) { S.mover.sx = S.tx; S.mover.sy = S.ty; S.mover.fx = S.mover.x; S.mover.fy = S.mover.y; }
    }
    const dx = S.tx - sh.x, dy = S.ty - sh.y, d = Math.hypot(dx, dy), step = SHIP_MAX * dt;
    const oy = sh.y;
    if (d <= step) { sh.x = S.tx; sh.y = S.ty; } else { sh.x += dx / d * step; sh.y += dy / d * step; }
    sh.vy = dt > 0 ? sh.vy * 0.8 + ((sh.y - oy) / dt) * 0.2 : sh.vy;
  }
  function fire(dt) {
    const sh = S.ship;
    if ((sh.fireT -= dt) > 0) return;
    sh.fireT += FIRE_DT;
    S.shots.push({ x: sh.x + 6, y: sh.y + (S.stat.fired++ % 2 ? 3 : -3), vx: SHOT_SP, r: 4 });
  }
  function spawn(ev) {
    const y = ev.y * H, x = W + 40;
    const base = { x, y, y0: y, t: 0, seed: Math.random(), dir: Math.PI, flash: 0, dead: false, stun: 0 };
    if (ev.k === 'du') S.enemies.push(Object.assign(base, { type: 'du', r: 15, hp: 3, maxHp: 3, vx: -(ev.sp || 190), value: 10 }));
    else if (ev.k === 'e') S.enemies.push(Object.assign(base, { type: 'e', r: 14, hp: 2, maxHp: 2, vx: -150, amp: ev.amp * H, ph: ev.ph, shoot: ev.shoot, cd: 1.2 + (ev.ph % 1.3), value: 15 }));
    else if (ev.k === 'chan') S.enemies.push(Object.assign(base, { type: 'chan', r: 18, hp: 14, maxHp: 14, stop: ev.stop * W, hold: ev.hold, pat: ev.pat, cd: 1.1, value: 50 }));
    else if (ev.k === 'king') {
      S.enemies.push(Object.assign(base, { type: 'chan', king: true, r: 30, hp: 60, maxHp: 60, stop: ev.stop * W, hold: ev.hold, pat: 'king', cd: 1.4, cyc: 0, value: 400 }));
      Sound.roar(); pop('大蟾', W * 0.7, H * 0.2, 26, CINNABAR, 1.4);
    }
  }
  function aimAt(e) { return Math.atan2(S.ship.y - e.y, S.ship.x - e.x); }
  function shoot(e, ang, sp, mark) {
    S.bullets.push({ x: e.x + Math.cos(ang) * e.r, y: e.y + Math.sin(ang) * e.r, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, r: mark ? 7 : 6, mark, grazed: false, dead: false });
  }
  function updateEnemies(dt) {
    for (const e of S.enemies) {
      if (e.dead) continue;
      e.t += dt; e.flash = Math.max(0, e.flash - dt * 4);
      if (e.type === 'du') { e.x += e.vx * dt; e.y = e.y0 + Math.sin(e.t * 2 + e.seed * 6) * 6; }
      else if (e.type === 'e') {
        e.x += e.vx * dt; const ny = e.y0 + Math.sin(e.t * 2.4 + e.ph) * e.amp;
        if (dt > 0) e.dir = Math.atan2(ny - e.y, e.vx * dt);
        e.y = ny;
        if (e.shoot && e.x < W - 30 && (e.cd -= dt) <= 0) { e.cd = 2.6; shoot(e, aimAt(e), 220); Sound.spit(panOf(e.x)); }
      } else if (e.type === 'chan') {
        e.dir = aimAt(e);
        if (e.x > e.stop && e.hold > 0) e.x = Math.max(e.stop, e.x - Math.max(60, (e.x - e.stop) * 2.2) * dt);
        else if (e.hold > 0) {
          e.hold -= dt;
          e.cd -= dt;
          e.charging = e.cd < 0.45;
          if (e.cd <= 0) chanFire(e);
          if (e.burst) burstStep(e, dt);
        } else { e.x += 140 * dt; e.charging = false; if (e.x > W + 60) e.dead = true; }   // 守够了，退回右边
      }
      if (e.x < -60) e.dead = true;
      // 撞上笔尖
      if (!e.dead && S.phase !== 'dying' && Math.hypot(e.x - S.ship.x, e.y - S.ship.y) < e.r * 0.8 + HIT_R) { damage(e, 2, false); hurtShip('body'); }
    }
    S.enemies = S.enemies.filter(e => !e.dead);
  }
  function chanFire(e) {
    const a = aimAt(e);
    if (e.pat === 'aim3') { e.cd = 1.9; e.burst = { n: 3, gap: 0.12, t: 0, sp: 250 }; }
    else if (e.pat === 'fan5') { e.cd = 2.3; for (let i = -2; i <= 2; i++) shoot(e, a + i * 0.25, 210); }
    else if (e.pat === 'king') {
      if (e.cyc++ % 2 === 0) { e.cd = 1.6; for (let i = -3; i <= 3; i++) shoot(e, a + i * 0.23, 200, true); }
      else { e.cd = 1.8; e.burst = { n: 5, gap: 0.1, t: 0, sp: 280, mark: true }; }
    }
    Sound.spit(panOf(e.x));
  }
  function burstStep(e, dt) {
    const b = e.burst;
    if ((b.t -= dt) > 0) return;
    shoot(e, aimAt(e), b.sp, b.mark);
    b.t = b.gap;
    if (--b.n <= 0) e.burst = null;
  }
  function damage(e, n, byPen) {
    if (e.dead) return;
    e.hp -= n; e.flash = 1;
    if (e.hp > 0) { if (byPen) splash(e.x, e.y, 4); return; }
    e.dead = true;
    S.stat.kills++; seg().kills++;
    S.score += e.value;
    splash(e.x, e.y, e.king ? 40 : 12, e.r);
    Sound.hit(panOf(e.x));
    if (e.king) { Sound.gong(0.5, 0.6, 1.6); UI.shake = 0.8; for (const b of S.bullets) if (!b.dead) { b.dead = true; inkBack(b.x, b.y); } }
  }
  function updateShots(dt) {
    for (const s of S.shots) {
      s.x += s.vx * dt;
      if (s.x > W + 20) { s.dead = true; continue; }
      for (const e of S.enemies) {
        if (e.dead || e.x > W + 10) continue;
        if (Math.abs(s.x - e.x) < e.r + s.r && Math.abs(s.y - e.y) < e.r + s.r && Math.hypot(s.x - e.x, s.y - e.y) < e.r + s.r) {
          s.dead = true; damage(e, 1, false); S.parts.push({ x: s.x, y: s.y, vx: -60, vy: vr(-40, 40), r: 2.5, life: 0.25, max: 0.25 });
          break;
        }
      }
    }
    S.shots = S.shots.filter(s => !s.dead);
  }
  function updateBullets(dt) {
    const sh = S.ship;
    for (const b of S.bullets) {
      if (b.dead) continue;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.x < -30 || b.x > W + 40 || b.y < -30 || b.y > H + 30) { b.dead = true; S.stat.dodged++; continue; }
      if (S.phase === 'dying' || S.phase === 'clearing') continue;
      const d = Math.hypot(b.x - sh.x, b.y - sh.y);
      if (d < HIT_R + b.r * 0.6) { b.dead = true; splash(b.x, b.y, 5); hurtShip('shot'); continue; }
      if (!b.grazed && d < GRAZE_R + b.r) {
        b.grazed = true; S.stat.graze++; seg().graze++;
        S.ink = Math.min(INK_MAX, S.ink + 3); S.score += 20;
        S.parts.push({ x: sh.x, y: sh.y, vx: vr(-80, -20), vy: vr(-60, 60), r: 2, life: 0.35, max: 0.35, red: true });
        if (S.stat.graze % 5 === 1) pop('擦墨', sh.x - 10, sh.y - 26, 15, CINNABAR, 0.7);
        Sound.clink(panOf(sh.x));
      }
    }
    S.bullets = S.bullets.filter(b => !b.dead);
  }
  function hurtShip(src) {
    const sh = S.ship;
    if (sh.inv > 0 || S.phase === 'dying' || S.phase === 'clearing') return;
    S.lives--; S.stat.hit++; seg().hits++;
    if (S.log) { S.log.hurt = S.log.hurt || {}; S.log.hurt[src] = (S.log.hurt[src] || 0) + 1; }
    sh.inv = 2.2;
    for (const b of S.bullets) if (!b.dead && Math.hypot(b.x - sh.x, b.y - sh.y) < 170) { b.dead = true; splash(b.x, b.y, 3); }
    UI.shake = 0.9; S.flash = 0.7;
    Sound.sealHit(); buzz([50, 40, 70], true);
    pop('-1', sh.x + 20, sh.y - 30, 24, CINNABAR);
    if (S.lives <= 0) {
      S.phase = 'dying'; S.dieT = 1.5;
      if (S.pen) penUp(true);
      S.mover = null;
      splash(sh.x, sh.y, 30, 20);
      Sound.gameOver();
    }
  }

  // —— 墨溅、回墨、飘字 ——
  function splash(x, y, n, r) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, sp = vr(40, 200) * (r ? 1 + r / 30 : 1);
      S.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: vr(1.5, r ? 5 : 3.5), life: vr(0.3, 0.7), max: 0.7 });
    }
  }
  function burst(x, y, r) { S.trails.push({ blotAt: { x, y }, r, t: 0 }); splash(x, y, Math.round(r / 4), r / 3); }
  function inkBack(x, y) { S.parts.push({ x, y, home: true, vx: 0, vy: 0, r: 3, life: 0.6, max: 0.6, red: true }); }
  function pop(text, x, y, size, col, dur) { S.pops.push({ text, x, y, size, col, t: 0, dur: dur || 0.9 }); }
  function updateFx(dt) {
    for (const p of S.parts) {
      p.life -= dt;
      if (p.home) { const tx = 120, ty = 52; p.x += (tx - p.x) * Math.min(1, dt * 5); p.y += (ty - p.y) * Math.min(1, dt * 5); }
      else { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - dt * 3; p.vy *= 1 - dt * 3; }
    }
    S.parts = S.parts.filter(p => p.life > 0);
    if (S.parts.length > 500) S.parts.splice(0, S.parts.length - 500);
    for (const q of S.pops) q.t += dt;
    S.pops = S.pops.filter(q => q.t < q.dur);
    for (const tr of S.trails) tr.t += dt;
    S.trails = S.trails.filter(tr => tr.t < 0.6);
  }

  // —— 画 ——
  function ridgeLoop(R, n, base, amp, rough) {
    let pts = [base, base + (R() - 0.5) * amp, base];   // 首尾同高，可无缝平铺
    let d = amp * 0.7;
    while (pts.length < n) {
      const np = [];
      for (let i = 0; i < pts.length - 1; i++) { np.push(pts[i]); np.push((pts[i] + pts[i + 1]) / 2 + (R() - 0.5) * d); }
      np.push(pts[pts.length - 1]);
      pts = np; d *= rough;
    }
    return pts;
  }
  function buildBg(s) {
    const key = `${W}x${H}x${s}`;
    if (bg && bg.key === key) return bg;
    const paper = Art.makeCanvas(Math.ceil(W * s), Math.ceil(H * s));
    Art.buildPaper(paper, W, H, s, 0);
    const q = Math.min(1, s) * 0.75, R = mulberry32(77);
    const layers = [
      { base: 0.46, amp: 0.5, a: 0.06, sp: 12 },
      { base: 0.64, amp: 0.38, a: 0.09, sp: 30 },
      { base: 0.84, amp: 0.26, a: 0.13, sp: 66 },
    ].map(L => {
      const cv2 = Art.makeCanvas(Math.ceil(W * q), Math.ceil(H * q)), c = cv2.getContext('2d');
      c.setTransform(q, 0, 0, q, 0, 0);
      const ys = ridgeLoop(R, 129, L.base * H, L.amp * H, 0.56), n = ys.length;
      let top = Infinity; for (const y of ys) top = Math.min(top, y);
      c.beginPath(); c.moveTo(0, H);
      for (let i = 0; i < n; i++) c.lineTo(i / (n - 1) * W, ys[i]);
      c.lineTo(W, H); c.closePath();
      const g = c.createLinearGradient(0, top, 0, top + H * 0.34);
      g.addColorStop(0, `rgba(40,38,36,${L.a})`); g.addColorStop(1, 'rgba(40,38,36,0)');
      c.fillStyle = g; c.fill();
      c.strokeStyle = `rgba(30,28,26,${L.a * 1.3})`; c.lineWidth = 1.1;
      c.beginPath(); for (let i = 0; i < n; i++) { const x = i / (n - 1) * W; i ? c.lineTo(x, ys[i]) : c.moveTo(x, ys[i]); } c.stroke();
      for (let i = 2; i < n - 2; i += 3) {
        if (R() < 0.5) continue;
        const x = i / (n - 1) * W, y = ys[i];
        c.strokeStyle = `rgba(30,28,26,${L.a * (0.5 + R() * 0.6)})`; c.lineWidth = 0.6 + R();
        c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + (R() - 0.5) * 14, y + 14, x + (R() - 0.5) * 20, y + 18 + R() * 30); c.stroke();
      }
      return { cv: cv2, sp: L.sp };
    });
    bg = { key, paper, layers };
    return bg;
  }
  function draw() {
    const s = DPR * K, c = ctx;
    const B = buildBg(s);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(B.paper, 0, 0);
    if (!S) return;
    let sx = 0, sy = 0;
    if (UI.shake > 0 && !SET.reduceFx) { const m = UI.shake * UI.shake * 7; sx = vr(-m, m); sy = vr(-m, m); }
    c.setTransform(s, 0, 0, s, sx * s, sy * s);
    for (const L of B.layers) {
      const off = (S.bgX * L.sp) % W;
      c.drawImage(L.cv, -off, 0, W, H); c.drawImage(L.cv, W - off, 0, W, H);
    }
    // 落笔中：远山褪淡、四角压一圈淡墨，示意光阴放慢；只盖底景，墨妖与墨弹反而更清楚
    if (S.ts < 0.95) {
      const k = (1 - S.ts) / (1 - SLOW);
      c.fillStyle = `rgba(${PAPER},${0.45 * k})`; c.fillRect(-20, -20, W + 40, H + 40);
      const vg = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.hypot(W, H) * 0.6);
      vg.addColorStop(0, `rgba(${INK},0)`); vg.addColorStop(1, `rgba(${INK},${0.16 * k})`);
      c.fillStyle = vg; c.fillRect(-20, -20, W + 40, H + 40);
    }
    const t = UI.t;
    // 收笔后的笔迹淡去
    for (const tr of S.trails) {
      const a = 1 - tr.t / 0.6;
      if (tr.blotAt) { c.fillStyle = `rgba(${INK},${0.5 * a})`; c.beginPath(); c.arc(tr.blotAt.x, tr.blotAt.y, tr.r * (0.8 + 0.2 * tr.t / 0.6), 0, TAU); c.fill(); continue; }
      Art.brush(c, tr.pts, 0.9 * a, tr.ring ? CINNABAR : INK, tr.seed);
    }
    for (const e of S.enemies) {
      if (e.dead) continue;
      Art.drawEnemy(c, e, t);
      if (e.king) {
        c.strokeStyle = `rgba(${CINNABAR},0.7)`; c.lineWidth = 2; c.beginPath(); c.arc(e.x, e.y, e.r + 8, 0, TAU); c.stroke();
        const w = 90; c.fillStyle = `rgba(${INK},0.2)`; c.fillRect(e.x - w / 2, e.y - e.r - 22, w, 5);
        c.fillStyle = `rgba(${CINNABAR},0.85)`; c.fillRect(e.x - w / 2, e.y - e.r - 22, w * Math.max(0, e.hp) / e.maxHp, 5);
      }
    }
    // 自己的墨点画淡、画成短划，让敌弹（墨滴带朱芯）一眼跳出来
    c.strokeStyle = `rgba(${INK},0.36)`; c.lineCap = 'round';
    for (const s2 of S.shots) { c.lineWidth = s2.r * 0.9; c.beginPath(); c.moveTo(s2.x - s2.r * 2.6, s2.y); c.lineTo(s2.x + s2.r * 0.8, s2.y); c.stroke(); }
    drawShip(c);
    for (const b of S.bullets) Art.drawShot(c, b);
    for (const p of S.parts) {
      const a = clamp(p.life / p.max, 0, 1);
      c.fillStyle = p.red ? `rgba(${CINNABAR},${0.8 * a})` : `rgba(${INK},${0.75 * a})`;
      c.beginPath(); c.arc(p.x, p.y, p.r, 0, TAU); c.fill();
    }
    if (S.pen) {
      const P = S.pen;
      if (!P.moved && P.held > 0.12) { c.fillStyle = `rgba(${INK},0.35)`; c.beginPath(); c.arc(P.pts[0].x, P.pts[0].y, Math.max(26, P.blot), 0, TAU); c.fill(); }
      if (P.pts.length > 1) Art.brush(c, P.pts, 0.95, INK, P.seed, false);
    }
    for (const q of S.pops) {
      const a = Math.min(1, (q.dur - q.t) / 0.3);
      txt(q.text, q.x, q.y - q.t * 24, q.size, q.col, 'center', a);
    }
    c.setTransform(s, 0, 0, s, 0, 0);
    if (S.flash > 0 && !SET.reduceFx) { c.fillStyle = `rgba(${CINNABAR},${S.flash * 0.25})`; c.fillRect(0, 0, W, H); }
    drawHud(c);
    // 竖着拿：只留「横过来」一层，底下的停笔、结算按钮不画也不收点按
    if (H > W * 1.02) { drawRotate(); return; }
    if (S.phase === 'intro') drawIntro();
    if (S.phase === 'pause') drawPause();
    if (S.phase === 'result') drawResult();
  }
  function drawShip(c) {
    const sh = S.ship;
    if (S.phase === 'dying' || (S.lives <= 0 && S.phase === 'result')) return;
    const blink = sh.inv > 0 && Math.floor(sh.inv * 12) % 2 === 0;
    const tilt = clamp(sh.vy / 1400, -0.3, 0.3);
    c.save(); c.globalAlpha = blink ? 0.35 : 1;
    Art.drawBrush(c, profile.brush, sh.x - BRUSH_L * Math.cos(tilt), sh.y - BRUSH_L * Math.sin(tilt), BRUSH_L, 1, -Math.PI / 2 + tilt);
    c.restore();
    // 判定点：笔尖一点朱
    c.fillStyle = `rgba(${CINNABAR},0.95)`; c.beginPath(); c.arc(sh.x, sh.y, HIT_R * 0.8, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(250,244,230,0.9)'; c.lineWidth = 1.2; c.stroke();
  }
  function drawHud(c) {
    // 左上：命（三方小印）与墨
    for (let i = 0; i < LIVES; i++) {
      const on = i < S.lives, x = 30 + i * 30, y = 28;
      c.fillStyle = on ? `rgba(${CINNABAR},0.9)` : `rgba(${INK},0.15)`;
      Art.roundRect(c, x - 11, y - 11, 22, 22, 3); c.fill();
      if (on) txt('印', x, y + 1, 14, '250,240,228');
    }
    const bw = 200, bx = 20, by = 50;
    c.fillStyle = `rgba(${INK},0.12)`; Art.roundRect(c, bx, by, bw, 9, 4); c.fill();
    c.fillStyle = S.ink < 20 ? `rgba(${CINNABAR},0.8)` : `rgba(${INK},0.75)`;
    Art.roundRect(c, bx, by, bw * clamp(S.ink / INK_MAX, 0, 1), 9, 4); c.fill();
    txt('墨', bx + bw + 14, by + 5, 14, INK, 'center', 0.6);
    // 上中：段名与进度
    const g = SEGS.filter(x => S.t >= x.t0).pop() || SEGS[0];
    txt(`卷一 · 远山 · ${g.name}`, W / 2, 26, 17, INK, 'center', 0.65);
    const pw = 240, px = W / 2 - pw / 2;
    c.fillStyle = `rgba(${INK},0.12)`; c.fillRect(px, 44, pw, 3);
    c.fillStyle = `rgba(${INK},0.55)`; c.fillRect(px, 44, pw * clamp(S.t / (LAST_T + 8), 0, 1), 3);
    // 右上：分数、暂停
    txt(String(S.score), W - 92, 28, 22, INK, 'right', 0.75);
    if (S.phase === 'play' || S.phase === 'intro') button('停', W - 70, 12, 52, 36, pause, false, 17);
    // 左手的拖动处：起点一圈、手指一点
    const m = S.mover;
    if (m) {
      c.strokeStyle = `rgba(${INK},0.18)`; c.lineWidth = 2; c.beginPath(); c.arc(m.x0, m.y0, 34, 0, TAU); c.stroke();
      c.fillStyle = `rgba(${INK},0.15)`; c.beginPath(); c.arc(m.x, m.y, 16, 0, TAU); c.fill();
    }
    // 开头几秒的操作提示
    const hintA = S.phase === 'intro' ? 1 : clamp((9 - S.t) / 1.5, 0, 1);
    if (hintA > 0 && S.phase !== 'pause') {
      if (S.input === 'mouse') txt('方向键 / WASD 走笔尖　·　鼠标落笔：一横斩、一圈封、一点墨　·　落笔时光阴放慢', W / 2, H - 30, 15, INK, 'center', 0.6 * hintA, 'normal');
      else {
        txt('左手 · 按住拖动，走笔尖', W * 0.2, H - 34, 16, INK, 'center', 0.6 * hintA, 'normal');
        txt('右手 · 落笔：一横斩、一圈封、一点墨', W * 0.66, H - 34, 16, INK, 'center', 0.6 * hintA, 'normal');
      }
    }
  }
  function drawIntro() {
    const a = clamp(Math.min(S.introT / 0.4, (2.2 - S.introT) / 0.5), 0, 1);
    txt('御笔', W / 2, H * 0.36, 52, INK, 'center', a);
    txt('卷一 · 远山', W / 2, H * 0.36 + 50, 20, INK, 'center', 0.7 * a, 'normal');
  }
  function drawPause() {
    wash(0.7);
    txt('停笔', W / 2, H * 0.34, 40, INK);
    const bw = 130, bh = 46, g = 16, x0 = W / 2 - (bw * 3 + g * 2) / 2, y = H * 0.48;
    button('继续', x0, y, bw, bh, resume, true);
    button('重来', x0 + bw + g, y, bw, bh, () => { leaveQuiet(); start(); });
    button('回到卷首', x0 + 2 * (bw + g), y, bw, bh, leave);
    txt('Esc / P 继续　·　M 静音', W / 2, y + 80, 14, INK, 'center', 0.5, 'normal');
  }
  function leaveQuiet() { if (S && S.phase !== 'result' && S.t > 3) finish('quit', true); }
  function drawResult() {
    wash(0.82);
    const win = S.log.end === 'win', y0 = H * 0.22;
    drawStamp(win ? '净' : '碎', W / 2, y0, 80, clamp((UI.t - UI.endT) / 0.3, 0, 1));
    txt(win ? '远山已净' : '笔折', W / 2, y0 + 82, 32, INK);
    const st = S.stat;
    const lines = [
      `得分　${S.score}　　伏妖　${st.kills}　　失印　${LIVES - S.lives}` + (S.rating ? `　　品曰${S.rating}` : ''),
      `擦墨　${st.graze}　　截弹　${st.cut}　　收墨　${st.absorb}　　躲过　${st.dodged}`,
      `落笔　斩 ${st.strokes.zhan}　封 ${st.strokes.feng}　点 ${st.strokes.dian}　　落笔时长 ${Math.round(st.drawT)} 秒`,
    ];
    lines.forEach((l, i) => txt(l, W / 2, y0 + 130 + i * 30, 16, INK, 'center', 0.8, 'normal'));
    if (!win) txt(`笔折于「${seg().name}」`, W / 2, y0 + 130 + 3 * 30, 15, CINNABAR, 'center', 0.85, 'normal');
    if (UI.t - UI.endT > 0.5) {
      const bw = 150, bh = 46, g = 16, x0 = W / 2 - (bw * 2 + g) / 2, y = y0 + 260;
      button('再来一次', x0, y, bw, bh, start, true);
      button('回到卷首', x0 + bw + g, y, bw, bh, leave);
      txt('横屏双指试作 · 本局已记进试玩记录', W / 2, y + 74, 14, INK, 'center', 0.5, 'normal');
    }
  }
  function drawRotate() {
    wash(0.97);
    txt('请把手机横过来', CX, CY - 40, 28, INK);
    txt('御笔要两只手：左手走笔尖，右手落笔', CX, CY + 4, 16, INK, 'center', 0.65, 'normal');
    button('回到卷首', CX - 70, CY + 50, 140, 46, leave);
  }

  return { enter, start, leave, update, draw, down, move, up, key, pause, get state() { return S; }, EVENTS, SEGS, LIVES, INK_MAX };
})();
