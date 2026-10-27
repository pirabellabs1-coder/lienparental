# Notifications

Système de notifications de Lien Parental : in-app (écran Notifications), Web Push (navigateur / PWA) et e-mail
(Resend). Code : `lib/notify/`, migration `supabase/migrations/0440_notifications.sql`.

## Principe

```
Événement en base (message, partage, événement partagé, sécurité…)
  └─ déclencheur 0440 (SECURITY DEFINER, jamais bloquant)
       └─ public.notification_jobs  (service_role uniquement, dedupe_key unique, run_after)
            ├─ POST /api/notifications/flush   livraison immédiate des tâches de l'AUTEUR (appelée après l'action)
            └─ GET  /api/cron/notifications    toutes les 5 min : rappels, e-mails différés, reste de la file
                 └─ lib/notify/core.ts dispatch()  préférences → in-app + push + e-mail
```

- Les événements nés **dans la base** passent toujours par un déclencheur : aucun chemin client n'est indispensable.
- Les événements nés **côté serveur** sans écriture métier (connexion depuis un nouvel appareil) appellent
  directement `notify()` (`lib/notify/server.ts`).
- `notify()` / `dispatch()` ne lèvent jamais d'exception : erreur journalisée (sans donnée personnelle), canal en
  échec réessayé plus tard (attente exponentielle, 5 essais), canaux déjà livrés jamais renvoyés (`delivered`).
- Idempotence : `notification_jobs.dedupe_key` (unique), `notifications.dedupe_key` (unique, ligne in-app),
  clé d'idempotence Resend `<dedupe_key>:email:<n>`, réservation `FOR UPDATE SKIP LOCKED` (`notif_claim_jobs`).
- Confidentialité : jamais le texte d'un message, une description, un lieu, une donnée médicale ou un nom de
  dossier / document dans un push ou un e-mail. Exception décidée par le produit : le **titre** d'un événement du
  calendrier (événement partagé, rappel), SAUF pour un rendez-vous santé (`type = 'sante'`) : « Rendez-vous santé de
  Lina » hors de l'application, titre complet dans l'écran Notifications seulement.
- Données personnelles dans la file : identifiants seulement. Les adresses utiles aux alertes de sécurité
  (`notify_email`, `new_email`) sont effacées de la charge dès que la tâche est terminée (done / skipped / failed) ;
  les tâches terminées sont supprimées après 30 jours.
- Jamais bloquant : chaque déclencheur capture ses erreurs (avertissement Postgres `notif_on_… :`) ; l'écriture
  métier (message, mot de passe…) aboutit toujours (testé : contrainte forcée sur la file).
- E-mails : `baseLayout` échappe le préheader et le titre ; les templates passent du texte brut (testé avec des
  prénoms contenant `<img>` / `<a>`).

## Matrice finale

| Événement | Déclencheur | In-app | Push | E-mail | Préférences |
|---|---|---|---|---|---|
| `login_new_device` (sécurité) | connexion depuis un appareil inconnu (`lib/notify/login.ts`) | oui | oui | oui (`newLogin`) | ignorées |
| `security_change` (sécurité) | mot de passe défini / modifié, changement d'e-mail demandé (ancienne adresse) / confirmé (ancienne + nouvelle), 2FA activée / désactivée, code du coffre modifié / supprimé, suppression du compte demandée (adresse d'origine) | oui | non | oui (`securityChange`) | ignorées |
| `message_received` | insertion dans `messages`, chaque participant actif sauf l'auteur | oui | oui | non | push : `notif_push` + thème Messages. Au plus 1 par conversation / 2 min. Participation revérifiée à la livraison |
| `message_email` | même insertion, différée | non | non | oui (`messageWaiting`) si le plus ancien message non lu a au moins 5 min (lu puis nouveau message : échéance = plus ancien non lu + 5 min) ; au plus 1 par conversation et par destinataire / 30 min ; nombre de non lus + prénom(s) | `notif_email` + thème Messages |
| `coparent_invite_accepted` | `family_invitations` ou `coparent_links` → accepted (une notification par invitation / lien : une nouvelle invitation notifie à nouveau) | oui | oui | oui (`inviteAccepted`) | `notif_push`, `notif_email` |
| `vault_folder_shared` | insertion dans `vault_folder_shares` | oui | oui | oui (`folderShared`) | + thème Documents |
| `testimony_received` | insertion dans `testimonies` | oui | oui | oui (`testimonyReceived`, titre générique) | + thème Documents |
| `calendar_shared` | événement `family_shared` ajouté, devenu partagé, déplacé (date, heure, lieu) ou annulé ; destinataires : titulaires et parents liés d'un enfant concerné, **jamais les proches** (y compris `sante`) | oui | oui | oui (`calendarShared`) si l'événement a lieu dans les 14 jours | + thème Calendrier. Rafale : 1re notification immédiate, la suite fusionnée et envoyée 2 min après ; ajouté puis annulé avant envoi : rien. Santé : titre générique hors application |
| `calendar_reminder` | cron : titulaire, seulement si l'événement a un rappel (« Aucun » = jamais) ; autres parents liés d'un événement partagé (LEURS `rappels_par_type`, sinon `rappel_defaut_min`) | oui | oui | oui (`calendarReminder`) | exige `notif_rappels` ; push / e-mail : thème Calendrier |
| `coparent_activity` | dépense partagée (`journal_expenses.family_shared`) ou planning de garde (`garde_configs`) créé / modifié par un parent lié | oui | oui | non | + thème Garde. Au plus 1 par élément / 10 min. Lien revérifié à la livraison |
| `welcome` | `users.email_verified` passe à vrai (inscription vérifiée) ou compte Google créé déjà vérifié ; une fois par compte | non | non | oui (`welcome`) | e-mail transactionnel |

Thèmes (`preferences.ui`) : `onMessages`, `onCalendrier`, `onGarde`, `onDocuments`. Absent = activé. Un thème coupé
supprime push et e-mail du thème, jamais la ligne in-app.

**Non fait** : `testimony_reminder` au témoin (J-3). `testimony_requests.deadline` existe, mais aucune adresse e-mail
de témoin n'est stockée (le lien est transmis par le parent). Décision à prendre : collecter l'adresse du témoin
(consentement, RGPD) ou envoyer le rappel au parent.

## Détection de nouvel appareil

Deux voies, idempotentes par session GoTrue (`notif_record_sign_in`, une ligne `public.sessions` par session) :

1. **Voie rapide, avec cookie d'appareil.** `POST /api/auth/login-check` (JSON, même origine), appelée par le
   navigateur juste après la connexion (mot de passe, puis code 2FA : l'alerte part une fois la session en aal2), et
   appel serveur direct dans `/auth/callback` (Google, liens PKCE) et `POST /auth/confirm` (liens e-mail). Identité
   par `getUser()`, session par le claim `session_id` (`getClaims()`), 10 appels / 10 min par compte.
2. **Filet serveur, sans dépendre du navigateur.** Déclencheur `AFTER INSERT` sur `auth.sessions` : toute session
   créée (y compris par un appel direct à l'API GoTrue) est **capturée** (agent, IP : table
   `auth_session_captures`, service_role seulement, effacée dès la décision, purge à 24 h) et dépose une tâche
   `login_check` différée de 2 min. Le cron :
   - session en aal1 alors que le compte a un facteur 2FA vérifié : décision reportée de 2 min, sans consommer
     d'essai, pendant 30 min au plus (ensuite : alerte, le mot de passe a été utilisé) ;
   - session déjà vue par la voie rapide : `duplicate`, rien ;
   - sinon : **alerte**, même si la session a déjà été fermée (connexion puis déconnexion immédiate) ; appareil
     décrit d'après la capture, à défaut « Appareil non identifié ».

Règles de décision (`notif_record_sign_in`) :

- **Appareil connu** : UNIQUEMENT si le cookie `lp_did` (24 octets aléatoires, signé HMAC avec `IP_HASH_SALT`,
  HttpOnly, Secure, SameSite=Lax, 400 jours, exactement deux segments) a déjà été vu sur ce compte
  (`sessions.device_id_hash`). L'empreinte navigateur / système / IP (`device_hash`) est purement informative et ne
  fait jamais reconnaître un appareil (testé : cookie inconnu + empreinte identique → alerte).
- **Session vue seulement par le filet serveur** (pas de cookie) : toujours alerte (testé).
- **Première connexion** : drapeau de compte `users.first_sign_in_at` ; la première session et celles des 30 min
  suivantes ne déclenchent pas d'alerte (reconnexion depuis un autre réseau juste après l'inscription : testé).
- **Comptes existants au déploiement** : drapeau rattrapé par la migration (dernière connexion GoTrue), donc pas de
  fenêtre de 30 min. Leur première session suivie par cookie après la mise en service sert de référence
  (`baseline`, pas d'alerte, une seule fois par compte) : sans cela, chaque compte recevrait une alerte à sa première
  connexion après le déploiement. Choix à confirmer (l'alternative est d'accepter cette vague d'alertes).
- L'utilisateur ne peut pas supprimer ses lignes `public.sessions` (politique `sessions_delete_self` retirée, aucun
  écran ne l'utilisait).
- Sans `IP_HASH_SALT` (ni `APP_ENCRYPTION_KEY`, 16 caractères au moins) : détection désactivée (avertissement
  journalisé). La clé service_role n'est jamais utilisée comme sel.
- Aucune géolocalisation : le lieu est omis de l'e-mail.

**Si Supabase refuse le déclencheur sur `auth.sessions`** : la migration ne s'arrête pas, Postgres affiche
`0440 : déclencheur auth.sessions non créé`. Seule la voie rapide reste alors active (une connexion par appel direct à
l'API GoTrue ne serait pas détectée). Vérifier après application :
`select tgname from pg_trigger where tgname = 'trg_notif_auth_session_insert';`.

Historique : `notif_purge_sessions()` (cron) supprime les connexions de plus de 6 mois en gardant la plus récente par
appareil. Effet : les statistiques admin 0310 (utilisateurs actifs d'après `sessions.last_seen_at`) ne remontent plus
au-delà de 6 mois pour les lignes purgées.

## Web Push

- Abonnements : `public.push_subscriptions` (RLS : lecture et suppression de ses propres lignes ; écriture par la route
  serveur seulement ; point de terminaison limité aux services de push des navigateurs, contrainte SQL +
  `lib/notify/subscription.ts`, aucune requête serveur vers un hôte arbitraire).
- Routes : `GET|POST|DELETE /api/push/subscribe`. Un même navigateur ne sert qu'un compte (dernier qui l'active).
  10 appareils au plus par compte. Abonnement supprimé sur 404 / 410, ou après 10 échecs consécutifs.
- Service worker `public/sw.js` (`CACHE_V = lp-v4`) : `push` (titre, phrase, lien interne `/app/…` uniquement) et
  `notificationclick` (ouvre ou focalise l'application).
- Interface : Profil > Préférences > Notifications. Bouton « Activer les notifications sur cet appareil » : la
  permission n'est demandée que sur ce clic, jamais au chargement. iPhone / iPad : l'application doit être ajoutée à
  l'écran d'accueil (iOS 16.4 et plus), un message l'explique.

## Exploitation

Variables (Vercel, Production) :

| Variable | Rôle |
|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | clé publique VAPID (navigateur) |
| `VAPID_PRIVATE_KEY` | clé privée VAPID (serveur uniquement) |
| `VAPID_SUBJECT` | `mailto:contact@lienparental.fr` |
| `CRON_SECRET` | protège `/api/cron/notifications` (même règle que la file Google) |
| `SUPABASE_SERVICE_ROLE_KEY` | lecture des destinataires, file, abonnements |
| `RESEND_API_KEY`, `MAIL_FROM` | e-mails (sans clé : journalisés, non envoyés) |
| `IP_HASH_SALT` | **obligatoire** pour la détection : signature du cookie d'appareil et empreintes (repli `APP_ENCRYPTION_KEY`, jamais la clé service_role, 16 caractères au moins). Le changer invalide les cookies : une alerte « nouvel appareil » par compte à la connexion suivante |

Générer la paire VAPID **une seule fois** (la changer oblige chaque appareil à réactiver les notifications) :

```bash
npx web-push generate-vapid-keys
```

Cron : déclaré dans `vercel.json` (`/api/cron/notifications`, `*/5 * * * *`, offre Pro). Contrôle :

```bash
curl -i -H "Authorization: Bearer $CRON_SECRET" https://lienparental.fr/api/cron/notifications   # 200
```

Réponse : `{ status, claimed, done, skipped, retried, reminders, purged, sessionsPurged, unconfirmedPurged, truncated }`. Budget 40 s par passage ; la
suite est reprise au passage suivant. Les tâches terminées sont purgées après 30 jours (`notif_purge_jobs`).

Surveillance (SQL, service_role) :

```sql
select event, status, count(*) from public.notification_jobs
 where created_at > now() - interval '1 day' group by 1, 2 order by 1, 2;
select id, event, attempts, last_error from public.notification_jobs where status = 'failed' order by id desc limit 50;
-- File en retard (le cron ne passe plus, ou envois en échec) : doit rester proche de 0.
select count(*) filter (where status = 'pending' and run_after < now() - interval '15 minutes') as en_retard,
       count(*) filter (where status = 'processing' and locked_at < now() - interval '10 minutes') as bloquees
  from public.notification_jobs;
-- Déclencheur en erreur (notification perdue, écriture métier conservée) : journaux Postgres,
-- Supabase > Logs > Postgres, filtre « notif_on_ ».
```

Réessais : 5 au plus (2, 4, 8, 16 min…), puis `failed`. Tâche restée `processing` plus de 10 min (fonction
interrompue) : reprise si moins de 5 essais, sinon `failed` (`stuck`).

Mode démonstration (sans clés Supabase) : aucun appel réseau, la page de préférences fonctionne en local, la carte
« Cet appareil » indique que la fonction exige un compte réel.

## À vérifier sur Supabase réel

- Les déclencheurs sur `auth.users` (`encrypted_password`, `email_change`) reprennent le schéma de 0200 ; vérifier
  après application que GoTrue met bien à jour ces colonnes (changement de mot de passe, demande de changement
  d'e-mail) et qu'aucune erreur n'apparaît dans les journaux Postgres.
- Une connexion Google sans 2FA détectée dans `/auth/callback` ; avec 2FA, après le code (`/onboarding/connexion`).
- Push réel : Chrome Android, Firefox, Safari macOS, iPhone avec l'application installée.

## Tests

- `npm run test` : `tests/notify.test.ts` (règles, sécurité, contenu non sensible, dispatcher jamais bloquant,
  empreinte d'appareil, liste blanche des services de push).
- `npm run test` : `tests/email-templates.test.ts` (aucune balise injectée par un prénom ou un titre, pas de double
  échappement, « Bonjour, » sans prénom).
- `npm run test:sql` : `tests/sql/scenarios/0440-notifications.test.mjs` (message → tâche différée, ignorée si lue,
  reportée si lue puis nouveau message, regroupement 30 min, jamais bloquant, dépense et garde, événements partagés
  et proches, ajouté puis annulé, rappels selon les préférences du destinataire, RLS des abonnements, partage de
  dossier, alertes de sécurité et effacement des adresses, appareils connus et premier accès, filet `auth.sessions`,
  réessais et tâches bloquées, `search_path` vide).
