import { useLocale, useTranslations } from 'next-intl'
import { intlLocale } from '@/lib/i18n/config'
import type { JournalType } from '@/lib/mock-data'
import type {
  DepenseCategorie, DepenseMode, DepenseSens, DepenseStatut, Devise, FinancePeriode, JournalDepense, JournalFilter,
  Partie, Recurrence, Totals,
} from '@/lib/journal-finances'

// Libellés traduits du Journal et des Finances. Les listes de lib/journal-finances (partagé :
// Coach IA, dossier PDF, admin…) restent en français ; ces helpers les traduisent au rendu à
// partir de leur clé. Les montants gardent leur devise ; seul le format suit la langue.

// Messages de validation (zod / advancedErrors / justificatifError) → clés.
const ERROR_KEYS: Record<string, string> = {
  'Indiquez un montant.': 'amountRequired',
  'Montant invalide.': 'amountInvalid',
  'Le montant doit être supérieur à 0.': 'amountPositive',
  'Montant trop élevé (100 000 maximum).': 'amountTooHigh',
  'Choisissez une catégorie.': 'categoryRequired',
  'Choisissez un mode de paiement.': 'modeRequired',
  'Indiquez le montant déjà payé.': 'paidRequired',
  'Le montant payé doit être supérieur à 0 et inférieur au montant total.': 'paidRange',
  'Indiquez votre part.': 'shareRequired',
  'Pourcentage entre 0 et 100.': 'percentRange',
  'Votre part ne peut pas dépasser le montant total.': 'shareTooHigh',
  'Date d’échéance invalide.': 'dueInvalid',
  'Format non pris en charge. Utilisez une photo (JPG, PNG, WebP, HEIC) ou un PDF.': 'fileFormat',
  'Fichier trop volumineux (10 Mo maximum).': 'fileTooBig',
  '60 caractères maximum.': 'max60',
  '80 caractères maximum.': 'max80',
  '120 caractères maximum.': 'max120',
}

export function useFinanceLabels() {
  const t = useTranslations('family.finances.labels')
  const locale = useLocale()
  const loc = intlLocale(locale)
  const money = (cents: number, devise: Devise = 'EUR') =>
    new Intl.NumberFormat(loc, { style: 'currency', currency: devise }).format(cents / 100)
  const mode = (m: DepenseMode) => t(`modes.${m}`)
  const partie = (p: Partie) => t(`parties.${p}`)
  return {
    locale,
    type: (k: JournalType) => t(`types.${k}`),
    filter: (k: JournalFilter) => t(`filters.${k}`),
    category: (k: DepenseCategorie) => t(`categories.${k}`),
    mode,
    /** « Paiement mobile / en ligne (Lydia) » */
    modeLabel: (d: Pick<JournalDepense, 'mode' | 'modeLibelle'>) => (d.modeLibelle ? `${mode(d.mode)} (${d.modeLibelle})` : mode(d.mode)),
    sens: (k: DepenseSens) => t(`sens.${k}`),
    partie,
    /** Équivalent traduit de partieLabel (lib/journal-finances). */
    partieLabel: (type: Partie | undefined, libelle: string | undefined) => {
      if (type && libelle) return type === 'moi' ? partie('moi') : t('partyWithLabel', { party: t(`partiesShort.${type}`), label: libelle })
      if (type) return partie(type)
      return libelle || undefined
    },
    statut: (k: DepenseStatut) => t(`statuts.${k}`),
    recurrence: (k: Recurrence) => t(`recurrences.${k}`),
    devise: (k: Devise) => t(`devises.${k}`),
    periode: (k: FinancePeriode) => t(`periodes.${k}`),
    disclaimer: () => t('disclaimer'),
    money,
    totals: (list: Totals) => (list.length ? list.map((x) => money(x.cents, x.devise)).join(' + ') : money(0, 'EUR')),
    solde: (list: Totals) =>
      list.length
        ? list.map((x) => (x.cents > 0 ? '+' : x.cents < 0 ? '−' : '') + money(Math.abs(x.cents), x.devise)).join(' · ')
        : money(0, 'EUR'),
    /** Message d'erreur de validation partagé → texte traduit (inconnu : inchangé). */
    error: (m: string | undefined | null) => (m && ERROR_KEYS[m] ? t(`errors.${ERROR_KEYS[m]}`) : m ?? undefined),
  }
}
