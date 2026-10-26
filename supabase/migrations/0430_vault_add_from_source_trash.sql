-- =====================================================================
-- Lien Parental — 0430_vault_add_from_source_trash.sql
-- Correctif de vault_add_from_source() (0330, 0360) : une pièce déjà importée
-- puis mise à la corbeille restait considérée « dans le coffre » (étape 1 sans
-- filtre deleted_at) : impossible de la remettre au coffre-fort.
--
--   * étape 1 : le document lié n'est repris que s'il est actif
--     (`and d.deleted_at is null`) ;
--   * insertion : la copie déterministe `<user>/<source>/<ref>.<ext>` existe
--     encore (corbeille, storage_path unique) → `on conflict` la RESTAURE
--     (deleted_at = null) au lieu de renvoyer un document à la corbeille.
-- Le reste est identique à 0360 §6 (search_path vide, quota, service_role seul).
--
-- Ré-exécutable. Rollback : ré-appliquer la fonction de 0360 §6.
-- Tests : tests/sql/scenarios/0410-dossiers.test.mjs (« pièce mise à la corbeille »).
-- =====================================================================

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
      from public.documents d where d.id = v_imp.document_id and d.deleted_at is null;
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
    -- Même copie déterministe déjà présente mais à la corbeille : elle est restaurée À LA RACINE
    -- (folder_id vidé). Sinon une pièce jetée depuis un dossier partagé y reviendrait, visible du
    -- co-parent, alors que l'ajout « sans dossier » est permis coffre verrouillé.
    on conflict (storage_path) do update
      set updated_at = now(), deleted_at = null, folder_id = null
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

comment on function public.vault_add_from_source(uuid, text, text, text, text, text, bigint, text, date, text, text, jsonb, uuid, uuid, uuid) is
  'Ajout idempotent d''un fichier au coffre d''un utilisateur depuis une source (messagerie, témoignage...). Une pièce importée puis mise à la corbeille peut être ré-ajoutée (restaurée) (0430). service_role uniquement.';
