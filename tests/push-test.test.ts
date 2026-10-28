/**
 * « Envoyer une notification de test » : logique pure (lib/notify/push-test.ts), textes
 * FR/EN/PT et garde-fous de la route POST /api/push/test.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  PUSH_TEST_HREF, PUSH_TEST_LIMIT, PUSH_TEST_TAG, PUSH_TEST_WINDOW_MS, pushTestMessage, pushTestStatus, runPushTest,
  type PushTestDeps,
} from '../lib/notify/push-test'
import { MAX_PUSH_FAILURES, pushFailureAction, pushShouldRetry } from '../lib/notify/push-report'

const TEXTS = { title: 'Notification de test', body: 'Tout fonctionne', href: PUSH_TEST_HREF, lang: 'fr' as const }
const report = (r: Partial<{ configured: boolean; total: number; sent: number; expired: number; failed: number }>) =>
  ({ configured: true, total: 0, sent: 0, expired: 0, failed: 0, ...r })

function deps(sendResult: ReturnType<typeof report> | Error, inAppFails = false) {
  const calls = { push: [] as unknown[], inApp: [] as { dedupeKey: string; href: string }[] }
  const d: PushTestDeps = {
    async sendPush(msg) { calls.push.push(msg); if (sendResult instanceof Error) throw sendResult; return sendResult },
    async insertInApp(row) { calls.inApp.push(row); if (inAppFails) throw new Error('inapp_42501') },
  }
  return { d, calls }
}

test('statut : envoyée / aucun appareil / expirés / échec / non configuré', () => {
  assert.equal(pushTestStatus(report({ total: 2, sent: 1, expired: 1 })), 'sent')
  assert.equal(pushTestStatus(report({ total: 0 })), 'no_devices')
  assert.equal(pushTestStatus(report({ total: 2, expired: 2 })), 'expired')
  assert.equal(pushTestStatus(report({ total: 2, expired: 1, failed: 1 })), 'failed')
  assert.equal(pushTestStatus(report({ configured: false })), 'not_configured')
})

test('runPushTest : push sur tous les appareils (tag dédié, lien interne, langue) + ligne in-app', async () => {
  const { d, calls } = deps(report({ total: 2, sent: 2 }))
  const out = await runPushTest(d, 'u1', TEXTS, new Date(1_700_000_000_000))
  assert.deepEqual(out, { status: 'sent', sent: 2, expired: 0, failed: 0, inApp: true })
  assert.deepEqual(calls.push, [{ title: TEXTS.title, body: TEXTS.body, url: PUSH_TEST_HREF, tag: PUSH_TEST_TAG, lang: 'fr' }])
  assert.equal(calls.inApp[0]!.dedupeKey, 'push_test:u1:1700000000000')
  assert.equal(calls.inApp[0]!.href, '/app/profil/preferences/notifications')
})

test('runPushTest : abonnements expirés supprimés → statut expired, compte rendu', async () => {
  const { d } = deps(report({ total: 1, expired: 1 }))
  const out = await runPushTest(d, 'u1', TEXTS)
  assert.equal(out.status, 'expired')
  assert.equal(out.expired, 1)
})

test('runPushTest : jamais d\'exception (lecture des abonnements en échec, in-app en échec)', async () => {
  const { d } = deps(new Error('push_read_XX'), true)
  const out = await runPushTest(d, 'u1', TEXTS)
  assert.deepEqual(out, { status: 'failed', sent: 0, expired: 0, failed: 0, inApp: false })
})

test('message affiché : clé selon le statut et l\'état de CET appareil', () => {
  assert.deepEqual(pushTestMessage({ status: 'sent', sent: 2, expired: 0 }, true), { key: 'result.sent', values: { count: 2 } })
  assert.deepEqual(pushTestMessage({ status: 'sent', sent: 1, expired: 0 }, false), { key: 'result.sentOthers', values: { count: 1 } })
  assert.equal(pushTestMessage({ status: 'no_devices', sent: 0, expired: 0 }, false).key, 'result.noDevices')
  assert.equal(pushTestMessage({ status: 'expired', sent: 0, expired: 1 }, true).key, 'result.expired')
  assert.equal(pushTestMessage({ status: 'failed', sent: 0, expired: 0 }, true).key, 'result.failed')
  assert.equal(pushTestMessage({ status: 'not_configured', sent: 0, expired: 0 }, true).key, 'result.notConfigured')
})

test('textes FR/EN/PT : toutes les clés de la carte et du test existent, pluriel ICU présent', () => {
  const keys = ['hint', 'button', 'sending', 'notifTitle', 'notifBody', 'notReceived',
    'result.sent', 'result.sentOthers', 'result.noDevices', 'result.expired', 'result.failed', 'result.notConfigured', 'result.rateLimited']
  for (const l of ['fr', 'en', 'pt']) {
    const push = JSON.parse(readFileSync(join(process.cwd(), 'messages', l, 'account.json'), 'utf8')).account.push
    for (const k of keys) {
      const v = k.split('.').reduce((o: Record<string, unknown> | undefined, p) => o?.[p] as Record<string, unknown> | undefined, push.test)
      assert.equal(typeof v, 'string', `${l}: account.push.test.${k}`)
    }
    assert.match(push.test.result.sent, /\{count, plural,/)
    for (const p of ['title', 'ios', 'android', 'desktop']) assert.equal(typeof push.blockedHelp[p], 'string', `${l}: blockedHelp.${p}`)
    assert.equal(typeof push.status.iosUpdate, 'string')
  }
})

test('route POST /api/push/test : même origine, session, limite 3 / 10 min, avant tout envoi', () => {
  assert.equal(PUSH_TEST_LIMIT, 3)
  assert.equal(PUSH_TEST_WINDOW_MS, 600_000)
  // Garde-fous structurels (la route dépend de Next/Supabase : on vérifie l'ordre dans la source).
  const src = readFileSync(join(process.cwd(), 'app', 'api', 'push', 'test', 'route.ts'), 'utf8')
  const at = (s: string) => { const i = src.indexOf(s); assert.ok(i > 0, s); return i }
  const origin = at('rejectCrossSiteJson(req)')
  const auth = at('requireAuthedUser()')
  const limit = at("rateLimit(userKey('push-test', userId), PUSH_TEST_LIMIT, PUSH_TEST_WINDOW_MS, { failClosed: true })")
  const send = at('runPushTest(')
  assert.ok(origin < auth && auth < limit && limit < send)
  assert.ok(!/export (async )?function (GET|PUT|DELETE|PATCH)/.test(src), 'POST uniquement')
  // Ne renvoie que le bilan (jamais d'adresse d'abonnement).
  assert.ok(!/endpoint/.test(src.slice(send)))
})

test("envoi push : 404 / 410 ou trop d'échecs → suppression ; autre erreur → réessai", () => {
  assert.equal(pushFailureAction(410, 0), 'delete')
  assert.equal(pushFailureAction(404, 0), 'delete')
  assert.equal(pushFailureAction(500, 0), 'retry')
  assert.equal(pushFailureAction(undefined, 0), 'retry')
  assert.equal(pushFailureAction(503, MAX_PUSH_FAILURES - 1), 'delete')
})

test("envoi push : réessai de la tâche seulement si rien n'est parti et qu'un échec est temporaire", () => {
  assert.equal(pushShouldRetry({ total: 1, sent: 0, expired: 0, failed: 1 }), true)
  assert.equal(pushShouldRetry({ total: 1, sent: 0, expired: 1, failed: 0 }), false)
  assert.equal(pushShouldRetry({ total: 2, sent: 1, expired: 0, failed: 1 }), false)
  assert.equal(pushShouldRetry({ total: 0, sent: 0, expired: 0, failed: 0 }), false)
})
