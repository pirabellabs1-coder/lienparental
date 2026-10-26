-- =====================================================================
-- Lien Parental — 0270_security_hardening.sql
-- Correctifs de l'audit de sécurité (C1, H1, H2, M1–M5, B1).
--
-- Principes :
--   * aucune migration antérieure n'est modifiée : on remplace / révoque ici ;
--   * ré-exécutable : `if exists`, `drop policy if exists`, blocs DO qui
--     ignorent les objets déjà présents, `on conflict do nothing` ;
--   * les contraintes posées sur des données existantes sont NOT VALID
--     (aucun verrou long, aucune ligne historique rejetée) ; la validation
--     est décrite en commentaire et tentée seulement quand elle est sûre.
--
-- Déploiement : appliquer CETTE migration en même temps que le code qui
-- l'accompagne (routes /api/temoin/** en service_role, lib/ai/* sur
-- ai_usage). Entre les deux, le parcours témoin renvoie 503 (fail-closed).
--
-- Rollback : bloc commenté en fin de fichier.
-- =====================================================================


-- =====================================================================
-- C1. Vue publique témoin : contournement de la RLS
-- =====================================================================
-- public_testimony_request_view (0101) est exécutée avec les droits de son
-- propriétaire (pas de security_invoker) : elle exposait à anon le jeton et
-- message_parent de TOUTES les demandes actives. Inutilisée par le code.
drop view if exists public.public_testimony_request_view;


-- =====================================================================
-- H1. MFA appliquée en base (aal2 exigé dès qu'un facteur est vérifié)
-- =====================================================================
-- Vrai si la session courante est aal2, OU si l'utilisateur n'a aucun
-- facteur MFA vérifié (la 2FA est optionnelle). SECURITY DEFINER : lecture
-- de auth.mfa_factors, non accessible au rôle authenticated.
create or replace function public.mfa_satisfied()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
      or not exists (
        select 1
          from auth.mfa_factors f
         where f.user_id = auth.uid()
           and f.status = 'verified'
      );
$$;

revoke all on function public.mfa_satisfied() from public, anon;
grant execute on function public.mfa_satisfied() to authenticated, service_role;

comment on function public.mfa_satisfied() is
  'true si aal2, ou si aucun facteur MFA vérifié. Utilisée par les politiques RESTRICTIVE mfa_required (0270).';

-- Politique RESTRICTIVE (combinée en ET avec les politiques permissives
-- existantes) sur chaque table contenant des données personnelles.
-- `(select ...)` : évaluée une fois par requête (initPlan), pas par ligne.
-- service_role contourne la RLS : routes serveur et webhooks inchangés.
-- Tables absentes (environnement partiel) : ignorées.
do $$
declare
  t text;
begin
  foreach t in array array[
    'users', 'preferences',
    'children', 'child_vaccinations', 'child_treatments',
    'journal_entries', 'journal_expenses', 'calendar_events',
    'categories', 'documents', 'shares',
    'testimony_requests', 'testimonies', 'testimony_reviews',
    'coparent_links', 'conversations', 'messages',
    'lawyer_shares', 'lawyer_share_access_log',
    'ai_analyses',
    'garde_configs', 'expenses', 'pension_payments',
    'guide_progress',
    'subscriptions', 'payments', 'billing_customers',
    'notifications', 'sessions', 'support_tickets', 'audit_log'
  ]
  loop
    if to_regclass(format('public.%I', t)) is not null then
      execute format('drop policy if exists mfa_required on public.%I', t);
      execute format(
        'create policy mfa_required on public.%I as restrictive for all to authenticated '
        'using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()))',
        t
      );
    end if;
  end loop;
end $$;

-- Buckets privés (Storage) : même exigence.
drop policy if exists "private buckets mfa required" on storage.objects;
create policy "private buckets mfa required" on storage.objects
  as restrictive
  for all to authenticated
  using (
    bucket_id not in ('documents', 'avatars', 'message-attachments', 'temoignage-attachments')
    or (select public.mfa_satisfied())
  )
  with check (
    bucket_id not in ('documents', 'avatars', 'message-attachments', 'temoignage-attachments')
    or (select public.mfa_satisfied())
  );


-- =====================================================================
-- H2. Quota IA : registre d'usage non modifiable par l'utilisateur
-- =====================================================================
-- Le quota était calculé sur ai_analyses, que l'utilisateur pouvait
-- supprimer / modifier (policy for all, 0100) → quota réinitialisable.
-- ai_usage est en écriture service_role uniquement ; l'utilisateur ne
-- peut que lire ses propres lignes.
create table if not exists public.ai_usage (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade,
  kind         text not null check (kind in ('analysis')),
  -- Analyse réservée (permet le remboursement d'une réservation échouée).
  -- Pas de FK : l'analyse peut être purgée, la consommation reste comptée.
  analysis_id  uuid,
  created_at   timestamptz not null default now()
);

create index if not exists idx_ai_usage_user_kind_created
  on public.ai_usage(user_id, kind, created_at desc);
create unique index if not exists uq_ai_usage_analysis
  on public.ai_usage(analysis_id) where analysis_id is not null;

alter table public.ai_usage enable row level security;

drop policy if exists ai_usage_select_self on public.ai_usage;
create policy ai_usage_select_self on public.ai_usage
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists mfa_required on public.ai_usage;
create policy mfa_required on public.ai_usage
  as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));

-- Les privilèges par défaut de Supabase accordent tout à anon/authenticated
-- sur les nouvelles tables : on les retire explicitement.
revoke all on table public.ai_usage from public, anon, authenticated;
grant select on table public.ai_usage to authenticated;
grant all on table public.ai_usage to service_role;

-- Reprise de l'historique : les analyses déjà comptées dans la fenêtre
-- glissante de 30 jours restent décomptées (pas de remise à zéro).
insert into public.ai_usage (user_id, kind, analysis_id, created_at)
select a.user_id, 'analysis', a.id, a.cycle
  from public.ai_analyses a
 where a.cycle > now() - interval '30 days'
   and coalesce(a.resultat ->> 'status', '') <> 'pending'
on conflict (analysis_id) where analysis_id is not null do nothing;

-- Réservation atomique : verrou transactionnel par utilisateur, comptage,
-- insertion. Deux requêtes simultanées ne peuvent pas dépasser p_limit.
-- Renvoie l'id de la réservation, ou NULL si le quota est atteint.
create or replace function public.reserve_ai_usage(
  p_user_id      uuid,
  p_kind         text,
  p_limit        integer,
  p_window_days  integer,
  p_analysis_id  uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used  integer;
  v_id    uuid;
begin
  if p_user_id is null or p_kind is null or p_limit is null or p_limit < 0
     or p_window_days is null or p_window_days not between 1 and 366 then
    raise exception 'Paramètres de quota invalides' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ai_usage:' || p_user_id::text || ':' || p_kind, 0));

  select count(*)::int into v_used
    from public.ai_usage
   where user_id = p_user_id
     and kind = p_kind
     and created_at > now() - make_interval(days => p_window_days);

  if v_used >= p_limit then
    return null;
  end if;

  insert into public.ai_usage (user_id, kind, analysis_id)
  values (p_user_id, p_kind, p_analysis_id)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.reserve_ai_usage(uuid, text, integer, integer, uuid) from public, anon, authenticated;
grant execute on function public.reserve_ai_usage(uuid, text, integer, integer, uuid) to service_role;

-- ai_analyses : plus de DELETE ni d'UPDATE libre côté client.
-- Seule la colonne `archived` reste modifiable (archivage depuis l'historique,
-- lib/ai/analyses.ts#setArchived). Fin d'analyse, fil de discussion,
-- suppression (pierre tombale) et purges passent par le service_role après
-- contrôle de propriété côté serveur.
-- NB : un REVOKE de colonne est sans effet tant qu'un privilège de TABLE
-- existe : on retire donc le privilège de table puis on accorde la colonne.
revoke update, delete, truncate on table public.ai_analyses from anon, authenticated;
grant update (archived) on table public.ai_analyses to authenticated;


-- =====================================================================
-- M1. Parcours témoin : fonctions réservées au service_role
-- =====================================================================
-- Les routes /api/temoin/[token]/** appellent ces fonctions avec le client
-- service_role (limitation de débit par IP côté serveur, ip_hash calculé
-- côté serveur). La clé anon ne peut plus les appeler directement (ce qui
-- contournait la limitation de débit et permettait d'injecter un ip_hash).
revoke all on function public.get_testimony_request_by_token(text) from public, anon, authenticated;
grant execute on function public.get_testimony_request_by_token(text) to service_role;

revoke all on function public.get_testimony_request_people(text) from public, anon, authenticated;
grant execute on function public.get_testimony_request_people(text) to service_role;

-- Utilisée uniquement depuis record_testimony_submission (SECURITY DEFINER).
revoke all on function public.generate_testimony_reference() from public, anon, authenticated;
grant execute on function public.generate_testimony_reference() to service_role;

-- Nouvelle version : ip_hash / user_agent en paramètres explicites (jamais
-- repris du payload), plafond de 20 envois par demande vérifié sous le
-- verrou FOR UPDATE de la demande (plus de course entre comptage et insert).
drop function if exists public.record_testimony_submission(text, jsonb);

create or replace function public.record_testimony_submission(
  p_token              text,
  p_testimony_payload  jsonb,
  p_ip_hash            text default null,
  p_user_agent         text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  c_max_submissions constant integer := 20;
  v_req     public.testimony_requests;
  v_count   integer;
  v_new_id  uuid;
begin
  if p_token is null or length(p_token) < 16 then
    raise exception 'Invalid token' using errcode = '22023';
  end if;
  if p_testimony_payload is null or jsonb_typeof(p_testimony_payload) <> 'object' then
    raise exception 'Missing payload' using errcode = '22023';
  end if;

  -- Verrou de ligne : sérialise les envois concurrents sur une même demande.
  select *
    into v_req
    from public.testimony_requests
   where token = p_token
     and revoked_at is null
     and expires_at > now()
     and status in ('pending', 'opened', 'in_progress')
   limit 1
   for update;

  if not found then
    raise exception 'Testimony request not found or inactive' using errcode = 'P0002';
  end if;

  select count(*)::int into v_count
    from public.testimonies
   where request_id = v_req.id;

  if v_count >= c_max_submissions then
    raise exception 'Submission limit reached' using errcode = '54000';
  end if;

  insert into public.testimonies (
    request_id, user_id, reference, temoin, reponses,
    texte_original, texte_ia, texte_envoye, attachments, ip_hash, user_agent
  ) values (
    v_req.id,
    v_req.user_id,
    public.generate_testimony_reference(),
    coalesce(p_testimony_payload -> 'temoin',   '{}'::jsonb),
    coalesce(p_testimony_payload -> 'reponses', '{}'::jsonb),
    coalesce(p_testimony_payload ->> 'texte_original', ''),
    nullif(p_testimony_payload ->> 'texte_ia', ''),
    coalesce(p_testimony_payload ->> 'texte_envoye', ''),
    coalesce(p_testimony_payload -> 'attachments', '[]'::jsonb),
    -- HMAC-SHA256 hexadécimal calculé par le serveur ; tout autre format est ignoré.
    case when p_ip_hash ~ '^[0-9a-f]{64}$' then p_ip_hash end,
    nullif(left(p_user_agent, 200), '')
  )
  returning id into v_new_id;

  update public.testimony_requests
     set submitted_at = now(),
         updated_at   = now()
   where id = v_req.id;

  return v_new_id;
end;
$$;

revoke all on function public.record_testimony_submission(text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.record_testimony_submission(text, jsonb, text, text) to service_role;

comment on function public.record_testimony_submission(text, jsonb, text, text) is
  'Insertion d''un témoignage via jeton. Réservée au service_role (/api/temoin/[token]). Plafond 20 envois / demande (54000).';


-- =====================================================================
-- M2. Fonctions de maintenance : service_role uniquement
-- =====================================================================
-- purge_expired_trash : cron / worker serveur (aucun appel client).
-- compute_ai_cycle_window : non utilisée par le code (quota → ai_usage) ;
-- en SECURITY DEFINER avec p_user_id libre, elle révélait le plan et
-- l'usage IA de n'importe quel utilisateur.
revoke all on function public.purge_expired_trash() from public, anon, authenticated;
grant execute on function public.purge_expired_trash() to service_role;

revoke all on function public.compute_ai_cycle_window(uuid) from public, anon, authenticated;
grant execute on function public.compute_ai_cycle_window(uuid) to service_role;


-- =====================================================================
-- M3. documents.storage_path : chemin borné au propriétaire
-- =====================================================================
-- Un storage_path modifiable permettait de faire signer par le service_role
-- (liens de partage) l'objet d'un autre utilisateur.
do $$
begin
  alter table public.documents
    add constraint chk_documents_storage_path_owner check (
      starts_with(storage_path, user_id::text || '/')
      and position('..' in storage_path) = 0
    ) not valid;
exception when duplicate_object then null;
end $$;
-- Après contrôle des données existantes :
--   select id from public.documents
--    where not (starts_with(storage_path, user_id::text || '/') and position('..' in storage_path) = 0);
--   alter table public.documents validate constraint chk_documents_storage_path_owner;

-- storage_path et user_id deviennent non modifiables côté client. Le
-- privilège de table est retiré puis ré-accordé colonne par colonne
-- (toutes sauf id, user_id, storage_path, created_at). Une colonne ajoutée
-- plus tard devra recevoir son propre `grant update (col)`.
revoke update on table public.documents from anon, authenticated;
do $$
declare
  v_cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into v_cols
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'documents'
     and column_name not in ('id', 'user_id', 'storage_path', 'created_at');
  if v_cols is not null then
    execute format('grant update (%s) on table public.documents to authenticated', v_cols);
  end if;
end $$;


-- =====================================================================
-- M4. accept_coparent_invite : l'invitation est nominative
-- =====================================================================
-- Avant : quiconque obtenait le lien devenait co-parent. Désormais l'e-mail
-- du JWT doit être celui de l'invitation ET être vérifié ; sinon P0002
-- (réponse indistincte d'une invitation inconnue / expirée).
create or replace function public.accept_coparent_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link       public.coparent_links%rowtype;
  v_conv       uuid;
  v_jwt_email  text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_verified   boolean;
begin
  if auth.uid() is null then
    raise exception 'Non authentifié' using errcode = '42501';
  end if;
  if p_token is null or length(p_token) <> 32 then
    raise exception 'Invitation invalide' using errcode = 'P0002';
  end if;

  select (u.email_confirmed_at is not null and lower(u.email) = v_jwt_email)
    into v_verified
    from auth.users u
   where u.id = auth.uid();

  if v_jwt_email = '' or coalesce(v_verified, false) is not true then
    raise exception 'Invitation invalide ou expirée' using errcode = 'P0002';
  end if;

  select * into v_link
    from public.coparent_links
   where token = p_token
     and status = 'pending'
     and expires_at > now()
   for update;

  if not found
     or v_link.user_id = auth.uid()
     or lower(v_link.invitee_email::text) <> v_jwt_email then
    raise exception 'Invitation invalide ou expirée' using errcode = 'P0002';
  end if;

  update public.coparent_links
     set status = 'accepted',
         coparent_user_id = auth.uid(),
         accepted_at = now()
   where id = v_link.id;

  select id into v_conv
    from public.conversations
   where least(parent_a, parent_b) = least(v_link.user_id, auth.uid())
     and greatest(parent_a, parent_b) = greatest(v_link.user_id, auth.uid());

  if v_conv is null then
    insert into public.conversations (parent_a, parent_b)
    values (v_link.user_id, auth.uid())
    returning id into v_conv;
  end if;

  return v_conv;
end;
$$;

revoke all on function public.accept_coparent_invite(text) from public, anon;
grant execute on function public.accept_coparent_invite(text) to authenticated;


-- =====================================================================
-- M5. lawyer_shares.access_code_hash : format exact
-- =====================================================================
-- scrypt$16384$8$1$<sel 16 o = 22 car. base64url>$<hachage 32 o = 43 car.>
-- Empêche un paramétrage affaibli (N/r/p) ou un hachage tronqué.
do $$
begin
  alter table public.lawyer_shares
    add constraint chk_lawyer_shares_code_hash_format check (
      access_code_hash is null
      or access_code_hash ~ '^scrypt\$16384\$8\$1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$'
    ) not valid;
exception when duplicate_object then null;
end $$;

-- Toutes les valeurs existantes viennent de hashAccessCode() (même format) :
-- validation tentée, sans bloquer la migration si une ligne non conforme existe.
do $$
begin
  alter table public.lawyer_shares validate constraint chk_lawyer_shares_code_hash_format;
exception when check_violation then
  raise notice 'chk_lawyer_shares_code_hash_format laissée NOT VALID : lignes non conformes à révoquer puis VALIDATE.';
end $$;

-- Le comptage des échecs (route /api/partage/[token]) s'appuie sur
-- idx_lawyer_share_access_share (share_id, accessed_at desc), déjà présent (0230).


-- =====================================================================
-- B1. guard_users_plan : SECURITY INVOKER
-- =====================================================================
-- En SECURITY DEFINER, current_user valait toujours le propriétaire
-- (postgres) : la clause `current_user not in ('postgres', ...)` était
-- toujours fausse et le garde-fou ne bloquait jamais rien. En INVOKER,
-- current_user est le rôle PostgREST réel.
create or replace function public.guard_users_plan()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.plan is distinct from old.plan
     and current_user in ('authenticated', 'anon') then
    raise exception 'users.plan is read-only for clients'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
-- Le trigger trg_users_guard_plan (0220) référence la fonction par nom : inchangé.


-- =====================================================================
-- CONTRÔLE CI (à exécuter après chaque migration ; résultat attendu : vide
-- hormis les exceptions documentées — is_admin, list_my_sessions, etc.
-- pour authenticated ; aucune ligne pour anon).
-- =====================================================================
-- -- Fonctions SECURITY DEFINER exécutables par anon :
-- select n.nspname as schema, p.proname as function,
--        pg_get_function_identity_arguments(p.oid) as args
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--  where p.prosecdef
--    and n.nspname = 'public'
--    and has_function_privilege('anon', p.oid, 'execute')
--  order by 2;
--
-- -- Fonctions SECURITY DEFINER exécutables par authenticated (à revoir une à une) :
-- select p.proname, pg_get_function_identity_arguments(p.oid)
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where p.prosecdef and n.nspname = 'public'
--    and has_function_privilege('authenticated', p.oid, 'execute')
--  order by 1;
--
-- -- Vues lisibles par anon (une vue sans security_invoker contourne la RLS) :
-- select c.relname as view,
--        coalesce(c.reloptions::text, '') as options
--   from pg_class c
--   join pg_namespace n on n.oid = c.relnamespace
--  where c.relkind in ('v', 'm')
--    and n.nspname = 'public'
--    and has_table_privilege('anon', c.oid, 'select')
--  order by 1;


-- =====================================================================
-- ROLLBACK (manuel, dans l'ordre ; ré-ouvre les failles corrigées)
-- =====================================================================
-- -- B1
-- -- (ré-appliquer la définition de guard_users_plan de 0220_billing.sql)
-- -- M5
-- alter table public.lawyer_shares drop constraint if exists chk_lawyer_shares_code_hash_format;
-- -- M4 : ré-appliquer accept_coparent_invite de 0230_messages_partages.sql
-- -- M3
-- alter table public.documents drop constraint if exists chk_documents_storage_path_owner;
-- grant update on table public.documents to authenticated;
-- -- M2
-- grant execute on function public.purge_expired_trash() to authenticated;
-- grant execute on function public.compute_ai_cycle_window(uuid) to authenticated;
-- -- M1 (et remettre l'ancien code des routes /api/temoin, client anon)
-- drop function if exists public.record_testimony_submission(text, jsonb, text, text);
-- -- puis ré-appliquer record_testimony_submission(text, jsonb) de 0101_functions.sql
-- grant execute on function public.get_testimony_request_by_token(text) to anon, authenticated;
-- grant execute on function public.get_testimony_request_people(text) to anon, authenticated;
-- grant execute on function public.generate_testimony_reference() to public;
-- -- H2 (et remettre l'ancien code lib/ai/quota.ts / analyses.ts)
-- grant update, delete on table public.ai_analyses to authenticated;
-- drop function if exists public.reserve_ai_usage(uuid, text, integer, integer, uuid);
-- drop table if exists public.ai_usage;
-- -- H1
-- drop policy if exists "private buckets mfa required" on storage.objects;
-- do $$ declare t text; begin
--   for t in select tablename from pg_policies where schemaname = 'public' and policyname = 'mfa_required' loop
--     execute format('drop policy if exists mfa_required on public.%I', t);
--   end loop; end $$;
-- drop function if exists public.mfa_satisfied();
-- -- C1 : ne PAS recréer public_testimony_request_view (faille critique).
-- =====================================================================
