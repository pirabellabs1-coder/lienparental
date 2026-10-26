'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Mail } from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { Switch } from '@/components/ui'
import { Banner, btn } from '@/components/profil/kit'
import { cn } from '@/lib/cn'

export default function EmailsConnexionPage() {
  const router = useRouter()
  const [enabled, setEnabled] = useState(true)
  const [saving, setSaving] = useState(false)

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    // NOTE Supabase: update `profiles.login_email_alerts`.
    await new Promise(r => setTimeout(r, 400))
    router.push('/app/profil/securite')
  }

  return (
    <>
      <TopBar title="E-mails de connexion" showBack backHref="/app/profil/securite" showBell={false} />
      <form onSubmit={save} className="flex min-h-[calc(100dvh-170px)] flex-col px-5 pb-8 pt-3">
        <Banner icon={<Mail className="h-7 w-7" strokeWidth={1.8} />} title="Soyez notifié">
          Recevez un e-mail à chaque nouvelle connexion sur votre compte.
        </Banner>

        <Switch
          containerClassName="mt-8 items-start"
          label={<span className="font-bold">Recevoir des e-mails de connexion</span>}
          description="Vous serez informé par e-mail lorsqu’une nouvelle connexion est détectée."
          checked={enabled}
          onChange={e => setEnabled(e.target.checked)}
        />

        <div className="flex-1" />
        <button type="submit" disabled={saving} aria-busy={saving} className={cn(btn.primary, 'mt-10')}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </form>
    </>
  )
}
