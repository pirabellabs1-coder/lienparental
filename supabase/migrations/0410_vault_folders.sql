-- =====================================================================
-- Lien Parental — 0410_vault_folders.sql
-- Coffre-fort « petit drive » : dossiers, sous-dossiers et partage d'un
-- dossier avec un parent lié (lecture seule).
--
--   1. vault_folders          : dossiers et sous-dossiers (6 niveaux max),
--                               propriétaire seul en écriture ;
--   2. documents.folder_id    : rangement d'un document dans un dossier
--                               (coexiste avec les catégories) ;
--   3. vault_folder_shares    : partage d'un dossier avec UN parent lié.
--                               Le dossier, ses sous-dossiers et tous leurs
--                               documents (y compris ajoutés plus tard)
--                               deviennent lisibles par ce parent ;
--   4. vault_shared_folder_ids() : prédicat des politiques (initPlan) ;
--   5. politiques RLS + politique Storage « documents folder share select » ;
--   6. révocation automatique des partages quand le lien entre parents
--      disparaît (gardien révoqué, fiche supprimée, lien V1 rompu).
--
-- Règle d'accès d'un parent B à un dossier de A : il existe un partage
-- NON révoqué (A → B) sur ce dossier ou sur un de ses ancêtres, ET A et B
-- sont toujours liés (public.messaging_linked, 0360 : titulaire ou parent
-- actif d'un même enfant, ou coparent_link accepté). Les proches n'y ont
-- jamais accès. Les politiques RESTRICTIVE mfa_required (0270) et
-- vault_unlocked (0370) s'appliquent en ET : le coffre du LECTEUR doit être
-- déverrouillé pour lire documents et fichiers.
--
-- Écritures : le propriétaire seul (RLS). Le parent destinataire n'a
-- AUCUNE politique d'écriture sur les dossiers, documents ou partages.
--
-- Ré-exécutable (if not exists, drop … if exists, or replace).
-- Rollback : bloc commenté en fin de fichier.
-- Tests : tests/sql/scenarios/0410-dossiers.test.mjs.
-- =====================================================================


-- =====================================================================
-- 1. TABLES
-- =====================================================================

-- --- vault_folders ---------------------------------------------------------
create table if not exists public.vault_folders (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  -- Suppression d'un dossier : ses sous-dossiers suivent ; ses documents
  -- reviennent à la racine du coffre (documents.folder_id on delete set null).
  parent_id   uuid references public.vault_folders(id) on delete cascade,
  name        text not null
                check (char_length(btrim(name)) between 1 and 60 and name !~ '[[:cntrl:]]'),
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint chk_vault_folders_not_self check (parent_id is distinct from id)
);

-- Deux dossiers frères ne portent pas le même nom (casse ignorée).
create unique index if not exists uq_vault_folders_sibling_name
  on public.vault_folders(user_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(name)));
create index if not exists idx_vault_folders_parent
  on public.vault_folders(parent_id) where parent_id is not null;

drop trigger if exists trg_vault_folders_updated_at on public.vault_folders;
create trigger trg_vault_folders_updated_at
  before update on public.vault_folders
  for each row execute function public.handle_updated_at();

comment on table public.vault_folders is
  'Dossiers et sous-dossiers du coffre-fort (0410). Écriture : propriétaire seul. Lecture : propriétaire, ou parent lié destinataire d''un partage (vault_folder_shares) du dossier ou d''un ancêtre.';

-- --- documents.folder_id ------------------------------------------------------
alter table public.documents
  add column if not exists folder_id uuid references public.vault_folders(id) on delete set null;
create index if not exists idx_documents_folder
  on public.documents(folder_id) where folder_id is not null and deleted_at is null;
-- 0270 §M3 : documents n'a que des privilèges UPDATE par colonne.
grant update (folder_id) on table public.documents to authenticated;

comment on column public.documents.folder_id is
  'Dossier du coffre (0410). NULL = racine. Toujours un dossier du même propriétaire (trg_documents_folder_guard).';

-- --- vault_folder_shares ------------------------------------------------------
-- Historique conservé : « Arrêter le partage » pose revoked_at (jamais
-- d'effacement côté client nécessaire). Un nouveau partage = nouvelle ligne.
create table if not exists public.vault_folder_shares (
  id          uuid primary key default gen_random_uuid(),
  folder_id   uuid not null references public.vault_folders(id) on delete cascade,
  owner_id    uuid not null references public.users(id) on delete cascade,
  grantee_id  uuid not null references public.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz,
  constraint chk_vault_folder_shares_not_self check (owner_id <> grantee_id)
);

create unique index if not exists uq_vault_folder_shares_active
  on public.vault_folder_shares(folder_id, grantee_id) where revoked_at is null;
create index if not exists idx_vault_folder_shares_grantee
  on public.vault_folder_shares(grantee_id) where revoked_at is null;
create index if not exists idx_vault_folder_shares_owner
  on public.vault_folder_shares(owner_id, created_at desc);

comment on table public.vault_folder_shares is
  'Partage d''un dossier du coffre avec un parent lié, en lecture seule (0410). Actif tant que revoked_at est NULL ET que les deux parents restent liés.';


-- =====================================================================
-- 2. GARDE-FOUS (déclencheurs)
-- =====================================================================

-- Dossier parent du même propriétaire, pas de cycle, 6 niveaux au plus.
create or replace function public.vault_folders_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_max_depth constant integer := 6;
  v_owner  uuid;
  v_cur    uuid;
  v_depth  integer := 0;   -- nombre d'ancêtres du dossier
  v_height integer := 1;   -- hauteur du sous-arbre (dossier compris)
begin
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'Propriétaire non modifiable' using errcode = '42501';
  end if;
  new.name := btrim(new.name);

  -- Déplacements concurrents d'un même parent sérialisés : deux UPDATE parallèles
  -- (A sous B, B sous A) ne peuvent pas passer chacun le contrôle de cycle.
  if new.parent_id is not null
     and (tg_op = 'INSERT' or new.parent_id is distinct from old.parent_id) then
    perform pg_advisory_xact_lock(hashtextextended('vault_folders:' || new.user_id::text, 0));
  end if;

  if new.parent_id is not null then
    select f.user_id into v_owner from public.vault_folders f where f.id = new.parent_id;
    if v_owner is null or v_owner <> new.user_id then
      raise exception 'Dossier parent introuvable' using errcode = '23503', hint = 'vault_folder_parent';
    end if;
    v_cur := new.parent_id;
    while v_cur is not null loop
      if v_cur = new.id then
        raise exception 'Un dossier ne peut pas être rangé dans lui-même' using errcode = '23514', hint = 'vault_folder_cycle';
      end if;
      v_depth := v_depth + 1;
      if v_depth >= c_max_depth then
        raise exception 'Trop de niveaux de dossiers' using errcode = '54000', hint = 'vault_folder_depth';
      end if;
      select f.parent_id into v_cur from public.vault_folders f where f.id = v_cur;
    end loop;
  end if;

  if tg_op = 'UPDATE' and new.parent_id is distinct from old.parent_id then
    with recursive sub as (
      select f.id, 1 as lvl from public.vault_folders f where f.parent_id = new.id
      union all
      select f.id, sub.lvl + 1 from public.vault_folders f join sub on f.parent_id = sub.id where sub.lvl < 64
    )
    select coalesce(max(sub.lvl), 0) + 1 into v_height from sub;
  end if;

  if v_depth + v_height > c_max_depth then
    raise exception 'Trop de niveaux de dossiers' using errcode = '54000', hint = 'vault_folder_depth';
  end if;
  return new;
end;
$$;
revoke all on function public.vault_folders_guard() from public, anon, authenticated;

drop trigger if exists trg_vault_folders_guard on public.vault_folders;
create trigger trg_vault_folders_guard
  before insert or update of parent_id, user_id, name on public.vault_folders
  for each row execute function public.vault_folders_guard();

-- Un document ne peut être rangé que dans un dossier de SON propriétaire
-- (sinon un parent pourrait glisser un document dans le dossier d'autrui).
create or replace function public.documents_folder_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.folder_id is not null and not exists (
    select 1 from public.vault_folders f where f.id = new.folder_id and f.user_id = new.user_id
  ) then
    raise exception 'Dossier introuvable' using errcode = '23503', hint = 'vault_folder_not_found';
  end if;
  return new;
end;
$$;
revoke all on function public.documents_folder_guard() from public, anon, authenticated;

drop trigger if exists trg_documents_folder_guard on public.documents;
create trigger trg_documents_folder_guard
  before insert or update of folder_id, user_id on public.documents
  for each row execute function public.documents_folder_guard();

-- Partage : dossier du propriétaire ; seule la révocation est modifiable
-- et elle est définitive (un nouveau partage crée une nouvelle ligne).
create or replace function public.vault_folder_shares_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if not exists (
      select 1 from public.vault_folders f where f.id = new.folder_id and f.user_id = new.owner_id
    ) then
      raise exception 'Dossier introuvable' using errcode = '23503', hint = 'vault_folder_not_found';
    end if;
    -- Re-contrôle du lien au moment de l'écriture (la politique d'insertion le vérifie
    -- aussi ; ici, sous verrou, pour fermer la course avec une rupture de lien).
    perform pg_advisory_xact_lock(hashtextextended('vault_shares:' || new.owner_id::text || ':' || new.grantee_id::text, 0));
    if not public.messaging_linked(new.owner_id, new.grantee_id) then
      raise exception 'Parent non lié' using errcode = '42501', hint = 'vault_share_not_linked';
    end if;
    return new;
  end if;
  if new.folder_id is distinct from old.folder_id
     or new.owner_id is distinct from old.owner_id
     or new.grantee_id is distinct from old.grantee_id
     or new.created_at is distinct from old.created_at
     or (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at) then
    raise exception 'Partage non modifiable' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.vault_folder_shares_guard() from public, anon, authenticated;

drop trigger if exists trg_vault_folder_shares_guard on public.vault_folder_shares;
create trigger trg_vault_folder_shares_guard
  before insert or update on public.vault_folder_shares
  for each row execute function public.vault_folder_shares_guard();


-- =====================================================================
-- 3. PRÉDICATS (authenticated, relatifs à auth.uid())
-- =====================================================================

-- Le parent p_other est-il lié à moi ? (même règle que la messagerie, 0360)
create or replace function public.vault_is_linked_parent(p_other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
     and p_other is not null
     and public.messaging_linked(auth.uid(), p_other);
$$;
revoke all on function public.vault_is_linked_parent(uuid) from public, anon;
grant execute on function public.vault_is_linked_parent(uuid) to authenticated, service_role;

-- Dossiers d'AUTRES parents lisibles par moi : racines partagées actives
-- (partage non révoqué, parents toujours liés) + tous leurs descendants.
-- Appelée sous la forme `(select public.vault_shared_folder_ids())` :
-- évaluée une fois par requête (initPlan).
create or replace function public.vault_shared_folder_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  with recursive roots as (
    select f.id, f.user_id
      from public.vault_folder_shares s
      join public.vault_folders f on f.id = s.folder_id and f.user_id = s.owner_id
     where s.grantee_id = auth.uid()
       and s.revoked_at is null
       and public.messaging_linked(s.owner_id, auth.uid())
  ),
  tree as (
    select r.id, r.user_id, 1 as lvl from roots r
    union all
    select c.id, c.user_id, t.lvl + 1
      from public.vault_folders c
      join tree t on c.parent_id = t.id and c.user_id = t.user_id
     where t.lvl < 16
  )
  select coalesce(array_agg(distinct tree.id), '{}'::uuid[])
    from tree
   where auth.uid() is not null;
$$;
revoke all on function public.vault_shared_folder_ids() from public, anon;
grant execute on function public.vault_shared_folder_ids() to authenticated, service_role;

comment on function public.vault_shared_folder_ids() is
  'Dossiers d''autres parents partagés avec auth.uid() (partage actif, parents liés), descendants compris (0410). Prédicat des politiques *_folder_share.';


-- =====================================================================
-- 4. RLS
-- =====================================================================
alter table public.vault_folders       enable row level security;
alter table public.vault_folder_shares enable row level security;

revoke all on table public.vault_folders, public.vault_folder_shares from public, anon, authenticated;
grant select, delete on table public.vault_folders to authenticated;
grant insert (user_id, parent_id, name, position) on table public.vault_folders to authenticated;
grant update (parent_id, name, position) on table public.vault_folders to authenticated;
grant select, delete on table public.vault_folder_shares to authenticated;
grant insert (folder_id, owner_id, grantee_id) on table public.vault_folder_shares to authenticated;
grant update (revoked_at) on table public.vault_folder_shares to authenticated;
grant all on table public.vault_folders, public.vault_folder_shares to service_role;

-- --- vault_folders ------------------------------------------------------------
drop policy if exists vault_folders_owner on public.vault_folders;
create policy vault_folders_owner on public.vault_folders
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Destinataire : lecture seule des dossiers partagés (et sous-dossiers).
drop policy if exists vault_folders_select_shared on public.vault_folders;
create policy vault_folders_select_shared on public.vault_folders
  for select to authenticated
  using (id = any ((select public.vault_shared_folder_ids())::uuid[]));

-- --- vault_folder_shares --------------------------------------------------------
drop policy if exists vault_folder_shares_select_owner on public.vault_folder_shares;
create policy vault_folder_shares_select_owner on public.vault_folder_shares
  for select to authenticated
  using (owner_id = auth.uid());

drop policy if exists vault_folder_shares_select_grantee on public.vault_folder_shares;
create policy vault_folder_shares_select_grantee on public.vault_folder_shares
  for select to authenticated
  using (
    grantee_id = auth.uid()
    and revoked_at is null
    and folder_id = any ((select public.vault_shared_folder_ids())::uuid[])
  );

-- Création : mon dossier, vers un parent qui m'est lié.
drop policy if exists vault_folder_shares_insert_owner on public.vault_folder_shares;
create policy vault_folder_shares_insert_owner on public.vault_folder_shares
  for insert to authenticated
  with check (
    owner_id = auth.uid()
    and revoked_at is null
    and exists (select 1 from public.vault_folders f where f.id = folder_id and f.user_id = auth.uid())
    and public.vault_is_linked_parent(grantee_id)
  );

-- « Arrêter le partage » : propriétaire seul (colonne revoked_at seulement).
drop policy if exists vault_folder_shares_update_owner on public.vault_folder_shares;
create policy vault_folder_shares_update_owner on public.vault_folder_shares
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists vault_folder_shares_delete_owner on public.vault_folder_shares;
create policy vault_folder_shares_delete_owner on public.vault_folder_shares
  for delete to authenticated
  using (owner_id = auth.uid());

-- --- RESTRICTIVE : MFA (0270) ; coffre déverrouillé (0370) pour les partages.
-- En LECTURE, les dossiers suivent la règle des catégories (lus hors du coffre :
-- feuille « Mettre au coffre-fort » de la messagerie, réglages) : MFA seulement.
-- Leurs écritures exigent le coffre déverrouillé (politiques ci-dessous), et les
-- documents qu'ils contiennent restent protégés par vault_unlocked (0370).
do $$
declare
  t text;
begin
  foreach t in array array['vault_folders', 'vault_folder_shares'] loop
    execute format('drop policy if exists mfa_required on public.%I', t);
    execute format(
      'create policy mfa_required on public.%I as restrictive for all to authenticated '
      'using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()))',
      t
    );
  end loop;
end $$;

drop policy if exists vault_unlocked on public.vault_folder_shares;
create policy vault_unlocked on public.vault_folder_shares
  as restrictive for all to authenticated
  using ((select public.vault_unlocked())) with check ((select public.vault_unlocked()));

-- Structure des dossiers : ÉCRITURES seulement si le coffre est déverrouillé (sinon,
-- coffre verrouillé, une session pourrait glisser un dossier privé sous un dossier
-- partagé). La LECTURE reste sous MFA seule (noms listés par la messagerie).
drop policy if exists vault_unlocked_insert on public.vault_folders;
create policy vault_unlocked_insert on public.vault_folders
  as restrictive for insert to authenticated
  with check ((select public.vault_unlocked()));
drop policy if exists vault_unlocked_update on public.vault_folders;
create policy vault_unlocked_update on public.vault_folders
  as restrictive for update to authenticated
  using ((select public.vault_unlocked())) with check ((select public.vault_unlocked()));
drop policy if exists vault_unlocked_delete on public.vault_folders;
create policy vault_unlocked_delete on public.vault_folders
  as restrictive for delete to authenticated
  using ((select public.vault_unlocked()));

-- --- documents : lecture seule des documents des dossiers partagés ---------------
-- Aucune politique d'écriture ajoutée : documents_crud_self (0100) reste la
-- seule règle d'écriture (user_id = auth.uid()).
drop policy if exists documents_select_folder_share on public.documents;
create policy documents_select_folder_share on public.documents
  for select to authenticated
  using (
    folder_id is not null
    and deleted_at is null
    and user_id <> auth.uid()
    and folder_id = any ((select public.vault_shared_folder_ids())::uuid[])
  );

-- --- Storage : téléchargement des fichiers des dossiers partagés ------------------
-- La sous-requête s'exécute sous la RLS de l'appelant (documents visibles).
-- « private buckets mfa required » (0270) et « documents vault unlocked »
-- (0370), RESTRICTIVE, continuent de s'appliquer en ET.
drop policy if exists "documents folder share select" on storage.objects;
create policy "documents folder share select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(storage.objects.name))[1] <> auth.uid()::text
    and exists (
      select 1 from public.documents d
       where d.storage_path = storage.objects.name
         and d.deleted_at is null
         and d.folder_id = any ((select public.vault_shared_folder_ids())::uuid[])
    )
  );


-- =====================================================================
-- 5. RÉVOCATION AUTOMATIQUE QUAND LE LIEN DISPARAÎT
-- =====================================================================
-- Le prédicat vérifie déjà le lien à chaque lecture ; ces déclencheurs
-- rendent la fin du partage DÉFINITIVE (un nouveau lien ne rouvre pas
-- d'anciens partages : le parent doit repartager).
create or replace function public._vault_folder_shares_prune_for_user(p_user_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  update public.vault_folder_shares s
     set revoked_at = now()
   where s.revoked_at is null
     and (s.owner_id = p_user_id or s.grantee_id = p_user_id)
     and not public.messaging_linked(s.owner_id, s.grantee_id);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public._vault_folder_shares_prune_for_user(uuid) from public, anon, authenticated;
grant execute on function public._vault_folder_shares_prune_for_user(uuid) to service_role;

create or replace function public.vault_shares_after_guardian_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'active' then
      perform public._vault_folder_shares_prune_for_user(old.user_id);
    end if;
    return old;
  end if;
  if old.status = 'active'
     and (new.status <> 'active' or (old.role = 'parent' and new.role <> 'parent')) then
    perform public._vault_folder_shares_prune_for_user(new.user_id);
  end if;
  return new;
end;
$$;
revoke all on function public.vault_shares_after_guardian_change() from public, anon, authenticated;

drop trigger if exists trg_child_guardians_prune_vault_shares on public.child_guardians;
create trigger trg_child_guardians_prune_vault_shares
  after update of status, role or delete on public.child_guardians
  for each row execute function public.vault_shares_after_guardian_change();

create or replace function public.vault_shares_after_child_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
begin
  for v_uid in
    select new.user_id
    union
    select g.user_id from public.child_guardians g where g.child_id = new.id and g.status = 'active'
  loop
    perform public._vault_folder_shares_prune_for_user(v_uid);
  end loop;
  return new;
end;
$$;
revoke all on function public.vault_shares_after_child_delete() from public, anon, authenticated;

drop trigger if exists trg_children_prune_vault_shares on public.children;
create trigger trg_children_prune_vault_shares
  after update of deleted_at on public.children
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.vault_shares_after_child_delete();

create or replace function public.vault_shares_after_coparent_link_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'accepted' and old.coparent_user_id is not null
     and (tg_op = 'DELETE'
          or new.status <> 'accepted'
          or new.user_id is distinct from old.user_id
          or new.coparent_user_id is distinct from old.coparent_user_id) then
    perform public._vault_folder_shares_prune_for_user(old.user_id);
    perform public._vault_folder_shares_prune_for_user(old.coparent_user_id);
  end if;
  return coalesce(new, old);
end;
$$;
revoke all on function public.vault_shares_after_coparent_link_change() from public, anon, authenticated;

drop trigger if exists trg_coparent_links_prune_vault_shares on public.coparent_links;
create trigger trg_coparent_links_prune_vault_shares
  after update or delete on public.coparent_links
  for each row execute function public.vault_shares_after_coparent_link_change();


-- =====================================================================
-- ROLLBACK (manuel, dans l'ordre)
-- =====================================================================
-- drop trigger if exists trg_coparent_links_prune_vault_shares on public.coparent_links;
-- drop trigger if exists trg_children_prune_vault_shares on public.children;
-- drop trigger if exists trg_child_guardians_prune_vault_shares on public.child_guardians;
-- drop function if exists public.vault_shares_after_coparent_link_change();
-- drop function if exists public.vault_shares_after_child_delete();
-- drop function if exists public.vault_shares_after_guardian_change();
-- drop function if exists public._vault_folder_shares_prune_for_user(uuid);
-- drop policy if exists "documents folder share select" on storage.objects;
-- drop policy if exists documents_select_folder_share on public.documents;
-- drop trigger if exists trg_documents_folder_guard on public.documents;
-- drop function if exists public.documents_folder_guard();
-- revoke update (folder_id) on table public.documents from authenticated;
-- alter table public.documents drop column if exists folder_id;
-- drop table if exists public.vault_folder_shares;
-- drop table if exists public.vault_folders;
-- drop function if exists public.vault_folder_shares_guard();
-- drop function if exists public.vault_folders_guard();
-- drop function if exists public.vault_shared_folder_ids();
-- drop function if exists public.vault_is_linked_parent(uuid);
