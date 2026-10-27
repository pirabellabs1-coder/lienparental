import { getLocale, getTranslations } from 'next-intl/server'
import { TopBar } from '@/components/mobile/TopBar'
import { AideHome } from '@/components/aide/AideHome'
import { getHelpFaq } from '@/lib/aide/public'
import { contentLangAttr } from '@/lib/contenus/locale'

// Revalidé aussi à la publication depuis le back-office (lib/contenus/api.ts → revalidateFor).
export const revalidate = 300

export default async function AidePage() {
  const t = await getTranslations('public.help')
  const locale = await getLocale()
  const faq = (await getHelpFaq(locale)).map(f => ({ slug: f.slug, question: f.question, lang: contentLangAttr(f.lang, locale) }))
  return (
    <>
      <TopBar title={t('center')} showBack backHref="/app/profil" showBell={false} />
      <AideHome faq={faq} />
    </>
  )
}
