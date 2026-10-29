import { PartnerShowcase } from '@/components/partenaires/PartnerShowcase'

// Partenaires de l'accueil (sous la barre des modules) : même vitrine que /partenaires (maquette client),
// une rangée défilante par catégorie. Source unique : lib/partenaires/catalog.ts (accord écrit avant tout logo).
// Hors production et sans partenaire signé, des exemples fictifs s'affichent ; en production, des emplacements neutres.
export function Partners() {
  return (
    <div className="bg-[#F7F9FC]">
      <PartnerShowcase />
    </div>
  )
}
