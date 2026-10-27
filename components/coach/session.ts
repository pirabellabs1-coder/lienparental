// État du parcours Coach IA partagé entre les écrans (écrire → document →
// analyse → réponse). Stocké en sessionStorage : rien ne quitte l'appareil
// et tout disparaît à la fermeture de l'onglet.

export type CoachDraftKind = 'capture' | 'pdf' | 'word' | 'document' | 'message'

export type CoachDraft = {
  kind: CoachDraftKind
  name: string
  sizeKb?: number
  text?: string
  createdAt: string // ISO
}

const DRAFT_KEY = 'lp:coach:draft'
const PREFILL_KEY = 'lp:coach:prefill'

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage
  } catch {
    return null
  }
}

export function saveDraft(d: CoachDraft) {
  storage()?.setItem(DRAFT_KEY, JSON.stringify(d))
}

export function loadDraft(): CoachDraft | null {
  const raw = storage()?.getItem(DRAFT_KEY)
  if (!raw) return null
  try {
    const d = JSON.parse(raw) as CoachDraft
    return typeof d?.kind === 'string' && typeof d?.name === 'string' ? d : null
  } catch {
    return null
  }
}

export function clearDraft() {
  storage()?.removeItem(DRAFT_KEY)
}

/** Question saisie depuis le dashboard, reprise dans « Écrivez votre message ». */
export function savePrefill(text: string) {
  storage()?.setItem(PREFILL_KEY, text)
}

export function takePrefill(): string {
  const s = storage()
  const v = s?.getItem(PREFILL_KEY) ?? ''
  s?.removeItem(PREFILL_KEY)
  return v
}

export const IMAGE_ACCEPT = 'image/jpeg,image/png'
// Word (.doc/.docx) n'est pas lisible par le modèle : on demande un export PDF.
export const DOC_ACCEPT = '.pdf,.txt,application/pdf,text/plain'
export const MAX_FILE_BYTES = 10 * 1024 * 1024
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

// --- Fichier sélectionné, conservé en mémoire entre les écrans du parcours ---------
// (navigation client : le module reste chargé ; un rechargement de page le perd, et
// l'écran d'analyse invite alors à réimporter. Rien n'est écrit sur le disque.)
let pendingFile: File | null = null

export function setPendingFile(file: File | null) {
  pendingFile = file
}

export function getPendingFile(): File | null {
  return pendingFile
}

// --- Dernière analyse (affichée par « Réponse » et « Discussion ») ------------------

export type CoachAnalysisResult = {
  type_contenu: 'message_ecrit' | 'capture_conversation' | 'document' | 'autre'
  texte_lu: string
  ton: number
  agressivite: number
  mots_blessants: string[]
  clarte: number
  respect: number
  impact: string
  resume: string
  nature_reponse: 'reformulation' | 'reponse_suggeree' | 'aucune'
  reformulation: string
  conseils: string[]
  disclaimer?: string
}

export type CoachAnalysisSession = {
  id: string
  title: string
  kind: CoachDraftKind
  demo: boolean
  result: CoachAnalysisResult
}

const ANALYSIS_KEY = 'lp:coach:analysis'

export function saveAnalysis(a: CoachAnalysisSession) {
  try {
    storage()?.setItem(ANALYSIS_KEY, JSON.stringify(a))
  } catch {
    // quota sessionStorage plein : l'écran relira l'analyse via l'API
  }
}

export function loadAnalysis(): CoachAnalysisSession | null {
  const raw = storage()?.getItem(ANALYSIS_KEY)
  if (!raw) return null
  try {
    const a = JSON.parse(raw) as CoachAnalysisSession
    return typeof a?.id === 'string' && a.result && typeof a.result.reformulation === 'string' ? a : null
  } catch {
    return null
  }
}

export function clearAnalysis() {
  storage()?.removeItem(ANALYSIS_KEY)
}

export function draftFromFile(file: File): CoachDraft {
  const name = file.name.toLowerCase()
  const kind: CoachDraftKind = file.type.startsWith('image/')
    ? 'capture'
    : name.endsWith('.pdf')
      ? 'pdf'
      : name.endsWith('.doc') || name.endsWith('.docx')
        ? 'word'
        : 'document'
  return { kind, name: file.name, sizeKb: Math.round(file.size / 1024), createdAt: new Date().toISOString() }
}

export type FileErrorCode = 'tooBig' | 'imageFormat' | 'imageTooBig' | 'word' | 'docFormat'

/** Code d'erreur d'un fichier choisi (traduit au rendu : `coach.common.fileErrors.<code>`) ou null. */
export function fileErrorCode(file: File, accept: 'image' | 'doc'): FileErrorCode | null {
  if (file.size > MAX_FILE_BYTES) return 'tooBig'
  if (accept === 'image' && !/^image\/(jpeg|png)$/.test(file.type)) return 'imageFormat'
  if (accept === 'image' && file.size > MAX_IMAGE_BYTES) return 'imageTooBig'
  if (accept === 'doc' && /\.docx?$/i.test(file.name)) return 'word'
  if (accept === 'doc' && !/\.(pdf|txt)$/i.test(file.name)) return 'docFormat'
  return null
}

const FILE_ERRORS_FR: Record<FileErrorCode, string> = {
  tooBig: 'Fichier trop volumineux (10 Mo maximum).',
  imageFormat: 'Format accepté : image JPG ou PNG.',
  imageTooBig: 'Image trop volumineuse (5 Mo maximum).',
  word: 'Les documents Word ne sont pas encore pris en charge : enregistrez-le en PDF.',
  docFormat: 'Formats acceptés : PDF ou texte.',
}

/** Valide un fichier choisi ; renvoie un message d'erreur lisible (français) ou null. Préférer fileErrorCode + traduction. */
export function validateFile(file: File, accept: 'image' | 'doc'): string | null {
  const code = fileErrorCode(file, accept)
  return code ? FILE_ERRORS_FR[code] : null
}

export function timeLabel(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const hm = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  return d.toDateString() === today.toDateString()
    ? `aujourd’hui à ${hm}`
    : `${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} à ${hm}`
}
