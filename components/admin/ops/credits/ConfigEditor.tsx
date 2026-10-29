'use client'
/**
 * Édition de la configuration des crédits IA (admin, français). Chaque enregistrement publie une
 * NOUVELLE version (historique conservé, motif obligatoire) qui s'applique sans déploiement.
 * Validation finale côté serveur (zod) et en base (0520). Les prix d'abonnement ne sont PAS ici.
 */
import { useRouter } from 'next/navigation'
import { useId, useState } from 'react'
import { Save } from 'lucide-react'
import { CREDIT_ACTIONS, type CreditAction, type CreditConfig } from '@/lib/ai/credit-config'
import { btnPrimaryCls, fieldCls } from '../ui'

const ACTION_LABEL: Record<CreditAction, string> = {
  chat_question: 'Question au Coach (réponse produite)',
  situation_analysis: 'Analyse de situation (message, capture)',
  document_analysis: 'Analyse de document (PDF, texte)',
  custom_letter: 'Courrier personnalisé (fonction non disponible)',
  full_dossier: 'Dossier complet (fonction non disponible)',
}
const PLAN_LABEL = { gratuit: 'Gratuit', premium: 'Premium', coparentalite: 'Coparentalité+' } as const

const cell = `${fieldCls} min-h-[40px] py-1.5`

export function ConfigEditor({ initial, disabled }: { initial: CreditConfig; disabled: boolean }) {
  const router = useRouter()
  const [cfg, setCfg] = useState<CreditConfig>(() => structuredClone(initial))
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const reasonId = useId()

  const n = (v: string) => (v.trim() === '' ? NaN : Number(v))
  const set = (fn: (c: CreditConfig) => void) => setCfg((c) => { const next = structuredClone(c); fn(next); return next })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/admin/credits/config', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: cfg, reason }),
      })
      const json = await res.json().catch(() => null) as { data?: { version: number }; error?: { message?: string } } | null
      if (!res.ok) { setMsg({ tone: 'error', text: json?.error?.message ?? 'Enregistrement impossible.' }); return }
      setMsg({ tone: 'ok', text: `Version ${json?.data?.version} publiée : elle s’applique dès maintenant.` })
      setReason('')
      router.refresh()
    } catch {
      setMsg({ tone: 'error', text: 'Connexion impossible. Vérifiez votre réseau.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6 text-[14px]">
      <fieldset disabled={disabled || busy} className="space-y-6">
        <div>
          <legend className="mb-2 font-bold text-night-900">Crédits mensuels inclus (solde A, sans report)</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {(['gratuit', 'premium', 'coparentalite'] as const).map((p) => (
              <label key={p} className="block">
                <span className="mb-1 block text-[13px] text-night-700">{PLAN_LABEL[p]}</span>
                <input type="number" min={0} max={10000} step={1} required className={cell} value={Number.isFinite(cfg.monthlyCredits[p]) ? cfg.monthlyCredits[p] : ''}
                  onChange={(e) => set((c) => { c.monthlyCredits[p] = n(e.target.value) })} />
              </label>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <caption className="mb-2 text-left font-bold text-night-900">Coût par action</caption>
            <thead className="text-night-600">
              <tr><th scope="col" className="py-1 pr-2">Action</th><th scope="col" className="py-1 pr-2">Crédits</th><th scope="col" className="py-1 pr-2">Active</th><th scope="col" className="py-1 pr-2">Tokens de sortie max</th><th scope="col" className="py-1">Délai max (s)</th></tr>
            </thead>
            <tbody>
              {CREDIT_ACTIONS.map((a) => (
                <tr key={a} className="border-t border-night-100">
                  <th scope="row" className="py-2 pr-2 font-medium text-night-900">{ACTION_LABEL[a]}</th>
                  <td className="py-2 pr-2"><input aria-label={`Crédits : ${ACTION_LABEL[a]}`} type="number" min={0} max={50} step={1} required className={cell} value={cfg.actions[a].cost} onChange={(e) => set((c) => { c.actions[a].cost = n(e.target.value) })} /></td>
                  <td className="py-2 pr-2"><input aria-label={`Active : ${ACTION_LABEL[a]}`} type="checkbox" className="h-5 w-5 accent-leaf-500" checked={cfg.actions[a].active} onChange={(e) => set((c) => { c.actions[a].active = e.target.checked })} /></td>
                  <td className="py-2 pr-2"><input aria-label={`Tokens de sortie : ${ACTION_LABEL[a]}`} type="number" min={256} max={64000} step={1} required className={cell} value={cfg.actions[a].maxOutputTokens} onChange={(e) => set((c) => { c.actions[a].maxOutputTokens = n(e.target.value) })} /></td>
                  <td className="py-2"><input aria-label={`Délai : ${ACTION_LABEL[a]}`} type="number" min={5} max={280} step={1} required className={cell} value={cfg.actions[a].timeoutMs / 1000} onChange={(e) => set((c) => { c.actions[a].timeoutMs = Math.round(n(e.target.value) * 1000) })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-[12px] text-night-600">« Courrier personnalisé » et « Dossier complet » n’existent pas encore dans l’application : les activer n’ouvre aucune fonction.</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-[13px]">
            <caption className="mb-2 text-left font-bold text-night-900">Packs de recharge (solde B)</caption>
            <thead className="text-night-600">
              <tr><th scope="col" className="py-1 pr-2">Identifiant</th><th scope="col" className="py-1 pr-2">Crédits</th><th scope="col" className="py-1 pr-2">Prix TTC (€)</th><th scope="col" className="py-1">Actif</th></tr>
            </thead>
            <tbody>
              {cfg.packs.map((p, i) => (
                <tr key={p.id} className="border-t border-night-100">
                  <th scope="row" className="py-2 pr-2 font-mono text-[12.5px] text-night-900">{p.id}</th>
                  <td className="py-2 pr-2"><input aria-label={`Crédits du pack ${p.id}`} type="number" min={1} max={1000} step={1} required className={cell} value={p.credits} onChange={(e) => set((c) => { c.packs[i].credits = n(e.target.value) })} /></td>
                  <td className="py-2 pr-2"><input aria-label={`Prix du pack ${p.id}`} type="number" min={0.5} max={1000} step={0.01} required className={cell} value={p.priceCents / 100} onChange={(e) => set((c) => { c.packs[i].priceCents = Math.round(n(e.target.value) * 100) })} /></td>
                  <td className="py-2"><input aria-label={`Pack ${p.id} actif`} type="checkbox" className="h-5 w-5 accent-leaf-500" checked={p.active} onChange={(e) => set((c) => { c.packs[i].active = e.target.checked })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-[12px] text-night-600">Les sessions de paiement déjà ouvertes gardent le prix et la quantité affichés au client (figés dans la session).</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {([
            ['purchasedValidityMonths', 'Validité des crédits achetés (mois)', 1, 36, 1],
            ['limits.pdfMaxPages', 'PDF : pages max', 1, 100, 1],
            ['limits.pdfMaxBytes', 'PDF : taille max (Mo)', 0.1, 32, 0.1],
            ['limits.imageMaxBytes', 'Image : taille max (Mo)', 0.1, 10, 0.1],
            ['limits.chatPerMinute', 'Chat : questions / minute', 1, 60, 1],
            ['limits.chatPerDay', 'Chat : questions / jour', 1, 1000, 1],
            ['limits.dailySpendEurUser', 'Plafond IA / compte / jour (€, 0 = aucun)', 0, 1000, 0.01],
            ['limits.dailySpendEurGlobal', 'Plafond IA global / jour (€, 0 = aucun)', 0, 100000, 0.01],
          ] as const).map(([path, label, min, max, step]) => {
            const mb = path === 'limits.pdfMaxBytes' || path === 'limits.imageMaxBytes'
            const get = (c: CreditConfig): number => path === 'purchasedValidityMonths' ? c.purchasedValidityMonths : c.limits[path.slice(7) as keyof CreditConfig['limits']]
            const value = mb ? Math.round((get(cfg) / 1048576) * 10) / 10 : get(cfg)
            return (
              <label key={path} className="block">
                <span className="mb-1 block text-[13px] text-night-700">{label}</span>
                <input type="number" min={min} max={max} step={step} required className={cell} value={value}
                  onChange={(e) => set((c) => {
                    const v = mb ? Math.round(n(e.target.value) * 1048576) : n(e.target.value)
                    if (path === 'purchasedValidityMonths') c.purchasedValidityMonths = v
                    else c.limits[path.slice(7) as keyof CreditConfig['limits']] = v
                  })} />
              </label>
            )
          })}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="block">
            <span className="mb-1 block text-[13px] text-night-700">Conversion USD → EUR</span>
            <input type="number" min={0.1} max={10} step={0.0001} required className={cell} value={cfg.pricing.usdToEur} onChange={(e) => set((c) => { c.pricing.usdToEur = n(e.target.value) })} />
          </label>
          {Object.keys(cfg.pricing.models).flatMap((m) => (['input', 'output', 'cacheWrite', 'cacheRead'] as const).map((k) => (
            <label key={`${m}-${k}`} className="block">
              <span className="mb-1 block text-[13px] text-night-700">{m} · {k === 'input' ? 'entrée' : k === 'output' ? 'sortie' : k === 'cacheWrite' ? 'écriture cache' : 'lecture cache'} ($/M)</span>
              <input type="number" min={0} max={1000} step={0.01} required className={cell} value={cfg.pricing.models[m][k]} onChange={(e) => set((c) => { c.pricing.models[m][k] = n(e.target.value) })} />
            </label>
          )))}
        </div>

        <label htmlFor={reasonId} className="block">
          <span className="mb-1 block font-bold text-night-900">Motif de la modification (obligatoire, journalisé)</span>
          <textarea id={reasonId} required minLength={5} maxLength={500} rows={2} className={fieldCls} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className={btnPrimaryCls} disabled={disabled || busy || reason.trim().length < 5}>
          <Save className="h-4 w-4" aria-hidden="true" /> {busy ? 'Publication…' : 'Publier une nouvelle version'}
        </button>
        <p role={msg?.tone === 'error' ? 'alert' : 'status'} className={msg?.tone === 'error' ? 'text-[13px] font-medium text-alert-700' : 'text-[13px] text-leaf-700'}>{msg?.text}</p>
      </div>
    </form>
  )
}
