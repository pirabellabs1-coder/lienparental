import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import Link from 'next/link'
import { ArrowRight, Check } from 'lucide-react'
import { PhoneFrame } from '@/components/home/PhoneFrame'
import { cn } from '@/lib/cn'
import { TERRITORIES, TerritoryShape } from '@/components/site/territories'
import { BTN_PRIMARY, CONTAINER, H2, LEAD, SECTION } from './ui'

/** Nombre réel de fiches publiées pour la Guyane (lu au rendu serveur, jamais codé en dur). */
function countGuyaneSheets(): number {
  try {
    return readdirSync(join(process.cwd(), 'content', 'guide', 'guyane', 'fiches')).filter(f => f.endsWith('.json')).length
  } catch {
    return 0
  }
}

export function Guide() {
  const sheets = countGuyaneSheets()
  const POINTS = [
    sheets > 0 ? `École, santé, aides, logement, séparation : ${sheets} fiches pour la Guyane` : 'École, santé, aides, logement, séparation',
    'Les documents à réunir et les étapes, dans l’ordre',
    'Un rappel, un document ou une dépense ajoutés en un geste',
  ]
  return (
    <section id="guide" aria-labelledby="guide-title" className={SECTION}>
      <div className={cn(CONTAINER, 'grid grid-cols-1 items-center gap-14 lg:grid-cols-[1fr_auto] lg:gap-20 [&>*]:min-w-0')}>
        <div>
          <h2 id="guide-title" className={H2}>Le Guide parental</h2>
          <p className={cn(LEAD, 'mt-4 max-w-[52ch]')}>
            Toutes les informations essentielles pour les parents, réunies au même endroit, là où vous vivez. Chaque fiche vous dit quoi faire, avec quels documents, et où.
          </p>
          <ul className="mt-7 space-y-3.5">
            {POINTS.map(p => (
              <li key={p} className="flex items-start gap-3 text-[16px] text-night-800">
                <span aria-hidden className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-leaf-50 text-leaf-600"><Check className="h-3.5 w-3.5" strokeWidth={2.5} /></span>
                {p}
              </li>
            ))}
          </ul>

          <h3 className="mt-10 text-[15px] font-bold text-night-900">Un guide par territoire</h3>
          <ul className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {TERRITORIES.map(t => (
              <li key={t.code} className={cn('flex items-center gap-3 rounded-2xl p-3 ring-1', t.available ? 'bg-leaf-50 ring-leaf-300' : 'bg-white ring-[#E5E7EB]')}>
                <TerritoryShape path={t.path} available={t.available} className="h-8 w-8 shrink-0" />
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="text-[14.5px] font-semibold text-night-900">{t.name}</span>
                  <span className={cn('mt-0.5 text-[13.5px]', t.available ? 'font-semibold text-leaf-700' : 'text-night-600')}>{t.available ? 'Disponible' : 'Bientôt'}</span>
                </span>
              </li>
            ))}
          </ul>

          <Link href="/app/guide" className={cn(BTN_PRIMARY, 'mt-10')}>
            Découvrir le Guide parental<ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>

        <PhoneFrame
          src="/images/app/mobile-guide.png"
          alt="L’écran Guide Parent Guyane de l’application : recherche de démarche et parcours pas à pas"
          sizes="260px"
          className="mx-auto w-[220px] lg:w-[260px]"
        />
      </div>
    </section>
  )
}
