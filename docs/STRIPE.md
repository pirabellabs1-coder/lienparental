# Stripe : mise en service des abonnements

Ce guide branche le paiement en ligne de Lien Parental. Commencez **toujours en mode test**, vérifiez le
parcours complet, puis seulement passez en mode live.

Tant que `STRIPE_SECRET_KEY` est absente, l'écran « Mon abonnement » affiche les formules avec la mention
« Paiement bientôt disponible » : aucun bouton n'est cliquable à vide. Dès que la clé et les prix sont en
place (et l'application redéployée), les boutons « S'abonner » ouvrent Stripe Checkout.

## 1. Le parcours côté parent

| Étape | Écran / route | Ce qui se passe |
|---|---|---|
| Entrée | `/app/abonnement` (profil, menu latéral, paywalls, tarifs de la page d'accueil) | Statut en tête, formules avec sélecteur Mensuel / Annuel, un bouton par formule |
| S'abonner | `POST /api/stripe/checkout` | Prix résolu côté serveur, redirection vers Stripe Checkout |
| Retour | `/app/abonnement/confirmation?session_id=cs_…` | Session vérifiée (appartenance au compte) et abonnement synchronisé tout de suite ; l'écran interroge `GET /api/stripe/status` toutes les 3 s pendant 60 s si besoin |
| Changer de formule | `POST /api/stripe/change-plan` | Cahier V6 : **montée** de niveau immédiate sur le cycle en cours, différence au prorata facturée et payée tout de suite (`always_invoice`, `error_if_incomplete` : rien n'est appliqué si le paiement échoue ; rien de prélevé pendant un essai) ; **descente** de niveau et changement de cycle : à la prochaine échéance (subscription schedule, `proration_behavior: 'none'`, aucun remboursement du cycle en cours). Montée + cycle : niveau tout de suite, cycle à l'échéance |
| Résilier / reprendre | `POST /api/stripe/cancel` | Résiliation en fin de période, réversible jusqu'à cette date |
| Moyen de paiement | `POST /api/stripe/portal` | Portail client Stripe (carte, factures, résiliation en fin de période ; les changements de formule restent dans l'application) ; au retour (`?info=portal`) l'abonnement est resynchronisé |
| Factures | `GET /api/stripe/invoices` | Liste avec liens Stripe (page et PDF) |

Anciennes URL (`/app/premium…`, `/app/profil/abonnement…`, liens des e-mails) : redirigées vers `/app/abonnement`.
Tarifs de la page d'accueil : `/abonner?formule=…&cycle=…` (connecté : présélection ; non connecté : création de
compte, puis retour automatique sur la formule choisie à la première arrivée dans l'espace).

### Comment le statut se met à jour

Un seul chemin d'écriture, `applySubscriptionSnapshot` (`lib/billing/sync-core.ts`), relit l'abonnement chez
Stripe et met à jour **ensemble** `public.subscriptions` et `public.users.plan` (qui alimente le plan effectif, les
quotas et l'accès famille) via la fonction SQL `public.billing_apply_subscription` (migration **0460**) :
verrou par utilisateur, version `synced_at` (une lecture Stripe plus ancienne n'écrase jamais une plus récente),
un abonnement terminé n'écrase jamais l'abonnement en cours. Un Price inconnu n'ouvre aucun droit. Un second
abonnement en cours pour le même compte (double paiement) est résilié et remboursé automatiquement, avec une
alerte dans les journaux (`ALERTE abonnement en double`). Ce chemin est idempotent et appelé par :

1. le **webhook** (`/api/stripe/webhook`, signature vérifiée, idempotence par identifiant d'événement dans `stripe_events`) ;
2. le **retour de Checkout** (page de confirmation et `GET /api/stripe/status?session_id=…`), sans attendre le webhook ;
3. les **actions** de l'écran (changement, résiliation, reprise) et le **retour du portail** : l'abonnement est
   toujours relu chez Stripe après la modification, jamais d'après l'objet renvoyé ;
4. la **tâche quotidienne** `GET /api/stripe/cron` (Vercel Cron, 5 h 15 UTC, `CRON_SECRET`) : resynchronise les
   abonnements en échec de paiement et applique le délai de grâce (`BILLING_GRACE_DAYS`) dans le temps.

Changement de formule : chaque clic envoie un identifiant unique (`request_id`), clé d'idempotence Stripe avec la
dernière facture ; un double clic est dédupliqué et un aller-retour Premium, Coparentalité+, Premium… est
toujours appliqué réellement. Avant Checkout, une session ouverte pour le même prix est réutilisée et les autres
sont expirées ; les sessions expirent après 30 minutes.

Après chaque changement, les composants serveur de `/app` sont revalidés et les autres onglets ouverts sont
prévenus (BroadcastChannel) : les fonctionnalités payantes se débloquent immédiatement.

Événements écoutés (liste unique dans `lib/billing/events.ts`) : `checkout.session.completed`,
`customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`,
`invoice.paid`, `invoice.payment_failed`, `charge.refunded`, `charge.dispute.created` (crédits IA).

## 2. Mode test

1. Dashboard Stripe, interrupteur **Mode test** activé. *Développeurs > Clés API* : copier la clé secrète
   `sk_test_…` (ou une clé restreinte `rk_test_…` avec écriture sur Products, Prices, Webhook Endpoints,
   Customer Portal, Checkout Sessions, Customers, Subscriptions, Invoices).
2. La placer dans Vercel (`STRIPE_SECRET_KEY`, environnements Preview et Production), puis la récupérer en local
   sans l'afficher : `npx vercel env pull .env.vercel.local`.
3. Lancer le script de configuration (il lit la clé dans l'environnement ou `.env.vercel.local`, ne l'affiche jamais) :

   ```bash
   npx --yes tsx scripts/stripe-setup.ts
   # options : --base-url=https://preview.example.vercel.app   --dry-run   --rotate-webhook
   ```

   Il crée ou met à jour, sans doublon (rejouable) :
   - les produits **Lien Parental Premium** et **Lien Parental Coparentalité+** (metadata `lp_product`) ;
   - les prix EUR (tarifs V6), retrouvés par `lookup_key` : `lp_premium_monthly` 14,99 €, `lp_premium_yearly` 149 €,
     `lp_coparentalite_monthly` 24,99 €, `lp_coparentalite_yearly` 249 € (montants tirés de
     `components/profil/pricing.ts`). Un prix existant à l'ancien montant est archivé et remplacé (un Price Stripe est
     immuable) ; les abonnés existants restent sur l'ancien prix jusqu'à leur migration depuis le Dashboard. Comportement fiscal `inclusive` (TTC) si `STRIPE_TAX=on`, sinon `unspecified` ;
   - l'endpoint webhook `https://lienparental.fr/api/stripe/webhook` abonné exactement aux six événements, avec la
     version d'API du code (`2025-02-24.acacia`, `STRIPE_API_VERSION` dans `lib/billing/events.ts`) ; un endpoint
     existant d'une autre version est recréé (nouveau secret affiché) ;
   - une configuration du portail client : carte, historique des factures, résiliation en fin de période, retour
     vers `/app/abonnement?info=portal`. Le changement de formule y est désactivé (il se fait dans l'application).

4. Le script affiche les variables **avec leurs valeurs** :

   ```
   STRIPE_PRICE_MONTHLY=price_…
   STRIPE_PRICE_YEARLY=price_…
   STRIPE_PRICE_COPARENTALITE_MONTHLY=price_…
   STRIPE_PRICE_COPARENTALITE_YEARLY=price_…
   STRIPE_PORTAL_CONFIGURATION=bpc_…
   STRIPE_WEBHOOK_SECRET=whsec_…   (affiché une seule fois, à la création de l'endpoint)
   ```

   Les saisir dans Vercel, vérifier que `NEXT_PUBLIC_APP_URL` vaut l'URL publique exacte et que `CRON_SECRET` est
   défini, appliquer la migration `supabase/migrations/0460_billing_sync_guard.sql` sur la base, puis **redéployer**.

   Réglages à faire dans le Dashboard (non scriptables) :
   - *Billing > Revenue recovery > Retries* : après le dernier échec, **« Annuler l'abonnement »** (le statut passe à
     `canceled`, l'application repasse le compte en Gratuit) ; laisser les relances intelligentes (environ 2 semaines),
     cohérent avec `BILLING_GRACE_DAYS=14` ;
   - *Settings > Checkout* : les **codes promo** sont acceptés (`allow_promotion_codes`) ; les créer dans
     *Products > Coupons* si besoin, sinon le champ reste sans effet.
   Le secret `whsec_…` n'est lisible qu'à la création : s'il est perdu, relancer avec `--rotate-webhook`.

5. Recette (carte `4242 4242 4242 4242`, date future, CVC quelconque) :
   - compte Gratuit : « S'abonner » sur Premium mensuel, paiement, retour sur la confirmation, statut « Actif » ;
   - « Passer à Coparentalité+ » : la fenêtre explique le prorata, le statut change aussitôt ;
   - « Résilier » puis « Reprendre l'abonnement » ;
   - « Gérer le moyen de paiement » (portail) puis retour ;
   - carte `4000 0000 0000 0341` (échec au renouvellement) avec une horloge de test : statut « Paiement en échec » ;
   - *Développeurs > Webhooks* : toutes les livraisons en 200.

   En local, le webhook passe par la CLI : `stripe listen --forward-to localhost:3000/api/stripe/webhook`
   (secret `whsec_…` propre à la session, à mettre dans `.env.local`).

## 3. Passage en live

1. Activer le compte Stripe (identité, IBAN), désactiver le mode test, créer la clé `sk_live_…` (ou `rk_live_…`).
2. Remplacer `STRIPE_SECRET_KEY` dans Vercel (Production uniquement), récupérer l'environnement, puis :

   ```bash
   npx --yes tsx scripts/stripe-setup.ts --live
   ```

   Sans `--live`, le script refuse toute clé live.
3. Saisir les nouvelles valeurs live affichées (prix, portail, secret webhook), redéployer.
4. Faire un vrai paiement de contrôle, puis le rembourser et résilier depuis le Dashboard.

## 4. Mode démonstration

Sans clés Supabase (comptes de démo), « S'abonner » simule l'abonnement (cookie `lp_demo_billing`, route
`POST /api/stripe/demo`) : le statut, le profil et le menu latéral changent, tout est étiqueté
« Mode démonstration » et aucun appel Stripe n'est fait.

## 5. Variables

| Variable | Obligatoire | Valeur |
|---|---|---|
| `STRIPE_SECRET_KEY` | oui | `sk_test_…` puis `sk_live_…` (ou `rk_…`) |
| `STRIPE_WEBHOOK_SECRET` | oui | `whsec_…` |
| `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY` | oui | `price_…` Premium |
| `STRIPE_PRICE_COPARENTALITE_MONTHLY`, `STRIPE_PRICE_COPARENTALITE_YEARLY` | pour vendre Coparentalité+ | `price_…` (sinon formule affichée « Bientôt disponible ») |
| `STRIPE_PORTAL_CONFIGURATION` | recommandé | `bpc_…` |
| `STRIPE_TAX` | non | `on` pour Stripe Tax (prix TTC) |
| `NEXT_PUBLIC_APP_URL` | oui | URL publique exacte (URL de retour Checkout, contrôle d'origine) |
| `BILLING_GRACE_DAYS` | non | jours d'avantages conservés après un échec de paiement (14) |
| `CRON_SECRET` | oui | secret de la tâche quotidienne `/api/stripe/cron` (déjà utilisé par les autres tâches planifiées) |

## Crédits IA (cahier V6, 29/10/2026)

### Règles

| Sujet | Règle |
|---|---|
| Crédits mensuels (solde A) | Gratuit 5, Premium 60, Coparentalité+ 200, selon la formule **propre** du compte. Période : `subscriptions.current_period_start` (formule payante ; annuel = une allocation à chaque mois du cycle, jamais douze d'un coup), sinon date d'inscription. Allocation paresseuse et idempotente (clé = période + quota). Aucun report : reliquat journalisé « expiration » à la période suivante. |
| Montée en gamme | Même période de facturation : solde A = nouveau quota − consommé sur la période (seule la différence positive est allouée, une fois). |
| Descente / résiliation | À l'échéance (Stripe). Ensuite, quota de la nouvelle formule ; plus aucune allocation payante après la fin de l'abonnement. |
| Crédits achetés (solde B) | Lots `ai_credits`, valables 24 mois, conservés au changement de formule et à la résiliation. Une recharge n'ouvre aucun droit Premium et ne change pas le stockage. |
| Coût par action | Question au Coach 1, analyse de situation (message, capture) 2, analyse de document (PDF, texte) 3. Courrier personnalisé (3) et dossier complet (5) : au catalogue, **inactifs** (fonctions inexistantes). |
| Débit | A d'abord, puis B (lot qui expire le plus tôt d'abord). Réservation atomique AVANT l'appel IA (`credits_reserve`, verrou `credits:<uid>` + `FOR UPDATE`), confirmation au succès (`credits_confirm`), restitution en cas d'échec / refus / interruption (`credits_release`) ou de délai dépassé (`credits_sweep`, tâche quotidienne, et à la prochaine action du compte). Jamais de solde négatif. |
| Idempotence | En-tête `Idempotency-Key` (16-80 caractères `[A-Za-z0-9_-]`) fourni par le client pour chaque action : la même clé ne débite jamais deux fois (409 `duplicate_request`). |
| Journal | `credit_ledger` immuable (UPDATE / DELETE / TRUNCATE refusés par trigger, sauf cascade de suppression du compte) : allocation, réservation, consommation, restitution, achat, révocation, expiration, ajustement admin (motif + `admin_id`). `ai_actions` : type, crédits, statut, version du tarif, modèle, tokens, coût fournisseur estimé en €. |
| Garde-fous | Taille et pages des PDF contrôlées **avant** réservation (413 `pdf_too_many_pages`), plafond de tokens de sortie et délai par action, limite de fréquence du chat (par minute et par jour), plafonds de dépense IA par jour (compte et global, 503 `ai_spend_cap` + `ai_spend_alerts`, sans contenu). |
| Non-mutualisation | Un parent invité (plan effectif Premium via Coparentalité+) garde SES crédits (formule propre) : il ne consomme jamais ceux du titulaire. |

### Configuration (sans déploiement)

`public.credit_config` (versionnée, ajout seul) : crédits mensuels, coûts et activation des actions, packs (prix,
quantité, actif), validité, plafonds, tarifs fournisseur (claude-opus-5-5 : 4 $ / 20 $ par million de tokens) et
conversion USD → EUR. Écran **Admin › Crédits IA** (`/admin/credits`) : publication d'une nouvelle version avec motif,
historique, tableau de bord (abonnés, MRR / ARR, recharges, crédits attribués / consommés / achetés / expirés, coût IA
moyen et P95 par action et par modèle, marge estimée, paiements échoués, alertes) et ajustement manuel d'un solde.
Les **prix d'abonnement ne sont pas configurables** ainsi : un Price Stripe est immuable ; les changer = modifier
`components/profil/pricing.ts`, relancer `scripts/stripe-setup.ts`, mettre à jour les variables `STRIPE_PRICE_*`,
déployer. Les pages publiques et la FAQ affichent les valeurs par défaut du code (les CGU et « Mes crédits » lisent la
configuration active).

### Recharges (paiement unique)

- **Packs** (version 1) : 10 = 2,49 €, 30 = 5,99 €, 75 = 11,99 €, 150 = 19,99 € TTC. Aucun produit ni prix à créer dans
  Stripe : `POST /api/stripe/credits` construit `price_data` côté serveur depuis la configuration active (prix, quantité
  et validité figés dans la session), Checkout `mode: 'payment'`, carte uniquement.
- **Crédit** : UNIQUEMENT après confirmation serveur — webhook `checkout.session.completed` (session relue chez
  Stripe) ou retour `/app/coach/credits?achat=succes` (session relue chez Stripe, même fonction `grant_ai_credits`,
  idempotente par session) ; jamais sur la seule redirection. Reçu Stripe et nouveau solde affichés.
- **API** : `GET /api/coach/credits` (soldes et coûts affichés avant une action), `POST /api/coach/analyze`,
  `POST /api/coach/chat` (402 `insufficient_credits` sans débit, saisie conservée à l'écran).
- **Base** : appliquer `supabase/migrations/0520_credits_v6.sql` **avant** de déployer le code.
- **Remboursement total ou litige** : `charge.refunded` (remboursement complet) et `charge.dispute.created` révoquent le
  solde restant du lot (`credits_revoke_payment`, journalisé) ; une réservation en cours sur ce lot n'y est jamais
  restituée. Remboursement partiel : journalisé, ajustement manuel motivé dans l'admin. Journal
  `[ai-credits] PAIEMENT NON CRÉDITÉ` = paiement encaissé sans crédit (créditer par ajustement ou rembourser).
- **Rétractation** : case obligatoire avant paiement (horodatage `withdrawal_waiver_at`) ; tant qu'aucun crédit du pack
  n'est utilisé, rétractation possible 14 jours via l'assistance (CGU § 6).
