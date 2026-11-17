// 墨灵 · 离线缓存
// 有网时先取新文件（改了代码刷新即见），取到就顺手存一份；断网或网慢（3 秒）时用存着的。
// 首次装上时把整套文件先存好，之后断网也能开卷。
'use strict';
const VERSION = 'moling-cff01cd507';   // tools/build.mjs 打包时换成内容指纹
const SHELL = [
  './', 'index.html', 'manifest.webmanifest',
  'src/util.js', 'src/gesture.js', 'src/glyph.js', 'src/audio.js', 'src/art.js', 'src/data.js', 'src/scroll.js', 'src/game.js',
  'icons/icon-192.png', 'icons/apple-touch-icon.png', 'icons/favicon-48.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('moling-') && k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function fromNetwork(req) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), 3000);
    fetch(req).then(res => {
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
