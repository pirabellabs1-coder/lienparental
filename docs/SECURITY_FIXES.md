# Security fixes — Lien Parental

Correctifs appliqués au cours de l'audit du 2026-10-25. Un correctif par finding, dans l'ordre d'origine.

---

## BLOCKER 1 — RLS témoignages : fuite SELECT publique

**Fichiers**
- `supabase/migrations/0100_rls.sql` (header + bloc testimony_requests, ~l. 1-16 et l. 125-137)
- `supabase/migrations/0101_functions.sql` (ajout fonction en fin de fichier)

**Fix**
- Suppression définitive de la policy `testimony_requests_public_by_token` (anon pouvait faire `SELECT *`).
- Ajout de la fonction SECURITY DEFINER `public.get_testimony_request_by_token(text)` qui :
  - verrouille (`pg_try_advisory_xact_lock(hashtext(token))`) pour anti-collision locale,
  - retourne UNIQUEMENT `id, title (= temoin_nom_pref), parent_prenom, questions, status, expires_at`,
  - retourne 0 ligne si `revoked_at`, `expires_at < now()`, ou status hors `pending/opened/in_progress`,
  - `grant execute to anon, authenticated`.
- La table n'ayant pas de colonne `title`, on expose `temoin_nom_pref` (déjà prévu pour l'UI témoin) sous ce nom ; `message_parent` reste privé.

**TODO documenté dans la fonction**
- Rate-limit par IP (indispensable) : couche Next.js (/app/api/testimony/\*) + Supabase Edge Function, car Postgres n'a pas d'IP client via la clé anon.

---

## BLOCKER 2 — RLS témoignages : UPDATE publique non-restreint

**Fichiers**
- `supabase/migrations/0100_rls.sql` (bloc testimony_requests + testimonies, section REVOKE finale)
- `supabase/migrations/0101_functions.sql` (nouvelle fonction `record_testimony_submission`)

**Fix**
- Suppression des policies `testimony_requests_public_update_status` et `testimonies_insert_public`.
- Nouvelle fonction `public.record_testimony_submission(p_token text, p_testimony_payload jsonb)` :
  - revalide le token (mêmes garanties que BLOCKER 1),
  - `INSERT` dans `testimonies` (bypass RLS via SECURITY DEFINER mais avec jeu de colonnes verrouillé),
  - `UPDATE public.testimony_requests SET submitted_at=now(), updated_at=now()` — rien d'autre (schéma réel : la colonne demandée `last_submission_at` n'existe pas, on utilise `submitted_at`),
  - `grant execute to anon, authenticated`.
- `REVOKE ALL ON TABLE testimony_requests, testimonies FROM anon;` en bas de 0100.
- Commentaire d'avertissement ajouté en header du fichier RLS.

**Vérifié** : la table `testimonies` n'a plus aucune policy anon.

---

## BLOCKER 3 — Garde admin désactivée

**Fichiers**
- `app/admin/layout.tsx` (réécrit)
- `supabase/migrations/0102_admin.sql` (créé)

**Fix**
- `import 'server-only'` en tête.
- `createClient()` serveur → `supabase.auth.getUser()`. Pas de session → `redirect('/')`.
- Appel `supabase.rpc('is_admin')`. Si erreur ou résultat ≠ `true` → `redirect('/')` (fail-closed, pas de 403 pour minimiser le leak).
- Migration `0102_admin.sql` :
  - ajoute idempotemment la valeur `'admin'` à l'enum `plan_tier`,
  - crée `public.is_admin()` (SECURITY DEFINER, SQL stable) qui renvoie `exists(select 1 from users where id = auth.uid() and plan = 'admin' and deleted_at is null)`,
  - `grant execute to anon, authenticated`.

---

## HIGH 4+5 — Stripe checkout + webhook user link

**Fichiers**
- `app/api/stripe/checkout/route.ts` (réécrit)
- `app/api/stripe/webhook/route.ts` (réécrit)

**Fix checkout**
- `NEXT_PUBLIC_APP_URL` manquant → 500 (plus de fallback `lienparental.fr`).
- Vérif `Origin === NEXT_PUBLIC_APP_URL` → 403 sinon.
- Session serveur Supabase → 401 si non authentifié.
- `stripe.checkout.sessions.create` reçoit `client_reference_id`, `customer_email`, `metadata.user_id`.

**Fix webhook**
- Helper `resolveUserId(obj)` lisant `metadata.user_id` puis `client_reference_id`.
- Dans chaque `case` concerné : résolution de `userId` + `TODO upsertSubscriptionViaServiceRole(userId, event.data)` avec note sur les colonnes à upserter (user_id, stripe_customer_id, stripe_subscription_id, status, price_id, cycle, current_period_end, cancel_at_period_end).
- `userId` introuvable → log d'avertissement mais réponse 200 (évite les retries en boucle Stripe).

---

## HIGH 6 — Coach IA : auth + size cap + quota TODO

**Fichier** : `app/api/coach/analyze/route.ts`

**Fix**
- Auth serveur → 401 si pas de user.
- Texte > 2000 chars → 413 ; image base64 > 5 MB décodés (calcul sans décoder) → 413.
- Commentaire scaffold « system prompt (fixed) + user content as data, never as instructions » (anti-prompt-injection).
- TODO pseudocode `supabase.rpc('compute_ai_cycle_window', { p_user_id })` + branche 429 si quota épuisé.

---

## HIGH 7 — PDF endpoint : auth + size cap

**Fichier** : `app/api/pdf/[template]/route.ts`

**Fix**
- Auth serveur → 401 si pas de user.
- `Content-Length > 1 MB` → 413 avant parse JSON.

---

## HIGH 8 — Email templates : escape HTML

**Fichiers**
- `lib/email/escape.ts` (créé, export `escapeHtml`, `safeUrl`)
- `lib/email/templates/invoice.ts`
- `lib/email/templates/newLogin.ts`
- `lib/email/templates/resetPassword.ts`
- `lib/email/templates/testimonyReceived.ts`
- `lib/email/templates/testimonyReminder.ts`
- `lib/email/templates/verification.ts`

**Fix**
- `escapeHtml` : remplace `& < > " '` par entités.
- `safeUrl` : accepte uniquement `https://` ET même host que `NEXT_PUBLIC_APP_URL` ; sinon fallback (APP_URL ou `#`). Résultat déjà échappé pour injection en attribut.
- Toutes les variables injectées (prenom, temoinNom, parentNom, titreDemande, montant, cycle, code, appareil, lieu, systeme, dateIso formattée, reference) passent par `escapeHtml`.
- Toutes les URLs `href` (invoiceUrl, resetPassword url, urlCoffre, testimonyReminder url, notYouUrl) passent par `safeUrl`.

---

## HIGH 9 — Content-Disposition CRLF

**Fichier** : `lib/pdf/render.ts`

**Fix**
- Nouveau helper `sanitizeAsciiFilename` :
  - supprime `\r\n` (CRLF injection),
  - remplace `"` et `\` par `_` (break out of quoted-string),
  - remplace tout non-ASCII par `_`,
  - longueur capée à 150 (fallback `document.pdf`).
- Header final : `attachment; filename="<ascii safe>"; filename*=UTF-8''<encodeURIComponent(nom original)>`.

---

## MEDIUM 10 — CSP + Permissions-Policy

**Fichier** : `next.config.mjs`

**Fix**
- CSP minimale mais réelle appliquée globalement : `default-src 'self'; script-src 'self' 'unsafe-inline' https://js.stripe.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https://*.supabase.co https://api.stripe.com https://api.resend.com https://api.anthropic.com; frame-src https://js.stripe.com https://hooks.stripe.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://checkout.stripe.com; upgrade-insecure-requests`.
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(self)`.

**TODO documenté** : réactivation éventuelle de camera/mic par route via balise `<meta http-equiv="Permissions-Policy" ...>`.

---

## MEDIUM 14 — `server-only` dans `supabase/server.ts`

**Fichier** : `lib/supabase/server.ts`

**Fix**
- `import 'server-only'` en tout premier.
- `require('@supabase/supabase-js')` remplacé par un `import { createClient as createAdminClient } from '@supabase/supabase-js'` statique en tête.
- `createServiceClient()` : si `SUPABASE_SERVICE_ROLE_KEY` manquant → `console.warn` + `throw` (plus de retombée silencieuse sur anon). Idem si `NEXT_PUBLIC_SUPABASE_URL` manquant.

---

## MEDIUM 15 — Email logs : PII scrub

**Fichier** : `lib/email/send.ts`

**Fix**
- Helper `redactEmail` (ex: `martin.dupont@gmail.com` → `m***@gmail.com`, string arbitraire → `[redacted]`).
- Tous les `console.*` dans `sendEmail` ne logguent que `{ id, to: redactEmail(args.to) }`. Jamais de `subject`, jamais de `html`/`text`.
- TODO explicite : brancher Sentry avec `beforeSend` qui scrub `to/subject/body` des breadcrumbs.

---

## Fichiers touchés

- `supabase/migrations/0100_rls.sql`
- `supabase/migrations/0101_functions.sql`
- `supabase/migrations/0102_admin.sql` (nouveau)
- `app/admin/layout.tsx`
- `app/api/stripe/checkout/route.ts`
- `app/api/stripe/webhook/route.ts`
- `app/api/coach/analyze/route.ts`
- `app/api/pdf/[template]/route.ts`
- `lib/email/escape.ts` (nouveau)
- `lib/email/templates/invoice.ts`
- `lib/email/templates/newLogin.ts`
- `lib/email/templates/resetPassword.ts`
- `lib/email/templates/testimonyReceived.ts`
- `lib/email/templates/testimonyReminder.ts`
- `lib/email/templates/verification.ts`
- `lib/pdf/render.ts`
- `next.config.mjs`
- `lib/supabase/server.ts`
- `lib/email/send.ts`

## TODO restants (mis à jour le 26/10/2026)

Faits depuis l'audit :

- [x] Webhook Stripe branché sur Supabase : signature vérifiée, idempotence (`stripe_events`), synchronisation `subscriptions` / `billing_customers` en service_role (`app/api/stripe/webhook/route.ts`, `lib/billing/webhook.ts`, migration 0220).
- [x] Coach IA : appel Anthropic réel, quota par fenêtre glissante de 30 jours réservé avant l'appel et libéré en cas d'échec, enregistrement `ai_analyses` (`app/api/coach/analyze/route.ts`, `lib/ai/quota.ts`).
- [x] Limitation de débit du flux témoin et des liens de partage (`/api/temoin/*`, `/api/partages/*`, `lib/data/server/rate-limit.ts`) ; compteur partagé entre instances en base (migration `0390_rate_limit.sql`).

Reste à faire :

- [ ] Sentry (ou équivalent) : journalisation structurée + `beforeSend` qui retire destinataire, sujet et corps des e-mails, contenus du Coach et charges utiles Stripe des événements et breadcrumbs (`lib/email/send.ts`, webhook Stripe, `/api/coach/*`). Les `TODO: Sentry.captureException` de `lib/email/send.ts` en sont le point d'entrée.

---

## Vague v3 — audit de sécurité (migration `0360_security_v3.sql`)

Migration additive, ré-exécutable, rollback commenté en fin de fichier. Aucune migration antérieure modifiée.

| Point | Correctif | Où |
|---|---|---|
| M1 | Un `proche` ne voit jamais un événement `sante` (ligne entière masquée) : `calendar_select_family` recréée avec `family_row_visible(..., type = 'sante')`. `family_shared` forcé à `false` à l'INSERT pour `sante` et `rendez_vous` (trigger `trg_calendar_events_private_by_default`) ; partage ensuite explicite (UPDATE, `/app/coparents/partage`). | 0360 §2 |
| M2 | Seul le titulaire invite au rôle `parent` (42501 `owner_only`) ; même règle pour la promotion proche → parent et à l'acceptation (invitations héritées d'un non-titulaire : rien accordé, et annulées si l'invitant n'est titulaire d'aucun enfant). Le titulaire reçoit un e-mail de sécurité à chaque nouvel adulte lié. Choix documenté dans `docs/FAMILLE.md` §3. | 0360 §3, §4.5 ; `lib/coparents/server/email.ts` (`notifyOwnersNewAdult`), `app/api/coparents/invitations/accept/route.ts` |
| M3 | `conversation_participants.left_at` posé par trigger quand un adulte n'a plus aucun lien (enfant partagé titulaire/parent ou `coparent_link` accepté) avec les autres participants : révocation, rétrogradation en proche, suppression de fiche, rupture de lien V1, plus reprise de l'existant. Envoi, dépôt de fichier, `mark_read` et lecture des messages postérieurs au départ refusés ; historique antérieur (et ses pièces jointes) consultable. Import coffre ignoré pour les partis. Une conversation avec un parti n'est jamais réutilisée (nouveau lien = nouvelle conversation). | 0360 §4 |
| M5 | `attachment_path` validé (`^<conversationId>/<uuid>\.[a-z0-9]{1,5}$`) avant tout `download` service_role ; contrainte `chk_messages_attachment_path` (NOT VALID, VALIDATE commenté). | `lib/vault/from-source.ts`, `app/app/messages/actions.ts`, 0360 §5 |
| M6 | `/api/coparents/contacts` ne signe que `photo_url` commençant par `<user_id>/` ; contrainte `chk_users_photo_url_owner` (NOT VALID). | route + 0360 §5 |
| M7 | Admin = `is_admin()` **et** session `aal2`. TS : `getCurrentUser().isAdmin`, `requireAdmin` (contenus et stats), layout admin et middleware ; admin sans facteur redirigé vers `/app/profil/securite/2fa?raison=admin`. SQL : `is_admin_aal2()` dans `admin_stats_assert` et toutes les clauses admin de 0290 / 0300 / 0310 / 0330 / 0340. Mode démo inchangé. | `lib/auth/session.ts`, `middleware.ts`, `app/admin/layout.tsx`, `lib/admin/stats/guard.ts`, `lib/contenus/api.ts`, 0360 §1 |
| m1 (Google) | `readEvent` filtre `user_id = userId` : un événement partagé par un autre parent n'est jamais recopié dans l'agenda Google. | `lib/integrations/google/sync.ts`, commentaire de `sync/route.ts` |
| m2 | `merge_child_into` supprimée ; `merge_child_into_as(p_actor_id, …)` réservée au service_role, appelée par `POST /api/coparents/merge` après contrôle de session. Ne déplace que les lignes de l'acteur (santé, Journal, calendrier, coffre, frais, demandes de témoignage, préférences) ; infos médicales de la fiche conservée écrites seulement si l'acteur en est titulaire. | 0360 §7, route merge |
| m3 | Essai de code réservé atomiquement **avant** scrypt (`vault_reserve_attempt`, verrou de ligne) : N requêtes parallèles ne dépassent pas 5 essais. | 0360 §9, `lib/vault-lock/verify.ts`, `store.ts` |
| m4 | `vault_unlocked()` fermé par défaut : sans ligne de réglages, verrou actif. Phase 2 toujours commentée (0290). | 0360 §10 |
| m5 | Compte sans mot de passe (Google) : définir / changer le code exige le code actuel, **ou** une ré-authentification de moins de 5 min (`amr` de la session ET `last_sign_in_at`), **ou** une empreinte vérifiée sur ce compte il y a moins de 5 min (`vault_passkeys.last_used_at`). Le « premier code sans preuve » est supprimé (réponse 403 `reauth_required`). | `app/api/vault-lock/pin/route.ts`, `lib/vault-lock/context.ts` |
| m6 | `sameOrigin` (même helper que `/api/admin`) sur toutes les routes `/api/coparents/*` POST / PATCH / DELETE (`familyContext(req)`). | `lib/coparents/server/context.ts` + routes |
| m7 | Défi WebAuthn stocké en base (`vault_webauthn_challenges`, 2 min) et consommé une seule fois (`DELETE … RETURNING`) ; le cookie ne porte plus que l'identifiant. Mémoire en démo. | 0360 §11, `lib/vault-lock/webauthn.ts`, `store.ts` |
| Nits | Politique Storage famille et `list_family_expenses` (nouvelle colonne `justificatifs_extra_paths`) couvrent `justificatifs_extra` (0350). `search_path = ''` sur toutes les SECURITY DEFINER 0330/0340 (recréées ou `alter function`). `get_my_conversation` (0230) : participants actifs seulement, `anon` révoqué. Quota d'import automatique vers le coffre : 100 Mo par destinataire, par expéditeur et par 24 h (54000 `vault_import_quota`, pas de nouvel essai automatique). | 0360 §6, §8, §12 |

**Tests exécutés** (PostgreSQL PGlite + stubs Supabase, scratchpad `pgtest/`) : migrations 0001 → 0360 + `storage.sql`, ré-exécution de 0360 (idempotence), 70 assertions du chantier I adaptées (fusion via `merge_child_into_as`) et 82 assertions 0360 (M1, M2, M3, M5, M6, M7, m2, m3, m4, m7, nits, absence de `search_path` non vide et d'exécution `anon`). `npx tsc --noEmit` sans erreur.

**À vérifier sur Supabase réel** : voir la liste « Reste à vérifier » du livrable (validation des contraintes NOT VALID, enrôlement 2FA des admins avant déploiement, Realtime avec la nouvelle politique `messages_select_participants`, `last_sign_in_at` après une connexion Google, défis WebAuthn sur un vrai appareil).

## Phase 2 du verrou du coffre-fort (migration `0370_vault_lock_phase2.sql`)

Demande client : le coffre est un endroit sécurisé, on y accède avec un code ou la biométrie. Jusqu'ici le verrou protégeait les écrans et les routes serveur (cookie signé), mais le navigateur pouvait encore lire `documents` / `testimonies` directement via la RLS. 0370 ferme cette porte en base.

| Point | Correctif | Où |
|---|---|---|
| Verrou en base | Politiques RESTRICTIVE `vault_unlocked` (`(select public.vault_unlocked())`, initPlan) sur `documents`, `testimony_requests`, `testimonies`, `testimony_reviews`, `shares`, `lawyer_shares`, `lawyer_share_access_log`. Prédicat de 0360 §10 : verrou désactivé explicitement, ou ligne `vault_unlocks` non expirée pour le `session_id` du JWT. Les jetons de partage sont inclus : lisibles coffre verrouillé, ils permettraient de contourner le verrou par le lien public. | 0370 §2 |
| Storage | Politique RESTRICTIVE « documents vault unlocked » : un objet du bucket `documents` qui est le fichier d'un document du coffre (`vault_is_document_object`, SECURITY DEFINER, `search_path = ''`, pour ne pas dépendre de la RLS de `documents`) n'est ni lisible, ni signable, ni modifiable coffre verrouillé. Pièces du Journal et justificatifs (même bucket) non concernés. | 0370 §3 |
| Lecteur famille | Un gardien qui lit un document partagé est soumis à la même règle : son propre coffre doit être déverrouillé (politique évaluée pour l'appelant). | 0370 §2 |
| Révocation | Trigger : changement d'époque (code changé, empreinte retirée) ou réactivation du verrou → `vault_unlocks` de l'utilisateur supprimées (miroir de l'invalidation des cookies). Purge planifiable `vault_purge_expired_unlocks()` (service_role). | 0370 §1, §4 |
| Déverrouillage fiable | `issueUnlock` écrit la ligne `vault_unlocks` **avant** de poser le cookie ; `recordUnlock` échoue (au lieu d'un simple avertissement) si l'écriture est impossible ou si le JWT n'a pas de `session_id`. | `lib/vault-lock/session.ts`, `lib/vault-lock/store.ts` |
| URL signées | Le navigateur ne signe plus d'URL : `GET /api/coffre/fichier/[id]?mode=telecharger` (ou `apercu`, option `&format=json`) (session revalidée, `requireVaultUnlocked`, document lu par le client RLS, propriétaire ou document partagé, chemin rangé sous le dossier du propriétaire, URL signée 60 s avec le client de l'utilisateur, `Referrer-Policy: no-referrer`, limitation 60/min). Aperçu inline seulement pour PDF et images. | `app/api/coffre/fichier/[id]/route.ts`, `lib/data/vault.ts` |
| Écrans hors coffre | Accueil (« Mes documents récents »), recherche globale, espace Santé de l'enfant, « Ce que je partage » : coffre verrouillé (ou état inconnu), carte « Coffre-fort verrouillé » + bouton Déverrouiller ; aucun document ni témoignage indexé dans la recherche. | `components/vault-lock/useVaultLockState.ts`, `VaultLockedNotice.tsx` et écrans |
| Coach IA | `requireVaultUnlocked()` : coffre verrouillé, ni documents ni témoignages, et une phrase l'indique au modèle. Audit m1 : `.eq('user_id', userId)` sur le calendrier, les documents et les témoignages lus pour le Coach (rien de ce que l'autre parent a partagé n'est envoyé à l'IA). | `lib/ai/context.ts` |
| Document partagé | Page détail en lecture seule (badge « Partagé par … », ni renommer, déplacer, partager ni supprimer ; page de suppression refusée). `soft_delete_document` : définie uniquement en 0101, SECURITY INVOKER avec `user_id = auth.uid()` : aucune correction nécessaire (vérifié par test). | `app/app/coffre/documents/[id]/**` |
| Famille | Rôle « parent » masqué pour un non-titulaire (invitation et changement de rôle) avec explication ; proches : aucune donnée de santé, 403 `health_not_shared` explicite sur les routes santé. | `components/coparents/**`, `app/app/coparents/page.tsx`, routes santé, `docs/FAMILLE.md` |

**Tests exécutés** (PGlite + stubs Supabase, scratchpad `pgtest/run370.mjs`) : migrations 0001 → 0370 + `storage.sql`, ré-exécution de 0360 et 0370 (idempotence) ; 70 assertions famille (comptes créés avec le verrou désactivé, ce scénario ne teste pas le verrou) ; 82 assertions 0360 ; **49 assertions 0370** : verrouillé → 0 document / témoignage / décision / jeton de partage, fichiers du coffre invisibles mais pièce du Journal lisible et envoyable, ajout / renommage / corbeille / création de demande refusés ; déverrouillé → documents, témoignages, partages, fichiers ; autre session du même compte, JWT sans `session_id`, déverrouillage expiré → rien ; gardien verrouillé → rien, gardien déverrouillé → seulement le document partagé et son fichier, ni corbeille ni renommage du document de l'autre ; tiers déverrouillé → rien ; verrou désactivé → accès ; réactivation et changement d'époque → déverrouillages révoqués ; écriture de `vault_unlocks` interdite à `authenticated` ; service_role et parcours témoin non affectés ; structure des politiques ; `soft_delete_document` filtre le propriétaire. `npx tsc --noEmit` sans erreur.

**À vérifier sur Supabase réel** : présence du claim `session_id` dans les JWT (GoTrue récent) et dans le client navigateur ; politique Storage sur `createSignedUrl` / `download` de l'API Storage ; Realtime éventuel sur `documents` ; latence de `vault_is_document_object` sur un gros bucket (index unique `documents.storage_path`).
