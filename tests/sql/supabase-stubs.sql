-- Stubs minimaux de l'environnement Supabase pour rejouer les migrations sur PGlite (tests/sql/run.mjs).
-- Rôles anon / authenticated / service_role, schémas auth / storage / extensions, auth.uid() / auth.jwt()
-- lus depuis le réglage request.jwt.claims (comme PostgREST), tables auth.* et storage.* réduites aux colonnes
-- utilisées par les migrations. Ce n'est PAS un Supabase complet : Realtime, API Storage, GoTrue absents.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema if not exists auth;
create schema if not exists storage;
create schema if not exists extensions;
create table auth.users(
  id uuid primary key, email text, email_confirmed_at timestamptz,
  raw_app_meta_data jsonb default '{}'::jsonb, raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now(), last_sign_in_at timestamptz, phone text, deleted_at timestamptz, banned_until timestamptz
);
create table auth.mfa_factors(id uuid primary key default gen_random_uuid(), user_id uuid, status text, factor_type text);
create table auth.sessions(id uuid primary key default gen_random_uuid(), user_id uuid, created_at timestamptz default now(), updated_at timestamptz, user_agent text, ip inet, aal text, not_after timestamptz, refreshed_at timestamp, tag text);
create function auth.uid() returns uuid language sql stable as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.role() returns text language sql stable as $$ select auth.jwt() ->> 'role' $$;
create function auth.email() returns text language sql stable as $$ select auth.jwt() ->> 'email' $$;
create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[], owner uuid, created_at timestamptz default now());
create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, metadata jsonb, created_at timestamptz default now());
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant usage on schema public, auth, storage, extensions to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
grant select on storage.objects to authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
-- Supabase accorde insert / update / delete sur storage.objects à authenticated (la RLS filtre).
grant insert, update, delete on storage.objects to authenticated;
