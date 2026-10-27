-- =====================================================================
-- Lien Parental — 0440_notifications.sql
-- Système de notifications : file de tâches, abonnements Web Push,
-- appareils connus (alerte « nouvelle connexion »), déclencheurs métier.
--
-- Principe : tout événement qui se produit EN BASE (message, partage de
-- dossier, témoignage, invitation acceptée, activité de l'autre parent,
-- changement de sécurité, inscription vérifiée, nouvelle session GoTrue)
-- dépose une tâche dans public.notification_jobs via un déclencheur. Rien ne
-- dépend donc d'un chemin client particulier. La livraison (ligne in-app,
-- Web Push, e-mail) est faite côté serveur par lib/notify (cron
-- /api/cron/notifications toutes les 5 min + écoulement immédiat
-- /api/notifications/flush appelé par l'auteur de l'action).
--
-- Sécurité :
--   - notification_jobs : service_role uniquement (RLS activée, aucune
--     politique, privilèges retirés à anon / authenticated) ;
--   - push_subscriptions : lecture / suppression de ses propres lignes,
--     écriture par le serveur seulement ; point de terminaison limité aux
--     services de push connus (pas de requête serveur vers une URL arbitraire) ;
--   - fonctions SECURITY DEFINER avec search_path vide et noms qualifiés ;
--   - les déclencheurs n'interrompent JAMAIS l'écriture métier : toute erreur
--     est convertie en avertissement (la notification est perdue, pas le
--     message ni le changement de mot de passe) ;
--   - aucune donnée sensible dans la charge : identifiants seulement. Les
--     adresses nécessaires aux alertes de sécurité (notify_email, new_email)
--     sont effacées de la charge dès que la tâche est terminée.
--
-- À appliquer AVANT de déployer le code qui l'utilise (docs/DEPLOIEMENT.md).
-- Ré-exécutable (if not exists / create or replace / drop … if exists).
-- =====================================================================


-- =====================================================================
-- 1. FILE DE TÂCHES
-- =====================================================================
create table if not exists public.notification_jobs (
  id            bigserial primary key,
  -- Destinataire.
  user_id       uuid not null references public.users(id) on delete cascade,
  -- Auteur de l'action (écoulement immédiat par /api/notifications/flush).
  actor_id      uuid references public.users(id) on delete set null,
  event         text not null,
  payload       jsonb not null default '{}'::jsonb
                  check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 4096),
  -- Clé d'idempotence : une tâche par clé, pour toujours.
  dedupe_key    text not null unique check (length(dedupe_key) between 3 and 300),
  -- Regroupement (ex. 'conv:<id>' pour l'e-mail groupé d'une conversation).
  group_key     text,
  run_after     timestamptz not null default now(),
  status        text not null default 'pending'
                  check (status in ('pending', 'processing', 'done', 'skipped', 'failed')),
  attempts      smallint not null default 0 check (attempts between 0 and 50),
  -- Canaux déjà livrés (un réessai ne renvoie jamais un push ou un e-mail déjà parti).
  delivered     text[] not null default '{}',
  locked_at     timestamptz,
  processed_at  timestamptz,
  last_error    text check (last_error is null or length(last_error) <= 200),
  created_at    timestamptz not null default now()
);

-- Liste des événements (contrainte nommée : remplaçable par une migration future).
alter table public.notification_jobs drop constraint if exists chk_notification_jobs_event;
alter table public.notification_jobs add constraint chk_notification_jobs_event check (event in (
  'login_check', 'login_new_device', 'security_change', 'message_received', 'message_email',
  'coparent_invite_accepted', 'vault_folder_shared', 'testimony_received',
  'calendar_reminder', 'calendar_shared', 'coparent_activity', 'welcome'
));

create index if not exists idx_notification_jobs_due
  on public.notification_jobs(run_after) where status in ('pending', 'processing');
create index if not exists idx_notification_jobs_actor_due
  on public.notification_jobs(actor_id, run_after) where status = 'pending';
create index if not exists idx_notification_jobs_group
  on public.notification_jobs(user_id, event, group_key, processed_at desc) where group_key is not null;
create index if not exists idx_notification_jobs_purge
  on public.notification_jobs(created_at) where status in ('done', 'skipped', 'failed');

alter table public.notification_jobs enable row level security;
revoke all on table public.notification_jobs from public, anon, authenticated;
grant all on table public.notification_jobs to service_role;
revoke all on sequence public.notification_jobs_id_seq from public, anon, authenticated;
grant usage, select on sequence public.notification_jobs_id_seq to service_role;

comment on table public.notification_jobs is
  'File des notifications (0440). service_role uniquement. Déposée par déclencheurs, livrée par lib/notify (cron 5 min + flush immédiat). Purge : notif_purge_jobs().';


-- =====================================================================
-- 2. NOTIFICATIONS IN-APP : clé d'idempotence
-- =====================================================================
alter table public.notifications add column if not exists dedupe_key text;
create unique index if not exists uq_notifications_dedupe on public.notifications(dedupe_key);


-- =====================================================================
-- 3. ABONNEMENTS WEB PUSH (un par navigateur / appareil)
-- =====================================================================
create table if not exists public.push_subscriptions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.users(id) on delete cascade,
  -- Uniquement les services de push des navigateurs (Chrome / Edge / Firefox / Safari / Windows) :
  -- le serveur envoie une requête HTTPS à cette adresse, jamais à un hôte arbitraire.
  endpoint         text not null unique check (
                     length(endpoint) <= 1024
                     and endpoint ~ '^https://(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com|[a-z0-9.-]+\.push\.apple\.com)/'
                   ),
  p256dh           text not null check (p256dh ~ '^[A-Za-z0-9_-]{40,200}={0,2}$'),
  auth_secret      text not null check (auth_secret ~ '^[A-Za-z0-9_-]{10,100}={0,2}$'),
  device_label     text check (device_label is null or length(device_label) <= 80),
  created_at       timestamptz not null default now(),
  last_success_at  timestamptz,
  failure_count    integer not null default 0 check (failure_count >= 0)
);

create index if not exists idx_push_subscriptions_user on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_select_self on public.push_subscriptions;
create policy push_subscriptions_select_self on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());

-- Pas d'insertion directe : POST /api/push/subscribe (validation, plafond d'appareils, service_role).
drop policy if exists push_subscriptions_insert_self on public.push_subscriptions;

drop policy if exists push_subscriptions_delete_self on public.push_subscriptions;
create policy push_subscriptions_delete_self on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists mfa_required on public.push_subscriptions;
create policy mfa_required on public.push_subscriptions
  as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));

revoke all on table public.push_subscriptions from public, anon, authenticated;
grant select, delete on table public.push_subscriptions to authenticated;
grant all on table public.push_subscriptions to service_role;

comment on table public.push_subscriptions is
  'Abonnements Web Push (0440). Lecture / suppression de ses propres lignes ; écriture par le serveur. Supprimés sur réponse 404/410 du service de push.';


-- =====================================================================
-- 4. APPAREILS CONNUS (alerte « nouvelle connexion »)
-- =====================================================================
-- public.sessions (0007) devient le registre des connexions : une ligne par
-- session GoTrue (refresh_token_id = id de session, claim session_id du JWT).
--   device_id_hash : HMAC d'un identifiant d'appareil aléatoire (cookie signé
--                    HttpOnly lp_did, 400 jours) : identité PRINCIPALE ;
--   device_hash    : HMAC(navigateur | système | IP grossière) : information
--                    seulement, JAMAIS utilisée pour reconnaître un appareil
--                    (une empreinte se reproduit facilement).
-- Jamais l'IP ni l'agent utilisateur bruts dans les empreintes.
alter table public.sessions add column if not exists device_hash text
  check (device_hash is null or device_hash ~ '^[0-9a-f]{64}$');
alter table public.sessions add column if not exists device_id_hash text
  check (device_id_hash is null or device_id_hash ~ '^[0-9a-f]{64}$');
create index if not exists idx_sessions_user_device on public.sessions(user_id, device_hash);
create index if not exists idx_sessions_user_device_id on public.sessions(user_id, device_id_hash) where device_id_hash is not null;

-- L'utilisateur ne peut plus effacer son historique de connexions (sinon il
-- supprimerait les alertes « nouvel appareil ») ; aucun écran ne s'en servait.
drop policy if exists sessions_delete_self on public.sessions;
revoke delete on table public.sessions from authenticated;

-- Première connexion vue par ce système (drapeau au niveau du COMPTE, pas
-- déduit de l'existence de lignes sessions) : la toute première session et
-- celles des 30 minutes suivantes ne déclenchent pas d'alerte (inscription,
-- reconnexion depuis un autre réseau juste après).
alter table public.users add column if not exists first_sign_in_at timestamptz;

-- Comptes existants : drapeau posé d'après GoTrue (pas de fenêtre de 30 min sans
-- alerte pour eux). Ré-exécutable : ne touche que les drapeaux encore vides.
update public.users u
   set first_sign_in_at = coalesce(a.last_sign_in_at, a.created_at, u.created_at)
  from auth.users a
 where a.id = u.id
   and u.first_sign_in_at is null
   and u.deleted_at is null
   and (a.email_confirmed_at is not null or a.last_sign_in_at is not null);

drop function if exists public.notif_record_sign_in(uuid, text, text, text, text, text);

-- Enregistre une connexion et dit si l'appareil est nouveau :
--   'duplicate' : session déjà enregistrée (appel rejoué, idempotent) ;
--   'first'     : première connexion du compte (ou dans les 30 min) → pas d'alerte ;
--   'known'     : identifiant d'appareil (cookie signé) déjà vu → pas d'alerte ;
--   'baseline'  : compte existant, première session suivie par cookie depuis la mise
--                 en service (aucun identifiant d'appareil connu) → pas d'alerte, une
--                 seule fois par compte (évite une alerte à chaque compte au déploiement) ;
--   'new'       : identifiant inconnu, OU session vue seulement par le filet serveur
--                 (p_device_id_hash NULL : une connexion légitime passe par la voie rapide
--                 qui l'enregistre avant) → alerte.
-- L'empreinte (device_hash) n'entre JAMAIS dans la décision.
create or replace function public.notif_record_sign_in(
  p_user_id        uuid,
  p_session_id     text,
  p_device_id_hash text,
  p_device_hash    text,
  p_device_label   text,
  p_ip_hash        text,
  p_user_agent     text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id    uuid;
  v_first timestamptz;
  v_known boolean;
begin
  if p_user_id is null or p_session_id is null or length(p_session_id) not between 8 and 100
     or p_device_hash is null or p_device_hash !~ '^[0-9a-f]{64}$'
     or (p_device_id_hash is not null and p_device_id_hash !~ '^[0-9a-f]{64}$') then
    raise exception 'Paramètres invalides' using errcode = '22023';
  end if;

  -- Sérialise les connexions simultanées d'un même compte.
  perform pg_advisory_xact_lock(hashtextextended('notif:signin:' || p_user_id::text, 0));

  insert into public.sessions (user_id, refresh_token_id, device_label, ip_hash, user_agent, device_hash, device_id_hash, last_seen_at)
  values (p_user_id, p_session_id, left(p_device_label, 80), left(p_ip_hash, 128), left(p_user_agent, 300), p_device_hash, p_device_id_hash, now())
  on conflict (refresh_token_id) do nothing
  returning id into v_id;

  if v_id is null then
    update public.sessions
       set last_seen_at = now(),
           device_id_hash = coalesce(device_id_hash, p_device_id_hash)
     where refresh_token_id = p_session_id and user_id = p_user_id;
    return 'duplicate';
  end if;

  select u.first_sign_in_at into v_first from public.users u where u.id = p_user_id for update;
  if v_first is null then
    update public.users set first_sign_in_at = now() where id = p_user_id;
    return 'first';
  end if;
  if v_first > now() - interval '30 minutes' then
    return 'first';
  end if;

  if p_device_id_hash is null then
    return 'new';
  end if;

  select exists (
    select 1 from public.sessions s
     where s.user_id = p_user_id and s.id <> v_id and s.device_id_hash = p_device_id_hash
  ) into v_known;
  if v_known then return 'known'; end if;

  if not exists (
    select 1 from public.sessions s
     where s.user_id = p_user_id and s.id <> v_id and s.device_id_hash is not null
  ) then
    return 'baseline';
  end if;
  return 'new';
end;
$$;
revoke all on function public.notif_record_sign_in(uuid, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.notif_record_sign_in(uuid, text, text, text, text, text, text) to service_role;

-- Capture des sessions GoTrue (filet serveur) : agent et IP relevés AU MOMENT de la
-- création, pour pouvoir alerter même si la session a déjà disparu quand le cron
-- passe (connexion puis déconnexion immédiate). service_role uniquement ; ligne
-- supprimée dès la tâche traitée, purge à 24 h au plus tard.
create table if not exists public.auth_session_captures (
  session_id  uuid primary key,
  user_id     uuid not null,
  user_agent  text check (user_agent is null or length(user_agent) <= 512),
  ip          text check (ip is null or length(ip) <= 64),
  created_at  timestamptz not null default now()
);
alter table public.auth_session_captures enable row level security;
revoke all on table public.auth_session_captures from public, anon, authenticated;
grant all on table public.auth_session_captures to service_role;

drop function if exists public.notif_session_info(uuid);
-- Session lue par le cron : capture (agent, IP), existence et niveau d'assurance
-- courants, facteur 2FA vérifié. Agent et IP bruts transmis au SEUL service_role.
create or replace function public.notif_session_info(p_session_id uuid)
returns table (
  user_id uuid, user_agent text, ip text, created_at timestamptz,
  session_exists boolean, aal text, has_verified_factor boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(c.user_id, s.user_id),
         coalesce(c.user_agent, s.user_agent),
         coalesce(c.ip, host(s.ip)),
         coalesce(c.created_at, s.created_at),
         s.id is not null,
         s.aal::text,
         exists (select 1 from auth.mfa_factors f
                  where f.user_id = coalesce(c.user_id, s.user_id) and f.status::text = 'verified')
    from (select p_session_id as sid) x
    left join public.auth_session_captures c on c.session_id = x.sid
    left join auth.sessions s on s.id = x.sid
   where c.session_id is not null or s.id is not null;
$$;
revoke all on function public.notif_session_info(uuid) from public, anon, authenticated;
grant execute on function public.notif_session_info(uuid) to service_role;

-- Purge (cron) : connexions de plus de 6 mois, en gardant la plus récente par
-- appareil (la reconnaissance des appareils reste intacte). Effet : les
-- statistiques admin 0310 (utilisateurs actifs d'après sessions.last_seen_at)
-- ne remontent plus au-delà de 6 mois pour ces lignes.
create or replace function public.notif_purge_sessions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v integer;
begin
  delete from public.sessions s
   where s.last_seen_at < now() - interval '6 months'
     and exists (
       select 1 from public.sessions n
        where n.user_id = s.user_id and n.id <> s.id
          and n.last_seen_at > s.last_seen_at
          and coalesce(n.device_id_hash, n.device_hash, '') = coalesce(s.device_id_hash, s.device_hash, '')
     );
  get diagnostics v = row_count;
  return v;
end;
$$;
revoke all on function public.notif_purge_sessions() from public, anon, authenticated;
grant execute on function public.notif_purge_sessions() to service_role;

-- Comptes jamais confirmés de plus de 24 h, sans aucune donnée (l'inscription crée le
-- compte avec un mot de passe aléatoire : un compte abandonné ne sert à rien et ne
-- doit pas bloquer l'adresse). Supprimés par le cron via l'API admin GoTrue.
create or replace function public.notif_unconfirmed_accounts(p_limit integer default 100)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.id
    from auth.users a
   where a.email_confirmed_at is null
     and a.last_sign_in_at is null
     and a.deleted_at is null
     and a.email is not null
     and a.created_at < now() - interval '24 hours'
     and not exists (select 1 from public.children c where c.user_id = a.id)
     and not exists (select 1 from public.journal_entries j where j.user_id = a.id)
     and not exists (select 1 from public.documents d where d.user_id = a.id)
     and not exists (select 1 from public.conversation_participants p where p.user_id = a.id)
   order by a.created_at
   limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;
revoke all on function public.notif_unconfirmed_accounts(integer) from public, anon, authenticated;
grant execute on function public.notif_unconfirmed_accounts(integer) to service_role;


-- =====================================================================
-- 5. HELPERS (internes, service_role / déclencheurs)
-- =====================================================================

-- Dépose une tâche. Doublon (même dedupe_key) : ignoré.
create or replace function public._notif_enqueue(
  p_user_id    uuid,
  p_event      text,
  p_payload    jsonb,
  p_dedupe_key text,
  p_run_after  timestamptz default null,
  p_actor_id   uuid default null,
  p_group_key  text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then return; end if;
  -- Destinataire supprimé (ou en cours de suppression) : rien, sauf l'alerte de suppression elle-même.
  if not exists (
    select 1 from public.users u
     where u.id = p_user_id
       and (u.deleted_at is null or (p_event = 'security_change' and p_payload ->> 'change' = 'account_deletion_requested'))
  ) then
    return;
  end if;
  insert into public.notification_jobs (user_id, actor_id, event, payload, dedupe_key, group_key, run_after)
  values (p_user_id, p_actor_id, p_event, coalesce(p_payload, '{}'::jsonb), left(p_dedupe_key, 300), p_group_key, coalesce(p_run_after, now()))
  on conflict (dedupe_key) do nothing;
end;
$$;
revoke all on function public._notif_enqueue(uuid, text, jsonb, text, timestamptz, uuid, text) from public, anon, authenticated;
grant execute on function public._notif_enqueue(uuid, text, jsonb, text, timestamptz, uuid, text) to service_role;

-- Titulaires et parents ACTIFS des enfants donnés, hors auteur, quand l'auteur
-- est lui-même titulaire ou parent d'au moins un de ces enfants (même règle
-- que family_row_visible, 0340). Les proches ne sont jamais destinataires.
create or replace function public._notif_family_parents(p_author uuid, p_children uuid[])
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct r.uid
    from unnest(coalesce(p_children, '{}'::uuid[])) as k(cid)
    cross join lateral (
      select c.user_id as uid from public.children c where c.id = k.cid and c.deleted_at is null
      union
      select g.user_id from public.child_guardians g
       where g.child_id = k.cid and g.status = 'active' and g.role = 'parent'
    ) r
   where p_author is not null
     and r.uid <> p_author
     and public.family_role(k.cid, p_author) in ('owner', 'parent');
$$;
revoke all on function public._notif_family_parents(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public._notif_family_parents(uuid, uuid[]) to service_role;

-- Parents liés à p_user (lien coparent accepté, ou titulaire / parent d'un même enfant).
create or replace function public._notif_linked_parents(p_user uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select c.id from public.children c where c.user_id = p_user and c.deleted_at is null
    union
    select g.child_id from public.child_guardians g
      join public.children c on c.id = g.child_id and c.deleted_at is null
     where g.user_id = p_user and g.status = 'active' and g.role = 'parent'
  ),
  candidates as (
    select case when l.user_id = p_user then l.coparent_user_id else l.user_id end as uid
      from public.coparent_links l
     where l.status = 'accepted' and l.coparent_user_id is not null
       and p_user in (l.user_id, l.coparent_user_id)
    union
    select c.user_id from mine join public.children c on c.id = mine.id
    union
    select g.user_id from mine join public.child_guardians g
        on g.child_id = mine.id and g.status = 'active' and g.role = 'parent'
  )
  select distinct x.uid from candidates x
   where x.uid is not null and x.uid <> p_user
     and public.messaging_linked(p_user, x.uid);
$$;
revoke all on function public._notif_linked_parents(uuid) from public, anon, authenticated;
grant execute on function public._notif_linked_parents(uuid) to service_role;

-- Messages non lus d'une conversation pour un participant actif (même règle
-- que list_my_conversations, 0360), prénoms distincts de leurs auteurs et
-- date du plus ancien non lu (règle des 5 minutes de l'e-mail).
drop function if exists public.notif_conversation_unread(uuid, uuid);
create or replace function public.notif_conversation_unread(p_user_id uuid, p_conversation_id uuid)
returns table (unread integer, senders text[], oldest timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select p.last_read_at, p.left_at
      from public.conversation_participants p
     where p.conversation_id = p_conversation_id and p.user_id = p_user_id
  ),
  m as (
    select msg.sender_id, msg.created_at
      from public.messages msg, me
     where msg.conversation_id = p_conversation_id
       and msg.sender_id <> p_user_id
       and me.left_at is null
       and case when me.last_read_at is null then msg.read_at is null
                else msg.created_at > me.last_read_at end
  )
  select (select count(*)::int from m),
         coalesce((select array_agg(distinct coalesce(nullif(btrim(u.prenom), ''), 'Un parent'))
                     from m join public.users u on u.id = m.sender_id), '{}'::text[]),
         (select min(m.created_at) from m);
$$;
revoke all on function public.notif_conversation_unread(uuid, uuid) from public, anon, authenticated;
grant execute on function public.notif_conversation_unread(uuid, uuid) to service_role;


-- =====================================================================
-- 6. TRAITEMENT DE LA FILE (service_role)
-- =====================================================================

-- Réserve jusqu'à p_limit tâches dues (FOR UPDATE SKIP LOCKED : deux passages
-- simultanés ne prennent jamais la même tâche).
--   - tâche « processing » abandonnée depuis 10 min (fonction interrompue) :
--     reprise si moins de 5 essais, sinon classée 'failed' ;
--   - e-mail groupé d'une conversation entièrement lue : 'skipped' ;
--   - e-mail groupé dont le plus ancien non lu a moins de 5 min (lu puis
--     nouveau message) : reporté à « plus ancien non lu + 5 min ».
-- p_actor : seulement les tâches de cet auteur (écoulement immédiat).
create or replace function public.notif_claim_jobs(p_limit integer default 50, p_actor uuid default null)
returns setof public.notification_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids bigint[];
  r     record;
begin
  update public.notification_jobs j
     set status = 'failed', last_error = 'stuck', processed_at = now(), locked_at = null,
         payload = j.payload - 'notify_email' - 'new_email'
   where j.status = 'processing' and j.locked_at < now() - interval '10 minutes' and j.attempts >= 5
     and (p_actor is null or j.actor_id = p_actor);

  select array_agg(s.id) into v_ids
    from (
      select j.id
        from public.notification_jobs j
       where ((j.status = 'pending' and j.run_after <= now())
              or (j.status = 'processing' and j.locked_at < now() - interval '10 minutes' and j.attempts < 5))
         and (p_actor is null or j.actor_id = p_actor)
       order by j.run_after, j.id
       limit greatest(1, least(coalesce(p_limit, 50), 200))
       for update skip locked
    ) s;

  if v_ids is null then return; end if;

  for r in
    select j.id, x.unread, x.oldest
      from public.notification_jobs j
      cross join lateral public.notif_conversation_unread(j.user_id, (j.payload ->> 'conversation_id')::uuid) x
     where j.id = any (v_ids) and j.event = 'message_email'
  loop
    if coalesce(r.unread, 0) = 0 then
      update public.notification_jobs
         set status = 'skipped', last_error = 'already_read', processed_at = now(), locked_at = null
       where id = r.id;
      v_ids := array_remove(v_ids, r.id);
    elsif r.oldest > now() - interval '5 minutes' then
      update public.notification_jobs
         set status = 'pending', run_after = r.oldest + interval '5 minutes', locked_at = null
       where id = r.id;
      v_ids := array_remove(v_ids, r.id);
    end if;
  end loop;

  return query
    update public.notification_jobs j
       set status = 'processing', locked_at = now(), attempts = j.attempts + 1
     where j.id = any (v_ids) and j.status in ('pending', 'processing')
    returning j.*;
end;
$$;
revoke all on function public.notif_claim_jobs(integer, uuid) from public, anon, authenticated;
grant execute on function public.notif_claim_jobs(integer, uuid) to service_role;

-- Clôt une tâche réservée. p_status : 'done' | 'skipped' | 'retry' | 'failed' | 'defer'.
-- 'defer' : reprogrammée dans 2 min sans consommer d'essai (connexion en attente du code 2FA).
-- 'retry' : reprogrammée (attente 2^essais minutes, 60 au plus), 'failed' au 5e essai.
-- Statut final : les adresses de la charge (notify_email, new_email) sont effacées.
create or replace function public.notif_finish_job(
  p_id        bigint,
  p_status    text,
  p_delivered text[] default '{}',
  p_error     text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempts smallint;
  v_final    text;
begin
  if p_status not in ('done', 'skipped', 'retry', 'failed', 'defer') then
    raise exception 'Statut invalide' using errcode = '22023';
  end if;
  select j.attempts into v_attempts from public.notification_jobs j where j.id = p_id and j.status = 'processing' for update;
  if not found then return; end if;

  if p_status = 'defer' then
    update public.notification_jobs j
       set status = 'pending', run_after = now() + interval '2 minutes', locked_at = null,
           attempts = greatest(j.attempts - 1, 0)
     where j.id = p_id;
    return;
  end if;

  v_final := case
               when p_status = 'retry' and v_attempts >= 5 then 'failed'
               when p_status = 'retry' then 'pending'
               else p_status
             end;

  update public.notification_jobs j
     set status       = v_final,
         run_after    = case when v_final = 'pending'
                             then now() + make_interval(mins => least(60, (2 ^ greatest(v_attempts, 1))::int))
                             else j.run_after end,
         delivered    = (select coalesce(array_agg(distinct d), '{}'::text[])
                           from unnest(j.delivered || coalesce(p_delivered, '{}'::text[])) d),
         last_error   = left(p_error, 200),
         locked_at    = null,
         processed_at = case when v_final = 'pending' then j.processed_at else now() end,
         payload      = case when v_final = 'pending' then j.payload else j.payload - 'notify_email' - 'new_email' end
   where j.id = p_id;
end;
$$;
revoke all on function public.notif_finish_job(bigint, text, text[], text) from public, anon, authenticated;
grant execute on function public.notif_finish_job(bigint, text, text[], text) to service_role;

-- Événement du calendrier vu par un destinataire : visible s'il en est le
-- titulaire, ou parent lié destinataire d'un événement partagé (jamais un
-- proche). child_name : prénom du premier enfant (titre générique « santé »).
drop function if exists public.notif_calendar_event_for(uuid, uuid);
create or replace function public.notif_calendar_event_for(p_user_id uuid, p_event_id uuid)
returns table (
  titre      text,
  type       text,
  start_at   timestamptz,
  all_day    boolean,
  deleted    boolean,
  author_id  uuid,
  visible    boolean,
  child_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.titre, e.type::text, e.start_at, e.all_day, e.deleted_at is not null, e.user_id,
         e.user_id = p_user_id
           or (e.family_shared and p_user_id in (select public._notif_family_parents(e.user_id, e.children_ids))),
         (select c.prenom from public.children c
           where c.id = any (e.children_ids) and c.deleted_at is null
           order by array_position(e.children_ids, c.id) limit 1)
    from public.calendar_events e
   where e.id = p_event_id;
$$;
revoke all on function public.notif_calendar_event_for(uuid, uuid) from public, anon, authenticated;
grant execute on function public.notif_calendar_event_for(uuid, uuid) to service_role;

-- Prochains événements partagés (boucle des rappels des autres parents).
create index if not exists idx_calendar_shared_upcoming
  on public.calendar_events(start_at) where family_shared and deleted_at is null;

-- Rappels du calendrier arrivés à échéance → tâches 'calendar_reminder'.
--   1. Titulaire : seulement si l'événement a un rappel (reminder_minutes ;
--      « Aucun » = NULL = jamais de rappel). reminder_sent_at rend l'opération
--      idempotente (toute modification de l'événement la réarme).
--   2. Autres parents liés d'un événement PARTAGÉ : délai selon LEURS
--      préférences (rappels_par_type du type, sinon rappel_defaut_min), si
--      notif_rappels. Idempotence par la clé (événement, destinataire, heure de
--      début) : un événement déplacé produit un nouveau rappel. Fenêtre de
--      recherche bornée par le plus grand délai configuré.
-- Événement commencé depuis plus de 10 min : plus de rappel.
create or replace function public.notif_enqueue_calendar_reminders(p_limit integer default 200)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_count integer := 0;
  v_limit integer := greatest(1, least(coalesce(p_limit, 200), 1000));
  v_max   integer;
begin
  for r in
    select e.id, e.user_id, e.start_at
      from public.calendar_events e
     where e.deleted_at is null
       and e.reminder_sent_at is null
       and e.reminder_minutes is not null
       and e.start_at > now() - interval '10 minutes'
       and e.start_at <= now() + interval '29 days'
       and e.start_at - make_interval(mins => least(e.reminder_minutes, 40320)) <= now()
     order by e.start_at
     limit v_limit
     for update of e skip locked
  loop
    update public.calendar_events set reminder_sent_at = now() where id = r.id;
    perform public._notif_enqueue(
      r.user_id, 'calendar_reminder',
      jsonb_build_object('event_id', r.id, 'start_at', r.start_at),
      format('calendar_reminder:%s:%s:%s', r.id, r.user_id, floor(extract(epoch from r.start_at))::bigint),
      now(), null, null);
    v_count := v_count + 1;
  end loop;

  select least(40320, coalesce(max(greatest(
           p.rappel_defaut_min,
           coalesce((select max(v.val::int) from jsonb_each_text(p.rappels_par_type) v(key, val) where v.val ~ '^\d{1,5}$'), 0)
         )), 0))
    into v_max
    from public.preferences p
   where p.notif_rappels;

  for r in
    select e.id, e.start_at, rcp.uid
      from public.calendar_events e
      cross join lateral (select public._notif_family_parents(e.user_id, e.children_ids) as uid) rcp
      join public.preferences p on p.user_id = rcp.uid and p.notif_rappels
      cross join lateral (
        select case when (p.rappels_par_type ->> e.type::text) ~ '^\d{1,5}$'
                    then least((p.rappels_par_type ->> e.type::text)::int, 40320)
                    else p.rappel_defaut_min end as mins
      ) m
     where e.family_shared
       and e.deleted_at is null
       and e.start_at > now() - interval '10 minutes'
       and e.start_at <= now() + make_interval(mins => v_max)
       and e.start_at - make_interval(mins => m.mins) <= now()
       and not exists (
         select 1 from public.notification_jobs j
          where j.dedupe_key = format('calendar_reminder:%s:%s:%s', e.id, rcp.uid, floor(extract(epoch from e.start_at))::bigint)
       )
     order by e.start_at
     limit v_limit
  loop
    perform public._notif_enqueue(
      r.uid, 'calendar_reminder',
      jsonb_build_object('event_id', r.id, 'start_at', r.start_at),
      format('calendar_reminder:%s:%s:%s', r.id, r.uid, floor(extract(epoch from r.start_at))::bigint),
      now(), null, null);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.notif_enqueue_calendar_reminders(integer) from public, anon, authenticated;
grant execute on function public.notif_enqueue_calendar_reminders(integer) to service_role;

-- Purge (cron) : tâches terminées de plus de 30 jours.
create or replace function public.notif_purge_jobs()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v integer;
begin
  delete from public.notification_jobs
   where status in ('done', 'skipped', 'failed') and created_at < now() - interval '30 days';
  get diagnostics v = row_count;
  delete from public.auth_session_captures where created_at < now() - interval '24 hours';
  return v;
end;
$$;
revoke all on function public.notif_purge_jobs() from public, anon, authenticated;
grant execute on function public.notif_purge_jobs() to service_role;


-- =====================================================================
-- 7. DÉCLENCHEURS MÉTIER (jamais bloquants)
-- =====================================================================

-- --- 7.1 Message reçu ----------------------------------------------------
-- Chaque participant actif autre que l'auteur reçoit :
--   - 'message_received' immédiat (in-app + push), au plus un toutes les
--     2 minutes par conversation ;
--   - 'message_email' différé d'au moins 5 min, au plus un par conversation
--     toutes les 30 min : une tâche EN ATTENTE couvre les messages suivants
--     (une tâche en cours d'envoi, non : la suivante part 30 min après elle).
--     Si tout est lu à l'échéance, elle est ignorée ; si un message arrive
--     après une lecture, l'échéance devient « plus ancien non lu + 5 min ».
create or replace function public.notif_on_message_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r        record;
  v_last   timestamptz;
  v_locked timestamptz;
  v_group  text := 'conv:' || new.conversation_id::text;
begin
  begin
    for r in
      select p.user_id
        from public.conversation_participants p
       where p.conversation_id = new.conversation_id
         and p.user_id <> new.sender_id
         and p.left_at is null
    loop
      perform public._notif_enqueue(
        r.user_id, 'message_received',
        jsonb_build_object('conversation_id', new.conversation_id, 'message_id', new.id, 'actor_id', new.sender_id),
        format('message_received:%s:%s:%s', new.conversation_id, r.user_id, floor(extract(epoch from new.created_at) / 120)::bigint),
        now(), new.sender_id, v_group);

      perform pg_advisory_xact_lock(hashtextextended('notif:msgmail:' || r.user_id::text || ':' || new.conversation_id::text, 0));
      if not exists (
        select 1 from public.notification_jobs j
         where j.user_id = r.user_id and j.event = 'message_email' and j.group_key = v_group and j.status = 'pending'
      ) then
        select max(j.processed_at) filter (where j.status = 'done'),
               max(j.locked_at) filter (where j.status = 'processing')
          into v_last, v_locked
          from public.notification_jobs j
         where j.user_id = r.user_id and j.event = 'message_email' and j.group_key = v_group
           and j.status in ('done', 'processing');
        perform public._notif_enqueue(
          r.user_id, 'message_email',
          jsonb_build_object('conversation_id', new.conversation_id, 'first_message_id', new.id),
          format('message_email:%s:%s:%s', new.conversation_id, r.user_id, new.id),
          greatest(now() + interval '5 minutes',
                   coalesce(v_last + interval '30 minutes', now()),
                   coalesce(v_locked + interval '30 minutes', now())),
          new.sender_id, v_group);
      end if;
    end loop;
  exception when others then
    raise warning 'notif_on_message_insert : %', sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function public.notif_on_message_insert() from public, anon, authenticated;

drop trigger if exists trg_notif_message_insert on public.messages;
create trigger trg_notif_message_insert
  after insert on public.messages
  for each row execute function public.notif_on_message_insert();

-- --- 7.2 Dossier du coffre partagé -----------------------------------------
create or replace function public.notif_on_folder_share()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    if new.revoked_at is null then
      perform public._notif_enqueue(
        new.grantee_id, 'vault_folder_shared',
        jsonb_build_object('share_id', new.id, 'folder_id', new.folder_id, 'actor_id', new.owner_id),
        format('vault_folder_shared:%s', new.id),
        now(), new.owner_id, null);
    end if;
  exception when others then
    raise warning 'notif_on_folder_share : %', sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function public.notif_on_folder_share() from public, anon, authenticated;

drop trigger if exists trg_notif_folder_share on public.vault_folder_shares;
create trigger trg_notif_folder_share
  after insert on public.vault_folder_shares
  for each row execute function public.notif_on_folder_share();

-- --- 7.3 Témoignage reçu ---------------------------------------------------
create or replace function public.notif_on_testimony()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform public._notif_enqueue(
      new.user_id, 'testimony_received',
      jsonb_build_object('testimony_id', new.id, 'request_id', new.request_id),
      format('testimony_received:%s', new.id),
      now(), null, null);
  exception when others then
    raise warning 'notif_on_testimony : %', sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function public.notif_on_testimony() from public, anon, authenticated;

drop trigger if exists trg_notif_testimony on public.testimonies;
create trigger trg_notif_testimony
  after insert on public.testimonies
  for each row execute function public.notif_on_testimony();

-- --- 7.4 Invitation acceptée (famille 0340 et lien coparent 0230) ----------
-- Clé par invitation / lien : une nouvelle invitation acceptée notifie à nouveau.
create or replace function public.notif_on_family_invite_accepted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    if new.status = 'accepted' and old.status is distinct from 'accepted' and new.accepted_by is not null then
      perform public._notif_enqueue(
        new.inviter_id, 'coparent_invite_accepted',
        jsonb_build_object('actor_id', new.accepted_by, 'role', new.role),
        format('coparent_invite_accepted:family:%s', new.id),
        now(), new.accepted_by, null);
    end if;
  exception when others then
    raise warning 'notif_on_family_invite_accepted : %', sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function public.notif_on_family_invite_accepted() from public, anon, authenticated;

drop trigger if exists trg_notif_family_invite_accepted on public.family_invitations;
create trigger trg_notif_family_invite_accepted
  after update of status on public.family_invitations
  for each row execute function public.notif_on_family_invite_accepted();

create or replace function public.notif_on_coparent_link_accepted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    if new.status = 'accepted' and old.status is distinct from 'accepted' and new.coparent_user_id is not null then
      perform public._notif_enqueue(
        new.user_id, 'coparent_invite_accepted',
        jsonb_build_object('actor_id', new.coparent_user_id, 'role', 'parent'),
        format('coparent_invite_accepted:link:%s', new.id),
        now(), new.coparent_user_id, null);
    end if;
  exception when others then
    raise warning 'notif_on_coparent_link_accepted : %', sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function public.notif_on_coparent_link_accepted() from public, anon, authenticated;

drop trigger if exists trg_notif_coparent_link_accepted on public.coparent_links;
create trigger trg_notif_coparent_link_accepted
  after update of status on public.coparent_links
  for each row execute function public.notif_on_coparent_link_accepted();

-- --- 7.5 Activité de l'autre parent (calendrier partagé, dépenses, garde) --
-- Dépenses et garde ('coparent_activity') : in-app + push uniquement. Une
-- notification au plus par élément et par destinataire toutes les 10 minutes.
create or replace function public._notif_activity(
  p_recipients uuid[],
  p_author     uuid,
  p_entity     text,
  p_entity_id  text,
  p_action     text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_bucket bigint := floor(extract(epoch from now()) / 600)::bigint;
begin
  foreach v_uid in array coalesce(p_recipients, '{}'::uuid[]) loop
    perform public._notif_enqueue(
      v_uid, 'coparent_activity',
      jsonb_build_object('entity', p_entity, 'entity_id', p_entity_id, 'action', p_action, 'actor_id', p_author),
      format('coparent_activity:%s:%s:%s:%s', p_entity, p_entity_id, v_uid, v_bucket),
      now(), p_author, null);
  end loop;
end;
$$;
revoke all on function public._notif_activity(uuid[], uuid, text, text, text) from public, anon, authenticated;
grant execute on function public._notif_activity(uuid[], uuid, text, text, text) to service_role;

-- Événement PARTAGÉ (family_shared) ajouté, devenu partagé, déplacé (date,
-- heure, lieu) ou annulé → 'calendar_shared' pour chaque autre parent lié d'un
-- enfant concerné (_notif_family_parents : titulaires et parents actifs,
-- jamais les proches, y compris pour 'sante').
-- Modifications en rafale : la première part immédiatement ; les suivantes
-- sont fusionnées dans UNE tâche différée qui part 2 minutes après la
-- précédente (texte calculé à la livraison, sur l'état final). Ajouté puis
-- annulé avant tout envoi : rien n'est envoyé.
create or replace function public._notif_calendar_shared(p_event_id uuid, p_author uuid, p_recipients uuid[], p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid;
  v_group text := 'cal:' || p_event_id::text;
  v_job   bigint;
  v_prev  text;
  v_last  timestamptz;
begin
  foreach v_uid in array coalesce(p_recipients, '{}'::uuid[]) loop
    perform pg_advisory_xact_lock(hashtextextended('notif:cal:' || v_uid::text || ':' || p_event_id::text, 0));
    v_job := null;
    select j.id, j.payload ->> 'action' into v_job, v_prev
      from public.notification_jobs j
     where j.user_id = v_uid and j.event = 'calendar_shared' and j.group_key = v_group and j.status = 'pending'
     order by j.id desc
     limit 1;
    if v_job is not null then
      if p_action = 'deleted' and v_prev = 'created' then
        update public.notification_jobs
           set status = 'skipped', last_error = 'cancelled_before_send', processed_at = now()
         where id = v_job;
      else
        update public.notification_jobs
           set payload = payload || jsonb_build_object('action',
                 case when p_action = 'deleted' then 'deleted'
                      when v_prev = 'created' then 'created'
                      else p_action end)
         where id = v_job;
      end if;
    else
      select max(coalesce(j.processed_at, j.locked_at)) into v_last
        from public.notification_jobs j
       where j.user_id = v_uid and j.event = 'calendar_shared' and j.group_key = v_group
         and j.status in ('done', 'processing');
      perform public._notif_enqueue(
        v_uid, 'calendar_shared',
        jsonb_build_object('event_id', p_event_id, 'action', p_action, 'actor_id', p_author),
        format('calendar_shared:%s:%s:%s:%s', p_event_id, v_uid, txid_current(), floor(extract(epoch from clock_timestamp()) * 1000)::bigint),
        greatest(now(), coalesce(v_last + interval '2 minutes', now())),
        p_author, v_group);
    end if;
  end loop;
end;
$$;
revoke all on function public._notif_calendar_shared(uuid, uuid, uuid[], text) from public, anon, authenticated;
grant execute on function public._notif_calendar_shared(uuid, uuid, uuid[], text) to service_role;

create or replace function public.notif_on_calendar_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text;
begin
  begin
    if tg_op = 'INSERT' then
      if new.family_shared and new.deleted_at is null then v_action := 'created'; end if;
    elsif old.deleted_at is null and new.deleted_at is not null then
      if old.family_shared then v_action := 'deleted'; end if;
    elsif new.deleted_at is null and new.family_shared and not old.family_shared then
      v_action := 'created';
    elsif new.deleted_at is null and new.family_shared
          and (old.start_at, old.end_at, old.lieu, old.all_day) is distinct from (new.start_at, new.end_at, new.lieu, new.all_day) then
      v_action := 'updated';
    end if;

    if v_action is not null then
      perform public._notif_calendar_shared(
        new.id, new.user_id,
        array(select public._notif_family_parents(new.user_id, new.children_ids)),
        v_action);
    end if;
  exception when others then
    raise warning 'notif_on_calendar_change : %', sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function public.notif_on_calendar_change() from public, anon, authenticated;

drop trigger if exists trg_notif_calendar_change on public.calendar_events;
create trigger trg_notif_calendar_change
  after insert or update of start_at, end_at, lieu, all_day, family_shared, deleted_at
  on public.calendar_events
  for each row execute function public.notif_on_calendar_change();

create or replace function public.notif_on_journal_expense_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_children uuid[];
begin
  begin
    if new.family_shared and (tg_op = 'INSERT' or not old.family_shared
        or (old.amount_cents, old.categorie, old.justificatif) is distinct from (new.amount_cents, new.categorie, new.justificatif)) then
      select e.children_ids into v_children
        from public.journal_entries e
       where e.id = new.entry_id and e.user_id = new.user_id and e.deleted_at is null;
      if v_children is not null then
        perform public._notif_activity(
          array(select public._notif_family_parents(new.user_id, v_children)),
          new.user_id, 'expense', new.entry_id::text,
          case when tg_op = 'INSERT' or not old.family_shared then 'created' else 'updated' end);
      end if;
    end if;
  exception when others then
    raise warning 'notif_on_journal_expense_change : %', sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function public.notif_on_journal_expense_change() from public, anon, authenticated;

drop trigger if exists trg_notif_journal_expense_change on public.journal_expenses;
create trigger trg_notif_journal_expense_change
  after insert or update of amount_cents, categorie, justificatif, family_shared on public.journal_expenses
  for each row execute function public.notif_on_journal_expense_change();

create or replace function public.notif_on_garde_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    if tg_op = 'INSERT' or new.config is distinct from old.config then
      perform public._notif_activity(
        array(select public._notif_linked_parents(new.user_id)),
        new.user_id, 'garde', new.user_id::text,
        case when tg_op = 'INSERT' then 'created' else 'updated' end);
    end if;
  exception when others then
    raise warning 'notif_on_garde_change : %', sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function public.notif_on_garde_change() from public, anon, authenticated;

drop trigger if exists trg_notif_garde_change on public.garde_configs;
create trigger trg_notif_garde_change
  after insert or update of config on public.garde_configs
  for each row execute function public.notif_on_garde_change();

-- --- 7.6 Sécurité et bienvenue (public.users) ------------------------------
-- Clé : une notification par changement et par transaction (txid). Auteur =
-- l'utilisateur lui-même : son navigateur peut demander la livraison immédiate.
create or replace function public.notif_on_user_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tx text := txid_current()::text;
begin
  begin
    if tg_op = 'INSERT' then
      if new.email_verified and new.deleted_at is null then
        perform public._notif_enqueue(new.id, 'welcome', '{}'::jsonb, format('welcome:%s', new.id), now(), new.id, null);
      end if;
      return null;
    end if;

    -- Inscription vérifiée (e-mail) : bienvenue, une seule fois par compte.
    if new.email_verified and not old.email_verified and new.deleted_at is null then
      perform public._notif_enqueue(new.id, 'welcome', '{}'::jsonb, format('welcome:%s', new.id), now(), new.id, null);
    end if;

    -- Suppression demandée : l'adresse est anonymisée dans la même requête, on garde l'ancienne pour l'alerte.
    if old.deleted_at is null and new.deleted_at is not null then
      perform public._notif_enqueue(new.id, 'security_change',
        jsonb_build_object('change', 'account_deletion_requested', 'notify_email', old.email::text),
        format('security_change:account_deletion_requested:%s:%s', new.id, v_tx), now(), new.id, null);
      return null;
    end if;
    if new.deleted_at is not null then return null; end if;

    -- Changement d'adresse confirmé : l'ancienne adresse est aussi prévenue.
    if new.email is distinct from old.email and old.email is not null then
      perform public._notif_enqueue(new.id, 'security_change',
        jsonb_build_object('change', 'email_changed', 'notify_email', old.email::text),
        format('security_change:email_changed:%s:%s', new.id, v_tx), now(), new.id, null);
    end if;

    if new.mfa_enabled is distinct from old.mfa_enabled then
      perform public._notif_enqueue(new.id, 'security_change',
        jsonb_build_object('change', case when new.mfa_enabled then 'mfa_enabled' else 'mfa_disabled' end),
        format('security_change:mfa:%s:%s', new.id, v_tx), now(), new.id, null);
    end if;
  exception when others then
    raise warning 'notif_on_user_change : %', sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function public.notif_on_user_change() from public, anon, authenticated;

drop trigger if exists trg_notif_user_change on public.users;
create trigger trg_notif_user_change
  after insert or update of email, email_verified, mfa_enabled, deleted_at on public.users
  for each row execute function public.notif_on_user_change();

-- --- 7.7 Sécurité (auth.users : mot de passe, demande de changement d'e-mail)
create or replace function public.notif_on_auth_user_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tx text := txid_current()::text;
begin
  begin
    if new.encrypted_password is distinct from old.encrypted_password then
      perform public._notif_enqueue(new.id, 'security_change',
        jsonb_build_object('change', case when coalesce(old.encrypted_password, '') = '' then 'password_set' else 'password_changed' end),
        format('security_change:password:%s:%s', new.id, v_tx), now(), new.id, null);
    end if;
    if coalesce(new.email_change, '') <> '' and new.email_change is distinct from old.email_change then
      perform public._notif_enqueue(new.id, 'security_change',
        jsonb_build_object('change', 'email_change_requested', 'new_email', left(new.email_change, 254)),
        format('security_change:email_change_requested:%s:%s', new.id, v_tx), now(), new.id, null);
    end if;
  exception when others then
    raise warning 'notif_on_auth_user_change : %', sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function public.notif_on_auth_user_change() from public, anon, authenticated;

drop trigger if exists trg_notif_auth_user_change on auth.users;
create trigger trg_notif_auth_user_change
  after update of encrypted_password, email_change on auth.users
  for each row execute function public.notif_on_auth_user_change();

-- --- 7.8 Sécurité (code du coffre modifié ou supprimé) ---------------------
create or replace function public.notif_on_vault_pin_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    if old.pin_hash is not null and new.pin_hash is distinct from old.pin_hash then
      perform public._notif_enqueue(new.user_id, 'security_change',
        jsonb_build_object('change', case when new.pin_hash is null then 'vault_code_removed' else 'vault_code_changed' end),
        format('security_change:vault_code:%s:%s', new.user_id, txid_current()), now(), new.user_id, null);
    end if;
  exception when others then
    raise warning 'notif_on_vault_pin_change : %', sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function public.notif_on_vault_pin_change() from public, anon, authenticated;

drop trigger if exists trg_notif_vault_pin_change on public.vault_lock_settings;
create trigger trg_notif_vault_pin_change
  after update of pin_hash on public.vault_lock_settings
  for each row execute function public.notif_on_vault_pin_change();

-- --- 7.9 Nouvelle session GoTrue : filet serveur de l'alerte « nouvel appareil »
-- Toute session créée (mot de passe, Google, lien e-mail, appel direct à l'API
-- GoTrue) dépose une tâche 'login_check' différée de 2 min (le temps de la
-- validation 2FA et de l'appel rapide /api/auth/login-check, qui porte le
-- cookie d'appareil). Le cron lit alors la session (notif_session_info),
-- calcule l'empreinte en Node et appelle notif_record_sign_in : déjà vue par la
-- voie rapide → 'duplicate', sinon détection avec l'empreinte seule.
create or replace function public.notif_on_auth_session_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    insert into public.auth_session_captures (session_id, user_id, user_agent, ip)
    values (new.id, new.user_id, left(new.user_agent, 512), left(host(new.ip), 64))
    on conflict (session_id) do nothing;
    perform public._notif_enqueue(
      new.user_id, 'login_check',
      jsonb_build_object('session_id', new.id),
      format('login_check:%s', new.id),
      now() + interval '2 minutes', null, null);
  exception when others then
    raise warning 'notif_on_auth_session_insert : %', sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function public.notif_on_auth_session_insert() from public, anon, authenticated;

-- Création gardée : si le rôle de migration n'a pas le droit de créer un
-- déclencheur sur auth.sessions, la migration continue (voie rapide seule) et
-- l'avertissement l'indique (docs/NOTIFICATIONS.md, « Détection »).
do $$
begin
  drop trigger if exists trg_notif_auth_session_insert on auth.sessions;
  create trigger trg_notif_auth_session_insert
    after insert on auth.sessions
    for each row execute function public.notif_on_auth_session_insert();
exception when insufficient_privilege or undefined_table then
  raise warning '0440 : déclencheur auth.sessions non créé (%). Détection des nouveaux appareils : voie rapide seulement.', sqlerrm;
end $$;


-- =====================================================================
-- RETOUR ARRIÈRE (manuel)
-- =====================================================================
-- drop trigger if exists trg_notif_message_insert on public.messages;
-- drop trigger if exists trg_notif_folder_share on public.vault_folder_shares;
-- drop trigger if exists trg_notif_testimony on public.testimonies;
-- drop trigger if exists trg_notif_family_invite_accepted on public.family_invitations;
-- drop trigger if exists trg_notif_coparent_link_accepted on public.coparent_links;
-- drop trigger if exists trg_notif_calendar_change on public.calendar_events;
-- drop trigger if exists trg_notif_journal_expense_change on public.journal_expenses;
-- drop trigger if exists trg_notif_garde_change on public.garde_configs;
-- drop trigger if exists trg_notif_user_change on public.users;
-- drop trigger if exists trg_notif_auth_user_change on auth.users;
-- drop trigger if exists trg_notif_auth_session_insert on auth.sessions;
-- drop trigger if exists trg_notif_vault_pin_change on public.vault_lock_settings;
-- drop table if exists public.notification_jobs, public.push_subscriptions, public.auth_session_captures;
-- drop index if exists public.uq_notifications_dedupe; alter table public.notifications drop column if exists dedupe_key;
-- drop index if exists public.idx_sessions_user_device, public.idx_sessions_user_device_id, public.idx_calendar_shared_upcoming;
-- alter table public.sessions drop column if exists device_hash, drop column if exists device_id_hash;
-- alter table public.users drop column if exists first_sign_in_at;
-- create policy sessions_delete_self on public.sessions for delete using (auth.uid() = user_id);  -- (0100)
-- grant delete on table public.sessions to authenticated;
-- (puis drop function de chaque fonction notif_* / _notif_*)
