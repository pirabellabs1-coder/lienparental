-- =====================================================================
-- Lien Parental, 0250_guide.sql
-- Guide Parent (territorialisé) :
--   1. guide_progress : progression de l'utilisateur dans les fiches et
--      parcours (À faire / En cours / Terminé). Propriétaire uniquement.
--   2. guide_partners : offres « Partenaire » / « Offre sponsorisée »
--      affichées après l'information neutre. Lecture publique des offres
--      actives, écriture réservée aux administrateurs (is_admin(), 0102).
--
-- Le contenu éditorial (fiches, parcours) reste dans content/guide/ :
-- il est versionné avec le code et relu avant publication.
-- Migration ré-exécutable (if not exists / drop policy if exists).
-- =====================================================================


-- =====================================================================
-- 1. PROGRESSION
-- =====================================================================
create table if not exists public.guide_progress (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  territoire  text not null check (territoire ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(territoire) <= 40),
  ref_type    text not null check (ref_type in ('fiche', 'parcours')),
  ref_slug    text not null check (ref_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(ref_slug) <= 80),
  -- Élément de la fiche (document de la checklist, '_fiche' pour la fiche entière) ou du parcours.
  element     text not null check (element ~ '^(_fiche|[a-z0-9]+(-[a-z0-9]+)*)$' and length(element) <= 80),
  statut      text not null default 'a_faire' check (statut in ('a_faire', 'en_cours', 'termine')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint uq_guide_progress unique (user_id, ref_type, ref_slug, element)
);

create index if not exists idx_guide_progress_user
  on public.guide_progress(user_id, territoire);

drop trigger if exists trg_guide_progress_updated_at on public.guide_progress;
create trigger trg_guide_progress_updated_at
  before update on public.guide_progress
  for each row execute function public.handle_updated_at();

alter table public.guide_progress enable row level security;

drop policy if exists guide_progress_select_own on public.guide_progress;
create policy guide_progress_select_own on public.guide_progress
  for select to authenticated using (user_id = auth.uid());

drop policy if exists guide_progress_insert_own on public.guide_progress;
create policy guide_progress_insert_own on public.guide_progress
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists guide_progress_update_own on public.guide_progress;
create policy guide_progress_update_own on public.guide_progress
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists guide_progress_delete_own on public.guide_progress;
create policy guide_progress_delete_own on public.guide_progress
  for delete to authenticated using (user_id = auth.uid());


-- =====================================================================
-- 2. PARTENAIRES
-- =====================================================================
-- Règles éditoriales (récap v2) : toujours étiqueté « Partenaire » ou
-- « Offre sponsorisée », jamais « meilleure offre », critères objectifs
-- visibles (tableau [{ "libelle": …, "valeur": … }]).
create table if not exists public.guide_partners (
  id          uuid primary key default gen_random_uuid(),
  territoire  text not null check (territoire ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(territoire) <= 40),
  categorie   text not null check (categorie in (
                'ecole', 'sante', 'aides', 'argent', 'assurances',
                'naissance', 'separation', 'loisirs', 'logement')),
  nom         text not null check (length(nom) between 1 and 120),
  type        text not null check (type in ('partenaire', 'sponsorise')),
  description text not null check (length(description) between 1 and 400),
  criteres    jsonb not null default '[]'::jsonb,
  lien        text check (lien is null or (lien ~ '^https://' and length(lien) <= 500)),
  actif       boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint chk_guide_partners_criteres check (
    jsonb_typeof(criteres) = 'array' and jsonb_array_length(criteres) between 1 and 8
  ),
  constraint chk_guide_partners_wording check (
    nom !~* 'meilleur' and description !~* 'meilleur'
  )
);

create index if not exists idx_guide_partners_lookup
  on public.guide_partners(territoire, categorie) where actif;

drop trigger if exists trg_guide_partners_updated_at on public.guide_partners;
create trigger trg_guide_partners_updated_at
  before update on public.guide_partners
  for each row execute function public.handle_updated_at();

alter table public.guide_partners enable row level security;

-- Lecture publique (anon + connectés) des seules offres actives ; l'admin voit tout.
drop policy if exists guide_partners_select_public on public.guide_partners;
create policy guide_partners_select_public on public.guide_partners
  for select to anon, authenticated using (actif or public.is_admin());

drop policy if exists guide_partners_insert_admin on public.guide_partners;
create policy guide_partners_insert_admin on public.guide_partners
  for insert to authenticated with check (public.is_admin());

drop policy if exists guide_partners_update_admin on public.guide_partners;
create policy guide_partners_update_admin on public.guide_partners
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists guide_partners_delete_admin on public.guide_partners;
create policy guide_partners_delete_admin on public.guide_partners
  for delete to authenticated using (public.is_admin());

revoke all on public.guide_partners from anon;
grant select on public.guide_partners to anon;
grant select, insert, update, delete on public.guide_partners to authenticated;
grant select, insert, update, delete on public.guide_progress to authenticated;


-- =====================================================================
-- Rollback (à exécuter manuellement si nécessaire)
-- =====================================================================
-- drop table if exists public.guide_partners;
-- drop table if exists public.guide_progress;
