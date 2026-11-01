'use client'

import { useEffect, useRef, useState } from 'react'

type Watcher = { onclose: (() => void) | null; destroy(): void }
type WatcherCtor = new () => Watcher

/**
 * Bouton « retour » d'Android (et geste retour) : ferme la fenêtre ouverte au lieu de quitter la page.
 * S'appuie sur CloseWatcher (Chrome / Samsung Internet récents), qui ne touche pas à l'historique :
 * aucun conflit avec le routeur de Next. Ailleurs (iPhone, Firefox), rien ne change.
 * Échap sur ordinateur : le gestionnaire clavier du composant appelle preventDefault, donc pas de
 * double fermeture. Une fenêtre ouverte sans nouveau geste (après un await) par-dessus une autre se
 * ferme avec elle : règle de groupement du navigateur.
 */
export function useCloseOnBack(open: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose)
  // Un CloseWatcher ne sert qu'une fois : si onClose a refusé (opération en cours), on en recrée un.
  const [arm, setArm] = useState(0)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!open) return
    const Ctor = (window as unknown as { CloseWatcher?: WatcherCtor }).CloseWatcher
    if (!Ctor) return
    let watcher: Watcher
    try {
      watcher = new Ctor()
    } catch {
      return
    }
    watcher.onclose = () => {
      onCloseRef.current()
      setArm((n) => n + 1)
    }
    return () => watcher.destroy()
  }, [open, arm])
}
