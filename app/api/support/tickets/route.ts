/**
 * POST /api/support/tickets  { subject, body, category? } → 201 { data: { id } }
 * Création d'un ticket par l'utilisateur connecté (formulaires « Nous contacter » et
 * « Signaler un problème » du centre d'aide).
 *
 * - Réel : session revalidée (requireAuthedUser, MFA comprise), même origine, insertion avec
 *   le client RLS de l'utilisateur (policy support_insert_self). La base impose la priorité
 *   selon le plan effectif (0380 : Coparentalité+ = haute), le statut et un fil vide (0400).
 * - Démonstration : ticket ajouté au magasin mémoire du back-office (visible dans /admin/support).
 * - Limite : 5 tickets / 10 min / utilisateur.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { randomUUID } from 'node:crypto'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { DEMO_MODE } from '@/lib/demo-auth'
import { requireAuthedUser } from '@/lib/auth/guard'
import { getCurrentUser } from '@/lib/auth/session'
import { sameOrigin, readJson } from '@/lib/contenus/api'
import { zodIssues } from '@/lib/contenus/types'
import { newTicketSchema } from '@/lib/admin/ops/types'
import { opsDemo } from '@/lib/admin/ops/demo'
import { rateLimit, userKey } from '@/lib/data/server/rate-limit'

export const dynamic = 'force-dynamic'

function fail(status: number, code: string, message: string, issues?: { path: string; message: string }[]) {
  return NextResponse.json({ error: { code, message, ...(issues?.length ? { issues } : {}) } }, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const t = await getTranslations('server.support')
  const tc = await getTranslations('server.common')
  if (!sameOrigin(req)) return fail(403, 'bad_origin', t('badOrigin'))

  if (!SUPABASE_ENABLED) {
    if (!DEMO_MODE) return fail(503, 'not_configured', tc('denied.disabled'))
    const me = await getCurrentUser()
    if (!me) return fail(401, 'unauthenticated', tc('denied.unauthenticated'))
    const parsed = newTicketSchema.safeParse(await readJson(req))
    if (!parsed.success) return fail(422, 'invalid', t('checkFields'), zodIssues(parsed.error))
    if (!(await rateLimit(userKey('support-ticket', me.id), 5, 10 * 60_000)).ok) return fail(429, 'rate_limited', t('rateLimited'))
    const now = new Date().toISOString()
    const id = randomUUID()
    opsDemo().tickets.unshift({
      id, subject: parsed.data.subject, body: parsed.data.body, category: parsed.data.category, status: 'open',
      priority: me.plan === 'premium' ? 'normal' : 'low', messages: [], createdAt: now, updatedAt: now, closedAt: null,
      lastReplyAt: null, lastReplyBy: null,
      requester: { id: me.id, email: me.email || 'compte.demo@demo.lienparental.fr', prenom: me.prenom || null, plan: me.plan === 'premium' ? 'premium' : 'free', deleted: false },
    })
    return NextResponse.json({ data: { id } }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
  }

  const auth = await requireAuthedUser()
  if (!auth.ok) {
    return auth.reason === 'mfa_required'
      ? fail(403, 'mfa_required', tc('denied.mfa_required'))
      : fail(401, 'unauthenticated', tc('denied.unauthenticated'))
  }
  const parsed = newTicketSchema.safeParse(await readJson(req))
  if (!parsed.success) return fail(422, 'invalid', t('checkFields'), zodIssues(parsed.error))
  if (!(await rateLimit(userKey('support-ticket', auth.user.id), 5, 10 * 60_000)).ok) {
    return fail(429, 'rate_limited', t('rateLimited'))
  }

  const { data, error } = await auth.supabase
    .from('support_tickets')
    .insert({ user_id: auth.user.id, subject: parsed.data.subject, body: parsed.data.body, category: parsed.data.category })
    .select('id')
    .single()
  if (error || !data) {
    console.warn('[support] création du ticket impossible (code %s)', error?.code ?? 'inconnu')
    return fail(503, 'unavailable', t('sendFailed'))
  }
  return NextResponse.json({ data: { id: data.id } }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
}
