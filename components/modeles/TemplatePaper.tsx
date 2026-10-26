import { cn } from '@/lib/cn'
import {
  interpolate, lines, parseTemplateBody,
  type DocumentTemplate, type InterpolateMode, type TemplateValues,
} from '@/lib/modeles/template'

/**
 * Aperçu HTML d'un modèle, fidèle à la mise en page PDF (feuille A4 réduite).
 * Tout est rendu comme du texte React : aucune valeur saisie n'est interprétée en HTML.
 */
export function TemplatePaper({
  template: t, values = {}, mode = 'preview', className,
}: { template: DocumentTemplate; values?: TemplateValues; mode?: InterpolateMode; className?: string }) {
  const L = t.miseEnPage
  const I = (s: string) => interpolate(s, t.champs, values, mode)
  const pages = parseTemplateBody(t.corps)
  const serif = L.police === 'times'
  const size = L.taille === 'petite' ? 'text-[11.5px]' : L.taille === 'grande' ? 'text-[13.5px]' : 'text-[12.5px]'
  const pad = L.marges === 'etroites' ? 'p-5 sm:p-7' : L.marges === 'larges' ? 'p-8 sm:p-12' : 'p-6 sm:p-10'
  const expediteur = lines(I(L.expediteur))
  const destinataire = lines(I(L.destinataire))
  const footer = I(L.piedDePage) || t.titre

  return (
    <div className={cn('space-y-4', className)}>
      {pages.map((blocks, pi) => (
        <article
          key={pi}
          aria-label={`Page ${pi + 1} sur ${pages.length}`}
          className={cn(
            'relative mx-auto flex min-h-[520px] w-full max-w-[640px] flex-col rounded-md bg-white text-[#1c2333] shadow-card ring-1 ring-night-100',
            pad, size, serif ? 'font-serif' : 'font-sans',
          )}
        >
          {pi === 0 && (L.logo || expediteur.length > 0) && (
            <div className="mb-6 flex items-start justify-between gap-4">
              <div aria-hidden={!L.logo}>
                {L.logo && (
                  <p className="leading-none">
                    <span className="block font-sans text-[20px] font-extrabold text-night-900">Lien</span>
                    <span className="-mt-0.5 block font-script text-[20px] text-leaf-500">Parental</span>
                  </p>
                )}
              </div>
              <div className="text-right text-[0.9em] text-night-600">
                {expediteur.map((x, i) => <p key={i}>{x}</p>)}
              </div>
            </div>
          )}
          {pi === 0 && L.type === 'lettre' && (
            <>
              {destinataire.length > 0 && (
                <div className="mb-4 ml-auto w-[min(62%,320px)]">{destinataire.map((x, i) => <p key={i}>{x}</p>)}</div>
              )}
              {L.lieuDate && <p className="mb-4 text-right">{I(L.lieuDate)}</p>}
              {L.objet && <p className="mb-4"><strong>Objet : </strong>{I(L.objet)}</p>}
            </>
          )}
          <div className="space-y-2.5 leading-relaxed">
            {blocks.map((b, i) => {
              if (b.type === 'h1') return <h3 key={i} className="mb-2 text-center text-[1.3em] font-bold text-night-900">{I(b.text)}</h3>
              if (b.type === 'h2') return <h4 key={i} className="pt-1 text-[1.12em] font-bold text-night-900">{I(b.text)}</h4>
              if (b.type === 'ul') {
                return (
                  <ul key={i} className="list-disc space-y-1 pl-5 marker:text-leaf-500">
                    {b.items.map((it, j) => <li key={j}>{I(it)}</li>)}
                  </ul>
                )
              }
              return <p key={i} className="whitespace-pre-line text-justify">{I(b.text)}</p>
            })}
          </div>
          {pi === 0 && (
            <div className="mt-6">
              {L.type === 'document' && L.lieuDate && <p>{I(L.lieuDate)}</p>}
              {L.signature && <p className="ml-auto mt-4 w-1/2 whitespace-pre-wrap">{I(L.signature)}</p>}
            </div>
          )}
          <p className="mt-auto pt-6 text-center text-[10px] text-night-500">{footer} · Lien Parental · {pi + 1} / {pages.length}</p>
        </article>
      ))}
    </div>
  )
}
