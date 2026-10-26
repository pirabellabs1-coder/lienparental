-- =====================================================================
-- Lien Parental — storage.sql
-- Buckets Supabase Storage et policies RLS associées.
--
-- Règle d'or : tous les buckets sont PRIVÉS. L'accès client passe
-- exclusivement par des URLs signées (createSignedUrl) de 15 minutes.
-- =====================================================================

-- --- Buckets ----------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('documents', 'documents', false, 10485760,  -- 10 Mo / fichier
    array['application/pdf','image/jpeg','image/png','image/webp','image/heic',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'text/plain']),
  ('avatars', 'avatars', false, 2097152,       -- 2 Mo / avatar
    array['image/jpeg','image/png','image/webp']),
  ('temoignage-attachments', 'temoignage-attachments', false, 10485760,
    array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Rétention : les objets du bucket "temoignage-attachments" ont une
-- durée de vie de 30 jours (lifecycle). Un job cron supprime les objets
-- dont le testimony associé a plus de 30 jours ET où le témoignage a
-- été envoyé (texte conservé, pièces jointes purgées pour minimisation).
-- → voir docs/SECURITY.md section "Rétention des données".


-- =====================================================================
-- Policies RLS Storage
-- Convention de nommage des chemins : <bucket>/<user_id>/<uuid>.<ext>
-- → le premier segment du path = user_id, utilisé pour la policy.
-- =====================================================================

-- --- documents : propriétaire uniquement ------------------------------
drop policy if exists "documents owner select" on storage.objects;
create policy "documents owner select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "documents owner insert" on storage.objects;
create policy "documents owner insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "documents owner update" on storage.objects;
create policy "documents owner update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "documents owner delete" on storage.objects;
create policy "documents owner delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );


-- --- avatars : propriétaire uniquement --------------------------------
drop policy if exists "avatars owner select" on storage.objects;
create policy "avatars owner select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars owner write" on storage.objects;
create policy "avatars owner write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars owner update" on storage.objects;
create policy "avatars owner update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars owner delete" on storage.objects;
create policy "avatars owner delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );


-- --- temoignage-attachments ------------------------------------------
-- UPLOAD par témoin anonyme autorisé via service_role côté serveur
-- (chemin: temoignage-attachments/<request_id>/<uuid>.<ext>). Aucun
-- client (anon ou authenticated) ne peut y accéder directement : la
-- lecture par le parent se fait via URL signée 15 min émise serveur.
-- Donc : AUCUNE policy pour anon/authenticated → tout passe par service_role.

-- Note : les téléchargements se font exclusivement via createSignedUrl
-- côté serveur, après vérification des droits et du token.
