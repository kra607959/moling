// 墨灵 · 离线缓存
// 有网时先取新文件（改了代码刷新即见），取到就顺手存一份；断网或网慢（3 秒）时用存着的。
// 首次装上时把整套文件先存好，之后断网也能开卷。
// 取网络时一律向服务器核对（cache: 'no-cache'，没变只回 304）：GitHub Pages 让浏览器把文件缓存十分钟，
// 不核对的话，发版后十分钟内会拿到新旧混杂的一套文件。打包时 index.html 里的脚本还带上 ?v=版本指纹。
'use strict';
const VERSION = 'moling-3aaeb153c1';   // tools/build.mjs 打包时换成内容指纹
const SHELL = [
  './', 'index.html', 'manifest.webmanifest',
  'src/util.js', 'src/gesture.js', 'src/glyph.js', 'src/audio.js', 'src/art.js', 'src/data.js', 'src/scroll.js',
  'src/game/core.js', 'src/game/log.js', 'src/game/run.js', 'src/game/entity.js', 'src/game/stroke.js', 'src/game/zi.js', 'src/game/boss.js',
  'src/game/update.js', 'src/game/draw.js', 'src/game/drawfx.js', 'src/game/hud.js', 'src/game/screens.js', 'src/game/input.js',
  'icons/icon-192.png', 'icons/apple-touch-icon.png', 'icons/favicon-48.png',
];

self.addEventListener('install', e => {
  // cache: 'reload'：预存的一定是服务器上的新文件，不是浏览器缓存里的旧文件
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('moling-') && k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function fromNetwork(req) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), 3000);
    // 导航请求不能带参数重建，用网址另发；都同源、都向服务器核对
    fetch(req.mode === 'navigate' ? req.url : new Request(req, { cache: 'no-cache' }), req.mode === 'navigate' ? { cache: 'no-cache', credentials: 'same-origin' } : undefined).then(res => {
      clearTimeout(timer);
      if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      resolve(res);
    }, err => { clearTimeout(timer); reject(err); });
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(fromNetwork(req).catch(() =>
    caches.match(req, { ignoreSearch: true }).then(hit => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
