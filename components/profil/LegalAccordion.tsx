import { ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'

export type LegalSection = { title: string; body: ReactNode }

/** Sections repliables (CGU, confidentialité) — <details> natif, accessible sans JS. */
export function LegalAccordion({ sections }: { sections: LegalSection[] }) {
  return (
    <div className="space-y-3">
      {sections.map(s => (
        <details key={s.title} className="group rounded-xl2 border border-night-100 bg-white shadow-soft">
          <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between gap-3 px-4 text-[13px] font-bold text-night-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-400 [&::-webkit-details-marker]:hidden">
            {s.title}
            <ChevronDown className="h-[18px] w-[18px] shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
          </summary>
          <div className="px-4 pb-4 text-[12.5px] leading-relaxed text-night-800">{s.body}</div>
        </details>
      ))}
    </div>
  )
}
