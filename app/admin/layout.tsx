import 'server-only'
import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/admin/Sidebar'
import { TopBar } from '@/components/admin/TopBar'
import { cookies } from 'next/headers'
import { DEMO_COOKIE, DEMO_MODE } from '@/lib/demo-auth'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { ADMIN_MFA_ENROLL_PATH, getCurrentUser } from '@/lib/auth/session'

export const metadata = {
  title: 'Lien Parental · Admin',
  description: 'Back-office Lien Parental — gestion des contenus et des comptes.',
}

/**
 * Garde d'accès du back-office.
 *
 * - Lit la session via getCurrentUser() (auth.getUser revalidé + niveau MFA aal2 si 2FA).
 * - Pas de session   → page de connexion (?suite=/admin)
 * - Admin sans session aal2 (aucun facteur TOTP) → enrôlement 2FA (M7, audit v3)
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
    redirect('/onboarding/connexion?suite=/admin')
  }

  if (!SUPABASE_ENABLED) redirect('/')

  const user = await getCurrentUser()
  if (!user) redirect('/onboarding/connexion?suite=/admin')
  if (user.isAdmin !== true) {
    if (user.adminMfaRequired === true) redirect(ADMIN_MFA_ENROLL_PATH)
    redirect('/')
  }
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await guardAdmin()

  return (
    <div className="min-h-screen bg-night-50/40 text-night-900">
      <Sidebar />
      <TopBar />
      <main className="lg:pl-64">
        <div className="mx-auto w-full max-w-7xl px-4 lg:px-8 py-6 lg:py-10">{children}</div>
      </main>
    </div>
  )
}
