import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { localePathFor } from '@/lib/i18n/routing'
import { ArrowRight, Plus } from 'lucide-react'
import { H2 } from './ui'

// Réponses vérifiées : PWA (pas de store), Guide (Guyane d'abord), sécurité (docs/SECURITY.md : chiffrement en transit
// et au repos, pas de bout en bout), partage via « Parents liés » (app/app/coparents), résiliation sans engagement.
// Les 8 questions/réponses sont traduites (namespace faq, clés q1..q8 / a1..a8) ; q7 et q8 (application de coparentalité,
// garde alternée / pension / JAF) passent en tête. Les mêmes textes alimentent le FAQPage JSON-LD de l'accueil (app/page.tsx).

type FaqItem = { q: string; a: string; linkHref?: string; linkLabel?: string }

/** Questions de la FAQ de l'accueil, dans l'ordre d'affichage (aussi utilisées pour le JSON-LD). */
export async function homeFaqItems(): Promise<FaqItem[]> {
  const t = await getTranslations('faq')
  const lp = localePathFor(await getLocale())
  return [
    { q: t('q7'), a: t('a7') },
    { q: t('q8'), a: t('a8'), linkHref: lp('/guide/guyane/parcours/je-viens-de-me-separer'), linkLabel: t('a8Link') },
    { q: t('q1'), a: t('a1') },
    { q: t('q2'), a: t('a2'), linkHref: lp('/installer'), linkLabel: t('a2Link') },
    { q: t('q3'), a: t('a3') },
    { q: t('q4'), a: t('a4') },
    { q: t('q5'), a: t('a5') },
    { q: t('q6'), a: t('a6') },
  ]
}

function Item({ q, a, linkHref, linkLabel }: FaqItem) {
  return (
    <details className="group">
      <summary className="flex min-h-[64px] cursor-pointer list-none items-center justify-between gap-4 py-4 text-[16px] font-semibold leading-snug text-night-900">
        {q}
        <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-leaf-50 text-leaf-600 transition-transform duration-300 group-open:rotate-45">
          <Plus className="h-4 w-4" strokeWidth={2} />
        </span>
      </summary>
      <div className="pb-5 pr-2 text-[15px] leading-relaxed text-night-700">
        <p>{a}</p>
        {linkHref && linkLabel && (
          <Link href={linkHref} className="mt-2 inline-flex min-h-[44px] items-center font-semibold text-leaf-600 underline decoration-leaf-600/40 underline-offset-2 hover:decoration-leaf-600">
            {linkLabel}
          </Link>
        )}
      </div>
    </details>
  )
}

/** FAQ sous les tarifs : titre centré, questions sur deux colonnes en grand écran. */
export async function Faq() {
  const t = await getTranslations('faq')
  const lp = localePathFor(await getLocale())
  const FAQ = await homeFaqItems()
  const half = Math.ceil(FAQ.length / 2)
  return (
    <div id="faq" className="scroll-mt-24">
      <div className="mx-auto max-w-[640px] text-center">
        <h2 id="faq-title" className={H2}>{t('title')}</h2>
      </div>
      <div className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-start">
        {[FAQ.slice(0, half), FAQ.slice(half)].map((col, i) => (
          <div key={i} className="divide-y divide-[#E5E7EB] rounded-3xl bg-white px-5 ring-1 ring-[#E5E7EB] sm:px-7">
            {col.map(item => <Item key={item.q} {...item} />)}
          </div>
        ))}
      </div>
      <div className="mt-8 text-center">
        <Link href={lp('/aide')} className="inline-flex min-h-[44px] items-center gap-2 rounded-lg text-[16px] font-semibold text-leaf-600 hover:text-leaf-700">
          {t('seeAll')}<ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </div>
  )
}
