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
| `verification` (M02) | `templates/verification.ts` | Inscription et « Renvoyer le code » (`POST /api/auth/signup`) | `prenom`, `code` (6 chiffres), `expireMinutes` (défaut 15), `url?` (lien de confirmation en un clic) |
| `account-exists` | `templates/accountExists.ts` | Inscription demandée avec une adresse déjà confirmée (réponse neutre à l'écran) | `prenom` |
| `reset-password` | `templates/resetPassword.ts` | Mot de passe oublié (`POST /api/auth/password-reset`) | `prenom`, `url` |
| `new-login` (M11) | `templates/newLogin.ts` | Connexion depuis un appareil inédit (`lib/notify/login.ts`) | `prenom`, `appareil`, `lieu?` (omis : aucune géolocalisation tierce), `systeme`, `dateIso` |
| `testimony-received` | `templates/testimonyReceived.ts` | Un témoin dépose un témoignage dans le coffre | `prenom`, `temoinNom`, `titreDemande`, `reference`, `urlCoffre` |
| `testimony-reminder` | `templates/testimonyReminder.ts` | Relance au témoin : **non branchée** (aucune adresse de témoin en base, voir NOTIFICATIONS.md) | `prenomTemoin`, `parentNom`, `titreDemande`, `url`, `dateLimite` |
| `invoice` | `templates/invoice.ts` | Webhook Stripe `invoice.paid` (renouvellements, `billing_reason = subscription_cycle`) | `prenom`, `montant`, `cycle`, `nextPeriodEnd`, `invoiceUrl` |
| `welcome` | `templates/welcome.ts` | Inscription vérifiée ou premier compte Google (déclencheur 0440, une fois par compte) | `prenom`, `url?` |
| `message-waiting` | `templates/messageWaiting.ts` | Messages non lus 5 min après envoi, 1 e-mail par conversation / 30 min | `prenom`, `senders`, `count`, `conversationId` |
| `security-change` | `templates/securityChange.ts` | Mot de passe, e-mail, 2FA, code du coffre, suppression (toujours envoyé) | `prenom`, `title`, `message`, `dateIso` |
| `invite-accepted` | `templates/inviteAccepted.ts` | Invitation (famille ou coparent) acceptée, à l'invitant | `prenom`, `inviteePrenom`, `role` |
| `folder-shared` | `templates/folderShared.ts` | Dossier du coffre partagé (nom du dossier jamais affiché) | `prenom`, `ownerPrenom`, `folderId` |
| `calendar-reminder` | `templates/calendarReminder.ts` | Rappel avant un événement (titre et date seulement) | `prenom`, `titre`, `whenLabel`, `eventId` |
| `calendar-shared` | `templates/calendarShared.ts` | Événement partagé ajouté / modifié / annulé dans les 14 jours | `prenom`, `sentence`, `action`, `eventId` |
| `subscription-confirmed` | `templates/subscriptionConfirmed.ts` | Webhook `invoice.paid` (première facture, `subscription_create`) | `prenom`, `formule`, `montant`, `nextPaymentIso`, `invoiceUrl?` |
| `payment-failed` | `templates/paymentFailed.ts` | Webhook `invoice.payment_failed` (1er échec + dernière tentative) | `prenom`, `montant`, `nextAttemptIso` (null = dernière), `invoiceUrl?` |
| `subscription-canceled` | `templates/subscriptionCanceled.ts` | `customer.subscription.updated` (résiliation programmée) / `.deleted` (fin) | `prenom`, `kind` (`scheduled`/`ended`), `endIso` |

Notifications produit (messages, partages, calendrier, sécurité, bienvenue) : dispatcher `lib/notify` (voir `docs/NOTIFICATIONS.md`), jamais d'appel direct. Facturation : passer par les helpers de `lib/email/notify.ts` (`sendWelcomeEmail`, `sendNewLoginEmail`, `sendSubscriptionConfirmedEmail`, `sendInvoiceReceiptEmail`, `sendPaymentFailedEmail`, `sendSubscriptionCanceledEmail`). Les envois issus de webhooks portent une `idempotencyKey` Resend (`stripe:<event id>:<template>`).
Sans `RESEND_API_KEY` : `sendEmail` journalise une ligne expurgée et renvoie `{ ok: true, skipped: true }` (aucun envoi).
Liens Stripe (factures hébergées) : `safeUrl(url, fallback, STRIPE_LINK_HOSTS)` — liste blanche exacte d'hôtes `*.stripe.com`.

## E-mails d'authentification : nos gabarits, plus ceux de Supabase

Les modèles d'e-mail de Supabase ne sont pas modifiables par l'équipe : l'inscription, le renvoi du code et le mot de
passe oublié passent par le serveur, qui appelle `supabase.auth.admin.generateLink` (service_role). Cet appel crée le
compte ou le jeton **sans envoyer d'e-mail** et renvoie le code (`email_otp`) et le jeton haché (`hashed_token`) ; nous
envoyons ensuite NOTRE e-mail (logique : `lib/auth/email-flows.ts`).

| Parcours | Route | Lien envoyé |
|---|---|---|
| Inscription | `POST /api/auth/signup { email }` | code + `/auth/confirmer?token_hash=…&type=signup` |
| Renvoyer le code | `POST /api/auth/signup { email, resend: true }` | nouveau code (compte en attente seulement) |
| Mot de passe oublié | `POST /api/auth/password-reset { email }` | `/auth/confirmer?token_hash=…&type=recovery&next=/nouveau-mot-de-passe` |

- **Pré-détournement de compte impossible** : le compte est TOUJOURS créé avec un mot de passe aléatoire jetable. Le
  mot de passe choisi reste en mémoire dans le navigateur (`lib/auth/pending-password.ts`, jamais stocké) et n'est posé
  (`updateUser`, puis déconnexion des autres sessions) qu'APRÈS la vérification du code. Lien de confirmation, ou page
  rechargée : étape « Choisissez votre mot de passe » (`/nouveau-mot-de-passe?inscription=1`). Le mot de passe ne
  transite jamais par nos routes.
- **Comptes abandonnés** : jamais confirmés, plus de 24 h, sans aucune donnée → supprimés par le cron des
  notifications (`notif_unconfirmed_accounts` + `auth.admin.deleteUser`).
- **Temps constant et réponses neutres** : après validation et limites de débit, la route répond tout de suite ; la
  recherche du compte, `generateLink` et l'envoi s'exécutent après la réponse (`after()`). Adresse déjà confirmée :
  e-mail « Vous avez déjà un compte ». Refus de GoTrue (quel qu'il soit) : réponse neutre, journal, aucun envoi.
- **Limites** (limiteur 0390, fail-closed : 503 si indisponible) : inscription / renvoi 10 par heure et par IP, 3 par
  15 min et par adresse ; mot de passe oublié 10 par heure et par IP, 3 par heure et par adresse ; plafond de 5 e-mails
  d'authentification par adresse et par 24 h, tous parcours confondus (anti-bombardement).
- **Aucun texte saisi** dans un e-mail envoyé à une adresse non vérifiée (« Bonjour, »).
- **CSRF** : ces routes (comme `/api/auth/login-check`, `/api/notifications/flush`, `/api/push/subscribe`) exigent
  `Content-Type: application/json` et la même origine (`Origin`, sinon `Sec-Fetch-Site: same-origin`) :
  `rejectCrossSiteJson` (`lib/data/server/http.ts`).
- **Liens à usage unique** : `GET /auth/confirm?token_hash=…` ne consomme plus le jeton ; il redirige vers la page
  `/auth/confirmer` (bouton « Continuer », `POST /auth/confirm` même origine). Les scanners de liens des messageries
  n'invalident donc plus les liens. Vaut aussi pour les modèles Supabase de repli. `?code=` (PKCE) reste en GET.
- L'écran de vérification garde `verifyOtp({ email, token, type: 'signup' })` : le code généré est celui que GoTrue
  attend (même jeton de confirmation, documenté par Supabase ; à recetter sur le projet réel).
- Politique de mot de passe : `passwordSchema` = politique GoTrue du projet (8 caractères, minuscule, majuscule,
  chiffre ; `docs/MISE_EN_SERVICE.md` §1.4).
- Réglages Supabase à **garder** : confirmation de l'e-mail activée (« Confirm email »). Les modèles Supabase ne servent
  plus que de repli (changement d'adresse e-mail, liens envoyés depuis le tableau de bord Supabase).
- Durée de validité : « Email OTP Expiration » = 3600 s (1 heure), réglage partagé par le code d'inscription et le lien
  de réinitialisation ; les textes annoncent 1 heure.
- Changement d'adresse e-mail (Profil > Informations) : **inchangé**, flux Supabase (`updateUser({ email })`, modèles
  Supabase). Le refaire avec `generateLink` exige deux liens (`email_change_current` + `email_change_new`) en mode
  « Secure email change » et une route authentifiée dédiée : non fait.

## Principes de rédaction

- Français, ton calme et sobre, pas d'emoji.
- Largeur max 560 px, compatible dark-mode (couleurs explicites, pas de variables CSS).
- Bouton CTA : table HTML + VML pour Outlook.
- Toujours un preheader masqué (aperçu dans la boîte de réception).
- Images avec `alt` ; logo référencé par URL HTTPS (`https://lienparental.fr/icons/icon-512.png`).
- Lien « Gérer mes notifications » (`/app/profil/preferences/notifications`) + mentions légales + adresse postale dans le footer.

## Déploiement

DNS SPF / DKIM / DMARC à configurer côté Resend sur le domaine `lienparental.fr` avant la mise en production. Prévoir aussi `List-Unsubscribe` et une adresse `abuse@` fonctionnelle.

## À faire plus tard

- Brancher Sentry (`// TODO: Sentry` dans `send.ts`).
- Externaliser le texte de désabonnement sur une vraie route authentifiée.
- Tests Litmus / Email on Acid pour Outlook 2016+ et Gmail (dark mode iOS).
