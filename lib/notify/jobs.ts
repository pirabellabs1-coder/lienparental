import 'server-only'
/**
 * Écoulement de public.notification_jobs (0440).
 *  - runNotificationsCron : rappels du calendrier arrivés à échéance → file, puis
 *    livraison par lots bornés dans un budget de temps, puis purge (> 30 jours).
 *  - flushForActor : livraison immédiate des tâches dues dont l'appelant est l'auteur
 *    (route /api/notifications/flush, appelée juste après l'action).
 * Réservation FOR UPDATE SKIP LOCKED (notif_claim_jobs) : deux passages simultanés
 * ne livrent jamais la même tâche. Échec partiel : réessai avec attente exponentielle,
 * sans renvoyer les canaux déjà livrés (colonne delivered).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { dispatch } from './core'
import { CHANNELS, isNotifyEvent, type Channel } from './events'
import { realDeps, serviceDb } from './server'
import { recordSessionFromServer } from './login'
import { enqueueRecurringReminders } from './recurring'

type JobRow = {
  id: number
  user_id: string
  event: string
  payload: Record<string, unknown>
  dedupe_key: string
  delivered: string[] | null
  created_at: string
}

export type JobsReport = { claimed: number; done: number; skipped: number; retried: number; reminders: number; purged: number; sessionsPurged: number; unconfirmedPurged: number; truncated: boolean }

const emptyReport = (): JobsReport => ({ claimed: 0, done: 0, skipped: 0, retried: 0, reminders: 0, purged: 0, sessionsPurged: 0, unconfirmedPurged: 0, truncated: false })

async function finish(db: SupabaseClient, id: number, status: 'done' | 'skipped' | 'retry' | 'failed' | 'defer', delivered: Channel[], error: string | null) {
  const { error: e } = await db.rpc('notif_finish_job', { p_id: id, p_status: status, p_delivered: delivered, p_error: error })
  if (e) console.warn('[notify] clôture de tâche impossible', { code: e.code })
}

async function processBatch(db: SupabaseClient, limit: number, actorId: string | null, report: JobsReport): Promise<number> {
  const { data, error } = await db.rpc('notif_claim_jobs', { p_limit: limit, p_actor: actorId })
  if (error) throw new Error(`claim_${error.code ?? 'error'}`)
  const jobs = (data ?? []) as JobRow[]
  report.claimed += jobs.length
  const deps = realDeps(db)

  // Petit parallélisme : les envois (Resend, push) dominent le temps.
  const queue = [...jobs]
  const worker = async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      // Filet serveur de l'alerte « nouvel appareil » (déclencheur sur auth.sessions).
      if (job.event === 'login_check') {
        try {
          const sid = typeof job.payload?.session_id === 'string' ? job.payload.session_id : ''
          const outcome = sid ? await recordSessionFromServer(db, job.user_id, sid, new Date(job.created_at)) : 'skipped'
          if (outcome === 'defer') { await finish(db, job.id, 'defer', [], 'awaiting_mfa'); continue }
          report.done++
          await finish(db, job.id, outcome === 'skipped' ? 'skipped' : 'done', [], outcome)
        } catch (e) {
          report.retried++
          await finish(db, job.id, 'retry', [], e instanceof Error ? e.message.slice(0, 80) : 'error')
        }
        continue
      }
      if (!isNotifyEvent(job.event)) { await finish(db, job.id, 'failed', [], 'unknown_event'); continue }
      const already = (job.delivered ?? []).filter((c): c is Channel => (CHANNELS as readonly string[]).includes(c))
      // Date affichée dans les alertes : celle de l'événement (dépôt de la tâche), pas celle de l'envoi.
      const payload = { date: job.created_at, ...(job.payload ?? {}) }
      const res = await dispatch(deps, {
        userId: job.user_id, event: job.event, payload, dedupeKey: job.dedupe_key, alreadyDelivered: already,
      })
      if (res.status === 'ok') { report.done++; await finish(db, job.id, 'done', res.delivered, null) }
      else if (res.status === 'skipped') { report.skipped++; await finish(db, job.id, 'skipped', [], res.reason ?? 'skipped') }
      else { report.retried++; await finish(db, job.id, 'retry', res.delivered, res.failed.join(',') || res.reason || 'error') }
    }
  }
  await Promise.all(Array.from({ length: Math.min(5, jobs.length) }, worker))
  return jobs.length
}

export async function runNotificationsCron(opts: { budgetMs?: number; batch?: number } = {}): Promise<JobsReport | null> {
  const db = serviceDb()
  if (!db) return null
  const budget = opts.budgetMs ?? 40_000
  const batch = opts.batch ?? 50
  const started = Date.now()
  const report = emptyReport()

  const { data: reminders, error: remErr } = await db.rpc('notif_enqueue_calendar_reminders', { p_limit: 500 })
  if (remErr) console.warn('[notify] rappels du calendrier non planifiés', { code: remErr.code })
  else report.reminders = typeof reminders === 'number' ? reminders : 0
  // Séries récurrentes (0660) : une occurrence à la fois, développées ici (lib/recurrence).
  report.reminders += await enqueueRecurringReminders(db)

  for (;;) {
    if (Date.now() - started > budget) { report.truncated = true; break }
    const n = await processBatch(db, batch, null, report)
    if (n < batch) break
  }

  const { data: purged } = await db.rpc('notif_purge_jobs')
  report.purged = typeof purged === 'number' ? purged : 0
  const { data: sessions } = await db.rpc('notif_purge_sessions')
  report.sessionsPurged = typeof sessions === 'number' ? sessions : 0

  // Comptes jamais confirmés de plus de 24 h, sans données : suppression par l'API admin GoTrue.
  const { data: stale } = await db.rpc('notif_unconfirmed_accounts', { p_limit: 50 })
  for (const id of (Array.isArray(stale) ? stale : []) as string[]) {
    if (Date.now() - started > budget + 10_000) break
    const { error } = await db.auth.admin.deleteUser(id)
    if (!error) report.unconfirmedPurged++
  }
  return report
}

export async function flushForActor(actorId: string): Promise<JobsReport | null> {
  const db = serviceDb()
  if (!db) return null
  const report = emptyReport()
  await processBatch(db, 20, actorId, report)
  return report
}
