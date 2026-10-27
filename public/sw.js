/*
 * Lien Parental — Service Worker (vanilla, hand-written).
 *
 * Strategy
 *   • Install   : precache the app shell listed in PRECACHE.
 *   • Activate  : delete every cache whose name does not match CACHE_V.
 *   • Fetch     :
 *       - navigation requests   → network-first, fall back to cached page, then /offline
 *       - same-origin assets    → stale-while-revalidate
 *       - cross-origin / third- → network-only (not cached)
 *
 * Bump CACHE_V whenever the precache list changes — the old cache is cleared on activate.
 */

const CACHE_V = 'lp-v4';
const RUNTIME = `${CACHE_V}-runtime`;
const SHELL   = `${CACHE_V}-shell`;

// App shell to precache. Keep in sync with the real route tree.
// Precache ONLY public marketing/offline shell. Authenticated pages such as
// /app/* are per-user and must never land in the shared SW cache (another
// person using the same device offline would otherwise see private content).
const PRECACHE = [
  '/',
  '/offline',
  '/manifest.json',
  '/favicon.ico',
  '/icons/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png',
  '/icons/apple-touch-icon.png',
];

/* ---------------------------------------------------------------- install */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) =>
      // addAll is atomic — if one fails, nothing is cached. We tolerate individual
      // failures (e.g. a route not deployed yet) so install never aborts.
      Promise.all(
        PRECACHE.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch(() => null)
        )
      )
    )
  );
  // Take over as soon as installed — no need to wait for all tabs to close.
  self.skipWaiting();
});

/* --------------------------------------------------------------- activate */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !k.startsWith(CACHE_V))
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ------------------------------------------------------------------ fetch */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Never touch non-GET (POST login, mutations, etc.)
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // 1) Navigation requests → network-first, offline fallback
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req));
    return;
  }

  // 2) Same-origin per-user data (/api/*, /app/* RSC payloads…) → network only, never cached
  //    (e.g. GET /api/push/subscribe returns the signed-in user's devices).
  if (sameOrigin && isPrivatePath(url.pathname)) return;

  // 3) Same-origin assets → stale-while-revalidate
  if (sameOrigin) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // 4) Third-party → network-only (don't pollute our caches)
  // (letting the browser handle it is enough — no respondWith)
});

/* -------------------------------------------------------------- strategies */

// Routes that are per-user and MUST NOT be stored in the shared cache: if a
// user signs out (or another person uses the same device offline), serving a
// cached /app/* page would leak private content. We also skip /admin, /api,
// /temoin for the same reason.
const PRIVATE_PREFIXES = ['/app/', '/admin/', '/api/', '/temoin/'];
// Public marketing routes safe to cache for offline use.
const PUBLIC_CACHEABLE = ['/', '/aide', '/legal/'];

function isPrivatePath(pathname) {
  return PRIVATE_PREFIXES.some((p) => pathname === p.replace(/\/$/, '') || pathname.startsWith(p));
}

function isPublicCacheable(pathname) {
  if (pathname === '/') return true;
  return PUBLIC_CACHEABLE.some((p) => (p === '/' ? false : pathname === p.replace(/\/$/, '') || pathname.startsWith(p)));
}

async function networkFirst(req) {
  const cache = await caches.open(SHELL);
  const url = new URL(req.url);
  const privatePage = isPrivatePath(url.pathname);
  const cacheable = !privatePage && isPublicCacheable(url.pathname);
  try {
    const fresh = await fetch(req);
    // Only cache successful, non-redirect, basic (same-origin) HTML responses,
    // and only for the public marketing routes — never for authenticated pages.
    if (
      cacheable &&
      fresh &&
      fresh.ok &&
      fresh.type === 'basic'
    ) {
      cache.put(req, fresh.clone());
    }
    return fresh;
  } catch {
    // On network failure, only return a cached page for public routes.
    if (cacheable) {
      const cached = await cache.match(req);
      if (cached) return cached;
    }
    const offline = await cache.match('/offline');
    return (
      offline ||
      new Response('Hors ligne', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    );
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(RUNTIME);
  const cached = await cache.match(req);
  const network = fetch(req)
    .then((res) => {
      // Only cache successful, basic/CORS responses (skip opaque errors)
      // Skip redirects (3xx) — only cache final successful basic/CORS responses.
      if (res && res.ok && !res.redirected && (res.type === 'basic' || res.type === 'cors')) {
        cache.put(req, res.clone());
      }
      return res;
    })
    .catch(() => cached); // if network dies, fall back to cached
  return cached || network;
}

/* ------------------------------------------------------------------- push */
// Notifications Web Push (lib/notify/push.ts). La charge ne contient jamais de
// contenu sensible : un titre court, une phrase et un lien interne /app/…
const PUSH_ICON = '/icons/icon-192.png';

function safeAppPath(value) {
  if (typeof value !== 'string') return '/app/notifications';
  // Chemin interne uniquement : jamais d'URL absolue ni de //hôte.
  return /^\/app(\/[\w\-./?=&%]*)?$/.test(value) && !value.includes('//') ? value : '/app/notifications';
}

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = typeof data.title === 'string' && data.title ? data.title.slice(0, 120) : 'Lien Parental';
  const options = {
    body: typeof data.body === 'string' ? data.body.slice(0, 240) : '',
    icon: PUSH_ICON,
    badge: PUSH_ICON,
    lang: 'fr',
    tag: typeof data.tag === 'string' && data.tag ? data.tag.slice(0, 64) : undefined,
    renotify: Boolean(data.tag),
    data: { url: safeAppPath(data.url) },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(safeAppPath(event.notification.data && event.notification.data.url), self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
          return client.focus().then((c) => (c && 'navigate' in c ? c.navigate(target) : undefined)).catch(() => self.clients.openWindow(target));
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
