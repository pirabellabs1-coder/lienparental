/**
 * Finances intégrées au Journal (récap fonctionnel v2, « Nouveauté 1 » ; enrichi en v3, 0350).
 *
 * Module PUR (ni React, ni navigateur, ni serveur) : importable par l'UI, la couche
 * de données (lib/data/journal) et le Coach IA (lib/ai/context, server-only).
 * - Une dépense est une entrée du Journal de type `depense` + des champs spécifiques.
 * - Montants TOUJOURS en centimes entiers (aucun flottant pour l'argent).
 * - Pension alimentaire = simple catégorie (`pension`), pas de module dédié.
 * - v3 : sens (dépense / reçu / remboursement), payeur et bénéficiaire structurés, modes
 *   étendus, référence, statut, montant payé, répartition entre parents, récurrence,
 *   plusieurs justificatifs. Tous ces champs sont FACULTATIFS dans `JournalDepense`
 *   (absents = valeurs par défaut) : les données existantes et les modules lecteurs
 *   (dossier JAF, Coach IA) restent valides sans changement.
 */
import { z } from 'zod'
import { addDaysToKey, dayKeyInTz, shiftMonthKey } from './tz'

// --- Listes fermées (clés techniques = contrat d'URL + contraintes CHECK SQL 0240 / 0350) ---

/** Liste du client (récap v2) + compléments v3, « Autre » toujours en dernier. */
export const DEPENSE_CATEGORIES = [
  'pension', 'ecole', 'cantine', 'sante', 'vetements', 'activites',
  'transport', 'loisirs', 'assurance', 'frais-administratifs',
  'garde', 'creche', 'etudes-permis', 'telephonie', 'argent-de-poche',
  'autre',
] as const
export type DepenseCategorie = (typeof DEPENSE_CATEGORIES)[number]

export const DEPENSE_CATEGORIE_LABELS: Record<DepenseCategorie, string> = {
  pension: 'Pension / contribution',
  ecole: 'École',
  cantine: 'Cantine',
  sante: 'Santé',
  vetements: 'Vêtements',
  activites: 'Activités',
  transport: 'Transport',
  loisirs: 'Loisirs',
  assurance: 'Assurance',
  'frais-administratifs': 'Frais administratifs',
  garde: 'Garde / nounou',
  creche: 'Crèche',
  'etudes-permis': 'Permis / études supérieures',
  telephonie: 'Téléphonie',
  'argent-de-poche': 'Argent de poche',
  autre: 'Autre',
}

export const DEPENSE_MODES = [
  'virement', 'carte', 'especes', 'prelevement', 'cheque',
  'mobile', 'mandat-cash', 'cesu', 'compensation', 'autre',
] as const
export type DepenseMode = (typeof DEPENSE_MODES)[number]

export const DEPENSE_MODE_LABELS: Record<DepenseMode, string> = {
  virement: 'Virement',
  carte: 'Carte bancaire',
  especes: 'Espèces',
  prelevement: 'Prélèvement',
  cheque: 'Chèque',
  mobile: 'Paiement mobile / en ligne',
  'mandat-cash': 'Mandat cash',
  cesu: 'Titre / chèque CESU',
  compensation: 'Compensation',
  autre: 'Autre',
}

/** Modes affichés en pastilles ; les autres sont proposés dans une liste « Autre mode ». */
export const DEPENSE_MODES_PRINCIPAUX = ['virement', 'carte', 'especes', 'prelevement', 'cheque'] as const
export const DEPENSE_MODES_AUTRES = ['mobile', 'mandat-cash', 'cesu', 'compensation', 'autre'] as const
/** Modes pour lesquels on propose de préciser le service (PayPal, Lydia, Wero…). */
export const MODES_AVEC_SERVICE: readonly DepenseMode[] = ['mobile', 'autre']

/** Sens du mouvement, du point de vue de l'utilisateur. */
export const DEPENSE_SENS = ['depense', 'recu', 'remboursement-recu', 'remboursement-verse'] as const
export type DepenseSens = (typeof DEPENSE_SENS)[number]
export const DEPENSE_SENS_LABELS: Record<DepenseSens, string> = {
  depense: 'Dépense payée',
  recu: 'Paiement reçu',
  'remboursement-recu': 'Remboursement reçu',
  'remboursement-verse': 'Remboursement versé',
}

/** Payeur / bénéficiaire structuré. */
export const PARTIES = ['moi', 'autre-parent', 'etablissement', 'prestataire', 'organisme', 'autre'] as const
export type Partie = (typeof PARTIES)[number]
export const PARTIE_LABELS: Record<Partie, string> = {
  moi: 'Moi',
  'autre-parent': 'L’autre parent',
  etablissement: 'Établissement (école, crèche…)',
  prestataire: 'Prestataire / commerçant',
  organisme: 'Organisme (CAF, CPAM, mutuelle…)',
  autre: 'Autre',
}

export const DEPENSE_STATUTS = ['paye', 'en-attente', 'partiel', 'rembourse', 'conteste'] as const
export type DepenseStatut = (typeof DEPENSE_STATUTS)[number]
export const DEPENSE_STATUT_LABELS: Record<DepenseStatut, string> = {
  paye: 'Payé',
  'en-attente': 'En attente',
  partiel: 'Partiellement payé',
  rembourse: 'Remboursé',
  conteste: 'Contesté',
}

export const RECURRENCES = ['ponctuel', 'mensuel', 'trimestriel', 'annuel'] as const
export type Recurrence = (typeof RECURRENCES)[number]
export const RECURRENCE_LABELS: Record<Recurrence, string> = {
  ponctuel: 'Ponctuel',
  mensuel: 'Mensuel',
  trimestriel: 'Trimestriel',
  annuel: 'Annuel',
}
const RECURRENCE_MONTHS: Record<Recurrence, number> = { ponctuel: 0, mensuel: 1, trimestriel: 3, annuel: 12 }

/** Répartition entre parents : « ma part », en pourcentage (0 à 100) ou en montant (centimes). */
export const PARTAGE_MODES = ['pourcentage', 'montant'] as const
export type PartageMode = (typeof PARTAGE_MODES)[number]

/** EUR par défaut ; devises voisines utiles en Guyane (Brésil, Suriname) et USD. */
export const DEVISES = ['EUR', 'BRL', 'SRD', 'USD'] as const
export type Devise = (typeof DEVISES)[number]
export const DEVISE_LABELS: Record<Devise, string> = {
  EUR: 'Euro (€)',
  BRL: 'Réal brésilien (R$)',
  SRD: 'Dollar surinamais (SRD)',
  USD: 'Dollar américain ($)',
}

export const MAX_AMOUNT_CENTS = 10_000_000 // 100 000,00
export const BENEFICIAIRE_MAX = 120
export const PAYEUR_MAX = 120
export const MODE_LIBELLE_MAX = 60
export const REFERENCE_MAX = 80
export const JUSTIFICATIF_MAX_BYTES = 10 * 1024 * 1024
export const JUSTIFICATIF_MIME = /^(application\/pdf|image\/(jpeg|png|webp|heic))$/
/** Justificatifs par dépense (principal + 9 autres ; contrainte SQL 0350 identique). */
export const MAX_JUSTIFICATIFS = 10

/** Mention obligatoire (récap v2). */
export const FINANCES_DISCLAIMER =
  'Lien Parental ne certifie pas qu’un paiement a réellement été effectué : vous enregistrez la dépense, joignez un justificatif et retrouvez l’historique.'

// --- Types ------------------------------------------------------------------------

export type DepenseJustificatif = {
  name: string
  mime: string
  sizeBytes: number
  /** Chemin Storage (bucket privé `documents`, `${uid}/journal/…`) — mode connecté uniquement. */
  path?: string
}

/** Champs spécifiques d'une entrée Journal `depense` (date, enfants, description = champs communs). */
export type JournalDepense = {
  /** Montant de la dépense ou du paiement (montant dû si « partiellement payé »). */
  montantCents: number
  devise: Devise
  categorie: DepenseCategorie
  mode: DepenseMode
  /** Libellé libre du bénéficiaire / destinataire. */
  beneficiaire?: string
  /** Justificatif principal (rétrocompatibilité : lu par le dossier JAF et le Coach IA). */
  justificatif?: DepenseJustificatif
  /** Justificatifs supplémentaires (0350). */
  autresJustificatifs?: DepenseJustificatif[]
  // --- v3 (0350), tous facultatifs ---
  /** Absent = `depense`. */
  sens?: DepenseSens
  payeurType?: Partie
  payeurLibelle?: string
  beneficiaireType?: Partie
  /** Service utilisé (PayPal, Lydia, Wero…) ou précision du mode. */
  modeLibelle?: string
  /** N° de virement, de chèque, de transaction… */
  reference?: string
  /** Absent = `paye`. */
  statut?: DepenseStatut
  /** Montant déjà réglé quand le statut est « partiellement payé » (strictement inférieur au montant). */
  montantPayeCents?: number
  partageMode?: PartageMode
  /** Ma part : pourcentage entier (0 à 100) ou centimes (≤ montant), selon `partageMode`. */
  partageValeur?: number
  /** Absent = `ponctuel`. */
  recurrence?: Recurrence
  /** "yyyy-mm-dd" : prochaine échéance (récurrence uniquement). */
  echeanceSuivante?: string
}

// --- Validation partagée (formulaire + couche de données) ---------------------------

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

type AdvancedFields = {
  montantCents?: number
  statut?: DepenseStatut
  montantPayeCents?: number
  partageMode?: PartageMode
  partageValeur?: number
  recurrence?: Recurrence
  echeanceSuivante?: string
}

/**
 * Règles croisées des champs « Plus de détails » (partagées par le schéma et le formulaire,
 * qui les affiche même si un champ principal est encore invalide).
 */
export function advancedErrors(v: AdvancedFields): Partial<Record<'montantPayeCents' | 'partageValeur' | 'echeanceSuivante', string>> {
  const out: Partial<Record<'montantPayeCents' | 'partageValeur' | 'echeanceSuivante', string>> = {}
  const total = v.montantCents ?? 0
  if (v.statut === 'partiel') {
    if (v.montantPayeCents === undefined) out.montantPayeCents = 'Indiquez le montant déjà payé.'
    else if (v.montantPayeCents < 1 || (total > 0 && v.montantPayeCents >= total)) {
      out.montantPayeCents = 'Le montant payé doit être supérieur à 0 et inférieur au montant total.'
    }
  }
  if (v.partageMode) {
    if (v.partageValeur === undefined) out.partageValeur = 'Indiquez votre part.'
    else if (v.partageMode === 'pourcentage' && v.partageValeur > 100) out.partageValeur = 'Pourcentage entre 0 et 100.'
    else if (v.partageMode === 'montant' && total > 0 && v.partageValeur > total) out.partageValeur = 'Votre part ne peut pas dépasser le montant total.'
  }
  if (v.recurrence && v.recurrence !== 'ponctuel' && v.echeanceSuivante && !isRealDay(v.echeanceSuivante)) {
    out.echeanceSuivante = 'Date d’échéance invalide.'
  }
  return out
}
const optText = (max: number) => z.string().trim().max(max, `${max} caractères maximum.`).optional()

/** Jour calendaire réel "yyyy-mm-dd" (rejette 2026-02-31). */
export function isRealDay(v: unknown): v is string {
  if (typeof v !== 'string' || !DAY_RE.test(v)) return false
  const [y, m, d] = v.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return y >= 1900 && y <= 2100 && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

export const depenseSchema = z
  .object({
    montantCents: z
      .number({ invalid_type_error: 'Indiquez un montant.' })
      .int('Montant invalide.')
      .min(1, 'Le montant doit être supérieur à 0.')
      .max(MAX_AMOUNT_CENTS, 'Montant trop élevé (100 000 maximum).'),
    devise: z.enum(DEVISES).default('EUR'),
    categorie: z.enum(DEPENSE_CATEGORIES, { errorMap: () => ({ message: 'Choisissez une catégorie.' }) }),
    mode: z.enum(DEPENSE_MODES, { errorMap: () => ({ message: 'Choisissez un mode de paiement.' }) }),
    beneficiaire: optText(BENEFICIAIRE_MAX),
    sens: z.enum(DEPENSE_SENS).default('depense'),
    payeurType: z.enum(PARTIES).optional(),
    payeurLibelle: optText(PAYEUR_MAX),
    beneficiaireType: z.enum(PARTIES).optional(),
    modeLibelle: optText(MODE_LIBELLE_MAX),
    reference: optText(REFERENCE_MAX),
    statut: z.enum(DEPENSE_STATUTS).default('paye'),
    montantPayeCents: z.number().int().min(0).max(MAX_AMOUNT_CENTS).optional(),
    partageMode: z.enum(PARTAGE_MODES).optional(),
    partageValeur: z.number().int().min(0).max(MAX_AMOUNT_CENTS).optional(),
    recurrence: z.enum(RECURRENCES).default('ponctuel'),
    echeanceSuivante: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    for (const [path, message] of Object.entries(advancedErrors(v))) {
      if (message) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message })
    }
  })
  // Normalisation : un champ sans objet n'est jamais enregistré (cohérent avec les CHECK SQL 0350).
  .transform((v) => ({
    ...v,
    payeurLibelle: v.payeurLibelle || undefined,
    beneficiaire: v.beneficiaire || undefined,
    modeLibelle: v.modeLibelle || undefined,
    reference: v.reference || undefined,
    montantPayeCents: v.statut === 'partiel' ? v.montantPayeCents : undefined,
    partageValeur: v.partageMode ? v.partageValeur : undefined,
    echeanceSuivante: v.recurrence !== 'ponctuel' && v.echeanceSuivante ? v.echeanceSuivante : undefined,
  }))
export type DepenseInput = z.input<typeof depenseSchema>
export type DepenseValid = z.output<typeof depenseSchema>

const includes = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === 'string' && (list as readonly string[]).includes(v)
export const isDepenseCategorie = (v: unknown): v is DepenseCategorie => includes(DEPENSE_CATEGORIES, v)
export const isDepenseMode = (v: unknown): v is DepenseMode => includes(DEPENSE_MODES, v)
export const isDevise = (v: unknown): v is Devise => includes(DEVISES, v)
export const isDepenseSens = (v: unknown): v is DepenseSens => includes(DEPENSE_SENS, v)
export const isDepenseStatut = (v: unknown): v is DepenseStatut => includes(DEPENSE_STATUTS, v)
export const isPartie = (v: unknown): v is Partie => includes(PARTIES, v)
export const isRecurrence = (v: unknown): v is Recurrence => includes(RECURRENCES, v)
export const isPartageMode = (v: unknown): v is PartageMode => includes(PARTAGE_MODES, v)

/** Contrôle d'un justificatif (une photo ou un PDF, 10 Mo max). Renvoie un message ou null. */
export function justificatifError(file: { type: string; size: number }): string | null {
  if (!JUSTIFICATIF_MIME.test(file.type)) return 'Format non pris en charge. Utilisez une photo (JPG, PNG, WebP, HEIC) ou un PDF.'
  if (file.size > JUSTIFICATIF_MAX_BYTES) return 'Fichier trop volumineux (10 Mo maximum).'
  return null
}

/** Tous les justificatifs d'une dépense, principal en premier. */
export function allJustificatifs(d: Pick<JournalDepense, 'justificatif' | 'autresJustificatifs'>): DepenseJustificatif[] {
  return [...(d.justificatif ? [d.justificatif] : []), ...(d.autresJustificatifs ?? [])]
}

// --- Lecture avec valeurs par défaut --------------------------------------------------

export const sensOf = (d: Pick<JournalDepense, 'sens'>): DepenseSens => d.sens ?? 'depense'
export const statutOf = (d: Pick<JournalDepense, 'statut'>): DepenseStatut => d.statut ?? 'paye'
export const recurrenceOf = (d: Pick<JournalDepense, 'recurrence'>): Recurrence => d.recurrence ?? 'ponctuel'

/** Libellé du mode, précisé si un service est indiqué : « Paiement mobile / en ligne (Lydia) ». */
export function modeLabel(d: Pick<JournalDepense, 'mode' | 'modeLibelle'>): string {
  return d.modeLibelle ? `${DEPENSE_MODE_LABELS[d.mode]} (${d.modeLibelle})` : DEPENSE_MODE_LABELS[d.mode]
}

/** « L’autre parent », « Organisme (CAF…) : CAF de Guyane », ou le seul libellé libre. */
export function partieLabel(type: Partie | undefined, libelle: string | undefined): string | undefined {
  if (type && libelle) return type === 'moi' ? PARTIE_LABELS.moi : `${PARTIE_LABELS[type].replace(/ \(.*\)$/, '')} : ${libelle}`
  if (type) return PARTIE_LABELS[type]
  return libelle || undefined
}

/**
 * Flux du point de vue de l'utilisateur :
 * - `sortie` : dépense payée ou remboursement versé (par moi, ou payeur non précisé) ;
 * - `entree` : paiement ou remboursement reçu (par moi, ou bénéficiaire non précisé) ;
 * - `tiers` : mouvement réglé par / versé à quelqu'un d'autre (ex. dépense réglée par l'autre
 *   parent) : enregistré pour l'historique, exclu du solde.
 */
export type Flux = 'sortie' | 'entree' | 'tiers'
export function fluxOf(d: Pick<JournalDepense, 'sens' | 'payeurType' | 'beneficiaireType'>): Flux {
  const s = sensOf(d)
  if (s === 'depense' || s === 'remboursement-verse') return d.payeurType && d.payeurType !== 'moi' ? 'tiers' : 'sortie'
  return d.beneficiaireType && d.beneficiaireType !== 'moi' ? 'tiers' : 'entree'
}

/** Montant effectivement réglé (déclaré) : 0 si en attente, le montant payé si partiel, sinon le montant. */
export function montantRegleCents(d: Pick<JournalDepense, 'montantCents' | 'statut' | 'montantPayeCents'>): number {
  const s = statutOf(d)
  if (s === 'en-attente') return 0
  if (s === 'partiel') return Math.min(d.montantPayeCents ?? 0, d.montantCents)
  return d.montantCents
}

/** Reste à régler (en attente ou partiellement payé), sinon 0. */
export function resteDuCents(d: Pick<JournalDepense, 'montantCents' | 'statut' | 'montantPayeCents'>): number {
  return d.montantCents - montantRegleCents(d)
}

/** Répartition entre parents (sur le montant total), ou null si non renseignée. */
export function partsCents(d: Pick<JournalDepense, 'montantCents' | 'partageMode' | 'partageValeur'>): { moi: number; autre: number; pct?: number } | null {
  if (!d.partageMode || d.partageValeur === undefined) return null
  if (d.partageMode === 'pourcentage') {
    const pct = Math.max(0, Math.min(100, d.partageValeur))
    const moi = Math.round((d.montantCents * pct) / 100)
    return { moi, autre: d.montantCents - moi, pct }
  }
  const moi = Math.max(0, Math.min(d.montantCents, d.partageValeur))
  return { moi, autre: d.montantCents - moi }
}

/** "yyyy-mm-dd" + n mois, jour borné à la fin du mois (31 janv. + 1 mois → 28/29 févr.). */
export function addMonthsToDay(day: string, months: number): string {
  const [y, m, d] = day.split('-').map(Number)
  const target = shiftMonthKey(`${y}-${String(m).padStart(2, '0')}`, months)
  const [ty, tm] = target.split('-').map(Number)
  const last = new Date(Date.UTC(ty, tm, 0)).getUTCDate()
  return `${target}-${String(Math.min(d, last)).padStart(2, '0')}`
}

/** Échéance suivante proposée à partir de la date de la dépense (null si ponctuel). */
export function suggestNextDue(day: string, recurrence: Recurrence): string | null {
  const n = RECURRENCE_MONTHS[recurrence]
  return n && isRealDay(day) ? addMonthsToDay(day, n) : null
}

// --- Argent -----------------------------------------------------------------------

const formatters = new Map<Devise, Intl.NumberFormat>()
export function formatMontant(cents: number, devise: Devise = 'EUR'): string {
  let f = formatters.get(devise)
  if (!f) {
    f = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: devise })
    formatters.set(devise, f)
  }
  return f.format(cents / 100)
}

/**
 * « 30 » / « 12,5 » / « 12.50 » / « 1 234,56 € » → centimes entiers. null si invalide,
 * nul ou au-delà de 100 000. Calcul par chaînes : aucune erreur d'arrondi flottant.
 */
export function parseAmountToCents(input: string): number | null {
  const s = input.replace(/[\s  €]/g, '')
  const m = /^(\d{1,6})(?:[.,](\d{1,2}))?$/.exec(s)
  if (!m) return null
  const cents = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'))
  return cents > 0 && cents <= MAX_AMOUNT_CENTS ? cents : null
}

/** Centimes → valeur de champ « 150,00 » (sans symbole). */
export function centsToInput(cents: number): string {
  return `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, '0')}`
}

// --- Agrégats (vue Finances) ------------------------------------------------------

type WithDepense = { date: string; childIds: string[]; depense?: JournalDepense }

/** "yyyy-mm" */
export function monthKeyOf(isoDay: string): string {
  return isoDay.slice(0, 7)
}

export function shiftMonth(key: string, delta: number): string {
  return shiftMonthKey(key, delta)
}

export function isMonthKey(v: unknown): v is string {
  return typeof v === 'string' && /^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(v)
}

/** Totaux par devise, EUR en premier. */
export type Totals = { devise: Devise; cents: number }[]

function totalsOf(map: Map<Devise, number>): Totals {
  return DEVISES.filter((d) => map.has(d)).map((d) => ({ devise: d, cents: map.get(d)! }))
}

/** Sens qui sont des DÉPENSES (argent dépensé pour les enfants), par opposition aux sommes reçues. */
export function isDepenseSortante(d: Pick<JournalDepense, 'sens'>): boolean {
  const s = sensOf(d)
  return s === 'depense' || s === 'remboursement-verse'
}

/**
 * Somme par devise des montants DÉCLARÉS (`montantCents`, quel que soit le statut) des
 * opérations de sens `depense` ou `remboursement-verse`, QUEL QUE SOIT le payeur : une dépense
 * réglée par l'autre parent est comptée, une dépense en attente aussi (montant total).
 * Les paiements et remboursements reçus sont exclus.
 * Ce n'est donc PAS « ce que j'ai payé » : pour cela, utiliser `totalsByFlux(...).sortie`
 * (sorties réglées par moi, montant effectivement réglé). Plus aucun écran ne l'utilise :
 * la vue Finances, le Coach IA (réel et démo) et le dossier JAF passent par `totalsByFlux`
 * / `montantRegleCents`. Conservé (et testé) pour d'éventuels exports « montants déclarés ».
 */
export function sumByDevise(items: WithDepense[]): Totals {
  const map = new Map<Devise, number>()
  for (const e of items) {
    if (!e.depense || !isDepenseSortante(e.depense)) continue
    map.set(e.depense.devise, (map.get(e.depense.devise) ?? 0) + e.depense.montantCents)
  }
  return totalsOf(map)
}

export function formatTotals(t: Totals): string {
  if (!t.length) return formatMontant(0, 'EUR')
  return t.map((x) => formatMontant(x.cents, x.devise)).join(' + ')
}

/** Solde par devise : signe explicite (« +12,00 € », « −30,00 € »). */
export function formatSolde(t: Totals): string {
  if (!t.length) return formatMontant(0, 'EUR')
  return t
    .map((x) => (x.cents > 0 ? '+' : x.cents < 0 ? '−' : '') + formatMontant(Math.abs(x.cents), x.devise))
    .join(' · ')
}

export type FluxTotals = {
  /** Dépensé : sorties (`fluxOf` = `sortie`), montant effectivement réglé. */
  sortie: Totals
  /** Reçu : entrées (`fluxOf` = `entree`), montant effectivement réglé. */
  entree: Totals
  /** Reçu − dépensé, par devise (devises présentes en sortie ou en entrée uniquement). */
  solde: Totals
  /** Réglé par / versé à un tiers (`fluxOf` = `tiers`, ex. l'autre parent), montant réglé : hors solde. */
  tiers: Totals
  /**
   * Reste à régler (`resteDuCents` : en attente, partiellement payé), TOUS flux confondus :
   * mélange ce que je dois, ce que l'on me doit et ce qu'un tiers doit encore.
   */
  aRegler: Totals
}

/**
 * Totaux par flux (`fluxOf`). Montant compté = montant effectivement réglé (`montantRegleCents`) :
 * une opération en attente ne compte dans aucun des totaux sortie / entrée / tiers, seul son
 * reste dû apparaît dans `aRegler` ; une opération partielle compte pour sa part réglée.
 */
export function totalsByFlux(items: WithDepense[]): FluxTotals {
  const maps = { sortie: new Map<Devise, number>(), entree: new Map<Devise, number>(), tiers: new Map<Devise, number>(), aRegler: new Map<Devise, number>() }
  const add = (m: Map<Devise, number>, dev: Devise, c: number) => { if (c) m.set(dev, (m.get(dev) ?? 0) + c) }
  for (const e of items) {
    const d = e.depense
    if (!d) continue
    add(maps[fluxOf(d)], d.devise, montantRegleCents(d))
    add(maps.aRegler, d.devise, resteDuCents(d))
  }
  const solde = new Map<Devise, number>()
  for (const dev of DEVISES) {
    if (!maps.sortie.has(dev) && !maps.entree.has(dev)) continue
    solde.set(dev, (maps.entree.get(dev) ?? 0) - (maps.sortie.get(dev) ?? 0))
  }
  return { sortie: totalsOf(maps.sortie), entree: totalsOf(maps.entree), solde: totalsOf(solde), tiers: totalsOf(maps.tiers), aRegler: totalsOf(maps.aRegler) }
}

export type ChildBucket = {
  key: string
  label: string
  /** Sorties réglées (cf. `totalsByFlux`). */
  sortie: Totals
  /** Entrées réglées (cf. `totalsByFlux`). */
  entree: Totals
  /** Nombre d'opérations (tous flux) du compartiment. */
  count: number
}

/**
 * Total par enfant SANS double comptage : une dépense liée à un seul enfant va dans son
 * compartiment ; plusieurs enfants → « Plusieurs enfants » ; aucun → « Sans enfant précisé ».
 * Pour chaque flux, la somme des compartiments égale le total de la période (`totalsByFlux`).
 */
export function totalsByChild(items: WithDepense[], children: { id: string; prenom: string }[]): ChildBucket[] {
  const groups = new Map<string, WithDepense[]>()
  for (const e of items) {
    if (!e.depense) continue
    const ids = e.childIds.filter((id) => children.some((c) => c.id === id))
    const key = ids.length === 1 ? ids[0] : ids.length > 1 ? '__plusieurs' : '__aucun'
    groups.set(key, [...(groups.get(key) ?? []), e])
  }
  const ordered = [...children.map((c) => c.id), '__plusieurs', '__aucun']
  return ordered
    .filter((k) => groups.has(k))
    .map((k) => {
      const list = groups.get(k)!
      const label = k === '__plusieurs' ? 'Plusieurs enfants' : k === '__aucun' ? 'Sans enfant précisé' : children.find((c) => c.id === k)!.prenom
      const f = totalsByFlux(list)
      return { key: k, label, sortie: f.sortie, entree: f.entree, count: list.length }
    })
}

// --- Filtres de la vue Finances (URL) -----------------------------------------------

export const FINANCE_PERIODES = ['mois', '3m', '12m', 'perso'] as const
export type FinancePeriode = (typeof FINANCE_PERIODES)[number]
export const FINANCE_PERIODE_LABELS: Record<FinancePeriode, string> = {
  mois: 'Un mois',
  '3m': '3 derniers mois',
  '12m': '12 derniers mois',
  perso: 'Dates personnalisées',
}

/** `enfant` : id d'enfant, ou `__aucun` (sans enfant précisé). */
export type FinanceFilters = {
  periode: FinancePeriode
  sens?: DepenseSens
  statut?: DepenseStatut
  categorie?: DepenseCategorie
  enfant?: string
  du?: string
  au?: string
}

type Raw = Record<string, string | string[] | undefined>
const firstOf = (p: Raw, k: string) => {
  const v = p[k]
  const s = Array.isArray(v) ? v[0] : v
  return typeof s === 'string' ? s : undefined
}

/** Lecture tolérante : toute valeur invalide est ignorée. */
export function parseFinanceFilters(p: Raw): FinanceFilters {
  const periode = firstOf(p, 'periode')
  const sens = firstOf(p, 'sens')
  const statut = firstOf(p, 'statut')
  const categorie = firstOf(p, 'categorie')
  const enfant = firstOf(p, 'enfant')
  const du = firstOf(p, 'du')
  const au = firstOf(p, 'au')
  return {
    periode: includes(FINANCE_PERIODES, periode) ? periode : 'mois',
    sens: isDepenseSens(sens) ? sens : undefined,
    statut: isDepenseStatut(statut) ? statut : undefined,
    categorie: isDepenseCategorie(categorie) ? categorie : undefined,
    enfant: enfant && /^[A-Za-z0-9_-]{1,64}$/.test(enfant) ? enfant : undefined,
    du: isRealDay(du) ? du : undefined,
    au: isRealDay(au) ? au : undefined,
  }
}

/**
 * Plage de jours inclusive d'une période. `month` sert à la période `mois`.
 * Période `perso` : les deux bornes sont plafonnées à aujourd'hui (pas de période future),
 * puis remises dans l'ordre si elles sont inversées.
 */
export function financeRange(f: FinanceFilters, month: string, today: string): { fromDay: string; toDay: string } {
  const endOfMonth = (m: string) => addDaysToKey(`${shiftMonthKey(m, 1)}-01`, -1)
  if (f.periode === '3m') return { fromDay: `${shiftMonthKey(monthKeyOf(today), -2)}-01`, toDay: today }
  if (f.periode === '12m') return { fromDay: `${shiftMonthKey(monthKeyOf(today), -11)}-01`, toDay: today }
  if (f.periode === 'perso') {
    const cap = (d: string) => (d <= today ? d : today)
    const from = cap(f.du ?? `${monthKeyOf(today)}-01`)
    const to = cap(f.au ?? today)
    return from <= to ? { fromDay: from, toDay: to } : { fromDay: to, toDay: from }
  }
  return { fromDay: `${month}-01`, toDay: endOfMonth(month) }
}

export function applyFinanceFilters<T extends WithDepense>(items: T[], f: FinanceFilters): T[] {
  return items.filter((e) => {
    const d = e.depense
    if (!d) return false
    if (f.sens && sensOf(d) !== f.sens) return false
    if (f.statut && statutOf(d) !== f.statut) return false
    if (f.categorie && d.categorie !== f.categorie) return false
    if (f.enfant === '__aucun' ? e.childIds.length > 0 : f.enfant && !e.childIds.includes(f.enfant)) return false
    return true
  })
}

/** Nombre de filtres actifs hors période. */
export function activeFilterCount(f: FinanceFilters): number {
  return [f.sens, f.statut, f.categorie, f.enfant].filter(Boolean).length
}

// Contrat d'URL de pré-remplissage (`/app/journal/nouveau?…`) : voir lib/prefill → parseJournalPrefill.

// --- Filtres du Journal (`?filtre=`) ------------------------------------------------

export const JOURNAL_FILTERS = ['tous', 'visites', 'appels', 'messages', 'sante', 'finances', 'autres'] as const
export type JournalFilter = (typeof JOURNAL_FILTERS)[number]

export const JOURNAL_FILTER_LABELS: Record<JournalFilter, string> = {
  tous: 'Tous',
  visites: 'Visites',
  appels: 'Appels',
  messages: 'Messages',
  sante: 'Santé',
  finances: 'Finances',
  autres: 'Autres',
}

/** Filtre → type d'entrée du Journal (null = tous). */
export const FILTER_TYPE: Record<JournalFilter, 'visite' | 'appel' | 'message' | 'sante' | 'depense' | 'autre' | null> = {
  tous: null,
  visites: 'visite',
  appels: 'appel',
  messages: 'message',
  sante: 'sante',
  finances: 'depense',
  autres: 'autre',
}

export function parseJournalFilter(v: string | string[] | undefined): JournalFilter {
  const s = Array.isArray(v) ? v[0] : v
  return s && (JOURNAL_FILTERS as readonly string[]).includes(s) ? (s as JournalFilter) : 'tous'
}

// --- Données de démonstration ------------------------------------------------------

export type DemoDepenseEntry = {
  id: string
  title: string
  date: string
  heure?: string
  description?: string
  childIds: string[]
  createdAt: string
  depense: JournalDepense
}

/** Jour "aujourd'hui − n" dans DEFAULT_TZ (identique serveur / navigateur, quel que soit leur fuseau). */
function isoDaysAgo(today: Date, n: number): string {
  return addDaysToKey(dayKeyInTz(today), -n)
}

/**
 * Dépenses de démo du Journal : exemple du récap (25/10/2026) + reprise des 8 dépenses
 * de l'ancien module « Frais partagés » (ids `f_N` → `jd_f_N`, cf. redirection
 * app/app/frais/[id] ; mêmes montants, mêmes dates relatives, mêmes justificatifs)
 * + exemples v3 (paiement reçu, remboursements, CESU, paiement mobile, statuts).
 */
export function demoDepenseEntries(today: Date = new Date()): DemoDepenseEntry[] {
  const d = (n: number) => isoDaysAgo(today, n)
  const pdf = (name: string, kb: number): DepenseJustificatif => ({ name, mime: 'application/pdf', sizeBytes: kb * 1024 })
  const jpg = (name: string, kb: number): DepenseJustificatif => ({ name, mime: 'image/jpeg', sizeBytes: kb * 1024 })
  return [
    {
      id: 'jd_ex_lina', title: 'Contribution pour Lina', date: '2026-10-25', heure: '10:00',
      description: 'Contribution mensuelle d’octobre.', childIds: ['c_1'], createdAt: '2026-10-25',
      depense: {
        montantCents: 15000, devise: 'EUR', categorie: 'pension', mode: 'virement', beneficiaire: 'Autre parent',
        justificatif: pdf('avis-virement-octobre.pdf', 64),
        sens: 'depense', payeurType: 'moi', beneficiaireType: 'autre-parent', reference: 'VIR-2026-10-0425',
        statut: 'paye', recurrence: 'mensuel', echeanceSuivante: '2026-11-25',
      },
    },
    {
      id: 'jd_ex_caf', title: 'Allocation de rentrée scolaire', date: d(5), childIds: ['c_1', 'c_2'], createdAt: d(5),
      description: 'Versement de la CAF pour la rentrée.',
      depense: {
        montantCents: 41694, devise: 'EUR', categorie: 'ecole', mode: 'virement', beneficiaire: 'CAF de Guyane',
        sens: 'recu', payeurType: 'organisme', payeurLibelle: 'CAF de Guyane', beneficiaireType: 'moi',
        reference: 'ARS-2026-973', statut: 'paye', recurrence: 'annuel',
        justificatif: pdf('notification-caf-ars.pdf', 88),
      },
    },
    {
      id: 'jd_f_1', title: 'Cantine scolaire (mois en cours)', date: d(3), childIds: ['c_1', 'c_2'], createdAt: d(3),
      depense: {
        montantCents: 9240, devise: 'EUR', categorie: 'cantine', mode: 'prelevement', beneficiaire: 'Service de restauration scolaire',
        justificatif: pdf('facture-cantine.pdf', 124),
        sens: 'depense', payeurType: 'moi', beneficiaireType: 'etablissement',
        partageMode: 'pourcentage', partageValeur: 50, recurrence: 'mensuel', echeanceSuivante: addDaysToKey(d(3), 30),
      },
    },
    {
      id: 'jd_ex_nounou', title: 'Garde périscolaire (nounou)', date: d(7), childIds: ['c_2'], createdAt: d(7),
      description: 'Mercredis d’octobre. Le solde sera réglé à la fin du mois.',
      depense: {
        montantCents: 18000, devise: 'EUR', categorie: 'garde', mode: 'cesu', beneficiaire: 'Mme Jean-Baptiste',
        sens: 'depense', payeurType: 'moi', beneficiaireType: 'prestataire',
        statut: 'partiel', montantPayeCents: 12000, partageMode: 'montant', partageValeur: 9000,
        justificatif: jpg('cesu-octobre.jpg', 540), autresJustificatifs: [pdf('attestation-nounou.pdf', 72)],
      },
    },
    {
      id: 'jd_ex_remb', title: 'Remboursement de la moitié des chaussures', date: d(9), childIds: ['c_1'], createdAt: d(9),
      depense: {
        montantCents: 1995, devise: 'EUR', categorie: 'vetements', mode: 'mobile', modeLibelle: 'Wero', beneficiaire: 'Autre parent',
        sens: 'remboursement-verse', payeurType: 'moi', beneficiaireType: 'autre-parent', statut: 'paye',
      },
    },
    {
      id: 'jd_f_2', title: 'Fournitures scolaires', date: d(12), childIds: ['c_1', 'c_2'], createdAt: d(12),
      description: 'Liste de rentrée complétée (cahiers, trousse, compas pour Noah).',
      depense: { montantCents: 6890, devise: 'EUR', categorie: 'ecole', mode: 'carte', beneficiaire: 'Papeterie', justificatif: jpg('ticket-papeterie.jpg', 860) },
    },
    {
      id: 'jd_f_3', title: "Chaussures d'hiver", date: d(18), childIds: ['c_1'], createdAt: d(18),
      description: 'Dépense réglée par l’autre parent.',
      depense: { montantCents: 3990, devise: 'EUR', categorie: 'vetements', mode: 'carte', beneficiaire: 'Magasin de chaussures', payeurType: 'autre-parent', beneficiaireType: 'prestataire', partageMode: 'pourcentage', partageValeur: 50 },
    },
    {
      id: 'jd_ex_tel', title: 'Forfait téléphone de Lina', date: d(20), childIds: ['c_1'], createdAt: d(20),
      depense: {
        montantCents: 999, devise: 'EUR', categorie: 'telephonie', mode: 'prelevement', beneficiaire: 'Opérateur mobile',
        sens: 'depense', payeurType: 'moi', beneficiaireType: 'prestataire', statut: 'en-attente', recurrence: 'mensuel', echeanceSuivante: addDaysToKey(d(20), 30),
      },
    },
    {
      id: 'jd_f_4', title: 'Photo de classe', date: d(24), childIds: ['c_1', 'c_2'], createdAt: d(24),
      depense: { montantCents: 2360, devise: 'EUR', categorie: 'ecole', mode: 'especes', beneficiaire: 'École' },
    },
    {
      id: 'jd_f_5', title: 'Assurance scolaire', date: d(38), childIds: ['c_1', 'c_2'], createdAt: d(38),
      depense: { montantCents: 2400, devise: 'EUR', categorie: 'assurance', mode: 'prelevement', beneficiaire: 'Assureur', justificatif: pdf('attestation-assurance.pdf', 96), recurrence: 'annuel' },
    },
    {
      id: 'jd_f_6', title: 'Orthodontiste, consultation', date: d(46), childIds: ['c_2'], createdAt: d(46),
      description: 'Reste à charge après mutuelle. Dépense réglée par l’autre parent.',
      depense: { montantCents: 6000, devise: 'EUR', categorie: 'sante', mode: 'carte', beneficiaire: 'Cabinet d’orthodontie', payeurType: 'autre-parent', beneficiaireType: 'prestataire' },
    },
    {
      id: 'jd_f_7', title: 'Licence de judo', date: d(58), childIds: ['c_2'], createdAt: d(58),
      depense: { montantCents: 14500, devise: 'EUR', categorie: 'activites', mode: 'cheque', beneficiaire: 'Club de judo', justificatif: pdf('licence-judo-2026.pdf', 210), reference: 'Chèque n° 0004512' },
    },
    {
      id: 'jd_f_8', title: 'Pharmacie (sirop)', date: d(80), childIds: ['c_1'], createdAt: d(80),
      description: 'Dépense réglée par l’autre parent.',
      depense: { montantCents: 1260, devise: 'EUR', categorie: 'sante', mode: 'carte', beneficiaire: 'Pharmacie', payeurType: 'autre-parent', beneficiaireType: 'prestataire' },
    },
  ]
}
