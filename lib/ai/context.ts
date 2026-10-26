import 'server-only'
/**
 * Base de connaissances du Coach IA : instantané COMPACT de l'espace du parent.
 *
 * Minimisation (cahier des charges) :
 * - enfants : prénom, âge, classe, langue. Informations médicales UNIQUEMENT si le parent
 *   l'autorise pour la demande (includeMedical) ; sinon les détails « santé » du journal,
 *   du calendrier et des dépenses (catégorie Santé) sont masqués ;
 * - finances : mouvements du Journal (type `depense`) — date, libellé, sens (dépense / reçu /
 *   remboursement), statut, catégorie, montant, mode de paiement, enfants. Les sommes REÇUES
 *   sont totalisées à part et jamais présentées comme des dépenses (isDepenseSortante).
 *   Jamais le bénéficiaire ni le payeur en clair (seulement leur type : « l'autre parent »…),
 *   ni la référence de transaction, ni le nom du justificatif ;
 * - documents : nom, catégorie, dates — jamais le contenu ; nom masqué si « très confidentiel » ;
 * - témoignages : sujet, statut, compteurs — jamais l'identité des témoins ni les jetons ;
 * - coffre-fort VERROUILLÉ (requireVaultUnlocked) : ni documents ni témoignages, et le modèle
 *   en est informé en une phrase (il ne doit pas conclure que le coffre est vide) ;
 * - uniquement les lignes DU PARENT (`user_id`) pour le calendrier, les documents et les
 *   témoignages : rien de ce que l'autre parent a partagé (famille, 0340) n'est envoyé à l'IA ;
 * - aucun e-mail, téléphone, adresse de fichier ou identifiant technique.
 *
 * Sources : Supabase (client RLS de l'utilisateur) si SUPABASE_ENABLED, sinon données de démo.
 * Chaque section est isolée (try/catch) : une table absente n'empêche pas les autres.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { createClient } from '@/lib/supabase/server'
import type { CurrentUser } from '@/lib/auth/session'
import { requireVaultUnlocked } from '@/lib/vault-lock'
import { decryptMedical, isEncryptedPayload, medicalCryptoReady } from '@/lib/data/server/medical-crypto'
import { ageFromBirthDate, mockChildren, mockJournalEntries } from '@/lib/mock-data'
import { TESTIMONY_REQUESTS, VAULT_CATEGORIES, VAULT_DOCS, receivedCount } from '@/lib/mock-vault'
import { EVENTS } from '@/lib/calendrier'
import { DEFAULT_TZ, dayKeyInTz, monthKeyInTz, shiftMonthKey, wallTimeToIso } from '@/lib/tz'
import {
  CO_PARENT_PRENOM,
  RYTHME_LABELS,
  WEEKDAY_LABELS,
  custodyOfDay,
  defaultGardeConfig,
  handoversBetween,
  holidayAt,
  normalizeZone,
  zoneLabel,
  type GardeConfig,
  type Parent,
} from '@/lib/garde'
import {
  DEPENSE_CATEGORIE_LABELS,
  DEPENSE_MODE_LABELS,
  DEPENSE_SENS_LABELS,
  DEPENSE_STATUT_LABELS,
  PARTIE_LABELS,
  demoDepenseEntries,
  fluxOf,
  formatMontant,
  formatTotals,
  isDepenseCategorie,
  isDepenseMode,
  isDepenseSens,
  isDepenseSortante,
  isDepenseStatut,
  isDevise,
  isPartie,
  sensOf,
  statutOf,
  totalsByFlux,
  type JournalDepense,
} from '@/lib/journal-finances'

export type ContextScope = 'full' | 'minimal'
export type ContextOptions = { includeMedical: boolean; scope: ContextScope }

type KbChild = { id: string; prenom: string; age: number | null; classe?: string | null; langue?: string | null; medical?: string[] }
type KbJournal = { at: string; withTime: boolean; type: string; titre: string; description?: string | null; lieu?: string | null; childIds: string[] }
type KbEvent = { start: string; end?: string | null; allDay: boolean; type: string; titre: string; description?: string | null; lieu?: string | null; childIds: string[] }
type KbDoc = { nom: string; categorie?: string | null; docDate?: string | null; ajoute: string; masque: boolean }
type KbTestimony = { sujet: string; statut: string; creeLe: string; echeance?: string | null; recus?: number; invites?: number }
/**
 * Mouvement du Journal, minimisé (ni libellé du bénéficiaire / payeur, ni référence, ni justificatif).
 * `date` = "yyyy-mm-dd". Sens / statut absents = données antérieures à 0350 (dépense payée).
 */
type KbExpense = {
  date: string
  titre: string
  childIds: string[]
  depense: Pick<JournalDepense, 'montantCents' | 'devise' | 'categorie' | 'mode' | 'sens' | 'statut' | 'montantPayeCents' | 'payeurType' | 'beneficiaireType'>
}

export type KnowledgeSnapshot = {
  today: Date
  parentPrenom: string
  coParent: string
  children: KbChild[]
  journal: KbJournal[] | null
  events: KbEvent[] | null
  garde: string[] | null
  documents: KbDoc[] | null
  testimonies: KbTestimony[] | null
  /** Dépenses du Journal (Finances intégrées), du plus récent au plus ancien. */
  finances: KbExpense[] | null
  includeMedical: boolean
  /** Coffre-fort verrouillé pour cette session : documents et témoignages non chargés. */
  vaultLocked: boolean
}

// Un seul fuseau pour tout l'instantané (démo comprise) : celui de l'application.
const TZ = DEFAULT_TZ
const DAY_MS = 86_400_000
const JOURNAL_PAST_DAYS = 60
const EVENTS_PAST_DAYS = 31 // utile pour « ce mois-ci » / visites prévues mais non notées
const EVENTS_NEXT_DAYS = 60
const MAX_JOURNAL = 50
const MAX_EVENTS = 60
const MAX_DOCS = 60
const MAX_TESTIMONIES = 20
const MAX_EXPENSE_LINES = 30
const FINANCES_PAST_DAYS = 180
const MAX_CONTEXT_CHARS = 40_000 // ~10-12k tokens : garde-fou de coût

// --- Hygiène des données injectées dans le prompt -----------------------------

/** Neutralise les chevrons (pas de fausse balise de fin de bloc) et compacte les blancs. */
function clean(s: string | null | undefined, max = 280): string {
  if (!s) return ''
  const t = s.replace(/[<>]/g, (c) => (c === '<' ? '‹' : '›')).replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

const fmtDayParis = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
const fmtTimeParis = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
const fmtDay = fmtDayParis
const fmtTime = fmtTimeParis
const fmtToday = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

function day(iso: string): string {
  // Date seule (yyyy-mm-dd) : midi UTC pour éviter tout glissement de jour.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00Z`) : new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : fmtDay.format(d)
}
function dayTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : `${fmtDay.format(d)} ${fmtTime.format(d)}`
}
/** Dates « locales » produites par lib/garde (heure du serveur, par construction). */
function localDayTime(d: Date): string {
  const dd = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
  const h = d.getHours()
  const m = d.getMinutes()
  return `${dd} ${h}h${m ? String(m).padStart(2, '0') : ''}`
}

// --- Rendu texte (format stable, économe en tokens) ------------------------------

function childNames(s: KnowledgeSnapshot, ids: string[]): string {
  const names = ids.map((id) => s.children.find((c) => c.id === id)?.prenom).filter(Boolean)
  return names.length ? names.join(', ') : ''
}

export function renderSnapshot(s: KnowledgeSnapshot): string {
  const out: string[] = []
  out.push(`Aujourd'hui : ${fmtToday.format(s.today)} (fuseau America/Cayenne).`)
  out.push(`Parent connecté : ${clean(s.parentPrenom, 40) || 'non renseigné'}. Autre parent : ${clean(s.coParent, 40)}.`)
  out.push(
    s.includeMedical
      ? 'Informations médicales : incluses à la demande du parent pour cette question.'
      : 'Informations médicales : NON transmises (le parent ne les a pas autorisées pour cette question).',
  )

  out.push('', '## Enfants')
  if (!s.children.length) out.push('Aucun enfant enregistré.')
  for (const c of s.children) {
    const parts = [clean(c.prenom, 40), c.age != null ? `${c.age} ans` : null, c.classe ? clean(c.classe, 40) : null, c.langue ? `langue : ${clean(c.langue, 30)}` : null]
    out.push(`- ${parts.filter(Boolean).join(' · ')}`)
    if (c.medical?.length) out.push(`  Santé : ${c.medical.join(' ; ')}`)
  }

  const section = (title: string, lines: string[] | null, empty: string) => {
    out.push('', `## ${title}`)
    if (lines === null) out.push('(Section indisponible pour le moment.)')
    else if (!lines.length) out.push(empty)
    else out.push(...lines)
  }

  section(
    `Journal (${JOURNAL_PAST_DAYS} derniers jours, du plus récent au plus ancien)`,
    s.journal &&
      s.journal.map((j) => {
        const who = childNames(s, j.childIds)
        const healthMasked = j.type === 'sante' && !s.includeMedical
        const desc = healthMasked ? (j.description ? ' — (détails de santé masqués)' : '') : j.description ? ` — ${clean(j.description)}` : ''
        return `- ${j.withTime ? dayTime(j.at) : day(j.at)} · ${journalTypeLabel(j.type)} · « ${clean(j.titre, 100)} »${who ? ` · ${who}` : ''}${j.lieu ? ` · lieu : ${clean(j.lieu, 80)}` : ''}${desc}`
      }),
    'Aucune entrée sur la période.',
  )

  section(
    `Calendrier (${EVENTS_PAST_DAYS} derniers jours et ${EVENTS_NEXT_DAYS} prochains, ordre chronologique)`,
    s.events &&
      s.events.map((e) => {
        const who = childNames(s, e.childIds)
        const when = e.allDay ? `${day(e.start)} (journée)` : `${dayTime(e.start)}${e.end ? `–${fmtTime.format(new Date(e.end))}` : ''}`
        const past = new Date(e.start).getTime() < s.today.getTime() ? ' [passé]' : ''
        const healthMasked = e.type === 'sante' && !s.includeMedical
        const desc = e.description && !healthMasked ? ` — ${clean(e.description, 200)}` : ''
        return `- ${when}${past} · ${eventTypeLabel(e.type)} · « ${clean(e.titre, 100)} »${who ? ` · ${who}` : ''}${e.lieu ? ` · ${clean(e.lieu, 80)}` : ''}${desc}`
      }),
    'Aucun événement sur la période.',
  )

  section('Planning de garde', s.garde, 'Aucun planning de garde configuré.')

  if (s.vaultLocked) {
    out.push('', '## Coffre-fort', 'Coffre-fort verrouillé par le parent : ses documents et ses témoignages ne sont pas transmis ; ne supposez pas qu’il est vide, proposez-lui de le déverrouiller si la question en dépend.')
  }

  if (!s.vaultLocked) section(
    'Coffre-fort : documents (métadonnées uniquement, contenu non transmis)',
    s.documents &&
      s.documents.map(
        (d) =>
          `- ${d.masque ? 'Document très confidentiel (nom masqué)' : `« ${clean(d.nom, 120)} »`}${d.categorie ? ` · catégorie : ${clean(d.categorie, 40)}` : ' · sans catégorie'}${d.docDate ? ` · daté du ${day(d.docDate)}` : ''} · ajouté le ${day(d.ajoute)}`,
      ),
    'Aucun document dans le coffre-fort.',
  )

  if (!s.vaultLocked) section(
    'Demandes de témoignage',
    s.testimonies &&
      s.testimonies.map(
        (t) =>
          `- « ${clean(t.sujet, 80)} » · ${t.statut} · créée le ${day(t.creeLe)}${t.invites != null ? ` · ${t.recus ?? 0} témoignage(s) reçu(s) sur ${t.invites} invitation(s)` : t.recus != null ? ` · ${t.recus} témoignage(s) reçu(s)` : ''}${t.echeance ? ` · échéance ${day(t.echeance)}` : ''}`,
      ),
    'Aucune demande de témoignage.',
  )

  section(
    `Finances : dépenses et sommes reçues enregistrées dans le Journal (${FINANCES_PAST_DAYS} derniers jours)`,
    s.finances && describeFinances(s.finances, s.today, s.includeMedical, (ids) => childNames(s, ids)),
    'Aucun mouvement enregistré.',
  )

  let text = out.join('\n')
  if (text.length > MAX_CONTEXT_CHARS) text = `${text.slice(0, MAX_CONTEXT_CHARS)}\n(… données tronquées)`
  return text
}

/** Version minimale pour l'analyse d'un message : prénoms seulement (minimisation). */
export function renderMinimalSnapshot(s: KnowledgeSnapshot): string {
  const kids = s.children.map((c) => `${clean(c.prenom, 40)}${c.age != null ? ` (${c.age} ans)` : ''}`).join(', ')
  return [
    `Parent connecté : ${clean(s.parentPrenom, 40) || 'non renseigné'}.`,
    `Autre parent : ${clean(s.coParent, 40)}.`,
    `Enfants : ${kids || 'non renseignés'}.`,
  ].join('\n')
}

const JOURNAL_LABELS: Record<string, string> = { visite: 'Visite', appel: 'Appel', message: 'Message', sante: 'Santé', depense: 'Dépense / Paiement', autre: 'Autre' }
function journalTypeLabel(t: string) {
  return JOURNAL_LABELS[t] ?? 'Autre'
}
const EVENT_LABELS: Record<string, string> = {
  visite: 'Visite', appel_video: 'Appel vidéo', appel: 'Appel', message: 'Message', sante: 'Santé', rendez_vous: 'Rendez-vous', rdv: 'Rendez-vous',
  ecole: 'École', activite: 'Activité', sortie: 'Sortie', repas: 'Repas', deplacement: 'Déplacement', anniversaire: 'Anniversaire', autre: 'Autre',
}
function eventTypeLabel(t: string) {
  return EVENT_LABELS[t] ?? 'Autre'
}

// --- Garde, finances : résumés calculés ------------------------------------------

function parentName(p: Parent, coParent: string) {
  return p === 'moi' ? 'chez vous' : `chez ${coParent}`
}

function describeGarde(config: GardeConfig, today: Date, coParent: string): string[] {
  const lieu =
    config.lieu === 'ecole' ? 'à l’école' : config.lieu === 'domicile-moi' ? 'à votre domicile' : config.lieu === 'domicile-autre' ? `au domicile de ${coParent}` : clean(config.lieuAutre, 60) || 'lieu à préciser'
  const lines = [
    `- Rythme : ${RYTHME_LABELS[config.rythme] ?? config.rythme}${config.rythme === 'alternee' ? `, échange le ${WEEKDAY_LABELS[config.handoverWeekday] ?? '?'} à ${config.handoverTime}` : `, échanges à ${config.handoverTime}`}, ${lieu}.`,
    `- Vacances scolaires : ${config.vacances?.moitie ? `partagées par moitié (calendrier ${zoneLabel(normalizeZone(config.vacances.zone))})` : 'pas de règle particulière'}.`,
    `- Aujourd'hui, les enfants sont ${parentName(custodyOfDay(config, today), coParent)}.`,
  ]
  const holiday = holidayAt(config, today)
  if (holiday) lines.push(`- Période en cours : ${holiday}.`)
  const from = new Date(today.getTime() - 31 * DAY_MS)
  const to = new Date(today.getTime() + 31 * DAY_MS)
  const hs = handoversBetween(config, from, to).slice(0, 24)
  if (hs.length) {
    lines.push('- Échanges prévus par le planning (31 jours avant et après aujourd’hui) :')
    for (const h of hs) lines.push(`  · ${localDayTime(h.date)} : ${parentName(h.from, coParent)} → ${parentName(h.to, coParent)}${h.date < today ? ' [passé]' : ''}`)
  }
  return lines
}

function looksLikeGardeConfig(v: unknown): v is GardeConfig {
  if (!v || typeof v !== 'object') return false
  const c = v as Record<string, unknown>
  return (
    typeof c.rythme === 'string' &&
    typeof c.startDate === 'string' &&
    (c.firstParent === 'moi' || c.firstParent === 'autre') &&
    typeof c.handoverWeekday === 'number' &&
    typeof c.handoverTime === 'string' &&
    Array.isArray(c.customPattern) &&
    !!c.vacances &&
    typeof c.vacances === 'object'
  )
}

function describeFinances(list: KbExpense[], today: Date, includeMedical: boolean, names: (ids: string[]) => string): string[] {
  // Même clé de mois que le « Total du mois » du Journal : jour DEFAULT_TZ (lib/tz).
  const current = monthKeyInTz(today)
  const previous = shiftMonthKey(current, -1)
  const inMonth = (key: string) => list.filter((e) => e.date.slice(0, 7) === key)
  // Mêmes règles que la vue Finances (totalsByFlux) : montant effectivement réglé ; une somme
  // reçue n'est jamais comptée comme une dépense ; ce qui est réglé par un tiers est hors solde.
  const month = (key: string) => {
    const t = totalsByFlux(inMonth(key))
    const parts = [`dépensé ${formatTotals(t.sortie)}`, `reçu ${formatTotals(t.entree)}`]
    if (t.aRegler.length) parts.push(`reste à régler ${formatTotals(t.aRegler)}`)
    if (t.tiers.length) parts.push(`réglé par / versé à un tiers (hors solde) ${formatTotals(t.tiers)}`)
    return parts.join(' ; ')
  }
  const lines = [
    '- Montants déclarés par le parent : Lien Parental ne certifie pas qu’un paiement a réellement été effectué.',
    '- « Dépensé » et « reçu » sont distincts : ne présentez jamais une somme reçue comme une dépense.',
    `- Mois en cours (${current}) : ${month(current)}.`,
    `- Mois précédent (${previous}) : ${month(previous)}.`,
  ]
  for (const e of list.slice(0, MAX_EXPENSE_LINES)) {
    const d = e.depense
    const titre = d.categorie === 'sante' && !includeMedical ? 'Dépense de santé (détail masqué)' : `« ${clean(e.titre, 80)} »`
    const who = names(e.childIds)
    const sens = DEPENSE_SENS_LABELS[sensOf(d)]
    const flux = fluxOf(d)
    const party = isDepenseSortante(d) ? d.payeurType : d.beneficiaireType
    const tiers = flux === 'tiers' && party ? ` (${isDepenseSortante(d) ? 'réglé par' : 'versé à'} : ${PARTIE_LABELS[party].replace(/ \(.*\)$/, '').toLocaleLowerCase('fr')})` : ''
    const st = statutOf(d)
    const statut = st === 'paye' ? '' : st === 'partiel' && d.montantPayeCents
      ? ` · ${DEPENSE_STATUT_LABELS[st]} (${formatMontant(d.montantPayeCents, d.devise)} réglé)`
      : ` · ${DEPENSE_STATUT_LABELS[st]}`
    lines.push(`  · ${day(e.date)} · ${sens}${tiers} · ${titre} · ${DEPENSE_CATEGORIE_LABELS[d.categorie]} · ${formatTotals([{ devise: d.devise, cents: d.montantCents }])} · ${DEPENSE_MODE_LABELS[d.mode]}${statut}${who ? ` · ${who}` : ''}`)
  }
  return lines
}

// --- Démo ---------------------------------------------------------------------

function demoSnapshot(user: CurrentUser, opts: ContextOptions, today: Date, vaultOpen: boolean): KnowledgeSnapshot {
  const coParent = CO_PARENT_PRENOM
  // Compte de démo « nouveau » : espace vide, comme un vrai premier lancement.
  if (user.id === 'demo-nouveau') {
    return { today, parentPrenom: user.prenom, coParent: 'l’autre parent', children: [], journal: [], events: [], garde: [], documents: [], testimonies: [], finances: [], includeMedical: opts.includeMedical, vaultLocked: !vaultOpen }
  }

  const children: KbChild[] = mockChildren.map((c) => {
    const medical: string[] = []
    if (opts.includeMedical) {
      if (c.allergies?.length) medical.push(`allergies : ${c.allergies.map((a) => clean(a, 40)).join(', ')}`)
      if (c.autresAllergies) medical.push(`autres allergies : ${clean(c.autresAllergies, 120)}`)
      if (c.groupeSanguin) medical.push(`groupe sanguin : ${clean(c.groupeSanguin, 10)}`)
      if (c.traitement) medical.push(`traitement : ${clean(c.traitement, 160)}`)
      if (c.infosMedicales) medical.push(clean(c.infosMedicales, 200))
    }
    return { id: c.id, prenom: c.prenom, age: c.dateNaissance ? ageFromBirthDate(c.dateNaissance, today) : c.age, classe: c.classe, langue: c.langue, medical }
  })

  const journal: KbJournal[] = mockJournalEntries
    .map((j) => ({
      // Heure murale DEFAULT_TZ → instant (identique quel que soit le fuseau du serveur).
      at: j.heure ? wallTimeToIso(j.date, j.heure) : j.date,
      withTime: Boolean(j.heure),
      type: j.type,
      titre: j.title,
      description: j.description,
      lieu: j.lieu,
      childIds: j.childIds,
    }))
    .filter((j) => today.getTime() - new Date(j.withTime ? j.at : wallTimeToIso(j.at, '12:00')).getTime() <= JOURNAL_PAST_DAYS * DAY_MS)
    .sort((a, b) => b.at.localeCompare(a.at))

  const events: KbEvent[] = EVENTS.map((e) => ({
    start: e.start,
    end: e.end,
    allDay: false,
    type: e.type,
    titre: e.title,
    description: e.description,
    lieu: e.location,
    childIds: e.childrenIds ?? [],
  })).sort((a, b) => a.start.localeCompare(b.start))

  const catName = (id: string) => VAULT_CATEGORIES.find((c) => c.id === id)?.name ?? null
  const documents: KbDoc[] = (vaultOpen ? VAULT_DOCS : []).map((d) => ({ nom: d.name, categorie: catName(d.categoryId), docDate: d.docDate, ajoute: d.addedAt, masque: false }))

  const testimonies: KbTestimony[] = (vaultOpen ? TESTIMONY_REQUESTS : []).map((r) => ({
    sujet: r.subject,
    statut: r.status === 'termine' ? 'terminée' : 'en attente de réponses',
    creeLe: r.createdAt,
    echeance: r.deadline,
    recus: receivedCount(r),
    invites: r.witnesses.length,
  }))

  const finances: KbExpense[] = demoDepenseEntries(today)
    .filter((e) => today.getTime() - new Date(wallTimeToIso(e.date, '12:00')).getTime() <= FINANCES_PAST_DAYS * DAY_MS)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((e) => ({ date: e.date, titre: e.title, childIds: e.childIds, depense: e.depense }))

  return {
    today,
    parentPrenom: user.prenom || 'Julie',
    coParent,
    children,
    journal: journal.slice(0, MAX_JOURNAL),
    events: events.slice(0, MAX_EVENTS),
    garde: describeGarde(defaultGardeConfig(today), today, coParent),
    documents,
    testimonies,
    finances,
    includeMedical: opts.includeMedical,
    vaultLocked: !vaultOpen,
  }
}

// --- Supabase -------------------------------------------------------------------

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn()
  } catch {
    return null
  }
}

function medicalLines(raw: unknown): string[] {
  if (!raw || typeof raw !== 'object') return []
  const m = raw as Record<string, unknown>
  const lines: string[] = []
  const str = (k: string) => (typeof m[k] === 'string' ? (m[k] as string) : '')
  if (Array.isArray(m.allergies) && m.allergies.length) lines.push(`allergies : ${m.allergies.filter((a) => typeof a === 'string').map((a) => clean(a as string, 40)).join(', ')}`)
  if (str('autresAllergies')) lines.push(`autres allergies : ${clean(str('autresAllergies'), 120)}`)
  if (str('groupeSanguin')) lines.push(`groupe sanguin : ${clean(str('groupeSanguin'), 10)}`)
  if (str('traitement')) lines.push(`traitement : ${clean(str('traitement'), 160)}`)
  if (str('infosMedicales')) lines.push(clean(str('infosMedicales'), 200))
  // medecinTraitant volontairement omis (coordonnées d'un tiers).
  return lines
}

async function supabaseSnapshot(user: CurrentUser, opts: ContextOptions, today: Date, vaultOpen: boolean): Promise<KnowledgeSnapshot> {
  const supabase = await createClient()
  // Tables récentes (garde, journal_expenses) absentes des types écrits à la main : client non typé.
  const raw = supabase as unknown as SupabaseClient
  const coParent = 'l’autre parent'
  const iso = (offsetDays: number) => new Date(today.getTime() + offsetDays * DAY_MS).toISOString()

  const childrenP = safe(async () => {
    const cols = opts.includeMedical ? 'id, prenom, date_naissance, classe, langue, infos_medicales' : 'id, prenom, date_naissance, classe, langue'
    const { data, error } = await raw.from('children').select(cols).is('deleted_at', null).order('date_naissance', { ascending: true }).limit(12)
    if (error) throw error
    const rows = (data ?? []) as unknown as Array<{ id: string; prenom: string; date_naissance: string; classe: string | null; langue: string | null; infos_medicales?: unknown }>
    return rows.map<KbChild>((r) => {
      let medical: string[] = []
      if (opts.includeMedical && isEncryptedPayload(r.infos_medicales) && medicalCryptoReady()) {
        try {
          medical = medicalLines(decryptMedical(user.id, r.id, r.infos_medicales))
        } catch {
          medical = []
        }
      }
      return { id: r.id, prenom: r.prenom, age: r.date_naissance ? ageFromBirthDate(r.date_naissance, today) : null, classe: r.classe, langue: r.langue, medical }
    })
  })

  const journalP = safe(async () => {
    const { data, error } = await supabase
      .from('journal_entries')
      .select('type, titre, description, lieu, occurred_at, children_ids')
      .is('deleted_at', null)
      .neq('type', 'depense') // dépenses : section Finances (minimisée)
      .gte('occurred_at', iso(-JOURNAL_PAST_DAYS))
      .order('occurred_at', { ascending: false })
      .limit(MAX_JOURNAL)
    if (error) throw error
    return (data ?? []).map<KbJournal>((r) => ({ at: r.occurred_at, withTime: true, type: r.type, titre: r.titre, description: r.description, lieu: r.lieu, childIds: r.children_ids ?? [] }))
  })

  const eventsP = safe(async () => {
    const { data, error } = await supabase
      .from('calendar_events')
      .select('type, titre, description, lieu, start_at, end_at, all_day, children_ids')
      // m1 (audit) : jamais les événements partagés par l'autre parent (RLS famille 0340).
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .gte('start_at', iso(-EVENTS_PAST_DAYS))
      .lte('start_at', iso(EVENTS_NEXT_DAYS))
      .order('start_at', { ascending: true })
      .limit(MAX_EVENTS)
    if (error) throw error
    return (data ?? []).map<KbEvent>((r) => ({ start: r.start_at, end: r.end_at, allDay: r.all_day, type: r.type, titre: r.titre, description: r.description, lieu: r.lieu, childIds: r.children_ids ?? [] }))
  })

  // Coffre verrouillé : aucune requête (la base refuserait de toute façon, 0370).
  const documentsP = !vaultOpen ? Promise.resolve<KbDoc[]>([]) : safe(async () => {
    const [docs, cats] = await Promise.all([
      // m1 (audit) : uniquement MES documents, jamais ceux partagés par l'autre parent.
      raw.from('documents').select('name, category_id, doc_date, created_at, confidentialite').eq('user_id', user.id).is('deleted_at', null).order('created_at', { ascending: false }).limit(MAX_DOCS),
      supabase.from('categories').select('id, name'),
    ])
    if (docs.error) throw docs.error
    const names = new Map((cats.data ?? []).map((c) => [c.id, c.name]))
    const rows = (docs.data ?? []) as Array<{ name: string; category_id: string | null; doc_date?: string | null; created_at: string; confidentialite: string }>
    return rows.map<KbDoc>((d) => ({
      nom: d.name,
      categorie: d.category_id ? names.get(d.category_id) ?? null : null,
      docDate: d.doc_date ?? null,
      ajoute: d.created_at,
      masque: d.confidentialite === 'tres_confidentiel',
    }))
  })

  const testimoniesP = !vaultOpen ? Promise.resolve<KbTestimony[]>([]) : safe(async () => {
    const [reqs, received] = await Promise.all([
      raw.from('testimony_requests').select('id, subject, status, created_at, deadline, expires_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(MAX_TESTIMONIES),
      supabase.from('testimonies').select('request_id').eq('user_id', user.id).limit(500),
    ])
    if (reqs.error) throw reqs.error
    const counts = new Map<string, number>()
    for (const t of received.data ?? []) counts.set(t.request_id, (counts.get(t.request_id) ?? 0) + 1)
    const STATUS: Record<string, string> = { pending: 'envoyée, pas encore ouverte', opened: 'ouverte par le témoin', in_progress: 'en cours de rédaction', submitted: 'témoignage reçu', expired: 'expirée', revoked: 'révoquée' }
    const rows = (reqs.data ?? []) as Array<{ id: string; subject: string | null; status: string; created_at: string; deadline: string | null }>
    return rows.map<KbTestimony>((r) => ({ sujet: r.subject || 'Demande de témoignage', statut: STATUS[r.status] ?? r.status, creeLe: r.created_at, echeance: r.deadline, recus: counts.get(r.id) ?? 0 }))
  })

  const gardeP = safe(async () => {
    const { data, error } = await raw.from('garde_configs').select('config').maybeSingle()
    if (error) throw error
    const cfg = (data as { config?: unknown } | null)?.config
    return looksLikeGardeConfig(cfg) ? describeGarde(cfg, today, coParent) : []
  })

  const financesP = safe(async () => {
    // Jamais `beneficiaire`, `payer_label`, `transaction_ref` ni `justificatif` (minimisation) :
    // seulement ce qui sert aux totaux et au sens du mouvement.
    const V3 = 'amount_cents, currency, categorie, payment_method, direction, status, amount_paid_cents, payer_type, beneficiary_type'
    const V2 = 'amount_cents, currency, categorie, payment_method'
    const load = (cols: string) => raw
      .from('journal_entries')
      .select(`titre, occurred_at, children_ids, journal_expenses(${cols})`)
      .eq('type', 'depense')
      .is('deleted_at', null)
      .gte('occurred_at', iso(-FINANCES_PAST_DAYS))
      .order('occurred_at', { ascending: false })
      .limit(200)
    let { data, error } = await load(V3)
    // Base sans 0350 (colonne inconnue) : lecture v2, tous les mouvements sont des dépenses payées.
    if (error && (error as { code?: string }).code === '42703') ({ data, error } = await load(V2))
    if (error) throw error
    type Exp = {
      amount_cents: number; currency: string; categorie: string; payment_method: string
      direction?: string | null; status?: string | null; amount_paid_cents?: number | null
      payer_type?: string | null; beneficiary_type?: string | null
    }
    const rows = (data ?? []) as unknown as Array<{ titre: string; occurred_at: string; children_ids: string[] | null; journal_expenses: Exp | Exp[] | null }>
    return rows.flatMap<KbExpense>((r) => {
      const x = Array.isArray(r.journal_expenses) ? r.journal_expenses[0] : r.journal_expenses
      if (!x) return []
      return [{
        date: dayKeyInTz(r.occurred_at),
        titre: r.titre,
        childIds: r.children_ids ?? [],
        depense: {
          montantCents: Number(x.amount_cents) || 0,
          devise: isDevise(x.currency) ? x.currency : 'EUR',
          categorie: isDepenseCategorie(x.categorie) ? x.categorie : 'autre',
          mode: isDepenseMode(x.payment_method) ? x.payment_method : 'autre',
          sens: isDepenseSens(x.direction) ? x.direction : undefined,
          statut: isDepenseStatut(x.status) ? x.status : undefined,
          montantPayeCents: x.amount_paid_cents != null ? Number(x.amount_paid_cents) || 0 : undefined,
          payeurType: isPartie(x.payer_type) ? x.payer_type : undefined,
          beneficiaireType: isPartie(x.beneficiary_type) ? x.beneficiary_type : undefined,
        },
      }]
    })
  })

  const [children, journal, events, documents, testimonies, garde, finances] = await Promise.all([
    childrenP, journalP, eventsP, documentsP, testimoniesP, gardeP, financesP,
  ])

  return {
    today,
    parentPrenom: user.prenom,
    coParent,
    children: children ?? [],
    journal,
    events,
    garde,
    documents,
    testimonies,
    finances,
    includeMedical: opts.includeMedical,
    vaultLocked: !vaultOpen,
  }
}

/** Point d'entrée : instantané de l'espace du parent (jamais celui d'un autre : RLS). */
export async function buildKnowledgeSnapshot(user: CurrentUser, opts: ContextOptions): Promise<KnowledgeSnapshot> {
  const today = new Date()
  // Portée minimale : ni documents ni témoignages, inutile de vérifier le verrou.
  // Sinon fail closed : toute erreur de vérification = coffre considéré verrouillé.
  const vaultOpen = opts.scope === 'minimal' ? false : await requireVaultUnlocked().then((v) => v.ok, () => false)
  return SUPABASE_ENABLED ? supabaseSnapshot(user, opts, today, vaultOpen) : demoSnapshot(user, opts, today, vaultOpen)
}

/** Texte prêt à insérer dans le prompt, selon la portée demandée. */
export async function buildContextText(user: CurrentUser, opts: ContextOptions): Promise<string> {
  const snap = await buildKnowledgeSnapshot(user, opts)
  return opts.scope === 'minimal' ? renderMinimalSnapshot(snap) : renderSnapshot(snap)
}
