import { z } from 'zod'
import { getTranslations } from 'next-intl/server'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { isPlausibleToken, jsonError, jsonOk } from '@/lib/data/server/http'
import { clientIp, ipHash, ipKey, rateLimit, rateLimitedResponse, tokenKey } from '@/lib/data/server/rate-limit'
import {
  WITNESS_BUCKET, WITNESS_MAX_FILES, WITNESS_MAX_SUBMISSIONS,
  resolveRequest, serviceClientOrNull,
} from '@/lib/data/server/witness'
import { addToVaultFromSource } from '@/lib/vault/from-source'

// Espace témoin public (aucun compte).
//   GET  /api/temoin/[token]  → personnes concernées (noms saisis par le parent) ;
//   POST /api/temoin/[token]  → envoi du témoignage (RPC record_testimony_submission, service_role).
// ip_hash : HMAC calculé ICI à partir de l'IP vue par le serveur, passé en paramètre dédié
// (jamais repris d'un champ client). Plafond de WITNESS_MAX_SUBMISSIONS envois par lien
// appliqué dans la fonction SQL sous verrou FOR UPDATE (0270, erreur 54000).
// Jamais de user_id, d'e-mail, de contexte privé ni d'autres demandes dans les réponses.

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ token: string }> }

const MAX_TEXT = 20_000

const payloadSchema = z.object({
  texte_original: z.string().trim().min(1).max(MAX_TEXT),
  texte_ia: z.string().trim().max(MAX_TEXT).optional(),
  texte_envoye: z.string().trim().min(1).max(MAX_TEXT),
  temoin: z.object({
    lien: z.string().trim().max(80).optional(),
    duree: z.string().trim().max(80).optional(),
  }).strict().default({}),
  reponses: z.record(z.string().max(80), z.string().max(4000)).refine((r) => Object.keys(r).length <= 60).default({}),
  attachments: z.array(z.object({ path: z.string().max(200), name: z.string().trim().max(120).optional() }).strict())
    .max(WITNESS_MAX_FILES).default([]),
  certified: z.literal(true),
}).strict()

type T = Awaited<ReturnType<typeof getTranslations>>

async function guard(req: Request, ctx: Ctx, kind: 'read' | 'write', t: T) {
  if (!SUPABASE_ENABLED) return { error: jsonError(503, 'not_configured', t('serviceUnavailableShort')) } as const
  const ip = clientIp(req.headers)
  // Fail-closed : balayage de jetons témoin (503 si le compteur partagé est indisponible).
  const rl = kind === 'read'
    ? await rateLimit(ipKey('temoin:read', ip), 30, 60_000, { failClosed: true })
    : await rateLimit(ipKey('temoin:write', ip), 5, 10 * 60_000, { failClosed: true })
  if (!rl.ok) {
    return { error: await rateLimitedResponse(rl, t('tooManyAttempts')) } as const
  }
  const { token } = await ctx.params
  if (!isPlausibleToken(token)) return { error: jsonError(404, 'not_found', t('linkNotFound')) } as const
  return { token, ip } as const
}

export async function GET(req: Request, ctx: Ctx) {
  const t = await getTranslations('server.temoin')
  const g = await guard(req, ctx, 'read', t)
  if ('error' in g) return g.error
  let r
  try {
    r = await resolveRequest(g.token)
  } catch {
    return jsonError(503, 'unavailable', t('serviceUnavailable'))
  }
  if (!r) return jsonError(404, 'not_found', t('linkNotFound'))

  // Suivi « ouvert » côté parent (best effort, n'expose rien).
  const svc = serviceClientOrNull()
  if (svc) {
    await svc.from('testimony_requests')
      .update({ opened_at: new Date().toISOString(), status: 'opened' })
      .eq('id', r.id).eq('status', 'pending').is('opened_at', null)
  }

  return jsonOk({
    parentPrenom: r.parentPrenom,
    parents: r.parents.map((nom, i) => ({ id: `p_${i + 1}`, nom, role: t('parentRole', { n: i + 1 }) })),
    enfants: r.enfants.map((nom, i) => ({ id: `e_${i + 1}`, nom, role: t('childRole', { n: i + 1 }) })),
    expiresAt: r.expiresAt,
  })
}

export async function POST(req: Request, ctx: Ctx) {
  const t = await getTranslations('server.temoin')
  const g = await guard(req, ctx, 'write', t)
  if ('error' in g) return g.error
  const perToken = await rateLimit(tokenKey('temoin:write-token', g.token), WITNESS_MAX_SUBMISSIONS, 60 * 60_000, { failClosed: true })
  if (!perToken.ok) return rateLimitedResponse(perToken, t('tooManySubmissions'))

  const len = Number(req.headers.get('content-length') ?? 0)
  if (len > 256 * 1024) return jsonError(413, 'too_large', t('tooLarge'))

  const parsed = payloadSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonError(422, 'invalid', t('invalidPayload'))
  const v = parsed.data

  let r
  try {
    r = await resolveRequest(g.token)
  } catch {
    return jsonError(503, 'unavailable', t('serviceUnavailable'))
  }
  if (!r) return jsonError(404, 'not_found', t('linkNotFound'))

  const svc = serviceClientOrNull()
  if (!svc) return jsonError(503, 'unavailable', t('serviceUnavailable'))

  // Pièces jointes : uniquement des objets déposés par /upload POUR CETTE DEMANDE.
  // Taille et type sont relus côté Storage, jamais repris du client.
  const attachments: { path: string; mime: string; size: number; name?: string }[] = []
  if (v.attachments.length > 0) {
    const pattern = new RegExp(`^${r.id}/[0-9a-f-]{36}\\.(pdf|jpg|png|webp)$`)
    const { data: objects, error } = await svc.storage.from(WITNESS_BUCKET).list(r.id, { limit: 100 })
    if (error) return jsonError(503, 'unavailable', t('attachmentsCheckFailed'))
    for (const a of v.attachments) {
      if (!pattern.test(a.path)) return jsonError(422, 'invalid_attachment', t('attachmentInvalid'))
      const obj = (objects ?? []).find((o) => `${r.id}/${o.name}` === a.path)
      if (!obj) return jsonError(422, 'invalid_attachment', t('attachmentNotFound'))
      const meta = (obj.metadata ?? {}) as { size?: number; mimetype?: string }
      attachments.push({ path: a.path, mime: meta.mimetype ?? 'application/octet-stream', size: Number(meta.size ?? 0), name: a.name })
    }
  }

  // Payload construit champ par champ (aucune clé client recopiée telle quelle).
  const payload = {
    temoin: { nom: '', prenom: '', ...v.temoin },
    reponses: v.reponses,
    texte_original: v.texte_original,
    texte_ia: v.texte_ia ?? '',
    texte_envoye: v.texte_envoye,
    attachments,
  }
  const rpcArgs = {
    p_token: g.token,
    p_testimony_payload: payload,
    p_ip_hash: ipHash(g.ip),
    p_user_agent: (req.headers.get('user-agent') ?? '').slice(0, 200) || null,
  }

  // generate_testimony_reference() compte les témoignages de l'année : deux envois
  // simultanés peuvent viser la même référence (UNIQUE) → une nouvelle tentative suffit.
  let id: string | null = null
  for (let attempt = 0; attempt < 3 && !id; attempt++) {
    const { data, error } = await svc.rpc('record_testimony_submission', rpcArgs)
    if (!error) { id = data as string; break }
    if (error.code === 'P0002') return jsonError(404, 'not_found', t('linkNotFound'))
    if (error.code === '54000') return jsonError(409, 'limit_reached', t('limitReached'))
    if (error.code !== '23505') {
      console.warn('[api/temoin] RPC record_testimony_submission', error.code ?? 'unknown')
      return jsonError(500, 'db_error', t('submitFailed'))
    }
  }
  if (!id) return jsonError(503, 'busy', t('busy'))

  const testimonyId = id
  const { data: ref } = await svc.from('testimonies').select('reference').eq('id', testimonyId).maybeSingle()
  const reference = (ref as { reference?: string } | null)?.reference ?? null

  // Pièces jointes → coffre-fort du parent demandeur (lib/vault/from-source.ts) : copie relue
  // côté serveur, idempotente par (parent, 'temoignage', `${testimonyId}:${n}`). Jamais bloquant
  // pour le témoin : un échec est journalisé (code seul) et le témoignage reste enregistré.
  if (attachments.length > 0) {
    const { data: owner } = await svc.from('testimony_requests').select('user_id').eq('id', r.id).maybeSingle()
    const userId = (owner as { user_id?: string } | null)?.user_id
    if (userId) {
      const results = await Promise.allSettled(attachments.map((a, n) =>
        addToVaultFromSource(svc, {
          userId,
          source: 'temoignage',
          sourceRef: `${testimonyId}:${n}`,
          from: { bucket: WITNESS_BUCKET, path: a.path },
          name: a.name || `Pièce ${n + 1} du témoignage`,
          categoryName: 'Dossier JAF',
          description: reference ? `Pièce jointe au témoignage ${reference}` : 'Pièce jointe à un témoignage',
          meta: { testimonyId, reference },
        }),
      ))
      const failed = results.filter((x) => x.status === 'rejected').length
      if (failed) console.warn('[api/temoin] pièces non rangées dans le coffre :', failed)
    }
  }

  return jsonOk({ ok: true, reference }, 201)
}
