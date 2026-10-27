import { getTranslations } from 'next-intl/server'
import { FolderLock, HeartHandshake, MessagesSquare, Sun } from 'lucide-react'
import { cn } from '@/lib/cn'
import { CARD, CONTAINER, IconBubble, SECTION, SectionHead } from './ui'

const REASONS = [
  { id: 'pourquoi-stress', icon: Sun, titleKey: 'stressTitle', textKey: 'stressText' },
  { id: 'pourquoi-communication', icon: MessagesSquare, titleKey: 'commTitle', textKey: 'commText' },
  { id: 'pourquoi-documents', icon: FolderLock, titleKey: 'docsTitle', textKey: 'docsText' },
  { id: 'pourquoi-enfant', icon: HeartHandshake, titleKey: 'childTitle', textKey: 'childText' },
] as const

export async function WhyChoose() {
  const t = await getTranslations('home.why')
  return (
    <section aria-labelledby="why-title" className={cn(SECTION, 'bg-[#F4F6F9]')}>
      <div className={CONTAINER}>
        <SectionHead id="why-title" title={t('title')} lead={t('lead')} />
        <ul className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:mt-12 lg:grid-cols-4">
          {REASONS.map(({ id, icon: Icon, titleKey, textKey }) => (
            <li key={id} id={id} className={cn(CARD, 'scroll-mt-28 p-6')}>
              <IconBubble><Icon strokeWidth={1.75} /></IconBubble>
              <h3 className="mt-4 text-[17px] font-bold leading-snug text-night-900">{t(titleKey)}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-night-700">{t(textKey)}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
