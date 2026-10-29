-- =====================================================================
-- 0570 — Signalement des témoignages reçus.
--
-- Un témoignage reçu est IRRÉVERSIBLE : ni le témoin ni le parent ne
-- peuvent le supprimer (valeur probante, cf. 0005 et 0100 : aucune
-- policy DELETE sur public.testimonies). Seule voie de retrait : le parent
-- signale le témoignage (motif + précisions) ; un administrateur examine
-- le signalement puis le rejette ou supprime le témoignage.
--
-- - Table public.testimony_reports : une ligne par signalement, conservée
--   après la suppression du témoignage (testimony_id passe à NULL, la
--   référence TMG-… et le compte concerné restent pour l'historique).
-- - Écritures UNIQUEMENT par fonctions SECURITY DEFINER :
--     report_testimony()                  parent propriétaire du témoignage
--     admin_list_testimony_reports()      administrateur (aal2)
--     admin_decide_testimony_report()     administrateur (aal2)
-- - Minimisation (règle 0400) : l'administrateur ne lit JAMAIS le contenu
--   du témoignage (texte, réponses, témoin, pièces). Il voit le motif et
--   les précisions écrites par le parent pour l'équipe, la référence et
--   les dates. Les chemins des pièces jointes sont renvoyés à la route
--   serveur uniquement pour effacer les fichiers après une suppression.
-- - Audit : chaque signalement et chaque décision est journalisé dans
--   public.audit_log, dans la même transaction (sans texte libre).
--
-- Pré-requis : 0005, 0007 (audit_log), 0100, 0210 (testimony_reviews),
-- 0400 (admin_ops_assert, actor_id).
-- Idempotente (rejouable). Rollback : bloc commenté en fin de fichier.
-- =====================================================================


-- =====================================================================
-- 1. TABLE
-- =====================================================================
create table if not exists public.testimony_reports (
  id            uuid primary key default gen_random_uuid(),
  -- NULL une fois le témoignage supprimé à l'issue du signalement.
  testimony_id  uuid references public.testimonies(id) on delete set null,
  reference     text not null,
  owner_id      uuid not null references public.users(id) on delete cascade,
  reporter_id   uuid not null references public.users(id) on delete cascade,
  reason_code   text not null,
  details       text,
  status        text not null default 'open',
  decision_note text,
  decided_by    uuid references auth.users(id) on delete set null,
  decided_at    timestamptz,
  created_at    timestamptz not null default now()
);

alter table public.testimony_reports drop constraint if exists chk_testimony_reports_reason;
alter table public.testimony_reports add constraint chk_testimony_reports_reason
  check (reason_code in ('test', 'erreur', 'faux', 'abus', 'doublon', 'autre'));

alter table public.testimony_reports drop constraint if exists chk_testimony_reports_details;
alter table public.testimony_reports add constraint chk_testimony_reports_details
  check (details is null or length(details) between 1 and 1000);

alter table public.testimony_reports drop constraint if exists chk_testimony_reports_status;
alter table public.testimony_reports add constraint chk_testimony_reports_status
  check (status in ('open', 'rejected', 'removed'));

alter table public.testimony_reports drop constraint if exists chk_testimony_reports_note;
alter table public.testimony_reports add constraint chk_testimony_reports_note
  check (decision_note is null or length(decision_note) between 1 and 500);

alter table public.testimony_reports drop constraint if exists chk_testimony_reports_decided;
alter table public.testimony_reports add constraint chk_testimony_reports_decided
  check ((status = 'open') = (decided_at is null));

-- Un seul signalement en cours par témoignage.
create unique index if not exists uq_testimony_reports_open
  on public.testimony_reports(testimony_id) where status = 'open';
create index if not exists idx_testimony_reports_status
  on public.testimony_reports(status, created_at desc);
create index if not exists idx_testimony_reports_reporter
  on public.testimony_reports(reporter_id, created_at desc);

comment on table public.testimony_reports is
  'Signalements de témoignages reçus (0570). Lecture : auteur du signalement et administrateurs ; écriture par fonctions uniquement.';


-- =====================================================================
-- 2. RLS : l'auteur lit ses signalements, l'administrateur lit tout,
--    aucune écriture directe.
-- =====================================================================
alter table public.testimony_reports enable row level security;

drop policy if exists testimony_reports_select_own on public.testimony_reports;
create policy testimony_reports_select_own on public.testimony_reports
  for select to authenticated
  using (reporter_id = (select auth.uid()));

drop policy if exists testimony_reports_select_admin on public.testimony_reports;
create policy testimony_reports_select_admin on public.testimony_reports
  for select to authenticated
  using ((select public.is_admin_aal2()));

revoke all on table public.testimony_reports from anon;
revoke insert, update, delete, truncate on table public.testimony_reports from authenticated;
grant select on table public.testimony_reports to authenticated;


-- =====================================================================
-- 3. SIGNALER (parent propriétaire du témoignage)
-- =====================================================================
create or replace function public.report_testimony(
  p_testimony_id uuid,
  p_reason       text,
  p_details      text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_t       record;
  v_id      uuid;
  v_details text := nullif(btrim(coalesce(p_details, '')), '');
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_reason is null or p_reason not in ('test', 'erreur', 'faux', 'abus', 'doublon', 'autre') then
    raise exception 'invalid reason' using errcode = '22023';
  end if;
  if v_details is not null and length(v_details) > 1000 then
    raise exception 'details too long' using errcode = '22023';
  end if;
  if p_reason = 'autre' and v_details is null then
    raise exception 'details required' using errcode = '22023';
  end if;

  -- Seul le parent destinataire peut signaler (même règle que la lecture, 0100).
  select t.id, t.reference, t.user_id into v_t
    from public.testimonies t
   where t.id = p_testimony_id and t.user_id = v_uid;
  if not found then
    raise exception 'testimony not found' using errcode = 'P0002';
  end if;

  -- Un signalement déjà en cours : on le renvoie (pas de doublon).
  select r.id into v_id
    from public.testimony_reports r
   where r.testimony_id = v_t.id and r.status = 'open';
  if found then
    return v_id;
  end if;

  insert into public.testimony_reports (testimony_id, reference, owner_id, reporter_id, reason_code, details)
  values (v_t.id, v_t.reference, v_t.user_id, v_uid, p_reason, v_details)
  returning id into v_id;

  insert into public.audit_log (user_id, actor_id, actor_type, action, entity, entity_id, metadata)
  values (v_uid, v_uid, 'user', 'testimony.report', 'testimony_reports', v_id::text,
          jsonb_build_object('reason', p_reason));
  return v_id;
end;
$$;

revoke all on function public.report_testimony(uuid, text, text) from public, anon;
grant execute on function public.report_testimony(uuid, text, text) to authenticated;


-- =====================================================================
-- 4. ADMINISTRATION : liste et décision
-- =====================================================================
create or replace function public.admin_list_testimony_reports(
  p_status text default 'open',
  p_limit  integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := public.admin_ops_assert();
begin
  if p_status is not null and p_status not in ('open', 'rejected', 'removed') then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select r.id, r.testimony_id, r.reference, r.owner_id, r.reporter_id, r.reason_code, r.details,
               r.status, r.decision_note, r.decided_at, r.created_at
          from public.testimony_reports r
         where p_status is null or r.status = p_status
         order by r.created_at desc
         limit least(greatest(coalesce(p_limit, 100), 1), 200)
      ) x
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.admin_list_testimony_reports(text, integer) from public, anon;
grant execute on function public.admin_list_testimony_reports(text, integer) to authenticated;


-- Décision : 'rejected' (le témoignage reste) ou 'removed' (le témoignage est
-- supprimé ; ses avis 0210 suivent par cascade). Renvoie les chemins des pièces
-- jointes à effacer du stockage par la route serveur.
create or replace function public.admin_decide_testimony_report(
  p_report_id uuid,
  p_decision  text,
  p_note      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := public.admin_ops_assert();
  v_r     public.testimony_reports;
  v_note  text := nullif(btrim(coalesce(p_note, '')), '');
  v_paths jsonb := '[]'::jsonb;
begin
  if p_decision is null or p_decision not in ('rejected', 'removed') then
    raise exception 'invalid decision' using errcode = '22023';
  end if;
  if v_note is not null and length(v_note) > 500 then
    raise exception 'note too long' using errcode = '22023';
  end if;

  select * into v_r from public.testimony_reports where id = p_report_id for update;
  if not found then
    raise exception 'report not found' using errcode = 'P0002';
  end if;
  if v_r.status <> 'open' then
    raise exception 'report already decided' using errcode = '22023';
  end if;

  if p_decision = 'removed' and v_r.testimony_id is not null then
    select coalesce(jsonb_agg(a ->> 'path') filter (where a ->> 'path' is not null), '[]'::jsonb)
      into v_paths
      from public.testimonies t, jsonb_array_elements(coalesce(t.attachments, '[]'::jsonb)) a
     where t.id = v_r.testimony_id;

    -- Décision enregistrée AVANT la suppression (testimony_id passe ensuite à NULL).
    update public.testimony_reports
       set status = 'removed', decided_by = v_actor, decided_at = now(), decision_note = v_note
     where id = v_r.id;
    delete from public.testimonies where id = v_r.testimony_id;
  else
    update public.testimony_reports
       set status = p_decision, decided_by = v_actor, decided_at = now(), decision_note = v_note
     where id = v_r.id;
  end if;

  insert into public.audit_log (user_id, actor_id, actor_type, action, entity, entity_id, metadata)
  values (v_r.owner_id, v_actor, 'admin',
          case when p_decision = 'removed' then 'admin.testimony.remove' else 'admin.testimony.report_reject' end,
          'testimony_reports', v_r.id::text,
          jsonb_build_object('reason', v_r.reason_code, 'reference', v_r.reference));

  return jsonb_build_object('status', p_decision, 'attachments', v_paths);
end;
$$;

revoke all on function public.admin_decide_testimony_report(uuid, text, text) from public, anon;
grant execute on function public.admin_decide_testimony_report(uuid, text, text) to authenticated;


-- =====================================================================
-- ROLLBACK (manuel)
-- =====================================================================
-- drop function if exists public.admin_decide_testimony_report(uuid, text, text);
-- drop function if exists public.admin_list_testimony_reports(text, integer);
-- drop function if exists public.report_testimony(uuid, text, text);
-- drop table if exists public.testimony_reports;
