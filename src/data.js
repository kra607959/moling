'use strict';
// 静态数据：墨妖、笔法、心得（升级）、卷与层的编排。

// 版本号：写进试玩记录与局中存档，卷首右下角也标出；每次发给试玩者之前改一次
var GAME_VERSION = '0.4.0';

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
  lang: { ch: '浪', shape: '波浪', desc: '起伏波浪：推开墨妖、伤其一点，把墨弹打回去' },
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
  { id: 'lang', ch: '浪', name: '波磔 · 浪', desc: '习得「浪」：画起伏波浪，推开墨妖、伤其一点，墨弹倒卷回去打妖', max: 1, unlock: true },
  { id: 'zhen', ch: '镇', name: '三才 · 镇', desc: '习得「镇」：画闭合三角，结成结界，阻弹、迟滞、灼伤', max: 1, unlock: true },
  { id: 'nong', ch: '浓', name: '浓墨', desc: '笔锋触敌伤害 +1', max: 2 },
  { id: 'yan',  ch: '砚', name: '大砚', desc: '墨上限 +25', max: 3 },
  { id: 'mo',   ch: '研', name: '研墨', desc: '回墨速度 +35%', max: 3 },
  { id: 'po',   ch: '泼', name: '泼墨', desc: '墨妖死时溅墨，波及身旁墨妖', max: 1 },
  { id: 'yuan', ch: '圆', name: '圆融', desc: '一笔封住 3 只以上墨妖时，返还此笔墨量', max: 1 },
  { id: 'feng2', ch: '锋', name: '回锋', desc: '「斩」的追加伤害 +1，斩线更长', max: 2 },
  { id: 'jing', ch: '惊', name: '惊雷', desc: '「雷」的落雷数 +2', max: 2, req: 'lei' },
  { id: 'tao',  ch: '涛', name: '怒涛', desc: '「浪」伤害 +1，倒卷的墨弹更重，定身更久', max: 1, req: 'lang' },
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
  2: '墨蟾 —— 停在远处吐墨，笔锋可以截断墨弹；墨妖从山口排成一线而来',
  3: '墨蛟 —— 封不住、点不透，唯有横斩蛟身；一条可断为两条',
  4: '墨甲 —— 甲壳坚厚，宜封，宜雷',
  5: '虚影 —— 笔锋穿身而过，唯有封、雷、点、镇能伤它',
  6: '蠹母 —— 墨壳护体：先画圈封住它破壳，再用笔锋伤它',
  7: '裂妖 —— 身死之后一分为三；月影浓处，墨妖将现',
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

// —— 手编层：卷二 · 江流 · 其一「回潮」——
// 墨妖随水路而来：水纹先显出流向，妖沿水走，到了岸才直奔墨印。
// 水路坐标按「沿长边 a、沿短边 b」写，a = af × 半长边 + aa（负为上游：横屏在左、竖屏在上），竖屏时整幅转 90°。
// A 主流：从上游沿一侧走过印旁，绕回下游再靠岸，墨妖从下游一侧爬向墨印。
// B 回流：从上游沿另一侧进回湾，在湾里打旋，同群的到齐了才一起出湾。
var RIVERS = {
  A: { pts: [[-1, -30, -175], [-0.5, 0, -215], [0, -40, -228], [0, 140, -200], [0, 215, -120], [0, 190, -45]] },
  B: { pts: [[-1, -30, 205], [-0.55, 0, 238], [0, -120, 236]], eddy: [0, -195, 138, 58], out: [[0, -110, 80]] },
};
// 一段水路上的一串墨妖（同一 grp 在回湾里等齐再出）
function riverSpawns(t, type, n, route, gap, grp) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ t: t + i * (gap || 0.15), type, route, grp, jit: rr(-16, 16) });
  return out;
}
function huichaoFloor() {
  const S1 = [   // 初潮：墨甲随主流而来，前后夹少许墨蠹
    { t: 0.6, type: 'jia', route: 'A', jit: 0 },
    ...riverSpawns(2.6, 'du', 3, 'B', 0.16, 'b0'),
    { t: 5.0, type: 'jia', route: 'A', jit: 0 },
    ...riverSpawns(6.6, 'du', 4, 'A', 0.16),
    { t: 8.5, type: 'e', side: 0, u: 0.7 },
    { t: 9.5, type: 'e', side: 2, u: 0.3 },
  ];
  const S2 = [   // 回流：一大群墨蠹进回湾打旋 —— 沿水分段斩，或等聚齐一圈封住
    ...riverSpawns(2.0, 'du', 16, 'B', 0.15, 'b1'),
    { t: 4.2, type: 'jia', route: 'A', jit: 0 },
  ];
  const S3 = [   // 决口：两只墨蟾从下游吐弹，墨甲领着一群顺主流而下，回湾再进一小群
    { t: 0.3, type: 'chan', side: 1, u: 0.32 },
    { t: 0.9, type: 'chan', side: 1, u: 0.68 },
    { t: 1.6, type: 'jia', route: 'A', jit: 0 },
    ...riverSpawns(3.0, 'du', 12, 'A', 0.15),
    ...riverSpawns(8.5, 'du', 8, 'B', 0.15, 'b2'),
    { t: 10, type: 'e', side: 0, u: 0.4 },
    { t: 10.6, type: 'e', side: 2, u: 0.6 },
  ];
  return {
    name: '回潮',
    rivers: RIVERS,
    waves: [
      { seg: '初潮', spawns: S1, nextAt: 0, rest: 3.5, maxT: 60 },
      { seg: '回流', spawns: S2, nextAt: 0, rest: 3.5, maxT: 60 },
      { seg: '决口', spawns: S3, nextAt: 0, maxT: 60 },
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

// —— 卷一 · 远山 · 其二「山口」：看角度 ——
// 三处山口，墨妖排成一线从口里走出，到了口外才散开扑印。顺着来路一笔「斩」，一线全中；
// 墨蟾守在山口里往外吐弹，弹也顺着来路飞：横过来路一笔，截弹带斩妖。
// 路点写法同水路（沿长边、沿短边），kind: 'pass' 不托速，开层时在口上画两座山。
var PASSES = {
  P1: { kind: 'pass', pts: [[-1, 0, -70], [-0.6, 0, -52], [0, -190, -14]] },
  P2: { kind: 'pass', pts: [[0, 230, -360], [0, 175, -235], [0, 110, -150]] },
  P3: { kind: 'pass', pts: [[1, 0, 110], [0.55, 0, 72], [0, 195, 22]] },
};
// 一线：同一路的墨妖鱼贯而出，左右只差几个单位
function passSpawns(t, type, n, route, gap) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ t: t + i * (gap || 0.42), type, route, jit: rr(-4, 4) });
  return out;
}
function shankouFloor() {
  const S1 = [   // 一线：一处山口出一线墨蠹，再换一处
    ...passSpawns(0.8, 'du', 6, 'P1'),
    ...passSpawns(5.6, 'du', 6, 'P3'),
    { t: 9.0, type: 'e', side: 0, u: 0.3 },
    { t: 9.6, type: 'e', side: 2, u: 0.7 },
  ];
  const S2 = [   // 两口：两线同时出，角度不同；墨蟾守住第三处山口
    ...passSpawns(1.0, 'du', 6, 'P1'),
    ...passSpawns(1.6, 'du', 6, 'P2'),
    { t: 4.6, type: 'chan', route: 'P3', jit: 0 },
    ...passSpawns(8.4, 'du', 5, 'P3'),
  ];
  const S3 = [   // 群峰：两只墨蟾从两口吐弹，三线墨蠹先后压来
    { t: 0.3, type: 'chan', route: 'P1', jit: 0 },
    { t: 1.2, type: 'chan', route: 'P2', jit: 0 },
    ...passSpawns(2.6, 'du', 7, 'P3', 0.38),
    { t: 4.6, type: 'e', side: 1, u: 0.25 },
    { t: 5.2, type: 'e', side: 3, u: 0.75 },
    ...passSpawns(7.6, 'du', 5, 'P1'),
    ...passSpawns(8.3, 'du', 5, 'P2'),
  ];
  return {
    name: '山口', rivers: PASSES, boss: null,
    waves: [
      { seg: '一线', spawns: S1, nextAt: 0, rest: 3.5, maxT: 60, hint: { icon: 'zhan', text: '山口来的墨妖排成一线 —— 顺着来路一笔斩过' } },
      { seg: '两口', spawns: S2, nextAt: 0, rest: 3.5, maxT: 60 },
      { seg: '群峰', spawns: S3, nextAt: 0, maxT: 60 },
    ],
  };
}

// —— 卷三 · 夜月 · 其一「月影」：看先后 ——
// 墨妖不从纸边来，而是从纸上的月影里现身：月影越浓、外圈的刻度走得越满，越先现身。
// 裂妖死时一分三，离印近了再杀就晚了；墨蟾现身即吐弹；虚影只认封、雷、点、镇。
// 习得「镇」的话：在月影上先画好三角，现身的墨妖当场被镇住、受一点伤。
// moon: [方位角（度，0 为右、90 为下）, 离墨印的距离]，n：一处月影里现身几只
function moonSpawn(t, type, ang, r, n) { return { t, type, moon: [ang, r], n: n || 1 }; }
function yueyingFloor() {
  const S1 = [   // 初更：一处一处现身，先学会看月影
    moonSpawn(1.2, 'lie', 200, 270),
    moonSpawn(3.4, 'chan', 330, 290),
    moonSpawn(5.6, 'du', 100, 280, 4),
    { t: 6.0, type: 'e', side: 0, u: 0.7 },
    { t: 6.6, type: 'e', side: 2, u: 0.3 },
    moonSpawn(7.8, 'xu', 20, 260),
  ];
  const S2 = [   // 二更：三处月影叠着浓起来，谁先谁后要分清
    moonSpawn(1.0, 'lie', 150, 255),
    moonSpawn(1.9, 'chan', 30, 300),
    moonSpawn(2.8, 'du', 270, 290, 4),
    ...clusterSpawns(6.0, 'du', 4, 3, 0.5, 0.1),
    { t: 7.4, type: 'jia', side: 1, u: 0.5 },
    moonSpawn(9.0, 'xu', 210, 280),
    moonSpawn(9.8, 'lie', 330, 260),
    moonSpawn(10.6, 'chan', 90, 300),
  ];
  const S3 = [   // 三更：一圈月影绕印，顺次现身；墨甲从纸边压来，两只墨蟾收尾
    ...[0, 1, 2, 3, 4, 5].map(i => moonSpawn(1.0 + i * 0.85, i % 2 ? 'lie' : 'du', i * 60 - 90, 275, i % 2 ? 1 : 3)),
    { t: 7.5, type: 'jia', side: 0, u: 0.5 },
    moonSpawn(9.0, 'chan', 45, 310),
    moonSpawn(9.6, 'chan', 225, 310),
    { t: 10.0, type: 'e', side: 1, u: 0.3 },
    { t: 10.5, type: 'e', side: 3, u: 0.7 },
    { t: 11.0, type: 'e', side: 0, u: 0.2 },
  ];
  return {
    name: '月影', boss: null,
    waves: [
      { seg: '初更', spawns: S1, nextAt: 0, rest: 3.5, maxT: 60, hint: { icon: 'feng', text: '月影越浓、外圈越满，越先现身 —— 先看清谁先来', zhen: '月影越浓越先现身；在月影上先画三角，现身即被镇住' } },
      { seg: '二更', spawns: S2, nextAt: 0, rest: 3.5, maxT: 60 },
      { seg: '三更', spawns: S3, nextAt: 0, maxT: 60 },
    ],
  };
}

function buildFloor(n) {
  if (n === 1) return tutorialFloor();
  if (n === 2) return shankouFloor();
  if (n === 4) return huichaoFloor();
  if (n === 7) return yueyingFloor();
  if (n % 3 === 0) {
    const boss = ['jiao', 'mu', 'yan'][((n / 3) - 1) % 3];
    return { waves: [{ spawns: [], nextAt: 0, maxT: 999 }], boss };
  }
  return { waves: genWaves(n), boss: null };
}
