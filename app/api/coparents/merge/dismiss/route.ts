import { jsonError, jsonOk } from '@/lib/data/server/http'
import { familyContext, limited, readJson, rpcError } from '@/lib/coparents/server/context'
import { dismissSchema } from '@/lib/coparents/validation'

// POST /api/coparents/merge/dismiss { myChildId, sharedChildId } : « ce n'est pas le même enfant ».
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const ctx = await familyContext(req)
  if ('error' in ctx) return ctx.error
  const tooMany = await limited(ctx.user.id, 'write', 60, 60_000)
  if (tooMany) return tooMany
  const parsed = dismissSchema.safeParse(await readJson(req))
  if (!parsed.success) return jsonError(422, 'invalid', 'Requête invalide.')

  const { error } = await ctx.db.rpc('dismiss_merge_candidate', {
    p_my_child_id: parsed.data.myChildId, p_shared_child_id: parsed.data.sharedChildId,
  })
  if (error) return rpcError(error, 'merge.dismiss')
  return jsonOk({ ok: true })
}
