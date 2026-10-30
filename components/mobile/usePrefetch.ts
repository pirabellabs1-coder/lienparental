'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

/**
 * Précharge, dès l'arrivée sur l'écran, les destinations des boutons qui naviguent par
 * router.push (après un envoi, un choix de fichier…) : next/link ne le fait que pour les liens.
 * Préchargement automatique de Next : jusqu'au loading.tsx de la destination, d'où un squelette
 * immédiat au clic. Les valeurs vides sont ignorées.
 *
 * Le préchargement passe par le middleware avec les cookies du moment : ne jamais précharger une
 * page protégée avant que la session existe (sa redirection vers la connexion serait mise en cache
 * et réutilisée au clic), ni une URL dont le middleware consomme un cookie (lp_plan_intent sur /app).
 */
export function usePrefetch(...hrefs: (string | false | null | undefined)[]) {
  const router = useRouter()
  const key = hrefs.filter(Boolean).join('\n')
  useEffect(() => {
    for (const href of key.split('\n')) if (href) router.prefetch(href)
  }, [router, key])
}
