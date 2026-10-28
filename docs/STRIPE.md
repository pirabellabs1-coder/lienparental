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
| Changer de formule | `POST /api/stripe/change-plan` | Changement de niveau (Premium ou Coparentalité+) : immédiat sur le cycle en cours, différence au prorata ou crédit (rien de prélevé pendant un essai) ; changement de cycle (mensuel ou annuel) : toujours à la prochaine échéance. Les deux à la fois : niveau tout de suite, cycle à l'échéance |
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
   - les prix EUR, retrouvés par `lookup_key` : `lp_premium_monthly` 11,99 €, `lp_premium_yearly` 99 €,
     `lp_coparentalite_monthly` 19,99 €, `lp_coparentalite_yearly` 189 € (montants tirés de
     `components/profil/pricing.ts`). Comportement fiscal `inclusive` (TTC) si `STRIPE_TAX=on`, sinon `unspecified` ;
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

## Crédits d'analyses du Coach IA (paiement unique, 28/10/2026)

- **Packs** : `lib/billing/credit-packs.ts` (source unique : 10 = 2,99 €, 30 = 6,99 €, 100 = 19,99 € TTC, validité 12 mois).
  Aucun produit ni prix à créer dans Stripe : la route `POST /api/stripe/credits` construit `price_data` côté serveur
  (Checkout `mode: 'payment'`, carte uniquement, `metadata.kind = 'ai_credits'` + pack, prix et quantité figés).
- **Crédit** : webhook `checkout.session.completed` (déjà abonné) → session relue chez Stripe → `grant_ai_credits`
  (migration `0510`), idempotent par identifiant de session ; le retour `/app/coach/credits?achat=succes` crédite aussi
  (même fonction) sans attendre le webhook. Aucun effet sur l'abonnement.
- **Base** : appliquer `supabase/migrations/0510_ai_credits.sql` **avant** de déployer le code.
- **Remboursement total ou litige** : `charge.refunded` (remboursement complet) et `charge.dispute.created` remettent
  automatiquement `remaining = 0` sur le lot (`ai_credits.stripe_payment_intent`). **Ajouter ces deux événements à
  l'endpoint webhook** (relancer `scripts/stripe-setup.ts` ou les cocher dans le Dashboard). Remboursement partiel :
  journalisé, ajuster `remaining` à la main ; ne jamais supprimer un lot déjà consommé (refusé par la clé étrangère). Journal `[ai-credits] PAIEMENT NON CRÉDITÉ` = paiement encaissé sans crédit (créditer ou rembourser).
- **Rétractation** : case obligatoire avant paiement (horodatage `withdrawal_waiver_at`) ; tant qu'aucun crédit du pack
  n'est utilisé, rétractation possible 14 jours via l'assistance (CGU § 6).
