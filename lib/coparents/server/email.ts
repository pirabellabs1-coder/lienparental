import 'server-only'
/**
 * E-mails de la liaison des parents. Passent par lib/email/send.ts :
 * sans RESEND_API_KEY, aucun envoi et une ligne de journal expurgée.
 * Les notifications « acceptée / retiré » ne partent que si
 * SUPABASE_SERVICE_ROLE_KEY est configurée (lecture de l'e-mail du
 * destinataire, users n'étant lisible que par son propriétaire) et si le
 * destinataire n'a pas désactivé les e-mails (preferences.notif_email).
 * Exception : l'alerte « nouvel adulte lié » au titulaire (M2, audit v3) est
 * une notification de sécurité, envoyée même si notif_email est désactivé.
 */
import { baseLayout } from '@/lib/email/layout'
import { escapeHtml, safeUrl } from '@/lib/email/escape'
import { sendEmail } from '@/lib/email/send'
import { createServiceClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { GuardianRole } from '../types'
import { DEFAULT_TZ } from '@/lib/tz'
import { appUrl } from './context'

export type MailStatus = 'sent' | 'skipped' | 'failed'

const ROLE_SENTENCE: Record<GuardianRole, string> = {
  parent: 'en tant que parent : vous aurez accès à la fiche, à la santé, au calendrier ainsi qu’aux documents et dépenses partagés.',
  proche: 'en tant que proche : vous pourrez consulter le prénom, la classe et le calendrier partagé.',
}

function list(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`
}

function frDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: DEFAULT_TZ })
}

export async function sendFamilyInvitationEmail(args: {
  to: string
  inviterPrenom: string
  role: GuardianRole
  childPrenoms: string[]
  link: string
  expiresAt: string
  idempotencyKey: string
}): Promise<MailStatus> {
  const inviter = escapeHtml(args.inviterPrenom || 'Un parent')
  const kids = escapeHtml(list(args.childPrenoms) || 'votre enfant')
  const href = safeUrl(args.link, `${appUrl()}/app/coparents`)
  const body = `
    <p style="margin:0 0 16px 0;">Bonjour,</p>
    <p style="margin:0 0 16px 0;">${inviter} vous invite à rejoindre l’espace partagé de ${kids} sur Lien Parental, ${escapeHtml(ROLE_SENTENCE[args.role])}</p>
    <p style="margin:0 0 16px 0;">Le Journal personnel, le Coach IA et les documents non partagés de chacun restent privés.</p>
    <p style="margin:0;">Ce lien est personnel : il ne fonctionne qu’avec un compte vérifié à cette adresse e-mail. Il expire le ${escapeHtml(frDate(args.expiresAt))}.</p>
  `
  const res = await sendEmail({
    to: args.to,
    subject: `${args.inviterPrenom || 'Un parent'} vous invite sur Lien Parental`,
    html: baseLayout({
      preheader: `Invitation à l’espace partagé de ${list(args.childPrenoms)}`,
      title: 'Invitation à un espace partagé',
      body,
      cta: { label: 'Voir l’invitation', href },
      footer: 'Si vous ne connaissez pas cette personne, ignorez simplement ce message.',
    }),
    idempotencyKey: args.idempotencyKey,
  })
  return !res.ok ? 'failed' : res.skipped ? 'skipped' : 'sent'
}

type Recipient = { email: string; prenom: string }

/** E-mail + préférence d'un utilisateur (service_role). null = ne pas envoyer. */
async function recipient(userId: string, opts: { security?: boolean } = {}): Promise<Recipient | null> {
  let admin: SupabaseClient
  try {
    admin = createServiceClient() as unknown as SupabaseClient
  } catch {
    console.info('[coparents] notification non envoyée : SUPABASE_SERVICE_ROLE_KEY absent')
    return null
  }
  const [{ data: u }, { data: p }] = await Promise.all([
    admin.from('users').select('email, prenom, deleted_at').eq('id', userId).maybeSingle(),
    admin.from('preferences').select('notif_email').eq('user_id', userId).maybeSingle(),
  ])
  const user = u as { email?: string; prenom?: string; deleted_at?: string | null } | null
  if (!user?.email || user.deleted_at) return null
  if (!opts.security && (p as { notif_email?: boolean } | null)?.notif_email === false) return null
  return { email: user.email, prenom: user.prenom ?? '' }
}

export async function notifyInvitationAccepted(args: { inviterId: string; inviteePrenom: string; role: GuardianRole; idempotencyKey: string }) {
  const to = await recipient(args.inviterId)
  if (!to) return
  const who = escapeHtml(args.inviteePrenom || 'La personne invitée')
  const body = `
    <p style="margin:0 0 16px 0;">Bonjour ${escapeHtml(to.prenom || '')},</p>
    <p style="margin:0;">${who} a accepté votre invitation (${args.role === 'parent' ? 'parent' : 'proche'}). Vous pouvez gérer les adultes liés et leurs rôles à tout moment.</p>
  `
  await sendEmail({
    to: to.email,
    subject: 'Invitation acceptée sur Lien Parental',
    html: baseLayout({ title: 'Invitation acceptée', body, cta: { label: 'Gérer la famille', href: `${appUrl()}/app/coparents` } }),
    idempotencyKey: args.idempotencyKey,
  }).catch(() => undefined)
}

export async function notifyGuardianRemoved(args: { userId: string; childPrenom: string; idempotencyKey: string }) {
  const to = await recipient(args.userId)
  if (!to) return
  const body = `
    <p style="margin:0 0 16px 0;">Bonjour ${escapeHtml(to.prenom || '')},</p>
    <p style="margin:0;">Votre accès à l’espace partagé de ${escapeHtml(args.childPrenom || 'l’enfant')} a été retiré. Vos propres données (Journal, documents, Coach IA) ne sont pas concernées et restent dans votre espace.</p>
  `
  await sendEmail({
    to: to.email,
    subject: 'Accès à un espace partagé retiré',
    html: baseLayout({ title: 'Accès retiré', body }),
    idempotencyKey: args.idempotencyKey,
  }).catch(() => undefined)
}

/**
 * M2 (audit v3) : prévient le TITULAIRE de chaque fiche qu'un nouvel adulte y a accès.
 * Fiches et titulaires relus en service_role (jamais d'après la requête). Le titulaire
 * qui a lui-même envoyé l'invitation reçoit déjà « invitation acceptée » : il est ignoré.
 * Jamais bloquant : toute erreur est absorbée.
 */
export async function notifyOwnersNewAdult(args: {
  childIds: string[]
  newUserId: string
  newPrenom: string
  role: GuardianRole
  inviterId: string
  invitationId: string
}): Promise<void> {
  if (args.childIds.length === 0) return
  let admin: SupabaseClient
  try {
    admin = createServiceClient() as unknown as SupabaseClient
  } catch {
    console.info('[coparents] alerte titulaire non envoyée : SUPABASE_SERVICE_ROLE_KEY absent')
    return
  }
  try {
    const [{ data: kids }, { data: inviter }] = await Promise.all([
      admin.from('children').select('id, prenom, user_id').in('id', args.childIds).is('deleted_at', null),
      admin.from('users').select('prenom').eq('id', args.inviterId).maybeSingle(),
    ])
    const byOwner = new Map<string, string[]>()
    for (const k of (kids ?? []) as { id: string; prenom: string; user_id: string }[]) {
      if (k.user_id === args.inviterId || k.user_id === args.newUserId) continue
      byOwner.set(k.user_id, [...(byOwner.get(k.user_id) ?? []), k.prenom])
    }
    const who = escapeHtml(args.newPrenom || 'Un adulte')
    const by = escapeHtml((inviter as { prenom?: string } | null)?.prenom || 'un autre parent')
    for (const [ownerId, names] of byOwner) {
      const to = await recipient(ownerId, { security: true })
      if (!to) continue
      const body = `
        <p style="margin:0 0 16px 0;">Bonjour ${escapeHtml(to.prenom || '')},</p>
        <p style="margin:0 0 16px 0;">${who} a désormais accès à l’espace partagé de ${escapeHtml(list(names))} en tant que ${args.role === 'parent' ? 'parent' : 'proche'}, sur invitation de ${by}.</p>
        <p style="margin:0;">Si vous n’êtes pas d’accord, vous pouvez retirer cet accès à tout moment depuis la page Famille.</p>
      `
      await sendEmail({
        to: to.email,
        subject: 'Un nouvel adulte a accès à la fiche de votre enfant',
        html: baseLayout({ title: 'Nouvel adulte lié', body, cta: { label: 'Gérer la famille', href: `${appUrl()}/app/coparents` } }),
        idempotencyKey: `family-owner-alert:${args.invitationId}:${ownerId}`,
      }).catch(() => undefined)
    }
  } catch {
    console.warn('[coparents] alerte titulaire non envoyée')
  }
}
