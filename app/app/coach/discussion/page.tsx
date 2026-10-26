import { AI_ENABLED } from '@/lib/supabase/config'
import { DiscussionClient } from './DiscussionClient'

// M09 — étape 5 « Analyse de l'IA » : questions / réponses (maquette 12.12.07 (3)).
// - ?q=…          : question venue du dashboard, réponse sur la base de connaissances ;
// - ?analysis=id  : questions sur une analyse précise (sinon : dernière analyse de la session).
export default async function CoachDiscussionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  const q = one(sp.q)?.slice(0, 2000)
  const analysis = one(sp.analysis)
  return (
    <DiscussionClient
      aiEnabled={AI_ENABLED}
      initialQuestion={q?.trim() ? q : undefined}
      analysisId={analysis && /^[A-Za-z0-9_-]{1,64}$/.test(analysis) ? analysis : undefined}
    />
  )
}
