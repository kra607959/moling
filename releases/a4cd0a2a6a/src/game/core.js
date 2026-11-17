'use strict';
// 墨灵 · 游戏 1/13 · core：画布、尺寸单位与全局状态；最好成绩、设置、印谱与笔匣、震动
//
// 游戏主体分成 src/game/ 下的这些文件，按 index.html 里的顺序载入：
//   core → log → run → entity → stroke → zi → boss → update → draw → drawfx → hud → screens → input
// 它们是普通脚本（不是模块），顶层的 const / let / function 同在一个全局作用域里，彼此直接引用。
// 约定：
//   - 文件顶层只做声明与初始化，不要调用排在后面的文件里的函数（启动放在最后的 input.js）；
//   - 新起的顶层名字不要与 util.js、data.js 等已有的全局重名，也不要占 window 上的名字
//     （screen 是个例外：浏览器允许覆盖，别处也不用 window.screen）。
//   tests/load.test.mjs 会按顺序载入全部脚本、走一遍各个界面，查重名、查越界调用。
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
const MU_WIND = 1.3;          // 蠹母吐墨前张口蓄墨的时长（秒）：前摇与去路预示

let G = null;             // 当前一局
let screen = 'title';     // title | play | dying | clear | choose | pause | over | victory
let frozen = false;
const UI = { t: 0, titleT: 0, buttons: [], shake: 0, flash: 0, flashCol: '255,255,250', mouse: { x: -99, y: -99, in: false, isMouse: true }, toasts: [], sliders: [], slide: null, gal: null, view: null, back: 'title', drag: null };
const META = { gallery: 1, scroll: 1, yinpu: 1, settings: 1, vows: 1 };

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
function recordBest(won) {
  if (!G || DEBUG) return;
  if (G.vows.length) {
    const key = G.vows.join('+'), old = profile.vowBest[key];
    const next = { score: Math.max(old?.score || 0, G.score), floor: Math.max(old?.floor || 0, G.floor), won: !!(old?.won || won) };
    if (!old || next.score !== old.score || next.floor !== old.floor || next.won !== old.won) {
      profile.vowBest[key] = next; saveProfile();
    }
    return;
  }
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
  const base = { seals: {}, brush: 'jian', kills: 0, runs: 0, vowBest: {} };
  try {
    const p = JSON.parse(localStorage.getItem(PROFILE_KEY));
    if (p && typeof p === 'object') return Object.assign(base, p, { seals: Object.assign({}, p.seals), vowBest: Object.assign({}, p.vowBest) });
  } catch (e) { /* 忽略 */ }
  return base;
}
let profile = loadProfile();
function saveProfile() { try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch (e) { /* 忽略 */ } }
const brushOpen = id => !!BRUSHES[id] && (!BRUSHES[id].seal || !!profile.seals[BRUSHES[id].seal]);
const sealCount = () => SEALS.filter(S => profile.seals[S.id]).length;
const vowsOpen = () => !!profile.seals.fuyan;   // v0.5 已斩墨魇的旧存档也能直接开启
const flowOpen = () => !!profile.seals.liuhen;
const vowCleared = id => Object.entries(profile.vowBest).some(([key, row]) => row.won && key.split('+').includes(id));
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
