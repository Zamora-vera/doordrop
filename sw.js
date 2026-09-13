/* Ship24Go PWA Service Worker v1.0.0 — stable shell cache, network-first API */
const SW_VERSION = 'ship24go-pwa-v1.0.2';
const SHELL_CACHE = `${SW_VERSION}-shell`;
const ASSET_CACHE = `${SW_VERSION}-assets`;

const PRECACHE = [
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/favicon-32.png',
  '/brand/logo.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' })).map(async (req) => {
      try {
        const res = await fetch(req);
        if (res.ok) await cache.put(req, res.clone());
      } catch (_) {}
    }).reduce(async (p) => p, Promise.resolve()));
    // simpler precache
    try {
      await cache.addAll(PRECACHE);
    } catch (_) {
      // ignore missing optional assets
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k.startsWith('ship24go-pwa-') && k !== SHELL_CACHE && k !== ASSET_CACHE)
        .map((k) => caches.delete(k))
    );
    // also drop ancient disabled caches
    await Promise.all(keys.filter((k) => !k.startsWith('ship24go-pwa-') && k.includes('ship24')).map((k) => caches.delete(k)).concat([]));
    await self.clients.claim();
  })());
});

function isApi(url) {
  return url.pathname.startsWith('/api/') || url.pathname === '/openapi.json';
}
function isAsset(url) {
  return url.pathname.startsWith('/assets/') ||
    /\.(?:js|css|woff2?|png|jpg|jpeg|svg|ico|webp)$/i.test(url.pathname);
}
function isNav(req) {
  return req.mode === 'navigate' || (req.method === 'GET' && (req.headers.get('accept') || '').includes('text/html'));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }
  if (url.origin !== self.location.origin) return;

  // Never cache API / docs dynamic / SW itself
  if (isApi(url) || url.pathname === '/sw.js' || url.pathname.startsWith('/docs')) {
    event.respondWith(fetch(req).catch(() => new Response(JSON.stringify({ error: 'offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })));
    return;
  }

  // Hashed assets: cache-first
  if (isAsset(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(ASSET_CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      } catch (e) {
        return hit || Response.error();
      }
    })());
    return;
  }

  // SPA navigations: network-first, fallback to cached index.html
  if (isNav(req)) {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res && res.ok) {
          const cache = await caches.open(SHELL_CACHE);
          // only cache the shell entry, not every deep link body if same index
          cache.put('/index.html', res.clone()).catch(() => {});
        }
        return res;
      } catch (_) {
        const cache = await caches.open(SHELL_CACHE);
        const shell = await cache.match('/index.html') || await cache.match('/');
        if (shell) return shell;
        return new Response('Ship24Go offline. Reconnect to continue.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }
    })());
    return;
  }

  // default: network with cache fallback
  event.respondWith((async () => {
    try {
      return await fetch(req);
    } catch (_) {
      const cache = await caches.open(SHELL_CACHE);
      const hit = await cache.match(req);
      return hit || Response.error();
    }
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
