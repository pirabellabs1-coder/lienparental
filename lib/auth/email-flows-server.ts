import 'server-only'
/**
 * Branchement réel de lib/auth/email-flows.ts : Supabase Auth admin (service_role),
 * limiteur partagé 0390 (fail-closed), envoi Resend.
 */
import { randomBytes } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/data/server/rate-limit'
import { sendEmail } from '@/lib/email/send'
import { appOrigin } from '@/lib/email/templates/notificationParts'
import type { ExistingUser, FlowDeps, GeneratedLink } from './email-flows'

export function serverFlowDeps(): FlowDeps | null {
  let admin: SupabaseClient
  try {
    admin = createServiceClient() as unknown as SupabaseClient
  } catch {
    return null
  }
  return {
    rateLimit: (key, limit, windowMs) => rateLimit(key, limit, windowMs, { failClosed: true }),

    async findUser(email): Promise<ExistingUser | null> {
      const { data, error } = await admin
        .from('users')
        .select('id, prenom, email_verified, deleted_at')
        .eq('email', email)
        .maybeSingle()
      if (error) throw new Error(`find_user_${error.code ?? 'error'}`)
      if (!data) return null
      const u = data as { id: string; prenom: string | null; email_verified: boolean; deleted_at: string | null }
      return { id: u.id, prenom: (u.prenom ?? '').trim(), confirmed: u.email_verified, deleted: Boolean(u.deleted_at) }
    },

    async generateLink(args): Promise<GeneratedLink> {
      const res = args.type === 'signup'
        ? await admin.auth.admin.generateLink({
            type: 'signup', email: args.email, password: args.password,
            options: { redirectTo: args.redirectTo },
          })
        : await admin.auth.admin.generateLink({ type: 'recovery', email: args.email, options: { redirectTo: args.redirectTo } })
      if (res.error || !res.data?.properties) return { ok: false, code: res.error?.code ?? 'generate_failed' }
      const p = res.data.properties
      if (!p.email_otp || !p.hashed_token) return { ok: false, code: 'missing_token' }
      return { ok: true, otp: p.email_otp, hashedToken: p.hashed_token }
    },

    async sendEmail(args) {
      const r = await sendEmail(args)
      return { ok: r.ok }
    },

    // Mot de passe jetable (jamais communiqué) : respecte toute politique ; remplacé par celui de
    // l'utilisateur après vérification de l'adresse. GoTrue l'ignore pour un compte existant.
    randomPassword: () => `${randomBytes(32).toString('base64url')}Aa1`,

    appOrigin: appOrigin(),

    log: (msg, meta) => console.warn(`[auth-email] ${msg}`, meta ?? {}),
  }
}
