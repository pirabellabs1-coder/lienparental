import { getLocale, getTranslations } from 'next-intl/server'
import { intlLocale } from '@/lib/i18n/config'
import { jsonError, jsonOk } from '@/lib/data/server/http'
import { familyContext, limited, readJson, rpcError } from '@/lib/coparents/server/context'
import { sharingPatchSchema, uuidSchema } from '@/lib/coparents/validation'
import type { SharingItem, SharingSummary } from '@/lib/coparents/types'
import { requireVaultUnlocked, vaultDeniedResponse } from '@/lib/vault-lock'

// GET   /api/coparents/sharing?childId=… : MES documents, dépenses et événements à venir
//       liés à cet enfant, avec leur état de partage.
// PATCH /api/coparents/sharing { kind, id, shared } : partage / retire du partage.
// Uniquement les éléments dont je suis l'auteur (RLS propriétaire + filtre user_id).
// Documents : coffre-fort déverrouillé exigé (0370 ; la base le refuse aussi). Verrouillé :
// GET renvoie `documentsLocked: true` sans les lister, PATCH répond 403 vault_locked.
// Le Journal lui-même n'est jamais partagé : pour une dépense, seuls le montant, la
// catégorie, le titre et la date deviennent visibles des parents liés.
export const dynamic = 'force-dynamic'

const fmtAmount = (cents: number, currency: string, locale: string) =>
  new Intl.NumberFormat(locale, { style: 'currency', currency: currency || 'EUR' }).format(cents / 100)

export async function GET(req: Request) {
  const ctx = await familyContext()
  if ('error' in ctx) return ctx.error
  const t = await getTranslations('server.coparents')
  const tooMany = await limited(ctx.user.id, 'read', 120, 60_000)
  if (tooMany) return tooMany
  const childId = new URL(req.url).searchParams.get('childId') ?? ''
  if (!uuidSchema.safeParse(childId).success) return jsonError(404, 'not_found', t('childNotFound'))

  // L'enfant doit m'être accessible en tant que titulaire ou parent (RLS 0340).
  const { data: child, error: cErr } = await ctx.db.from('children').select('id').eq('id', childId).is('deleted_at', null).maybeSingle()
  if (cErr) return rpcError(cErr, 'sharing.child')
  if (!child) return jsonError(404, 'not_found', t('childNotFound'))

  const since = new Date(Date.now() - 86_400_000).toISOString()
  const numLocale = intlLocale(await getLocale())
  const vault = await requireVaultUnlocked()
  const documentsLocked = !vault.ok
  const [docs, exps, evts] = await Promise.all([
    documentsLocked
      ? Promise.resolve({ data: [], error: null })
      : ctx.db.from('documents').select('id, name, created_at, family_shared')
        .eq('user_id', ctx.user.id).is('deleted_at', null).contains('children_ids', [childId])
        .order('created_at', { ascending: false }).limit(100),
    ctx.db.from('journal_entries').select('id, titre, occurred_at, journal_expenses(amount_cents, currency, family_shared)')
      .eq('user_id', ctx.user.id).eq('type', 'depense').is('deleted_at', null).contains('children_ids', [childId])
      .order('occurred_at', { ascending: false }).limit(100),
    ctx.db.from('calendar_events').select('id, titre, start_at, family_shared')
      .eq('user_id', ctx.user.id).is('deleted_at', null).contains('children_ids', [childId]).gte('start_at', since)
      .order('start_at', { ascending: true }).limit(100),
  ])
  const failed = docs.error ?? exps.error ?? evts.error
  if (failed) return rpcError(failed, 'sharing.list')

  type Exp = { amount_cents: number; currency: string; family_shared: boolean }
  const body: SharingSummary = {
    childId,
    documentsLocked,
    documents: ((docs.data ?? []) as { id: string; name: string; created_at: string; family_shared: boolean }[])
      .map<SharingItem>((d) => ({ kind: 'document', id: d.id, label: d.name, date: d.created_at, shared: d.family_shared })),
    expenses: ((exps.data ?? []) as { id: string; titre: string; occurred_at: string; journal_expenses: Exp | Exp[] | null }[])
      .flatMap<SharingItem>((e) => {
        const x = Array.isArray(e.journal_expenses) ? e.journal_expenses[0] : e.journal_expenses
        return x ? [{ kind: 'expense', id: e.id, label: e.titre, date: e.occurred_at, detail: fmtAmount(x.amount_cents, x.currency, numLocale), shared: x.family_shared }] : []
      }),
    events: ((evts.data ?? []) as { id: string; titre: string; start_at: string; family_shared: boolean }[])
      .map<SharingItem>((e) => ({ kind: 'event', id: e.id, label: e.titre, date: e.start_at, shared: e.family_shared })),
  }
  return jsonOk(body)
}

export async function PATCH(req: Request) {
  const ctx = await familyContext(req)
  if ('error' in ctx) return ctx.error
  const t = await getTranslations('server.coparents')
  const tooMany = await limited(ctx.user.id, 'write', 120, 60_000)
  if (tooMany) return tooMany
  const parsed = sharingPatchSchema.safeParse(await readJson(req))
  if (!parsed.success) return jsonError(422, 'invalid', t('hints.invalid_payload'))
  const { kind, id, shared } = parsed.data
  if (kind === 'document') {
    const vault = await requireVaultUnlocked()
    if (!vault.ok) return vaultDeniedResponse(vault)
  }

  const q = kind === 'document'
    ? ctx.db.from('documents').update({ family_shared: shared }).eq('id', id).eq('user_id', ctx.user.id).is('deleted_at', null).select('id')
    : kind === 'expense'
      ? ctx.db.from('journal_expenses').update({ family_shared: shared }).eq('entry_id', id).eq('user_id', ctx.user.id).select('entry_id')
      : ctx.db.from('calendar_events').update({ family_shared: shared }).eq('id', id).eq('user_id', ctx.user.id).is('deleted_at', null).select('id')
  const { data, error } = await q
  if (error) return rpcError(error, `sharing.${kind}`)
  if (!data || data.length === 0) return jsonError(404, 'not_found', t('notFound'))
  return jsonOk({ ok: true, shared })
}
