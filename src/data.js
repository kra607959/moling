'use strict';
// 静态数据：墨妖、笔法、心得（升级）、卷与层的编排。

var CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
function cnNum(n) {
  if (n <= 10) return CN[n];
  if (n < 20) return '十' + CN[n - 10];
  if (n < 100) return CN[Math.floor(n / 10)] + '十' + (n % 10 ? CN[n % 10] : '');
  return String(n);
}

var ENEMY = {
  du:   { name: '墨蠹', r: 9,  hp: 1, speed: 38, value: 10, drops: 1, cost: 0.8 },
  e:    { name: '墨蛾', r: 10, hp: 1, speed: 64, value: 15, drops: 1, cost: 1.2 },
  chan: { name: '墨蟾', r: 15, hp: 2, speed: 42, value: 30, drops: 2, cost: 2.5 },
  jia:  { name: '墨甲', r: 16, hp: 4, speed: 24, value: 40, drops: 3, cost: 3 },
  xu:   { name: '虚影', r: 13, hp: 2, speed: 34, value: 35, drops: 2, cost: 2.5 },
  lie:  { name: '裂妖', r: 14, hp: 3, speed: 30, value: 30, drops: 2, cost: 3 },
};

// 笔法（图鉴 / 暂停页说明）
var TECH = {
  zhan: { ch: '斩', shape: '直线', desc: '一笔直线，沿线追加一击' },
  feng: { ch: '封', shape: '画圈', desc: '圈中墨妖受重创；虚影亦可封' },
  dian: { ch: '点', shape: '轻点', desc: '轻点落墨；按住不动，墨晕越大越重' },
  lei:  { ch: '雷', shape: '折线', desc: '锯齿折线，召雷劈向附近墨妖' },
  lang: { ch: '浪', shape: '波浪', desc: '起伏波浪，推开墨妖、洗去墨弹' },
  zhen: { ch: '镇', shape: '三角', desc: '闭合三角成结界：阻弹、迟滞、灼伤' },
};

// 字诀：笔意满时点印，写一个真字
var ZI = {
  huo:  { ch: '火', name: '焚', desc: '烈火燎原：全场墨妖受创并灼烧，墨弹尽焚' },
  shan: { ch: '山', name: '屏', desc: '群山环印：十秒内墨妖与墨弹近不得印' },
  shui: { ch: '水', name: '洪', desc: '洪波四散：推开全场墨妖并迟滞，洗净墨弹，墨量回满' },
  ren:  { ch: '人', name: '侍', desc: '剪纸成人：三个纸人护印杀妖' },
};
var ZI_ORDER = ['huo', 'shan', 'shui', 'ren'];

// 笔匣：开局择一支笔。w 笔锋宽窄，ink 每单位耗墨倍数，inkMax 墨上限，regen 回墨倍数，
// up 开局即有的心得，dian 点墨晕上限与晕开速度，zhanExt 斩线加长，heavy 笔锋触敌加伤，yi 笔意积攒倍数，seal 由印谱哪一方印解锁
var BRUSHES = {
  jian: { ch: '兼', name: '兼毫', tag: '软硬相济', perks: ['样样都行，墨量居中', '最宜写字：笔意积攒快三成'], w: 1, ink: 1, inkMax: 100, regen: 1, up: {}, yi: 1.3, dian: { max: 44, rate: 30 } },
  lang: { ch: '狼', name: '狼毫', tag: '锋利省墨', perks: ['笔锋细，省墨两成半', '「斩」线长出四成，远处也斩得到', '笔肚小：墨上限 90，点墨晕得小'], w: 0.72, ink: 0.75, inkMax: 90, regen: 1, up: {}, zhanExt: 0.4, dian: { max: 30, rate: 26 }, seal: 'fujiao' },
  yang: { ch: '羊', name: '羊毫', tag: '饱满宽扫', perks: ['笔肚饱满，一扫一片', '开局习得「浪」', '费墨一成，回墨快一成半'], w: 1.55, ink: 1.1, inkMax: 120, regen: 1.15, up: { lang: 1 }, dian: { max: 54, rate: 42 }, seal: 'wufeng' },
  dou:  { ch: '斗', name: '斗笔', tag: '巨擘', perks: ['笔重：笔锋触敌伤 +1', '点墨晕开极广极快；直线不成「斩」', '费墨六成，墨上限 150'], w: 2.1, ink: 1.6, inkMax: 150, regen: 1.1, up: {}, dian: { max: 74, rate: 64, big: true }, heavy: 1, noZhan: true, seal: 'fumu' },
  tu:   { ch: '秃', name: '秃笔', tag: '枯锋', perks: ['墨上限 60，回墨快七成', '墨越少越狠：半墨伤 +1，两成 +2', '开局习得「雷」'], w: 0.9, ink: 1, inkMax: 60, regen: 1.7, up: { lei: 1 }, dian: { max: 40, rate: 30 }, dry: 0.3, kubi: true, seal: 'kubi' },
};
var BRUSH_ORDER = ['jian', 'lang', 'yang', 'dou', 'tu'];

// 印谱：局外成就，部分印解锁新笔
var SEALS = [
  { id: 'chuqi',   ch: '初启', cond: '净第一层' },
  { id: 'fujiao',  ch: '伏蛟', cond: '伏墨蛟', brush: 'lang' },
  { id: 'wufeng',  ch: '五封', cond: '一笔同封五妖', brush: 'yang' },
  { id: 'fumu',    ch: '伏母', cond: '伏蠹母', brush: 'dou' },
  { id: 'kubi',    ch: '枯笔', cond: '墨不足两成，一笔伏三妖', brush: 'tu' },
  { id: 'fuyan',   ch: '伏魇', cond: '伏墨魇，三卷尽净' },
  { id: 'wuxia',   ch: '无瑕', cond: '一局之中三层无瑕' },
  { id: 'lianzhu', ch: '连珠', cond: '连击五十' },
  { id: 'sizi',    ch: '四字', cond: '一局之中写遍火山水人' },
  { id: 'yizi',    ch: '一字', cond: '一个字诀伏妖十只' },
  { id: 'xujuan',  ch: '续卷', cond: '续卷至第三层' },
  { id: 'qianyao', ch: '千妖', cond: '累计伏妖一千' },
];

// 大数写成中文：12300 → 一万二千三百
function cnBig(n) {
  n = Math.max(0, Math.floor(n));
  if (n < 100) return cnNum(n);
  const U = ['', '十', '百', '千'];
  function sec(v, lead) {
    let s = '', zero = false;
    for (let i = 3; i >= 0; i--) {
      const d = Math.floor(v / Math.pow(10, i)) % 10;
      if (d) { if (zero && s) s += '零'; s += (d === 1 && i === 1 && !s && lead ? '' : CN[d]) + U[i]; zero = false; }
      else if (s) zero = true;
    }
    return s;
  }
  const wan = Math.floor(n / 10000), rest = n % 10000;
  if (!wan) return sec(rest, true);
  return sec(wan, true) + '万' + (rest ? (rest < 1000 ? '零' : '') + sec(rest, false) : '');
}

var UPGRADES = [
  { id: 'lei',  ch: '雷', name: '折笔 · 雷', desc: '习得「雷」：画锯齿折线，召雷劈向附近墨妖', max: 1, unlock: true },
  { id: 'lang', ch: '浪', name: '波磔 · 浪', desc: '习得「浪」：画起伏波浪，推开墨妖并洗去墨弹', max: 1, unlock: true },
  { id: 'zhen', ch: '镇', name: '三才 · 镇', desc: '习得「镇」：画闭合三角，结成结界，阻弹、迟滞、灼伤', max: 1, unlock: true },
  { id: 'nong', ch: '浓', name: '浓墨', desc: '笔锋触敌伤害 +1', max: 2 },
  { id: 'yan',  ch: '砚', name: '大砚', desc: '墨上限 +25', max: 3 },
  { id: 'mo',   ch: '研', name: '研墨', desc: '回墨速度 +35%', max: 3 },
  { id: 'po',   ch: '泼', name: '泼墨', desc: '墨妖死时溅墨，波及身旁墨妖', max: 1 },
  { id: 'yuan', ch: '圆', name: '圆融', desc: '一笔封住 3 只以上墨妖时，返还此笔墨量', max: 1 },
  { id: 'feng2', ch: '锋', name: '回锋', desc: '「斩」的追加伤害 +1，斩线更长', max: 2 },
  { id: 'jing', ch: '惊', name: '惊雷', desc: '「雷」的落雷数 +2', max: 2, req: 'lei' },
  { id: 'tao',  ch: '涛', name: '怒涛', desc: '「浪」造成 1 点伤害，定身更久', max: 1, req: 'lang' },
  { id: 'gang', ch: '刚', name: '金刚', desc: '「镇」结界持续 +4 秒，灼伤加倍', max: 1, req: 'zhen' },
  { id: 'bu',   ch: '印', name: '补印', desc: '印力上限 +1，并回复 2 点印力', max: 9 },
  { id: 'xi',   ch: '吸', name: '吸墨', desc: '收墨范围加倍，墨滴价值 +50%', max: 1 },
  { id: 'ding', ch: '定', name: '定神', desc: '落笔时光阴更缓', max: 1 },
  { id: 'fei',  ch: '飞', name: '飞白', desc: '墨量低于三成时，笔锋伤害 +1', max: 1 },
  { id: 'zi_shan', ch: '山', name: '字帖 · 山', desc: '字诀可写「山」：群山环印，十秒内墨妖与墨弹近不得印', max: 1, unlock: true, zi: 'shan' },
  { id: 'zi_shui', ch: '水', name: '字帖 · 水', desc: '字诀可写「水」：洪波四散，推开并迟滞墨妖，洗净墨弹，墨量回满', max: 1, unlock: true, zi: 'shui' },
  { id: 'zi_ren',  ch: '人', name: '字帖 · 人', desc: '字诀可写「人」：剪出三个纸人，护印杀妖', max: 1, unlock: true, zi: 'ren' },
  { id: 'yiqi', ch: '意', name: '意气', desc: '笔意积攒 +40%，字诀更常可用', max: 2 },
  { id: 'kuang', ch: '狂', name: '狂草', desc: '字诀书写时限 +4 秒，成字后笔意返还两成', max: 1 },
];

var CHAPTERS = [
  { name: '远山', scene: 1 },
  { name: '江流', scene: 2 },
  { name: '夜月', scene: 3 },
];

var FINAL_FLOOR = 9;

function chapterOf(n) { return n > FINAL_FLOOR ? 4 : Math.ceil(n / 3); }
function sceneOf(n) { return n > FINAL_FLOOR ? ((Math.floor((n - 10) / 3) % 3) + 1) : Math.ceil(n / 3); }
function floorTitle(n) {
  if (n > FINAL_FLOOR) return '续卷 · 第' + cnNum(n - FINAL_FLOOR) + '层';
  return '卷' + cnNum(chapterOf(n)) + ' · ' + CHAPTERS[chapterOf(n) - 1].name;
}
function floorSub(n) {
  if (n > FINAL_FLOOR) return (n % 3 === 0) ? '卷终' : '其' + cnNum(((n - 1) % 3) + 1);
  const k = ((n - 1) % 3) + 1;
  return k === 3 ? '其三 · 卷终' : '其' + cnNum(k);
}

var FLOOR_TIPS = {
  2: '墨蟾 —— 停在远处吐墨，笔锋可以截断墨弹',
  3: '墨蛟 —— 封不住、点不透，唯有横斩蛟身；一条可断为两条',
  4: '墨甲 —— 甲壳坚厚，宜封，宜雷',
  5: '虚影 —— 笔锋穿身而过，唯有封、雷、点、镇能伤它',
  6: '蠹母 —— 墨壳护体：先画圈封住它破壳，再用笔锋伤它',
  7: '裂妖 —— 身死之后一分为三',
  8: '群妖并至',
  9: '墨魇 —— 会落下红色逆笔：在落墨之前一笔横截',
};

// —— 波次编排 ——
// spawn: { t, type, side(0上 1右 2下 3左), u(沿边 0..1), along, out }
function clusterSpawns(t, type, n, side, u, gap) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ t: t + i * (gap || 0.1), type, side, u, along: rr(-40, 40), out: rr(0, 36) });
  return out;
}

function tutorialFloor() {
  const W1 = [
    { t: 0.4, type: 'du', side: 3, u: 0.45 },
    { t: 2.6, type: 'du', side: 1, u: 0.55 },
    { t: 4.8, type: 'du', side: 0, u: 0.4 },
  ];
  const W2 = [
    { t: 0.4, type: 'e', side: 3, u: 0.3 },
    { t: 1.6, type: 'du', side: 1, u: 0.7 },
    { t: 2.4, type: 'du', side: 1, u: 0.3 },
    { t: 3.6, type: 'e', side: 2, u: 0.6 },
    { t: 5.0, type: 'du', side: 0, u: 0.8 },
  ];
  const W3 = [...clusterSpawns(0.4, 'du', 7, 1, 0.5, 0.08), ...clusterSpawns(6, 'du', 6, 3, 0.5, 0.08)];
  const W4 = [
    ...clusterSpawns(0.3, 'du', 5, 0, 0.3, 0.1),
    { t: 1.5, type: 'e', side: 1, u: 0.4 },
    ...clusterSpawns(3.5, 'du', 5, 2, 0.7, 0.1),
    { t: 5, type: 'e', side: 3, u: 0.6 },
    { t: 6.5, type: 'e', side: 0, u: 0.7 },
    ...clusterSpawns(8, 'du', 6, 1, 0.6, 0.1),
  ];
  return {
    waves: [
      { spawns: W1, nextAt: 0, maxT: 45, hint: { icon: 'brush', text: '按住拖动即可落笔 —— 笔锋划过，即伤墨妖' } },
      { spawns: W2, nextAt: 0, maxT: 45, hint: { icon: 'zhan', text: '一笔直线为「斩」—— 沿线再追加一击' } },
      { spawns: W3, nextAt: 0, maxT: 45, hint: { icon: 'feng', text: '画一个圈为「封」—— 圈中墨妖一并封印' } },
      { spawns: W4, nextAt: 1, maxT: 45, hint: { icon: 'drop', text: '墨会慢慢回复；笔锋划过墨滴即可收墨' } },
    ],
    boss: null,
  };
}

function floorPool(n) {
  const pool = [['du', 4], ['e', 3]];
  if (n >= 2) pool.push(['chan', 2]);
  if (n >= 4) pool.push(['jia', 2]);
  if (n >= 5) pool.push(['xu', 2]);
  if (n >= 7) pool.push(['lie', 2]);
  return pool;
}
var NEW_TYPE = { 2: 'chan', 4: 'jia', 5: 'xu', 7: 'lie' };

function weightedPick(pool) {
  let tot = 0;
  for (const [, w] of pool) tot += w;
  let r = rnd() * tot;
  for (const [k, w] of pool) { r -= w; if (r <= 0) return k; }
  return pool[0][0];
}

function genWaves(n) {
  const pool = floorPool(n);
  const endless = n > FINAL_FLOOR;
  const nw = endless ? 5 : n <= 2 ? 3 : 4;
  const newType = NEW_TYPE[n];
  const waves = [];
  for (let w = 0; w < nw; w++) {
    let budget = 6 + n * 1.7 + w * 2.6;
    const spawns = [];
    let t = 0.3;
    if (w === 0 && newType) {
      for (let i = 0; i < 2; i++) { spawns.push({ t, type: newType, side: ri(0, 3), u: rr(0.2, 0.8) }); t += 1.4; budget -= ENEMY[newType].cost; }
    }
    while (budget > 0) {
      const type = weightedPick(pool);
      if (type === 'du') {
        const c = Math.min(10, ri(3, 4 + Math.floor(n / 2)));
        spawns.push(...clusterSpawns(t, 'du', c, ri(0, 3), rr(0.15, 0.85), 0.1));
        budget -= c * ENEMY.du.cost;
        t += rr(1.3, 2.3);
      } else {
        spawns.push({ t, type, side: ri(0, 3), u: rr(0.1, 0.9) });
        budget -= ENEMY[type].cost;
        t += rr(0.8, 1.7) / (1 + n * 0.05);
      }
    }
    waves.push({ spawns, nextAt: 2 + (n >> 2), maxT: t + 10 });
  }
  return waves;
}

function buildFloor(n) {
  if (n === 1) return tutorialFloor();
  if (n % 3 === 0) {
    const boss = ['jiao', 'mu', 'yan'][((n / 3) - 1) % 3];
    return { waves: [{ spawns: [], nextAt: 0, maxT: 999 }], boss };
  }
  return { waves: genWaves(n), boss: null };
}
