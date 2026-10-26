# Modèles d'e-mails d'authentification (Supabase)

Générés par `npx --yes tsx scripts/gen-supabase-emails.ts` à partir de `lib/email/layout.ts` : ne pas les modifier à la main.

À coller dans **Supabase > Authentication > Emails > Templates** (onglet « Source ») avec ces sujets :

| Modèle Supabase | Fichier | Sujet |
|---|---|---|
| Confirm signup | `confirmation.html` | Votre code de confirmation Lien Parental |
| Reset password | `recovery.html` | Réinitialisez votre mot de passe Lien Parental |
| Change email address | `email_change.html` | Confirmez votre nouvelle adresse e-mail |
| Magic link | `magic_link.html` | Votre lien de connexion Lien Parental |
| Invite user | `invite.html` | Vous êtes invité(e) sur Lien Parental |
| Reauthentication | `reauthentication.html` | Votre code de sécurité Lien Parental |

Prérequis : Auth > URL Configuration contient `https://lienparental.fr/auth/confirm` dans les Redirect URLs, et « Email OTP Expiration » vaut 900 s (15 min).
