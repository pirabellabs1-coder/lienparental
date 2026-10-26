import Link from 'next/link'
import { Logo } from '@/components/brand/Logo'
import { SUPPORT_EMAIL } from '@/components/profil/data'
import { cn } from '@/lib/cn'
import { TERRITORIES, TerritoryShape } from './territories'

// Pied de page unique des pages publiques.
// « À propos » pointe vers /don, seule page publique qui présente l'association à ce jour.
const LINKS: [string, string][] = [
  ['À propos', '/don'],
  ['Fonctionnalités', '/#fonctionnalites'],
  ['Guide parental', '/#guide'],
  ['Tarifs', '/#tarifs'],
  ['FAQ', '/aide'],
  ['Contact', `mailto:${SUPPORT_EMAIL}`],
  ['Mentions légales', '/legal/mentions'],
  ['Politique de confidentialité', '/legal/confidentialite'],
  ['Conditions d’utilisation', '/legal/cgu'],
  ['Installer l’application', '/installer'],
  ['Blog', '/blog'],
]

export function SiteFooter() {
  return (
    <footer className="site-footer border-t border-[#E5E7EB] bg-white text-night-900">
      <div className="mx-auto grid w-full max-w-[1200px] grid-cols-1 gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[1fr_2fr] lg:gap-16 [&>*]:min-w-0">
        <div>
          <Link href="/" aria-label="Lien Parental, accueil" className="inline-flex rounded-lg">
            <Logo size="md" tagline />
          </Link>
          <p className="mt-4 max-w-[36ch] text-[14px] leading-relaxed text-night-700">
            L’application des parents séparés : organiser, communiquer, conserver et comprendre ses démarches, dans l’intérêt de l’enfant.
          </p>
        </div>
        <div>
          <nav aria-label="Pied de page">
            <ul className="grid grid-cols-2 gap-x-6 sm:grid-cols-3">
              {LINKS.map(([label, href]) => (
                <li key={label}>
                  <Link href={href} className="inline-flex min-h-[44px] items-center text-[14.5px] text-night-800 hover:text-leaf-600">{label}</Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="mt-8 border-t border-[#E5E7EB] pt-6">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-night-700">France et DOM-TOM</h2>
            <p className="mt-1 text-[14px] text-night-700">Territoires du Guide parental</p>
            <ul className="mt-4 flex flex-wrap gap-2">
              {TERRITORIES.map(t => (
                <li key={t.code} className={cn('inline-flex items-center gap-2 rounded-full py-1.5 pl-2 pr-3 text-[13px] ring-1', t.available ? 'bg-leaf-50 ring-leaf-200' : 'bg-white ring-[#E5E7EB]')}>
                  <TerritoryShape path={t.path} available={t.available} className="h-5 w-5" />
                  <span className="font-semibold text-night-900">{t.name}</span>
                  <span className={t.available ? 'font-semibold text-leaf-700' : 'text-night-600'}>{t.available ? 'Disponible' : 'Bientôt'}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <div className="border-t border-[#E5E7EB]">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-1 px-5 py-6 text-[13px] text-night-600 sm:flex-row sm:justify-between sm:px-8">
          <p>© {new Date().getFullYear()} Lien Parental. Hébergement sécurisé en Europe.</p>
          <p>Lien Parental ne remplace pas un avocat.</p>
        </div>
      </div>
    </footer>
  )
}
