import Image from 'next/image'
import { cn } from '@/lib/cn'

/**
 * Icône d'application Lien Parental telle qu'elle apparaît une fois installée (public/icons/icon-192.png,
 * logo officiel sur fond blanc), pour les illustrations de la page d'installation.
 * Purement décorative : toujours masquée aux lecteurs d'écran.
 */
export function AppIcon({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn('relative block shrink-0 overflow-hidden rounded-[22%] bg-white ring-1 ring-night-100', className)}>
      <Image src="/icons/icon-192.png" alt="" fill sizes="96px" className="object-cover" />
    </span>
  )
}
