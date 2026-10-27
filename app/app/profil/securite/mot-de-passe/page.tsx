'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, Circle, LockKeyhole } from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { Banner, btn } from '@/components/profil/kit'
import { PasswordField } from '@/components/profil/fields'
import { cn } from '@/lib/cn'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { changePassword } from '@/lib/auth/actions'

// Libellés traduits au rendu : account.security.password.rules.{key} / levels.{n}.
const RULES = [
  { test: (p: string) => p.length >= 8, key: 'length' },
  { test: (p: string) => /[a-z]/.test(p) && /[A-Z]/.test(p), key: 'case' },
  { test: (p: string) => /\d/.test(p), key: 'digit' },
  { test: (p: string) => /[^A-Za-z0-9]/.test(p), key: 'symbol' },
] as const

function score(pw: string) {
  if (!pw) return 0
  return RULES.filter(r => r.test(pw)).length + (pw.length >= 12 ? 1 : 0)
}

export default function MotDePassePage() {
  const t = useTranslations('account.security.password')
  const router = useRouter()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(false)

  const s = useMemo(() => score(next), [next])
  const mismatch = confirm.length > 0 && confirm !== next

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(undefined)
    if (!current) return setError(t('errors.current'))
    if (!RULES.every(r => r.test(next))) return setError(t('errors.rules'))
    if (next !== confirm) return setError(t('errors.mismatch'))
    setLoading(true)
    if (SUPABASE_ENABLED) {
      // Serveur : vérification du mot de passe actuel (client éphémère), updateUser,
      // puis déconnexion des autres appareils.
      const res = await changePassword({ current, next })
      setLoading(false)
      if (!res.ok) {
        if (res.reason === 'unauthenticated' || res.reason === 'mfa_required') { router.push('/onboarding/connexion?suite=/app/profil/securite/mot-de-passe'); return }
        return setError(res.error)
      }
      setCurrent(''); setNext(''); setConfirm('')
      router.push('/app/profil/securite')
      return
    }
    await new Promise(r => setTimeout(r, 500))
    setLoading(false)
    router.push('/app/profil/securite')
  }

  return (
    <>
      <TopBar title={t('title')} showBack backHref="/app/profil/securite" showBell={false} />
      <form onSubmit={submit} className="space-y-5 px-5 pb-8 pt-3">
        <Banner icon={<LockKeyhole className="h-7 w-7" strokeWidth={1.8} />} title={t('bannerTitle')}>
          {t('bannerText')}
        </Banner>

        <PasswordField label={t('current')} autoComplete="current-password" required value={current} onChange={e => setCurrent(e.target.value)} />

        <div>
          <PasswordField label={t('new')} autoComplete="new-password" required value={next} onChange={e => setNext(e.target.value)} aria-describedby="pw-strength pw-rules" />
          <div id="pw-strength" className="mt-4">
            <p className="text-[13px] font-medium text-leaf-600">
              {t('strength')}{next && <span className="text-night-700">{t('strengthValue', { level: t(`levels.${Math.min(s, 4)}`) })}</span>}
            </p>
            <div aria-hidden className="mt-2 flex gap-1.5">
              {[0, 1, 2, 3, 4].map(i => (
                <span key={i} className={cn('h-1.5 flex-1 rounded-full transition-colors', i < s ? (s <= 2 ? 'bg-gold-300' : 'bg-leaf-500') : 'bg-night-100')} />
              ))}
            </div>
          </div>
        </div>

        <PasswordField
          label={t('confirm')}
          autoComplete="new-password"
          required
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          error={mismatch ? t('errors.mismatch') : undefined}
        />

        <div id="pw-rules" className="rounded-xl2 border border-leaf-100 bg-leaf-50/60 p-4">
          <p className="text-[13px] font-bold text-night-900">
            {t.rich('tips', { em: (chunks) => <span className="text-leaf-600">{chunks}</span> })}
          </p>
          <ul className="mt-3 space-y-2">
            {RULES.map(r => {
              const ok = r.test(next)
              return (
                <li key={r.key} className="flex items-center gap-2.5 text-[12.5px] text-night-800">
                  {ok || !next
                    ? <Check className={cn('h-4 w-4 shrink-0', ok ? 'text-leaf-500' : 'text-leaf-300')} strokeWidth={2.75} aria-hidden />
                    : <Circle className="h-3.5 w-3.5 shrink-0 text-night-300" aria-hidden />}
                  {t(`rules.${r.key}`)}
                  {next && <span className="sr-only">{ok ? t('ruleOk') : t('ruleKo')}</span>}
                </li>
              )
            })}
          </ul>
        </div>

        {error && <p role="alert" className="text-sm font-medium text-alert-500">{error}</p>}

        <button type="submit" disabled={loading} aria-busy={loading} className={btn.primary}>
          {loading ? t('saving') : t('save')}
        </button>
      </form>
    </>
  )
}
