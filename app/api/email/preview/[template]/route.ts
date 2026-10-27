// app/api/email/preview/[template]/route.ts — Prévisualisation DEV uniquement des templates email.
// GET /api/email/preview/<template>?locale=fr|en|pt → renvoie le HTML pour inspection navigateur (défaut : fr).

import { NextResponse } from 'next/server'
import { verificationEmail } from '@/lib/email/templates/verification'
import { resetPasswordEmail } from '@/lib/email/templates/resetPassword'
import { newLoginEmail } from '@/lib/email/templates/newLogin'
import { testimonyReceivedEmail } from '@/lib/email/templates/testimonyReceived'
import { testimonyReminderEmail } from '@/lib/email/templates/testimonyReminder'
import { invoiceEmail } from '@/lib/email/templates/invoice'
import { welcomeEmail } from '@/lib/email/templates/welcome'
import { subscriptionConfirmedEmail } from '@/lib/email/templates/subscriptionConfirmed'
import { paymentFailedEmail } from '@/lib/email/templates/paymentFailed'
import { subscriptionCanceledEmail } from '@/lib/email/templates/subscriptionCanceled'
import { messageWaitingEmail } from '@/lib/email/templates/messageWaiting'
import { securityChangeEmail } from '@/lib/email/templates/securityChange'
import { inviteAcceptedEmail } from '@/lib/email/templates/inviteAccepted'
import { folderSharedEmail } from '@/lib/email/templates/folderShared'
import { calendarReminderEmail } from '@/lib/email/templates/calendarReminder'
import { calendarSharedEmail } from '@/lib/email/templates/calendarShared'
import { accountExistsEmail } from '@/lib/email/templates/accountExists'
import { familyInvitationEmail, guardianRemovedEmail, ownerNewAdultEmail } from '@/lib/coparents/server/email'
import { deviceText, securityText, whenLabel } from '@/lib/notify/content'
import { emailT, toLocale, type Locale } from '@/lib/email/i18n'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Rendered = { subject: string; html: string }

const DAY = 24 * 60 * 60 * 1000
const inDays = (n: number) => new Date(Date.now() + n * DAY).toISOString()
/** 12 nov. 10h (heure de Guyane) de l'année en cours : exemple de date d'événement. */
const EVENT_AT = `${new Date().getFullYear()}-11-12T13:00:00Z`

const samples: Record<string, (l: Locale) => Rendered> = {
  verification: (l) =>
    verificationEmail({ prenom: 'Camille', code: '482615' }, l),
  'reset-password': (l) =>
    resetPasswordEmail({
      prenom: 'Camille',
      url: 'https://lienparental.fr/reset?token=exemple-de-token-signe-abc123',
    }, l),
  'new-login': (l) =>
    newLoginEmail({
      prenom: 'Camille',
      appareil: 'iPhone 15',
      lieu: 'Lyon, France',
      systeme: deviceText('Safari sur iOS 17.4', l),
      dateIso: new Date().toISOString(),
    }, l),
  'testimony-received': (l) =>
    testimonyReceivedEmail({
      prenom: 'Camille',
      temoinNom: 'Mme Dupont (institutrice)',
      titreDemande: 'Dossier scolarité trimestre 2',
      reference: 'DEM-2026-0017',
      urlCoffre: 'https://lienparental.fr/coffre/demandes/DEM-2026-0017',
    }, l),
  'testimony-reminder': (l) =>
    testimonyReminderEmail({
      prenomTemoin: 'Madame Dupont',
      parentNom: 'Camille Martin',
      titreDemande: 'Dossier scolarité trimestre 2',
      url: 'https://lienparental.fr/temoin/depot?token=xyz',
      dateLimite: inDays(7),
    }, l),
  invoice: (l) =>
    invoiceEmail({
      prenom: 'Camille',
      montant: '11,99 €',
      cycle: 'mensuel',
      nextPeriodEnd: inDays(30),
      invoiceUrl: 'https://invoice.stripe.com/i/exemple',
    }, l),
  welcome: (l) => welcomeEmail({ prenom: 'Camille' }, l),
  'subscription-confirmed': (l) =>
    subscriptionConfirmedEmail({
      prenom: 'Camille',
      formule: 'Premium annuel',
      montant: '99,00 €',
      nextPaymentIso: inDays(365),
      invoiceUrl: 'https://invoice.stripe.com/i/exemple',
    }, l),
  'payment-failed': (l) =>
    paymentFailedEmail({
      prenom: 'Camille',
      montant: '11,99 €',
      nextAttemptIso: inDays(3),
      invoiceUrl: 'https://invoice.stripe.com/i/exemple',
    }, l),
  'payment-failed-final': (l) =>
    paymentFailedEmail({ prenom: 'Camille', montant: '11,99 €', nextAttemptIso: null }, l),
  'subscription-canceled': (l) =>
    subscriptionCanceledEmail({
      prenom: 'Camille',
      kind: 'scheduled',
      endIso: inDays(20),
    }, l),
  'subscription-ended': (l) =>
    subscriptionCanceledEmail({ prenom: 'Camille', kind: 'ended', endIso: new Date().toISOString() }, l),
  'message-waiting': (l) =>
    messageWaitingEmail({ prenom: 'Camille', senders: ['Thomas'], count: 3, conversationId: '00000000-0000-0000-0000-000000000001' }, l),
  'security-change': (l) => {
    const s = securityText('password_changed', l)
    return securityChangeEmail({ prenom: 'Camille', title: s.title, message: s.message, dateIso: new Date().toISOString() }, l)
  },
  'invite-accepted': (l) => inviteAcceptedEmail({ prenom: 'Camille', inviteePrenom: 'Thomas', role: 'parent' }, l),
  'folder-shared': (l) => folderSharedEmail({ prenom: 'Camille', ownerPrenom: 'Thomas', folderId: '00000000-0000-0000-0000-000000000002' }, l),
  'calendar-reminder': (l) =>
    calendarReminderEmail({ prenom: 'Camille', titre: 'Kermesse de l’école', whenLabel: whenLabel(EVENT_AT, false, l), eventId: '00000000-0000-0000-0000-000000000003' }, l),
  'account-exists': (l) => accountExistsEmail({ prenom: 'Camille' }, l),
  'calendar-shared': (l) =>
    calendarSharedEmail({
      prenom: 'Camille',
      sentence: emailT(l)('notify.calendarCreated', { who: 'Julie', title: emailT(l)('notify.healthOf', { child: 'Lina' }), when: whenLabel(EVENT_AT, false, l) }),
      action: 'created',
      eventId: '00000000-0000-0000-0000-000000000003',
    }, l),
  'family-invitation': (l) =>
    familyInvitationEmail({
      inviterPrenom: 'Julie',
      role: 'parent',
      childPrenoms: ['Lina', 'Noah'],
      link: 'https://lienparental.fr/app/coparents/invitation?token=exemple',
      expiresAt: inDays(7),
    }, l),
  'guardian-removed': (l) => guardianRemovedEmail({ prenom: 'Camille', childPrenom: 'Lina' }, l),
  'owner-new-adult': (l) =>
    ownerNewAdultEmail({ prenom: 'Camille', newPrenom: 'Thomas', childPrenoms: ['Lina'], role: 'proche', inviterPrenom: 'Julie' }, l),
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ template: string }> }
): Promise<Response> {
  if (process.env.NODE_ENV === 'production') {
    return new NextResponse('Not found', { status: 404 })
  }

  const { template } = await ctx.params
  const render = samples[template]
  if (!render) {
    return NextResponse.json(
      {
        error: 'Template inconnu',
        available: Object.keys(samples),
        locales: ['fr', 'en', 'pt'],
      },
      { status: 404 }
    )
  }

  const locale = toLocale(new URL(req.url).searchParams.get('locale'))
  const { html } = render(locale)
  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
