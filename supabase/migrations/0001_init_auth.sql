-- =====================================================================
-- Lien Parental — 0001_init_auth.sql
-- Extensions, helpers d'authentification, trigger générique updated_at.
-- Idempotent : tous les CREATE utilisent IF NOT EXISTS / OR REPLACE.
-- =====================================================================

-- --- Extensions --------------------------------------------------------
-- pgcrypto : gen_random_uuid(), digest(), hmac(), etc.
-- uuid-ossp : uuid_generate_v4() (compat historique)
-- citext : e-mails insensibles à la casse
-- Pas de pgjwt : Supabase Auth gère déjà les JWT côté GoTrue.
create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";
create extension if not exists "citext";

-- --- Schéma applicatif -------------------------------------------------
-- Toutes les tables métier vivent dans le schéma public (défaut Supabase).
-- auth.users (géré par Supabase) reste la source de vérité d'identité.

-- --- Helpers d'auth ----------------------------------------------------
-- Petit raccourci réutilisable dans les policies RLS.
create or replace function public.current_user_id()
returns uuid
language sql
stable
as $$
  select auth.uid();
$$;

-- Détermine si l'utilisateur courant est administrateur.
-- L'attribut est stocké dans auth.users.raw_app_meta_data->>'role' = 'admin'.
-- raw_app_meta_data n'est modifiable que par la service_role → sûr.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(
    (select (raw_app_meta_data->>'role') = 'admin'
       from auth.users
      where id = auth.uid()),
    false
  );
$$;

-- --- Trigger générique updated_at --------------------------------------
-- À attacher sur toute table disposant d'une colonne updated_at timestamptz.
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- --- Types ENUM partagés ----------------------------------------------
-- (Les enums spécifiques à un module sont définis dans leur migration.)

-- Type d'offre (plan de l'utilisateur).
do $$ begin
  create type public.plan_tier as enum ('free', 'premium');
exception when duplicate_object then null; end $$;
