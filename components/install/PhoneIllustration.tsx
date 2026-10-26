import { cn } from '@/lib/cn'
import { AppIcon } from './AppIcon'

// Téléphone générique (aucune marque) avec l'icône Lien Parental sur l'écran d'accueil.
// Décoratif : le titre et le sous-titre portent déjà l'information.

const TILE_COLORS = ['bg-night-100', 'bg-leaf-100', 'bg-night-200', 'bg-night-100', 'bg-leaf-100', 'bg-night-100', 'bg-night-200', 'bg-leaf-100']

export function PhoneIllustration({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('relative', className)}>
      {/* halo */}
      <div className="absolute -inset-2 rounded-[36px] bg-leaf-50" />
      <div className="relative h-full w-full rotate-[6deg] rounded-[26px] bg-night-950 p-[5px] shadow-card">
        <div className="relative flex h-full w-full flex-col overflow-hidden rounded-[21px] bg-gradient-to-b from-night-50 via-white to-leaf-50">
          {/* encoche */}
          <span className="mx-auto mt-1.5 h-[7px] w-10 rounded-full bg-night-950" />
          {/* barre d'état */}
          <div className="mt-1 flex justify-between px-3 text-[6px] font-bold text-night-900">
            <span>9:41</span>
            <span className="flex items-center gap-0.5">
              <span className="h-[4px] w-[7px] rounded-[1px] bg-night-900" />
            </span>
          </div>
          {/* grille d'applications */}
          <div className="mt-3 grid grid-cols-3 gap-x-2 gap-y-2.5 px-3">
            <span className="col-span-3 mb-0.5 flex flex-col items-center">
              <span className="rounded-[9px] ring-2 ring-leaf-400 ring-offset-2 ring-offset-white">
                <AppIcon className="h-9 w-9 drop-shadow-sm" />
              </span>
              <span className="mt-1 text-[6.5px] font-bold text-night-900">Lien Parental</span>
            </span>
            {TILE_COLORS.slice(0, 6).map((c, i) => (
              <span key={i} className={cn('aspect-square rounded-[6px]', c)} />
            ))}
          </div>
          {/* dock */}
          <div className="mx-2 mb-2 mt-auto grid grid-cols-4 gap-1.5 rounded-[10px] bg-white/80 p-1.5 ring-1 ring-night-100">
            {TILE_COLORS.slice(4, 8).map((c, i) => (
              <span key={i} className={cn('aspect-square rounded-[5px]', c)} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
