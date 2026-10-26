-- =====================================================================
-- Lien Parental — 0320_google.sql (chantier G)
-- Synchronisation sortante Lien Parental → Google Agenda.
--
--  1. google_connections   : 1 ligne par utilisateur. Jetons OAuth chiffrés
--                            (AES-256-GCM côté serveur, clé hors BDD), état de
--                            la connexion et préférences de synchro.
--  2. calendar_event_links : événement Lien Parental ↔ événement Google
--                            (identifiant mémorisé pour les mises à jour).
--  3. google_sync_queue    : file de réessai simple (1 ligne max par événement).
--  4. claim_google_sync_jobs() : réservation atomique des tâches (SKIP LOCKED).
--
-- Modèle d'accès :
--   * Toutes les ÉCRITURES passent par les routes serveur
--     /api/integrations/google/** avec la clé service_role, après
--     requireAuthedUser() (identité revalidée + aal2 si facteur MFA).
--   * Le client authentifié ne peut que LIRE ses propres lignes, et jamais
--     les colonnes de jetons (privilèges par colonne, cf. 0270 M3).
--   * Politiques RESTRICTIVE mfa_required (cf. 0270 H1).
--
-- Additive et ré-exécutable. Connexion « Se connecter avec Google »
-- (Supabase Auth) : aucune table ici, tout est géré par GoTrue.
-- Rollback : bloc commenté en fin de fichier.
-- =====================================================================


-- --- 1. google_connections ------------------------------------------
create table if not exists public.google_connections (
  user_id                  uuid primary key references public.users(id) on delete cascade,
  status                   text not null default 'active',
  -- Compte Google (claims « sub » et « email » de l'ID token OIDC).
  google_sub               text,
  google_email             text,
  -- Portées réellement accordées (séparées par des espaces).
  scopes                   text not null default '',
  -- Jetons chiffrés : { ciphertext, iv, tag, v } (lib/integrations/google/crypto.ts).
  refresh_token_enc        jsonb,
  access_token_enc         jsonb,
  access_token_expires_at  timestamptz,
  -- Agenda cible : « dedicated » = agenda « Lien Parental » créé par l'app, « primary » = agenda principal.
  target                   text not null default 'dedicated',
  calendar_id              text,
  -- Préférences : types envoyés (valeurs de calendar_event_type) et masquage.
  sync_types               text[] not null default array[
    'visite','appel_video','message','sante','rendez_vous','ecole',
    'activite','sortie','repas','deplacement','anniversaire','autre'
  ]::text[],
  mask_mode                text not null default 'sensitive',
  connected_at             timestamptz,
  last_sync_at             timestamptz,
  last_error_code          text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint chk_gconn_status check (status in ('active', 'reauth_required', 'disconnected')),
  constraint chk_gconn_target check (target in ('dedicated', 'primary')),
  constraint chk_gconn_mask check (mask_mode in ('none', 'sensitive', 'all')),
  constraint chk_gconn_sync_types check (sync_types <@ array[
    'visite','appel_video','message','sante','rendez_vous','ecole',
    'activite','sortie','repas','deplacement','anniversaire','autre'
  ]::text[]),
  -- Une connexion active a forcément un jeton de rafraîchissement.
  constraint chk_gconn_active_token check (status <> 'active' or refresh_token_enc is not null),
  constraint chk_gconn_token_shape check (
    (refresh_token_enc is null or (jsonb_typeof(refresh_token_enc) = 'object'
      and refresh_token_enc ? 'ciphertext' and refresh_token_enc ? 'iv' and refresh_token_enc ? 'tag'))
    and (access_token_enc is null or (jsonb_typeof(access_token_enc) = 'object'
      and access_token_enc ? 'ciphertext' and access_token_enc ? 'iv' and access_token_enc ? 'tag'))
  ),
  constraint chk_gconn_lengths check (
        coalesce(length(google_sub), 0)      <= 255
    and coalesce(length(google_email), 0)    <= 320
    and length(scopes)                       <= 1000
    and coalesce(length(calendar_id), 0)     <= 1024
    and coalesce(length(last_error_code), 0) <= 64
    and pg_column_size(refresh_token_enc)    <= 4096
    and pg_column_size(access_token_enc)     <= 8192
  )
);

drop trigger if exists trg_google_connections_updated_at on public.google_connections;
create trigger trg_google_connections_updated_at
  before update on public.google_connections
  for each row execute function public.handle_updated_at();


-- --- 2. calendar_event_links ----------------------------------------
create table if not exists public.calendar_event_links (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.users(id) on delete cascade,
  event_id              uuid not null references public.calendar_events(id) on delete cascade,
  provider              text not null default 'google',
  external_calendar_id  text not null,
  external_event_id     text not null,
  etag                  text,
  synced_at             timestamptz not null default now(),
  created_at            timestamptz not null default now(),

  constraint chk_cel_provider check (provider = 'google'),
  constraint chk_cel_lengths check (
        length(external_calendar_id) <= 1024
    and length(external_event_id)    <= 1024
    and coalesce(length(etag), 0)    <= 255
  ),
  -- Un événement n'est poussé qu'à un seul endroit par fournisseur.
  constraint uq_cel_event unique (user_id, event_id, provider)
);

-- Lookups : (user_id, event_id, provider) couvert par uq_cel_event.
-- Cascade depuis calendar_events(id) : index sur event_id.
create index if not exists idx_cel_event on public.calendar_event_links(event_id);


-- --- 3. google_sync_queue -------------------------------------------
-- Une ligne par événement à (re)synchroniser. Le travailleur relit toujours
-- l'état courant de l'événement (réconciliation) : `op` n'est qu'indicatif.
-- `enqueued_at` sert de jeton de version : une tâche réservée puis remplacée
-- par une nouvelle demande n'est pas supprimée par erreur.
create table if not exists public.google_sync_queue (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.users(id) on delete cascade,
  event_id         uuid not null references public.calendar_events(id) on delete cascade,
  op               text not null default 'upsert',
  status           text not null default 'pending',
  attempts         integer not null default 0,
  next_attempt_at  timestamptz not null default now(),
  enqueued_at      timestamptz not null default now(),
  last_error_code  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint chk_gsq_op check (op in ('upsert', 'delete')),
  constraint chk_gsq_status check (status in ('pending', 'failed')),
  constraint chk_gsq_attempts check (attempts between 0 and 100),
  constraint chk_gsq_error check (coalesce(length(last_error_code), 0) <= 64),
  constraint uq_gsq_event unique (user_id, event_id)
);

create index if not exists idx_gsq_due
  on public.google_sync_queue(user_id, next_attempt_at)
  where status = 'pending';
create index if not exists idx_gsq_event on public.google_sync_queue(event_id);

drop trigger if exists trg_google_sync_queue_updated_at on public.google_sync_queue;
create trigger trg_google_sync_queue_updated_at
  before update on public.google_sync_queue
  for each row execute function public.handle_updated_at();


-- --- 4. RLS + privilèges --------------------------------------------
alter table public.google_connections   enable row level security;
alter table public.calendar_event_links enable row level security;
alter table public.google_sync_queue    enable row level security;

-- Lecture propriétaire uniquement. Aucune policy INSERT/UPDATE/DELETE :
-- les écritures passent par le service_role (qui contourne la RLS).
drop policy if exists google_connections_select_self on public.google_connections;
create policy google_connections_select_self on public.google_connections
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists calendar_event_links_select_self on public.calendar_event_links;
create policy calendar_event_links_select_self on public.calendar_event_links
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists google_sync_queue_select_self on public.google_sync_queue;
create policy google_sync_queue_select_self on public.google_sync_queue
  for select to authenticated using ((select auth.uid()) = user_id);

do $$
declare
  t text;
begin
  foreach t in array array['google_connections', 'calendar_event_links', 'google_sync_queue'] loop
    execute format('drop policy if exists mfa_required on public.%I', t);
    execute format(
      'create policy mfa_required on public.%I as restrictive for all to authenticated '
      'using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()))',
      t
    );
  end loop;
end $$;

-- Les privilèges par défaut de Supabase accordent tout à anon/authenticated :
-- on les retire, puis on accorde la lecture colonne par colonne (un REVOKE de
-- colonne est sans effet tant qu'un privilège de table existe, cf. 0270 M3).
revoke all on table public.google_connections   from public, anon, authenticated;
revoke all on table public.calendar_event_links from public, anon, authenticated;
revoke all on table public.google_sync_queue    from public, anon, authenticated;

-- Jamais : refresh_token_enc, access_token_enc, access_token_expires_at, google_sub.
grant select (user_id, status, google_email, scopes, target, calendar_id, sync_types, mask_mode,
              connected_at, last_sync_at, last_error_code, created_at, updated_at)
  on table public.google_connections to authenticated;
grant select on table public.calendar_event_links to authenticated;
grant select (id, user_id, event_id, op, status, attempts, next_attempt_at, last_error_code, created_at)
  on table public.google_sync_queue to authenticated;

grant all on table public.google_connections   to service_role;
grant all on table public.calendar_event_links to service_role;
grant all on table public.google_sync_queue    to service_role;


-- --- 5. Réservation atomique des tâches -----------------------------
-- Renvoie jusqu'à p_limit tâches dues de l'utilisateur et les « loue »
-- 2 minutes (next_attempt_at repoussé) : deux traitements simultanés ne
-- prennent jamais la même tâche (FOR UPDATE SKIP LOCKED).
create or replace function public.claim_google_sync_jobs(p_user_id uuid, p_limit integer)
returns table (id uuid, event_id uuid, op text, attempts integer, enqueued_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if p_user_id is null or p_limit is null or p_limit not between 1 and 50 then
    raise exception 'Paramètres invalides' using errcode = '22023';
  end if;

  return query
  with due as (
    select q.id
      from public.google_sync_queue q
     where q.user_id = p_user_id
       and q.status = 'pending'
       and q.next_attempt_at <= now()
     order by q.next_attempt_at
     limit p_limit
     for update skip locked
  )
  update public.google_sync_queue q
     set next_attempt_at = now() + interval '2 minutes'
    from due
   where q.id = due.id
  returning q.id, q.event_id, q.op, q.attempts, q.enqueued_at;
end;
$$;

revoke all on function public.claim_google_sync_jobs(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_google_sync_jobs(uuid, integer) to service_role;

comment on table public.google_connections is
  'Connexion Google Agenda (1/utilisateur). Jetons chiffrés AES-256-GCM côté serveur ; colonnes de jetons non lisibles par authenticated (0320).';
comment on function public.claim_google_sync_jobs(uuid, integer) is
  'Réserve les tâches de synchro Google dues d''un utilisateur (bail 2 min). service_role uniquement (0320).';


-- =====================================================================
-- VÉRIFICATION (SQL Editor)
-- =====================================================================
-- select relname, relrowsecurity from pg_class
--  where relname in ('google_connections','calendar_event_links','google_sync_queue');   -- true x3
-- -- Doit renvoyer false (jetons illisibles côté client) :
-- select has_column_privilege('authenticated', 'public.google_connections', 'refresh_token_enc', 'select');
-- select has_function_privilege('authenticated', 'public.claim_google_sync_jobs(uuid, integer)', 'execute');


-- =====================================================================
-- ROLLBACK (manuel, dans l'ordre). Révoquer d'abord les jetons côté Google
-- (bouton « Déconnecter » ou https://myaccount.google.com/permissions),
-- sinon l'accès accordé reste valable chez Google après suppression.
-- =====================================================================
-- drop function if exists public.claim_google_sync_jobs(uuid, integer);
-- drop table if exists public.google_sync_queue;
-- drop table if exists public.calendar_event_links;
-- drop table if exists public.google_connections;
-- =====================================================================
