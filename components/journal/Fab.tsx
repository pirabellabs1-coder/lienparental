import Link from 'next/link'
import { Plus } from 'lucide-react'

/** Bouton flottant vert « + » (maquettes Chronologie / Semaine).
 *  `sticky` en fin de contenu : reste dans la colonne de contenu (mobile comme desktop),
 *  sans calcul de largeur figée. À placer en dernier enfant de la page.
 *  `data-fab` : la bulle du Coach (components/assistant) se place au-dessus. */
export function Fab({ href, label }: { href: string; label: string }) {
  return (
    <div
      data-fab
      className="pointer-events-none sticky z-20 flex justify-end px-4 pb-2"
      style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <Link
        href={href}
        aria-label={label}
        className="pointer-events-auto grid h-14 w-14 place-items-center rounded-full bg-leaf-500 text-white shadow-[0_10px_24px_-8px_rgba(46,125,50,0.7)] transition-colors hover:bg-leaf-600 motion-safe:active:scale-95"
      >
        <Plus aria-hidden="true" className="h-7 w-7" strokeWidth={2.2} />
      </Link>
    </div>
  )
}
