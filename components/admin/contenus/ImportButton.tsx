'use client'
/** Import des contenus du dépôt vers la base (Supabase uniquement), sans écraser l'existant. */
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { DatabaseZap } from 'lucide-react'
import { AdminApiError, contenusApi } from './client-api'
import { btnSecondary } from './form'

const LABEL = {
  guide: 'les fiches et parcours',
  modeles: 'les modèles de départ (en brouillon)',
  blog: 'les articles de départ (en brouillon)',
  aide: 'la FAQ, les tutoriels et les conseils du dépôt (publiés)',
} as const

export function ImportButton({ what }: { what: 'guide' | 'modeles' | 'blog' | 'aide' }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <button type="button" className={btnSecondary} disabled={busy} onClick={async () => {
        setBusy(true)
        setMsg('')
        try {
          const r = await contenusApi.importSeeds(what)
          setMsg(`${r.created} importé(s), ${r.skipped} déjà présent(s)${r.errors.length ? `, ${r.errors.length} erreur(s) : ${r.errors.slice(0, 3).join(' ; ')}` : ''}.`)
          router.refresh()
        } catch (e) {
          setMsg(e instanceof AdminApiError ? e.message : 'Import impossible.')
        } finally {
          setBusy(false)
        }
      }}>
        <DatabaseZap className="h-4 w-4" aria-hidden="true" /> {busy ? 'Import…' : 'Importer depuis le dépôt'}
      </button>
      <p role="status" aria-live="polite" className="max-w-xs text-[12.5px] text-night-600">{msg || `Copie ${LABEL[what]} absents de la base.`}</p>
    </div>
  )
}
