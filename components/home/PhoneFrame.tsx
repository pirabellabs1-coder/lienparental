import Image from 'next/image'
import { cn } from '@/lib/cn'

// Cadre de téléphone autour d'une vraie capture de l'application.
export function PhoneFrame({ src, alt, className, priority, sizes = '300px' }: { src: string; alt: string; className?: string; priority?: boolean; sizes?: string }) {
  return (
    <div className={cn('rounded-[2.6rem] bg-night-950 p-[7px] shadow-[0_50px_100px_-30px_rgba(11,45,91,0.55),inset_0_0_0_1px_rgba(255,255,255,0.08)]', className)}>
      <div className="relative aspect-[390/844] overflow-hidden rounded-[2.15rem] bg-white">
        <Image src={src} alt={alt} fill priority={priority} sizes={sizes} className="object-cover object-top" />
      </div>
    </div>
  )
}
