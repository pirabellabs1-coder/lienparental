'use client'

import { useTranslations } from 'next-intl'
import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/cn'
import { btn } from '@/components/ui/kit'
import { Sheet } from './Sheet'
import type { ToneAnalysis } from './toneCheck'

type Props = {
  open: boolean
  original: string
  analysis: ToneAnalysis | null
  onUseReformulation: () => void
  onSendAsIs: () => void
  onEdit: () => void
}

/** Proposition du Coach IA avant envoi. Le choix reste toujours au parent. */
export function ToneCheckSheet({ open, original, analysis, onUseReformulation, onSendAsIs, onEdit }: Props) {
  const t = useTranslations('messaging.tone')
  const hasReformulation = Boolean(analysis?.reformulation)
  return (
    <Sheet
      open={open}
      onClose={onEdit}
      eyebrow={
        <p className="mb-1.5 inline-flex items-center gap-1.5 rounded-full bg-iris-50 px-2.5 py-1 text-[11px] font-bold text-iris-700">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          {t('coach')}
        </p>
      }
      title={t('title')}
      description={analysis?.resume ?? t('defaultDescription')}
    >
      {analysis && (
        <div className="space-y-3">
          <div>
            <p className="text-[12px] font-semibold text-night-600">{t('yourMessage')}</p>
            <p className="mt-1 max-h-28 overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-night-50/70 p-3 text-[13px] text-night-800">
              {original}
            </p>
          </div>

          {hasReformulation && (
            <div>
              <p className="text-[12px] font-semibold text-iris-700">{t('proposal')}</p>
              <p className="mt-1 whitespace-pre-wrap break-words rounded-xl border border-iris-100 bg-iris-50/60 p-3 text-[14px] leading-relaxed text-night-900">
                {analysis.reformulation}
              </p>
            </div>
          )}

          <p className="text-[11px] text-night-600">
            {t('tensionIndex')} <span className="font-bold tabular-nums text-night-800">{analysis.agressivite} / 100</span>.
            {' '}{t('indicative')}
          </p>

          <div className="grid gap-2 pt-1">
            {hasReformulation && (
              <button type="button" data-autofocus onClick={onUseReformulation} className={cn(btn.primary, 'w-full')}>
                {t('useReformulation')}
              </button>
            )}
            <button type="button" onClick={onSendAsIs} className={cn(btn.secondary, 'w-full')} data-autofocus={hasReformulation ? undefined : true}>
              {t('sendAsIs')}
            </button>
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex h-12 w-full items-center justify-center rounded-xl text-[14px] font-semibold text-night-800 hover:bg-night-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400"
            >
              {t('edit')}
            </button>
          </div>
        </div>
      )}
    </Sheet>
  )
}
