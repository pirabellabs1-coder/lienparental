/**
 * Fuseau horaire PAR UTILISATEUR (preferences.ui.fuseau) : saisie ↔ UTC dans plusieurs fuseaux,
 * clé de jour, rappels, notifications du destinataire, Google Agenda, préférence et validation.
 * Les instants en base restent en UTC ; seules l'interprétation des saisies et l'affichage changent.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.NEXT_PUBLIC_APP_URL = 'https://lienparental.fr'

import {
  DEFAULT_TZ, currentTz, dayKeyInTz, isValidTz, monthKeyInTz, setCurrentTz, timeInTz, todayKey, wallClockDate, wallTimeToIso,
} from '../lib/tz'
import {
  TZ_AUTO, isAllowedTz, isTzPreference, normalizeTzPreference, resolveTz, tzFromPreferencesRow, utcOffsetLabel,
} from '../lib/timezones'
import { eveReminderAt, googleCalendarUrl } from '../lib/calendrier'
import { renderNotification, whenLabel, type Facts } from '../lib/notify/content'
import { dispatch, type DispatchDeps } from '../lib/notify/core'
import { DEFAULT_NOTIF_PREFS } from '../lib/notify/events'
import { toGoogleEvent, type EventRow } from '../lib/integrations/google/event-body'
import { preferencesSchema } from '../lib/auth/validation'

const PARIS = 'Europe/Paris'
const CAYENNE = 'America/Cayenne'
const REUNION = 'Indian/Reunion'

// --- Saisie (jour + heure murale) ↔ instant UTC ----------------------------------------

test('cas du client : 07:35 à Paris (heure d\'hiver) = 06:35Z, et non 10:35Z (Cayenne)', () => {
  const paris = wallTimeToIso('2026-11-02', '07:35', PARIS)
  assert.equal(paris, '2026-11-02T06:35:00.000Z')
  // Ancien comportement (fuseau figé) : 4 h de retard.
  assert.equal(wallTimeToIso('2026-11-02', '07:35', CAYENNE), '2026-11-02T10:35:00.000Z')
  // Même instant lu par un parent réglé sur Cayenne : 03:35, même jour.
  assert.equal(timeInTz(paris, CAYENNE), '03:35')
  assert.equal(dayKeyInTz(paris, CAYENNE), '2026-11-02')
})

test('Paris été / hiver, Cayenne, Réunion : conversions et aller-retour sans décalage', () => {
  const cases: [string, string, string, string][] = [
    [PARIS, '2026-07-10', '07:35', '2026-07-10T05:35:00.000Z'], // CEST, UTC+2
    [PARIS, '2026-01-15', '07:35', '2026-01-15T06:35:00.000Z'], // CET, UTC+1
    [CAYENNE, '2026-07-10', '07:35', '2026-07-10T10:35:00.000Z'], // UTC−3, sans heure d'été
    [REUNION, '2026-07-10', '07:35', '2026-07-10T03:35:00.000Z'], // UTC+4
    [REUNION, '2026-07-10', '02:00', '2026-07-09T22:00:00.000Z'], // la veille en UTC
  ]
  for (const [tz, day, time, iso] of cases) {
    const got = wallTimeToIso(day, time, tz)
    assert.equal(got, iso, `${tz} ${day} ${time}`)
    // Relecture (formulaire de modification) : mêmes jour et heure, aucun glissement.
    assert.equal(dayKeyInTz(got, tz), day)
    assert.equal(timeInTz(got, tz), time)
    // Ré-enregistrement sans changement : instant identique.
    assert.equal(wallTimeToIso(dayKeyInTz(got, tz), timeInTz(got, tz), tz), got)
  }
})

test('Paris : changements d\'heure (saut de printemps, recul d\'automne)', () => {
  // 29 mars 2026, 02:30 n'existe pas : décalé de la durée du saut (03:30 CEST), comme les agendas.
  const spring = wallTimeToIso('2026-03-29', '02:30', PARIS)
  assert.equal(spring, '2026-03-29T01:30:00.000Z')
  assert.equal(timeInTz(spring, PARIS), '03:30')
  // Veille et lendemain du saut : décalages +1 puis +2.
  assert.equal(wallTimeToIso('2026-03-28', '09:00', PARIS), '2026-03-28T08:00:00.000Z')
  assert.equal(wallTimeToIso('2026-03-30', '09:00', PARIS), '2026-03-30T07:00:00.000Z')
  // 25 octobre 2026, 02:30 existe deux fois : un des deux instants, relu 02:30 le même jour.
  const fall = wallTimeToIso('2026-10-25', '02:30', PARIS)
  assert.ok(fall === '2026-10-25T00:30:00.000Z' || fall === '2026-10-25T01:30:00.000Z', fall)
  assert.equal(timeInTz(fall, PARIS), '02:30')
  assert.equal(dayKeyInTz(fall, PARIS), '2026-10-25')
})

test('clé de jour et de mois : dépendent du fuseau de l\'utilisateur', () => {
  // 31 oct. 23:30 UTC : déjà le 1er novembre à Paris (00:30), encore le 31 octobre à Cayenne (20:30).
  const iso = '2026-10-31T23:30:00.000Z'
  assert.equal(dayKeyInTz(iso, PARIS), '2026-11-01')
  assert.equal(monthKeyInTz(iso, PARIS), '2026-11')
  assert.equal(dayKeyInTz(iso, CAYENNE), '2026-10-31')
  assert.equal(monthKeyInTz(iso, CAYENNE), '2026-10')
  assert.equal(todayKey(REUNION, new Date('2026-10-31T20:30:00.000Z')), '2026-11-01')
  assert.equal(todayKey(CAYENNE, new Date('2026-10-31T20:30:00.000Z')), '2026-10-31')
})

// --- Fuseau courant (navigateur) / serveur ----------------------------------------------

test('fuseau courant : DEFAULT_TZ côté serveur, celui de l\'utilisateur dans le navigateur', () => {
  // Serveur (pas de window) : aucun état partagé entre requêtes, setCurrentTz est sans effet.
  setCurrentTz(PARIS)
  assert.equal(currentTz(), DEFAULT_TZ)
  assert.equal(wallTimeToIso('2026-11-02', '07:35'), '2026-11-02T10:35:00.000Z')

  // Navigateur simulé : le provider pose le fuseau, toutes les fonctions le suivent par défaut.
  const g = globalThis as { window?: unknown }
  g.window = {}
  try {
    setCurrentTz(PARIS)
    assert.equal(currentTz(), PARIS)
    const iso = wallTimeToIso('2026-11-02', '07:35')
    assert.equal(iso, '2026-11-02T06:35:00.000Z')
    assert.equal(timeInTz(iso), '07:35')
    assert.equal(dayKeyInTz('2026-10-31T23:30:00.000Z'), '2026-11-01')
    // Rappel « la veille à 20h » dans le fuseau de l'auteur (Paris, hiver : 19:00Z).
    assert.equal(eveReminderAt('2026-11-12T09:00:00.000Z'), '2026-11-11T19:00:00.000Z')
    // Lien « Ajouter à Google Agenda » : ctz = fuseau de l'utilisateur.
    assert.match(googleCalendarUrl({ id: 'e', title: 'T', type: 'autre', start: iso, end: iso }), /ctz=Europe%2FParis/)
    // Fuseau invalide : retour au repli.
    setCurrentTz('Pas/Un_Fuseau')
    assert.equal(currentTz(), DEFAULT_TZ)
    setCurrentTz(REUNION)
    assert.equal(timeInTz('2026-07-10T03:35:00.000Z'), '07:35')
  } finally {
    setCurrentTz(null)
    delete g.window
  }
  assert.equal(currentTz(), DEFAULT_TZ)
})

test('wallClockDate : « maintenant » flottant du planning de garde à l\'heure de l\'utilisateur', () => {
  const now = new Date('2026-11-02T06:35:00.000Z')
  const paris = wallClockDate(PARIS, now)
  assert.deepEqual([paris.getFullYear(), paris.getMonth() + 1, paris.getDate(), paris.getHours(), paris.getMinutes()], [2026, 11, 2, 7, 35])
  const cayenne = wallClockDate(CAYENNE, now)
  assert.deepEqual([cayenne.getDate(), cayenne.getHours(), cayenne.getMinutes()], [2, 3, 35])
})

// --- Rappels ----------------------------------------------------------------------------

test('rappels : 15 min avant un événement à 07:35 Paris = 07:20 Paris (06:20Z) ; « veille 20h » par fuseau', () => {
  const start = wallTimeToIso('2026-11-02', '07:35', PARIS)
  const due = new Date(Date.parse(start) - 15 * 60_000).toISOString()
  assert.equal(due, '2026-11-02T06:20:00.000Z')
  assert.equal(timeInTz(due, PARIS), '07:20')
  // « La veille à 20h » : 20h de l'auteur, selon son fuseau.
  const ev = '2026-11-12T13:00:00.000Z'
  assert.equal(eveReminderAt(ev, PARIS), '2026-11-11T19:00:00.000Z')
  assert.equal(eveReminderAt(ev, CAYENNE), '2026-11-11T23:00:00.000Z')
  assert.equal(eveReminderAt(ev, REUNION), '2026-11-11T16:00:00.000Z')
  // Événement Réunion à 02:00 : la veille locale (pas la veille UTC).
  const early = wallTimeToIso('2026-07-10', '02:00', REUNION)
  assert.equal(eveReminderAt(early, REUNION), '2026-07-09T16:00:00.000Z')
})

// --- Notifications : fuseau et langue du destinataire ------------------------------------

test('whenLabel : heure dans le fuseau du destinataire, dans sa langue', () => {
  const iso = '2026-11-12T13:30:00Z'
  assert.equal(whenLabel(iso, false, 'fr', PARIS), 'le 12 nov. à 14h30')
  assert.equal(whenLabel(iso, false, 'fr', CAYENNE), 'le 12 nov. à 10h30')
  assert.equal(whenLabel(iso, false, 'fr'), 'le 12 nov. à 10h30') // repli DEFAULT_TZ
  assert.match(whenLabel(iso, false, 'en', PARIS), /2:30\sPM/)
  assert.match(whenLabel(iso, false, 'pt', REUNION), /17h30/)
  // Le jour aussi suit le fuseau : 23:30Z le 12 = le 13 à Paris.
  assert.equal(whenLabel('2026-11-12T23:30:00Z', false, 'fr', PARIS), 'le 13 nov. à 0h30')
})

test('rappel et partage d\'événement : rendus avec le fuseau du destinataire', () => {
  const f: Facts = { event: 'calendar_reminder', eventId: 'e1', titre: 'École', startAt: '2026-11-02T06:35:00.000Z', allDay: false }
  const paris = renderNotification(f, 'Julie', new Date('2026-11-02T06:20:00Z'), 'fr', PARIS)
  assert.match(paris.body, /7h35/)
  assert.match(paris.push.body, /7h35/)
  assert.match(paris.email!.html, /7h35/)
  const cayenne = renderNotification(f, 'Thomas', new Date('2026-11-02T06:20:00Z'), 'fr', CAYENNE)
  assert.match(cayenne.body, /3h35/)
  const shared: Facts = { event: 'calendar_shared', eventId: 'e1', action: 'created', actorName: 'Julie', titre: 'École', startAt: '2026-11-02T06:35:00.000Z', allDay: false }
  assert.match(renderNotification(shared, 'Thomas', new Date('2026-11-01T00:00:00Z'), 'fr', CAYENNE).title, /3h35/)
  assert.match(renderNotification(shared, 'Thomas', new Date('2026-11-01T00:00:00Z'), 'en', PARIS).title, /7:35\sAM/)
})

test('dispatch : le fuseau du destinataire (Recipient.tz) atteint in-app, push et e-mail', async () => {
  const sent: { title: string; body: string }[] = []
  const pushes: string[] = []
  const deps: DispatchDeps = {
    loadRecipient: async () => ({ email: 'julie@test.fr', prenom: 'Julie', deleted: false, prefs: DEFAULT_NOTIF_PREFS, locale: 'fr', tz: PARIS }),
    loadFacts: async () => ({ event: 'calendar_reminder', eventId: 'e1', titre: 'École', startAt: '2026-11-02T06:35:00.000Z', allDay: false }),
    insertInApp: async (r) => { sent.push(r) },
    sendPush: async (_u, m) => { pushes.push(m.body); return 1 },
    sendEmail: async () => ({ ok: true }),
    log: () => undefined,
  }
  const r = await dispatch(deps, { userId: 'u', event: 'calendar_reminder', payload: { event_id: 'e1' }, dedupeKey: 'k' })
  assert.equal(r.status, 'ok')
  assert.match(sent[0]!.body, /7h35/)
  assert.match(pushes[0]!, /7h35/)
})

// --- Google Agenda -----------------------------------------------------------------------

test('Google Agenda : start/end.timeZone = fuseau de l\'utilisateur, instants inchangés', () => {
  const ev: EventRow = {
    id: '11111111-2222-3333-4444-555555555555', type: 'ecole', titre: 'Réunion', description: null, lieu: null,
    start_at: '2026-11-02T06:35:00.000Z', end_at: '2026-11-02T07:35:00.000Z', reminder_minutes: 15, deleted_at: null,
  }
  const body = toGoogleEvent(ev, { mask_mode: 'none' }, PARIS)
  assert.deepEqual(body.start, { dateTime: '2026-11-02T06:35:00.000Z', timeZone: PARIS })
  assert.deepEqual(body.end, { dateTime: '2026-11-02T07:35:00.000Z', timeZone: PARIS })
  assert.deepEqual(body.reminders, { useDefault: false, overrides: [{ method: 'popup', minutes: 15 }] })
  // Repli : DEFAULT_TZ.
  assert.equal(toGoogleEvent(ev, { mask_mode: 'none' }).start.timeZone, DEFAULT_TZ)
})

// --- Préférence : validation et résolution ----------------------------------------------

test('validation des fuseaux : IANA reconnus, alias canonisés, rejets', () => {
  for (const tz of [PARIS, CAYENNE, REUNION, 'Indian/Mayotte', 'Pacific/Noumea', 'Pacific/Tahiti', 'America/Paramaribo', 'America/Guyana', 'America/Belem', 'UTC']) {
    assert.ok(isAllowedTz(tz), tz)
  }
  assert.ok(isAllowedTz('America/Montreal')) // alias → America/Toronto
  assert.ok(isAllowedTz('Europe/Berlin')) // hors liste proposée, mais supporté (fuseau d'appareil adopté)
  for (const bad of ['', 'auto', 'Mars/Olympus', '+03:00', 'EST', 'Europe/Paris<script>', 'a'.repeat(80), 42, null]) {
    assert.ok(!isAllowedTz(bad), String(bad))
  }
  assert.ok(isTzPreference(TZ_AUTO))
  assert.equal(normalizeTzPreference('nimporte'), null)
  assert.ok(isValidTz('Europe/Paris') && !isValidTz('Europe/Nowhere'))
})

test('préférences : schéma serveur (zod) du champ fuseau', () => {
  const ok = (fuseau: string) => preferencesSchema.shape.fuseau.safeParse(fuseau).success
  assert.ok(ok(''))
  assert.ok(ok('auto'))
  assert.ok(ok(PARIS))
  assert.ok(!ok('Europe/Nowhere'))
  assert.ok(!ok('<img src=x>'))
})

test('résolution hors navigateur (cron, e-mails, Google) : fixe, auto, absent, invalide', () => {
  assert.equal(resolveTz({ fuseau: PARIS }), PARIS)
  assert.equal(resolveTz({ fuseau: 'auto', fuseauAppareil: REUNION }), REUNION)
  assert.equal(resolveTz({ fuseau: 'auto' }), DEFAULT_TZ)
  assert.equal(resolveTz({ fuseauAppareil: PARIS }), PARIS) // jamais choisi, appareil connu
  assert.equal(resolveTz({ fuseau: 'Pas/Valide' }), DEFAULT_TZ)
  assert.equal(resolveTz(null), DEFAULT_TZ)
  assert.equal(tzFromPreferencesRow({ ui: { fuseau: PARIS } }), PARIS)
  assert.equal(tzFromPreferencesRow({ ui: 'corrompu' }), DEFAULT_TZ)
  assert.equal(tzFromPreferencesRow(null), DEFAULT_TZ)
})

test('libellé de décalage : heure d\'été incluse', () => {
  assert.equal(utcOffsetLabel(PARIS, new Date('2026-01-15T12:00:00Z')), 'UTC+01:00')
  assert.equal(utcOffsetLabel(PARIS, new Date('2026-07-15T12:00:00Z')), 'UTC+02:00')
  assert.equal(utcOffsetLabel(CAYENNE), 'UTC−03:00')
  assert.equal(utcOffsetLabel('UTC'), 'UTC+00:00')
})
