-- =====================================================================
-- Lien Parental — 0002_users_children.sql
-- Profil utilisateur (lié à auth.users), enfants, préférences.
-- =====================================================================

-- --- users : profil applicatif ----------------------------------------
-- 1-1 avec auth.users (id partagé). Supabase gère password hashing
-- (bcrypt/argon2 côté GoTrue), MFA, e-mail de confirmation.
create table if not exists public.users (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           citext not null unique,
  prenom          text,
  nom             text,
  photo_url       text,                     -- objet storage privé "avatars"
  plan            public.plan_tier not null default 'free',
  storage_used_mb integer not null default 0 check (storage_used_mb >= 0),
  email_verified  boolean not null default false,
  mfa_enabled     boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz                -- soft delete : purge réelle 30j après
);

create index if not exists idx_users_plan on public.users(plan) where deleted_at is null;

drop trigger if exists trg_users_updated_at on public.users;
create trigger trg_users_updated_at
  before update on public.users
  for each row execute function public.handle_updated_at();


-- --- children ---------------------------------------------------------
-- /!\ infos_medicales : données de santé = données sensibles RGPD.
-- Chiffrement applicatif AES-256-GCM AVANT insertion (voir lib/crypto).
-- La BDD ne stocke que le ciphertext + iv + tag en JSONB opaque :
--   { "ciphertext": "...", "iv": "...", "tag": "...", "v": 1 }
-- Même un admin DB ne peut pas lire ces infos sans la clé applicative.
create table if not exists public.children (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.users(id) on delete cascade,
  prenom             text not null,
  nom                text,
  date_naissance     date not null,
  classe             text,                  -- crèche .. terminale
  langue             text,
  photo_url          text,
  -- Informations physiques (non sensibles)
  taille_cm          integer check (taille_cm between 20 and 250),
  poids_kg           numeric(5,2) check (poids_kg between 1 and 200),
  couleur_yeux       text,
  couleur_cheveux    text,
  -- Informations médicales (chiffrées côté app, cf. ci-dessus)
  infos_medicales    jsonb,                 -- payload chiffré AES-256-GCM
  profil_complet     boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);

create index if not exists idx_children_user_id
  on public.children(user_id) where deleted_at is null;

drop trigger if exists trg_children_updated_at on public.children;
create trigger trg_children_updated_at
  before update on public.children
  for each row execute function public.handle_updated_at();

comment on column public.children.infos_medicales is
  'Payload chiffré AES-256-GCM côté application. Jamais stocké en clair. Jamais envoyé à l''IA sans action explicite du parent.';


-- --- preferences ------------------------------------------------------
-- 1-1 avec users. Préférences UI, notifications, rappels, langue.
create table if not exists public.preferences (
  user_id              uuid primary key references public.users(id) on delete cascade,
  theme                text not null default 'dark' check (theme in ('dark', 'light', 'system')),
  langue               text not null default 'fr',
  notif_push           boolean not null default true,
  notif_email          boolean not null default true,
  notif_rappels        boolean not null default true,
  rappel_defaut_min    integer not null default 60 check (rappel_defaut_min >= 0),
  rappels_par_type     jsonb not null default '{}'::jsonb,  -- { "visite": 1440, "sante": 60, ... }
  active_child_id      uuid references public.children(id) on delete set null,
  updated_at           timestamptz not null default now()
);

drop trigger if exists trg_preferences_updated_at on public.preferences;
create trigger trg_preferences_updated_at
  before update on public.preferences
  for each row execute function public.handle_updated_at();
