import { PartnerShowcase } from '@/components/partenaires/PartnerShowcase'

// Partenaires de l'accueil (sous la barre des modules) : même vitrine que /partenaires (maquette client),
// une rangée défilante par catégorie. Source unique : lib/partenaires/catalog.ts (accord écrit avant tout logo).
// Sans partenaire signé : exemples fictifs (badge « Exemple ») hors production, ou en production si NEXT_PUBLIC_PARTNERS_DEMO=on ; sinon emplacements neutres.
export function Partners() {
  return (
    <div className="bg-[#F7F9FC]">
      <PartnerShowcase />
    </div>
  )
}
