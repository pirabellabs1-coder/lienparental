-- =====================================================================
-- Lien Parental — 0450_admin_stats_trends.sql
-- Tableau de bord administrateur, séries temporelles (suite de 0310) :
--   admin_stats_trends(from, to, prev_from, tz)  séries quotidiennes :
--       utilisateurs actifs (jour / 7 jours glissants), comptes cumulés,
--       abonnés payants par formule et cycle, nouveaux abonnements et
--       fins d'abonnement, activité (messages, analyses Coach IA,
--       documents), répartition des sessions par type d'appareil ;
--   admin_stats_cohorts(to, tz, weeks)           rétention par cohorte
--       hebdomadaire d'inscription ;
--   admin_stats_today(tz)                        chiffres du jour (bandeau
--       « Aujourd'hui ») et mêmes compteurs hier à la même heure.
-- Corrige aussi la reconstitution des abonnés passés (0310 / 0380) : une
-- résiliation « en fin de période » compte à la fin de l'accès payé
-- (current_period_end), plus à la date de la demande (canceled_at).
--
-- Principes (identiques à 0310) :
--   * chaque fonction exposée commence par admin_stats_assert()
--     (is_admin_aal2 depuis 0360), sinon erreur 42501 ;
--   * SECURITY DEFINER, search_path = '' : tout est qualifié ;
--   * agrégats uniquement : aucun identifiant, aucun nom, aucun e-mail,
--     aucun user-agent brut ne sort de la base ;
--   * les comptes admin sont exclus des comptages d'utilisateurs ;
--   * agrégations par regroupement + jointure (pas de sous-requête par
--     jour) : coût linéaire en nombre de lignes d'activité.
--
-- Limites de mesure (affichées dans l'interface) :
--   * « actif » dans les séries, les cohortes et le bandeau du jour = au
--     moins une action produit (Journal, Calendrier, Coffre, Coach IA,
--     Messages, Guide) ce jour-là. Les simples connexions ne sont pas
--     historisées (last_sign_in_at ne garde que la dernière) : elles sont
--     exclues pour ne pas fausser les comparaisons dans le temps ;
--   * abonnés passés reconstitués depuis created_at / fin effective (une
--     ligne par utilisateur dans subscriptions : un réabonnement écrase
--     l'historique) ;
--   * appareils : auth.sessions ne conserve que les sessions non expirées et
--     non déconnectées ; l'installation PWA n'est pas enregistrée ;
--   * cohortes : comptes supprimés exclus.
--
-- Additive et ré-exécutable. Rollback : bloc commenté en fin de fichier.
-- =====================================================================


-- =====================================================================
-- 0. FONCTIONS INTERNES
-- =====================================================================

-- --- Jours d'activité produit ---------------------------------------------
-- Couples (utilisateur, jour dans le fuseau p_tz) distincts sur [p_start, p_end[.
create or replace function public.admin_stats_activity_days(p_start timestamptz, p_end timestamptz, p_tz text)
returns table (uid uuid, d date)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct a.uid, (a.at at time zone p_tz)::date
    from (
      select j.user_id as uid, j.created_at as at from public.journal_entries j where j.created_at >= p_start and j.created_at < p_end
      union all select c.user_id, c.created_at from public.calendar_events c where c.created_at >= p_start and c.created_at < p_end
      union all select o.user_id, o.created_at from public.documents o       where o.created_at >= p_start and o.created_at < p_end
      union all select i.user_id, i.created_at from public.ai_usage i        where i.created_at >= p_start and i.created_at < p_end
      union all select m.sender_id, m.created_at from public.messages m      where m.created_at >= p_start and m.created_at < p_end
      union all select g.user_id, g.updated_at from public.guide_progress g  where g.updated_at >= p_start and g.updated_at < p_end
    ) a
    join public.users u on u.id = a.uid and u.deleted_at is null and u.plan::text <> 'admin';
$$;

-- Lignes par utilisateur : jamais exposées, même à service_role.
revoke all on function public.admin_stats_activity_days(timestamptz, timestamptz, text) from public, anon, authenticated, service_role;


-- --- Type d'appareil d'après un user-agent ----------------------------------
-- iPadOS 13+ se présente comme un Mac : compté « ordinateur » (limite connue).
create or replace function public.admin_stats_device_class(p_ua text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when p_ua is null or btrim(p_ua) = '' then 'inconnu'
    when p_ua ~* '(ipad|tablet|kindle|silk/|playbook)' or (p_ua ~* 'android' and p_ua !~* 'mobile') then 'tablette'
    when p_ua ~* '(mobi|iphone|ipod|android|blackberry|opera mini|windows phone)' then 'mobile'
    else 'ordinateur'
  end;
$$;

revoke all on function public.admin_stats_device_class(text) from public, anon, authenticated;


-- --- Contrôle du fuseau -------------------------------------------------------
create or replace function public.admin_stats_check_tz(p_tz text)
returns void
language plpgsql
immutable
security invoker
set search_path = ''
as $$
begin
  if p_tz is null or char_length(p_tz) > 64 or p_tz !~ '^[A-Za-z_]+(/[A-Za-z_+-]+)*$' then
    raise exception 'invalid time zone' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.admin_stats_check_tz(text) from public, anon, authenticated;


-- --- Fin effective d'un abonnement --------------------------------------------
-- Stripe renseigne canceled_at dès la DEMANDE de résiliation ; avec
-- cancel_at_period_end, l'accès payé court jusqu'à current_period_end.
-- null = pas de fin connue (abonnement en cours).
create or replace function public.admin_stats_sub_end(
  p_cancel_at_period_end boolean, p_current_period_end timestamptz, p_canceled_at timestamptz
)
returns timestamptz
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when coalesce(p_cancel_at_period_end, false) and p_current_period_end is not null then p_current_period_end
    else p_canceled_at
  end;
$$;

revoke all on function public.admin_stats_sub_end(boolean, timestamptz, timestamptz) from public, anon, authenticated;


-- --- Abonnés payants à un instant (redéfinition de 0310 / 0380) ---------------
-- Instant présent : statuts actifs (inchangé). Instant passé : abonnement
-- créé avant l'instant et dont la fin effective est postérieure.
create or replace function public.admin_stats_premium_at(p_at timestamptz)
returns table (monthly bigint, yearly bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) filter (where s.plan::text = 'premium_monthly'),
         count(*) filter (where s.plan::text = 'premium_yearly')
    from public.subscriptions s
    join public.users u on u.id = s.user_id and u.plan::text <> 'admin'
   where s.created_at <= p_at
     and case
           when p_at >= now() - interval '5 minutes'
             then s.status::text in ('active', 'trialing', 'past_due')
           else s.status::text not in ('incomplete', 'incomplete_expired')
                and coalesce(public.admin_stats_sub_end(s.cancel_at_period_end, s.current_period_end, s.canceled_at), 'infinity'::timestamptz) > p_at
                and not (s.status::text = 'canceled'
                         and public.admin_stats_sub_end(s.cancel_at_period_end, s.current_period_end, s.canceled_at) is null)
         end;
$$;

revoke all on function public.admin_stats_premium_at(timestamptz) from public, anon, authenticated;

create or replace function public.admin_stats_coparentalite_at(p_at timestamptz)
returns table (monthly bigint, yearly bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) filter (where s.plan::text = 'coparentalite_monthly'),
         count(*) filter (where s.plan::text = 'coparentalite_yearly')
    from public.subscriptions s
    join public.users u on u.id = s.user_id and u.plan::text <> 'admin'
   where s.created_at <= p_at
     and case
           when p_at >= now() - interval '5 minutes'
             then s.status::text in ('active', 'trialing', 'past_due')
           else s.status::text not in ('incomplete', 'incomplete_expired')
                and coalesce(public.admin_stats_sub_end(s.cancel_at_period_end, s.current_period_end, s.canceled_at), 'infinity'::timestamptz) > p_at
                and not (s.status::text = 'canceled'
                         and public.admin_stats_sub_end(s.cancel_at_period_end, s.current_period_end, s.canceled_at) is null)
         end;
$$;

revoke all on function public.admin_stats_coparentalite_at(timestamptz) from public, anon, authenticated;


-- =====================================================================
-- 1. SÉRIES TEMPORELLES
-- =====================================================================
-- Jours (fuseau p_tz) de la période [p_from, p_to[ ; la série « actifs »
-- couvre aussi la période précédente [p_prev_from, p_from[ (comparaison).
create or replace function public.admin_stats_trends(
  p_from      timestamptz,
  p_to        timestamptz,
  p_prev_from timestamptz,
  p_tz        text default 'America/Cayenne'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_d0        date;
  v_d1        date;
  v_p0        date;
  v_p1        date;
  v_now_end   timestamptz := least(p_to, now());
  v_base      bigint;
  v_active    jsonb;
  v_active_p  jsonb;
  v_accounts  jsonb;
  v_subs      jsonb;
  v_flow      jsonb;
  v_activity  jsonb;
  v_devices   jsonb;
begin
  perform public.admin_stats_assert();
  perform public.admin_stats_check_period(p_from, p_to, p_prev_from, p_tz);
  -- 0310 ne borne que la période courante : la précédente l'est aussi ici.
  if p_from - p_prev_from > interval '800 days' then
    raise exception 'invalid period' using errcode = '22023';
  end if;

  v_d0 := (p_from at time zone p_tz)::date;
  v_d1 := ((p_to - interval '1 microsecond') at time zone p_tz)::date;
  v_p0 := (p_prev_from at time zone p_tz)::date;
  v_p1 := v_d0 - 1;

  -- Actifs par jour (DAU) et sur 7 jours glissants (WAU), période et période précédente.
  with act as materialized (
    select a.uid, a.d from public.admin_stats_activity_days(p_prev_from - interval '6 days', p_to, p_tz) a
  ),
  dau as (
    select a.d, count(*) as n from act a group by a.d
  ),
  cur_days as (
    select generate_series(v_d0::timestamp, v_d1::timestamp, interval '1 day')::date as d
  ),
  prev_days as (
    select generate_series(v_p0::timestamp, v_p1::timestamp, interval '1 day')::date as d
  ),
  wau as (
    select g.d, count(distinct a.uid) as n
      from cur_days g
      join act a on a.d between g.d - 6 and g.d
     group by g.d
  )
  select
    (select coalesce(jsonb_agg(jsonb_build_object('d', to_char(g.d, 'YYYY-MM-DD'),
              'dau', coalesce(x.n, 0), 'wau', coalesce(w.n, 0)) order by g.d), '[]'::jsonb)
       from cur_days g left join dau x on x.d = g.d left join wau w on w.d = g.d),
    (select coalesce(jsonb_agg(jsonb_build_object('d', to_char(g.d, 'YYYY-MM-DD'),
              'dau', coalesce(x.n, 0)) order by g.d), '[]'::jsonb)
       from prev_days g left join dau x on x.d = g.d)
  into v_active, v_active_p;

  -- Comptes existants en fin de journée : base au début de période + créations − suppressions.
  select count(*) into v_base
    from public.users u
   where u.plan::text <> 'admin' and u.created_at < p_from and (u.deleted_at is null or u.deleted_at >= p_from);

  select coalesce(jsonb_agg(jsonb_build_object('d', to_char(x.d, 'YYYY-MM-DD'), 'n', x.n) order by x.d), '[]'::jsonb)
    into v_accounts
    from (
      select g.d, v_base + sum(coalesce(c.n, 0) - coalesce(r.n, 0)) over (order by g.d) as n
        from (select generate_series(v_d0::timestamp, v_d1::timestamp, interval '1 day')::date as d) g
        left join (
          select (u.created_at at time zone p_tz)::date as d, count(*) as n
            from public.users u
           where u.plan::text <> 'admin' and u.created_at >= p_from and u.created_at < p_to
           group by 1
        ) c on c.d = g.d
        left join (
          select (u.deleted_at at time zone p_tz)::date as d, count(*) as n
            from public.users u
           where u.plan::text <> 'admin' and u.deleted_at >= p_from and u.deleted_at < p_to and u.created_at < u.deleted_at
           group by 1
        ) r on r.d = g.d
    ) x;

  -- Abonnés payants en fin de journée (mêmes règles que les indicateurs :
  -- admin_stats_premium_at / admin_stats_coparentalite_at ; le dernier jour = maintenant).
  select coalesce(jsonb_agg(jsonb_build_object('d', to_char(g.d, 'YYYY-MM-DD'),
            'pm', p.monthly, 'py', p.yearly, 'cm', c.monthly, 'cy', c.yearly) order by g.d), '[]'::jsonb)
    into v_subs
    from (select generate_series(v_d0::timestamp, v_d1::timestamp, interval '1 day')::date as d) g
    cross join lateral (select least(((g.d + 1)::timestamp at time zone p_tz), v_now_end) as at) e
    cross join lateral public.admin_stats_premium_at(e.at) p
    cross join lateral public.admin_stats_coparentalite_at(e.at) c;

  -- Nouveaux abonnements (création) et fins d'abonnement (fin effective
  -- passée) par jour : le stock de fin de journée en découle.
  select coalesce(jsonb_agg(jsonb_build_object('d', to_char(g.d, 'YYYY-MM-DD'),
            'new', coalesce(n.n, 0), 'canceled', coalesce(k.n, 0)) order by g.d), '[]'::jsonb)
    into v_flow
    from (select generate_series(v_d0::timestamp, v_d1::timestamp, interval '1 day')::date as d) g
    left join (
      select (s.created_at at time zone p_tz)::date as d, count(*) as n
        from public.subscriptions s
        join public.users u on u.id = s.user_id and u.plan::text <> 'admin'
       where s.created_at >= p_from and s.created_at < p_to
         and s.status::text not in ('incomplete', 'incomplete_expired')
       group by 1
    ) n on n.d = g.d
    left join (
      select (z.ended at time zone p_tz)::date as d, count(*) as n
        from (
          select public.admin_stats_sub_end(s.cancel_at_period_end, s.current_period_end, s.canceled_at) as ended
            from public.subscriptions s
            join public.users u on u.id = s.user_id and u.plan::text <> 'admin'
           where s.status::text not in ('incomplete', 'incomplete_expired')
        ) z
       where z.ended >= p_from and z.ended < v_now_end
       group by 1
    ) k on k.d = g.d;

  -- Activité par jour.
  select coalesce(jsonb_agg(jsonb_build_object('d', to_char(g.d, 'YYYY-MM-DD'),
            'messages', coalesce(m.n, 0), 'ai', coalesce(a.n, 0), 'documents', coalesce(o.n, 0)) order by g.d), '[]'::jsonb)
    into v_activity
    from (select generate_series(v_d0::timestamp, v_d1::timestamp, interval '1 day')::date as d) g
    left join (select (x.created_at at time zone p_tz)::date as d, count(*) as n from public.messages x
                where x.created_at >= p_from and x.created_at < p_to group by 1) m on m.d = g.d
    left join (select (x.created_at at time zone p_tz)::date as d, count(*) as n from public.ai_usage x
                where x.created_at >= p_from and x.created_at < p_to group by 1) a on a.d = g.d
    left join (select (x.created_at at time zone p_tz)::date as d, count(*) as n from public.documents x
                where x.created_at >= p_from and x.created_at < p_to group by 1) o on o.d = g.d;

  -- Sessions ouvertes pendant la période / la période précédente, par type d'appareil.
  select jsonb_build_object(
    'current', jsonb_build_object(
      'mobile',     count(*) filter (where z.cls = 'mobile' and z.cur),
      'ordinateur', count(*) filter (where z.cls = 'ordinateur' and z.cur),
      'tablette',   count(*) filter (where z.cls = 'tablette' and z.cur),
      'inconnu',    count(*) filter (where z.cls = 'inconnu' and z.cur)),
    'previous', jsonb_build_object(
      'mobile',     count(*) filter (where z.cls = 'mobile' and not z.cur),
      'ordinateur', count(*) filter (where z.cls = 'ordinateur' and not z.cur),
      'tablette',   count(*) filter (where z.cls = 'tablette' and not z.cur),
      'inconnu',    count(*) filter (where z.cls = 'inconnu' and not z.cur)),
    'pwa_measured', false
  )
  into v_devices
  from (
    select public.admin_stats_device_class(s.user_agent) as cls, s.created_at >= p_from as cur
      from auth.sessions s
      join public.users u on u.id = s.user_id and u.plan::text <> 'admin'
     where s.created_at >= p_prev_from and s.created_at < p_to
  ) z;

  return jsonb_build_object(
    'active_daily', v_active,
    'active_prev_daily', v_active_p,
    'accounts_daily', v_accounts,
    'subs_daily', v_subs,
    'subs_flow_daily', v_flow,
    'activity_daily', v_activity,
    'devices', v_devices
  );
end;
$$;

revoke all on function public.admin_stats_trends(timestamptz, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.admin_stats_trends(timestamptz, timestamptz, timestamptz, text) to authenticated;


-- =====================================================================
-- 2. RÉTENTION PAR COHORTE
-- =====================================================================
-- Cohortes = semaines (lundi, fuseau p_tz) d'inscription, les p_weeks
-- dernières jusqu'à la semaine contenant la fin de période. Pour chaque
-- cohorte : taille et, pour chaque semaine écoulée depuis l'inscription
-- (0 = semaine d'inscription), nombre de membres ayant eu au moins une
-- action produit. last_day indique si la dernière semaine est complète.
create or replace function public.admin_stats_cohorts(
  p_to    timestamptz,
  p_tz    text default 'America/Cayenne',
  p_weeks integer default 12
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_weeks     integer := greatest(4, least(coalesce(p_weeks, 12), 26));
  v_last_day  date;
  v_cur_week  date;
  v_first     date;
  v_start     timestamptz;
  v_end       timestamptz;
  v_rows      jsonb;
begin
  perform public.admin_stats_assert();
  perform public.admin_stats_check_tz(p_tz);
  if p_to is null then
    raise exception 'invalid period' using errcode = '22023';
  end if;

  v_last_day := ((least(p_to, now()) - interval '1 microsecond') at time zone p_tz)::date;
  v_cur_week := date_trunc('week', v_last_day::timestamp)::date;
  v_first    := v_cur_week - (v_weeks - 1) * 7;
  v_start    := v_first::timestamp at time zone p_tz;
  v_end      := (v_last_day + 1)::timestamp at time zone p_tz;

  with coh as materialized (
    select u.id, date_trunc('week', u.created_at at time zone p_tz)::date as w
      from public.users u
     where u.plan::text <> 'admin' and u.deleted_at is null
       and u.created_at >= v_start and u.created_at < v_end
  ),
  sizes as (
    select c.w, count(*) as n from coh c group by c.w
  ),
  -- Membres actifs par (cohorte, semaine écoulée) : un seul regroupement.
  retained as (
    select c.w, (a.d - c.w) / 7 as k, count(distinct a.uid) as n
      from public.admin_stats_activity_days(v_start, v_end, p_tz) a
      join coh c on c.id = a.uid
     where a.d >= c.w
     group by 1, 2
  ),
  weeks as (
    select generate_series(v_first::timestamp, v_cur_week::timestamp, interval '7 days')::date as w
  ),
  grid as (
    select wk.w, n.k, coalesce(r.n, 0) as n
      from weeks wk
      cross join lateral generate_series(0, (v_cur_week - wk.w) / 7) as n(k)
      left join retained r on r.w = wk.w and r.k = n.k
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'w', to_char(wk.w, 'YYYY-MM-DD'),
           'size', coalesce(s.n, 0),
           'active', (select jsonb_agg(gr.n order by gr.k) from grid gr where gr.w = wk.w)
         ) order by wk.w), '[]'::jsonb)
    into v_rows
    from weeks wk
    left join sizes s on s.w = wk.w;

  return jsonb_build_object('current_week', to_char(v_cur_week, 'YYYY-MM-DD'), 'last_day', to_char(v_last_day, 'YYYY-MM-DD'), 'cohorts', v_rows);
end;
$$;

revoke all on function public.admin_stats_cohorts(timestamptz, text, integer) from public, anon;
grant execute on function public.admin_stats_cohorts(timestamptz, text, integer) to authenticated;


-- =====================================================================
-- 3. AUJOURD'HUI
-- =====================================================================
-- Depuis minuit (fuseau p_tz) ; « hier » = hier de minuit à la même heure.
-- « Actifs » = au moins une action produit (comme les séries) : les
-- connexions d'hier ne sont pas historisées, la comparaison serait biaisée.
create or replace function public.admin_stats_today(p_tz text default 'America/Cayenne')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_now    timestamptz := now();
  v_day    date;
  v_start  timestamptz;
  v_ystart timestamptz;
  v_ynow   timestamptz;
begin
  perform public.admin_stats_assert();
  perform public.admin_stats_check_tz(p_tz);

  v_day    := (v_now at time zone p_tz)::date;
  v_start  := v_day::timestamp at time zone p_tz;
  v_ystart := (v_day - 1)::timestamp at time zone p_tz;
  v_ynow   := v_ystart + (v_now - v_start);

  return jsonb_build_object(
    'day', to_char(v_day, 'YYYY-MM-DD'),
    'signups',      (select count(*) from public.users u where u.plan::text <> 'admin' and u.created_at >= v_start and u.created_at < v_now),
    'signups_prev', (select count(*) from public.users u where u.plan::text <> 'admin' and u.created_at >= v_ystart and u.created_at < v_ynow),
    'active',       (select count(distinct a.uid) from public.admin_stats_activity_days(v_start, v_now, p_tz) a),
    'active_prev',  (select count(distinct a.uid) from public.admin_stats_activity_days(v_ystart, v_ynow, p_tz) a),
    'messages',      (select count(*) from public.messages m where m.created_at >= v_start and m.created_at < v_now),
    'messages_prev', (select count(*) from public.messages m where m.created_at >= v_ystart and m.created_at < v_ynow),
    'tickets_open', (select count(*) from public.support_tickets t where t.status::text in ('open', 'in_progress', 'waiting_user')),
    'tickets_new',  (select count(*) from public.support_tickets t where t.created_at >= v_start and t.created_at < v_now)
  );
end;
$$;

revoke all on function public.admin_stats_today(text) from public, anon;
grant execute on function public.admin_stats_today(text) to authenticated;


comment on function public.admin_stats_trends(timestamptz, timestamptz, timestamptz, text) is
  'Tableau de bord admin (0450) : séries quotidiennes (actifs, comptes, abonnés, flux, activité, appareils). Agrégats seulement. Réservé aux admins aal2, 42501 sinon.';
comment on function public.admin_stats_cohorts(timestamptz, text, integer) is
  'Tableau de bord admin (0450) : rétention par cohorte hebdomadaire d''inscription. Agrégats seulement. Réservé aux admins aal2.';
comment on function public.admin_stats_today(text) is
  'Tableau de bord admin (0450) : compteurs du jour et d''hier à la même heure. Réservé aux admins aal2.';


-- =====================================================================
-- ROLLBACK (manuel)
-- =====================================================================
-- drop function if exists public.admin_stats_today(text);
-- drop function if exists public.admin_stats_cohorts(timestamptz, text, integer);
-- drop function if exists public.admin_stats_trends(timestamptz, timestamptz, timestamptz, text);
-- Puis rejouer les définitions d'origine de admin_stats_premium_at (0310) et
-- admin_stats_coparentalite_at (0380) avant de supprimer :
-- drop function if exists public.admin_stats_sub_end(boolean, timestamptz, timestamptz);
-- drop function if exists public.admin_stats_check_tz(text);
-- drop function if exists public.admin_stats_device_class(text);
-- drop function if exists public.admin_stats_activity_days(timestamptz, timestamptz, text);
