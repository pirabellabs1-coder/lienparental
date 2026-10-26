import { Compass, Heart, MapPin, Target } from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { Logo } from '@/components/brand/Logo'
import { APP_VERSION } from '@/components/profil/data'

export default function AproposPage() {
  return (
    <>
      <TopBar title="À propos" showBack backHref="/app/aide" showBell={false} />
      <div className="px-5 pb-8 pt-4">
        <div className="flex flex-col items-center text-center">
          <Logo size="lg" tagline />
          <p className="mt-3 text-[12.5px] text-night-800">Version {APP_VERSION}</p>
        </div>

        <p className="mt-6 text-[12.5px] leading-relaxed text-night-800">
          Lien Parental accompagne les parents séparés dans l’organisation, les démarches et la préservation du lien parent-enfant.
        </p>

        <ul className="mt-6 space-y-5">
          <Item icon={<Target className="h-5 w-5" />} title="Notre mission">
            Favoriser une communication saine et respectueuse entre parents.
          </Item>
          <Item icon={<Compass className="h-5 w-5" />} title="Notre vision">
            Un monde où chaque enfant peut garder un lien fort et équilibré avec ses deux parents.
          </Item>
          <Item
            icon={<MapPin className="h-5 w-5" />}
            title={<>Développé avec <Heart className="inline h-3.5 w-3.5 fill-alert-500 text-alert-500" aria-label="amour" /> en France</>}
          >
            Merci de faire confiance à Lien Parental.
          </Item>
        </ul>

        <p className="mt-8 text-center text-[11.5px] text-night-700">
          © {new Date().getFullYear()} <span className="font-bold text-night-900">Lien Parental</span>. Tous droits réservés.
        </p>
      </div>
    </>
  )
}

function Item({ icon, title, children }: { icon: React.ReactNode; title: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-4">
      <span aria-hidden className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-night-100 text-night-900">{icon}</span>
      <span>
        <span className="block text-[13px] font-bold text-night-900">{title}</span>
        <span className="mt-1 block text-[12.5px] leading-relaxed text-night-800">{children}</span>
      </span>
    </li>
  )
}
