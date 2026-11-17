'use strict';
// 美术：宣纸、远景、朱印、毛笔笔触、墨妖造型、笔势图标。全部在世界坐标（短边 720）下绘制。

var FONT = '"KaiTi","STKaiti","楷体","Kaiti SC","BiauKai","Noto Serif SC","Songti SC","SimSun",serif';
var INK = '22,20,18';
var CINNABAR = '178,46,40';
var PAPER = '239,230,208';

var Art = (function () {
  function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c; }

  // —— 宣纸与远景 ——
  // scene 0 为素纸（画卷的引首、拖尾）；opts.noVignette 不加暗角（画卷拼接时用）
  function buildPaper(cv, W, H, s, scene, opts) {
    const c = cv.getContext('2d');
    const pw = cv.width, ph = cv.height;
    const R = mulberry32(1234 + scene * 77 + (opts && opts.seed ? opts.seed * 7919 : 0));
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = scene === 3 ? '#e4ddcb' : scene === 2 ? '#ede6d2' : '#f0e7d1';
    c.fillRect(0, 0, pw, ph);
    c.setTransform(s, 0, 0, s, 0, 0);
    // 色块起伏
    for (let i = 0; i < 26; i++) {
      const x = R() * W, y = R() * H, r = 80 + R() * 260;
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      const dark = R() < 0.5;
      g.addColorStop(0, dark ? 'rgba(130,105,70,0.05)' : 'rgba(255,252,240,0.12)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    // 纤维
    const nf = Math.floor(W * H / 170);
    c.lineCap = 'round';
    for (let i = 0; i < nf; i++) {
      const x = R() * W, y = R() * H, len = 4 + R() * 18, a = R() * TAU, cu = (R() - 0.5) * 0.9;
      c.strokeStyle = R() < 0.7 ? `rgba(110,90,60,${0.03 + R() * 0.06})` : `rgba(255,255,248,${0.12 + R() * 0.18})`;
      c.lineWidth = 0.3 + R() * 0.6;
      c.beginPath(); c.moveTo(x, y);
      c.quadraticCurveTo(x + Math.cos(a + cu) * len * 0.5, y + Math.sin(a + cu) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len);
      c.stroke();
    }
    for (let i = 0; i < nf / 4; i++) {
      c.fillStyle = `rgba(90,70,45,${0.04 + R() * 0.08})`;
      c.fillRect(R() * W, R() * H, 0.6 + R(), 0.6 + R());
    }
    if (scene === 1) mountains(c, W, H, R);
    else if (scene === 2) river(c, W, H, R);
    else if (scene === 3) night(c, W, H, R, opts && opts.moonX);
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (opts && opts.noVignette) return;
    // 暗角
    const g = c.createRadialGradient(pw / 2, ph / 2, Math.min(pw, ph) * 0.35, pw / 2, ph / 2, Math.hypot(pw, ph) * 0.62);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, scene === 3 ? 'rgba(30,30,45,0.32)' : 'rgba(70,45,20,0.24)');
    c.fillStyle = g; c.fillRect(0, 0, pw, ph);
  }

  function ridge(R, n, base, amp, rough) {
    let pts = [base + (R() - 0.5) * amp, base + (R() - 0.5) * amp];
    let d = amp;
    while (pts.length < n) {
      const np = [];
      for (let i = 0; i < pts.length - 1; i++) { np.push(pts[i]); np.push((pts[i] + pts[i + 1]) / 2 + (R() - 0.5) * d); }
      np.push(pts[pts.length - 1]);
      pts = np; d *= rough;
    }
    return pts;
  }

  function mountains(c, W, H, R) {
    const layers = [
      { base: H * 0.42, amp: H * 0.55, a: 0.07 },
      { base: H * 0.6, amp: H * 0.42, a: 0.10 },
      { base: H * 0.8, amp: H * 0.3, a: 0.14 },
    ];
    for (const L of layers) {
      const ys = ridge(R, 129, L.base, L.amp, 0.56);
      const n = ys.length;
      let top = Infinity; for (const y of ys) top = Math.min(top, y);
      c.beginPath(); c.moveTo(0, H);
      for (let i = 0; i < n; i++) c.lineTo(i / (n - 1) * W, ys[i]);
      c.lineTo(W, H); c.closePath();
      const g = c.createLinearGradient(0, top, 0, top + H * 0.32);
      g.addColorStop(0, `rgba(40,38,36,${L.a})`);
      g.addColorStop(1, 'rgba(40,38,36,0)');
      c.fillStyle = g; c.fill();
      // 山脊皴笔
      c.strokeStyle = `rgba(30,28,26,${L.a * 1.3})`; c.lineWidth = 1.1;
      c.beginPath();
      for (let i = 0; i < n; i++) { const x = i / (n - 1) * W; i ? c.lineTo(x, ys[i]) : c.moveTo(x, ys[i]); }
      c.stroke();
      for (let i = 2; i < n - 2; i += 3) {
        if (R() < 0.5) continue;
        const x = i / (n - 1) * W, y = ys[i];
        c.strokeStyle = `rgba(30,28,26,${L.a * (0.5 + R() * 0.6)})`; c.lineWidth = 0.6 + R();
        c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + (R() - 0.5) * 14, y + 14, x + (R() - 0.5) * 20, y + 18 + R() * 30); c.stroke();
      }
    }
    // 飞鸟
    for (let i = 0; i < 5; i++) {
      const x = W * (0.12 + R() * 0.3), y = H * (0.12 + R() * 0.12), s = 4 + R() * 4;
      c.strokeStyle = 'rgba(30,28,26,0.28)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(x - s, y - s * 0.3); c.quadraticCurveTo(x - s * 0.4, y - s * 0.6, x, y); c.quadraticCurveTo(x + s * 0.4, y - s * 0.6, x + s, y - s * 0.3); c.stroke();
    }
  }

  function river(c, W, H, R) {
    // 远岸
    const ys = ridge(R, 65, H * 0.16, H * 0.1, 0.5);
    c.beginPath(); c.moveTo(0, 0);
    for (let i = 0; i < ys.length; i++) c.lineTo(i / (ys.length - 1) * W, ys[i]);
    c.lineTo(W, 0); c.closePath();
    const g = c.createLinearGradient(0, 0, 0, H * 0.24);
    g.addColorStop(0, 'rgba(40,38,36,0.02)'); g.addColorStop(1, 'rgba(40,38,36,0.10)');
    c.fillStyle = g; c.fill();
    // 水纹
    c.lineCap = 'round';
    for (let y = H * 0.24; y < H * 1.02; y += 26 + R() * 18) {
      let x = -20 + R() * 40;
      while (x < W + 20) {
        const len = 18 + R() * 46, h = 2 + R() * 4;
        c.strokeStyle = `rgba(40,45,50,${0.05 + R() * 0.08})`; c.lineWidth = 0.8 + R() * 0.8;
        c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + len / 2, y - h, x + len, y); c.stroke();
        x += len + 12 + R() * 60;
      }
    }
    // 芦苇
    for (const side of [0, 1]) {
      const bx = side ? W - 30 : 30;
      for (let i = 0; i < 16; i++) {
        const x0 = bx + (side ? -1 : 1) * R() * 120, y0 = H + 10, hgt = H * (0.18 + R() * 0.2);
        const bend = (side ? -1 : 1) * (10 + R() * 40);
        c.strokeStyle = `rgba(35,33,30,${0.14 + R() * 0.12})`; c.lineWidth = 1 + R() * 1.2;
        c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(x0 + bend * 0.2, y0 - hgt * 0.6, x0 + bend, y0 - hgt); c.stroke();
        if (R() < 0.6) {
          const lx = x0 + bend * 0.15, ly = y0 - hgt * (0.3 + R() * 0.3), ls = (R() < 0.5 ? -1 : 1);
          c.beginPath(); c.moveTo(lx, ly); c.quadraticCurveTo(lx + ls * 22, ly - 18, lx + ls * 40, ly - 6); c.stroke();
        }
      }
    }
    // 渔舟
    const bx = W * (0.6 + R() * 0.2), by = H * 0.21;
    c.fillStyle = 'rgba(30,28,26,0.22)';
    c.beginPath(); c.moveTo(bx - 20, by); c.quadraticCurveTo(bx, by + 7, bx + 20, by - 1); c.lineTo(bx + 14, by + 2); c.quadraticCurveTo(bx, by + 4, bx - 14, by + 2); c.closePath(); c.fill();
    c.fillRect(bx + 3, by - 9, 2, 9);
    c.beginPath(); c.arc(bx + 4, by - 10, 2.5, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(30,28,26,0.18)'; c.lineWidth = 0.8;
    c.beginPath(); c.moveTo(bx + 6, by - 8); c.lineTo(bx + 26, by - 22); c.stroke();
  }

  // moonX：月的横向位置（占宽比例）；false 为无月（画卷里只留一轮）
  function night(c, W, H, R, moonX) {
    c.fillStyle = 'rgba(60,65,85,0.10)'; c.fillRect(0, 0, W, H);
    // 月
    const mx = W * (moonX == null || moonX === false ? 0.8 : moonX), my = H * 0.2, mr = Math.min(W, H) * 0.1;
    if (moonX !== false) {
    const halo = c.createRadialGradient(mx, my, mr * 0.8, mx, my, mr * 3);
    halo.addColorStop(0, 'rgba(255,250,236,0.35)'); halo.addColorStop(1, 'rgba(255,250,236,0)');
    c.fillStyle = halo; c.fillRect(mx - mr * 3, my - mr * 3, mr * 6, mr * 6);
    c.fillStyle = 'rgba(252,248,236,0.75)'; c.beginPath(); c.arc(mx, my, mr, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(60,60,70,0.12)'; c.lineWidth = 1.2; c.stroke();
    }
    // 远山剪影
    const ys = ridge(R, 65, H * 0.9, H * 0.18, 0.55);
    c.beginPath(); c.moveTo(0, H);
    for (let i = 0; i < ys.length; i++) c.lineTo(i / (ys.length - 1) * W, ys[i]);
    c.lineTo(W, H); c.closePath(); c.fillStyle = 'rgba(30,30,40,0.12)'; c.fill();
    // 梅枝
    function branch(x, y, a, len, w, depth) {
      const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
      c.strokeStyle = `rgba(28,26,24,${0.3 + depth * 0.04})`; c.lineWidth = w; c.lineCap = 'round';
      c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo((x + x2) / 2 + (R() - 0.5) * len * 0.3, (y + y2) / 2 + (R() - 0.5) * len * 0.3, x2, y2); c.stroke();
      if (depth > 0) {
        branch(x2, y2, a + (R() - 0.3) * 0.9, len * (0.6 + R() * 0.2), w * 0.62, depth - 1);
        if (R() < 0.7) branch(x2, y2, a - (R() * 0.9 + 0.2), len * (0.45 + R() * 0.2), w * 0.55, depth - 1);
      }
      if (depth < 3 && R() < 0.8) blossom(x2 + (R() - 0.5) * 6, y2 + (R() - 0.5) * 6, 3.5 + R() * 2.5);
    }
    function blossom(x, y, r) {
      c.fillStyle = `rgba(${CINNABAR},${0.35 + R() * 0.25})`;
      for (let k = 0; k < 5; k++) { const a = k / 5 * TAU + R(); c.beginPath(); c.arc(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8, r * 0.6, 0, TAU); c.fill(); }
      c.fillStyle = 'rgba(40,30,20,0.6)'; c.beginPath(); c.arc(x, y, r * 0.25, 0, TAU); c.fill();
    }
    branch(-10, H * 0.2, 0.22, Math.min(W, H) * 0.2, 7, 5);
  }

  // —— 朱印 ——
  function buildSeal(px) {
    const cv = makeCanvas(px, px), c = cv.getContext('2d');
    const R = mulberry32(42);
    c.fillStyle = `rgb(${CINNABAR})`;
    roundRect(c, px * 0.04, px * 0.04, px * 0.92, px * 0.92, px * 0.07); c.fill();
    c.strokeStyle = '#f5e9da'; c.lineWidth = px * 0.035;
    roundRect(c, px * 0.12, px * 0.12, px * 0.76, px * 0.76, px * 0.03); c.stroke();
    c.fillStyle = '#f5e9da'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `bold ${px * 0.32}px ${FONT}`;
    c.fillText('墨', px * 0.67, px * 0.32); c.fillText('靈', px * 0.67, px * 0.68);
    c.fillText('之', px * 0.33, px * 0.32); c.fillText('印', px * 0.33, px * 0.68);
    c.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 420; i++) {
      let x, y;
      if (R() < 0.6) { const e = Math.floor(R() * 4), t = R(); x = e === 0 ? t : e === 1 ? 0.96 - R() * 0.04 : e === 2 ? t : 0.04 + R() * 0.04; y = e === 0 ? 0.04 + R() * 0.04 : e === 1 ? t : e === 2 ? 0.96 - R() * 0.04 : t; }
      else { x = R(); y = R(); }
      c.fillStyle = `rgba(0,0,0,${0.3 + R() * 0.7})`;
      c.beginPath(); c.arc(x * px, y * px, px * (0.004 + R() * 0.012), 0, TAU); c.fill();
    }
    c.globalCompositeOperation = 'source-atop';
    for (let i = 0; i < 60; i++) {
      c.fillStyle = `rgba(255,235,220,${0.05 + R() * 0.1})`;
      c.beginPath(); c.arc(R() * px, R() * px, px * (0.02 + R() * 0.06), 0, TAU); c.fill();
    }
    c.globalCompositeOperation = 'source-over';
    return cv;
  }

  // 名章：一或两个字的方印。bai 为白文（朱底白字），否则朱文（白底朱字朱边）。两字时右起竖排、字形拉长
  function nameSeal(text, px, opts) {
    opts = opts || {};
    const cv = makeCanvas(px, px), c = cv.getContext('2d');
    const R = mulberry32(opts.seed || 7);
    const col = opts.color || CINNABAR, bai = opts.bai !== false;
    const chars = Array.from(text);
    c.fillStyle = `rgb(${col})`; c.strokeStyle = `rgb(${col})`;
    if (bai) { roundRect(c, px * 0.04, px * 0.04, px * 0.92, px * 0.92, px * 0.06); c.fill(); }
    else { c.lineWidth = px * 0.07; roundRect(c, px * 0.08, px * 0.08, px * 0.84, px * 0.84, px * 0.05); c.stroke(); }
    c.fillStyle = bai ? '#f5e9da' : `rgb(${col})`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    if (chars.length === 1) {
      c.font = `bold ${px * 0.66}px ${FONT}`;
      c.fillText(chars[0], px * 0.5, px * 0.54);
    } else {
      c.font = `bold ${px * 0.44}px ${FONT}`;
      chars.slice(0, 2).forEach((ch, i) => {
        c.save(); c.translate(px * (i ? 0.29 : 0.71), px * 0.52); c.scale(0.96, 1.72);
        c.fillText(ch, 0, 0); c.restore();
      });
    }
    // 斑驳
    c.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < px * 2.4; i++) {
      const edge = R() < 0.55, t = R(), e = Math.floor(R() * 4);
      const x = edge ? (e === 0 || e === 2 ? t : e === 1 ? 0.94 + R() * 0.05 : 0.01 + R() * 0.05) : R();
      const y = edge ? (e === 1 || e === 3 ? t : e === 0 ? 0.01 + R() * 0.05 : 0.94 + R() * 0.05) : R();
      c.fillStyle = `rgba(0,0,0,${0.25 + R() * 0.6})`;
      c.beginPath(); c.arc(x * px, y * px, px * (0.004 + R() * 0.014), 0, TAU); c.fill();
    }
    c.globalCompositeOperation = 'source-over';
    return cv;
  }

  // —— 笔匣里的毛笔 ——（x, y 为挂绳顶点，L 为全长；ghost 为未得之笔的淡影）
  const BRUSH_LOOK = {
    jian: { hw: 3.4, col: [122, 86, 54], nodes: 2, tipW: 7, tipL: 0.27, base: [233, 224, 204], mid: 0.45, fer: [58, 42, 30] },
    lang: { hw: 3.0, col: [75, 50, 33], nodes: 0, tipW: 5.2, tipL: 0.28, base: [122, 82, 52], mid: 0.38, fer: [42, 29, 20] },
    yang: { hw: 3.8, col: [169, 135, 90], nodes: 3, tipW: 9.5, tipL: 0.31, base: [244, 238, 226], mid: 0.78, fer: [93, 70, 48] },
    dou:  { hw: 4.4, col: [94, 64, 41], nodes: 1, tipW: 14, tipL: 0.3, base: [52, 46, 40], mid: 0.2, fer: [58, 42, 30], bowl: true },
    tu:   { hw: 3.4, col: [107, 76, 51], nodes: 2, tipW: 7.6, tipL: 0.13, base: [91, 74, 58], mid: 0.25, fer: [47, 34, 25], frayed: true },
  };
  function drawBrush(c, kind, x, y, L, alpha, sway, ghost) {
    const B = BRUSH_LOOK[kind] || BRUSH_LOOK.jian;
    const rgb = (a, k) => ghost ? `rgba(${INK},${0.13 * alpha})` : `rgba(${Math.round(a[0] * k)},${Math.round(a[1] * k)},${Math.round(a[2] * k)},${alpha})`;
    c.save(); c.translate(x, y); c.rotate(sway || 0);
    // 挂绳
    c.strokeStyle = ghost ? `rgba(${INK},${0.15 * alpha})` : `rgba(90,60,40,${0.7 * alpha})`; c.lineWidth = 1;
    c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-4, 5, 0, 10); c.quadraticCurveTo(4, 5, 0, 0); c.stroke();
    const tipL = L * B.tipL, ferL = B.bowl ? 16 : 7, hTop = 10, hLen = L - tipL - ferL - hTop;
    // 笔杆
    const g = c.createLinearGradient(-B.hw, 0, B.hw, 0);
    g.addColorStop(0, rgb(B.col, 0.75)); g.addColorStop(0.4, rgb(B.col, 1.15)); g.addColorStop(1, rgb(B.col, 0.7));
    c.fillStyle = ghost ? rgb(B.col, 1) : g;
    roundRect(c, -B.hw, hTop, B.hw * 2, hLen, B.hw * 0.8); c.fill();
    c.fillStyle = rgb(B.fer, 1); c.fillRect(-B.hw, hTop, B.hw * 2, 5);
    if (!ghost) {
      c.strokeStyle = `rgba(40,25,15,${0.35 * alpha})`; c.lineWidth = 0.8;
      for (let i = 1; i <= B.nodes; i++) { const yy = hTop + hLen * i / (B.nodes + 1); c.beginPath(); c.moveTo(-B.hw, yy); c.lineTo(B.hw, yy); c.stroke(); }
    }
    // 笔斗
    const fy = hTop + hLen;
    c.fillStyle = rgb(B.fer, 1);
    if (B.bowl) {
      c.beginPath(); c.moveTo(-B.hw, fy); c.lineTo(B.hw, fy); c.quadraticCurveTo(B.tipW * 1.15, fy + ferL * 0.4, B.tipW * 1.05, fy + ferL); c.lineTo(-B.tipW * 1.05, fy + ferL); c.quadraticCurveTo(-B.tipW * 1.15, fy + ferL * 0.4, -B.hw, fy); c.fill();
    } else { roundRect(c, -B.hw * 1.2, fy, B.hw * 2.4, ferL, 1.5); c.fill(); }
    // 笔头
    const ty = fy + ferL, tw = B.tipW;
    const tg = c.createLinearGradient(0, ty, 0, ty + tipL);
    if (ghost) { tg.addColorStop(0, rgb(B.base, 1)); tg.addColorStop(1, rgb(B.base, 1)); }
    else { tg.addColorStop(0, rgb(B.base, 1)); tg.addColorStop(B.mid, rgb(B.base, 0.92)); tg.addColorStop(Math.min(1, B.mid + 0.18), `rgba(28,24,20,${alpha})`); tg.addColorStop(1, `rgba(18,16,14,${alpha})`); }
    c.fillStyle = tg;
    if (B.frayed) {
      c.beginPath(); c.moveTo(-tw, ty);
      c.lineTo(tw, ty); c.lineTo(tw * 0.95, ty + tipL * 0.7);
      for (let i = 0; i <= 6; i++) { const xx = tw * 0.95 - i / 6 * tw * 1.9; c.lineTo(xx, ty + tipL * (i % 2 ? 1.05 : 0.8)); }
      c.closePath(); c.fill();
      c.strokeStyle = ghost ? rgb(B.base, 1) : `rgba(28,24,20,${0.8 * alpha})`; c.lineWidth = 0.8;
      for (let i = 0; i < 5; i++) { const xx = -tw * 0.8 + i * tw * 0.4; c.beginPath(); c.moveTo(xx, ty + tipL * 0.8); c.lineTo(xx * 1.35, ty + tipL * 1.4); c.stroke(); }
    } else {
      c.beginPath(); c.moveTo(-tw, ty);
      c.bezierCurveTo(-tw * 1.25, ty + tipL * 0.45, -tw * 0.35, ty + tipL * 0.82, 0, ty + tipL);
      c.bezierCurveTo(tw * 0.35, ty + tipL * 0.82, tw * 1.25, ty + tipL * 0.45, tw, ty);
      c.closePath(); c.fill();
    }
    c.restore();
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
  }

  // —— 毛笔笔触 ——
  // P: [{x,y,w(半宽),l(累计长度),d(干涩 0..1)}]
  function streakNoise(x) { return 0.5 + 0.5 * Math.sin(x * 1.3 + Math.sin(x * 0.71) * 2.1 + Math.sin(x * 0.23) * 1.7); }

  function brush(c, P, alpha, color, seed, taperEnd) {
    const n = P.length;
    if (!n || alpha <= 0.003) return;
    color = color || INK;
    if (n === 1) {
      c.fillStyle = `rgba(${color},${alpha})`;
      c.beginPath(); c.arc(P[0].x, P[0].y, P[0].w, 0, TAU); c.fill();
      return;
    }
    const Lx = new Float32Array(n), Ly = new Float32Array(n), Rx = new Float32Array(n), Ry = new Float32Array(n);
    const te0 = taperEnd === false ? 0.85 : 0.25;
    for (let i = 0; i < n; i++) {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
      let dx = b.x - a.x, dy = b.y - a.y;
      const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const ts = Math.min(1, 0.5 + i * 0.16), te = Math.min(1, te0 + (n - 1 - i) * 0.1);
      const w = P[i].w * Math.min(ts, te);
      Lx[i] = P[i].x - dy * w; Ly[i] = P[i].y + dx * w;
      Rx[i] = P[i].x + dy * w; Ry[i] = P[i].y - dx * w;
    }
    c.beginPath();
    c.moveTo(Lx[0], Ly[0]);
    for (let i = 1; i < n; i++) c.lineTo(Lx[i], Ly[i]);
    for (let i = n - 1; i >= 0; i--) c.lineTo(Rx[i], Ry[i]);
    c.closePath();
    c.fillStyle = `rgba(${color},${alpha})`;
    c.fill();
    c.lineWidth = 1.6; c.strokeStyle = `rgba(${color},${alpha * 0.2})`; c.stroke();
    // 笔头圆起
    c.beginPath(); c.arc(P[0].x, P[0].y, P[0].w * 0.55, 0, TAU); c.fill();
    // 飞白
    const sd = seed || 0;
    c.lineCap = 'round';
    for (let k = 0; k < 4; k++) {
      const f = 0.18 + 0.64 * k / 3;
      c.beginPath();
      let on = false;
      for (let i = 0; i < n; i++) {
        const p = P[i];
        const gap = 0.08 + (p.d || 0) * 0.85;
        const show = streakNoise(p.l * 0.09 + k * 17.3 + sd) < gap;
        if (show) {
          const x = Lx[i] + (Rx[i] - Lx[i]) * f, y = Ly[i] + (Ry[i] - Ly[i]) * f;
          on ? c.lineTo(x, y) : c.moveTo(x, y); on = true;
        } else on = false;
      }
      c.strokeStyle = `rgba(${PAPER},${alpha * 0.62})`;
      c.lineWidth = 0.7 + (k % 2) * 0.6;
      c.stroke();
    }
  }

  // 由折线生成笔触点（用于 Boss 逆笔、蛟身等）
  function strokeFromLine(pts, w) {
    const out = [];
    let l = 0;
    for (let i = 0; i < pts.length; i++) {
      if (i) l += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      out.push({ x: pts[i].x, y: pts[i].y, w: typeof w === 'function' ? w(i, pts.length) : w, l, d: 0.15 });
    }
    return out;
  }

  // —— 墨妖 ——
  function blobPath(c, x, y, r, t, seed, wob) {
    const n = 16;
    c.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = i / n * TAU;
      const k = 1 + wob * (Math.sin(t * 2.3 + seed * 7 + i * 1.9) * 0.5 + Math.sin(seed * 13 + i * 2.7) * 0.5);
      const px = x + Math.cos(a) * r * k, py = y + Math.sin(a) * r * k;
      i ? c.lineTo(px, py) : c.moveTo(px, py);
    }
    c.closePath();
  }

  function inkGrad(c, x, y, r, a) {
    const g = c.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r * 1.2);
    g.addColorStop(0, `rgba(14,13,12,${a})`);
    g.addColorStop(0.7, `rgba(26,24,22,${a * 0.93})`);
    g.addColorStop(1, `rgba(40,38,34,${a * 0.5})`);
    return g;
  }

  function eyes(c, x, y, r, dir, red, gap) {
    const fx = Math.cos(dir), fy = Math.sin(dir);
    const nx = -fy, ny = fx;
    const g = (gap || 0.38) * r;
    const er = Math.max(1.8, r * 0.24);
    for (const s of [-1, 1]) {
      const ex = x + fx * r * 0.35 + nx * g * s, ey = y + fy * r * 0.35 + ny * g * s;
      c.fillStyle = `rgba(${PAPER},0.95)`;
      c.beginPath(); c.arc(ex, ey, er, 0, TAU); c.fill();
      c.fillStyle = red ? `rgb(${CINNABAR})` : 'rgb(10,10,10)';
      c.beginPath(); c.arc(ex + fx * er * 0.35, ey + fy * er * 0.35, er * 0.55, 0, TAU); c.fill();
    }
  }

  function legs(c, x, y, r, dir, t, n, len, speed) {
    const fx = Math.cos(dir), fy = Math.sin(dir), nx = -fy, ny = fx;
    c.strokeStyle = `rgba(${INK},0.75)`; c.lineWidth = Math.max(1, r * 0.12); c.lineCap = 'round';
    c.beginPath();
    for (let i = 0; i < n; i++) {
      const along = (i / (n - 1) - 0.5) * r * 1.1;
      const sw = Math.sin(t * speed + i * 2.1) * 0.45;
      for (const s of [-1, 1]) {
        const bx = x + fx * along + nx * r * 0.7 * s, by = y + fy * along + ny * r * 0.7 * s;
        const a = Math.atan2(ny * s, nx * s) + sw * s;
        c.moveTo(bx, by);
        c.lineTo(bx + Math.cos(a) * len, by + Math.sin(a) * len);
      }
    }
    c.stroke();
  }

  function flashOver(c, e, path) {
    if (e.flash > 0) { path(); c.fillStyle = `rgba(${CINNABAR},${e.flash * 0.75})`; c.fill(); }
  }

  function drawEnemy(c, e, t) {
    const x = e.x, y = e.y, r = e.r, d = e.dir;
    switch (e.type) {
      case 'du': {
        legs(c, x, y, r, d, e.t, 3, r * 0.6, 14);
        blobPath(c, x, y, r, e.t, e.seed, 0.1); c.fillStyle = inkGrad(c, x, y, r, 0.95); c.fill();
        flashOver(c, e, () => blobPath(c, x, y, r, e.t, e.seed, 0.1));
        eyes(c, x, y, r, d, false, 0.42);
        break;
      }
      case 'e': {
        const flap = 0.35 + 0.65 * Math.abs(Math.sin(e.t * 13 + e.seed * 9));
        const fx = Math.cos(d), fy = Math.sin(d), nx = -fy, ny = fx;
        for (const s of [-1, 1]) {
          c.save(); c.translate(x - fx * 2, y - fy * 2); c.rotate(Math.atan2(ny * s, nx * s) - s * 0.35);
          c.scale(1, flap);
          c.beginPath(); c.ellipse(r * 0.95, 0, r * 1.05, r * 0.7, 0, 0, TAU);
          c.fillStyle = 'rgba(40,38,36,0.42)'; c.fill();
          c.strokeStyle = 'rgba(20,18,16,0.6)'; c.lineWidth = 1; c.stroke();
          c.beginPath(); c.arc(r * 1.1, 0, r * 0.22, 0, TAU); c.fillStyle = `rgba(${PAPER},0.7)`; c.fill();
          c.restore();
        }
        c.beginPath(); c.ellipse(x, y, r * 0.75, r * 0.42, d, 0, TAU); c.fillStyle = inkGrad(c, x, y, r * 0.7, 0.95); c.fill();
        flashOver(c, e, () => { c.beginPath(); c.ellipse(x, y, r * 0.8, r * 0.5, d, 0, TAU); });
        c.strokeStyle = `rgba(${INK},0.7)`; c.lineWidth = 0.8;
        c.beginPath();
        for (const s of [-1, 1]) { c.moveTo(x + fx * r * 0.6, y + fy * r * 0.6); c.quadraticCurveTo(x + fx * r * 1.2 + nx * s * r * 0.2, y + fy * r * 1.2 + ny * s * r * 0.2, x + fx * r * 1.3 + nx * s * r * 0.6, y + fy * r * 1.3 + ny * s * r * 0.6); }
        c.stroke();
        break;
      }
      case 'jia': {
        legs(c, x, y, r * 0.85, d, e.t, 3, r * 0.5, 8);
        c.beginPath(); c.ellipse(x, y, r * 1.08, r * 0.86, d, 0, TAU);
        c.fillStyle = inkGrad(c, x, y, r, 1); c.fill();
        flashOver(c, e, () => { c.beginPath(); c.ellipse(x, y, r * 1.08, r * 0.86, d, 0, TAU); });
        const fx = Math.cos(d), fy = Math.sin(d);
        c.strokeStyle = `rgba(${PAPER},0.55)`; c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(x + fx * r * 0.3, y + fy * r * 0.3); c.lineTo(x - fx * r * 0.95, y - fy * r * 0.95); c.stroke();
        c.strokeStyle = `rgba(${PAPER},0.32)`; c.lineWidth = 2;
        c.beginPath(); c.ellipse(x, y, r * 0.75, r * 0.55, d, Math.PI * 1.15, Math.PI * 1.55); c.stroke();
        // 裂纹
        const dmg = 1 - e.hp / e.maxHp;
        if (dmg > 0) {
          c.strokeStyle = `rgba(${PAPER},0.6)`; c.lineWidth = 0.9; c.beginPath();
          for (let i = 0; i < Math.ceil(dmg * 4); i++) {
            const a = e.seed * 10 + i * 2.1;
            c.moveTo(x, y); c.lineTo(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5); c.lineTo(x + Math.cos(a + 0.4) * r * 0.85, y + Math.sin(a + 0.4) * r * 0.85);
          }
          c.stroke();
        }
        c.beginPath(); c.arc(x + fx * r * 0.95, y + fy * r * 0.95, r * 0.38, 0, TAU); c.fillStyle = `rgba(${INK},1)`; c.fill();
        eyes(c, x + fx * r * 0.6, y + fy * r * 0.6, r * 0.55, d, true, 0.5);
        break;
      }
      case 'chan': {
        const puff = e.charging ? 1 + 0.15 * Math.sin(e.t * 30) * 0.5 + 0.12 : 1;
        const rr2 = r * puff;
        blobPath(c, x, y, rr2, e.t * 0.6, e.seed, 0.06);
        c.fillStyle = inkGrad(c, x, y, rr2, 0.95); c.fill();
        flashOver(c, e, () => blobPath(c, x, y, rr2, e.t * 0.6, e.seed, 0.06));
        const fx = Math.cos(d), fy = Math.sin(d), nx = -fy, ny = fx;
        for (const s of [-1, 1]) {
          const ex = x + fx * r * 0.45 + nx * r * 0.55 * s, ey = y + fy * r * 0.45 + ny * r * 0.55 * s;
          c.fillStyle = `rgba(${INK},1)`; c.beginPath(); c.arc(ex, ey, r * 0.36, 0, TAU); c.fill();
          c.fillStyle = `rgba(${PAPER},0.95)`; c.beginPath(); c.arc(ex + fx, ey + fy, r * 0.22, 0, TAU); c.fill();
          c.fillStyle = '#111'; c.beginPath(); c.ellipse(ex + fx * 2, ey + fy * 2, r * 0.07, r * 0.16, d, 0, TAU); c.fill();
        }
        c.strokeStyle = `rgba(${PAPER},0.6)`; c.lineWidth = 1.3;
        c.beginPath();
        const mx = x + fx * r * 0.8, my = y + fy * r * 0.8;
        if (e.charging) { c.ellipse(mx, my, r * 0.18, r * 0.42, d, 0, TAU); c.fillStyle = `rgba(${CINNABAR},0.8)`; c.fill(); }
        else { c.moveTo(mx + nx * r * 0.45, my + ny * r * 0.45); c.quadraticCurveTo(mx + fx * 3, my + fy * 3, mx - nx * r * 0.45, my - ny * r * 0.45); c.stroke(); }
        // 斑点
        c.fillStyle = `rgba(${PAPER},0.18)`;
        for (let i = 0; i < 4; i++) { const a = e.seed * 20 + i * 1.7; c.beginPath(); c.arc(x - fx * r * 0.3 + Math.cos(a) * r * 0.45, y - fy * r * 0.3 + Math.sin(a) * r * 0.45, r * 0.1, 0, TAU); c.fill(); }
        break;
      }
      case 'xu': {
        const fl = 0.45 + 0.2 * Math.sin(e.t * 5 + e.seed * 9) + 0.08 * Math.sin(e.t * 17);
        const fx = Math.cos(d), fy = Math.sin(d), nx = -fy, ny = fx;
        c.beginPath();
        const n = 18;
        for (let i = 0; i <= n; i++) {
          const a = d + Math.PI * 0.5 + i / n * Math.PI;
          c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        }
        for (let i = 0; i <= 6; i++) {
          const s = 1 - i / 3;
          const back = r * (1.3 + 0.3 * Math.sin(e.t * 6 + i * 1.6));
          c.lineTo(x - fx * back * (i % 2 ? 0.75 : 1) + nx * r * s, y - fy * back * (i % 2 ? 0.75 : 1) + ny * r * s);
        }
        c.closePath();
        const g = c.createRadialGradient(x, y, 0, x, y, r * 1.6);
        g.addColorStop(0, `rgba(30,30,40,${fl})`); g.addColorStop(1, 'rgba(30,30,40,0)');
        c.fillStyle = g; c.fill();
        c.setLineDash([3, 4]); c.strokeStyle = `rgba(30,30,40,${fl * 0.8})`; c.lineWidth = 1; c.stroke(); c.setLineDash([]);
        if (e.flash > 0) { c.fillStyle = `rgba(${CINNABAR},${e.flash * 0.6})`; c.fill(); }
        for (const s of [-1, 1]) {
          const ex = x + fx * r * 0.3 + nx * r * 0.35 * s, ey = y + fy * r * 0.3 + ny * r * 0.35 * s;
          const eg = c.createRadialGradient(ex, ey, 0, ex, ey, r * 0.45);
          eg.addColorStop(0, `rgba(${CINNABAR},0.95)`); eg.addColorStop(1, `rgba(${CINNABAR},0)`);
          c.fillStyle = eg; c.beginPath(); c.arc(ex, ey, r * 0.45, 0, TAU); c.fill();
        }
        break;
      }
      case 'lie': {
        const j = Math.sin(e.t * 40) * 0.6;
        blobPath(c, x + j, y, r, e.t, e.seed, 0.12);
        c.fillStyle = inkGrad(c, x, y, r, 0.95); c.fill();
        flashOver(c, e, () => blobPath(c, x + j, y, r, e.t, e.seed, 0.12));
        c.strokeStyle = `rgba(${PAPER},0.75)`; c.lineWidth = 1.1; c.beginPath();
        for (let k = 0; k < 3; k++) {
          const a = k / 3 * TAU + e.seed * 5;
          c.moveTo(x, y);
          c.lineTo(x + Math.cos(a + 0.3) * r * 0.45, y + Math.sin(a + 0.3) * r * 0.45);
          c.lineTo(x + Math.cos(a - 0.1) * r * 0.95, y + Math.sin(a - 0.1) * r * 0.95);
        }
        c.stroke();
        eyes(c, x, y, r * 0.8, d, true, 0.45);
        break;
      }
      case 'mu': drawMother(c, e, t); break;
      case 'yan': drawYan(c, e, t); break;
      default: break;
    }
  }

  function drawMother(c, e) {
    const x = e.x, y = e.y, r = e.r * (1 + 0.04 * Math.sin(e.t * 2.4));
    // 足
    c.strokeStyle = `rgba(${INK},0.7)`; c.lineWidth = 2.4; c.lineCap = 'round';
    c.beginPath();
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * TAU + e.seed;
      const sw = Math.sin(e.t * 4 + i * 1.3) * 0.25;
      const bx = x + Math.cos(a) * r * 0.9, by = y + Math.sin(a) * r * 0.9;
      c.moveTo(bx, by);
      c.quadraticCurveTo(bx + Math.cos(a + sw) * r * 0.35, by + Math.sin(a + sw) * r * 0.35, bx + Math.cos(a + sw * 2 + 0.3) * r * 0.55, by + Math.sin(a + sw * 2 + 0.3) * r * 0.55);
    }
    c.stroke();
    blobPath(c, x, y, r, e.t * 0.7, e.seed, 0.07);
    c.fillStyle = inkGrad(c, x, y, r, 0.97); c.fill();
    flashOver(c, e, () => blobPath(c, x, y, r, e.t * 0.7, e.seed, 0.07));
    // 卵
    for (let i = 0; i < 7; i++) {
      const a = i * 2.4 + e.seed * 3, rr2 = r * (0.25 + (i % 3) * 0.17);
      const pul = 0.18 + 0.12 * Math.sin(e.t * 3 + i);
      c.fillStyle = `rgba(${PAPER},${pul})`;
      c.beginPath(); c.ellipse(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2, r * 0.1, r * 0.075, a, 0, TAU); c.fill();
    }
    // 眼
    for (let i = 0; i < 4; i++) {
      const a = e.dir + (i - 1.5) * 0.32;
      const ex = x + Math.cos(a) * r * 0.62, ey = y + Math.sin(a) * r * 0.62;
      c.fillStyle = `rgba(${PAPER},0.9)`; c.beginPath(); c.arc(ex, ey, r * 0.085, 0, TAU); c.fill();
      c.fillStyle = `rgb(${CINNABAR})`; c.beginPath(); c.arc(ex, ey, r * 0.05, 0, TAU); c.fill();
    }
    if (e.charging) {
      const fx = Math.cos(e.dir), fy = Math.sin(e.dir);
      c.fillStyle = `rgba(${CINNABAR},0.7)`; c.beginPath(); c.arc(x + fx * r * 0.88, y + fy * r * 0.88, r * 0.16, 0, TAU); c.fill();
    }
    // 墨壳
    if (e.shell) {
      c.lineWidth = 7; c.strokeStyle = 'rgba(12,12,12,0.9)';
      c.beginPath(); c.arc(x, y, r + 8, 0, TAU); c.stroke();
      c.lineWidth = 2; c.strokeStyle = `rgba(${PAPER},0.45)`;
      c.beginPath(); c.arc(x, y, r + 8, -2.4 + e.t * 0.3, -1.7 + e.t * 0.3); c.stroke();
      c.beginPath(); c.arc(x, y, r + 8, 0.6 + e.t * 0.3, 0.9 + e.t * 0.3); c.stroke();
    } else {
      c.lineWidth = 4; c.strokeStyle = 'rgba(12,12,12,0.45)';
      for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + e.seed; c.beginPath(); c.arc(x, y, r + 9, a, a + 0.5); c.stroke(); }
    }
  }

  function drawYan(c, e) {
    const a = e.alpha == null ? 1 : e.alpha;
    if (a <= 0.01) return;
    const x = e.x, y = e.y, r = e.r;
    c.save(); c.globalAlpha = a;
    // 墨晕
    const halo = c.createRadialGradient(x, y, r * 0.6, x, y, r * 2.1);
    halo.addColorStop(0, 'rgba(20,18,16,0.35)'); halo.addColorStop(1, 'rgba(20,18,16,0)');
    c.fillStyle = halo; c.beginPath(); c.arc(x, y, r * 2.1, 0, TAU); c.fill();
    // 面
    c.beginPath(); c.ellipse(x, y, r, r * 1.15, 0, 0, TAU);
    c.fillStyle = inkGrad(c, x, y, r, 1); c.fill();
    flashOver(c, e, () => { c.beginPath(); c.ellipse(x, y, r, r * 1.15, 0, 0, TAU); });
    // 朱纹
    c.strokeStyle = `rgba(${CINNABAR},0.85)`; c.lineWidth = 3; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x, y - r * 1.05); c.quadraticCurveTo(x - 6, y - r * 0.6, x, y - r * 0.3); c.stroke();
    for (const s of [-1, 1]) {
      c.beginPath(); c.moveTo(x + s * r * 0.75, y + r * 0.05); c.quadraticCurveTo(x + s * r * 0.55, y + r * 0.35, x + s * r * 0.7, y + r * 0.55); c.stroke();
    }
    // 眼
    const look = Math.sin(e.t * 1.3) * 3;
    c.fillStyle = `rgba(${PAPER},0.95)`;
    for (const s of [-1, 1]) {
      c.beginPath();
      c.moveTo(x + s * r * 0.15, y - r * 0.12);
      c.quadraticCurveTo(x + s * r * 0.45, y - r * 0.42, x + s * r * 0.72, y - r * 0.28);
      c.quadraticCurveTo(x + s * r * 0.45, y - r * 0.05, x + s * r * 0.15, y - r * 0.12);
      c.fill();
      c.fillStyle = `rgb(${CINNABAR})`; c.beginPath(); c.arc(x + s * r * 0.45 + look, y - r * 0.22, r * 0.07, 0, TAU); c.fill();
      c.fillStyle = `rgba(${PAPER},0.95)`;
    }
    // 口
    c.beginPath();
    c.moveTo(x - r * 0.45, y + r * 0.42);
    c.quadraticCurveTo(x, y + r * (0.62 + 0.08 * Math.sin(e.t * 2)), x + r * 0.45, y + r * 0.42);
    c.quadraticCurveTo(x, y + r * 0.78, x - r * 0.45, y + r * 0.42);
    c.fill();
    // 裂
    if (e.phase >= 2) {
      c.strokeStyle = `rgba(${PAPER},0.7)`; c.lineWidth = 1.4; c.beginPath();
      c.moveTo(x + r * 0.2, y - r * 1.1); c.lineTo(x + r * 0.05, y - r * 0.7); c.lineTo(x + r * 0.25, y - r * 0.45);
      if (e.phase >= 3) { c.moveTo(x - r * 0.9, y + r * 0.2); c.lineTo(x - r * 0.55, y + r * 0.25); c.lineTo(x - r * 0.5, y + r * 0.6); }
      c.stroke();
    }
    c.restore();
  }

  // 蛟：一串节段
  function drawChain(c, ch, t) {
    const segs = ch.segs;
    if (!segs.length) return;
    const pts = segs.map((s, i) => ({ x: s.x, y: s.y, w: s.r * 0.98, l: i * 14, d: 0.25 }));
    // 尾梢
    const last = segs[segs.length - 1], prev = segs[segs.length - 2] || segs[0];
    const dx = last.x - prev.x, dy = last.y - prev.y, dl = Math.hypot(dx, dy) || 1;
    pts.push({ x: last.x + dx / dl * last.r * 1.6, y: last.y + dy / dl * last.r * 1.6, w: last.r * 0.3, l: segs.length * 14, d: 0.6 });
    brush(c, pts, 0.96, INK, ch.seed || 0);
    // 鳞
    for (let i = 1; i < segs.length; i++) {
      const s = segs[i];
      const a = s.dir || 0;
      c.strokeStyle = `rgba(${PAPER},0.35)`; c.lineWidth = 1;
      c.beginPath(); c.arc(s.x, s.y, s.r * 0.6, a + Math.PI * 0.6, a + Math.PI * 1.4); c.stroke();
      if (s.flash > 0) { c.fillStyle = `rgba(${CINNABAR},${s.flash * 0.75})`; c.beginPath(); c.arc(s.x, s.y, s.r, 0, TAU); c.fill(); }
      // 背鳍
      if (i % 2 === 0) {
        const nx = -Math.sin(a), ny = Math.cos(a);
        c.fillStyle = `rgba(${INK},0.8)`;
        c.beginPath(); c.moveTo(s.x + nx * s.r * 0.8, s.y + ny * s.r * 0.8);
        c.lineTo(s.x + nx * s.r * 1.5 - Math.cos(a) * s.r * 0.6, s.y + ny * s.r * 1.5 - Math.sin(a) * s.r * 0.6);
        c.lineTo(s.x + nx * s.r * 0.6 - Math.cos(a) * s.r * 0.9, s.y + ny * s.r * 0.6 - Math.sin(a) * s.r * 0.9);
        c.fill();
      }
    }
    // 头
    const h = segs[0];
    const a = ch.head;
    const fx = Math.cos(a), fy = Math.sin(a), nx = -fy, ny = fx;
    if (ch.lunge === 1) {
      const g = c.createRadialGradient(h.x, h.y, 0, h.x, h.y, h.r * 3);
      g.addColorStop(0, `rgba(${CINNABAR},0.5)`); g.addColorStop(1, `rgba(${CINNABAR},0)`);
      c.fillStyle = g; c.beginPath(); c.arc(h.x, h.y, h.r * 3, 0, TAU); c.fill();
    }
    c.beginPath(); c.ellipse(h.x + fx * h.r * 0.3, h.y + fy * h.r * 0.3, h.r * 1.35, h.r * 1.0, a, 0, TAU);
    c.fillStyle = inkGrad(c, h.x, h.y, h.r * 1.2, 1); c.fill();
    if (h.flash > 0) { c.fillStyle = `rgba(${CINNABAR},${h.flash * 0.75})`; c.fill(); }
    // 角
    c.strokeStyle = `rgba(${INK},0.95)`; c.lineWidth = 2.4; c.lineCap = 'round';
    for (const s of [-1, 1]) {
      c.beginPath();
      c.moveTo(h.x + nx * h.r * 0.5 * s, h.y + ny * h.r * 0.5 * s);
      c.quadraticCurveTo(h.x - fx * h.r * 1.2 + nx * h.r * 1.0 * s, h.y - fy * h.r * 1.2 + ny * h.r * 1.0 * s, h.x - fx * h.r * 2.2 + nx * h.r * 0.7 * s, h.y - fy * h.r * 2.2 + ny * h.r * 0.7 * s);
      c.stroke();
    }
    // 须
    c.lineWidth = 1.1; c.strokeStyle = `rgba(${INK},0.75)`;
    for (const s of [-1, 1]) {
      const bx = h.x + fx * h.r * 1.4 + nx * h.r * 0.4 * s, by = h.y + fy * h.r * 1.4 + ny * h.r * 0.4 * s;
      const w1 = Math.sin(t * 4 + s) * 10;
      c.beginPath(); c.moveTo(bx, by);
      c.bezierCurveTo(bx + nx * 14 * s - fx * 8, by + ny * 14 * s - fy * 8, bx + nx * (20 + w1) * s - fx * 26, by + ny * (20 + w1) * s - fy * 26, bx + nx * (10 - w1) * s - fx * 46, by + ny * (10 - w1) * s - fy * 46);
      c.stroke();
    }
    eyes(c, h.x + fx * h.r * 0.2, h.y + fy * h.r * 0.2, h.r * 0.9, a, true, 0.55);
  }

  function drawShot(c, s) {
    const a = Math.atan2(s.vy, s.vx);
    c.save(); c.translate(s.x, s.y); c.rotate(a);
    c.fillStyle = `rgba(${INK},0.92)`;
    c.beginPath(); c.arc(0, 0, s.r, -Math.PI / 2, Math.PI / 2); c.quadraticCurveTo(-s.r * 2.6, s.r * 0.2, -s.r * 3.2, 0); c.quadraticCurveTo(-s.r * 2.6, -s.r * 0.2, 0, -s.r); c.fill();
    c.fillStyle = `rgba(${CINNABAR},0.6)`; c.beginPath(); c.arc(s.r * 0.15, 0, s.r * 0.4, 0, TAU); c.fill();
    c.restore();
  }

  function drawDrop(c, d, t) {
    const life = d.life - d.t;
    if (life < 1.5 && Math.sin(t * 20) > 0) return;
    const bob = Math.sin(t * 4 + d.x) * 1.5;
    const x = d.x, y = d.y + bob;
    c.fillStyle = `rgba(${INK},0.88)`;
    c.beginPath(); c.moveTo(x, y - 8); c.quadraticCurveTo(x + 5.5, y - 1, x + 4.5, y + 2.5); c.arc(x, y + 2.5, 4.5, 0, Math.PI); c.quadraticCurveTo(x - 5.5, y - 1, x, y - 8); c.fill();
    c.fillStyle = `rgba(${PAPER},0.8)`; c.beginPath(); c.arc(x - 1.6, y + 1, 1.3, 0, TAU); c.fill();
  }

  // —— 笔势图标（图例、提示用）——
  function iconPath(kind, n) {
    const pts = [];
    n = n || 40;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      let x = 0, y = 0;
      switch (kind) {
        case 'zhan': x = -1 + 2 * t; y = 0.5 - t; break;
        case 'feng': { const a = -Math.PI / 2 + t * TAU * 1.04; x = Math.cos(a) * 0.85; y = Math.sin(a) * 0.85; break; }
        case 'lei': { const V = [[-0.9, -0.8], [0.6, -0.35], [-0.6, 0.35], [0.9, 0.85]]; const s = t * 3, k = Math.min(2, Math.floor(s)), f = s - k; x = lerp(V[k][0], V[k + 1][0], f); y = lerp(V[k][1], V[k + 1][1], f); break; }
        case 'lang': x = -1 + 2 * t; y = Math.sin(t * TAU * 1.5) * 0.45; break;
        case 'zhen': { const V = [[0, -0.85], [0.85, 0.65], [-0.85, 0.65], [0, -0.85]]; const s = t * 3, k = Math.min(2, Math.floor(s)), f = s - k; x = lerp(V[k][0], V[k + 1][0], f); y = lerp(V[k][1], V[k + 1][1], f); break; }
        case 'brush': x = -1 + 2 * t; y = Math.sin(t * Math.PI) * -0.5 + 0.2; break;
        default: break;
      }
      pts.push({ x, y });
    }
    return pts;
  }

  function drawIcon(c, kind, x, y, size, prog, alpha, color) {
    const col = color || INK;
    if (kind === 'dian' || kind === 'drop') {
      const r = size * (kind === 'dian' ? 0.28 + 0.12 * Math.min(1, (prog == null ? 1 : prog) * 1.5) : 0.3);
      c.fillStyle = `rgba(${col},${alpha})`;
      if (kind === 'drop') {
        c.beginPath(); c.moveTo(x, y - r * 1.7); c.quadraticCurveTo(x + r * 1.2, y - r * 0.2, x + r, y + r * 0.5); c.arc(x, y + r * 0.5, r, 0, Math.PI); c.quadraticCurveTo(x - r * 1.2, y - r * 0.2, x, y - r * 1.7); c.fill();
      } else { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
      return;
    }
    const P = iconPath(kind, 48);
    const m = Math.max(2, Math.floor(P.length * (prog == null ? 1 : prog)));
    const pts = [];
    for (let i = 0; i < m; i++) pts.push({ x: x + P[i].x * size * 0.5, y: y + P[i].y * size * 0.5, w: Math.max(0.8, size * 0.06), l: i * 3, d: 0 });
    brush(c, pts, alpha, col, 0);
  }

  return { makeCanvas, buildPaper, buildSeal, nameSeal, drawBrush, brush, strokeFromLine, drawEnemy, drawChain, drawShot, drawDrop, drawIcon, blobPath, roundRect, inkGrad };
})();
