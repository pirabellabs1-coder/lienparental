import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'
import { forwardRef, type ButtonHTMLAttributes } from 'react'

// Système de boutons unique — voir docs/DESIGN_SYSTEM.md.
// primary = vert (une seule action principale par écran), secondary = blanc bordé,
// danger = rouge, iris = réservé au module Coach IA.
const primary = 'bg-leaf-500 text-white hover:bg-leaf-600 shadow-[0_8px_20px_-10px_rgba(46,125,50,0.55)]'
const secondary = 'bg-white border border-night-200 text-night-900 hover:bg-night-50'

const button = cva(
  'inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-[transform,background-color,box-shadow] active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:ring-offset-2',
  {
    variants: {
      variant: {
        primary,
        secondary,
        ghost:   'bg-transparent text-night-900 hover:bg-night-50',
        danger:  'bg-alert-500 text-white hover:bg-alert-600',
        /** Coach IA uniquement (app/app/coach/**, components/coach/**). */
        iris:    'bg-iris-500 text-white hover:bg-iris-600 shadow-[0_8px_18px_-10px_rgba(91,69,227,0.8)]',
        // Alias conservés pour compatibilité : ils suivent désormais le système.
        /** @deprecated utiliser `primary` */
        leaf: primary,
        /** @deprecated utiliser `primary` (l'or est réservé aux badges Premium) */
        gold: primary,
        /** @deprecated utiliser `primary` (le bleu nuit est réservé aux textes) */
        night: primary,
        /** @deprecated utiliser `secondary` */
        outline: secondary,
      },
      size: {
        sm: 'h-9 px-4 text-sm',
        md: 'h-12 px-5 text-[15px]',
        lg: 'h-12 px-6 text-base',
        xl: 'h-14 px-8 text-lg',
      },
      full: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'primary', size: 'md', full: false },
  }
)

export { button as buttonVariants }

type Props = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button>

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { className, variant, size, full, ...props }, ref
) {
  return <button ref={ref} className={cn(button({ variant, size, full }), className)} {...props} />
})
