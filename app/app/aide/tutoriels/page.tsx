import { TopBar } from '@/components/mobile/TopBar'
import { TutorielList } from '@/components/aide/TutorielList'
import { getHelpTutoriels } from '@/lib/aide/public'

export const revalidate = 300

export default async function TutorielsPage() {
  const tutoriels = (await getHelpTutoriels()).map(t => ({ slug: t.slug, titre: t.titre, dureeMin: t.dureeMin, icone: t.icone }))
  return (
    <>
      <TopBar title="Tutoriels" showBack backHref="/app/aide" showBell={false} />
      <div className="px-5 pb-8 pt-2">
        <TutorielList tutoriels={tutoriels} />
      </div>
    </>
  )
}
