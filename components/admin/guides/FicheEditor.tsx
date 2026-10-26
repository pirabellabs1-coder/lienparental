'use client'
/**
 * Éditeur structuré d'une fiche du Guide : suit exactement ficheSchema (lib/guide/types.ts).
 * Les champs facultatifs vidés sont retirés (undefined) pour rester conformes au schéma.
 */
import { Wand2 } from 'lucide-react'
import { DEPENSE_CATEGORIE_LABELS } from '@/lib/journal-finances'
import { VAULT_CATEGORY_NAMES, VAULT_CATEGORY_SLUGS } from '@/lib/prefill'
import {
  DEPENSE_CATEGORIES, GUIDE_CATEGORIES, GUIDE_EVENT_TYPES,
  type Fiche, type FicheAction, type Territoire,
} from '@/lib/guide/types'
import { slugify, type ContentRecord } from '@/lib/contenus/types'
import { EditorShell } from '@/components/admin/contenus/EditorShell'
import {
  FormSection, Repeater, SelectField, StringList, TextAreaField, TextField, btnSecondary,
} from '@/components/admin/contenus/form'
import { FichePreview } from './FichePreview'
import { todayKey } from '@/lib/tz'

const opt = (v: string) => (v === '' ? undefined : v)

export const EVENT_LABELS: Record<(typeof GUIDE_EVENT_TYPES)[number], string> = {
  sante: 'Santé', rdv: 'Rendez-vous', ecole: 'École', activite: 'Activité', autre: 'Autre',
}
const ACTION_TYPES = [
  { value: 'coffre', label: 'Ranger un document (coffre-fort)' },
  { value: 'calendrier', label: 'Ajouter un événement (calendrier)' },
  { value: 'rappel', label: 'Créer un rappel' },
  { value: 'depense', label: 'Noter une dépense (journal)' },
] as const

export function newFiche(territoire: string): Fiche {
  return {
    slug: 'nouvelle-fiche', territoire, categorie: 'aides', titre: 'Nouvelle fiche',
    resume: '', aQuoiCaSert: '', quiEstConcerne: [''], aSavoir: [], documents: [],
    etapes: [{ titre: '' }], ou: [{ nom: '' }], liens: [{ titre: '', url: 'https://' }], actions: [],
    datesLimites: [], aConfirmer: [], motsCles: [], derniereVerification: todayKey(),
    sources: [{ titre: '', url: 'https://' }],
  }
}

function makeAction(type: FicheAction['type'], titre = ''): FicheAction {
  switch (type) {
    case 'coffre': return { type, titre, categorie: 'autres' }
    case 'depense': return { type, titre, categorie: DEPENSE_CATEGORIES[0] }
    default: return { type, titre, evenement: 'rdv' }
  }
}

export function FicheEditor({ initial, territoires, defaultTerritoire }: { initial: ContentRecord<'fiche'> | null; territoires: Territoire[]; defaultTerritoire: string }) {
  return (
    <EditorShell
      kind="fiche"
      initial={initial}
      defaults={newFiche(defaultTerritoire)}
      heading="Guide parental · fiche"
      preview={(d) => <FichePreview fiche={d} />}
      publicHref={(r) => `/app/guide/${r.slug}?territoire=${r.territoire}`}
    >
      {({ data: f, set }) => (
        <>
          <FormSection title="Informations générales" path="titre" id="gen">
            <TextField label="Titre" path="titre" value={f.titre} onChange={(titre) => set({ titre })} max={120} required />
            <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
              <TextField label="Slug (adresse)" path="slug" value={f.slug} onChange={(slug) => set({ slug })} max={80} required mono hint="Minuscules, chiffres et tirets. Changer le slug change l’adresse de la fiche." />
              <button type="button" className={btnSecondary} onClick={() => set({ slug: slugify(f.titre) })}><Wand2 className="h-4 w-4" aria-hidden="true" /> Depuis le titre</button>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <SelectField label="Territoire" path="territoire" value={f.territoire} onChange={(territoire) => set({ territoire })} required
                options={territoires.map((t) => ({ value: t.code, label: t.nom }))} />
              <SelectField label="Catégorie" path="categorie" value={f.categorie} onChange={(categorie) => set({ categorie })} required
                options={GUIDE_CATEGORIES.map((c) => ({ value: c.key, label: c.label }))} />
              <TextField label="Dernière vérification" path="derniereVerification" type="date" value={f.derniereVerification} onChange={(derniereVerification) => set({ derniereVerification })} required />
            </div>
            <TextAreaField label="Résumé" path="resume" value={f.resume} onChange={(resume) => set({ resume })} max={300} rows={2} required hint="Affiché dans la recherche et les listes." />
            <TextAreaField label="À quoi ça sert ?" path="aQuoiCaSert" value={f.aQuoiCaSert} onChange={(aQuoiCaSert) => set({ aQuoiCaSert })} max={1200} rows={4} required />
            <TextField label="Mots-clés (séparés par des virgules)" path="motsCles" value={f.motsCles.join(', ')}
              onChange={(v) => set({ motsCles: v.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 20) })} hint="Aident la recherche (40 caractères maximum par mot-clé)." />
          </FormSection>

          <FormSection title="Qui est concerné ?" path="quiEstConcerne" id="qui" description="Au moins une ligne.">
            <StringList label="Public" path="quiEstConcerne" items={f.quiEstConcerne} onChange={(quiEstConcerne) => set({ quiEstConcerne })} itemMax={400} min={1} multiline />
          </FormSection>

          <FormSection title="À savoir" path="aSavoir" id="savoir" description="Points clés, chiffrés ou réglementaires : chacun doit être couvert par une source.">
            <StringList label="Point" path="aSavoir" items={f.aSavoir} onChange={(aSavoir) => set({ aSavoir })} itemMax={500} multiline addLabel="Ajouter un point" />
          </FormSection>

          <FormSection title="Documents nécessaires" path="documents" id="docs" description="Liste à cocher affichée au parent, avec la catégorie du coffre-fort suggérée.">
            <Repeater
              label="Documents" path="documents" items={f.documents} onChange={(documents) => set({ documents })}
              make={() => ({ id: `document-${f.documents.length + 1}`, libelle: '' })} itemTitle={(d) => d.libelle} addLabel="Ajouter un document"
              render={(d, u, i) => (
                <>
                  <TextField label="Libellé" path={`documents.${i}.libelle`} value={d.libelle} onChange={(libelle) => u({ libelle, ...(d.id.startsWith('document-') && libelle ? { id: slugify(libelle, 60) || d.id } : {}) })} max={200} required />
                  <TextAreaField label="Précision (facultatif)" path={`documents.${i}.detail`} value={d.detail ?? ''} onChange={(v) => u({ detail: opt(v) })} max={300} rows={2} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <TextField label="Identifiant" path={`documents.${i}.id`} value={d.id} onChange={(id) => u({ id })} max={80} mono hint="Sert à mémoriser la case cochée : évitez de le changer après publication." />
                    <SelectField label="Catégorie du coffre-fort" path={`documents.${i}.coffre`} value={d.coffre ?? ''} placeholder="Aucune"
                      onChange={(v) => u({ coffre: (v || undefined) as typeof d.coffre })}
                      options={VAULT_CATEGORY_SLUGS.map((s) => ({ value: s, label: VAULT_CATEGORY_NAMES[s] }))} />
                  </div>
                </>
              )}
            />
          </FormSection>

          <FormSection title="Étapes" path="etapes" id="etapes" description="Dans l’ordre. Au moins une étape.">
            <Repeater
              label="Étapes" path="etapes" items={f.etapes} onChange={(etapes) => set({ etapes })} min={1}
              make={() => ({ titre: '' })} itemTitle={(e) => e.titre} addLabel="Ajouter une étape"
              render={(e, u, i) => (
                <>
                  <TextField label="Titre de l’étape" path={`etapes.${i}.titre`} value={e.titre} onChange={(titre) => u({ titre })} max={200} required />
                  <TextAreaField label="Détail (facultatif)" path={`etapes.${i}.detail`} value={e.detail ?? ''} onChange={(v) => u({ detail: opt(v) })} max={600} rows={2} />
                </>
              )}
            />
          </FormSection>

          <FormSection title="Où effectuer la démarche ?" path="ou" id="ou" description="Organismes, au moins un.">
            <Repeater
              label="Organismes" path="ou" items={f.ou} onChange={(ou) => set({ ou })} min={1}
              make={() => ({ nom: '' })} itemTitle={(o) => o.nom} addLabel="Ajouter un organisme"
              render={(o, u, i) => (
                <>
                  <TextField label="Nom" path={`ou.${i}.nom`} value={o.nom} onChange={(nom) => u({ nom })} max={160} required />
                  <TextAreaField label="Précision (facultatif)" path={`ou.${i}.detail`} value={o.detail ?? ''} onChange={(v) => u({ detail: opt(v) })} max={400} rows={2} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <TextField label="Site (https, facultatif)" path={`ou.${i}.url`} type="url" value={o.url ?? ''} onChange={(v) => u({ url: opt(v) })} placeholder="https://" inputMode="url" />
                    <TextField label="Téléphone (facultatif)" path={`ou.${i}.telephone`} type="tel" value={o.telephone ?? ''} onChange={(v) => u({ telephone: opt(v) })} inputMode="tel" />
                  </div>
                </>
              )}
            />
          </FormSection>

          <FormSection title="Liens utiles" path="liens" id="liens" description="Au moins un lien officiel (https).">
            <Repeater
              label="Liens" path="liens" items={f.liens} onChange={(liens) => set({ liens })} min={1}
              make={() => ({ titre: '', url: 'https://' })} itemTitle={(l) => l.titre} addLabel="Ajouter un lien"
              render={(l, u, i) => (
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField label="Titre" path={`liens.${i}.titre`} value={l.titre} onChange={(titre) => u({ titre })} max={160} required />
                  <TextField label="Adresse" path={`liens.${i}.url`} type="url" value={l.url} onChange={(url) => u({ url })} required inputMode="url" />
                </div>
              )}
            />
          </FormSection>

          <FormSection title="Actions « Ajouter à Lien Parental »" path="actions" id="actions" description="Boutons qui ouvrent un formulaire pré-rempli (coffre-fort, calendrier, rappel, dépense).">
            <Repeater
              label="Actions" path="actions" items={f.actions} onChange={(actions) => set({ actions })} max={8}
              make={() => makeAction('coffre')} itemTitle={(a) => a.titre} addLabel="Ajouter une action"
              render={(a, _u, i) => {
                const replace = (next: FicheAction) => set({ actions: f.actions.map((x, k) => (k === i ? next : x)) })
                return (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <SelectField label="Type" path={`actions.${i}.type`} value={a.type} onChange={(t) => replace(makeAction(t, a.titre))} options={ACTION_TYPES} />
                      <TextField label="Libellé du bouton" path={`actions.${i}.titre`} value={a.titre} onChange={(titre) => replace({ ...a, titre })} max={120} required />
                    </div>
                    {a.type === 'coffre' && (
                      <SelectField label="Catégorie du coffre-fort" path={`actions.${i}.categorie`} value={a.categorie} onChange={(categorie) => replace({ ...a, categorie })}
                        options={VAULT_CATEGORY_SLUGS.map((s) => ({ value: s, label: VAULT_CATEGORY_NAMES[s] }))} />
                    )}
                    {(a.type === 'calendrier' || a.type === 'rappel') && (
                      <SelectField label="Type d’événement" path={`actions.${i}.evenement`} value={a.evenement} onChange={(evenement) => replace({ ...a, evenement })}
                        options={GUIDE_EVENT_TYPES.map((e) => ({ value: e, label: EVENT_LABELS[e] }))} />
                    )}
                    {a.type === 'depense' && (
                      <>
                        <SelectField label="Catégorie de dépense" path={`actions.${i}.categorie`} value={a.categorie} onChange={(categorie) => replace({ ...a, categorie })}
                          options={DEPENSE_CATEGORIES.map((c) => ({ value: c, label: DEPENSE_CATEGORIE_LABELS[c] }))} />
                        <div className="grid gap-3 sm:grid-cols-2">
                          <TextField label="Montant connu en euros (facultatif)" path={`actions.${i}.montant`} type="number" inputMode="numeric" value={a.montant?.toString() ?? ''}
                            onChange={(v) => replace({ ...a, montant: v === '' ? undefined : Number(v) })} />
                          <TextField label="Source du montant (obligatoire si montant)" path={`actions.${i}.montantSource`} type="url" value={a.montantSource ?? ''}
                            onChange={(v) => replace({ ...a, montantSource: opt(v) })} placeholder="https://" />
                        </div>
                      </>
                    )}
                  </>
                )
              }}
            />
          </FormSection>

          <FormSection title="Dates limites" path="datesLimites" id="dates">
            <Repeater
              label="Dates limites" path="datesLimites" items={f.datesLimites} onChange={(datesLimites) => set({ datesLimites })}
              make={() => ({ libelle: '' })} itemTitle={(d) => d.libelle} addLabel="Ajouter une date limite"
              render={(d, u, i) => (
                <>
                  <TextField label="Libellé" path={`datesLimites.${i}.libelle`} value={d.libelle} onChange={(libelle) => u({ libelle })} max={200} required />
                  <TextAreaField label="Précision (facultatif)" path={`datesLimites.${i}.detail`} value={d.detail ?? ''} onChange={(v) => u({ detail: opt(v) })} max={400} rows={2} />
                </>
              )}
            />
          </FormSection>

          <FormSection title="À confirmer" path="aConfirmer" id="confirmer" description="Informations locales incertaines, affichées comme « À confirmer ».">
            <StringList label="Information" path="aConfirmer" items={f.aConfirmer} onChange={(aConfirmer) => set({ aConfirmer })} itemMax={400} multiline />
          </FormSection>

          <FormSection title="Sources" path="sources" id="sources" description="Au moins une source officielle (https). Chaque chiffre de la fiche doit y figurer.">
            <Repeater
              label="Sources" path="sources" items={f.sources} onChange={(sources) => set({ sources })} min={1}
              make={() => ({ titre: '', url: 'https://' })} itemTitle={(s) => s.titre} addLabel="Ajouter une source"
              render={(s, u, i) => (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <TextField label="Titre" path={`sources.${i}.titre`} value={s.titre} onChange={(titre) => u({ titre })} max={200} required />
                    <TextField label="Adresse" path={`sources.${i}.url`} type="url" value={s.url} onChange={(url) => u({ url })} required inputMode="url" />
                  </div>
                  <TextField label="« Vérifié le » de la source (facultatif)" path={`sources.${i}.verifieLe`} type="date" value={s.verifieLe ?? ''} onChange={(v) => u({ verifieLe: opt(v) })} className="sm:max-w-[240px]" />
                </>
              )}
            />
          </FormSection>
        </>
      )}
    </EditorShell>
  )
}
