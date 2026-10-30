-- =====================================================================
-- 0590 — Photo de l'enfant visible par l'autre parent.
--
-- La photo est rangée dans le bucket privé « avatars » sous le dossier du
-- titulaire de la fiche (`<uid>/child-<id>.jpg`, 0580). La policy « avatars
-- owner select » (storage.sql) ne laisse lire que ce titulaire : l'autre
-- parent voyait la fiche mais pas la photo (URL signée refusée).
--
-- Lecture ajoutée : un objet « avatars » est lisible s'il est la photo
-- (children.photo_url) d'un enfant de ma famille côté parent — mêmes enfants
-- que la policy children_select_family (my_family_child_ids(true)) : les
-- proches n'y ont pas accès. Lecture seule ; l'envoi reste au titulaire.
-- La contrainte 0580 garantit que photo_url pointe dans le dossier du
-- titulaire : aucun autre fichier du bucket n'est exposé.
--
-- Pré-requis : storage.sql, 0340 (my_family_child_ids), 0580. Idempotente.
-- Rollback : bloc commenté en fin de fichier.
-- =====================================================================

drop policy if exists "avatars child photo family select" on storage.objects;
create policy "avatars child photo family select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and exists (
      select 1
        from public.children c
       where c.photo_url = objects.name
         and c.deleted_at is null
         and c.id = any ((select public.my_family_child_ids(true))::uuid[])
    )
  );

-- ROLLBACK (manuel)
-- drop policy if exists "avatars child photo family select" on storage.objects;
