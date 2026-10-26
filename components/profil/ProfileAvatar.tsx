import { Camera } from 'lucide-react'
import { cn } from '@/lib/cn'

type Props = {
  name: string
  src?: string | null
  size?: number
  camera?: boolean
  className?: string
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || '?'
}

/** Photo de profil ronde avec pastille appareil photo (cf. maquette Mon profil). */
export function ProfileAvatar({ name, src, size = 88, camera = true, className }: Props) {
  return (
    <span className={cn('relative inline-flex shrink-0', className)} style={{ width: size, height: size }}>
      <span className="inline-flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-leaf-100 to-night-100 ring-1 ring-night-100">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" width={size} height={size} className="h-full w-full object-cover" />
        ) : (
          <span aria-hidden className="font-bold text-night-900" style={{ fontSize: size * 0.32 }}>{initials(name)}</span>
        )}
      </span>
      {camera && (
        <span
          aria-hidden
          className="absolute -bottom-0.5 -right-0.5 inline-flex items-center justify-center rounded-full bg-white text-night-900 shadow-soft ring-1 ring-night-100"
          style={{ width: size * 0.36, height: size * 0.36 }}
        >
          <Camera style={{ width: size * 0.2, height: size * 0.2 }} strokeWidth={2.2} />
        </span>
      )}
    </span>
  )
}
