import { getLocale, getTranslations } from 'next-intl/server'
import { TopBar } from '@/components/mobile/TopBar'
import { LegalAccordion, type LegalSection } from '@/components/profil/LegalAccordion'
import { SUPPORT_EMAIL } from '@/components/profil/data'
import { intlLocale } from '@/lib/i18n/config'

// Texte synthétique ; la version complète fait foi : /legal/cgu.
const LAST_UPDATED = new Date(Date.UTC(2026, 9, 25))

const SECTION_KEYS = ['s1', 's2', 's3', 's4'] as const

export default async function AideCguPage() {
  const t = await getTranslations('public.help.terms')
  const tl = await getTranslations('public.legal')
  const locale = await getLocale()
  const lastUpdated = new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: 'long', timeZone: 'UTC' }).format(LAST_UPDATED)
  const SECTIONS: LegalSection[] = [
    ...SECTION_KEYS.map(k => ({ title: t(`${k}.title`), body: t(`${k}.body`) })),
    {
      title: t('s5.title'),
      body: t.rich('s5.body', {
        email: SUPPORT_EMAIL,
        mail: (c) => <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-night-900 underline">{c}</a>,
      }),
    },
  ]
  return (
    <>
      <TopBar title={t('topTitle')} showBack backHref="/app/aide" showBell={false} />
      <div className="px-5 pb-8 pt-4">
        <h1 className="text-[16px] font-extrabold text-night-900">{t('title')}</h1>
        {locale !== 'fr' && <p className="mt-2 rounded-lg bg-night-50 p-3 text-[12px] text-night-800">{tl('bindingNotice')}</p>}
        <p className="mt-2 text-[12.5px] text-night-800">{t('updated', { date: lastUpdated })}</p>
        <p className="mt-3 text-[12.5px] leading-relaxed text-night-800">
          {t('intro')}
        </p>
        <div className="mt-6">
          <LegalAccordion sections={SECTIONS} />
        </div>
      </div>
    </>
  )
}
