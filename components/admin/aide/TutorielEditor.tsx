'use client'
/** Éditeur d'un tutoriel du centre d'aide (étapes en Markdown). */
import { Wand2 } from 'lucide-react'
import { TUTO_ICONS, emptyTutoriel } from '@/lib/aide/types'
import { slugify, type ContentRecord } from '@/lib/contenus/types'
import { EditorShell } from '@/components/admin/contenus/EditorShell'
import { FormSection, SelectField, TextAreaField, TextField, btnSecondary } from '@/components/admin/contenus/form'
import { MarkdownField } from './MarkdownField'

export function TutorielEditor({ initial }: { initial: ContentRecord<'tutoriel'> | null }) {
  return (
    <EditorShell kind="tutoriel" initial={initial} defaults={emptyTutoriel()} heading="Centre d’aide · tutoriel"
      publicHref={(r) => `/app/aide/tutoriels/${r.slug}`}>
      {({ data: t, set, record }) => (
        <>
          <FormSection title="Tutoriel" id="tutoriel">
            <TextField label="Titre" path="titre" value={t.titre} onChange={(titre) => set({ titre })} max={120} required />
            <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
              <TextField label="Slug (adresse /app/aide/tutoriels/…)" path="slug" value={t.slug} onChange={(slug) => set({ slug })} max={80} required mono
                hint={record?.statut === 'publie' ? 'Tutoriel publié : changer le slug casse les liens existants.' : undefined} />
              <button type="button" className={btnSecondary} onClick={() => set({ slug: slugify(t.titre) })}>
                <Wand2 className="h-4 w-4" aria-hidden="true" /> Depuis le titre
              </button>
            </div>
            <TextAreaField label="Résumé (facultatif)" path="resume" value={t.resume} onChange={(resume) => set({ resume })} max={300} rows={2} />
            <div className="grid gap-4 sm:grid-cols-3">
              <TextField label="Durée (minutes)" path="dureeMin" type="number" inputMode="numeric" value={String(t.dureeMin)}
                onChange={(v) => set({ dureeMin: Number.parseInt(v || '0', 10) || 0 })} required />
              <SelectField label="Icône" path="icone" value={t.icone} onChange={(icone) => set({ icone })}
                options={TUTO_ICONS.map((c) => ({ value: c.key, label: c.label }))} required />
              <TextField label="Ordre d’affichage" path="ordre" type="number" inputMode="numeric" value={String(t.ordre)}
                onChange={(v) => set({ ordre: Number.parseInt(v || '0', 10) || 0 })} hint="Plus petit = plus haut." />
            </div>
          </FormSection>
          <MarkdownField title="Étapes" path="contenu" value={t.contenu} onChange={(contenu) => set({ contenu })} max={40000} rows={20} />
        </>
      )}
    </EditorShell>
  )
}
