'use client'
/**
 * Éditeur d'article : contenu Markdown avec aperçu sûr, couverture (dépôt dans le bucket
 * public blog-images en production), catégorie, étiquettes, auteur, SEO avec aperçu du
 * résultat de recherche, et date de publication (programmation).
 */
import { useRef, useState } from 'react'
import { ImageUp, Wand2 } from 'lucide-react'
import { BLOG_CATEGORIES, emptyPost } from '@/lib/blog/types'
import { markdownToText, readingMinutes } from '@/lib/blog/markdown'
import { slugify, type ContentRecord } from '@/lib/contenus/types'
import { EditorShell } from '@/components/admin/contenus/EditorShell'
import { AdminApiError, contenusApi } from '@/components/admin/contenus/client-api'
import { FormSection, SelectField, TextAreaField, TextField, btnSecondary } from '@/components/admin/contenus/form'
import { Markdown } from '@/app/blog/_components/Markdown'
import { ArticleView } from '@/app/blog/_components/ArticleView'
import { cn } from '@/lib/cn'

const pad = (n: number) => String(n).padStart(2, '0')
function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function CoverUpload({ onUploaded }: { onUploaded: (url: string) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<{ busy: boolean; msg: string; err: boolean }>({ busy: false, msg: '', err: false })
  const onFile = async (file: File | undefined) => {
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { setState({ busy: false, msg: 'Image trop lourde (5 Mo au maximum).', err: true }); return }
    setState({ busy: true, msg: 'Envoi de l’image…', err: false })
    try {
      const r = await contenusApi.uploadImage(file)
      onUploaded(r.url)
      setState({ busy: false, msg: 'Image envoyée.', err: false })
    } catch (e) {
      setState({ busy: false, msg: e instanceof AdminApiError ? e.message : 'Envoi impossible.', err: true })
    } finally {
      if (input.current) input.current.value = ''
    }
  }
  return (
    <div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" id="cover-file" onChange={(e) => void onFile(e.target.files?.[0])} />
      <label htmlFor="cover-file" className={cn(btnSecondary, 'cursor-pointer', state.busy && 'pointer-events-none opacity-60')}>
        <ImageUp className="h-4 w-4" aria-hidden="true" /> Téléverser une image
      </label>
      <p role="status" aria-live="polite" className={cn('mt-1 text-[12.5px]', state.err ? 'font-semibold text-alert-600' : 'text-night-600')}>{state.msg}</p>
    </div>
  )
}

export function ArticleEditor({ initial }: { initial: ContentRecord<'article'> | null }) {
  const [mdTab, setMdTab] = useState<'write' | 'preview'>('write')
  return (
    <EditorShell
      kind="article" initial={initial} defaults={emptyPost()} heading="Blog · article"
      previewHref={(r) => `/admin/blog/${r.id}/apercu`}
      publicHref={(r) => `/blog/${r.slug}`}
      preview={(p, publishedAt) => (
        <div className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white">
          <ArticleView post={p} publishedAt={publishedAt ?? new Date().toISOString()} backHref="#" />
        </div>
      )}
    >
      {({ data: p, set, publishedAt, setPublishedAt, record }) => {
        const seoTitle = p.seoTitre || p.titre
        const seoDesc = p.seoDescription || p.extrait || markdownToText(p.contenu).slice(0, 160)
        const scheduled = publishedAt && new Date(publishedAt).getTime() > Date.now()
        return (
          <>
            <FormSection title="Article" id="article">
              <TextField label="Titre" path="titre" value={p.titre} onChange={(titre) => set({ titre })} max={140} required />
              <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
                <TextField label="Slug (adresse /blog/…)" path="slug" value={p.slug} onChange={(slug) => set({ slug })} max={80} required mono
                  hint={record?.statut === 'publie' ? 'Article publié : changer le slug casse les liens déjà partagés.' : undefined} />
                <button type="button" className={btnSecondary} onClick={() => set({ slug: slugify(p.titre) })}><Wand2 className="h-4 w-4" aria-hidden="true" /> Depuis le titre</button>
              </div>
              <TextAreaField label="Extrait" path="extrait" value={p.extrait} onChange={(extrait) => set({ extrait })} max={320} rows={2} required hint="Affiché dans la liste des articles et utilisé par défaut pour le référencement." />
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField label="Catégorie" path="categorie" value={p.categorie} onChange={(categorie) => set({ categorie })} options={BLOG_CATEGORIES.map((c) => ({ value: c.key, label: c.label }))} required />
                <TextField label="Auteur" path="auteur" value={p.auteur} onChange={(auteur) => set({ auteur })} max={80} required />
              </div>
              <TextField label="Étiquettes (séparées par des virgules)" path="tags" value={p.tags.join(', ')}
                onChange={(v) => set({ tags: v.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 10) })} hint="10 au maximum." />
            </FormSection>

            <FormSection title="Publication" id="publication" path="publishedAt">
              <TextField
                label="Date et heure de publication" type="datetime-local" value={toLocalInput(publishedAt)}
                onChange={(v) => setPublishedAt(v ? new Date(v).toISOString() : null)}
                hint={scheduled
                  ? 'Date future : après « Publier », l’article sera en ligne automatiquement à cette date (statut Programmé).'
                  : 'Laissez vide pour publier immédiatement lors du clic sur « Publier ».'}
                className="sm:max-w-xs"
              />
            </FormSection>

            <FormSection title="Image de couverture" id="cover" path="couverture">
              <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-start">
                <TextField label="Adresse de l’image" path="couverture" value={p.couverture} onChange={(couverture) => set({ couverture })} placeholder="/images/… ou https://…" hint="Format paysage conseillé (environ 1600 × 800)." />
                <div className="sm:pt-7"><CoverUpload onUploaded={(couverture) => set({ couverture })} /></div>
              </div>
              <TextField label="Texte alternatif (description de l’image)" path="couvertureAlt" value={p.couvertureAlt} onChange={(couvertureAlt) => set({ couvertureAlt })} max={200} required={Boolean(p.couverture)} />
              {p.couverture && (
                // eslint-disable-next-line @next/next/no-img-element -- aperçu d'une adresse saisie par l'admin
                <img src={p.couverture} alt={p.couvertureAlt} className="aspect-[2/1] w-full max-w-md rounded-xl border border-[#E5E7EB] object-cover" />
              )}
            </FormSection>

            <FormSection title="Contenu" id="contenu" path="contenu" description={`Markdown : ## titre, **gras**, *italique*, - liste, 1. liste numérotée, > citation, [lien](https://…), ![description](image). Environ ${readingMinutes(p.contenu)} min de lecture.`}>
              <div role="tablist" aria-label="Contenu" className="inline-flex rounded-xl bg-night-50 p-1">
                {(['write', 'preview'] as const).map((t) => (
                  <button key={t} type="button" role="tab" aria-selected={mdTab === t} onClick={() => setMdTab(t)}
                    className={cn('min-h-[40px] rounded-lg px-4 text-[13.5px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500', mdTab === t ? 'bg-white text-night-900 shadow-soft' : 'text-night-600')}>
                    {t === 'write' ? 'Écrire' : 'Aperçu'}
                  </button>
                ))}
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                <div className={cn(mdTab === 'preview' && 'hidden xl:block')}>
                  <TextAreaField label="Texte (Markdown)" path="contenu" value={p.contenu} onChange={(contenu) => set({ contenu })} max={60000} rows={22} required mono />
                </div>
                <div className={cn('rounded-xl border border-[#E5E7EB] bg-white p-4 xl:max-h-[640px] xl:overflow-y-auto', mdTab === 'write' && 'hidden xl:block')} aria-label="Aperçu du contenu">
                  <Markdown source={p.contenu} />
                </div>
              </div>
            </FormSection>

            <FormSection title="Référencement (SEO)" id="seo" path="seoTitre">
              <TextField label="Titre SEO (facultatif)" path="seoTitre" value={p.seoTitre} onChange={(seoTitre) => set({ seoTitre })} max={70} hint="Par défaut : le titre de l’article." />
              <TextAreaField label="Description SEO (facultatif)" path="seoDescription" value={p.seoDescription} onChange={(seoDescription) => set({ seoDescription })} max={170} rows={2} hint="Par défaut : l’extrait." />
              <div className="rounded-xl border border-[#E5E7EB] p-4" aria-label="Aperçu dans un moteur de recherche">
                <p className="text-[12px] text-night-600">lienparental.fr › blog › {p.slug}</p>
                <p className="mt-0.5 truncate text-[17px] text-[#1a0dab]">{seoTitle} · Lien Parental</p>
                <p className="mt-0.5 line-clamp-2 text-[13.5px] text-night-700">{seoDesc}</p>
              </div>
            </FormSection>
          </>
        )
      }}
    </EditorShell>
  )
}
