import type { ReactNode } from 'react'
import { RememberGuideTerritory } from '@/components/guide/RememberGuideTerritory'
import { isTerritoryCode } from '@/lib/guide/territories'

// Toute page d'un territoire du Guide public mémorise ce territoire (cookie lp_guide_territoire) :
// /guide et /app/guide s'ouvriront dessus à la prochaine visite. Code inconnu : la page répond 404
// et un cookie obsolète retombe de toute façon sur le territoire par défaut (pickAvailable).
export default async function GuideTerritoryLayout({ children, params }: { children: ReactNode; params: Promise<{ territoire: string }> }) {
  const { territoire } = await params
  return (
    <>
      {isTerritoryCode(territoire) && <RememberGuideTerritory code={territoire} />}
      {children}
    </>
  )
}
