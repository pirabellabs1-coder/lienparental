'use client'
import { useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronDown, MoreVertical, Share } from 'lucide-react'
import {
  AndroidConfirm, AndroidMenu, AndroidMenuBar, HomeScreenAdded,
  IosAddToHome, IosConfirm, IosShareBar, IosShareSheet,
} from './StepVisuals'

export type InstallOS = 'ios' | 'android'

type StepDef = { key: string; visual: ReactNode }

const SHARE = <Share className="inline h-3.5 w-3.5 align-[-2px]" aria-hidden />

/** Textes : public.install.steps.<os>.<key>.{title,text,more}. */
const STEPS: Record<InstallOS, StepDef[]> = {
  ios: [
    { key: 'share', visual: <IosShareBar /> },
    { key: 'scroll', visual: <IosShareSheet /> },
    { key: 'add', visual: <IosAddToHome /> },
    { key: 'confirm', visual: <IosConfirm /> },
  ],
  android: [
    { key: 'menu', visual: <AndroidMenuBar /> },
    { key: 'add', visual: <AndroidMenu /> },
    { key: 'confirm', visual: <AndroidConfirm /> },
    { key: 'done', visual: <HomeScreenAdded /> },
  ],
}

/** Repliable « Menu défilant » : bouton sous le texte, contenu sur toute la largeur de l'étape. */
function StepMore({ id, n, children }: { id: string; n: number; children: ReactNode }) {
  const t = useTranslations('public.install')
  const [open, setOpen] = useState(false)
  const panelId = `install-more-${id}`
  return (
    <>
      <div className="col-start-2 mt-1">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen(o => !o)}
          className="-ml-1 inline-flex min-h-[44px] items-center rounded-lg px-1 text-[12.5px] font-semibold text-leaf-600 hover:text-leaf-700"
        >
          <span className="inline-flex items-center gap-1 rounded-md bg-leaf-50 px-2.5 py-1.5">
            {t('more')}<span className="sr-only">{t('moreSr', { n })}</span>
            <ChevronDown aria-hidden className={`h-3.5 w-3.5 transition-transform duration-200 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
          </span>
        </button>
      </div>
      <p id={panelId} hidden={!open} className="col-span-2 col-start-2 mb-1 mt-1 rounded-lg bg-night-50 px-3 py-2.5 text-[12.5px] leading-relaxed text-night-800">
        {children}
      </p>
    </>
  )
}

export function InstallSteps({ os }: { os: InstallOS }) {
  const t = useTranslations('public.install')
  const steps = STEPS[os]
  const rich = {
    share: () => SHARE,
    dots: () => (
      <>
        <MoreVertical className="inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
        <span className="sr-only">{t('dotsSr')}</span>
      </>
    ),
  }
  return (
    <ol className="space-y-0">
      {steps.map((s, i) => {
        const last = i === steps.length - 1
        return (
          <li key={s.key} className="relative grid grid-cols-[32px_minmax(0,1fr)_104px] gap-x-3 pb-6 last:pb-0 sm:grid-cols-[32px_minmax(0,1fr)_128px]">
            {/* ligne verticale qui relie les étapes */}
            {!last && <span aria-hidden className="absolute bottom-0 left-[15.5px] top-9 w-px bg-leaf-200" />}
            <span aria-hidden className="relative z-10 grid h-8 w-8 place-items-center rounded-full bg-leaf-500 text-[14px] font-bold text-white">
              {i + 1}
            </span>
            <div className="min-w-0 pt-1">
              <h3 className="text-[15px] font-bold leading-snug text-night-900">
                <span className="sr-only">{t('stepSr', { n: i + 1 })}</span>{t(`steps.${os}.${s.key}.title`)}
              </h3>
              <p className="mt-1 text-[13px] leading-relaxed text-night-700">{t.rich(`steps.${os}.${s.key}.text`, rich)}</p>
            </div>
            <div aria-hidden className="row-span-2 pt-1">{s.visual}</div>
            <StepMore id={`${os}-step-${i + 1}`} n={i + 1}>{t(`steps.${os}.${s.key}.more`)}</StepMore>
          </li>
        )
      })}
    </ol>
  )
}
