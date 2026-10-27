import { getTranslations } from 'next-intl/server'
import { TopBar } from '@/components/mobile/TopBar'
import { TutorielList } from '@/components/aide/TutorielList'
import { getHelpTutoriels } from '@/lib/aide/public'

export const revalidate = 300

export default async function TutorielsPage() {
  const t = await getTranslations('public.help.tutorials')
  const tutoriels = (await getHelpTutoriels()).map(x => ({ slug: x.slug, titre: x.titre, dureeMin: x.dureeMin, icone: x.icone }))
  return (
    <>
      <TopBar title={t('title')} showBack backHref="/app/aide" showBell={false} />
      <div className="px-5 pb-8 pt-2">
        <TutorielList tutoriels={tutoriels} />
      </div>
    </>
  )
}
