/**
 * Enregistrement d'un fichier produit dans le navigateur (PDF, .ics, .txt, export JSON).
 *
 * - Lien temporaire gardé 60 s : l'iPhone demande de confirmer le téléchargement, un lien révoqué
 *   avant (immédiatement ou après 1 s) donnait un fichier vide ou rien du tout.
 * - App installée sur l'écran d'accueil d'un iPhone : un lien « download » n'y fait souvent rien ;
 *   la feuille de partage (« Enregistrer dans Fichiers », Mail…) prend le relais. Elle exige un geste
 *   récent : après une génération longue (PDF, réseau), un bouton « Enregistrer le fichier » demande
 *   un nouvel appui. Annulation de l'utilisateur : rien d'autre ne se passe.
 */
export function saveBlob(blob: Blob, filename: string): void {
  if (isIosStandalone() && typeof File === 'function') {
    const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' })
    if (navigator.canShare?.({ files: [file] })) {
      const activation = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation
      if (activation && !activation.isActive) showSaveButton(file)
      else shareFile(file, () => showSaveButton(file))
      return
    }
  }
  downloadWithLink(blob, filename)
}

function shareFile(file: File, onRefused: () => void) {
  navigator.share({ files: [file] }).catch((e: unknown) => {
    if (e instanceof Error && e.name === 'AbortError') return
    if (e instanceof Error && e.name === 'NotAllowedError') onRefused()
    else downloadWithLink(file, file.name)
  })
}

const SAVE_LABEL: Record<string, string> = { fr: 'Enregistrer le fichier', en: 'Save the file', pt: 'Guardar o ficheiro' }

/** Bouton flottant (hors React : saveBlob est appelé depuis des modules utilitaires). */
function showSaveButton(file: File) {
  document.getElementById('lp-save-file')?.remove()
  const btn = document.createElement('button')
  btn.id = 'lp-save-file'
  btn.type = 'button'
  btn.textContent = `${SAVE_LABEL[document.documentElement.lang.slice(0, 2)] ?? SAVE_LABEL.fr} · ${file.name}`
  btn.style.cssText = [
    'position:fixed', 'left:50%', 'transform:translateX(-50%)', 'z-index:2147483000',
    'bottom:calc(6rem + env(safe-area-inset-bottom, 0px))', 'max-width:calc(100vw - 2rem)',
    'min-height:48px', 'padding:0 20px', 'border:0', 'border-radius:999px',
    'background:#0b2d5b', 'color:#fff', 'font-family:inherit', 'font-size:16px', 'font-weight:600',
    'white-space:nowrap', 'overflow:hidden', 'text-overflow:ellipsis',
    'box-shadow:0 10px 30px -10px rgba(11,45,91,.6)',
  ].join(';')
  const timer = window.setTimeout(() => btn.remove(), 120_000)
  btn.addEventListener('click', () => {
    window.clearTimeout(timer)
    btn.remove()
    shareFile(file, () => downloadWithLink(file, file.name))
  })
  document.body.appendChild(btn)
  btn.focus()
}

function downloadWithLink(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function isIosStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean }
  const appleMobile = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  return appleMobile && (nav.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true)
}
