# Mise en service — Lien Parental

Guide pas à pas pour passer du mode démonstration (aucune clé) aux vrais services.
Sans clés, l'application reste utilisable en démonstration : écrans d'abonnement fictifs, aucun e-mail envoyé.

## 1. Supabase

L'authentification réelle s'active **automatiquement** dès que `NEXT_PUBLIC_SUPABASE_URL` et
`NEXT_PUBLIC_SUPABASE_ANON_KEY` sont définies (`lib/supabase/config.ts`). Les comptes de démonstration
disparaissent alors (`DEMO_MODE` passe à `false`) : le cookie `lp_demo` n'ouvre plus aucun accès.

### 1.1 Créer le projet (hébergement UE)

1. https://supabase.com/dashboard → **New project**.
2. **Region** : `West EU (Ireland)`, identifiant `eu-west-1` : c'est la région du projet de production. La région ne peut
   plus être changée ensuite. Les fonctions Vercel tournent à Paris (`cdg1`, `vercel.json`), à environ 15-20 ms
   de la base.
3. Mot de passe de la base : générer un mot de passe long, le ranger dans le gestionnaire de mots de passe de l'équipe.
4. Plan : **Pro** recommandé en production (sauvegardes quotidiennes, pas de mise en pause, SMTP/limites ajustables).

### 1.2 Appliquer les migrations (dans l'ordre)

Ordre (identique à `docs/DEPLOIEMENT.md` §1.5 et au banc de tests `npm run test:sql`) :

1. **`supabase/storage.sql` d'abord** (buckets privés `documents`, `avatars`, `temoignage-attachments` + policies).
   Il doit passer **avant** les migrations : `0210_garde_frais` porte ensuite la limite du bucket `documents` à 20 Mo
   (exécuté après, `storage.sql` la ramènerait à 10 Mo).
2. Puis **toutes** les migrations de `supabase/migrations/`, dans l'ordre des préfixes, sans en sauter :

`0001_init_auth` → `0002_users_children` → `0003_journal_calendar` → `0004_vault` → `0005_testimonies` →
`0006_ai_subscription` → `0007_system` → `0100_rls` → `0101_functions` → `0102_admin` →
**`0200_auth_profiles`** → `0210_garde_frais` → `0220_billing` → `0230_messages_partages` → `0240_journal_finances` →
`0250_guide` → `0260_sante_enfant` → `0270_security_hardening` → `0280_journal_dates_guide` → `0290_vault_lock` →
`0300_admin_contenus` → `0310_admin_stats` → `0320_google` → `0330_messagerie_plus` → `0340_famille` →
`0350_finances_plus` → `0360_security_v3` → `0370_vault_lock_phase2` → `0380_plan_coparentalite` → `0390_rate_limit` →
`0400_admin_operations` → `0410_vault_folders` → `0420_vault_import_settings` → `0430_vault_add_from_source_trash`.

**Règle de déploiement** : appliquer `0390_rate_limit` **avant** de déployer le code qui l'utilise ; sinon les routes sensibles (coffre, codes avocat, espace témoin) répondent 503. Appliquer aussi `0410` → `0420` → `0430` **avant** le code des dossiers du coffre (colonne `documents.folder_id`, table `vault_settings`). Depuis `0420`, le rangement automatique des pièces jointes au coffre est désactivé par défaut pour tous les comptes. Annulation : blocs de rollback en fin de 0410 et 0420 (annuler 0420 avant 0410) ; pour 0430, ré-appliquer la fonction de 0360 §6.

Option A — CLI (recommandée) : exécuter `storage.sql` dans le SQL Editor, puis

```bash
npx supabase login
npx supabase link --project-ref <ref-du-projet>
npx supabase db push            # applique supabase/migrations/* dans l'ordre des préfixes
```

Option B — **SQL Editor** du dashboard : `storage.sql`, puis chaque fichier de migration, dans l'ordre ci-dessus.
Si l'éditeur refuse une valeur d'enum fraîchement ajoutée (« unsafe use of new enum value »), exécuter d'abord
seules les lignes `alter type … add value …` du fichier, puis le fichier entier (cas observé sur `0102_admin` quand
le fichier est exécuté d'un bloc).

`0200_auth_profiles.sql` est indispensable à l'authentification :

- crée automatiquement `public.users` + `public.preferences` à chaque inscription (trigger sur `auth.users`) ;
- synchronise e-mail / e-mail vérifié / 2FA (`users.email_verified`, `users.mfa_enabled`) ;
- **restreint les colonnes modifiables** de `public.users` (prénom, nom, photo, coordonnées) : un client ne peut
  pas modifier `plan`, `email` ni `deleted_at` (complète le garde-fou `plan` de `0220_billing.sql`) ;
- expose `list_my_sessions()` / `revoke_my_session()` (écran Sessions) et `purge_deleted_accounts()` (purge 30 j).

> Dépendance facturation : appliquer la migration `supabase/migrations/0220_billing.sql`
> (tables `billing_customers`, `stripe_events`, garde-fou sur `users.plan`).

Vérification rapide (SQL Editor) :

```sql
select tgname from pg_trigger where tgname in ('trg_auth_user_created','trg_auth_user_updated','trg_mfa_factor_change');
select id, public from storage.buckets;   -- 3 buckets, public = false
```

### 1.3 Authentication > URL Configuration

| Réglage | Valeur |
| --- | --- |
| **Site URL** | `https://lienparental.fr` (= `NEXT_PUBLIC_APP_URL`) |
| **Redirect URLs** | `https://lienparental.fr/auth/callback**`, `https://lienparental.fr/auth/confirm**`, + préproduction (`https://<preview>.vercel.app/auth/**`) et `http://localhost:3000/auth/**` pour le développement |

### 1.4 Authentication > Providers > Email

- **Enable Email provider** : activé. **Confirm email** : activé.
- **Secure email change** : activé (confirmation sur l'ancienne ET la nouvelle adresse).
- **Secure password change** : activé.
- **Email OTP Length** : `6` (l'écran de vérification a 6 cases). **Email OTP Expiration** : `3600` s (1 heure, valeur par défaut), réglage PARTAGÉ par le code d'inscription et le lien de réinitialisation (nos e-mails et l'app annoncent « 1 heure »). `900` s serait plus strict ; si le propriétaire choisit cette valeur, il faut changer les textes (template `verification`, écran de vérification, `resetPassword`, `scripts/gen-supabase-emails.ts`).
- **Password requirements** (Authentication > Policies / Passwords) : longueur minimale `8`, exiger
  « lowercase, uppercase letters and digits » — c'est la vérification **côté serveur** des règles affichées, identiques à
  `passwordSchema` (`lib/auth/validation.ts`) et `PASSWORD_RULES` : à modifier ensemble.
  Activer aussi **Leaked password protection** (plan Pro).

### 1.5 Authentication > Email Templates

L'inscription se vérifie par **code à 6 chiffres** et la réinitialisation par **lien** vers `/auth/confirm`.

**Confirm signup** — sujet : `Votre code Lien Parental`

```html
<h2>Bienvenue sur Lien Parental</h2>
<p>Voici votre code de vérification :</p>
<p style="font-size:28px;font-weight:700;letter-spacing:6px">{{ .Token }}</p>
<p>Ce code est valable 15 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.</p>
```

**Reset Password** — sujet : `Réinitialisez votre mot de passe`

```html
<h2>Mot de passe oublié ?</h2>
<p>Cliquez sur le lien ci-dessous pour choisir un nouveau mot de passe :</p>
<p><a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=recovery">Choisir un nouveau mot de passe</a></p>
<p>Ce lien expire rapidement et ne fonctionne qu'une fois.</p>
```

(`{{ .RedirectTo }}` vaut `https://lienparental.fr/auth/confirm?next=/nouveau-mot-de-passe` : d'où le `&`.)
Ce format fonctionne même si l'e-mail est ouvert sur un autre appareil que celui de la demande.

**Change Email Address** — lien :
`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change&next=/app/profil`

Rédiger les autres modèles (Magic Link, Invite) en français même s'ils ne sont pas utilisés.

### 1.6 SMTP personnalisé (Resend)

Le SMTP intégré de Supabase est limité à quelques e-mails/heure : **obligatoire** de le remplacer en production.
Authentication > **SMTP Settings** > Enable custom SMTP :

| Champ | Valeur |
| --- | --- |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | une clé API Resend dédiée (droit « Sending access » sur le domaine) |
| Sender email | `no-reply@lienparental.fr` (domaine vérifié dans Resend : SPF, DKIM, DMARC) |
| Sender name | `Lien Parental` |

Puis Authentication > **Rate Limits** : relever « emails sent per hour » (ex. 100) une fois le SMTP branché.
Les limites de connexion / vérification par IP restent actives : l'app affiche « Trop de tentatives… » (HTTP 429).

### 1.7 Authentification à deux facteurs (TOTP)

Authentication > **Multi-Factor** : activer **TOTP (App Authenticator)** — enroll + verify.
L'app gère l'activation (QR code + clé), la vérification à la connexion et la désactivation
(`/app/profil/securite/2fa`). Une session sans code TOTP validé (aal1) n'accède ni à `/app` ni à `/admin`.

### 1.8 Storage

`supabase/storage.sql` est exécuté en premier (§1.2), avant les migrations. Tous les buckets sont **privés** ;
l'app n'utilise que des URL signées (15 min). Photos de profil : `avatars/<uid>/avatar.jpg`,
photos d'enfant : `avatars/<uid>/children/<id-enfant>.jpg` (redimensionnées à 512 px, EXIF supprimés).

### 1.9 Administrateurs

Le rôle admin est porté par `public.users.plan = 'admin'` (lu par `is_admin()`, 0102). Pour promouvoir un compte
(SQL Editor, rôle `postgres`) :

```sql
update public.users set plan = 'admin' where email = 'prenom.nom@lienparental.fr';
```

Aucun client ne peut faire cette opération lui-même (privilèges par colonne 0200 + trigger 0220).

### 1.10 Suppression de compte et purge à 30 jours

`POST /api/account/delete` (mot de passe redemandé) anonymise immédiatement l'identité, supprime la photo,
bloque le compte (soft delete Supabase Auth) et pose `users.deleted_at`. Les contenus sont purgés 30 jours plus tard :
planifier **quotidiennement** (Database > Cron, extension `pg_cron`) :

```sql
select cron.schedule('purge-deleted-accounts', '15 3 * * *', $$ select public.purge_deleted_accounts(); $$);
```

Les fichiers Storage des comptes purgés (`documents/<uid>/…`, `avatars/<uid>/…`) doivent être supprimés par le
worker de purge (la fonction renvoie la liste des ids). L'annulation Stripe d'un abonnement actif relève du module Stripe.

`GET /api/account/export` renvoie un JSON de toutes les données du compte (1 export / 7 jours).

### 1.11 Variables d'environnement (Vercel → Settings → Environment Variables)

| Variable | Où la trouver | Exposée au navigateur |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project Settings > API > Project URL | oui (publique) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project Settings > API > `anon` / publishable key | oui (publique, protégée par la RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings > API > `service_role` / secret key | **non — jamais** (suppression de compte, audit, webhooks) |
| `NEXT_PUBLIC_APP_URL` | URL publique, sans `/` final (ex. `https://lienparental.fr`) | oui |
| `NEXT_PUBLIC_DEMO_MODE` | laisser vide ou `off` en production | oui |

Après ajout des clés : redéployer, puis recette — inscription (code reçu ?), connexion, mot de passe oublié,
activation 2FA puis reconnexion avec code, export, suppression d'un compte de test.

## 1 bis. Données et stockage

Dès que `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` sont présents (`SUPABASE_ENABLED`), les écrans
Enfants, Journal, Calendrier, Coffre-fort (documents, catégories, corbeille, partages), Témoignages, Garde et Frais
lisent et écrivent dans Supabase via `lib/data/*`. Sans ces clés, l'app reste en **mode démonstration** (données
fictives + `sessionStorage`), à l'identique.

### 1 bis.1 Migration `0210_garde_frais.sql`

| Objet | Rôle |
| --- | --- |
| `garde_configs` | 1 ligne par utilisateur (PK `user_id`), configuration du planning en `jsonb` (≤ 16 Ko) |
| `expenses` | dépenses partagées en **centimes entiers**, `part_moi` 0–100, `statut`, justificatif → `documents.id`, soft delete |
| `pension_payments` | versements reçus, unique `(user_id, month)` → « marquer comme reçu » idempotent |
| `testimony_reviews` | décision du parent (confirmer / refuser) ; les témoignages restent immuables |
| `documents.doc_date / source / description` | métadonnées saisies dans « Ajouter un document » |
| `shares.label` | libellé libre d'un partage |
| `testimony_requests.subject / parents / enfants / auto_reminder / deadline` | champs des étapes 1 à 3 de la demande |
| `testimonies` : `UNIQUE(request_id)` remplacé par un index | un lien peut recevoir **plusieurs** témoins (plafond 20 côté API) |
| `get_testimony_request_people(token)` | RPC SECURITY DEFINER : noms des parents/enfants concernés, rien d'autre |
| bucket `documents` | limite portée à **20 Mo** (voir l'avertissement ci-dessous) |

> **Ordre d'exécution** : `supabase/storage.sql` s'exécute **avant** les migrations (§1.2), et 0210 porte alors la
> limite à 20 Mo. Si `storage.sql` est ré-exécuté plus tard, il remet `file_size_limit` à 10 Mo : ré-appliquer
> `update storage.buckets set file_size_limit = 20971520 where id = 'documents';`. Sans cela, les documents de 10 à
> 20 Mo sont refusés par Storage.

Toutes les nouvelles tables : RLS activée, policies owner-only (`auth.uid() = user_id`) en lecture/écriture,
aucun accès `anon`. Changements additifs uniquement ; bloc de rollback commenté en fin de fichier.

### 1 bis.2 Variables d'environnement serveur

| Variable | Usage | Sans elle |
| --- | --- | --- |
| `APP_ENCRYPTION_KEY` | 32 octets base64 (`openssl rand -base64 32`) — chiffrement AES-256-GCM des infos médicales des enfants (`/api/enfants/[id]/medical`, clé dérivée par utilisateur via HKDF) | les infos médicales ne sont **pas** enregistrées (erreur explicite à l'écran) |
| `SUPABASE_SERVICE_ROLE_KEY` | pièces jointes des témoins (bucket privé `temoignage-attachments`), référence TMG, liens de partage publics `/api/partages/[token]` | témoignages sans pièce jointe uniquement ; liens de partage indisponibles |
| `IP_HASH_SALT` (facultatif) | sel HMAC de l'empreinte IP enregistrée avec un témoignage (défaut : `APP_ENCRYPTION_KEY`) | aucune empreinte IP stockée |

### 1 bis.3 Chemins Storage

- Coffre-fort : `documents/<uid>/<uuid>-<nom-assaini>` (PDF, JPG, PNG, DOCX, DOC ; 20 Mo) ; téléchargement et aperçu par URL signée de 60 s émise par le serveur (`GET /api/coffre/fichier/[id]`, coffre déverrouillé exigé, 0370).
- Images du journal : `documents/<uid>/journal/<uuid>-<nom>` (images/PDF, 10 Mo, 10 fichiers par entrée).
- Justificatifs de frais : rangés dans le coffre-fort (`documents/<uid>/…` + ligne `documents`, source « Justificatif de frais partagés »).
- Témoins : `temoignage-attachments/<request_id>/<uuid>.<ext>` — écrit **uniquement** par le serveur après validation
  du jeton, de la taille (10 Mo) et du type réel (octets du fichier : PDF/JPEG/PNG/WebP).

### 1 bis.4 Tâches planifiées à prévoir

```sql
-- Corbeille du coffre-fort : purge définitive à 30 jours (renvoie les chemins Storage à supprimer).
select cron.schedule('purge-trash', '30 3 * * *', $$ select public.purge_expired_trash(); $$);
```

`purge_expired_trash()` n'est exécutable que par `postgres` (propriétaire, cas de pg_cron) et `service_role` (0270) :
un worker externe doit l'appeler avec la clé service_role.

Le worker de purge doit aussi supprimer : les fichiers renvoyés par `purge_expired_trash()`, les pièces jointes de
témoins **non rattachées** à un témoignage après 24 h (dépôt sans envoi), et les lignes `journal_entries` / `expenses` /
`children` / `calendar_events` à `deleted_at` > 30 jours (+ leurs fichiers).

### 1 bis.5 Limitation de débit (partagée entre instances)

Les limites sont comptées dans Postgres (migration `0390_rate_limit`, table `rate_limits`, fonction `rate_limit_hit`),
accessible au seul serveur via `SUPABASE_SERVICE_ROLE_KEY`, donc valables pour toutes les instances Vercel ; fenêtres
fixes ; les clés ne contiennent jamais d'IP ni de jeton en clair (empreinte HMAC avec `IP_HASH_SALT`, à configurer) ;
conservation 24 h max.

IP retenue : `x-vercel-forwarded-for`, sinon `x-real-ip`, sinon dernier élément de `x-forwarded-for` ; IPv6 regroupées
par /64.

Limites : témoin lecture 30/min/IP, envoi 5/10 min/IP et 20/h/lien, dépôt 15/10 min/IP ; partage avocat 60
ouvertures/15 min/IP, 20 codes/15 min/IP, 5 échecs/15 min/partage ; liens de partage du coffre 30/min/IP ; verrou du
coffre 10 à 120/min/utilisateur selon l'action ; Coach IA chat 12/min, analyse 6/min.

Si la base ne répond pas : coffre, codes avocat et témoin refusent en 503 (fail-closed) ; les autres routes retombent
sur un compteur mémoire par instance ; la base n'est plus interrogée pendant 15 s après un échec. En démo, seul le
compteur mémoire s'applique.

Vérification : `select public.rate_limit_hit('test:verif', 3, 60) from generate_series(1,5);` doit renvoyer
t,t,t,f,f ; purge : `select public.rate_limit_purge();` (cron quotidien possible).

### 1 bis.6 Vérification rapide

```sql
select relname, relrowsecurity from pg_class
 where relname in ('garde_configs','expenses','pension_payments','testimony_reviews');   -- relrowsecurity = true
select file_size_limit from storage.buckets where id = 'documents';                       -- 20971520
```

Recette : ajouter un enfant puis ses infos médicales, une entrée de journal avec photo, un événement, un document
(télécharger, mettre à la corbeille, restaurer), une demande de témoignage → ouvrir le lien en navigation privée,
envoyer avec une pièce jointe → confirmer côté parent ; configurer la garde ; ajouter une dépense avec justificatif.

### 1 bis.7 Encore en données de démonstration

Prénom du co-parent (« Thomas ») et montant de la pension (`DEMO_PENSION`), paramètres et préférences de rappels du
calendrier, photo de l'enfant (aperçu local), relances des témoins (annonce seulement), modèles de documents,
tableau de bord d'accueil (`/app`) et palette de recherche.

## 2. Stripe

> **Procédure recommandée : [docs/STRIPE.md](STRIPE.md)** (script `scripts/stripe-setup.ts` qui crée produits, prix,
> webhook et portail, puis affiche les variables). Les étapes manuelles ci-dessous restent valables.

La facturation réelle s'active quand **Stripe et Supabase** sont configurés (`STRIPE_SECRET_KEY` + clés Supabase).
Aucune carte n'est saisie dans l'application : le paiement se fait sur Stripe Checkout, la gestion de la carte sur le portail client Stripe.

### 2.1 Compte et mode test

1. Créer le compte sur https://dashboard.stripe.com (entreprise en France, devise **EUR**).
2. Rester en **mode test** (interrupteur « Mode test » en haut à droite) tant que la recette n'est pas terminée.
3. **Développeurs > Clés API** : copier la clé secrète `sk_test_...` dans `STRIPE_SECRET_KEY`
   (la clé publique `pk_test_...` n'est pas nécessaire : Checkout et le portail sont hébergés par Stripe).
   Bonne pratique : créer une **clé restreinte** (`rk_test_...`) avec les droits en écriture sur Customers, Checkout Sessions,
   Subscriptions, Subscription Schedules, Customer portal, et en lecture sur Invoices, Payment Methods, Prices.

### 2.2 Produit et prix

**Catalogue de produits > Ajouter un produit** :

| Champ | Valeur |
| --- | --- |
| Nom | Lien Parental Premium |
| Prix 1 | **11,99 €** · Récurrent · **Mensuel** · Taxe : « TTC » (prix taxes incluses) |
| Prix 2 | **99,00 €** · Récurrent · **Annuel** · Taxe : « TTC » |

Copier les identifiants `price_...` :

- `STRIPE_PRICE_MONTHLY=price_...` (11,99 € / mois)
- `STRIPE_PRICE_YEARLY=price_...` (99 € / an)

Les montants affichés dans l'app viennent de `components/profil/pricing.ts` : **les garder alignés** avec ces prix.
Les montants réellement facturés et affichés dans « Mon abonnement » viennent toujours de Stripe.

### 2.2 bis Formule Coparentalité+ (0380)

Troisième formule, au-dessus de Premium. **Second produit** dans le catalogue :

| Champ | Valeur |
| --- | --- |
| Nom | Lien Parental Coparentalité+ |
| Prix 1 | **19,99 €** · Récurrent · **Mensuel** · TTC · métadonnée `plan` = `coparentalite` |
| Prix 2 | **189,00 €** · Récurrent · **Annuel** · TTC · métadonnée `plan` = `coparentalite` |

- `STRIPE_PRICE_COPARENTALITE_MONTHLY=price_...` (19,99 € / mois)
- `STRIPE_PRICE_COPARENTALITE_YEARLY=price_...` (189 € / an)

Le prix annuel de **189 €** est une **proposition** (≈ 15,75 €/mois, 2 mois offerts, -21 %) : il est modifiable.
Pour le changer : créer un nouveau Price chez Stripe, mettre à jour la variable, et la constante
`COPARENTALITE` de `components/profil/pricing.ts` (tous les libellés « mois offerts », « -X % », barré, se recalculent).
La métadonnée `plan=coparentalite` sur les Prices sert de filet de sécurité : si un Price est remplacé sans mise à jour
des variables, le webhook reconnaît quand même la formule (sinon il la classerait en Premium).

Sans ces deux variables, l'offre reste affichée mais le paiement répond « service momentanément indisponible » (503 `misconfigured`).

**Migration** : appliquer `supabase/migrations/0380_plan_coparentalite.sql` **avant** de mettre les variables (enums
`plan_tier` / `subscription_plan`, sinon le webhook échouerait à écrire `coparentalite_*`).

**Changement de formule** (`POST /api/stripe/change-plan`, écran Profil > Abonnement > Changer de formule) :

| Changement | Effet | Facturation |
| --- | --- | --- |
| Mensuel ↔ annuel, même formule | au prochain cycle (subscription schedule) | sans prorata |
| Premium → Coparentalité+ (montée) | **immédiat** | prorata facturé et prélevé tout de suite (`always_invoice`) ; si le paiement échoue ou exige 3D Secure, rien n'est appliqué (402 `payment_failed`) |
| Coparentalité+ → Premium (descente) | **immédiat** | crédit au prorata du temps non utilisé, déduit des prochaines factures (`create_prorations`) ; les parents liés perdent l'accès partagé |

Les montants sont toujours ceux des Prices Stripe (jamais envoyés par le navigateur). Clé d'idempotence sur la mise à jour : un double clic ne crée qu'une facture de prorata.

Optionnel : **Stripe Tax** (Paramètres > Taxes) puis `STRIPE_TAX=on` pour activer `automatic_tax`
(l'adresse de facturation devient alors obligatoire dans Checkout). Sans `STRIPE_TAX=on`, aucun calcul de taxe automatique.

Optionnel : codes promo (Catalogue > Coupons > Codes promotionnels) — le champ est déjà activé dans Checkout.

### 2.3 Webhook

**Développeurs > Webhooks > Ajouter un endpoint** :

- URL : `https://<votre-domaine>/api/stripe/webhook`
- Version d'API : celle par défaut du compte (le SDK épingle sa propre version pour les appels sortants).
- Événements à écouter (exactement) :
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.paid`
  - `invoice.payment_failed`
- Copier le **secret de signature** `whsec_...` dans `STRIPE_WEBHOOK_SECRET`.

Le webhook est idempotent (table `stripe_events`) : une relivraison Stripe ne crée ni doublon ni second e-mail.
Il renvoie 200 dès la synchronisation ; en cas d'erreur il renvoie 500 et Stripe relivre automatiquement (backoff jusqu'à 3 jours).

### 2.4 Test en local

```bash
# 1. Installer la CLI : https://docs.stripe.com/stripe-cli
stripe login
# 2. Relayer les événements vers le serveur local
stripe listen --forward-to localhost:3000/api/stripe/webhook
#    → affiche un secret whsec_... propre à cette session : le mettre dans STRIPE_WEBHOOK_SECRET (.env.local)
# 3. Lancer l'app
npm run dev
```

`NEXT_PUBLIC_APP_URL=http://localhost:3000` en local (sert aux URLs de retour Checkout/portail et au contrôle d'Origin).

Parcours de recette (cartes de test : https://docs.stripe.com/testing) :

| Scénario | Carte | Attendu |
| --- | --- | --- |
| Abonnement réussi | `4242 4242 4242 4242` | Retour sur Confirmation « Abonnement confirmé », e-mail « abonnement confirmé », ligne `subscriptions` active, `users.plan = premium` |
| 3D Secure | `4000 0025 0000 3155` | Authentification puis succès |
| Paiement refusé à la souscription | `4000 0000 0000 0002` | Erreur affichée par Checkout, aucun abonnement |
| Échec au renouvellement | `4000 0000 0000 0341` (attachée, puis avancer l'horloge) | `past_due`, e-mail « paiement échoué » ; après les relances : `unpaid`/`canceled`, retour à l'offre gratuite |
| Résiliation | Bouton « Résilier » | `cancel_at_period_end = true`, e-mail de résiliation ; « Réactiver » l'annule |
| Changement de cycle | « Changer de formule », même formule, autre cycle | Changement programmé à la prochaine échéance (Subscription schedule), sans prorata |
| Montée vers Coparentalité+ | « Passer à Coparentalité+ » | Facture de prorata payée immédiatement, `subscriptions.plan = coparentalite_*`, `users.plan = coparentalite` ; un parent lié voit le quota Coach IA Premium |
| Montée refusée | `4000 0000 0000 0341` comme carte par défaut | 402 « paiement de la différence refusé », formule inchangée |
| Descente vers Premium | « Changer de formule » | Effet immédiat, crédit visible sur la facture suivante, `users.plan = premium` |
| Abonnement Coparentalité+ direct | `/app/abonnement?formule=coparentalite` | Checkout sur le Price Coparentalité+, e-mail « Votre abonnement Coparentalité+ est actif » |

Pour simuler le temps (renouvellements, fin de période) : **Test clocks** (Facturation > Horloges de test).

### 2.5 Portail client

**Paramètres > Facturation > Portail client** :

- Activer : mise à jour du **moyen de paiement**, **historique des factures**, mise à jour des **coordonnées de facturation**.
- Résiliation depuis le portail : autorisée, **« À la fin de la période de facturation »** (cohérent avec l'app).
- Changement d'offre depuis le portail : **désactivé** (l'app gère Premium ↔ Coparentalité+ et mensuel ↔ annuel, avec les règles de prorata ci-dessus).
  Si vous l'activez malgré tout, y ajouter les **deux produits** : le webhook reflète correctement les quatre Prices.
- Langue : français. Lien de retour : géré par l'app (`/app/abonnement?info=portal`, qui resynchronise l'abonnement).
- Optionnel : si plusieurs configurations existent, renseigner `STRIPE_PORTAL_CONFIGURATION=bpc_...`.

### 2.6 Relances et passage à l'offre gratuite

**Paramètres > Facturation > Abonnements et e-mails** :

- **Smart Retries** activé (ex. 4 tentatives sur 2 semaines).
- Après la dernière tentative : **« Marquer l'abonnement comme impayé »** (ou « Annuler l'abonnement »).
  Dans les deux cas l'app repasse le compte en **gratuit** (lecture seule au-delà du quota gratuit, CDC §6.1).
- `BILLING_GRACE_DAYS` (défaut 14) : durée pendant laquelle un abonnement `past_due` conserve Premium.
  À aligner sur la durée des relances Smart Retries.
- E-mails Stripe : on peut désactiver « Paiement échoué » côté Stripe (l'app envoie le sien) ; garder les reçus si souhaité.

### 2.7 Passage en production

1. Refaire 2.2 à 2.5 en **mode live** (les produits, prix, webhooks et portail sont distincts entre test et live).
2. Remplacer `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY`,
   `STRIPE_PRICE_COPARENTALITE_MONTHLY`, `STRIPE_PRICE_COPARENTALITE_YEARLY` par les valeurs live.
3. CSP : vérifier que `form-action` autorise `https://checkout.stripe.com` (redirection Checkout depuis le formulaire de paiement).
   Le portail est ouvert par navigation JavaScript (pas de formulaire) et n'a pas besoin d'y figurer.
4. Faire un premier paiement réel puis le rembourser depuis le Dashboard.

### Variables d'environnement Stripe

| Variable | Obligatoire | Exemple |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | oui | `sk_test_...` / `rk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | oui | `whsec_...` |
| `STRIPE_PRICE_MONTHLY` | oui | `price_...` (11,99 €/mois) |
| `STRIPE_PRICE_YEARLY` | oui | `price_...` (99 €/an) |
| `STRIPE_PRICE_COPARENTALITE_MONTHLY` | oui pour vendre Coparentalité+ | `price_...` (19,99 €/mois) |
| `STRIPE_PRICE_COPARENTALITE_YEARLY` | oui pour vendre Coparentalité+ | `price_...` (189 €/an, modifiable) |
| `NEXT_PUBLIC_APP_URL` | oui | `https://lienparental.fr` (exactement l'origine servie : contrôle anti-CSRF) |
| `SUPABASE_SERVICE_ROLE_KEY` | oui | utilisée par le webhook et les routes `/api/stripe/*` |
| `STRIPE_TAX` | non | `on` pour activer Stripe Tax |
| `STRIPE_PORTAL_CONFIGURATION` | non | `bpc_...` |
| `BILLING_GRACE_DAYS` | non | `14` |

## 3. Claude (Coach IA)

Le Coach parental IA appelle Claude (Anthropic) via le SDK officiel `@anthropic-ai/sdk`, **uniquement côté serveur** (`lib/ai/**`, routes `app/api/coach/**`). Sans `ANTHROPIC_API_KEY`, le Coach reste en **mode démonstration** : réponses simulées, mention discrète « Mode démonstration » dans l'interface, aucun appel externe.

### 3.1 Clé API

1. Créer une organisation sur [platform.claude.com](https://platform.claude.com), activer la facturation, fixer une **limite de dépense mensuelle** (Settings → Limits).
2. Créer une clé dédiée à la production (une autre pour la préproduction) et la mettre dans `ANTHROPIC_API_KEY` sur Vercel (**jamais** de préfixe `NEXT_PUBLIC_`).
3. Vérifier que le domaine `api.anthropic.com` reste autorisé dans la CSP (`connect-src`, déjà présent dans `next.config.mjs` ; les appels partent du serveur, la CSP ne bloque donc rien côté navigateur).
4. Contrat : vérifier les conditions de traitement des données (DPA Anthropic) avant d'ouvrir le service aux utilisateurs ; les données envoyées sont décrites en 3.4.

### 3.2 Variables d'environnement

| Variable | Obligatoire | Valeur / rôle |
|---|---|---|
| `ANTHROPIC_API_KEY` | oui (sinon mode démo) | clé serveur `sk-ant-...` |
| `AI_MODEL` | non | défaut `claude-opus-5-5` |
| `AI_ANALYSIS_EFFORT` | non | `low` · `medium` (défaut) · `high` — analyse structurée |
| `AI_CHAT_EFFORT` | non | `low` (défaut) · `medium` · `high` — chat (assistant + suivi d'analyse) |
| `AI_FALLBACKS` | non | `off` pour désactiver le repli serveur (voir 3.3). Par défaut : actif |
| `APP_ENCRYPTION_KEY` | oui si l'option médicale est utilisée | déchiffrement des informations médicales, uniquement quand le parent active l'option pour une question |

`OCR_API_KEY` n'est pas utilisée par le Coach : la lecture des captures d'écran se fait par la vision de Claude.

### 3.3 Réglages du modèle

- **Modèle** : Claude Opus 5.5 (`claude-opus-5-5`). Sur ce modèle, la réflexion est toujours active : on ne la désactive pas, on règle `output_config.effort` (analyse : `medium`, chat : `low` pour un premier mot affiché vite). Pas de `temperature` / `top_p` / `top_k`, pas de pré-remplissage.
- **Analyse** (`POST /api/coach/analyze`) : sortie JSON structurée validée par un schéma zod (`lib/ai/schemas.ts`), bornée après coup (scores 0-100, longueurs). Image JPG/PNG ≤ 5 Mo (vision), PDF ≤ 10 Mo (bloc document), texte brut ≤ 200 Ko. Word non pris en charge (demander un export PDF).
- **Chat** (`POST /api/coach/chat`) : réponses diffusées en continu (SSE), historique envoyé par le client et plafonné (20 tours, 30 000 caractères).
- **Refus et repli** : chaque réponse vérifie `stop_reason`. Le **repli serveur** est activé par défaut (`fallbacks: "default"`, en-tête beta `server-side-fallback-2026-07-01`) : si un filtre de sécurité refuse à tort une demande légitime, l'API la rejoue automatiquement sur le modèle de repli recommandé par Anthropic, dans le même appel. Si toute la chaîne refuse, l'utilisateur voit un message en français (reformuler, médiateur, numéros d'urgence) et **l'analyse n'est pas décomptée**. Une réponse coupée (`max_tokens`) est signalée ; une analyse coupée n'est pas décomptée.
- **Fiabilité** : délais d'attente (90 s pour l'analyse, 80 s pour le chat), 2 nouvelles tentatives automatiques du SDK sur 429/5xx (attente exponentielle), messages d'erreur en français, annulation de l'appel si le navigateur ferme la connexion.
- **Cache de prompt** : les prompts système (figés, versionnés dans `lib/ai/prompts.ts`, `PROMPT_VERSION`) et le contexte du parent sont mis en cache (`cache_control`) : les questions suivantes d'une conversation relisent ce préfixe à 5 % du prix.

### 3.4 Confidentialité (données envoyées à l'IA)

- **Minimum nécessaire** : pour le chat, un résumé compact de l'espace du parent (`lib/ai/context.ts`), lu avec le client Supabase de l'utilisateur (RLS) : prénom et âge des enfants, journal des 60 derniers jours, calendrier de J-31 à J+60, planning de garde calculé, **noms** et dates des documents du coffre-fort (jamais leur contenu ; nom masqué pour les documents « très confidentiels »), statut des demandes de témoignage (jamais l'identité des témoins), frais partagés et pension. Environ 2 000 tokens pour un espace de démonstration complet ; plafond de 40 000 caractères.
- Pour l'analyse d'un message, seuls les prénoms du parent, de l'autre parent et des enfants accompagnent le contenu.
- **Informations médicales** : jamais transmises, sauf si le parent active « Inclure les informations médicales » pour une question (désactivé par défaut, l'option se remet à zéro après chaque envoi). Sans cette option, les détails « santé » du journal, du calendrier et des frais sont aussi masqués. Les coordonnées du médecin ne sont jamais transmises.
- **Contenus fournis par l'utilisateur** (messages collés, captures, PDF) : traités comme des **données**, jamais comme des instructions. Ils sont placés entre balises (`<contenu_a_analyser>`, `<question_parent>`, `<espace_parent>`), les balises imitées dans le contenu sont neutralisées, et le prompt système l'impose.
- **Cadre du Coach** : neutre entre les parents, intérêt de l'enfant d'abord, n'encourage jamais le conflit, n'invente rien (il dit quand une information manque et cite les données utilisées), oriente vers les numéros d'urgence (17/112, 119, 3919, 3114) en cas de danger. « Le Coach IA ne donne pas de conseil juridique » figure dans le prompt système et dans l'interface.
- **Journaux** : une ligne JSON par appel (`[coach-ai]` : route, modèle servi, version de prompt, effort, latence, tokens, coût estimé, `stop_reason`, repli utilisé). Aucun contenu, nom, e-mail, identifiant utilisateur ni nom de fichier.
- **Stockage** : les analyses sont enregistrées dans `ai_analyses` (RLS : propriétaire uniquement). La suppression efface le contenu immédiatement ; une ligne vide reste jusqu'à 30 jours pour le décompte du quota, puis elle est purgée.

### 3.5 Quotas (CDC §6.2)

| Offre | Analyses (fenêtre glissante de 30 jours) | Questions au Coach |
|---|---|---|
| Gratuite | 3 | limite douce de 50 messages / jour |
| Premium | 10 | limite douce de 50 messages / jour |

- Une analyse = un appel `/api/coach/analyze` réussi. Elle est **réservée avant l'appel** (deux requêtes simultanées ne dépassent pas le quota) et **rendue** en cas d'erreur, de refus ou de réponse coupée.
- Les analyses archivées ou supprimées **restent décomptées** jusqu'à leur sortie de la fenêtre : depuis 0270, le quota est compté sur le registre `public.ai_usage` (écriture service_role uniquement, réservation atomique `reserve_ai_usage`), que l'utilisateur ne peut ni modifier ni supprimer. `SUPABASE_SERVICE_ROLE_KEY` est donc **obligatoire** pour le Coach IA. `compute_ai_cycle_window` (0101) n'est plus utilisée et est réservée au service_role.
- Les questions de suivi d'une analyse et l'assistant général ne consomment pas d'analyse. Le compteur journalier (50) et la limite de débit (6 analyses / min, 12 messages / min) sont **en mémoire, par instance** : suffisant au lancement ; en multi-instances, prévoir un compteur partagé (Upstash/Redis).
- Le plan est lu via `getCurrentUser().plan`.

### 3.6 Coût (estimations, à confirmer sur les vraies factures)

Tarifs Opus 5.5 : 4 $ / million de tokens en entrée, 20 $ en sortie, lecture de cache 0,20 $, écriture de cache 5 $.

| Requête | Estimation |
|---|---|
| Analyse d'un message ou d'une capture (effort `medium`) | ~0,03 à 0,06 $ |
| Analyse d'un PDF de 10 pages | ~0,08 à 0,15 $ |
| Question au Coach, 1re de la conversation | ~0,02 à 0,03 $ |
| Question suivante (contexte en cache) | ~0,01 à 0,02 $ |

Ordre de grandeur : un parent premium très actif (10 analyses + 300 questions par mois) ≈ 4 à 7 $ / mois ; un parent gratuit typique < 0,50 $ / mois. La sortie (réflexion comprise) pèse le plus : baisser l'effort réduit le coût plus sûrement que d'ajouter des consignes de brièveté. Le coût réel par appel est visible dans les journaux `[coach-ai]` (`cost_usd`).

### 3.7 Évaluation (avant chaque changement de prompt ou de modèle)

```bash
ANTHROPIC_API_KEY=sk-ant-... npx tsx lib/ai/evals/run.ts          # 14 cas, ~0,5 à 1 $
ANTHROPIC_API_KEY=sk-ant-... npx tsx lib/ai/evals/run.ts ch-03     # un cas
```

Le jeu de cas `lib/ai/evals/coach-eval.jsonl` couvre : message hostile / neutre / reçu, injection d'instructions, contenu hors sujet, danger pour un enfant, solde des frais, information absente, question juridique, rédaction d'un message, refus de prendre parti, données médicales non transmises. Le script affiche le taux de réussite, les latences p50/p95 et le coût ; il échoue sous 85 %. Toute modification de `lib/ai/prompts.ts` doit incrémenter `PROMPT_VERSION` et repasser l'évaluation.

### 3.8 Limites connues

- Vercel limite le corps des requêtes des fonctions à ~4,5 Mo : les PDF et images plus lourds échouent avant d'atteindre la route (413). Pour accepter 10 Mo en production, passer par un envoi direct vers Supabase Storage puis une lecture côté serveur, ou réduire la limite affichée.
- Le fichier choisi est gardé en mémoire dans l'onglet entre « Document » et « Analyse » : après un rechargement, il faut le réimporter.
- Le statut « visite manquée » n'existe pas dans les données : le Coach le déduit avec prudence en comparant le calendrier / planning et le journal.

### 3.9 Vérification rapide

1. Sans clé : `/app/coach/assistant` affiche « Mode démonstration », les réponses arrivent mot à mot.
2. Avec clé : poser « Combien me doit l'autre parent ? » → réponse diffusée en continu, chiffre identique à l'écran Frais, dernière ligne « Données utilisées : … ».
3. Analyser une capture JPG → la progression coche les critères au fil de la réponse, puis l'écran Réponse affiche scores, mots blessants et proposition.
4. Compte gratuit : la 4e analyse en 30 jours renvoie le message de quota avec le lien Premium.
5. Journaux Vercel : une ligne `[coach-ai]` par appel, sans contenu personnel.

## 4. E-mails (Resend)

Sans `RESEND_API_KEY`, aucun e-mail n'est envoyé : une ligne de log expurgée (`m***@domaine.fr`) remplace l'envoi.

### 4.1 Compte et domaine

1. Créer le compte sur https://resend.com (région **UE** si proposée).
2. **Domains > Add domain** : utiliser un sous-domaine dédié à l'envoi, par ex. `mail.lienparental.fr`
   (isole la réputation d'envoi du domaine principal).
3. Ajouter chez le registrar DNS les enregistrements fournis par Resend, puis cliquer « Verify » :
   - **SPF** : enregistrement `TXT` (et `MX` de retour) sur le sous-domaine `send.mail…`, contenant `include:amazonses.com`.
     Un seul enregistrement SPF par nom : fusionner s'il en existe déjà un.
   - **DKIM** : enregistrement `TXT` `resend._domainkey…` (clé publique fournie).
   - **DMARC** : enregistrement `TXT` `_dmarc.lienparental.fr`, à commencer en observation puis durcir :
     ```
     v=DMARC1; p=none; rua=mailto:dmarc@lienparental.fr; adkim=s; aspf=s
     ```
     Après 2 à 4 semaines sans anomalie dans les rapports : `p=quarantine`, puis `p=reject`.
4. **API Keys > Create** : permission « Sending access », restreinte au domaine → `RESEND_API_KEY=re_...`.

### 4.2 Expéditeur

```
MAIL_FROM="Lien Parental <no-reply@mail.lienparental.fr>"
```

L'adresse doit appartenir au domaine vérifié. Prévoir une boîte `contact@` lue (adresse de support citée dans les e-mails)
et une adresse `abuse@`.

### 4.3 E-mails envoyés par l'application

| E-mail | Déclencheur |
| --- | --- |
| Abonnement confirmé | Webhook `invoice.paid` (première facture) |
| Reçu de renouvellement | Webhook `invoice.paid` (renouvellements) |
| Paiement échoué (lien vers la gestion du moyen de paiement) | Webhook `invoice.payment_failed` (1er échec et dernière tentative) |
| Résiliation programmée / abonnement terminé | Webhooks `customer.subscription.updated` / `deleted` |
| Bienvenue, nouvelle connexion | Helpers `sendWelcomeEmail` / `sendNewLoginEmail` (`lib/email/notify.ts`), appelés par le flux d'authentification |

Chaque envoi déclenché par Stripe porte une clé d'idempotence Resend : un webhook relivré n'envoie pas de doublon.
Prévisualisation en développement : `/api/email/preview/<template>` (voir `docs/EMAILS.md`).

### 4.4 Resend comme SMTP de Supabase Auth

Les e-mails d'authentification (confirmation d'inscription, lien magique, réinitialisation du mot de passe) sont envoyés par Supabase.
Le SMTP intégré de Supabase est limité (quelques e-mails par heure) : le remplacer par Resend.

Supabase Dashboard > **Authentication > Emails > SMTP Settings** > « Enable Custom SMTP » :

| Champ | Valeur |
| --- | --- |
| Sender email | `no-reply@mail.lienparental.fr` |
| Sender name | `Lien Parental` |
| Host | `smtp.resend.com` |
| Port | `465` (SSL) — ou `587` (STARTTLS) |
| Username | `resend` |
| Password | une clé API Resend dédiée (« Sending access ») |

Puis **Authentication > Rate Limits** : relever la limite d'e-mails par heure (ex. 100) et personnaliser les modèles
(**Authentication > Emails > Templates**) en français.

Test : créer un compte avec une adresse réelle et vérifier la réception, l'expéditeur, et l'en-tête `Authentication-Results`
(`spf=pass`, `dkim=pass`, `dmarc=pass`).

### Variables d'environnement e-mails

| Variable | Obligatoire | Exemple |
| --- | --- | --- |
| `RESEND_API_KEY` | pour envoyer | `re_...` |
| `MAIL_FROM` | pour envoyer | `Lien Parental <no-reply@mail.lienparental.fr>` |

## 5. Google (connexion et Google Agenda)

Deux usages **indépendants**, chacun s'active seul :

| Usage | Où se configure le client OAuth | Variables de l'application |
| --- | --- | --- |
| « Continuer avec Google » (connexion / inscription) | Supabase > Authentication > Providers > **Google** | aucune |
| Synchronisation Google Agenda | variables d'environnement serveur | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_TOKEN_ENCRYPTION_KEY` |

Sans configuration : le bouton « Continuer avec Google » reste visible et indique « Connexion Google disponible une fois le
service configuré » (démo, ou fournisseur Google désactivé dans Supabase, détecté via `/auth/v1/settings`) ; l'écran
`/app/calendrier/parametres` explique que la synchronisation n'est pas configurée.

### 5.1 Google Cloud : projet et écran de consentement

1. https://console.cloud.google.com → créer un projet « Lien Parental » (ou réutiliser celui de l'équipe).
2. **APIs & Services > Library** : activer **Google Calendar API**.
3. **Google Auth Platform > Branding** (écran de consentement) : type **External**, nom « Lien Parental », logo, e-mail
   d'assistance, domaine autorisé `lienparental.fr`, liens vers `/legal/confidentialite` et `/legal/cgu`.
4. **Data access** (portées) : `openid`, `.../auth/userinfo.email`, `.../auth/calendar.events` et
   `.../auth/calendar.app.created`. Les deux portées Agenda sont « sensibles » : **validation Google obligatoire**
   avant ouverture au public (vidéo de démonstration + justification). Tant que l'application est en mode « Test »,
   seuls les comptes ajoutés dans **Audience > Test users** peuvent se connecter, et les jetons expirent au bout de 7 jours.

Portées demandées (minimum selon le choix de l'utilisateur, autorisation incrémentale) :

| Choix dans l'écran | Portée | Accès réel |
| --- | --- | --- |
| Agenda « Lien Parental » (défaut) | `calendar.app.created` | créer CET agenda et gérer ses événements ; aucun autre agenda n'est visible |
| Agenda principal | `calendar.events` | écrire des événements dans les agendas de l'utilisateur |

`calendar.events` ne permet pas de créer un agenda : c'est pourquoi l'agenda dédié utilise `calendar.app.created`.
Passer de l'un à l'autre redemande l'autorisation Google (`include_granted_scopes`).

### 5.2 Client OAuth pour la connexion (Supabase Auth)

1. **Clients > Create client** : type **Web application**, nom « Lien Parental, connexion ».
2. **Authorized JavaScript origins** : `https://lienparental.fr` (+ `http://localhost:3000` en dev).
3. **Authorized redirect URIs** : `https://<ref-du-projet>.supabase.co/auth/v1/callback` (URL affichée dans
   Supabase > Authentication > Providers > Google).
4. Supabase > Authentication > Providers > **Google** : activer, coller Client ID et Client Secret, laisser
   « Skip nonce check » désactivé. Enregistrer.
5. Supabase > Authentication > URL Configuration : `https://lienparental.fr/auth/callback**` doit déjà figurer dans
   les Redirect URLs (§1.3). Le bouton redirige vers `/auth/callback?flow=google&next=…` (flux PKCE).

Comportement :

- **Nouveau compte** : `public.users` + `public.preferences` créés par le trigger `0200` ; prénom / nom repris de
  Google ; redirection vers l'onboarding (`/onboarding/enfant`, ou `/onboarding/profil` si le nom manque).
- **Compte e-mail existant, même adresse** : Supabase rattache l'identité Google au compte existant (liaison
  automatique d'identités sur e-mail vérifié). Pas de doublon, l'historique est conservé.
- **Double authentification** : si un facteur TOTP vérifié existe, la session Google n'est qu'en `aal1` ; le
  callback renvoie vers l'étape code (`/onboarding/connexion?mfa=1`), le middleware et la RLS (`mfa_required`)
  bloquent tout le reste tant que le code n'est pas saisi.
- **Compte en cours de suppression** : session fermée, message « compte en cours de suppression ».

### 5.3 Client OAuth pour Google Agenda

1. **Clients > Create client** : type **Web application**, nom « Lien Parental, Agenda » (client distinct de 5.2 :
   révocations et quotas séparés).
2. **Authorized redirect URIs** : `https://lienparental.fr/api/integrations/google/calendar/callback`
   (+ `http://localhost:3000/api/integrations/google/calendar/callback` en dev). Aucune origine JavaScript n'est nécessaire.
3. Variables d'environnement (Vercel, **serveur uniquement**) :

| Variable | Valeur | Sans elle |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | ID du client 5.3 | synchro non configurée |
| `GOOGLE_CLIENT_SECRET` | secret du client 5.3 (**jamais** côté navigateur) | synchro non configurée |
| `GOOGLE_REDIRECT_URI` | exactement l'URI déclarée en 2 (https, chemin `/api/integrations/google/calendar/callback`) | synchro non configurée (URI invalide = refusée) |
| `GOOGLE_TOKEN_ENCRYPTION_KEY` | `openssl rand -base64 32` (32 octets) ; à défaut `APP_ENCRYPTION_KEY` est utilisée | synchro non configurée si aucune des deux |
| `SUPABASE_SERVICE_ROLE_KEY` | déjà requise (§1.11) : les jetons ne sont lisibles qu'avec elle | synchro non configurée |

4. Appliquer la migration **`0320_google.sql`** : `google_connections` (jetons chiffrés, préférences),
   `calendar_event_links` (identifiant Google de chaque événement), `google_sync_queue` (réessais) et la fonction
   `claim_google_sync_jobs` (service_role uniquement). RLS lecture propriétaire, politiques MFA restrictives, colonnes de
   jetons illisibles par `authenticated`.

> **Rotation de la clé de chiffrement** : changer `GOOGLE_TOKEN_ENCRYPTION_KEY` rend les jetons existants
> indéchiffrables ; les connexions passent en « Reconnexion nécessaire » (aucune fuite, une reconnexion par utilisateur).

### 5.4 Fonctionnement de la synchronisation

- Sens unique **Lien Parental → Google**. Chaque création / modification / suppression (`lib/data/calendar.ts`)
  appelle `POST /api/integrations/google/calendar/sync { eventId }`. Le serveur relit l'événement en base (RLS) et
  rend Google conforme : création, mise à jour (identifiant Google mémorisé) ou retrait.
- Identifiant Google **déterministe** (`lp` + uuid) : un envoi rejoué ne crée jamais de doublon.
- Masquage (défaut : rendez-vous santé) : titre générique (« Rendez-vous santé »), sans lieu ni description,
  visibilité « privé ». Les noms des enfants ne sont jamais envoyés.
- Erreurs : jeton expiré → rafraîchi automatiquement ; jeton révoqué / portée retirée → état « Reconnexion
  nécessaire » (jetons effacés) ; réseau, quota, 5xx → file de réessai (1, 2, 4… min, max 6 h, 8 essais).
  La file est écoulée lors des synchronisations suivantes, à l'ouverture de l'écran de paramètres et par la
  tâche planifiée du §5.4 bis (toutes les 5 min, tous les utilisateurs).
- Déconnexion : révocation chez Google (`oauth2.googleapis.com/revoke`), effacement des jetons, liens et file.
  Les événements déjà copiés restent dans Google Agenda.
- Suppression de compte : les lignes Google sont supprimées en cascade, mais la révocation chez Google n'est pas
  encore appelée par `/api/account/delete` (à brancher par le coordinateur).

### 5.4 bis Tâche planifiée : écoulement de la file (toutes les 5 min)

Route : `GET` ou `POST /api/integrations/google/calendar/cron`, en-tête `Authorization: Bearer <CRON_SECRET>`
(comparaison en temps constant ; 401 si absent ou faux, 503 si `CRON_SECRET` n'est pas défini, réponse
`{ "status": "skipped" }` si l'intégration Google n'est pas configurée). Elle traite les tâches **dues** de tous
les utilisateurs avec la clé service_role, par lots bornés : 25 utilisateurs × 10 tâches au plus, arrêt après
~40 s ; le reste est repris au passage suivant. Chaque événement est relu avec un filtre `user_id` explicite
(jamais l'événement d'un autre parent). Réponse : `{ status, users, processed, remaining, reauthRequired, errors, truncated }`.

1. Générer le secret : `openssl rand -hex 32`, le saisir dans Vercel → Environment Variables → `CRON_SECRET`
   (Production uniquement), puis redéployer.
2. Choisir **un** des deux déclencheurs :

**a) Vercel Cron** (choix par défaut, **offre Pro requise** : l'offre Hobby limite les tâches planifiées à un
passage par jour). La tâche est déjà déclarée dans `vercel.json` à la racine du dépôt (avec `"regions": ["cdg1"]`) :

```json
"crons": [
  { "path": "/api/integrations/google/calendar/cron", "schedule": "*/5 * * * *" }
]
```

Vercel appelle la route en `GET` sur le déploiement de **production** uniquement et envoie automatiquement
`Authorization: Bearer <CRON_SECRET>` dès que la variable `CRON_SECRET` est définie dans le projet : rien d'autre à
configurer. Suivi : Vercel > Settings > Cron Jobs (exécutions et journaux). Si vous choisissez b), retirez le bloc
`crons` de `vercel.json` pour ne pas exécuter la file deux fois.

**b) pg_cron + pg_net (Supabase)** : Database → Extensions → activer `pg_cron` et `pg_net`, puis (SQL Editor) :

```sql
-- Secret stocké dans Vault (jamais en clair dans la définition de la tâche).
select vault.create_secret('<valeur de CRON_SECRET>', 'cron_secret');

select cron.schedule(
  'google-calendar-queue',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := 'https://<domaine-de-production>/api/integrations/google/calendar/cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);
```

Contrôle : `curl -i -H "Authorization: Bearer $CRON_SECRET" https://<domaine>/api/integrations/google/calendar/cron`
→ 200 ; sans en-tête → 401. Historique pg_cron : `select * from cron.job_run_details order by start_time desc limit 10;`.

### 5.5 Recette

1. `/onboarding/inscription` → « Continuer avec Google » avec un compte de test → arrivée sur `/onboarding/enfant`.
2. Se déconnecter, `/onboarding/connexion` → « Continuer avec Google » → `/app`. Avec la 2FA activée : l'étape code s'affiche.
3. `/app/calendrier/parametres` → « Connecter Google Agenda » → consentement → retour « connecté ». L'agenda
   « Lien Parental » apparaît dans Google Agenda avec les événements à venir.
4. Créer un rendez-vous santé : il apparaît comme « Rendez-vous santé » sans détail. Le modifier, puis le supprimer.
5. Révoquer l'accès sur https://myaccount.google.com/permissions puis modifier un événement : l'écran affiche
   « Reconnexion nécessaire ».
6. Contrôles SQL :

```sql
select has_column_privilege('authenticated', 'public.google_connections', 'refresh_token_enc', 'select'); -- false
select status, scopes, target, refresh_token_enc ? 'ciphertext' as chiffre from public.google_connections;  -- aucun jeton en clair
```


---

## 6. Tableau de bord administrateur (`/admin`)

**Migration** : appliquer `supabase/migrations/0310_admin_stats.sql`. Elle crée :
- `public.donations` (dons) et `public.stats_events` (visites, consultations du Guide, erreurs serveur, anonymes) : RLS activée, écriture `service_role` uniquement ;
- les fonctions `admin_stats_overview`, `admin_stats_series`, `admin_stats_feed` (SECURITY DEFINER, `search_path` vide, exécution révoquée à `anon`). Chacune vérifie `is_admin()` et la double authentification, sinon erreur `42501`.

Le tableau de bord appelle ces fonctions avec la session de l'administrateur : aucune clé `service_role` n'est nécessaire côté page. Les listes « dernières inscriptions / derniers paiements » ne contiennent que le prénom et l'initiale du nom ; l'export CSV ne contient que des agrégats.

**Sources des chiffres**
| Indicateur | Source |
|---|---|
| Inscrits, actifs, Premium, désabonnements, documents, témoignages, tickets, Coach IA | base Supabase |
| Revenus (mois, période, graphique) et dons | Stripe si `STRIPE_SECRET_KEY` est présente (charges encaissées : liées à une facture = abonnement, sans facture = don), sinon tables `payments` + `donations` |
| MRR | par formule, abonnés × prix des Price IDs Stripe (`STRIPE_PRICE_MONTHLY` / `_YEARLY`, `STRIPE_PRICE_COPARENTALITE_MONTHLY` / `_YEARLY`), sinon tarifs de `components/profil/pricing.ts` |
| Abonnés Coparentalité+ (répartition, MRR, conversion) | fonction `admin_stats_coparentalite(from, to)` de 0380 (garde admin + MFA) ; sans la migration, comptés à zéro avec une note |
| Coût IA | nombre d'analyses × `ADMIN_AI_COST_PER_ANALYSIS_EUR` (estimation : le coût réel par appel n'est que dans les logs) |
| Visites, consultations de fiches, pics d'erreurs | `stats_events`, vide tant que l'instrumentation n'est pas branchée (le tableau de bord l'indique et se replie sur les fiches suivies) |

**Variables (facultatives)** : `ADMIN_AI_COST_PER_ANALYSIS_EUR` (défaut 0,07), `ADMIN_AI_MONTHLY_BUDGET_EUR` (alerte de budget).

**Alimenter `stats_events` et `donations`** (côté serveur, client `service_role`) :
```ts
await createServiceClient().from('stats_events').insert({ kind: 'guide_view', ref: fiche.slug, territoire })
await createServiceClient().from('stats_events').insert({ kind: 'error', ref: '/api/coach/analyze' })
```
Pour les dons Stripe, un webhook `charge.succeeded` sans facture peut insérer dans `donations` (`external_id` = id de la charge, pour l'idempotence).

**Purge conseillée** (cron mensuel) : `delete from public.stats_events where created_at < now() - interval '13 months';`

**Vérifications**
```sql
-- En tant qu'utilisateur non admin (doit échouer avec 42501) :
select public.admin_stats_feed(8, 3);
-- anon ne peut pas exécuter :
select has_function_privilege('anon', 'public.admin_stats_overview(timestamptz,timestamptz,timestamptz,text)', 'execute'); -- false
```

---

## 7. Coffre-fort verrouillé (chantier D)

Avant d'ouvrir `/app/coffre/**` (documents, témoignages, partages), le parent déverrouille avec son **code à 6 chiffres**, le **mot de passe du compte** ou son **empreinte / visage** (WebAuthn, passkeys de plateforme). Réglages : **Profil > Sécurité > Coffre-fort** (`/app/profil/securite/coffre`).

### 7.1 Dépendances

`@simplewebauthn/server` (v13, vérification serveur dans `lib/vault-lock/webauthn.ts`) et `@simplewebauthn/browser` (v13, cérémonies dans `components/vault-lock/webauthn-browser.ts`), déjà déclarées dans `package.json`.

### 7.2 Migration

Appliquer `supabase/migrations/0290_vault_lock.sql` : tables `vault_lock_settings`, `vault_passkeys`, `vault_lock_attempts`, `vault_unlocks`, fonctions `vault_register_failure()` (service_role) et `vault_unlocked()`. RLS + politiques restrictives `mfa_required`. Toutes les écritures passent par le serveur en service_role : **`SUPABASE_SERVICE_ROLE_KEY` est obligatoire**.

**Phase 2 : `0370_vault_lock_phase2.sql`** (après 0360). Le verrou est appliqué **en base** : politiques RESTRICTIVE `vault_unlocked` sur `documents`, `testimony_requests`, `testimonies`, `testimony_reviews`, `shares`, `lawyer_shares`, `lawyer_share_access_log`, et politique Storage « documents vault unlocked » sur les fichiers du coffre du bucket `documents` (les pièces du Journal du même bucket ne sont pas concernées). Un client `authenticated` ne lit rien du coffre tant qu'aucune ligne `vault_unlocks` non expirée n'existe pour **sa** session Supabase (claim `session_id`) ; un gardien qui lit un document partagé doit lui aussi avoir déverrouillé **son** coffre. Les routes publiques (témoin, partage par lien, partage avocat) et les traitements serveur passent par le service_role et ne sont pas affectés. `categories` reste lisible (noms de rubriques, lus par la messagerie).

**Prérequis avant d'appliquer 0370** : `VAULT_LOCK_SECRET` (ou `APP_ENCRYPTION_KEY`) **et** `SUPABASE_SERVICE_ROLE_KEY` configurés sur le serveur. Sans eux, le serveur n'écrit jamais `vault_unlocks` et le coffre reste fermé en base pour tout le monde (l'interface l'indique : « Coffre-fort verrouillé »). Rollback : bloc commenté en fin de fichier (retire les politiques ; aucune donnée touchée).

### 7.3 Variables d'environnement

| Variable | Rôle |
|---|---|
| `VAULT_LOCK_SECRET` | Clé maîtresse (≥ 32 caractères). Signe le cookie `__Host-lp_vault` et sert de poivre au hachage scrypt des codes. Repli : `APP_ENCRYPTION_KEY`. Absente en production : coffre fermé avec un message. **La changer invalide tous les codes** (les parents les redéfinissent avec leur mot de passe). |
| `WEBAUTHN_RP_ID` | Domaine du site (ex. `lienparental.fr`). Les passkeys sont liées à ce domaine : ne plus le changer ensuite. |
| `WEBAUTHN_ORIGIN` | Origine(s) exacte(s), ex. `https://lienparental.fr`. Repli : `NEXT_PUBLIC_APP_URL`. |

### 7.4 Fonctionnement

- Cookie de session coffre : HttpOnly, `SameSite=Strict`, signé HMAC, lié à l'utilisateur, à la session Supabase (`session_id`) et à une « époque » (changer de code ou retirer un appareil reverrouille tous les appareils). Durée : délai d'inactivité choisi (1 à 30 min, 10 par défaut), prolongé par l'activité, plafonné à 8 h.
- Code : scrypt (N=2^15, sel 16 octets) d'un HMAC poivré. 5 essais, puis blocage 30 s, 1 min, 2 min… (plafond 1 h). Le mot de passe du compte remet le blocage à zéro et permet de redéfinir le code.
- Compte Google sans mot de passe : premier code libre ; en cas d'oubli, se reconnecter puis redéfinir le code dans les 5 minutes.
- Reverrouillage : bouton « Verrouiller », inactivité, arrière-plan (immédiat, 1 min ou 5 min), autre onglet.
- Protection des routes API qui servent des données du coffre : `requireVaultUnlocked()` de `lib/vault-lock` (403 `vault_locked`).
- Déverrouillage : la ligne `vault_unlocks` (utilisateur, session, échéance) est écrite **avant** le cookie ; si elle ne peut pas l'être (clé service absente, JWT sans `session_id`), le déverrouillage échoue au lieu d'annoncer un faux succès. Changer de code, retirer une empreinte ou réactiver le verrou efface aussi ces lignes en base (trigger 0370).
- Écrans hors du coffre (accueil, recherche, espace Santé, partage familial, Coach IA) : coffre verrouillé, ils affichent « Coffre-fort verrouillé » avec un bouton Déverrouiller au lieu d'une liste vide ; le Coach IA ne reçoit ni documents ni témoignages.

### 7.5 Tâche planifiée

```sql
select public.vault_purge_expired_unlocks();   -- 0370 (service_role) ; équivalent :
-- delete from public.vault_unlocks where expires_at <= now();
```

### 7.6 Recette

1. Ouvrir `/app/coffre` : écran « Coffre-fort sécurisé ». Saisir un mauvais code 5 fois : blocage avec compte à rebours.
2. « Code oublié ? » : mot de passe du compte, le coffre s'ouvre et le blocage disparaît.
3. Profil > Sécurité > Coffre-fort : « Ajouter cet appareil » (Touch ID, Face ID, Windows Hello). Verrouiller, puis rouvrir avec l'empreinte.
4. WebAuthn exige HTTPS (ou `localhost`). Pour tester sur un téléphone : tunnel HTTPS et `WEBAUTHN_RP_ID` / `WEBAUTHN_ORIGIN` égaux à l'adresse du tunnel.
5. Phase 2 (0370) : coffre verrouillé, l'accueil affiche « Coffre-fort verrouillé », la recherche ne propose aucun document ; dans la console du navigateur, `supabase.from('documents').select()` renvoie 0 ligne. Déverrouiller : les documents reviennent. Ouvrir une seconde session (autre navigateur) : elle reste verrouillée.
6. Télécharger un document : la requête passe par `/api/coffre/fichier/<id>` (URL signée 60 s) ; reverrouiller puis rejouer l'appel : 403 `vault_locked`.

## 8. Contenus administrables : guides, modèles PDF, blog (chantier E)

Back-office : `/admin/guides`, `/admin/modeles`, `/admin/blog` (ajouter, modifier, dupliquer, publier / dépublier, archiver, supprimer, aperçu, historique avec restauration). Pages publiques : `/blog`, `/blog/[slug]`.

### 8.1 Base de données

1. Appliquer `supabase/migrations/0300_admin_contenus.sql` (après `0250_guide` et `0270_security_hardening`, qui fournit `mfa_satisfied()`).
2. Charger les contenus de départ, au choix :
   - bouton **« Importer depuis le dépôt »** dans chaque écran admin (fiches et parcours publiés ; modèles et articles en brouillon, à relire) ;
   - ou `npx --yes tsx scripts/seed-contenus-sql.ts > supabase/seed_contenus.sql` puis exécuter ce fichier dans le SQL Editor.
   Les deux sont relançables : rien n'est écrasé (même slug = ignoré).
3. Tant que l'import n'est pas fait, le Guide côté parent reste vide (la base fait foi dès que Supabase est configuré). En cas d'erreur de lecture de la base, il se replie sur les fichiers `content/guide/`.

Vérification rapide :

```sql
select statut, count(*) from public.guide_fiches group by 1;
select id, public, file_size_limit from storage.buckets where id = 'blog-images';   -- public = true, 5 Mo
select entity_type, count(*) from public.content_versions group by 1;              -- historique alimenté par trigger
```

### 8.2 Sécurité

- Écriture réservée aux administrateurs (`is_admin()`) avec double authentification validée si elle est activée (politiques RESTRICTIVE) ; aucune `service_role` n'est utilisée par le back-office.
- Lecture publique des seuls éléments publiés ; un article publié avec une date future reste invisible jusqu'à cette date.
- Historique (`content_versions`) écrit uniquement par trigger, lisible par les administrateurs.
- Routes `/api/admin/contenus/**` : garde admin, contrôle de l'en-tête `Origin` sur toute écriture, corps limité à 512 Ko, validation zod, concurrence optimiste (409 si un autre administrateur a enregistré entre-temps).
- Markdown du blog rendu en éléments React (aucun HTML brut) ; liens et images filtrés (https, mailto, chemins internes).
- Images du blog : bucket public `blog-images` (5 Mo, JPEG/PNG/WebP, type vérifié sur les premiers octets).

### 8.3 Variables d'environnement

Aucune nouvelle variable. `NEXT_PUBLIC_SITE_URL` (ou à défaut `NEXT_PUBLIC_APP_URL`) sert aux URL canoniques, Open Graph, JSON-LD et au sitemap du blog.

### 8.4 Mode démonstration

Compte `admin` (cookie `lp_demo=admin`) : les contenus sont semés depuis le dépôt et conservés en mémoire du serveur jusqu'à son redémarrage. Les modifications sont visibles immédiatement dans `/app/guide` (une fois les pages branchées sur `loadGuide()`), dans les modèles (`/api/modeles`) et sur `/blog`. Le dépôt d'images est désactivé : indiquer un chemin du site (`/images/...`).

## 9. Liaison des parents et famille (chantier I)

Détail fonctionnel et sécurité : `docs/FAMILLE.md`.

1. Appliquer `supabase/migrations/0340_famille.sql` **après** 0330 (elle remplace `list_linked_parents()` avec la même signature) ; elle est ré-exécutable.
2. Exécuter les requêtes « CONTRÔLE CI » (§8 de la migration) : résultat attendu vide.
3. Sur une base de recette, dérouler les tests RLS commentés (§9) dans une transaction annulée.
4. Variables : aucune nouvelle. `NEXT_PUBLIC_APP_URL` doit être l'URL publique HTTPS (les liens d'invitation des e-mails en dépendent) ; `RESEND_API_KEY` / `MAIL_FROM` pour les e-mails (sinon l'interface invite à partager le lien) ; `SUPABASE_SERVICE_ROLE_KEY` pour les notifications « invitation acceptée » et « accès retiré » ; `APP_ENCRYPTION_KEY` pour lire la santé partagée et fusionner des fiches qui contiennent des données de santé.
5. Supabase Auth : la confirmation d'e-mail doit rester activée (une invitation ne s'accepte qu'avec un e-mail vérifié).
6. Comportement à annoncer aux utilisateurs : les événements de calendrier créés après la mise en service et rattachés à un enfant partagé sont visibles des adultes liés, sauf s'ils sont rendus privés (`/app/coparents/partage`) ; les événements plus anciens, les documents et les dépenses restent privés tant qu'ils ne sont pas partagés.

## 10. Messagerie : discussions par sujet, notes vocales, rangement au coffre-fort (chantier H)

1. Appliquer `supabase/migrations/0330_messagerie_plus.sql` **avant** 0340 (0340 remplace `list_linked_parents()` avec la même signature). Ré-exécutable, compatible avec 0230 et 0270 (`accept_coparent_invite` inchangée : la conversation qu'elle crée reçoit ses participants par trigger).
2. Exécuter les requêtes « CONTRÔLES » en fin de migration (résultat attendu : vide).
3. Variables : aucune nouvelle. `SUPABASE_SERVICE_ROLE_KEY` est **indispensable** au rangement automatique des pièces jointes dans le coffre-fort de chaque participant (action serveur `app/app/messages/actions.ts`). Sans elle, la messagerie fonctionne et les pièces restent en attente (`vault_imports.status = 'pending'`), puis sont rangées à la première ouverture de conversation une fois la clé configurée.
4. En-têtes HTTP (`next.config.mjs`, coordinateur) :
   - Permissions-Policy : autoriser le micro sur la messagerie, sinon l'enregistrement vocal est refusé par le navigateur :
     `{ source: '/app/messages/:path*', headers: [{ key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=(), payment=(self)' }] }` (après la règle générale `/(.*)`).
   - CSP : ajouter `media-src 'self' blob: https://*.supabase.co` (lecture des notes vocales : URL `blob:` avant envoi, URL signée Supabase ensuite).
5. Tâche planifiée facultative : les imports en échec sont retentés à chaque ouverture de la conversation (5 essais). Surveiller `select status, count(*) from vault_imports where status <> 'done' group by 1`.
6. Recette : envoyer un PDF, une photo et une note vocale ; vérifier qu'ils apparaissent dans le coffre-fort des deux parents (source « Messagerie », description avec conversation, date et expéditeur), qu'un second envoi du même fichier ne crée pas de doublon, et qu'un parent non lié ne peut pas être ajouté à une discussion.
