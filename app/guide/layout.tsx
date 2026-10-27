import type { ReactNode } from 'react'
import { SiteShell } from '@/components/site/SiteShell'

// Guide parental public : même en-tête et même pied de page que l'accueil, le blog et l'aide.
export default function GuidePublicLayout({ children }: { children: ReactNode }) {
  return <SiteShell mainClassName="bg-[#F7F9FC]">{children}</SiteShell>
}
