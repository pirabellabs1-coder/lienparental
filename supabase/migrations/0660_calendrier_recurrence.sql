-- =====================================================================
-- Lien Parental — 0660_calendrier_recurrence.sql
-- Événements récurrents du calendrier (RRULE, RFC 5545), occurrences modifiables une à une,
-- statuts, historique des modifications.
--
--   1. calendar_events      + rrule (règle de répétition), tzid (fuseau IANA de la série, heure murale),
--                           status (prévu, confirmé, reporté, annulé, réalisé), occurs_until (fin de la
--                           dernière occurrence, 'infinity' sans fin : lecture par période), series_parent_id
--                           (série scindée par « cet événement et les suivants »).
--                           Les occurrences ne sont JAMAIS stockées : calculées pour la période affichée
--                           (lib/recurrence). Les événements existants restent ponctuels (rrule NULL).
--   2. calendar_event_exceptions  une ligne par occurrence modifiée, déplacée (reportée), annulée ou
--                           supprimée ; clé = début prévu par la règle (occurrence_start).
--   3. calendar_event_audit historique des créations, modifications et suppressions (séries et
--                           occurrences), lisible par l'auteur ; écrit uniquement par trigger.
--   4. Rappels              les séries sortent de notif_enqueue_calendar_reminders (un seul start_at) ;
--                           notif_calendar_recurring_targets fournit au cron Node les séries à développer
--                           (titulaire + parents liés d'une série partagée), qui met en file chaque
--                           occurrence (clé d'idempotence par occurrence, comme les événements ponctuels).
--
-- Participants et partage : inchangés (children_ids + family_shared, RLS 0340/0360) ; seul l'auteur
-- modifie une série ou ses occurrences. Rappel : reminder_minutes (5, 15, 30 min, 1 h, 1 ou 2 jours,
-- la veille à 20 h). Aucune modification automatique d'un planning de garde (garde_configs intact).
-- Idempotente. Rollback en fin de fichier.
-- =====================================================================

-- --- 1. calendar_events ----------------------------------------------------
alter table public.calendar_events add column if not exists rrule text;
alter table public.calendar_events add column if not exists tzid text not null default 'America/Cayenne';
alter table public.calendar_events add column if not exists status text not null default 'prevu';
alter table public.calendar_events add column if not exists occurs_until timestamptz;
alter table public.calendar_events add column if not exists series_parent_id uuid references public.calendar_events(id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_calendar_rrule') then
    alter table public.calendar_events add constraint chk_calendar_rrule
      check (rrule is null or (char_length(rrule) <= 300 and rrule ~ '^(FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)|X-LP-HOLIDAYS=1)(;[A-Z-]+=[A-Za-z0-9,+-]+)*$'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_calendar_tzid') then
    alter table public.calendar_events add constraint chk_calendar_tzid
      check (char_length(tzid) <= 64 and tzid ~ '^(UTC|[A-Za-z]+(/[A-Za-z0-9_+-]+){1,2})$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_calendar_status') then
    alter table public.calendar_events add constraint chk_calendar_status
      check (status in ('prevu', 'confirme', 'reporte', 'annule', 'realise'));
  end if;
end $$;

-- Fin couverte : ponctuel = fin de l'événement ; série = valeur calculée par l'application
-- (COUNT / UNTIL), 'infinity' si la série n'a pas de fin ou si la valeur est incohérente.
create or replace function public.calendar_events_occurs_until()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Fuseau inconnu de PostgreSQL (« Foo/Bar » passe l'expression régulière) : refusé.
  if new.tzid is distinct from 'America/Cayenne' and not exists (select 1 from pg_catalog.pg_timezone_names where name = new.tzid) then
    raise exception 'tzid inconnu' using errcode = '23514';
  end if;
  -- Série parente : uniquement une série du même auteur.
  if new.series_parent_id is not null and not exists (
    select 1 from public.calendar_events p where p.id = new.series_parent_id and p.user_id = new.user_id
  ) then
    new.series_parent_id := null;
  end if;
  if new.rrule is null then
    new.occurs_until := coalesce(new.end_at, new.start_at);
  elsif new.occurs_until is null or new.occurs_until < new.start_at then
    new.occurs_until := 'infinity';
  end if;
  return new;
end;
$$;
revoke all on function public.calendar_events_occurs_until() from public, anon, authenticated;

drop trigger if exists trg_calendar_events_occurs_until on public.calendar_events;
create trigger trg_calendar_events_occurs_until
  before insert or update of rrule, tzid, start_at, end_at, occurs_until, series_parent_id on public.calendar_events
  for each row execute function public.calendar_events_occurs_until();

update public.calendar_events set occurs_until = coalesce(end_at, start_at) where occurs_until is null and rrule is null;

-- Lecture par période : start_at < fin ET occurs_until >= début.
create index if not exists idx_calendar_user_until
  on public.calendar_events(user_id, occurs_until) where deleted_at is null;
create index if not exists idx_calendar_recurring
  on public.calendar_events(occurs_until) where rrule is not null and deleted_at is null;

comment on column public.calendar_events.rrule is
  'Règle de répétition RFC 5545 (sans « RRULE: », DTSTART = start_at dans tzid) ou X-LP-HOLIDAYS (vacances scolaires). NULL = ponctuel (0660).';
comment on column public.calendar_events.tzid is 'Fuseau IANA de l''heure murale de la série (America/Cayenne par défaut) (0660).';
comment on column public.calendar_events.occurs_until is 'Fin de la dernière occurrence (infinity = sans fin), pour lire une période (0660).';

-- --- 2. calendar_event_exceptions ------------------------------------------
create table if not exists public.calendar_event_exceptions (
  id                uuid primary key default gen_random_uuid(),
  event_id          uuid not null references public.calendar_events(id) on delete cascade,
  user_id           uuid not null references public.users(id) on delete cascade,
  occurrence_start  timestamptz not null,
  deleted           boolean not null default false,
  start_at          timestamptz,
  end_at            timestamptz,
  titre             text check (char_length(titre) between 1 and 120),
  lieu              text check (char_length(lieu) <= 200),
  description       text check (char_length(description) <= 500),
  status            text check (status in ('prevu', 'confirme', 'reporte', 'annule', 'realise')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint uq_calendar_exception unique (event_id, occurrence_start),
  constraint chk_calendar_exception_dates check (start_at is null or end_at is null or end_at >= start_at),
  constraint chk_calendar_exception_move check ((start_at is null) = (end_at is null))
);
create index if not exists idx_calendar_exceptions_user on public.calendar_event_exceptions(user_id);

drop trigger if exists trg_calendar_exceptions_updated_at on public.calendar_event_exceptions;
create trigger trg_calendar_exceptions_updated_at
  before update on public.calendar_event_exceptions
  for each row execute function public.handle_updated_at();

alter table public.calendar_event_exceptions enable row level security;
revoke all on table public.calendar_event_exceptions from public, anon, authenticated;
grant select, insert, update, delete on table public.calendar_event_exceptions to authenticated;
grant all on table public.calendar_event_exceptions to service_role;

-- Écriture : l'auteur de la série uniquement.
drop policy if exists calendar_exceptions_owner on public.calendar_event_exceptions;
create policy calendar_exceptions_owner on public.calendar_event_exceptions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.calendar_events e where e.id = event_id and e.user_id = (select auth.uid()) and e.rrule is not null)
  );

-- Lecture : quiconque voit la série (RLS de calendar_events appliquée dans la sous-requête).
drop policy if exists calendar_exceptions_read on public.calendar_event_exceptions;
create policy calendar_exceptions_read on public.calendar_event_exceptions
  for select to authenticated
  using (exists (select 1 from public.calendar_events e where e.id = event_id));

drop policy if exists mfa_required on public.calendar_event_exceptions;
create policy mfa_required on public.calendar_event_exceptions as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));

-- --- 3. calendar_event_audit -----------------------------------------------
create table if not exists public.calendar_event_audit (
  id                bigint generated always as identity primary key,
  event_id          uuid not null references public.calendar_events(id) on delete cascade,
  owner_id          uuid not null references public.users(id) on delete cascade,
  actor_id          uuid,
  action            text not null check (action in ('create', 'update', 'delete', 'occurrence_update', 'occurrence_delete', 'occurrence_restore')),
  occurrence_start  timestamptz,
  changes           jsonb not null default '{}'::jsonb check (jsonb_typeof(changes) = 'object'),
  created_at        timestamptz not null default now()
);
create index if not exists idx_calendar_audit_event on public.calendar_event_audit(event_id, created_at desc);
create index if not exists idx_calendar_audit_owner on public.calendar_event_audit(owner_id);

alter table public.calendar_event_audit enable row level security;
revoke all on table public.calendar_event_audit from public, anon, authenticated;
grant select on table public.calendar_event_audit to authenticated;
grant all on table public.calendar_event_audit to service_role;

drop policy if exists calendar_audit_owner on public.calendar_event_audit;
create policy calendar_audit_owner on public.calendar_event_audit
  for select to authenticated using (owner_id = (select auth.uid()));
drop policy if exists mfa_required on public.calendar_event_audit;
create policy mfa_required on public.calendar_event_audit as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));

-- Champs suivis : valeur avant / après des seuls champs modifiés.
create or replace function public._calendar_diff(p_old jsonb, p_new jsonb, p_keys text[])
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(k, jsonb_build_array(p_old -> k, p_new -> k)), '{}'::jsonb)
    from unnest(p_keys) as k
   where (p_old -> k) is distinct from (p_new -> k);
$$;
revoke all on function public._calendar_diff(jsonb, jsonb, text[]) from public, anon, authenticated;

create or replace function public.calendar_events_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_keys text[] := array['type', 'titre', 'description', 'lieu', 'start_at', 'end_at', 'rrule', 'tzid', 'status',
                         'children_ids', 'family_shared', 'reminder_minutes'];
  v_changes jsonb;
begin
  if tg_op = 'INSERT' then
    insert into public.calendar_event_audit (event_id, owner_id, actor_id, action, changes)
    values (new.id, new.user_id, auth.uid(), 'create',
            jsonb_strip_nulls(jsonb_build_object('start_at', new.start_at, 'rrule', new.rrule, 'tzid', new.tzid)));
    return new;
  end if;
  if new.deleted_at is not null and old.deleted_at is null then
    insert into public.calendar_event_audit (event_id, owner_id, actor_id, action) values (new.id, new.user_id, auth.uid(), 'delete');
    return new;
  end if;
  v_changes := public._calendar_diff(to_jsonb(old), to_jsonb(new), v_keys);
  if v_changes <> '{}'::jsonb then
    insert into public.calendar_event_audit (event_id, owner_id, actor_id, action, changes)
    values (new.id, new.user_id, auth.uid(), 'update', v_changes);
  end if;
  return new;
end;
$$;
revoke all on function public.calendar_events_audit() from public, anon, authenticated;

drop trigger if exists trg_calendar_events_audit on public.calendar_events;
create trigger trg_calendar_events_audit
  after insert or update on public.calendar_events
  for each row execute function public.calendar_events_audit();

create or replace function public.calendar_exceptions_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_keys text[] := array['deleted', 'start_at', 'end_at', 'titre', 'lieu', 'description', 'status'];
  r public.calendar_event_exceptions;
  v_action text;
begin
  r := case when tg_op = 'DELETE' then old else new end;
  -- Série supprimée définitivement (compte effacé) : rien à tracer.
  if not exists (select 1 from public.calendar_events e where e.id = r.event_id) then
    return null;
  end if;
  v_action := case
    when tg_op = 'DELETE' then 'occurrence_restore'
    when new.deleted then 'occurrence_delete'
    else 'occurrence_update' end;
  insert into public.calendar_event_audit (event_id, owner_id, actor_id, action, occurrence_start, changes)
  values (r.event_id, r.user_id, auth.uid(), v_action, r.occurrence_start,
          case when tg_op = 'DELETE' then '{}'::jsonb
               when tg_op = 'INSERT' then public._calendar_diff('{}'::jsonb, to_jsonb(new), v_keys)
               else public._calendar_diff(to_jsonb(old), to_jsonb(new), v_keys) end);
  return null;
end;
$$;
revoke all on function public.calendar_exceptions_audit() from public, anon, authenticated;

drop trigger if exists trg_calendar_exceptions_audit on public.calendar_event_exceptions;
create trigger trg_calendar_exceptions_audit
  after insert or update or delete on public.calendar_event_exceptions
  for each row execute function public.calendar_exceptions_audit();

-- --- 4. Rappels -------------------------------------------------------------
-- Événements ponctuels : comportement 0440 inchangé ; les séries (rrule non NULL) en sont exclues.
create or replace function public.notif_enqueue_calendar_reminders(p_limit integer default 200)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_count integer := 0;
  v_limit integer := greatest(1, least(coalesce(p_limit, 200), 1000));
  v_max   integer;
begin
  for r in
    select e.id, e.user_id, e.start_at
      from public.calendar_events e
     where e.deleted_at is null
       and e.rrule is null
       and e.reminder_sent_at is null
       and e.reminder_minutes is not null
       and e.start_at > now() - interval '10 minutes'
       and e.start_at <= now() + interval '29 days'
       and e.start_at - make_interval(mins => least(e.reminder_minutes, 40320)) <= now()
     order by e.start_at
     limit v_limit
     for update of e skip locked
  loop
    update public.calendar_events set reminder_sent_at = now() where id = r.id;
    perform public._notif_enqueue(
      r.user_id, 'calendar_reminder',
      jsonb_build_object('event_id', r.id, 'start_at', r.start_at),
      format('calendar_reminder:%s:%s:%s', r.id, r.user_id, floor(extract(epoch from r.start_at))::bigint),
      now(), null, null);
    v_count := v_count + 1;
  end loop;

  select least(40320, coalesce(max(greatest(
           p.rappel_defaut_min,
           coalesce((select max(v.val::int) from jsonb_each_text(p.rappels_par_type) v(key, val) where v.val ~ '^\d{1,5}$'), 0)
         )), 0))
    into v_max
    from public.preferences p
   where p.notif_rappels;

  for r in
    select e.id, e.start_at, rcp.uid
      from public.calendar_events e
      cross join lateral (select public._notif_family_parents(e.user_id, e.children_ids) as uid) rcp
      join public.preferences p on p.user_id = rcp.uid and p.notif_rappels
      cross join lateral (
        select case when (p.rappels_par_type ->> e.type::text) ~ '^\d{1,5}$'
                    then least((p.rappels_par_type ->> e.type::text)::int, 40320)
                    else p.rappel_defaut_min end as mins
      ) m
     where e.family_shared
       and e.deleted_at is null
       and e.rrule is null
       and e.start_at > now() - interval '10 minutes'
       and e.start_at <= now() + make_interval(mins => v_max)
       and e.start_at - make_interval(mins => m.mins) <= now()
       and not exists (
         select 1 from public.notification_jobs j
          where j.dedupe_key = format('calendar_reminder:%s:%s:%s', e.id, rcp.uid, floor(extract(epoch from e.start_at))::bigint)
       )
     order by e.start_at
     limit v_limit
  loop
    perform public._notif_enqueue(
      r.uid, 'calendar_reminder',
      jsonb_build_object('event_id', r.id, 'start_at', r.start_at),
      format('calendar_reminder:%s:%s:%s', r.id, r.uid, floor(extract(epoch from r.start_at))::bigint),
      now(), null, null);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.notif_enqueue_calendar_reminders(integer) from public, anon, authenticated;
grant execute on function public.notif_enqueue_calendar_reminders(integer) to service_role;

-- Séries en cours et destinataires de leurs rappels (délai en minutes) : le cron développe chaque
-- série sur les prochains jours et met en file les occurrences dont le rappel est échu.
create or replace function public.notif_calendar_recurring_targets(p_limit integer default 2000)
returns table (event_id uuid, user_id uuid, mins integer, start_at timestamptz, end_at timestamptz, rrule text, tzid text)
language sql
stable
security definer
set search_path = ''
as $$
  select * from (
    select e.id, e.user_id, least(e.reminder_minutes, 40320), e.start_at, e.end_at, e.rrule, e.tzid
      from public.calendar_events e
     where e.rrule is not null
       and e.deleted_at is null
       and e.reminder_minutes is not null
       and e.occurs_until > now() - interval '10 minutes'
       and e.start_at <= now() + interval '29 days'
    union all
    select e.id, rcp.uid, m.mins, e.start_at, e.end_at, e.rrule, e.tzid
      from public.calendar_events e
      cross join lateral (select public._notif_family_parents(e.user_id, e.children_ids) as uid) rcp
      join public.preferences p on p.user_id = rcp.uid and p.notif_rappels
      cross join lateral (
        select case when (p.rappels_par_type ->> e.type::text) ~ '^\d{1,5}$'
                    then least((p.rappels_par_type ->> e.type::text)::int, 40320)
                    else p.rappel_defaut_min end as mins
      ) m
     where e.family_shared
       and e.rrule is not null
       and e.deleted_at is null
       and e.occurs_until > now() - interval '10 minutes'
       and e.start_at <= now() + make_interval(mins => m.mins)
  ) t
  order by t.start_at, t.id
  limit greatest(1, least(coalesce(p_limit, 2000), 5000));
$$;

-- Conservation de l'historique : 24 mois (minimisation, RGPD art. 5). Appelée par le cron des notifications.
create or replace function public.calendar_audit_purge()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v integer;
begin
  delete from public.calendar_event_audit where created_at < now() - interval '24 months';
  get diagnostics v = row_count;
  return v;
end;
$$;
revoke all on function public.calendar_audit_purge() from public, anon, authenticated;
grant execute on function public.calendar_audit_purge() to service_role;
revoke all on function public.notif_calendar_recurring_targets(integer) from public, anon, authenticated;
grant execute on function public.notif_calendar_recurring_targets(integer) to service_role;

-- =====================================================================
-- Rollback (manuel, dans l'ordre) :
-- drop function if exists public.calendar_audit_purge();
-- drop function if exists public.notif_calendar_recurring_targets(integer);
-- ré-appliquer notif_enqueue_calendar_reminders de 0440 ;
-- drop trigger if exists trg_calendar_exceptions_audit on public.calendar_event_exceptions;
-- drop trigger if exists trg_calendar_events_audit on public.calendar_events;
-- drop function if exists public.calendar_exceptions_audit(); drop function if exists public.calendar_events_audit();
-- drop function if exists public._calendar_diff(jsonb, jsonb, text[]);
-- drop table if exists public.calendar_event_audit; drop table if exists public.calendar_event_exceptions;
-- drop trigger if exists trg_calendar_events_occurs_until on public.calendar_events;
-- drop function if exists public.calendar_events_occurs_until();
-- alter table public.calendar_events drop column if exists series_parent_id, drop column if exists occurs_until,
--   drop column if exists status, drop column if exists tzid, drop column if exists rrule;
-- =====================================================================
