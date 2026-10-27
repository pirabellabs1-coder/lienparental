'use client'

import Link from 'next/link'
import { use, useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { notFound } from 'next/navigation'
import { FileText, Heart, Share } from 'lucide-react'
import { ScreenHeader, headerIconBtn } from '@/components/coffre/ScreenHeader'
import { StatusBadge } from '@/components/coffre/StatusBadge'
import { LetterSheet } from '@/components/coffre/LetterSheet'
import { btn } from '@/components/coffre/buttons'
import { useAnnounce } from '@/components/coffre/useAnnounce'
import { ModeleGenerator } from '@/components/modeles/ModeleGenerator'
import { frDate, getModele, modeleCategoryLabel, modelePages } from '@/lib/mock-vault'
import { usePublishedTemplate } from '@/lib/modeles/client'
import { templateCategoryLabel } from '@/lib/modeles/template'
import { cn } from '@/lib/cn'
import { intlLocale } from '@/lib/i18n/config'
import { contentLangAttr } from '@/lib/contenus/locale'

const FAV_KEY = 'lp.modeles.favoris'
const CATEGORY_KEYS = new Set<string>(['juridique', 'communication', 'scolaire', 'autre'])

/** Date « 12 mai 2024 » : format français historique (frDate) en français, Intl sinon. */
function useYmdDate() {
  const locale = useLocale()
  return (ymd: string) => {
    if (locale === 'fr') return frDate(ymd)
    const d = new Date(`${ymd}T00:00:00Z`)
    return Number.isNaN(d.getTime()) ? ymd : new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d)
  }
}

function useFavorite(slug: string, announce: (msg: string) => void) {
  const tr = useTranslations('coach.templates.detail')
  const [fav, setFav] = useState(false)
  useEffect(() => {
    try { setFav((JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]') as string[]).includes(slug)) } catch { /* ignore */ }
  }, [slug])
  const toggle = () => {
    const next = !fav
    setFav(next)
    try {
      const list = new Set(JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]') as string[])
      if (next) list.add(slug); else list.delete(slug)
      localStorage.setItem(FAV_KEY, JSON.stringify([...list]))
    } catch { /* ignore */ }
    announce(next ? tr('added') : tr('removed'))
  }
  return [fav, toggle] as const
}

async function shareModele(slug: string, title: string, text: string, announce: (msg: string) => void, copiedMsg: string) {
  const url = `${window.location.origin}/app/modeles/${slug}`
  if (navigator.share) { try { await navigator.share({ title, text, url }) } catch { /* annulé */ } return }
  try { await navigator.clipboard.writeText(url); announce(copiedMsg) } catch { /* ignore */ }
}

function HeaderActions({ fav, onFav, onShare }: { fav: boolean; onFav: () => void; onShare: () => void }) {
  const tr = useTranslations('coach.templates.detail')
  return (
    <>
      <button type="button" onClick={onShare} aria-label={tr('share')} className={headerIconBtn}>
        <Share className="h-5 w-5" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onFav}
        aria-pressed={fav}
        aria-label={tr('favorite')}
        className={cn(headerIconBtn, '-mr-2', fav && 'text-alert-500')}
      >
        <Heart className="h-5 w-5" fill={fav ? 'currentColor' : 'none'} aria-hidden="true" />
      </button>
    </>
  )
}

// « Détail du document » : modèle publié depuis l'admin (formulaire + génération PDF/Word),
// repli sur la maquette de démonstration (lib/mock-vault) si le modèle n'est pas publié.
export default function ModeleDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const tr = useTranslations('coach.templates')
  const locale = useLocale()
  const ymdDate = useYmdDate()
  const { status, data } = usePublishedTemplate(slug)
  const { announce, node } = useAnnounce()
  const [fav, toggleFav] = useFavorite(slug, announce)
  const actions = (title: string, text: string) => (
    <HeaderActions fav={fav} onFav={toggleFav} onShare={() => void shareModele(slug, title, text, announce, tr('detail.linkCopied'))} />
  )

  if (status === 'loading') {
    return (
      <>
        <ScreenHeader backHref="/app/modeles" />
        <div className="w-full px-5" aria-busy="true">
          <p role="status" className="sr-only">{tr('detail.loading')}</p>
          <div aria-hidden="true" className="flex flex-col items-center">
            <span className="h-[72px] w-[72px] rounded-full bg-night-50 motion-safe:animate-pulse" />
            <span className="mt-4 h-5 w-56 rounded bg-night-50 motion-safe:animate-pulse" />
            <span className="mt-3 h-4 w-72 max-w-full rounded bg-night-50 motion-safe:animate-pulse" />
          </div>
        </div>
      </>
    )
  }

  if (!data) {
    const legacy = getModele(slug)
    if (!legacy) notFound()
    return <LegacyModeleDetail m={legacy} headerRight={actions(legacy.title, legacy.description)} node={node} />
  }

  const t = data
  const rows: [string, string][] = [
    [tr('detail.category'), CATEGORY_KEYS.has(t.categorie) ? tr(`categories.${t.categorie}`) : templateCategoryLabel(t.categorie)],
    [tr('detail.format'), tr('pages', { count: t.pages })],
    [tr('detail.updated'), ymdDate(t.updatedAt.slice(0, 10))],
  ]

  return (
    <>
      <ScreenHeader backHref="/app/modeles" right={actions(t.titre, t.description)} />
      <div className="w-full px-5 pb-8">
        <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
          <span aria-hidden="true" className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-leaf-50 text-leaf-500">
            <FileText className="h-9 w-9" strokeWidth={1.8} />
          </span>
          <h1 className="mt-4 max-w-[320px] text-[20px] font-extrabold leading-tight text-night-900 lg:max-w-none lg:text-[24px]" lang={contentLangAttr(t.lang, locale)}>{t.titre}</h1>
          {t.badge && <StatusBadge kind={t.badge === 'Populaire' ? 'populaire' : 'nouveau'} className="mt-3" />}
          <p className="mt-4 max-w-[310px] text-[13px] leading-relaxed text-night-700 lg:max-w-[640px]" lang={contentLangAttr(t.lang, locale)}>{t.description}</p>
        </div>

        <section aria-labelledby="infos" className="mt-6 lg:max-w-[640px]">
          <h2 id="infos" className="text-[14px] font-extrabold text-night-900">{tr('detail.info')}</h2>
          <dl className="mt-2 divide-y divide-night-100 rounded-2xl border border-night-100 bg-white px-4 shadow-soft">
            {rows.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-4 py-3.5 text-[13px]">
                <dt className="text-night-700">{k}</dt>
                <dd className="text-right font-semibold text-night-900">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="remplir" className="mt-8">
          <h2 id="remplir" className="text-[16px] font-extrabold text-night-900">{tr('detail.fillTitle')}</h2>
          <p className="mt-1 text-[13px] text-night-600">{tr('detail.fillHint')}</p>
          <div className="mt-4">
            <ModeleGenerator template={t} contentLang={t.lang} />
          </div>
        </section>
      </div>
      {node}
    </>
  )
}

function LegacyModeleDetail({ m, headerRight, node }: { m: NonNullable<ReturnType<typeof getModele>>; headerRight: React.ReactNode; node: React.ReactNode }) {
  const tr = useTranslations('coach.templates')
  const ymdDate = useYmdDate()
  const pages = modelePages(m)
  const rows: [string, string][] = [
    [tr('detail.category'), CATEGORY_KEYS.has(m.category) ? tr(`categories.${m.category}`) : modeleCategoryLabel(m.category)],
    [tr('detail.format'), tr('pages', { count: pages })],
    [tr('detail.updated'), ymdDate(m.updatedAt)],
    [tr('detail.compatible'), m.compatible],
  ]

  return (
    <>
      <ScreenHeader
        backHref="/app/modeles"
        right={headerRight}
      />
      <div className="w-full px-5">
        <div className="flex flex-col items-center text-center">
          <span aria-hidden="true" className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-leaf-50 text-leaf-500">
            <FileText className="h-9 w-9" strokeWidth={1.8} />
          </span>
          <h1 className="mt-4 max-w-[320px] text-[20px] font-extrabold leading-tight text-night-900">{m.title}</h1>
          <StatusBadge kind="modele" className="mt-3">{m.kind}</StatusBadge>
          <p className="mt-4 max-w-[310px] text-[13px] leading-relaxed text-night-700">{m.description}</p>
        </div>

        <section aria-labelledby="infos" className="mt-6">
          <h2 id="infos" className="text-[14px] font-extrabold text-night-900">{tr('detail.info')}</h2>
          <dl className="mt-2 divide-y divide-night-100 rounded-2xl border border-night-100 bg-white px-4 shadow-soft">
            {rows.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-4 py-3.5 text-[13px]">
                <dt className="text-night-700">{k}</dt>
                <dd className="text-right font-semibold text-night-900">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="apercu" className="mt-6">
          <h2 id="apercu" className="text-[14px] font-extrabold text-night-900">{tr('detail.preview')}</h2>
          <div className="mt-2 grid grid-cols-2 gap-3">
            {[0, m.annexes.length > 0 ? 1 : 0].map((p, i) => (
              <Link
                key={i}
                href={`/app/modeles/${m.slug}/lecture`}
                aria-label={tr('detail.previewPage', { page: p + 1 })}
                className="block h-[150px] overflow-hidden rounded-xl border border-night-100 bg-night-50/60 p-2.5"
              >
                <div aria-hidden="true" className="pointer-events-none origin-top-left scale-[0.42] text-[11px]" style={{ width: '238%' }}>
                  <LetterSheet modele={m} page={p} />
                </div>
              </Link>
            ))}
          </div>
        </section>

        <div className="mt-6 lg:max-w-sm">
          <Link href={`/app/modeles/${m.slug}/lecture`} className={btn({ variant: 'primary' })}>{tr('detail.open')}</Link>
        </div>
      </div>
      {node}
    </>
  )
}
