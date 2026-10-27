/**
 * POST /api/account/delete
 * Body JSON : { "password": string, "confirm": "SUPPRIMER" | "DELETE" | "EXCLUIR" }
 *
 * Suppression de compte — politique docs/SECURITY.md §7 (30 jours) :
 *  1. Authentification revalidée (getUser + aal2 si 2FA) — 401 / 403.
 *  2. Ré-authentification par mot de passe (client éphémère) — 401 si incorrect, 429 si limité.
 *  3. Stripe configuré : abonnement en cours résilié immédiatement (sans prorata) — 503 si échec.
 *     Étapes 3 et 4a à 4c : lib/account/deletion.ts (partagé avec la suppression admin).
 *  4. service_role :
 *     a. public.users : deleted_at = now() + anonymisation immédiate de l'identité
 *        (e-mail remplacé pour libérer l'unicité, nom, coordonnées, photo) ;
 *     b. photo de profil supprimée du bucket « avatars » ;
 *     c. auth.admin.deleteUser(id, true) : soft delete GoTrue → connexion impossible,
 *        sessions révoquées, ligne conservée (pas de cascade immédiate) ;
 *     d. audit_log « account.delete ».
 *  5. Les contenus restent 30 jours puis public.purge_deleted_accounts() (cron) supprime
 *     définitivement auth.users → cascade sur toutes les tables.
 *
 * Réponses : 200 { ok: true } | 4xx/5xx { error: { code, message } } (jamais de PII).
 */
import { NextResponse, type NextRequest } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAuthedUser } from '@/lib/auth/guard'
import { deleteAccountSchema, firstIssue } from '@/lib/auth/validation'
import { verifyPassword } from '@/lib/auth/verify-password'
import { RATE_LIMIT_MESSAGE } from '@/lib/auth/errors'
import { softDeleteAccount } from '@/lib/account/deletion'
import { flushForActor } from '@/lib/notify/jobs'

export const dynamic = 'force-dynamic'

function fail(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const t = await getTranslations('server.account')
  const tc = await getTranslations('server.common')
  if (!SUPABASE_ENABLED) return fail(501, 'demo_mode', tc('denied.disabled'))

  const ctx = await requireAuthedUser()
  if (!ctx.ok) {
    return ctx.reason === 'mfa_required'
      ? fail(403, 'mfa_required', tc('denied.mfa_required'))
      : fail(401, 'unauthenticated', tc('denied.unauthenticated'))
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail(400, 'invalid_body', t('invalidRequest'))
  }
  const parsed = deleteAccountSchema.safeParse(body)
  if (!parsed.success) return fail(422, 'validation_failed', firstIssue(parsed.error))

  const { user } = ctx
  const check = await verifyPassword(user.email ?? '', parsed.data.password)
  if (check === 'invalid') return fail(401, 'invalid_password', t('wrongPassword'))
  if (check === 'rate_limited') return fail(429, 'rate_limited', RATE_LIMIT_MESSAGE)
  if (check === 'error') return fail(503, 'auth_unavailable', t('verificationUnavailable'))

  let admin
  try {
    admin = createServiceClient()
  } catch {
    return fail(503, 'service_unavailable', t('deleteUnavailable'))
  }

  // Résiliation Stripe immédiate, révocation Google, anonymisation, avatar, soft delete GoTrue
  // (lib/account/deletion.ts, logique partagée avec la suppression par un administrateur).
  const res = await softDeleteAccount(admin, user.id)
  if (!res.ok) {
    if (res.code === 'billing_unavailable') {
      return fail(503, 'billing_unavailable', t('billingUnavailable'))
    }
    if (res.code === 'delete_failed') return fail(500, 'delete_failed', t('deleteFailed'))
    return fail(500, 'delete_partial', t('deletePartial'))
  }
  const sub = res.hadActiveSubscription
  const stripeCanceled = res.stripeCanceled

  // d. Journal d'audit (sans PII).
  await admin.from('audit_log').insert({
    user_id: user.id,
    actor_type: 'user',
    action: 'account.delete',
    entity: 'users',
    entity_id: user.id,
    metadata: { purge_after_days: 30, had_active_subscription: !!sub, stripe_subscription_canceled: stripeCanceled },
  })

  // Alerte « suppression demandée » (déclencheur 0440, envoyée à l'adresse d'origine) livrée tout de suite.
  await flushForActor(user.id).catch(() => null)

  // Efface les cookies de session de ce navigateur (la session est déjà révoquée côté serveur).
  await ctx.supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)

  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
