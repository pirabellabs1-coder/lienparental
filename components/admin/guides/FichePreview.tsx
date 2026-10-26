import { Building2, CalendarClock, ExternalLink, Phone, TriangleAlert } from 'lucide-react'
import { getCategory, type Fiche } from '@/lib/guide/types'

const dateFr = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? iso : new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d)
}

function S({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="text-[16px] font-extrabold text-night-900">{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  )
}

const link = 'inline-flex items-center gap-1 font-semibold text-leaf-700 underline decoration-leaf-300 underline-offset-2'

/** Aperçu fidèle d'une fiche telle que le parent la verra (sans les actions interactives). */
export function FichePreview({ fiche: f }: { fiche: Fiche }) {
  const cat = getCategory(f.categorie)
  return (
    <div className="mx-auto max-w-3xl rounded-2xl border border-[#E5E7EB] bg-white p-5 sm:p-8">
      <p className="text-[12px] font-bold uppercase tracking-wider text-night-500">Aperçu côté parent</p>
      {cat && <p className="mt-3 inline-flex rounded-full bg-leaf-50 px-2.5 py-1 text-[12px] font-semibold text-leaf-800">{cat.label}</p>}
      <h2 className="mt-3 text-[24px] font-extrabold leading-tight text-night-900">{f.titre || 'Sans titre'}</h2>
      <p className="mt-2 text-[14.5px] text-night-700">{f.resume}</p>
      <p className="mt-2 text-[12.5px] text-night-600">Dernière vérification le {dateFr(f.derniereVerification)}</p>

      <S title="À quoi ça sert ?"><p className="text-[14.5px] leading-relaxed text-night-800">{f.aQuoiCaSert}</p></S>
      <S title="Qui est concerné ?">
        <ul className="list-disc space-y-1 pl-5 text-[14.5px] marker:text-leaf-500">{f.quiEstConcerne.filter(Boolean).map((q, i) => <li key={i}>{q}</li>)}</ul>
      </S>
      {f.aSavoir.length > 0 && (
        <S title="À savoir">
          <ul className="space-y-2">{f.aSavoir.map((s, i) => <li key={i} className="rounded-xl bg-night-50/70 px-3.5 py-2.5 text-[14px]">{s}</li>)}</ul>
        </S>
      )}
      {f.datesLimites.length > 0 && (
        <S title="Dates limites">
          <ul className="space-y-2">
            {f.datesLimites.map((d, i) => (
              <li key={i} className="flex gap-2.5 rounded-xl border border-gold-200 bg-gold-50 px-3.5 py-2.5">
                <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-gold-700" aria-hidden="true" />
                <span><span className="block text-[14px] font-bold">{d.libelle}</span>{d.detail && <span className="block text-[13px] text-night-700">{d.detail}</span>}</span>
              </li>
            ))}
          </ul>
        </S>
      )}
      {f.documents.length > 0 && (
        <S title="Documents nécessaires">
          <ul className="space-y-1.5">
            {f.documents.map((d, i) => (
              <li key={i} className="flex items-start gap-2.5 text-[14px]">
                <span aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 rounded-md border-2 border-night-300" />
                <span><span className="font-semibold text-night-900">{d.libelle}</span>{d.detail && <span className="block text-[13px] text-night-600">{d.detail}</span>}</span>
              </li>
            ))}
          </ul>
        </S>
      )}
      <S title="Étapes">
        <ol className="space-y-3">
          {f.etapes.map((e, i) => (
            <li key={i} className="flex gap-3">
              <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-leaf-500 text-[13px] font-bold text-white">{i + 1}</span>
              <div><p className="text-[14.5px] font-bold">{e.titre}</p>{e.detail && <p className="text-[13.5px] text-night-700">{e.detail}</p>}</div>
            </li>
          ))}
        </ol>
      </S>
      <S title="Où effectuer la démarche ?">
        <ul className="space-y-2">
          {f.ou.map((o, i) => (
            <li key={i} className="flex gap-3 rounded-xl border border-night-100 p-3.5 text-[13.5px]">
              <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-leaf-700" aria-hidden="true" />
              <div>
                <p className="font-bold">{o.nom}</p>
                {o.detail && <p className="text-night-700">{o.detail}</p>}
                <p className="mt-1 flex flex-wrap gap-x-4">
                  {o.telephone && <span className={link}><Phone className="h-3.5 w-3.5" aria-hidden="true" />{o.telephone}</span>}
                  {o.url && <span className={link}>Site officiel<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></span>}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </S>
      <S title="Liens utiles">
        <ul className="space-y-1.5 text-[14px]">{f.liens.map((l, i) => <li key={i}><span className={link}>{l.titre || l.url}<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></span></li>)}</ul>
      </S>
      {f.aConfirmer.length > 0 && (
        <S title="À confirmer">
          <ul className="space-y-2">{f.aConfirmer.map((s, i) => <li key={i} className="flex gap-2 text-[13.5px]"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-gold-700" aria-hidden="true" />{s}</li>)}</ul>
        </S>
      )}
      {f.actions.length > 0 && (
        <S title="Ajouter à Lien Parental">
          <ul className="flex flex-wrap gap-2">{f.actions.map((a, i) => <li key={i} className="rounded-xl border border-leaf-200 bg-leaf-50 px-3 py-2 text-[13px] font-semibold text-leaf-800">{a.titre}</li>)}</ul>
        </S>
      )}
      <S title="Sources">
        <ul className="list-disc space-y-1 pl-5 text-[13px] text-night-700">{f.sources.map((s, i) => <li key={i}>{s.titre} <span className="text-night-500">({s.url})</span></li>)}</ul>
      </S>
    </div>
  )
}
