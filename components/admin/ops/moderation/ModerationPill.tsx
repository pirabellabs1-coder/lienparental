/**
 * Statut de modération d'un compte (Actif, Non vérifié, Suspendu jusqu'au …, Désactivé, Supprimé)
 * et compteur d'avertissements. Composants sans état : utilisables côté serveur et client.
 */
import { AlertTriangle } from 'lucide-react'
import { stateLabel, type ModerationState } from '@/lib/admin/ops/moderation'
import { Pill, fmtDateTime, type Tone } from '../ui'

export const MODERATION_STATE_TONE: Record<ModerationState, Tone> = {
  actif: 'ok', non_verifie: 'warn', suspendu: 'danger', desactive: 'dark', supprime: 'neutral',
}

/** `stacked` : « Suspendu » puis la date de fin sur une seconde ligne (colonnes étroites du tableau). */
export function ModerationPill({ state, until, stacked = false }: { state: ModerationState; until: string | null; stacked?: boolean }) {
  if (stacked && state === 'suspendu' && until) {
    return (
      <span className="inline-flex flex-col items-start gap-0.5">
        <Pill tone={MODERATION_STATE_TONE[state]}>Suspendu</Pill>
        <span className="whitespace-nowrap text-[12px] text-night-600">jusqu’au <time dateTime={until}>{fmtDateTime(until)}</time></span>
      </span>
    )
  }
  return <Pill tone={MODERATION_STATE_TONE[state]}>{stateLabel({ state, until }, fmtDateTime)}</Pill>
}

/** Compteur d'avertissements ; null = journal de modération indisponible. */
export function WarningCount({ count, compact = false }: { count: number | null; compact?: boolean }) {
  if (count === null) {
    return <span className="text-night-400" title="Journal de modération indisponible">—<span className="sr-only">Avertissements : inconnu (journal de modération indisponible)</span></span>
  }
  const label = `${count} avertissement${count > 1 ? 's' : ''}`
  if (count === 0) return <span className="tabular-nums text-night-500">{compact ? <>0<span className="sr-only"> avertissement</span></> : 'Aucun avertissement'}</span>
  return (
    <Pill tone="warn">
      <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
      {compact ? <>{count}<span className="sr-only"> {label.slice(String(count).length + 1)}</span></> : label}
    </Pill>
  )
}
