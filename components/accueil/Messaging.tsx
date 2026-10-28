import { ArrowRight, CheckCheck, Clock, FileDown, FolderLock, Images, Sparkles } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { signupPath } from '@/lib/i18n/routing'
import { PhoneFrame } from '@/components/home/PhoneFrame'
import { cn } from '@/lib/cn'
import { appShot } from '@/lib/i18n/shots'
import { BTN_PRIMARY, CONTAINER, H2, IconBubble, LEAD, SECTION } from './ui'
import Link from 'next/link'

// Section dédiée à la messagerie entre parents (fonctions vérifiées dans components/messages).
// Formulation sécurité : chiffrement en transit et au repos, jamais « de bout en bout ».
const POINTS = [
  { icon: Clock, key: 'point1' },
  { icon: Sparkles, key: 'point2' },
  { icon: Images, key: 'point3' },
  { icon: FolderLock, key: 'point4' },
  { icon: FileDown, key: 'point5' },
] as const

export async function Messaging() {
  const t = await getTranslations('homeMessaging')
  const locale = await getLocale()
  return (
    <section id="messagerie" aria-labelledby="messaging-title" className={cn(SECTION, 'overflow-hidden')}>
      <div className={cn(CONTAINER, 'grid grid-cols-1 items-center gap-12 lg:grid-cols-[1fr_0.85fr] lg:gap-16 [&>*]:min-w-0')}>
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-leaf-50 px-3.5 py-1.5 text-[13px] font-semibold text-leaf-700">
            <CheckCheck className="h-4 w-4" strokeWidth={2} aria-hidden />
            {t('badge')}
          </p>
          <h2 id="messaging-title" className={cn(H2, 'mt-4 max-w-[22ch]')}>
            {t('title')}
          </h2>
          <p className={cn(LEAD, 'mt-4 max-w-[52ch]')}>
            {t('lead')}
          </p>

          <ul className="mt-8 grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
            {POINTS.map(({ icon: Icon, key }) => (
              <li key={key} className="flex gap-4">
                <IconBubble size="sm"><Icon strokeWidth={1.75} /></IconBubble>
                <div>
                  <h3 className="text-[16px] font-bold leading-snug text-night-900">{t(`${key}Title`)}</h3>
                  <p className="mt-1 text-[14.5px] leading-relaxed text-night-700">{t(`${key}Text`)}</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link href={signupPath(locale)} className={cn(BTN_PRIMARY, 'h-12 px-6')}>
              {t('cta')}<ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <p className="text-[13.5px] text-night-600">{t('note')}</p>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-[340px]">
          <div aria-hidden className="absolute -inset-x-10 inset-y-10 -z-10 rounded-[48px] bg-gradient-to-br from-[#EAF4EA] via-[#F3F8F3] to-[#EEF2F8]" />
          <PhoneFrame
            src={appShot('mobile-messages', locale)}
            alt={t('phoneAlt')}
            sizes="(min-width:1024px) 340px, 80vw"
          />
        </div>
      </div>
    </section>
  )
}
