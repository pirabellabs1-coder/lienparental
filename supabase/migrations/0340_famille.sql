-- =====================================================================
-- Lien Parental — 0340_famille.sql  (chantier I : liaison des parents)
--
-- Modèle « foyer de l'enfant » : chaque fiche enfant garde son titulaire
-- (children.user_id, rôle implicite `owner`) et peut être partagée avec
-- d'autres adultes via child_guardians :
--   * parent : accès complet aux données PARTAGÉES de l'enfant ;
--   * proche : lecture limitée (prénom / classe via list_family_children(),
--              calendrier partagé). Pas de santé, documents ni dépenses.
--
-- Partagé : fiche enfant, santé (vaccinations, traitements, infos médicales),
-- événements du calendrier liés à l'enfant (sauf ceux marqués privés),
-- documents du coffre et dépenses EXPLICITEMENT marqués « partagés ».
-- Privé, toujours : Journal (journal_entries), Coach IA, témoignages,
-- documents et dépenses non partagés. AUCUNE politique n'est ajoutée sur
-- journal_entries, ai_analyses, testimonies, testimony_requests.
--
-- Principes :
--   * strictement additif : aucune migration antérieure modifiée, aucune
--     politique existante supprimée ou affaiblie ; les nouvelles politiques
--     sont PERMISSIVES (OU avec les règles « propriétaire »), et les
--     politiques RESTRICTIVES mfa_required (0270) continuent de s'appliquer
--     en ET sur toutes les tables concernées ;
--   * les fonctions SECURITY DEFINER contournent la RLS, donc aussi
--     mfa_required : chacune appelle explicitement _family_assert_caller()
--     (session + MFA) ; search_path fixé ; revoke public / anon ;
--   * invitations nominatives : jeton 244 bits généré par la base, seul son
--     SHA-256 est stocké ; acceptation liée à l'e-mail VÉRIFIÉ du JWT
--     (même règle que accept_coparent_invite, 0270 §M4) ; expiration 7 j ;
--   * ré-exécutable (if not exists, drop policy if exists, or replace).
--
-- Rollback : bloc commenté en fin de fichier.
-- Tests RLS commentés : section 9.
-- =====================================================================


-- =====================================================================
-- 1. TABLES
-- =====================================================================

-- --- family_invitations ---------------------------------------------------
-- Une invitation = un adulte (e-mail) + un rôle + un ou plusieurs enfants.
-- Sert aussi de « demande de synchronisation » quand l'invité a déjà un
-- compte : il la voit dans « Demandes reçues » (e-mail vérifié identique).
create table if not exists public.family_invitations (
  id             uuid primary key default gen_random_uuid(),
  inviter_id     uuid not null references public.users(id) on delete cascade,
  invitee_email  citext not null
                   check (length(invitee_email) between 3 and 254
                          and invitee_email::text ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  role           text not null check (role in ('parent', 'proche')),
  -- sha256(jeton) : le jeton en clair n'est renvoyé qu'une fois à l'invitant.
  token_hash     bytea not null unique check (octet_length(token_hash) = 32),
  status         text not null default 'pending'
                   check (status in ('pending', 'accepted', 'cancelled', 'declined')),
  expires_at     timestamptz not null,
  sent_count     integer not null default 1 check (sent_count between 1 and 10),
  last_sent_at   timestamptz not null default now(),
  accepted_by    uuid references public.users(id) on delete set null,
  responded_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint chk_family_invitations_expiry check (expires_at <= last_sent_at + interval '30 days')
);

-- Une seule invitation en attente par (invitant, e-mail) : on la renvoie
-- plutôt que d'en créer une seconde (409 côté API).
create unique index if not exists uq_family_invitations_pending
  on public.family_invitations(inviter_id, invitee_email) where status = 'pending';
create index if not exists idx_family_invitations_invitee_pending
  on public.family_invitations((lower(invitee_email::text))) where status = 'pending';
create index if not exists idx_family_invitations_inviter
  on public.family_invitations(inviter_id, created_at desc);

drop trigger if exists trg_family_invitations_updated_at on public.family_invitations;
create trigger trg_family_invitations_updated_at
  before update on public.family_invitations
  for each row execute function public.handle_updated_at();

-- --- family_invitation_children -----------------------------------------
create table if not exists public.family_invitation_children (
  invitation_id  uuid not null references public.family_invitations(id) on delete cascade,
  child_id       uuid not null references public.children(id) on delete cascade,
  primary key (invitation_id, child_id)
);
create index if not exists idx_family_invitation_children_child
  on public.family_invitation_children(child_id);

-- --- child_guardians ------------------------------------------------------
-- Adultes liés à une fiche enfant, en plus du titulaire (children.user_id).
-- Historique conservé : une révocation passe le statut à `revoked`.
create table if not exists public.child_guardians (
  id             uuid primary key default gen_random_uuid(),
  child_id       uuid not null references public.children(id) on delete cascade,
  user_id        uuid not null references public.users(id) on delete cascade,
  role           text not null check (role in ('parent', 'proche')),
  status         text not null default 'active' check (status in ('active', 'revoked')),
  invited_by     uuid references public.users(id) on delete set null,
  invitation_id  uuid references public.family_invitations(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  revoked_at     timestamptz,
  revoked_by     uuid references public.users(id) on delete set null,
  revoke_reason  text check (revoke_reason in ('removed', 'left', 'merged')),
  constraint chk_child_guardians_revoked check ((status = 'revoked') = (revoked_at is not null))
);

-- Au plus un lien actif par (enfant, adulte).
create unique index if not exists uq_child_guardians_active
  on public.child_guardians(child_id, user_id) where status = 'active';
-- Chemin chaud des politiques : « enfants où je suis gardien actif ».
create index if not exists idx_child_guardians_user_active
  on public.child_guardians(user_id, child_id) include (role) where status = 'active';

drop trigger if exists trg_child_guardians_updated_at on public.child_guardians;
create trigger trg_child_guardians_updated_at
  before update on public.child_guardians
  for each row execute function public.handle_updated_at();

-- Le titulaire de la fiche n'est jamais son propre gardien.
create or replace function public.child_guardians_check_not_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.children c where c.id = new.child_id and c.user_id = new.user_id) then
    raise exception 'Le titulaire de la fiche ne peut pas en être gardien' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.child_guardians_check_not_owner() from public, anon, authenticated;

drop trigger if exists trg_child_guardians_not_owner on public.child_guardians;
create trigger trg_child_guardians_not_owner
  before insert or update of child_id, user_id on public.child_guardians
  for each row execute function public.child_guardians_check_not_owner();

-- --- child_merges (journal des fusions) -----------------------------------
create table if not exists public.child_merges (
  id               uuid primary key default gen_random_uuid(),
  kept_child_id    uuid not null references public.children(id) on delete cascade,
  merged_child_id  uuid not null references public.children(id) on delete cascade,
  merged_by        uuid references public.users(id) on delete set null,
  summary          jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  check (kept_child_id <> merged_child_id)
);
create index if not exists idx_child_merges_kept on public.child_merges(kept_child_id);

-- --- child_merge_dismissals (« ce n'est pas le même enfant ») -------------
create table if not exists public.child_merge_dismissals (
  user_id          uuid not null references public.users(id) on delete cascade,
  my_child_id      uuid not null references public.children(id) on delete cascade,
  shared_child_id  uuid not null references public.children(id) on delete cascade,
  created_at       timestamptz not null default now(),
  primary key (user_id, my_child_id, shared_child_id)
);


-- =====================================================================
-- 2. COLONNES DE PARTAGE
-- =====================================================================

-- Calendrier : les événements EXISTANTS restent privés (valeur false posée
-- à l'ajout de la colonne, sans réécriture de table) ; les NOUVEAUX
-- événements liés à un enfant partagé sont partagés par défaut (true).
alter table public.calendar_events add column if not exists family_shared boolean not null default false;
alter table public.calendar_events alter column family_shared set default true;

-- Coffre : partage explicite, document par document.
alter table public.documents add column if not exists family_shared boolean not null default false;
-- 0270 §M3 : documents n'a plus de privilège UPDATE de table ; la nouvelle
-- colonne reçoit son propre privilège de colonne.
grant update (family_shared) on table public.documents to authenticated;

-- Dépenses du Journal : partage explicite, dépense par dépense.
alter table public.journal_expenses add column if not exists family_shared boolean not null default false;

create index if not exists idx_journal_expenses_family_shared
  on public.journal_expenses(user_id) where family_shared;
create index if not exists idx_journal_expenses_family_justif
  on public.journal_expenses((justificatif ->> 'path')) where family_shared and justificatif is not null;
create index if not exists idx_child_vaccinations_child_only on public.child_vaccinations(child_id);
create index if not exists idx_child_treatments_child_only on public.child_treatments(child_id);

comment on column public.calendar_events.family_shared is
  'Visible des adultes liés aux enfants de children_ids (0340). false pour les événements antérieurs à 0340.';
comment on column public.documents.family_shared is
  'Partage explicite avec les gardiens « parent » des enfants de children_ids (0340).';
comment on column public.journal_expenses.family_shared is
  'Partage explicite du détail financier (+ titre et date de l''entrée) avec les gardiens « parent » (0340). Description et médias du Journal jamais exposés.';


-- =====================================================================
-- 3. FONCTIONS INTERNES (service_role / autres fonctions uniquement)
-- =====================================================================

-- Session + MFA (les SECURITY DEFINER contournent mfa_required).
create or replace function public._family_assert_caller()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Non authentifié' using errcode = '42501';
  end if;
  if not public.mfa_satisfied() then
    raise exception 'Double authentification requise' using errcode = '42501', hint = 'mfa_required';
  end if;
  return auth.uid();
end;
$$;

-- E-mail du JWT s'il est vérifié ET identique à auth.users, sinon NULL.
create or replace function public._family_verified_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(u.email)
    from auth.users u
   where u.id = auth.uid()
     and u.email_confirmed_at is not null
     and lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
     and lower(u.email) <> '';
$$;

-- Rôle d'un adulte sur une fiche : 'owner' | 'parent' | 'proche' | NULL.
create or replace function public.family_role(p_child_id uuid, p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (
      select 1 from public.children c
       where c.id = p_child_id and c.user_id = p_user_id and c.deleted_at is null
    ) then 'owner'
    else (
      select g.role
        from public.child_guardians g
        join public.children c on c.id = g.child_id and c.deleted_at is null
        join public.users u on u.id = g.user_id and u.deleted_at is null
       where g.child_id = p_child_id and g.user_id = p_user_id and g.status = 'active'
       limit 1
    )
  end;
$$;

-- Prénom normalisé pour l'appariement (casse, accents, tirets, espaces).
create or replace function public._family_norm(p text)
returns text
language sql
immutable
set search_path = public
as $$
  select regexp_replace(
           lower(translate(trim(coalesce(p, '')),
             'àâäáãåçéèêëíìîïñóòôöõúùûüýÿÀÂÄÁÃÅÇÉÈÊËÍÌÎÏÑÓÒÔÖÕÚÙÛÜÝ-''',
             'aaaaaaceeeeiiiinooooouuuuyyAAAAAACEEEEIIIINOOOOOUUUUY  ')),
           '\s+', ' ', 'g');
$$;

revoke all on function public._family_assert_caller() from public, anon, authenticated;
revoke all on function public._family_verified_email() from public, anon, authenticated;
revoke all on function public.family_role(uuid, uuid) from public, anon, authenticated;
grant execute on function public.family_role(uuid, uuid) to service_role;


-- =====================================================================
-- 4. FONCTIONS UTILISÉES PAR LES POLITIQUES (authenticated)
-- =====================================================================
-- Toujours relatives à auth.uid() ; appelées sous la forme
-- `(select public.f(...))` → évaluées une fois par requête (initPlan).

-- Enfants dont je suis titulaire ou gardien actif (p_parent_only : rôle parent).
create or replace function public.my_family_child_ids(p_parent_only boolean default false)
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct x.id), '{}'::uuid[])
    from (
      select c.id
        from public.children c
       where c.user_id = auth.uid() and c.deleted_at is null
      union
      select g.child_id
        from public.child_guardians g
        join public.children c on c.id = g.child_id and c.deleted_at is null
       where g.user_id = auth.uid() and g.status = 'active'
         and (not p_parent_only or g.role = 'parent')
    ) x
   where auth.uid() is not null;
$$;

-- Autres adultes (titulaire ou parent) des enfants que je partage avec eux.
create or replace function public.my_family_member_ids(p_parent_only boolean default false)
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  with kids as (select unnest(public.my_family_child_ids(p_parent_only)) as cid)
  select coalesce(array_agg(distinct m.uid), '{}'::uuid[])
    from (
      select c.user_id as uid from kids join public.children c on c.id = kids.cid
      union
      select g.user_id from kids
        join public.child_guardians g on g.child_id = kids.cid and g.status = 'active' and g.role = 'parent'
    ) m
   where m.uid <> auth.uid();
$$;

-- Une ligne écrite par p_author et rattachée à p_children est-elle visible
-- pour moi ? Il faut un enfant commun dont : je suis membre (parent si
-- p_parent_only) ET l'auteur est titulaire ou parent ACTIF. Un gardien
-- révoqué cesse immédiatement de voir… et d'être vu.
create or replace function public.family_row_visible(p_author uuid, p_children uuid[], p_parent_only boolean default true)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and p_author is distinct from auth.uid()
     and exists (
       select 1
         from unnest(coalesce(p_children, '{}'::uuid[])) as k(cid)
         cross join lateral (
           select public.family_role(k.cid, auth.uid()) as me,
                  public.family_role(k.cid, p_author)   as author
         ) r
        where r.me is not null
          and (not p_parent_only or r.me in ('owner', 'parent'))
          and r.author in ('owner', 'parent')
     );
$$;

-- Dépense partagée : visibilité via les enfants de l'entrée du Journal,
-- sans jamais ouvrir journal_entries à l'autre parent.
create or replace function public.family_expense_visible(p_entry_id uuid, p_author uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.journal_entries e
     where e.id = p_entry_id
       and e.user_id = p_author
       and e.deleted_at is null
       and public.family_row_visible(p_author, e.children_ids, true)
  );
$$;

revoke all on function public.my_family_child_ids(boolean) from public, anon;
revoke all on function public.my_family_member_ids(boolean) from public, anon;
revoke all on function public.family_row_visible(uuid, uuid[], boolean) from public, anon;
revoke all on function public.family_expense_visible(uuid, uuid) from public, anon;
grant execute on function public.my_family_child_ids(boolean) to authenticated, service_role;
grant execute on function public.my_family_member_ids(boolean) to authenticated, service_role;
grant execute on function public.family_row_visible(uuid, uuid[], boolean) to authenticated, service_role;
grant execute on function public.family_expense_visible(uuid, uuid) to authenticated, service_role;


-- =====================================================================
-- 5. RLS DES NOUVELLES TABLES
-- =====================================================================
alter table public.family_invitations         enable row level security;
alter table public.family_invitation_children enable row level security;
alter table public.child_guardians            enable row level security;
alter table public.child_merges               enable row level security;
alter table public.child_merge_dismissals     enable row level security;

-- Écritures : exclusivement via les fonctions de la section 7.
revoke all on table public.family_invitations, public.family_invitation_children,
  public.child_guardians, public.child_merges, public.child_merge_dismissals from public, anon;
revoke insert, update, delete, truncate on table public.family_invitations,
  public.family_invitation_children, public.child_guardians, public.child_merges from authenticated;
revoke all on table public.family_invitations from authenticated;
-- token_hash n'est jamais lisible côté client.
grant select (id, inviter_id, invitee_email, role, status, expires_at, sent_count, last_sent_at,
              accepted_by, responded_at, created_at, updated_at)
  on table public.family_invitations to authenticated;
grant select on table public.family_invitation_children, public.child_guardians, public.child_merges to authenticated;
revoke update, truncate, references, trigger on table public.child_merge_dismissals from authenticated;
grant select, insert, delete on table public.child_merge_dismissals to authenticated;
grant all on table public.family_invitations, public.family_invitation_children,
  public.child_guardians, public.child_merges, public.child_merge_dismissals to service_role;

drop policy if exists family_invitations_select on public.family_invitations;
create policy family_invitations_select on public.family_invitations
  for select to authenticated
  using (inviter_id = auth.uid() or public.is_admin());

drop policy if exists family_invitation_children_select on public.family_invitation_children;
create policy family_invitation_children_select on public.family_invitation_children
  for select to authenticated
  using (
    exists (select 1 from public.family_invitations i
             where i.id = invitation_id and i.inviter_id = auth.uid())
    or public.is_admin()
  );

drop policy if exists child_guardians_select on public.child_guardians;
create policy child_guardians_select on public.child_guardians
  for select to authenticated
  using (
    user_id = auth.uid()
    or child_id = any ((select public.my_family_child_ids(false))::uuid[])
    or public.is_admin()
  );

drop policy if exists child_merges_select on public.child_merges;
create policy child_merges_select on public.child_merges
  for select to authenticated
  using (
    merged_by = auth.uid()
    or kept_child_id = any ((select public.my_family_child_ids(true))::uuid[])
    or public.is_admin()
  );

drop policy if exists child_merge_dismissals_self on public.child_merge_dismissals;
create policy child_merge_dismissals_self on public.child_merge_dismissals
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.children c where c.id = my_child_id and c.user_id = auth.uid())
  );

-- MFA (même politique RESTRICTIVE que 0270 §H1).
do $$
declare
  t text;
begin
  foreach t in array array[
    'family_invitations', 'family_invitation_children', 'child_guardians',
    'child_merges', 'child_merge_dismissals'
  ]
  loop
    execute format('drop policy if exists mfa_required on public.%I', t);
    execute format(
      'create policy mfa_required on public.%I as restrictive for all to authenticated '
      'using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()))',
      t
    );
  end loop;
end $$;


-- =====================================================================
-- 6. POLITIQUES ADDITIONNELLES SUR LES TABLES PARTAGÉES
-- =====================================================================
-- Permissives : s'ajoutent (OU) aux politiques « propriétaire » existantes,
-- qui restent inchangées. mfa_required (RESTRICTIVE, 0270) s'applique en ET.

-- --- children : lecture + mise à jour par les gardiens « parent » ---------
drop policy if exists children_select_family on public.children;
create policy children_select_family on public.children
  for select to authenticated
  using (deleted_at is null and id = any ((select public.my_family_child_ids(true))::uuid[]));

drop policy if exists children_update_family on public.children;
create policy children_update_family on public.children
  for update to authenticated
  using (deleted_at is null and id = any ((select public.my_family_child_ids(true))::uuid[]))
  with check (id = any ((select public.my_family_child_ids(true))::uuid[]));

-- Un gardien ne peut modifier ni le titulaire, ni la suppression, ni les
-- informations médicales chiffrées (clé dérivée du titulaire), ni la photo
-- (bucket privé du titulaire). SECURITY INVOKER : current_user = rôle réel.
create or replace function public.children_guard_family_update()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon')
     and auth.uid() is distinct from old.user_id
     and (new.user_id is distinct from old.user_id
          or new.deleted_at is distinct from old.deleted_at
          or new.infos_medicales is distinct from old.infos_medicales
          or new.photo_url is distinct from old.photo_url
          or new.created_at is distinct from old.created_at)
  then
    raise exception 'Seul le parent titulaire de la fiche peut modifier ces informations.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_children_guard_family_update on public.children;
create trigger trg_children_guard_family_update
  before update on public.children
  for each row execute function public.children_guard_family_update();

-- --- santé : lecture des entrées des autres parents, ajout des siennes ----
drop policy if exists child_vaccinations_select_family on public.child_vaccinations;
create policy child_vaccinations_select_family on public.child_vaccinations
  for select to authenticated
  using (
    child_id = any ((select public.my_family_child_ids(true))::uuid[])
    and public.family_row_visible(user_id, array[child_id], true)
  );

drop policy if exists child_vaccinations_insert_family on public.child_vaccinations;
create policy child_vaccinations_insert_family on public.child_vaccinations
  for insert to authenticated
  with check (auth.uid() = user_id and child_id = any ((select public.my_family_child_ids(true))::uuid[]));

drop policy if exists child_vaccinations_update_family on public.child_vaccinations;
create policy child_vaccinations_update_family on public.child_vaccinations
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and child_id = any ((select public.my_family_child_ids(true))::uuid[]));

drop policy if exists child_treatments_select_family on public.child_treatments;
create policy child_treatments_select_family on public.child_treatments
  for select to authenticated
  using (
    child_id = any ((select public.my_family_child_ids(true))::uuid[])
    and public.family_row_visible(user_id, array[child_id], true)
  );

drop policy if exists child_treatments_insert_family on public.child_treatments;
create policy child_treatments_insert_family on public.child_treatments
  for insert to authenticated
  with check (auth.uid() = user_id and child_id = any ((select public.my_family_child_ids(true))::uuid[]));

drop policy if exists child_treatments_update_family on public.child_treatments;
create policy child_treatments_update_family on public.child_treatments
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and child_id = any ((select public.my_family_child_ids(true))::uuid[]));

-- --- calendar_events : lecture seule (parents ET proches) -----------------
drop policy if exists calendar_select_family on public.calendar_events;
create policy calendar_select_family on public.calendar_events
  for select to authenticated
  using (
    family_shared
    and deleted_at is null
    and user_id = any ((select public.my_family_member_ids(false))::uuid[])
    and children_ids && (select public.my_family_child_ids(false))
    and public.family_row_visible(user_id, children_ids, false)
  );

-- --- documents : lecture seule des documents explicitement partagés -------
drop policy if exists documents_select_family on public.documents;
create policy documents_select_family on public.documents
  for select to authenticated
  using (
    family_shared
    and deleted_at is null
    and user_id = any ((select public.my_family_member_ids(true))::uuid[])
    and children_ids && (select public.my_family_child_ids(true))
    and public.family_row_visible(user_id, children_ids, true)
  );

-- --- journal_expenses : lecture seule des dépenses partagées --------------
drop policy if exists journal_expenses_select_family on public.journal_expenses;
create policy journal_expenses_select_family on public.journal_expenses
  for select to authenticated
  using (
    family_shared
    and user_id = any ((select public.my_family_member_ids(true))::uuid[])
    and public.family_expense_visible(entry_id, user_id)
  );

-- --- Storage : téléchargement des fichiers partagés ------------------------
-- La sous-requête s'exécute sous la RLS de l'appelant : seuls les documents
-- et justificatifs qui lui sont visibles (partagés) correspondent. Les
-- politiques « documents owner * » et « private buckets mfa required »
-- (0270, restrictive) restent inchangées.
drop policy if exists "documents family select" on storage.objects;
create policy "documents family select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(storage.objects.name))[1] <> auth.uid()::text
    and (
      exists (select 1 from public.documents d
               where d.storage_path = storage.objects.name
                 and d.family_shared and d.deleted_at is null)
      or exists (select 1 from public.journal_expenses je
                  where je.family_shared and je.justificatif is not null
                    and (je.justificatif ->> 'path') = storage.objects.name)
    )
  );


-- =====================================================================
-- 7. FONCTIONS MÉTIER (RPC, authenticated)
-- =====================================================================
-- Codes d'erreur : 42501 accès refusé · P0002 introuvable / invalide ·
-- 22023 paramètre invalide · 23505 doublon · 54000 limite atteinte.
-- `hint` porte un code stable traduit par l'API (lib/coparents/server).

-- --- create_family_invitation ----------------------------------------------
create or replace function public.create_family_invitation(
  p_email      text,
  p_role       text,
  p_child_ids  uuid[]
)
returns table (invitation_id uuid, token text, expires_at timestamptz)
language plpgsql
volatile
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_me     uuid := public._family_assert_caller();
  v_email  text := lower(trim(coalesce(p_email, '')));
  v_child  uuid;
  v_token  text;
  v_id     uuid;
  v_exp    timestamptz := now() + interval '7 days';
  v_count  integer;
begin
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(v_email) > 254 then
    raise exception 'E-mail invalide' using errcode = '22023', hint = 'invalid_email';
  end if;
  if p_role is null or p_role not in ('parent', 'proche') then
    raise exception 'Rôle invalide' using errcode = '22023', hint = 'invalid_role';
  end if;
  if p_child_ids is null or cardinality(p_child_ids) = 0 or cardinality(p_child_ids) > 20 then
    raise exception 'Enfants invalides' using errcode = '22023', hint = 'invalid_children';
  end if;
  if exists (select 1 from public.users u where u.id = v_me and lower(u.email::text) = v_email) then
    raise exception 'Invitation à soi-même' using errcode = '22023', hint = 'self_invite';
  end if;

  foreach v_child in array p_child_ids loop
    if coalesce(public.family_role(v_child, v_me), '') not in ('owner', 'parent') then
      raise exception 'Accès refusé' using errcode = '42501', hint = 'not_allowed';
    end if;
  end loop;

  -- Limite : 20 invitations / 24 h / invitant (sérialisé par verrou).
  perform pg_advisory_xact_lock(hashtextextended('family_invite:' || v_me::text, 0));
  select count(*)::int into v_count
    from public.family_invitations i
   where i.inviter_id = v_me and i.created_at > now() - interval '1 day';
  if v_count >= 20 then
    raise exception 'Trop d''invitations' using errcode = '54000', hint = 'too_many';
  end if;

  -- 2 × UUIDv4 = 244 bits d'aléa (gen_random_uuid → pg_strong_random).
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  insert into public.family_invitations (inviter_id, invitee_email, role, token_hash, expires_at)
  values (v_me, v_email, p_role, sha256(convert_to(v_token, 'UTF8')), v_exp)
  returning id into v_id;

  insert into public.family_invitation_children (invitation_id, child_id)
  select v_id, x from (select distinct unnest(p_child_ids) as x) t;

  return query select v_id, v_token, v_exp;
end;
$$;

-- --- resend_family_invitation (rotation du jeton) ----------------------------
create or replace function public.resend_family_invitation(p_invitation_id uuid)
returns table (token text, expires_at timestamptz, invitee_email text, role text)
language plpgsql
volatile
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_me    uuid := public._family_assert_caller();
  v_inv   public.family_invitations%rowtype;
  v_token text;
  v_exp   timestamptz := now() + interval '7 days';
begin
  select * into v_inv
    from public.family_invitations i
   where i.id = p_invitation_id and i.inviter_id = v_me and i.status = 'pending'
   for update;
  if not found then
    raise exception 'Invitation introuvable' using errcode = 'P0002';
  end if;
  if v_inv.last_sent_at > now() - interval '1 minute' then
    raise exception 'Patientez avant de renvoyer' using errcode = '54000', hint = 'cooldown';
  end if;
  if v_inv.sent_count >= 10 then
    raise exception 'Trop de renvois' using errcode = '54000', hint = 'too_many';
  end if;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  update public.family_invitations
     set token_hash   = sha256(convert_to(v_token, 'UTF8')),
         sent_count   = sent_count + 1,
         last_sent_at = now(),
         expires_at   = v_exp
   where id = v_inv.id;

  return query select v_token, v_exp, v_inv.invitee_email::text, v_inv.role;
end;
$$;

-- --- cancel_family_invitation ----------------------------------------------
create or replace function public.cancel_family_invitation(p_invitation_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_me uuid := public._family_assert_caller();
begin
  update public.family_invitations
     set status = 'cancelled', responded_at = now()
   where id = p_invitation_id and inviter_id = v_me and status = 'pending';
  if not found then
    raise exception 'Invitation introuvable' using errcode = 'P0002';
  end if;
end;
$$;

-- --- list_sent_family_invitations ------------------------------------------
create or replace function public.list_sent_family_invitations()
returns table (
  id uuid, invitee_email text, role text, status text, expires_at timestamptz,
  sent_count integer, last_sent_at timestamptz, created_at timestamptz, children jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_me uuid := public._family_assert_caller();
begin
  return query
    select i.id, i.invitee_email::text, i.role,
           case when i.status = 'pending' and i.expires_at <= now() then 'expired' else i.status end,
           i.expires_at, i.sent_count, i.last_sent_at, i.created_at,
           coalesce((
             select jsonb_agg(jsonb_build_object('id', c.id, 'prenom', c.prenom) order by c.prenom)
               from public.family_invitation_children ic
               join public.children c on c.id = ic.child_id and c.deleted_at is null
              where ic.invitation_id = i.id
           ), '[]'::jsonb)
      from public.family_invitations i
     where i.inviter_id = v_me
       and (i.status = 'pending' or (i.status = 'declined' and i.responded_at > now() - interval '30 days'))
     order by i.created_at desc
     limit 50;
end;
$$;

-- --- list_received_family_invitations ----------------------------------------
-- Demandes adressées à MON e-mail vérifié (synchronisation de comptes existants).
create or replace function public.list_received_family_invitations()
returns table (
  id uuid, inviter_id uuid, inviter_prenom text, inviter_nom text, role text,
  children jsonb, created_at timestamptz, expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_me    uuid := public._family_assert_caller();
  v_email text := public._family_verified_email();
begin
  if v_email is null then
    return;
  end if;
  return query
    select i.id, i.inviter_id, coalesce(u.prenom, ''), coalesce(u.nom, ''), i.role,
           coalesce((
             select jsonb_agg(jsonb_build_object('id', c.id, 'prenom', c.prenom, 'dateNaissance', c.date_naissance) order by c.prenom)
               from public.family_invitation_children ic
               join public.children c on c.id = ic.child_id and c.deleted_at is null
              where ic.invitation_id = i.id
           ), '[]'::jsonb),
           i.created_at, i.expires_at
      from public.family_invitations i
      join public.users u on u.id = i.inviter_id and u.deleted_at is null
     where lower(i.invitee_email::text) = v_email
       and i.status = 'pending'
       and i.expires_at > now()
       and i.inviter_id <> v_me
     order by i.created_at desc
     limit 20;
end;
$$;

-- --- get_family_invitation (page d'acceptation par lien) ------------------
-- Détails uniquement si l'e-mail vérifié correspond ; sinon un indice masqué.
create or replace function public.get_family_invitation(p_token text)
returns table (
  id uuid, status text, email_matches boolean, invitee_hint text,
  inviter_prenom text, role text, children jsonb, expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_me    uuid := public._family_assert_caller();
  v_email text := public._family_verified_email();
  v_inv   public.family_invitations%rowtype;
  v_ok    boolean;
  v_local text;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return;
  end if;
  select * into v_inv from public.family_invitations i
   where i.token_hash = sha256(convert_to(p_token, 'UTF8'));
  if not found then
    return;
  end if;

  v_ok := v_email is not null and v_email = lower(v_inv.invitee_email::text) and v_inv.inviter_id <> v_me;
  v_local := split_part(v_inv.invitee_email::text, '@', 1);

  return query
    select v_inv.id,
           case when v_inv.status = 'pending' and v_inv.expires_at <= now() then 'expired' else v_inv.status end,
           v_ok,
           left(v_local, 1) || '***@' || split_part(v_inv.invitee_email::text, '@', 2),
           case when v_ok then (select coalesce(u.prenom, '') from public.users u where u.id = v_inv.inviter_id) end,
           case when v_ok then v_inv.role end,
           case when v_ok then coalesce((
             select jsonb_agg(jsonb_build_object('id', c.id, 'prenom', c.prenom, 'dateNaissance', c.date_naissance) order by c.prenom)
               from public.family_invitation_children ic
               join public.children c on c.id = ic.child_id and c.deleted_at is null
              where ic.invitation_id = v_inv.id
           ), '[]'::jsonb) end,
           v_inv.expires_at;
end;
$$;

-- --- _family_accept (interne) -------------------------------------------------
create or replace function public._family_accept(p_invitation_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_me       uuid := public._family_assert_caller();
  v_email    text := public._family_verified_email();
  v_inv      public.family_invitations%rowtype;
  v_child    uuid;
  v_role     text;
  v_granted  uuid[] := '{}';
  v_conv     uuid;
begin
  if v_email is null then
    raise exception 'Invitation invalide ou expirée' using errcode = 'P0002';
  end if;

  select * into v_inv from public.family_invitations i
   where i.id = p_invitation_id
   for update;

  -- Réponse indistincte : inconnue, expirée, déjà traitée, autre destinataire.
  if not found
     or v_inv.status <> 'pending'
     or v_inv.expires_at <= now()
     or v_inv.inviter_id = v_me
     or lower(v_inv.invitee_email::text) <> v_email then
    raise exception 'Invitation invalide ou expirée' using errcode = 'P0002';
  end if;

  for v_child in
    select ic.child_id from public.family_invitation_children ic
      join public.children c on c.id = ic.child_id and c.deleted_at is null
     where ic.invitation_id = v_inv.id
  loop
    -- L'invitant doit avoir encore le droit de partager cet enfant.
    if coalesce(public.family_role(v_child, v_inv.inviter_id), '') not in ('owner', 'parent') then
      continue;
    end if;
    v_role := public.family_role(v_child, v_me);
    if v_role = 'owner' or v_role = 'parent' then
      continue;
    elsif v_role = 'proche' then
      if v_inv.role = 'parent' then
        update public.child_guardians
           set role = 'parent', invited_by = v_inv.inviter_id, invitation_id = v_inv.id
         where child_id = v_child and user_id = v_me and status = 'active';
        v_granted := v_granted || v_child;
      end if;
    else
      insert into public.child_guardians (child_id, user_id, role, invited_by, invitation_id)
      values (v_child, v_me, v_inv.role, v_inv.inviter_id, v_inv.id);
      v_granted := v_granted || v_child;
    end if;
  end loop;

  update public.family_invitations
     set status = 'accepted', accepted_by = v_me, responded_at = now()
   where id = v_inv.id;

  -- Compatibilité messagerie V1 (0230) : conversation entre les deux parents.
  if v_inv.role = 'parent' then
    begin
      select c.id into v_conv from public.conversations c
       where least(c.parent_a, c.parent_b) = least(v_inv.inviter_id, v_me)
         and greatest(c.parent_a, c.parent_b) = greatest(v_inv.inviter_id, v_me)
       limit 1;
      if v_conv is null then
        insert into public.conversations (parent_a, parent_b)
        values (v_inv.inviter_id, v_me)
        on conflict do nothing
        returning id into v_conv;
      end if;
    exception when undefined_table or undefined_column or not_null_violation then
      v_conv := null;  -- schéma de messagerie modifié (chantier H) : liaison conservée.
    end;
  end if;

  return jsonb_build_object(
    'invitation_id', v_inv.id,
    'inviter_id', v_inv.inviter_id,
    'role', v_inv.role,
    'child_ids', to_jsonb(v_granted),
    'conversation_id', v_conv
  );
end;
$$;

create or replace function public.accept_family_invitation(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform public._family_assert_caller();
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'Invitation invalide ou expirée' using errcode = 'P0002';
  end if;
  select i.id into v_id from public.family_invitations i
   where i.token_hash = sha256(convert_to(p_token, 'UTF8'));
  if v_id is null then
    raise exception 'Invitation invalide ou expirée' using errcode = 'P0002';
  end if;
  return public._family_accept(v_id);
end;
$$;

-- Acceptation depuis « Demandes reçues » (sans lien) : même contrôle d'e-mail.
create or replace function public.accept_family_invitation_by_id(p_invitation_id uuid)
returns jsonb
language sql
volatile
security definer
set search_path = public
as $$
  select public._family_accept(p_invitation_id);
$$;

-- --- decline_family_invitation ----------------------------------------------
create or replace function public.decline_family_invitation(p_invitation_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_me    uuid := public._family_assert_caller();
  v_email text := public._family_verified_email();
begin
  update public.family_invitations
     set status = 'declined', responded_at = now()
   where id = p_invitation_id
     and status = 'pending'
     and v_email is not null
     and lower(invitee_email::text) = v_email
     and inviter_id <> v_me;
  if not found then
    raise exception 'Invitation introuvable' using errcode = 'P0002';
  end if;
end;
$$;

-- --- revoke_child_guardian (retirer / quitter) -----------------------------
-- Titulaire : retire n'importe quel gardien. Parent gardien : retire ceux
-- qu'il a invités. Tout gardien peut se retirer lui-même.
create or replace function public.revoke_child_guardian(p_guardian_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_me     uuid := public._family_assert_caller();
  v_g      public.child_guardians%rowtype;
  v_owner  uuid;
  v_reason text;
begin
  select g.* into v_g from public.child_guardians g
   where g.id = p_guardian_id and g.status = 'active'
   for update;
  if not found then
    raise exception 'Lien introuvable' using errcode = 'P0002';
  end if;
  select c.user_id into v_owner from public.children c where c.id = v_g.child_id;

  if v_g.user_id = v_me then
    v_reason := 'left';
  elsif v_owner = v_me
     or (v_g.invited_by = v_me and public.family_role(v_g.child_id, v_me) = 'parent') then
    v_reason := 'removed';
  else
    raise exception 'Accès refusé' using errcode = '42501', hint = 'not_allowed';
  end if;

  update public.child_guardians
     set status = 'revoked', revoked_at = now(), revoked_by = v_me, revoke_reason = v_reason
   where id = v_g.id;

  return jsonb_build_object('user_id', v_g.user_id, 'child_id', v_g.child_id, 'reason', v_reason);
end;
$$;

-- --- set_child_guardian_role ----------------------------------------------
create or replace function public.set_child_guardian_role(p_guardian_id uuid, p_role text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_me    uuid := public._family_assert_caller();
  v_g     public.child_guardians%rowtype;
  v_owner uuid;
begin
  if p_role is null or p_role not in ('parent', 'proche') then
    raise exception 'Rôle invalide' using errcode = '22023', hint = 'invalid_role';
  end if;
  select g.* into v_g from public.child_guardians g
   where g.id = p_guardian_id and g.status = 'active'
   for update;
  if not found then
    raise exception 'Lien introuvable' using errcode = 'P0002';
  end if;
  select c.user_id into v_owner from public.children c where c.id = v_g.child_id;
  if v_g.user_id = v_me
     or not (v_owner = v_me
             or (v_g.invited_by = v_me and public.family_role(v_g.child_id, v_me) = 'parent')) then
    raise exception 'Accès refusé' using errcode = '42501', hint = 'not_allowed';
  end if;
  update public.child_guardians set role = p_role where id = v_g.id;
end;
$$;

-- --- list_family_members ------------------------------------------------------
-- Adultes liés à chacun de mes enfants (titulaire compris), avec mes droits.
create or replace function public.list_family_members()
returns table (
  child_id uuid, child_prenom text, child_date_naissance date, my_role text,
  guardian_id uuid, user_id uuid, prenom text, nom text, role text,
  invited_by uuid, since timestamptz, is_me boolean, can_manage boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_me uuid := public._family_assert_caller();
begin
  return query
    with kids as (
      select c.id, c.prenom, c.date_naissance, c.user_id as owner_id, c.created_at,
             public.family_role(c.id, v_me) as my_role
        from public.children c
       where c.id = any (public.my_family_child_ids(false))
    )
    select k.id, k.prenom, k.date_naissance, k.my_role,
           null::uuid, o.id, coalesce(o.prenom, ''), coalesce(o.nom, ''), 'owner'::text,
           null::uuid, k.created_at, o.id = v_me, false
      from kids k join public.users o on o.id = k.owner_id
    union all
    select k.id, k.prenom, k.date_naissance, k.my_role,
           g.id, u.id, coalesce(u.prenom, ''), coalesce(u.nom, ''), g.role,
           g.invited_by, g.created_at, u.id = v_me,
           (u.id <> v_me and (k.owner_id = v_me or (g.invited_by = v_me and k.my_role = 'parent')))
      from kids k
      join public.child_guardians g on g.child_id = k.id and g.status = 'active'
      join public.users u on u.id = g.user_id and u.deleted_at is null
     order by 2, 1, 11;
end;
$$;

-- --- list_family_children (vue limitée, utilisable par les proches) ------
create or replace function public.list_family_children()
returns table (child_id uuid, prenom text, classe text, date_naissance date, my_role text, owner_prenom text)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_me uuid := public._family_assert_caller();
begin
  return query
    select c.id, c.prenom, c.classe, c.date_naissance, public.family_role(c.id, v_me), coalesce(o.prenom, '')
      from public.children c
      join public.users o on o.id = c.user_id
     where c.id = any (public.my_family_child_ids(false))
     order by c.prenom;
end;
$$;

-- --- list_family_contacts (lib/coparents#listLinkedParents) -------------
-- Adultes partageant au moins un enfant avec moi + co-parent lié par la
-- messagerie V1 (coparent_links accepté).
--   role : 'parent' (titulaire ou parent d'un enfant commun), 'proche',
--          ou 'coparent' (lien messagerie seul) ;
--   messageable : même règle que list_linked_parents() ci-dessous (les deux
--          adultes sont parents d'un enfant commun, ou co-parents messagerie).
create or replace function public.list_family_contacts()
returns table (user_id uuid, prenom text, nom text, role text, photo_path text, messageable boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_me uuid := public._family_assert_caller();
begin
  return query
    with kids as (select unnest(public.my_family_child_ids(false)) as cid),
    members as (
      select c.id as cid, c.user_id as uid, 'parent'::text as r
        from kids join public.children c on c.id = kids.cid
      union all
      select g.child_id, g.user_id, g.role
        from kids join public.child_guardians g on g.child_id = kids.cid and g.status = 'active'
    ),
    pairs as (
      select o.uid, o.r as their_role, (o.r = 'parent' and me.r = 'parent') as can_msg
        from members o
        join members me on me.cid = o.cid and me.uid = v_me
       where o.uid <> v_me
      union all
      select case when l.user_id = v_me then l.coparent_user_id else l.user_id end, 'coparent', true
        from public.coparent_links l
       where l.status = 'accepted' and l.coparent_user_id is not null
         and v_me in (l.user_id, l.coparent_user_id)
    )
    select u.id, coalesce(u.prenom, ''), u.nom,
           case when bool_or(p.their_role = 'parent') then 'parent'
                when bool_or(p.their_role = 'proche') then 'proche'
                else 'coparent' end,
           u.photo_url,
           bool_or(p.can_msg)
      from pairs p
      join public.users u on u.id = p.uid and u.deleted_at is null
     where p.uid <> v_me
     group by u.id, u.prenom, u.nom, u.photo_url
     order by 2
     limit 50;
end;
$$;

-- --- list_linked_parents (contrat 0330, chantier H) -------------------------
-- Même signature que 0330 (create or replace prévu par le contrat) : on
-- ajoute aux co-parents de la messagerie V1 les adultes « parent » d'un
-- enfant dont l'appelant est lui-même titulaire ou parent. Les proches
-- ne sont pas des interlocuteurs de la messagerie (V1).
create or replace function public.list_linked_parents()
returns table (user_id uuid, prenom text, nom text, linked_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  with kids as (select unnest(public.my_family_child_ids(true)) as cid),
  members as (
    select c.id as cid, c.user_id as uid, c.created_at as joined
      from kids join public.children c on c.id = kids.cid
    union all
    select g.child_id, g.user_id, g.created_at
      from kids join public.child_guardians g
        on g.child_id = kids.cid and g.status = 'active' and g.role = 'parent'
  ),
  links as (
    select case when cl.user_id = auth.uid() then cl.coparent_user_id else cl.user_id end as uid,
           coalesce(cl.accepted_at, cl.created_at) as at
      from public.coparent_links cl
     where cl.status = 'accepted'
       and cl.coparent_user_id is not null
       and auth.uid() in (cl.user_id, cl.coparent_user_id)
    union all
    select o.uid, greatest(o.joined, me.joined)
      from members o
      join members me on me.cid = o.cid and me.uid = auth.uid()
     where o.uid <> auth.uid()
  )
  select u.id, coalesce(u.prenom, ''), coalesce(u.nom, ''), min(l.at)
    from links l
    join public.users u on u.id = l.uid and u.deleted_at is null
   where l.uid <> auth.uid()
     and (select public.mfa_satisfied())
   group by u.id, u.prenom, u.nom
   order by min(l.at);
$$;

revoke all on function public.list_linked_parents() from public, anon;
grant execute on function public.list_linked_parents() to authenticated;

-- --- list_merge_candidates (fiches en double) -------------------------------
-- Ma fiche (titulaire) vs une fiche partagée avec moi (gardien parent) :
-- même date de naissance et prénom normalisé identique.
create or replace function public.list_merge_candidates()
returns table (
  my_child_id uuid, my_child_prenom text, shared_child_id uuid, shared_child_prenom text,
  date_naissance date, shared_owner_prenom text
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_me uuid := public._family_assert_caller();
begin
  return query
    select mine.id, mine.prenom, sh.id, sh.prenom, sh.date_naissance, coalesce(o.prenom, '')
      from public.children mine
      join public.child_guardians g on g.user_id = v_me and g.status = 'active' and g.role = 'parent'
      join public.children sh on sh.id = g.child_id and sh.deleted_at is null
      join public.users o on o.id = sh.user_id
     where mine.user_id = v_me
       and mine.deleted_at is null
       and mine.id <> sh.id
       and mine.date_naissance = sh.date_naissance
       and public._family_norm(mine.prenom) = public._family_norm(sh.prenom)
       and not exists (
         select 1 from public.child_merge_dismissals d
          where d.user_id = v_me and d.my_child_id = mine.id and d.shared_child_id = sh.id
       )
     order by mine.prenom
     limit 20;
end;
$$;

-- --- merge_child_into (fusion confirmée manuellement) ---------------------
-- Fusionne MA fiche p_drop dans la fiche partagée p_keep :
--   * santé : la route serveur a déchiffré puis re-chiffré chaque entrée avec
--     l'AAD de p_keep (p_health = [{kind, id, payload}]) ; toutes MES entrées
--     doivent être fournies (sinon 22023 merge_incomplete, rien n'est fait) ;
--   * références (Journal, calendrier, coffre, frais, témoignages, enfant
--     actif) : p_drop remplacé par p_keep dans les tableaux children_ids ;
--     le Journal reste privé (seule la référence d'enfant change) ;
--   * fiche p_keep : champs vides complétés depuis p_drop (hors photo) ;
--     infos médicales re-chiffrées (p_keep_medical) si p_keep n'en a pas ;
--   * gardiens de p_drop : liens révoqués (motif merged), jamais transférés
--     sur la fiche d'un autre titulaire sans son accord ;
--   * p_drop : suppression logique (deleted_at) ; trace dans child_merges.
create or replace function public.merge_child_into(
  p_drop_child_id  uuid,
  p_keep_child_id  uuid,
  p_health         jsonb default '[]'::jsonb,
  p_keep_medical   jsonb default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_me        uuid := public._family_assert_caller();
  v_drop      public.children%rowtype;
  v_keep      public.children%rowtype;
  v_item      jsonb;
  v_ids_v     uuid[] := '{}';
  v_ids_t     uuid[] := '{}';
  v_moved     integer := 0;
  v_refs      integer := 0;
  v_n         integer;
  v_revoked   integer := 0;
  t           record;
begin
  if p_drop_child_id is null or p_keep_child_id is null or p_drop_child_id = p_keep_child_id then
    raise exception 'Fusion invalide' using errcode = '22023', hint = 'invalid_children';
  end if;
  if p_health is null or jsonb_typeof(p_health) <> 'array' or jsonb_array_length(p_health) > 500 then
    raise exception 'Fusion invalide' using errcode = '22023', hint = 'invalid_payload';
  end if;

  -- Verrous dans un ordre stable (pas d'interblocage entre deux fusions).
  perform 1 from public.children c
   where c.id in (p_drop_child_id, p_keep_child_id)
   order by c.id
   for update;

  select * into v_drop from public.children c where c.id = p_drop_child_id and c.deleted_at is null;
  select * into v_keep from public.children c where c.id = p_keep_child_id and c.deleted_at is null;
  if v_drop.id is null or v_keep.id is null then
    raise exception 'Fiche introuvable' using errcode = 'P0002';
  end if;
  if v_drop.user_id <> v_me or coalesce(public.family_role(p_keep_child_id, v_me), '') not in ('owner', 'parent') then
    raise exception 'Accès refusé' using errcode = '42501', hint = 'not_allowed';
  end if;
  if v_drop.date_naissance <> v_keep.date_naissance then
    raise exception 'Dates de naissance différentes' using errcode = '22023', hint = 'birthdate_mismatch';
  end if;

  -- Entrées de santé fournies, par table.
  for v_item in select * from jsonb_array_elements(p_health) loop
    if jsonb_typeof(v_item) <> 'object'
       or (v_item ->> 'kind') not in ('vaccination', 'traitement')
       or (v_item ->> 'id') !~ '^[0-9a-f-]{36}$'
       or jsonb_typeof(v_item -> 'payload') <> 'object' then
      raise exception 'Fusion invalide' using errcode = '22023', hint = 'invalid_payload';
    end if;
    if v_item ->> 'kind' = 'vaccination' then
      v_ids_v := v_ids_v || (v_item ->> 'id')::uuid;
    else
      v_ids_t := v_ids_t || (v_item ->> 'id')::uuid;
    end if;
  end loop;

  -- Toutes MES entrées de santé de p_drop doivent être re-chiffrées.
  if exists (select 1 from public.child_vaccinations v
              where v.child_id = p_drop_child_id and v.user_id = v_me and not (v.id = any (v_ids_v)))
     or exists (select 1 from public.child_treatments tr
              where tr.child_id = p_drop_child_id and tr.user_id = v_me and not (tr.id = any (v_ids_t))) then
    raise exception 'Fusion incomplète' using errcode = '22023', hint = 'merge_incomplete';
  end if;

  for v_item in select * from jsonb_array_elements(p_health) loop
    if v_item ->> 'kind' = 'vaccination' then
      update public.child_vaccinations
         set child_id = p_keep_child_id, payload = v_item -> 'payload'
       where id = (v_item ->> 'id')::uuid and child_id = p_drop_child_id;
    else
      update public.child_treatments
         set child_id = p_keep_child_id, payload = v_item -> 'payload'
       where id = (v_item ->> 'id')::uuid and child_id = p_drop_child_id;
    end if;
    get diagnostics v_n = row_count;
    v_moved := v_moved + v_n;
  end loop;

  -- Références d'enfant dans les tableaux uuid[] (tables présentes uniquement).
  for t in
    select * from (values
      ('journal_entries', 'children_ids'),
      ('calendar_events', 'children_ids'),
      ('documents', 'children_ids'),
      ('expenses', 'children_ids'),
      ('testimony_requests', 'context_children')
    ) as x(tbl, col)
  loop
    if to_regclass(format('public.%I', t.tbl)) is not null
       and exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = t.tbl and column_name = t.col) then
      execute format(
        'update public.%1$I set %2$I = array(select distinct u from unnest(array_replace(%2$I, $1, $2)) as u) '
        'where $1 = any (%2$I)', t.tbl, t.col)
      using p_drop_child_id, p_keep_child_id;
      get diagnostics v_n = row_count;
      v_refs := v_refs + v_n;
    end if;
  end loop;

  update public.preferences set active_child_id = p_keep_child_id where active_child_id = p_drop_child_id;

  -- Fiche conservée : on complète les champs vides (aucun écrasement).
  update public.children k
     set nom             = coalesce(k.nom, v_drop.nom),
         classe          = coalesce(k.classe, v_drop.classe),
         langue          = coalesce(k.langue, v_drop.langue),
         taille_cm       = coalesce(k.taille_cm, v_drop.taille_cm),
         poids_kg        = coalesce(k.poids_kg, v_drop.poids_kg),
         couleur_yeux    = coalesce(k.couleur_yeux, v_drop.couleur_yeux),
         couleur_cheveux = coalesce(k.couleur_cheveux, v_drop.couleur_cheveux),
         infos_medicales = case
           when k.infos_medicales is null and p_keep_medical is not null
                and jsonb_typeof(p_keep_medical) = 'object'
                and p_keep_medical ? 'ciphertext' and p_keep_medical ? 'iv' and p_keep_medical ? 'tag'
                and pg_column_size(p_keep_medical) <= 8192
             then p_keep_medical
           else k.infos_medicales
         end
   where k.id = p_keep_child_id;

  update public.child_guardians
     set status = 'revoked', revoked_at = now(), revoked_by = v_me, revoke_reason = 'merged'
   where child_id = p_drop_child_id and status = 'active';
  get diagnostics v_revoked = row_count;

  delete from public.family_invitation_children where child_id = p_drop_child_id;
  update public.family_invitations i
     set status = 'cancelled', responded_at = now()
   where i.status = 'pending'
     and not exists (select 1 from public.family_invitation_children ic where ic.invitation_id = i.id);

  update public.children set deleted_at = now() where id = p_drop_child_id;

  insert into public.child_merges (kept_child_id, merged_child_id, merged_by, summary)
  values (p_keep_child_id, p_drop_child_id, v_me,
          jsonb_build_object('health_moved', v_moved, 'references_updated', v_refs, 'guardians_revoked', v_revoked));

  return jsonb_build_object(
    'kept_child_id', p_keep_child_id,
    'merged_child_id', p_drop_child_id,
    'health_moved', v_moved,
    'references_updated', v_refs,
    'guardians_revoked', v_revoked
  );
end;
$$;

-- --- dismiss_merge_candidate ----------------------------------------------
create or replace function public.dismiss_merge_candidate(p_my_child_id uuid, p_shared_child_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_me uuid := public._family_assert_caller();
begin
  if not exists (select 1 from public.children c where c.id = p_my_child_id and c.user_id = v_me)
     or public.family_role(p_shared_child_id, v_me) is null then
    raise exception 'Accès refusé' using errcode = '42501', hint = 'not_allowed';
  end if;
  insert into public.child_merge_dismissals (user_id, my_child_id, shared_child_id)
  values (v_me, p_my_child_id, p_shared_child_id)
  on conflict do nothing;
end;
$$;

-- --- list_family_expenses (dépenses partagées : projection limitée) -------
-- Détail financier + titre et date de l'entrée. Jamais la description ni
-- les médias du Journal. Enfants : intersection avec MES enfants partagés.
create or replace function public.list_family_expenses(p_child_id uuid default null)
returns table (
  entry_id uuid, owner_id uuid, owner_prenom text, is_mine boolean, occurred_at timestamptz,
  titre text, amount_cents integer, currency text, categorie text, payment_method text,
  beneficiaire text, justificatif_path text, children_ids uuid[]
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_me   uuid := public._family_assert_caller();
  v_kids uuid[] := public.my_family_child_ids(true);
begin
  return query
    select je.entry_id, je.user_id, coalesce(u.prenom, ''), je.user_id = v_me, e.occurred_at,
           e.titre, je.amount_cents, je.currency, je.categorie, je.payment_method,
           je.beneficiaire, je.justificatif ->> 'path',
           array(select x from unnest(e.children_ids) x where x = any (v_kids))
      from public.journal_expenses je
      join public.journal_entries e on e.id = je.entry_id and e.user_id = je.user_id and e.deleted_at is null
      join public.users u on u.id = je.user_id
     where je.family_shared
       and (je.user_id = v_me or public.family_row_visible(je.user_id, e.children_ids, true))
       and e.children_ids && v_kids
       and (p_child_id is null or p_child_id = any (e.children_ids))
     order by e.occurred_at desc
     limit 300;
end;
$$;

-- --- Droits d'exécution --------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.create_family_invitation(text, text, uuid[])',
    'public.resend_family_invitation(uuid)',
    'public.cancel_family_invitation(uuid)',
    'public.list_sent_family_invitations()',
    'public.list_received_family_invitations()',
    'public.get_family_invitation(text)',
    'public.accept_family_invitation(text)',
    'public.accept_family_invitation_by_id(uuid)',
    'public.decline_family_invitation(uuid)',
    'public.revoke_child_guardian(uuid)',
    'public.set_child_guardian_role(uuid, text)',
    'public.list_family_members()',
    'public.list_family_children()',
    'public.list_family_contacts()',
    'public.list_merge_candidates()',
    'public.merge_child_into(uuid, uuid, jsonb, jsonb)',
    'public.dismiss_merge_candidate(uuid, uuid)',
    'public.list_family_expenses(uuid)'
  ]
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

revoke all on function public._family_accept(uuid) from public, anon, authenticated;
revoke all on function public._family_norm(text) from public, anon;
revoke all on function public.children_guard_family_update() from public, anon;


-- =====================================================================
-- 8. CONTRÔLE CI (résultat attendu : aucune ligne)
-- =====================================================================
-- -- Fonctions 0340 exécutables par anon :
-- select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')
--    and p.proname ~ '(family|guardian|merge)';
-- -- Fonctions SECURITY DEFINER 0340 sans search_path :
-- select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public' and p.prosecdef and p.proname ~ '(family|guardian|merge)'
--    and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%');
-- -- Aucune politique « famille » sur les tables privées :
-- select tablename, policyname from pg_policies
--  where schemaname = 'public'
--    and tablename in ('journal_entries', 'ai_analyses', 'testimonies', 'testimony_requests')
--    and policyname ~ 'family';


-- =====================================================================
-- 9. TESTS RLS (à exécuter dans une transaction, en rôle postgres, sur une
--    base de recette ; tout est annulé par le ROLLBACK final)
-- =====================================================================
-- begin;
-- -- Identités : A = Julie (titulaire), B = Thomas (autre parent), C = tiers.
-- insert into auth.users (id, email, email_confirmed_at) values
--   ('00000000-0000-0000-0000-00000000000a', 'julie@test.fr',  now()),
--   ('00000000-0000-0000-0000-00000000000b', 'thomas@test.fr', now()),
--   ('00000000-0000-0000-0000-00000000000c', 'tiers@test.fr',  now());
-- insert into public.users (id, email, prenom) values
--   ('00000000-0000-0000-0000-00000000000a', 'julie@test.fr',  'Julie'),
--   ('00000000-0000-0000-0000-00000000000b', 'thomas@test.fr', 'Thomas'),
--   ('00000000-0000-0000-0000-00000000000c', 'tiers@test.fr',  'Tiers')
--   on conflict (id) do nothing;   -- (si un trigger crée déjà public.users)
-- insert into public.children (id, user_id, prenom, date_naissance) values
--   ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000a', 'Lina', '2019-05-12');
-- insert into public.journal_entries (user_id, type, titre, occurred_at, children_ids) values
--   ('00000000-0000-0000-0000-00000000000a', 'visite', 'PRIVÉ : retard de 2 h', now(),
--    array['00000000-0000-0000-0000-0000000000c1']::uuid[]);
-- insert into public.calendar_events (user_id, type, titre, start_at, children_ids) values
--   ('00000000-0000-0000-0000-00000000000a', 'ecole', 'Réunion école', now() + interval '2 days',
--    array['00000000-0000-0000-0000-0000000000c1']::uuid[]);          -- family_shared = true (défaut)
-- insert into public.calendar_events (user_id, type, titre, start_at, children_ids, family_shared) values
--   ('00000000-0000-0000-0000-00000000000a', 'rendez_vous', 'PRIVÉ : avocat', now() + interval '3 days',
--    array['00000000-0000-0000-0000-0000000000c1']::uuid[], false);
--
-- -- 1) A invite B (rôle parent) pour Lina.
-- set local role authenticated;
-- select set_config('request.jwt.claims',
--   '{"sub":"00000000-0000-0000-0000-00000000000a","email":"julie@test.fr","aal":"aal1","role":"authenticated"}', true);
-- create temp table t_inv as
--   select * from public.create_family_invitation('thomas@test.fr', 'parent',
--     array['00000000-0000-0000-0000-0000000000c1']::uuid[]);
--
-- -- 2) Avant acceptation, B ne voit rien.
-- select set_config('request.jwt.claims',
--   '{"sub":"00000000-0000-0000-0000-00000000000b","email":"thomas@test.fr","aal":"aal1","role":"authenticated"}', true);
-- select count(*) from public.children;                   -- attendu : 0
-- select count(*) from public.list_received_family_invitations();  -- attendu : 1 (demande reçue)
--
-- -- 3) C, avec le lien, ne peut pas accepter (e-mail différent) → P0002.
-- select set_config('request.jwt.claims',
--   '{"sub":"00000000-0000-0000-0000-00000000000c","email":"tiers@test.fr","aal":"aal1","role":"authenticated"}', true);
-- select public.accept_family_invitation((select token from t_inv));   -- ERREUR attendue : Invitation invalide ou expirée
--   -- (relancer la suite après un « rollback to savepoint » si vous testez pas à pas)
--
-- -- 4) B accepte.
-- select set_config('request.jwt.claims',
--   '{"sub":"00000000-0000-0000-0000-00000000000b","email":"thomas@test.fr","aal":"aal1","role":"authenticated"}', true);
-- select public.accept_family_invitation((select token from t_inv));   -- {"role":"parent","child_ids":[...]}
--
-- -- 5) B voit la fiche partagée et l'événement partagé…
-- select prenom from public.children;                      -- attendu : Lina
-- select titre from public.calendar_events;                -- attendu : Réunion école (pas « PRIVÉ : avocat »)
-- -- … mais jamais le Journal de A.
-- select count(*) from public.journal_entries;             -- attendu : 0
-- -- Et B ne peut ni supprimer la fiche ni changer son titulaire.
-- update public.children set deleted_at = now();           -- ERREUR attendue 42501 (trigger)
-- delete from public.children;                             -- attendu : DELETE 0 (aucune politique)
--
-- -- 6) Documents / dépenses : invisibles tant qu'ils ne sont pas partagés.
-- select count(*) from public.documents;                   -- attendu : 0
-- select count(*) from public.journal_expenses;            -- attendu : 0
--
-- -- 7) C (non lié) ne voit rien.
-- select set_config('request.jwt.claims',
--   '{"sub":"00000000-0000-0000-0000-00000000000c","email":"tiers@test.fr","aal":"aal1","role":"authenticated"}', true);
-- select count(*) from public.children;                    -- attendu : 0
-- select count(*) from public.calendar_events;             -- attendu : 0
--
-- -- 8) A retire B : l'accès disparaît immédiatement.
-- select set_config('request.jwt.claims',
--   '{"sub":"00000000-0000-0000-0000-00000000000a","email":"julie@test.fr","aal":"aal1","role":"authenticated"}', true);
-- select public.revoke_child_guardian((select id from public.child_guardians limit 1));
-- select set_config('request.jwt.claims',
--   '{"sub":"00000000-0000-0000-0000-00000000000b","email":"thomas@test.fr","aal":"aal1","role":"authenticated"}', true);
-- select count(*) from public.children;                    -- attendu : 0
-- select count(*) from public.calendar_events;             -- attendu : 0
-- reset role;
-- rollback;
--
-- MFA : si B a un facteur vérifié et un JWT aal1, mfa_required (0270) masque
-- toutes les lignes et chaque RPC 0340 lève 42501 (hint mfa_required).


-- =====================================================================
-- ROLLBACK (manuel, dans l'ordre)
-- =====================================================================
-- drop policy if exists "documents family select" on storage.objects;
-- drop policy if exists journal_expenses_select_family on public.journal_expenses;
-- drop policy if exists documents_select_family on public.documents;
-- drop policy if exists calendar_select_family on public.calendar_events;
-- drop policy if exists child_treatments_update_family on public.child_treatments;
-- drop policy if exists child_treatments_insert_family on public.child_treatments;
-- drop policy if exists child_treatments_select_family on public.child_treatments;
-- drop policy if exists child_vaccinations_update_family on public.child_vaccinations;
-- drop policy if exists child_vaccinations_insert_family on public.child_vaccinations;
-- drop policy if exists child_vaccinations_select_family on public.child_vaccinations;
-- drop trigger if exists trg_children_guard_family_update on public.children;
-- drop function if exists public.children_guard_family_update();
-- drop policy if exists children_update_family on public.children;
-- drop policy if exists children_select_family on public.children;
-- drop function if exists public.list_family_expenses(uuid);
-- drop function if exists public.dismiss_merge_candidate(uuid, uuid);
-- drop function if exists public.merge_child_into(uuid, uuid, jsonb, jsonb);
-- drop function if exists public.list_merge_candidates();
-- -- list_linked_parents : ré-appliquer la définition de 0330_messagerie_plus.sql
-- drop function if exists public.list_family_contacts();
-- drop function if exists public.list_family_children();
-- drop function if exists public.list_family_members();
-- drop function if exists public.set_child_guardian_role(uuid, text);
-- drop function if exists public.revoke_child_guardian(uuid);
-- drop function if exists public.decline_family_invitation(uuid);
-- drop function if exists public.accept_family_invitation_by_id(uuid);
-- drop function if exists public.accept_family_invitation(text);
-- drop function if exists public._family_accept(uuid);
-- drop function if exists public.get_family_invitation(text);
-- drop function if exists public.list_received_family_invitations();
-- drop function if exists public.list_sent_family_invitations();
-- drop function if exists public.cancel_family_invitation(uuid);
-- drop function if exists public.resend_family_invitation(uuid);
-- drop function if exists public.create_family_invitation(text, text, uuid[]);
-- drop table if exists public.child_merge_dismissals, public.child_merges, public.child_guardians,
--   public.family_invitation_children, public.family_invitations;
-- drop function if exists public.family_expense_visible(uuid, uuid);
-- drop function if exists public.family_row_visible(uuid, uuid[], boolean);
-- drop function if exists public.my_family_member_ids(boolean);
-- drop function if exists public.my_family_child_ids(boolean);
-- drop function if exists public._family_norm(text);
-- drop function if exists public.family_role(uuid, uuid);
-- drop function if exists public._family_verified_email();
-- drop function if exists public._family_assert_caller();
-- drop function if exists public.child_guardians_check_not_owner();
-- drop index if exists public.idx_child_treatments_child_only, public.idx_child_vaccinations_child_only,
--   public.idx_journal_expenses_family_justif, public.idx_journal_expenses_family_shared;
-- -- Colonnes : à retirer seulement après retrait du code qui les utilise.
-- revoke update (family_shared) on table public.documents from authenticated;
-- alter table public.journal_expenses drop column if exists family_shared;
-- alter table public.documents drop column if exists family_shared;
-- alter table public.calendar_events drop column if exists family_shared;
-- =====================================================================
