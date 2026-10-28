/**
 * Rappels du calendrier (cron /api/cron/notifications → notif_enqueue_calendar_reminders, 0440
 * → file → dispatch) : canaux push + in-app + e-mail selon les préférences, contenu clair.
 * Les dates ne sont pas vérifiées au caractère près (formatage / fuseaux : tests/tz.test.ts).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

process.env.NEXT_PUBLIC_APP_URL = 'https://lienparental.fr'

import { DEFAULT_NOTIF_PREFS, type NotifPrefs } from '../lib/notify/events'
import { dispatch, type DispatchDeps, type PushMessage, type Recipient } from '../lib/notify/core'
import type { Facts } from '../lib/notify/content'

const allOn = DEFAULT_NOTIF_PREFS
const julie: Recipient = { email: 'julie@test.fr', prenom: 'Julie', deleted: false, prefs: allOn }
const START = '2026-11-12T13:00:00Z'
const facts: Facts = { event: 'calendar_reminder', eventId: 'e1', titre: 'Dentiste de Lina', startAt: START, allDay: false, kind: 'sante', childName: 'Lina' }

function run(prefs: NotifPrefs, locale: Recipient['locale'] = 'fr') {
  const sent = { inapp: [] as { title: string; body: string; href: string }[], push: [] as PushMessage[], email: [] as { to: string; subject: string; html: string }[] }
  const deps: DispatchDeps = {
    loadRecipient: async () => ({ ...julie, prefs, locale }),
    loadFacts: async () => facts,
    insertInApp: async (r) => { sent.inapp.push(r) },
    sendPush: async (_u, m) => { sent.push.push(m); return 1 },
    sendEmail: async (a) => { sent.email.push(a); return { ok: true } },
    log: () => undefined,
  }
  return { sent, go: () => dispatch(deps, { userId: 'u', event: 'calendar_reminder', payload: { event_id: 'e1', start_at: START }, dedupeKey: 'calendar_reminder:e1:u:1' }) }
}

test('rappel : tout activé → in-app + push + e-mail, lien vers l\'événement', async () => {
  const { sent, go } = run(allOn)
  const r = await go()
  assert.equal(r.status, 'ok')
  assert.deepEqual(r.delivered, ['inapp', 'push', 'email'])
  assert.equal(sent.inapp[0]!.href, '/app/calendrier/e1')
  assert.equal(sent.push[0]!.url, '/app/calendrier/e1')
  assert.equal(sent.push[0]!.tag, 'event:e1')
  assert.ok(sent.push[0]!.title.length > 0 && sent.push[0]!.body.length > 0)
  assert.equal(sent.email[0]!.to, 'julie@test.fr')
  assert.ok(sent.email[0]!.subject.length > 0)
  assert.match(sent.email[0]!.html, /\/app\/calendrier\/e1/)
})

test('rappel : contenu clair — titre de l\'événement en in-app, quand dans le corps', async () => {
  const { sent, go } = run(allOn)
  await go()
  assert.match(sent.inapp[0]!.title, /Dentiste de Lina/)
  assert.ok(sent.inapp[0]!.body.trim().length > 3)
  // Push : texte court, borné par le SW (120 / 240).
  assert.ok(sent.push[0]!.title.length <= 120 && sent.push[0]!.body.length <= 240)
})

test('rappel : préférences respectées (push coupé, e-mail coupé, thème Calendrier coupé, rappels coupés)', async () => {
  assert.deepEqual((await run({ ...allOn, push: false }).go()).delivered, ['inapp', 'email'])
  assert.deepEqual((await run({ ...allOn, email: false }).go()).delivered, ['inapp', 'push'])
  assert.deepEqual((await run({ ...allOn, topics: { ...allOn.topics, onCalendrier: false } }).go()).delivered, ['inapp'])
  const off = await run({ ...allOn, rappels: false }).go()
  assert.equal(off.delivered.length, 0)
})

test('rappel : textes dans la langue du destinataire (EN / PT différents du FR)', async () => {
  const fr = run(allOn, 'fr'); await fr.go()
  const en = run(allOn, 'en'); await en.go()
  const pt = run(allOn, 'pt'); await pt.go()
  assert.notEqual(en.sent.email[0]!.subject, fr.sent.email[0]!.subject)
  assert.notEqual(pt.sent.email[0]!.subject, fr.sent.email[0]!.subject)
  assert.notEqual(en.sent.push[0]!.title, fr.sent.push[0]!.title)
})

test('cron : planifié toutes les 5 min et enchaîne mise en file des rappels puis livraison', () => {
  const vercel = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')) as { crons: { path: string; schedule: string }[] }
  assert.ok(vercel.crons.some(c => c.path === '/api/cron/notifications' && c.schedule === '*/5 * * * *'))
  const jobs = readFileSync(join(process.cwd(), 'lib', 'notify', 'jobs.ts'), 'utf8')
  const enqueue = jobs.indexOf("rpc('notif_enqueue_calendar_reminders'")
  const deliver = jobs.indexOf('processBatch(db, batch, null, report)')
  assert.ok(enqueue > 0 && deliver > enqueue)
})
