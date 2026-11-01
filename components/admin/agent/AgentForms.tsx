'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent, type ReactNode } from 'react'
import { btnDangerCls, btnPrimaryCls, btnSecondaryCls, fieldCls } from '@/components/admin/ops/ui'
import { cn } from '@/lib/cn'

// Formulaires du back-office de l'agent d'accueil : tous passent par POST /api/admin/agent { op }.

function useOp() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const run = async (body: Record<string, unknown>, ok: string): Promise<boolean> => {
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/admin/agent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const json = (await res.json().catch(() => null)) as { error?: { message?: string; issues?: { path: string; message: string }[] } } | null
      if (!res.ok) {
        const issue = json?.error?.issues?.[0]
        setMsg({ tone: 'error', text: `${json?.error?.message ?? 'Action impossible.'}${issue ? ` (${issue.path} : ${issue.message})` : ''}` })
        return false
      }
      setMsg({ tone: 'ok', text: ok })
      router.refresh()
      return true
    } catch {
      setMsg({ tone: 'error', text: 'Connexion impossible. Réessayez.' })
      return false
    } finally {
      setBusy(false)
    }
  }
  const feedback = msg ? <p role={msg.tone === 'error' ? 'alert' : 'status'} className={cn('text-[13px]', msg.tone === 'error' ? 'text-alert-700' : 'text-leaf-700')}>{msg.text}</p> : null
  return { run, busy, feedback }
}

const Label = ({ htmlFor, children }: { htmlFor: string; children: ReactNode }) => (
  <label htmlFor={htmlFor} className="mb-1 block text-[13.5px] font-semibold text-night-900">{children}</label>
)

// --- Base de connaissances -----------------------------------------------------------------------

export type KbDraft = { id?: string; entry_key: string; locale: 'fr' | 'en' | 'pt'; category: string; title: string; questions: string; answer: string; source: string }

export function KbEditor({ initial, categories }: { initial: KbDraft; categories: Record<string, string> }) {
  const [f, setF] = useState(initial)
  const { run, busy, feedback } = useOp()
  const editing = Boolean(initial.id)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    void run({ op: 'kb.save', ...f, id: f.id || undefined, source: f.source || undefined }, 'Nouvelle version enregistrée en brouillon. Publiez-la pour qu’elle soit utilisée.')
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor="kb-key">Clé de la fiche</Label>
          <input id="kb-key" required pattern="[a-z0-9][a-z0-9-]{1,63}" disabled={editing} value={f.entry_key} onChange={(e) => setF({ ...f, entry_key: e.target.value })} className={fieldCls} placeholder="horaires-contact" />
        </div>
        <div>
          <Label htmlFor="kb-locale">Langue</Label>
          <select id="kb-locale" disabled={editing} value={f.locale} onChange={(e) => setF({ ...f, locale: e.target.value as KbDraft['locale'] })} className={fieldCls}>
            <option value="fr">Français</option><option value="en">English</option><option value="pt">Português</option>
          </select>
        </div>
        <div>
          <Label htmlFor="kb-cat">Catégorie</Label>
          <select id="kb-cat" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} className={fieldCls}>
            {Object.entries(categories).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>
      <div>
        <Label htmlFor="kb-title">Titre</Label>
        <input id="kb-title" required minLength={2} maxLength={160} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className={fieldCls} />
      </div>
      <div>
        <Label htmlFor="kb-q">Questions types (une par ligne, sert aussi aux réponses sans IA)</Label>
        <textarea id="kb-q" rows={3} maxLength={2000} value={f.questions} onChange={(e) => setF({ ...f, questions: e.target.value })} className={cn(fieldCls, 'h-auto py-2')} />
      </div>
      <div>
        <Label htmlFor="kb-a">Réponse officielle</Label>
        <textarea id="kb-a" required rows={6} minLength={2} maxLength={4000} value={f.answer} onChange={(e) => setF({ ...f, answer: e.target.value })} className={cn(fieldCls, 'h-auto py-2')} />
        <p className="mt-1 text-[12.5px] text-night-600">Texte simple. Liens internes au format [libellé](/chemin). Jamais de tarif ici : les prix viennent de la configuration des offres.</p>
      </div>
      <div>
        <Label htmlFor="kb-src">Source / responsable</Label>
        <input id="kb-src" maxLength={300} value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} className={fieldCls} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy} className={btnPrimaryCls}>{editing ? 'Enregistrer une nouvelle version' : 'Créer la fiche (brouillon)'}</button>
        {feedback}
      </div>
    </form>
  )
}

export function KbActions({ id, status }: { id: string; status: string }) {
  const { run, busy, feedback } = useOp()
  const [when, setWhen] = useState('')
  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === 'draft' && <button type="button" disabled={busy} className={btnSecondaryCls} onClick={() => void run({ op: 'kb.status', id, status: 'review' }, 'Envoyée en relecture.')}>À valider</button>}
      {(status === 'draft' || status === 'review' || status === 'scheduled') && (
        <button type="button" disabled={busy} className={btnPrimaryCls} onClick={() => void run({ op: 'kb.status', id, status: 'published' }, 'Publiée : utilisée par l’assistant d’ici une minute.')}>Publier</button>
      )}
      {(status === 'draft' || status === 'review') && (
        <span className="flex items-center gap-1">
          <label htmlFor={`when-${id}`} className="sr-only">Date de publication</label>
          <input id={`when-${id}`} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={cn(fieldCls, 'h-10 w-auto')} />
          <button type="button" disabled={busy || !when} className={btnSecondaryCls} onClick={() => void run({ op: 'kb.status', id, status: 'scheduled', effective_at: new Date(when).toISOString() }, 'Publication programmée.')}>Programmer</button>
        </span>
      )}
      {status === 'published' && <button type="button" disabled={busy} className={btnDangerCls} onClick={() => void run({ op: 'kb.status', id, status: 'archived' }, 'Fiche retirée : l’assistant ne l’utilise plus.')}>Retirer</button>}
      {status === 'archived' && <button type="button" disabled={busy} className={btnSecondaryCls} onClick={() => void run({ op: 'kb.rollback', id }, 'Cette version est republiée (nouveau numéro).')}>Revenir à cette version</button>}
      {feedback}
    </div>
  )
}

// --- Représentants -------------------------------------------------------------------------------

const DAYS = [['1', 'Lundi'], ['2', 'Mardi'], ['3', 'Mercredi'], ['4', 'Jeudi'], ['5', 'Vendredi'], ['6', 'Samedi'], ['7', 'Dimanche']] as const

export type RepDraft = {
  id?: string; name: string; role: string; email: string; transfer_phone: string; languages: string[]; services: string[]
  hours: Record<string, [string, string][]>; status: 'auto' | 'unavailable'; priority: number; active: boolean
}

const hoursToText = (r: [string, string][] | undefined) => (r ?? []).map(([a, b]) => `${a}-${b}`).join(', ')
const textToHours = (s: string): [string, string][] =>
  s.split(',').map((x) => x.trim()).filter(Boolean).map((x) => x.split('-').map((y) => y.trim()) as [string, string]).filter((p) => p.length === 2)

export function RepEditor({ initial, services }: { initial: RepDraft; services: { code: string; label: string }[] }) {
  const [f, setF] = useState(initial)
  const [hours, setHours] = useState<Record<string, string>>(() => Object.fromEntries(DAYS.map(([d]) => [d, hoursToText(initial.hours[d])])))
  const { run, busy, feedback } = useOp()
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const h = Object.fromEntries(DAYS.map(([d]) => [d, textToHours(hours[d] ?? '')]).filter(([, v]) => (v as unknown[]).length))
    void run({ op: 'rep.save', ...f, id: f.id || undefined, hours: h }, 'Représentant enregistré.')
  }
  const fid = f.id ?? 'new'
  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label htmlFor={`r-name-${fid}`}>Nom</Label><input id={`r-name-${fid}`} required minLength={2} maxLength={120} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={fieldCls} /></div>
        <div><Label htmlFor={`r-role-${fid}`}>Fonction</Label><input id={`r-role-${fid}`} maxLength={120} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} className={fieldCls} /></div>
        <div><Label htmlFor={`r-mail-${fid}`}>E-mail professionnel (avis de rendez-vous)</Label><input id={`r-mail-${fid}`} type="email" maxLength={254} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className={fieldCls} /></div>
        <div><Label htmlFor={`r-tel-${fid}`}>Numéro de transfert (standard, phase 4)</Label><input id={`r-tel-${fid}`} type="tel" maxLength={20} value={f.transfer_phone} onChange={(e) => setF({ ...f, transfer_phone: e.target.value })} className={fieldCls} placeholder="+594 …" /></div>
      </div>
      <fieldset>
        <legend className="mb-1 text-[13.5px] font-semibold text-night-900">Langues parlées</legend>
        <div className="flex flex-wrap gap-4">
          {[['fr', 'Français'], ['en', 'English'], ['pt', 'Português']].map(([v, l]) => (
            <label key={v} className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={f.languages.includes(v)} onChange={() => setF({ ...f, languages: toggle(f.languages, v) })} />{l}</label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-1 text-[13.5px] font-semibold text-night-900">Services gérés</legend>
        <div className="flex flex-wrap gap-4">
          {services.map((s) => (
            <label key={s.code} className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={f.services.includes(s.code)} onChange={() => setF({ ...f, services: toggle(f.services, s.code) })} />{s.label}</label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-1 text-[13.5px] font-semibold text-night-900">Horaires (heure de Cayenne, ex. « 08:00-12:00, 14:00-17:00 »)</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {DAYS.map(([d, label]) => (
            <label key={d} className="flex items-center gap-2 text-[13.5px]">
              <span className="w-20 shrink-0 text-night-700">{label}</span>
              <input value={hours[d] ?? ''} onChange={(e) => setHours({ ...hours, [d]: e.target.value })} className={cn(fieldCls, 'h-10')} placeholder="Fermé" />
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor={`r-st-${fid}`}>Statut</Label>
          <select id={`r-st-${fid}`} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as RepDraft['status'] })} className={fieldCls}>
            <option value="auto">Selon les horaires</option><option value="unavailable">Absent (aucun transfert ni rendez-vous)</option>
          </select>
        </div>
        <div><Label htmlFor={`r-pr-${fid}`}>Priorité (plus petit = d’abord)</Label><input id={`r-pr-${fid}`} type="number" min={0} max={10000} value={f.priority} onChange={(e) => setF({ ...f, priority: Number(e.target.value) })} className={fieldCls} /></div>
        <label className="flex items-center gap-2 pt-7 text-[14px]"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />Actif</label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy || !f.languages.length} className={btnPrimaryCls}>{f.id ? 'Enregistrer' : 'Ajouter le représentant'}</button>
        {feedback}
      </div>
    </form>
  )
}

// --- Agenda --------------------------------------------------------------------------------------

export function TypeEditor({ initial }: { initial: { code: string; label: string; duration_min: number; buffer_min: number; min_notice_min: number; horizon_days: number; active: boolean } }) {
  const [f, setF] = useState(initial)
  const { run, busy, feedback } = useOp()
  const num = (k: 'duration_min' | 'buffer_min' | 'min_notice_min' | 'horizon_days', label: string, max: number) => (
    <label className="text-[12.5px] text-night-700">{label}<input type="number" min={0} max={max} value={f[k]} onChange={(e) => setF({ ...f, [k]: Number(e.target.value) })} className={cn(fieldCls, 'mt-1 h-10')} /></label>
  )
  return (
    <form onSubmit={(e) => { e.preventDefault(); const { label: _l, ...rest } = f; void _l; void run({ op: 'type.save', ...rest }, 'Type enregistré.') }} className="grid items-end gap-2 rounded-xl border border-night-100 p-3 sm:grid-cols-[1.4fr_repeat(4,1fr)_auto_auto]">
      <p className="text-[14px] font-semibold text-night-900">{f.label}</p>
      {num('duration_min', 'Durée (min)', 240)}
      {num('buffer_min', 'Tampon (min)', 120)}
      {num('min_notice_min', 'Délai min. (min)', 10080)}
      {num('horizon_days', 'Horizon (jours)', 365)}
      <label className="flex items-center gap-2 pb-2 text-[13.5px]"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />Actif</label>
      <button type="submit" disabled={busy} className={btnSecondaryCls}>Enregistrer</button>
      <div className="sm:col-span-7">{feedback}</div>
    </form>
  )
}

export function BlackoutForm({ reps }: { reps: { id: string; name: string }[] }) {
  const [f, setF] = useState({ rep: '', from: '', to: '', reason: '' })
  const { run, busy, feedback } = useOp()
  // Saisie en heure de Cayenne (UTC-3, sans heure d'été).
  const iso = (v: string) => `${v}:00-03:00`
  return (
    <form onSubmit={(e) => { e.preventDefault(); void run({ op: 'blackout.add', representative_id: f.rep || null, starts_at: iso(f.from), ends_at: iso(f.to), reason: f.reason || undefined }, 'Indisponibilité ajoutée.') }} className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]">
      <label className="text-[12.5px] text-night-700">Qui<select value={f.rep} onChange={(e) => setF({ ...f, rep: e.target.value })} className={cn(fieldCls, 'mt-1 h-10')}><option value="">Toute l’équipe</option>{reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
      <label className="text-[12.5px] text-night-700">Début (Cayenne)<input required type="datetime-local" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} className={cn(fieldCls, 'mt-1 h-10')} /></label>
      <label className="text-[12.5px] text-night-700">Fin (Cayenne)<input required type="datetime-local" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} className={cn(fieldCls, 'mt-1 h-10')} /></label>
      <label className="text-[12.5px] text-night-700">Motif<input maxLength={200} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} className={cn(fieldCls, 'mt-1 h-10')} placeholder="Congés, fermeture…" /></label>
      <button type="submit" disabled={busy} className={btnPrimaryCls}>Ajouter</button>
      <div className="sm:col-span-5">{feedback}</div>
    </form>
  )
}

/** Bouton d'action simple (annuler un rendez-vous, traiter un rappel, supprimer une indisponibilité). */
export function OpButton({ body, label, done, danger, confirm }: { body: Record<string, unknown>; label: string; done: string; danger?: boolean; confirm?: string }) {
  const { run, busy, feedback } = useOp()
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" disabled={busy} className={danger ? btnDangerCls : btnSecondaryCls} onClick={() => { if (!confirm || window.confirm(confirm)) void run(body, done) }}>{label}</button>
      {feedback}
    </span>
  )
}

// --- Textes par défaut -----------------------------------------------------------------------------

export function MessageEditor({ msgKey, locale, value, fallback, custom }: { msgKey: string; locale: string; value: string; fallback: string; custom: boolean }) {
  const [text, setText] = useState(value)
  const { run, busy, feedback } = useOp()
  const id = `m-${msgKey}-${locale}`
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-[12.5px] font-semibold uppercase text-night-500">{locale}{custom ? ' · modifié' : ''}</label>
      <textarea id={id} rows={2} maxLength={600} value={text} onChange={(e) => setText(e.target.value)} className={cn(fieldCls, 'h-auto py-2')} lang={locale} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy || !text.trim() || text === value} className={btnSecondaryCls} onClick={() => void run({ op: 'message.save', msg_key: msgKey, locale, text }, 'Texte enregistré.')}>Enregistrer</button>
        {custom && <button type="button" disabled={busy} className={btnSecondaryCls} onClick={() => { setText(fallback); void run({ op: 'message.reset', msg_key: msgKey, locale }, 'Texte par défaut rétabli.') }}>Texte par défaut</button>}
        {feedback}
      </div>
    </div>
  )
}
