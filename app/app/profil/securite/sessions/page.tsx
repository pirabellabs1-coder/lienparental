'use client'

import { useEffect, useState } from 'react'
import { Laptop, Monitor, MoreHorizontal, Smartphone } from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { ConfirmDialog, EmptyState } from '@/components/ui'
import { Banner, SectionTitle, btn } from '@/components/profil/kit'
import { cn } from '@/lib/cn'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { createClient } from '@/lib/supabase/client'
import { authErrorMessage } from '@/lib/auth/errors'

// Supabase : sessions issues de auth.sessions via RPC list_my_sessions (0200, aucune IP exposée),
// révocation unitaire via revoke_my_session, « toutes les autres » via signOut({ scope: 'others' }).
// Démonstration : données fictives.
type Session = { id: string; device: 'phone' | 'laptop' | 'desktop'; name: string; place: string; os: string; when: string }

const DEMO_CURRENT: Session = { id: 's_current', device: 'phone', name: 'iPhone 14 Pro', place: 'Paris, France', os: 'iOS 17.5', when: 'Aujourd’hui à 09:41' }
const DEMO_OTHERS: Session[] = [
  { id: 's_2', device: 'laptop', name: 'MacBook Pro 14', place: 'Paris, France', os: 'macOS 14.4', when: 'Hier à 18:32' },
  { id: 's_3', device: 'desktop', name: 'Windows PC', place: 'Lyon, France', os: 'Windows 11', when: '12 mai 2025 à 14:15' },
]

const ICONS = {
  phone: <Smartphone className="h-6 w-6" strokeWidth={1.7} />,
  laptop: <Laptop className="h-6 w-6" strokeWidth={1.7} />,
  desktop: <Monitor className="h-6 w-6" strokeWidth={1.7} />,
}

/** Lecture indicative du user-agent (affichage uniquement, jamais pour une décision de sécurité). */
function describeUA(ua: string | null | undefined): Pick<Session, 'device' | 'name' | 'os' | 'place'> {
  const s = ua ?? ''
  const browser = /Edg\//.test(s) ? 'Edge' : /OPR\//.test(s) ? 'Opera' : /Firefox\//.test(s) ? 'Firefox' : /Chrome\//.test(s) ? 'Chrome' : /Safari\//.test(s) ? 'Safari' : 'Navigateur'
  if (/iPhone/.test(s)) return { device: 'phone', name: 'iPhone', os: 'iOS', place: browser }
  if (/iPad/.test(s)) return { device: 'phone', name: 'iPad', os: 'iPadOS', place: browser }
  if (/Android/.test(s)) return { device: 'phone', name: 'Appareil Android', os: 'Android', place: browser }
  if (/Macintosh|Mac OS X/.test(s)) return { device: 'laptop', name: 'Mac', os: 'macOS', place: browser }
  if (/Windows/.test(s)) return { device: 'desktop', name: 'PC Windows', os: 'Windows', place: browser }
  if (/Linux/.test(s)) return { device: 'desktop', name: 'Ordinateur Linux', os: 'Linux', place: browser }
  return { device: 'desktop', name: 'Appareil inconnu', os: 'Système inconnu', place: browser }
}

function formatWhen(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const time = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(d)
  const today = new Date()
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return `Aujourd’hui à ${time}`
  if (d.toDateString() === yesterday.toDateString()) return `Hier à ${time}`
  return `${new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(d)} à ${time}`
}

/** session_id du jeton d'accès courant (affichage uniquement ; la RLS/RPC revérifie côté serveur). */
function currentSessionId(accessToken: string | undefined): string | null {
  try {
    const payload = accessToken?.split('.')[1]
    if (!payload) return null
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { session_id?: string }
    return json.session_id ?? null
  } catch {
    return null
  }
}

export default function SessionsPage() {
  const [current, setCurrent] = useState<Session | null>(SUPABASE_ENABLED ? null : DEMO_CURRENT)
  const [others, setOthers] = useState<Session[]>(SUPABASE_ENABLED ? [] : DEMO_OTHERS)
  const [loadingList, setLoadingList] = useState(SUPABASE_ENABLED)
  const [target, setTarget] = useState<Session | 'all' | null>(null)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!SUPABASE_ENABLED) return
    ;(async () => {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const currentId = currentSessionId(session?.access_token)
      const { data, error: err } = await supabase.rpc('list_my_sessions')
      setLoadingList(false)
      const here: Session = {
        id: currentId ?? 'current',
        ...describeUA(typeof navigator !== 'undefined' ? navigator.userAgent : ''),
        when: session?.user.last_sign_in_at ? `Connexion : ${formatWhen(session.user.last_sign_in_at)}` : '',
      }
      if (err || !data) {
        setCurrent(here)
        setError('Impossible de charger la liste des autres sessions.')
        return
      }
      const rows = data.map(r => ({ id: r.id, ...describeUA(r.user_agent), when: `Dernière activité : ${formatWhen(r.updated_at)}` }))
      const mine = rows.find(r => r.id === currentId)
      setCurrent(mine ? { ...mine, ...describeUA(navigator.userAgent), when: here.when || mine.when } : here)
      setOthers(rows.filter(r => r.id !== currentId))
    })()
  }, [])

  const confirm = async () => {
    if (!target) return
    setLoading(true)
    setError(null)
    if (SUPABASE_ENABLED) {
      const supabase = createClient()
      if (target === 'all') {
        const { error: err } = await supabase.auth.signOut({ scope: 'others' })
        if (err) { setLoading(false); setTarget(null); setError(authErrorMessage(err)); return }
        setOthers([])
        setStatus('Toutes les autres sessions ont été déconnectées.')
      } else {
        const { error: err } = await supabase.rpc('revoke_my_session', { p_session_id: target.id })
        if (err) { setLoading(false); setTarget(null); setError('Impossible de déconnecter cet appareil pour le moment.'); return }
        setOthers(o => o.filter(s => s.id !== target.id))
        setStatus(`${target.name} a été déconnecté.`)
      }
      setLoading(false)
      setTarget(null)
      return
    }
    await new Promise(r => setTimeout(r, 400))
    if (target === 'all') { setOthers([]); setStatus('Toutes les autres sessions ont été déconnectées.') }
    else { setOthers(o => o.filter(s => s.id !== target.id)); setStatus(`${target.name} a été déconnecté.`) }
    setLoading(false)
    setTarget(null)
  }

  return (
    <>
      <TopBar title="Sessions actives" showBack backHref="/app/profil/securite" showBell={false} />
      <div className="px-5 pb-8 pt-3">
        <Banner tone="night" className="bg-leaf-50/50" icon={<Laptop className="h-7 w-7" strokeWidth={1.7} />} title="Gérez vos appareils">
          Vous êtes connecté sur ces appareils. Déconnectez ceux que vous ne reconnaissez pas.
        </Banner>

        <SectionTitle className="mt-7">Session actuelle</SectionTitle>
        {current ? <SessionCard session={current} current /> : <p className="text-[12.5px] text-night-600" aria-busy="true">Chargement…</p>}

        <SectionTitle className="mt-7">Autres sessions</SectionTitle>
        {error && <p role="alert" className="mb-3 text-sm font-medium text-alert-500">{error}</p>}
        {loadingList ? (
          <p className="text-[12.5px] text-night-600" aria-busy="true">Chargement…</p>
        ) : others.length === 0 ? (
          <EmptyState title="Aucune autre session" description="Votre compte n’est ouvert que sur cet appareil." />
        ) : (
          <ul className="space-y-3">
            {others.map(s => (
              <li key={s.id}><SessionCard session={s} onAction={() => setTarget(s)} /></li>
            ))}
          </ul>
        )}

        <p className="sr-only" aria-live="polite">{status}</p>

        {others.length > 0 && (
          <button type="button" onClick={() => setTarget('all')} className={cn(btn.dangerOutline, 'mt-10 text-[14px]')}>
            Se déconnecter de toutes
            <br className="hidden" /> les autres sessions
          </button>
        )}
      </div>

      <ConfirmDialog
        open={target !== null}
        onClose={() => setTarget(null)}
        onConfirm={confirm}
        loading={loading}
        title={target === 'all' ? 'Déconnecter les autres sessions ?' : 'Déconnecter cet appareil ?'}
        description={target === 'all' ? 'Tous les autres appareils devront se reconnecter.' : target ? `${target.name} — ${target.place}` : ''}
        confirmLabel="Déconnecter"
      />
    </>
  )
}

function SessionCard({ session, current, onAction }: { session: Session; current?: boolean; onAction?: () => void }) {
  return (
    <div className={cn('relative flex gap-4 rounded-xl2 border bg-white p-4 shadow-soft', current ? 'border-leaf-300 bg-leaf-50/30' : 'border-night-100')}>
      <span aria-hidden className="mt-0.5 shrink-0 text-night-900">{ICONS[session.device]}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-bold text-night-900">{session.name}</p>
        <p className="mt-1.5 text-[12.5px] text-night-800">{session.place} • {session.os}</p>
        {session.when && <p className="mt-1.5 text-[12.5px] text-night-800">{session.when}</p>}
      </div>
      {current && <span className="text-[12px] font-bold text-leaf-600">Actuelle</span>}
      {onAction && (
        <button
          type="button"
          onClick={onAction}
          aria-label={`Déconnecter ${session.name}`}
          className="-mr-2 -mt-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-night-900 hover:bg-night-50"
        >
          <MoreHorizontal className="h-5 w-5" aria-hidden />
        </button>
      )}
    </div>
  )
}
