-- =====================================================================
-- Lien Parental — 0260_sante_enfant.sql
-- Espace Santé par enfant : vaccinations et traitements.
--
-- Principes :
--   * données de santé (RGPD art. 9) : le CONTENU (nom du vaccin, dates,
--     posologie…) est chiffré AES-256-GCM côté serveur avant insertion
--     (lib/data/server/medical-crypto.ts, route /api/enfants/[id]/sante).
--     La BDD ne voit qu'un payload opaque { ciphertext, iv, tag, v } ;
--     AAD = "<child_id>:<kind>:<id>" (un ciphertext copié sur une autre
--     ligne ou un autre enfant ne se déchiffre pas) ;
--   * tables propriétaires (user_id = auth.uid()) + l'enfant doit
--     appartenir au même utilisateur (anti-IDOR) ;
--   * changements strictement additifs, migration ré-exécutable.
--
-- Liens enfant déjà présents (rien à ajouter) :
--   * calendar_events.children_ids uuid[] (0003) + index GIN ;
--   * documents.children_ids       uuid[] (0004) + index GIN.
-- Les rendez-vous `sante` et les documents de la catégorie « Santé »
-- s'affichent dans l'espace Santé de l'enfant via ces colonnes.
--
-- Rollback : voir le bloc commenté en fin de fichier.
-- =====================================================================


-- =====================================================================
-- 1. VACCINATIONS
-- =====================================================================
create table if not exists public.child_vaccinations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  child_id    uuid not null references public.children(id) on delete cascade,
  payload     jsonb not null,                -- { nom, date, rappel? } chiffré
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint chk_child_vaccinations_payload check (
    jsonb_typeof(payload) = 'object'
    and payload ? 'ciphertext' and payload ? 'iv' and payload ? 'tag'
    and pg_column_size(payload) <= 4096
  )
);

create index if not exists idx_child_vaccinations_child
  on public.child_vaccinations(user_id, child_id, created_at desc);

drop trigger if exists trg_child_vaccinations_updated_at on public.child_vaccinations;
create trigger trg_child_vaccinations_updated_at
  before update on public.child_vaccinations
  for each row execute function public.handle_updated_at();

comment on column public.child_vaccinations.payload is
  'Payload chiffré AES-256-GCM côté application (AAD child_id:vaccination:id). Jamais stocké en clair.';


-- =====================================================================
-- 2. TRAITEMENTS
-- =====================================================================
create table if not exists public.child_treatments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  child_id    uuid not null references public.children(id) on delete cascade,
  payload     jsonb not null,                -- { nom, posologie?, debut, fin? } chiffré
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint chk_child_treatments_payload check (
    jsonb_typeof(payload) = 'object'
    and payload ? 'ciphertext' and payload ? 'iv' and payload ? 'tag'
    and pg_column_size(payload) <= 4096
  )
);

create index if not exists idx_child_treatments_child
  on public.child_treatments(user_id, child_id, created_at desc);

drop trigger if exists trg_child_treatments_updated_at on public.child_treatments;
create trigger trg_child_treatments_updated_at
  before update on public.child_treatments
  for each row execute function public.handle_updated_at();

comment on column public.child_treatments.payload is
  'Payload chiffré AES-256-GCM côté application (AAD child_id:traitement:id). Jamais stocké en clair.';


-- =====================================================================
-- 3. RLS — propriétaire uniquement, enfant du même propriétaire
-- =====================================================================
alter table public.child_vaccinations enable row level security;
alter table public.child_treatments   enable row level security;

-- child_vaccinations
drop policy if exists child_vaccinations_select_self on public.child_vaccinations;
create policy child_vaccinations_select_self on public.child_vaccinations
  for select using (auth.uid() = user_id);
drop policy if exists child_vaccinations_insert_self on public.child_vaccinations;
create policy child_vaccinations_insert_self on public.child_vaccinations
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from public.children c
                 where c.id = child_id and c.user_id = auth.uid() and c.deleted_at is null)
  );
drop policy if exists child_vaccinations_update_self on public.child_vaccinations;
create policy child_vaccinations_update_self on public.child_vaccinations
  for update using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.children c
                 where c.id = child_id and c.user_id = auth.uid() and c.deleted_at is null)
  );
drop policy if exists child_vaccinations_delete_self on public.child_vaccinations;
create policy child_vaccinations_delete_self on public.child_vaccinations
  for delete using (auth.uid() = user_id);

-- child_treatments
drop policy if exists child_treatments_select_self on public.child_treatments;
create policy child_treatments_select_self on public.child_treatments
  for select using (auth.uid() = user_id);
drop policy if exists child_treatments_insert_self on public.child_treatments;
create policy child_treatments_insert_self on public.child_treatments
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from public.children c
                 where c.id = child_id and c.user_id = auth.uid() and c.deleted_at is null)
  );
drop policy if exists child_treatments_update_self on public.child_treatments;
create policy child_treatments_update_self on public.child_treatments
  for update using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.children c
                 where c.id = child_id and c.user_id = auth.uid() and c.deleted_at is null)
  );
drop policy if exists child_treatments_delete_self on public.child_treatments;
create policy child_treatments_delete_self on public.child_treatments
  for delete using (auth.uid() = user_id);

-- Aucun accès anonyme direct.
revoke all on public.child_vaccinations, public.child_treatments from anon;


-- =====================================================================
-- ROLLBACK (manuel)
-- =====================================================================
-- drop table if exists public.child_treatments;
-- drop table if exists public.child_vaccinations;
