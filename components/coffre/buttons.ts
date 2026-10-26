import { cva, type VariantProps } from 'class-variance-authority'

/**
 * Boutons des écrans coffre-fort (hauteur 48px, rayon 12px).
 * Utilisable sur <button> comme sur <Link>. Système unique : voir docs/DESIGN_SYSTEM.md.
 * Témoignages compris : plus de bouton violet hors Coach IA (le violet reste un accent).
 */
const primary = 'bg-leaf-500 text-white shadow-[0_8px_20px_-10px_rgba(46,125,50,0.55)] hover:bg-leaf-600'
const secondary = 'border border-night-200 bg-white text-night-900 hover:bg-night-50'
const ghost = 'bg-transparent text-leaf-600 hover:bg-leaf-50'

export const btn = cva(
  'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-[transform,background-color,border-color,box-shadow] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 text-[15px]',
  {
    variants: {
      variant: {
        primary,
        secondary,
        ghost,
        danger: 'bg-alert-500 text-white hover:bg-alert-600',
        dangerOutline: 'border border-alert-300 bg-white text-alert-600 hover:bg-alert-50',
        // Alias historiques — suivent désormais le système.
        /** @deprecated utiliser `primary` */
        leaf: primary,
        /** @deprecated utiliser `primary` (plus de bouton violet hors Coach IA) */
        iris: primary,
        /** @deprecated utiliser `primary` (le bleu nuit est réservé aux textes) */
        night: primary,
        /** @deprecated utiliser `secondary` */
        outline: secondary,
        /** @deprecated utiliser `secondary` */
        outlineLeaf: secondary,
        /** @deprecated utiliser `secondary` */
        outlineIris: secondary,
        /** @deprecated utiliser `ghost` */
        ghostLeaf: ghost,
        /** @deprecated utiliser `ghost` */
        ghostIris: ghost,
      },
      size: {
        md: 'h-12 px-5',
        sm: 'h-11 px-4 text-sm',
      },
      full: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'primary', size: 'md', full: true },
  },
)
export type BtnProps = VariantProps<typeof btn>
