/** Modération des comptes (0500) : état dérivé du ban, transitions autorisées, validation stricte, e-mails et notifications. */
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.NEXT_PUBLIC_APP_URL = 'https://lienparental.fr'

import {
  DEACTIVATION_BAN, REASON_ADMIN, REASON_DELETED, REASON_SELF, actionAvailability, actionBodySchema, banDurationFor,
  durationLabelOf, legacyStatus, moderationState, restoreBanDuration, stateLabel, suspensionUntil, targetBlockReason,
  visibleActions, type ActionBody, type ModerationTarget,
} from '../lib/admin/ops/moderation'
import { accountModerationEmail } from '../lib/email/templates/accountModeration'
import { renderNotification } from '../lib/notify/content'
import { DEFAULT_NOTIF_PREFS, RULES, decideChannels } from '../lib/notify/events'
import { dispatch, type DispatchDeps } from '../lib/notify/core'

const NOW = Date.parse('2026-10-28T12:00:00Z')
const H = 3_600_000
const D = 24 * H
const iso = (ms: number) => new Date(ms).toISOString()

// --- État dérivé du ban GoTrue -----------------------------------------------------------------

test('moderationState : supprimé > ban en cours > vérification', () => {
  assert.deepEqual(moderationState({ deletedAt: iso(NOW), bannedUntil: iso(NOW + D), emailVerified: true }, NOW), { state: 'supprime', until: null })
  assert.deepEqual(moderationState({ deletedAt: null, bannedUntil: iso(NOW + 3 * D), emailVerified: true }, NOW), { state: 'suspendu', until: iso(NOW + 3 * D) })
  assert.deepEqual(moderationState({ deletedAt: null, bannedUntil: null, emailVerified: true }, NOW), { state: 'actif', until: null })
  assert.deepEqual(moderationState({ deletedAt: null, bannedUntil: null, emailVerified: false }, NOW), { state: 'non_verifie', until: null })
})

test('moderationState : une suspension échue redevient active (expiration du ban GoTrue)', () => {
  assert.equal(moderationState({ deletedAt: null, bannedUntil: iso(NOW - 1), emailVerified: true }, NOW).state, 'actif')
  assert.equal(moderationState({ deletedAt: null, bannedUntil: iso(NOW - H), emailVerified: false }, NOW).state, 'non_verifie')
  assert.equal(moderationState({ deletedAt: null, bannedUntil: 'pas une date', emailVerified: true }, NOW).state, 'actif')
})

test('moderationState : ban de ~100 ans = désactivé (sans date), 30 jours = suspendu', () => {
  assert.deepEqual(moderationState({ deletedAt: null, bannedUntil: iso(NOW + 100 * 365 * D), emailVerified: true }, NOW), { state: 'desactive', until: null })
  assert.equal(moderationState({ deletedAt: null, bannedUntil: iso(NOW + 30 * D), emailVerified: true }, NOW).state, 'suspendu')
  assert.equal(legacyStatus('desactive'), 'suspendu')
  assert.equal(legacyStatus('actif'), 'actif')
})

test('stateLabel : « Suspendu jusqu’au … » avec la date formatée', () => {
  assert.equal(stateLabel({ state: 'suspendu', until: '2026-11-04T12:00:00.000Z' }, () => '04/11/2026 08:00'), 'Suspendu jusqu’au 04/11/2026 08:00')
  assert.equal(stateLabel({ state: 'desactive', until: null }, () => 'x'), 'Désactivé')
  assert.equal(stateLabel({ state: 'non_verifie', until: null }, () => 'x'), 'Non vérifié')
})

// --- Transitions --------------------------------------------------------------------------------

const target = (o: Partial<ModerationTarget> = {}): ModerationTarget => ({ state: 'actif', until: null, isAdmin: false, isSelf: false, emailVerified: true, ...o })

test('transitions : compte actif', () => {
  const a = actionAvailability(target())
  assert.equal(a.warn.allowed, true)
  assert.equal(a.suspend.allowed, true)
  assert.equal(a.deactivate.allowed, true)
  assert.equal(a.reactivate.allowed, false)
  assert.equal(a.resend_verification.allowed, false) // e-mail déjà vérifié
  assert.equal(a.delete.allowed, true)
})

test('transitions : suspendu → réactiver ou désactiver, pas de nouvelle suspension', () => {
  const a = actionAvailability(target({ state: 'suspendu', until: iso(NOW + D) }))
  assert.equal(a.reactivate.allowed, true)
  assert.equal(a.deactivate.allowed, true)
  assert.equal(a.suspend.allowed, false)
  assert.equal(a.warn.allowed, true)
  const d = actionAvailability(target({ state: 'desactive' }))
  assert.equal(d.reactivate.allowed, true)
  assert.equal(d.deactivate.allowed, false)
  assert.equal(d.suspend.allowed, false)
})

test('transitions : soi-même, administrateur et compte supprimé refusés, avec la raison', () => {
  const self = actionAvailability(target({ isSelf: true, isAdmin: true }))
  for (const v of Object.values(self)) assert.deepEqual(v, { allowed: false, code: 'forbidden', reason: REASON_SELF })

  const admin = actionAvailability(target({ isAdmin: true }))
  for (const k of ['warn', 'suspend', 'deactivate', 'reactivate', 'delete'] as const) {
    assert.deepEqual(admin[k], { allowed: false, code: 'forbidden', reason: REASON_ADMIN }, k)
  }
  assert.equal(admin.force_logout.allowed, true) // session compromise d'un collègue

  const del = actionAvailability(target({ state: 'supprime' }))
  for (const v of Object.values(del)) assert.deepEqual(v, { allowed: false, code: 'conflict', reason: REASON_DELETED })

  assert.equal(targetBlockReason(target({ isAdmin: true })), REASON_ADMIN)
  assert.equal(targetBlockReason(target()), null)
})

test('visibleActions : Désactiver ou Réactiver selon l’état ; vérification si e-mail non vérifié', () => {
  assert.deepEqual(visibleActions({ state: 'actif', emailVerified: true }), ['warn', 'suspend', 'deactivate', 'force_logout', 'delete'])
  assert.deepEqual(visibleActions({ state: 'suspendu', emailVerified: true }), ['warn', 'suspend', 'reactivate', 'deactivate', 'force_logout', 'delete'])
  assert.deepEqual(visibleActions({ state: 'desactive', emailVerified: false }), ['warn', 'suspend', 'reactivate', 'force_logout', 'resend_verification', 'delete'])
})

// --- Validation stricte -------------------------------------------------------------------------

const ok = (b: unknown) => actionBodySchema.safeParse(b).success

test('validation : motif obligatoire et dans la liste', () => {
  assert.equal(ok({ action: 'warn', reason: 'spam' }), true)
  assert.equal(ok({ action: 'warn' }), false)
  assert.equal(ok({ action: 'warn', reason: 'inconnu' }), false)
  assert.equal(ok({ action: 'deactivate', reason: 'fraude', details: 'Paiements contestés à répétition.' }), true)
  assert.equal(ok({ action: 'deactivate', details: 'sans motif' }), false)
})

test('validation : « autre » exige des précisions (10 caractères), 500 au maximum', () => {
  assert.equal(ok({ action: 'warn', reason: 'autre' }), false)
  assert.equal(ok({ action: 'warn', reason: 'autre', details: '   court   ' }), false)
  assert.equal(ok({ action: 'warn', reason: 'autre', details: 'Précisions suffisantes.' }), true)
  assert.equal(ok({ action: 'warn', reason: 'spam', details: 'x'.repeat(500) }), true)
  assert.equal(ok({ action: 'warn', reason: 'spam', details: 'x'.repeat(501) }), false)
})

test('validation : durées de suspension 24 h / 3 / 7 / 30 jours uniquement', () => {
  for (const d of ['24h', '3d', '7d', '30d']) assert.equal(ok({ action: 'suspend', duration: d, reason: 'harcelement' }), true, d)
  assert.equal(ok({ action: 'suspend', reason: 'harcelement' }), false)
  assert.equal(ok({ action: 'suspend', duration: '2d', reason: 'harcelement' }), false)
  assert.equal(ok({ action: 'suspend', duration: 720, reason: 'harcelement' }), false)
})

test('validation .strict() : champ inconnu ou inattendu refusé', () => {
  assert.equal(ok({ action: 'warn', reason: 'spam', admin_id: 'x' }), false)
  assert.equal(ok({ action: 'warn', reason: 'spam', duration: '7d' }), false)
  assert.equal(ok({ action: 'reactivate', reason: 'spam' }), false)
  assert.equal(ok({ action: 'reactivate' }), true)
  assert.equal(ok({ action: 'force_logout', reason: 'spam' }), false)
  assert.equal(ok({ action: 'force_logout' }), true)
  assert.equal(ok({ action: 'suspend_forever', reason: 'spam' }), false)
  assert.equal(ok(null), false)
  assert.equal(ok('warn'), false)
})

// --- Ban GoTrue et durées ---------------------------------------------------------------------------

test('ban GoTrue : durée de la suspension, désactivation longue, réactivation = none', () => {
  const b = (x: unknown) => banDurationFor(actionBodySchema.parse(x) as ActionBody)
  assert.equal(b({ action: 'suspend', duration: '24h', reason: 'spam' }), '24h')
  assert.equal(b({ action: 'suspend', duration: '3d', reason: 'spam' }), '72h')
  assert.equal(b({ action: 'suspend', duration: '30d', reason: 'spam' }), '720h')
  assert.equal(b({ action: 'deactivate', reason: 'spam' }), DEACTIVATION_BAN)
  assert.equal(b({ action: 'reactivate' }), 'none')
  assert.equal(b({ action: 'warn', reason: 'spam' }), null)
  assert.equal(suspensionUntil('7d', NOW), iso(NOW + 7 * D))
})

test('restoreBanDuration : rétablit le ban antérieur (annulation) ou le lève', () => {
  assert.equal(restoreBanDuration(null, NOW), 'none')
  assert.equal(restoreBanDuration(iso(NOW - H), NOW), 'none')
  assert.equal(restoreBanDuration(iso(NOW + 2.5 * H), NOW), '3h')
})

test('durationLabelOf : durée lisible d’une suspension du journal', () => {
  assert.equal(durationLabelOf(iso(NOW), iso(NOW + 72 * H)), '3 jours')
  assert.equal(durationLabelOf(iso(NOW), iso(NOW + 24 * H)), '24 heures')
  assert.equal(durationLabelOf(iso(NOW), iso(NOW + 5 * H)), '5 h')
  assert.equal(durationLabelOf(iso(NOW), null), null)
})

// --- E-mail et notification (langue du destinataire) -----------------------------------------------

test('e-mail : motif traduit, précisions échappées, date de fin, aucune donnée technique', () => {
  const x = '<img src=x onerror=alert(1)>'
  const fr = accountModerationEmail({ prenom: x, kind: 'suspension', reasonCode: 'harcelement', details: x, until: '2026-11-04T15:00:00Z' }, 'fr')
  assert.ok(!fr.html.includes('<img src=x'), 'précisions et prénom échappés')
  assert.match(fr.html, /Harcèlement, menaces ou intimidation/)
  assert.match(fr.html, /4 novembre 2026/)
  assert.match(fr.html, /contact@lienparental\.fr/)
  assert.match(fr.html, /\/legal\/cgu/)
  assert.ok(!/ban|876000|GoTrue|moderation_id/i.test(fr.html))
  assert.equal(fr.subject, 'Votre compte Lien Parental est suspendu temporairement')

  const en = accountModerationEmail({ prenom: 'Sam', kind: 'warning', reasonCode: 'spam' }, 'en')
  assert.match(en.subject, /warning/i)
  assert.match(en.html, /Spam or abusive solicitations/)
  assert.match(en.html, /lang="en/)
  assert.match(en.html, /\/en\/legal\/cgu/)

  const pt = accountModerationEmail({ prenom: 'Ana', kind: 'reactivation' }, 'pt')
  assert.match(pt.subject, /reativada/)
  assert.ok(!pt.html.includes('Motivo:'), 'pas de motif pour une réactivation')
})

test('notification in-app : motif sans les précisions, lien vers l’aide, date de fin dans le titre', () => {
  const r = renderNotification({ event: 'account_moderation', kind: 'suspension', reasonCode: 'spam', details: 'texte interne', until: '2026-11-04T15:00:00Z' }, 'Camille', new Date(NOW), 'fr')
  assert.match(r.title, /suspendu jusqu’au 4 novembre 2026/)
  assert.match(r.body, /Spam ou sollicitations abusives/)
  assert.ok(!r.body.includes('texte interne'))
  assert.equal(r.href, '/app/aide')
  assert.ok(r.email)
  const w = renderNotification({ event: 'account_moderation', kind: 'warning', reasonCode: 'contenu', details: null, until: null }, '', new Date(NOW), 'pt')
  assert.match(w.title, /Advertência/)
})

test('notification : toujours in-app + e-mail, même préférences coupées ; jamais de push', async () => {
  assert.equal(RULES.account_moderation.security, true)
  const off = { push: false, email: false, rappels: false, topics: { onMessages: false, onGarde: false, onCalendrier: false, onDocuments: false } }
  assert.deepEqual(decideChannels('account_moderation', off), ['inapp', 'email'])
  assert.deepEqual(decideChannels('account_moderation', DEFAULT_NOTIF_PREFS), ['inapp', 'email'])

  const sent: string[] = []
  const deps: DispatchDeps = {
    loadRecipient: async () => ({ email: 'camille@exemple.fr', prenom: 'Camille', deleted: false, prefs: off, locale: 'en' }),
    loadFacts: async () => ({ event: 'account_moderation', kind: 'deactivation', reasonCode: 'usurpation', details: null, until: null }),
    insertInApp: async (row) => { sent.push(`inapp:${row.title}`) },
    sendPush: async () => { sent.push('push'); return 1 },
    sendEmail: async (a) => { sent.push(`email:${a.subject}`); return { ok: true } },
    log: () => {},
  }
  const res = await dispatch(deps, { userId: 'u', event: 'account_moderation', dedupeKey: 'moderation:1' })
  assert.equal(res.status, 'ok')
  assert.deepEqual(sent, ['inapp:Your account has been deactivated', 'email:Your Lien Parental account has been deactivated'])
})
