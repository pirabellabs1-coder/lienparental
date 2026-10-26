/**
 * Section « Dépenses et pension » du dossier JAF : répartition et totaux.
 * Module PUR (aucune dépendance navigateur / serveur hormis lib/journal-finances) :
 * partagé par l'écran « Mon dossier », le PDF navigateur, la charge utile serveur
 * et les tests (tests/dossier-expenses.test.ts).
 */
import {
  DEPENSE_CATEGORIES, DEPENSE_CATEGORIE_LABELS, DEPENSE_SENS_LABELS, DEVISES, fluxOf, formatMontant,
  montantRegleCents, partieLabel, resteDuCents, sensOf,
  type DepenseCategorie, type Devise, type Flux, type JournalDepense, type Totals,
} from '@/lib/journal-finances'
import type { JournalRecord } from '@/lib/data/journal'

/** Dépense du Journal (entrée `depense` avec son détail financier). */
export type DossierExpense = JournalRecord & { depense: NonNullable<JournalRecord['depense']> }

export type CategoryLine = { categorie: DepenseCategorie; label: string; totals: Totals; count: number }

/** Lignes d'une liste du dossier et leurs totaux, calculés sur CES lignes uniquement. */
export type ExpenseGroup = {
  items: DossierExpense[]
  /** Montant effectivement réglé (`montantRegleCents`), par devise. */
  totals: Totals
  /** Reste dû (en attente, partiellement payé), par devise ; vide si tout est réglé. */
  reste: Totals
}

/**
 * Synthèse financière de la section « Dépenses et pension ». Chaque opération figure dans
 * UNE seule liste, selon son flux (`fluxOf`, lib/journal-finances) :
 * - `depenses` : sorties réglées par le parent (dépense payée, remboursement versé ; payeur
 *   « moi » ou non précisé, valeur par défaut des données antérieures à 0350) ;
 * - `recues` : pension reçue, CAF, remboursement reçu… ;
 * - `tiers` : opérations réglées par l'autre parent ou un tiers (hors de mes dépenses).
 * Montants par devise, jamais additionnés entre eux ni convertis.
 */
export type ExpenseSummary = {
  depenses: ExpenseGroup
  /** Totaux par catégorie des seules `depenses` (la somme des catégories = `depenses.totals`). */
  byCategory: CategoryLine[]
  /** Sous-ensemble de `depenses` de catégorie `pension` (déjà compté dans `depenses`). */
  pensionVersee: Totals
  recues: ExpenseGroup
  /** Sous-ensemble de `recues` de catégorie `pension` (déjà compté dans `recues`). */
  pensionRecue: Totals
  tiers: ExpenseGroup
}

function sumBy(items: DossierExpense[], amount: (d: JournalDepense) => number): Totals {
  const map = new Map<Devise, number>()
  for (const e of items) {
    const c = amount(e.depense)
    if (c) map.set(e.depense.devise, (map.get(e.depense.devise) ?? 0) + c)
  }
  return DEVISES.filter((d) => map.has(d)).map((d) => ({ devise: d, cents: map.get(d)! }))
}

/** Montants réglés des lignes, par devise. */
export const sumRegle = (items: DossierExpense[]) => sumBy(items, montantRegleCents)

function group(items: DossierExpense[]): ExpenseGroup {
  return { items, totals: sumRegle(items), reste: sumBy(items, resteDuCents) }
}

export function summarizeExpenses(list: DossierExpense[]): ExpenseSummary {
  const of = (f: Flux) => list.filter((e) => fluxOf(e.depense) === f)
  const depenses = group(of('sortie'))
  const recues = group(of('entree'))
  const byCategory = DEPENSE_CATEGORIES
    .map((c) => {
      const items = depenses.items.filter((e) => e.depense.categorie === c)
      return { categorie: c, label: DEPENSE_CATEGORIE_LABELS[c], totals: sumRegle(items), count: items.length }
    })
    .filter((l) => l.count > 0)
  const pension = (g: ExpenseGroup) => sumRegle(g.items.filter((e) => e.depense.categorie === 'pension'))
  return {
    depenses, byCategory, pensionVersee: pension(depenses),
    recues, pensionRecue: pension(recues),
    tiers: group(of('tiers')),
  }
}

/** « Dépense payée · payé par Moi » / « Paiement reçu · payé par Organisme : CAF de Guyane ». */
export function expenseParties(d: JournalDepense): string {
  const payeur = partieLabel(d.payeurType, d.payeurLibelle) ?? (fluxOf(d) === 'sortie' ? 'Moi' : 'Non précisé')
  return `${DEPENSE_SENS_LABELS[sensOf(d)]} · payé par ${payeur}`
}

/** « 120,00 € réglés sur 180,00 €, dont 60,00 € à régler », ou le seul montant si tout est réglé. */
export function expenseAmount(d: JournalDepense): { regle: string; detail: string | null } {
  const regle = formatMontant(montantRegleCents(d), d.devise)
  const reste = resteDuCents(d)
  return { regle, detail: reste > 0 ? `sur ${formatMontant(d.montantCents, d.devise)}, dont ${formatMontant(reste, d.devise)} à régler` : null }
}

