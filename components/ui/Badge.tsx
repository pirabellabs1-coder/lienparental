import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'
import type { HTMLAttributes } from 'react'

const badge = cva(
  'inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap',
  {
    variants: {
      variant: {
        neutral: 'bg-night-100 text-night-800 dark:bg-night-800 dark:text-night-100',
        success: 'bg-leaf-100 text-leaf-800',
        warning: 'bg-gold-100 text-gold-800',
        danger:  'bg-alert-100 text-alert-700',
        info:    'bg-night-100 text-night-800 dark:bg-night-800 dark:text-night-100',
        iris:    'bg-iris-100 text-iris-800',
        premium: 'bg-gradient-to-r from-gold-200 to-gold-300 text-night-900 shadow-soft',
      },
      size: {
        sm: 'px-2 py-0.5 text-[11px]',
        md: 'px-2.5 py-1 text-xs',
        lg: 'px-3 py-1.5 text-sm',
      },
    },
    defaultVariants: { variant: 'neutral', size: 'md' },
  }
)

type Props = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge> & {
  dot?: boolean
}

export function Badge({ className, variant, size, dot, children, ...props }: Props) {
  return (
    <span className={cn(badge({ variant, size }), className)} {...props}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-75" aria-hidden="true" />}
      {children}
    </span>
  )
}
