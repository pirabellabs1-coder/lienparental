'use client'

import { ExternalLink, Info } from 'lucide-react'
import { usePartners } from '@/lib/guide/partners'
import type { GuideCategoryKey, Partenaire } from '@/lib/guide/types'

/**
 * « Offres disponibles en … » : affiché APRÈS l'information neutre, seulement s'il existe des offres.
 * Toujours étiqueté « Partenaire » ou « Offre sponsorisée », critères objectifs visibles, aucun classement.
 */
export function PartnersBlock({ territoire, territoireNom, categorie, demo }: {
  territoire: string; territoireNom: string; categorie: GuideCategoryKey; demo: Partenaire[]
}) {
  const items = usePartners(territoire, categorie, demo)
  if (items.length === 0) return null

  return (
    <section aria-labelledby="offres-titre" className="mt-8 rounded-2xl border border-dashed border-night-200 bg-[#fbfbfe] p-4 lg:p-5">
      <h2 id="offres-titre" className="text-[16px] font-extrabold text-night-900">Offres disponibles en {territoireNom}</h2>
      <p className="mt-1 flex items-start gap-1.5 text-[12.5px] leading-snug text-night-600">
        <Info className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        Contenu commercial, séparé de l'information ci-dessus. Les offres sont présentées sans classement : comparez-les selon vos besoins.
      </p>
      <ul className="mt-4 grid gap-3 lg:grid-cols-2">
        {items.map((p) => (
          <li key={p.id} className="rounded-xl border border-night-100 bg-white p-4">
            <div className="flex flex-wrap gap-1.5">
              <span className="rounded-full bg-gold-100 px-2 py-0.5 text-[11.5px] font-bold text-gold-800">
                {p.type === 'sponsorise' ? 'Offre sponsorisée' : 'Partenaire'}
              </span>
              {p.demo && <span className="rounded-full bg-night-100 px-2 py-0.5 text-[11.5px] font-bold text-night-800">Exemple (démonstration)</span>}
            </div>
            <h3 className="mt-2 text-[15px] font-bold text-night-900">{p.nom}</h3>
            <p className="mt-1 text-[13px] leading-snug text-night-600">{p.description}</p>
            <dl className="mt-3 divide-y divide-night-100 rounded-lg bg-night-50/60 text-[12.5px]">
              {p.criteres.map((c) => (
                <div key={c.libelle} className="flex flex-col gap-0.5 px-3 py-2 sm:flex-row sm:gap-3">
                  <dt className="shrink-0 font-semibold text-night-700 sm:w-40">{c.libelle}</dt>
                  <dd className="text-night-900">{c.valeur}</dd>
                </div>
              ))}
            </dl>
            {p.lien ? (
              <a
                href={p.lien}
                target="_blank"
                rel="noopener noreferrer sponsored"
                className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 text-[13.5px] font-semibold text-leaf-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500"
              >
                Voir l'offre<span className="sr-only"> de {p.nom} (nouvel onglet)</span>
                <ExternalLink className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              </a>
            ) : (
              <p className="mt-3 text-[12.5px] italic text-night-600">Lien désactivé dans la démonstration.</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
