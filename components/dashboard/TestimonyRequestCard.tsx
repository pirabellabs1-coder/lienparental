'use client'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ChevronRight, Users } from 'lucide-react'

// M03 — Demande de témoignage (carte orangée).
export function TestimonyRequestCard() {
  const t = useTranslations('dash')
  return (
    <section aria-labelledby="testimony-title" className="rounded-xl2 bg-orange-50 px-4 pb-4 pt-3.5">
      <h2 id="testimony-title" className="text-[15px] font-bold text-night-900">
        {t('testimonyTitle')}
      </h2>
      <div className="mt-3 flex items-center gap-3.5">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-orange-100/70 text-orange-500" aria-hidden="true">
          <Users className="h-6 w-6 fill-orange-500/90" strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] leading-relaxed text-night-800">
            {t('testimonyLead')}
          </p>
          <Link
            href="/app/coffre/temoignages/nouveau"
            className="mt-3 inline-flex h-11 w-full max-w-[180px] items-center justify-center rounded-lg border border-leaf-500 bg-white/60 text-[13px] font-bold text-leaf-600 transition hover:bg-leaf-50 active:scale-[.98]"
          >
            {t('testimonyCreate')}
          </Link>
        </div>
        <Link
          href="/app/coffre/temoignages"
          aria-label={t('testimonyView')}
          className="-mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-night-900 hover:bg-orange-100"
        >
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </Link>
      </div>
    </section>
  )
}
