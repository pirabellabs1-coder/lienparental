# Famille : liaison des parents et adultes liés (chantier I)

Migration : `supabase/migrations/0340_famille.sql`. Code : `lib/coparents/**`, `app/api/coparents/**`, `components/coparents/**`, `app/app/coparents/**`, `app/(public)/onboarding/coparent/`.

## 1. Modèle « foyer de l'enfant »

Chaque fiche enfant garde son **titulaire** (`children.user_id`, rôle implicite `owner`). D'autres adultes y sont liés par `child_guardians` :

| Rôle | Fiche | Santé | Calendrier | Documents partagés | Dépenses partagées | Gérer les accès |
|---|---|---|---|---|---|---|
| `owner` (titulaire) | lecture / écriture | oui | oui | oui | oui | tous les liens de l'enfant |
| `parent` | lecture + mise à jour (hors titulaire, suppression, infos médicales chiffrées, photo) | lecture + ajout de ses propres entrées | lecture | lecture + téléchargement | lecture | inviter des **proches** ; changer le rôle (vers proche uniquement) / retirer les adultes **qu'il a invités** |
| `proche` | prénom, classe, date de naissance via `list_family_children()` uniquement | **aucune** donnée de santé (ni vaccinations, ni traitements, ni allergies, ni fiche médicale) | lecture, **hors événements `sante`** | non | non | non |

Tout adulte lié peut **se retirer** lui-même. Le titulaire ne peut pas être retiré (il supprimerait la fiche).

**Santé et proches (décision v3, la plus protectrice)** : un proche n'a accès à **aucune** donnée de santé. Il n'existe pas aujourd'hui d'accès « allergies et contacts d'urgence » réservé aux proches ; aucun n'est créé. La base l'impose déjà (`children_select_family`, `child_vaccinations_select_family`, `child_treatments_select_family` exigent le rôle titulaire ou parent ; événements `sante` masqués, 0360 M1). Les routes santé (`/api/enfants/[id]/medical`, `/api/enfants/[id]/sante`, `/api/coparents/enfants/[id]/sante`) répondent à un proche **403 `health_not_shared`** avec un message explicite (« réservées à ses parents ») au lieu d'un 404 ; un tiers non lié reçoit toujours 404 (rien n'est révélé : `list_family_children()` ne liste que les enfants dont l'appelant est membre actif).

**Interface (0360 M2)** : dans « Inviter un adulte » et dans le choix du rôle d'un adulte lié, l'option « Parent » n'est proposée que pour les fiches dont je suis **titulaire** ; sinon une phrase explique que seul le titulaire peut nommer un autre parent (un gardien parent garde « Proche » et peut rétrograder en proche un parent qu'il a lui-même invité).

Tables :
- `child_guardians(child_id, user_id, role, status active|revoked, invited_by, invitation_id, revoked_at, revoked_by, revoke_reason)` : historique conservé, un seul lien actif par (enfant, adulte) (index unique partiel).
- `family_invitations` + `family_invitation_children` : une invitation = un e-mail, un rôle, 1 à 20 enfants.
- `child_merges` (journal des fusions), `child_merge_dismissals` (« ce n'est pas le même enfant »).
- Colonnes `family_shared` sur `calendar_events`, `documents`, `journal_expenses`.

## 2. Partagé / privé

**Partagé** (gardiens actifs, selon le rôle) : fiche enfant, santé (vaccinations, traitements, infos médicales ; parents uniquement), événements du calendrier liés à l'enfant (`family_shared`), documents du coffre **explicitement** partagés, dépenses **explicitement** partagées.

**Documents partagés et verrou du coffre (0370)** : le lecteur (gardien `parent`) doit avoir déverrouillé **son propre** coffre pour voir et télécharger un document partagé (même politique RESTRICTIVE `vault_unlocked` pour tous). La page du document partagé est en **lecture seule** : badge « Partagé par … », ni renommer, ni déplacer, ni partager, ni supprimer (`soft_delete_document`, 0101, filtre déjà `user_id = auth.uid()`). Le fichier est servi par `GET /api/coffre/fichier/[id]` (URL signée 60 s, client RLS du lecteur). Coffre verrouillé, « Ce que je partage » n'affiche pas la liste des documents. Le Coach IA ne reçoit **jamais** les documents ni les événements partagés par l'autre parent (filtre `user_id`).

**Toujours privé** : Journal (`journal_entries`), Coach IA (`ai_analyses`), témoignages, documents et dépenses non partagés. Aucune politique n'est ajoutée sur ces tables ; la requête de contrôle CI de 0340 §8 le vérifie.

Choix par défaut :
- Calendrier : les événements **antérieurs à 0340 restent privés** (`false` posé à l'ajout de la colonne) ; les **nouveaux** événements sont partagés par défaut (`true`), **sauf `sante` et `rendez_vous`**, toujours créés privés (trigger 0360, M1) et partageables ensuite depuis `/app/coparents/partage`. Le titulaire rend privés les autres depuis la même page (et, après coordination, depuis le formulaire du calendrier).
- Un événement `sante`, même partagé, n'est **jamais** visible d'un proche (ni titre, ni description, ni lieu) : seuls les titulaires / parents d'un enfant commun le voient (0360, M1).
- Documents et dépenses : privés par défaut, partage élément par élément.
- Une dépense partagée expose montant, catégorie, mode de paiement, bénéficiaire, justificatif, **titre et date** de l'entrée ; jamais sa description ni ses médias (`list_family_expenses()`, et `journal_entries` reste fermé).

Visibilité d'une ligne écrite par un autre adulte (`family_row_visible`) : il faut un enfant commun dont je suis membre (parent si exigé) **et** dont l'auteur est encore titulaire ou parent actif. Un adulte retiré cesse immédiatement de voir… et d'être vu.

## 3. Invitations

- Invitation **nominative** : e-mail obligatoire, y compris quand le lien est envoyé par WhatsApp ou SMS. Seul un compte dont l'e-mail du JWT est **vérifié** et identique peut l'accepter (même règle que `accept_coparent_invite`, 0270 §M4). Toute autre situation renvoie la même erreur (P0002).
- Jeton : 2 × UUIDv4 (244 bits) généré par la base, renvoyé **une seule fois** ; seul `sha256(jeton)` est stocké (`token_hash`, illisible côté client). « Renvoyer » fait tourner le jeton (l'ancien lien meurt) et repousse l'expiration.
- Expiration 7 jours ; 1 renvoi par minute, 10 au total ; 20 invitations par 24 h et par invitant ; une seule invitation en attente par (invitant, e-mail) (409).
- Lien : `/app/coparents/invitation/<jeton>` (route protégée : retour automatique après connexion via `?suite=`). Page en `referrer: no-referrer` et `noindex`. L'aperçu passe le jeton dans le corps d'un POST.
- **Synchronisation de deux comptes existants** : la même invitation apparaît dans « Demandes reçues » de l'invité (e-mail vérifié), sans lien.
- Acceptation d'une invitation `parent` : crée aussi la conversation de messagerie entre les deux parents si elle n'existe pas, ou si l'ancienne a un participant parti (compatibilité 0230/0330, voir §7).
- **Qui peut faire entrer un `parent` (0360, M2)** : uniquement le **titulaire** de la fiche. Choix retenu, le plus simple : une invitation `parent` envoyée par un gardien `parent` est **refusée** (403 `owner_only`, message invitant à demander au titulaire), sans file d'attente de validation. Le gardien peut toujours inviter des **proches**. Même règle pour promouvoir un proche en parent (`set_child_guardian_role`) et, par sécurité, à l'acceptation (`_family_accept` n'accorde le rôle `parent` que sur les enfants dont l'invitant est titulaire ; les invitations héritées qui ne donneraient plus rien ont été annulées par 0360).
- **Alerte au titulaire** : à chaque acceptation, le titulaire de chaque fiche concernée reçoit un e-mail « Un nouvel adulte a accès à la fiche de votre enfant » (sauf s'il est lui-même l'invitant, qui reçoit déjà « invitation acceptée »). Notification de sécurité : envoyée même si `notif_email` est désactivé (nécessite `SUPABASE_SERVICE_ROLE_KEY` et `RESEND_API_KEY`).

## 4. Fusion des fiches en double

Après acceptation, `list_merge_candidates()` propose les paires (ma fiche, fiche partagée avec moi) de **même date de naissance** et de **prénom normalisé** identique (casse, accents, tirets). La fusion est **toujours confirmée manuellement** (case « Je confirme qu'il s'agit du même enfant »).

Sens : **ma** fiche rejoint la fiche partagée (je ne peux pas déplacer les données d'un autre titulaire).

`POST /api/coparents/merge` puis `merge_child_into_as()` (une transaction). Depuis 0360 (m2), la RPC n'est **pas** exécutable par `authenticated` : la route l'appelle en service_role après contrôle de session, avec l'identifiant issu de la session, et la fonction ne modifie **que les lignes de l'appelant** :
1. Santé : chiffrement AES-256-GCM avec l'id de l'enfant dans l'AAD ; la route déchiffre et re-chiffre chaque entrée pour la fiche conservée (clé de l'auteur inchangée). La base exige que **toutes** mes entrées soient fournies, sinon rien n'est fait (`merge_incomplete`).
2. Références `children_ids` (Journal, calendrier, coffre, frais, demandes de témoignage) et `preferences.active_child_id` de **mes** lignes : l'id de ma fiche est remplacé. Les lignes d'autres adultes ne sont jamais touchées. Le Journal reste privé.
3. Fiche conservée : seuls les champs **vides** sont complétés ; infos médicales reprises seulement si elle n'en a pas **et** que j'en suis titulaire (un gardien ne peut pas les écrire, même règle que `children_guard_family_update`).
4. Les adultes invités sur ma fiche en double sont retirés (`merged`), jamais transférés sans accord du titulaire. Ma fiche est archivée (`deleted_at`), trace dans `child_merges`.

## 5. Sécurité

- Politiques **permissives additionnelles** (aucune politique existante modifiée) ; les politiques **restrictives `mfa_required`** (0270) s'appliquent en ET, y compris aux nouvelles tables.
- Les fonctions `SECURITY DEFINER` contournent la RLS : chacune appelle `_family_assert_caller()` (session + `mfa_satisfied()`), `search_path` fixé, `revoke` à `public`/`anon`.
- Trigger `children_guard_family_update` : un gardien ne peut changer ni titulaire, ni suppression, ni infos médicales chiffrées, ni photo.
- Storage : politique « documents family select » ; la sous-requête s'exécute sous la RLS de l'appelant, donc seuls les fichiers partagés et visibles correspondent.
- Performance : les politiques utilisent `(select my_family_*_ids())::uuid[]` (évalué une fois par requête) avant toute fonction par ligne ; index partiels dédiés.

## 6. API (`/api/coparents`, session + MFA, zod, limitation de débit)

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/api/coparents` | membres par enfant, invitations envoyées / reçues, fiches en double |
| POST | `/api/coparents/invitations` | créer `{ email, role, childIds }` → 201 avec jeton + statut e-mail |
| POST | `/api/coparents/invitations/[id]/resend` | nouveau lien |
| DELETE | `/api/coparents/invitations/[id]` | annuler |
| POST | `/api/coparents/invitations/[id]/decline` | refuser une demande reçue |
| POST | `/api/coparents/invitations/preview` | `{ token }` → état de l'invitation |
| POST | `/api/coparents/invitations/accept` | `{ token }` ou `{ id }` |
| PATCH / DELETE | `/api/coparents/guardians/[id]` | changer le rôle / retirer ou quitter |
| POST | `/api/coparents/merge`, `/merge/dismiss` | fusion guidée / écarter une suggestion |
| GET / PATCH | `/api/coparents/sharing` | mes documents, dépenses, événements par enfant ; bascule `family_shared` |
| GET | `/api/coparents/contacts` | `listLinkedParents()` (messagerie) |
| GET | `/api/coparents/enfants/[id]/sante` | santé partagée déchiffrée (lecture seule) |

Erreurs : enveloppe `{ error: { code, message, correlation_id } }` ; codes SQL (42501, P0002, 22023, 23505, 54000) et `hint` stables (dont `owner_only`) traduits dans `lib/coparents/server/context.ts`. Toutes les routes POST / PATCH / DELETE exigent un en-tête `Origin` de même origine (403 `bad_origin`, 0360 m6).

## 7. Messagerie (contrat chantier H)

- TS : `listLinkedParents(): Promise<{ userId; prenom; nom?; role; avatarUrl? }[]>` (`lib/coparents`). Renvoie les adultes **joignables** : parents d'un enfant commun (si je suis moi-même titulaire ou parent) et co-parent lié par la messagerie V1. `role` : `parent` ou `coparent`.
- SQL : 0340 remplace `list_linked_parents()` (même signature que 0330, comme prévu par le contrat) pour y ajouter les liens familiaux ; `create_conversation` (0330) en bénéficie sans changement. Les proches ne sont pas joignables (V1).
- **Fin de lien (0360, M3)** : quand un adulte n'a plus aucun enfant partagé (titulaire / parent actif) ni `coparent_link` accepté avec les autres participants d'une conversation, sa participation reçoit `left_at` (triggers sur `child_guardians`, `children.deleted_at`, `coparent_links`). Il garde la lecture des messages **antérieurs** (preuve), mais ne peut plus écrire, déposer de fichier, marquer comme lu ni lire les messages postérieurs ; ses pièces jointes ne sont plus copiées dans son coffre. Une nouvelle liaison ouvre une **nouvelle** conversation. Côté interface (chantier H) : `list_my_conversations` ne renvoie pas l'état « parti » (signature inchangée) ; l'envoi échoue proprement par la RLS.

## 8. E-mails

`lib/coparents/server/email.ts` (gabarit `lib/email/layout`, envoi `lib/email/send`) : invitation, invitation acceptée (à l'invitant), accès retiré (à la personne retirée), nouvel adulte lié (au titulaire, 0360). Sans `RESEND_API_KEY` : aucun envoi, une ligne de journal expurgée ; l'interface affiche alors « partagez le lien ». Les notifications « acceptée / retiré » nécessitent `SUPABASE_SERVICE_ROLE_KEY` et respectent `preferences.notif_email`. Liens construits depuis `NEXT_PUBLIC_APP_URL` (jamais l'en-tête Host).

## 9. Mode démonstration

`lib/coparents/demo.ts` (sessionStorage) : Thomas Martin déjà lié (parent) à Lina et Noah ; invitation en attente pour rose.martin@exemple.fr (proche, Lina). Aperçus : `/app/coparents?apercu=demande` (demande reçue de Sandra), `/app/coparents?apercu=fusion` (fiche Lina en double).

## 10. Tests

- Scénarios SQL commentés : 0340 §9 (gardien voit l'enfant partagé et l'événement partagé, jamais le Journal ; tiers refusé ; révocation).
- Exécutés sur PostgreSQL (PGlite) avec des stubs Supabase (auth, storage, rôles) : toutes les migrations 0001 à 0350 + `storage.sql`, ré-exécution de 0340 (idempotence), puis 70 assertions (invitation, e-mail non vérifié, jeton à usage unique, RLS parent / proche / tiers, Journal privé, Storage, MFA aal1/aal2, fusion, révocation, renvoi / annulation).

- 0360 : 70 assertions ci-dessus rejouées après 0360 (fusion via `merge_child_into_as` en service_role) + 82 assertions dédiées (voir `docs/SECURITY_FIXES.md`, § v3).

## 11. Rollback

Bloc commenté en fin de 0340 ; pour `list_linked_parents`, ré-appliquer la définition de 0330.

## 12. Accès partagé Coparentalité+ (plan effectif, 0380)

Formule **Coparentalité+** (19,99 €/mois) : un adulte lié à un abonné Coparentalité+ profite des avantages **Premium** sans abonnement de son côté.

**Règle** (`public.effective_plan_details(user)` / `public.effective_plan(user)`, miroir TS `resolveEffectivePlan`, `lib/billing/plans.ts`) :

1. Plan propre = `users.plan` (`free` | `premium` | `coparentalite`), tenu à jour par le webhook Stripe (`admin` compte comme `free`).
2. Si le plan propre est `free` **et** qu'il existe un enfant (fiche non supprimée) dont je suis **titulaire ou gardien `parent` actif**, et dont un **autre** titulaire ou gardien `parent` actif (compte non supprimé) est en `coparentalite`, alors mon plan effectif est **`premium`** (`via = 'famille'`).
3. Sinon, plan effectif = plan propre (`via = 'abonnement'`, ou `NULL` en gratuit).

Choix retenus (les plus simples, à valider) :
- **Symétrique** : peu importe qui paie (titulaire ou parent invité), l'autre parent en profite. La demande initiale ne citait que le cas « titulaire abonné » ; la version symétrique en est un sur-ensemble. Pour la restreindre, ne garder dans `effective_plan_details` que `c.user_id` comme payeur possible.
- **Les proches** n'apportent ni ne reçoivent rien.
- **Pas de cascade** : le bénéficiaire reçoit Premium, jamais Coparentalité+ (ni export avancé, ni assistance prioritaire, ni partage à son tour).
- Révocation d'un lien, suppression d'une fiche, résiliation ou impayé (au-delà de la grâce, quand le webhook repasse `users.plan` à `free`) : l'avantage cesse immédiatement, sans action supplémentaire (calcul à la volée, rien n'est stocké chez le bénéficiaire).
- **Pas de plafond** du nombre de bénéficiaires : seul le titulaire d'une fiche peut nommer un `parent` (0360, M2), ce qui limite l'abus. Un plafond (ex. 3 adultes par abonné) reste à décider.

**Sécurité** : les deux fonctions sont `SECURITY DEFINER`, `search_path` fixé, exécutables par **`service_role` uniquement** (un client ne peut pas lire le plan d'un tiers). Le serveur les appelle via `getEffectivePlan(userId, fallback)` (`lib/billing/entitlements.ts`, mémorisé par requête) ; base indisponible ou migration absente : repli sur le plan de la session, jamais au-dessus.

**Où c'est appliqué aujourd'hui**
| Usage | Branché |
|---|---|
| Quota Coach IA (`lib/ai/quota.ts`) | oui (plan effectif) |
| `compute_ai_cycle_window` (SQL historique, non utilisée) | oui |
| Priorité des tickets support (trigger `support_tickets_set_priority`) | oui : `low` gratuit, `normal` Premium (y compris via famille), `high` Coparentalité+ ; l'utilisateur ne peut pas la modifier, admin et `service_role` oui |
| Écran Profil > Abonnement | bandeau « Premium offert par votre famille » (aperçu démo : `?acces=famille`) |
| `CurrentUser.plan` (`lib/auth/session.ts`, fichier coordinateur) | **non** : reste `gratuit` ou `premium` d'après l'abonnement propre ; à faire passer par `getEffectivePlan` pour que tous les écrans voient l'accès partagé |

**Fonctionnalités** (`hasFeature(plan, feature)`, `lib/billing/plans.ts`, à appeler avec le plan **effectif**) : `export_avance`, `suivi_depenses_renforce`, `assistance_prioritaire`, `acces_partage` réservées à `coparentalite` ; `coach_quota_etendu`, `stockage_etendu`, `modeles_complets`, `export_formats` à partir de `premium`. Côté serveur : `userHasFeature(user, 'export_avance')` (`lib/billing/entitlements.ts`).

**Reste à construire** : l'export avancé (dossier pour avocat / médiateur) et le suivi renforcé des dépenses n'existent pas encore en tant que fonctionnalités distinctes ; seul l'indicateur `hasFeature` est en place pour les verrouiller le moment venu. La saisie des tickets (`/app/aide/contact/message`) est encore en démonstration : dès qu'elle insérera dans `support_tickets`, la priorité sera posée par la base.

**Tests** : `tests/plans.test.ts` (règle TS) ; scénario SQL PGlite (toutes les migrations 0001 à 0380, ré-exécution de 0380) : 23 assertions (titulaire / parent / proche / tiers, symétrie, Premium non partagé, refus aux clients, tickets, quota, stats admin, révocation). Scénarios à rejouer manuellement : commentaires §6 de 0380.
