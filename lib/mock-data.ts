// Mock data for the mobile app (M03). Replace with Supabase queries later.
// All strings are French and reflect the cahier des charges tone.
import { addDaysToKey, todayKey, wallTimeToIso } from './tz'

export type User = {
  id: string
  prenom: string
  nom: string
  email: string
  avatarUrl?: string
  notifications: number
}

export type Child = {
  id: string
  prenom: string
  age: number
  classe: string
  photoUrl?: string
  // M04 — enrichissements optionnels (RLS: scopés user_id dans Supabase)
  dateNaissance?: string // ISO yyyy-mm-dd
  langue?: string
  statut?: 'actif' | 'archive'
  taille?: number // cm
  poids?: number // kg
  couleurYeux?: string
  couleurCheveux?: string
  allergies?: string[]
  autresAllergies?: string
  infosMedicales?: string
  groupeSanguin?: string
  traitement?: string
  medecinTraitant?: string
  createdAt?: string // ISO — non modifiable (preuve)
}

// M05 — Journal familial. RLS Supabase: filtrer par user_id (parent connecté).
// `depense` : Dépense / Paiement (Finances intégrées au Journal, cf. lib/journal-finances).
export type JournalType = 'visite' | 'appel' | 'message' | 'sante' | 'depense' | 'autre'

export type JournalEntry = {
  id: string
  type: JournalType
  title: string
  date: string // ISO yyyy-mm-dd
  heure?: string // HH:mm
  description?: string
  lieu?: string
  childIds: string[]
  images?: { name: string; url?: string }[]
  createdAt: string // ISO — non modifiable (preuve)
}

export type AppEvent = {
  id: string
  title: string
  date: string // ISO
  location?: string
  type: 'rdv' | 'ecole' | 'medical' | 'garde' | 'appel' | 'autre'
  /** Plage horaire affichée (ex. "14h30 - 17h30"). Optionnel. */
  timeLabel?: string
}

export type Document = {
  id: string
  title: string
  type: 'pdf' | 'image' | 'audio' | 'autre'
  createdAt: string // ISO
  sizeKb: number
}

export type ModelCard = {
  id: string
  title: string
  description: string
  icon: 'scale' | 'school' | 'clock' | 'home'
  accent: 'night' | 'leaf' | 'iris' | 'gold' | 'orange'
  /** Petite catégorie affichée sous le titre (tuiles du dashboard). */
  category?: string
  /** Modèle publié : langue réellement affichée du titre (français si non traduit). */
  lang?: 'fr' | 'en' | 'pt'
}

export type Tip = {
  id: string
  title: string
  body: string
  tag: string
  /** Conseil publié : langue réellement affichée (français si non traduit). */
  lang?: 'fr' | 'en' | 'pt'
}

export const mockUser: User = {
  id: 'u_1',
  prenom: 'Julie',
  nom: 'Martin',
  email: 'julie.martin@email.com',
  notifications: 3,
}

export const mockChildren: Child[] = [
  {
    // `age` dérivé de la date de naissance (jamais figé : il vieillissait avec la démo).
    id: 'c_1', prenom: 'Lina', age: ageFromBirthDate('2019-05-12'), classe: 'Moyenne section',
    dateNaissance: '2019-05-12', langue: 'Français', statut: 'actif',
    taille: 110, poids: 18, couleurYeux: 'Marron', couleurCheveux: 'Châtain',
    allergies: ['Pollen', 'Arachides'], groupeSanguin: 'A+',
    medecinTraitant: 'Dr Martin, 0594 12 34 56',
    createdAt: '2024-09-01T10:00:00.000Z',
  },
  {
    id: 'c_2', prenom: 'Noah', age: ageFromBirthDate('2018-03-02'), classe: 'CE1',
    dateNaissance: '2018-03-02', langue: 'Français', statut: 'actif',
    taille: 122, poids: 23, couleurYeux: 'Bleu', couleurCheveux: 'Blond',
    allergies: [], groupeSanguin: 'O+',
    createdAt: '2024-09-01T10:00:00.000Z',
  },
]

export const mockJournalEntries: JournalEntry[] = [
  {
    id: 'j_1', type: 'visite', title: 'Week-end chez papa', date: isoDaysAgo(2),
    heure: '18:00', description: 'Retour prévu dimanche 19h. Repas pris, devoirs faits.',
    lieu: 'Domicile du père', childIds: ['c_1', 'c_2'], createdAt: isoDaysAgo(2),
  },
  {
    id: 'j_2', type: 'appel', title: 'Appel vidéo avec Lina', date: isoDaysAgo(4),
    heure: '19:30', description: '15 min, échange serein.',
    childIds: ['c_1'], createdAt: isoDaysAgo(4),
  },
  {
    id: 'j_3', type: 'sante', title: 'Consultation pédiatre de Noah', date: isoDaysAgo(10),
    heure: '14:00', description: 'Rhume. Prescription paracétamol.',
    lieu: 'Cabinet Dr. Marchand', childIds: ['c_2'], createdAt: isoDaysAgo(10),
  },
  {
    id: 'j_4', type: 'message', title: 'Échange SMS co-parent', date: isoDaysAgo(14),
    heure: '09:12', description: 'Confirmation du planning scolaire pour la semaine.',
    childIds: ['c_1', 'c_2'], createdAt: isoDaysAgo(14),
  },
  {
    id: 'j_5', type: 'autre', title: 'Spectacle de fin d\'année', date: isoDaysAgo(32),
    heure: '17:00', lieu: 'École Jules Ferry', childIds: ['c_1'], createdAt: isoDaysAgo(32),
  },
  {
    id: 'j_6', type: 'visite', title: 'Vacances de la Toussaint', date: isoDaysAgo(45),
    description: '7 jours chez les grands-parents maternels.',
    childIds: ['c_1', 'c_2'], createdAt: isoDaysAgo(45),
  },
]

export const journalTypeLabels: Record<JournalType, string> = {
  visite: 'Visite',
  appel: 'Appel',
  message: 'Message',
  sante: 'Santé',
  depense: 'Dépense / Paiement',
  autre: 'Autre',
}

export const mockEvents: AppEvent[] = [
  {
    id: 'e_1',
    title: 'Visite avec Lina',
    date: addDaysIso(2),
    timeLabel: '14h30 - 17h30',
    type: 'garde',
  },
  {
    id: 'e_2',
    title: 'Appel vidéo',
    date: addDaysIso(4),
    timeLabel: '16h00',
    type: 'appel',
  },
  {
    id: 'e_3',
    title: 'Rendez-vous médical',
    date: addDaysIso(10),
    timeLabel: '10h00',
    location: 'Cabinet Dr. Marchand',
    type: 'medical',
  },
]

export const mockRecentDocuments: Document[] = [
  { id: 'd_1', title: 'Attestation d\'hébergement — Lina.pdf', type: 'pdf', createdAt: addDaysIso(-1), sizeKb: 182 },
  { id: 'd_2', title: 'Message avocat — 23 oct.', type: 'pdf', createdAt: addDaysIso(-3), sizeKb: 96 },
  { id: 'd_3', title: 'Photo bulletin Noah', type: 'image', createdAt: addDaysIso(-6), sizeKb: 1240 },
]

export const mockModels: ModelCard[] = [
  {
    id: 'm_1',
    title: 'Dossier JAF',
    description: 'Préparer une audience devant le juge aux affaires familiales.',
    icon: 'scale',
    accent: 'iris',
    category: 'Modèle complet',
  },
  {
    id: 'm_2',
    title: "Lettre à l'école",
    description: "Informer l'établissement d'une situation parentale.",
    icon: 'school',
    accent: 'leaf',
    category: 'Communication',
  },
  {
    id: 'm_3',
    title: 'Chronologie',
    description: 'Reconstituer les faits datés et sourcés.',
    icon: 'clock',
    accent: 'night',
    category: 'Des événements',
  },
  {
    id: 'm_4',
    title: "Attestation d'hébergement",
    description: "Justifier de la résidence de l'enfant.",
    icon: 'home',
    accent: 'orange',
    category: 'Modèle',
  },
]

export const mockTips: Tip[] = [
  {
    id: 't_0',
    title: 'Privilégiez la communication écrite.',
    body: "Les écrits permettent d'éviter les malentendus et servent de preuve en cas de besoin.",
    tag: 'Communication',
  },
  {
    id: 't_1',
    title: 'Formuler sans attaquer',
    body: 'Décrivez les faits, puis l\'effet sur l\'enfant. Évitez les jugements sur l\'autre parent.',
    tag: 'Communication',
  },
  {
    id: 't_2',
    title: 'Horodater, toujours',
    body: 'Un message, une photo, une pièce : classez-le le jour même dans le coffre-fort.',
    tag: 'Preuves',
  },
  {
    id: 't_3',
    title: 'Prévenir les transitions',
    body: 'Annoncez à l\'enfant 48h avant un changement de garde. Les rituels rassurent.',
    tag: 'Enfant',
  },
]

// --- helpers --------------------------------------------------------------

function addDaysIso(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(10, 0, 0, 0)
  return d.toISOString()
}

/** Jour "aujourd'hui − n" dans DEFAULT_TZ (lib/tz), et non la date UTC. */
function isoDaysAgo(days: number): string {
  return addDaysToKey(todayKey(), -days)
}

export function formatLongDate(iso: string): string {
  // iso can be yyyy-mm-dd or full ISO
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function formatMonthYear(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
}

export function daysUntil(iso: string): number {
  const target = new Date(iso)
  const now = new Date()
  const msPerDay = 86_400_000
  const diff = Math.round((target.setHours(0, 0, 0, 0) - now.setHours(0, 0, 0, 0)) / msPerDay)
  return diff
}

export function countdownLabel(iso: string): string {
  const d = daysUntil(iso)
  if (d === 0) return "Aujourd'hui"
  if (d === 1) return 'Demain'
  if (d > 1) return `Dans ${d} jours`
  if (d === -1) return 'Hier'
  return `Il y a ${Math.abs(d)} jours`
}

export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

/** "Dimanche 27 octobre 2026" — utilisé par les listes d'événements du dashboard. */
export function formatWeekdayDate(iso: string): string {
  const s = new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// --- Dashboard M03 : documents récemment consultés -------------------------

export type RecentlyViewedDoc = {
  id: string
  title: string
  viewedLabel: string
  icon: 'file' | 'filePen'
  accent: 'iris' | 'leaf' | 'night'
  /** Fiche du document (comptes réels) ; à défaut, la liste du coffre. */
  href?: string
}

export const mockRecentlyViewed: RecentlyViewedDoc[] = [
  { id: 'rv_1', title: 'Dossier JAF - Garde alternée', viewedLabel: 'Consulté il y a 2 h', icon: 'file', accent: 'iris' },
  { id: 'rv_2', title: "Lettre à l'école", viewedLabel: 'Consulté il y a 3 jours', icon: 'filePen', accent: 'leaf' },
  { id: 'rv_3', title: "Courrier à l'autre parent", viewedLabel: 'Consulté il y a 1 semaine', icon: 'file', accent: 'iris' },
]

// --- Coach parental IA (M09) -------------------------------------------------
// Données de démonstration. En production : table ai_analyses (RLS user_id).

export type CoachDocKind = 'capture' | 'pdf' | 'word' | 'message'

export const coachKindLabels: Record<CoachDocKind, string> = {
  capture: "Capture d'écran",
  pdf: 'Document - PDF',
  word: 'Document - Word',
  message: 'Message écrit',
}

export type CoachHistoryItem = {
  id: string
  kind: CoachDocKind
  title: string
  dateLabel: string
  /** Instant ISO (relatif à aujourd'hui, fuseau Guyane) : le libellé est localisé au rendu (localizedDateLabel). */
  createdAt?: string
  responseReady: boolean
}

/** « il y a n jours à hh:mm » (heure murale Guyane) en ISO. */
function coachAt(daysAgo: number, time: string): string {
  return wallTimeToIso(addDaysToKey(todayKey(), -daysAgo), time)
}

export const mockCoachHistory: CoachHistoryItem[] = [
  { id: 'ch_1', kind: 'capture', title: "Capture d'écran WhatsApp", dateLabel: "aujourd'hui à 10:32", createdAt: coachAt(0, '10:32'), responseReady: true },
  { id: 'ch_2', kind: 'pdf', title: 'Document - PDF', dateLabel: 'hier à 16:45', createdAt: coachAt(1, '16:45'), responseReady: true },
  { id: 'ch_3', kind: 'message', title: 'Message écrit', dateLabel: '29 juillet à 14:21', createdAt: coachAt(91, '14:21'), responseReady: true },
  { id: 'ch_4', kind: 'capture', title: "Capture d'écran", dateLabel: '28 juillet à 09:15', createdAt: coachAt(92, '09:15'), responseReady: true },
  { id: 'ch_5', kind: 'word', title: 'Document - Word', dateLabel: '27 juillet à 11:08', createdAt: coachAt(93, '11:08'), responseReady: true },
]

export const mockCoachArchives: CoachHistoryItem[] = [
  { id: 'ca_1', kind: 'message', title: 'Message écrit', dateLabel: '20 juillet à 18:30', createdAt: coachAt(100, '18:30'), responseReady: false },
  { id: 'ca_2', kind: 'pdf', title: 'Document - PDF', dateLabel: '15 juillet à 10:12', createdAt: coachAt(105, '10:12'), responseReady: false },
  { id: 'ca_3', kind: 'capture', title: "Capture d'écran WhatsApp", dateLabel: '10 juillet à 16:05', createdAt: coachAt(110, '16:05'), responseReady: false },
  { id: 'ca_4', kind: 'word', title: 'Document - Word', dateLabel: '5 juillet à 09:20', createdAt: coachAt(115, '09:20'), responseReady: false },
]

/** Messages « reconnus » dans la capture d'écran de démonstration. */
export const mockCoachCapture = {
  title: "Capture d'écran WhatsApp",
  addedLabel: "aujourd'hui à 10:32",
  messages: [
    { text: "Tu ne t'occupes jamais de ta fille !", time: '10:32' },
    { text: "Elle ne t'aime même pas !", time: '10:32' },
    { text: "C'est toujours de ma faute !", time: '10:32' },
    { text: 'Tu exagères tout le temps !!!', time: '10:32' },
    { text: 'Fais ce que tu veux…', time: '10:33' },
    { text: "Je n'en peux plus !", time: '10:33' },
  ],
}

export const mockCoachAnalysis = {
  checks: [
    "Ton et niveau d'agressivité",
    'Mots blessants ou réactifs',
    'Clarté du message',
    'Respect et bienveillance',
    'Impact sur la communication',
  ],
  proposal:
    "J'aimerais que nous trouvions ensemble des solutions pour le bien-être de notre fille. J'ai besoin que nous communiquions calmement et que nous nous écoutions pour avancer dans le même sens.",
  about: [
    "Il s'agit d'une capture d'écran d'une conversation WhatsApp.",
    'Le ton détecté est agressif et contient des accusations. Ces propos peuvent nuire au dialogue et augmenter les tensions.',
  ],
}

export type CoachChatMessage = {
  id: string
  from: 'me' | 'ia'
  text: string
  bullets?: string[]
  time: string
}

export const mockCoachChat: CoachChatMessage[] = [
  { id: 'cc_1', from: 'me', text: "Peux-tu m'expliquer pourquoi le ton est considéré comme agressif ?", time: '10:45' },
  {
    id: 'cc_2', from: 'ia', time: '10:45',
    text: 'Bien sûr. Le ton est considéré comme agressif car le message contient :',
    bullets: ['Des accusations directes', 'Des phrases généralisantes', "Un manque d'écoute", 'Une volonté de blâmer'],
  },
  { id: 'cc_3', from: 'me', text: 'Comment améliorer ma communication dans ce type de situation ?', time: '10:46' },
  {
    id: 'cc_4', from: 'ia', time: '10:46',
    text: 'Voici quelques conseils adaptés :',
    bullets: [
      'Exprime tes besoins sans accuser',
      'Utilise des phrases en "je"',
      'Reste factuel et calme',
      'Propose des solutions concrètes',
      "Écoute la réponse de l'autre sans interrompre",
    ],
  },
]

// Quota Coach IA — cycles glissants de 30 jours.
const COACH_RESET_IN_DAYS = 12
const COACH_CYCLE_DAYS = 30

function cycleDate(offsetDays: number): Date {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  d.setHours(0, 0, 0, 0)
  return d
}

const coachResetDate = cycleDate(COACH_RESET_IN_DAYS)

export const mockCoachUsage = {
  used: 7,
  total: 10,
  resetInDays: COACH_RESET_IN_DAYS,
  /** ex. "06 novembre 2026" */
  resetDateLabel: coachResetDate.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }),
}

export type CoachCycle = { label: string; startLabel: string; used: number; current: boolean }

/** Consommation des 6 derniers cycles, du plus ancien au cycle actuel (inclus). */
export const mockCoachCycles: CoachCycle[] = [9, 4, 7, 6, 5, 7].map((used, i, arr) => {
  const back = arr.length - 1 - i
  const start = cycleDate(COACH_RESET_IN_DAYS - COACH_CYCLE_DAYS * (back + 1))
  return {
    label: back === 0 ? 'Cycle actuel' : `Cycle -${back}`,
    startLabel: start.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }).replace('.', ''),
    used,
    current: back === 0,
  }
})

export type CoachLogItem = { id: string; title: string; dateLabel: string; status: 'Terminée' }

export const mockCoachLog: CoachLogItem[] = [
  { id: 'cl_1', title: 'Analyse de situation familiale', dateLabel: '19 oct. 2026 • 14:32', status: 'Terminée' },
  { id: 'cl_2', title: 'Conseils sur la communication', dateLabel: '18 oct. 2026 • 10:15', status: 'Terminée' },
  { id: 'cl_3', title: 'Analyse de document', dateLabel: '16 oct. 2026 • 16:45', status: 'Terminée' },
  { id: 'cl_4', title: 'Aide à la rédaction', dateLabel: '14 oct. 2026 • 09:20', status: 'Terminée' },
  { id: 'cl_5', title: 'Stratégie de médiation', dateLabel: '13 oct. 2026 • 11:05', status: 'Terminée' },
  { id: 'cl_6', title: 'Révision de message', dateLabel: '11 oct. 2026 • 15:30', status: 'Terminée' },
  { id: 'cl_7', title: 'Analyse juridique', dateLabel: '10 oct. 2026 • 10:22', status: 'Terminée' },
]

// --- Children module & onboarding helpers (redesign) ------------------------

export const CHILD_CLASSES: string[] = [
  'Crèche', 'Toute petite section', 'Petite section', 'Moyenne section', 'Grande section',
  'CP', 'CE1', 'CE2', 'CM1', 'CM2',
  '6ème', '5ème', '4ème', '3ème', '2nde', '1ère', 'Terminale', 'Autre',
]

export const EYE_COLORS: string[] = ['Marron', 'Noisette', 'Vert', 'Bleu', 'Gris', 'Autre']
export const HAIR_COLORS: string[] = ['Blonds', 'Châtains', 'Bruns', 'Roux', 'Noirs', 'Autre']
export const BLOOD_GROUPS: string[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Inconnu']
export const ALLERGY_SUGGESTIONS: string[] = [
  'Arachides', 'Pollen', 'Lactose', 'Gluten', 'Œuf', 'Fruits à coque', 'Acariens', 'Poils d’animaux', 'Pénicilline',
]

/**
 * Âge en années révolues à partir d'une date de naissance "yyyy-mm-dd".
 * Une date de naissance est un JOUR (pas un instant) : on compare ses composantes au jour
 * courant dans le fuseau de l'application (DEFAULT_TZ), jamais via `new Date(iso)` lu dans le
 * fuseau du navigateur ou du serveur (décalage d'un jour la veille d'un anniversaire).
 * Source unique de l'âge affiché (accueil, Mes enfants, journal, calendrier, Coach).
 */
export function ageFromBirthDate(iso: string, now: Date = new Date(), tz?: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '')
  if (!m) return 0
  const [ty, tm, td] = todayKey(tz, now).split('-').map(Number)
  const by = Number(m[1])
  const bm = Number(m[2])
  const bd = Number(m[3])
  let age = ty - by
  if (tm < bm || (tm === bm && td < bd)) age--
  return Math.max(age, 0)
}

/** "5 ans", "1 an", "8 mois". */
export function childAgeLabel(child: Pick<Child, 'age' | 'dateNaissance'>): string {
  if (child.dateNaissance) {
    const years = ageFromBirthDate(child.dateNaissance)
    if (years === 0) {
      const b = new Date(child.dateNaissance)
      const now = new Date()
      const months = Math.max((now.getFullYear() - b.getFullYear()) * 12 + now.getMonth() - b.getMonth(), 0)
      return `${months} mois`
    }
    return `${years} an${years > 1 ? 's' : ''}`
  }
  return `${child.age} an${child.age > 1 ? 's' : ''}`
}

/** "12/05/2019" */
export function formatNumericDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/**
 * Profile completeness (CDC: « informations incomplètes » when key fields are missing,
 * never blocking). Optional physical/medical details count towards completeness.
 */
export function childProfileStatus(child: Child): 'complet' | 'incomplet' {
  const required = [child.dateNaissance, child.classe, child.taille, child.poids, child.groupeSanguin, child.medecinTraitant]
  return required.every((v) => v !== undefined && v !== null && v !== '') ? 'complet' : 'incomplet'
}

// --- Public witness flow (/temoin/[token]) ----------------------------------

export type TestimonyPerson = { id: string; nom: string; role: string }

export type TestimonyRequestPublic = {
  parents: TestimonyPerson[]
  enfants: TestimonyPerson[]
}

/** What the witness sees for a request (resolved server-side from the token later). */
export const mockTestimonyRequest: TestimonyRequestPublic = {
  parents: [
    { id: 'p_1', nom: 'Julie Martin', role: 'Parent 1' },
    { id: 'p_2', nom: 'Thomas Martin', role: 'Parent 2' },
  ],
  enfants: [
    { id: 'e_1', nom: 'Lina Martin', role: 'Enfant 1' },
    { id: 'e_2', nom: 'Noah Martin', role: 'Enfant 2' },
  ],
}
