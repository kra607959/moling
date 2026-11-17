// 发布版只从已完整预存的那一版开卷。开发版不拦截在线刷新。
'use strict';
const VERSION = 'moling-9a92d810a2';   // tools/build.mjs 打包时换成内容指纹
const SHELL = [
  './', 'index.html', 'manifest.webmanifest',
  'releases/9a92d810a2/src/util.js', 'releases/9a92d810a2/src/gesture.js', 'releases/9a92d810a2/src/glyph.js', 'releases/9a92d810a2/src/audio.js', 'releases/9a92d810a2/src/art.js', 'releases/9a92d810a2/src/data.js', 'releases/9a92d810a2/src/scroll.js',
  'releases/9a92d810a2/src/game/core.js', 'releases/9a92d810a2/src/game/log.js', 'releases/9a92d810a2/src/game/run.js', 'releases/9a92d810a2/src/game/entity.js', 'releases/9a92d810a2/src/game/stroke.js', 'releases/9a92d810a2/src/game/zi.js', 'releases/9a92d810a2/src/game/boss.js',
  'releases/9a92d810a2/src/game/update.js', 'releases/9a92d810a2/src/game/draw.js', 'releases/9a92d810a2/src/game/drawfx.js', 'releases/9a92d810a2/src/game/hud.js', 'releases/9a92d810a2/src/game/screens.js', 'releases/9a92d810a2/src/game/input.js',
  'icons/icon-192.png', 'icons/apple-touch-icon.png', 'icons/favicon-48.png',
];

const scope = self.registration.scope;
const packed = VERSION !== 'moling-dev';
const index = new URL('index.html', scope).href;
const release = new URL('releases/' + VERSION.slice(7) + '/', scope).href;

self.addEventListener('install', e => {
  if (!packed) return;
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    try {
      // 旧 worker 仍在服务。只有同一套资源都就位，新 worker 才接管。
      await cache.addAll(SHELL.filter(u => u !== './').map(u => new Request(new URL(u, scope), { cache: 'reload' })));
      const page = await cache.match(index);
      const html = await page.text();
      if (!html.includes('src="releases/' + VERSION.slice(7) + '/')) throw new Error('离线页面与缓存版本不一致');
      await self.skipWaiting();
    } catch (err) {
      await caches.delete(VERSION);
      throw err;
    }
  })());
});

self.addEventListener('activate', e => {
  if (!packed) return;
  e.waitUntil((async () => {
    // 新页面归新版，保留上一套供切换时已经打开的旧页面读完。
    const older = (await caches.keys()).filter(k => /^moling-[a-f0-9]{10}$/.test(k) && k !== VERSION);
    await Promise.all(older.slice(0, -1).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (!packed || req.method !== 'GET' || !req.url.startsWith(scope)) return;
  const path = new URL(req.url).pathname, base = new URL(scope).pathname;
  if (req.mode === 'navigate' && (path === base || path === base + 'index.html')) {
    e.respondWith(caches.open(VERSION).then(c => c.match(index)).then(hit => hit || Response.error()));
  } else if (req.url.startsWith(new URL('releases/', scope).href)) {
    // 版本在路径里；绝不把其它版本同名脚本当作兜底。
    e.respondWith(caches.match(req).then(hit => hit || (req.url.startsWith(release) ? Response.error() : fetch(req))));
  } else if (SHELL.some(u => new URL(u, scope).href === req.url)) {
    e.respondWith(caches.open(VERSION).then(c => c.match(req)).then(hit => hit || fetch(req)));
  }
});
