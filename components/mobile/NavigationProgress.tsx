'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

/**
 * Barre de progression en haut de l'écran, affichée dès le clic sur un lien interne et retirée
 * quand l'URL change. Retour immédiat là où aucun loading.tsx ne peut s'afficher : coffre-fort et
 * dossier (leur garde serveur ne doit jamais être préchargée), sous-écrans sans squelette.
 * Décorative (aria-hidden) : l'écran d'arrivée s'annonce lui-même.
 */
export function NavigationProgress() {
  const pathname = usePathname()
  const search = useSearchParams().toString()
  const [active, setActive] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      // Pas de test de e.defaultPrevented : next/link annule lui-même le clic pour naviguer côté client.
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.('a')
      if (!a || !a.href || (a.target && a.target !== '_self') || a.hasAttribute('download')) return
      const url = new URL(a.href, location.href)
      if (url.origin !== location.origin) return
      // Même écran (ancre ou lien vers la page courante) : aucune navigation à attendre.
      const trim = (p: string) => (p.length > 1 ? p.replace(/\/+$/, '') : p)
      if (trim(url.pathname) === trim(location.pathname) && url.search === location.search) return
      setActive(true)
      // Navigation abandonnée ou en erreur : la barre ne reste jamais affichée.
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setActive(false), 10_000)
    }
    // Retour depuis le cache arrière du navigateur : la page restaurée ne doit pas garder la barre.
    const onPageShow = (e: PageTransitionEvent) => { if (e.persisted) setActive(false) }
    document.addEventListener('click', onClick)
    window.addEventListener('pageshow', onPageShow)
    return () => {
      document.removeEventListener('click', onClick)
      window.removeEventListener('pageshow', onPageShow)
      window.clearTimeout(timer.current)
    }
  }, [])

  useEffect(() => {
    setActive(false)
    window.clearTimeout(timer.current)
  }, [pathname, search])

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px] overflow-hidden">
      <div
        className={
          active
            // Mouvement réduit : barre fixe au tiers (une barre pleine se lirait « terminé »).
            ? 'h-full origin-left scale-x-[0.33] bg-leaf-500 motion-safe:animate-[lp-nav-progress_8s_cubic-bezier(0.1,0.7,0.2,1)_forwards]'
            : 'h-full origin-left scale-x-0 bg-leaf-500 opacity-0'
        }
      />
    </div>
  )
}
