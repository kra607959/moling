'use strict';
// 画卷：把一局各层纸面的墨迹裱成一幅手卷，存入卷库（IndexedDB）。
// 手卷自右向左展读：天杆、天头、引首（题名）、隔水、画心（每层一段，相邻两段交融）、隔水、拖尾（题跋）、尾纸、轴。

var Scroll = (function () {
  const PW = 640, PH = 480, OV = 110;            // 每段画心的像素尺寸、相邻两段交融的宽度
  const WORLD_W = 960, WORLD_H = 720;            // 每段取印周围这么大的世界范围
  const M = 22, BORDER = 30, KNOB = 15, ROLL = 34, TAIL = 46, GS = 22, TW = 236, HEAD = 64, STAVE = 16;
  const DESK = '#2d2823';
  const SILK = [174, 177, 160];
  const COL_W = 40, CH = 25, LEAD = 29;          // 题跋竖排：列宽、字号、字距

  // —— 纸与绫 ——
  // 每段底景按层号换一个随机种，免得同一章的几段山水一模一样；夜景只在一段里留月
  function scenePaper(scene, floor, moon) {
    const cv = Art.makeCanvas(PW, PH);
    Art.buildPaper(cv, WORLD_W, WORLD_H, PW / WORLD_W, scene, { noVignette: true, seed: floor, moonX: scene === 3 ? (moon ? 0.4 : false) : undefined });
    return cv;
  }
  function plainPaper(c, x, y, w, h) {
    const cv = Art.makeCanvas(w, h);
    Art.buildPaper(cv, w * 1.5, h * 1.5, 1 / 1.5, 0, { noVignette: true });
    c.drawImage(cv, x, y);
  }
  function silk(c, x, y, w, h) {
    c.save();
    c.beginPath(); c.rect(x, y, w, h); c.clip();
    c.fillStyle = `rgb(${SILK})`; c.fillRect(x, y, w, h);
    // 暗花菱格与纬线
    c.strokeStyle = 'rgba(255,255,244,0.17)'; c.lineWidth = 1;
    c.beginPath();
    for (let yy = y - 18, r = 0; yy < y + h + 18; yy += 18, r++) {
      for (let xx = x - 18 + (r % 2) * 9; xx < x + w + 18; xx += 18) { c.moveTo(xx, yy - 4); c.lineTo(xx + 4, yy); c.lineTo(xx, yy + 4); c.lineTo(xx - 4, yy); c.closePath(); }
    }
    c.stroke();
    c.fillStyle = 'rgba(60,60,48,0.035)';
    for (let yy = y; yy < y + h; yy += 3) c.fillRect(x, yy, w, 1);
    c.restore();
  }
  function edgeLines(c, x, y, w, h) {
    c.strokeStyle = 'rgba(70,58,44,0.45)'; c.lineWidth = 1;
    c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  // 竖排文字：自 y0 起逐字向下
  function vtext(c, s, x, y0, size, lead, col, alpha) {
    c.font = `bold ${size}px ${FONT}`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = `rgba(${col || INK},${alpha == null ? 1 : alpha})`;
    let y = y0 + size / 2;
    for (const ch of s) { if (ch !== '　') c.fillText(ch, x, y); y += lead; }
  }
  function stampAt(c, img, x, y, s, rot, alpha) {
    c.save(); c.translate(x, y); c.rotate(rot || 0); c.globalAlpha = alpha == null ? 0.92 : alpha;
    c.drawImage(img, -s / 2, -s / 2, s, s);
    c.restore();
  }

  function dateCn(ms) {
    const d = new Date(ms);
    const y = String(d.getFullYear()).split('').map(ch => '〇一二三四五六七八九'[+ch]).join('');
    return `${y}年${cnNum(d.getMonth() + 1)}月${cnNum(d.getDate())}日`;
  }
  function placeName(n) {
    if (n > FINAL_FLOOR) return '续卷第' + cnNum(n - FINAL_FLOOR) + '层';
    return CHAPTERS[chapterOf(n) - 1].name + floorSub(n).split(' · ')[0];
  }
  function colophonLines(rec) {
    const B = BRUSHES[rec.brush] || BRUSHES.jian;
    const L = ['右墨灵图一卷', `以${B.name}作　历${cnNum(rec.floor)}层`, `伏妖${cnBig(rec.kills)}　连击${cnBig(rec.maxCombo)}`];
    if (rec.zi && rec.zi.length) L.push('字诀书' + rec.zi.map(k => ZI[k].ch).join(''));
    if (rec.endless) L.push(`续卷至第${cnNum(rec.floor - FINAL_FLOOR)}层` + (rec.end === 'fall' ? '而印碎' : ''));
    else if (rec.end === 'win') L.push('三卷墨妖尽伏　画卷复净');
    else L.push('印碎于' + placeName(rec.floor));
    L.push('得分' + cnBig(rec.score));
    L.push(dateCn(rec.date));
    // 超长一行折成几列
    const max = Math.floor((PH - 70) / LEAD), cols = [];
    for (const s of L) { const a = Array.from(s); for (let i = 0; i < a.length; i += max) cols.push(a.slice(i, i + max).join('')); }
    return cols;
  }

  // 一段画心：纸（该层底景）+ 墨迹 + 题注与印
  function panelArt(p, isLeftmost, gameSeal, moon) {
    const cv = Art.makeCanvas(PW, PH), c = cv.getContext('2d');
    c.drawImage(scenePaper(p.scene, p.floor, moon), 0, 0);
    c.drawImage(p.cv, 0, 0, PW, PH);
    const safeR = PW - OV - 18;
    vtext(c, placeName(p.floor), safeR, 26, 17, 20, INK, 0.5);
    if (p.flawless && !p.fell) stampAt(c, Art.nameSeal('无瑕', 30, { bai: false, seed: p.floor }), safeR, 26 + Array.from(placeName(p.floor)).length * 20 + 24, 30, 0.05, 0.85);
    if (p.boss) {
      const ch = { jiao: '伏蛟', mu: '伏母', yan: '伏魇' }[p.boss];
      stampAt(c, Art.nameSeal(ch, 56, { seed: 11 + p.floor }), safeR - 30, PH - 74, 56, -0.08, 0.9);
    }
    if (p.fell) {
      stampAt(c, gameSeal, PW / 2, PH / 2, 52, 0.18, 0.55);
      stampAt(c, Art.nameSeal('碎', 46, { seed: 5 }), PW / 2 + 44, PH / 2 + 40, 46, -0.2, 0.9);
    }
    // 与左侧一段交融：左缘渐隐
    if (!isLeftmost) {
      c.globalCompositeOperation = 'destination-in';
      const g = c.createLinearGradient(0, 0, OV, 0);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)');
      c.fillStyle = g; c.fillRect(0, 0, PW, PH);
      c.globalCompositeOperation = 'source-over';
    }
    return cv;
  }

  function compose(rec, panels) {
    const n = panels.length;
    const gameSeal = Art.buildSeal(96);
    const cols = colophonLines(rec);
    const CW = Math.max(330, 64 + (cols.length + 1) * COL_W + 70);
    const PAINT = n * PW - (n - 1) * OV;
    const BODY = PH + 2 * BORDER;
    const width = M + ROLL + TAIL + CW + GS + PAINT + GS + TW + HEAD + STAVE + M;
    const height = M + KNOB + BODY + KNOB + M;
    const cv = Art.makeCanvas(width, height), c = cv.getContext('2d');
    c.fillStyle = DESK; c.fillRect(0, 0, width, height);
    // 案上木纹
    const R = mulberry32(rec.id % 100000);
    for (let i = 0; i < 40; i++) {
      c.strokeStyle = `rgba(${R() < 0.5 ? '0,0,0' : '255,240,220'},${0.03 + R() * 0.04})`; c.lineWidth = 1 + R() * 2;
      const y = R() * height; c.beginPath(); c.moveTo(0, y);
      for (let x = 0; x <= width; x += 200) c.lineTo(x, y + Math.sin(x * 0.003 + i) * 6);
      c.stroke();
    }
    const by = M + KNOB, bx0 = M + ROLL, bx1 = width - M - STAVE;
    // 卷身投影 + 绫
    c.save(); c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = 16; c.shadowOffsetY = 6;
    c.fillStyle = `rgb(${SILK})`; c.fillRect(bx0, by, bx1 - bx0, BODY);
    c.restore();
    silk(c, bx0, by, bx1 - bx0, BODY);
    const py = by + BORDER;
    let x = bx0 + TAIL;
    // 拖尾：题跋
    const colX = x;
    plainPaper(c, x, py, CW, PH); edgeLines(c, x, py, CW, PH);
    x += CW + GS;
    // 画心：右起第一层，向左渐次
    const paintX = x;
    const moonAt = panels.findIndex(p => p.scene === 3);
    for (let i = n - 1; i >= 0; i--) {
      const px = paintX + (n - 1 - i) * (PW - OV);
      c.drawImage(panelArt(panels[i], i === n - 1, gameSeal, i === moonAt), px, py);
    }
    edgeLines(c, paintX, py, PAINT, PH);
    x += PAINT + GS;
    // 引首：题名
    plainPaper(c, x, py, TW, PH); edgeLines(c, x, py, TW, PH);
    const title = '墨灵图', ts = 86, tl = 100;
    vtext(c, title, x + TW / 2, py + (PH - tl * title.length) / 2 + 4, ts, tl, INK, 0.92);
    stampAt(c, gameSeal, x + TW / 2 - 66, py + PH - 64, 50, -0.04, 0.9);
    x += TW;
    // 题跋文字：右起竖排
    let cx = colX + CW - 48;
    cols.forEach((s, i) => { vtext(c, s, cx, py + 36 + (i === 0 ? 0 : 26), CH, LEAD, INK, 0.86); cx -= COL_W; });
    cx -= 8;
    vtext(c, '墨灵记', cx, py + PH * 0.46, CH, LEAD, INK, 0.86);
    const B = BRUSHES[rec.brush] || BRUSHES.jian;
    stampAt(c, Art.nameSeal(B.name, 40, { seed: 3 }), cx, py + PH * 0.46 + 3 * LEAD + 26, 40, 0.03, 0.9);
    stampAt(c, gameSeal, cx, py + PH * 0.46 + 3 * LEAD + 74, 40, -0.05, 0.85);
    (rec.zi || []).forEach((k, i) => stampAt(c, Art.nameSeal(ZI[k].ch, 28, { bai: i % 2 === 1, seed: 20 + i }), colX + 30 + i * 0, py + PH - 40 - i * 34, 28, (i % 2 ? -0.06 : 0.05), 0.85));
    // 轴与天杆
    drawRoller(c, M, M, ROLL, BODY + 2 * KNOB, KNOB);
    drawStave(c, bx1, by, STAVE, BODY);
    return cv;
  }

  function drawRoller(c, x, y, w, h, knob) {
    const g = c.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, '#3b2416'); g.addColorStop(0.45, '#8a5a36'); g.addColorStop(1, '#2e1c11');
    c.fillStyle = g; c.fillRect(x + 3, y + knob, w - 6, h - 2 * knob);
    // 卷在轴上的纸边
    c.fillStyle = 'rgba(240,232,212,0.85)'; c.fillRect(x + w - 6, y + knob + BORDER, 4, h - 2 * knob - 2 * BORDER);
    const jg = c.createLinearGradient(x, 0, x + w, 0);
    jg.addColorStop(0, '#8d9a86'); jg.addColorStop(0.45, '#dfe6d4'); jg.addColorStop(1, '#6f7c6a');
    c.fillStyle = jg;
    Art.roundRect(c, x + 6, y, w - 12, knob + 2, 4); c.fill();
    Art.roundRect(c, x + 6, y + h - knob - 2, w - 12, knob + 2, 4); c.fill();
  }
  function drawStave(c, x, y, w, h) {
    const g = c.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, '#4a2e1c'); g.addColorStop(0.5, '#8d6040'); g.addColorStop(1, '#3a2315');
    c.fillStyle = g; c.fillRect(x, y - 4, w, h + 8);
    // 系带
    c.strokeStyle = '#6f4c8a'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(x + w, y + h * 0.5); c.quadraticCurveTo(x + w + 14, y + h * 0.55, x + w + 8, y + h * 0.7); c.stroke();
  }

  function thumb(cv, h) {
    const s = h / cv.height, t = Art.makeCanvas(Math.round(cv.width * s), h);
    t.getContext('2d').drawImage(cv, 0, 0, t.width, t.height);
    return t;
  }

  // —— 卷库 ——
  const DB_NAME = /[?&]debug\b/.test(location.search) ? 'moling-debug' : 'moling';
  const KEEP = 30;
  const mem = new Map();
  let dbp = null;
  function db() {
    if (!dbp) {
      dbp = new Promise((res, rej) => {
        try {
          const r = indexedDB.open(DB_NAME, 1);
          r.onupgradeneeded = () => r.result.createObjectStore('scrolls', { keyPath: 'id' });
          r.onsuccess = () => res(r.result);
          r.onerror = () => rej(r.error);
        } catch (e) { rej(e); }
      });
    }
    return dbp;
  }
  function tx(mode, fn) {
    return db().then(d => new Promise((res, rej) => {
      const t = d.transaction('scrolls', mode), req = fn(t.objectStore('scrolls'));
      t.oncomplete = () => res(req ? req.result : undefined);
      t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    }));
  }
  const toBlob = (cv, type, q) => new Promise(res => cv.toBlob(res, type, q));

  // 依次入库：续卷时同一卷先后存两次，后存的须覆盖先存的
  let chain = Promise.resolve();
  function store(rec, cv) {
    const p = chain.then(() => storeNow(rec, cv));
    chain = p.catch(() => {});
    return p;
  }
  async function storeNow(rec, cv) {
    const img = await toBlob(cv, 'image/jpeg', 0.86);
    const tb = await toBlob(thumb(cv, 120), 'image/jpeg', 0.8);
    const full = Object.assign({}, rec, { img, thumb: tb, w: cv.width, h: cv.height });
    try {
      await tx('readwrite', st => st.put(full));
      const all = await list();
      for (const r of all.slice(KEEP)) await remove(r.id);
    } catch (e) { mem.set(full.id, full); }
    return full;
  }
  async function list() {
    let all = [];
    try { all = (await tx('readonly', st => st.getAll())) || []; } catch (e) { /* 无 IndexedDB 时只有本次会话的卷 */ }
    for (const r of mem.values()) if (!all.some(a => a.id === r.id)) all.push(r);
    return all.sort((a, b) => b.date - a.date);
  }
  async function remove(id) {
    mem.delete(id);
    try { await tx('readwrite', st => st.delete(id)); } catch (e) { /* 忽略 */ }
  }
  function loadImage(blob) {
    if (window.createImageBitmap) return createImageBitmap(blob);
    return new Promise((res, rej) => { const u = URL.createObjectURL(blob), im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = u; });
  }
  function download(blob, name) {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  function fileName(rec) {
    const d = new Date(rec.date), p = v => String(v).padStart(2, '0');
    return `墨灵图-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.jpg`;
  }

  return { compose, store, list, remove, loadImage, download, fileName, toBlob, dateCn, placeName, PW, PH, WORLD_W, WORLD_H };
})();
