'use client'

import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Laptop, Monitor, MoreHorizontal, Smartphone } from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { ConfirmDialog, EmptyState } from '@/components/ui'
import { Banner, SectionTitle, btn } from '@/components/profil/kit'
import { cn } from '@/lib/cn'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { createClient } from '@/lib/supabase/client'
import { authErrorMessage } from '@/lib/auth/errors'
import { intlLocale } from '@/lib/i18n/config'

// Supabase : sessions issues de auth.sessions via RPC list_my_sessions (0200, aucune IP exposée),
// révocation unitaire via revoke_my_session, « toutes les autres » via signOut({ scope: 'others' }).
// Démonstration : données fictives.
type Session = { id: string; device: 'phone' | 'laptop' | 'desktop'; name: string; place: string; os: string; when: string }

type T = ReturnType<typeof useTranslations>

const demoCurrent = (t: T): Session => ({ id: 's_current', device: 'phone', name: 'iPhone 14 Pro', place: 'Paris, France', os: 'iOS 17.5', when: t('today', { time: '09:41' }) })
const demoOthers = (t: T, locale: string): Session[] => [
  { id: 's_2', device: 'laptop', name: 'MacBook Pro 14', place: 'Paris, France', os: 'macOS 14.4', when: t('yesterday', { time: '18:32' }) },
  { id: 's_3', device: 'desktop', name: 'Windows PC', place: 'Lyon, France', os: 'Windows 11', when: t('dateAt', { date: new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(2025, 4, 12)), time: '14:15' }) },
]

const ICONS = {
  phone: <Smartphone className="h-6 w-6" strokeWidth={1.7} />,
  laptop: <Laptop className="h-6 w-6" strokeWidth={1.7} />,
  desktop: <Monitor className="h-6 w-6" strokeWidth={1.7} />,
}

/** Lecture indicative du user-agent (affichage uniquement, jamais pour une décision de sécurité). */
function describeUA(ua: string | null | undefined, t: T): Pick<Session, 'device' | 'name' | 'os' | 'place'> {
  const s = ua ?? ''
  const browser = /Edg\//.test(s) ? 'Edge' : /OPR\//.test(s) ? 'Opera' : /Firefox\//.test(s) ? 'Firefox' : /Chrome\//.test(s) ? 'Chrome' : /Safari\//.test(s) ? 'Safari' : t('ua.browser')
  if (/iPhone/.test(s)) return { device: 'phone', name: 'iPhone', os: 'iOS', place: browser }
  if (/iPad/.test(s)) return { device: 'phone', name: 'iPad', os: 'iPadOS', place: browser }
  if (/Android/.test(s)) return { device: 'phone', name: t('ua.android'), os: 'Android', place: browser }
  if (/Macintosh|Mac OS X/.test(s)) return { device: 'laptop', name: 'Mac', os: 'macOS', place: browser }
  if (/Windows/.test(s)) return { device: 'desktop', name: t('ua.windows'), os: 'Windows', place: browser }
  if (/Linux/.test(s)) return { device: 'desktop', name: t('ua.linux'), os: 'Linux', place: browser }
  return { device: 'desktop', name: t('ua.unknownDevice'), os: t('ua.unknownOs'), place: browser }
}

function formatWhen(iso: string, t: T, locale: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const time = new Intl.DateTimeFormat(intlLocale(locale), { hour: '2-digit', minute: '2-digit' }).format(d)
  const today = new Date()
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return t('today', { time })
  if (d.toDateString() === yesterday.toDateString()) return t('yesterday', { time })
  return t('dateAt', { date: new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'long', year: 'numeric' }).format(d), time })
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
  const t = useTranslations('account.security.sessions')
  const locale = useLocale()
  const [current, setCurrent] = useState<Session | null>(() => (SUPABASE_ENABLED ? null : demoCurrent(t)))
  const [others, setOthers] = useState<Session[]>(() => (SUPABASE_ENABLED ? [] : demoOthers(t, locale)))
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
        ...describeUA(typeof navigator !== 'undefined' ? navigator.userAgent : '', t),
        when: session?.user.last_sign_in_at ? t('signedIn', { when: formatWhen(session.user.last_sign_in_at, t, locale) }) : '',
      }
      if (err || !data) {
        setCurrent(here)
        setError(t('loadError'))
        return
      }
      const rows = data.map(r => ({ id: r.id, ...describeUA(r.user_agent, t), when: t('lastActivity', { when: formatWhen(r.updated_at, t, locale) }) }))
      const mine = rows.find(r => r.id === currentId)
      setCurrent(mine ? { ...mine, ...describeUA(navigator.userAgent, t), when: here.when || mine.when } : here)
      setOthers(rows.filter(r => r.id !== currentId))
    })()
    // Relu si la langue change (libellés « Connexion : … » traduits à la construction).
  }, [t, locale])

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
        setStatus(t('allRevoked'))
      } else {
        const { error: err } = await supabase.rpc('revoke_my_session', { p_session_id: target.id })
        if (err) { setLoading(false); setTarget(null); setError(t('revokeError')); return }
        setOthers(o => o.filter(s => s.id !== target.id))
        setStatus(t('revoked', { name: target.name }))
      }
      setLoading(false)
      setTarget(null)
      return
    }
    await new Promise(r => setTimeout(r, 400))
    if (target === 'all') { setOthers([]); setStatus(t('allRevoked')) }
    else { setOthers(o => o.filter(s => s.id !== target.id)); setStatus(t('revoked', { name: target.name })) }
    setLoading(false)
    setTarget(null)
  }

  return (
    <>
      <TopBar title={t('title')} showBack backHref="/app/profil/securite" showBell={false} />
      <div className="px-5 pb-8 pt-3">
        <Banner tone="night" className="bg-leaf-50/50" icon={<Laptop className="h-7 w-7" strokeWidth={1.7} />} title={t('bannerTitle')}>
          {t('bannerText')}
        </Banner>

        <SectionTitle className="mt-7">{t('current')}</SectionTitle>
        {current ? <SessionCard session={current} current /> : <p className="text-[12.5px] text-night-600" aria-busy="true">{t('loading')}</p>}

        <SectionTitle className="mt-7">{t('others')}</SectionTitle>
        {error && <p role="alert" className="mb-3 text-sm font-medium text-alert-500">{error}</p>}
        {loadingList ? (
          <p className="text-[12.5px] text-night-600" aria-busy="true">{t('loading')}</p>
        ) : others.length === 0 ? (
          <EmptyState title={t('emptyTitle')} description={t('emptyText')} />
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
            {t('revokeAll1')}
            <br className="hidden" /> {t('revokeAll2')}
          </button>
        )}
      </div>

      <ConfirmDialog
        open={target !== null}
        onClose={() => setTarget(null)}
        onConfirm={confirm}
        loading={loading}
        title={target === 'all' ? t('confirmAllTitle') : t('confirmOneTitle')}
        description={target === 'all' ? t('confirmAllText') : target ? `${target.name} — ${target.place}` : ''}
        confirmLabel={t('confirm')}
      />
    </>
  )
}

function SessionCard({ session, current, onAction }: { session: Session; current?: boolean; onAction?: () => void }) {
  const t = useTranslations('account.security.sessions')
  return (
    <div className={cn('relative flex gap-4 rounded-xl2 border bg-white p-4 shadow-soft', current ? 'border-leaf-300 bg-leaf-50/30' : 'border-night-100')}>
      <span aria-hidden className="mt-0.5 shrink-0 text-night-900">{ICONS[session.device]}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-bold text-night-900">{session.name}</p>
        <p className="mt-1.5 text-[12.5px] text-night-800">{session.place} • {session.os}</p>
        {session.when && <p className="mt-1.5 text-[12.5px] text-night-800">{session.when}</p>}
      </div>
      {current && <span className="text-[12px] font-bold text-leaf-600">{t('currentBadge')}</span>}
      {onAction && (
        <button
          type="button"
          onClick={onAction}
          aria-label={t('revokeAria', { name: session.name })}
          className="-mr-2 -mt-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-night-900 hover:bg-night-50"
        >
          <MoreHorizontal className="h-5 w-5" aria-hidden />
        </button>
      )}
    </div>
  )
}
