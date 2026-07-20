/* Lexora AI service worker — DELIBERATELY minimal.
   Cache-first ONLY for immutable assets (lib/, icons/, favicon): they never
   change without a filename change, so this can never serve a stale app.
   HTML, scripts/ and styles/ always go to the network — the pages.css
   cache-staleness trap taught us not to cache anything that iterates.
   This is enough for PWA installability + instant repeat loads of the
   heavy libraries (pdf.js, tesseract ≈ multi-MB). */
const CACHE = 'lx-static-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  const cacheable = u.origin === location.origin && e.request.method === 'GET' &&
    (u.pathname.startsWith('/lib/') || u.pathname.startsWith('/icons/') || u.pathname === '/favicon.svg');
  if (!cacheable) return;                       /* everything else: pure network */
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const hit = await c.match(e.request);
    if (hit) return hit;
    const r = await fetch(e.request);
    if (r.ok) c.put(e.request, r.clone());
    return r;
  })());
});
