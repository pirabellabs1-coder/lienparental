import type { ReactNode } from 'react'

/**
 * Onboarding (10 steps). Each screen renders its own progress
 * (dots bottom-left + "n / total" bottom-right, cf. mockups) via OnboardingScreen.
 * Step map: 1-4 /onboarding (carousel) · 5 connexion · 6 inscription ·
 * 7 verification · 8 profil · 9 enfant (+ recap) · 10 pret.
 */
export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return <main className="flex flex-1 flex-col">{children}</main>
}
