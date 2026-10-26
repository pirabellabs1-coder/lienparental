-- =====================================================================
-- Lien Parental — 0230_messages_partages.sql
-- 1. Messagerie entre parents (liens d'invitation, conversations, messages
--    immuables, pièces jointes privées, accusés de lecture).
-- 2. Partage temporaire en lecture seule avec l'avocat (lien à jeton,
--    expiration, révocation, code d'accès haché, journal des consultations).
--
-- Principes :
--   - RLS activée partout, aucune policy anon.
--   - Messages IMMUABLES : ni UPDATE ni DELETE accordés aux clients ; seul
--     read_at est renseigné, par le destinataire, via mark_read().
--   - Le lien avocat n'est jamais lisible par la clé anon : la page publique
--     passe par une route serveur (service_role) qui appelle
--     get_lawyer_share(token). Le code d'accès est haché en scrypt côté
--     Node (la base ne sait pas vérifier scrypt) puis comparé en temps
--     constant dans la route ; la base ne stocke que le hachage.
-- =====================================================================


-- =====================================================================
-- 1. MESSAGERIE
-- =====================================================================

-- --- coparent_links ---------------------------------------------------
-- Invitation de l'autre parent. Le jeton (32 caractères hexadécimaux,
-- 122 bits d'aléa issus de gen_random_uuid) est généré par la base.
create table if not exists public.coparent_links (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id) on delete cascade,
  invitee_email     citext not null check (length(invitee_email) between 3 and 254),
  token             text not null unique default replace(gen_random_uuid()::text, '-', ''),
  status            text not null default 'pending' check (status in ('pending', 'accepted')),
  coparent_user_id  uuid references public.users(id) on delete set null,
  expires_at        timestamptz not null default (now() + interval '14 days'),
  accepted_at       timestamptz,
  created_at        timestamptz not null default now(),
  check (coparent_user_id is null or coparent_user_id <> user_id)
);

create index if not exists idx_coparent_links_user
  on public.coparent_links(user_id, created_at desc);

-- --- conversations ----------------------------------------------------
-- V1 : une seule conversation par couple de parents (ordre indifférent).
create table if not exists public.conversations (
  id          uuid primary key default gen_random_uuid(),
  parent_a    uuid not null references public.users(id) on delete cascade,
  parent_b    uuid not null references public.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  check (parent_a <> parent_b)
);

create unique index if not exists uq_conversations_pair
  on public.conversations (least(parent_a, parent_b), greatest(parent_a, parent_b));
create index if not exists idx_conversations_a on public.conversations(parent_a);
create index if not exists idx_conversations_b on public.conversations(parent_b);

-- --- messages ---------------------------------------------------------
-- Valeur probante : created_at imposé par la base, contenu non modifiable.
create table if not exists public.messages (
  id                uuid primary key default gen_random_uuid(),
  conversation_id   uuid not null references public.conversations(id) on delete cascade,
  sender_id         uuid not null references public.users(id) on delete cascade,
  body              text not null default '' check (length(body) <= 5000),
  attachment_path   text,       -- "<conversation_id>/<uuid>.<ext>" dans le bucket message-attachments
  attachment_meta   jsonb,      -- { "name": "...", "mime": "...", "size": 123 }
  created_at        timestamptz not null default now(),
  read_at           timestamptz,
  check (length(body) > 0 or attachment_path is not null)
);

create index if not exists idx_messages_conversation
  on public.messages(conversation_id, created_at);
create index if not exists idx_messages_unread
  on public.messages(conversation_id, sender_id)
  where read_at is null;

-- Horodatage serveur à l'insertion (le client ne peut ni antidater ni pré-lire).
create or replace function public.messages_before_insert()
returns trigger
language plpgsql
as $$
begin
  new.created_at := now();
  new.read_at := null;
  return new;
end;
$$;

drop trigger if exists trg_messages_before_insert on public.messages;
create trigger trg_messages_before_insert
  before insert on public.messages
  for each row execute function public.messages_before_insert();

-- Garde-fou d'immuabilité, y compris pour le service_role : seule la
-- transition read_at NULL -> horodatage est autorisée.
create or replace function public.messages_guard_update()
returns trigger
language plpgsql
as $$
begin
  if new.id is distinct from old.id
     or new.conversation_id is distinct from old.conversation_id
     or new.sender_id is distinct from old.sender_id
     or new.body is distinct from old.body
     or new.attachment_path is distinct from old.attachment_path
     or new.attachment_meta is distinct from old.attachment_meta
     or new.created_at is distinct from old.created_at
     or (old.read_at is not null and new.read_at is distinct from old.read_at)
  then
    raise exception 'Les messages ne peuvent être ni modifiés ni supprimés.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_messages_guard_update on public.messages;
create trigger trg_messages_guard_update
  before update on public.messages
  for each row execute function public.messages_guard_update();

-- --- helpers ----------------------------------------------------------
create or replace function public.is_conversation_participant(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.conversations c
    where c.id = p_conversation_id
      and auth.uid() in (c.parent_a, c.parent_b)
  );
$$;

revoke all on function public.is_conversation_participant(uuid) from public;
grant execute on function public.is_conversation_participant(uuid) to authenticated;

-- --- RLS : coparent_links ---------------------------------------------
alter table public.coparent_links enable row level security;

drop policy if exists coparent_links_select_self on public.coparent_links;
create policy coparent_links_select_self on public.coparent_links
  for select using (auth.uid() = user_id or auth.uid() = coparent_user_id);

drop policy if exists coparent_links_insert_self on public.coparent_links;
create policy coparent_links_insert_self on public.coparent_links
  for insert with check (auth.uid() = user_id and status = 'pending' and coparent_user_id is null);

-- Annulation d'une invitation encore en attente.
drop policy if exists coparent_links_delete_pending on public.coparent_links;
create policy coparent_links_delete_pending on public.coparent_links
  for delete using (auth.uid() = user_id and status = 'pending');

revoke all on table public.coparent_links from anon;
revoke update on table public.coparent_links from authenticated;

-- --- RLS : conversations ----------------------------------------------
alter table public.conversations enable row level security;

drop policy if exists conversations_select_participants on public.conversations;
create policy conversations_select_participants on public.conversations
  for select using (auth.uid() in (parent_a, parent_b));
-- Pas d'INSERT client : création uniquement via accept_coparent_invite().

revoke all on table public.conversations from anon;
revoke insert, update, delete on table public.conversations from authenticated;

-- --- RLS : messages ---------------------------------------------------
alter table public.messages enable row level security;

drop policy if exists messages_select_participants on public.messages;
create policy messages_select_participants on public.messages
  for select using (public.is_conversation_participant(conversation_id));

drop policy if exists messages_insert_sender on public.messages;
create policy messages_insert_sender on public.messages
  for insert with check (
    sender_id = auth.uid()
    and public.is_conversation_participant(conversation_id)
    and (attachment_path is null or split_part(attachment_path, '/', 1) = conversation_id::text)
  );

-- Immuabilité : AUCUNE policy UPDATE / DELETE, et privilèges retirés.
revoke all on table public.messages from anon;
revoke update, delete, truncate on table public.messages from authenticated;

-- --- mark_read(conversation_id) ---------------------------------------
-- Le destinataire marque comme lus les messages reçus (jamais les siens).
create or replace function public.mark_read(p_conversation_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if auth.uid() is null or not public.is_conversation_participant(p_conversation_id) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;

  update public.messages
     set read_at = now()
   where conversation_id = p_conversation_id
     and sender_id <> auth.uid()
     and read_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.mark_read(uuid) from public;
grant execute on function public.mark_read(uuid) to authenticated;

-- --- get_my_conversation() --------------------------------------------
-- La table users n'est lisible que par son propriétaire : on expose
-- uniquement le prénom / nom de l'autre parent de la conversation.
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
set search_path = public
as $$
  select c.id,
         u.id,
         coalesce(u.prenom, ''),
         coalesce(u.nom, ''),
         c.created_at
    from public.conversations c
    join public.users u
      on u.id = case when c.parent_a = auth.uid() then c.parent_b else c.parent_a end
   where auth.uid() in (c.parent_a, c.parent_b)
   order by c.created_at asc
   limit 1;
$$;

revoke all on function public.get_my_conversation() from public;
grant execute on function public.get_my_conversation() to authenticated;

-- --- accept_coparent_invite(token) ------------------------------------
create or replace function public.accept_coparent_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link  public.coparent_links%rowtype;
  v_conv  uuid;
begin
  if auth.uid() is null then
    raise exception 'Non authentifié' using errcode = '42501';
  end if;
  if p_token is null or length(p_token) <> 32 then
    raise exception 'Invitation invalide' using errcode = 'P0002';
  end if;

  select * into v_link
    from public.coparent_links
   where token = p_token
     and status = 'pending'
     and expires_at > now()
   for update;

  if not found or v_link.user_id = auth.uid() then
    raise exception 'Invitation invalide ou expirée' using errcode = 'P0002';
  end if;

  update public.coparent_links
     set status = 'accepted',
         coparent_user_id = auth.uid(),
         accepted_at = now()
   where id = v_link.id;

  select id into v_conv
    from public.conversations
   where least(parent_a, parent_b) = least(v_link.user_id, auth.uid())
     and greatest(parent_a, parent_b) = greatest(v_link.user_id, auth.uid());

  if v_conv is null then
    insert into public.conversations (parent_a, parent_b)
    values (v_link.user_id, auth.uid())
    returning id into v_conv;
  end if;

  return v_conv;
end;
$$;

revoke all on function public.accept_coparent_invite(text) from public;
grant execute on function public.accept_coparent_invite(text) to authenticated;

-- --- Realtime ---------------------------------------------------------
-- postgres_changes respecte la RLS : seuls les participants reçoivent.
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;
  when undefined_object then null;  -- publication absente (base hors Supabase)
end $$;

-- --- Storage : pièces jointes (bucket privé, 10 Mo, images et PDF) -----
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'message-attachments', 'message-attachments', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
)
on conflict (id) do nothing;

-- Chemin : "<conversation_id>/<fichier>". Lecture et dépôt par les
-- participants ; ni mise à jour ni suppression (preuve).
drop policy if exists message_attachments_select on storage.objects;
create policy message_attachments_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'message-attachments'
    and (storage.foldername(name))[1] in (
      select c.id::text from public.conversations c
       where auth.uid() in (c.parent_a, c.parent_b)
    )
  );

drop policy if exists message_attachments_insert on storage.objects;
create policy message_attachments_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'message-attachments'
    and (storage.foldername(name))[1] in (
      select c.id::text from public.conversations c
       where auth.uid() in (c.parent_a, c.parent_b)
    )
  );


-- =====================================================================
-- 2. PARTAGE TEMPORAIRE AVEC L'AVOCAT
-- =====================================================================

-- --- lawyer_shares ----------------------------------------------------
-- token : 32 caractères base64url générés par la route serveur
--         (crypto.randomBytes(24)).
-- scope : { "childId": "...", "journal": { "from": "yyyy-mm-dd", "to": "yyyy-mm-dd" } | null,
--           "documentIds": [...], "testimonyIds": [...], "messages": true|false }
-- access_code_hash : "scrypt$N$r$p$<sel base64url>$<hachage base64url>" ou NULL.
create table if not exists public.lawyer_shares (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id) on delete cascade,
  token             text not null unique check (token ~ '^[A-Za-z0-9_-]{32}$'),
  label             text not null check (length(label) between 1 and 80),
  scope             jsonb not null default '{}'::jsonb,
  expires_at        timestamptz not null,
  revoked_at        timestamptz,
  access_code_hash  text,
  created_at        timestamptz not null default now(),
  check (expires_at > created_at and expires_at <= created_at + interval '31 days')
);

create index if not exists idx_lawyer_shares_user
  on public.lawyer_shares(user_id, created_at desc);

-- --- lawyer_share_access_log ------------------------------------------
create table if not exists public.lawyer_share_access_log (
  id           uuid primary key default gen_random_uuid(),
  share_id     uuid not null references public.lawyer_shares(id) on delete cascade,
  accessed_at  timestamptz not null default now(),
  ua_hash      text,          -- SHA-256 salé du User-Agent (pas d'IP stockée)
  success      boolean not null default true
);

create index if not exists idx_lawyer_share_access_share
  on public.lawyer_share_access_log(share_id, accessed_at desc);

-- --- RLS : propriétaire uniquement -----------------------------------
alter table public.lawyer_shares enable row level security;

drop policy if exists lawyer_shares_select_self on public.lawyer_shares;
create policy lawyer_shares_select_self on public.lawyer_shares
  for select using (auth.uid() = user_id);

drop policy if exists lawyer_shares_insert_self on public.lawyer_shares;
create policy lawyer_shares_insert_self on public.lawyer_shares
  for insert with check (auth.uid() = user_id and revoked_at is null);

-- Mise à jour limitée à la révocation (privilège de colonne ci-dessous).
drop policy if exists lawyer_shares_update_self on public.lawyer_shares;
create policy lawyer_shares_update_self on public.lawyer_shares
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke all on table public.lawyer_shares from anon;
revoke update, delete on table public.lawyer_shares from authenticated;
grant update (revoked_at) on table public.lawyer_shares to authenticated;

alter table public.lawyer_share_access_log enable row level security;

drop policy if exists lawyer_share_access_select_owner on public.lawyer_share_access_log;
create policy lawyer_share_access_select_owner on public.lawyer_share_access_log
  for select using (
    exists (
      select 1 from public.lawyer_shares s
       where s.id = share_id and s.user_id = auth.uid()
    )
  );
-- Insertions uniquement par la route serveur (service_role).

revoke all on table public.lawyer_share_access_log from anon;
revoke insert, update, delete on table public.lawyer_share_access_log from authenticated;

-- --- get_lawyer_share(token) ------------------------------------------
-- SEUL point d'entrée de la page publique. Réservé au service_role : la
-- route serveur vérifie ensuite le code (scrypt, temps constant) avant de
-- renvoyer le moindre contenu. Lien expiré ou révoqué = aucune ligne.
create or replace function public.get_lawyer_share(p_token text)
returns table (
  id                uuid,
  user_id           uuid,
  label             text,
  scope             jsonb,
  expires_at        timestamptz,
  created_at        timestamptz,
  access_code_hash  text,
  owner_prenom      text,
  owner_nom         text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{32}$' then
    return;
  end if;

  return query
    select s.id, s.user_id, s.label, s.scope, s.expires_at, s.created_at,
           s.access_code_hash, coalesce(u.prenom, ''), coalesce(u.nom, '')
      from public.lawyer_shares s
      join public.users u on u.id = s.user_id
     where s.token = p_token
       and s.revoked_at is null
       and s.expires_at > now()
     limit 1;
end;
$$;

revoke all on function public.get_lawyer_share(text) from public, anon, authenticated;
grant execute on function public.get_lawyer_share(text) to service_role;

comment on function public.get_lawyer_share(text) is
  'Lecture d''un partage avocat actif par jeton. Réservé au service_role (route /api/partage/[token]) qui vérifie le code d''accès.';

-- --- log_lawyer_share_access(share_id, ua_hash, success) ---------------
create or replace function public.log_lawyer_share_access(
  p_share_id uuid,
  p_ua_hash  text,
  p_success  boolean default true
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.lawyer_share_access_log (share_id, ua_hash, success)
  values (p_share_id, left(p_ua_hash, 128), coalesce(p_success, true));
$$;

revoke all on function public.log_lawyer_share_access(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.log_lawyer_share_access(uuid, text, boolean) to service_role;
