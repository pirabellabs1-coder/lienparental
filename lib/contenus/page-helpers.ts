import 'server-only'
import { notFound } from 'next/navigation'
import { getContent, RepoError, type AdminCtx } from './repo'
import type { ContentKind, ContentRecord } from './types'

/** Enregistrement à éditer (`nouveau` = création) ; 404 si l'identifiant n'existe pas. */
export async function loadForEdit<K extends ContentKind>(ctx: AdminCtx, kind: K, id: string): Promise<ContentRecord<K> | null> {
  if (id === 'nouveau') return null
  try {
    return await getContent(ctx, kind, id)
  } catch (e) {
    if (e instanceof RepoError && e.code === 'not_found') notFound()
    throw e
  }
}
