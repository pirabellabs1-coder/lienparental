import { BookOpen, ChevronLeft, ChevronRight, Copy, Download, Lock, MoreVertical, PenLine, PlusSquare, RotateCw, Share, Star } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/cn'
import { AppIcon } from './AppIcon'

// Mini-illustrations des étapes d'installation. Composées en JSX, sans visuel de marque
// Apple ou Google. Toutes décoratives (aria-hidden posé par le conteneur de l'étape).

const frame = 'rounded-xl border border-night-100 bg-white p-2 text-[8.5px] leading-tight text-night-800 shadow-soft'
const target = 'rounded-full ring-2 ring-leaf-400 ring-offset-1'
const highlight = '-mx-1 flex items-center justify-between rounded-md bg-leaf-50 px-1 py-1 font-bold text-night-900 ring-1 ring-leaf-200'
const row = 'flex items-center justify-between py-[3px]'

/* iPhone ----------------------------------------------------------------- */

export function IosShareBar() {
  return (
    <div className={frame}>
      <div className="flex items-center justify-center gap-1 rounded-md bg-night-50 py-1 text-[7.5px] text-night-700">
        <Lock className="h-2 w-2" /> lienparental.fr
      </div>
      <div className="mt-2 flex items-center justify-between px-0.5 text-night-300">
        <ChevronLeft className="h-3 w-3" />
        <ChevronRight className="h-3 w-3" />
        <span className={cn(target, 'p-[3px] text-night-900')}><Share className="h-3 w-3" /></span>
        <BookOpen className="h-3 w-3" />
        <Copy className="h-3 w-3" />
      </div>
    </div>
  )
}

export function IosShareSheet() {
  const t = useTranslations('public.install.visuals')
  return (
    <div className={cn(frame, 'relative overflow-hidden')}>
      <div className="flex gap-1.5 border-b border-night-100 pb-1.5">
        {['bg-leaf-100', 'bg-night-100', 'bg-night-200', 'bg-leaf-100'].map((c, i) => <span key={i} className={cn('h-4 w-4 rounded-[5px]', c)} />)}
      </div>
      <div className={row}><span>{t('copy')}</span><Copy className="h-2.5 w-2.5" /></div>
      <div className={row}><span>{t('readingList')}</span><BookOpen className="h-2.5 w-2.5" /></div>
      <div className={row}><span>{t('bookmarks')}</span><Star className="h-2.5 w-2.5" /></div>
      <div className={cn(row, 'text-night-400')}><span>{t('markup')}</span><PenLine className="h-2.5 w-2.5" /></div>
      {/* indicateur de défilement */}
      <span className="absolute right-0.5 top-7 h-6 w-[3px] rounded-full bg-night-300" />
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-4 bg-gradient-to-t from-white" />
    </div>
  )
}

export function IosAddToHome() {
  const t = useTranslations('public.install.visuals')
  return (
    <div className={frame}>
      <div className={cn(row, 'text-night-400')}><span>{t('copy')}</span><Copy className="h-2.5 w-2.5" /></div>
      <div className={cn(row, 'text-night-400')}><span>{t('bookmarks')}</span><Star className="h-2.5 w-2.5" /></div>
      <div className={highlight}><span>{t('iosAddHome')}</span><PlusSquare className="h-2.5 w-2.5 text-leaf-500" /></div>
      <div className={cn(row, 'text-night-400')}><span>{t('markup')}</span><PenLine className="h-2.5 w-2.5" /></div>
    </div>
  )
}

export function IosConfirm() {
  const t = useTranslations('public.install.visuals')
  return (
    <div className={frame}>
      <div className="flex items-center justify-between font-semibold">
        <span className="text-night-500">{t('cancel')}</span>
        <span className="rounded-full px-1.5 py-0.5 font-bold text-leaf-600 ring-2 ring-leaf-400">{t('add')}</span>
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <AppIcon className="h-6 w-6" />
        <span className="min-w-0">
          <span className="block font-bold">Lien Parental</span>
          <span className="block truncate text-[7.5px] text-night-500">lienparental.fr</span>
        </span>
      </div>
    </div>
  )
}

/* Android ---------------------------------------------------------------- */

export function AndroidMenuBar() {
  return (
    <div className={frame}>
      <div className="flex items-center gap-1">
        <span className="flex min-w-0 flex-1 items-center gap-1 rounded-full bg-night-50 px-1.5 py-1 text-[7.5px] text-night-700">
          <Lock className="h-2 w-2 shrink-0" /><span className="truncate">lienparental.fr</span>
        </span>
        <span className={cn(target, 'p-[3px] text-night-900')}><MoreVertical className="h-3 w-3" /></span>
      </div>
      <div className="mt-2 flex justify-end gap-2 pr-1 text-night-300">
        <Star className="h-3 w-3" /><Download className="h-3 w-3" /><RotateCw className="h-3 w-3" />
      </div>
    </div>
  )
}

export function AndroidMenu() {
  const t = useTranslations('public.install.visuals')
  return (
    <div className={frame}>
      <div className={cn(row, 'text-night-400')}>{t('newTab')}</div>
      <div className={cn(row, 'text-night-400')}>{t('favorites')}</div>
      <div className={cn(row, 'text-night-400')}>{t('downloads')}</div>
      <div className={highlight}><span>{t('androidAddHome')}</span><PlusSquare className="h-2.5 w-2.5 shrink-0 text-leaf-500" /></div>
      <div className={cn(row, 'text-night-400')}>{t('settings')}</div>
    </div>
  )
}

export function AndroidConfirm() {
  const t = useTranslations('public.install.visuals')
  return (
    <div className={frame}>
      <div className="font-bold">{t('androidAddHome')}</div>
      <div className="mt-1.5 flex items-center gap-1.5 border-b border-leaf-400 pb-1">
        <AppIcon className="h-5 w-5" /><span>Lien Parental</span>
      </div>
      <div className="mt-2 flex items-center justify-end gap-1.5 pr-0.5 font-semibold">
        <span className="text-night-500">{t('cancel')}</span>
        <span className="rounded-full px-1.5 py-0.5 font-bold text-leaf-600 ring-2 ring-leaf-400">{t('add')}</span>
      </div>
    </div>
  )
}

export function HomeScreenAdded() {
  return (
    <div className="rounded-xl bg-gradient-to-br from-night-50 via-white to-leaf-50 p-2 ring-1 ring-night-100">
      <div className="grid grid-cols-4 gap-1.5">
        <span className="aspect-square rounded-[5px] bg-night-100" />
        <span className="aspect-square rounded-[5px] bg-leaf-100" />
        <span className="aspect-square rounded-[5px] bg-night-200" />
        <span className="rounded-[6px] ring-2 ring-leaf-400 ring-offset-1"><AppIcon className="block aspect-square w-full" /></span>
      </div>
      <p className="mt-1.5 text-right text-[7.5px] font-bold text-night-900">Lien Parental</p>
    </div>
  )
}
