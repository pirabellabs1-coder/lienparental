-- =====================================================================
-- Lien Parental — 0530_album.sql
-- Album de l'enfant (V1) dans le coffre-fort : les photos SONT des
-- documents (bucket privé `documents`, mêmes politiques RLS / Storage,
-- même corbeille 30 jours, même verrou du coffre). Cette migration ajoute
-- seulement deux métadonnées de classement :
--
--   1. documents.album     : album thématique (école, vacances…) ;
--   2. documents.important : « moment important » (mis en avant) ;
--   3. droits de mise à jour colonne par colonne (règle 0270) ;
--   4. index de la chronologie (photos actives, par date).
--
-- Partage : inchangé. Une photo est privée par défaut ; « Partagée avec
-- l'autre parent » = documents.family_shared (0340) : lecture et
-- téléchargement par les gardiens `parent` d'un enfant commun, jamais par
-- un proche, jamais de modification. Le propriétaire reste seul à pouvoir
-- renommer, reclasser, mettre en corbeille ou supprimer (politiques 0004 /
-- 0101 / 0270 inchangées).
--
-- Déploiement : appliquer AVANT le code de l'album. Le reste du coffre ne
-- lit pas ces colonnes : il fonctionne avec ou sans cette migration.
-- =====================================================================

alter table public.documents add column if not exists album text;
alter table public.documents add column if not exists important boolean not null default false;
-- Vignette (480 px, JPEG sans métadonnées) générée dans le navigateur à l'ajout d'une photo.
alter table public.documents add column if not exists thumb_path text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_documents_album') then
    alter table public.documents
      add constraint chk_documents_album
      check (album is null or album in ('ecole', 'vacances', 'anniversaires', 'famille', 'activites', 'sante', 'autre'));
  end if;
  -- La vignette est TOUJOURS dans le dossier du propriétaire : sans cette règle, un utilisateur
  -- pourrait désigner le fichier privé d'un autre et l'exposer via un partage (politiques § 3).
  if not exists (select 1 from pg_constraint where conname = 'chk_documents_thumb_path') then
    alter table public.documents
      add constraint chk_documents_thumb_path
      check (
        thumb_path is null
        or (
          starts_with(thumb_path, user_id::text || '/')
          and char_length(thumb_path) between 38 and 1024
          and position('..' in thumb_path) = 0
          and position('//' in thumb_path) = 0
          and thumb_path !~ '[[:cntrl:]\\]'
        )
      );
  end if;
end $$;

-- 0270 : le privilège UPDATE de `documents` est accordé colonne par colonne.
grant update (album, important) on table public.documents to authenticated;

-- Chronologie de l'album : photos actives d'un propriétaire, les plus récentes d'abord.
create index if not exists idx_documents_album_timeline
  on public.documents(user_id, doc_date desc)
  where deleted_at is null and mime like 'image/%';

-- ---------------------------------------------------------------------
-- 3. Storage : la vignette d'une photo partagée suit EXACTEMENT les droits
--    du fichier principal. Reprise à l'identique de 0360 § 8 (famille) et
--    0410 § 4 (dossier partagé), avec `or d.thumb_path = name` en plus.
--    La politique restrictive « documents vault unlocked » (0370) s'applique
--    toujours : coffre déverrouillé exigé.
-- ---------------------------------------------------------------------
drop policy if exists "documents family select" on storage.objects;
create policy "documents family select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(storage.objects.name))[1] <> auth.uid()::text
    and (
      exists (select 1 from public.documents d
               where (d.storage_path = storage.objects.name or d.thumb_path = storage.objects.name)
                 and d.family_shared and d.deleted_at is null)
      or exists (select 1 from public.journal_expenses je
                  where je.family_shared
                    and (
                      (je.justificatif is not null and (je.justificatif ->> 'path') = storage.objects.name)
                      or je.justificatifs_extra @> jsonb_build_array(jsonb_build_object('path', storage.objects.name))
                    ))
    )
  );

drop policy if exists "documents folder share select" on storage.objects;
create policy "documents folder share select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(storage.objects.name))[1] <> auth.uid()::text
    and exists (
      select 1 from public.documents d
       where (d.storage_path = storage.objects.name or d.thumb_path = storage.objects.name)
         and d.deleted_at is null
         and d.folder_id = any ((select public.vault_shared_folder_ids())::uuid[])
    )
  );

comment on column public.documents.thumb_path is
  'Vignette d''une photo (même dossier Storage que storage_path, mêmes droits de lecture).';
comment on column public.documents.album is
  'Album thématique d''une photo (ecole, vacances, anniversaires, famille, activites, sante, autre) ; null = sans album.';
comment on column public.documents.important is
  'Moment important : photo mise en avant dans l''album de l''enfant.';

-- ---------------------------------------------------------------------
-- Retour arrière (à exécuter à la main si nécessaire) :
-- (ré-appliquer "documents family select" de 0360 § 8 et "documents folder share select" de 0410 § 4)
-- alter table public.documents drop constraint if exists chk_documents_thumb_path;
-- alter table public.documents drop column if exists thumb_path;
-- drop index if exists public.idx_documents_album_timeline;
-- revoke update (album, important) on table public.documents from authenticated;
-- alter table public.documents drop constraint if exists chk_documents_album;
-- alter table public.documents drop column if exists important;
-- alter table public.documents drop column if exists album;
-- ---------------------------------------------------------------------
