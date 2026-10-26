import { cn } from '@/lib/cn'

// Petites briques visuelles partagées par les écrans Coach IA.

// Exception documentée (docs/DESIGN_SYSTEM.md) : dans le Coach IA, l'action principale reste violette.
const base =
  'inline-flex h-12 w-full items-center justify-center gap-2.5 rounded-xl text-[15px] font-semibold transition active:scale-[.98] motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'

const primary = cn(base, 'bg-iris-500 text-white shadow-[0_8px_18px_-10px_rgba(91,69,227,0.8)] hover:bg-iris-600 focus-visible:ring-iris-500')
const secondary = cn(base, 'border border-night-200 bg-white text-night-900 hover:bg-night-50 focus-visible:ring-iris-500')

export const btn = {
  /** Violet plein — actions principales du Coach IA. */
  primary,
  /** Blanc bordé — actions secondaires. */
  secondary,
  /** @deprecated alias de `secondary` (le secondaire suit le système commun). */
  outline: secondary,
  /** Contour rouge — déclencheur de suppression. */
  danger: cn(base, 'border border-alert-300 bg-white text-alert-600 hover:bg-alert-50 focus-visible:ring-alert-300'),
  /** @deprecated — écrans « Utilisation » : alias de `primary` (plus de bouton bleu nuit). */
  navy: primary,
  /** @deprecated — écrans « Utilisation » : alias de `secondary`. */
  navyOutline: secondary,
}

export function ScreenTitle({ title, subtitle, className }: { title: string; subtitle?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('text-center', className)}>
      <h2 className="text-[21px] font-bold leading-tight text-night-900">{title}</h2>
      {subtitle && <p className="mx-auto mt-2 max-w-[300px] text-[13px] leading-relaxed text-night-700">{subtitle}</p>}
    </div>
  )
}

/** Barre de quota bleu nuit sur fond gris-bleu. */
export function UsageBar({ used, total, label }: { used: number; total: number; label: string }) {
  const pct = total > 0 ? Math.round((used / total) * 100) : 0
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={used}
      aria-valuetext={`${used} sur ${total} (${pct} %)`}
      className="h-2 w-full overflow-hidden rounded-full bg-night-100"
    >
      <div className="h-full rounded-full bg-night-900" style={{ width: `${pct}%` }} />
    </div>
  )
}

/** Petit texte rappelant que le Coach IA ne remplace pas un professionnel du droit. */
export function LegalNote({ className }: { className?: string }) {
  return (
    <p className={cn('text-center text-[11px] leading-snug text-night-500', className)}>
      Le Coach IA propose des pistes de communication. Le Coach IA ne donne pas de conseil juridique.
    </p>
  )
}

/** Mention discrète quand l'IA n'est pas configurée (réponses simulées). */
export function DemoNote({ className }: { className?: string }) {
  return (
    <p className={cn('mx-auto w-fit rounded-full bg-gold-50 px-3 py-1 text-center text-[11px] font-medium text-night-700', className)}>
      Mode démonstration : réponses simulées
    </p>
  )
}
