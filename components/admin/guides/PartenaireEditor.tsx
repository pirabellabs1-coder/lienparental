'use client'
/**
 * Éditeur d'une offre partenaire du Guide (table guide_partners).
 * Règles éditoriales : étiquette « Partenaire » ou « Offre sponsorisée » obligatoire et visible,
 * critères objectifs, jamais « meilleur » (contrôlé ici, côté serveur et par contrainte SQL).
 */
import { GUIDE_CATEGORIES, type Territoire } from '@/lib/guide/types'
import type { ContentData, ContentRecord } from '@/lib/contenus/types'
import { EditorShell } from '@/components/admin/contenus/EditorShell'
import { FormSection, Repeater, SelectField, TextAreaField, TextField } from '@/components/admin/contenus/form'
import { cn } from '@/lib/cn'

type P = ContentData['partenaire']

export const PARTNER_TYPE_LABEL: Record<P['type'], string> = { partenaire: 'Partenaire', sponsorise: 'Offre sponsorisée' }

export function PartnerPreview({ p }: { p: P }) {
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-[#E5E7EB] bg-white p-5">
      <p className="text-[12px] font-bold uppercase tracking-wider text-night-500">Aperçu côté parent</p>
      <div className="mt-3 rounded-2xl border border-night-100 p-4">
        <p className={cn('inline-flex rounded-full px-2.5 py-1 text-[11.5px] font-bold', p.type === 'sponsorise' ? 'bg-gold-50 text-gold-800' : 'bg-night-50 text-night-800')}>
          {PARTNER_TYPE_LABEL[p.type]}
        </p>
        <h3 className="mt-2 text-[16px] font-extrabold text-night-900">{p.nom}</h3>
        <p className="mt-1 text-[13.5px] text-night-700">{p.description}</p>
        <dl className="mt-3 space-y-1.5 text-[13px]">
          {p.criteres.map((c, i) => (
            <div key={i} className="flex gap-2"><dt className="font-semibold text-night-900">{c.libelle} :</dt><dd className="text-night-700">{c.valeur}</dd></div>
          ))}
        </dl>
        {p.lien && <p className="mt-3 text-[13px] font-semibold text-leaf-700 underline">Voir l’offre</p>}
      </div>
    </div>
  )
}

export function PartenaireEditor({ initial, territoires, defaultTerritoire }: { initial: ContentRecord<'partenaire'> | null; territoires: Territoire[]; defaultTerritoire: string }) {
  const defaults: P = {
    id: 'nouvelle-offre', territoire: defaultTerritoire, categorie: 'assurances', nom: '', type: 'partenaire',
    description: '', criteres: [{ libelle: '', valeur: '' }], lien: null, demo: false,
  }
  return (
    <EditorShell kind="partenaire" initial={initial} defaults={defaults} heading="Guide parental · offre partenaire" preview={(p) => <PartnerPreview p={p} />}>
      {({ data: p, set }) => (
        <>
          <div className="rounded-2xl border border-gold-200 bg-gold-50 p-4 text-[13.5px] text-gold-900">
            <p className="font-bold">Règles d’affichage</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              <li>L’offre s’affiche après l’information neutre de la fiche, avec son étiquette.</li>
              <li>Critères factuels et vérifiables ; aucun classement, jamais le mot « meilleur ».</li>
              <li>« Publier » active l’offre ; « Dépublier » la masque sans la supprimer.</li>
            </ul>
          </div>
          <FormSection title="Offre" id="offre">
            <TextField label="Nom de l’offre ou du partenaire" path="nom" value={p.nom} onChange={(nom) => set({ nom })} max={120} required />
            <fieldset>
              <legend className="mb-1.5 text-[13.5px] font-semibold text-night-900">Étiquette affichée<span aria-hidden="true" className="ml-0.5 text-alert-500">*</span></legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {(['partenaire', 'sponsorise'] as const).map((t) => (
                  <label key={t} className={cn('flex min-h-[44px] cursor-pointer items-start gap-3 rounded-xl border p-3', p.type === t ? 'border-leaf-500 bg-leaf-50/50' : 'border-night-200')}>
                    <input type="radio" name="type" value={t} checked={p.type === t} onChange={() => set({ type: t })} className="mt-0.5 h-5 w-5 accent-leaf-500" />
                    <span>
                      <span className="block text-[14px] font-bold">{PARTNER_TYPE_LABEL[t]}</span>
                      <span className="block text-[12.5px] text-night-600">{t === 'partenaire' ? 'Partenariat sans rémunération liée à l’affichage.' : 'Affichage rémunéré par l’annonceur.'}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField label="Territoire" path="territoire" value={p.territoire} onChange={(territoire) => set({ territoire })} options={territoires.map((t) => ({ value: t.code, label: t.nom }))} required />
              <SelectField label="Catégorie du guide" path="categorie" value={p.categorie} onChange={(categorie) => set({ categorie })} options={GUIDE_CATEGORIES.map((c) => ({ value: c.key, label: c.label }))} required />
            </div>
            <TextAreaField label="Description" path="description" value={p.description} onChange={(description) => set({ description })} max={400} rows={3} required />
            <TextField label="Lien vers l’offre (https, facultatif)" path="lien" type="url" value={p.lien ?? ''} onChange={(v) => set({ lien: v === '' ? null : v })} placeholder="https://" inputMode="url" />
          </FormSection>
          <FormSection title="Critères objectifs" path="criteres" id="criteres" description="De 1 à 8 critères (garanties, conditions, tarif s’il est public et sourcé).">
            <Repeater
              label="Critères" path="criteres" items={p.criteres} onChange={(criteres) => set({ criteres })} min={1} max={8}
              make={() => ({ libelle: '', valeur: '' })} itemTitle={(c) => c.libelle} addLabel="Ajouter un critère"
              render={(c, u, i) => (
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField label="Critère" path={`criteres.${i}.libelle`} value={c.libelle} onChange={(libelle) => u({ libelle })} max={80} required />
                  <TextField label="Valeur" path={`criteres.${i}.valeur`} value={c.valeur} onChange={(valeur) => u({ valeur })} max={160} required />
                </div>
              )}
            />
          </FormSection>
        </>
      )}
    </EditorShell>
  )
}
