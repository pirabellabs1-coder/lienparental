-- =====================================================================
-- Lien Parental — 0004_vault.sql
-- Coffre-fort : catégories, documents, partages via lien signé.
-- =====================================================================

-- --- ENUM : niveau de confidentialité ----------------------------------
do $$ begin
  create type public.document_confidentialite as enum (
    'standard', 'confidentiel', 'tres_confidentiel'
  );
exception when duplicate_object then null; end $$;


-- --- categories --------------------------------------------------------
-- Catégories de rangement du coffre-fort (ex: "Jugements", "École"...).
create table if not exists public.categories (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id) on delete cascade,
  name              text not null,
  icon              text,                     -- nom d'icône FA / Lucide
  color             text,                     -- #RRGGBB
  visible_filtres   boolean not null default true,  -- apparaît dans les filtres rapides
  position          integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, name)
);

create index if not exists idx_categories_user
  on public.categories(user_id, position);

drop trigger if exists trg_categories_updated_at on public.categories;
create trigger trg_categories_updated_at
  before update on public.categories
  for each row execute function public.handle_updated_at();


-- --- documents ---------------------------------------------------------
-- Le binaire vit dans le bucket Storage privé "documents".
-- La BDD ne stocke que les métadonnées + le chemin storage.
-- deleted_at = NULL → actif ; non NULL → corbeille (purge réelle après 30 j).
create table if not exists public.documents (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id) on delete cascade,
  category_id       uuid references public.categories(id) on delete set null,
  name              text not null,
  mime              text not null,
  size_bytes        bigint not null check (size_bytes >= 0),
  confidentialite   public.document_confidentialite not null default 'standard',
  storage_path      text not null unique,     -- ex: "documents/<user_id>/<uuid>.pdf"
  checksum_sha256   text,                     -- vérif intégrité facultative
  children_ids      uuid[] not null default '{}',
  tags              text[] not null default '{}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz               -- corbeille 30 jours
);

create index if not exists idx_documents_user
  on public.documents(user_id, created_at desc)
  where deleted_at is null;

create index if not exists idx_documents_category
  on public.documents(category_id)
  where deleted_at is null;

create index if not exists idx_documents_trash
  on public.documents(user_id, deleted_at)
  where deleted_at is not null;

create index if not exists idx_documents_children_gin
  on public.documents using gin (children_ids);

drop trigger if exists trg_documents_updated_at on public.documents;
create trigger trg_documents_updated_at
  before update on public.documents
  for each row execute function public.handle_updated_at();


-- --- shares ------------------------------------------------------------
-- Lien de partage public d'un document, par token opaque.
-- Lecture publique via le token tant que non révoqué ET non expiré.
-- Le fichier lui-même est servi via une URL signée Supabase (15 min TTL),
-- générée uniquement si (token valide, non révoqué, non expiré).
create table if not exists public.shares (
  id              uuid primary key default gen_random_uuid(),
  document_id     uuid not null references public.documents(id) on delete cascade,
  user_id         uuid not null references public.users(id) on delete cascade,  -- dénormalisé pour RLS
  token           text not null unique,       -- 32+ octets base64url, cryptographiquement sûr
  password_hash   text,                       -- optionnel : partage protégé par mot de passe (argon2)
  expires_at      timestamptz not null,
  revoked_at      timestamptz,
  download_count  integer not null default 0,
  max_downloads   integer,                    -- NULL = illimité tant que valide
  created_at      timestamptz not null default now()
);

create index if not exists idx_shares_token
  on public.shares(token)
  where revoked_at is null;

create index if not exists idx_shares_user
  on public.shares(user_id, created_at desc);

create index if not exists idx_shares_document
  on public.shares(document_id);
