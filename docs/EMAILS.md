# Emails transactionnels — Lien Parental

Les emails sont rendus en HTML pur (styles inline, tables, VML pour Outlook) depuis `lib/email/`. Envoi via Resend (`lib/email/send.ts`). Pas de dépendance `@react-email/components` pour V1.

## Variables d'environnement

- `RESEND_API_KEY` — clé API Resend.
- `MAIL_FROM` — expéditeur par défaut (ex: `Lien Parental <no-reply@lienparental.fr>`).

## Prévisualisation (DEV)

Démarrer `npm run dev` puis ouvrir :

- http://localhost:3000/api/email/preview/verification
- http://localhost:3000/api/email/preview/reset-password
- http://localhost:3000/api/email/preview/new-login
- http://localhost:3000/api/email/preview/testimony-received
- http://localhost:3000/api/email/preview/testimony-reminder
- http://localhost:3000/api/email/preview/invoice
- http://localhost:3000/api/email/preview/welcome
- http://localhost:3000/api/email/preview/subscription-confirmed
- http://localhost:3000/api/email/preview/payment-failed
- http://localhost:3000/api/email/preview/payment-failed-final
- http://localhost:3000/api/email/preview/subscription-canceled
- http://localhost:3000/api/email/preview/subscription-ended

La route renvoie 404 en production.

## Catalogue des templates

| Clé | Fichier | Déclencheur | Variables |
| --- | --- | --- | --- |
| `verification` (M02) | `templates/verification.ts` | Inscription / changement d'email | `prenom`, `code` (6 chiffres), `expireMinutes` (défaut 15) |
| `reset-password` | `templates/resetPassword.ts` | Demande de réinitialisation mot de passe (lien valide 60 min) | `prenom`, `url` |
| `new-login` (M11) | `templates/newLogin.ts` | Nouvelle session détectée (appareil / IP inédits) | `prenom`, `appareil`, `lieu`, `systeme`, `dateIso` |
| `testimony-received` | `templates/testimonyReceived.ts` | Un témoin dépose un témoignage dans le coffre | `prenom`, `temoinNom`, `titreDemande`, `reference`, `urlCoffre` |
| `testimony-reminder` | `templates/testimonyReminder.ts` | Relance au témoin (J-3 avant date limite, selon planification) | `prenomTemoin`, `parentNom`, `titreDemande`, `url`, `dateLimite` |
| `invoice` | `templates/invoice.ts` | Webhook Stripe `invoice.paid` (renouvellements, `billing_reason = subscription_cycle`) | `prenom`, `montant`, `cycle`, `nextPeriodEnd`, `invoiceUrl` |
| `welcome` | `templates/welcome.ts` | Fin d'inscription (helper `sendWelcomeEmail`) | `prenom`, `url?` |
| `subscription-confirmed` | `templates/subscriptionConfirmed.ts` | Webhook `invoice.paid` (première facture, `subscription_create`) | `prenom`, `formule`, `montant`, `nextPaymentIso`, `invoiceUrl?` |
| `payment-failed` | `templates/paymentFailed.ts` | Webhook `invoice.payment_failed` (1er échec + dernière tentative) | `prenom`, `montant`, `nextAttemptIso` (null = dernière), `invoiceUrl?` |
| `subscription-canceled` | `templates/subscriptionCanceled.ts` | `customer.subscription.updated` (résiliation programmée) / `.deleted` (fin) | `prenom`, `kind` (`scheduled`/`ended`), `endIso` |

Envoi : passer par les helpers de `lib/email/notify.ts` (`sendWelcomeEmail`, `sendNewLoginEmail`, `sendSubscriptionConfirmedEmail`, `sendInvoiceReceiptEmail`, `sendPaymentFailedEmail`, `sendSubscriptionCanceledEmail`). Les envois issus de webhooks portent une `idempotencyKey` Resend (`stripe:<event id>:<template>`).
Sans `RESEND_API_KEY` : `sendEmail` journalise une ligne expurgée et renvoie `{ ok: true, skipped: true }` (aucun envoi).
Liens Stripe (factures hébergées) : `safeUrl(url, fallback, STRIPE_LINK_HOSTS)` — liste blanche exacte d'hôtes `*.stripe.com`.

## Principes de rédaction

- Français, ton calme et sobre, pas d'emoji.
- Largeur max 560 px, compatible dark-mode (couleurs explicites, pas de variables CSS).
- Bouton CTA : table HTML + VML pour Outlook.
- Toujours un preheader masqué (aperçu dans la boîte de réception).
- Images avec `alt` ; logo référencé par URL HTTPS (`https://lienparental.fr/icons/icon-512.png`).
- Lien de désabonnement + mentions légales + adresse postale dans le footer.

## Déploiement

DNS SPF / DKIM / DMARC à configurer côté Resend sur le domaine `lienparental.fr` avant la mise en production. Prévoir aussi `List-Unsubscribe` et une adresse `abuse@` fonctionnelle.

## À faire plus tard

- Brancher Sentry (`// TODO: Sentry` dans `send.ts`).
- Externaliser le texte de désabonnement sur une vraie route authentifiée.
- Tests Litmus / Email on Acid pour Outlook 2016+ et Gmail (dark mode iOS).
