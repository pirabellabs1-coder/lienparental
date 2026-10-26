-- =====================================================================
-- Lien Parental — 0007_system.sql
-- Notifications, sessions actives (affichage M11), audit, aide, support.
-- =====================================================================

-- --- ENUMs -------------------------------------------------------------
do $$ begin
  create type public.notification_channel as enum ('push', 'email', 'inapp');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ticket_status as enum ('open', 'in_progress', 'waiting_user', 'resolved', 'closed');
exception when duplicate_object then null; end $$;


-- --- notifications -----------------------------------------------------
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  channel     public.notification_channel not null default 'inapp',
  type        text not null,                   -- 'rappel_rdv', 'temoignage_recu', ...
  title       text not null,
  body        text,
  data        jsonb not null default '{}'::jsonb,
  read_at     timestamptz,
  sent_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists idx_notifications_user_unread
  on public.notifications(user_id, created_at desc)
  where read_at is null;

create index if not exists idx_notifications_user_all
  on public.notifications(user_id, created_at desc);


-- --- sessions ----------------------------------------------------------
-- Vue applicative des sessions actives (M11 : "Sessions actives").
-- Les JWT/refresh sont gérés par Supabase Auth ; on garde ici une
-- représentation lisible (device, IP, dernier accès) pour l'UI + révocation.
create table if not exists public.sessions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id) on delete cascade,
  refresh_token_id  text unique,              -- id Supabase/GoTrue (opaque)
  device_label      text,                     -- "iPhone 15 — Safari"
  ip_hash           text,                     -- hash salé (RGPD-friendly)
  user_agent        text,
  last_seen_at      timestamptz not null default now(),
  revoked_at        timestamptz,
  created_at        timestamptz not null default now()
);

create index if not exists idx_sessions_user_active
  on public.sessions(user_id, last_seen_at desc)
  where revoked_at is null;


-- --- audit_log ---------------------------------------------------------
-- Journal d'audit des actions sensibles : connexion, 2FA, partage,
-- suppression, changement de plan, export, consentement, etc.
-- RÉTENTION : 12 mois glissants (purge via job cron / Supabase scheduled fn).
create table if not exists public.audit_log (
  id          bigserial primary key,
  user_id     uuid references public.users(id) on delete set null,  -- nullable : actions anonymes/admin
  actor_type  text not null default 'user' check (actor_type in ('user','admin','system','witness')),
  action      text not null,                   -- 'login', 'document.share.create', 'child.delete', ...
  entity      text,                            -- nom logique de l'entité touchée
  entity_id   text,                            -- id de la ressource (texte pour supporter uuid|bigint|token)
  ip_hash     text,
  user_agent  text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists idx_audit_user_created
  on public.audit_log(user_id, created_at desc);

create index if not exists idx_audit_action_created
  on public.audit_log(action, created_at desc);

-- Index pour la purge rapide (rétention 12 mois).
create index if not exists idx_audit_created on public.audit_log(created_at);

comment on table public.audit_log is
  'Rétention 12 mois glissants. Purge quotidienne via job cron (delete where created_at < now() - interval ''12 months'').';


-- --- help_articles -----------------------------------------------------
-- Centre d'aide public (FAQ + tutoriels + conseils + modèles).
create table if not exists public.help_articles (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  title       text not null,
  category    text not null,                   -- 'faq', 'tuto', 'conseil', 'modele'
  content_md  text not null,
  tags        text[] not null default '{}',
  published   boolean not null default false,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_help_articles_pub
  on public.help_articles(category, position)
  where published = true;

create index if not exists idx_help_articles_fts
  on public.help_articles
  using gin (to_tsvector('french', coalesce(title,'') || ' ' || coalesce(content_md,'')));

drop trigger if exists trg_help_articles_updated_at on public.help_articles;
create trigger trg_help_articles_updated_at
  before update on public.help_articles
  for each row execute function public.handle_updated_at();


-- --- support_tickets ---------------------------------------------------
create table if not exists public.support_tickets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  subject     text not null,
  body        text not null,
  status      public.ticket_status not null default 'open',
  priority    text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  messages    jsonb not null default '[]'::jsonb,  -- fil de réponses
  attachments jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  closed_at   timestamptz
);

create index if not exists idx_support_user
  on public.support_tickets(user_id, created_at desc);

create index if not exists idx_support_status
  on public.support_tickets(status, created_at desc);

drop trigger if exists trg_support_updated_at on public.support_tickets;
create trigger trg_support_updated_at
  before update on public.support_tickets
  for each row execute function public.handle_updated_at();
