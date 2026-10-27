/** lib/notify : règles de canaux, contournement sécurité, absence de contenu sensible, dispatcher jamais bloquant. */
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.NEXT_PUBLIC_APP_URL = 'https://lienparental.fr'

import { DEFAULT_NOTIF_PREFS, RULES, NOTIFY_EVENTS, decideChannels, prefsFromRow, type NotifPrefs } from '../lib/notify/events'
import { renderNotification, whenLabel, type Facts } from '../lib/notify/content'
import { dispatch, type DispatchDeps, type Recipient } from '../lib/notify/core'
import { coarseIp, deviceHash, deviceIdHash, deviceSalt, maskEmail, newDeviceId, parseUserAgent, signDeviceId, verifyDeviceCookie } from '../lib/notify/device'
import { isAllowedPushEndpoint, subscriptionSchema } from '../lib/notify/subscription'

const allOff: NotifPrefs = { push: false, email: false, rappels: false, topics: { onMessages: false, onGarde: false, onCalendrier: false, onDocuments: false } }
const allOn = DEFAULT_NOTIF_PREFS

// --- Préférences -------------------------------------------------------------------

test('prefsFromRow : clé de thème absente = activée, false explicite = coupée', () => {
  const p = prefsFromRow({ notif_push: true, notif_email: false, notif_rappels: true, ui: { onDocuments: false } })
  assert.equal(p.email, false)
  assert.equal(p.topics.onDocuments, false)
  assert.equal(p.topics.onMessages, true)
  assert.deepEqual(prefsFromRow(null), DEFAULT_NOTIF_PREFS)
})

test('chaque événement a une règle', () => {
  for (const e of NOTIFY_EVENTS) assert.ok(RULES[e], e)
})

// --- Règles ------------------------------------------------------------------------

test('sécurité : préférences ignorées (in-app + e-mail toujours)', () => {
  assert.deepEqual(decideChannels('security_change', allOff), ['inapp', 'email'])
  assert.deepEqual(decideChannels('login_new_device', allOff), ['inapp', 'push', 'email'])
})

test('message reçu : in-app + push immédiat, jamais d\'e-mail', () => {
  assert.deepEqual(decideChannels('message_received', allOn), ['inapp', 'push'])
  assert.deepEqual(decideChannels('message_received', { ...allOn, push: false }), ['inapp'])
  assert.deepEqual(decideChannels('message_received', { ...allOn, topics: { ...allOn.topics, onMessages: false } }), ['inapp'])
})

test('e-mail de messages non lus : respecte notif_email et le thème Messages', () => {
  assert.deepEqual(decideChannels('message_email', allOn), ['email'])
  assert.deepEqual(decideChannels('message_email', { ...allOn, email: false }), [])
  assert.deepEqual(decideChannels('message_email', { ...allOn, topics: { ...allOn.topics, onMessages: false } }), [])
})

test('activité de l\'autre parent : jamais d\'e-mail', () => {
  assert.deepEqual(decideChannels('coparent_activity', allOn), ['inapp', 'push'])
})

test('rappel : rien du tout si notif_rappels est coupé ; e-mail seulement si notif_email', () => {
  assert.deepEqual(decideChannels('calendar_reminder', { ...allOn, rappels: false }), [])
  assert.deepEqual(decideChannels('calendar_reminder', { ...allOn, email: false }), ['inapp', 'push'])
})

test('événement partagé : e-mail exclu au-delà de 14 jours', () => {
  assert.deepEqual(decideChannels('calendar_shared', allOn, { emailEligible: false }), ['inapp', 'push'])
  assert.deepEqual(decideChannels('calendar_shared', allOn, { emailEligible: true }), ['inapp', 'push', 'email'])
})

test('bienvenue : e-mail seul', () => {
  assert.deepEqual(decideChannels('welcome', allOff), ['email'])
})

// --- Contenu -----------------------------------------------------------------------

const SECRET = 'SECRET-contenu-intime'
const texts = (r: ReturnType<typeof renderNotification>) => [r.title, r.body, r.push.title, r.push.body, r.email?.subject ?? '', r.email?.html ?? ''].join('\n')

test('message reçu : prénom de l\'auteur et lien, jamais le texte', () => {
  const r = renderNotification({ event: 'message_received', actorName: 'Thomas', conversationId: 'c-1' }, 'Julie')
  assert.equal(r.push.title, 'Thomas vous a écrit')
  assert.equal(r.href, '/app/messages/c-1')
  assert.equal(r.email, undefined)
})

test('e-mail de messages non lus : nombre et prénom, lien vers la conversation', () => {
  const r = renderNotification({ event: 'message_email', conversationId: '00000000-0000-0000-0000-000000000001', unread: 3, senders: ['Thomas'] }, 'Julie')
  assert.match(r.email!.subject, /Thomas vous a écrit/)
  assert.match(r.email!.html, /3 messages non lus/)
  assert.match(r.email!.html, /\/app\/messages\/00000000-0000-0000-0000-000000000001/)
  assert.match(r.email!.html, /\/app\/profil\/preferences\/notifications/)
})

test('événement partagé : texte attendu, sans description ni lieu', () => {
  const f: Facts = { event: 'calendar_shared', eventId: 'e1', action: 'created', actorName: 'Julie', titre: 'Rendez-vous pédiatre de Lina', startAt: '2026-11-12T13:00:00Z', allDay: false }
  const r = renderNotification(f, 'Thomas', new Date('2026-11-01T00:00:00Z'))
  assert.equal(r.title, 'Julie a ajouté « Rendez-vous pédiatre de Lina » le 12 nov. à 10h')
  assert.equal(r.emailEligible, true)
  const far = renderNotification({ ...f, startAt: '2027-01-20T13:00:00Z' }, 'Thomas', new Date('2026-11-01T00:00:00Z'))
  assert.equal(far.emailEligible, false)
  const del = renderNotification({ ...f, action: 'deleted' }, 'Thomas', new Date('2026-11-01T00:00:00Z'))
  assert.match(del.title, /a annulé/)
})

test('whenLabel : fuseau de l\'application, minutes et journée entière', () => {
  assert.equal(whenLabel('2026-11-12T13:30:00Z'), 'le 12 nov. à 10h30')
  assert.equal(whenLabel('2026-11-12T13:00:00Z', true), 'le 12 nov.')
})

test('aucun tiret cadratin ni « chiffrement de bout en bout » dans les textes', () => {
  const samples: Facts[] = [
    { event: 'login_new_device', appareil: 'iPhone', systeme: 'Safari sur iOS', dateIso: '2026-10-27T12:00:00Z' },
    { event: 'security_change', change: 'password_changed', dateIso: '2026-10-27T12:00:00Z' },
    { event: 'security_change', change: 'account_deletion_requested', dateIso: '2026-10-27T12:00:00Z' },
    { event: 'message_received', actorName: 'Thomas', conversationId: 'c' },
    { event: 'message_email', conversationId: 'c', unread: 1, senders: ['Thomas', 'Rose'] },
    { event: 'coparent_invite_accepted', actorName: 'Thomas', role: 'parent' },
    { event: 'vault_folder_shared', actorName: 'Thomas', folderId: 'f' },
    { event: 'testimony_received', witnessFirstName: 'Anne', reference: 'TMG-2026-0001' },
    { event: 'calendar_reminder', eventId: 'e', titre: 'Kermesse', startAt: '2026-11-12T13:00:00Z', allDay: false },
    { event: 'coparent_activity', entity: 'garde', entityId: 'g', action: 'updated', actorName: 'Thomas' },
    { event: 'coparent_activity', entity: 'expense', entityId: 'x', action: 'created', actorName: 'Thomas' },
    { event: 'welcome' },
  ]
  for (const f of samples) {
    const t = texts(renderNotification(f, 'Julie')).replace(/<!--[\s\S]*?-->/g, '')
    assert.ok(!t.includes('—'), `tiret cadratin dans ${f.event}`)
    assert.ok(!/bout en bout/i.test(t), f.event)
  }
})

test('dossier partagé et témoignage : ni nom de dossier ni texte du témoignage dans push / e-mail', () => {
  const r = renderNotification({ event: 'vault_folder_shared', actorName: 'Thomas', folderId: 'f' }, 'Julie')
  assert.doesNotMatch(texts(r), /Assurance/)
  const t = renderNotification({ event: 'testimony_received', witnessFirstName: 'Anne', reference: 'TMG-1' }, 'Julie')
  assert.doesNotMatch(t.push.body, /Anne/)
})

test('changement d\'adresse : nouvelle adresse masquée', () => {
  assert.equal(maskEmail('martin.dupont@gmail.com'), 'm***@gmail.com')
  const r = renderNotification({ event: 'security_change', change: 'email_change_requested', dateIso: '2026-10-27T12:00:00Z', newEmailMasked: 'm***@gmail.com' }, 'Julie')
  assert.match(r.email!.html, /m\*\*\*@gmail\.com/)
  assert.doesNotMatch(r.email!.html, /martin\.dupont/)
})

// --- Dispatcher (doublures) -------------------------------------------------------

type Calls = { inapp: number; push: number; email: string[] }

function fakeDeps(recipient: Recipient | null, facts: Facts | null, over: Partial<DispatchDeps> = {}): { deps: DispatchDeps; calls: Calls } {
  const calls: Calls = { inapp: 0, push: 0, email: [] }
  const deps: DispatchDeps = {
    loadRecipient: async () => recipient,
    loadFacts: async () => facts,
    insertInApp: async () => { calls.inapp++ },
    sendPush: async () => { calls.push++; return 1 },
    sendEmail: async (a) => { calls.email.push(a.to); return { ok: true } },
    log: () => undefined,
    ...over,
  }
  return { deps, calls }
}

const julie: Recipient = { email: 'julie@test.fr', prenom: 'Julie', deleted: false, prefs: allOn }

test('dispatch : préférences respectées (e-mail coupé)', async () => {
  const { deps, calls } = fakeDeps({ ...julie, prefs: { ...allOn, email: false } }, { event: 'vault_folder_shared', actorName: 'Thomas', folderId: 'f' })
  const r = await dispatch(deps, { userId: 'u', event: 'vault_folder_shared', dedupeKey: 'k' })
  assert.equal(r.status, 'ok')
  assert.deepEqual(r.delivered, ['inapp', 'push'])
  assert.equal(calls.email.length, 0)
})

test('dispatch : sécurité envoyée malgré toutes les préférences coupées', async () => {
  const { deps, calls } = fakeDeps({ ...julie, prefs: allOff }, { event: 'security_change', change: 'mfa_disabled', dateIso: '2026-10-27T12:00:00Z' })
  const r = await dispatch(deps, { userId: 'u', event: 'security_change', payload: { change: 'mfa_disabled' }, dedupeKey: 'k' })
  assert.deepEqual(r.delivered, ['inapp', 'email'])
  assert.deepEqual(calls.email, ['julie@test.fr'])
})

test('dispatch : changement d\'e-mail confirmé → ancienne ET nouvelle adresse', async () => {
  const { deps, calls } = fakeDeps(julie, { event: 'security_change', change: 'email_changed', dateIso: '2026-10-27T12:00:00Z' })
  await dispatch(deps, { userId: 'u', event: 'security_change', payload: { change: 'email_changed', notify_email: 'ancienne@test.fr' }, dedupeKey: 'k' })
  assert.deepEqual(calls.email.sort(), ['ancienne@test.fr', 'julie@test.fr'])
})

test('dispatch : compte supprimé → rien, sauf l\'alerte de suppression (adresse d\'origine seulement)', async () => {
  const gone = { ...julie, email: 'deleted+u@deleted.invalid', deleted: true }
  const a = fakeDeps(gone, { event: 'message_received', actorName: 'T', conversationId: 'c' })
  assert.equal((await dispatch(a.deps, { userId: 'u', event: 'message_received', dedupeKey: 'k' })).status, 'skipped')
  const b = fakeDeps(gone, { event: 'security_change', change: 'account_deletion_requested', dateIso: '2026-10-27T12:00:00Z' })
  await dispatch(b.deps, { userId: 'u', event: 'security_change', payload: { change: 'account_deletion_requested', notify_email: 'julie@test.fr' }, dedupeKey: 'k' })
  assert.deepEqual(b.calls.email, ['julie@test.fr'])
})

test('dispatch : élément disparu (faits null) → ignoré', async () => {
  const { deps, calls } = fakeDeps(julie, null)
  const r = await dispatch(deps, { userId: 'u', event: 'message_email', dedupeKey: 'k' })
  assert.equal(r.status, 'skipped')
  assert.equal(calls.inapp + calls.push + calls.email.length, 0)
})

test('dispatch : un canal en échec n\'empêche pas les autres et ne lève jamais', async () => {
  const { deps, calls } = fakeDeps(julie, { event: 'coparent_invite_accepted', actorName: 'Thomas', role: 'parent' }, {
    sendPush: async () => { throw new Error('push_transient') },
  })
  const r = await dispatch(deps, { userId: 'u', event: 'coparent_invite_accepted', dedupeKey: 'k' })
  assert.equal(r.status, 'partial')
  assert.deepEqual(r.failed, ['push'])
  assert.equal(calls.inapp, 1)
  assert.equal(calls.email.length, 1)
})

test('dispatch : exception du chargement → résultat error, aucune exception', async () => {
  const { deps } = fakeDeps(julie, null, { loadRecipient: async () => { throw new Error('db down') } })
  const r = await dispatch(deps, { userId: 'u', event: 'welcome', dedupeKey: 'k' })
  assert.equal(r.status, 'error')
})

test('dispatch : réessai sans renvoyer les canaux déjà livrés', async () => {
  const { deps, calls } = fakeDeps(julie, { event: 'coparent_invite_accepted', actorName: 'Thomas', role: 'parent' })
  await dispatch(deps, { userId: 'u', event: 'coparent_invite_accepted', dedupeKey: 'k', alreadyDelivered: ['inapp', 'email'] })
  assert.equal(calls.inapp, 0)
  assert.equal(calls.email.length, 0)
  assert.equal(calls.push, 1)
})

test('dispatch : clé d\'idempotence e-mail dérivée de la clé de tâche', async () => {
  const keys: string[] = []
  const { deps } = fakeDeps(julie, { event: 'welcome' }, { sendEmail: async (a) => { keys.push(a.idempotencyKey); return { ok: true } } })
  await dispatch(deps, { userId: 'u', event: 'welcome', dedupeKey: 'welcome:u' })
  assert.deepEqual(keys, ['welcome:u:email:0'])
})

// --- Appareil et abonnement ----------------------------------------------------------

test('empreinte d\'appareil : stable entre versions du navigateur, sensible au réseau grossier', () => {
  const ua1 = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
  const ua2 = ua1.replace('130.0.0.0', '131.0.0.0')
  assert.equal(parseUserAgent(ua1).label, 'Chrome sur Windows')
  assert.equal(deviceHash(ua1, '81.2.3.4', 's'), deviceHash(ua2, '81.2.9.9', 's'))
  assert.notEqual(deviceHash(ua1, '81.2.3.4', 's'), deviceHash(ua1, '90.1.3.4', 's'))
  assert.equal(deviceHash(ua1, '81.2.3.4', null), null)
  assert.equal(coarseIp('2001:db8:abcd:12::1'), '2001:db8:abcd::/48')
  assert.equal(parseUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1').kind, 'iPhone')
})

test('abonnement push : services connus uniquement (pas de SSRF)', () => {
  assert.ok(isAllowedPushEndpoint('https://fcm.googleapis.com/fcm/send/abc'))
  assert.ok(isAllowedPushEndpoint('https://web.push.apple.com/QGx'))
  assert.ok(isAllowedPushEndpoint('https://wns2-par02p.notify.windows.com/w/?token=x'))
  assert.ok(!isAllowedPushEndpoint('https://169.254.169.254/latest/meta-data'))
  assert.ok(!isAllowedPushEndpoint('http://fcm.googleapis.com/fcm/send/abc'))
  assert.ok(!isAllowedPushEndpoint('https://fcm.googleapis.com.evil.com/x'))
  assert.ok(!isAllowedPushEndpoint('https://fcm.googleapis.com:8443/x'))
  assert.equal(subscriptionSchema.safeParse({ endpoint: 'https://fcm.googleapis.com/x', keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) } }).success, true)
})

test('rendez-vous santé : titre générique hors de l’application, titre complet in-app seulement', () => {
  const now = new Date('2026-11-01T00:00:00Z')
  const f: Facts = { event: 'calendar_shared', eventId: 'e1', action: 'created', actorName: 'Julie', titre: 'Psychiatre pour Lina', startAt: '2026-11-12T13:00:00Z', allDay: false, kind: 'sante', childName: 'Lina' }
  const r = renderNotification(f, 'Thomas', now)
  assert.match(r.title, /Psychiatre pour Lina/)
  assert.equal(r.push.body, 'Julie a ajouté « Rendez-vous santé de Lina » le 12 nov. à 10h')
  assert.doesNotMatch(r.push.title + r.push.body + r.email!.subject + r.email!.html, /Psychiatre/)
  const rem = renderNotification({ event: 'calendar_reminder', eventId: 'e1', titre: 'Psychiatre', startAt: '2026-11-12T13:00:00Z', allDay: false, kind: 'sante', childName: null }, 'Julie')
  assert.equal(rem.push.title, 'Rappel : « Rendez-vous santé »')
  assert.doesNotMatch(rem.email!.subject + rem.email!.html, /Psychiatre/)
  assert.match(rem.title, /Psychiatre/)
})

test('textes push : « Ouvrez pour… », jamais « Touchez »', () => {
  for (const f of [
    { event: 'message_received', actorName: 'T', conversationId: 'c' },
    { event: 'vault_folder_shared', actorName: 'T', folderId: 'f' },
    { event: 'coparent_activity', entity: 'garde', entityId: 'g', action: 'updated', actorName: 'T' },
  ] as Facts[]) {
    assert.doesNotMatch(renderNotification(f, 'J').push.body, /Touchez/)
  }
})

test('cookie d’appareil : signé, infalsifiable sans le sel, empreinte stable', () => {
  const salt = 'sel-de-test-suffisamment-long'
  const id = newDeviceId()
  const cookie = signDeviceId(id, salt)
  assert.equal(verifyDeviceCookie(cookie, salt), id)
  assert.equal(verifyDeviceCookie(cookie, 'autre-sel-tout-aussi-long-xx'), null)
  assert.equal(verifyDeviceCookie(`${id}.${'A'.repeat(32)}`, salt), null)
  assert.equal(verifyDeviceCookie('n.importe.quoi', salt), null)
  assert.equal(verifyDeviceCookie(undefined, salt), null)
  assert.match(deviceIdHash(id, salt), /^[0-9a-f]{64}$/)
  assert.notEqual(deviceIdHash(id, salt), deviceIdHash(newDeviceId(), salt))
})

test('sel des empreintes : IP_HASH_SALT ou APP_ENCRYPTION_KEY, jamais la clé service_role', () => {
  assert.equal(deviceSalt({ SUPABASE_SERVICE_ROLE_KEY: 'x'.repeat(40) }), null)
  assert.equal(deviceSalt({ IP_HASH_SALT: 'y'.repeat(32) }), 'y'.repeat(32))
  assert.equal(deviceSalt({ APP_ENCRYPTION_KEY: 'z'.repeat(32) }), 'z'.repeat(32))
  assert.equal(deviceSalt({ IP_HASH_SALT: 'court' }), null)
})

test('cookie d’appareil : exactement deux segments', () => {
  const salt = 'sel-de-test-suffisamment-long'
  const id = newDeviceId()
  const cookie = signDeviceId(id, salt)
  assert.equal(verifyDeviceCookie(`${cookie}.extra`, salt), null)
  assert.equal(verifyDeviceCookie(`x.${cookie}`, salt), null)
  assert.equal(verifyDeviceCookie(cookie, salt), id)
})
