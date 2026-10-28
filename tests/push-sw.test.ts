/**
 * public/sw.js : gestionnaires push, notificationclick et pushsubscriptionchange.
 * Le VRAI fichier est exécuté dans un bac à sable node:vm avec un faux `self`
 * (enregistrement, onglets, fetch) : aucune copie de la logique.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import vm from 'node:vm'

const SOURCE = readFileSync(join(process.cwd(), 'public', 'sw.js'), 'utf8')
const ORIGIN = 'https://lienparental.fr'

type Listener = (event: Record<string, unknown>) => void
type FakeClient = { url: string; focused: boolean; navigatedTo: string | null; focus(): Promise<FakeClient>; navigate?(u: string): Promise<FakeClient> }

function client(url: string, controlled = true): FakeClient {
  const c: FakeClient = {
    url,
    focused: false,
    navigatedTo: null,
    focus: async () => { c.focused = true; return c },
  }
  if (controlled) c.navigate = async (u: string) => { c.navigatedTo = u; return c }
  return c
}

function load(opts: { clients?: FakeClient[]; fetch?: (url: string, init?: Record<string, unknown>) => Promise<unknown>; subscribe?: (o: unknown) => Promise<unknown> } = {}) {
  const listeners: Record<string, Listener> = {}
  const shown: { title: string; options: Record<string, unknown> }[] = []
  const opened: string[] = []
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, fn: Listener) => { listeners[type] = fn },
    skipWaiting: () => undefined,
    registration: {
      showNotification: async (title: string, options: Record<string, unknown>) => { shown.push({ title, options }) },
      pushManager: { subscribe: opts.subscribe ?? (async () => null) },
    },
    clients: {
      matchAll: async () => opts.clients ?? [],
      openWindow: async (u: string) => { opened.push(u); return null },
      claim: async () => undefined,
    },
  }
  const ctx = vm.createContext({
    self, URL, atob, Uint8Array, Date, JSON, Promise, console,
    fetch: opts.fetch ?? (async () => { throw new Error('offline') }),
    caches: {},
  })
  vm.runInContext(SOURCE, ctx, { filename: 'sw.js' })

  /** Déclenche un événement et attend les promesses passées à waitUntil. */
  async function fire(type: string, event: Record<string, unknown>) {
    const pending: Promise<unknown>[] = []
    listeners[type]!({ ...event, waitUntil: (p: Promise<unknown>) => pending.push(p) })
    await Promise.all(pending)
  }
  const pushEvent = (payload: unknown) => ({
    data: {
      json: () => (typeof payload === 'string' ? JSON.parse(payload) : payload),
      text: () => (typeof payload === 'string' ? payload : JSON.stringify(payload)),
    },
  })
  return { listeners, shown, opened, fire, pushEvent, ctx }
}

// --- push ---------------------------------------------------------------------------

test('push : titre, corps, icône, badge monochrome, tag + renotify, lien interne, langue', async () => {
  const sw = load()
  await sw.fire('push', sw.pushEvent({ title: 'Rappel : Kermesse', body: 'Demain à 10h', url: '/app/calendrier/e1', tag: 'event:e1', lang: 'pt' }))
  assert.equal(sw.shown.length, 1)
  const { title, options } = sw.shown[0]!
  assert.equal(title, 'Rappel : Kermesse')
  assert.equal(options.body, 'Demain à 10h')
  assert.equal(options.icon, '/icons/icon-192.png')
  assert.equal(options.badge, '/brand/badge-96.png')
  assert.equal(options.tag, 'event:e1')
  assert.equal(options.renotify, true)
  assert.equal(options.lang, 'pt')
  assert.deepEqual({ ...(options.data as object) }, { url: '/app/calendrier/e1' })
})

test('push : langue inconnue ignorée, sans tag pas de renotify, textes bornés', async () => {
  const sw = load()
  await sw.fire('push', sw.pushEvent({ title: 'x'.repeat(500), body: 'y'.repeat(500), url: '/app', lang: 'de' }))
  const { title, options } = sw.shown[0]!
  assert.equal(title.length, 120)
  assert.equal((options.body as string).length, 240)
  assert.equal(options.lang, undefined)
  assert.equal(options.tag, undefined)
  assert.equal(options.renotify, false)
})

test('push : charge vide ou non JSON → notification par défaut (jamais d\'exception)', async () => {
  const sw = load()
  await sw.fire('push', { data: null })
  await sw.fire('push', sw.pushEvent('pas du json'))
  assert.equal(sw.shown.length, 2)
  assert.equal(sw.shown[0]!.title, 'Lien Parental')
  assert.equal(sw.shown[1]!.options.body, 'pas du json')
  assert.equal((sw.shown[1]!.options.data as { url: string }).url, '/app/notifications')
})

test('push : URL externe ou détournée → /app/notifications', async () => {
  const sw = load()
  for (const url of ['https://evil.example/app', '//evil.example/app', '/app//evil.example', '/app/../admin', '/app/%2e%2e/admin', '/app/%2E./admin', '/application', '/admin', 'javascript:alert(1)', '/app\\evil', 42]) {
    await sw.fire('push', sw.pushEvent({ title: 't', url }))
  }
  for (const n of sw.shown) assert.equal((n.options.data as { url: string }).url, '/app/notifications')
})

// --- notificationclick ---------------------------------------------------------------

function clickEvent(url: unknown) {
  let closed = false
  return { event: { notification: { data: { url }, close: () => { closed = true } } }, closed: () => closed }
}

test('notificationclick : onglet déjà sur l\'URL → simple focus, sans navigation', async () => {
  const tab = client(`${ORIGIN}/app/calendrier/e1`)
  const sw = load({ clients: [client(`${ORIGIN}/`), tab] })
  const c = clickEvent('/app/calendrier/e1')
  await sw.fire('notificationclick', c.event)
  assert.equal(c.closed(), true)
  assert.equal(tab.focused, true)
  assert.equal(tab.navigatedTo, null)
  assert.deepEqual(sw.opened, [])
})

test('notificationclick : onglet de l\'app ailleurs → focus + navigation vers la cible', async () => {
  const site = client(`${ORIGIN}/aide`)
  const app = client(`${ORIGIN}/app/messages`)
  const sw = load({ clients: [site, app] })
  await sw.fire('notificationclick', clickEvent('/app/calendrier/e1').event)
  assert.equal(app.focused, true)
  assert.equal(app.navigatedTo, `${ORIGIN}/app/calendrier/e1`)
  assert.equal(site.focused, false)
})

test('notificationclick : aucun onglet (ou seulement d\'autres sites) → nouvel onglet ; URL douteuse → /app/notifications', async () => {
  const sw = load({ clients: [client('https://autre.example/app')] })
  await sw.fire('notificationclick', clickEvent('https://evil.example').event)
  assert.deepEqual(sw.opened, [`${ORIGIN}/app/notifications`])
})

test('notificationclick : onglet non contrôlé (pas de navigate) → nouvel onglet sur la cible', async () => {
  const tab = client(`${ORIGIN}/app`, false)
  const sw = load({ clients: [tab] })
  await sw.fire('notificationclick', clickEvent('/app/messages/c1').event)
  assert.equal(tab.focused, true)
  assert.deepEqual(sw.opened, [`${ORIGIN}/app/messages/c1`])
})

test('notificationclick : navigate() rejeté (onglet non contrôlé, cas réel) → nouvel onglet sur la cible', async () => {
  const tab = client(`${ORIGIN}/app/journal`)
  tab.navigate = () => Promise.reject(new TypeError('not controlled'))
  const sw = load({ clients: [tab] })
  await sw.fire('notificationclick', clickEvent('/app/messages/c1').event)
  assert.equal(tab.focused, true)
  assert.deepEqual(sw.opened, [`${ORIGIN}/app/messages/c1`])
})

test('push : chemins internes légitimes conservés (requête comprise)', async () => {
  const sw = load()
  for (const url of ['/app', '/app/calendrier/3f2a-11', '/app/messages?c=abc&x=1']) await sw.fire('push', sw.pushEvent({ url }))
  assert.deepEqual(sw.shown.map(n => (n.options.data as { url: string }).url), ['/app', '/app/calendrier/3f2a-11', '/app/messages?c=abc&x=1'])
})

// --- pushsubscriptionchange --------------------------------------------------------------

test('pushsubscriptionchange : nouvel abonnement fourni → enregistré par POST /api/push/subscribe', async () => {
  const calls: { url: string; init?: Record<string, unknown> }[] = []
  const sw = load({ fetch: async (url, init) => { calls.push({ url, init }); return { ok: true } } })
  const json = { endpoint: 'https://fcm.googleapis.com/fcm/send/new', keys: { p256dh: 'p', auth: 'a' } }
  await sw.fire('pushsubscriptionchange', { newSubscription: { toJSON: () => json }, oldSubscription: null })
  assert.equal(calls.length, 1)
  assert.equal(calls[0]!.url, '/api/push/subscribe')
  assert.equal(calls[0]!.init?.method, 'POST')
  assert.equal(calls[0]!.init?.credentials, 'same-origin')
  assert.deepEqual(JSON.parse(calls[0]!.init?.body as string), json)
})

test('pushsubscriptionchange : sans nouvel abonnement → réabonnement avec la clé VAPID de l\'ancien', async () => {
  const key = new Uint8Array([1, 2, 3])
  let subscribedWith: unknown = null
  const calls: string[] = []
  const sw = load({
    subscribe: async (o) => { subscribedWith = o; return { toJSON: () => ({ endpoint: 'https://push.example/n', keys: { p256dh: 'p', auth: 'a' } }) } },
    fetch: async (url, init) => { calls.push(`${(init?.method as string) ?? 'GET'} ${url}`); return { ok: true } },
  })
  await sw.fire('pushsubscriptionchange', { oldSubscription: { endpoint: 'https://push.example/old', options: { applicationServerKey: key } } })
  // Objet créé dans le bac à sable (autre royaume) : on compare champ par champ.
  const opts = subscribedWith as { userVisibleOnly: boolean; applicationServerKey: Uint8Array }
  assert.equal(opts.userVisibleOnly, true)
  assert.equal(opts.applicationServerKey, key)
  // Ancienne adresse retirée d'abord (plafond de 10 appareils), puis nouvelle enregistrée.
  assert.deepEqual(calls, ['DELETE /api/push/subscribe', 'POST /api/push/subscribe'])
})

test('pushsubscriptionchange : clé inconnue → lue sur GET /api/push/subscribe ; échec réseau avalé', async () => {
  let subscribedKey: Uint8Array | null = null
  const sw = load({
    subscribe: async (o) => { subscribedKey = (o as { applicationServerKey: Uint8Array }).applicationServerKey; return { toJSON: () => ({}) } },
    fetch: async (_url, init) => {
      if (!init?.method) return { ok: true, json: async () => ({ publicKey: 'AQID' }) }
      throw new Error('offline')
    },
  })
  await sw.fire('pushsubscriptionchange', { oldSubscription: null })
  assert.deepEqual(Array.from(subscribedKey ?? []), [1, 2, 3])
})
