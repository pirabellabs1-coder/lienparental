import 'server-only'
/**
 * E-mails de la liaison des parents. Passent par lib/email/send.ts :
 * sans RESEND_API_KEY, aucun envoi et une ligne de journal expurgée.
 * « Invitation acceptée » : lib/notify (déclencheur 0440, in-app + push + e-mail).
 * La notification « retiré » ne part que si
 * SUPABASE_SERVICE_ROLE_KEY est configurée (lecture de l'e-mail du
 * destinataire, users n'étant lisible que par son propriétaire) et si le
 * destinataire n'a pas désactivé les e-mails (preferences.notif_email).
 * Exception : l'alerte « nouvel adulte lié » au titulaire (M2, audit v3) est
 * une notification de sécurité, envoyée même si notif_email est désactivé.
 *
 * Langue : celle du destinataire (preferences.langue). Invitation : langue du compte
 * de l'adresse invitée s'il existe, sinon celle de l'invitant (cookie lp_locale de sa requête).
 */
import { baseLayout } from '@/lib/email/layout'
import { escapeHtml, safeUrl } from '@/lib/email/escape'
import { sendEmail } from '@/lib/email/send'
import { dateLocale, emailT, greeting, toLocale, type EmailT, type Locale } from '@/lib/email/i18n'
import { localeForEmail, requestLocale } from '@/lib/email/locale'
import { createServiceClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { GuardianRole } from '../types'
import { DEFAULT_TZ } from '@/lib/tz'
import { appUrl } from './context'

export type MailStatus = 'sent' | 'skipped' | 'failed'

function list(names: string[], tr: EmailT): string {
  if (names.length <= 1) return names[0] ?? ''
  return tr('family.listAnd', { list: names.slice(0, -1).join(', '), last: names[names.length - 1]! })
}

function longDate(iso: string, locale: Locale): string {
  return new Date(iso).toLocaleDateString(dateLocale(locale), { day: 'numeric', month: 'long', year: 'numeric', timeZone: DEFAULT_TZ })
}

export type FamilyInvitationArgs = {
  to: string
  inviterPrenom: string
  role: GuardianRole
  childPrenoms: string[]
  link: string
  expiresAt: string
  idempotencyKey: string
}

/** Rendu (pur) de l'invitation dans une langue donnée. */
export function familyInvitationEmail(args: Omit<FamilyInvitationArgs, 'to' | 'idempotencyKey'>, locale: Locale = 'fr'): { subject: string; html: string } {
  const tr = emailT(locale)
  const inviter = escapeHtml(args.inviterPrenom || tr('common.aParent'))
  const kids = escapeHtml(list(args.childPrenoms, tr) || tr('family.yourChild'))
  const href = safeUrl(args.link, `${appUrl()}/app/coparents`)
  const roleSentence = args.role === 'proche' ? tr('family.inviteRoleProche') : tr('family.inviteRoleParent')
  const body = `
    <p style="margin:0 0 16px 0;">${tr('common.hello')}</p>
    <p style="margin:0 0 16px 0;">${tr('family.inviteBody', { inviter, kids, roleSentence: escapeHtml(roleSentence) })}</p>
    <p style="margin:0 0 16px 0;">${tr('family.invitePrivate')}</p>
    <p style="margin:0;">${tr('family.invitePersonal', { date: escapeHtml(longDate(args.expiresAt, locale)) })}</p>
  `
  return {
    subject: tr('family.inviteSubject', { inviter: args.inviterPrenom || tr('common.aParent') }),
    html: baseLayout({
      locale,
      preheader: tr('family.invitePreheader', { kids: list(args.childPrenoms, tr) }),
      title: tr('family.inviteTitle'),
      body,
      cta: { label: tr('family.inviteCta'), href },
      footer: tr('family.inviteFooter'),
    }),
  }
}

export async function sendFamilyInvitationEmail(args: FamilyInvitationArgs): Promise<MailStatus> {
  // Destinataire déjà inscrit : sa langue ; sinon celle de l'invitant (requête en cours).
  const locale = (await localeForEmail(args.to)) ?? (await requestLocale()) ?? 'fr'
  const mail = familyInvitationEmail(args, locale)
  const res = await sendEmail({
    to: args.to,
    subject: mail.subject,
    html: mail.html,
    idempotencyKey: args.idempotencyKey,
  })
  return !res.ok ? 'failed' : res.skipped ? 'skipped' : 'sent'
}

type Recipient = { email: string; prenom: string; locale: Locale }

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
    admin.from('preferences').select('notif_email, langue').eq('user_id', userId).maybeSingle(),
  ])
  const user = u as { email?: string; prenom?: string; deleted_at?: string | null } | null
  const pref = p as { notif_email?: boolean; langue?: string | null } | null
  if (!user?.email || user.deleted_at) return null
  if (!opts.security && pref?.notif_email === false) return null
  return { email: user.email, prenom: user.prenom ?? '', locale: toLocale(pref?.langue) }
}

/** Rendu (pur) de « accès retiré ». */
export function guardianRemovedEmail(args: { prenom: string; childPrenom: string }, locale: Locale = 'fr'): { subject: string; html: string } {
  const tr = emailT(locale)
  const body = `
    <p style="margin:0 0 16px 0;">${greeting(tr, args.prenom ? escapeHtml(args.prenom) : '')}</p>
    <p style="margin:0;">${tr('family.removedBody', { child: escapeHtml(args.childPrenom || tr('family.theChild')) })}</p>
  `
  return {
    subject: tr('family.removedSubject'),
    html: baseLayout({ locale, title: tr('family.removedTitle'), body }),
  }
}

export async function notifyGuardianRemoved(args: { userId: string; childPrenom: string; idempotencyKey: string }) {
  const to = await recipient(args.userId)
  if (!to) return
  const mail = guardianRemovedEmail({ prenom: to.prenom, childPrenom: args.childPrenom }, to.locale)
  await sendEmail({
    to: to.email,
    subject: mail.subject,
    html: mail.html,
    idempotencyKey: args.idempotencyKey,
  }).catch(() => undefined)
}

/** Rendu (pur) de l'alerte « nouvel adulte lié » au titulaire. `inviterPrenom` vide : « un autre parent ». */
export function ownerNewAdultEmail(
  args: { prenom: string; newPrenom: string; childPrenoms: string[]; role: GuardianRole; inviterPrenom: string },
  locale: Locale = 'fr',
): { subject: string; html: string } {
  const tr = emailT(locale)
  const who = escapeHtml(args.newPrenom || tr('family.someoneAdult'))
  const by = escapeHtml(args.inviterPrenom || tr('family.anotherParent'))
  const role = args.role === 'parent' ? tr('family.roleParent') : tr('family.roleProche')
  const body = `
        <p style="margin:0 0 16px 0;">${greeting(tr, args.prenom ? escapeHtml(args.prenom) : '')}</p>
        <p style="margin:0 0 16px 0;">${tr('family.ownerBody', { who, kids: escapeHtml(list(args.childPrenoms, tr)), role, by })}</p>
        <p style="margin:0;">${tr('family.ownerCanRemove')}</p>
      `
  return {
    subject: tr('family.ownerSubject'),
    html: baseLayout({ locale, title: tr('family.ownerTitle'), body, cta: { label: tr('common.manageFamily'), href: `${appUrl()}/app/coparents` } }),
  }
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
    const inviterPrenom = (inviter as { prenom?: string } | null)?.prenom || ''
    for (const [ownerId, names] of byOwner) {
      const to = await recipient(ownerId, { security: true })
      if (!to) continue
      const mail = ownerNewAdultEmail(
        { prenom: to.prenom, newPrenom: args.newPrenom, childPrenoms: names, role: args.role, inviterPrenom },
        to.locale,
      )
      await sendEmail({
        to: to.email,
        subject: mail.subject,
        html: mail.html,
        idempotencyKey: `family-owner-alert:${args.invitationId}:${ownerId}`,
      }).catch(() => undefined)
    }
  } catch {
    console.warn('[coparents] alerte titulaire non envoyée')
  }
}
