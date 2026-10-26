import 'server-only'
/**
 * Écoulement planifié de la file Google Agenda (toutes les 5 min, tous les utilisateurs).
 *
 * Complète l'écoulement « opportuniste » (synchronisations suivantes, écran de paramètres) :
 * sans lui, une tâche en réessai n'est rejouée que si son auteur revient dans l'application.
 *
 * - Client service_role (contourne la RLS) : utilisé comme `userDb` de processQueue, dont
 *   la lecture d'événement filtre EXPLICITEMENT `user_id = <propriétaire de la tâche>`
 *   (readEvent, lib/integrations/google/sync.ts). Aucun événement d'autrui n'est envoyé.
 * - Borné : au plus `maxUsers` utilisateurs, `perUser` tâches chacun, et un budget de temps
 *   global ; ce qui reste est repris au passage suivant (réservation SKIP LOCKED côté SQL).
 * - Une erreur sur un utilisateur n'interrompt pas les autres.
 */
import { processQueue } from './sync'
import { admin } from './store'

export type CronOptions = { maxUsers?: number; perUser?: number; budgetMs?: number }
export type CronReport = { users: number; processed: number; remaining: number; reauthRequired: number; errors: number; truncated: boolean }

export const CRON_DEFAULTS = { maxUsers: 25, perUser: 10, budgetMs: 40_000 } as const

/** Utilisateurs ayant au moins une tâche due (status pending, next_attempt_at ≤ maintenant), les plus anciennes d'abord. */
export async function usersWithDueJobs(maxUsers: number, now = new Date()): Promise<string[]> {
  const { data, error } = await admin()
    .from('google_sync_queue')
    .select('user_id')
    .eq('status', 'pending')
    .lte('next_attempt_at', now.toISOString())
    .order('next_attempt_at', { ascending: true })
    // Pas de DISTINCT dans l'API REST : on lit un peu plus de lignes et on dédoublonne.
    .limit(maxUsers * 20)
  if (error) throw new Error(`usersWithDueJobs: ${error.code ?? 'read'}`)
  const ids: string[] = []
  for (const r of (data ?? []) as { user_id: string }[]) {
    if (!ids.includes(r.user_id)) ids.push(r.user_id)
    if (ids.length >= maxUsers) break
  }
  return ids
}

export async function runGoogleQueueCron(opts: CronOptions = {}): Promise<CronReport> {
  const maxUsers = Math.max(1, Math.min(opts.maxUsers ?? CRON_DEFAULTS.maxUsers, 100))
  const perUser = Math.max(1, Math.min(opts.perUser ?? CRON_DEFAULTS.perUser, 25))
  const budgetMs = opts.budgetMs ?? CRON_DEFAULTS.budgetMs
  const started = Date.now()

  const users = await usersWithDueJobs(maxUsers)
  const db = admin()
  const report: CronReport = { users: 0, processed: 0, remaining: 0, reauthRequired: 0, errors: 0, truncated: false }
  for (const userId of users) {
    if (Date.now() - started > budgetMs) { report.truncated = true; break }
    report.users++
    try {
      const r = await processQueue(userId, db, perUser)
      report.processed += r.processed
      report.remaining += r.remaining
      if (r.reauthRequired) report.reauthRequired++
    } catch {
      // Identifiant jamais journalisé (donnée personnelle) : seul le compteur remonte.
      report.errors++
    }
  }
  return report
}
