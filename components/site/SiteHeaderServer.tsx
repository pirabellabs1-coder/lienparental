import { getTranslations } from 'next-intl/server'
import { SiteHeader, type HeaderTerritory } from './SiteHeader'
import { territoryStatuses } from './territory-status'

/**
 * En-tête du site public, côté serveur : territoires du Guide avec leur disponibilité réelle
 * (contenu ou base) et leur nom traduit, transmis au méga menu client.
 */
export async function SiteHeaderServer() {
  const [statuses, tTerr, tFooter] = await Promise.all([
    territoryStatuses(),
    getTranslations('shared.territories'),
    getTranslations('footer'),
  ])
  const territories: HeaderTerritory[] = statuses.map((s) => ({ code: s.code, name: tTerr(s.code), path: s.path, available: s.available }))
  return <SiteHeader territories={territories} soonLabel={tFooter('soon')} />
}
