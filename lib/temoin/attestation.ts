/**
 * Attestation de témoin (art. 202 du Code de procédure civile) — gabarit unique.
 *
 * - En français (`fr`) : texte JURIDIQUE enregistré et produit devant le juge français
 *   (même formulation qu'avant pour les faits : `compileFacts`).
 * - En anglais / portugais : TRADUCTION DE LECTURE générée par le même gabarit, affichée au
 *   témoin pour qu'il sache ce qu'il certifie. Elle n'est jamais enregistrée ni produite.
 *
 * Les réponses sont saisies sous forme de CLÉS (linkAdult.friend…) et rendues ici dans la
 * langue demandée. Module pur (aucune dépendance React) : testé par tests/temoin-attestation.test.ts.
 */

export const WITNESS_LOCALES = ['fr', 'en', 'pt'] as const
export type WitnessLocale = (typeof WITNESS_LOCALES)[number]

export const LINK_ADULT = ['family', 'friend', 'neighbour', 'colleague', 'school', 'health', 'other'] as const
export const DURATION = ['lt6m', '6m1y', '1y3y', '3y5y', 'gt5y'] as const
export const LINK_CHILD = ['family', 'familyFriend', 'neighbour', 'school', 'activity', 'health', 'other'] as const
export const PLACES = ['home', 'school', 'public', 'handover', 'activity'] as const
/** Lien avec les parties exigé par l'art. 202 : parenté, alliance, subordination, collaboration ou communauté d'intérêts. */
export const PARTY_TIES = ['none', 'kin', 'alliance', 'subordination', 'collaboration', 'interest'] as const
export type PartyTie = (typeof PARTY_TIES)[number]

type Dict = {
  linkAdult: Record<(typeof LINK_ADULT)[number], string>
  duration: Record<(typeof DURATION)[number], string>
  linkChild: Record<(typeof LINK_CHILD)[number], string>
  places: Record<(typeof PLACES)[number], string>
  ties: Record<PartyTie, string>
  parentRole: (n: number) => string
  childRole: (n: number) => string
  about: (name: string) => string
  link: (v: string) => string
  knownSince: (v: string) => string
  fact: (n: number, meta: string) => string
  on: (date: string) => string
  place: (v: string) => string
  context: (v: string) => string
  complement: string
  intro: (id: IdentityText) => string
  tie: (kind: PartyTie, detail: string) => string
  attests: string
  mention: string
  doneAt: (place: string, date: string) => string
  idCopy: string
  signature: (name: string) => string
  dateLocale: string
}

type IdentityText = {
  fullName: string
  birthDate: string
  birthPlace: string
  address: string
  profession: string
}

const DICTS: Record<WitnessLocale, Dict> = {
  fr: {
    linkAdult: {
      family: 'Membre de la famille', friend: 'Ami(e)', neighbour: 'Voisin(e)', colleague: 'Collègue',
      school: 'Enseignant(e) / personnel scolaire', health: 'Professionnel(le) de santé', other: 'Autre',
    },
    duration: { lt6m: 'Moins de 6 mois', '6m1y': '6 mois à 1 an', '1y3y': '1 à 3 ans', '3y5y': '3 à 5 ans', gt5y: 'Plus de 5 ans' },
    linkChild: {
      family: 'Membre de la famille', familyFriend: 'Ami(e) de la famille', neighbour: 'Voisin(e)',
      school: 'Enseignant(e) / personnel scolaire', activity: 'Encadrant(e) d’activité', health: 'Professionnel(le) de santé', other: 'Autre',
    },
    places: { home: 'Domicile du parent', school: 'École', public: 'Lieu public', handover: 'Lors d’un échange de garde', activity: 'Activité extrascolaire' },
    ties: {
      none: 'aucun', kin: 'lien de parenté', alliance: 'lien d’alliance', subordination: 'lien de subordination',
      collaboration: 'lien de collaboration', interest: 'communauté d’intérêts',
    },
    parentRole: (n) => `Parent ${n}`,
    childRole: (n) => `Enfant ${n}`,
    about: (name) => `Concernant ${name}`,
    link: (v) => `lien : ${v}`,
    knownSince: (v) => `connu(e) depuis : ${v}`,
    fact: (n, meta) => `Fait ${n}${meta ? ` (${meta})` : ''} :`,
    on: (d) => `le ${d}`,
    place: (v) => `lieu : ${v}`,
    context: (v) => `Contexte : ${v}`,
    complement: 'Informations complémentaires :',
    intro: (id) =>
      `Je soussigné(e) ${id.fullName}, né(e) le ${id.birthDate} à ${id.birthPlace}, demeurant ${id.address}, profession : ${id.profession},`,
    tie: (kind, detail) =>
      kind === 'none'
        ? 'déclare n’avoir aucun lien de parenté, d’alliance, de subordination, de collaboration ni de communauté d’intérêts avec les parties,'
        : `déclare avoir avec les parties le lien suivant : ${DICTS.fr.ties[kind]} (${detail}),`,
    attests: 'atteste avoir personnellement constaté les faits suivants :',
    mention:
      'Je sais que la présente attestation est établie en vue de sa production en justice et qu’une fausse attestation de ma part m’expose à des sanctions pénales (article 441-7 du Code pénal).',
    doneAt: (place, date) => `Fait à ${place}, le ${date}.`,
    idCopy: 'Pièce jointe : copie de ma pièce d’identité officielle.',
    signature: (name) => `Signature de ${name} (tracée à l’écran).`,
    dateLocale: 'fr-FR',
  },
  en: {
    linkAdult: {
      family: 'Family member', friend: 'Friend', neighbour: 'Neighbor', colleague: 'Colleague',
      school: 'Teacher / school staff', health: 'Healthcare professional', other: 'Other',
    },
    duration: { lt6m: 'Less than 6 months', '6m1y': '6 months to 1 year', '1y3y': '1 to 3 years', '3y5y': '3 to 5 years', gt5y: 'More than 5 years' },
    linkChild: {
      family: 'Family member', familyFriend: 'Family friend', neighbour: 'Neighbor',
      school: 'Teacher / school staff', activity: 'Activity leader', health: 'Healthcare professional', other: 'Other',
    },
    places: { home: 'Parent’s home', school: 'School', public: 'Public place', handover: 'During a custody handover', activity: 'Extracurricular activity' },
    ties: {
      none: 'none', kin: 'family relationship', alliance: 'relationship by marriage', subordination: 'employment or subordination relationship',
      collaboration: 'working relationship', interest: 'shared interests',
    },
    parentRole: (n) => `Parent ${n}`,
    childRole: (n) => `Child ${n}`,
    about: (name) => `Regarding ${name}`,
    link: (v) => `relationship: ${v}`,
    knownSince: (v) => `known for: ${v}`,
    fact: (n, meta) => `Fact ${n}${meta ? ` (${meta})` : ''}:`,
    on: (d) => `on ${d}`,
    place: (v) => `place: ${v}`,
    context: (v) => `Context: ${v}`,
    complement: 'Additional information:',
    intro: (id) =>
      `I, the undersigned, ${id.fullName}, born on ${id.birthDate} in ${id.birthPlace}, residing at ${id.address}, occupation: ${id.profession},`,
    tie: (kind, detail) =>
      kind === 'none'
        ? 'declare that I have no family relationship, relationship by marriage, subordination, working relationship or shared interests with the parties,'
        : `declare that I have the following relationship with the parties: ${DICTS.en.ties[kind]} (${detail}),`,
    attests: 'certify that I personally witnessed the following facts:',
    mention:
      'I know that this statement is made to be produced in court and that a false statement on my part exposes me to criminal penalties (Article 441-7 of the French Criminal Code).',
    doneAt: (place, date) => `Made in ${place}, on ${date}.`,
    idCopy: 'Attachment: copy of my official ID document.',
    signature: (name) => `Signature of ${name} (drawn on screen).`,
    dateLocale: 'en-US',
  },
  pt: {
    linkAdult: {
      family: 'Membro da família', friend: 'Amigo(a)', neighbour: 'Vizinho(a)', colleague: 'Colega de trabalho',
      school: 'Professor(a) / equipe escolar', health: 'Profissional de saúde', other: 'Outro',
    },
    duration: { lt6m: 'Menos de 6 meses', '6m1y': '6 meses a 1 ano', '1y3y': '1 a 3 anos', '3y5y': '3 a 5 anos', gt5y: 'Mais de 5 anos' },
    linkChild: {
      family: 'Membro da família', familyFriend: 'Amigo(a) da família', neighbour: 'Vizinho(a)',
      school: 'Professor(a) / equipe escolar', activity: 'Responsável por atividade', health: 'Profissional de saúde', other: 'Outro',
    },
    places: { home: 'Casa do pai ou da mãe', school: 'Escola', public: 'Local público', handover: 'Durante uma troca de guarda', activity: 'Atividade extracurricular' },
    ties: {
      none: 'nenhum', kin: 'parentesco', alliance: 'parentesco por afinidade (casamento)', subordination: 'relação de subordinação',
      collaboration: 'relação de colaboração', interest: 'comunhão de interesses',
    },
    parentRole: (n) => `Pai/Mãe ${n}`,
    childRole: (n) => `Filho(a) ${n}`,
    about: (name) => `Sobre ${name}`,
    link: (v) => `vínculo: ${v}`,
    knownSince: (v) => `conhece há: ${v}`,
    fact: (n, meta) => `Fato ${n}${meta ? ` (${meta})` : ''}:`,
    on: (d) => `em ${d}`,
    place: (v) => `local: ${v}`,
    context: (v) => `Contexto: ${v}`,
    complement: 'Informações complementares:',
    intro: (id) =>
      `Eu, abaixo assinado(a), ${id.fullName}, nascido(a) em ${id.birthDate} em ${id.birthPlace}, residente em ${id.address}, profissão: ${id.profession},`,
    tie: (kind, detail) =>
      kind === 'none'
        ? 'declaro não ter nenhum parentesco, parentesco por afinidade, relação de subordinação, de colaboração nem comunhão de interesses com as partes,'
        : `declaro ter com as partes o seguinte vínculo: ${DICTS.pt.ties[kind]} (${detail}),`,
    attests: 'atesto ter constatado pessoalmente os seguintes fatos:',
    mention:
      'Sei que este atestado é feito para ser apresentado à Justiça e que um falso atestado de minha parte me expõe a sanções penais (artigo 441-7 do Código Penal francês).',
    doneAt: (place, date) => `Feito em ${place}, em ${date}.`,
    idCopy: 'Anexo: cópia do meu documento de identidade oficial.',
    signature: (name) => `Assinatura de ${name} (desenhada na tela).`,
    dateLocale: 'pt-BR',
  },
}

export function witnessDict(locale: string): Dict {
  return DICTS[(WITNESS_LOCALES as readonly string[]).includes(locale) ? (locale as WitnessLocale) : 'fr']
}

/**
 * Date AAAA-MM-JJ → jour affiché dans la langue, SANS décalage de fuseau
 * (new Date('2026-10-01') est minuit UTC : en Guyane, UTC-3, il s'affichait « 30/09 »).
 */
export function formatDay(iso: string, locale: WitnessLocale, style: 'short' | 'long' = 'short'): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso
  const d = new Date(`${iso}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(DICTS[locale].dateLocale, style === 'long'
    ? { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }
    : { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })
}

/** Rôle affiché d'une personne de la demande (« p_2 » → « Parent 2 », « e_1 » → « Enfant 1 »…). */
export function personRole(id: string, locale: WitnessLocale): string | null {
  const m = /^([pe])_(\d{1,2})$/.exec(id)
  if (!m) return null
  const n = Number(m[2])
  return m[1] === 'p' ? DICTS[locale].parentRole(n) : DICTS[locale].childRole(n)
}

/** Un lieu choisi dans la liste (dans n'importe quelle langue) est rendu dans la langue cible ; un texte libre est gardé tel quel. */
function placeLabel(value: string, locale: WitnessLocale): string {
  const v = value.trim()
  for (const l of WITNESS_LOCALES) {
    const key = PLACES.find((k) => DICTS[l].places[k] === v)
    if (key) return DICTS[locale].places[key]
  }
  return v
}

const label = <K extends string>(map: Record<K, string>, key: string): string => (key in map ? map[key as K] : key)

export type WitnessFact = { faits: string; quand: string; ou: string; contexte: string }
export type WitnessAnswers = {
  parents: { nom: string; lien: string; duree: string; facts: WitnessFact[] }[]
  children: { nom: string; lien: string; constate: string }[]
  complement: string
}

/** Faits constatés (texte_original enregistré quand `locale` = 'fr'). */
export function compileFacts(a: WitnessAnswers, locale: WitnessLocale): string {
  const d = DICTS[locale]
  const blocks: string[] = []
  a.parents.forEach((p) => {
    const head = [d.about(p.nom), p.lien && d.link(label(d.linkAdult, p.lien)), p.duree && d.knownSince(label(d.duration, p.duree))]
      .filter(Boolean)
      .join(' — ')
    const facts = p.facts
      .filter((f) => f.faits.trim() || f.contexte.trim())
      .map((f, i) => {
        const meta = [f.quand && d.on(formatDay(f.quand, locale)), f.ou && d.place(placeLabel(f.ou, locale))].filter(Boolean).join(', ')
        return [d.fact(i + 1, meta), f.faits.trim(), f.contexte.trim() && d.context(f.contexte.trim())].filter(Boolean).join('\n')
      })
    if (facts.length) blocks.push([head, ...facts].join('\n'))
  })
  a.children.forEach((c) => {
    if (c.constate.trim()) blocks.push([`${d.about(c.nom)}${c.lien ? ` — ${d.link(label(d.linkChild, c.lien))}` : ''}`, c.constate.trim()].join('\n'))
  })
  if (a.complement.trim()) blocks.push(`${d.complement}\n${a.complement.trim()}`)
  return blocks.join('\n\n')
}

/** Valeurs enregistrées (lien, durée) : libellés français, comme auparavant. */
export const frLinkAdult = (key: string) => label(DICTS.fr.linkAdult, key)
export const frDuration = (key: string) => label(DICTS.fr.duration, key)
export const frLinkChild = (key: string) => label(DICTS.fr.linkChild, key)

export type WitnessIdentity = {
  nom: string
  prenoms: string
  dateNaissance: string
  lieuNaissance: string
  adresse: string
  cp: string
  ville: string
  pays?: string
  profession: string
}
export type WitnessDeclaration = {
  identity: WitnessIdentity
  tie: { kind: PartyTie; detail: string }
  place: string
  date: string
}

export function fullName(id: Pick<WitnessIdentity, 'prenoms' | 'nom'>): string {
  return [id.prenoms.trim(), id.nom.trim()].filter(Boolean).join(' ')
}

/** Attestation complète : identité, lien avec les parties, faits, mention pénale, lieu et date. */
export function compileAttestation(decl: WitnessDeclaration, facts: string, locale: WitnessLocale): string {
  const d = DICTS[locale]
  const id = decl.identity
  const address = [id.adresse.trim(), [id.cp.trim(), id.ville.trim()].filter(Boolean).join(' '), id.pays?.trim()].filter(Boolean).join(', ')
  return [
    d.intro({
      fullName: fullName(id),
      birthDate: formatDay(id.dateNaissance, locale),
      birthPlace: id.lieuNaissance.trim(),
      address,
      profession: id.profession.trim(),
    }),
    d.tie(decl.tie.kind, decl.tie.detail.trim()),
    d.attests,
    '',
    facts,
    '',
    d.mention,
    '',
    d.doneAt(decl.place.trim() || '…', formatDay(decl.date, locale, 'long')),
    d.idCopy,
    d.signature(fullName(id)),
  ].join('\n')
}

/** Variantes françaises courantes (données de démonstration, saisies anciennes) → clé de liste. */
const RELATION_ALIASES: Record<string, { list: 'linkAdult' | 'linkChild'; key: string }> = {
  voisin: { list: 'linkAdult', key: 'neighbour' },
  voisine: { list: 'linkAdult', key: 'neighbour' },
  'ami de la famille': { list: 'linkChild', key: 'familyFriend' },
  'amie de la famille': { list: 'linkChild', key: 'familyFriend' },
  ami: { list: 'linkAdult', key: 'friend' },
  amie: { list: 'linkAdult', key: 'friend' },
}

/**
 * Qualité du témoin enregistrée en français (« Ami(e) », « Voisin(e) »…) → libellé dans la langue
 * du lecteur. Un texte libre non reconnu est rendu tel quel (donnée saisie).
 */
export function relationLabel(value: string, locale: string): string {
  const d = witnessDict(locale)
  const v = value.trim()
  for (const list of ['linkAdult', 'linkChild'] as const) {
    const map = DICTS.fr[list] as Record<string, string>
    const key = Object.keys(map).find((k) => map[k] === v)
    if (key) return (d[list] as Record<string, string>)[key]
  }
  const alias = RELATION_ALIASES[v.toLowerCase()]
  return alias ? (d[alias.list] as Record<string, string>)[alias.key] : v
}
