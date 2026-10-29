-- =====================================================================
-- Lien Parental — 0550_partenaires.sql
-- Candidatures « Devenir partenaire » avec logo, validation par
-- l'administration, publication automatique dans la bonne catégorie.
--
--   1. partner_applications : candidature (formulaire public), statut
--      pending → approved | rejected | hidden, catégorie d'affichage ;
--   2. RLS : lecture et décision réservées aux administrateurs (aal2) ;
--      AUCUN accès anon / utilisateur ; l'insertion se fait côté serveur
--      (route /api/partenaires/candidature, service_role, après
--      validation, limite de débit et anti-robot) ;
--   3. list_public_partners() : seule porte publique, partenaires
--      VALIDÉS uniquement, colonnes d'affichage seulement ;
--   4. Storage : « partner-submissions » PRIVÉ (logos reçus, lisibles par
--      les admins), « partner-logos » PUBLIC en lecture (logos validés,
--      copiés à la validation). Écritures : service_role uniquement.
-- =====================================================================

create table if not exists public.partner_applications (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  profil         text not null check (profil in ('association', 'institution', 'professionnel', 'createur')),
  structure      text not null check (char_length(btrim(structure)) between 2 and 120),
  contact_name   text not null check (char_length(btrim(contact_name)) between 2 and 120),
  email          text not null check (char_length(email) between 3 and 254 and position('@' in email) > 1),
  telephone      text check (telephone is null or char_length(telephone) <= 25),
  territoire     text not null check (territoire in ('guyane', 'france', 'martinique', 'guadeloupe', 'reunion', 'mayotte', 'autre')),
  site           text check (site is null or (char_length(site) <= 2000 and site ~* '^https?://')),
  reseaux        text check (reseaux is null or char_length(reseaux) <= 1000),
  presentation   text not null check (char_length(presentation) between 30 and 2000),
  proposition    text not null check (char_length(proposition) between 30 and 2000),
  -- Logo reçu (bucket privé partner-submissions) et logo publié (bucket public partner-logos).
  logo_path        text check (logo_path is null or (logo_path ~ '^[0-9a-f-]{36}\.(png|jpg|webp)$')),
  logo_public_path text check (logo_public_path is null or (logo_public_path ~ '^[0-9a-f-]{36}\.(png|jpg|webp)$')),
  -- Décision et affichage.
  status         text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'hidden')),
  category       text not null check (category in ('institution', 'association', 'createur', 'professionnel')),
  public_name    text check (public_name is null or char_length(btrim(public_name)) between 2 and 120),
  tagline        text check (tagline is null or char_length(tagline) <= 80),
  display_order  integer not null default 100 check (display_order between 0 and 10000),
  decided_at     timestamptz,
  decided_by     uuid references public.users(id) on delete set null,
  -- Un partenaire publié a forcément un nom et un logo publics.
  constraint chk_partner_published check (status <> 'approved' or (public_name is not null and logo_public_path is not null))
);

create index if not exists idx_partner_applications_status on public.partner_applications(status, created_at desc);

alter table public.partner_applications enable row level security;
revoke all on table public.partner_applications from anon, authenticated;
grant select on table public.partner_applications to authenticated;
grant update (status, category, public_name, tagline, display_order, decided_at, decided_by, logo_public_path)
  on table public.partner_applications to authenticated;

drop policy if exists partner_applications_admin_select on public.partner_applications;
create policy partner_applications_admin_select on public.partner_applications
  for select to authenticated
  using ((select public.is_admin_aal2()));

drop policy if exists partner_applications_admin_update on public.partner_applications;
create policy partner_applications_admin_update on public.partner_applications
  for update to authenticated
  using ((select public.is_admin_aal2()))
  with check ((select public.is_admin_aal2()));

comment on table public.partner_applications is
  'Candidatures partenaires (formulaire public, insertion serveur). Lecture et décision : administrateurs. Public : list_public_partners().';

-- --- Porte publique : partenaires validés seulement -------------------------
create or replace function public.list_public_partners()
returns table (id uuid, name text, category text, tagline text, site text, logo_public_path text, display_order integer)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.public_name, a.category, a.tagline, a.site, a.logo_public_path, a.display_order
    from public.partner_applications a
   where a.status = 'approved' and a.public_name is not null and a.logo_public_path is not null
   order by a.display_order, a.decided_at
   limit 500;
$$;
revoke all on function public.list_public_partners() from public;
grant execute on function public.list_public_partners() to anon, authenticated, service_role;

-- --- Storage -------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('partner-submissions', 'partner-submissions', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('partner-logos', 'partner-logos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Logos reçus : lecture par les administrateurs (aperçu avant validation). Aucune écriture client.
drop policy if exists partner_submissions_admin_select on storage.objects;
create policy partner_submissions_admin_select on storage.objects
  for select to authenticated
  using (bucket_id = 'partner-submissions' and (select public.is_admin_aal2()));
-- Logos publiés : lecture publique par l'URL du bucket public ; aucune politique d'écriture client.

-- ---------------------------------------------------------------------
-- Retour arrière (à exécuter à la main si nécessaire) :
-- drop policy if exists partner_submissions_admin_select on storage.objects;
-- delete from storage.buckets where id in ('partner-submissions', 'partner-logos');  (après avoir vidé les objets)
-- drop function if exists public.list_public_partners();
-- drop table if exists public.partner_applications;
-- ---------------------------------------------------------------------
