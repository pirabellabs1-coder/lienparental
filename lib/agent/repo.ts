import 'server-only'
/**
 * Agent d'accueil — accès aux données (migration 0640), en deux implémentations :
 *  - Supabase : client service_role pour les routes publiques (aucune politique anon), client de
 *    l'administrateur (RLS is_admin_aal2) pour le back-office ;
 *  - démonstration (Supabase absent) : magasin en mémoire du serveur, avec deux représentants
 *    d'exemple, perdu au redémarrage.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { createServiceClient } from '@/lib/supabase/server'
import { PENDING_MS, parseHours, type AgentLocale, type AppointmentType, type Busy, type Channel, type KbEntry, type Representative } from './core'

export type RepRow = Representative & { role: string | null; email: string | null; transfer_phone: string | null }
export type ServiceRow = { code: string; label_fr: string; label_en: string; label_pt: string; ai_mode: 'answer' | 'qualify' | 'limited'; active: boolean; sort: number }
export type BlackoutRow = { id: string; representative_id: string | null; starts_at: string; ends_at: string; reason: string | null }
export type AppointmentRow = {
  id: string; ref: string; type_code: string; service: string; representative_id: string
  starts_at: string; ends_at: string; busy_until: string
  contact_name: string; contact_phone: string | null; contact_email: string | null
  language: AgentLocale; reason: string | null; channel: Channel | 'admin'; confirm_channel: 'email' | 'sms' | 'whatsapp'
  reminders_consent: boolean; status: 'pending' | 'confirmed' | 'cancelled'; manage_token_hash: string | null
  reminder_24_sent_at: string | null; reminder_2_sent_at: string | null; rescheduled_from: string | null
  created_at: string; cancelled_at: string | null
}
export type CallbackRow = { id: string; name: string; phone: string; reason: string; service: string | null; language: AgentLocale; channel: Channel; status: 'new' | 'done' | 'cancelled'; created_at: string; handled_at: string | null }
export type MessageRow = { msg_key: string; locale: AgentLocale; text: string; updated_at: string }
export type EventRow = { at: string; channel: Channel; locale: AgentLocale; kind: string; intent: string | null }

type TypeRow = { code: string; service: string; label_fr: string; label_en: string; label_pt: string; duration_min: number; buffer_min: number; min_notice_min: number; horizon_days: number; active: boolean; sort: number }
export type { TypeRow }

export const toType = (r: TypeRow): AppointmentType => ({
  code: r.code, service: r.service, labels: { fr: r.label_fr, en: r.label_en, pt: r.label_pt },
  durationMin: r.duration_min, bufferMin: r.buffer_min, minNoticeMin: r.min_notice_min, horizonDays: r.horizon_days, active: r.active,
})

type RawRep = Omit<RepRow, 'hours' | 'languages'> & { hours: unknown; languages: string[] }
const toRep = (r: RawRep): RepRow => ({ ...r, hours: parseHours(r.hours), languages: r.languages.filter((l): l is AgentLocale => l === 'fr' || l === 'en' || l === 'pt') })

// --- Démonstration -------------------------------------------------------------------------

type Demo = {
  services: ServiceRow[]; reps: RawRep[]; types: TypeRow[]; blackouts: BlackoutRow[]; appointments: AppointmentRow[]
  callbacks: CallbackRow[]; messages: MessageRow[]; kb: KbEntry[]; events: EventRow[]
}
const g = globalThis as unknown as { __lpAgentDemo?: Demo }
const WEEK = { '1': [['08:00', '12:00'], ['14:00', '17:00']], '2': [['08:00', '12:00'], ['14:00', '17:00']], '3': [['08:00', '12:00']], '4': [['08:00', '12:00'], ['14:00', '17:00']], '5': [['08:00', '12:00'], ['14:00', '16:00']] }
export function demo(): Demo {
  if (!g.__lpAgentDemo) {
    const now = new Date().toISOString()
    g.__lpAgentDemo = {
      services: [
        { code: 'info', label_fr: 'Informations générales', label_en: 'General information', label_pt: 'Informações gerais', ai_mode: 'answer', active: true, sort: 10 },
        { code: 'support', label_fr: 'Assistance fonctionnelle', label_en: 'Product support', label_pt: 'Assistência', ai_mode: 'answer', active: true, sort: 20 },
        { code: 'commercial', label_fr: 'Commercial', label_en: 'Sales', label_pt: 'Comercial', ai_mode: 'answer', active: true, sort: 30 },
        { code: 'partenariat', label_fr: 'Partenariats', label_en: 'Partnerships', label_pt: 'Parcerias', ai_mode: 'qualify', active: true, sort: 40 },
        { code: 'association', label_fr: 'Rejoindre l’association', label_en: 'Join the association', label_pt: 'Participar da associação', ai_mode: 'qualify', active: true, sort: 50 },
        { code: 'sensible', label_fr: 'Sujet sensible', label_en: 'Sensitive matter', label_pt: 'Assunto sensível', ai_mode: 'limited', active: true, sort: 60 },
      ],
      reps: [
        { id: '00000000-0000-4000-8000-000000000001', name: 'Représentante (démo)', role: 'Accueil', email: null, transfer_phone: null, languages: ['fr', 'pt'], services: ['info', 'support', 'association', 'sensible'], hours: WEEK, status: 'auto', priority: 10, active: true },
        { id: '00000000-0000-4000-8000-000000000002', name: 'Représentant commercial (démo)', role: 'Commercial', email: null, transfer_phone: null, languages: ['fr', 'en'], services: ['commercial', 'partenariat', 'info'], hours: WEEK, status: 'auto', priority: 20, active: true },
      ],
      types: [
        { code: 'decouverte', service: 'info', label_fr: 'Présentation / découverte', label_en: 'Introduction', label_pt: 'Apresentação', duration_min: 30, buffer_min: 15, min_notice_min: 120, horizon_days: 60, active: true, sort: 10 },
        { code: 'commercial', service: 'commercial', label_fr: 'Commercial', label_en: 'Sales', label_pt: 'Comercial', duration_min: 30, buffer_min: 15, min_notice_min: 120, horizon_days: 60, active: true, sort: 20 },
        { code: 'partenariat', service: 'partenariat', label_fr: 'Partenariat', label_en: 'Partnership', label_pt: 'Parceria', duration_min: 45, buffer_min: 15, min_notice_min: 120, horizon_days: 60, active: true, sort: 30 },
        { code: 'association', service: 'association', label_fr: 'Rejoindre l’association', label_en: 'Join the association', label_pt: 'Participar da associação', duration_min: 30, buffer_min: 15, min_notice_min: 120, horizon_days: 60, active: true, sort: 40 },
        { code: 'assistance', service: 'support', label_fr: 'Assistance humaine', label_en: 'Support', label_pt: 'Assistência', duration_min: 20, buffer_min: 10, min_notice_min: 120, horizon_days: 60, active: true, sort: 50 },
      ],
      blackouts: [], appointments: [], callbacks: [], messages: [], events: [],
      kb: [{
        id: '00000000-0000-4000-8000-0000000000a1', entry_key: 'horaires', locale: 'fr', category: 'contact', version: 1, status: 'published',
        title: 'Horaires et délais de réponse', questions: 'horaires ouverture quand joindre délai réponse',
        answer: 'Les représentants répondent du lundi au vendredi, de 8 h à 12 h et de 14 h à 17 h (heure de Cayenne). Par e-mail, réponse sous 48 heures ouvrées.',
        source: 'Démo', effective_at: null, author: 'Démo', created_at: now, updated_at: now,
      }],
    }
  }
  return g.__lpAgentDemo
}

export const LIVE = SUPABASE_ENABLED
export function svc(): SupabaseClient {
  return createServiceClient() as unknown as SupabaseClient
}
const fail = (op: string, e: { code?: string } | null) => new Error(`${op} (${e?.code ?? 'unknown'})`)

// --- Lectures communes (db = service_role ou client admin) ------------------------------------

export async function readReps(db: SupabaseClient | null): Promise<RepRow[]> {
  if (!db) return demo().reps.map(toRep)
  const { data, error } = await db.from('agent_representatives').select('id, name, role, email, transfer_phone, languages, services, hours, status, priority, active').order('priority')
  if (error) throw fail('reps', error)
  return (data as RawRep[]).map(toRep)
}

export async function readServices(db: SupabaseClient | null): Promise<ServiceRow[]> {
  if (!db) return [...demo().services].sort((a, b) => a.sort - b.sort)
  const { data, error } = await db.from('agent_services').select('code, label_fr, label_en, label_pt, ai_mode, active, sort').order('sort')
  if (error) throw fail('services', error)
  return data as ServiceRow[]
}

export async function readTypes(db: SupabaseClient | null): Promise<TypeRow[]> {
  if (!db) return [...demo().types].sort((a, b) => a.sort - b.sort)
  const { data, error } = await db.from('agent_appointment_types').select('code, service, label_fr, label_en, label_pt, duration_min, buffer_min, min_notice_min, horizon_days, active, sort').order('sort')
  if (error) throw fail('types', error)
  return data as TypeRow[]
}

/** Réservation tenue : confirmée, ou en attente de confirmation depuis moins de 30 min. */
const holds = (a: { status: string; created_at: string }, now = Date.now()) => a.status === 'confirmed' || (a.status === 'pending' && now - Date.parse(a.created_at) <= PENDING_MS)

/** Intervalles bloqués entre deux instants : rendez-vous tenus et indisponibilités. */
export async function readBusy(db: SupabaseClient | null, fromIso: string, toIso: string): Promise<Busy[]> {
  if (!db) {
    const d = demo()
    return [
      ...d.appointments.filter((a) => holds(a) && a.busy_until > fromIso && a.starts_at < toIso).map((a) => ({ representativeId: a.representative_id, startMs: Date.parse(a.starts_at), endMs: Date.parse(a.busy_until) })),
      ...d.blackouts.filter((b) => b.ends_at > fromIso && b.starts_at < toIso).map((b) => ({ representativeId: b.representative_id, startMs: Date.parse(b.starts_at), endMs: Date.parse(b.ends_at) })),
    ]
  }
  const [a, b] = await Promise.all([
    db.from('agent_appointments').select('representative_id, starts_at, busy_until, status, created_at').in('status', ['pending', 'confirmed']).gt('busy_until', fromIso).lt('starts_at', toIso).limit(5000),
    db.from('agent_blackouts').select('representative_id, starts_at, ends_at').gt('ends_at', fromIso).lt('starts_at', toIso).limit(1000),
  ])
  if (a.error) throw fail('busy', a.error)
  if (b.error) throw fail('blackouts', b.error)
  return [
    ...(a.data as { representative_id: string; starts_at: string; busy_until: string; status: string; created_at: string }[]).filter((r) => holds(r)).map((r) => ({ representativeId: r.representative_id, startMs: Date.parse(r.starts_at), endMs: Date.parse(r.busy_until) })),
    ...(b.data as { representative_id: string | null; starts_at: string; ends_at: string }[]).map((r) => ({ representativeId: r.representative_id, startMs: Date.parse(r.starts_at), endMs: Date.parse(r.ends_at) })),
  ]
}

export async function readMessages(db: SupabaseClient | null): Promise<MessageRow[]> {
  if (!db) return demo().messages
  const { data, error } = await db.from('agent_messages').select('msg_key, locale, text, updated_at')
  if (error) throw fail('messages', error)
  return data as MessageRow[]
}

const KB_COLUMNS = 'id, entry_key, locale, category, version, status, title, questions, answer, source, effective_at, author, created_at, updated_at'

/** Fiches candidates à la version active (publiées et programmées) ; brouillons exclus. */
export async function readKbCandidates(db: SupabaseClient | null): Promise<KbEntry[]> {
  if (!db) return demo().kb.filter((e) => e.status === 'published' || e.status === 'scheduled')
  const { data, error } = await db.from('agent_kb_entries').select(KB_COLUMNS).in('status', ['published', 'scheduled']).limit(2000)
  if (error) throw fail('kb', error)
  return data as KbEntry[]
}

export async function readKbAll(db: SupabaseClient | null): Promise<KbEntry[]> {
  if (!db) return [...demo().kb].sort((a, b) => a.entry_key.localeCompare(b.entry_key) || b.version - a.version)
  const { data, error } = await db.from('agent_kb_entries').select(KB_COLUMNS).order('entry_key').order('locale').order('version', { ascending: false }).limit(3000)
  if (error) throw fail('kb_all', error)
  return data as KbEntry[]
}

export { KB_COLUMNS }

// --- Rendez-vous -----------------------------------------------------------------------------

const APPT_COLUMNS = 'id, ref, type_code, service, representative_id, starts_at, ends_at, busy_until, contact_name, contact_phone, contact_email, language, reason, channel, confirm_channel, reminders_consent, status, manage_token_hash, reminder_24_sent_at, reminder_2_sent_at, rescheduled_from, created_at, cancelled_at'
export { APPT_COLUMNS }

type NewAppointment = Omit<AppointmentRow, 'created_at' | 'cancelled_at' | 'reminder_24_sent_at' | 'reminder_2_sent_at'>
const clashes = (list: AppointmentRow[], row: { representative_id: string; starts_at: string; busy_until: string }) =>
  list.some((a) => (a.status === 'confirmed' || a.status === 'pending') && a.representative_id === row.representative_id && a.starts_at < row.busy_until && row.starts_at < a.busy_until)

/** Insère un rendez-vous ; 'overlap' si la contrainte d'exclusion refuse (créneau pris entre-temps). */
export async function insertAppointment(db: SupabaseClient | null, row: NewAppointment): Promise<'ok' | 'overlap'> {
  if (!db) {
    const d = demo()
    if (clashes(d.appointments, row)) return 'overlap'
    d.appointments.push({ ...row, created_at: new Date().toISOString(), cancelled_at: null, reminder_24_sent_at: null, reminder_2_sent_at: null })
    return 'ok'
  }
  const { error } = await db.from('agent_appointments').insert(row)
  if (error?.code === '23P01') return 'overlap'
  if (error) throw fail('appointment_insert', error)
  return 'ok'
}

/** Réservations jamais confirmées après 30 min : créneau rendu (avant chaque réservation et par le cron). */
export async function expirePending(db: SupabaseClient | null): Promise<void> {
  const limit = new Date(Date.now() - PENDING_MS).toISOString()
  const at = new Date().toISOString()
  if (!db) {
    demo().appointments.filter((a) => a.status === 'pending' && a.created_at < limit).forEach((a) => Object.assign(a, { status: 'cancelled', cancelled_at: at }))
    return
  }
  const { error } = await db.from('agent_appointments').update({ status: 'cancelled', cancelled_at: at }).eq('status', 'pending').lt('created_at', limit)
  if (error) console.warn('[agent] expiration des réservations (%s)', error.code)
}

/** Déplacement atomique (RPC agent_reschedule) : 'overlap' = rien n'a changé, l'ancien reste confirmé. */
export async function rescheduleAppointment(db: SupabaseClient | null, oldId: string, next: Omit<NewAppointment, 'status' | 'manage_token_hash' | 'rescheduled_from' | 'confirm_channel'>): Promise<'ok' | 'overlap' | 'not_found'> {
  if (!db) {
    const d = demo()
    const old = d.appointments.find((a) => a.id === oldId && a.status === 'confirmed')
    if (!old) return 'not_found'
    if (clashes(d.appointments.filter((a) => a !== old), next)) return 'overlap'
    const hash = old.manage_token_hash
    Object.assign(old, { status: 'cancelled', cancelled_at: new Date().toISOString(), manage_token_hash: null })
    d.appointments.push({ ...next, status: 'confirmed', confirm_channel: 'email', manage_token_hash: hash, rescheduled_from: oldId, created_at: new Date().toISOString(), cancelled_at: null, reminder_24_sent_at: null, reminder_2_sent_at: null })
    return 'ok'
  }
  const { data, error } = await db.rpc('agent_reschedule', { p_old: oldId, p_new: next })
  if (error?.message?.includes('agent_slot_taken')) return 'overlap'
  if (error) throw fail('reschedule', error)
  return data === 'ok' ? 'ok' : 'not_found'
}

export async function appointmentByTokenHash(db: SupabaseClient | null, hash: string): Promise<AppointmentRow | null> {
  if (!db) return demo().appointments.find((a) => a.manage_token_hash === hash) ?? null
  const { data, error } = await db.from('agent_appointments').select(APPT_COLUMNS).eq('manage_token_hash', hash).maybeSingle()
  if (error) throw fail('appointment_get', error)
  return (data as AppointmentRow | null) ?? null
}

/** Mise à jour conditionnelle : seulement si le rendez-vous a encore le statut `onlyStatus`. */
export async function updateAppointment(db: SupabaseClient | null, id: string, patch: Partial<AppointmentRow>, onlyStatus: AppointmentRow['status'] = 'confirmed'): Promise<boolean> {
  if (!db) {
    const a = demo().appointments.find((x) => x.id === id && x.status === onlyStatus)
    if (!a) return false
    Object.assign(a, patch)
    return true
  }
  const q = db.from('agent_appointments').update(patch).eq('id', id).eq('status', onlyStatus)
  const { data, error } = await q.select('id')
  if (error) throw fail('appointment_update', error)
  return (data ?? []).length > 0
}

// --- Rappels, événements ---------------------------------------------------------------------

export async function insertCallback(db: SupabaseClient | null, row: Omit<CallbackRow, 'id' | 'status' | 'created_at' | 'handled_at'>): Promise<string> {
  const id = crypto.randomUUID()
  if (!db) {
    demo().callbacks.unshift({ ...row, id, status: 'new', created_at: new Date().toISOString(), handled_at: null })
    return id
  }
  const { error } = await db.from('agent_callbacks').insert({ ...row, id })
  if (error) throw fail('callback_insert', error)
  return id
}

/** Statistique sans contenu ; une erreur n'interrompt jamais la conversation. */
export async function insertEvent(e: { channel: Channel; locale: AgentLocale; kind: string; intent?: string | null }): Promise<void> {
  const row = { channel: e.channel, locale: e.locale, kind: e.kind, intent: e.intent ?? null }
  if (!LIVE) {
    demo().events.push({ ...row, at: new Date().toISOString() })
    return
  }
  try {
    const { error } = await svc().from('agent_events').insert(row)
    if (error) console.warn('[agent] statistique non enregistrée (%s)', error.code)
  } catch {
    // service_role absent : statistiques désactivées
  }
}
