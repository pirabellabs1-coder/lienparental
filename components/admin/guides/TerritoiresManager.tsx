'use client'
/** Territoires du Guide : ajout (ex. Martinique) et ouverture au public quand le contenu est prêt. */
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Plus } from 'lucide-react'
import type { Territoire } from '@/lib/guide/types'
import { slugify } from '@/lib/contenus/types'
import { AdminApiError, contenusApi, type Issue } from '@/components/admin/contenus/client-api'
import { CheckboxField, IssuesProvider, TextField, btnPrimary, btnSecondary } from '@/components/admin/contenus/form'

export function TerritoiresManager({ territoires, counts }: { territoires: Territoire[]; counts: Record<string, number> }) {
  const router = useRouter()
  const [draft, setDraft] = useState<Territoire>({ code: '', nom: '', disponible: false, ordre: (territoires.at(-1)?.ordre ?? 0) + 1 })
  const [issues, setIssues] = useState<Issue[]>([])
  const [msg, setMsg] = useState<{ err: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const save = async (t: Territoire, label: string) => {
    setBusy(t.code || 'new')
    setMsg(null)
    try {
      await contenusApi.saveTerritoire(t)
      setMsg({ err: false, text: label })
      setIssues([])
      router.refresh()
      return true
    } catch (e) {
      setIssues(e instanceof AdminApiError ? e.issues : [])
      setMsg({ err: true, text: e instanceof AdminApiError ? e.message : 'Enregistrement impossible.' })
      return false
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-5">
      <ul className="divide-y divide-[#E5E7EB] rounded-2xl border border-[#E5E7EB] bg-white shadow-soft">
        {territoires.map((t) => (
          <li key={t.code} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-bold text-night-900">{t.nom} <span className="font-mono text-[12px] font-normal text-night-500">{t.code}</span></p>
              <p className="text-[12.5px] text-night-600">{counts[t.code] ?? 0} fiche(s) · ordre {t.ordre} · {t.disponible ? 'ouvert aux parents' : 'masqué (en préparation)'}</p>
            </div>
            <button type="button" className={btnSecondary} disabled={busy !== null}
              onClick={() => void save({ ...t, disponible: !t.disponible }, t.disponible ? `${t.nom} masqué.` : `${t.nom} ouvert aux parents.`)}>
              {t.disponible ? 'Masquer' : 'Ouvrir aux parents'}<span className="sr-only"> : {t.nom}</span>
            </button>
          </li>
        ))}
      </ul>

      <form
        className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-soft sm:p-5"
        onSubmit={async (e) => {
          e.preventDefault()
          if (await save(draft, `Territoire ${draft.nom} ajouté.`)) setDraft({ code: '', nom: '', disponible: false, ordre: draft.ordre + 1 })
        }}
      >
        <h2 className="text-[16px] font-extrabold text-night-900">Ajouter un territoire</h2>
        <p className="text-[13px] text-night-600">Gardez-le masqué tant que ses fiches ne sont pas publiées.</p>
        <IssuesProvider value={issues}>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <TextField label="Nom" path="nom" value={draft.nom} required max={60}
              onChange={(nom) => setDraft((d) => ({ ...d, nom, code: d.code && d.code !== slugify(d.nom, 40) ? d.code : slugify(nom, 40) }))} />
            <TextField label="Code" path="code" value={draft.code} required mono onChange={(code) => setDraft((d) => ({ ...d, code }))} hint="Ex. martinique" />
            <TextField label="Ordre" path="ordre" type="number" inputMode="numeric" value={String(draft.ordre)} onChange={(v) => setDraft((d) => ({ ...d, ordre: Number.parseInt(v || '0', 10) || 0 }))} />
          </div>
          <div className="mt-4"><CheckboxField label="Ouvrir aux parents dès maintenant" checked={draft.disponible} onChange={(disponible) => setDraft((d) => ({ ...d, disponible }))} /></div>
        </IssuesProvider>
        <button type="submit" className={`${btnPrimary} mt-4`} disabled={busy !== null || !draft.nom || !draft.code}><Plus className="h-4 w-4" aria-hidden="true" /> Ajouter</button>
      </form>
      <p role="status" aria-live="polite" className={msg?.err ? 'text-[13.5px] font-semibold text-alert-600' : 'text-[13.5px] font-semibold text-leaf-700'}>{msg?.text}</p>
    </div>
  )
}
