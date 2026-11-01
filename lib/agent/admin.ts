import 'server-only'
/**
 * Agent d'accueil — back-office (migration 0640). Client de l'administrateur (RLS is_admin_aal2) en
 * production, magasin en mémoire en démonstration. Chaque modification est journalisée AVANT d'être
 * faite (admin_log_action, fail-closed) : auteur, objet, anciennes et nouvelles valeurs utiles.
 *
 * Base de connaissances : une modification crée une nouvelle version (brouillon) ; publier archive
 * la version publiée précédente ; « revenir à » republie le contenu d'une ancienne version sous un
 * nouveau numéro. Les trois canaux lisent la même version active (lib/agent/server.ts, cache 60 s).
 */
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AdminCtx } from '@/lib/contenus/repo'
import { RepoError } from '@/lib/contenus/repo'
import { logAdminAction } from '@/lib/admin/ops/rpc'
import { KB_CATEGORIES, MESSAGE_KEYS, parseHours, type KbEntry } from './core'
import {
  APPT_COLUMNS, KB_COLUMNS, demo, readBusy, readKbAll, readMessages, readReps, readServices, readTypes,
  type AppointmentRow, type BlackoutRow, type CallbackRow, type EventRow,
} from './repo'
import { invalidateAgentCache, notifyCancelled } from './server'
import { conversationMessages, listConversations, releaseToBot, teamReply } from './whatsapp'

const dbOf = (ctx: AdminCtx): SupabaseClient | null => (ctx.mode === 'live' ? (ctx.db as SupabaseClient) : null)
const audit = async (ctx: AdminCtx, action: `admin.${string}`, entity: string, entityId?: string, metadata: Record<string, unknown> = {}) => {
  if (ctx.mode === 'live') await logAdminAction(ctx, action, { entity, entityId, metadata })
}
const check = (error: { code?: string; message?: string } | null, op: string) => {
  if (!error) return
  if (error.code === '23505') throw new RepoError('conflict', 'Une valeur identique existe déjà.')
  if (error.code === '23P01') throw new RepoError('conflict', 'Ce créneau chevauche un autre rendez-vous.')
  if (error.code === '23514' || error.code === '22P02') throw new RepoError('invalid', 'Valeur refusée par la base (format ou limite).')
  if (error.code === '42501') throw new RepoError('forbidden', 'Accès réservé aux administrateurs.')
  console.warn(`[agent-admin] ${op} (${error.code ?? 'unknown'})`)
  throw new RepoError('unavailable', 'Base indisponible. Réessayez.')
}

// --- Lectures --------------------------------------------------------------------------------

export const listKb = (ctx: AdminCtx) => readKbAll(dbOf(ctx))
export const listReps = (ctx: AdminCtx) => readReps(dbOf(ctx))
export const listServices = (ctx: AdminCtx) => readServices(dbOf(ctx))
export const listTypes = (ctx: AdminCtx) => readTypes(dbOf(ctx))
export const listMessages = (ctx: AdminCtx) => readMessages(dbOf(ctx))
export const listWaConversations = (ctx: AdminCtx) => listConversations(dbOf(ctx))
export const listWaMessages = (ctx: AdminCtx, id: string) => conversationMessages(dbOf(ctx), id)

export async function listBlackouts(ctx: AdminCtx): Promise<BlackoutRow[]> {
  const db = dbOf(ctx)
  if (!db) return demo().blackouts
  const { data, error } = await db.from('agent_blackouts').select('id, representative_id, starts_at, ends_at, reason').gte('ends_at', new Date().toISOString()).order('starts_at').limit(200)
  check(error, 'blackouts')
  return data as BlackoutRow[]
}

export async function listAppointments(ctx: AdminCtx, scope: 'upcoming' | 'past'): Promise<AppointmentRow[]> {
  const db = dbOf(ctx)
  const now = new Date().toISOString()
  if (!db) {
    const all = demo().appointments
    return scope === 'upcoming' ? all.filter((a) => a.ends_at >= now).sort((a, b) => a.starts_at.localeCompare(b.starts_at)) : all.filter((a) => a.ends_at < now).reverse()
  }
  let q = db.from('agent_appointments').select(APPT_COLUMNS).limit(300)
  q = scope === 'upcoming' ? q.gte('ends_at', now).order('starts_at') : q.lt('ends_at', now).order('starts_at', { ascending: false })
  const { data, error } = await q
  check(error, 'appointments')
  return data as AppointmentRow[]
}

export async function listCallbacks(ctx: AdminCtx, status: 'new' | 'done' | 'all'): Promise<CallbackRow[]> {
  const db = dbOf(ctx)
  if (!db) return demo().callbacks.filter((c) => status === 'all' || c.status === status)
  let q = db.from('agent_callbacks').select('id, name, phone, reason, service, language, channel, status, created_at, handled_at').order('created_at', { ascending: false }).limit(300)
  if (status !== 'all') q = q.eq('status', status)
  const { data, error } = await q
  check(error, 'callbacks')
  return data as CallbackRow[]
}

export type AgentStats = {
  days: number
  total: number
  byKind: Record<string, number>
  byChannel: Record<string, number>
  byLocale: Record<string, number>
  byIntent: Record<string, number>
  appointments: { booked: number; cancelled: number; changed: number }
}

export async function stats(ctx: AdminCtx, days = 30): Promise<AgentStats> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  let rows: EventRow[]
  const db = dbOf(ctx)
  if (!db) rows = demo().events.filter((e) => e.at >= since)
  else {
    const { data, error } = await db.from('agent_events').select('at, channel, locale, kind, intent').gte('at', since).limit(50_000)
    check(error, 'events')
    rows = data as EventRow[]
  }
  const count = (key: (e: EventRow) => string | null) => rows.reduce<Record<string, number>>((acc, e) => {
    const k = key(e)
    if (k) acc[k] = (acc[k] ?? 0) + 1
    return acc
  }, {})
  const byKind = count((e) => e.kind)
  return {
    days, total: rows.length, byKind, byChannel: count((e) => e.channel), byLocale: count((e) => e.locale), byIntent: count((e) => e.intent),
    appointments: { booked: byKind.appointment_booked ?? 0, cancelled: byKind.appointment_cancelled ?? 0, changed: byKind.appointment_changed ?? 0 },
  }
}

// --- Écritures ---------------------------------------------------------------------------------

const Locale = z.enum(['fr', 'en', 'pt'])
const Code = z.string().regex(/^[a-z][a-z0-9_]{1,31}$/)
const Uuid = z.string().uuid()
const Iso = z.string().datetime({ offset: true })

export const AdminOpSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('kb.save'), id: Uuid.optional(),
    entry_key: z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/), locale: Locale, category: z.enum(KB_CATEGORIES),
    title: z.string().trim().min(2).max(160), questions: z.string().trim().max(2000).default(''),
    answer: z.string().trim().min(2).max(4000), source: z.string().trim().max(300).optional(),
  }),
  z.object({ op: z.literal('kb.status'), id: Uuid, status: z.enum(['review', 'published', 'scheduled', 'archived', 'draft']), effective_at: Iso.optional() }),
  z.object({ op: z.literal('kb.rollback'), id: Uuid }),
  z.object({
    op: z.literal('rep.save'), id: Uuid.optional(), name: z.string().trim().min(2).max(120), role: z.string().trim().max(120).optional(),
    email: z.string().trim().email().max(254).optional().or(z.literal('')), transfer_phone: z.string().trim().regex(/^\+?[0-9 ]{6,20}$/).optional().or(z.literal('')),
    languages: z.array(Locale).min(1), services: z.array(Code).max(10), hours: z.record(z.string(), z.unknown()),
    status: z.enum(['auto', 'unavailable']), priority: z.number().int().min(0).max(10_000), active: z.boolean(),
  }),
  z.object({
    op: z.literal('type.save'), code: Code, duration_min: z.number().int().min(10).max(240), buffer_min: z.number().int().min(0).max(120),
    min_notice_min: z.number().int().min(0).max(10_080), horizon_days: z.number().int().min(1).max(365), active: z.boolean(),
  }),
  z.object({ op: z.literal('blackout.add'), representative_id: Uuid.nullable(), starts_at: Iso, ends_at: Iso, reason: z.string().trim().max(200).optional() }),
  z.object({ op: z.literal('blackout.delete'), id: Uuid }),
  z.object({ op: z.literal('appt.cancel'), id: Uuid }),
  z.object({ op: z.literal('callback.status'), id: Uuid, status: z.enum(['new', 'done', 'cancelled']) }),
  z.object({ op: z.literal('message.save'), msg_key: z.enum(MESSAGE_KEYS), locale: Locale, text: z.string().trim().min(1).max(600) }),
  z.object({ op: z.literal('message.reset'), msg_key: z.enum(MESSAGE_KEYS), locale: Locale }),
  z.object({ op: z.literal('wa.reply'), id: Uuid, text: z.string().trim().min(1).max(3000) }),
  z.object({ op: z.literal('wa.release'), id: Uuid }),
])
export type AdminOp = z.infer<typeof AdminOpSchema>

export async function runAdminOp(ctx: AdminCtx, op: AdminOp): Promise<unknown> {
  const db = dbOf(ctx)
  const now = new Date().toISOString()
  const actor = ctx.actor
  switch (op.op) {
    case 'kb.save': {
      // Toujours une nouvelle version (brouillon) : la version publiée reste active jusqu'à publication.
      const all = await readKbAll(db)
      const same = all.filter((e) => e.entry_key === op.entry_key && e.locale === op.locale)
      if (op.id && !same.some((e) => e.id === op.id)) throw new RepoError('invalid', 'La clé ou la langue ne correspond pas à la fiche modifiée.')
      const version = same.reduce((n, e) => Math.max(n, e.version), 0) + 1
      const row = { entry_key: op.entry_key, locale: op.locale, category: op.category, version, status: 'draft' as const, title: op.title, questions: op.questions, answer: op.answer, source: op.source || null, effective_at: null, author: actor }
      await audit(ctx, 'admin.agent.kb.save', 'agent_kb_entries', undefined, { entry_key: op.entry_key, locale: op.locale, version })
      if (!db) {
        const e: KbEntry = { ...row, id: crypto.randomUUID(), created_at: now, updated_at: now }
        demo().kb.push(e)
        return { id: e.id, version }
      }
      const { data, error } = await db.from('agent_kb_entries').insert({ ...row, author_id: ctx.mode === 'live' ? ctx.userId : null }).select('id').single()
      check(error, 'kb.save')
      return { id: (data as { id: string }).id, version }
    }
    case 'kb.status': {
      const all = await readKbAll(db)
      const e = all.find((x) => x.id === op.id)
      if (!e) throw new RepoError('not_found', 'Fiche introuvable.')
      if (op.status === 'scheduled' && (!op.effective_at || Date.parse(op.effective_at) <= Date.now())) throw new RepoError('invalid', 'Choisissez une date de publication dans le futur.')
      await audit(ctx, `admin.agent.kb.${op.status}`, 'agent_kb_entries', e.id, { entry_key: e.entry_key, locale: e.locale, version: e.version, from: e.status, effective_at: op.effective_at ?? null })
      const previous = all.filter((x) => x.entry_key === e.entry_key && x.locale === e.locale && x.id !== e.id && x.status === 'published')
      const patch = { status: op.status, effective_at: op.status === 'scheduled' ? op.effective_at! : e.effective_at, updated_at: now }
      if (!db) {
        if (op.status === 'published') previous.forEach((p) => { p.status = 'archived' })
        Object.assign(e, patch)
      } else {
        if (op.status === 'published') {
          // Archivage de l'ancienne version et publication dans une seule transaction (RPC).
          const { error } = await db.rpc('agent_kb_publish', { p_id: e.id })
          check(error, 'kb.publish')
        } else {
          const { error } = await db.from('agent_kb_entries').update(patch).eq('id', e.id)
          check(error, 'kb.status')
        }
      }
      invalidateAgentCache()
      return { status: op.status }
    }
    case 'kb.rollback': {
      const all = await readKbAll(db)
      const e = all.find((x) => x.id === op.id)
      if (!e) throw new RepoError('not_found', 'Version introuvable.')
      const draft = await runAdminOp(ctx, { op: 'kb.save', entry_key: e.entry_key, locale: e.locale, category: e.category, title: e.title, questions: e.questions, answer: e.answer, source: e.source ?? undefined }) as { id: string; version: number }
      await runAdminOp(ctx, { op: 'kb.status', id: draft.id, status: 'published' })
      return draft
    }
    case 'rep.save': {
      const row = {
        name: op.name, role: op.role || null, email: op.email || null, transfer_phone: op.transfer_phone || null,
        languages: op.languages, services: op.services, hours: parseHours(op.hours), status: op.status, priority: op.priority, active: op.active, updated_at: now,
      }
      await audit(ctx, op.id ? 'admin.agent.rep.update' : 'admin.agent.rep.create', 'agent_representatives', op.id, { name: op.name, services: op.services, status: op.status, active: op.active })
      if (!db) {
        const d = demo()
        const cur = op.id ? d.reps.find((r) => r.id === op.id) : undefined
        if (op.id && !cur) throw new RepoError('not_found', 'Représentant introuvable.')
        if (cur) Object.assign(cur, row)
        else d.reps.push({ ...row, id: crypto.randomUUID() })
        return { ok: true }
      }
      const { error } = op.id ? await db.from('agent_representatives').update(row).eq('id', op.id) : await db.from('agent_representatives').insert(row)
      check(error, 'rep.save')
      return { ok: true }
    }
    case 'type.save': {
      const { op: _op, code, ...patch } = op
      void _op
      await audit(ctx, 'admin.agent.type.update', 'agent_appointment_types', undefined, { code, ...patch })
      if (!db) {
        const t = demo().types.find((x) => x.code === code)
        if (!t) throw new RepoError('not_found', 'Type introuvable.')
        Object.assign(t, patch)
        return { ok: true }
      }
      const { error } = await db.from('agent_appointment_types').update(patch).eq('code', code)
      check(error, 'type.save')
      return { ok: true }
    }
    case 'blackout.add': {
      if (Date.parse(op.ends_at) <= Date.parse(op.starts_at)) throw new RepoError('invalid', 'La fin doit être après le début.')
      await audit(ctx, 'admin.agent.blackout.add', 'agent_blackouts', undefined, { representative_id: op.representative_id, starts_at: op.starts_at, ends_at: op.ends_at })
      const row = { representative_id: op.representative_id, starts_at: op.starts_at, ends_at: op.ends_at, reason: op.reason || null }
      if (!db) {
        demo().blackouts.push({ ...row, id: crypto.randomUUID() })
        return { ok: true }
      }
      const { error } = await db.from('agent_blackouts').insert(row)
      check(error, 'blackout.add')
      return { ok: true }
    }
    case 'blackout.delete': {
      await audit(ctx, 'admin.agent.blackout.delete', 'agent_blackouts', op.id)
      if (!db) {
        demo().blackouts = demo().blackouts.filter((b) => b.id !== op.id)
        return { ok: true }
      }
      const { error } = await db.from('agent_blackouts').delete().eq('id', op.id)
      check(error, 'blackout.delete')
      return { ok: true }
    }
    case 'appt.cancel': {
      await audit(ctx, 'admin.agent.appointment.cancel', 'agent_appointments', op.id)
      // Rendez-vous confirmé : la personne et le représentant sont prévenus ; réservation encore en
      // attente de confirmation : créneau simplement libéré.
      const cancelWhere = async (status: 'confirmed' | 'pending'): Promise<AppointmentRow | null> => {
        if (!db) {
          const a = demo().appointments.find((x) => x.id === op.id && x.status === status) ?? null
          if (a) Object.assign(a, { status: 'cancelled', cancelled_at: now })
          return a
        }
        const { data, error } = await db.from('agent_appointments').update({ status: 'cancelled', cancelled_at: now }).eq('id', op.id).eq('status', status).select(APPT_COLUMNS).maybeSingle()
        check(error, 'appt.cancel')
        return data as AppointmentRow | null
      }
      const confirmed = await cancelWhere('confirmed')
      if (confirmed) await notifyCancelled(confirmed)
      else await cancelWhere('pending')
      return { ok: true }
    }
    case 'callback.status': {
      await audit(ctx, 'admin.agent.callback.status', 'agent_callbacks', op.id, { status: op.status })
      const patch = { status: op.status, handled_at: op.status === 'new' ? null : now }
      if (!db) {
        const c = demo().callbacks.find((x) => x.id === op.id)
        if (c) Object.assign(c, patch)
        return { ok: true }
      }
      const { error } = await db.from('agent_callbacks').update({ ...patch, handled_by: op.status === 'new' || ctx.mode !== 'live' ? null : ctx.userId }).eq('id', op.id)
      check(error, 'callback.status')
      return { ok: true }
    }
    case 'wa.reply': {
      // Contenu non journalisé (seulement l'auteur et la conversation).
      await audit(ctx, 'admin.agent.whatsapp.reply', 'agent_wa_conversations', op.id)
      const r = await teamReply(op.id, op.text)
      if (!r.ok) throw new RepoError('unavailable', 'Message non envoyé : vérifiez la connexion WaChap (clé, compte, téléphone connecté).')
      return { ok: true }
    }
    case 'wa.release': {
      await audit(ctx, 'admin.agent.whatsapp.release', 'agent_wa_conversations', op.id)
      await releaseToBot(op.id)
      return { ok: true }
    }
    case 'message.save':
    case 'message.reset': {
      const old = (await readMessages(db)).find((m) => m.msg_key === op.msg_key && m.locale === op.locale)?.text ?? null
      await audit(ctx, `admin.agent.${op.op}`, 'agent_messages', undefined, { msg_key: op.msg_key, locale: op.locale, old, new: op.op === 'message.save' ? op.text : null })
      if (!db) {
        const d = demo()
        d.messages = d.messages.filter((m) => !(m.msg_key === op.msg_key && m.locale === op.locale))
        if (op.op === 'message.save') d.messages.push({ msg_key: op.msg_key, locale: op.locale, text: op.text, updated_at: now })
      } else if (op.op === 'message.save') {
        const { error } = await db.from('agent_messages').upsert({ msg_key: op.msg_key, locale: op.locale, text: op.text, updated_at: now, updated_by: ctx.mode === 'live' ? ctx.userId : null })
        check(error, 'message.save')
      } else {
        const { error } = await db.from('agent_messages').delete().eq('msg_key', op.msg_key).eq('locale', op.locale)
        check(error, 'message.reset')
      }
      invalidateAgentCache()
      return { ok: true }
    }
  }
}

/** Créneaux occupés de la semaine à venir (tableau de bord). */
export async function weekLoad(ctx: AdminCtx): Promise<number> {
  const now = Date.now()
  const busy = await readBusy(dbOf(ctx), new Date(now).toISOString(), new Date(now + 7 * 86_400_000).toISOString())
  return busy.length
}

export { KB_COLUMNS }
