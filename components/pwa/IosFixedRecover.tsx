'use client'

import { useEffect } from 'react'

/**
 * Safari iPhone / iPad : après la fermeture du clavier (saisie, dictée), les éléments en
 * position fixe (barre d'onglets, bulle du Coach, bouton « Verrouiller ») restent parfois
 * bloqués à la hauteur qu'ils avaient clavier ouvert, au milieu de l'écran, jusqu'au prochain
 * défilement. On force alors Safari à recalculer la mise en page par un défilement nul.
 */
export function IosFixedRecover() {
  useEffect(() => {
    const ua = navigator.userAgent
    const appleMobile = /iP(hone|ad|od)/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    if (!appleMobile) return

    let timer = 0
    const nudge = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        const active = document.activeElement
        // Clavier encore ouvert (un autre champ a pris le focus) : rien à recaler.
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || (active as HTMLElement).isContentEditable)) return
        const { scrollX, scrollY } = window
        window.scrollTo(scrollX, scrollY + 1)
        window.requestAnimationFrame(() => window.scrollTo(scrollX, scrollY))
      }, 120)
    }
    const vv = window.visualViewport
    let lastHeight = vv?.height ?? window.innerHeight
    const onResize = () => {
      const h = vv?.height ?? window.innerHeight
      if (h > lastHeight + 80) nudge() // le clavier vient de se fermer
      lastHeight = h
    }

    document.addEventListener('focusout', nudge)
    vv?.addEventListener('resize', onResize)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('focusout', nudge)
      vv?.removeEventListener('resize', onResize)
    }
  }, [])
  return null
}
