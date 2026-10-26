import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'
import type { HTMLAttributes } from 'react'

const avatar = cva(
  'inline-flex items-center justify-center overflow-hidden rounded-full font-semibold shrink-0 select-none',
  {
    variants: {
      size: {
        xs: 'h-7 w-7 text-[10px]',
        sm: 'h-9 w-9 text-xs',
        md: 'h-11 w-11 text-sm',
        lg: 'h-14 w-14 text-base',
      },
      tone: {
        night: 'bg-night-100 text-night-800 dark:bg-night-800 dark:text-night-100',
        leaf:  'bg-leaf-100 text-leaf-800',
        iris:  'bg-iris-100 text-iris-800',
        gold:  'bg-gold-100 text-gold-800',
      },
    },
    defaultVariants: { size: 'md', tone: 'night' },
  }
)

type Props = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof avatar> & {
  src?: string | null
  alt?: string
  name?: string
}

function initials(name?: string): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map(p => p[0]?.toUpperCase() ?? '').join('') || '?'
}

export function Avatar({ src, alt, name, size, tone, className, ...props }: Props) {
  return (
    <span className={cn(avatar({ size, tone }), className)} {...props}>
      {src ? (
        <img src={src} alt={alt ?? name ?? ''} className="h-full w-full object-cover" />
      ) : (
        <span aria-hidden={!name} aria-label={!name ? alt : undefined}>{initials(name)}</span>
      )}
    </span>
  )
}
