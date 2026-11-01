/*
 * Lien Parental — Service Worker (vanilla, hand-written).
 *
 * Strategy
 *   • Install   : precache the app shell listed in PRECACHE.
 *   • Activate  : delete every cache whose name does not match CACHE_V.
 *   • Fetch     :
 *       - navigation requests   → network-first, fall back to cached page, then /offline
 *       - same-origin static files (/_next/static, icônes, images, polices) → stale-while-revalidate
 *       - every other same-origin GET (RSC payloads, /_next/image, pages) → network-only
 *       - cross-origin / third- → network-only (not cached)
 *
 * Bump CACHE_V whenever the precache list changes — the old cache is cleared on activate.
 */

const CACHE_V = 'lp-v5';
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

  // 3) Same-origin static files → stale-while-revalidate. Anything else (RSC payloads of
  //    /onboarding/recap…, /_next/image which may proxy a private photo, routes) stays
  //    network-only: never per-user content in the shared cache, never a stale payload after a
  //    deployment.
  if (sameOrigin && isStaticAsset(url, req)) {
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

const STATIC_PREFIXES = ['/_next/static/', '/icons/', '/brand/', '/fonts/'];
const STATIC_EXT = /\.(?:png|jpe?g|webp|avif|gif|svg|ico|woff2?|css|js)$/i; // pas d'audio/vidéo : requêtes Range (206), non cachables

function isStaticAsset(url, req) {
  if (url.search) return false; // ?_rsc=…, /_next/image?url=…
  if (req && req.headers && typeof req.headers.get === 'function' && req.headers.get('RSC')) return false;
  if (STATIC_PREFIXES.some((p) => url.pathname.startsWith(p))) return true;
  return STATIC_EXT.test(url.pathname) && !url.pathname.startsWith('/_next/');
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
// contenu sensible : un titre court, une phrase, un lien interne /app/… et,
// facultativement, la langue du destinataire (fr | en | pt).
// Fonctions pures ci-dessous testées par tests/push-sw.test.ts (exécution du
// fichier dans un bac à sable node:vm avec un faux `self`).
const PUSH_ICON = '/icons/icon-192.png';
// Badge : silhouette monochrome blanche sur fond transparent (Android n'utilise que l'alpha).
const PUSH_BADGE = '/brand/badge-96.png';
const PUSH_FALLBACK_URL = '/app/notifications';
const PUSH_LANGS = ['fr', 'en', 'pt'];
const PUSH_DEFAULT_TITLE = 'Lien Parental';

function safeAppPath(value) {
  if (typeof value !== 'string') return PUSH_FALLBACK_URL;
  // Chemin interne /app… uniquement : jamais d'URL absolue, de //hôte, de \ ni de remontée « .. ».
  if (!/^\/app(\/[\w\-./?=&%]*)?$/.test(value)) return PUSH_FALLBACK_URL;
  if (value.includes('//') || value.includes('..')) return PUSH_FALLBACK_URL;
  // Contrôle APRÈS résolution : « /app/%2e%2e/admin » devient « /admin » une fois analysé.
  try {
    const base = 'https://app.invalid';
    const u = new URL(value, base);
    if (u.origin !== base || !/^\/app(\/|$)/.test(u.pathname)) return PUSH_FALLBACK_URL;
  } catch {
    return PUSH_FALLBACK_URL;
  }
  return value;
}

/** Charge reçue → { title, options } pour showNotification. Ne lève jamais. */
function buildNotification(data) {
  const d = data && typeof data === 'object' ? data : {};
  const title = typeof d.title === 'string' && d.title.trim() ? d.title.slice(0, 120) : PUSH_DEFAULT_TITLE;
  const tag = typeof d.tag === 'string' && d.tag ? d.tag.slice(0, 64) : undefined;
  const options = {
    body: typeof d.body === 'string' ? d.body.slice(0, 240) : '',
    icon: PUSH_ICON,
    badge: PUSH_BADGE,
    // Même tag : la nouvelle notification remplace l'ancienne et sonne de nouveau (renotify).
    tag,
    renotify: Boolean(tag),
    timestamp: Date.now(),
    data: { url: safeAppPath(d.url) },
  };
  if (typeof d.lang === 'string' && PUSH_LANGS.includes(d.lang)) options.lang = d.lang;
  return { title, options };
}

function parsePushData(event) {
  if (!event || !event.data) return {};
  try {
    return event.data.json();
  } catch {
    // Charge non JSON : on l'affiche comme corps (jamais d'exception, sinon le navigateur
    // affiche « Ce site a été mis à jour en arrière-plan »).
    try {
      const text = event.data.text();
      return { body: typeof text === 'string' ? text : '' };
    } catch {
      return {};
    }
  }
}

self.addEventListener('push', (event) => {
  const { title, options } = buildNotification(parsePushData(event));
  // userVisibleOnly : une notification DOIT être affichée pour chaque push reçu.
  event.waitUntil(self.registration.showNotification(title, options));
});

/**
 * Choisit l'onglet à réutiliser : d'abord un onglet déjà sur l'URL cible, sinon un
 * onglet de l'application (/app…), sinon n'importe quel onglet du site. null : ouvrir.
 */
function pickClient(list, targetHref, origin) {
  const same = list.filter((c) => {
    try { return new URL(c.url).origin === origin; } catch { return false; }
  });
  return (
    same.find((c) => c.url === targetHref) ||
    same.find((c) => new URL(c.url).pathname.startsWith('/app')) ||
    same[0] ||
    null
  );
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const target = new URL(safeAppPath(data.url), self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const client = pickClient(list, target, self.location.origin);
      if (!client) return self.clients.openWindow(target);
      const focus = 'focus' in client ? client.focus() : Promise.resolve(client);
      return focus
        .then((c) => {
          const win = c || client;
          if (win.url === target) return win;
          // navigate() rejette si l'onglet n'est pas contrôlé par ce SW : nouvel onglet (catch).
          return win.navigate(target);
        })
        .catch(() => self.clients.openWindow(target));
    })
  );
});

/* --------------------------------------------- pushsubscriptionchange */
// Le service push a renouvelé (ou révoqué) l'abonnement : on se réabonne avec la même clé
// VAPID et on enregistre la nouvelle adresse pour le compte connecté (cookie de session ;
// sans session valide, l'enregistrement échoue silencieusement et l'utilisateur réactivera
// les notifications depuis Préférences). L'ancienne adresse sera purgée au premier envoi
// (404/410 côté serveur).
function base64UrlToBytes(b64) {
  const padding = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function vapidKey(oldSubscription) {
  const fromOld = oldSubscription && oldSubscription.options && oldSubscription.options.applicationServerKey;
  if (fromOld) return fromOld;
  const res = await fetch('/api/push/subscribe', { credentials: 'same-origin', cache: 'no-store' });
  if (!res.ok) return null;
  const body = await res.json().catch(() => null);
  return body && typeof body.publicKey === 'string' && body.publicKey ? base64UrlToBytes(body.publicKey) : null;
}

async function resubscribe(event) {
  // Ancienne adresse retirée d'abord : sinon un compte au plafond d'appareils (10) verrait la
  // nouvelle refusée (409) et cet appareil perdrait ses notifications sans le savoir.
  const old = event.oldSubscription && event.oldSubscription.endpoint;
  if (old) {
    await fetch('/api/push/subscribe', {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: old }),
    }).catch(() => null);
  }
  const sub = event.newSubscription || (await (async () => {
    const key = await vapidKey(event.oldSubscription);
    if (!key) return null;
    return self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  })());
  if (!sub) return false;
  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sub.toJSON()),
  });
  return res.ok;
}

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(resubscribe(event).catch(() => false));
});
