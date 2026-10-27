'use client'
import { useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Bot, CalendarDays, FolderLock, HeartPulse, MessageSquareQuote, MessagesSquare, Scale, Wallet } from 'lucide-react'
import { PhoneFrame } from '@/components/home/PhoneFrame'
import { cn } from '@/lib/cn'
import { appShot, type AppShotName } from '@/lib/i18n/shots'
import { CONTAINER, H2, IconBubble, LEAD, SECTION } from './ui'

// Les 8 modules (+ messagerie) regroupés en 4 besoins de parent : un onglet = une idée, illustrée par une vraie capture.
// Le Guide parental a sa propre section. Onglets ARIA (WAI-ARIA APG) : flèches, Début / Fin, tabulation vers le panneau.
// Les textes viennent des catalogues i18n (namespace featureTabs), par clé d'onglet.
const TABS = [
  { key: 'organiser', shot: 'mobile-calendrier', mod1Icon: CalendarDays, mod2Icon: Wallet },
  { key: 'proteger', shot: 'mobile-coffre', mod1Icon: HeartPulse, mod2Icon: FolderLock },
  { key: 'preparer', shot: 'mobile-temoignages', mod1Icon: MessageSquareQuote, mod2Icon: Scale },
  { key: 'apaiser', shot: 'mobile-coach', mod1Icon: Bot, mod2Icon: MessagesSquare },
] as const satisfies ReadonlyArray<{ key: string; shot: AppShotName; mod1Icon: unknown; mod2Icon: unknown }>

export function FeatureTabs() {
  const t = useTranslations('featureTabs')
  const locale = useLocale()
  const [active, setActive] = useState(0)
  const tabs = useRef<(HTMLButtonElement | null)[]>([])

  const select = (i: number) => {
    const n = (i + TABS.length) % TABS.length
    setActive(n)
    tabs.current[n]?.focus()
  }
  const onKey = (e: React.KeyboardEvent) => {
    const map: Record<string, number> = { ArrowRight: active + 1, ArrowDown: active + 1, ArrowLeft: active - 1, ArrowUp: active - 1, Home: 0, End: TABS.length - 1 }
    if (!(e.key in map)) return
    e.preventDefault()
    select(map[e.key])
  }

  const tab = TABS[active]

  return (
    <section id="en-images" aria-labelledby="tabs-title" className={cn(SECTION, 'bg-[#F4F6F9]')}>
      <div className={CONTAINER}>
        <div className="max-w-[640px]">
          <h2 id="tabs-title" className={H2}>{t('sectionTitle')}</h2>
          <p className={cn(LEAD, 'mt-4')}>{t('sectionLead')}</p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-8 lg:mt-12 lg:grid-cols-[300px_1fr] lg:gap-14 [&>*]:min-w-0">
          <div
            role="tablist"
            aria-label={t('tablistLabel')}
            onKeyDown={onKey}
            className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:flex lg:flex-col"
          >
            {TABS.map((tb, i) => (
              <button
                key={tb.key}
                ref={el => { tabs.current[i] = el }}
                id={`tab-${tb.key}`}
                type="button"
                role="tab"
                aria-selected={i === active}
                aria-controls={`panel-${tb.key}`}
                tabIndex={i === active ? 0 : -1}
                onClick={() => setActive(i)}
                className={cn(
                  'min-h-[48px] rounded-2xl px-4 py-3 text-center lg:px-5 lg:text-left transition-colors duration-200 lg:py-4',
                  i === active ? 'bg-night-900 text-white' : 'bg-white text-night-900 ring-1 ring-[#E5E7EB] hover:bg-night-50',
                )}
              >
                <span className="block text-[15px] font-bold lg:text-[17px]">{t(`${tb.key}Label`)}</span>
                <span className={cn('hidden text-[14px] lg:mt-0.5 lg:block', i === active ? 'text-night-100' : 'text-night-700')}>{`${t(`${tb.key}Mod1Name`)} · ${t(`${tb.key}Mod2Name`)}`}</span>
              </button>
            ))}
          </div>

          <div
            key={tab.key}
            id={`panel-${tab.key}`}
            role="tabpanel"
            aria-labelledby={`tab-${tab.key}`}
            tabIndex={0}
            className="grid grid-cols-1 items-center gap-10 rounded-[28px] bg-white p-6 ring-1 ring-[#E5E7EB] sm:p-10 md:grid-cols-[1fr_auto] lg:gap-12"
          >
            <div className="home-rise">
              <h3 className="text-[22px] font-bold leading-tight text-night-900 lg:text-[24px]">{t(`${tab.key}Title`)}</h3>
              <p className="mt-2 text-[16px] leading-relaxed text-night-700">{t(`${tab.key}Text`)}</p>
              <ul className="mt-8 space-y-7">
                {[{ icon: tab.mod1Icon, n: 1 }, { icon: tab.mod2Icon, n: 2 }].map(({ icon: Icon, n }) => (
                  <li key={n} className="flex gap-4">
                    <IconBubble><Icon strokeWidth={1.75} /></IconBubble>
                    <div>
                      <h4 className="text-[17px] font-bold text-night-900">{t(`${tab.key}Mod${n}Name`)}</h4>
                      <p className="mt-1 max-w-[42ch] text-[15px] leading-relaxed text-night-700">{t(`${tab.key}Mod${n}Text`)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <PhoneFrame src={appShot(tab.shot, locale)} alt={t(`${tab.key}ShotAlt`)} sizes="230px" className="home-rise mx-auto w-[190px] sm:w-[210px] lg:w-[230px]" />
          </div>
        </div>
      </div>
    </section>
  )
}
