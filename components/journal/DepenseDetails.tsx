'use client'

import { useId, type ReactNode } from 'react'
import { ChevronDown, SlidersHorizontal } from 'lucide-react'
import { ChoiceChips, SelectField, TextField } from '@/components/journal/FormFields'
import { cn } from '@/lib/cn'
import {
  DEPENSE_STATUTS, DEPENSE_STATUT_LABELS, PARTIES, PARTIE_LABELS, RECURRENCES, RECURRENCE_LABELS,
  formatMontant, parseAmountToCents,
  type DepenseMode, type DepenseStatut, type Devise, type PartageMode, type Partie, type Recurrence,
} from '@/lib/journal-finances'

/** Valeurs de formulaire (chaînes brutes) des champs « Plus de détails » + contreparties. */
export type DepenseDetailsValues = {
  payeurType: Partie | ''
  payeurLibelle: string
  beneficiaireType: Partie | ''
  beneficiaire: string
  reference: string
  statut: DepenseStatut
  montantPaye: string
  partageMode: PartageMode | ''
  partageValeur: string
  recurrence: Recurrence
  echeance: string
}

export const EMPTY_DETAILS: DepenseDetailsValues = {
  payeurType: '', payeurLibelle: '', beneficiaireType: '', beneficiaire: '', reference: '',
  statut: 'paye', montantPaye: '', partageMode: '', partageValeur: '', recurrence: 'ponctuel', echeance: '',
}

export type DetailsErrors = Partial<Record<'montantPaye' | 'partageValeur' | 'echeance', string>>

// « Moi » est la valeur implicite (option vide) : on ne le propose pas une seconde fois.
const PARTY_OPTIONS = PARTIES.filter((p) => p !== 'moi').map((p) => ({ value: p, label: PARTIE_LABELS[p] }))
const STATUT_OPTIONS = DEPENSE_STATUTS.map((s) => ({ value: s, label: DEPENSE_STATUT_LABELS[s] }))
const RECURRENCE_OPTIONS = RECURRENCES.map((r) => ({ value: r, label: RECURRENCE_LABELS[r] }))
const PARTAGE_OPTIONS = [
  { value: '', label: 'Aucune' },
  { value: 'pourcentage', label: 'En %' },
  { value: 'montant', label: 'Montant' },
]
/** Un libellé n'est utile que pour un tiers (pas pour « moi » ni « l'autre parent »). */
const needsLabel = (p: Partie | '') => p !== '' && p !== 'autre-parent'

const REFERENCE_PLACEHOLDER: Partial<Record<DepenseMode, string>> = {
  virement: 'Ex : n° ou libellé du virement',
  cheque: 'Ex : chèque n° 0004512',
  prelevement: 'Ex : référence du mandat',
  carte: 'Ex : n° de transaction du ticket',
  mobile: 'Ex : identifiant de la transaction',
  'mandat-cash': 'Ex : n° du mandat',
  cesu: 'Ex : n° du titre CESU',
}

/** Ma part saisie : pourcentage entier, ou montant (0 accepté). null si invalide. */
export function parsePartValue(mode: PartageMode | '', raw: string): number | null {
  const s = raw.trim()
  if (!mode || !s) return null
  if (mode === 'pourcentage') return /^\d{1,3}$/.test(s) ? Number(s) : null
  if (/^0+(?:[.,]0{1,2})?$/.test(s.replace(/[\s €]/g, ''))) return 0
  return parseAmountToCents(s)
}

/** Nombre de champs avancés renseignés (pastille du résumé). */
export function filledDetailsCount(v: DepenseDetailsValues, outgoing: boolean): number {
  return [
    v.payeurType !== '' || (!outgoing ? false : v.payeurLibelle.trim() !== ''),
    v.beneficiaireType !== '' || (outgoing ? false : v.beneficiaire.trim() !== ''),
    v.reference.trim() !== '',
    v.statut !== 'paye',
    v.partageMode !== '',
    v.recurrence !== 'ponctuel',
  ].filter(Boolean).length
}

/**
 * Section repliable « Plus de détails » d'une dépense : payeur / bénéficiaire structurés,
 * référence, statut et montant payé, répartition entre parents, récurrence.
 * `<details>` natif : clavier et lecteurs d'écran gérés par la plateforme ; ouvert par le
 * parent quand un champ de la section est en erreur.
 */
export function DepenseDetails({
  open, onToggle, values: v, onChange, outgoing, mode, montantCents, devise, errors, minEcheance,
}: {
  open: boolean
  onToggle: (open: boolean) => void
  values: DepenseDetailsValues
  onChange: (patch: Partial<DepenseDetailsValues>) => void
  /** Dépense payée / remboursement versé (true) ou somme reçue (false). */
  outgoing: boolean
  mode: DepenseMode | ''
  montantCents: number | null
  devise: Devise
  errors: DetailsErrors
  /** Lendemain de la date de la dépense (borne de l'échéance suivante). */
  minEcheance?: string
}) {
  const id = useId()
  const count = filledDetailsCount(v, outgoing)
  const total = montantCents ?? 0

  // Répartition : aperçu de la part de l'autre parent.
  const part = parsePartValue(v.partageMode, v.partageValeur)
  let partPreview: string | undefined
  if (part !== null && total > 0) {
    const moi = v.partageMode === 'pourcentage' ? Math.round((total * Math.min(part, 100)) / 100) : Math.min(part, total)
    partPreview = `Votre part : ${formatMontant(moi, devise)} · part de l’autre parent : ${formatMontant(total - moi, devise)}`
  }
  const paye = v.statut === 'partiel' ? parseAmountToCents(v.montantPaye) : null
  const reste = paye !== null && total > paye ? `Reste à payer : ${formatMontant(total - paye, devise)}` : undefined

  return (
    <details
      open={open}
      onToggle={(e) => onToggle((e.currentTarget as HTMLDetailsElement).open)}
      className="group rounded-2xl border border-night-100 bg-white"
    >
      <summary
        className={cn(
          'flex min-h-[56px] cursor-pointer list-none items-center gap-3 rounded-2xl px-4 py-3 [&::-webkit-details-marker]:hidden',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:ring-offset-2',
        )}
      >
        <SlidersHorizontal aria-hidden="true" className="h-5 w-5 shrink-0 text-leaf-600" strokeWidth={1.8} />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-bold text-night-900">
            Plus de détails
            {count > 0 && (
              <span className="ml-2 rounded-full bg-leaf-50 px-2 py-0.5 text-[11px] font-semibold text-leaf-700">
                {count} renseigné{count > 1 ? 's' : ''}
              </span>
            )}
          </span>
          <span className="block text-xs text-night-600">Payeur, statut, référence, répartition, récurrence</span>
        </span>
        <ChevronDown aria-hidden="true" className="h-[18px] w-[18px] shrink-0 text-night-700 group-open:rotate-180 motion-safe:transition-transform" />
      </summary>

      <div className="space-y-5 border-t border-night-100 px-4 pb-5 pt-4">
        <Group title={outgoing ? 'Qui a payé, qui a reçu' : 'Qui a versé, qui a reçu'}>
          <div className="grid gap-4 sm:grid-cols-2">
            {outgoing ? (
              <>
                <SelectField
                  label="Payeur"
                  placeholder="Moi (par défaut)"
                  value={v.payeurType}
                  onChange={(e) => onChange({ payeurType: e.target.value as Partie | '' })}
                  options={PARTY_OPTIONS}
                  hint={v.payeurType ? 'Réglé par quelqu’un d’autre : compté à part, hors solde.' : undefined}
                />
                <SelectField
                  label="Type de bénéficiaire"
                  placeholder="Non précisé"
                  value={v.beneficiaireType}
                  onChange={(e) => onChange({ beneficiaireType: e.target.value as Partie | '' })}
                  options={PARTY_OPTIONS}
                />
                {needsLabel(v.payeurType) && (
                  <TextField
                    label="Nom du payeur (facultatif)"
                    value={v.payeurLibelle}
                    onChange={(e) => onChange({ payeurLibelle: e.target.value })}
                    placeholder="Ex : grand-mère, mutuelle"
                    maxLength={120}
                    autoComplete="off"
                  />
                )}
              </>
            ) : (
              <>
                <SelectField
                  label="Type de payeur"
                  placeholder="Non précisé"
                  value={v.payeurType}
                  onChange={(e) => onChange({ payeurType: e.target.value as Partie | '' })}
                  options={PARTY_OPTIONS}
                />
                <SelectField
                  label="Bénéficiaire"
                  placeholder="Moi (par défaut)"
                  value={v.beneficiaireType}
                  onChange={(e) => onChange({ beneficiaireType: e.target.value as Partie | '' })}
                  options={PARTY_OPTIONS}
                  hint={v.beneficiaireType ? 'Versé à quelqu’un d’autre : compté à part, hors solde.' : undefined}
                />
                {needsLabel(v.beneficiaireType) && (
                  <TextField
                    label="Nom du bénéficiaire (facultatif)"
                    value={v.beneficiaire}
                    onChange={(e) => onChange({ beneficiaire: e.target.value })}
                    placeholder="Ex : crèche Les Colibris"
                    maxLength={120}
                    autoComplete="off"
                  />
                )}
              </>
            )}
          </div>
        </Group>

        <Group title="Paiement">
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Statut"
              value={v.statut}
              onChange={(e) => onChange({ statut: e.target.value as DepenseStatut })}
              options={STATUT_OPTIONS}
              hint={v.statut === 'en-attente' ? 'Non compté dans les totaux tant qu’il n’est pas payé.' : undefined}
            />
            <TextField
              label="Référence (facultatif)"
              value={v.reference}
              onChange={(e) => onChange({ reference: e.target.value })}
              placeholder={(mode && REFERENCE_PLACEHOLDER[mode]) || 'Ex : n° de transaction'}
              maxLength={80}
              autoComplete="off"
              spellCheck={false}
            />
            {v.statut === 'partiel' && (
              <TextField
                label="Montant déjà payé"
                required
                inputMode="decimal"
                autoComplete="off"
                placeholder="0,00"
                value={v.montantPaye}
                onChange={(e) => onChange({ montantPaye: e.target.value })}
                maxLength={14}
                hint={reste ?? 'Le montant principal est le montant total dû.'}
                error={errors.montantPaye}
              />
            )}
          </div>
        </Group>

        <div>
          <ChoiceChips
            name={`${id}-partage`}
            legend="Répartition entre parents"
            options={PARTAGE_OPTIONS}
            value={v.partageMode}
            onChange={(val) => onChange({ partageMode: val as PartageMode | '', partageValeur: '' })}
            columns={3}
          />
          {v.partageMode && (
            <div className="mt-4 sm:max-w-xs">
              <TextField
                label={v.partageMode === 'pourcentage' ? 'Ma part (en %)' : 'Ma part (montant)'}
                required
                inputMode={v.partageMode === 'pourcentage' ? 'numeric' : 'decimal'}
                autoComplete="off"
                placeholder={v.partageMode === 'pourcentage' ? '50' : '0,00'}
                value={v.partageValeur}
                onChange={(e) => onChange({ partageValeur: e.target.value })}
                maxLength={v.partageMode === 'pourcentage' ? 3 : 14}
                hint={partPreview ?? (v.partageMode === 'pourcentage' ? 'Nombre entier de 0 à 100.' : 'Votre part du montant total.')}
                error={errors.partageValeur}
              />
            </div>
          )}
        </div>

        <div>
          <ChoiceChips
            name={`${id}-recurrence`}
            legend="Récurrence"
            options={RECURRENCE_OPTIONS}
            value={v.recurrence}
            onChange={(val) => onChange({ recurrence: val as Recurrence })}
            columns={4}
            hint="Utile pour la pension, la cantine ou un abonnement."
          />
          {v.recurrence !== 'ponctuel' && (
            <div className="mt-4 sm:max-w-xs">
              <TextField
                label="Prochaine échéance (facultatif)"
                type="date"
                value={v.echeance}
                min={minEcheance}
                onChange={(e) => onChange({ echeance: e.target.value })}
                error={errors.echeance}
              />
            </div>
          )}
        </div>
      </div>
    </details>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wide text-night-600">{title}</h3>
      {children}
    </section>
  )
}
