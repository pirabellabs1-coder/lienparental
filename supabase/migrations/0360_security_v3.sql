-- =====================================================================
-- Lien Parental — 0360_security_v3.sql  (correctifs de l'audit de la vague v3)
--
-- Points traités (numérotation de l'audit) :
--   M1  calendrier : un « proche » ne voit jamais un événement `sante` ;
--       `family_shared` forcé à false à la création pour `sante` et
--       `rendez_vous` (trigger BEFORE INSERT, partage ensuite explicite) ;
--   M2  invitations : seul le TITULAIRE invite au rôle `parent` (un gardien
--       `parent` reçoit 42501 / hint owner_only) ; même règle pour la
--       promotion d'un proche en parent (set_child_guardian_role) et à
--       l'acceptation (_family_accept) ;
--   M3  messagerie : `conversation_participants.left_at` posé quand un adulte
--       n'a plus aucun lien (enfant partagé en tant que titulaire/parent, ou
--       coparent_link accepté) avec les autres participants ; écriture et
--       lecture des NOUVEAUX messages réservées aux participants actifs,
--       historique antérieur consultable ; import coffre ignoré pour eux ;
--   M5  messages.attachment_path : CHECK stricte (NOT VALID) ;
--   M6  users.photo_url : CHECK préfixe `<id>/` (NOT VALID) ;
--   M7  is_admin_aal2() : clauses admin des politiques 0290/0300/0310/0330/0340
--       et admin_stats_assert() exigent une session aal2 ;
--   m2  merge_child_into : remplacée par merge_child_into_as (service_role
--       uniquement, appelée par la route serveur après contrôle) ; ne modifie
--       que les lignes de l'acteur ; infos médicales de la fiche conservée
--       seulement si l'acteur en est le titulaire (garde 0340 respecté) ;
--   m3  vault_reserve_attempt() : réservation atomique d'un essai de code ;
--   m4  vault_unlocked() fermé par défaut (phase 2 toujours commentée) ;
--   m7  vault_webauthn_challenges : défi WebAuthn serveur à usage unique ;
--   Nits : justificatifs_extra (0350) dans la politique Storage famille et
--       list_family_expenses ; search_path = '' sur toutes les fonctions
--       SECURITY DEFINER recréées ici ; quota d'import automatique vers le
--       coffre (100 Mo par destinataire, par expéditeur et par 24 h).
--
-- Principes : aucune migration antérieure modifiée ; ré-exécutable
-- (if not exists, drop ... if exists, create or replace, contraintes
-- ajoutées dans des blocs tolérant duplicate_object) ; SECURITY DEFINER à
-- search_path vide (noms entièrement qualifiés) ; revoke public / anon.
--
-- Tests : scénarios exécutés sur PostgreSQL (PGlite + stubs Supabase), voir
-- docs/SECURITY_FIXES.md § v3. Contrôles CI : section 13.
-- Rollback : bloc commenté en fin de fichier.
-- =====================================================================


-- =====================================================================
-- 1. M7 — ADMINISTRATEUR EN SESSION aal2
-- =====================================================================
-- is_admin() (0102) reste inchangée (utilisée par du code existant) ; les
-- clauses d'accès admin des politiques passent à is_admin_aal2(). Un admin
-- sans facteur TOTP vérifié (aal1) n'a donc plus aucun privilège en base :
-- le serveur le renvoie vers l'enrôlement 2FA (lib/auth/session.ts).
create or replace function public.is_admin_aal2()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     and coalesce(public.is_admin(), false);
$$;

revoke all on function public.is_admin_aal2() from public;
grant execute on function public.is_admin_aal2() to anon, authenticated, service_role;

comment on function public.is_admin_aal2() is
  'is_admin() ET JWT aal2 (0360, M7). Clause admin des politiques RLS et de admin_stats_assert().';

-- --- admin_stats_assert (0310) ------------------------------------------
create or replace function public.admin_stats_assert()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.is_admin_aal2(), false) then
    raise exception 'admin only' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.admin_stats_assert() from public, anon, authenticated;

-- --- 0290 : verrou du coffre ---------------------------------------------
drop policy if exists vault_lock_settings_select on public.vault_lock_settings;
create policy vault_lock_settings_select on public.vault_lock_settings
  for select to authenticated
  using (auth.uid() = user_id or (select public.is_admin_aal2()));

drop policy if exists vault_passkeys_select on public.vault_passkeys;
create policy vault_passkeys_select on public.vault_passkeys
  for select to authenticated
  using (auth.uid() = user_id or (select public.is_admin_aal2()));

drop policy if exists vault_lock_attempts_select on public.vault_lock_attempts;
create policy vault_lock_attempts_select on public.vault_lock_attempts
  for select to authenticated
  using (auth.uid() = user_id or (select public.is_admin_aal2()));

-- --- 0300 : contenus administrables --------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['guide_fiches', 'guide_parcours', 'guide_partners', 'document_templates', 'blog_posts']
  loop
    if to_regclass(format('public.%I', t)) is null then
      continue;
    end if;
    execute format('drop policy if exists %s_insert_admin on public.%I', t, t);
    execute format('create policy %s_insert_admin on public.%I for insert to authenticated with check ((select public.is_admin_aal2()))', t, t);
    execute format('drop policy if exists %s_update_admin on public.%I', t, t);
    execute format('create policy %s_update_admin on public.%I for update to authenticated using ((select public.is_admin_aal2())) with check ((select public.is_admin_aal2()))', t, t);
    execute format('drop policy if exists %s_delete_admin on public.%I', t, t);
    execute format('create policy %s_delete_admin on public.%I for delete to authenticated using ((select public.is_admin_aal2()))', t, t);
  end loop;
end $$;

drop policy if exists guide_fiches_select_public on public.guide_fiches;
create policy guide_fiches_select_public on public.guide_fiches
  for select to anon, authenticated using (statut = 'publie' or (select public.is_admin_aal2()));

drop policy if exists guide_parcours_select_public on public.guide_parcours;
create policy guide_parcours_select_public on public.guide_parcours
  for select to anon, authenticated using (statut = 'publie' or (select public.is_admin_aal2()));

drop policy if exists document_templates_select_public on public.document_templates;
create policy document_templates_select_public on public.document_templates
  for select to anon, authenticated using (statut = 'publie' or (select public.is_admin_aal2()));

drop policy if exists blog_posts_select_public on public.blog_posts;
create policy blog_posts_select_public on public.blog_posts
  for select to anon, authenticated using (
    (statut = 'publie' and published_at <= now()) or (select public.is_admin_aal2())
  );

drop policy if exists guide_territoires_select_public on public.guide_territoires;
create policy guide_territoires_select_public on public.guide_territoires
  for select to anon, authenticated using (disponible or (select public.is_admin_aal2()));

drop policy if exists guide_territoires_insert_admin on public.guide_territoires;
create policy guide_territoires_insert_admin on public.guide_territoires
  for insert to authenticated with check ((select public.is_admin_aal2()));

drop policy if exists guide_territoires_update_admin on public.guide_territoires;
create policy guide_territoires_update_admin on public.guide_territoires
  for update to authenticated
  using ((select public.is_admin_aal2()))
  with check ((select public.is_admin_aal2()));

drop policy if exists guide_territoires_delete_admin on public.guide_territoires;
create policy guide_territoires_delete_admin on public.guide_territoires
  for delete to authenticated using ((select public.is_admin_aal2()));

drop policy if exists content_versions_select_admin on public.content_versions;
create policy content_versions_select_admin on public.content_versions
  for select to authenticated using ((select public.is_admin_aal2()));

drop policy if exists blog_images_select_admin on storage.objects;
create policy blog_images_select_admin on storage.objects
  for select to authenticated
  using (bucket_id = 'blog-images' and (select public.is_admin_aal2()));

drop policy if exists blog_images_insert_admin on storage.objects;
create policy blog_images_insert_admin on storage.objects
  for insert to authenticated
  with check (bucket_id = 'blog-images' and (select public.is_admin_aal2()));

drop policy if exists blog_images_update_admin on storage.objects;
create policy blog_images_update_admin on storage.objects
  for update to authenticated
  using (bucket_id = 'blog-images' and (select public.is_admin_aal2()))
  with check (bucket_id = 'blog-images' and (select public.is_admin_aal2()));

drop policy if exists blog_images_delete_admin on storage.objects;
create policy blog_images_delete_admin on storage.objects
  for delete to authenticated
  using (bucket_id = 'blog-images' and (select public.is_admin_aal2()));

-- --- 0310 : dons -----------------------------------------------------------
drop policy if exists donations_admin_select on public.donations;
create policy donations_admin_select on public.donations
  for select to authenticated using ((select public.is_admin_aal2()));

-- --- 0330 : imports vers le coffre ----------------------------------------
drop policy if exists vault_imports_select_self on public.vault_imports;
create policy vault_imports_select_self on public.vault_imports
  for select to authenticated
  using (user_id = auth.uid() or (select public.is_admin_aal2()));

-- --- 0340 : famille ------------------------------------------------------------
drop policy if exists family_invitations_select on public.family_invitations;
create policy family_invitations_select on public.family_invitations
  for select to authenticated
  using (inviter_id = auth.uid() or (select public.is_admin_aal2()));

drop policy if exists family_invitation_children_select on public.family_invitation_children;
create policy family_invitation_children_select on public.family_invitation_children
  for select to authenticated
  using (
    exists (select 1 from public.family_invitations i
             where i.id = invitation_id and i.inviter_id = auth.uid())
    or (select public.is_admin_aal2())
  );

drop policy if exists child_guardians_select on public.child_guardians;
create policy child_guardians_select on public.child_guardians
  for select to authenticated
  using (
    user_id = auth.uid()
    or child_id = any ((select public.my_family_child_ids(false))::uuid[])
    or (select public.is_admin_aal2())
  );

drop policy if exists child_merges_select on public.child_merges;
create policy child_merges_select on public.child_merges
  for select to authenticated
  using (
    merged_by = auth.uid()
    or kept_child_id = any ((select public.my_family_child_ids(true))::uuid[])
    or (select public.is_admin_aal2())
  );


-- =====================================================================
-- 2. M1 — CALENDRIER : santé jamais visible des proches
-- =====================================================================
-- Création : `sante` et `rendez_vous` sont privés par défaut. Le trigger ne
-- distingue pas un `true` explicite du défaut de colonne : le partage d'un
-- tel événement se fait APRÈS création (UPDATE, /app/coparents/partage).
create or replace function public.calendar_events_private_by_default()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.type::text in ('sante', 'rendez_vous') then
    new.family_shared := false;
  end if;
  return new;
end;
$$;
revoke all on function public.calendar_events_private_by_default() from public, anon, authenticated;

drop trigger if exists trg_calendar_events_private_by_default on public.calendar_events;
create trigger trg_calendar_events_private_by_default
  before insert on public.calendar_events
  for each row execute function public.calendar_events_private_by_default();

-- Lecture famille : un événement `sante` exige le rôle titulaire/parent
-- (p_parent_only = true) sur un enfant commun ; les autres types restent
-- lisibles des proches. Ligne entière masquée (titre, description, lieu).
drop policy if exists calendar_select_family on public.calendar_events;
create policy calendar_select_family on public.calendar_events
  for select to authenticated
  using (
    family_shared
    and deleted_at is null
    and user_id = any ((select public.my_family_member_ids(false))::uuid[])
    and children_ids && (select public.my_family_child_ids(false))
    and public.family_row_visible(user_id, children_ids, type::text = 'sante')
  );


-- =====================================================================
-- 3. M2 — INVITATIONS : rôle `parent` réservé au titulaire
-- =====================================================================
-- Choix (le plus simple, documenté dans docs/FAMILLE.md §3) : un gardien
-- `parent` qui tente d'inviter au rôle `parent` est REFUSÉ (42501, hint
-- owner_only). Il peut toujours inviter des proches ; le titulaire est
-- notifié par e-mail de chaque nouvel adulte lié (route d'acceptation).
create or replace function public.create_family_invitation(
  p_email      text,
  p_role       text,
  p_child_ids  uuid[]
)
returns table (invitation_id uuid, token text, expires_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me     uuid := public._family_assert_caller();
  v_email  text := lower(trim(coalesce(p_email, '')));
  v_child  uuid;
  v_role   text;
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
    v_role := coalesce(public.family_role(v_child, v_me), '');
    if v_role not in ('owner', 'parent') then
      raise exception 'Accès refusé' using errcode = '42501', hint = 'not_allowed';
    end if;
    -- M2 : seul le titulaire peut faire entrer un autre « parent ».
    if p_role = 'parent' and v_role <> 'owner' then
      raise exception 'Seul le parent titulaire de la fiche peut inviter un parent'
        using errcode = '42501', hint = 'owner_only';
    end if;
  end loop;

  perform pg_advisory_xact_lock(hashtextextended('family_invite:' || v_me::text, 0));
  select count(*)::int into v_count
    from public.family_invitations i
   where i.inviter_id = v_me and i.created_at > now() - interval '1 day';
  if v_count >= 20 then
    raise exception 'Trop d''invitations' using errcode = '54000', hint = 'too_many';
  end if;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  insert into public.family_invitations (inviter_id, invitee_email, role, token_hash, expires_at)
  values (v_me, v_email, p_role, sha256(convert_to(v_token, 'UTF8')), v_exp)
  returning id into v_id;

  insert into public.family_invitation_children (invitation_id, child_id)
  select v_id, x from (select distinct unnest(p_child_ids) as x) t;

  return query select v_id, v_token, v_exp;
end;
$$;

-- --- set_child_guardian_role : promotion en `parent` = titulaire seul ----
create or replace function public.set_child_guardian_role(p_guardian_id uuid, p_role text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
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
  if p_role = 'parent' and v_g.role <> 'parent' and v_owner is distinct from v_me then
    raise exception 'Seul le parent titulaire de la fiche peut nommer un parent'
      using errcode = '42501', hint = 'owner_only';
  end if;
  update public.child_guardians set role = p_role where id = v_g.id;
end;
$$;


-- =====================================================================
-- 4. M3 — MESSAGERIE : participants partis
-- =====================================================================
alter table public.conversation_participants add column if not exists left_at timestamptz;

comment on column public.conversation_participants.left_at is
  'Fin du lien (0360, M3) : plus aucun enfant partagé ni coparent_link accepté avec les autres participants. '
  'Messages antérieurs consultables (preuve), plus d''envoi ni de lecture des nouveaux.';

create index if not exists idx_conversation_participants_active
  on public.conversation_participants(user_id, conversation_id) where left_at is null;
-- Politique Storage « pièce jointe d'un message lisible » (section 4.3).
create index if not exists idx_messages_attachment_path
  on public.messages(attachment_path) where attachment_path is not null;

-- --- 4.1 Lien de messagerie entre deux adultes ----------------------------
-- Même règle que list_linked_parents() (0340) : titulaire ou parent ACTIF
-- d'un même enfant non supprimé, ou coparent_link accepté.
create or replace function public.messaging_linked(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with ka as (
    select c.id
      from public.children c
     where c.user_id = p_a and c.deleted_at is null
    union
    select g.child_id
      from public.child_guardians g
      join public.children c on c.id = g.child_id and c.deleted_at is null
     where g.user_id = p_a and g.status = 'active' and g.role = 'parent'
  )
  select p_a is not null and p_b is not null and p_a <> p_b
     and (
       exists (
         select 1 from public.coparent_links l
          where l.status = 'accepted' and l.coparent_user_id is not null
            and ((l.user_id = p_a and l.coparent_user_id = p_b)
              or (l.user_id = p_b and l.coparent_user_id = p_a))
       )
       or exists (select 1 from ka join public.children c on c.id = ka.id where c.user_id = p_b)
       or exists (
         select 1 from ka join public.child_guardians g
             on g.child_id = ka.id and g.user_id = p_b and g.status = 'active' and g.role = 'parent'
       )
     );
$$;
revoke all on function public.messaging_linked(uuid, uuid) from public, anon, authenticated;
grant execute on function public.messaging_linked(uuid, uuid) to service_role;

-- Marque « parti » tout participant actif qui n'a plus de lien avec aucun
-- autre participant actif. Une seule instruction : l'évaluation porte sur
-- l'état AVANT mise à jour (pas d'effet domino dans la même passe).
create or replace function public._conversation_prune(p_conversation_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  update public.conversation_participants p
     set left_at = now()
   where p.conversation_id = p_conversation_id
     and p.left_at is null
     and not exists (
       select 1 from public.conversation_participants q
        where q.conversation_id = p_conversation_id
          and q.user_id <> p.user_id
          and q.left_at is null
          and public.messaging_linked(p.user_id, q.user_id)
     );
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

create or replace function public._conversations_prune_for_user(p_user_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_conv uuid;
  v_n    integer := 0;
begin
  if p_user_id is null then
    return 0;
  end if;
  for v_conv in
    select p.conversation_id from public.conversation_participants p
     where p.user_id = p_user_id and p.left_at is null
  loop
    v_n := v_n + public._conversation_prune(v_conv);
  end loop;
  return v_n;
end;
$$;
revoke all on function public._conversation_prune(uuid) from public, anon, authenticated;
revoke all on function public._conversations_prune_for_user(uuid) from public, anon, authenticated;
grant execute on function public._conversation_prune(uuid) to service_role;
grant execute on function public._conversations_prune_for_user(uuid) to service_role;

-- --- 4.2 Déclencheurs : révocation, rétrogradation, suppression, rupture ---
create or replace function public.child_guardians_after_change_prune()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'active' then
      perform public._conversations_prune_for_user(old.user_id);
    end if;
    return old;
  end if;
  if old.status = 'active'
     and (new.status <> 'active' or (old.role = 'parent' and new.role <> 'parent')) then
    perform public._conversations_prune_for_user(new.user_id);
  end if;
  return new;
end;
$$;
revoke all on function public.child_guardians_after_change_prune() from public, anon, authenticated;

drop trigger if exists trg_child_guardians_prune_conversations on public.child_guardians;
create trigger trg_child_guardians_prune_conversations
  after update of status, role or delete on public.child_guardians
  for each row execute function public.child_guardians_after_change_prune();

create or replace function public.children_after_delete_prune()
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
    perform public._conversations_prune_for_user(v_uid);
  end loop;
  return new;
end;
$$;
revoke all on function public.children_after_delete_prune() from public, anon, authenticated;

drop trigger if exists trg_children_prune_conversations on public.children;
create trigger trg_children_prune_conversations
  after update of deleted_at on public.children
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.children_after_delete_prune();

create or replace function public.coparent_links_after_change_prune()
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
    perform public._conversations_prune_for_user(old.user_id);
    perform public._conversations_prune_for_user(old.coparent_user_id);
  end if;
  return coalesce(new, old);
end;
$$;
revoke all on function public.coparent_links_after_change_prune() from public, anon, authenticated;

drop trigger if exists trg_coparent_links_prune_conversations on public.coparent_links;
create trigger trg_coparent_links_prune_conversations
  after update or delete on public.coparent_links
  for each row execute function public.coparent_links_after_change_prune();

-- --- 4.3 Prédicats et politiques ------------------------------------------
-- Participant ACTIF (même signature que 0230/0330 : mark_read, insertion de
-- messages et dépôt de pièces jointes en dépendent).
create or replace function public.is_conversation_participant(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversation_participants p
     where p.conversation_id = p_conversation_id
       and p.user_id = auth.uid()
       and p.left_at is null
  );
$$;
revoke all on function public.is_conversation_participant(uuid) from public, anon;
grant execute on function public.is_conversation_participant(uuid) to authenticated, service_role;

-- Membre, actif OU parti (accès à la conversation et à la liste des participants).
create or replace function public.is_conversation_member(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversation_participants p
     where p.conversation_id = p_conversation_id
       and p.user_id = auth.uid()
  );
$$;
revoke all on function public.is_conversation_member(uuid) from public, anon;
grant execute on function public.is_conversation_member(uuid) to authenticated, service_role;

-- Message lisible : participant actif, ou parti APRÈS l'envoi du message.
create or replace function public.conversation_message_visible(p_conversation_id uuid, p_created_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversation_participants p
     where p.conversation_id = p_conversation_id
       and p.user_id = auth.uid()
       and (p.left_at is null or p_created_at <= p.left_at)
  );
$$;
revoke all on function public.conversation_message_visible(uuid, timestamptz) from public, anon;
grant execute on function public.conversation_message_visible(uuid, timestamptz) to authenticated, service_role;

drop policy if exists conversations_select_participants on public.conversations;
create policy conversations_select_participants on public.conversations
  for select to authenticated
  using (public.is_conversation_member(id));

drop policy if exists conversation_participants_select on public.conversation_participants;
create policy conversation_participants_select on public.conversation_participants
  for select to authenticated
  using (public.is_conversation_member(conversation_id));

drop policy if exists messages_select_participants on public.messages;
create policy messages_select_participants on public.messages
  for select to authenticated
  using (public.conversation_message_visible(conversation_id, created_at));

-- Insertion : participant actif (is_conversation_participant) ; le format
-- exact du chemin est imposé par chk_messages_attachment_path (section 5).
drop policy if exists messages_insert_sender on public.messages;
create policy messages_insert_sender on public.messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_conversation_participant(conversation_id)
    and (attachment_path is null or split_part(attachment_path, '/', 1) = conversation_id::text)
  );

drop policy if exists message_attachments_select on storage.objects;
create policy message_attachments_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'message-attachments'
    and (
      (storage.foldername(name))[1] in (
        select p.conversation_id::text from public.conversation_participants p
         where p.user_id = auth.uid() and p.left_at is null
      )
      -- Parti : uniquement les pièces jointes des messages qu'il peut encore lire.
      or exists (select 1 from public.messages m where m.attachment_path = storage.objects.name)
    )
  );

drop policy if exists message_attachments_insert on storage.objects;
create policy message_attachments_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'message-attachments'
    and (storage.foldername(name))[1] in (
      select p.conversation_id::text from public.conversation_participants p
       where p.user_id = auth.uid() and p.left_at is null
    )
  );

-- --- 4.4 Fonctions de messagerie recréées (search_path vide) ---------------
create or replace function public.list_my_conversations(p_conversation_id uuid default null)
returns table (
  conversation_id  uuid,
  title            text,
  created_at       timestamptz,
  archived         boolean,
  participants     jsonb,
  last_message     jsonb,
  unread_count     integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id,
         c.title,
         c.created_at,
         me.archived_at is not null,
         coalesce((
           select jsonb_agg(jsonb_build_object('id', u.id, 'prenom', coalesce(u.prenom, ''), 'nom', coalesce(u.nom, ''))
                            order by p.joined_at, u.id)
             from public.conversation_participants p
             join public.users u on u.id = p.user_id
            where p.conversation_id = c.id and p.user_id <> me.user_id
         ), '[]'::jsonb),
         lm.msg,
         (
           select count(*)::int
             from public.messages m
            where m.conversation_id = c.id
              and m.sender_id <> me.user_id
              and (me.left_at is null or m.created_at <= me.left_at)
              and case when me.last_read_at is null then m.read_at is null
                       else m.created_at > me.last_read_at end
         )
    from public.conversation_participants me
    join public.conversations c on c.id = me.conversation_id
    left join lateral (
      select jsonb_build_object(
               'id', m.id, 'sender_id', m.sender_id, 'body', left(m.body, 160), 'kind', m.kind,
               'attachment_name', m.attachment_meta ->> 'name', 'created_at', m.created_at
             ) as msg,
             m.created_at as at
        from public.messages m
       where m.conversation_id = c.id
         and (me.left_at is null or m.created_at <= me.left_at)
       order by m.created_at desc
       limit 1
    ) lm on true
   where me.user_id = auth.uid()
     and (p_conversation_id is null or c.id = p_conversation_id)
     and (select public.mfa_satisfied())
   order by coalesce(lm.at, c.created_at) desc
   limit 200;
$$;
revoke all on function public.list_my_conversations(uuid) from public, anon;
grant execute on function public.list_my_conversations(uuid) to authenticated;

-- Une conversation dont un participant est parti n'est jamais réutilisée :
-- un nouveau lien ouvre une nouvelle conversation (l'ancienne reste une archive).
create or replace function public.create_conversation(p_participant_ids uuid[], p_title text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me     uuid := auth.uid();
  v_ids    uuid[];
  v_all    uuid[];
  v_title  text;
  v_conv   uuid;
begin
  if v_me is null or not public.mfa_satisfied() then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;

  select array_agg(distinct x) into v_ids
    from unnest(coalesce(p_participant_ids, '{}'::uuid[])) as x
   where x is not null and x <> v_me;

  if v_ids is null or cardinality(v_ids) not between 1 and 5 then
    raise exception 'Choisissez entre 1 et 5 interlocuteurs' using errcode = '22023';
  end if;

  if exists (
    select 1 from unnest(v_ids) as x
     where x not in (select l.user_id from public.list_linked_parents() l)
  ) then
    raise exception 'Interlocuteur non lié' using errcode = '42501';
  end if;

  v_title := nullif(btrim(regexp_replace(coalesce(p_title, ''), '\s+', ' ', 'g')), '');
  if v_title is not null and length(v_title) > 80 then
    raise exception 'Sujet trop long' using errcode = '22023';
  end if;

  if (select count(*) from public.conversations c
       where c.created_by = v_me and c.created_at > now() - interval '1 day') >= 30 then
    raise exception 'Trop de conversations créées aujourd''hui' using errcode = '54000';
  end if;

  select array_agg(x order by x) into v_all from unnest(v_ids || v_me) as x;

  select c.id into v_conv
    from public.conversations c
    join public.conversation_participants mine on mine.conversation_id = c.id and mine.user_id = v_me
   where lower(coalesce(c.title, '')) = lower(coalesce(v_title, ''))
     and (select array_agg(p.user_id order by p.user_id)
            from public.conversation_participants p
           where p.conversation_id = c.id) = v_all
     and not exists (select 1 from public.conversation_participants p
                      where p.conversation_id = c.id and p.left_at is not null)
   order by c.created_at
   limit 1;

  if v_conv is not null then
    update public.conversation_participants
       set archived_at = null
     where conversation_id = v_conv and user_id = v_me;
    return v_conv;
  end if;

  insert into public.conversations (parent_a, parent_b, title, created_by)
  values (v_me, v_ids[1], v_title, v_me)
  returning id into v_conv;

  insert into public.conversation_participants (conversation_id, user_id)
  select v_conv, x from unnest(v_ids) as x
  on conflict do nothing;

  return v_conv;
end;
$$;
revoke all on function public.create_conversation(uuid[], text) from public, anon;
grant execute on function public.create_conversation(uuid[], text) to authenticated;

-- Conversation V1 (0230) : uniquement une conversation où je suis encore actif.
-- 0230 n'avait révoqué que `public` : `anon` gardait le droit d'exécution
-- par les privilèges par défaut de Supabase.
create or replace function public.get_my_conversation()
returns table (
  conversation_id  uuid,
  other_id         uuid,
  other_prenom     text,
  other_nom        text,
  created_at       timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id,
         u.id,
         coalesce(u.prenom, ''),
         coalesce(u.nom, ''),
         c.created_at
    from public.conversations c
    join public.conversation_participants me
      on me.conversation_id = c.id and me.user_id = auth.uid() and me.left_at is null
    join public.users u
      on u.id = case when c.parent_a = auth.uid() then c.parent_b else c.parent_a end
   where auth.uid() in (c.parent_a, c.parent_b)
   order by c.created_at asc
   limit 1;
$$;
revoke all on function public.get_my_conversation() from public, anon;
grant execute on function public.get_my_conversation() to authenticated;

-- Import coffre : participants ACTIFS uniquement.
create or replace function public.messages_enqueue_vault_imports()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.attachment_path is null then
    return new;
  end if;
  insert into public.vault_imports (user_id, source, source_ref, message_id, conversation_id, sender_id)
  select p.user_id, 'messagerie', new.id::text, new.id, new.conversation_id, new.sender_id
    from public.conversation_participants p
   where p.conversation_id = new.conversation_id
     and p.left_at is null
  on conflict (user_id, source, source_ref) do nothing;
  return new;
end;
$$;
revoke all on function public.messages_enqueue_vault_imports() from public, anon, authenticated;

-- Rappel M3 : mark_read() (0330) s'appuie sur is_conversation_participant()
-- et refuse donc désormais un participant parti (rien de nouveau à lire).

-- --- 4.5 _family_accept : M2 (titulaire) + M3 (conversation active) -----
create or replace function public._family_accept(p_invitation_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me        uuid := public._family_assert_caller();
  v_email     text := public._family_verified_email();
  v_inv       public.family_invitations%rowtype;
  v_child     uuid;
  v_role      text;
  v_inviter   text;
  v_granted   uuid[] := '{}';
  v_conv      uuid;
begin
  if v_email is null then
    raise exception 'Invitation invalide ou expirée' using errcode = 'P0002';
  end if;

  select * into v_inv from public.family_invitations i
   where i.id = p_invitation_id
   for update;

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
    v_inviter := coalesce(public.family_role(v_child, v_inv.inviter_id), '');
    -- Droit de partage de l'invitant ; rôle `parent` : titulaire uniquement (M2).
    if v_inviter not in ('owner', 'parent')
       or (v_inv.role = 'parent' and v_inviter <> 'owner') then
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

  -- Messagerie : conversation entre les deux adultes s'ils sont désormais
  -- liés ; jamais une conversation dont un participant est parti (M3).
  if v_inv.role = 'parent' and public.messaging_linked(v_inv.inviter_id, v_me) then
    select c.id into v_conv from public.conversations c
     where least(c.parent_a, c.parent_b) = least(v_inv.inviter_id, v_me)
       and greatest(c.parent_a, c.parent_b) = greatest(v_inv.inviter_id, v_me)
       and not exists (select 1 from public.conversation_participants p
                        where p.conversation_id = c.id and p.left_at is not null)
     order by c.created_at
     limit 1;
    if v_conv is null then
      insert into public.conversations (parent_a, parent_b)
      values (v_inv.inviter_id, v_me)
      returning id into v_conv;
    end if;
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
revoke all on function public._family_accept(uuid) from public, anon, authenticated;

-- Invitations `parent` en attente émises par un non-titulaire pour des
-- enfants dont il n'est titulaire d'AUCUN : elles ne donneraient plus rien.
update public.family_invitations i
   set status = 'cancelled', responded_at = now()
 where i.status = 'pending'
   and i.role = 'parent'
   and not exists (
     select 1 from public.family_invitation_children ic
       join public.children c on c.id = ic.child_id and c.deleted_at is null
      where ic.invitation_id = i.id and c.user_id = i.inviter_id
   );

-- Reprise M3 : participants qui ont DÉJÀ perdu tout lien (révocations
-- antérieures à 0360). Idempotent : un participant parti le reste.
do $$
declare
  v_conv uuid;
begin
  for v_conv in select c.id from public.conversations c loop
    perform public._conversation_prune(v_conv);
  end loop;
end $$;


-- =====================================================================
-- 5. M5 / M6 — CHEMINS DE FICHIERS
-- =====================================================================
-- NOT VALID : contrôle immédiat des nouvelles lignes, sans parcourir
-- l'historique (messages immuables, valeur probante). Vérifier puis valider :
--   select id, attachment_path from public.messages
--    where attachment_path is not null
--      and attachment_path !~ ('^' || conversation_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{1,5}$');
--   -- (aucune ligne) alter table public.messages validate constraint chk_messages_attachment_path;
do $$
begin
  alter table public.messages
    add constraint chk_messages_attachment_path check (
      attachment_path is null
      or attachment_path ~ ('^' || conversation_id::text
                            || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{1,5}$')
    ) not valid;
exception when duplicate_object then null;
end $$;

-- Avatar : objet du bucket privé `avatars` dans le dossier de l'utilisateur.
--   select id from public.users where photo_url is not null
--      and not (starts_with(photo_url, id::text || '/') and position('..' in photo_url) = 0);
--   -- (aucune ligne) alter table public.users validate constraint chk_users_photo_url_owner;
do $$
begin
  alter table public.users
    add constraint chk_users_photo_url_owner check (
      photo_url is null
      or (starts_with(photo_url, id::text || '/') and position('..' in photo_url) = 0)
    ) not valid;
exception when duplicate_object then null;
end $$;


-- =====================================================================
-- 6. NIT — QUOTA DES IMPORTS AUTOMATIQUES VERS LE COFFRE
-- =====================================================================
alter table public.vault_imports add column if not exists size_bytes bigint;
do $$
begin
  alter table public.vault_imports add constraint chk_vault_imports_size check (size_bytes is null or size_bytes >= 0);
exception when duplicate_object then null;
end $$;

create index if not exists idx_vault_imports_quota
  on public.vault_imports(user_id, sender_id, processed_at)
  where status = 'done' and sender_id is not null;

-- Identique à 0330, plus : search_path vide ; quota de 100 Mo par
-- (destinataire, expéditeur) sur 24 h glissantes (54000, hint
-- vault_import_quota) ; taille mémorisée dans vault_imports.size_bytes.
create or replace function public.vault_add_from_source(
  p_user_id        uuid,
  p_source         text,
  p_source_ref     text,
  p_storage_path   text,
  p_name           text,
  p_mime           text,
  p_size           bigint,
  p_category_name  text default 'Courriers',
  p_doc_date       date default null,
  p_description    text default null,
  p_checksum       text default null,
  p_meta           jsonb default '{}'::jsonb,
  p_message_id     uuid default null,
  p_conversation_id uuid default null,
  p_sender_id      uuid default null
)
returns table (document_id uuid, storage_path text, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  c_quota     constant bigint := 100 * 1024 * 1024;
  v_imp       public.vault_imports%rowtype;
  v_cat_name  text := left(coalesce(nullif(btrim(p_category_name), ''), 'Courriers'), 40);
  v_cat       uuid;
  v_doc       uuid;
  v_path      text;
  v_label     text;
  v_used      bigint;
begin
  if p_user_id is null or p_source not in ('messagerie', 'temoignage', 'journal', 'autre')
     or coalesce(length(p_source_ref), 0) not between 1 and 200
     or p_storage_path is null
     or not starts_with(p_storage_path, p_user_id::text || '/')
     or position('..' in p_storage_path) > 0
     or coalesce(length(btrim(p_name)), 0) = 0
     or p_size is null or p_size < 0
     or (p_checksum is not null and p_checksum !~ '^[0-9a-f]{64}$') then
    raise exception 'Paramètres invalides' using errcode = '22023';
  end if;

  insert into public.vault_imports (user_id, source, source_ref, message_id, conversation_id, sender_id, category_name, meta)
  values (p_user_id, p_source, p_source_ref, p_message_id, p_conversation_id, p_sender_id, v_cat_name, coalesce(p_meta, '{}'::jsonb))
  on conflict (user_id, source, source_ref) do nothing;

  select * into v_imp
    from public.vault_imports i
   where i.user_id = p_user_id and i.source = p_source and i.source_ref = p_source_ref
   for update;

  -- 1. Déjà importé (une nouvelle tentative ne consomme pas de quota).
  if v_imp.document_id is not null then
    select d.id, d.storage_path into v_doc, v_path
      from public.documents d where d.id = v_imp.document_id;
    if v_doc is not null then
      update public.vault_imports set status = 'done', processed_at = coalesce(processed_at, now()) where id = v_imp.id;
      return query select v_doc, v_path, false;
      return;
    end if;
  end if;

  -- Quota (sérialisé par paire destinataire / expéditeur).
  if p_sender_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('vault_quota:' || p_user_id::text || ':' || p_sender_id::text, 0));
    select coalesce(sum(i.size_bytes), 0) into v_used
      from public.vault_imports i
     where i.user_id = p_user_id
       and i.sender_id = p_sender_id
       and i.status = 'done'
       and i.processed_at > now() - interval '1 day'
       and i.id <> v_imp.id;
    if v_used + p_size > c_quota then
      raise exception 'Quota d''import atteint' using errcode = '54000', hint = 'vault_import_quota';
    end if;
  end if;

  -- 2. Même contenu déjà présent dans le coffre de l'utilisateur.
  if p_checksum is not null then
    select d.id, d.storage_path into v_doc, v_path
      from public.documents d
     where d.user_id = p_user_id and d.checksum_sha256 = p_checksum and d.deleted_at is null
     order by d.created_at
     limit 1;
  end if;

  if v_doc is null then
    if not exists (select 1 from public.categories c where c.user_id = p_user_id) then
      insert into public.categories (user_id, name, icon, color, visible_filtres, position)
      values (p_user_id, 'Dossier JAF', 'calendar', 'violet', true, 0),
             (p_user_id, 'Scolarité',   'badge',    'blue',   true, 1),
             (p_user_id, 'Santé',       'health',   'green',  true, 2),
             (p_user_id, 'Finances',    'wallet',   'orange', true, 3),
             (p_user_id, 'Courriers',   'mail',     'orange', true, 4),
             (p_user_id, 'Autres',      'shapes',   'blue',   true, 5)
      on conflict (user_id, name) do nothing;
    end if;
    insert into public.categories (user_id, name, icon, color, visible_filtres, position)
    values (p_user_id, v_cat_name, 'mail', 'orange', true, 1000)
    on conflict (user_id, name) do nothing;
    select c.id into v_cat from public.categories c where c.user_id = p_user_id and c.name = v_cat_name;

    v_label := case p_source
                 when 'messagerie' then 'Messagerie'
                 when 'temoignage' then 'Témoignage'
                 when 'journal'    then 'Journal'
                 else 'Import' end;

    insert into public.documents (
      user_id, category_id, name, mime, size_bytes, confidentialite, storage_path,
      checksum_sha256, doc_date, source, description, tags
    ) values (
      p_user_id, v_cat, left(btrim(p_name), 120), left(p_mime, 120), p_size, 'confidentiel', p_storage_path,
      p_checksum, coalesce(p_doc_date, (now() at time zone 'UTC')::date), v_label,
      left(p_description, 280), array[p_source]
    )
    on conflict (storage_path) do update
      set updated_at = now()
    returning documents.id, documents.storage_path into v_doc, v_path;

    update public.vault_imports
       set document_id = v_doc, status = 'done', processed_at = now(), size_bytes = p_size,
           category_name = v_cat_name, meta = coalesce(p_meta, meta)
     where id = v_imp.id;
    return query select v_doc, v_path, true;
    return;
  end if;

  update public.vault_imports
     set document_id = v_doc, status = 'done', processed_at = now(), size_bytes = p_size, meta = coalesce(p_meta, meta)
   where id = v_imp.id;
  return query select v_doc, v_path, false;
end;
$$;

revoke all on function public.vault_add_from_source(uuid, text, text, text, text, text, bigint, text, date, text, text, jsonb, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.vault_add_from_source(uuid, text, text, text, text, text, bigint, text, date, text, text, jsonb, uuid, uuid, uuid)
  to service_role;


-- =====================================================================
-- 7. m2 — FUSION DE FICHES : route serveur + lignes de l'acteur seulement
-- =====================================================================
-- L'ancienne RPC (0340) était exécutable par `authenticated` et modifiait
-- aussi les lignes d'autres adultes : supprimée. La nouvelle n'est
-- accordée qu'au service_role ; POST /api/coparents/merge l'appelle après
-- requireAuthedUser() (session revalidée + aal2 si 2FA), avec l'id issu de
-- la session (p_actor_id), jamais du corps de la requête.
drop function if exists public.merge_child_into(uuid, uuid, jsonb, jsonb);

create or replace function public.merge_child_into_as(
  p_actor_id       uuid,
  p_drop_child_id  uuid,
  p_keep_child_id  uuid,
  p_health         jsonb default '[]'::jsonb,
  p_keep_medical   jsonb default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me        uuid := p_actor_id;
  v_drop      public.children%rowtype;
  v_keep      public.children%rowtype;
  v_item      jsonb;
  v_ids_v     uuid[] := '{}';
  v_ids_t     uuid[] := '{}';
  v_moved     integer := 0;
  v_refs      integer := 0;
  v_n         integer;
  v_revoked   integer := 0;
  v_medical   boolean := false;
  t           record;
begin
  if v_me is null or not exists (select 1 from public.users u where u.id = v_me and u.deleted_at is null) then
    raise exception 'Accès refusé' using errcode = '42501', hint = 'not_allowed';
  end if;
  if p_drop_child_id is null or p_keep_child_id is null or p_drop_child_id = p_keep_child_id then
    raise exception 'Fusion invalide' using errcode = '22023', hint = 'invalid_children';
  end if;
  if p_health is null or jsonb_typeof(p_health) <> 'array' or jsonb_array_length(p_health) > 500 then
    raise exception 'Fusion invalide' using errcode = '22023', hint = 'invalid_payload';
  end if;

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

  if exists (select 1 from public.child_vaccinations v
              where v.child_id = p_drop_child_id and v.user_id = v_me and not (v.id = any (v_ids_v)))
     or exists (select 1 from public.child_treatments tr
              where tr.child_id = p_drop_child_id and tr.user_id = v_me and not (tr.id = any (v_ids_t))) then
    raise exception 'Fusion incomplète' using errcode = '22023', hint = 'merge_incomplete';
  end if;

  -- Santé : uniquement MES entrées (user_id = acteur).
  for v_item in select * from jsonb_array_elements(p_health) loop
    if v_item ->> 'kind' = 'vaccination' then
      update public.child_vaccinations
         set child_id = p_keep_child_id, payload = v_item -> 'payload'
       where id = (v_item ->> 'id')::uuid and child_id = p_drop_child_id and user_id = v_me;
    else
      update public.child_treatments
         set child_id = p_keep_child_id, payload = v_item -> 'payload'
       where id = (v_item ->> 'id')::uuid and child_id = p_drop_child_id and user_id = v_me;
    end if;
    get diagnostics v_n = row_count;
    v_moved := v_moved + v_n;
  end loop;

  -- Références : uniquement MES lignes (Journal compris).
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
                    where table_schema = 'public' and table_name = t.tbl and column_name = t.col)
       and exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = t.tbl and column_name = 'user_id') then
      execute format(
        'update public.%1$I set %2$I = array(select distinct u from unnest(array_replace(%2$I, $1, $2)) as u) '
        'where $1 = any (%2$I) and user_id = $3', t.tbl, t.col)
      using p_drop_child_id, p_keep_child_id, v_me;
      get diagnostics v_n = row_count;
      v_refs := v_refs + v_n;
    end if;
  end loop;

  update public.preferences set active_child_id = p_keep_child_id
   where user_id = v_me and active_child_id = p_drop_child_id;

  -- Champs vides complétés (autorisés aux gardiens par le garde 0340).
  -- Infos médicales : SEULEMENT si l'acteur est titulaire de la fiche
  -- conservée (même règle que children_guard_family_update).
  v_medical := v_keep.user_id = v_me
               and v_keep.infos_medicales is null
               and p_keep_medical is not null
               and jsonb_typeof(p_keep_medical) = 'object'
               and p_keep_medical ? 'ciphertext' and p_keep_medical ? 'iv' and p_keep_medical ? 'tag'
               and pg_column_size(p_keep_medical) <= 8192;

  update public.children k
     set nom             = coalesce(k.nom, v_drop.nom),
         classe          = coalesce(k.classe, v_drop.classe),
         langue          = coalesce(k.langue, v_drop.langue),
         taille_cm       = coalesce(k.taille_cm, v_drop.taille_cm),
         poids_kg        = coalesce(k.poids_kg, v_drop.poids_kg),
         couleur_yeux    = coalesce(k.couleur_yeux, v_drop.couleur_yeux),
         couleur_cheveux = coalesce(k.couleur_cheveux, v_drop.couleur_cheveux),
         infos_medicales = case when v_medical then p_keep_medical else k.infos_medicales end
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
          jsonb_build_object('health_moved', v_moved, 'references_updated', v_refs,
                             'guardians_revoked', v_revoked, 'medical_copied', v_medical));

  return jsonb_build_object(
    'kept_child_id', p_keep_child_id,
    'merged_child_id', p_drop_child_id,
    'health_moved', v_moved,
    'references_updated', v_refs,
    'guardians_revoked', v_revoked,
    'medical_copied', v_medical
  );
end;
$$;

revoke all on function public.merge_child_into_as(uuid, uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.merge_child_into_as(uuid, uuid, uuid, jsonb, jsonb) to service_role;


-- =====================================================================
-- 8. NIT — justificatifs supplémentaires (0350) partagés
-- =====================================================================
create index if not exists idx_journal_expenses_family_extra
  on public.journal_expenses using gin (justificatifs_extra jsonb_path_ops)
  where family_shared;

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
                  where je.family_shared
                    and (
                      (je.justificatif is not null and (je.justificatif ->> 'path') = storage.objects.name)
                      or je.justificatifs_extra @> jsonb_build_array(jsonb_build_object('path', storage.objects.name))
                    ))
    )
  );

-- Type de retour modifié (nouvelle colonne) : drop puis create.
drop function if exists public.list_family_expenses(uuid);
create function public.list_family_expenses(p_child_id uuid default null)
returns table (
  entry_id uuid, owner_id uuid, owner_prenom text, is_mine boolean, occurred_at timestamptz,
  titre text, amount_cents integer, currency text, categorie text, payment_method text,
  beneficiaire text, justificatif_path text, children_ids uuid[], justificatifs_extra_paths text[]
)
language plpgsql
stable
security definer
set search_path = ''
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
           array(select x from unnest(e.children_ids) x where x = any (v_kids)),
           coalesce(array(
             select j ->> 'path'
               from jsonb_array_elements(case when jsonb_typeof(je.justificatifs_extra) = 'array'
                                              then je.justificatifs_extra else '[]'::jsonb end) j
              where j ->> 'path' is not null
           ), '{}'::text[])
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
revoke all on function public.list_family_expenses(uuid) from public, anon;
grant execute on function public.list_family_expenses(uuid) to authenticated, service_role;


-- =====================================================================
-- 9. m3 — RÉSERVATION ATOMIQUE D'UN ESSAI DE CODE
-- =====================================================================
-- Appelée AVANT la vérification scrypt : l'essai est compté d'avance
-- (échec présumé), sous verrou de ligne. N requêtes simultanées ne
-- peuvent donc pas obtenir plus de p_max essais avant blocage. Un succès
-- efface ensuite le compteur (clearAttempts côté serveur).
create or replace function public.vault_reserve_attempt(
  p_user_id  uuid,
  p_scope    text,
  p_max      integer default 5,
  p_base     integer default 30,
  p_cap      integer default 3600
)
returns table (allowed boolean, locked_until timestamptz, attempts_left integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_row   public.vault_lock_attempts;
  v_count integer;
begin
  if p_user_id is null or p_scope not in ('pin', 'password') or p_max < 1 or p_base < 1 or p_cap < p_base then
    raise exception 'Paramètres invalides' using errcode = '22023';
  end if;

  insert into public.vault_lock_attempts (user_id, scope, failed_count)
  values (p_user_id, p_scope, 0)
  on conflict (user_id, scope) do nothing;

  select a.* into v_row from public.vault_lock_attempts a
   where a.user_id = p_user_id and a.scope = p_scope
   for update;

  if v_row.locked_until is not null and v_row.locked_until > now() then
    allowed := false; locked_until := v_row.locked_until; attempts_left := 0;
    return next;
    return;
  end if;

  v_count := case when v_row.locked_until is not null then 0 else v_row.failed_count end + 1;

  if v_count >= p_max then
    update public.vault_lock_attempts a
       set failed_count   = 0,
           lockouts       = a.lockouts + 1,
           locked_until   = now() + make_interval(secs => least(p_cap::double precision, p_base * power(2, least(a.lockouts, 20)))),
           last_failed_at = now()
     where a.user_id = p_user_id and a.scope = p_scope
    returning a.* into v_row;
    allowed := true; locked_until := v_row.locked_until; attempts_left := 0;
  else
    update public.vault_lock_attempts a
       set failed_count = v_count, locked_until = null, last_failed_at = now()
     where a.user_id = p_user_id and a.scope = p_scope;
    allowed := true; locked_until := null; attempts_left := p_max - v_count;
  end if;
  return next;
end;
$$;
revoke all on function public.vault_reserve_attempt(uuid, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.vault_reserve_attempt(uuid, text, integer, integer, integer) to service_role;


-- =====================================================================
-- 10. m4 — vault_unlocked() FERMÉ PAR DÉFAUT
-- =====================================================================
-- Sans ligne de réglages, le verrou est considéré ACTIF (comme le défaut
-- `enabled = true` de 0290 et de lib/vault-lock/store.ts). Seul un verrou
-- explicitement désactivé, ou un déverrouillage non expiré de la session,
-- rend vrai. Prédicat de la phase 2, toujours NON activée (bloc commenté
-- de 0290, à appliquer tel quel le moment venu).
create or replace function public.vault_unlocked()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
     and (
       exists (
         select 1 from public.vault_lock_settings s
          where s.user_id = auth.uid() and not s.enabled
       )
       or exists (
         select 1 from public.vault_unlocks u
          where u.user_id = auth.uid()
            and u.session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid
            and u.expires_at > now()
       )
     );
$$;
revoke all on function public.vault_unlocked() from public, anon;
grant execute on function public.vault_unlocked() to authenticated, service_role;


-- =====================================================================
-- 11. m7 — DÉFIS WebAuthn CÔTÉ SERVEUR, USAGE UNIQUE
-- =====================================================================
-- Le cookie signé ne porte plus que l'identifiant du défi ; la valeur est
-- ici et n'est utilisable qu'une fois (DELETE ... RETURNING atomique).
create table if not exists public.vault_webauthn_challenges (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  kind        text not null check (kind in ('reg', 'auth')),
  challenge   text not null check (length(challenge) between 16 and 200),
  name        text check (name is null or length(btrim(name)) between 1 and 60),
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now(),
  check (expires_at <= created_at + interval '10 minutes')
);
create index if not exists idx_vault_webauthn_challenges_user on public.vault_webauthn_challenges(user_id, kind);
create index if not exists idx_vault_webauthn_challenges_expires on public.vault_webauthn_challenges(expires_at);

alter table public.vault_webauthn_challenges enable row level security;
-- Aucune politique pour authenticated : service_role uniquement.
drop policy if exists mfa_required on public.vault_webauthn_challenges;
create policy mfa_required on public.vault_webauthn_challenges
  as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
revoke all on table public.vault_webauthn_challenges from public, anon, authenticated;
grant all on table public.vault_webauthn_challenges to service_role;

-- Enregistre un défi (remplace les défis en cours du même type, purge les expirés).
create or replace function public.vault_issue_webauthn_challenge(
  p_user_id    uuid,
  p_kind       text,
  p_challenge  text,
  p_name       text default null,
  p_ttl_seconds integer default 120
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_user_id is null or p_kind not in ('reg', 'auth') or p_ttl_seconds not between 10 and 600 then
    raise exception 'Paramètres invalides' using errcode = '22023';
  end if;
  delete from public.vault_webauthn_challenges c
   where c.user_id = p_user_id and (c.kind = p_kind or c.expires_at <= now());
  insert into public.vault_webauthn_challenges (user_id, kind, challenge, name, expires_at)
  values (p_user_id, p_kind, p_challenge, nullif(btrim(coalesce(p_name, '')), ''), now() + make_interval(secs => p_ttl_seconds))
  returning id into v_id;
  return v_id;
end;
$$;

-- Consomme un défi : supprimé dans tous les cas (usage unique), rendu
-- seulement s'il n'est pas expiré et appartient au même utilisateur / type.
create or replace function public.vault_consume_webauthn_challenge(p_id uuid, p_user_id uuid, p_kind text)
returns table (challenge text, name text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_row public.vault_webauthn_challenges%rowtype;
begin
  delete from public.vault_webauthn_challenges c
   where c.id = p_id and c.user_id = p_user_id and c.kind = p_kind
  returning c.* into v_row;
  if v_row.id is null or v_row.expires_at <= now() then
    return;
  end if;
  challenge := v_row.challenge;
  name := v_row.name;
  return next;
end;
$$;

revoke all on function public.vault_issue_webauthn_challenge(uuid, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.vault_consume_webauthn_challenge(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.vault_issue_webauthn_challenge(uuid, text, text, text, integer) to service_role;
grant execute on function public.vault_consume_webauthn_challenge(uuid, uuid, text) to service_role;


-- =====================================================================
-- 12. NIT — search_path vide sur les autres SECURITY DEFINER 0330 / 0340
-- =====================================================================
-- Fonctions non recréées ci-dessus : seul le paramètre change (leur corps
-- qualifie déjà les objets par `public.`, et les fonctions système sont
-- dans pg_catalog, toujours résolu).
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.conversations_add_participants()',
    'public.mark_read(uuid)',
    'public.list_linked_parents()',
    'public.child_guardians_check_not_owner()',
    'public._family_assert_caller()',
    'public._family_verified_email()',
    'public.family_role(uuid, uuid)',
    'public.my_family_child_ids(boolean)',
    'public.my_family_member_ids(boolean)',
    'public.family_row_visible(uuid, uuid[], boolean)',
    'public.family_expense_visible(uuid, uuid)',
    'public.resend_family_invitation(uuid)',
    'public.cancel_family_invitation(uuid)',
    'public.list_sent_family_invitations()',
    'public.list_received_family_invitations()',
    'public.get_family_invitation(text)',
    'public.accept_family_invitation(text)',
    'public.accept_family_invitation_by_id(uuid)',
    'public.decline_family_invitation(uuid)',
    'public.revoke_child_guardian(uuid)',
    'public.list_family_members()',
    'public.list_family_children()',
    'public.list_family_contacts()',
    'public.list_merge_candidates()',
    'public.dismiss_merge_candidate(uuid, uuid)'
  ]
  loop
    if to_regprocedure(f) is not null then
      execute format('alter function %s set search_path = ''''', f);
    end if;
  end loop;
end $$;


-- =====================================================================
-- 13. CONTRÔLES CI (résultat attendu : aucune ligne)
-- =====================================================================
-- -- Politiques dont la clause admin n'exige pas aal2 (tables v3) :
-- select schemaname, tablename, policyname from pg_policies
--  where (qual ~ 'is_admin\(\)' or with_check ~ 'is_admin\(\)')
--    and tablename in ('vault_lock_settings','vault_passkeys','vault_lock_attempts','guide_fiches',
--      'guide_parcours','guide_partners','document_templates','blog_posts','guide_territoires',
--      'content_versions','donations','vault_imports','family_invitations','family_invitation_children',
--      'child_guardians','child_merges','objects')
--    and policyname not in ('guide_partners_select_public');
-- -- SECURITY DEFINER 0330/0340/0360 sans search_path vide :
-- select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public' and p.prosecdef
--    and p.proname ~ '(family|guardian|merge|conversation|vault_|messaging|is_admin_aal2)'
--    and not ('search_path=""' = any (coalesce(p.proconfig, '{}')));
-- -- Anciens gardiens `parent` nommés par un non-titulaire (à revoir avec le titulaire) :
-- select g.id, g.child_id, g.user_id, g.invited_by from public.child_guardians g
--   join public.children c on c.id = g.child_id
--  where g.status = 'active' and g.role = 'parent' and g.invited_by is distinct from c.user_id;


-- =====================================================================
-- ROLLBACK (manuel, dans l'ordre)
-- =====================================================================
-- -- 12 : search_path de 0330/0340 : `alter function ... set search_path = public` (liste §12).
-- drop function if exists public.vault_consume_webauthn_challenge(uuid, uuid, text);
-- drop function if exists public.vault_issue_webauthn_challenge(uuid, text, text, text, integer);
-- drop table if exists public.vault_webauthn_challenges;
-- -- 10 : ré-appliquer vault_unlocked() de 0290 §6.
-- drop function if exists public.vault_reserve_attempt(uuid, text, integer, integer, integer);
-- -- 8 : ré-appliquer list_family_expenses (drop puis create) et "documents family select" de 0340.
-- drop index if exists public.idx_journal_expenses_family_extra;
-- -- 7 : ré-appliquer merge_child_into() de 0340 (et ses droits), puis :
-- drop function if exists public.merge_child_into_as(uuid, uuid, uuid, jsonb, jsonb);
-- -- 6 : ré-appliquer vault_add_from_source() de 0330, puis :
-- drop index if exists public.idx_vault_imports_quota;
-- alter table public.vault_imports drop constraint if exists chk_vault_imports_size;
-- alter table public.vault_imports drop column if exists size_bytes;
-- -- 5 :
-- alter table public.users drop constraint if exists chk_users_photo_url_owner;
-- alter table public.messages drop constraint if exists chk_messages_attachment_path;
-- -- 4 : ré-appliquer de 0330 : is_conversation_participant, list_my_conversations, create_conversation,
-- --     messages_enqueue_vault_imports, conversations_select_participants, (0230) get_my_conversation, conversation_participants_select,
-- --     messages_insert_sender, message_attachments_select / _insert ; de 0230 : messages_select_participants ;
-- --     de 0340 : _family_accept. Puis :
-- drop trigger if exists trg_coparent_links_prune_conversations on public.coparent_links;
-- drop trigger if exists trg_children_prune_conversations on public.children;
-- drop trigger if exists trg_child_guardians_prune_conversations on public.child_guardians;
-- drop function if exists public.coparent_links_after_change_prune();
-- drop function if exists public.children_after_delete_prune();
-- drop function if exists public.child_guardians_after_change_prune();
-- drop function if exists public.conversation_message_visible(uuid, timestamptz);
-- drop function if exists public.is_conversation_member(uuid);
-- drop function if exists public._conversations_prune_for_user(uuid);
-- drop function if exists public._conversation_prune(uuid);
-- drop function if exists public.messaging_linked(uuid, uuid);
-- drop index if exists public.idx_messages_attachment_path;
-- drop index if exists public.idx_conversation_participants_active;
-- alter table public.conversation_participants drop column if exists left_at;
-- -- 3 : ré-appliquer create_family_invitation et set_child_guardian_role de 0340
-- --     (les invitations annulées par la reprise restent annulées).
-- -- 2 :
-- drop trigger if exists trg_calendar_events_private_by_default on public.calendar_events;
-- drop function if exists public.calendar_events_private_by_default();
-- --     ré-appliquer calendar_select_family de 0340.
-- -- 1 : ré-appliquer les politiques admin de 0290 / 0300 §8-9 / 0310 / 0330 / 0340 §5 (is_admin()),
-- --     admin_stats_assert() de 0310, puis :
-- drop function if exists public.is_admin_aal2();
-- =====================================================================
