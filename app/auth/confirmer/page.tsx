/**
 * /auth/confirmer : page intermédiaire des liens e-mail. Le jeton n'est consommé qu'au clic
 * sur « Continuer » (POST /auth/confirm, même origine), jamais par une simple ouverture du lien
 * (scanners de liens des messageries).
 */
import type { Metadata } from 'next'
import Link from 'next/link'
import { MailCheck } from 'lucide-react'
import { cn } from '@/lib/cn'
import { btn } from '@/components/onboarding/styles'

export const metadata: Metadata = { title: 'Confirmation', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

const COPY: Record<string, { title: string; text: string; action: string }> = {
  signup: { title: 'Confirmer votre adresse', text: 'Dernière étape : confirmez votre adresse e-mail pour activer votre compte Lien Parental.', action: 'Confirmer mon adresse' },
  recovery: { title: 'Réinitialiser votre mot de passe', text: 'Continuez pour choisir un nouveau mot de passe.', action: 'Continuer' },
  email_change: { title: 'Confirmer la nouvelle adresse', text: 'Continuez pour confirmer le changement d’adresse e-mail de votre compte.', action: 'Confirmer' },
}
const DEFAULT_COPY = { title: 'Confirmation', text: 'Continuez pour terminer l’opération demandée.', action: 'Continuer' }
const TYPES = ['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email']

type Search = Promise<Record<string, string | string[] | undefined>>

export default async function ConfirmerPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams
  const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '')
  const type = one(sp.type)
  const tokenHash = one(sp.token_hash)
  const next = one(sp.next).slice(0, 200)
  const valid = TYPES.includes(type) && /^[A-Za-z0-9_-]{8,200}$/.test(tokenHash)
  const copy = COPY[type] ?? DEFAULT_COPY

  return (
    <main className="flex min-h-dvh flex-1 flex-col items-center justify-center bg-white px-5 py-10">
      <div className="w-full max-w-sm text-center">
        <span className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-full bg-leaf-50 text-leaf-600" aria-hidden="true">
          <MailCheck className="h-8 w-8" />
        </span>
        {valid ? (
          <>
            <h1 className="text-[22px] font-bold text-night-900">{copy.title}</h1>
            <p className="mt-3 text-[15px] leading-6 text-night-700">{copy.text}</p>
            <form method="post" action="/auth/confirm" className="mt-8">
              <input type="hidden" name="token_hash" value={tokenHash} />
              <input type="hidden" name="type" value={type} />
              {next && <input type="hidden" name="next" value={next} />}
              <button type="submit" className={cn(btn.primary, 'w-full')}>{copy.action}</button>
            </form>
          </>
        ) : (
          <>
            <h1 className="text-[22px] font-bold text-night-900">Lien invalide</h1>
            <p className="mt-3 text-[15px] leading-6 text-night-700">Ce lien est incomplet ou a expiré. Demandez-en un nouveau.</p>
            <Link href="/onboarding/connexion" className={cn(btn.primary, 'mt-8 w-full')}>Retour à la connexion</Link>
          </>
        )}
      </div>
    </main>
  )
}
