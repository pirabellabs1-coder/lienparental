/**
 * Modèles de documents administrables (« Documents prêts à l'emploi »).
 *
 * Module PUR (isomorphe) : schéma zod du modèle, analyse du corps, interpolation des
 * variables `{{cle}}` et validation des valeurs saisies par le parent.
 *
 * Syntaxe du corps (volontairement minimale, rendue à l'identique en HTML et en PDF) :
 *   ligne vide            → nouveau paragraphe
 *   # Titre / ## Titre    → titre / sous-titre
 *   - élément             → puce
 *   ---                   → nouvelle page
 *   {{cle}}               → variable déclarée dans « Champs »
 * Aucun HTML n'est interprété : le texte est toujours rendu comme du texte.
 */
import { z } from 'zod'

export const TEMPLATE_CATEGORIES = [
  { key: 'juridique', label: 'Juridique' },
  { key: 'communication', label: 'Communication' },
  { key: 'scolaire', label: 'Scolaire' },
  { key: 'autre', label: 'Autre' },
] as const
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number]['key']
const CATEGORY_KEYS = TEMPLATE_CATEGORIES.map((c) => c.key) as [TemplateCategory, ...TemplateCategory[]]

export function templateCategoryLabel(key: string): string {
  return TEMPLATE_CATEGORIES.find((c) => c.key === key)?.label ?? key
}

export const FIELD_TYPES = [
  { key: 'texte', label: 'Texte court' },
  { key: 'texte_long', label: 'Texte long' },
  { key: 'date', label: 'Date' },
  { key: 'email', label: 'Adresse e-mail' },
  { key: 'telephone', label: 'Téléphone' },
  { key: 'nombre', label: 'Nombre' },
  { key: 'choix', label: 'Liste de choix' },
] as const
export type FieldType = (typeof FIELD_TYPES)[number]['key']
const FIELD_TYPE_KEYS = FIELD_TYPES.map((t) => t.key) as [FieldType, ...FieldType[]]

export const VAR_KEY_RE = /^[a-z][a-z0-9_]{0,39}$/
const VAR_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g

const text = (max: number) => z.string().trim().min(1, 'Champ obligatoire.').max(max, `${max} caractères au maximum.`)
const optText = (max: number) => z.string().trim().max(max, `${max} caractères au maximum.`).default('')

export const templateFieldSchema = z.object({
  key: z.string().regex(VAR_KEY_RE, 'Identifiant : minuscules, chiffres et _ (ex. prenom_enfant).'),
  label: text(80),
  type: z.enum(FIELD_TYPE_KEYS),
  obligatoire: z.boolean().default(true),
  aide: optText(160),
  /** Valeur d'exemple utilisée par l'aperçu (jamais pré-remplie chez le parent). */
  exemple: optText(160),
  options: z.array(text(80)).max(20).default([]),
})
export type TemplateField = z.output<typeof templateFieldSchema>

export const templateLayoutSchema = z.object({
  type: z.enum(['lettre', 'document']).default('lettre'),
  /** Bloc expéditeur (haut droite), une ligne par ligne, variables autorisées. */
  expediteur: optText(600),
  /** Bloc destinataire, lettres uniquement. */
  destinataire: optText(600),
  lieuDate: optText(160),
  objet: optText(300),
  signature: optText(300),
  piedDePage: optText(200),
  logo: z.boolean().default(true),
  police: z.enum(['helvetica', 'times']).default('helvetica'),
  taille: z.enum(['petite', 'normale', 'grande']).default('normale'),
  marges: z.enum(['etroites', 'normales', 'larges']).default('normales'),
})
export type TemplateLayout = z.output<typeof templateLayoutSchema>

export const documentTemplateSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug : minuscules, chiffres et tirets.').max(80),
  titre: text(140),
  categorie: z.enum(CATEGORY_KEYS),
  description: text(400),
  badge: z.enum(['Populaire', 'Nouveau']).nullable().default(null),
  champs: z.array(templateFieldSchema).max(40, '40 champs au maximum.').default([]),
  corps: text(20000),
  miseEnPage: templateLayoutSchema.default({}),
}).superRefine((t, ctx) => {
  const keys = new Set<string>()
  t.champs.forEach((f, i) => {
    if (keys.has(f.key)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['champs', i, 'key'], message: `Identifiant « ${f.key} » déjà utilisé.` })
    keys.add(f.key)
    if (f.type === 'choix' && f.options.length < 2) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['champs', i, 'options'], message: 'Une liste de choix demande au moins 2 options.' })
    }
  })
  for (const { where, value } of templateTexts(t)) {
    for (const v of extractVariables(value)) {
      if (!keys.has(v)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: where, message: `Variable {{${v}}} non déclarée dans les champs.` })
      }
    }
  }
})
export type DocumentTemplate = z.output<typeof documentTemplateSchema>

/** Tous les textes du modèle qui peuvent contenir des variables. */
export function templateTexts(t: Pick<DocumentTemplate, 'corps' | 'miseEnPage'>): { where: (string | number)[]; value: string }[] {
  const L = t.miseEnPage ?? ({} as Partial<TemplateLayout>)
  return [
    { where: ['corps'], value: t.corps ?? '' },
    { where: ['miseEnPage', 'expediteur'], value: L.expediteur ?? '' },
    { where: ['miseEnPage', 'destinataire'], value: L.destinataire ?? '' },
    { where: ['miseEnPage', 'lieuDate'], value: L.lieuDate ?? '' },
    { where: ['miseEnPage', 'objet'], value: L.objet ?? '' },
    { where: ['miseEnPage', 'signature'], value: L.signature ?? '' },
    { where: ['miseEnPage', 'piedDePage'], value: L.piedDePage ?? '' },
  ]
}

export function extractVariables(s: string): string[] {
  const out = new Set<string>()
  for (const m of s.matchAll(VAR_RE)) out.add(m[1])
  return [...out]
}

/** Variables utilisées dans le modèle mais non déclarées, et champs déclarés jamais utilisés. */
export function variableReport(t: Pick<DocumentTemplate, 'corps' | 'miseEnPage' | 'champs'>) {
  const used = new Set(templateTexts(t).flatMap((x) => extractVariables(x.value)))
  const declared = new Set(t.champs.map((f) => f.key))
  return {
    undeclared: [...used].filter((v) => !declared.has(v)),
    unused: [...declared].filter((v) => !used.has(v)),
  }
}

// --- Interpolation -------------------------------------------------------------

export type TemplateValues = Record<string, string>
export type InterpolateMode = 'final' | 'preview'

const dateFr = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d)
}

function formatValue(f: TemplateField | undefined, raw: string): string {
  if (f?.type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return dateFr(raw)
  return raw
}

/**
 * Remplace les `{{cle}}`. Valeur absente : `[Libellé]` (le parent voit ce qu'il reste à compléter),
 * sauf pour un champ facultatif laissé vide dans le document final (rien n'est imprimé).
 * En aperçu, la valeur d'exemple du champ est utilisée si elle existe.
 */
export function interpolate(s: string, fields: TemplateField[], values: TemplateValues, mode: InterpolateMode = 'final'): string {
  const byKey = new Map(fields.map((f) => [f.key, f]))
  return s.replace(VAR_RE, (_, key: string) => {
    const f = byKey.get(key)
    const v = (values[key] ?? '').trim() || (mode === 'preview' ? f?.exemple ?? '' : '')
    if (v) return formatValue(f, v)
    if (mode === 'final' && f && !f.obligatoire) return ''
    return `[${f?.label ?? key}]`
  })
}

// --- Analyse du corps ----------------------------------------------------------

export type BodyBlock =
  | { type: 'h1' | 'h2' | 'p'; text: string }
  | { type: 'ul'; items: string[] }

/** Découpe le corps en pages (séparateur `---`) puis en blocs. */
export function parseTemplateBody(corps: string): BodyBlock[][] {
  const pages: BodyBlock[][] = [[]]
  let para: string[] = []
  let list: string[] | null = null
  const page = () => pages[pages.length - 1]
  const flush = () => {
    if (para.length) page().push({ type: 'p', text: para.join(' ').trim() })
    para = []
    if (list) page().push({ type: 'ul', items: list })
    list = null
  }
  for (const raw of corps.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd()
    if (/^\s*---\s*$/.test(line)) { flush(); pages.push([]); continue }
    if (!line.trim()) { flush(); continue }
    const h = /^(#{1,2})\s+(.+)$/.exec(line.trim())
    if (h) { flush(); page().push({ type: h[1].length === 1 ? 'h1' : 'h2', text: h[2].trim() }); continue }
    const li = /^\s*[-*]\s+(.+)$/.exec(line)
    if (li) {
      if (para.length) { page().push({ type: 'p', text: para.join(' ').trim() }); para = [] }
      list = list ?? []
      list.push(li[1].trim())
      continue
    }
    if (list) { page().push({ type: 'ul', items: list }); list = null }
    para.push(line.trim())
  }
  flush()
  return pages.filter((p, i) => p.length > 0 || i === 0)
}

/** Lignes non vides d'un bloc multi-lignes (expéditeur, destinataire). */
export function lines(s: string): string[] {
  return s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
}

// --- Valeurs saisies par le parent ---------------------------------------------

/** Schéma zod des valeurs d'un modèle (bornées, typées, champs obligatoires). */
export function valuesSchemaFor(fields: TemplateField[]) {
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const f of fields) {
    let s: z.ZodTypeAny
    const max = f.type === 'texte_long' ? 4000 : 300
    const base = z.string().trim().max(max, `${max} caractères au maximum.`)
    switch (f.type) {
      case 'date': s = base.regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Date invalide.'); break
      case 'email': s = base.refine((v) => !v || z.string().email().safeParse(v).success, 'Adresse e-mail invalide.'); break
      case 'telephone': s = base.regex(/^[0-9 +().-]*$/, 'Numéro invalide.'); break
      case 'nombre': s = base.regex(/^(-?\d+([.,]\d+)?)?$/, 'Nombre attendu.'); break
      case 'choix': s = base.refine((v) => !v || f.options.includes(v), 'Choisissez une option de la liste.'); break
      default: s = base
    }
    shape[f.key] = f.obligatoire ? s.refine((v: string) => v.length > 0, 'Champ obligatoire.') : s.optional().default('')
  }
  return z.object(shape)
}

export const LAYOUT_SIZES: Record<TemplateLayout['taille'], number> = { petite: 9.5, normale: 10.5, grande: 11.5 }
export const LAYOUT_MARGINS: Record<TemplateLayout['marges'], number> = { etroites: 36, normales: 54, larges: 72 }

/** Modèle vide pour « Nouveau modèle ». */
export function emptyTemplate(): DocumentTemplate {
  return documentTemplateSchema.parse({
    slug: 'nouveau-modele',
    titre: 'Nouveau modèle',
    categorie: 'autre',
    description: 'Décrivez en une phrase à quoi sert ce document.',
    champs: [
      { key: 'nom_complet', label: 'Votre prénom et nom', type: 'texte', obligatoire: true, exemple: 'Julie Martin' },
      { key: 'ville', label: 'Ville', type: 'texte', obligatoire: true, exemple: 'Cayenne' },
      { key: 'date', label: 'Date du courrier', type: 'date', obligatoire: true },
    ],
    corps: 'Madame, Monsieur,\n\nRédigez ici le contenu du document. Utilisez {{nom_complet}} pour insérer une valeur saisie par le parent.\n\nJe vous prie d’agréer, Madame, Monsieur, mes salutations distinguées.',
    miseEnPage: { type: 'lettre', expediteur: '{{nom_complet}}', lieuDate: '{{ville}}, le {{date}}', signature: '{{nom_complet}}' },
  })
}
