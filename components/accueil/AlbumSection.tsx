import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, CalendarHeart, Images, Lock, ShieldCheck, Star, Users } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { signupPath } from '@/lib/i18n/routing'
import { cn } from '@/lib/cn'
import { BTN_PRIMARY, CONTAINER, H2, IconBubble, LEAD, SECTION } from './ui'

// Section « Album de l'enfant » (coffre-fort, migration 0530) : photos privées ou partagées avec
// l'autre parent, chronologie par date de prise de vue, moments importants. Visuel : montage HTML
// d'images illustratives (aucune photo d'utilisateur).
const POINTS = [
  { icon: Users, key: 'point1' },
  { icon: CalendarHeart, key: 'point2' },
  { icon: Star, key: 'point3' },
  { icon: ShieldCheck, key: 'point4' },
] as const

const SHOTS = [
  { src: '/images/home/parent-enfant-calme.jpg', badge: 'important', rotate: '-rotate-3', pos: 'left-0 top-6 w-[54%]' },
  { src: '/images/home/famille-parc.jpg', badge: 'shared', rotate: 'rotate-2', pos: 'right-0 top-0 w-[50%]' },
  { src: '/images/home/moment-partage.jpg', badge: 'private', rotate: 'rotate-1', pos: 'left-[22%] bottom-0 w-[56%]' },
] as const

export async function AlbumSection() {
  const t = await getTranslations('homeAlbum')
  const locale = await getLocale()
  return (
    <section id="album" aria-labelledby="album-title" className={cn(SECTION, 'overflow-hidden bg-gradient-to-b from-white via-[#FDF4F8] to-white')}>
      <div className={cn(CONTAINER, 'grid grid-cols-1 items-center gap-12 lg:grid-cols-[0.95fr_1fr] lg:gap-16 [&>*]:min-w-0')}>
        <div className="order-2 lg:order-1">
          <div aria-hidden className="relative mx-auto aspect-[1/1.02] w-full max-w-[460px]">
            {SHOTS.map((s, i) => (
              <figure key={s.src} className={cn('absolute rounded-[22px] bg-white p-2 pb-3 shadow-[0_24px_48px_-24px_rgba(11,45,91,0.45)] ring-1 ring-[#E5E7EB]', s.pos, s.rotate)} style={{ zIndex: i + 1 }}>
                <span className="relative block aspect-[4/3] overflow-hidden rounded-[16px]">
                  <Image src={s.src} alt="" fill sizes="(min-width: 1024px) 260px, 50vw" className="object-cover" />
                </span>
                <figcaption className="mt-2 flex items-center justify-between gap-2 px-1">
                  <span className="text-[12.5px] font-bold text-night-900">{t(`shot${i + 1}`)}</span>
                  <span className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold',
                    s.badge === 'important' ? 'bg-gold-50 text-gold-700' : s.badge === 'shared' ? 'bg-leaf-50 text-leaf-700' : 'bg-night-50 text-night-700',
                  )}>
                    {s.badge === 'important' ? <Star className="h-3 w-3 fill-current" /> : s.badge === 'shared' ? <Users className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                    {t(`badge_${s.badge}`)}
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>

        <div className="order-1 lg:order-2">
          <p className="inline-flex items-center gap-2 rounded-full bg-pink-50 px-3.5 py-1.5 text-[13px] font-semibold text-pink-700">
            <Images className="h-4 w-4" strokeWidth={2} aria-hidden />
            {t('badge')}
          </p>
          <h2 id="album-title" className={cn(H2, 'mt-4 max-w-[22ch]')}>{t('title')}</h2>
          <p className={cn(LEAD, 'mt-4 max-w-[54ch]')}>{t('lead')}</p>

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
      </div>
    </section>
  )
}
