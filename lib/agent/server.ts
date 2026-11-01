import 'server-only'
/**
 * Agent d'accueil — opérations publiques (chatbot du site aujourd'hui ; WhatsApp et standard
 * téléphonique demain, mêmes fonctions) : base de connaissances active, créneaux, réservation,
 * gestion par lien sécurisé, demande de rappel, disponibilité d'un représentant, rappels de rendez-vous.
 *
 * Toutes les écritures passent par le serveur (service_role) ; le navigateur ne voit jamais de clé.
 * Le jeton de gestion d'un rendez-vous n'est conservé qu'en empreinte SHA-256.
 */
import { createHash, randomBytes } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email/send'
import { agentAppointmentEmail, agentTeamEmail } from '@/lib/email/templates/agentAppointment'
import { CONTACT_EMAIL, SITE } from '@/lib/seo/site'
import {
  PENDING_MS, availableNow, canChange, computeSlots, dueReminder, fillMessage, liveEntries, makeRef, mergeMessages, repsForStart, slotLabel,
  type AgentLocale, type Channel, type KbEntry, type MessageKey, type Slot,
} from './core'
import {
  LIVE, appointmentByTokenHash, appointmentsByPhone, expirePending, insertAppointment, insertCallback, insertEvent, readBusy, readKbCandidates, readMessages,
  readReps, readServices, readTypes, rescheduleAppointment, svc, toType, updateAppointment, APPT_COLUMNS, type AppointmentRow,
} from './repo'

const db = (): SupabaseClient | null => (LIVE ? svc() : null)
const hashToken = (t: string) => createHash('sha256').update(t).digest('hex')
/** Adresse de l'équipe pour les avis internes (AGENT_TEAM_EMAIL, sinon contact@). */
const TEAM_EMAIL = process.env.AGENT_TEAM_EMAIL?.trim() || CONTACT_EMAIL

export class AgentError extends Error {
  constructor(readonly code: 'not_found' | 'slot_taken' | 'too_late' | 'expired' | 'duplicate' | 'limit' | 'invalid' | 'unavailable', message = code) {
    super(message)
  }
}

// --- Base de connaissances et textes (cache 60 s : une publication se propage en une minute) ---

type Cache<T> = { at: number; value: T }
const cache: { kb?: Cache<KbEntry[]>; messages?: Cache<{ msg_key: string; locale: string; text: string }[]> } = {}
const TTL = 60_000

export async function liveKb(locale: AgentLocale): Promise<KbEntry[]> {
  const now = Date.now()
  if (!cache.kb || now - cache.kb.at > TTL) {
    try {
      cache.kb = { at: now, value: await readKbCandidates(db()) }
    } catch (e) {
      console.warn('[agent] base de connaissances indisponible :', e instanceof Error ? e.message : e)
      cache.kb = { at: now - TTL + 10_000, value: cache.kb?.value ?? [] }
    }
  }
  return liveEntries(cache.kb.value, now).filter((e) => e.locale === locale)
}

export async function messagesFor(locale: AgentLocale): Promise<Record<MessageKey, string>> {
  const now = Date.now()
  if (!cache.messages || now - cache.messages.at > TTL) {
    try {
      cache.messages = { at: now, value: await readMessages(db()) }
    } catch {
      cache.messages = { at: now - TTL + 10_000, value: cache.messages?.value ?? [] }
    }
  }
  return mergeMessages(cache.messages.value, locale)
}

/** Invalide les caches après une modification du back-office (même instance serveur). */
export function invalidateAgentCache() {
  delete cache.kb
  delete cache.messages
}

// --- Configuration publique du widget ------------------------------------------------------

export type PublicConfig = {
  messages: Record<MessageKey, string>
  types: { code: string; label: string; service: string }[]
  services: { code: string; label: string }[]
  email: string
}

export async function publicConfig(locale: AgentLocale): Promise<PublicConfig> {
  const [messages, types, services] = await Promise.all([messagesFor(locale), readTypes(db()).catch(() => []), readServices(db()).catch(() => [])])
  const label = (s: { label_fr: string; label_en: string; label_pt: string }) => (locale === 'en' ? s.label_en : locale === 'pt' ? s.label_pt : s.label_fr)
  return {
    messages,
    types: types.filter((t) => t.active).map((t) => ({ code: t.code, label: toType(t).labels[locale], service: t.service })),
    // « Sujet sensible » : jamais proposé comme bouton, l'agent y oriente lui-même.
    services: services.filter((s) => s.active && s.code !== 'sensible').map((s) => ({ code: s.code, label: label(s) })),
    email: CONTACT_EMAIL,
  }
}

// --- Créneaux et réservation -----------------------------------------------------------------

async function context(typeCode: string) {
  const d = db()
  const [types, reps] = await Promise.all([readTypes(d), readReps(d)])
  const row = types.find((t) => t.code === typeCode && t.active)
  if (!row) throw new AgentError('not_found')
  const type = toType(row)
  const now = Date.now()
  const busy = await readBusy(d, new Date(now - 86_400_000).toISOString(), new Date(now + (type.horizonDays + 1) * 86_400_000).toISOString())
  return { d, type, reps, busy, now }
}

export type SlotView = { start: string; date: string; time: string }

export async function listSlots(typeCode: string, language: AgentLocale, afterIso?: string): Promise<SlotView[]> {
  const { type, reps, busy, now } = await context(typeCode)
  const after = afterIso ? Date.parse(afterIso) : undefined
  const slots = computeSlots({ type, language, reps, busy, nowMs: now, afterMs: Number.isFinite(after) ? after : undefined })
  return slots.map((s: Slot) => ({ start: s.start, ...slotLabel(s.start, language) }))
}

export type BookInput = {
  typeCode: string
  language: AgentLocale
  start: string
  name: string
  phone?: string
  email: string
  reason?: string
  channel: Channel
  remindersConsent: boolean
}

export type Booked = { ref: string; start: string; date: string; time: string; emailSent: boolean }

const manageUrl = (token: string) => `${SITE}/rendez-vous/${token}`
/** Envoi réel (démo ou clé absente : « skipped », on n'annonce pas un e-mail qui ne partira pas). */
const delivered = (r: Awaited<ReturnType<typeof sendEmail>>) => r.ok && !('skipped' in r && r.skipped)

/**
 * Réservation depuis le site : créneau tenu 30 min (statut « pending ») et e-mail NEUTRE de
 * confirmation (ni nom ni motif saisis : pas de relais de texte vers une adresse tierce). Le
 * rendez-vous n'est confirmé, l'équipe prévenue et les rappels programmés qu'après le clic.
 */
export async function bookAppointment(input: BookInput): Promise<Booked> {
  const { d, type, reps, busy, now } = await context(input.typeCode)
  const startMs = Date.parse(input.start)
  if (!Number.isFinite(startMs)) throw new AgentError('invalid')
  const candidates = repsForStart({ type, language: input.language, reps, busy, nowMs: now, startMs })
  if (!candidates.length) throw new AgentError('slot_taken')
  const token = randomBytes(24).toString('base64url')
  const ref = makeRef(randomBytes(6))
  let chosen = false
  for (const rep of candidates) {
    const res = await insertAppointment(d, {
      id: crypto.randomUUID(), ref, type_code: type.code, service: type.service, representative_id: rep.id,
      starts_at: new Date(startMs).toISOString(), ends_at: new Date(startMs + type.durationMin * 60_000).toISOString(),
      busy_until: new Date(startMs + (type.durationMin + type.bufferMin) * 60_000).toISOString(),
      contact_name: input.name, contact_phone: input.phone ?? null, contact_email: input.email,
      language: input.language, reason: input.reason ?? null, channel: input.channel, confirm_channel: 'email',
      reminders_consent: input.remindersConsent, manage_token_hash: hashToken(token), rescheduled_from: null, status: 'pending',
    })
    if (res === 'ok') {
      chosen = true
      break
    }
  }
  if (!chosen) throw new AgentError('slot_taken')
  const label = slotLabel(new Date(startMs).toISOString(), input.language)
  const mail = agentAppointmentEmail({ kind: 'verify', locale: input.language, ...label, topic: type.labels[input.language], ref, manageUrl: manageUrl(token) })
  const emailSent = delivered(await sendEmail({ to: input.email, ...mail, idempotencyKey: `agent-verify-${ref}` }))
  // Démonstration (aucun e-mail) : lien affiché dans le journal du serveur local pour pouvoir tester.
  if (!LIVE) console.info('[agent démo] lien de confirmation :', manageUrl(token))
  void insertEvent({ channel: input.channel, locale: input.language, kind: 'appointment_pending', intent: 'APPOINTMENT' })
  return { ref, start: new Date(startMs).toISOString(), ...label, emailSent }
}

async function teamNotice(row: AppointmentRow, title: string, typeLabel: string, extra: [string, string][] = []) {
  const reps = await readReps(db())
  const rep = reps.find((r) => r.id === row.representative_id)
  const l = slotLabel(row.starts_at, 'fr')
  await sendEmail({
    to: rep?.email || TEAM_EMAIL,
    ...agentTeamEmail({
      title: `${title} ${row.ref} — ${typeLabel}`,
      lines: [
        ['Quand', `${l.date} à ${l.time} (heure de Cayenne)`], ['Représentant', rep?.name ?? '—'], ['Contact', row.contact_name],
        ['Téléphone', row.contact_phone ?? '—'], ['E-mail', row.contact_email ?? '—'], ['Langue', row.language.toUpperCase()],
        ['Canal', row.channel], ['Motif', row.reason ?? '—'], ...extra,
      ],
    }),
    idempotencyKey: `agent-team-${title.slice(0, 12)}-${row.ref}`,
  })
}

const typeLabelOf = async (code: string, locale: AgentLocale) => {
  const t = (await readTypes(db())).find((x) => x.code === code)
  return t ? toType(t).labels[locale] : code
}

// --- Gestion par lien sécurisé --------------------------------------------------------------

export type ManagedView = {
  ref: string; status: 'pending' | 'confirmed' | 'cancelled' | 'expired'; start: string; date: string; time: string
  topic: string; typeCode: string; language: AgentLocale; canChange: boolean
}

const expired = (row: AppointmentRow, now = Date.now()) => row.status === 'pending' && now - Date.parse(row.created_at) > PENDING_MS

async function byToken(token: string): Promise<AppointmentRow> {
  if (!/^[A-Za-z0-9_-]{32}$/.test(token)) throw new AgentError('not_found')
  const row = await appointmentByTokenHash(db(), hashToken(token))
  if (!row) throw new AgentError('not_found')
  return row
}

export async function viewByToken(token: string): Promise<ManagedView> {
  const row = await byToken(token)
  return {
    ref: row.ref, status: expired(row) ? 'expired' : row.status, start: row.starts_at, ...slotLabel(row.starts_at, row.language),
    topic: await typeLabelOf(row.type_code, row.language), typeCode: row.type_code, language: row.language,
    canChange: row.status === 'confirmed' && canChange(row.starts_at, Date.now()),
  }
}

/** Clic sur le lien de l'e-mail : la réservation devient un rendez-vous confirmé. */
export async function confirmByToken(token: string): Promise<Booked> {
  const row = await byToken(token)
  const label = slotLabel(row.starts_at, row.language)
  if (row.status === 'confirmed') return { ref: row.ref, start: row.starts_at, ...label, emailSent: false }
  if (row.status !== 'pending' || expired(row)) throw new AgentError('expired')
  const ok = await updateAppointment(db(), row.id, { status: 'confirmed' }, 'pending')
  if (!ok) throw new AgentError('expired')
  const topic = await typeLabelOf(row.type_code, row.language)
  const mail = agentAppointmentEmail({ kind: 'confirmed', locale: row.language, name: row.contact_name, ...label, topic, ref: row.ref, manageUrl: manageUrl(token) })
  const emailSent = delivered(await sendEmail({ to: row.contact_email!, ...mail, idempotencyKey: `agent-appt-${row.ref}` }))
  await teamNotice(row, 'Nouveau rendez-vous', await typeLabelOf(row.type_code, 'fr'))
  void insertEvent({ channel: row.channel === 'admin' ? 'web' : row.channel, locale: row.language, kind: 'appointment_booked', intent: 'APPOINTMENT' })
  return { ref: row.ref, start: row.starts_at, ...label, emailSent }
}

export async function cancelByToken(token: string): Promise<void> {
  const row = await byToken(token)
  if (row.status === 'cancelled') return
  if (row.status === 'pending') {
    // Réservation jamais confirmée : on libère le créneau, sans e-mail.
    await updateAppointment(db(), row.id, { status: 'cancelled', cancelled_at: new Date().toISOString() }, 'pending')
    return
  }
  if (!canChange(row.starts_at, Date.now())) throw new AgentError('too_late')
  await updateAppointment(db(), row.id, { status: 'cancelled', cancelled_at: new Date().toISOString() })
  await notifyCancelled(row)
  void insertEvent({ channel: 'web', locale: row.language, kind: 'appointment_cancelled', intent: 'APPOINTMENT' })
}

/** Annulation : e-mail à la personne (si elle en a donné un) et avis au représentant. */
export async function notifyCancelled(row: AppointmentRow): Promise<void> {
  const topic = await typeLabelOf(row.type_code, row.language)
  if (row.contact_email) {
    await sendEmail({ to: row.contact_email, ...agentAppointmentEmail({ kind: 'cancelled', locale: row.language, name: row.contact_name, ...slotLabel(row.starts_at, row.language), topic, ref: row.ref }), idempotencyKey: `agent-cancel-${row.ref}` })
  }
  await teamNotice(row, 'Rendez-vous annulé', await typeLabelOf(row.type_code, 'fr'))
}

/**
 * Déplacement : annulation de l'ancien et création du nouveau dans UNE transaction (RPC
 * agent_reschedule) ; le même lien de gestion reste valable. Échec = l'ancien reste confirmé.
 */
export async function rescheduleByToken(token: string, start: string): Promise<Booked> {
  return rescheduleRow(await byToken(token), start, token, 'web')
}

/** Déplacement d'un rendez-vous déjà identifié (lien sécurisé, ou numéro WhatsApp vérifié). */
export async function rescheduleRow(row: AppointmentRow, start: string, token: string | undefined, channel: Channel): Promise<Booked> {
  if (row.status !== 'confirmed') throw new AgentError('not_found')
  const nowMs = Date.now()
  if (!canChange(row.starts_at, nowMs)) throw new AgentError('too_late')
  const { d, type, reps, busy, now } = await context(row.type_code)
  const startMs = Date.parse(start)
  if (!Number.isFinite(startMs)) throw new AgentError('invalid')
  // L'ancien rendez-vous ne bloque pas son propre remplaçant.
  const others = busy.filter((b) => !(b.representativeId === row.representative_id && b.startMs === Date.parse(row.starts_at)))
  const candidates = repsForStart({ type, language: row.language, reps, busy: others, nowMs: now, startMs })
  if (!candidates.length) throw new AgentError('slot_taken')
  const ref = makeRef(randomBytes(6))
  let moved: AppointmentRow | null = null
  for (const rep of candidates) {
    const next = {
      id: crypto.randomUUID(), ref, type_code: type.code, service: type.service, representative_id: rep.id,
      starts_at: new Date(startMs).toISOString(), ends_at: new Date(startMs + type.durationMin * 60_000).toISOString(),
      busy_until: new Date(startMs + (type.durationMin + type.bufferMin) * 60_000).toISOString(),
      contact_name: row.contact_name, contact_phone: row.contact_phone, contact_email: row.contact_email,
      language: row.language, reason: row.reason, channel: row.channel, reminders_consent: row.reminders_consent,
    }
    const res = await rescheduleAppointment(d, row.id, next)
    if (res === 'not_found') throw new AgentError('not_found')
    if (res === 'ok') {
      moved = { ...row, ...next, status: 'confirmed', rescheduled_from: row.id, reminder_24_sent_at: null, reminder_2_sent_at: null, created_at: new Date().toISOString(), cancelled_at: null }
      break
    }
  }
  if (!moved) throw new AgentError('slot_taken')
  const label = slotLabel(moved.starts_at, row.language)
  const topic = await typeLabelOf(row.type_code, row.language)
  let emailSent = false
  if (row.contact_email) {
    const mail = agentAppointmentEmail({ kind: 'changed', locale: row.language, name: row.contact_name, ...label, topic, ref, manageUrl: token ? manageUrl(token) : undefined })
    emailSent = delivered(await sendEmail({ to: row.contact_email, ...mail, idempotencyKey: `agent-appt-${ref}` }))
  }
  const fr = await typeLabelOf(row.type_code, 'fr')
  await teamNotice(moved, 'Rendez-vous déplacé', fr, [['Ancien créneau', `${slotLabel(row.starts_at, 'fr').date} à ${slotLabel(row.starts_at, 'fr').time}`]])
  // Représentant différent : l'ancien apprend que son créneau est libéré.
  if (moved.representative_id !== row.representative_id) await teamNotice(row, 'Créneau libéré (rendez-vous déplacé)', fr)
  void insertEvent({ channel, locale: row.language, kind: 'appointment_changed', intent: 'APPOINTMENT' })
  return { ref, start: moved.starts_at, ...label, emailSent }
}

// --- WhatsApp : le numéro est vérifié par le canal lui-même -------------------------------------

export const MAX_UPCOMING_PER_PHONE = 2

/** Réservation depuis WhatsApp : confirmée tout de suite (le numéro de l'interlocuteur est authentique). */
export async function bookConfirmed(input: { typeCode: string; language: AgentLocale; start: string; name: string; phone: string; channel: Exclude<Channel, 'web'>; remindersConsent: boolean }): Promise<Booked> {
  // Pas de vidage de l'agenda depuis un seul numéro : 2 rendez-vous à venir au plus.
  if ((await appointmentsByPhone(db(), input.phone)).length >= MAX_UPCOMING_PER_PHONE) throw new AgentError('limit')
  const { d, type, reps, busy, now } = await context(input.typeCode)
  const startMs = Date.parse(input.start)
  if (!Number.isFinite(startMs)) throw new AgentError('invalid')
  const candidates = repsForStart({ type, language: input.language, reps, busy, nowMs: now, startMs })
  if (!candidates.length) throw new AgentError('slot_taken')
  const ref = makeRef(randomBytes(6))
  let row: AppointmentRow | null = null
  for (const rep of candidates) {
    const next = {
      id: crypto.randomUUID(), ref, type_code: type.code, service: type.service, representative_id: rep.id,
      starts_at: new Date(startMs).toISOString(), ends_at: new Date(startMs + type.durationMin * 60_000).toISOString(),
      busy_until: new Date(startMs + (type.durationMin + type.bufferMin) * 60_000).toISOString(),
      contact_name: input.name, contact_phone: input.phone, contact_email: null, language: input.language, reason: null,
      channel: input.channel, confirm_channel: 'whatsapp' as const, reminders_consent: input.remindersConsent,
      manage_token_hash: null, rescheduled_from: null, status: 'confirmed' as const,
    }
    const res = await insertAppointment(d, next)
    if (res === 'duplicate') throw new AgentError('duplicate')
    if (res === 'ok') {
      row = { ...next, created_at: new Date().toISOString(), cancelled_at: null, reminder_24_sent_at: null, reminder_2_sent_at: null }
      break
    }
  }
  if (!row) throw new AgentError('slot_taken')
  await teamNotice(row, 'Nouveau rendez-vous', await typeLabelOf(type.code, 'fr'))
  void insertEvent({ channel: input.channel, locale: input.language, kind: 'appointment_booked', intent: 'APPOINTMENT' })
  return { ref, start: row.starts_at, ...slotLabel(row.starts_at, input.language), emailSent: false }
}

/** Rendez-vous à venir pris avec ce numéro (gestion depuis WhatsApp). */
export async function upcomingForPhone(phone: string): Promise<(AppointmentRow & { topic: string })[]> {
  const rows = await appointmentsByPhone(db(), phone)
  return Promise.all(rows.map(async (r) => ({ ...r, topic: await typeLabelOf(r.type_code, r.language) })))
}

/** Annulation d'un rendez-vous identifié par le canal (numéro vérifié). */
export async function cancelRow(row: AppointmentRow, channel: Channel): Promise<void> {
  if (row.status !== 'confirmed') return
  if (!canChange(row.starts_at, Date.now())) throw new AgentError('too_late')
  if (!(await updateAppointment(db(), row.id, { status: 'cancelled', cancelled_at: new Date().toISOString() }))) return
  await notifyCancelled(row)
  void insertEvent({ channel, locale: row.language, kind: 'appointment_cancelled', intent: 'APPOINTMENT' })
}

// --- Rappel et représentant -----------------------------------------------------------------

export async function requestCallback(input: { name: string; phone: string; reason: string; service?: string; language: AgentLocale; channel: Channel }): Promise<void> {
  await insertCallback(db(), { name: input.name, phone: input.phone, reason: input.reason, service: input.service ?? null, language: input.language, channel: input.channel })
  await sendEmail({
    to: TEAM_EMAIL,
    ...agentTeamEmail({ title: `Demande de rappel — ${input.name}`, lines: [['Nom', input.name], ['Téléphone', input.phone], ['Sujet', input.reason], ['Service', input.service ?? '—'], ['Langue', input.language.toUpperCase()], ['Canal', input.channel]] }),
  })
  void insertEvent({ channel: input.channel, locale: input.language, kind: 'callback_requested', intent: 'CALLBACK' })
}

/** Un représentant du service est-il joignable maintenant ? (aucune donnée du représentant renvoyée) */
export async function humanAvailable(service: string, language: AgentLocale): Promise<boolean> {
  const d = db()
  const services = await readServices(d)
  if (!services.some((s) => s.code === service && s.active)) throw new AgentError('not_found')
  const now = Date.now()
  const [reps, busy] = await Promise.all([readReps(d), readBusy(d, new Date(now - 1).toISOString(), new Date(now + 1).toISOString())])
  // Pas de statistique ici : une simple lecture répétée gonflerait les compteurs.
  return availableNow(reps, service, language, now, busy).length > 0
}

// --- Tâche planifiée : rappels 24 h / 2 h, versions programmées, réservations expirées, conservation ---

export async function runAgentCron(): Promise<{ reminders: number; kbActivated?: number; purged?: unknown }> {
  if (!LIVE) return { reminders: 0 }
  const d = svc()
  const now = Date.now()
  await expirePending(d)
  const kb = await d.rpc('agent_kb_activate_due')
  if (typeof kb.data === 'number' && kb.data > 0) invalidateAgentCache()
  const { data, error } = await d.from('agent_appointments').select(APPT_COLUMNS)
    .eq('status', 'confirmed').eq('reminders_consent', true).or('contact_email.not.is.null,confirm_channel.eq.whatsapp')
    .or('reminder_24_sent_at.is.null,reminder_2_sent_at.is.null')
    .gt('starts_at', new Date(now).toISOString()).lt('starts_at', new Date(now + 24 * 3_600_000).toISOString())
    .order('starts_at').limit(500)
  if (error) throw new Error(`reminders (${error.code})`)
  const types = await readTypes(d)
  let sent = 0
  for (const a of data as AppointmentRow[]) {
    const due = dueReminder(a, now)
    if (!due) continue
    const viaWhatsApp = a.confirm_channel === 'whatsapp' && Boolean(a.contact_phone)
    if (!viaWhatsApp && !a.contact_email) continue
    const column = due === '24h' ? 'reminder_24_sent_at' : 'reminder_2_sent_at'
    // Marque d'abord (une seule fois même si deux passages se chevauchent, jamais pour un rendez-vous
    // annulé entre-temps), puis envoie.
    const { data: claimed } = await d.from('agent_appointments').update({ [column]: new Date().toISOString() }).eq('id', a.id).eq('status', 'confirmed').is(column, null).select('id')
    if (!claimed?.length) continue
    const t = types.find((x) => x.code === a.type_code)
    const topic = t ? toType(t).labels[a.language] : a.type_code
    if (viaWhatsApp) {
      const m = await messagesFor(a.language)
      const text = `${fillMessage(m.WA_REMINDER, slotLabel(a.starts_at, a.language))}\n${topic} · ${a.ref}`
      // Enregistré dans la conversation AVANT l'envoi : l'écho du fournisseur n'est pas pris pour un représentant.
      const { notifyByWhatsApp } = await import('./whatsapp')
      if (await notifyByWhatsApp(a.contact_phone!, a.language, text)) sent++
      continue
    }
    const mail = agentAppointmentEmail({ kind: 'reminder', locale: a.language, name: a.contact_name, ...slotLabel(a.starts_at, a.language), topic, ref: a.ref })
    if ((await sendEmail({ to: a.contact_email!, ...mail, idempotencyKey: `agent-rem-${due}-${a.ref}` })).ok) sent++
  }
  // Conservation : une fois par heure suffit (premier passage de l'heure).
  const purged = new Date(now).getUTCMinutes() < 5 ? (await d.rpc('agent_purge')).data : undefined
  return { reminders: sent, kbActivated: typeof kb.data === 'number' ? kb.data : undefined, ...(purged ? { purged } : {}) }
}
