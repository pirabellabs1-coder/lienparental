import { ReponseClient } from './ReponseClient'

// M09 — étape 4 « Réponse de l'IA » (maquette 12.12.07 (2)).
// ?id=… : analyse relue depuis l'historique ; sinon : dernière analyse de la session.
export default async function CoachReponsePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const raw = Array.isArray(sp.id) ? sp.id[0] : sp.id
  return <ReponseClient id={raw && /^[A-Za-z0-9_-]{1,64}$/.test(raw) ? raw : undefined} />
}
