-- =====================================================================
-- Lien Parental — 0620_attribution_inscriptions.sql
-- Attribution des inscriptions aux campagnes (UTM) : quel contenu ou quelle publicité a amené
-- un compte, puis un abonnement payant (cahier d'automatisation V5, AC-09).
--
--   1. signup_attributions : premier et dernier contact de campagne d'un compte (1 ligne max),
--      sans identifiant publicitaire ; aucune lecture directe (administration via fonction).
--   2. record_signup_attribution(p_attr) : appelée par le middleware pour l'utilisateur connecté
--      qui porte le cookie lp_attr ; n'enregistre que pour un compte créé depuis moins de
--      48 heures (un compte existant qui clique une publicité n'est pas une inscription).
--   3. admin_acquisition_report(from, to, model) : inscriptions, abonnés payants et revenus
--      encaissés par source / support / campagne / contenu, dernier ou premier contact.
-- Idempotente. Rollback en fin de fichier.
-- =====================================================================

create table if not exists public.signup_attributions (
  user_id         uuid primary key references public.users(id) on delete cascade,
  first_source    text not null,
  first_medium    text,
  first_campaign  text,
  first_content   text,
  first_term      text,
  first_landing   text,
  first_referrer  text,
  first_at        timestamptz,
  last_source     text not null,
  last_medium     text,
  last_campaign   text,
  last_content    text,
  last_term       text,
  last_landing    text,
  last_referrer   text,
  last_at         timestamptz,
  recorded_at     timestamptz not null default now()
);
create index if not exists signup_attributions_recorded_idx on public.signup_attributions (recorded_at);

alter table public.signup_attributions enable row level security;
revoke all on table public.signup_attributions from public, anon, authenticated;
grant select, insert on table public.signup_attributions to service_role;

-- Valeur de campagne nettoyée (même règle que lib/attribution/core.ts) : 100 caractères au plus.
create or replace function public._attr_clean(p text, p_max integer default 100)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(left(btrim(regexp_replace(coalesce(p, ''), '[^[:alnum:] _.+~:|/-]', '', 'g')), p_max), '');
$$;
revoke all on function public._attr_clean(text, integer) from public, anon, authenticated;

create or replace function public._attr_ts(p jsonb)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(p) = 'number' and (p::text)::numeric between 1500000000 and 4000000000
              then to_timestamp((p::text)::numeric) end;
$$;
revoke all on function public._attr_ts(jsonb) from public, anon, authenticated;

create or replace function public.record_signup_attribution(p_attr jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_created timestamptz;
  f jsonb := p_attr -> 'f';
  l jsonb := p_attr -> 'l';
  v_rows    integer;
begin
  if v_uid is null then return 'anonymous'; end if;
  if jsonb_typeof(f) is distinct from 'object' or jsonb_typeof(l) is distinct from 'object'
     or public._attr_clean(f ->> 's') is null or public._attr_clean(l ->> 's') is null then
    return 'invalid';
  end if;
  select u.created_at into v_created from public.users u where u.id = v_uid;
  if v_created is null or v_created < now() - interval '48 hours' then return 'not_new'; end if;

  insert into public.signup_attributions (
    user_id,
    first_source, first_medium, first_campaign, first_content, first_term, first_landing, first_referrer, first_at,
    last_source, last_medium, last_campaign, last_content, last_term, last_landing, last_referrer, last_at
  ) values (
    v_uid,
    public._attr_clean(f ->> 's'), public._attr_clean(f ->> 'm'), public._attr_clean(f ->> 'c'), public._attr_clean(f ->> 't'),
    public._attr_clean(f ->> 'k'), public._attr_clean(f ->> 'p', 200), public._attr_clean(f ->> 'r'), public._attr_ts(f -> 'at'),
    public._attr_clean(l ->> 's'), public._attr_clean(l ->> 'm'), public._attr_clean(l ->> 'c'), public._attr_clean(l ->> 't'),
    public._attr_clean(l ->> 'k'), public._attr_clean(l ->> 'p', 200), public._attr_clean(l ->> 'r'), public._attr_ts(l -> 'at')
  )
  on conflict (user_id) do nothing;
  get diagnostics v_rows = row_count;
  return case when v_rows = 1 then 'recorded' else 'duplicate' end;
end;
$$;
revoke all on function public.record_signup_attribution(jsonb) from public, anon;
grant execute on function public.record_signup_attribution(jsonb) to authenticated;

-- Rapport d'acquisition (administration) : comptes créés sur la période, regroupés par campagne.
create or replace function public.admin_acquisition_report(p_from timestamptz, p_to timestamptz, p_model text default 'last')
returns table (
  source text, medium text, campaign text, content text,
  signups bigint, paying bigint, revenue_cents bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.admin_stats_assert();
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '400 days' then
    raise exception 'Période invalide' using errcode = '22023';
  end if;
  return query
  with base as (
    select u.id,
           case when p_model = 'first' then a.first_source else a.last_source end as src,
           case when p_model = 'first' then a.first_medium else a.last_medium end as med,
           case when p_model = 'first' then a.first_campaign else a.last_campaign end as cmp,
           case when p_model = 'first' then a.first_content else a.last_content end as cnt
      from public.users u
      left join public.signup_attributions a on a.user_id = u.id
     where u.created_at >= p_from and u.created_at < p_to
  ),
  pay as (
    select p.user_id, sum(p.amount_cents)::bigint as cents
      from public.payments p
     where p.status = 'succeeded'
     group by p.user_id
  )
  select coalesce(b.src, '(direct / non attribué)'), b.med, b.cmp, b.cnt,
         count(*)::bigint,
         count(*) filter (where exists (
           select 1 from public.subscriptions s
            where s.user_id = b.id and s.status in ('active', 'trialing', 'past_due')) or pay.cents > 0)::bigint,
         coalesce(sum(pay.cents), 0)::bigint
    from base b
    left join pay on pay.user_id = b.id
   group by 1, 2, 3, 4
   order by 5 desc, 1;
end;
$$;
revoke all on function public.admin_acquisition_report(timestamptz, timestamptz, text) from public, anon;
grant execute on function public.admin_acquisition_report(timestamptz, timestamptz, text) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Retour arrière :
-- drop function if exists public.admin_acquisition_report(timestamptz, timestamptz, text);
-- drop function if exists public.record_signup_attribution(jsonb);
-- drop function if exists public._attr_ts(jsonb);
-- drop function if exists public._attr_clean(text, integer);
-- drop table if exists public.signup_attributions;
-- ---------------------------------------------------------------------
