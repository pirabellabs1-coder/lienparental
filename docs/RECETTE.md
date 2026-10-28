# Lien Parental V1 — Rapport de recette

**Date** : 25 octobre 2026
**Verdict** : **GO AVEC CONDITIONS** (pré-production)

## Ce qui est livré

- **16 modules du cahier des charges** : M01 landing + guides d'install, M02 onboarding 10 étapes, M03 tableau de bord, M04 enfants, M05 journal + chronologie, M06 calendrier mois/semaine/rappels, M07 coffre-fort + ajout 4 étapes + catégories + partages + corbeille, M08 témoignages (parent) + espace témoin public `/t/[token]`, M09 Coach IA, M10→M13 profil / sécurité (2FA, sessions) / préférences / stockage, M14 Premium + Stripe + webhook, M15 centre d'aide, M16 écrans d'état et notifications.
- **PWA** : service worker (CACHE_V = `lp-v2`, pages privées jamais cachées), manifest + 7 icônes SVG, page offline, install prompt, robots + sitemap.
- **Design system** : palette (bleu nuit · vert · violet · or · rouge), fonts Fraunces + Inter, 18 composants UI accessibles (focus-visible, tap targets ≥44 px, aria-*).
- **Supabase** : 11 migrations, RLS verrouillée sur toutes les tables sensibles, 3 buckets storage privés, fonctions SECURITY DEFINER pour le flux témoin.
- **Stripe** : checkout authentifié + webhook signature-verified avec résolution `user_id` via metadata/client_reference_id.
- **PDF** : 5 modèles React-PDF (Dossier JAF, Lettre école, Chronologie, Attestation hébergement, Témoignage Cerfa) avec mentions pénales exactes (441-7, 434-13 CP).
- **Emails** : 6 templates Resend bulletproof (vérification, reset, nouvelle connexion, témoignage reçu, relance, facture) avec échappement HTML systématique.
- **Admin back-office** : comptes, contenus (FAQ/tutos/conseils/modèles), témoignages (sans jamais le contenu, par règle CDC §3.1), support, journaux, paramètres.
- **Contenus éditoriaux** : 20 FAQ + 6 tutoriels + 30 conseils du jour + à propos + charte d'usage.
- **Documentation** : DATA_MODEL, SECURITY, SECURITY_FIXES, PDF_TEMPLATES, EMAILS, README, RECETTE.

## Revue qualité réalisée

Deux audits indépendants exécutés :

- **Code review** : 1 CRITICAL + 3 HIGH + 4 MEDIUM → **tous corrigés**.
- **Security audit** : 3 BLOCKER + 6 HIGH + 5 MEDIUM → **11/14 corrigés**, 3 TODO assumés (rate-limit IP, upsert subscriptions, Sentry).

Détail dans [SECURITY_FIXES.md](./SECURITY_FIXES.md).

## Conditions à remplir avant la pré-production

1. `npm install` puis `npx tsc --noEmit` && `npm run lint` && `npm run build` → tout doit passer en vert (rien n'a tourné pendant la fabrication).
2. Appliquer les 11 migrations Supabase sur l'instance cible ; vérifier `select policyname from pg_policies where tablename in ('testimony_requests','testimonies')` → aucune policy anon résiduelle.
3. Promouvoir au moins un compte admin via `update public.users set plan='admin' where id='...'` et contrôler qu'un non-admin est redirigé depuis `/admin`.
4. Peupler les variables d'environnement : Supabase, Stripe, Anthropic, Resend, VAPID, `NEXT_PUBLIC_APP_URL`, `APP_ENCRYPTION_KEY`.
5. Générer les PNG d'icônes PWA : `npm i -D sharp` puis exécuter `scripts/gen-icons.mjs`.
6. Mettre en place un rate-limit IP sur le flux témoin public (middleware Next ou Edge Function Supabase) **avant** de diffuser un lien témoin réel.
7. Brancher l'upsert `subscriptions` via `service_role` dans le webhook Stripe avant toute vente en pré-prod.

## Points à surveiller en production

- DNS SPF / DKIM / DMARC sur `lienparental.fr` avant premier envoi Resend en volume.
- Sentry + `beforeSend` scrub rules (déjà commenté dans `lib/email/send.ts`).
- Enforcement quota IA réel (`compute_ai_cycle_window` + réponse 429 au-delà de 3/cycle gratuit, 10/cycle premium) et branchement effectif Anthropic.
- `npm audit --production` à relancer après `npm install`.
- Sauvegardes Supabase quotidiennes + test de restore.
- Rotation `APP_ENCRYPTION_KEY` et `SUPABASE_SERVICE_ROLE_KEY` (jamais loggées — déjà le cas).

## Points en attente de décision client (chap. 13 CDC)

- Prix Premium : 11,99 € / 99 € OU 19,99 € / 199,99 € ?
- Coach IA : décidé le 28/10/2026 — Gratuit 5, Premium 50, Coparentalité+ 100 analyses / 30 jours ; au-delà, crédits d’analyses achetables (10 / 30 / 100 analyses, valables 12 mois, migration 0510).
- Messagerie entre parents en V1 ?
- Validation manuelle des témoignages ou classement automatique ?
- 5 couleurs d'accent personnalisables dès la V1 ?
- Bouton Faire un don → Stripe / HelloAsso / autre ?
- Publication App Store / Google Play (Capacitor) après V1 ?
