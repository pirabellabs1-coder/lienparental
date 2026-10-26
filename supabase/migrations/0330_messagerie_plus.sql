-- =====================================================================
-- Lien Parental — 0330_messagerie_plus.sql
-- Messagerie v3 (chantier H) :
--   1. plusieurs conversations par paire de parents (sujet facultatif),
--      participants multiples (conversation_participants), archivage et
--      lecture par participant ;
--   2. notes vocales (messages.kind = 'audio', durée bornée à 3 min) ;
--   3. ajout automatique des pièces jointes au coffre-fort de CHAQUE
--      participant, sans doublon (vault_imports + vault_add_from_source) ;
--   4. RPC : list_my_conversations, create_conversation, list_linked_parents.
--
-- Compatibilité :
--   * aucune migration antérieure n'est modifiée ; ré-exécutable ;
--   * conversations.parent_a / parent_b restent renseignés (créateur et
--     premier interlocuteur) : get_my_conversation() (0230) et
--     accept_coparent_invite() (0270) continuent de fonctionner. Une
--     conversation créée par accept_coparent_invite reçoit ses deux
--     participants via le trigger trg_conversations_participants ;
--   * l'index unique uq_conversations_pair (une conversation par paire)
--     est supprimé : accept_coparent_invite fait un SELECT ... INTO sans
--     STRICT et prend la première conversation trouvée, sans erreur.
--
-- Sécurité : RLS par participant, politiques MFA RESTRICTIVE (0270),
-- fonctions SECURITY DEFINER à search_path fixé et révoquées pour anon,
-- écriture dans le coffre d'autrui uniquement par le service_role.
--
-- Rollback : bloc commenté en fin de fichier.
-- =====================================================================


-- =====================================================================
-- 1. CONVERSATIONS : sujet, créateur, participants
-- =====================================================================

alter table public.conversations add column if not exists title      text;
alter table public.conversations add column if not exists created_by uuid references public.users(id) on delete set null;

do $$
begin
  alter table public.conversations
    add constraint chk_conversations_title check (title is null or length(title) between 1 and 80);
exception when duplicate_object then null;
end $$;

-- Plusieurs conversations par paire (une par sujet).
drop index if exists public.uq_conversations_pair;
create index if not exists idx_conversations_pair
  on public.conversations (least(parent_a, parent_b), greatest(parent_a, parent_b));

-- --- conversation_participants ----------------------------------------
create table if not exists public.conversation_participants (
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  user_id          uuid not null references public.users(id) on delete cascade,
  joined_at        timestamptz not null default now(),
  -- Archivage propre à chaque participant (la conversation reste intacte).
  archived_at      timestamptz,
  -- Lecture propre à chaque participant (messages.read_at = première lecture).
  last_read_at     timestamptz,
  primary key (conversation_id, user_id)
);

create index if not exists idx_conversation_participants_user
  on public.conversation_participants(user_id, conversation_id);

-- Reprise : les deux parents de chaque conversation existante.
insert into public.conversation_participants (conversation_id, user_id, joined_at)
select c.id, p.uid, c.created_at
  from public.conversations c
  cross join lateral (values (c.parent_a), (c.parent_b)) as p(uid)
on conflict do nothing;

-- Toute conversation insérée (accept_coparent_invite, create_conversation)
-- reçoit automatiquement parent_a et parent_b comme participants.
create or replace function public.conversations_add_participants()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.conversation_participants (conversation_id, user_id, joined_at)
  values (new.id, new.parent_a, new.created_at), (new.id, new.parent_b, new.created_at)
  on conflict do nothing;
  return new;
end;
$$;

revoke all on function public.conversations_add_participants() from public, anon, authenticated;

drop trigger if exists trg_conversations_participants on public.conversations;
create trigger trg_conversations_participants
  after insert on public.conversations
  for each row execute function public.conversations_add_participants();

-- --- is_conversation_participant : désormais par la table des participants
-- Même signature que 0230 : les policies existantes (messages) en profitent.
create or replace function public.is_conversation_participant(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.conversation_participants p
     where p.conversation_id = p_conversation_id
       and p.user_id = auth.uid()
  );
$$;

revoke all on function public.is_conversation_participant(uuid) from public, anon;
grant execute on function public.is_conversation_participant(uuid) to authenticated;

-- --- RLS : conversations (participants) --------------------------------
drop policy if exists conversations_select_participants on public.conversations;
create policy conversations_select_participants on public.conversations
  for select to authenticated
  using (public.is_conversation_participant(id));
-- Toujours aucun INSERT / UPDATE / DELETE client (0230) : création par RPC.

-- --- RLS : conversation_participants -----------------------------------
alter table public.conversation_participants enable row level security;

-- Chaque participant voit la liste des participants de ses conversations.
drop policy if exists conversation_participants_select on public.conversation_participants;
create policy conversation_participants_select on public.conversation_participants
  for select to authenticated
  using (public.is_conversation_participant(conversation_id));

-- Seule sa propre ligne est modifiable, et seulement archived_at (grant colonne).
drop policy if exists conversation_participants_update_self on public.conversation_participants;
create policy conversation_participants_update_self on public.conversation_participants
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists mfa_required on public.conversation_participants;
create policy mfa_required on public.conversation_participants
  as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));

revoke all on table public.conversation_participants from public, anon, authenticated;
grant select on table public.conversation_participants to authenticated;
grant update (archived_at) on table public.conversation_participants to authenticated;
grant all on table public.conversation_participants to service_role;


-- =====================================================================
-- 2. MESSAGES : type (texte, pièce jointe, note vocale)
-- =====================================================================

alter table public.messages add column if not exists kind              text not null default 'text';
alter table public.messages add column if not exists audio_duration_ms integer;

-- Reprise avant le nouveau garde-fou (l'ancien ne contrôle pas `kind`).
update public.messages set kind = 'attachment'
 where attachment_path is not null and kind = 'text';

do $$
begin
  alter table public.messages
    add constraint chk_messages_kind check (kind in ('text', 'attachment', 'audio'));
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.messages
    add constraint chk_messages_audio check (
      (kind = 'audio' and attachment_path is not null and audio_duration_ms between 300 and 180000)
      or (kind <> 'audio' and audio_duration_ms is null)
    );
exception when duplicate_object then null;
end $$;

-- Horodatage serveur (inchangé) + cohérence du type à l'insertion.
create or replace function public.messages_before_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.created_at := now();
  new.read_at := null;
  if new.attachment_path is null then
    new.kind := 'text';
    new.audio_duration_ms := null;
  elsif new.kind = 'audio' then
    if coalesce(new.attachment_meta ->> 'mime', '') not like 'audio/%' then
      raise exception 'Note vocale invalide' using errcode = '22023';
    end if;
  else
    new.kind := 'attachment';
    new.audio_duration_ms := null;
  end if;
  return new;
end;
$$;

-- Immuabilité étendue aux nouvelles colonnes.
create or replace function public.messages_guard_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id is distinct from old.id
     or new.conversation_id is distinct from old.conversation_id
     or new.sender_id is distinct from old.sender_id
     or new.body is distinct from old.body
     or new.attachment_path is distinct from old.attachment_path
     or new.attachment_meta is distinct from old.attachment_meta
     or new.kind is distinct from old.kind
     or new.audio_duration_ms is distinct from old.audio_duration_ms
     or new.created_at is distinct from old.created_at
     or (old.read_at is not null and new.read_at is distinct from old.read_at)
  then
    raise exception 'Les messages ne peuvent être ni modifiés ni supprimés.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- Insertion : participant, chemin de pièce jointe dans le dossier de la conversation.
drop policy if exists messages_insert_sender on public.messages;
create policy messages_insert_sender on public.messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_conversation_participant(conversation_id)
    and (attachment_path is null or split_part(attachment_path, '/', 1) = conversation_id::text)
  );

-- --- mark_read : accusé global (première lecture) + lecture par participant
create or replace function public.mark_read(p_conversation_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if auth.uid() is null
     or not public.mfa_satisfied()
     or not public.is_conversation_participant(p_conversation_id) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;

  update public.messages
     set read_at = now()
   where conversation_id = p_conversation_id
     and sender_id <> auth.uid()
     and read_at is null;
  get diagnostics v_count = row_count;

  update public.conversation_participants
     set last_read_at = now()
   where conversation_id = p_conversation_id
     and user_id = auth.uid();

  return v_count;
end;
$$;

revoke all on function public.mark_read(uuid) from public, anon;
grant execute on function public.mark_read(uuid) to authenticated;


-- =====================================================================
-- 3. STORAGE : notes vocales, accès par participant
-- =====================================================================

-- Formats audio produits par MediaRecorder (Chrome/Firefox : webm/ogg,
-- Safari : mp4/aac). Ajout idempotent aux types existants.
update storage.buckets
   set allowed_mime_types = (
     select array_agg(distinct t order by t)
       from unnest(coalesce(allowed_mime_types, '{}'::text[])
                   || array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/aac']) as t
   )
 where id = 'message-attachments';

-- Le coffre reçoit les mêmes formats (copie serveur). NULL = tout type
-- accepté : on ne restreint pas un bucket qui ne l'était pas.
update storage.buckets
   set allowed_mime_types = (
     select array_agg(distinct t order by t)
       from unnest(allowed_mime_types
                   || array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/aac']) as t
   )
 where id = 'documents' and allowed_mime_types is not null;

drop policy if exists message_attachments_select on storage.objects;
create policy message_attachments_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'message-attachments'
    and (storage.foldername(name))[1] in (
      select p.conversation_id::text from public.conversation_participants p
       where p.user_id = auth.uid()
    )
  );

drop policy if exists message_attachments_insert on storage.objects;
create policy message_attachments_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'message-attachments'
    and (storage.foldername(name))[1] in (
      select p.conversation_id::text from public.conversation_participants p
       where p.user_id = auth.uid()
    )
  );
-- La politique RESTRICTIVE « private buckets mfa required » (0270) couvre déjà ce bucket.


-- =====================================================================
-- 4. COFFRE-FORT : imports automatiques depuis une source
-- =====================================================================
-- Une ligne par (destinataire, source, référence) : c'est la garantie
-- « sans doublon » et le lien message -> document du coffre.
--   source      : 'messagerie' | 'temoignage' | 'journal' | 'autre'
--   source_ref  : messagerie -> id du message ; témoignage -> "<testimony_id>:<n>"
-- Les lignes 'pending' sont créées par la base (trigger ci-dessous) ;
-- la copie du binaire et la création du document sont faites par le
-- serveur (service_role) via vault_add_from_source().
create table if not exists public.vault_imports (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.users(id) on delete cascade,
  source           text not null check (source in ('messagerie', 'temoignage', 'journal', 'autre')),
  source_ref       text not null check (length(source_ref) between 1 and 200),
  message_id       uuid references public.messages(id) on delete cascade,
  conversation_id  uuid references public.conversations(id) on delete cascade,
  sender_id        uuid references public.users(id) on delete set null,
  category_name    text not null default 'Courriers' check (length(category_name) between 1 and 40),
  meta             jsonb not null default '{}'::jsonb,
  document_id      uuid references public.documents(id) on delete set null,
  status           text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  attempts         integer not null default 0,
  created_at       timestamptz not null default now(),
  processed_at     timestamptz,
  unique (user_id, source, source_ref)
);

create index if not exists idx_vault_imports_conversation
  on public.vault_imports(conversation_id, status);
create index if not exists idx_vault_imports_user_message
  on public.vault_imports(user_id, message_id);
create index if not exists idx_vault_imports_pending
  on public.vault_imports(created_at)
  where status <> 'done';

alter table public.vault_imports enable row level security;

drop policy if exists vault_imports_select_self on public.vault_imports;
create policy vault_imports_select_self on public.vault_imports
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists mfa_required on public.vault_imports;
create policy mfa_required on public.vault_imports
  as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));

-- Lecture seule côté client ; écritures par trigger (definer) et service_role.
revoke all on table public.vault_imports from public, anon, authenticated;
grant select on table public.vault_imports to authenticated;
grant all on table public.vault_imports to service_role;

-- Toute pièce jointe (document, photo, note vocale) envoyée dans une
-- conversation est inscrite pour CHAQUE participant, expéditeur compris.
create or replace function public.messages_enqueue_vault_imports()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.attachment_path is null then
    return new;
  end if;
  insert into public.vault_imports (user_id, source, source_ref, message_id, conversation_id, sender_id)
  select p.user_id, 'messagerie', new.id::text, new.id, new.conversation_id, new.sender_id
    from public.conversation_participants p
   where p.conversation_id = new.conversation_id
  on conflict (user_id, source, source_ref) do nothing;
  return new;
end;
$$;

revoke all on function public.messages_enqueue_vault_imports() from public, anon, authenticated;

drop trigger if exists trg_messages_enqueue_vault on public.messages;
create trigger trg_messages_enqueue_vault
  after insert on public.messages
  for each row execute function public.messages_enqueue_vault_imports();

-- Reprise : pièces jointes déjà échangées (0230), pour chaque participant.
insert into public.vault_imports (user_id, source, source_ref, message_id, conversation_id, sender_id)
select p.user_id, 'messagerie', m.id::text, m.id, m.conversation_id, m.sender_id
  from public.messages m
  join public.conversation_participants p on p.conversation_id = m.conversation_id
 where m.attachment_path is not null
on conflict (user_id, source, source_ref) do nothing;

-- --- vault_add_from_source() --------------------------------------------
-- Crée (ou retrouve) le document du coffre d'un utilisateur pour une
-- source donnée. Idempotent :
--   1. même (user, source, ref) déjà importé  -> document existant ;
--   2. même empreinte SHA-256 déjà dans le coffre (non supprimé)
--      -> document existant relié (created = false, le serveur supprime
--      sa copie) ;
--   3. sinon insertion dans la catégorie demandée (créée au besoin ;
--      catégories par défaut semées si le coffre n'en a aucune).
-- Le binaire doit déjà exister à p_storage_path (bucket documents).
-- Réservée au service_role (écrit dans le coffre d'autrui).
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
set search_path = public
as $$
#variable_conflict use_column
declare
  v_imp       public.vault_imports%rowtype;
  v_cat_name  text := left(coalesce(nullif(btrim(p_category_name), ''), 'Courriers'), 40);
  v_cat       uuid;
  v_doc       uuid;
  v_path      text;
  v_label     text;
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

  -- 1. Déjà importé.
  if v_imp.document_id is not null then
    select d.id, d.storage_path into v_doc, v_path
      from public.documents d where d.id = v_imp.document_id;
    if v_doc is not null then
      update public.vault_imports set status = 'done', processed_at = coalesce(processed_at, now()) where id = v_imp.id;
      return query select v_doc, v_path, false;
      return;
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
    -- 3. Catégorie (semis des catégories par défaut si le coffre est vierge,
    --    comme lib/data/vault.ts au premier accès).
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
       set document_id = v_doc, status = 'done', processed_at = now(),
           category_name = v_cat_name, meta = coalesce(p_meta, meta)
     where id = v_imp.id;
    return query select v_doc, v_path, true;
    return;
  end if;

  update public.vault_imports
     set document_id = v_doc, status = 'done', processed_at = now(), meta = coalesce(p_meta, meta)
   where id = v_imp.id;
  return query select v_doc, v_path, false;
end;
$$;

revoke all on function public.vault_add_from_source(uuid, text, text, text, text, text, bigint, text, date, text, text, jsonb, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.vault_add_from_source(uuid, text, text, text, text, text, bigint, text, date, text, text, jsonb, uuid, uuid, uuid)
  to service_role;

comment on function public.vault_add_from_source(uuid, text, text, text, text, text, bigint, text, date, text, text, jsonb, uuid, uuid, uuid) is
  'Ajout idempotent d''un fichier au coffre d''un utilisateur depuis une source (messagerie, témoignage...). service_role uniquement (app/app/messages/_server/vault.ts).';


-- =====================================================================
-- 5. RPC CLIENT
-- =====================================================================

-- --- list_linked_parents() ----------------------------------------------
-- CONTRAT partagé avec le chantier I (liaison multi-parents, 0340) :
-- même signature, `create or replace` autorisé pour y ajouter les liens
-- familiaux. Doit renvoyer uniquement les parents avec lesquels l'appelant
-- peut ouvrir une conversation (jamais l'appelant lui-même).
create or replace function public.list_linked_parents()
returns table (user_id uuid, prenom text, nom text, linked_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, coalesce(u.prenom, ''), coalesce(u.nom, ''), min(l.at)
    from (
      select case when cl.user_id = auth.uid() then cl.coparent_user_id else cl.user_id end as uid,
             coalesce(cl.accepted_at, cl.created_at) as at
        from public.coparent_links cl
       where cl.status = 'accepted'
         and cl.coparent_user_id is not null
         and auth.uid() in (cl.user_id, cl.coparent_user_id)
    ) l
    join public.users u on u.id = l.uid
   where l.uid <> auth.uid()
     and (select public.mfa_satisfied())
   group by u.id, u.prenom, u.nom
   order by min(l.at);
$$;

revoke all on function public.list_linked_parents() from public, anon;
grant execute on function public.list_linked_parents() to authenticated;

-- --- list_my_conversations(id facultatif) --------------------------------
-- La table users n'est lisible que par son propriétaire : on n'expose que
-- prénom / nom des autres participants.
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
set search_path = public
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

-- --- create_conversation(participants, sujet) ----------------------------
-- Interlocuteurs : uniquement des parents liés (list_linked_parents), 1 à 5.
-- Même sujet et mêmes participants qu'une conversation existante : on la
-- réutilise (et on la désarchive) au lieu de créer un doublon.
create or replace function public.create_conversation(p_participant_ids uuid[], p_title text default null)
returns uuid
language plpgsql
security definer
set search_path = public
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

  -- Garde-fou anti-abus : 30 nouvelles conversations par jour et par parent.
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

  -- parent_a / parent_b ajoutés par trg_conversations_participants.
  insert into public.conversation_participants (conversation_id, user_id)
  select v_conv, x from unnest(v_ids) as x
  on conflict do nothing;

  return v_conv;
end;
$$;

revoke all on function public.create_conversation(uuid[], text) from public, anon;
grant execute on function public.create_conversation(uuid[], text) to authenticated;


-- =====================================================================
-- CONTRÔLES (résultat attendu)
-- =====================================================================
-- -- Chaque conversation a au moins ses deux parents comme participants (vide) :
-- select c.id from public.conversations c
--  where not exists (select 1 from public.conversation_participants p where p.conversation_id = c.id and p.user_id = c.parent_a)
--     or not exists (select 1 from public.conversation_participants p where p.conversation_id = c.id and p.user_id = c.parent_b);
-- -- Imports en échec ou en attente depuis plus d'une heure (à surveiller) :
-- select status, count(*) from public.vault_imports
--  where status <> 'done' and created_at < now() - interval '1 hour' group by 1;


-- =====================================================================
-- ROLLBACK (manuel, dans l'ordre)
-- =====================================================================
-- drop function if exists public.create_conversation(uuid[], text);
-- drop function if exists public.list_my_conversations(uuid);
-- drop function if exists public.list_linked_parents();
-- drop function if exists public.vault_add_from_source(uuid, text, text, text, text, text, bigint, text, date, text, text, jsonb, uuid, uuid, uuid);
-- drop trigger if exists trg_messages_enqueue_vault on public.messages;
-- drop function if exists public.messages_enqueue_vault_imports();
-- drop table if exists public.vault_imports;
-- -- ré-appliquer mark_read, messages_before_insert, messages_guard_update,
-- -- is_conversation_participant, les policies conversations_select_participants,
-- -- messages_insert_sender, message_attachments_select / _insert de 0230.
-- alter table public.messages drop constraint if exists chk_messages_audio;
-- alter table public.messages drop constraint if exists chk_messages_kind;
-- alter table public.messages drop column if exists audio_duration_ms;
-- alter table public.messages drop column if exists kind;
-- drop trigger if exists trg_conversations_participants on public.conversations;
-- drop function if exists public.conversations_add_participants();
-- drop table if exists public.conversation_participants;
-- -- ATTENTION : l'index unique uq_conversations_pair ne peut être recréé que
-- -- s'il ne reste qu'une conversation par paire.
-- alter table public.conversations drop constraint if exists chk_conversations_title;
-- alter table public.conversations drop column if exists created_by;
-- alter table public.conversations drop column if exists title;
-- =====================================================================
