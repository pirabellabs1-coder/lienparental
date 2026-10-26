import type { ReactNode } from 'react'
import { SiteShell } from '@/components/site/SiteShell'

// Blog : même en-tête et même pied de page que l'accueil et les autres pages publiques.
export default function BlogLayout({ children }: { children: ReactNode }) {
  return <SiteShell>{children}</SiteShell>
}
