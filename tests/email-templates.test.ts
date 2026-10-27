/** lib/email : aucune injection HTML depuis un prénom, un nom ou un titre saisi par un utilisateur ; salutation sans « Bonjour bonjour ». */
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.NEXT_PUBLIC_APP_URL = 'https://lienparental.fr'

import { baseLayout } from '../lib/email/layout'
import { newLoginEmail } from '../lib/email/templates/newLogin'
import { welcomeEmail } from '../lib/email/templates/welcome'
import { testimonyReceivedEmail } from '../lib/email/templates/testimonyReceived'
import { testimonyReminderEmail } from '../lib/email/templates/testimonyReminder'
import { verificationEmail } from '../lib/email/templates/verification'
import { resetPasswordEmail } from '../lib/email/templates/resetPassword'
import { invoiceEmail } from '../lib/email/templates/invoice'
import { paymentFailedEmail } from '../lib/email/templates/paymentFailed'
import { subscriptionCanceledEmail } from '../lib/email/templates/subscriptionCanceled'
import { subscriptionConfirmedEmail } from '../lib/email/templates/subscriptionConfirmed'
import { messageWaitingEmail } from '../lib/email/templates/messageWaiting'
import { securityChangeEmail } from '../lib/email/templates/securityChange'
import { inviteAcceptedEmail } from '../lib/email/templates/inviteAccepted'
import { folderSharedEmail } from '../lib/email/templates/folderShared'
import { calendarReminderEmail } from '../lib/email/templates/calendarReminder'
import { calendarSharedEmail } from '../lib/email/templates/calendarShared'

const PAYLOADS = ['<img src=x onerror=alert(1)>', '</div><a href="https://evil.example">clic</a>']
const ISO = '2026-11-12T13:00:00Z'
const ID = '00000000-0000-0000-0000-000000000001'

function renderAll(x: string) {
  return {
    newLogin: newLoginEmail({ prenom: x, appareil: x, systeme: x, lieu: x, dateIso: ISO }),
    welcome: welcomeEmail({ prenom: x }),
    testimonyReceived: testimonyReceivedEmail({ prenom: x, temoinNom: x, titreDemande: x, reference: x, urlCoffre: 'https://lienparental.fr/app' }),
    testimonyReminder: testimonyReminderEmail({ prenomTemoin: x, parentNom: x, titreDemande: x, url: 'https://lienparental.fr/temoin', dateLimite: ISO }),
    verification: verificationEmail({ prenom: x, code: x }),
    resetPassword: resetPasswordEmail({ prenom: x, url: 'https://lienparental.fr/reset' }),
    invoice: invoiceEmail({ prenom: x, montant: x, cycle: x, nextPeriodEnd: ISO, invoiceUrl: 'https://invoice.stripe.com/i/x' } as Parameters<typeof invoiceEmail>[0]),
    paymentFailed: paymentFailedEmail({ prenom: x, montant: x, nextAttemptIso: ISO } as Parameters<typeof paymentFailedEmail>[0]),
    subscriptionCanceled: subscriptionCanceledEmail({ prenom: x, kind: 'scheduled', endIso: ISO }),
    subscriptionConfirmed: subscriptionConfirmedEmail({ prenom: x, formule: x, montant: x, nextPaymentIso: ISO } as Parameters<typeof subscriptionConfirmedEmail>[0]),
    messageWaiting: messageWaitingEmail({ prenom: x, senders: [x], count: 2, conversationId: ID }),
    securityChange: securityChangeEmail({ prenom: x, title: x, message: x, dateIso: ISO }),
    inviteAccepted: inviteAcceptedEmail({ prenom: x, inviteePrenom: x, role: 'parent' }),
    folderShared: folderSharedEmail({ prenom: x, ownerPrenom: x, folderId: ID }),
    calendarReminder: calendarReminderEmail({ prenom: x, titre: x, whenLabel: x, eventId: ID }),
    calendarShared: calendarSharedEmail({ prenom: x, sentence: x, action: 'created', eventId: ID }),
  }
}

test('aucun template ne recopie une balise saisie par un utilisateur (corps, préheader, titre)', () => {
  for (const x of PAYLOADS) {
    for (const [name, r] of Object.entries(renderAll(x))) {
      assert.ok(!r.html.includes('<img src=x'), `${name} : <img brut`)
      assert.ok(!r.html.includes('<a href="https://evil.example"'), `${name} : <a brut`)
      assert.ok(!r.html.includes('evil.example">clic</a>'), `${name} : lien injecté`)
    }
  }
})

test('pas de double échappement (apostrophe ou & affichés une seule fois échappés)', () => {
  const r = inviteAcceptedEmail({ prenom: 'Zoé', inviteePrenom: 'Jean & Luc', role: 'parent' })
  assert.match(r.html, /Jean &amp; Luc a accepté/)
  assert.doesNotMatch(r.html, /&amp;amp;/)
  const n = newLoginEmail({ prenom: 'A', appareil: 'Lenovo & Co', systeme: 'Chrome', dateIso: ISO })
  assert.doesNotMatch(n.html, /&amp;amp;/)
})

test('baseLayout échappe préheader et titre', () => {
  const html = baseLayout({ preheader: '<b>pré</b>', title: '<i>titre</i>', body: '<p>corps</p>' })
  assert.doesNotMatch(html, /<b>pré<\/b>/)
  assert.doesNotMatch(html, /<i>titre<\/i>/)
  assert.match(html, /&lt;i&gt;titre&lt;\/i&gt;/)
})

test('salutation : « Bonjour, » sans prénom, jamais « Bonjour bonjour »', () => {
  for (const [name, r] of Object.entries(renderAll(''))) {
    assert.doesNotMatch(r.html, /Bonjour bonjour/i, name)
  }
  assert.match(welcomeEmail({ prenom: '' }).html, /Bonjour,/)
  assert.match(welcomeEmail({ prenom: 'Julie' }).html, /Bonjour Julie,/)
})

import { cleanSubject } from '../lib/email/send'

test('objet d’e-mail : aucun saut de ligne ni caractère de contrôle (injection d’en-tête)', () => {
  assert.equal(cleanSubject('Thomas\r\nBcc: x@evil.example vous a écrit'), 'Thomas Bcc: x@evil.example vous a écrit')
  assert.equal(cleanSubject('A\u0000B\u0007C'), 'A B C')
  assert.ok(!/[\r\n]/.test(cleanSubject('x\n'.repeat(300))))
})
