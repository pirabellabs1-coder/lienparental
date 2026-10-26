-- =====================================================================
-- Lien Parental — 0420_vault_import_settings.sql
-- Messagerie → coffre-fort : rangement automatique DÉSACTIVÉ par défaut.
--
-- Jusqu'ici (0330, 0360), chaque pièce jointe était inscrite pour le
-- coffre-fort de CHAQUE participant. Désormais :
--   1. vault_settings : réglage par parent « Ranger automatiquement les
--      pièces jointes dans le coffre-fort » (false par défaut) et dossier
--      de destination facultatif (vault_folders, 0410) ;
--   2. vault_imports.folder_id : dossier retenu au moment de l'inscription ;
--   3. messages_enqueue_vault_imports() : n'inscrit plus que les
--      participants actifs dont le réglage est activé.
-- Sans réglage activé, le parent range une pièce jointe à la demande
-- (« Mettre au coffre-fort », action serveur saveAttachmentToVault, qui
-- passe par vault_add_from_source comme l'import automatique).
--
-- Les inscriptions « pending » antérieures à cette migration restent
-- traitées une fois (comportement d'avant) ; aucune n'est supprimée.
--
-- Ré-exécutable. Rollback : bloc commenté en fin de fichier.
-- Tests : tests/sql/scenarios/0410-dossiers.test.mjs (section réglages).
-- =====================================================================


-- =====================================================================
-- 1. vault_settings
-- =====================================================================
create table if not exists public.vault_settings (
  user_id                uuid primary key references public.users(id) on delete cascade,
  auto_import_messages   boolean not null default false,
  auto_import_folder_id  uuid references public.vault_folders(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

drop trigger if exists trg_vault_settings_updated_at on public.vault_settings;
create trigger trg_vault_settings_updated_at
  before update on public.vault_settings
  for each row execute function public.handle_updated_at();

comment on table public.vault_settings is
  'Réglages du coffre par parent (0420). auto_import_messages = false par défaut : les pièces jointes de la messagerie ne vont au coffre qu''à la demande.';

-- Dossier de destination : un dossier du même parent.
create or replace function public.vault_settings_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'Propriétaire non modifiable' using errcode = '42501';
  end if;
  if new.auto_import_folder_id is not null and not exists (
    select 1 from public.vault_folders f where f.id = new.auto_import_folder_id and f.user_id = new.user_id
  ) then
    raise exception 'Dossier introuvable' using errcode = '23503', hint = 'vault_folder_not_found';
  end if;
  return new;
end;
$$;
revoke all on function public.vault_settings_guard() from public, anon, authenticated;

drop trigger if exists trg_vault_settings_guard on public.vault_settings;
create trigger trg_vault_settings_guard
  before insert or update on public.vault_settings
  for each row execute function public.vault_settings_guard();

alter table public.vault_settings enable row level security;

revoke all on table public.vault_settings from public, anon, authenticated;
grant select, delete on table public.vault_settings to authenticated;
grant insert (user_id, auto_import_messages, auto_import_folder_id) on table public.vault_settings to authenticated;
-- user_id inclus : un upsert PostgREST (on conflict do update) réécrit toutes les colonnes
-- envoyées ; le déclencheur refuse tout changement réel de propriétaire, la RLS aussi.
grant update (user_id, auto_import_messages, auto_import_folder_id) on table public.vault_settings to authenticated;
grant all on table public.vault_settings to service_role;

drop policy if exists vault_settings_owner on public.vault_settings;
create policy vault_settings_owner on public.vault_settings
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists mfa_required on public.vault_settings;
create policy mfa_required on public.vault_settings
  as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));

-- Modifier le réglage (ex. cibler un dossier partagé) exige le coffre déverrouillé ;
-- la lecture reste possible coffre verrouillé (écran de conversation).
drop policy if exists vault_unlocked_insert on public.vault_settings;
create policy vault_unlocked_insert on public.vault_settings
  as restrictive for insert to authenticated
  with check ((select public.vault_unlocked()));
drop policy if exists vault_unlocked_update on public.vault_settings;
create policy vault_unlocked_update on public.vault_settings
  as restrictive for update to authenticated
  using ((select public.vault_unlocked())) with check ((select public.vault_unlocked()));
drop policy if exists vault_unlocked_delete on public.vault_settings;
create policy vault_unlocked_delete on public.vault_settings
  as restrictive for delete to authenticated
  using ((select public.vault_unlocked()));


-- =====================================================================
-- 2. vault_imports.folder_id
-- =====================================================================
alter table public.vault_imports
  add column if not exists folder_id uuid references public.vault_folders(id) on delete set null;

comment on column public.vault_imports.folder_id is
  'Dossier de destination retenu à l''inscription (vault_settings.auto_import_folder_id, 0420). Appliqué au document créé par le serveur.';


-- =====================================================================
-- 3. Inscription automatique : seulement si le réglage est activé
-- =====================================================================
-- Identique à 0360 §5 (participants ACTIFS uniquement, search_path vide),
-- plus : jointure sur vault_settings.auto_import_messages.
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
  insert into public.vault_imports (user_id, source, source_ref, message_id, conversation_id, sender_id, folder_id)
  select p.user_id, 'messagerie', new.id::text, new.id, new.conversation_id, new.sender_id, s.auto_import_folder_id
    from public.conversation_participants p
    join public.vault_settings s on s.user_id = p.user_id and s.auto_import_messages
   where p.conversation_id = new.conversation_id
     and p.left_at is null
  on conflict (user_id, source, source_ref) do nothing;
  return new;
end;
$$;
revoke all on function public.messages_enqueue_vault_imports() from public, anon, authenticated;


-- =====================================================================
-- ROLLBACK (manuel)
-- =====================================================================
-- -- Ré-appliquer messages_enqueue_vault_imports() de 0360 §5, puis :
-- alter table public.vault_imports drop column if exists folder_id;
-- drop table if exists public.vault_settings;
-- drop function if exists public.vault_settings_guard();
