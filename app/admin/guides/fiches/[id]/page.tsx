import type { Metadata } from 'next'
import { pageAdminCtx } from '@/lib/contenus/api'
import { listTerritoiresAdmin } from '@/lib/contenus/repo'
import { loadForEdit } from '@/lib/contenus/page-helpers'
import { DEFAULT_TERRITOIRE } from '@/lib/guide/types'
import { FicheEditor } from '@/components/admin/guides/FicheEditor'

export const metadata: Metadata = { title: 'Fiche du guide' }
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function FicheEditPage({ params, searchParams }: Props) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const ctx = await pageAdminCtx()
  const [record, territoires] = await Promise.all([loadForEdit(ctx, 'fiche', id), listTerritoiresAdmin(ctx)])
  const wanted = typeof sp.territoire === 'string' ? sp.territoire : undefined
  const territoire = territoires.find((t) => t.code === wanted)?.code ?? DEFAULT_TERRITOIRE
  return <FicheEditor key={record?.id ?? 'nouveau'} initial={record} territoires={territoires} defaultTerritoire={territoire} />
}
