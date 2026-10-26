import { cn } from '@/lib/cn'

/**
 * Icône d'application Lien Parental, composée en SVG pour les illustrations
 * de la page d'installation (fond bleu marine, « L » blanc, maillons verts).
 * Purement décorative : toujours masquée aux lecteurs d'écran.
 */
export function AppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={cn('shrink-0', className)} aria-hidden focusable="false">
      <rect width="512" height="512" rx="112" fill="#0b2d5b" />
      <path d="M136 112v288h192v-48H196V112z" fill="#fff" />
      <g transform="translate(320 300)" fill="none" stroke="#4caf50" strokeWidth="22" strokeLinecap="round">
        <ellipse rx="42" ry="26" transform="rotate(-25)" />
        <ellipse cx="46" cy="34" rx="42" ry="26" transform="rotate(-25 46 34)" />
      </g>
    </svg>
  )
}
