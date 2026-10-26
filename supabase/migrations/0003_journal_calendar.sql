-- =====================================================================
-- Lien Parental — 0003_journal_calendar.sql
-- Journal (événements horodatés = valeur de preuve) + Calendrier.
-- =====================================================================

-- --- ENUMs -------------------------------------------------------------
do $$ begin
  create type public.journal_entry_type as enum (
    'visite', 'appel', 'message', 'sante', 'autre'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.calendar_event_type as enum (
    'visite', 'appel_video', 'message', 'sante', 'rendez_vous',
    'ecole', 'activite', 'sortie', 'repas', 'deplacement',
    'anniversaire', 'autre'
  );  -- 12 types (M06-03)
exception when duplicate_object then null; end $$;


-- --- journal_entries --------------------------------------------------
-- La date de création horodate l'entrée (immuable → valeur de preuve).
-- `occurred_at` est l'instant déclaré de l'événement (modifiable).
create table if not exists public.journal_entries (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  type          public.journal_entry_type not null,
  titre         text not null,
  description   text,
  lieu          text,
  occurred_at   timestamptz not null,
  children_ids  uuid[] not null default '{}',   -- enfants concernés
  media         jsonb not null default '[]'::jsonb,
  -- media : [{ "path": "journal/<user>/<uuid>.jpg", "mime": "image/jpeg", "size": 123 }, ...]
  -- 10 fichiers max, 10 Mo par fichier (contrôlé côté app).
  created_at    timestamptz not null default now(),  -- horodatage de preuve (non modifiable côté app)
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create index if not exists idx_journal_user_occurred
  on public.journal_entries(user_id, occurred_at desc)
  where deleted_at is null;

create index if not exists idx_journal_user_type
  on public.journal_entries(user_id, type)
  where deleted_at is null;

-- GIN sur children_ids pour filtrer rapidement par enfant actif.
create index if not exists idx_journal_children_gin
  on public.journal_entries using gin (children_ids);

-- Recherche plein texte (M05-03) sur titre + description, pondérée.
create index if not exists idx_journal_fts
  on public.journal_entries
  using gin (to_tsvector('french', coalesce(titre,'') || ' ' || coalesce(description,'')));

drop trigger if exists trg_journal_updated_at on public.journal_entries;
create trigger trg_journal_updated_at
  before update on public.journal_entries
  for each row execute function public.handle_updated_at();


-- --- calendar_events --------------------------------------------------
create table if not exists public.calendar_events (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id) on delete cascade,
  type              public.calendar_event_type not null,
  titre             text not null,
  description       text,
  lieu              text,
  start_at          timestamptz not null,
  end_at            timestamptz,
  all_day           boolean not null default false,
  children_ids      uuid[] not null default '{}',
  reminder_minutes  integer check (reminder_minutes >= 0),  -- NULL = aucun rappel
  reminder_sent_at  timestamptz,                             -- idempotence des notifications
  ics_uid           text,                                    -- stable pour export/sync
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  constraint chk_calendar_dates check (end_at is null or end_at >= start_at)
);

create index if not exists idx_calendar_user_start
  on public.calendar_events(user_id, start_at)
  where deleted_at is null;

create index if not exists idx_calendar_children_gin
  on public.calendar_events using gin (children_ids);

-- Index spécialisé pour le job cron des rappels push/email.
create index if not exists idx_calendar_reminders_pending
  on public.calendar_events(start_at)
  where reminder_minutes is not null
    and reminder_sent_at is null
    and deleted_at is null;

drop trigger if exists trg_calendar_updated_at on public.calendar_events;
create trigger trg_calendar_updated_at
  before update on public.calendar_events
  for each row execute function public.handle_updated_at();
