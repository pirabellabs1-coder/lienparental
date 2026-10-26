-- =====================================================================
-- Lien Parental — 0200_auth_profiles.sql
-- Branchement Supabase Auth ↔ profil applicatif.
--
--  1. Colonnes de profil complémentaires (écran « Informations »)
--     + préférences d'interface (jsonb `ui`).
--  2. Trigger auth.users INSERT  → crée public.users + public.preferences.
--  3. Trigger auth.users UPDATE  → synchronise email / email_verified.
--  4. Trigger auth.mfa_factors   → synchronise users.mfa_enabled.
--  5. Privilèges par colonne : un utilisateur ne peut modifier QUE ses
--     champs de profil (jamais plan / email / deleted_at / mfa_enabled…).
--     Corrige une escalade de privilège : la policy users_update_self
--     (0100) autorisait `update users set plan = 'admin'` côté client,
--     or is_admin() (0102) lit précisément users.plan.
--  6. RPC sessions : liste / révocation des sessions de l'utilisateur.
--  7. Purge des comptes supprimés depuis plus de 30 jours (cron, service_role).
--
-- Idempotent : peut être rejoué sans effet de bord.
-- Rollback : voir le bloc commenté en fin de fichier.
-- =====================================================================


-- --- 1. Colonnes de profil -------------------------------------------
-- Toutes facultatives (nullable) : ajout sans réécriture de table, sans
-- verrou long — compatible trafic en production.
alter table public.users add column if not exists date_naissance       date;
alter table public.users add column if not exists genre                text;
alter table public.users add column if not exists situation_familiale  text;
alter table public.users add column if not exists telephone            text;
alter table public.users add column if not exists adresse              text;
alter table public.users add column if not exists code_postal          text;
alter table public.users add column if not exists ville                text;
alter table public.users add column if not exists pays                 text;

do $$ begin
  alter table public.users add constraint users_profile_lengths check (
        coalesce(length(prenom), 0)              <= 80
    and coalesce(length(nom), 0)                 <= 80
    and coalesce(length(photo_url), 0)           <= 300
    and coalesce(length(genre), 0)               <= 20
    and coalesce(length(situation_familiale), 0) <= 30
    and coalesce(length(telephone), 0)           <= 30
    and coalesce(length(adresse), 0)             <= 200
    and coalesce(length(code_postal), 0)         <= 12
    and coalesce(length(ville), 0)               <= 100
    and coalesce(length(pays), 0)                <= 2
  ) not valid;   -- NOT VALID : n'analyse pas les lignes existantes (pas de scan bloquant)
exception when duplicate_object then null; end $$;

-- Préférences d'interface non typées (fuseau, format de date, couleur,
-- taille du texte, sujets de notification…). Les colonnes typées de 0002
-- (theme, langue, notif_*) restent la source de vérité pour le serveur.
alter table public.preferences add column if not exists ui jsonb not null default '{}'::jsonb;

do $$ begin
  alter table public.preferences add constraint preferences_ui_size check (pg_column_size(ui) <= 8192) not valid;
exception when duplicate_object then null; end $$;


-- --- 2. Création du profil à l'inscription ---------------------------
-- SECURITY DEFINER : s'exécute avec les droits du propriétaire (postgres)
-- pour écrire dans public.users malgré l'absence de policy INSERT.
-- Les métadonnées (prenom/nom) sont fournies par le client à signUp() :
-- on les tronque et on ne leur accorde aucune valeur d'autorisation.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prenom text := nullif(left(btrim(coalesce(new.raw_user_meta_data->>'prenom', '')), 80), '');
  v_nom    text := nullif(left(btrim(coalesce(new.raw_user_meta_data->>'nom', '')), 80), '');
begin
  insert into public.users (id, email, prenom, nom, email_verified)
  values (new.id, new.email, v_prenom, v_nom, new.email_confirmed_at is not null)
  on conflict (id) do nothing;

  insert into public.preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_auth_user_created on auth.users;
create trigger trg_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();


-- --- 3. Synchronisation e-mail / vérification ------------------------
-- Changement d'e-mail (updateUser({ email }) confirmé) et confirmation
-- de l'inscription (verifyOtp) → reflétés dans public.users.
-- Les comptes en cours de suppression (deleted_at) ne sont pas touchés :
-- leur e-mail est anonymisé côté public.users.
create or replace function public.handle_auth_user_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is distinct from old.email
     or new.email_confirmed_at is distinct from old.email_confirmed_at then
    update public.users
       set email          = coalesce(new.email, email),
           email_verified = new.email_confirmed_at is not null
     where id = new.id
       and deleted_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_auth_user_updated on auth.users;
create trigger trg_auth_user_updated
  after update of email, email_confirmed_at on auth.users
  for each row execute function public.handle_auth_user_updated();


-- --- 4. Synchronisation MFA ------------------------------------------
create or replace function public.handle_mfa_factor_change()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user uuid := coalesce(new.user_id, old.user_id);
begin
  update public.users
     set mfa_enabled = exists (
       select 1 from auth.mfa_factors f
        where f.user_id = v_user and f.status = 'verified'
     )
   where id = v_user;
  return null;
end;
$$;

drop trigger if exists trg_mfa_factor_change on auth.mfa_factors;
create trigger trg_mfa_factor_change
  after insert or update of status or delete on auth.mfa_factors
  for each row execute function public.handle_mfa_factor_change();


-- --- 5. Privilèges par colonne ---------------------------------------
-- RLS filtre les LIGNES ; les GRANT filtrent les COLONNES. Les deux sont
-- nécessaires : sans ceci, un utilisateur pourrait s'auto-promouvoir
-- (plan = 'admin' / 'premium'), changer son e-mail sans vérification ou
-- effacer son marqueur de suppression.
revoke insert, update, delete on public.users from anon, authenticated;
grant select on public.users to authenticated;
grant update (prenom, nom, photo_url, date_naissance, genre, situation_familiale,
              telephone, adresse, code_postal, ville, pays)
  on public.users to authenticated;

-- Abonnements : lecture seule côté client (écritures = webhooks Stripe, service_role).
revoke insert, update, delete on public.subscriptions from anon, authenticated;


-- --- 6. Sessions de l'utilisateur ------------------------------------
-- auth.sessions n'est pas exposé par l'API : ces deux fonctions donnent
-- accès aux SEULES sessions de auth.uid(). L'adresse IP n'est jamais
-- renvoyée (minimisation).
create or replace function public.list_my_sessions()
returns table (
  id          uuid,
  created_at  timestamptz,
  updated_at  timestamptz,
  user_agent  text,
  aal         text
)
language sql
stable
security definer
set search_path = auth, public
as $$
  select s.id, s.created_at, coalesce(s.refreshed_at::timestamptz, s.updated_at, s.created_at), s.user_agent, s.aal::text
    from auth.sessions s
   where s.user_id = auth.uid()
     and (s.not_after is null or s.not_after > now())
   order by coalesce(s.refreshed_at::timestamptz, s.updated_at, s.created_at) desc
   limit 50;
$$;

revoke all on function public.list_my_sessions() from public, anon;
grant execute on function public.list_my_sessions() to authenticated;

-- Révoque une autre session (supprime ses refresh tokens par cascade).
-- Le jeton d'accès déjà émis reste valable jusqu'à son expiration
-- (JWT expiry, 1 h par défaut) : c'est le comportement standard GoTrue.
create or replace function public.revoke_my_session(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = auth, public
as $$
declare
  v_current uuid := nullif(auth.jwt()->>'session_id', '')::uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_session_id = v_current then
    raise exception 'cannot revoke current session' using errcode = '22023';
  end if;

  delete from auth.sessions
   where id = p_session_id
     and user_id = auth.uid();
  return found;
end;
$$;

revoke all on function public.revoke_my_session(uuid) from public, anon;
grant execute on function public.revoke_my_session(uuid) to authenticated;


-- --- 7. Purge des comptes supprimés (> 30 jours) ----------------------
-- La suppression de compte (POST /api/account/delete) :
--   - pose users.deleted_at et anonymise l'identité (e-mail, nom, coordonnées),
--   - soft-delete l'utilisateur GoTrue (auth.admin.deleteUser(id, true)) :
--     plus aucune connexion possible, sessions révoquées.
-- Les contenus (enfants, journal, coffre…) sont conservés 30 jours, puis
-- cette fonction supprime la ligne auth.users → cascade sur public.users
-- et toutes les tables liées (on delete cascade).
-- Retourne les ids purgés : le worker doit ensuite supprimer les objets
-- Storage préfixés par `<id>/` dans les buckets documents et avatars.
-- À exécuter quotidiennement avec la service_role UNIQUEMENT.
create or replace function public.purge_deleted_accounts(out purged_ids uuid[])
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  with victims as (
    select u.id from public.users u
     where u.deleted_at is not null
       and u.deleted_at < now() - interval '30 days'
  ), d as (
    delete from auth.users a
     using victims v
     where a.id = v.id
    returning a.id
  )
  select coalesce(array_agg(id), '{}') into purged_ids from d;
end;
$$;

revoke all on function public.purge_deleted_accounts() from public, anon, authenticated;
grant execute on function public.purge_deleted_accounts() to service_role;


-- --- Backfill ---------------------------------------------------------
-- Comptes créés avant l'installation du trigger.
insert into public.users (id, email, prenom, nom, email_verified)
select a.id, a.email,
       nullif(left(btrim(coalesce(a.raw_user_meta_data->>'prenom', '')), 80), ''),
       nullif(left(btrim(coalesce(a.raw_user_meta_data->>'nom', '')), 80), ''),
       a.email_confirmed_at is not null
  from auth.users a
 where a.email is not null
   and a.deleted_at is null
on conflict (id) do nothing;

insert into public.preferences (user_id)
select u.id from public.users u
on conflict (user_id) do nothing;


-- =====================================================================
-- ROLLBACK (manuel, dans l'ordre) :
--   drop trigger if exists trg_auth_user_created on auth.users;
--   drop trigger if exists trg_auth_user_updated on auth.users;
--   drop trigger if exists trg_mfa_factor_change on auth.mfa_factors;
--   drop function if exists public.handle_new_auth_user();
--   drop function if exists public.handle_auth_user_updated();
--   drop function if exists public.handle_mfa_factor_change();
--   drop function if exists public.list_my_sessions();
--   drop function if exists public.revoke_my_session(uuid);
--   drop function if exists public.purge_deleted_accounts();
--   -- Les colonnes ajoutées sont nullables / à défaut : on peut les laisser
--   -- (contract différé) ou les supprimer une fois le code retiré :
--   -- alter table public.users drop constraint if exists users_profile_lengths;
--   -- alter table public.preferences drop column if exists ui;
--   -- NE PAS ré-accorder `update` complet sur public.users (faille plan=admin).
-- =====================================================================
