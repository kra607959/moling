'use strict';
// 全部音效由 WebAudio 实时合成：笔擦纸的沙沙声、Karplus-Strong 拨弦（类古琴）、FM 钟、雷、浪……

var Sound = (function () {
  let ac = null, master = null, sfx = null, mus = null, verbIn = null, noiseBuf = null;
  let brushGain = null, brushFilt = null;
  let muted = false, key = 1, ambOn = false, tension = false, ambTimer = null, beatT = 0;
  let droneA = null, droneB = null, droneGain = null;
  const ksCache = new Map();
  const lanes = {};
  let laneName = 'operation', pacing = 'sparse';
  const ambientChance = {
    1: { sparse: 0.07, tight: 0.12, close: 0.025 },
    2: { sparse: 0.10, tight: 0.17, close: 0.045 },
    3: { sparse: 0.045, tight: 0.10, close: 0.018 },
    4: { sparse: 0.07, tight: 0.12, close: 0.025 },
  };
  const SCALES = {
    1: { root: 146.83, deg: [0, 2, 4, 7, 9] },   // D 宫
    2: { root: 196.0, deg: [0, 2, 4, 7, 9] },    // G 宫
    3: { root: 164.81, deg: [0, 3, 5, 7, 10] },  // E 羽
    4: { root: 130.81, deg: [0, 3, 5, 7, 10] },  // C 羽
  };
  // 分轨音量：音乐（拨弦旋律、持续音）与音效，各 0..1，存本机
  const vol = { mus: 1, sfx: 1 };
  const BASE = { mus: 0.55, sfx: 0.9 };
  try {
    muted = localStorage.getItem('moling.mute') === '1';
    const v = JSON.parse(localStorage.getItem('moling.vol'));
    if (v) for (const k of ['mus', 'sfx']) if (typeof v[k] === 'number') vol[k] = clamp(v[k], 0, 1);
  } catch (e) { /* 忽略 */ }

  function freqOf(i, k) {
    const S = SCALES[k || key];
    const o = Math.floor(i / 5), d = ((i % 5) + 5) % 5;
    return S.root * Math.pow(2, o + S.deg[d] / 12);
  }

  function impulse(sec, decay) {
    const sr = ac.sampleRate, len = Math.floor(sr * sec);
    const b = ac.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { ac = new AC(); } catch (e) { ac = null; return; }
    master = ac.createGain();
    master.gain.value = muted ? 0 : 0.85;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    comp.connect(master); master.connect(ac.destination);
    sfx = ac.createGain(); sfx.gain.value = BASE.sfx * vol.sfx; sfx.connect(comp);
    mus = ac.createGain(); mus.gain.value = BASE.mus * vol.mus; mus.connect(comp);
    const verb = ac.createConvolver(); verb.buffer = impulse(3.2, 2.4);
    const vg = ac.createGain(); vg.gain.value = 0.42;
    verb.connect(vg); vg.connect(comp);
    verbIn = ac.createGain(); verbIn.connect(verb);
    for (const name of ['warning','operation','reward','music']) {
      const dry = ac.createGain(), wet = ac.createGain();
      dry.connect(name === 'music' ? mus : sfx); wet.connect(verbIn);
      lanes[name] = { dry, wet, until: 0, level: 1 };
    }

    const sr = ac.sampleRate;
    noiseBuf = ac.createBuffer(1, sr * 2, sr);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    // 笔擦纸：循环噪声 → 带通 → 增益（随笔速变化）
    const bs = ac.createBufferSource(); bs.buffer = noiseBuf; bs.loop = true;
    brushFilt = ac.createBiquadFilter(); brushFilt.type = 'bandpass'; brushFilt.frequency.value = 2200; brushFilt.Q.value = 0.7;
    const hs = ac.createBiquadFilter(); hs.type = 'highshelf'; hs.frequency.value = 5000; hs.gain.value = -8;
    brushGain = ac.createGain(); brushGain.gain.value = 0;
    bs.connect(brushFilt); brushFilt.connect(hs); hs.connect(brushGain); brushGain.connect(lanes.operation.dry);
    bs.start();

    // 低沉的持续音
    droneGain = ac.createGain(); droneGain.gain.value = 0;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    droneA = ac.createOscillator(); droneA.type = 'sine';
    droneB = ac.createOscillator(); droneB.type = 'triangle';
    droneA.connect(lp); droneB.connect(lp); lp.connect(droneGain); droneGain.connect(lanes.music.dry);
    const lfo = ac.createOscillator(); lfo.frequency.value = 0.07;
    const lfoG = ac.createGain(); lfoG.gain.value = 0.012;
    lfo.connect(lfoG); lfoG.connect(droneGain.gain);
    droneA.start(); droneB.start(); lfo.start();
    setKey(key);

    ambTimer = setInterval(ambientTick, 250);
  }

  function T() { return ac.currentTime; }

  function route(node, pan, wet, bus) {
    let n = node;
    if (pan && ac.createStereoPanner) {
      const p = ac.createStereoPanner(); p.pan.value = clamp(pan, -1, 1);
      n.connect(p); n = p;
    }
    const lane = lanes[bus === mus ? 'music' : laneName];
    n.connect(lane.dry);
    if (wet) { const w = ac.createGain(); w.gain.value = wet * (bus === mus ? vol.mus : vol.sfx); n.connect(w); w.connect(lane.wet); }
  }
  function lower(name, level, dur) {
    if (!ac) return;
    const l = lanes[name], t = T();
    l.level = t < l.until ? Math.min(l.level, level) : level;
    l.until = Math.max(l.until, t + dur);
    for (const node of [l.dry, l.wet]) {
      const g = node.gain;
      if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(t);
      else { g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); }
      g.linearRampToValueAtTime(l.level, t + 0.015);
      g.setTargetAtTime(1, l.until, 0.18);
    }
  }
  function layered(name, fn) {
    return (...args) => {
      if (!ac) return;
      if (name === 'warning') { lower('operation', 0.36, 0.43); lower('reward', 0.24, 0.45); lower('music', 0.25, 0.58); }
      if (name === 'operation') { lower('reward', 0.63, 0.18); lower('music', 0.68, 0.23); }
      if (name === 'reward') lower('music', 0.74, 0.26);
      const previous = laneName;
      laneName = name;
      try { return fn(...args); } finally { laneName = previous; }
    };
  }

  function gainEnv(t, peak, attack, decay) {
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  function noiseSrc(t, dur) {
    const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
    return s;
  }

  function osc(type, f, t, dur) {
    const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  }

  // Karplus-Strong 拨弦
  function ks(freq) {
    const k = Math.round(freq * 10);
    if (ksCache.has(k)) return ksCache.get(k);
    const sr = ac.sampleRate, len = Math.floor(sr * 2.4);
    const buf = ac.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    const N = Math.max(2, Math.round(sr / freq));
    const line = new Float32Array(N);
    let prev = 0;
    for (let i = 0; i < N; i++) { const v = Math.random() * 2 - 1; prev = prev * 0.55 + v * 0.45; line[i] = prev; }
    let idx = 0;
    const decay = 0.9975;
    for (let i = 0; i < len; i++) {
      const cur = line[idx], nxt = line[(idx + 1) % N];
      line[idx] = (cur + nxt) * 0.5 * decay;
      d[i] = cur;
      idx = (idx + 1) % N;
    }
    for (let i = 0; i < 400; i++) d[len - 1 - i] *= i / 400;
    ksCache.set(k, buf);
    return buf;
  }

  function pluckF(f, vol, pan, wet, when, bus) {
    if (!ac) return;
    const t = (when || 0) + T();
    const s = ac.createBufferSource(); s.buffer = ks(f);
    const g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.3);
    s.connect(g); route(g, pan, wet, bus);
    s.start(t);
  }

  const api = {
    init,
    get ready() { return !!ac; },
    isMuted() { return muted; },
    toggleMute() {
      muted = !muted;
      try { localStorage.setItem('moling.mute', muted ? '1' : '0'); } catch (e) { /* 忽略 */ }
      if (master) master.gain.setTargetAtTime(muted ? 0 : 0.85, T(), 0.05);
      return muted;
    },
    volume(k) { return vol[k]; },
    setVolume(k, v) {
      vol[k] = clamp(v, 0, 1);
      try { localStorage.setItem('moling.vol', JSON.stringify(vol)); } catch (e) { /* 忽略 */ }
      const bus = k === 'mus' ? mus : sfx;
      if (bus) bus.gain.setTargetAtTime(BASE[k] * vol[k], T(), 0.03);
    },
    brush(speed, on) {
      if (!ac) return;
      const v = on ? clamp(speed / 1500, 0.06, 1) * 0.3 : 0;
      brushGain.gain.setTargetAtTime(v, T(), on ? 0.02 : 0.06);
      brushFilt.frequency.setTargetAtTime(1300 + clamp(speed, 0, 2600) * 1.1, T(), 0.05);
    },
    // 连击拨弦：i 为音阶序号
    pluck(i, vol, pan) { if (ac) pluckF(freqOf(i), vol || 0.32, pan, 0.45); },
    // 设置页试听：在所调的音轨上拨一声
    preview(k) { if (ac) pluckF(freqOf(k === 'mus' ? 6 : 9), 0.3, 0, 0.4, 0, k === 'mus' ? mus : sfx); },
    swish(vol, pan) {
      if (!ac) return; const t = T();
      const n = noiseSrc(t, 0.3);
      const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.4;
      f.frequency.setValueAtTime(3400, t); f.frequency.exponentialRampToValueAtTime(600, t + 0.22);
      const g = gainEnv(t, vol || 0.5, 0.012, 0.24);
      n.connect(f); f.connect(g); route(g, pan, 0.15);
    },
    stamp() {
      if (!ac) return; const t = T();
      const o = osc('sine', 140, t, 0.3); o.frequency.exponentialRampToValueAtTime(50, t + 0.2);
      const g = gainEnv(t, 0.6, 0.005, 0.26); o.connect(g); route(g, 0, 0.2);
      const n = noiseSrc(t, 0.06); const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800;
      const g2 = gainEnv(t, 0.25, 0.002, 0.05); n.connect(hp); hp.connect(g2); route(g2, 0, 0);
    },
    bell(i, vol) {
      if (!ac) return; const t = T();
      const f = freqOf(i || 10);
      const car = osc('sine', f, t, 3); const mod = osc('sine', f * 2.76, t, 3);
      const mg = ac.createGain(); mg.gain.setValueAtTime(f * 3, t); mg.gain.exponentialRampToValueAtTime(f * 0.05, t + 1.6);
      mod.connect(mg); mg.connect(car.frequency);
      const g = gainEnv(t, vol || 0.28, 0.004, 2.6); car.connect(g); route(g, 0, 0.7);
    },
    thunder(pan) {
      if (!ac) return; const t = T();
      for (const dt of [0, 0.05, 0.13]) {
        const n = noiseSrc(t + dt, 0.12); const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1400;
        const g = gainEnv(t + dt, 0.45, 0.002, 0.09); n.connect(hp); hp.connect(g); route(g, pan, 0.3);
      }
      const r = noiseSrc(t, 1.8); const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 170;
      const g = gainEnv(t + 0.03, 0.9, 0.05, 1.6); r.connect(lp); lp.connect(g); route(g, pan, 0.4);
    },
    wave(pan) {
      if (!ac) return; const t = T();
      const n = noiseSrc(t, 1.1); const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 3;
      lp.frequency.setValueAtTime(250, t); lp.frequency.exponentialRampToValueAtTime(1700, t + 0.35); lp.frequency.exponentialRampToValueAtTime(300, t + 1.0);
      const g = gainEnv(t, 0.55, 0.15, 0.85); n.connect(lp); lp.connect(g); route(g, pan, 0.4);
    },
    chime() {
      if (!ac) return;
      [10, 12, 14].forEach((d, k) => pluckF(freqOf(d), 0.22, (k - 1) * 0.4, 0.8, k * 0.07));
      api.bell(15, 0.12);
    },
    drip(big) {
      if (!ac) return; const t = T();
      const o = osc('sine', big ? 700 : 1300, t, 0.2); o.frequency.exponentialRampToValueAtTime(big ? 220 : 480, t + 0.1);
      const g = gainEnv(t, big ? 0.45 : 0.25, 0.003, big ? 0.22 : 0.12); o.connect(g); route(g, 0, 0.3);
    },
    hit(pan) {
      if (!ac) return; const t = T();
      const n = noiseSrc(t, 0.07); const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = 5;
      const g = gainEnv(t, 0.3, 0.002, 0.06); n.connect(bp); bp.connect(g); route(g, pan, 0.05);
    },
    clink(pan) {
      if (!ac) return; const t = T();
      for (const f of [1900, 2870]) { const o = osc('triangle', f, t, 0.25); const g = gainEnv(t, 0.09, 0.002, 0.2); o.connect(g); route(g, pan, 0.3); }
    },
    cut(pan) {
      if (!ac) return; const t = T();
      const n = noiseSrc(t, 0.07); const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3200;
      const g = gainEnv(t, 0.22, 0.002, 0.06); n.connect(hp); hp.connect(g); route(g, pan, 0.1);
      const o = osc('sine', 1100, t, 0.1); o.frequency.exponentialRampToValueAtTime(700, t + 0.08);
      const g2 = gainEnv(t, 0.12, 0.002, 0.08); o.connect(g2); route(g2, pan, 0.1);
    },
    warning(kind, pan) {
      if (!ac) return;
      const t = T();
      const [a, b, gain] = kind === 'cut' ? [1450,460,0.33] : kind === 'land' ? [360,105,0.52] :
        kind === 'tideFront' ? [420,540,0.25] : kind === 'tideBack' ? [620,810,0.25] : [590,970,0.38];
      const voice = osc(kind === 'land' ? 'sine' : 'triangle', a, t, 0.23);
      voice.frequency.exponentialRampToValueAtTime(b, t + 0.15);
      const g = gainEnv(t, gain, 0.004, 0.19); voice.connect(g); route(g, pan, 0.07);
    },
    // 墨蟾蓄力：干短的一声「咕」，比出弹的「噗」高、短，提前约半秒
    charge(pan) {
      if (!ac) return; const t = T();
      const o = osc('triangle', 200, t, 0.18); o.frequency.exponentialRampToValueAtTime(340, t + 0.12);
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100;
      const g = gainEnv(t, 0.26, 0.006, 0.13); o.connect(lp); lp.connect(g); route(g, pan, 0.06);
      const n = noiseSrc(t, 0.05); const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 650; bp.Q.value = 2;
      const g2 = gainEnv(t, 0.14, 0.002, 0.04); n.connect(bp); bp.connect(g2); route(g2, pan, 0);
    },
    // 截弹：断弦 —— 高处一拨，音高猛落，加一声脆响（与纸人出手的「cut」分开）
    snap(pan) {
      if (!ac) return; const t = T();
      const o = osc('sawtooth', 1600, t, 0.14); o.frequency.exponentialRampToValueAtTime(240, t + 0.1);
      const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1300; bp.Q.value = 1.1;
      const g = gainEnv(t, 0.17, 0.001, 0.1); o.connect(bp); bp.connect(g); route(g, pan, 0.12);
      const n = noiseSrc(t, 0.03); const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 4500;
      const g2 = gainEnv(t, 0.32, 0.001, 0.025); n.connect(hp); hp.connect(g2); route(g2, pan, 0.05);
      pluckF(freqOf(16), 0.11, pan, 0.25);
    },
    // 群封：一笔封住数妖，合成一声成组的和弦（3–4 / 5–7 / 8 只以上三档），代替一只只各拨一声
    chord(n, pan) {
      if (!ac) return;
      const tier = n >= 8 ? 3 : n >= 5 ? 2 : 1;
      const degs = tier === 3 ? [5, 7, 9, 10, 12, 14] : tier === 2 ? [5, 7, 9, 10, 12] : [5, 7, 10];
      degs.forEach((d, k) => pluckF(freqOf(d), 0.25 - k * 0.012, (k / (degs.length - 1) - 0.5) * 0.7 + (pan || 0) * 0.3, 0.6, k * 0.03));
      if (tier >= 2) api.bell(15, 0.13);
      if (tier >= 3) api.gong(freqOf(0), 0.3, 1.6);
    },
    // 底乐让路：大动静时把音乐（拨弦、持续音）短暂压低，再慢慢回来
    duck(level, dur) {
      lower('music', level, dur);
    },
    spit(pan) {
      if (!ac) return; const t = T();
      const n = noiseSrc(t, 0.16); const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
      const g = gainEnv(t, 0.22, 0.01, 0.13); n.connect(lp); lp.connect(g); route(g, pan, 0.1);
    },
    sealHit() {
      if (!ac) return; const t = T();
      const o = osc('sine', 85, t, 0.6); o.frequency.exponentialRampToValueAtTime(38, t + 0.45);
      const g = gainEnv(t, 0.9, 0.004, 0.55); o.connect(g); route(g, 0, 0.3);
      const n = noiseSrc(t, 0.12); const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
      const g2 = gainEnv(t, 0.35, 0.002, 0.1); n.connect(hp); hp.connect(g2); route(g2, 0, 0.2);
    },
    drop(pan) {
      if (!ac) return; const t = T();
      const o = osc('sine', 1500 + Math.random() * 300, t, 0.12); o.frequency.exponentialRampToValueAtTime(2300, t + 0.07);
      const g = gainEnv(t, 0.07, 0.003, 0.08); o.connect(g); route(g, pan, 0.2);
    },
    roar() {
      if (!ac) return; const t = T();
      const o = osc('sawtooth', 70, t, 1.3); o.frequency.linearRampToValueAtTime(52, t + 1.2);
      const v = osc('sine', 7, t, 1.3); const vg = ac.createGain(); vg.gain.value = 6; v.connect(vg); vg.connect(o.frequency);
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 480;
      const g = gainEnv(t, 0.32, 0.12, 1.1); o.connect(lp); lp.connect(g); route(g, 0, 0.5);
    },
    dry() {
      if (!ac) return; const t = T();
      const n = noiseSrc(t, 0.15); const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 4200; bp.Q.value = 2;
      const g = gainEnv(t, 0.12, 0.01, 0.12); n.connect(bp); bp.connect(g); route(g, 0, 0);
    },
    select() { if (!ac) return; pluckF(freqOf(7), 0.3, -0.2, 0.5); pluckF(freqOf(9), 0.26, 0.2, 0.5, 0.06); },
    arpeggio(up) {
      if (!ac) return;
      const seq = up ? [5, 7, 9, 10, 12, 14] : [9, 7, 5, 4, 2, 0];
      seq.forEach((d, k) => pluckF(freqOf(d), 0.26, (k / 5 - 0.5) * 0.8, 0.6, k * (up ? 0.09 : 0.22)));
    },
    bossDown() { api.thunder(0); api.bell(5, 0.35); setTimeout(() => api.arpeggio(true), 300); },
    // —— 字诀 ——
    gong(f, vol, dur) {
      if (!ac) return; const t = T();
      const car = osc('sine', f, t, dur), mod = osc('sine', f * 1.48, t, dur);
      const mg = ac.createGain(); mg.gain.setValueAtTime(f * 1.4, t); mg.gain.exponentialRampToValueAtTime(f * 0.02, t + dur * 0.8);
      mod.connect(mg); mg.connect(car.frequency);
      const g = gainEnv(t, vol, 0.012, dur); car.connect(g); route(g, 0, 0.85);
    },
    ziReady() {
      if (!ac) return;
      [7, 9, 12].forEach((d, k) => pluckF(freqOf(d), 0.2, (k - 1) * 0.3, 0.7, k * 0.08));
    },
    ziEnter() {
      if (!ac) return; const t = T();
      api.gong(freqOf(0) / 2, 0.42, 3.2);
      // 吸气般的风声
      const n = noiseSrc(t, 0.9); const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2;
      lp.frequency.setValueAtTime(2400, t); lp.frequency.exponentialRampToValueAtTime(260, t + 0.8);
      const g = gainEnv(t, 0.22, 0.25, 0.6); n.connect(lp); lp.connect(g); route(g, 0, 0.5);
    },
    ziFail() {
      if (!ac) return;
      pluckF(freqOf(1) / 2, 0.3, 0, 0.3); api.dry();
    },
    ziCast(key) {
      if (!ac) return; const t = T();
      api.stamp();
      api.gong(freqOf(5) / 2, 0.5, 2.6);
      [0, 4, 7].forEach((d, k) => pluckF(freqOf(d + 7), 0.22, (k - 1) * 0.4, 0.8, 0.12 + k * 0.05));
      const at = 0.45;   // 与效果落下同时
      if (key === 'huo') {
        const n = noiseSrc(t + at, 1.4); const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.8;
        bp.frequency.setValueAtTime(400, t + at); bp.frequency.exponentialRampToValueAtTime(2600, t + at + 0.3); bp.frequency.exponentialRampToValueAtTime(700, t + at + 1.3);
        const g = gainEnv(t + at, 0.7, 0.05, 1.3); n.connect(bp); bp.connect(g); route(g, 0, 0.4);
        for (let i = 0; i < 9; i++) {
          const tt = t + at + 0.1 + Math.random() * 1.1;
          const c = noiseSrc(tt, 0.03); const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
          const cg = gainEnv(tt, 0.18, 0.001, 0.025); c.connect(hp); hp.connect(cg); route(cg, Math.random() * 1.4 - 0.7, 0.1);
        }
      } else if (key === 'shan') {
        const n = noiseSrc(t + at, 2); const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 140;
        const g = gainEnv(t + at, 1.1, 0.08, 1.8); n.connect(lp); lp.connect(g); route(g, 0, 0.4);
        for (let i = 0; i < 3; i++) {
          const o = osc('sine', 90 - i * 12, t + at + i * 0.12, 0.4); o.frequency.exponentialRampToValueAtTime(40, t + at + i * 0.12 + 0.3);
          const og = gainEnv(t + at + i * 0.12, 0.5, 0.004, 0.35); o.connect(og); route(og, (i - 1) * 0.5, 0.3);
        }
      } else if (key === 'shui') {
        const n = noiseSrc(t + at, 2.2); const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2;
        lp.frequency.setValueAtTime(300, t + at); lp.frequency.exponentialRampToValueAtTime(2200, t + at + 0.5); lp.frequency.exponentialRampToValueAtTime(260, t + at + 2);
        const g = gainEnv(t + at, 0.8, 0.2, 1.9); n.connect(lp); lp.connect(g); route(g, 0, 0.6);
      } else {
        for (let i = 0; i < 3; i++) {
          const tt = t + at + i * 0.09;
          const n = noiseSrc(tt, 0.12); const hp = ac.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 3800; hp.Q.value = 1.2;
          const g = gainEnv(tt, 0.3, 0.004, 0.1); n.connect(hp); hp.connect(g); route(g, (i - 1) * 0.6, 0.2);
          pluckF(freqOf(12 + i * 2), 0.18, (i - 1) * 0.6, 0.6, at + i * 0.09);
        }
      }
    },
    gameOver() { api.arpeggio(false); api.bell(0, 0.3); },
    setKey,
    setAmbient(on) {
      ambOn = on;
      if (droneGain) droneGain.gain.setTargetAtTime(on ? 0.03 : 0, T(), 0.8);
    },
    setTension(on) { tension = on; },
    setPacing(which) { pacing = which; },
  };

  function setKey(k) {
    key = SCALES[k] ? k : 1;
    if (!ac) return;
    const f = freqOf(0) / 2;
    droneA.frequency.setTargetAtTime(f, T(), 0.5);
    droneB.frequency.setTargetAtTime(f * 1.5, T(), 0.5);
  }

  function ambientTick() {
    if (!ac || !ambOn) return;
    if (Math.random() < ambientChance[key][tension ? 'tight' : pacing]) {
      const i = Math.floor(Math.random() * 8);
      pluckF(freqOf(i), 0.1 + Math.random() * 0.05, (Math.random() - 0.5) * 1.2, 0.85, 0, mus);
    }
    if (tension) {
      beatT += 0.25;
      if (beatT >= 1.0) {
        beatT = 0;
        const t = T();
        const o = osc('sine', 62, t, 0.3); o.frequency.exponentialRampToValueAtTime(40, t + 0.2);
        const g = gainEnv(t, 0.28, 0.005, 0.22); o.connect(g); route(g, 0, 0.1, mus);
      }
    }
  }

  for (const k of ['warning','charge','sealHit']) if (api[k]) api[k] = layered('warning', api[k]);
  for (const k of ['swish','snap','cut','thunder','clink','wave','hit','drip']) if (api[k]) api[k] = layered('operation', api[k]);
  for (const k of ['pluck','chord','stamp','bell','arpeggio','drop']) api[k] = layered('reward', api[k]);
  return api;
})();
