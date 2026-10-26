-- =====================================================================
-- Lien Parental, 0300_admin_contenus.sql  (chantier E : admin contenus)
--
-- Contenus éditoriaux administrables depuis /admin :
--   1. guide_territoires   territoires du Guide (Guyane par défaut)
--   2. guide_fiches        fiches pratiques (contenu jsonb = ficheSchema)
--   3. guide_parcours      parcours / checklists (contenu jsonb = parcoursSchema)
--   4. guide_partners      (0250) : colonnes de versionnage ajoutées
--   5. document_templates  modèles « Documents prêts à l'emploi »
--   6. blog_posts          articles du blog public
--   7. content_versions    historique (instantané à chaque écriture, par trigger)
--   8. Storage : bucket public « blog-images » (lecture publique, écriture admin)
--
-- Sécurité :
--   - Lecture publique (anon + connectés) des SEULS éléments publiés
--     (articles : date de publication passée) ; l'admin voit tout.
--   - Écriture réservée à public.is_admin() (0102) ET à une session MFA
--     satisfaite (politiques RESTRICTIVE, cf. 0270 public.mfa_satisfied()).
--   - Historique écrit uniquement par trigger SECURITY DEFINER : ni insert,
--     ni update, ni delete possibles depuis le client.
--   - Les invariants sont portés par la base (CHECK, UNIQUE, FK) : le JSON
--     d'une fiche doit reprendre exactement son slug, territoire, titre et
--     catégorie dénormalisés.
--
-- Migration ré-exécutable (if not exists / drop … if exists). Pré-requis :
-- 0101 (handle_updated_at), 0102 (is_admin), 0250 (guide_partners),
-- 0270 (mfa_satisfied). Semences : scripts/seed-contenus-sql.ts ou bouton
-- « Importer depuis le dépôt » dans /admin/guides, /admin/modeles, /admin/blog.
-- =====================================================================


-- =====================================================================
-- 0. FONCTIONS COMMUNES
-- =====================================================================

-- Version, auteur et horodatage gérés par la base (jamais par le client).
create or replace function public.content_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.version    := 1;
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.updated_by := new.created_by;
    new.created_at := coalesce(new.created_at, now());
  else
    new.version    := old.version + 1;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_by := coalesce(auth.uid(), new.updated_by);
  end if;
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.content_before_write() is
  'Trigger BEFORE INSERT/UPDATE des contenus éditoriaux : version +1 (concurrence optimiste), created_by/updated_by depuis auth.uid().';


-- =====================================================================
-- 1. TERRITOIRES DU GUIDE
-- =====================================================================
create table if not exists public.guide_territoires (
  code        text primary key check (code ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(code) <= 40),
  nom         text not null check (length(nom) between 1 and 60),
  disponible  boolean not null default false,
  ordre       integer not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

insert into public.guide_territoires (code, nom, disponible, ordre)
values ('guyane', 'Guyane', true, 1)
on conflict (code) do nothing;

drop trigger if exists trg_guide_territoires_updated_at on public.guide_territoires;
create trigger trg_guide_territoires_updated_at
  before update on public.guide_territoires
  for each row execute function public.handle_updated_at();


-- =====================================================================
-- 2. FICHES DU GUIDE
-- =====================================================================
create table if not exists public.guide_fiches (
  id                     uuid primary key default gen_random_uuid(),
  territoire             text not null references public.guide_territoires(code) on update cascade on delete restrict,
  slug                   text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  categorie              text not null check (categorie in (
                           'ecole', 'sante', 'aides', 'argent', 'assurances',
                           'naissance', 'separation', 'loisirs', 'logement')),
  titre                  text not null check (length(titre) between 1 and 120),
  derniere_verification  date not null,
  contenu                jsonb not null,
  statut                 text not null default 'brouillon' check (statut in ('brouillon', 'publie', 'archive')),
  published_at           timestamptz,
  version                integer not null default 1 check (version >= 1),
  created_by             uuid references public.users(id) on delete set null,
  updated_by             uuid references public.users(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint uq_guide_fiches_slug unique (territoire, slug),
  constraint chk_guide_fiches_contenu check (
    jsonb_typeof(contenu) = 'object'
    and pg_column_size(contenu) <= 262144
    and contenu ->> 'slug' = slug
    and contenu ->> 'territoire' = territoire
    and contenu ->> 'titre' = titre
    and contenu ->> 'categorie' = categorie
  ),
  constraint chk_guide_fiches_published check (statut <> 'publie' or published_at is not null)
);

create index if not exists idx_guide_fiches_public
  on public.guide_fiches(territoire, slug) where statut = 'publie';
create index if not exists idx_guide_fiches_admin
  on public.guide_fiches(territoire, updated_at desc);


-- =====================================================================
-- 3. PARCOURS DU GUIDE
-- =====================================================================
create table if not exists public.guide_parcours (
  id            uuid primary key default gen_random_uuid(),
  territoire    text not null references public.guide_territoires(code) on update cascade on delete restrict,
  slug          text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  titre         text not null check (length(titre) between 1 and 120),
  ordre         integer not null default 100,
  contenu       jsonb not null,
  statut        text not null default 'brouillon' check (statut in ('brouillon', 'publie', 'archive')),
  published_at  timestamptz,
  version       integer not null default 1 check (version >= 1),
  created_by    uuid references public.users(id) on delete set null,
  updated_by    uuid references public.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint uq_guide_parcours_slug unique (territoire, slug),
  constraint chk_guide_parcours_contenu check (
    jsonb_typeof(contenu) = 'object'
    and pg_column_size(contenu) <= 65536
    and contenu ->> 'slug' = slug
    and contenu ->> 'territoire' = territoire
    and contenu ->> 'titre' = titre
    and jsonb_typeof(contenu -> 'elements') = 'array'
  ),
  constraint chk_guide_parcours_published check (statut <> 'publie' or published_at is not null)
);

create index if not exists idx_guide_parcours_public
  on public.guide_parcours(territoire, ordre) where statut = 'publie';


-- =====================================================================
-- 4. OFFRES PARTENAIRES (0250) : versionnage
-- =====================================================================
alter table public.guide_partners add column if not exists version      integer not null default 1;
alter table public.guide_partners add column if not exists published_at timestamptz;
alter table public.guide_partners add column if not exists created_by   uuid references public.users(id) on delete set null;
alter table public.guide_partners add column if not exists updated_by   uuid references public.users(id) on delete set null;


-- =====================================================================
-- 5. MODÈLES DE DOCUMENTS
-- =====================================================================
create table if not exists public.document_templates (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  titre         text not null check (length(titre) between 1 and 140),
  categorie     text not null check (categorie in ('juridique', 'communication', 'scolaire', 'autre')),
  description   text not null check (length(description) between 1 and 400),
  badge         text check (badge is null or badge in ('Populaire', 'Nouveau')),
  -- [{ key, label, type, obligatoire, aide, exemple, options }] validé par lib/modeles/template.ts
  champs        jsonb not null default '[]'::jsonb,
  corps         text not null check (length(corps) between 1 and 20000),
  mise_en_page  jsonb not null default '{}'::jsonb,
  statut        text not null default 'brouillon' check (statut in ('brouillon', 'publie', 'archive')),
  published_at  timestamptz,
  version       integer not null default 1 check (version >= 1),
  created_by    uuid references public.users(id) on delete set null,
  updated_by    uuid references public.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint chk_document_templates_json check (
    jsonb_typeof(champs) = 'array' and jsonb_array_length(champs) <= 40
    and jsonb_typeof(mise_en_page) = 'object'
  ),
  constraint chk_document_templates_published check (statut <> 'publie' or published_at is not null)
);

create index if not exists idx_document_templates_public
  on public.document_templates(categorie) where statut = 'publie';


-- =====================================================================
-- 6. BLOG
-- =====================================================================
create table if not exists public.blog_posts (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  titre            text not null check (length(titre) between 1 and 140),
  extrait          text not null check (length(extrait) between 1 and 320),
  contenu_md       text not null check (length(contenu_md) between 1 and 60000),
  couverture_url   text check (couverture_url is null or (length(couverture_url) <= 500 and (couverture_url ~ '^https://' or couverture_url ~ '^/[^/]'))),
  couverture_alt   text check (couverture_alt is null or length(couverture_alt) <= 200),
  categorie        text not null check (categorie in ('coparentalite', 'demarches', 'organisation', 'enfant', 'application')),
  tags             text[] not null default '{}' check (cardinality(tags) <= 10),
  auteur           text not null check (length(auteur) between 1 and 80),
  seo_titre        text check (seo_titre is null or length(seo_titre) <= 70),
  seo_description  text check (seo_description is null or length(seo_description) <= 170),
  statut           text not null default 'brouillon' check (statut in ('brouillon', 'publie', 'archive')),
  -- Date de publication : une date future = article programmé (invisible jusque-là).
  published_at     timestamptz,
  version          integer not null default 1 check (version >= 1),
  created_by       uuid references public.users(id) on delete set null,
  updated_by       uuid references public.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint chk_blog_posts_published check (statut <> 'publie' or published_at is not null),
  constraint chk_blog_posts_cover_alt check (couverture_url is null or coalesce(length(couverture_alt), 0) > 0)
);

create index if not exists idx_blog_posts_public
  on public.blog_posts(published_at desc) where statut = 'publie';


-- =====================================================================
-- 7. HISTORIQUE
-- =====================================================================
create table if not exists public.content_versions (
  id           uuid primary key default gen_random_uuid(),
  entity_type  text not null check (entity_type in (
                 'guide_fiches', 'guide_parcours', 'guide_partners', 'document_templates', 'blog_posts')),
  entity_id    uuid not null,          -- pas de FK : l'historique survit à la suppression
  version      integer not null,
  action       text not null check (action in ('insert', 'update', 'delete')),
  snapshot     jsonb not null,         -- ligne complète après l'écriture (avant, pour delete)
  actor_id     uuid references public.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists idx_content_versions_entity
  on public.content_versions(entity_type, entity_id, created_at desc);

create or replace function public.content_log_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into public.content_versions (entity_type, entity_id, version, action, snapshot, actor_id)
  values (
    tg_table_name,
    (v_row ->> 'id')::uuid,
    coalesce((v_row ->> 'version')::integer, 1),
    lower(tg_op),
    v_row,
    auth.uid()
  );
  return null;
end;
$$;

revoke all on function public.content_log_version() from public, anon, authenticated;
revoke all on function public.content_before_write() from public, anon, authenticated;

comment on function public.content_log_version() is
  'Trigger AFTER INSERT/UPDATE/DELETE : instantané dans content_versions (SECURITY DEFINER, seule voie d''écriture de l''historique).';


-- =====================================================================
-- 8. TRIGGERS, RLS ET DROITS (tables de contenu)
-- =====================================================================
do $$
declare
  t text;
begin
  foreach t in array array['guide_fiches', 'guide_parcours', 'guide_partners', 'document_templates', 'blog_posts']
  loop
    -- guide_partners a déjà trg_guide_partners_updated_at (0250) : sans conflit (même valeur).
    execute format('drop trigger if exists trg_%s_before_write on public.%I', t, t);
    execute format('create trigger trg_%s_before_write before insert or update on public.%I for each row execute function public.content_before_write()', t, t);
    execute format('drop trigger if exists trg_%s_version on public.%I', t, t);
    execute format('create trigger trg_%s_version after insert or update or delete on public.%I for each row execute function public.content_log_version()', t, t);

    execute format('alter table public.%I enable row level security', t);

    -- Écriture : administrateurs uniquement.
    execute format('drop policy if exists %s_insert_admin on public.%I', t, t);
    execute format('create policy %s_insert_admin on public.%I for insert to authenticated with check ((select public.is_admin()))', t, t);
    execute format('drop policy if exists %s_update_admin on public.%I', t, t);
    execute format('create policy %s_update_admin on public.%I for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t, t);
    execute format('drop policy if exists %s_delete_admin on public.%I', t, t);
    execute format('create policy %s_delete_admin on public.%I for delete to authenticated using ((select public.is_admin()))', t, t);

    -- MFA exigée pour écrire (combinée en ET), la lecture publique n'est pas concernée.
    execute format('drop policy if exists mfa_required_insert on public.%I', t);
    execute format('create policy mfa_required_insert on public.%I as restrictive for insert to authenticated with check ((select public.mfa_satisfied()))', t);
    execute format('drop policy if exists mfa_required_update on public.%I', t);
    execute format('create policy mfa_required_update on public.%I as restrictive for update to authenticated using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()))', t);
    execute format('drop policy if exists mfa_required_delete on public.%I', t);
    execute format('create policy mfa_required_delete on public.%I as restrictive for delete to authenticated using ((select public.mfa_satisfied()))', t);

    execute format('revoke all on table public.%I from anon', t);
    execute format('grant select on table public.%I to anon', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
  end loop;
end $$;

-- Lecture publique : publié uniquement (l'admin voit tout).
drop policy if exists guide_fiches_select_public on public.guide_fiches;
create policy guide_fiches_select_public on public.guide_fiches
  for select to anon, authenticated using (statut = 'publie' or (select public.is_admin()));

drop policy if exists guide_parcours_select_public on public.guide_parcours;
create policy guide_parcours_select_public on public.guide_parcours
  for select to anon, authenticated using (statut = 'publie' or (select public.is_admin()));

drop policy if exists document_templates_select_public on public.document_templates;
create policy document_templates_select_public on public.document_templates
  for select to anon, authenticated using (statut = 'publie' or (select public.is_admin()));

drop policy if exists blog_posts_select_public on public.blog_posts;
create policy blog_posts_select_public on public.blog_posts
  for select to anon, authenticated using (
    (statut = 'publie' and published_at <= now()) or (select public.is_admin())
  );
-- guide_partners : guide_partners_select_public (0250) inchangée (actif or is_admin()).

-- Territoires : lecture des territoires ouverts, écriture admin.
alter table public.guide_territoires enable row level security;

drop policy if exists guide_territoires_select_public on public.guide_territoires;
create policy guide_territoires_select_public on public.guide_territoires
  for select to anon, authenticated using (disponible or (select public.is_admin()));

drop policy if exists guide_territoires_insert_admin on public.guide_territoires;
create policy guide_territoires_insert_admin on public.guide_territoires
  for insert to authenticated with check ((select public.is_admin()) and (select public.mfa_satisfied()));

drop policy if exists guide_territoires_update_admin on public.guide_territoires;
create policy guide_territoires_update_admin on public.guide_territoires
  for update to authenticated
  using ((select public.is_admin()) and (select public.mfa_satisfied()))
  with check ((select public.is_admin()) and (select public.mfa_satisfied()));

drop policy if exists guide_territoires_delete_admin on public.guide_territoires;
create policy guide_territoires_delete_admin on public.guide_territoires
  for delete to authenticated using ((select public.is_admin()) and (select public.mfa_satisfied()));

revoke all on table public.guide_territoires from anon;
grant select on table public.guide_territoires to anon;
grant select, insert, update, delete on table public.guide_territoires to authenticated;

-- Historique : lecture admin uniquement (session MFA satisfaite), aucune écriture client.
alter table public.content_versions enable row level security;

drop policy if exists content_versions_select_admin on public.content_versions;
create policy content_versions_select_admin on public.content_versions
  for select to authenticated using ((select public.is_admin()));

drop policy if exists mfa_required on public.content_versions;
create policy mfa_required on public.content_versions
  as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));

revoke all on table public.content_versions from public, anon, authenticated;
grant select on table public.content_versions to authenticated;
grant all on table public.content_versions to service_role;


-- =====================================================================
-- 9. STORAGE : images du blog (bucket PUBLIC en lecture)
-- =====================================================================
-- Lecture : URL publique /storage/v1/object/public/blog-images/<chemin>
-- (aucune politique SELECT nécessaire ; le listing reste réservé aux admins).
-- Écriture : administrateurs avec MFA satisfaite. 5 Mo, JPEG/PNG/WebP.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('blog-images', 'blog-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists blog_images_select_admin on storage.objects;
create policy blog_images_select_admin on storage.objects
  for select to authenticated
  using (bucket_id = 'blog-images' and (select public.is_admin()));

drop policy if exists blog_images_insert_admin on storage.objects;
create policy blog_images_insert_admin on storage.objects
  for insert to authenticated
  with check (bucket_id = 'blog-images' and (select public.is_admin()) and (select public.mfa_satisfied()));

drop policy if exists blog_images_update_admin on storage.objects;
create policy blog_images_update_admin on storage.objects
  for update to authenticated
  using (bucket_id = 'blog-images' and (select public.is_admin()) and (select public.mfa_satisfied()))
  with check (bucket_id = 'blog-images' and (select public.is_admin()) and (select public.mfa_satisfied()));

drop policy if exists blog_images_delete_admin on storage.objects;
create policy blog_images_delete_admin on storage.objects
  for delete to authenticated
  using (bucket_id = 'blog-images' and (select public.is_admin()) and (select public.mfa_satisfied()));


-- =====================================================================
-- Rollback (à exécuter manuellement si nécessaire, dans cet ordre)
-- =====================================================================
-- drop policy if exists blog_images_select_admin on storage.objects;
-- drop policy if exists blog_images_insert_admin on storage.objects;
-- drop policy if exists blog_images_update_admin on storage.objects;
-- drop policy if exists blog_images_delete_admin on storage.objects;
-- delete from storage.buckets where id = 'blog-images';   -- après avoir vidé le bucket
-- drop trigger if exists trg_guide_partners_before_write on public.guide_partners;
-- drop trigger if exists trg_guide_partners_version on public.guide_partners;
-- drop policy if exists mfa_required_insert on public.guide_partners;
-- drop policy if exists mfa_required_update on public.guide_partners;
-- drop policy if exists mfa_required_delete on public.guide_partners;
-- alter table public.guide_partners drop column if exists version, drop column if exists published_at,
--   drop column if exists created_by, drop column if exists updated_by;
-- drop table if exists public.content_versions;
-- drop table if exists public.blog_posts;
-- drop table if exists public.document_templates;
-- drop table if exists public.guide_parcours;
-- drop table if exists public.guide_fiches;
-- drop table if exists public.guide_territoires;
-- drop function if exists public.content_log_version();
-- drop function if exists public.content_before_write();
