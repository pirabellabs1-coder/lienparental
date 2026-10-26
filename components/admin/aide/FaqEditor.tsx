'use client'
/** Éditeur d'une question de la FAQ du centre d'aide (réponse en Markdown, aperçu sûr). */
import { Wand2 } from 'lucide-react'
import { FAQ_CATEGORIES, emptyFaq } from '@/lib/aide/types'
import { slugify, type ContentRecord } from '@/lib/contenus/types'
import { EditorShell } from '@/components/admin/contenus/EditorShell'
import { FormSection, SelectField, TextField, btnSecondary } from '@/components/admin/contenus/form'
import { MarkdownField } from './MarkdownField'

export function FaqEditor({ initial }: { initial: ContentRecord<'faq'> | null }) {
  return (
    <EditorShell kind="faq" initial={initial} defaults={emptyFaq()} heading="Centre d’aide · FAQ"
      publicHref={(r) => `/app/aide/faq/${r.slug}`}>
      {({ data: f, set, record }) => (
        <>
          <FormSection title="Question" id="question">
            <TextField label="Question" path="question" value={f.question} onChange={(question) => set({ question })} max={160} required />
            <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
              <TextField label="Slug (adresse /app/aide/faq/…)" path="slug" value={f.slug} onChange={(slug) => set({ slug })} max={80} required mono
                hint={record?.statut === 'publie' ? 'Question publiée : changer le slug casse les liens existants.' : undefined} />
              <button type="button" className={btnSecondary} onClick={() => set({ slug: slugify(f.question) })}>
                <Wand2 className="h-4 w-4" aria-hidden="true" /> Depuis la question
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField label="Catégorie" path="categorie" value={f.categorie} onChange={(categorie) => set({ categorie })}
                options={FAQ_CATEGORIES.map((c) => ({ value: c.key, label: c.label }))} required />
              <TextField label="Ordre d’affichage" path="ordre" type="number" inputMode="numeric" value={String(f.ordre)}
                onChange={(v) => set({ ordre: Number.parseInt(v || '0', 10) || 0 })} hint="Plus petit = plus haut dans sa catégorie." />
            </div>
          </FormSection>
          <MarkdownField title="Réponse" path="reponse" value={f.reponse} onChange={(reponse) => set({ reponse })} max={20000} />
        </>
      )}
    </EditorShell>
  )
}
