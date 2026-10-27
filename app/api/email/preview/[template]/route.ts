// app/api/email/preview/[template]/route.ts — Prévisualisation DEV uniquement des templates email.
// GET /api/email/preview/<template>?... → renvoie le HTML pour inspection navigateur.

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

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Rendered = { subject: string; html: string }

const samples: Record<string, () => Rendered> = {
  verification: () =>
    verificationEmail({ prenom: 'Camille', code: '482615' }),
  'reset-password': () =>
    resetPasswordEmail({
      prenom: 'Camille',
      url: 'https://lienparental.fr/reset?token=exemple-de-token-signe-abc123',
    }),
  'new-login': () =>
    newLoginEmail({
      prenom: 'Camille',
      appareil: 'iPhone 15',
      lieu: 'Lyon, France',
      systeme: 'Safari sur iOS 17.4',
      dateIso: new Date().toISOString(),
    }),
  'testimony-received': () =>
    testimonyReceivedEmail({
      prenom: 'Camille',
      temoinNom: 'Mme Dupont (institutrice)',
      titreDemande: 'Dossier scolarité trimestre 2',
      reference: 'DEM-2026-0017',
      urlCoffre: 'https://lienparental.fr/coffre/demandes/DEM-2026-0017',
    }),
  'testimony-reminder': () =>
    testimonyReminderEmail({
      prenomTemoin: 'Madame Dupont',
      parentNom: 'Camille Martin',
      titreDemande: 'Dossier scolarité trimestre 2',
      url: 'https://lienparental.fr/temoin/depot?token=xyz',
      dateLimite: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    }),
  invoice: () =>
    invoiceEmail({
      prenom: 'Camille',
      montant: '11,99 €',
      cycle: 'mensuel',
      nextPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      invoiceUrl: 'https://invoice.stripe.com/i/exemple',
    }),
  welcome: () => welcomeEmail({ prenom: 'Camille' }),
  'subscription-confirmed': () =>
    subscriptionConfirmedEmail({
      prenom: 'Camille',
      formule: 'Premium annuel',
      montant: '99,00 €',
      nextPaymentIso: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      invoiceUrl: 'https://invoice.stripe.com/i/exemple',
    }),
  'payment-failed': () =>
    paymentFailedEmail({
      prenom: 'Camille',
      montant: '11,99 €',
      nextAttemptIso: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      invoiceUrl: 'https://invoice.stripe.com/i/exemple',
    }),
  'payment-failed-final': () =>
    paymentFailedEmail({ prenom: 'Camille', montant: '11,99 €', nextAttemptIso: null }),
  'subscription-canceled': () =>
    subscriptionCanceledEmail({
      prenom: 'Camille',
      kind: 'scheduled',
      endIso: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString(),
    }),
  'subscription-ended': () =>
    subscriptionCanceledEmail({ prenom: 'Camille', kind: 'ended', endIso: new Date().toISOString() }),
  'message-waiting': () =>
    messageWaitingEmail({ prenom: 'Camille', senders: ['Thomas'], count: 3, conversationId: '00000000-0000-0000-0000-000000000001' }),
  'security-change': () =>
    securityChangeEmail({ prenom: 'Camille', title: 'Votre mot de passe a été modifié', message: 'Le mot de passe de votre compte Lien Parental vient d’être modifié.', dateIso: new Date().toISOString() }),
  'invite-accepted': () => inviteAcceptedEmail({ prenom: 'Camille', inviteePrenom: 'Thomas', role: 'parent' }),
  'folder-shared': () => folderSharedEmail({ prenom: 'Camille', ownerPrenom: 'Thomas', folderId: '00000000-0000-0000-0000-000000000002' }),
  'calendar-reminder': () =>
    calendarReminderEmail({ prenom: 'Camille', titre: 'Kermesse de l’école', whenLabel: 'le 12 nov. à 10h', eventId: '00000000-0000-0000-0000-000000000003' }),
  'account-exists': () => accountExistsEmail({ prenom: 'Camille' }),
  'calendar-shared': () =>
    calendarSharedEmail({ prenom: 'Camille', sentence: 'Julie a ajouté « Rendez-vous pédiatre de Lina » le 12 nov. à 10h', action: 'created', eventId: '00000000-0000-0000-0000-000000000003' }),
}

export async function GET(
  _req: Request,
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
      },
      { status: 404 }
    )
  }

  const { html } = render()
  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
