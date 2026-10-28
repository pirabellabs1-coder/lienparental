import 'server-only'
import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/admin/Sidebar'
import { TopBar } from '@/components/admin/TopBar'
import { cookies } from 'next/headers'
import { DEMO_COOKIE, DEMO_MODE } from '@/lib/demo-auth'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { getCurrentUser } from '@/lib/auth/session'
import { ADMIN_LOGIN_PATH } from '@/lib/admin/gate'
import { NOINDEX_NOFOLLOW } from '@/lib/seo/metadata'
import { ScopedIntlProvider } from '@/components/i18n/ScopedIntlProvider'
import { CLIENT_NS_ADMIN } from '@/lib/i18n/client-namespaces'

export const metadata = {
  title: 'Lien Parental · Admin',
  description: 'Back-office Lien Parental — gestion des contenus et des comptes.',
  robots: NOINDEX_NOFOLLOW,
}

/**
 * Garde d'accès du back-office.
 *
 * - Lit la session via getCurrentUser() (auth.getUser revalidé).
 * - Pas de session   → formulaire de connexion DÉDIÉ à l'admin (/console)
 * - Pas admin        → redirect('/')   (jamais 401/403 : moins de leak)
 * - Erreur RPC       → redirect('/')   (fail-closed : isAdmin === true exigé)
 * - Ni Supabase ni démo configurés → redirect('/')
 *
 * Le vrai contrôle d'admin vit côté Postgres (RPC `is_admin()`,
 * SECURITY DEFINER, cf. supabase/migrations/0102_admin.sql). On ne fait
 * JAMAIS confiance à une valeur côté client.
 */
async function guardAdmin() {
  // Mode démonstration (désactivé en production par défaut) : session du compte admin de démo.
  if (DEMO_MODE) {
    if ((await cookies()).get(DEMO_COOKIE)?.value === 'admin') return
    redirect(ADMIN_LOGIN_PATH)
  }

  if (!SUPABASE_ENABLED) redirect('/')

  const user = await getCurrentUser()
  // Pas de session → formulaire de connexion DÉDIÉ à l'admin (isolé des parents).
  if (!user) redirect(ADMIN_LOGIN_PATH)
  // Pas admin → accueil (jamais 401/403 : moins de fuite d'information).
  if (user.isAdmin !== true) redirect('/')
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await guardAdmin()

  // Identité affichée dans la navigation (getCurrentUser est mémoïsé par requête).
  const user = await getCurrentUser()
  const identity = user ? { name: `${user.prenom} ${user.nom}`.trim(), email: user.email } : undefined

  return (
    // Seuls les textes des composants client partagés utilisés par l'admin (audit C3).
    <ScopedIntlProvider namespaces={CLIENT_NS_ADMIN}>
    <div className="min-h-screen bg-night-50/40 text-night-900">
      <Sidebar user={identity} />
      <TopBar user={identity} />
      <main className="lg:pl-64">
        <div className="mx-auto w-full max-w-7xl px-4 lg:px-8 py-6 lg:py-10">{children}</div>
      </main>
    </div>
    </ScopedIntlProvider>
  )
}
