-- =====================================================================
-- Lien Parental — 0560_quota_stockage.sql
-- Quota de stockage par offre, appliqué EN BASE (le client ne peut pas le contourner).
--
--   1. storage_quota_bytes(plan) : 2 Go (free), 10 Go (premium), 25 Go (coparentalite),
--      miroir de PRICING.storage (lib/billing) ;
--   2. storage_used_bytes(user) : documents (corbeille comprise, elle occupe la place
--      jusqu'à la purge) + vignettes de l'album (taille réelle lue dans storage.objects) ;
--   3. documents_quota_guard : avant chaque insertion, la taille déclarée est remplacée
--      par la taille RÉELLE de l'objet Storage quand elle est connue, puis l'insertion
--      est refusée au-delà du quota de l'offre effective (errcode 54000, hint
--      'storage_quota'). Couvre aussi les insertions des fonctions serveur (import,
--      enregistrement d'une pièce jointe dans le coffre).
--   4. my_storage_usage() : usage et quota de l'utilisateur connecté (alertes 80 % / 100 %).
-- Idempotente. Rollback en fin de fichier.
-- =====================================================================

create or replace function public.storage_quota_bytes(p_plan text)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select (case p_plan when 'coparentalite' then 25 when 'premium' then 10 else 2 end)::bigint * 1073741824;
$$;
revoke all on function public.storage_quota_bytes(text) from public, anon;
grant execute on function public.storage_quota_bytes(text) to authenticated, service_role;

create or replace function public.storage_used_bytes(p_user_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select sum(d.size_bytes) from public.documents d where d.user_id = p_user_id), 0)
       + coalesce((select sum(coalesce((o.metadata->>'size')::bigint, 0))
                     from public.documents d
                     join storage.objects o on o.bucket_id = 'documents' and o.name = d.thumb_path
                    where d.user_id = p_user_id and d.thumb_path is not null), 0);
$$;
revoke all on function public.storage_used_bytes(uuid) from public, anon, authenticated;
grant execute on function public.storage_used_bytes(uuid) to service_role;

create or replace function public.documents_quota_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_real  bigint;
  v_thumb bigint := 0;
  v_used  bigint;
  v_quota bigint;
begin
  -- Taille réelle du fichier déposé (la taille déclarée par le client n'est pas une preuve).
  select (o.metadata->>'size')::bigint into v_real
    from storage.objects o where o.bucket_id = 'documents' and o.name = new.storage_path;
  if v_real is not null and v_real > new.size_bytes then
    new.size_bytes := v_real;
  end if;
  if new.thumb_path is not null then
    select coalesce((o.metadata->>'size')::bigint, 0) into v_thumb
      from storage.objects o where o.bucket_id = 'documents' and o.name = new.thumb_path;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('storage:' || new.user_id::text, 0));
  v_used := public.storage_used_bytes(new.user_id);
  v_quota := public.storage_quota_bytes(public.effective_plan(new.user_id));
  if v_used + new.size_bytes + coalesce(v_thumb, 0) > v_quota then
    raise exception 'Espace de stockage de l''offre atteint' using errcode = '54000', hint = 'storage_quota';
  end if;
  return new;
end;
$$;
revoke all on function public.documents_quota_guard() from public, anon, authenticated;

drop trigger if exists trg_documents_quota on public.documents;
create trigger trg_documents_quota
  before insert on public.documents
  for each row execute function public.documents_quota_guard();

-- Usage de l'utilisateur connecté (lecture seule, ses propres chiffres uniquement).
create or replace function public.my_storage_usage()
returns table (used_bytes bigint, quota_bytes bigint, plan text)
language sql
stable
security definer
set search_path = ''
as $$
  select public.storage_used_bytes(u.id), public.storage_quota_bytes(public.effective_plan(u.id)), public.effective_plan(u.id)
    from public.users u where u.id = (select auth.uid());
$$;
revoke all on function public.my_storage_usage() from public, anon;
grant execute on function public.my_storage_usage() to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Retour arrière :
-- drop trigger if exists trg_documents_quota on public.documents;
-- drop function if exists public.documents_quota_guard();
-- drop function if exists public.my_storage_usage();
-- drop function if exists public.storage_used_bytes(uuid);
-- drop function if exists public.storage_quota_bytes(text);
-- ---------------------------------------------------------------------
