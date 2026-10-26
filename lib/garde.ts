// Planning de garde : types, rythmes et calculs purs (aucune dépendance au DOM).
// Configuration : table `garde_configs` (lib/data/garde) ou sessionStorage en démonstration.
//
// Toutes les heures sont des heures LOCALES. En interne, un instant est représenté en
// « minutes locales » = numéro de jour civil * 1440 + minutes dans la journée. Ce repère ignore
// les changements d'heure : une alternance « vendredi 18h » reste à 18h toute l'année.

export type Parent = 'moi' | 'autre'
export type Rythme = 'alternee' | '2-2-3' | 'weekends' | 'personnalise'
export type LieuEchange = 'ecole' | 'domicile-moi' | 'domicile-autre' | 'autre'
/**
 * Calendrier scolaire de référence. La Guyane est la zone par défaut (familles accompagnées
 * en Guyane) ; Martinique, Guadeloupe et les trois zones de métropole restent proposées.
 */
export type ZoneScolaire = 'guyane' | 'martinique' | 'guadeloupe' | 'A' | 'B' | 'C'

export type GardeConfig = {
  rythme: Rythme
  /** Date de début du planning (yyyy-mm-dd). Le cycle s'ancre sur le premier jour d'échange à partir de cette date. */
  startDate: string
  /**
   * Parent qui a les enfants au début du cycle.
   * - alternee : la première semaine ; 2-2-3 : le premier bloc de 2 jours (lundi) ;
   * - weekends : le parent qui accueille les week-ends et les mercredis (l'autre a la résidence habituelle).
   * Ignoré pour « personnalise ».
   */
  firstParent: Parent
  /** Jour d'échange (0 = dimanche … 6 = samedi), utilisé par « alternee ». */
  handoverWeekday: number
  /** Heure d'échange HH:mm */
  handoverTime: string
  lieu: LieuEchange
  lieuAutre?: string
  /** Personnalisé : 14 jours (semaine 1 lun→dim, puis semaine 2 lun→dim). true = chez vous. */
  customPattern: boolean[]
  /** Rythme « weekends » : un week-end sur deux (true) ou tous les week-ends (false). */
  weekendsAlternes: boolean
  vacances: {
    moitie: boolean
    zone: ZoneScolaire
    /** Les années paires, parent qui a la première moitié (inversé les années impaires). */
    premiereMoitieAnneesPaires: Parent
  }
}

export type Handover = {
  date: Date
  from: Parent
  to: Parent
}

// --- Prénoms affichés -------------------------------------------------------------
/**
 * Prénoms utilisés dans les phrases du planning. Comptes réels : enfants du compte et
 * parent lié (components/garde/useGardeNames) ; formulation neutre s'ils sont inconnus.
 */
export type GardeNames = {
  /** « Thomas » ou « l'autre parent ». */
  coParent: string
  /** false : formulation neutre (abréviation « Autre » dans le sélecteur de jours). */
  coParentKnown: boolean
  /** « Lina et Noah », « Lina » ou « les enfants ». */
  children: string
  /** Accord du verbe : « sont » / « est ». */
  childrenPlural: boolean
}

export const NEUTRAL_GARDE_NAMES: GardeNames = { coParent: 'l’autre parent', coParentKnown: false, children: 'les enfants', childrenPlural: true }

/** Démonstration uniquement (comptes de lib/demo-auth) : ne jamais afficher pour un compte réel. */
export const DEMO_GARDE_NAMES: GardeNames = { coParent: 'Thomas', coParentKnown: true, children: 'Lina et Noah', childrenPlural: true }
/** @deprecated Démonstration uniquement (réponses simulées du Coach, lib/ai). */
export const CO_PARENT_PRENOM = DEMO_GARDE_NAMES.coParent
/** @deprecated Démonstration uniquement. */
export const CHILDREN_LABEL = DEMO_GARDE_NAMES.children

/** « Lina et Noah », « Lina, Noah et Emma » ; au-delà de 3 prénoms ou sans prénom : « les enfants ». */
export function childrenLabel(prenoms: string[]): Pick<GardeNames, 'children' | 'childrenPlural'> {
  const list = prenoms.map((p) => p.trim()).filter(Boolean)
  if (list.length === 0 || list.length > 3) return { children: NEUTRAL_GARDE_NAMES.children, childrenPlural: true }
  if (list.length === 1) return { children: list[0], childrenPlural: false }
  return { children: `${list.slice(0, -1).join(', ')} et ${list[list.length - 1]}`, childrenPlural: true }
}

/** Accord : `verb(names, 'sont', 'est')`. */
export function childrenVerb(names: Pick<GardeNames, 'childrenPlural'>, plural: string, singular: string): string {
  return names.childrenPlural ? plural : singular
}

/** Première lettre en capitale (début de phrase). */
export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Mercredi (rythme « weekends ») : accueil à la journée. Heures fixes, à faire valider. */
export const WEDNESDAY_START = 9 * 60
export const WEDNESDAY_END = 18 * 60

export const RYTHME_LABELS: Record<Rythme, string> = {
  alternee: 'Une semaine sur deux',
  '2-2-3': '2-2-3 (alternance courte)',
  weekends: 'Week-ends et mercredis',
  personnalise: 'Personnalisé (je choisis les jours)',
}

export const WEEKDAY_LABELS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

export function lieuLabel(c: Pick<GardeConfig, 'lieu' | 'lieuAutre'>, names: GardeNames = NEUTRAL_GARDE_NAMES): string {
  switch (c.lieu) {
    case 'ecole': return 'école'
    case 'domicile-moi': return 'votre domicile'
    case 'domicile-autre': return `domicile de ${names.coParent}`
    case 'autre': return c.lieuAutre?.trim() || 'lieu à préciser'
  }
}

export function parentLabel(p: Parent, names: GardeNames = NEUTRAL_GARDE_NAMES): string {
  return p === 'moi' ? 'vous' : names.coParent
}

// --- Vacances scolaires -------------------------------------------------------
// start = premier jour sans classe, end = jour de reprise des cours (élèves).
//
// Source officielle : ministère de l'Éducation nationale (DNE), jeu de données ouvert
// « Le calendrier scolaire » (fr-en-calendrier-scolaire), data.education.gouv.fr,
// Licence Ouverte v2.0. Champs `location` (Guyane, Martinique, Guadeloupe) et `zones`
// (Zone A/B/C), années 2025-2026 et 2026-2027 ; dates converties en jour civil
// (horodatages publiés en heure de Paris, minuit). Jeu mis à jour le 2026-10-01,
// vérifié le 2026-10-26.
// Retenues : les périodes de vacances (Toussaint, Noël, Carnaval / hiver, Pâques /
// printemps, été). Exclues : ponts et jours fériés locaux (Ascension, Mi-carême,
// abolition de l'esclavage…), qui suivent le rythme habituel.
// Non publiées à la date de vérification : vacances d'été 2027 de Guyane, Martinique et
// Guadeloupe (voir ZONE_CALENDAR_UNTIL). À ajouter dès leur parution, sans les deviner.
export type SchoolHoliday = { nom: string; start: string; end: string; zones: ZoneScolaire[] }

export const ZONE_OPTIONS: { value: ZoneScolaire; label: string }[] = [
  { value: 'guyane', label: 'Guyane' },
  { value: 'martinique', label: 'Martinique' },
  { value: 'guadeloupe', label: 'Guadeloupe' },
  { value: 'A', label: 'Métropole, zone A' },
  { value: 'B', label: 'Métropole, zone B' },
  { value: 'C', label: 'Métropole, zone C' },
]

export const DEFAULT_ZONE: ZoneScolaire = 'guyane'

export function zoneLabel(zone: ZoneScolaire): string {
  return ZONE_OPTIONS.find((z) => z.value === zone)?.label ?? zone
}

/** Fin de la période couverte par les dates officielles publiées (jour de reprise, yyyy-mm-dd). */
export const ZONE_CALENDAR_UNTIL: Record<ZoneScolaire, string> = {
  guyane: '2027-04-12',
  martinique: '2027-04-01',
  guadeloupe: '2027-04-12',
  A: '2027-09-02',
  B: '2027-09-02',
  C: '2027-09-02',
}

const DOM: ZoneScolaire[] = ['guyane', 'martinique', 'guadeloupe']
const METRO: ZoneScolaire[] = ['A', 'B', 'C']
const ALL: ZoneScolaire[] = [...DOM, ...METRO]

export const SCHOOL_HOLIDAYS: SchoolHoliday[] = [
  // 2025-2026
  { nom: 'Vacances de la Toussaint', start: '2025-10-18', end: '2025-11-03', zones: ALL },
  { nom: 'Vacances de Noël', start: '2025-12-20', end: '2026-01-05', zones: ALL },
  { nom: 'Vacances de Carnaval', start: '2026-02-07', end: '2026-02-23', zones: DOM },
  { nom: "Vacances d'hiver", start: '2026-02-07', end: '2026-02-23', zones: ['A'] },
  { nom: "Vacances d'hiver", start: '2026-02-14', end: '2026-03-02', zones: ['B'] },
  { nom: "Vacances d'hiver", start: '2026-02-21', end: '2026-03-09', zones: ['C'] },
  { nom: 'Vacances de Pâques', start: '2026-04-01', end: '2026-04-16', zones: ['guyane'] },
  { nom: 'Vacances de Pâques', start: '2026-04-02', end: '2026-04-20', zones: ['martinique', 'guadeloupe'] },
  { nom: 'Vacances de printemps', start: '2026-04-04', end: '2026-04-20', zones: ['A'] },
  { nom: 'Vacances de printemps', start: '2026-04-11', end: '2026-04-27', zones: ['B'] },
  { nom: 'Vacances de printemps', start: '2026-04-18', end: '2026-05-04', zones: ['C'] },
  { nom: "Vacances d'été 2026", start: '2026-07-04', end: '2026-09-01', zones: ALL },
  // 2026-2027
  { nom: 'Vacances de la Toussaint', start: '2026-10-17', end: '2026-11-03', zones: ['guyane', 'guadeloupe'] },
  { nom: 'Vacances de la Toussaint', start: '2026-10-20', end: '2026-11-03', zones: ['martinique'] },
  { nom: 'Vacances de la Toussaint', start: '2026-10-17', end: '2026-11-02', zones: METRO },
  { nom: 'Vacances de Noël', start: '2026-12-19', end: '2027-01-04', zones: ALL },
  { nom: 'Vacances de Carnaval', start: '2027-02-06', end: '2027-02-18', zones: ['guyane'] },
  { nom: 'Vacances de Carnaval', start: '2027-02-06', end: '2027-02-22', zones: ['martinique', 'guadeloupe'] },
  { nom: "Vacances d'hiver", start: '2027-02-06', end: '2027-02-22', zones: ['C'] },
  { nom: "Vacances d'hiver", start: '2027-02-13', end: '2027-03-01', zones: ['A'] },
  { nom: "Vacances d'hiver", start: '2027-02-20', end: '2027-03-08', zones: ['B'] },
  { nom: 'Vacances de Pâques', start: '2027-03-25', end: '2027-04-12', zones: ['guyane', 'guadeloupe'] },
  { nom: 'Vacances de Pâques', start: '2027-03-24', end: '2027-04-01', zones: ['martinique'] },
  { nom: 'Vacances de printemps', start: '2027-04-03', end: '2027-04-19', zones: ['C'] },
  { nom: 'Vacances de printemps', start: '2027-04-10', end: '2027-04-26', zones: ['A'] },
  { nom: 'Vacances de printemps', start: '2027-04-17', end: '2027-05-03', zones: ['B'] },
  { nom: "Vacances d'été 2027", start: '2027-07-03', end: '2027-09-02', zones: METRO },
]

/** Zone enregistrée : valeur connue, sinon zone par défaut (anciennes données, saisie invalide). */
export function normalizeZone(v: unknown): ZoneScolaire {
  return ZONE_OPTIONS.some((z) => z.value === v) ? (v as ZoneScolaire) : DEFAULT_ZONE
}

/** Aide affichée sous le choix de zone : période couverte par les dates officielles. */
export function zoneCalendarNote(zone: ZoneScolaire): string {
  const until = ZONE_CALENDAR_UNTIL[zone]
  const [y, m, d] = until.split('-').map(Number)
  const label = new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  const summer = SCHOOL_HOLIDAYS.some((h) => h.zones.includes(zone) && h.start.startsWith('2027-07'))
  return summer
    ? `Calendrier officiel de l’Éducation nationale, années 2025-2026 et 2026-2027 (jusqu’au ${label}).`
    : `Calendrier officiel de l’Éducation nationale jusqu’au ${label}. Vacances d’été 2027 : dates à confirmer, pas encore publiées.`
}

// --- Repère temporel local ----------------------------------------------------

const DAY = 1440
const MS_DAY = 86_400_000

const mod = (a: number, n: number) => ((a % n) + n) % n
export const otherParent = (p: Parent): Parent => (p === 'moi' ? 'autre' : 'moi')

/** Numéro de jour civil (jours depuis le 1er janvier 1970). */
function dayNumber(y: number, m: number, d: number): number {
  return Math.round(Date.UTC(y, m, d) / MS_DAY)
}

function dayOfDate(date: Date): number {
  return dayNumber(date.getFullYear(), date.getMonth(), date.getDate())
}

function isoToDay(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return dayNumber(y, (m ?? 1) - 1, d ?? 1)
}

/** 0 = dimanche … 6 = samedi (le 1er janvier 1970 était un jeudi). */
function weekdayOf(dn: number): number {
  return mod(dn + 4, 7)
}

function firstOnOrAfter(dn: number, weekday: number): number {
  return dn + mod(weekday - weekdayOf(dn), 7)
}

export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  const v = (h || 0) * 60 + (m || 0)
  return Number.isFinite(v) ? Math.min(Math.max(v, 0), DAY - 1) : 18 * 60
}

export function toLocalMinutes(date: Date): number {
  return dayOfDate(date) * DAY + date.getHours() * 60 + date.getMinutes()
}

export function fromLocalMinutes(t: number): Date {
  const dn = Math.floor(t / DAY)
  const min = t - dn * DAY
  const u = new Date(dn * MS_DAY)
  return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate(), Math.floor(min / 60), min % 60)
}

export function toIsoDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// --- Rythme habituel (hors vacances) -----------------------------------------

function regularCustody(c: GardeConfig, t: number): Parent {
  const hm = timeToMinutes(c.handoverTime)
  const start = isoToDay(c.startDate)
  const first = c.firstParent

  switch (c.rythme) {
    case 'alternee': {
      // Échange tous les 7 jours au jour et à l'heure choisis ; cycle de 14 jours.
      const anchor = firstOnOrAfter(start, c.handoverWeekday) * DAY + hm
      const k = Math.floor((t - anchor) / (7 * DAY))
      return mod(k, 2) === 0 ? first : otherParent(first)
    }
    case '2-2-3': {
      // Cycle de 14 jours ancré sur un lundi : blocs de 2, 2, 3, 2, 2, 3 jours,
      // en alternant les parents (lun-mar A, mer-jeu B, ven-dim A, puis l'inverse).
      const anchor = firstOnOrAfter(start, 1) * DAY + hm
      const dayOff = Math.floor(mod(t - anchor, 14 * DAY) / DAY)
      const bounds = [2, 4, 7, 9, 11, 14]
      const segment = bounds.findIndex((b) => dayOff < b)
      return segment % 2 === 0 ? first : otherParent(first)
    }
    case 'weekends': {
      // Parent « accueil » (firstParent) : du vendredi (heure d'échange) au dimanche (heure d'échange),
      // un week-end sur deux ou tous ; et chaque mercredi de 9h à 18h. Résidence habituelle sinon.
      const visit = first
      const home = otherParent(first)
      const dn = Math.floor(t / DAY)
      const m = t - dn * DAY
      const wd = weekdayOf(dn)
      const friday = dn - mod(wd - 5, 7)
      const wStart = friday * DAY + hm
      const wEnd = (friday + 2) * DAY + hm
      if (t >= wStart && t < wEnd) {
        if (!c.weekendsAlternes) return visit
        const k = Math.round((friday - firstOnOrAfter(start, 5)) / 7)
        return mod(k, 2) === 0 ? visit : home
      }
      if (wd === 3 && m >= WEDNESDAY_START && m < WEDNESDAY_END) return visit
      return home
    }
    case 'personnalise': {
      // Le jour coché appartient à son parent à partir de l'heure d'échange.
      const anchorDay = firstOnOrAfter(start, 1)
      const dn = Math.floor(t / DAY)
      const m = t - dn * DAY
      const effective = m >= hm ? dn : dn - 1
      return customOwner(c, effective, anchorDay)
    }
  }
}

function customOwner(c: GardeConfig, dn: number, anchorDay: number): Parent {
  const pattern = c.customPattern.length === 14 ? c.customPattern : Array(14).fill(true)
  return pattern[mod(dn - anchorDay, 14)] ? 'moi' : 'autre'
}

// --- Vacances : moitié / moitié, alternance années paires / impaires ---------

type HolidayWindow = { start: number; mid: number; end: number; firstHalf: Parent; nom: string }

/** Fenêtre : du vendredi précédent (sortie des classes) à la veille de la reprise, à l'heure d'échange. */
function holidayWindowAt(c: GardeConfig, t: number): HolidayWindow | null {
  if (!c.vacances.moitie) return null
  const hm = timeToMinutes(c.handoverTime)
  for (const h of SCHOOL_HOLIDAYS) {
    if (!h.zones.includes(c.vacances.zone)) continue
    const start = (isoToDay(h.start) - 1) * DAY + hm
    const end = (isoToDay(h.end) - 1) * DAY + hm
    if (t < start || t >= end) continue
    const days = Math.round((end - start) / DAY)
    const mid = start + Math.floor(days / 2) * DAY
    const year = Number(h.start.slice(0, 4))
    const p = c.vacances.premiereMoitieAnneesPaires
    return { start, mid, end, firstHalf: year % 2 === 0 ? p : otherParent(p), nom: h.nom }
  }
  return null
}

function custodyAt(c: GardeConfig, t: number): Parent {
  const w = holidayWindowAt(c, t)
  if (w) return t < w.mid ? w.firstHalf : otherParent(w.firstHalf)
  return regularCustody(c, t)
}

/** Nom des vacances scolaires en cours à cette date (si l'option est activée). */
export function holidayAt(c: GardeConfig, date: Date): string | null {
  return holidayWindowAt(c, toLocalMinutes(date))?.nom ?? null
}

// --- API publique -------------------------------------------------------------

/** Avec qui sont les enfants à cet instant précis. */
export function computeCustody(config: GardeConfig, date: Date): Parent {
  return custodyAt(config, toLocalMinutes(date))
}

/**
 * Teinte d'une journée dans le calendrier : parent chez qui les enfants passent la majeure
 * partie de la journée (échantillon horaire de 8h à 20h, 13 points, pas d'égalité possible).
 * Exception : en rythme personnalisé hors vacances, le jour coché fait foi.
 */
export function custodyOfDay(config: GardeConfig, day: Date): Parent {
  const dn = dayOfDate(day)
  if (config.rythme === 'personnalise' && !holidayWindowAt(config, dn * DAY + 12 * 60)) {
    return customOwner(config, dn, firstOnOrAfter(isoToDay(config.startDate), 1))
  }
  let moi = 0
  for (let h = 8; h <= 20; h++) if (custodyAt(config, dn * DAY + h * 60) === 'moi') moi++
  return moi >= 7 ? 'moi' : 'autre'
}

/** Minutes de la journée où un échange peut avoir lieu. Tout changement de garde tombe sur l'une d'elles. */
function candidateMinutes(c: GardeConfig): number[] {
  const set = new Set([timeToMinutes(c.handoverTime)])
  if (c.rythme === 'weekends') {
    set.add(WEDNESDAY_START)
    set.add(WEDNESDAY_END)
  }
  return [...set].sort((a, b) => a - b)
}

/** Échanges strictement après `from` et au plus tard à `to`. */
export function handoversBetween(config: GardeConfig, from: Date, to: Date): Handover[] {
  const fromT = toLocalMinutes(from)
  const toT = toLocalMinutes(to)
  const mins = candidateMinutes(config)
  const out: Handover[] = []
  const firstDay = Math.floor(fromT / DAY)
  const lastDay = Math.min(Math.floor(toT / DAY), firstDay + 400)
  for (let dn = firstDay; dn <= lastDay; dn++) {
    for (const m of mins) {
      const t = dn * DAY + m
      if (t <= fromT || t > toT) continue
      const before = custodyAt(config, t - 1)
      const after = custodyAt(config, t)
      if (before !== after) out.push({ date: fromLocalMinutes(t), from: before, to: after })
    }
  }
  return out
}

/** Prochain échange après `from` (recherche sur 60 jours). */
export function nextHandover(config: GardeConfig, from: Date): Handover | null {
  const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 60, 23, 59)
  return handoversBetween(config, from, to)[0] ?? null
}

/** Échanges ayant lieu pendant la journée `day`. */
export function handoversOnDay(config: GardeConfig, day: Date): Handover[] {
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0)
  const end = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59)
  // `from` est exclusif : on part de la minute précédant minuit.
  return handoversBetween(config, new Date(start.getTime() - 60_000), end)
}

// --- Configuration par défaut (démo) ---------------------------------------------

/**
 * Démo : semaine alternée, échange le vendredi à 18h à l'école. Ancrée sur le vendredi le plus
 * récent pour que, la semaine en cours, les enfants soient avec vous jusqu'au prochain vendredi.
 */
export function defaultGardeConfig(today: Date): GardeConfig {
  const dn = dayOfDate(today)
  const lastFriday = dn - mod(weekdayOf(dn) - 5, 7)
  return {
    rythme: 'alternee',
    startDate: toIsoDay(fromLocalMinutes(lastFriday * DAY)),
    firstParent: 'moi',
    handoverWeekday: 5,
    handoverTime: '18:00',
    lieu: 'ecole',
    customPattern: [true, true, false, false, true, true, true, false, false, true, true, false, false, false],
    weekendsAlternes: true,
    vacances: { moitie: false, zone: DEFAULT_ZONE, premiereMoitieAnneesPaires: 'moi' },
  }
}

// --- Formatage ------------------------------------------------------------------

export function fmtHour(date: Date): string {
  const h = date.getHours()
  const m = date.getMinutes()
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`
}

/** « vendredi 30 octobre à 18h » */
export function fmtHandoverDate(date: Date): string {
  const d = date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  return `${d} à ${fmtHour(date)}`
}

// --- Export iCalendar (.ics) ------------------------------------------------------

function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** Pliage RFC 5545 : lignes de 75 octets max, continuation par un espace. */
function icsFold(line: string): string {
  const enc = new TextEncoder()
  const parts: string[] = []
  let current = ''
  let bytes = 0
  for (const ch of line) {
    const b = enc.encode(ch).length
    const limit = parts.length === 0 ? 75 : 74
    if (bytes + b > limit) {
      parts.push(current)
      current = ''
      bytes = 0
    }
    current += ch
    bytes += b
  }
  parts.push(current)
  return parts.join('\r\n ')
}

const pad = (n: number) => String(n).padStart(2, '0')
/** Heure locale « flottante » : interprétée dans le fuseau de l'agenda de l'utilisateur. */
function icsLocal(d: Date): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`
}
function icsUtc(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
}

export function buildHandoversIcs(config: GardeConfig, handovers: Handover[], now: Date, names: GardeNames = NEUTRAL_GARDE_NAMES): string {
  const lieu = lieuLabel(config, names)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Lien Parental//Planning de garde//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Planning de garde',
  ]
  for (const h of handovers) {
    const end = new Date(h.date.getTime() + 30 * 60_000)
    const dest = h.to === 'moi' ? 'chez vous' : `chez ${names.coParent}`
    lines.push(
      'BEGIN:VEVENT',
      `UID:garde-${icsLocal(h.date)}@lien-parental.fr`,
      `DTSTAMP:${icsUtc(now)}`,
      `DTSTART:${icsLocal(h.date)}`,
      `DTEND:${icsLocal(end)}`,
      `SUMMARY:${icsEscape(`Échange de garde : ${names.children} ${dest}`)}`,
      `LOCATION:${icsEscape(lieu)}`,
      `DESCRIPTION:${icsEscape(`${capitalize(names.children)} ${childrenVerb(names, 'vont', 'va')} ${dest}. Rythme : ${RYTHME_LABELS[config.rythme]}.`)}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:Échange de garde dans 1 heure',
      'TRIGGER:-PT1H',
      'END:VALARM',
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.map(icsFold).join('\r\n') + '\r\n'
}

/*
 * Auto-vérification (exemples calculés à la main, heure d'échange 18:00) :
 *
 * alternee, startDate 2026-10-23 (vendredi), firstParent 'moi', handoverWeekday 5 :
 *   computeCustody(c, 2026-10-26 12:00) === 'moi'     (k = 0)
 *   computeCustody(c, 2026-10-30 17:59) === 'moi'
 *   computeCustody(c, 2026-10-30 18:00) === 'autre'   (k = 1)
 *   computeCustody(c, 2026-11-06 18:00) === 'moi'     (k = 2)
 *   computeCustody(c, 2026-10-23 17:00) === 'autre'   (k = -1, extrapolation avant le début)
 *   nextHandover(c, 2026-10-26 09:00) → 2026-10-30 18:00, moi → autre
 *
 * 2-2-3, startDate 2026-10-26 (lundi), firstParent 'moi' :
 *   lun 26 / mar 27 (après 18h lundi) → moi ; mer 28 18h → autre ; ven 30 18h → moi ;
 *   lun 2 nov 18h → autre ; mer 4 → moi ; ven 6 → autre ; lun 9 → moi (nouveau cycle).
 *   Soit 6 échanges par cycle de 14 jours, toujours un lundi, un mercredi ou un vendredi.
 *
 * weekends, startDate 2026-10-26, firstParent 'autre' (l'autre parent accueille), weekendsAlternes :
 *   1er week-end : ven 30 oct 18h → dim 1er nov 18h chez l'autre parent ; ven 6 nov → chez vous ;
 *   mer 28 oct 9h-18h chez l'autre parent, chaque semaine ; custodyOfDay(mer 28) === 'autre'.
 *
 * vacances (zone guyane, premiereMoitieAnneesPaires 'moi'), Toussaint 2026 (17 oct → reprise mar 3 nov) :
 *   fenêtre ven 16 oct 18h → lun 2 nov 18h (17 jours), milieu sam 24 oct 18h ;
 *   2026 est paire → première moitié chez vous, seconde chez l'autre parent.
 *   Zone C (reprise lun 2 nov) : fenêtre ven 16 oct 18h → dim 1er nov 18h (16 jours).
 */
