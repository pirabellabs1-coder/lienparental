import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { TopBar } from '@/components/mobile/TopBar'
import { btn } from '@/components/profil/kit'
import { FaqList } from '@/components/aide/FaqList'
import { getHelpFaq } from '@/lib/aide/public'
import { cn } from '@/lib/cn'

export const revalidate = 300

export default async function FaqPage() {
  const t = await getTranslations('public.help.faq')
  const faq = (await getHelpFaq()).map(f => ({ slug: f.slug, question: f.question }))
  return (
    <>
      <TopBar title={t('title')} showBack backHref="/app/aide" showBell={false} />
      <div className="px-5 pb-8 pt-2">
        <FaqList faq={faq} />

        <div className="mt-6 rounded-xl2 bg-night-50/80 p-4">
          <p className="text-[13px] font-bold text-night-900">{t('notFoundTitle')}</p>
          <p className="mt-1 text-[12.5px] text-night-800">{t('notFoundText')}</p>
          <Link href="/app/aide/contact" className={cn(btn.secondary, 'mt-3 text-[13px]')}>{t('contact')}</Link>
        </div>
      </div>
    </>
  )
}
