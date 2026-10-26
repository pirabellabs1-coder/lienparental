'use client'
/** Éditeur d'un conseil du jour (carte de l'accueil parent). */
import { Lightbulb, Wand2 } from 'lucide-react'
import { TIP_CATEGORIES, emptyConseil, tipCategoryLabel } from '@/lib/aide/types'
import { slugify, type ContentRecord } from '@/lib/contenus/types'
import { EditorShell } from '@/components/admin/contenus/EditorShell'
import { FormSection, SelectField, TextAreaField, TextField, btnSecondary } from '@/components/admin/contenus/form'

export function ConseilEditor({ initial }: { initial: ContentRecord<'conseil'> | null }) {
  return (
    <EditorShell kind="conseil" initial={initial} defaults={emptyConseil()} heading="Centre d’aide · conseil du jour">
      {({ data: c, set }) => (
        <>
          <FormSection title="Conseil" id="conseil">
            <TextField label="Titre" path="titre" value={c.titre} onChange={(titre) => set({ titre })} max={80} required />
            <TextAreaField label="Texte" path="texte" value={c.texte} onChange={(texte) => set({ texte })} max={280} rows={3} required
              hint="Une ou deux phrases concrètes, sans jugement sur l’autre parent." />
            <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
              <TextField label="Identifiant (slug)" path="slug" value={c.slug} onChange={(slug) => set({ slug })} max={80} required mono />
              <button type="button" className={btnSecondary} onClick={() => set({ slug: slugify(c.titre) })}>
                <Wand2 className="h-4 w-4" aria-hidden="true" /> Depuis le titre
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField label="Catégorie" path="categorie" value={c.categorie} onChange={(categorie) => set({ categorie })}
                options={TIP_CATEGORIES.map((t) => ({ value: t.key, label: t.label }))} required />
              <TextField label="Ordre d’affichage" path="ordre" type="number" inputMode="numeric" value={String(c.ordre)}
                onChange={(v) => set({ ordre: Number.parseInt(v || '0', 10) || 0 })} hint="Les conseils publiés défilent dans cet ordre." />
            </div>
          </FormSection>
          <FormSection title="Aperçu" id="apercu">
            <div className="flex max-w-md gap-3.5 rounded-2xl bg-leaf-50 p-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-leaf-600 shadow-soft" aria-hidden="true">
                <Lightbulb className="h-5 w-5" strokeWidth={1.8} />
              </span>
              <div className="min-w-0">
                <p className="text-[11.5px] font-bold uppercase tracking-wider text-leaf-700">{tipCategoryLabel(c.categorie)}</p>
                <p className="mt-0.5 text-[14.5px] font-extrabold text-night-900">{c.titre}</p>
                <p className="mt-1 text-[13.5px] text-night-700">{c.texte}</p>
              </div>
            </div>
          </FormSection>
        </>
      )}
    </EditorShell>
  )
}
