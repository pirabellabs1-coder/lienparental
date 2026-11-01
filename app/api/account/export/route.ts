/**
 * GET /api/account/export
 * Droit d'accès / portabilité (RGPD art. 15 & 20) : renvoie un fichier JSON
 * contenant les lignes appartenant à l'utilisateur connecté.
 *
 * - Lecture via le client RLS de l'utilisateur : impossible de lire les données d'autrui.
 * - Pagination interne par lots de 1000 (limite « max rows » de PostgREST).
 * - Secrets exclus : jetons de partage / de témoignage, hash de mot de passe de partage.
 * - Données médicales des enfants : exportées sous leur forme chiffrée (la clé
 *   applicative n'est jamais utilisée dans cette route).
 * - Anti-abus (docs/SECURITY.md §12) : un export tous les 7 jours, tracé dans audit_log.
 *
 * Réponses : 200 application/json (pièce jointe) | 401 | 403 | 429 | 5xx { error: { code, message } }.
 */
import { NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { createServiceClient, type TypedSupabaseClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'
import { requireAuthedUser } from '@/lib/auth/guard'
import { requireVaultUnlocked, vaultDeniedResponse } from '@/lib/vault-lock'

export const dynamic = 'force-dynamic'

const EXPORT_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000
const PAGE = 1000

type TableName = keyof Database['public']['Tables']

/** Tables exportées : nom → colonne propriétaire + colonnes (jamais de secrets). */
const TABLES: Array<{ table: TableName; owner: 'id' | 'user_id' | 'owner_id'; columns: string; order: string }> = [
  { table: 'users', owner: 'id', columns: '*', order: 'id' },
  { table: 'preferences', owner: 'user_id', columns: '*', order: 'user_id' },
  { table: 'children', owner: 'user_id', columns: '*', order: 'id' },
  { table: 'journal_entries', owner: 'user_id', columns: '*', order: 'id' },
  { table: 'calendar_events', owner: 'user_id', columns: '*', order: 'id' },
  { table: 'calendar_event_exceptions', owner: 'user_id', columns: '*', order: 'id' },
  { table: 'calendar_event_audit', owner: 'owner_id', columns: '*', order: 'id' },
  { table: 'categories', owner: 'user_id', columns: '*', order: 'id' },
  { table: 'documents', owner: 'user_id', columns: '*', order: 'id' },
  { table: 'shares', owner: 'user_id', columns: 'id, document_id, expires_at, revoked_at, download_count, max_downloads, created_at', order: 'id' },
  { table: 'testimony_requests', owner: 'user_id', columns: 'id, temoin_nom_pref, message_parent, questions, context_children, status, expires_at, sent_at, opened_at, submitted_at, revoked_at, created_at, updated_at', order: 'id' },
  { table: 'testimonies', owner: 'user_id', columns: 'id, request_id, reference, temoin, reponses, texte_original, texte_ia, texte_envoye, attachments, sent_at, created_at', order: 'id' },
  { table: 'ai_analyses', owner: 'user_id', columns: '*', order: 'id' },
  { table: 'subscriptions', owner: 'user_id', columns: 'id, plan, status, current_period_start, current_period_end, cancel_at_period_end, canceled_at, trial_end, created_at, updated_at', order: 'id' },
  { table: 'payments', owner: 'user_id', columns: 'id, amount_cents, currency, status, invoice_url, invoice_pdf_url, paid_at, created_at', order: 'id' },
  { table: 'notifications', owner: 'user_id', columns: '*', order: 'id' },
  { table: 'support_tickets', owner: 'user_id', columns: '*', order: 'id' },
]

function fail(status: number, code: string, message: string, headers: Record<string, string> = {}) {
  return NextResponse.json({ error: { code, message } }, { status, headers: { 'Cache-Control': 'no-store', ...headers } })
}

async function fetchAll(supabase: TypedSupabaseClient, t: (typeof TABLES)[number], uid: string) {
  // Table choisie dynamiquement dans une liste figée : on passe par le client non typé
  // (même instance, même session, même RLS).
  const db = supabase as unknown as SupabaseClient
  const rows: unknown[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from(t.table)
      .select(t.columns)
      .eq(t.owner, uid)
      .order(t.order, { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`export_failed:${t.table}`)
    const batch = (data ?? []) as unknown[]
    rows.push(...batch)
    if (batch.length < PAGE) break
  }
  return rows
}

export async function GET() {
  // Coffre-fort verrouillé : ces données en proviennent (chantier D).
  const vault = await requireVaultUnlocked()
  if (!vault.ok) return vaultDeniedResponse(vault)
  const t = await getTranslations('server.account')
  const tc = await getTranslations('server.common')
  if (!SUPABASE_ENABLED) return fail(501, 'demo_mode', tc('denied.disabled'))

  const ctx = await requireAuthedUser()
  if (!ctx.ok) {
    return ctx.reason === 'mfa_required'
      ? fail(403, 'mfa_required', tc('denied.mfa_required'))
      : fail(401, 'unauthenticated', tc('denied.unauthenticated'))
  }
  const { supabase, user } = ctx

  // Limite d'un export / 7 jours (audit_log n'est lisible/écrivable qu'en service_role).
  let admin: TypedSupabaseClient | null = null
  try {
    admin = createServiceClient()
  } catch {
    admin = null // sans service_role : export servi, limite non appliquée (journalisé côté serveur)
    console.warn('[account.export] service role unavailable: rate limit not enforced')
  }
  if (admin) {
    const { data: last } = await admin
      .from('audit_log')
      .select('created_at')
      .eq('user_id', user.id)
      .eq('action', 'account.export')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (last) {
      const wait = new Date(last.created_at).getTime() + EXPORT_INTERVAL_MS - Date.now()
      if (wait > 0) {
        const days = Math.ceil(wait / (24 * 60 * 60 * 1000))
        return fail(429, 'export_rate_limited', t('exportRateLimited', { days }), {
          'Retry-After': String(Math.ceil(wait / 1000)),
        })
      }
    }
  }

  const data: Record<string, unknown[]> = {}
  try {
    for (const table of TABLES) data[table.table] = await fetchAll(supabase, table, user.id)
  } catch {
    return fail(500, 'export_failed', t('exportFailed'))
  }

  if (admin) {
    await admin.from('audit_log').insert({
      user_id: user.id,
      actor_type: 'user',
      action: 'account.export',
      entity: 'users',
      entity_id: user.id,
      metadata: { tables: TABLES.length },
    })
  }

  const now = new Date()
  const payload = {
    format: 'lien-parental-export',
    version: 1,
    generated_at: now.toISOString(),
    account: {
      id: user.id,
      email: user.email ?? null,
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at ?? null,
      email_confirmed_at: user.email_confirmed_at ?? null,
    },
    notes: [
      'Les informations médicales des enfants (children.infos_medicales) sont exportées chiffrées.',
      'Les fichiers du coffre-fort ne sont pas inclus : téléchargez-les depuis l’application.',
      'Les jetons de partage et de témoignage sont exclus pour votre sécurité.',
    ],
    data,
  }

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="lien-parental-export-${now.toISOString().slice(0, 10)}.json"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
