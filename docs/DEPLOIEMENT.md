# Déploiement : Vercel + Supabase sur lienparental.fr

Décision du client (26/10/2026) : hébergement **Vercel** (application Next.js) + **Supabase** (base, comptes, stockage), domaine **https://lienparental.fr**.
Le détail de chaque service (Stripe, Google, e-mails, IA…) est dans `docs/MISE_EN_SERVICE.md` ; ce document donne l'ordre des opérations.

## 0. Avant tout
- [ ] Faire confirmer par un juriste / DPO si l'obligation **HDS** (hébergement de données de santé) s'applique aux informations de santé saisies par les parents. Si oui : l'espace Santé (tables `child_vaccinations`, `child_treatments`, données médicales chiffrées) devra être hébergé chez un prestataire certifié HDS avant l'ouverture au public.
- [ ] Chaque compte administrateur active sa double authentification (obligatoire pour l'espace admin depuis 0360).

## 1. Supabase (région UE : **`eu-west-1`, Irlande**, région du projet de production)
1. Créer le projet en région `West EU (Ireland)` / `eu-west-1` (offre Pro : sauvegardes quotidiennes, pas de mise en pause). La région ne peut plus être changée ensuite ; elle est citée dans la politique de confidentialité (`app/legal/confidentialite`).
2. Auth > URL Configuration : Site URL `https://lienparental.fr`, Redirect URLs `https://lienparental.fr/auth/callback` et `https://lienparental.fr/auth/confirm`.
3. Auth > Providers : e-mail (confirmation obligatoire), Google (voir MISE_EN_SERVICE §5), MFA TOTP activée.
4. Auth > SMTP : brancher Resend (expéditeur `no-reply@lienparental.fr`).
5. Appliquer `supabase/storage.sql` **en premier**, puis **toutes les migrations dans l'ordre** de `supabase/migrations/` (0001 → 0430, liste complète dans MISE_EN_SERVICE §1.2), avec la CLI (`supabase db push`) ou l'éditeur SQL. Le même ordre est rejoué par `npm run test:sql` (PGlite, `tests/sql/`) : le lancer avant chaque déploiement qui ajoute une migration. **Règle de déploiement** : appliquer `0390_rate_limit` **avant** de déployer le code qui l'utilise ; sinon les routes sensibles (coffre, codes avocat, espace témoin) répondent 503. De même, appliquer `0410` → `0420` → `0430` (dossiers du coffre) **avant** le code qui lit `documents.folder_id` et `vault_settings`, sinon la liste du coffre tombe en erreur. Depuis `0420`, le rangement automatique des pièces jointes au coffre est **désactivé par défaut** pour tous les comptes (chaque parent l'active dans les paramètres du coffre).
6. Exécuter les contrôles commentés : 0360 §5 puis les `VALIDATE` des contraintes NOT VALID ; requête de revue des gardiens 0360 §13.
7. Importer les contenus (Guide, modèles, blog) : bouton « Importer depuis le dépôt » de l'admin ou `npx --yes tsx scripts/seed-contenus-sql.ts`. Sans import, le Guide se replie sur les fichiers du dépôt.
8. Planifier (pg_cron) : purge de la corbeille, purge des déverrouillages expirés du coffre, purge du limiteur de débit (`rate_limit_purge()`, 0390). La file Google Agenda est appelée par Vercel Cron (`vercel.json`) ; pg_cron seulement si vous retirez le bloc `crons` (MISE_EN_SERVICE §5.4 bis).

## 2. Vercel (offre Pro, nécessaire pour la tâche planifiée toutes les 5 min)
1. Importer le dépôt, framework Next.js, Node ≥ 20.10. `vercel.json` (racine du dépôt) fixe la configuration :
   - `"regions": ["cdg1"]` : les fonctions serveur (pages dynamiques, routes `/api`) s'exécutent à **Paris**. La base est en Irlande (`eu-west-1`) : compter ~15-20 ms par aller-retour fonction → base. Ne pas changer de région sans mettre à jour la politique de confidentialité. Le middleware (Edge) et le cache des fichiers statiques restent servis par le réseau mondial de Vercel.
   - `crons` : `GET /api/integrations/google/calendar/cron` et `GET /api/cron/notifications` (rappels, e-mails groupés, file des notifications : `docs/NOTIFICATIONS.md`) toutes les 5 min (`*/5 * * * *`), production uniquement.
2. Variables d'environnement (Production) : reprendre **toutes** celles de `.env.example`, en particulier :
   - Supabase : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - Domaine : `NEXT_PUBLIC_APP_URL` et `NEXT_PUBLIC_SITE_URL` = `https://lienparental.fr`, `WEBAUTHN_RP_ID=lienparental.fr`, `WEBAUTHN_ORIGIN=https://lienparental.fr`
   - Secrets à générer (32 octets aléatoires, `openssl rand -base64 32`, jamais réutilisés d'une variable à l'autre) : `APP_ENCRYPTION_KEY`, `VAULT_LOCK_SECRET`, `GOOGLE_TOKEN_ENCRYPTION_KEY`, `CRON_SECRET`, `LAWYER_SHARE_SECRET`, `IP_HASH_SALT`
   - Stripe (prix Premium et Coparentalité+), Anthropic, Resend, Google : voir MISE_EN_SERVICE
   - `NEXT_PUBLIC_DEMO_MODE=off`
   - Variables ajoutées (toutes documentées dans `.env.example`) :

     | Variable | Rôle | Sans elle |
     |---|---|---|
     | `LAWYER_SHARE_SECRET` | secret HMAC des clés d'accès des partages avocat (`app/api/partage`) | repli `APP_ENCRYPTION_KEY`, sinon secret par instance (accès perdus à chaque redémarrage) |
     | `IP_HASH_SALT` | sel des empreintes d’IP (preuve d’un témoignage, clés du limiteur 0390) et de l’identifiant d’appareil (alerte « nouvel appareil », obligatoire) | repli `APP_ENCRYPTION_KEY` ; aucun des deux : pas d’alerte « nouvel appareil » |
     | `NEXT_PUBLIC_DON_URL` | lien du bouton de `/don` (HelloAsso, Stripe Payment Link…) | « La page de don ouvre très bientôt » |
     | `STRIPE_TAX` | `on` active Stripe Tax au paiement (à activer d'abord dans Stripe) | pas de taxe automatique |
     | `STRIPE_PORTAL_CONFIGURATION` | identifiant `bpc_…` du portail client | configuration par défaut du compte Stripe |
     | `BILLING_GRACE_DAYS` | jours d'avantages conservés après un impayé (0 à 60) | 14 |

     | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | clé publique VAPID (Web Push), lue par le navigateur | pas de notification sur appareil (in-app et e-mails inchangés) |
     | `VAPID_PRIVATE_KEY` | clé privée VAPID, serveur uniquement | idem |
     | `VAPID_SUBJECT` | contact VAPID, `mailto:contact@lienparental.fr` | idem |

     **Ordre** : appliquer la migration `0440_notifications.sql` AVANT de déployer le code qui l'utilise (routes
     `/api/cron/notifications`, `/api/push/subscribe`, `/api/auth/login-check`), sinon ces routes échouent
     (fonctions SQL absentes). `IP_HASH_SALT` est obligatoire pour l'alerte « nouvel appareil ».

     Paire VAPID : `npx web-push generate-vapid-keys`, une seule fois (la changer oblige chaque appareil à réactiver les notifications). Détails : `docs/NOTIFICATIONS.md`.
   - À ne **pas** saisir (lues nulle part) : `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `OCR_API_KEY`.
3. Tâche planifiée : rien à faire dans l'interface, elle est déclarée dans `vercel.json`. Vercel envoie **automatiquement** l'en-tête `Authorization: Bearer $CRON_SECRET` dès que `CRON_SECRET` est définie (sans elle, la route répond 503). Offre **Pro** requise pour la fréquence de 5 min (Hobby : une exécution par jour, le déploiement échoue avec une fréquence plus élevée). Contrôle : Settings > Cron Jobs, puis `curl -i -H "Authorization: Bearer $CRON_SECRET" https://lienparental.fr/api/integrations/google/calendar/cron` → 200, sans en-tête → 401.

## 3. Domaine lienparental.fr
1. Vercel > Domains : ajouter `lienparental.fr` et `www.lienparental.fr` (redirection www → racine).
2. Chez le registrar du .fr : enregistrements DNS indiqués par Vercel (A / CNAME). Certificat HTTPS automatique.
3. E-mails : enregistrements SPF, DKIM et DMARC fournis par Resend pour `lienparental.fr` ; créer les adresses `support@`, `contact@`, `dpo@`, `no-reply@`.
4. Mettre à jour les URL de redirection chez Google Cloud (connexion + Agenda) et le webhook Stripe : `https://lienparental.fr/api/stripe/webhook`.

## 4. Recette avant ouverture
- Parcours complet sur le domaine (inscription e-mail et Google, enfant, journal + dépense, calendrier + synchro Google, coffre verrouillé/déverrouillé avec code et empreinte, témoignage, messagerie + note vocale, invitation de l'autre parent, abonnement Premium en mode test Stripe, dossier JAF PDF, admin).
- `npm run test`, `npm run test:sql`, `npm run check:guide`, `npx tsc --noEmit` et `next build` au vert.
- Installation PWA testée sur un vrai iPhone et un vrai Android (`/installer`).
