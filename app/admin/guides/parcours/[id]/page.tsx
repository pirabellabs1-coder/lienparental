import type { Metadata } from 'next'
import { pageAdminCtx } from '@/lib/contenus/api'
import { listContent, listTerritoiresAdmin } from '@/lib/contenus/repo'
import { loadForEdit } from '@/lib/contenus/page-helpers'
import { DEFAULT_TERRITOIRE } from '@/lib/guide/types'
import { ParcoursEditor } from '@/components/admin/guides/ParcoursEditor'

export const metadata: Metadata = { title: 'Parcours du guide' }
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function ParcoursEditPage({ params, searchParams }: Props) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const ctx = await pageAdminCtx()
  const [record, territoires, fiches] = await Promise.all([loadForEdit(ctx, 'parcours', id), listTerritoiresAdmin(ctx), listContent(ctx, 'fiche')])
  const wanted = typeof sp.territoire === 'string' ? sp.territoire : undefined
  const territoire = territoires.find((t) => t.code === wanted)?.code ?? DEFAULT_TERRITOIRE
  const refs = fiches
    .filter((f) => f.statut !== 'archive')
    .map((f) => ({ slug: f.slug, titre: f.titre, territoire: f.territoire, statut: f.statut }))
    .sort((a, b) => a.titre.localeCompare(b.titre, 'fr'))
  return <ParcoursEditor key={record?.id ?? 'nouveau'} initial={record} territoires={territoires} defaultTerritoire={territoire} fiches={refs} />
}
