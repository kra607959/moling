'use strict';
// 墨灵 · 游戏 4/13 · entity：墨妖的生成、伤害与击杀；墨印受击；墨弹（截弹、回澜）；墨滴；视觉小件

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
    if (!G.glanceT || G.time - G.glanceT > 0.6) { G.glanceT = G.time; pop('顺鳞 · 改从侧面横斩', clamp(e.x, 115, W - 115), e.y - e.r - 14, 16, '90,80,70', 0.85, 'num'); }
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
      if (e.type === 'seg') { if (!G.glanceT || G.time - G.glanceT > 0.6) { G.glanceT = G.time; pop(src === 'feng' ? '封不住 · 横斩蛟身' : src === 'dian' ? '点不透 · 横斩蛟身' : '蛟鳞难破 · 横斩蛟身', clamp(e.x, 115, W - 115), e.y - e.r - 22, 18, CINNABAR, 1.15, 'num'); } }
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
  if (src === 'brush') { markInsight('nong'); if (G.ink < inkMax() * 0.3) markInsight('fei'); }
  if (src === 'po') markInsight('po');
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
  if (!segBurst && !G.batch) pop('+' + gain, e.x, e.y - e.r - 6, 13, '90,80,70', 0.9, 'num');
  // 一笔封住多只时，拨弦留到封完再合成一声（见 techFeng）
  if (G.batch) G.batch.push({ i: Math.min(G.combo + 2, 16), pan: panOf(e.x) });
  else Sound.pluck(Math.min(G.combo + 2, 16), 0.3, panOf(e.x));
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
  if (G.yi < YI_MAX) markInsight('yiqi');
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
  const sh = { x, y, vx: dx / d * speed, vy: dy / d * speed, r: 6, dead: false, t: 0 };
  G.shots.push(sh);
  Sound.spit(panOf(x));
  return sh;
}
// 与印外朱弧共用的判定：惜墨只奖下笔截断真正会撞印的弹。
function shotImpactTime(sh) {
  if (G.shan || sh.dead || sh.rev) return Infinity;
  const dx = CX - sh.x, dy = CY - sh.y, sp = Math.hypot(sh.vx, sh.vy);
  if (!sp) return Infinity;
  const along = (dx * sh.vx + dy * sh.vy) / sp;
  const across = Math.abs(dx * sh.vy - dy * sh.vx) / sp, r = SEAL_R + sh.r * 0.5;
  if (along <= 0 || across >= r) return Infinity;
  return Math.max(0, (along - Math.sqrt(r * r - across * across)) / sp);
}
const SHOT_CUE_T = 1.6;
// 回澜：墨弹倒卷，转向最近的墨妖，飞得更快，微微追着它
function reflectShot(sh, tao) {
  let best = null, bd = 600 * 600;
  for (const e of G.enemies) {
    if (e.dead || isImmune(e, 'lang')) continue;
    const q = (e.x - sh.x) ** 2 + (e.y - sh.y) ** 2;
    if (q < bd) { bd = q; best = e; }
  }
  const sp = Math.max(260, Math.hypot(sh.vx, sh.vy) * 1.8);
  const dx = best ? best.x - sh.x : -sh.vx, dy = best ? best.y - sh.y : -sh.vy, l = Math.hypot(dx, dy) || 1;
  sh.vx = dx / l * sp; sh.vy = dy / l * sp;
  sh.rev = true; sh.held = 0; sh.tgt = best; sh.dmg = 1 + tao; sh.t = 0;
  G.fx.push({ type: 'ring', x: sh.x, y: sh.y, r: 16, t: 0, dur: 0.3 });
}
function cutShot(sh, quiet) {
  if (sh.dead || sh.rev) return;
  sh.dead = true;
  G.score += 5;
  inkParts(sh.x, sh.y, 6, sh.vx, sh.vy, 0.6);
  // 墨弹断成两截，向两侧飞散
  G.fx.push({ type: 'split', x: sh.x, y: sh.y, vx: sh.vx, vy: sh.vy, r: sh.r, t: 0, dur: 0.5 });
  if (G.stroke) G.stroke.cuts = (G.stroke.cuts || 0) + 1;
  if (!quiet) { Sound.snap(panOf(sh.x)); charPop('截', sh.x, sh.y - 30, 44); buzz(18); }
}
function spawnDrop(x, y) {
  G.drops.push({ x, y, vx: rr(-70, 70), vy: rr(-70, 70), t: 0, life: 6.5, v: 5 * (lv('xi') ? 1.5 : 1), dead: false });
}
function collectDrop(d) {
  if (!d.dead && G.ink < inkMax()) markInsight('xi');
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
