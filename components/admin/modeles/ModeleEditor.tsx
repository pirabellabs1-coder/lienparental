'use client'
/**
 * Éditeur d'un modèle de document : informations, champs variables, mise en page, corps
 * avec variables {{cle}}, aperçu HTML fidèle et aperçu PDF réel (généré dans le navigateur).
 */
import { useState } from 'react'
import { FileDown, Info, Plus, Wand2 } from 'lucide-react'
import {
  FIELD_TYPES, TEMPLATE_CATEGORIES, emptyTemplate, variableReport,
  type DocumentTemplate, type TemplateField,
} from '@/lib/modeles/template'
import { slugify, type ContentRecord } from '@/lib/contenus/types'
import { EditorShell } from '@/components/admin/contenus/EditorShell'
import {
  CheckboxField, FormSection, Repeater, SelectField, TextAreaField, TextField, btnPrimary, btnSecondary,
} from '@/components/admin/contenus/form'
import { TemplatePaper } from '@/components/modeles/TemplatePaper'

function insertIntoBody(token: string, body: string, setBody: (v: string) => void) {
  const ta = document.querySelector<HTMLTextAreaElement>('[data-field-path="corps"] textarea')
  if (!ta) { setBody(`${body}${token}`); return }
  const start = ta.selectionStart ?? body.length
  const end = ta.selectionEnd ?? body.length
  setBody(body.slice(0, start) + token + body.slice(end))
  requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(start + token.length, start + token.length) })
}

function PdfPreviewButton({ t }: { t: DocumentTemplate }) {
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle')
  const run = async () => {
    // Fenêtre ouverte immédiatement (geste utilisateur) : évite le blocage des fenêtres surgissantes.
    const win = window.open('', '_blank')
    setState('busy')
    try {
      const mod = await import('@/lib/modeles/pdf')
      const file = await mod.buildTemplateFile(t, {}, 'pdf', 'preview')
      const url = URL.createObjectURL(file.blob)
      if (win) win.location.href = url
      else mod.downloadBlob(file.blob, file.filename)
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
      setState('idle')
    } catch (e) {
      console.warn('[modeles] aperçu PDF impossible', e)
      win?.close()
      setState('error')
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" className={btnPrimary} onClick={() => void run()} disabled={state === 'busy'}>
        <FileDown className="h-4 w-4" aria-hidden="true" /> {state === 'busy' ? 'Génération…' : 'Ouvrir l’aperçu PDF'}
      </button>
      <span role="status" aria-live="polite" className="text-[13px] text-night-600">
        {state === 'error' ? 'La génération du PDF a échoué : vérifiez le contenu.' : 'Le PDF utilise les valeurs d’exemple des champs.'}
      </span>
    </div>
  )
}

export function ModeleEditor({ initial }: { initial: ContentRecord<'modele'> | null }) {
  return (
    <EditorShell
      kind="modele" initial={initial} defaults={emptyTemplate()} heading="Modèle de document"
      preview={(t) => (
        <div className="space-y-4">
          <PdfPreviewButton t={t} />
          <TemplatePaper template={t} mode="preview" />
        </div>
      )}
    >
      {({ data: t, set }) => {
        const report = variableReport(t)
        const L = t.miseEnPage
        const setL = (patch: Partial<typeof L>) => set({ miseEnPage: { ...L, ...patch } })
        const setBody = (corps: string) => set({ corps })
        return (
          <>
            <FormSection title="Informations" id="infos">
              <TextField label="Titre" path="titre" value={t.titre} onChange={(titre) => set({ titre })} max={140} required />
              <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
                <TextField label="Slug (adresse)" path="slug" value={t.slug} onChange={(slug) => set({ slug })} max={80} required mono />
                <button type="button" className={btnSecondary} onClick={() => set({ slug: slugify(t.titre) })}><Wand2 className="h-4 w-4" aria-hidden="true" /> Depuis le titre</button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField label="Catégorie" path="categorie" value={t.categorie} onChange={(categorie) => set({ categorie })} options={TEMPLATE_CATEGORIES.map((c) => ({ value: c.key, label: c.label }))} required />
                <SelectField label="Badge" path="badge" value={t.badge ?? ''} placeholder="Aucun" onChange={(v) => set({ badge: (v || null) as DocumentTemplate['badge'] })}
                  options={[{ value: 'Populaire', label: 'Populaire' }, { value: 'Nouveau', label: 'Nouveau' }]} />
              </div>
              <TextAreaField label="Description" path="description" value={t.description} onChange={(description) => set({ description })} max={400} rows={2} required hint="Affichée dans la liste « Documents prêts à l’emploi »." />
            </FormSection>

            <FormSection title="Champs à compléter par le parent" path="champs" id="champs" description="Chaque champ devient une variable {{identifiant}} utilisable dans la mise en page et le corps.">
              <Repeater
                label="Champs" path="champs" items={t.champs} onChange={(champs) => set({ champs })} max={40}
                make={(): TemplateField => ({ key: `champ_${t.champs.length + 1}`, label: '', type: 'texte', obligatoire: true, aide: '', exemple: '', options: [] })}
                itemTitle={(f) => (f.label ? `${f.label}  {{${f.key}}}` : '')} addLabel="Ajouter un champ"
                render={(f, u, i) => (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <TextField label="Libellé affiché" path={`champs.${i}.label`} value={f.label} max={80} required
                        onChange={(label) => u({ label, ...(/^champ_\d+$/.test(f.key) && label ? { key: slugify(label, 40).replace(/-/g, '_').replace(/^(\d)/, 'v$1') || f.key } : {}) })} />
                      <TextField label="Identifiant de variable" path={`champs.${i}.key`} value={f.key} onChange={(key) => u({ key })} mono required hint={`S’écrit {{${f.key}}} dans le texte.`} />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <SelectField label="Type" path={`champs.${i}.type`} value={f.type} onChange={(type) => u({ type })} options={FIELD_TYPES.map((x) => ({ value: x.key, label: x.label }))} />
                      <TextField label="Valeur d’exemple (aperçu)" path={`champs.${i}.exemple`} value={f.exemple} onChange={(exemple) => u({ exemple })} max={160} />
                    </div>
                    {f.type === 'choix' && (
                      <TextField label="Options (séparées par des virgules)" path={`champs.${i}.options`} value={f.options.join(', ')}
                        onChange={(v) => u({ options: v.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 20) })} />
                    )}
                    <TextField label="Aide (facultatif)" path={`champs.${i}.aide`} value={f.aide} onChange={(aide) => u({ aide })} max={160} />
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <CheckboxField label="Obligatoire" checked={f.obligatoire} onChange={(obligatoire) => u({ obligatoire })} />
                      <button type="button" className={btnSecondary} onClick={() => insertIntoBody(`{{${f.key}}}`, t.corps, setBody)}>
                        <Plus className="h-4 w-4" aria-hidden="true" /> Insérer dans le corps
                      </button>
                    </div>
                  </>
                )}
              />
              {(report.undeclared.length > 0 || report.unused.length > 0) && (
                <div className="rounded-xl border border-gold-200 bg-gold-50 p-3 text-[13px] text-gold-900" role="note">
                  {report.undeclared.length > 0 && <p><strong>Variables non déclarées :</strong> {report.undeclared.map((v) => `{{${v}}}`).join(', ')}</p>}
                  {report.unused.length > 0 && <p><strong>Champs jamais utilisés :</strong> {report.unused.join(', ')}</p>}
                </div>
              )}
            </FormSection>

            <FormSection title="Mise en page" path="miseEnPage" id="page">
              <div className="grid gap-4 sm:grid-cols-4">
                <SelectField label="Type" path="miseEnPage.type" value={L.type} onChange={(type) => setL({ type })}
                  options={[{ value: 'lettre', label: 'Lettre' }, { value: 'document', label: 'Document / attestation' }]} />
                <SelectField label="Police" path="miseEnPage.police" value={L.police} onChange={(police) => setL({ police })}
                  options={[{ value: 'helvetica', label: 'Sans empattement' }, { value: 'times', label: 'Avec empattement' }]} />
                <SelectField label="Taille du texte" path="miseEnPage.taille" value={L.taille} onChange={(taille) => setL({ taille })}
                  options={[{ value: 'petite', label: 'Petite' }, { value: 'normale', label: 'Normale' }, { value: 'grande', label: 'Grande' }]} />
                <SelectField label="Marges" path="miseEnPage.marges" value={L.marges} onChange={(marges) => setL({ marges })}
                  options={[{ value: 'etroites', label: 'Étroites' }, { value: 'normales', label: 'Normales' }, { value: 'larges', label: 'Larges' }]} />
              </div>
              <CheckboxField label="Afficher le logo Lien Parental en en-tête" checked={L.logo} onChange={(logo) => setL({ logo })} />
              <TextAreaField label="Bloc expéditeur (une ligne par ligne)" path="miseEnPage.expediteur" value={L.expediteur} onChange={(expediteur) => setL({ expediteur })} max={600} rows={4} mono hint="Les lignes vides (champs facultatifs non remplis) sont retirées." />
              {L.type === 'lettre' && (
                <>
                  <TextAreaField label="Destinataire" path="miseEnPage.destinataire" value={L.destinataire} onChange={(destinataire) => setL({ destinataire })} max={600} rows={3} mono />
                  <TextField label="Objet" path="miseEnPage.objet" value={L.objet} onChange={(objet) => setL({ objet })} max={300} />
                </>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label={L.type === 'lettre' ? 'Lieu et date (haut de page)' : 'Lieu et date (fin de document)'} path="miseEnPage.lieuDate" value={L.lieuDate} onChange={(lieuDate) => setL({ lieuDate })} max={160} mono />
                <TextField label="Signature" path="miseEnPage.signature" value={L.signature} onChange={(signature) => setL({ signature })} max={300} mono />
              </div>
              <TextField label="Pied de page" path="miseEnPage.piedDePage" value={L.piedDePage} onChange={(piedDePage) => setL({ piedDePage })} max={200} hint="Par défaut : le titre du modèle. Le numéro de page est ajouté automatiquement." />
            </FormSection>

            <FormSection title="Corps du document" path="corps" id="corps">
              <div className="flex gap-2 rounded-xl bg-night-50 p-3 text-[12.5px] text-night-700">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-night-500" aria-hidden="true" />
                <p>
                  Ligne vide : nouveau paragraphe. <code className="font-mono">#</code> titre, <code className="font-mono">##</code> sous-titre,
                  <code className="font-mono"> - </code> puce, <code className="font-mono">---</code> nouvelle page, <code className="font-mono">{'{{cle}}'}</code> variable.
                  Le texte est toujours imprimé tel quel (aucun HTML).
                </p>
              </div>
              <TextAreaField label="Texte" path="corps" value={t.corps} onChange={setBody} max={20000} rows={16} required mono />
            </FormSection>
          </>
        )
      }}
    </EditorShell>
  )
}
