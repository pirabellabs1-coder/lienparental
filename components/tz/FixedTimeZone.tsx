'use client'
import { setCurrentTz } from '@/lib/tz'

/**
 * Fuseau imposé à toute une zone (espace admin : heure de Guyane, outil interne). Posé pendant
 * le rendu, avant les pages ; écrase le fuseau d'un utilisateur venu de l'espace connecté.
 */
export function FixedTimeZone({ tz, children }: { tz: string; children: React.ReactNode }) {
  setCurrentTz(tz)
  return <>{children}</>
}
