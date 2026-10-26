'use client'

/**
 * « Continuer avec Google » : connexion / inscription via Supabase Auth
 * (provider Google, flux PKCE : le code_verifier est conservé en cookie par
 * @supabase/ssr puis échangé côté serveur dans /auth/callback).
 *
 * Charte Google (https://developers.google.com/identity/branding-guidelines) :
 * logo « G » officiel 4 couleurs non modifié, fond blanc #FFFFFF, bordure
 * #747775, texte #1F1F1F, libellé « Continuer avec Google », forme pilule.
 *
 * Indisponible (démo, ou fournisseur Google non activé dans Supabase) :
 * le bouton reste visible et l'explique.
 */
import { useEffect, useId, useState } from 'react'
import { cn } from '@/lib/cn'
import { SUPABASE_ANON_KEY, SUPABASE_ENABLED, SUPABASE_URL } from '@/lib/supabase/config'
import { createClient } from '@/lib/supabase/client'
import { appUrl, safeNext } from '@/lib/auth/redirect'

const UNAVAILABLE = 'Connexion Google disponible une fois le service configuré.'

type Props = {
  /** Chemin interne après connexion (filtré par safeNext côté client ET serveur). */
  next?: string
  className?: string
}

/** Lit /auth/v1/settings (public) une seule fois par onglet : le fournisseur Google est-il activé ? */
let providerCheck: Promise<boolean> | null = null
function googleProviderEnabled(): Promise<boolean> {
  providerCheck ??= fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_ANON_KEY } })
    .then(async (r) => {
      if (!r.ok) return true // doute : on laisse essayer, GoTrue renverra une erreur explicite
      const body = (await r.json().catch(() => null)) as { external?: { google?: boolean } } | null
      return body?.external?.google !== false
    })
    .catch(() => true)
  return providerCheck
}

export function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
      <path fill="none" d="M0 0h48v48H0z" />
    </svg>
  )
}

export function GoogleButton({ next = '/app', className }: Props) {
  const noteId = useId()
  const [available, setAvailable] = useState<boolean>(SUPABASE_ENABLED)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!SUPABASE_ENABLED) return
    let alive = true
    void googleProviderEnabled().then((ok) => { if (alive) setAvailable(ok) })
    return () => { alive = false }
  }, [])

  const onClick = async () => {
    if (!available || loading) return
    setLoading(true)
    setError(null)
    const target = safeNext(next, '/app')
    const { error: err } = await createClient().auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${appUrl()}/auth/callback?flow=google&next=${encodeURIComponent(target)}`,
        // Laisse choisir le compte Google (utile sur un appareil partagé).
        queryParams: { prompt: 'select_account' },
      },
    })
    // En cas de succès, le navigateur part vers Google : on reste en chargement.
    if (err) {
      setLoading(false)
      setError('La connexion avec Google n’a pas pu démarrer. Réessayez.')
    }
  }

  const note = !available ? UNAVAILABLE : error

  return (
    <div className={cn('w-full', className)}>
      <button
        type="button"
        onClick={onClick}
        aria-disabled={!available || loading ? true : undefined}
        aria-describedby={note ? noteId : undefined}
        aria-busy={loading || undefined}
        className={cn(
          // Charte Google : fond blanc, bordure #747775, texte #1F1F1F, police Roboto (repli Arial).
          'relative inline-flex h-12 w-full items-center justify-center gap-3 rounded-full border border-[#747775] bg-white px-5',
          '[font-family:Roboto,Arial,sans-serif] text-[15px] font-medium tracking-[0.01em] text-[#1F1F1F]',
          'transition-colors duration-200 hover:bg-[#F8F9FA] active:bg-[#F1F3F4] motion-reduce:transition-none',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:ring-offset-2',
          (!available || loading) && 'cursor-not-allowed hover:bg-white',
          !available && 'opacity-60',
        )}
      >
        <GoogleLogo className="h-5 w-5 shrink-0" />
        <span>{loading ? 'Redirection vers Google…' : 'Continuer avec Google'}</span>
      </button>
      <p id={noteId} role={error ? 'alert' : 'status'} className={cn('min-h-0 text-center text-[12.5px]', note && 'mt-2', error ? 'font-semibold text-alert-600' : 'text-night-600')}>
        {note}
      </p>
    </div>
  )
}

/** Séparateur « ou » entre le bouton Google et le formulaire e-mail. */
export function OrSeparator({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-3', className)} role="separator" aria-label="ou">
      <span className="h-px flex-1 bg-[#E5E7EB]" aria-hidden="true" />
      <span className="text-[12.5px] font-medium text-night-600" aria-hidden="true">ou</span>
      <span className="h-px flex-1 bg-[#E5E7EB]" aria-hidden="true" />
    </div>
  )
}
