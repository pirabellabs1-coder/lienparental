export type Category = { id: string; name: string; icon: string; color: 'night'|'leaf'|'iris'|'gold'|'alert'; count: number }
export type VaultDoc = {
  id: string; name: string; mime: 'pdf'|'jpg'|'png'|'docx'; size: number; createdAt: string;
  categoryId: string; confidentialite: 'prive'|'partage'; source: 'scan'|'photo'|'import'|'drive'
}

export const CATEGORIES: Category[] = [
  { id: 'jaf',       name: 'Dossier JAF',  icon: 'Scale',    color: 'night', count: 12 },
  { id: 'scolarite', name: 'Scolarité',    icon: 'GraduationCap', color: 'leaf', count: 6 },
  { id: 'sante',     name: 'Santé',        icon: 'HeartPulse', color: 'alert', count: 4 },
  { id: 'finances',  name: 'Finances',     icon: 'Wallet',   color: 'gold', count: 3 },
  { id: 'courriers', name: 'Courriers',    icon: 'Mail',     color: 'iris', count: 8 },
  { id: 'autres',    name: 'Autres',       icon: 'Folder',   color: 'night', count: 2 },
]

export const DOCS: VaultDoc[] = [
  { id: 'd1', name: 'Jugement JAF 2024-03.pdf', mime: 'pdf',  size: 1_245_000, createdAt: '2026-10-18T10:12:00Z', categoryId: 'jaf',       confidentialite: 'prive', source: 'import' },
  { id: 'd2', name: 'Bulletin scolaire T1.pdf',  mime: 'pdf',  size: 620_000,   createdAt: '2026-10-14T08:45:00Z', categoryId: 'scolarite', confidentialite: 'prive', source: 'scan' },
  { id: 'd3', name: 'Carnet santé p.12.jpg',    mime: 'jpg',  size: 2_300_000, createdAt: '2026-10-10T19:30:00Z', categoryId: 'sante',     confidentialite: 'prive', source: 'photo' },
  { id: 'd4', name: 'Attestation hébergement.docx', mime:'docx', size: 48_000,  createdAt: '2026-10-05T15:00:00Z', categoryId: 'courriers', confidentialite: 'prive', source: 'import' },
  { id: 'd5', name: 'Facture cantine.pdf',      mime: 'pdf',  size: 180_000,   createdAt: '2026-09-28T12:00:00Z', categoryId: 'finances',  confidentialite: 'prive', source: 'drive' },
]

export function fmtSize(b: number) {
  if (b < 1024) return `${b} o`
  if (b < 1_048_576) return `${(b/1024).toFixed(1)} Ko`
  return `${(b/1_048_576).toFixed(1)} Mo`
}
export function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric' })
}

/* ===========================================================================
 * Coffre-fort v2 — données calées sur les maquettes (documents, catégories,
 * demandes de témoignage, témoignages reçus, modèles prêts à l'emploi).
 * Les exports ci-dessus sont conservés pour compatibilité.
 * ========================================================================= */

/** Couleurs de catégories telles que dessinées sur les maquettes. */
export type VaultTone = 'violet' | 'blue' | 'green' | 'orange' | 'pink' | 'gray' | 'red'
/** Icônes disponibles pour les catégories (dont le sélecteur « Nouvelle catégorie »). */
export type VaultIconKey =
  | 'calendar' | 'badge' | 'health' | 'wallet' | 'mail' | 'shapes'
  | 'folder' | 'file' | 'heart' | 'bank' | 'lock'

export type VaultCategory = {
  id: string
  name: string
  icon: VaultIconKey
  tone: VaultTone
  count: number
  description?: string
  visibleInFilters: boolean
}

export const VAULT_CATEGORIES: VaultCategory[] = [
  { id: 'jaf',       name: 'Dossier JAF', icon: 'calendar', tone: 'violet', count: 12, visibleInFilters: true },
  { id: 'scolarite', name: 'Scolarité',   icon: 'badge',    tone: 'blue',   count: 6,  visibleInFilters: true },
  { id: 'sante',     name: 'Santé',       icon: 'health',   tone: 'green',  count: 5,  visibleInFilters: true },
  { id: 'finances',  name: 'Finances',    icon: 'wallet',   tone: 'orange', count: 4,  visibleInFilters: true },
  { id: 'courriers', name: 'Courriers',   icon: 'mail',     tone: 'orange', count: 3,  visibleInFilters: true },
  { id: 'autres',    name: 'Autres',      icon: 'shapes',   tone: 'blue',   count: 2,  visibleInFilters: true },
]

export type VaultFileType = 'pdf' | 'image' | 'word' | 'autre'

export type VaultDocument = {
  id: string
  name: string
  type: VaultFileType
  /** Extension affichée (PDF, JPG, DOCX…). */
  ext: string
  size: number
  /** Date du document (YYYY-MM-DD). */
  docDate: string
  /** Ajout dans le coffre (YYYY-MM-DD) + heure (HH:mm). */
  addedAt: string
  addedTime: string
  categoryId: string
  tone: VaultTone
  source: string
  description?: string
  confidentialite: 'prive' | 'partage'
  /** Enfants concernés (documents.children_ids). */
  childIds?: string[]
  /** Famille (0340) : document explicitement partagé avec les adultes liés. */
  familyShared?: boolean
  /** Document d'un AUTRE adulte lié : lecture et téléchargement seulement. */
  sharedBy?: { prenom: string }
}

export const VAULT_DOCS: VaultDocument[] = [
  { id: 'v1', name: 'Jugement du 12 mai 2024', type: 'pdf', ext: 'PDF', size: 1_258_291, docDate: '2024-05-12', addedAt: '2024-05-12', addedTime: '16:30', categoryId: 'jaf', tone: 'red', source: 'Tribunal judiciaire de Cayenne', description: 'Jugement rendu le 12 mai 2024 concernant la résidence de l’enfant.', confidentialite: 'prive' },
  { id: 'v2', name: 'Carnet de santé', type: 'pdf', ext: 'PDF', size: 2_516_582, docDate: '2024-05-10', addedAt: '2024-05-10', addedTime: '09:12', categoryId: 'sante', tone: 'green', source: 'Pédiatre — Dr Martin', description: 'Pages vaccinations et suivi de croissance.', confidentialite: 'prive', childIds: ['c_1'] },
  { id: 'v3', name: 'Attestation de scolarité', type: 'pdf', ext: 'PDF', size: 614_400, docDate: '2024-05-08', addedAt: '2024-05-08', addedTime: '18:05', categoryId: 'scolarite', tone: 'blue', source: 'École élémentaire Les Palmistes', confidentialite: 'prive' },
  { id: 'v4', name: 'Courrier à l’autre parent', type: 'pdf', ext: 'PDF', size: 1_153_434, docDate: '2024-05-05', addedAt: '2024-05-05', addedTime: '20:41', categoryId: 'courriers', tone: 'orange', source: 'Rédigé par moi', description: 'Proposition d’organisation des vacances d’été.', confidentialite: 'prive' },
  { id: 'v5', name: 'Courrier CAF', type: 'pdf', ext: 'PDF', size: 1_572_864, docDate: '2024-05-05', addedAt: '2024-05-06', addedTime: '11:20', categoryId: 'finances', tone: 'blue', source: 'CAF de Guyane', confidentialite: 'prive' },
  { id: 'v6', name: 'Bulletin du 2e trimestre', type: 'image', ext: 'JPG', size: 845_000, docDate: '2024-04-02', addedAt: '2024-04-03', addedTime: '08:47', categoryId: 'scolarite', tone: 'blue', source: 'École élémentaire Les Palmistes', confidentialite: 'prive' },
  { id: 'v7', name: 'Tableau des frais partagés', type: 'word', ext: 'DOCX', size: 48_000, docDate: '2024-03-28', addedAt: '2024-03-28', addedTime: '21:10', categoryId: 'finances', tone: 'orange', source: 'Rédigé par moi', confidentialite: 'partage' },
  { id: 'v8', name: 'Ordonnance Cétirizine', type: 'image', ext: 'JPG', size: 412_000, docDate: '2026-09-01', addedAt: '2026-09-01', addedTime: '18:22', categoryId: 'sante', tone: 'green', source: 'Médecin / professionnel de santé', description: 'Traitement de l’allergie au pollen, à renouveler fin novembre.', confidentialite: 'prive', childIds: ['c_1'] },
]

export const VAULT_SOURCES = [
  'Tribunal judiciaire de Cayenne',
  'Avocat',
  'École / établissement scolaire',
  'Médecin / professionnel de santé',
  'CAF',
  'Autre parent',
  'Rédigé par moi',
  'Autre',
] as const

const MONTHS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

/** Formatage déterministe (identique serveur / client) d'une date YYYY-MM-DD. */
export function frDate(ymd: string, style: 'long' | 'short' = 'long') {
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return ymd
  const month = (style === 'long' ? MONTHS_LONG : MONTHS_SHORT)[m - 1]
  return `${d} ${month} ${y}`
}
/** 12/05/2024 */
export function frNumericDate(ymd: string) {
  const [y, m, d] = ymd.split('-')
  return d && m && y ? `${d}/${m}/${y}` : ymd
}
/** « 1,2 Mo » — virgule décimale à la française. */
export function frSize(bytes: number) {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1_048_576) return `${Math.round(bytes / 1024)} Ko`
  return `${(bytes / 1_048_576).toFixed(1).replace('.', ',')} Mo`
}

export function getVaultDoc(id: string) {
  return VAULT_DOCS.find((d) => d.id === id)
}
export function getVaultCategory(id: string) {
  return VAULT_CATEGORIES.find((c) => c.id === id)
}

/* ----- Demandes de témoignage ------------------------------------------ */

/** envoi = en attente d'envoi par le témoin ; recu = témoignage reçu. */
export type WitnessStatus = 'envoi' | 'recu'

export type Witness = {
  n: number
  name?: string
  status: WitnessStatus
  invitedAt: string
  invitedTime: string
  receivedAt?: string
  receivedTime?: string
  pages?: number
}

export type TestimonyRequest = {
  id: string
  token: string
  subject: string
  icon: 'users' | 'hourglass' | 'clipboard' | 'check'
  tone: VaultTone
  createdAt: string
  finishedAt?: string
  status: 'attente' | 'termine'
  deadline?: string
  autoReminder: boolean
  context?: string
  parents: string[]
  enfants: string[]
  witnesses: Witness[]
}

export const TESTIMONY_REQUESTS: TestimonyRequest[] = [
  {
    id: 'r1', token: 'AB7XkL', subject: 'Procédure JAF', icon: 'users', tone: 'violet',
    createdAt: '2024-05-12', status: 'attente', autoReminder: true,
    context: 'Audience devant le juge aux affaires familiales.',
    parents: ['Julie Martin', 'Thomas Martin'], enfants: ['Lina Martin', 'Noah Martin'],
    witnesses: [
      { n: 1, status: 'envoi', invitedAt: '2024-05-12', invitedTime: '14:32' },
      { n: 2, status: 'envoi', invitedAt: '2024-05-12', invitedTime: '14:35' },
      { n: 3, status: 'envoi', invitedAt: '2024-05-12', invitedTime: '14:40' },
    ],
  },
  {
    id: 'r2', token: 'XyZ9pQ', subject: 'Scolarité', icon: 'hourglass', tone: 'green',
    createdAt: '2024-05-05', status: 'attente', autoReminder: true, deadline: '2024-06-01',
    parents: ['Julie Martin'], enfants: ['Lina Martin'],
    witnesses: [
      { n: 1, name: 'Sophie D.', status: 'recu', invitedAt: '2024-05-05', invitedTime: '10:02', receivedAt: '2024-05-07', receivedTime: '18:22', pages: 2 },
      { n: 2, status: 'envoi', invitedAt: '2024-05-05', invitedTime: '10:04' },
    ],
  },
  {
    id: 'r3', token: 'LmN8kR', subject: 'Relations familiales', icon: 'clipboard', tone: 'orange',
    createdAt: '2024-04-28', status: 'attente', autoReminder: false,
    parents: ['Julie Martin', 'Thomas Martin'], enfants: ['Noah Martin'],
    witnesses: [
      { n: 1, name: 'Sophie D.', status: 'recu', invitedAt: '2024-04-28', invitedTime: '09:00', receivedAt: '2024-05-12', receivedTime: '14:32', pages: 2 },
      { n: 2, name: 'Marc L.', status: 'recu', invitedAt: '2024-04-28', invitedTime: '09:01', receivedAt: '2024-05-12', receivedTime: '16:45', pages: 2 },
      { n: 3, name: 'Julie R.', status: 'recu', invitedAt: '2024-04-28', invitedTime: '09:03', receivedAt: '2024-05-13', receivedTime: '09:18', pages: 1 },
      { n: 4, status: 'envoi', invitedAt: '2024-04-28', invitedTime: '09:05' },
    ],
  },
  {
    id: 'r4', token: 'QwE7rT', subject: 'Garde alternée', icon: 'check', tone: 'green',
    createdAt: '2024-05-01', finishedAt: '2024-05-06', status: 'termine', autoReminder: true,
    parents: ['Julie Martin', 'Thomas Martin'], enfants: ['Lina Martin'],
    witnesses: [
      { n: 1, name: 'Marc L.', status: 'recu', invitedAt: '2024-05-01', invitedTime: '12:00', receivedAt: '2024-05-05', receivedTime: '10:32', pages: 3 },
      { n: 2, name: 'Julie R.', status: 'recu', invitedAt: '2024-05-01', invitedTime: '12:02', receivedAt: '2024-05-06', receivedTime: '16:45', pages: 2 },
    ],
  },
  {
    id: 'r5', token: 'PoL3mN', subject: 'Résidence enfant', icon: 'check', tone: 'green',
    createdAt: '2024-04-20', finishedAt: '2024-04-25', status: 'termine', autoReminder: false,
    parents: ['Julie Martin'], enfants: ['Lina Martin', 'Noah Martin'],
    witnesses: [
      { n: 1, name: 'Paul B.', status: 'recu', invitedAt: '2024-04-20', invitedTime: '08:30', receivedAt: '2024-04-21', receivedTime: '19:02', pages: 2 },
      { n: 2, name: 'Nadia K.', status: 'recu', invitedAt: '2024-04-20', invitedTime: '08:31', receivedAt: '2024-04-22', receivedTime: '12:40', pages: 1 },
      { n: 3, name: 'Hélène T.', status: 'recu', invitedAt: '2024-04-20', invitedTime: '08:33', receivedAt: '2024-04-24', receivedTime: '09:15', pages: 3 },
      { n: 4, name: 'Karim S.', status: 'recu', invitedAt: '2024-04-20', invitedTime: '08:35', receivedAt: '2024-04-25', receivedTime: '11:20', pages: 2 },
    ],
  },
]

export const TESTIMONY_LINK_BASE = 'lienparental.fr/t/'

export function getTestimonyRequest(id: string) {
  return TESTIMONY_REQUESTS.find((r) => r.id === id)
}
export function receivedCount(r: TestimonyRequest) {
  return r.witnesses.filter((w) => w.status === 'recu').length
}

/* ----- Témoignages reçus en attente de confirmation --------------------- */

export type ReceivedTestimony = {
  id: string
  requestId: string
  author: string
  initials: string
  tone: VaultTone
  receivedAt: string
  receivedTime: string
  relation: string
  knownSince: string
  summary: string
  facts: string[]
}

export const RECEIVED_TESTIMONIES: ReceivedTestimony[] = [
  {
    id: 't1', requestId: 'r3', author: 'Sophie D.', initials: 'SD', tone: 'green',
    receivedAt: '2024-05-12', receivedTime: '14:32',
    relation: 'Enseignante de Lina (CE1)', knownSince: 'Depuis 2 ans',
    summary: 'Sophie témoigne des difficultés rencontrées lors des échanges concernant la scolarité de l’enfant, ainsi que du comportement désagréable du parent lors de certaines remises. L’enfant lui a confié se sentir stressé avant ces rencontres.',
    facts: [
      'Le 4 mars 2024, à la sortie de classe, échange tendu entre les parents devant les élèves.',
      'Lina a exprimé à plusieurs reprises son inquiétude avant les week-ends de transition.',
      'Les documents scolaires ne sont pas toujours transmis aux deux parents.',
    ],
  },
  {
    id: 't2', requestId: 'r3', author: 'Marc L.', initials: 'ML', tone: 'violet',
    receivedAt: '2024-05-12', receivedTime: '16:45',
    relation: 'Voisin', knownSince: 'Depuis 5 ans',
    summary: 'Marc décrit l’implication quotidienne du parent dans les trajets scolaires et les activités du mercredi, ainsi que la relation apaisée observée avec l’enfant.',
    facts: [
      'Accompagnement quotidien de l’enfant à l’école entre septembre 2023 et avril 2024.',
      'Présence régulière aux entraînements de football le mercredi.',
    ],
  },
  {
    id: 't3', requestId: 'r3', author: 'Julie R.', initials: 'JR', tone: 'green',
    receivedAt: '2024-05-13', receivedTime: '09:18',
    relation: 'Amie de la famille', knownSince: 'Depuis 8 ans',
    summary: 'Julie rapporte plusieurs moments partagés lors des vacances scolaires et l’attention portée au rythme de l’enfant.',
    facts: [
      'Vacances de février 2024 passées ensemble : organisation sereine et adaptée à l’enfant.',
    ],
  },
]

export function getReceivedTestimony(id: string) {
  return RECEIVED_TESTIMONIES.find((t) => t.id === id)
}

/* ----- Documents prêts à l'emploi (modèles) ----------------------------- */

export type ModeleCategory = 'juridique' | 'communication' | 'scolaire' | 'autre'
export type ModelePdfTemplate = 'dossier-jaf' | 'lettre-ecole' | 'chronologie' | 'attestation-hebergement' | 'temoignage'

export type ModeleLetter = {
  recipient: string[]
  objet: string
  salutation: string
  paragraphs: string[]
  closing: string
}

export type Modele = {
  slug: string
  title: string
  kind: 'Modèle complet' | 'Modèle'
  category: ModeleCategory
  badge?: 'Populaire' | 'Nouveau'
  tone: VaultTone
  description: string
  updatedAt: string
  compatible: string
  pdfTemplate?: ModelePdfTemplate
  letter: ModeleLetter
  /** Pages annexes (titre + lignes). La page 1 est la lettre. */
  annexes: { title: string; lines: string[] }[]
}

export const MODELE_CATEGORIES: { id: ModeleCategory | 'tous'; label: string }[] = [
  { id: 'tous', label: 'Tous' },
  { id: 'juridique', label: 'Juridique' },
  { id: 'communication', label: 'Communication' },
  { id: 'scolaire', label: 'Scolaire' },
  { id: 'autre', label: 'Autre' },
]

const ANNEXE_PIECES = {
  title: 'Liste des pièces jointes',
  lines: [
    'Pièce n°1 — Copie du livret de famille',
    'Pièce n°2 — Justificatif de domicile de moins de 3 mois',
    'Pièce n°3 — Certificat de scolarité de l’enfant',
    'Pièce n°4 — Attestations de témoins (formulaire Cerfa n°11527*03)',
    'Pièce n°5 — Proposition de calendrier de résidence',
  ],
}

export const MODELES: Modele[] = [
  {
    slug: 'courrier-jaf-residence-alternee',
    title: 'Courrier au JAF - Demande de résidence alternée',
    kind: 'Modèle complet', category: 'juridique', badge: 'Populaire', tone: 'violet',
    description: 'Ce modèle vous aide à formuler une demande de résidence alternée devant le Juge aux Affaires Familiales.',
    updatedAt: '2024-05-20', compatible: 'Word, PDF, Canva', pdfTemplate: 'dossier-jaf',
    letter: {
      recipient: ['À l’attention du Juge aux Affaires Familiales', 'Tribunal Judiciaire de [Ville]'],
      objet: 'Demande de résidence alternée de notre enfant [Prénom Nom]',
      salutation: 'Madame, Monsieur le Juge,',
      paragraphs: [
        'Nous soussignés, [Votre prénom et nom], demeurant [Votre adresse complète], et [Prénom et nom de l’autre parent], demeurant [Adresse de l’autre parent], parents de [Prénom de l’enfant], né(e) le [Date de naissance], sollicitons par la présente la mise en place d’une résidence alternée.',
        'Cette demande est motivée par notre volonté commune de préserver l’équilibre affectif de notre enfant et de maintenir des liens étroits et réguliers avec chacun de ses parents.',
        'Nos domiciles respectifs sont situés à proximité de l’établissement scolaire de [Prénom de l’enfant], ce qui permet d’assurer la continuité de sa scolarité et de ses activités extrascolaires.',
        'Nous proposons une alternance hebdomadaire, du vendredi sortie des classes au vendredi suivant, ainsi qu’un partage par moitié des vacances scolaires.',
      ],
      closing: 'Nous vous prions d’agréer, Madame, Monsieur le Juge, l’expression de notre haute considération.',
    },
    annexes: [
      { title: 'Proposition de calendrier', lines: ['Semaines paires : résidence chez [Parent 1]', 'Semaines impaires : résidence chez [Parent 2]', 'Vacances scolaires : partage par moitié, alternance chaque année', 'Jours fériés : rattachés à la semaine en cours'] },
      ANNEXE_PIECES,
      { title: 'Signatures', lines: ['Fait à [Ville], le [Date]', 'Signature de [Parent 1]', 'Signature de [Parent 2]'] },
    ],
  },
  {
    slug: 'lettre-organisation-visites',
    title: 'Lettre à l’autre parent - Organisation des visites',
    kind: 'Modèle complet', category: 'communication', badge: 'Populaire', tone: 'green',
    description: 'Proposez une organisation claire et apaisée des visites et des transitions de l’enfant.',
    updatedAt: '2024-05-14', compatible: 'Word, PDF, Canva',
    letter: {
      recipient: ['À l’attention de [Prénom Nom de l’autre parent]', '[Adresse]'],
      objet: 'Organisation des visites de [Prénom de l’enfant]',
      salutation: '[Prénom],',
      paragraphs: [
        'Je souhaite que nous puissions convenir ensemble d’une organisation stable pour les visites de [Prénom de l’enfant] dans les semaines à venir.',
        'Je te propose que les transitions aient lieu le [jour] à [heure], à [lieu neutre], afin de limiter les trajets et de rassurer [Prénom].',
        'Je reste disponible pour en discuter et ajuster ce calendrier si besoin, dans l’intérêt de notre enfant.',
      ],
      closing: 'Bien cordialement,',
    },
    annexes: [{ title: 'Calendrier proposé', lines: ['Week-ends : 1er, 3e et 5e du mois', 'Mercredis : de 12h à 18h', 'Vacances : moitié de chaque période'] }],
  },
  {
    slug: 'attestation-hebergement',
    title: 'Attestation d’hébergement',
    kind: 'Modèle', category: 'autre', badge: 'Nouveau', tone: 'orange',
    description: 'Attestez sur l’honneur que vous hébergez une personne à votre domicile.',
    updatedAt: '2024-05-28', compatible: 'Word, PDF', pdfTemplate: 'attestation-hebergement',
    letter: {
      recipient: ['À qui de droit'],
      objet: 'Attestation d’hébergement',
      salutation: '',
      paragraphs: [
        'Je soussigné(e) [Prénom Nom], né(e) le [Date] à [Lieu], demeurant [Adresse complète], atteste sur l’honneur héberger à mon domicile [Prénom Nom de la personne hébergée] depuis le [Date].',
        'Cette attestation est établie pour servir et valoir ce que de droit.',
      ],
      closing: 'Fait à [Ville], le [Date]. Signature :',
    },
    annexes: [],
  },
  {
    slug: 'levee-secret-medical',
    title: 'Main levée sur le secret médical (Carnet de santé)',
    kind: 'Modèle', category: 'autre', tone: 'violet',
    description: 'Autorisez la transmission d’informations médicales concernant votre enfant à l’autre parent.',
    updatedAt: '2024-04-30', compatible: 'Word, PDF',
    letter: {
      recipient: ['À l’attention du Dr [Nom]', '[Adresse du cabinet]'],
      objet: 'Accès aux informations médicales de [Prénom de l’enfant]',
      salutation: 'Docteur,',
      paragraphs: [
        'En ma qualité de parent titulaire de l’autorité parentale, je vous autorise à communiquer à [Prénom Nom de l’autre parent] les informations relatives au suivi médical de [Prénom de l’enfant].',
      ],
      closing: 'Je vous prie d’agréer, Docteur, mes salutations distinguées.',
    },
    annexes: [],
  },
  {
    slug: 'demande-mediation-familiale',
    title: 'Demande de médiation familiale',
    kind: 'Modèle', category: 'juridique', tone: 'red',
    description: 'Sollicitez un service de médiation familiale pour renouer le dialogue autour de l’enfant.',
    updatedAt: '2024-04-18', compatible: 'Word, PDF, Canva',
    letter: {
      recipient: ['Service de médiation familiale', '[Adresse]'],
      objet: 'Demande de rendez-vous de médiation familiale',
      salutation: 'Madame, Monsieur,',
      paragraphs: [
        'Je souhaite engager une démarche de médiation familiale avec [Prénom Nom de l’autre parent] afin de trouver un accord durable concernant l’organisation de la vie de notre enfant.',
        'Je vous remercie de bien vouloir me proposer un premier entretien d’information.',
      ],
      closing: 'Veuillez agréer, Madame, Monsieur, mes salutations distinguées.',
    },
    annexes: [],
  },
  {
    slug: 'lettre-ecole',
    title: 'Lettre à l’établissement scolaire',
    kind: 'Modèle complet', category: 'scolaire', tone: 'blue',
    description: 'Informez l’école de la situation parentale et demandez la transmission des informations aux deux parents.',
    updatedAt: '2024-05-02', compatible: 'Word, PDF', pdfTemplate: 'lettre-ecole',
    letter: {
      recipient: ['À l’attention de la Direction', '[Nom de l’établissement]'],
      objet: 'Transmission des informations scolaires de [Prénom de l’enfant]',
      salutation: 'Madame, Monsieur,',
      paragraphs: [
        'Je vous informe que les parents de [Prénom de l’enfant], scolarisé(e) en classe de [Classe], sont séparés et exercent conjointement l’autorité parentale.',
        'Je vous remercie de bien vouloir adresser l’ensemble des informations scolaires aux deux parents, à leurs adresses respectives.',
      ],
      closing: 'Je vous prie d’agréer, Madame, Monsieur, mes salutations distinguées.',
    },
    annexes: [{ title: 'Coordonnées des parents', lines: ['Parent 1 : [Nom, adresse, téléphone, e-mail]', 'Parent 2 : [Nom, adresse, téléphone, e-mail]'] }],
  },
  {
    slug: 'chronologie-faits',
    title: 'Chronologie des faits',
    kind: 'Modèle complet', category: 'juridique', tone: 'violet',
    description: 'Reconstituez les faits datés et sourcés pour votre avocat ou le juge.',
    updatedAt: '2024-05-10', compatible: 'Word, PDF', pdfTemplate: 'chronologie',
    letter: {
      recipient: ['Pièce à l’attention de Maître [Nom]'],
      objet: 'Chronologie des faits concernant [Prénom de l’enfant]',
      salutation: '',
      paragraphs: [
        '[Date] — [Description factuelle de l’événement]. Source : [pièce, témoin, message].',
        '[Date] — [Description factuelle de l’événement]. Source : [pièce, témoin, message].',
        '[Date] — [Description factuelle de l’événement]. Source : [pièce, témoin, message].',
      ],
      closing: 'Document établi le [Date] par [Prénom Nom].',
    },
    annexes: [ANNEXE_PIECES],
  },
]

/** Identifiants historiques du tableau de bord → slug du modèle. */
const MODELE_ALIASES: Record<string, string> = {
  m_1: 'courrier-jaf-residence-alternee',
  m_2: 'lettre-ecole',
  m_3: 'chronologie-faits',
  m_4: 'attestation-hebergement',
  'dossier-jaf': 'courrier-jaf-residence-alternee',
  chronologie: 'chronologie-faits',
}

export function getModele(slugOrAlias: string) {
  const slug = MODELE_ALIASES[slugOrAlias] ?? slugOrAlias
  return MODELES.find((m) => m.slug === slug)
}
export function modelePages(m: Modele) {
  return 1 + m.annexes.length
}
export function modeleCategoryLabel(c: ModeleCategory) {
  return MODELE_CATEGORIES.find((x) => x.id === c)?.label ?? c
}
