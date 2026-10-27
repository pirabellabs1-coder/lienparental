'use client'

import { use, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Lock, MessageCircle, Sparkles } from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { btn, card } from '@/components/ui/kit'
import { cn } from '@/lib/cn'
import { acceptInvite } from '@/lib/messages'

// Acceptation d'une invitation de l'autre parent (compte requis : la route /app est protégée).
export default function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const t = useTranslations('messaging.invitation')
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const accept = async () => {
    setBusy(true)
    setError(null)
    try {
      const conversationId = await acceptInvite(token)
      router.push(`/app/messages/${encodeURIComponent(conversationId)}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('invalid'))
      setBusy(false)
    }
  }

  return (
    <>
      <TopBar title={t('title')} showBack backHref="/app" showBell={false} />
      <div className="w-full px-5 pb-8 pt-2">
        <section aria-labelledby="inv-title" className={cn(card, 'mx-auto max-w-lg p-5')}>
          <span aria-hidden="true" className="grid h-12 w-12 place-items-center rounded-xl bg-leaf-50 text-leaf-600">
            <MessageCircle className="h-6 w-6" strokeWidth={1.9} />
          </span>
          <h2 id="inv-title" className="mt-4 text-[18px] font-extrabold text-night-900">{t('heading')}</h2>
          <p className="mt-1.5 text-[14px] text-night-600">
            {t('intro')}
          </p>
          <ul className="mt-4 space-y-2.5">
            <li className="flex gap-2.5 text-[13px] text-night-800">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-leaf-600" aria-hidden="true" />
              {t('immutable')}
            </li>
            <li className="flex gap-2.5 text-[13px] text-night-800">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-iris-600" aria-hidden="true" />
              {t('tone')}
            </li>
          </ul>
          {error && <p role="alert" className="mt-4 rounded-xl bg-alert-50 p-3 text-[13px] font-semibold text-alert-700">{error}</p>}
          <button type="button" onClick={() => void accept()} disabled={busy} className={cn(btn.primary, 'mt-5 w-full')}>
            {busy ? t('connecting') : t('accept')}
          </button>
          <button type="button" onClick={() => router.push('/app')} className={cn(btn.secondary, 'mt-2.5 w-full')}>
            {t('later')}
          </button>
        </section>
      </div>
    </>
  )
}
