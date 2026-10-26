import type { ReactNode } from 'react'
import { SiteShell } from '@/components/site/SiteShell'

// Pages légales : même en-tête et même pied de page que l'accueil.
export default function LegalLayout({ children }: { children: ReactNode }) {
  return <SiteShell mainClassName="bg-[#F7F9FC]">{children}</SiteShell>
}
