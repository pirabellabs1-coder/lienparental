-- =====================================================================
-- 0580 — Photo de l'enfant : chemin de stockage contraint.
--
-- La photo de l'enfant est envoyée dans le bucket privé « avatars » sous
-- `<uid du titulaire>/child-<id>.jpg` (lib/data/children.ts) et son chemin
-- est enregistré dans public.children.photo_url, puis affiché par URL signée.
-- Comme pour la photo du parent (chk_users_photo_url_owner, 0360), le chemin
-- doit appartenir au dossier du titulaire de la fiche : une valeur pointant
-- vers le dossier d'un autre compte (ou contenant « .. ») est refusée.
-- Les anciennes valeurs « https://… » restent admises (aucune en base au
-- moment de la migration, mais elles ne pointent pas vers le stockage privé).
--
-- Pré-requis : 0002 (children.photo_url), 0340 (seul le titulaire modifie
-- photo_url). Idempotente. Rollback : bloc commenté en fin de fichier.
-- =====================================================================

alter table public.children drop constraint if exists chk_children_photo_url_owner;
alter table public.children add constraint chk_children_photo_url_owner
  check (
    photo_url is null
    or photo_url ~ '^https://'
    or (starts_with(photo_url, user_id::text || '/') and position('..' in photo_url) = 0)
  ) not valid;

-- Données existantes vérifiées (aucune valeur hors règle) : contrainte validée.
alter table public.children validate constraint chk_children_photo_url_owner;

-- ROLLBACK (manuel)
-- alter table public.children drop constraint if exists chk_children_photo_url_owner;
