'use client'
/** Éditeur d'un parcours du Guide (parcoursSchema) : étapes ordonnées liées à des fiches. */
import { Wand2 } from 'lucide-react'
import type { Parcours, Territoire } from '@/lib/guide/types'
import { slugify, type ContentRecord } from '@/lib/contenus/types'
import { EditorShell } from '@/components/admin/contenus/EditorShell'
import { FormSection, Repeater, SelectField, TextAreaField, TextField, btnSecondary } from '@/components/admin/contenus/form'

const opt = (v: string) => (v === '' ? undefined : v)

export type FicheRef = { slug: string; titre: string; territoire: string | null; statut: string }

export function ParcoursEditor({ initial, territoires, defaultTerritoire, fiches }: {
  initial: ContentRecord<'parcours'> | null; territoires: Territoire[]; defaultTerritoire: string; fiches: FicheRef[]
}) {
  const defaults: Parcours = {
    slug: 'nouveau-parcours', territoire: defaultTerritoire, titre: 'Nouveau parcours', resume: '', ordre: 100,
    elements: [{ id: 'etape-1', titre: '' }],
  }
  return (
    <EditorShell
      kind="parcours" initial={initial} defaults={defaults} heading="Guide parental · parcours"
      publicHref={(r) => `/app/guide/parcours/${r.slug}?territoire=${r.territoire}`}
      preview={(p) => (
        <div className="mx-auto max-w-2xl rounded-2xl border border-[#E5E7EB] bg-white p-6">
          <p className="text-[12px] font-bold uppercase tracking-wider text-night-500">Aperçu côté parent</p>
          <h2 className="mt-2 text-[22px] font-extrabold text-night-900">{p.titre}</h2>
          <p className="mt-1 text-[14px] text-night-700">{p.resume}</p>
          <ol className="mt-4 space-y-2">
            {p.elements.map((e, i) => (
              <li key={i} className="flex items-start gap-3 rounded-xl border border-night-100 p-3">
                <span aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 rounded-md border-2 border-night-300" />
                <span>
                  <span className="block text-[14px] font-bold">{e.titre}</span>
                  {e.detail && <span className="block text-[13px] text-night-600">{e.detail}</span>}
                  {e.fiche && <span className="text-[12.5px] font-semibold text-leaf-700">Fiche : {fiches.find((f) => f.slug === e.fiche)?.titre ?? e.fiche}</span>}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    >
      {({ data: p, set }) => {
        const options = fiches.filter((f) => f.territoire === p.territoire)
        return (
          <>
            <FormSection title="Informations générales" id="gen">
              <TextField label="Titre" path="titre" value={p.titre} onChange={(titre) => set({ titre })} max={120} required />
              <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
                <TextField label="Slug (adresse)" path="slug" value={p.slug} onChange={(slug) => set({ slug })} max={80} required mono />
                <button type="button" className={btnSecondary} onClick={() => set({ slug: slugify(p.titre) })}><Wand2 className="h-4 w-4" aria-hidden="true" /> Depuis le titre</button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField label="Territoire" path="territoire" value={p.territoire} onChange={(territoire) => set({ territoire })} required
                  options={territoires.map((t) => ({ value: t.code, label: t.nom }))} />
                <TextField label="Ordre d’affichage" path="ordre" type="number" inputMode="numeric" value={String(p.ordre)}
                  onChange={(v) => set({ ordre: Number.parseInt(v || '0', 10) || 0 })} hint="Croissant : 1 s’affiche en premier." />
              </div>
              <TextAreaField label="Résumé" path="resume" value={p.resume} onChange={(resume) => set({ resume })} max={300} rows={2} required />
            </FormSection>
            <FormSection title="Étapes du parcours" path="elements" id="elements" description="Chaque étape peut renvoyer vers une fiche du même territoire.">
              <Repeater
                label="Étapes" path="elements" items={p.elements} onChange={(elements) => set({ elements })} min={1}
                make={() => ({ id: `etape-${p.elements.length + 1}`, titre: '' })} itemTitle={(e) => e.titre} addLabel="Ajouter une étape"
                render={(e, u, i) => (
                  <>
                    <TextField label="Titre" path={`elements.${i}.titre`} value={e.titre} onChange={(titre) => u({ titre })} max={160} required />
                    <TextAreaField label="Précision (facultatif)" path={`elements.${i}.detail`} value={e.detail ?? ''} onChange={(v) => u({ detail: opt(v) })} max={300} rows={2} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <SelectField label="Fiche liée" path={`elements.${i}.fiche`} value={e.fiche ?? ''} placeholder="Aucune" onChange={(v) => u({ fiche: opt(v) })}
                        options={options.map((f) => ({ value: f.slug, label: f.statut === 'publie' ? f.titre : `${f.titre} (non publiée)` }))} />
                      <TextField label="Identifiant" path={`elements.${i}.id`} value={e.id} onChange={(id) => u({ id })} max={80} mono hint="Mémorise la progression : évitez de le changer après publication." />
                    </div>
                  </>
                )}
              />
            </FormSection>
          </>
        )
      }}
    </EditorShell>
  )
}
