import type { Metadata } from 'next'
import { ChevronDown, Mail, Clock3 } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { SiteShell } from '@/components/site/SiteShell'
import { getHelpFaq } from '@/lib/aide/public'
import { FAQ_CATEGORIES } from '@/lib/aide/types'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('public.help.public')
  return { title: t('metaTitle'), description: t('metaDescription') }
}

export const revalidate = 300

// Ligne d'appel au vote des fichiers du dépôt : sans objet sur la page publique.
const FEEDBACK_LINE = /\n*Cet article a-t-il été utile \?\s*$/

// Centre d'aide public : accessible depuis un ordinateur (CDC M01, règle de gestion).
export default async function AidePublique() {
  const questions = await getHelpFaq()
  const t = await getTranslations('public.help.public')
  return (
    <SiteShell mainClassName="bg-[#F7F9FC]">
      <div className="mx-auto max-w-4xl px-5 py-12 sm:px-8">
        <h1 className="text-[32px] font-extrabold leading-tight tracking-[-0.02em] text-night-900 sm:text-[38px]">{t('title')}</h1>
        <p className="mt-2 text-night-700">{t('lead')}</p>

        <div className="mt-8 space-y-8">
          {FAQ_CATEGORIES.map(cat => {
            const items = questions.filter(q => q.categorie === cat.key)
            if (!items.length) return null
            return (
              <section key={cat.key} aria-labelledby={`cat-${cat.key}`}>
                <h2 id={`cat-${cat.key}`} className="text-xs font-bold uppercase tracking-wider text-night-500">{t(`categories.${cat.key}`)}</h2>
                <div className="mt-3 divide-y divide-night-100 rounded-xl2 border border-night-100 bg-white">
                  {items.map(q => (
                      <details key={q.slug} className="group px-5 py-4">
                        <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-4 font-semibold text-night-900 [&::-webkit-details-marker]:hidden">
                          {q.question}
                          <ChevronDown className="h-4 w-4 shrink-0 text-night-500 transition-transform group-open:rotate-180" aria-hidden />
                        </summary>
                        <div className="mt-3 whitespace-pre-line text-sm leading-relaxed text-night-700">{q.reponse.replace(FEEDBACK_LINE, '').trim()}</div>
                      </details>
                  ))}
                </div>
              </section>
            )
          })}
        </div>

        <section className="mt-10 grid gap-4 rounded-xl2 border border-night-100 bg-white p-6 sm:grid-cols-2">
          <div className="flex gap-3">
            <Mail className="h-6 w-6 text-leaf-500" aria-hidden />
            <div>
              <p className="font-bold text-night-900">{t('writeUs')}</p>
              <a href="mailto:support@lienparental.fr" className="text-sm text-leaf-600 underline">support@lienparental.fr</a>
            </div>
          </div>
          <div className="flex gap-3">
            <Clock3 className="h-6 w-6 text-leaf-500" aria-hidden />
            <div>
              <p className="font-bold text-night-900">{t('hoursTitle')}</p>
              <p className="text-sm text-night-700">{t('hours')}</p>
            </div>
          </div>
        </section>
      </div>
    </SiteShell>
  )
}
