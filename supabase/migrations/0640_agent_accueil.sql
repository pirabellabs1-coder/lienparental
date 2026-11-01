-- =====================================================================
-- Lien Parental — 0640_agent_accueil.sql
-- Agent d'accueil (architecture 3 interfaces, V2 — phases 1 et 2) : socle commun au chatbot du site,
-- puis à WhatsApp et au standard téléphonique.
--
--   1. agent_kb_entries           base de connaissances versionnée (brouillon, à valider, publié,
--                                 programmé, archivé) ; une seule version publiée par fiche et langue.
--   2. agent_services             annuaire des services (informations, assistance, commercial…).
--   3. agent_representatives      représentants : services, langues, horaires, statut, priorité.
--   4. agent_appointment_types    types de rendez-vous : durée, tampon, délai minimum, horizon.
--   5. agent_blackouts            indisponibilités (congés, fermetures).
--   6. agent_appointments         rendez-vous ; contrainte d'exclusion = jamais deux rendez-vous
--                                 confirmés qui se chevauchent pour un même représentant (AC-24).
--   7. agent_callbacks            demandes de rappel.
--   8. agent_messages             textes par défaut modifiables (FR / EN / PT).
--   9. agent_events               statistiques sans contenu (canal, langue, type d'événement).
--  10. agent_purge()              conservation : rendez-vous et rappels 12 mois, événements 90 jours.
--
-- Accès : aucune lecture ni écriture directe pour anon ; l'administrateur (is_admin_aal2) gère tout
-- depuis le back-office ; les routes publiques du serveur passent par service_role.
-- Idempotente. Rollback en fin de fichier.
-- =====================================================================

create extension if not exists btree_gist with schema extensions;

-- 1. Base de connaissances ---------------------------------------------------------------
create table if not exists public.agent_kb_entries (
  id            uuid primary key default gen_random_uuid(),
  entry_key     text not null check (entry_key ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  locale        text not null check (locale in ('fr', 'en', 'pt')),
  category      text not null check (category in ('presentation', 'fonctionnalites', 'tarifs', 'compte', 'paiement', 'technique', 'partenariats', 'contact', 'escalade', 'liens')),
  version       integer not null check (version > 0),
  status        text not null default 'draft' check (status in ('draft', 'review', 'published', 'scheduled', 'archived')),
  title         text not null check (char_length(title) between 2 and 160),
  questions     text not null default '' check (char_length(questions) <= 2000),
  answer        text not null check (char_length(answer) between 2 and 4000),
  source        text check (char_length(source) <= 300),
  effective_at  timestamptz,
  author_id     uuid references public.users(id) on delete set null,
  author        text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (entry_key, locale, version),
  check (status <> 'scheduled' or effective_at is not null)
);
create unique index if not exists agent_kb_one_published on public.agent_kb_entries (entry_key, locale) where status = 'published';
create index if not exists agent_kb_live_idx on public.agent_kb_entries (locale, status, effective_at);

-- 2. Services ------------------------------------------------------------------------------
create table if not exists public.agent_services (
  code       text primary key check (code ~ '^[a-z][a-z0-9_]{1,31}$'),
  label_fr   text not null,
  label_en   text not null,
  label_pt   text not null,
  ai_mode    text not null default 'answer' check (ai_mode in ('answer', 'qualify', 'limited')),
  active     boolean not null default true,
  sort       integer not null default 100
);
insert into public.agent_services (code, label_fr, label_en, label_pt, ai_mode, sort) values
  ('info',        'Informations générales',    'General information',  'Informações gerais',     'answer',  10),
  ('support',     'Assistance fonctionnelle',  'Product support',      'Assistência',            'answer',  20),
  ('commercial',  'Commercial',                'Sales',                'Comercial',              'answer',  30),
  ('partenariat', 'Partenariats',              'Partnerships',         'Parcerias',              'qualify', 40),
  ('association', 'Rejoindre l''association',  'Join the association', 'Participar da associação','qualify', 50),
  ('sensible',    'Sujet sensible',            'Sensitive matter',     'Assunto sensível',       'limited', 60)
on conflict (code) do nothing;

-- 3. Représentants -------------------------------------------------------------------------
create table if not exists public.agent_representatives (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (char_length(name) between 2 and 120),
  role            text check (char_length(role) <= 120),
  email           text check (char_length(email) <= 254),
  transfer_phone  text check (transfer_phone ~ '^\+?[0-9 ]{6,20}$'),
  languages       text[] not null default '{fr}' check (languages <@ array['fr', 'en', 'pt']::text[] and cardinality(languages) > 0),
  services        text[] not null default '{}',
  -- Horaires hebdomadaires, heure de Cayenne : {"1": [["08:00","12:00"],["14:00","17:00"]], …} (1 = lundi … 7 = dimanche).
  hours           jsonb not null default '{}'::jsonb check (jsonb_typeof(hours) = 'object'),
  -- auto : selon les horaires ; unavailable : absent (statut manuel). Jamais de transfert hors horaires.
  status          text not null default 'auto' check (status in ('auto', 'unavailable')),
  priority        integer not null default 100,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- 4. Types de rendez-vous ------------------------------------------------------------------
create table if not exists public.agent_appointment_types (
  code            text primary key check (code ~ '^[a-z][a-z0-9_]{1,31}$'),
  service         text not null references public.agent_services(code) on update cascade,
  label_fr        text not null,
  label_en        text not null,
  label_pt        text not null,
  duration_min    integer not null default 30 check (duration_min between 10 and 240),
  buffer_min      integer not null default 15 check (buffer_min between 0 and 120),
  min_notice_min  integer not null default 120 check (min_notice_min between 0 and 10080),
  horizon_days    integer not null default 60 check (horizon_days between 1 and 365),
  active          boolean not null default true,
  sort            integer not null default 100
);
insert into public.agent_appointment_types (code, service, label_fr, label_en, label_pt, sort) values
  ('decouverte',  'info',        'Présentation / découverte', 'Introduction',           'Apresentação',            10),
  ('commercial',  'commercial',  'Commercial',                'Sales',                  'Comercial',               20),
  ('partenariat', 'partenariat', 'Partenariat',               'Partnership',            'Parceria',                30),
  ('association', 'association', 'Rejoindre l''association',  'Join the association',   'Participar da associação', 40),
  ('assistance',  'support',     'Assistance humaine',        'Support',                'Assistência',             50)
on conflict (code) do nothing;

-- 5. Indisponibilités ----------------------------------------------------------------------
create table if not exists public.agent_blackouts (
  id                 uuid primary key default gen_random_uuid(),
  representative_id  uuid references public.agent_representatives(id) on delete cascade,
  starts_at          timestamptz not null,
  ends_at            timestamptz not null,
  reason             text check (char_length(reason) <= 200),
  created_at         timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists agent_blackouts_range_idx on public.agent_blackouts (ends_at, starts_at);

-- 6. Rendez-vous ---------------------------------------------------------------------------
create table if not exists public.agent_appointments (
  id                 uuid primary key default gen_random_uuid(),
  ref                text not null unique,
  type_code          text not null references public.agent_appointment_types(code) on update cascade,
  service            text not null,
  representative_id  uuid not null references public.agent_representatives(id) on delete restrict,
  starts_at          timestamptz not null,
  ends_at            timestamptz not null,
  -- Fin + temps tampon : intervalle réellement bloqué pour le représentant.
  busy_until         timestamptz not null,
  contact_name       text not null check (char_length(contact_name) between 2 and 120),
  contact_phone      text check (char_length(contact_phone) <= 30),
  contact_email      text check (char_length(contact_email) <= 254),
  language           text not null check (language in ('fr', 'en', 'pt')),
  reason             text check (char_length(reason) <= 500),
  channel            text not null check (channel in ('web', 'whatsapp', 'voice', 'admin')),
  confirm_channel    text not null default 'email' check (confirm_channel in ('email', 'sms', 'whatsapp')),
  reminders_consent  boolean not null default false,
  -- pending : réservé depuis le site, en attente du clic sur le lien e-mail (30 min, créneau tenu) ;
  -- confirmed : vérifié ; cancelled : annulé ou attente expirée.
  status             text not null default 'confirmed' check (status in ('pending', 'confirmed', 'cancelled')),
  manage_token_hash  text unique,
  reminder_24_sent_at timestamptz,
  reminder_2_sent_at  timestamptz,
  rescheduled_from   uuid references public.agent_appointments(id) on delete set null,
  created_at         timestamptz not null default now(),
  cancelled_at       timestamptz,
  check (ends_at > starts_at and busy_until >= ends_at),
  check (contact_phone is not null or contact_email is not null)
);
do $$ begin
  alter table public.agent_appointments add constraint agent_appointments_no_overlap
    exclude using gist (representative_id with =, tstzrange(starts_at, busy_until, '[)') with &&)
    where (status in ('pending', 'confirmed'));
exception when duplicate_object then null; when duplicate_table then null;
end $$;
create index if not exists agent_appointments_upcoming_idx on public.agent_appointments (status, starts_at);

-- 7. Demandes de rappel --------------------------------------------------------------------
create table if not exists public.agent_callbacks (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 2 and 120),
  phone       text not null check (char_length(phone) between 6 and 30),
  reason      text not null check (char_length(reason) between 2 and 500),
  service     text,
  language    text not null check (language in ('fr', 'en', 'pt')),
  channel     text not null check (channel in ('web', 'whatsapp', 'voice')),
  status      text not null default 'new' check (status in ('new', 'done', 'cancelled')),
  created_at  timestamptz not null default now(),
  handled_at  timestamptz,
  handled_by  uuid references public.users(id) on delete set null
);
create index if not exists agent_callbacks_status_idx on public.agent_callbacks (status, created_at desc);

-- 8. Textes par défaut ---------------------------------------------------------------------
create table if not exists public.agent_messages (
  msg_key     text not null check (msg_key ~ '^[A-Z][A-Z0-9_]{1,40}$'),
  locale      text not null check (locale in ('fr', 'en', 'pt')),
  text        text not null check (char_length(text) between 1 and 600),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.users(id) on delete set null,
  primary key (msg_key, locale)
);

-- 9. Statistiques (aucun contenu de conversation, aucune donnée nominative) -----------------
create table if not exists public.agent_events (
  id       bigint generated always as identity primary key,
  at       timestamptz not null default now(),
  channel  text not null check (channel in ('web', 'whatsapp', 'voice')),
  locale   text not null check (locale in ('fr', 'en', 'pt')),
  kind     text not null check (kind ~ '^[a-z_]{2,40}$'),
  intent   text check (intent ~ '^[A-Z_]{2,40}$')
);
create index if not exists agent_events_at_idx on public.agent_events (at);

-- Accès -----------------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['agent_kb_entries', 'agent_services', 'agent_representatives', 'agent_appointment_types',
                           'agent_blackouts', 'agent_appointments', 'agent_callbacks', 'agent_messages', 'agent_events']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);
    execute format('create policy %I on public.%I for all to authenticated using ((select public.is_admin_aal2())) with check ((select public.is_admin_aal2()))', t || '_admin_all', t);
  end loop;
end $$;
-- Statistiques : l'administrateur les lit, il ne les modifie pas.
revoke insert, update, delete on table public.agent_events from authenticated;

-- 10. Conservation -------------------------------------------------------------------------
create or replace function public.agent_purge()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare a integer; c integer; e integer;
begin
  delete from public.agent_appointments where ends_at < now() - interval '12 months';
  get diagnostics a = row_count;
  delete from public.agent_callbacks where created_at < now() - interval '12 months';
  get diagnostics c = row_count;
  delete from public.agent_events where at < now() - interval '90 days';
  get diagnostics e = row_count;
  return jsonb_build_object('appointments', a, 'callbacks', c, 'events', e);
end;
$$;
revoke all on function public.agent_purge() from public, anon, authenticated;
grant execute on function public.agent_purge() to service_role;

-- 11. Déplacement atomique d'un rendez-vous -------------------------------------------------
-- Annule l'ancien et crée le nouveau dans une seule transaction : si l'insertion échoue (créneau pris
-- entre-temps, contrainte), l'ancien rendez-vous reste confirmé. Le lien de gestion (empreinte du jeton)
-- passe au nouveau rendez-vous : le même lien reste valable, même si l'e-mail ne part pas.
create or replace function public.agent_reschedule(p_old uuid, p_new jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_hash text;
begin
  -- Lu AVANT la mise à jour (RETURNING rendrait la nouvelle valeur, nulle).
  select manage_token_hash into v_hash from public.agent_appointments where id = p_old and status = 'confirmed' for update;
  if not found then return 'not_found'; end if;
  update public.agent_appointments set status = 'cancelled', cancelled_at = now(), manage_token_hash = null where id = p_old;
  begin
    insert into public.agent_appointments (id, ref, type_code, service, representative_id, starts_at, ends_at, busy_until,
      contact_name, contact_phone, contact_email, language, reason, channel, confirm_channel, reminders_consent,
      manage_token_hash, rescheduled_from)
    values ((p_new->>'id')::uuid, p_new->>'ref', p_new->>'type_code', p_new->>'service', (p_new->>'representative_id')::uuid,
      (p_new->>'starts_at')::timestamptz, (p_new->>'ends_at')::timestamptz, (p_new->>'busy_until')::timestamptz,
      p_new->>'contact_name', p_new->>'contact_phone', p_new->>'contact_email', p_new->>'language', p_new->>'reason',
      p_new->>'channel', 'email', coalesce((p_new->>'reminders_consent')::boolean, false), v_hash, p_old);
  exception when exclusion_violation then
    raise exception 'agent_slot_taken' using errcode = 'P0001';
  end;
  return 'ok';
end;
$$;
revoke all on function public.agent_reschedule(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.agent_reschedule(uuid, jsonb) to service_role;

-- 12. Publication d'une fiche (une seule écriture logique) ------------------------------------
create or replace function public.agent_kb_publish(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare r public.agent_kb_entries;
begin
  if not (select public.is_admin_aal2()) then
    raise exception 'admin required' using errcode = '42501';
  end if;
  select * into r from public.agent_kb_entries where id = p_id for update;
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;
  -- Archiver d'abord : l'index unique n'admet qu'une version publiée par fiche et par langue.
  update public.agent_kb_entries set status = 'archived', updated_at = now()
   where entry_key = r.entry_key and locale = r.locale and id <> r.id and status = 'published';
  update public.agent_kb_entries set status = 'published', updated_at = now() where id = r.id;
end;
$$;
revoke all on function public.agent_kb_publish(uuid) from public, anon;
grant execute on function public.agent_kb_publish(uuid) to authenticated, service_role;

-- 13. Versions programmées arrivées à échéance (tâche planifiée) --------------------------------
-- Même règle que lib/agent/core.ts liveEntries : la plus haute version parmi les publiées et les
-- programmées échues devient LA version publiée ; les autres sont archivées.
create or replace function public.agent_kb_activate_due()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare k record; w uuid; n integer := 0;
begin
  for k in select distinct entry_key, locale from public.agent_kb_entries where status = 'scheduled' and effective_at <= now() loop
    select id into w from public.agent_kb_entries
     where entry_key = k.entry_key and locale = k.locale and (status = 'published' or (status = 'scheduled' and effective_at <= now()))
     order by version desc limit 1;
    update public.agent_kb_entries set status = 'archived', updated_at = now()
     where entry_key = k.entry_key and locale = k.locale and id <> w and (status = 'published' or (status = 'scheduled' and effective_at <= now()));
    update public.agent_kb_entries set status = 'published', updated_at = now() where id = w and status <> 'published';
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.agent_kb_activate_due() from public, anon, authenticated;
grant execute on function public.agent_kb_activate_due() to service_role;

-- ---------------------------------------------------------------------
-- Retour arrière :
-- drop function if exists public.agent_kb_activate_due();
-- drop function if exists public.agent_kb_publish(uuid);
-- drop function if exists public.agent_reschedule(uuid, jsonb);
-- drop function if exists public.agent_purge();
-- drop table if exists public.agent_events, public.agent_messages, public.agent_callbacks,
--   public.agent_appointments, public.agent_blackouts, public.agent_appointment_types,
--   public.agent_representatives, public.agent_services, public.agent_kb_entries;
-- ---------------------------------------------------------------------
