import { loadCoachUsage } from '@/lib/ai/quota'
import { HistoriqueClient } from './HistoriqueClient'

export const dynamic = 'force-dynamic'

// M09 — Coach IA · Historique des analyses du cycle (maquette 12.12.09, page 3).
export default async function CoachUtilisationHistoriquePage() {
  const { used, total, log } = await loadCoachUsage()
  return <HistoriqueClient used={used} total={total} log={log} />
}
