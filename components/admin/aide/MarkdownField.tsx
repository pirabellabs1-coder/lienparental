'use client'
/** Champ Markdown avec onglets Écrire / Aperçu (aperçu côte à côte sur grand écran). */
import { useState } from 'react'
import { Markdown } from '@/app/blog/_components/Markdown'
import { FormSection, TextAreaField } from '@/components/admin/contenus/form'
import { cn } from '@/lib/cn'

export function MarkdownField({ title, path, value, onChange, max, rows = 16 }: {
  title: string; path: string; value: string; onChange: (v: string) => void; max: number; rows?: number
}) {
  const [tab, setTab] = useState<'write' | 'preview'>('write')
  return (
    <FormSection title={title} id={`md-${path}`} path={path}
      description="Markdown : ## titre, **gras**, *italique*, - liste, 1. liste numérotée, > citation, [lien](https://…).">
      <div role="tablist" aria-label={title} className="inline-flex rounded-xl bg-night-50 p-1 xl:hidden">
        {(['write', 'preview'] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={cn('min-h-[40px] rounded-lg px-4 text-[13.5px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500', tab === t ? 'bg-white text-night-900 shadow-soft' : 'text-night-600')}>
            {t === 'write' ? 'Écrire' : 'Aperçu'}
          </button>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className={cn(tab === 'preview' && 'hidden xl:block')}>
          <TextAreaField label="Texte (Markdown)" path={path} value={value} onChange={onChange} max={max} rows={rows} required mono />
        </div>
        <div className={cn('rounded-xl border border-[#E5E7EB] bg-white p-4 xl:max-h-[560px] xl:overflow-y-auto', tab === 'write' && 'hidden xl:block')} aria-label="Aperçu du texte">
          <Markdown source={value} />
        </div>
      </div>
    </FormSection>
  )
}
