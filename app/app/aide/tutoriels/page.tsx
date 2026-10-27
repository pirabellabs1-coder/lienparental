import { getLocale, getTranslations } from 'next-intl/server'
import { TopBar } from '@/components/mobile/TopBar'
import { TutorielList } from '@/components/aide/TutorielList'
import { getHelpTutoriels } from '@/lib/aide/public'
import { contentLangAttr } from '@/lib/contenus/locale'

export const revalidate = 300

export default async function TutorielsPage() {
  const t = await getTranslations('public.help.tutorials')
  const locale = await getLocale()
  const tutoriels = (await getHelpTutoriels(locale)).map(x => ({ slug: x.slug, titre: x.titre, dureeMin: x.dureeMin, icone: x.icone, lang: contentLangAttr(x.lang, locale) }))
  return (
    <>
      <TopBar title={t('title')} showBack backHref="/app/aide" showBell={false} />
      <div className="px-5 pb-8 pt-2">
        <TutorielList tutoriels={tutoriels} />
      </div>
    </>
  )
}
