import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { pageAdminCtx } from '@/lib/contenus/api'
import { listContent, listTerritoiresAdmin } from '@/lib/contenus/repo'
import { DEFAULT_TERRITOIRE } from '@/lib/guide/types'
import { cn } from '@/lib/cn'
import { FicheList, ParcoursList, PartenaireList } from '@/components/admin/contenus/lists'
import { ImportButton } from '@/components/admin/contenus/ImportButton'
import { ModeNotice, PageHeader, newBtn } from '@/components/admin/contenus/PageHeader'
import { TerritoiresManager } from '@/components/admin/guides/TerritoiresManager'

export const metadata: Metadata = { title: 'Guides parentaux' }
export const dynamic = 'force-dynamic'

const TABS = [
  { key: 'fiches', label: 'Fiches' },
  { key: 'parcours', label: 'Parcours' },
  { key: 'partenaires', label: 'Partenaires' },
  { key: 'territoires', label: 'Territoires' },
] as const
type Tab = (typeof TABS)[number]['key']

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

export default async function AdminGuidesPage({ searchParams }: Props) {
  const sp = await searchParams
  const ctx = await pageAdminCtx()
  const territoires = await listTerritoiresAdmin(ctx)
  const tab: Tab = TABS.some((t) => t.key === one(sp.onglet)) ? (one(sp.onglet) as Tab) : 'fiches'
  const wanted = one(sp.territoire)
  const territoire = territoires.find((t) => t.code === wanted)?.code ?? territoires.find((t) => t.code === DEFAULT_TERRITOIRE)?.code ?? territoires[0]?.code ?? DEFAULT_TERRITOIRE
  const q = (o: Record<string, string>) => `/admin/guides?${new URLSearchParams({ onglet: tab, territoire, ...o })}`

  const [fiches, parcours, partenaires] = await Promise.all([
    listContent(ctx, 'fiche', { territoire }),
    tab === 'parcours' ? listContent(ctx, 'parcours', { territoire }) : Promise.resolve([]),
    tab === 'partenaires' ? listContent(ctx, 'partenaire', { territoire }) : Promise.resolve([]),
  ])
  const allFiches = tab === 'territoires' ? await listContent(ctx, 'fiche') : []
  const counts = allFiches.reduce<Record<string, number>>((acc, f) => { acc[f.territoire ?? ''] = (acc[f.territoire ?? ''] ?? 0) + 1; return acc }, {})

  const newHref = tab === 'parcours' ? `/admin/guides/parcours/nouveau?territoire=${territoire}` : tab === 'partenaires' ? `/admin/guides/partenaires/nouveau?territoire=${territoire}` : `/admin/guides/fiches/nouveau?territoire=${territoire}`
  const newLabel = tab === 'parcours' ? 'Nouveau parcours' : tab === 'partenaires' ? 'Nouvelle offre' : 'Nouvelle fiche'

  return (
    <div>
      <PageHeader
        title="Guides parentaux"
        description="Fiches pratiques, parcours pas à pas et offres partenaires, par territoire. Seuls les éléments publiés sont visibles des parents."
        actions={
          <>
            {ctx.mode === 'live' && tab !== 'territoires' && <ImportButton what="guide" />}
            {tab !== 'territoires' && <Link href={newHref} className={newBtn}><Plus className="h-4 w-4" aria-hidden="true" /> {newLabel}</Link>}
          </>
        }
      />
      <ModeNotice mode={ctx.mode} />

      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <nav aria-label="Sections du guide" className="-mx-1 flex gap-1 overflow-x-auto px-1 [scrollbar-width:none]">
          {TABS.map((t) => (
            <Link key={t.key} href={`/admin/guides?${new URLSearchParams({ onglet: t.key, territoire })}`} aria-current={tab === t.key ? 'page' : undefined}
              className={cn('inline-flex min-h-[44px] shrink-0 items-center rounded-xl px-4 text-[14px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500',
                tab === t.key ? 'bg-leaf-500 text-white' : 'bg-white text-night-800 ring-1 ring-inset ring-[#E5E7EB] hover:bg-night-50')}>
              {t.label}
            </Link>
          ))}
        </nav>
        {tab !== 'territoires' && territoires.length > 1 && (
          <nav aria-label="Territoire" className="flex flex-wrap items-center gap-1 text-[13.5px]">
            <span className="mr-1 font-semibold text-night-600">Territoire :</span>
            {territoires.map((t) => (
              <Link key={t.code} href={q({ territoire: t.code })} aria-current={t.code === territoire ? 'true' : undefined}
                className={cn('inline-flex min-h-[44px] items-center rounded-full px-3 font-bold', t.code === territoire ? 'bg-night-900 text-white' : 'text-night-700 hover:bg-night-50')}>
                {t.nom}{!t.disponible && <span className="sr-only"> (masqué)</span>}{!t.disponible && <span aria-hidden="true" className="ml-1 text-[11px] font-normal opacity-75">masqué</span>}
              </Link>
            ))}
          </nav>
        )}
      </div>

      <div className="mt-5">
        {tab === 'fiches' && <FicheList records={fiches} />}
        {tab === 'parcours' && <ParcoursList records={parcours} />}
        {tab === 'partenaires' && <PartenaireList records={partenaires} />}
        {tab === 'territoires' && <TerritoiresManager territoires={territoires} counts={counts} />}
      </div>
    </div>
  )
}
