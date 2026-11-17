// 发布版只从已完整预存的那一版开卷。开发版不拦截在线刷新。
'use strict';
const VERSION = 'moling-a4cd0a2a6a';   // tools/build.mjs 打包时换成内容指纹
const SHELL = [
  './', 'index.html', 'manifest.webmanifest',
  'releases/a4cd0a2a6a/src/util.js', 'releases/a4cd0a2a6a/src/gesture.js', 'releases/a4cd0a2a6a/src/glyph.js', 'releases/a4cd0a2a6a/src/audio.js', 'releases/a4cd0a2a6a/src/art.js', 'releases/a4cd0a2a6a/src/data.js', 'releases/a4cd0a2a6a/src/scroll.js',
  'releases/a4cd0a2a6a/src/game/core.js', 'releases/a4cd0a2a6a/src/game/log.js', 'releases/a4cd0a2a6a/src/game/run.js', 'releases/a4cd0a2a6a/src/game/entity.js', 'releases/a4cd0a2a6a/src/game/stroke.js', 'releases/a4cd0a2a6a/src/game/zi.js', 'releases/a4cd0a2a6a/src/game/boss.js',
  'releases/a4cd0a2a6a/src/game/update.js', 'releases/a4cd0a2a6a/src/game/draw.js', 'releases/a4cd0a2a6a/src/game/drawfx.js', 'releases/a4cd0a2a6a/src/game/hud.js', 'releases/a4cd0a2a6a/src/game/screens.js', 'releases/a4cd0a2a6a/src/game/input.js',
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
