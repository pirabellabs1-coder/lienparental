-- =====================================================================
-- Lien Parental — 0310_admin_stats.sql
-- Tableau de bord administrateur (chantier F) :
--   1. Tables de mesure : `donations` (dons), `stats_events` (visites,
--      consultations du Guide, erreurs serveur). Écriture service_role
--      uniquement, aucune lecture client directe.
--   2. Index de période (created_at…) pour les agrégats.
--   3. Fonctions d'agrégat SECURITY DEFINER réservées aux admins :
--        admin_stats_overview(from, to, prev_from, tz)  indicateurs + variations
--        admin_stats_series(from, to, prev_from, tz)    séries des graphiques
--        admin_stats_feed(limit, free_quota)            dernières inscriptions,
--                                                       derniers paiements, alertes
--
-- Principes :
--   * chaque fonction exposée commence par admin_stats_assert() :
--     is_admin() ET mfa_satisfied(), sinon erreur 42501 (fail-closed) ;
--   * search_path = '' : tous les objets sont qualifiés (public., auth.) ;
--   * execute révoqué à public / anon ; accordé à authenticated seulement
--     (la garde interne refuse tout non-admin) ;
--   * minimisation : aucune adresse e-mail, aucun nom complet ne sort
--     de la base (prénom + initiale du nom) ;
--   * les comptes admin sont exclus des comptages d'utilisateurs ;
--   * fonctions plutôt que vues : une vue appartenant à postgres
--     contournerait la RLS sans pouvoir vérifier is_admin() proprement.
--
-- Additive et ré-exécutable. Rollback : bloc commenté en fin de fichier.
-- =====================================================================


-- =====================================================================
-- 1. TABLES DE MESURE
-- =====================================================================

-- --- donations ---------------------------------------------------------
-- Dons ponctuels (plateforme de don à choisir : Stripe Payment Link,
-- HelloAsso…). Alimentée par un webhook ou un import (service_role).
-- Aucune donnée d'identité du donateur : user_id facultatif si le don
-- est fait depuis un compte connecté.
create table if not exists public.donations (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references public.users(id) on delete set null,
  amount_cents  integer not null check (amount_cents > 0),
  currency      char(3) not null default 'EUR',
  source        text not null default 'stripe' check (source in ('stripe', 'helloasso', 'autre')),
  external_id   text unique,                 -- id du paiement chez le prestataire (idempotence)
  status        text not null default 'succeeded' check (status in ('succeeded', 'refunded', 'failed')),
  donated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index if not exists idx_donations_donated
  on public.donations(donated_at desc);

alter table public.donations enable row level security;

drop policy if exists donations_admin_select on public.donations;
create policy donations_admin_select on public.donations
  for select to authenticated using ((select public.is_admin()));

drop policy if exists mfa_required on public.donations;
create policy mfa_required on public.donations
  as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));

revoke all on table public.donations from public, anon, authenticated;
grant select on table public.donations to authenticated;   -- filtré par la policy admin
grant all on table public.donations to service_role;


-- --- stats_events ------------------------------------------------------
-- Événements anonymes de mesure d'audience et d'erreurs. Aucun
-- identifiant personnel : pas de user_id, pas d'IP, pas d'user-agent.
--   visit       : visite d'une page publique (1 par session navigateur)
--   guide_view  : consultation d'une fiche du Guide (ref = slug)
--   error       : erreur serveur (ref = route, ex. "/api/coach/analyze")
-- Rétention conseillée : 13 mois (purge via cron, cf. MISE_EN_SERVICE).
create table if not exists public.stats_events (
  id          bigserial primary key,
  kind        text not null check (kind in ('visit', 'guide_view', 'error')),
  ref         text check (ref is null or char_length(ref) <= 200),
  territoire  text check (territoire is null or (territoire ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(territoire) <= 40)),
  created_at  timestamptz not null default now()
);

create index if not exists idx_stats_events_kind_created
  on public.stats_events(kind, created_at desc);

alter table public.stats_events enable row level security;
-- Aucune policy : lecture via les fonctions admin ci-dessous, écriture service_role.
revoke all on table public.stats_events from public, anon, authenticated;
grant all on table public.stats_events to service_role;
grant usage, select on sequence public.stats_events_id_seq to service_role;


-- =====================================================================
-- 2. INDEX DE PÉRIODE
-- =====================================================================
create index if not exists idx_users_created        on public.users(created_at);
create index if not exists idx_subscriptions_created on public.subscriptions(created_at);
create index if not exists idx_subscriptions_canceled on public.subscriptions(canceled_at) where canceled_at is not null;
create index if not exists idx_payments_paid         on public.payments(paid_at) where status = 'succeeded';
create index if not exists idx_payments_created      on public.payments(created_at);
create index if not exists idx_ai_usage_created      on public.ai_usage(created_at);
create index if not exists idx_documents_created     on public.documents(created_at);
create index if not exists idx_testimonies_sent      on public.testimonies(sent_at);
create index if not exists idx_journal_created       on public.journal_entries(created_at);
create index if not exists idx_calendar_created      on public.calendar_events(created_at);
create index if not exists idx_messages_created      on public.messages(created_at);
create index if not exists idx_guide_progress_updated on public.guide_progress(updated_at);
create index if not exists idx_support_created       on public.support_tickets(created_at);


-- =====================================================================
-- 3. FONCTIONS
-- =====================================================================

-- --- Garde commune -----------------------------------------------------
create or replace function public.admin_stats_assert()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.is_admin(), false) or not coalesce(public.mfa_satisfied(), false) then
    raise exception 'admin only' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.admin_stats_assert() from public, anon, authenticated;


-- --- Contrôle des paramètres de période ----------------------------------
create or replace function public.admin_stats_check_period(
  p_from timestamptz, p_to timestamptz, p_prev_from timestamptz, p_tz text
)
returns void
language plpgsql
immutable
security definer
set search_path = ''
as $$
begin
  if p_from is null or p_to is null or p_prev_from is null
     or p_from >= p_to or p_prev_from >= p_from
     or p_to - p_from > interval '800 days' then
    raise exception 'invalid period' using errcode = '22023';
  end if;
  if p_tz is null or char_length(p_tz) > 64 or p_tz !~ '^[A-Za-z_]+(/[A-Za-z_+-]+)*$' then
    raise exception 'invalid time zone' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.admin_stats_check_period(timestamptz, timestamptz, timestamptz, text) from public, anon, authenticated;


-- --- Utilisateurs actifs sur une fenêtre ---------------------------------
-- Actif = au moins une action produit (Journal, Calendrier, Coffre, Coach,
-- Messages, Guide) ou une connexion dans la fenêtre.
-- NB : last_sign_in_at / last_seen_at ne gardent que le dernier instant ;
-- pour une fenêtre passée, le comptage peut être légèrement sous-estimé.
create or replace function public.admin_stats_active_users(p_start timestamptz, p_end timestamptz)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct a.uid)
    from (
      select user_id as uid from public.journal_entries where created_at >= p_start and created_at < p_end
      union all select user_id from public.calendar_events where created_at >= p_start and created_at < p_end
      union all select user_id from public.documents       where created_at >= p_start and created_at < p_end
      union all select user_id from public.ai_usage        where created_at >= p_start and created_at < p_end
      union all select sender_id from public.messages      where created_at >= p_start and created_at < p_end
      union all select user_id from public.guide_progress  where updated_at >= p_start and updated_at < p_end
      union all select user_id from public.sessions        where last_seen_at >= p_start and last_seen_at < p_end
      union all select id from auth.users                  where last_sign_in_at >= p_start and last_sign_in_at < p_end
    ) a
    join public.users u on u.id = a.uid and u.deleted_at is null and u.plan <> 'admin';
$$;

revoke all on function public.admin_stats_active_users(timestamptz, timestamptz) from public, anon, authenticated;


-- --- Abonnés Premium à un instant -----------------------------------------
-- Instant présent : statuts actifs. Instant passé : reconstitution à partir
-- de created_at / canceled_at (approximation documentée).
create or replace function public.admin_stats_premium_at(p_at timestamptz)
returns table (monthly bigint, yearly bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) filter (where s.plan = 'premium_monthly'),
         count(*) filter (where s.plan = 'premium_yearly')
    from public.subscriptions s
    join public.users u on u.id = s.user_id and u.plan <> 'admin'
   where s.created_at <= p_at
     and case
           when p_at >= now() - interval '5 minutes'
             then s.status in ('active', 'trialing', 'past_due')
           else s.status not in ('incomplete', 'incomplete_expired')
                and (s.canceled_at is null or s.canceled_at > p_at)
                and not (s.status = 'canceled' and s.canceled_at is null)
         end;
$$;

revoke all on function public.admin_stats_premium_at(timestamptz) from public, anon, authenticated;


-- --- 3.1 Indicateurs clés ------------------------------------------------
-- [p_from, p_to[ = période courante ; [p_prev_from, p_from[ = précédente.
-- Montants en centimes, stockage en Mo.
create or replace function public.admin_stats_overview(
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
  v_now_end      timestamptz := least(p_to, now());
  v_month_start  timestamptz;
  v_pmonth_start timestamptz;
  v_month_end    timestamptz;
  v_prem_cur     record;
  v_prem_prev    record;
  v_users        jsonb;
  v_activity     jsonb;
  v_revenue      jsonb;
  v_misc         jsonb;
begin
  perform public.admin_stats_assert();
  perform public.admin_stats_check_period(p_from, p_to, p_prev_from, p_tz);

  -- Mois calendaire contenant la fin de période, dans le fuseau de l'application.
  v_month_start  := date_trunc('month', (p_to - interval '1 second') at time zone p_tz) at time zone p_tz;
  v_pmonth_start := (date_trunc('month', (p_to - interval '1 second') at time zone p_tz) - interval '1 month') at time zone p_tz;
  v_month_end    := least(p_to, (date_trunc('month', (p_to - interval '1 second') at time zone p_tz) + interval '1 month') at time zone p_tz);

  select * into v_prem_cur  from public.admin_stats_premium_at(v_now_end);
  select * into v_prem_prev from public.admin_stats_premium_at(p_from);

  select jsonb_build_object(
    'total',      count(*) filter (where u.created_at < p_to and (u.deleted_at is null or u.deleted_at >= p_to)),
    'total_prev', count(*) filter (where u.created_at < p_from and (u.deleted_at is null or u.deleted_at >= p_from)),
    'new',        count(*) filter (where u.created_at >= p_from and u.created_at < p_to),
    'new_prev',   count(*) filter (where u.created_at >= p_prev_from and u.created_at < p_from),
    'active7',        public.admin_stats_active_users(v_now_end - interval '7 days',  v_now_end),
    'active7_prev',   public.admin_stats_active_users(v_now_end - interval '14 days', v_now_end - interval '7 days'),
    'active30',       public.admin_stats_active_users(v_now_end - interval '30 days', v_now_end),
    'active30_prev',  public.admin_stats_active_users(v_now_end - interval '60 days', v_now_end - interval '30 days'),
    'premium_monthly',      v_prem_cur.monthly,
    'premium_yearly',       v_prem_cur.yearly,
    'premium_monthly_prev', v_prem_prev.monthly,
    'premium_yearly_prev',  v_prem_prev.yearly
  )
  into v_users
  from public.users u
  where u.plan <> 'admin';

  select jsonb_build_object(
    'churn',      (select count(*) from public.subscriptions s where s.canceled_at >= p_from and s.canceled_at < p_to),
    'churn_prev', (select count(*) from public.subscriptions s where s.canceled_at >= p_prev_from and s.canceled_at < p_from),
    'ai',         (select count(*) from public.ai_usage a where a.created_at >= p_from and a.created_at < p_to),
    'ai_prev',    (select count(*) from public.ai_usage a where a.created_at >= p_prev_from and a.created_at < p_from),
    'testimonies',      (select count(*) from public.testimonies t where t.sent_at >= p_from and t.sent_at < p_to),
    'testimonies_prev', (select count(*) from public.testimonies t where t.sent_at >= p_prev_from and t.sent_at < p_from),
    'documents',      (select count(*) from public.documents d where d.created_at >= p_from and d.created_at < p_to),
    'documents_prev', (select count(*) from public.documents d where d.created_at >= p_prev_from and d.created_at < p_from)
  )
  into v_activity;

  select jsonb_build_object(
    'subs_cents',       (select coalesce(sum(p.amount_cents), 0) from public.payments p
                          where p.status = 'succeeded' and coalesce(p.paid_at, p.created_at) >= p_from and coalesce(p.paid_at, p.created_at) < p_to),
    'subs_cents_prev',  (select coalesce(sum(p.amount_cents), 0) from public.payments p
                          where p.status = 'succeeded' and coalesce(p.paid_at, p.created_at) >= p_prev_from and coalesce(p.paid_at, p.created_at) < p_from),
    'month_cents',      (select coalesce(sum(p.amount_cents), 0) from public.payments p
                          where p.status = 'succeeded' and coalesce(p.paid_at, p.created_at) >= v_month_start and coalesce(p.paid_at, p.created_at) < v_month_end)
                      + (select coalesce(sum(d.amount_cents), 0) from public.donations d
                          where d.status = 'succeeded' and d.donated_at >= v_month_start and d.donated_at < v_month_end),
    'month_cents_prev', (select coalesce(sum(p.amount_cents), 0) from public.payments p
                          where p.status = 'succeeded' and coalesce(p.paid_at, p.created_at) >= v_pmonth_start and coalesce(p.paid_at, p.created_at) < v_month_start)
                      + (select coalesce(sum(d.amount_cents), 0) from public.donations d
                          where d.status = 'succeeded' and d.donated_at >= v_pmonth_start and d.donated_at < v_month_start),
    'cumul_cents',      (select coalesce(sum(p.amount_cents), 0) from public.payments p
                          where p.status = 'succeeded' and coalesce(p.paid_at, p.created_at) < p_to)
                      + (select coalesce(sum(d.amount_cents), 0) from public.donations d
                          where d.status = 'succeeded' and d.donated_at < p_to),
    'cumul_cents_prev', (select coalesce(sum(p.amount_cents), 0) from public.payments p
                          where p.status = 'succeeded' and coalesce(p.paid_at, p.created_at) < p_from)
                      + (select coalesce(sum(d.amount_cents), 0) from public.donations d
                          where d.status = 'succeeded' and d.donated_at < p_from),
    'don_cents',        (select coalesce(sum(d.amount_cents), 0) from public.donations d
                          where d.status = 'succeeded' and d.donated_at >= p_from and d.donated_at < p_to),
    'don_cents_prev',   (select coalesce(sum(d.amount_cents), 0) from public.donations d
                          where d.status = 'succeeded' and d.donated_at >= p_prev_from and d.donated_at < p_from)
  )
  into v_revenue;

  select jsonb_build_object(
    -- Stockage : quota réellement consommé (users.storage_used_mb) ; la
    -- valeur précédente retranche les documents déposés pendant la période.
    'storage_mb',      (select coalesce(sum(u.storage_used_mb), 0) from public.users u where u.deleted_at is null and u.plan <> 'admin'),
    'storage_added_mb', (select coalesce(sum(d.size_bytes), 0) / 1048576.0 from public.documents d
                          where d.created_at >= p_from and d.created_at < p_to and d.deleted_at is null),
    'tickets_open',    (select count(*) from public.support_tickets t where t.status in ('open', 'in_progress', 'waiting_user')),
    'tickets_open_prev', (select count(*) from public.support_tickets t
                           where t.created_at < p_from and (t.closed_at is null or t.closed_at > p_from)),
    'tickets_new',     (select count(*) from public.support_tickets t where t.created_at >= p_from and t.created_at < p_to)
  )
  into v_misc;

  return jsonb_build_object(
    'users', v_users, 'activity', v_activity, 'revenue', v_revenue, 'misc', v_misc,
    'generated_at', now()
  );
end;
$$;

revoke all on function public.admin_stats_overview(timestamptz, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.admin_stats_overview(timestamptz, timestamptz, timestamptz, text) to authenticated;


-- --- 3.2 Séries des graphiques -------------------------------------------
create or replace function public.admin_stats_series(
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
  v_rev_start timestamptz;
  v_signups   jsonb;
  v_revenue   jsonb;
  v_modules   jsonb;
  v_guide     jsonb;
  v_funnel    jsonb;
  v_terr      jsonb;
begin
  perform public.admin_stats_assert();
  perform public.admin_stats_check_period(p_from, p_to, p_prev_from, p_tz);

  -- Revenus : au moins les 12 derniers mois, davantage si la période est plus longue.
  v_rev_start := date_trunc('month', least(p_from, (p_to - interval '1 second') - interval '11 months') at time zone p_tz) at time zone p_tz;

  select coalesce(jsonb_agg(jsonb_build_object('d', x.d, 'n', x.n) order by x.d), '[]'::jsonb)
    into v_signups
    from (
      select to_char(u.created_at at time zone p_tz, 'YYYY-MM-DD') as d, count(*) as n
        from public.users u
       where u.created_at >= p_from and u.created_at < p_to and u.plan <> 'admin'
       group by 1
    ) x;

  select coalesce(jsonb_agg(jsonb_build_object('m', r.m, 'subs', r.subs, 'dons', r.dons) order by r.m), '[]'::jsonb)
    into v_revenue
    from (
      select m, sum(subs) as subs, sum(dons) as dons
        from (
          select to_char(coalesce(p.paid_at, p.created_at) at time zone p_tz, 'YYYY-MM') as m, p.amount_cents as subs, 0 as dons
            from public.payments p
           where p.status = 'succeeded' and coalesce(p.paid_at, p.created_at) >= v_rev_start and coalesce(p.paid_at, p.created_at) < p_to
          union all
          select to_char(d.donated_at at time zone p_tz, 'YYYY-MM'), 0, d.amount_cents
            from public.donations d
           where d.status = 'succeeded' and d.donated_at >= v_rev_start and d.donated_at < p_to
        ) z
       group by m
    ) r;

  select jsonb_build_object(
    'journal',    jsonb_build_array(
                    (select count(*) from public.journal_entries j where j.created_at >= p_from and j.created_at < p_to),
                    (select count(*) from public.journal_entries j where j.created_at >= p_prev_from and j.created_at < p_from)),
    'calendrier', jsonb_build_array(
                    (select count(*) from public.calendar_events c where c.created_at >= p_from and c.created_at < p_to),
                    (select count(*) from public.calendar_events c where c.created_at >= p_prev_from and c.created_at < p_from)),
    'coffre',     jsonb_build_array(
                    (select count(*) from public.documents d where d.created_at >= p_from and d.created_at < p_to),
                    (select count(*) from public.documents d where d.created_at >= p_prev_from and d.created_at < p_from)),
    'coach',      jsonb_build_array(
                    (select count(*) from public.ai_usage a where a.created_at >= p_from and a.created_at < p_to),
                    (select count(*) from public.ai_usage a where a.created_at >= p_prev_from and a.created_at < p_from)),
    'guide',      jsonb_build_array(
                    (select count(*) from public.guide_progress g where g.updated_at >= p_from and g.updated_at < p_to),
                    (select count(*) from public.guide_progress g where g.updated_at >= p_prev_from and g.updated_at < p_from)),
    'messages',   jsonb_build_array(
                    (select count(*) from public.messages m where m.created_at >= p_from and m.created_at < p_to),
                    (select count(*) from public.messages m where m.created_at >= p_prev_from and m.created_at < p_from))
  )
  into v_modules;

  -- Fiches du Guide : consultations mesurées (stats_events) et, en repli,
  -- fiches suivies par des utilisateurs distincts (guide_progress).
  select jsonb_build_object(
    'views', coalesce((
      select jsonb_agg(jsonb_build_object('slug', v.ref, 'territoire', v.territoire, 'n', v.n) order by v.n desc)
        from (
          select e.ref, coalesce(e.territoire, 'guyane') as territoire, count(*) as n
            from public.stats_events e
           where e.kind = 'guide_view' and e.ref is not null and e.created_at >= p_from and e.created_at < p_to
           group by 1, 2 order by 3 desc limit 10
        ) v), '[]'::jsonb),
    'followed', coalesce((
      select jsonb_agg(jsonb_build_object('slug', f.ref_slug, 'territoire', f.territoire, 'n', f.n) order by f.n desc)
        from (
          select g.ref_slug, g.territoire, count(distinct g.user_id) as n
            from public.guide_progress g
           where g.ref_type = 'fiche' and g.updated_at >= p_from and g.updated_at < p_to
           group by 1, 2 order by 3 desc limit 10
        ) f), '[]'::jsonb)
  )
  into v_guide;

  -- Entonnoir de la cohorte inscrite pendant la période.
  select jsonb_build_object(
    'visits_measured', exists (select 1 from public.stats_events e where e.kind = 'visit'),
    'visits',   (select count(*) from public.stats_events e where e.kind = 'visit' and e.created_at >= p_from and e.created_at < p_to),
    'accounts', count(*),
    'child',    count(*) filter (where exists (
                  select 1 from public.children c where c.user_id = u.id and c.deleted_at is null)),
    'premium',  count(*) filter (where exists (
                  select 1 from public.subscriptions s where s.user_id = u.id
                     and s.status not in ('incomplete', 'incomplete_expired')))
  )
  into v_funnel
  from public.users u
  where u.created_at >= p_from and u.created_at < p_to and u.plan <> 'admin';

  -- Territoires : territoire principal de chaque utilisateur (le plus utilisé
  -- dans le Guide) ; sans activité Guide = « non renseigné » (clé null).
  select coalesce(jsonb_agg(jsonb_build_object('territoire', t.territoire, 'n', t.n) order by t.n desc), '[]'::jsonb)
    into v_terr
    from (
      select main.territoire, count(*) as n
        from public.users u
        left join lateral (
          select g.territoire
            from public.guide_progress g
           where g.user_id = u.id
           group by g.territoire
           order by count(*) desc, g.territoire
           limit 1
        ) main on true
       where u.deleted_at is null and u.plan <> 'admin' and u.created_at < p_to
       group by main.territoire
    ) t;

  return jsonb_build_object(
    'signups_daily', v_signups,
    'revenue_monthly', v_revenue,
    'modules', v_modules,
    'guide', v_guide,
    'funnel', v_funnel,
    'territories', v_terr
  );
end;
$$;

revoke all on function public.admin_stats_series(timestamptz, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.admin_stats_series(timestamptz, timestamptz, timestamptz, text) to authenticated;


-- --- 3.3 Fil récent et alertes -------------------------------------------
-- Données minimisées : prénom + initiale du nom, jamais d'e-mail.
create or replace function public.admin_stats_feed(
  p_limit      integer default 8,
  p_free_quota integer default 3
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit   integer := greatest(1, least(coalesce(p_limit, 8), 20));
  v_quota   integer := greatest(1, least(coalesce(p_free_quota, 3), 1000));
  v_signups jsonb;
  v_pay     jsonb;
  v_alerts  jsonb;
begin
  perform public.admin_stats_assert();

  select coalesce(jsonb_agg(to_jsonb(s) order by s.created_at desc), '[]'::jsonb)
    into v_signups
    from (
      select u.id,
             coalesce(nullif(btrim(u.prenom), ''), 'Utilisateur')
               || case when nullif(btrim(u.nom), '') is not null then ' ' || upper(left(btrim(u.nom), 1)) || '.' else '' end
               as display_name,
             u.created_at,
             u.plan::text as plan,
             exists (select 1 from public.children c where c.user_id = u.id and c.deleted_at is null) as has_child
        from public.users u
       where u.deleted_at is null and u.plan <> 'admin'
       order by u.created_at desc
       limit v_limit
    ) s;

  select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at desc), '[]'::jsonb)
    into v_pay
    from (
      select x.* from (
        select p.id,
               coalesce(nullif(btrim(u.prenom), ''), 'Utilisateur')
                 || case when nullif(btrim(u.nom), '') is not null then ' ' || upper(left(btrim(u.nom), 1)) || '.' else '' end
                 as display_name,
               p.amount_cents,
               p.status::text as status,
               'abonnement'::text as kind,
               coalesce(s.plan::text, '') as plan,
               coalesce(p.paid_at, p.created_at) as created_at
          from public.payments p
          left join public.users u on u.id = p.user_id
          left join public.subscriptions s on s.id = p.subscription_id
        union all
        select d.id,
               coalesce(
                 coalesce(nullif(btrim(u.prenom), ''), null)
                   || case when nullif(btrim(u.nom), '') is not null then ' ' || upper(left(btrim(u.nom), 1)) || '.' else '' end,
                 'Don anonyme'),
               d.amount_cents,
               d.status,
               'don'::text,
               ''::text,
               d.donated_at
          from public.donations d
          left join public.users u on u.id = d.user_id
      ) x
      order by x.created_at desc
      limit v_limit
    ) p;

  select jsonb_build_object(
    'failed_payments_7d', (select count(*) from public.payments p where p.status = 'failed' and p.created_at >= now() - interval '7 days'),
    'past_due',           (select count(*) from public.subscriptions s where s.status = 'past_due'),
    'stripe_unprocessed', (select count(*) from public.stripe_events e where e.processed_at is null and e.received_at < now() - interval '15 minutes'),
    'errors_24h',         (select count(*) from public.stats_events e where e.kind = 'error' and e.created_at >= now() - interval '24 hours'),
    'errors_prev_7d',     (select count(*) from public.stats_events e where e.kind = 'error'
                             and e.created_at >= now() - interval '8 days' and e.created_at < now() - interval '24 hours'),
    'errors_measured',    exists (select 1 from public.stats_events e where e.kind = 'error'),
    'ai_free_at_quota',   (select count(*) from (
                             select a.user_id
                               from public.ai_usage a
                               join public.users u on u.id = a.user_id and u.plan = 'free' and u.deleted_at is null
                              where a.created_at >= now() - interval '30 days'
                              group by a.user_id
                             having count(*) >= v_quota) q),
    'ai_month',           (select count(*) from public.ai_usage a
                             where a.created_at >= date_trunc('month', now() at time zone 'America/Cayenne') at time zone 'America/Cayenne'),
    'tickets_urgent',     (select count(*) from public.support_tickets t
                             where t.status in ('open', 'in_progress', 'waiting_user') and t.priority in ('high', 'urgent'))
  )
  into v_alerts;

  return jsonb_build_object('signups', v_signups, 'payments', v_pay, 'alerts', v_alerts);
end;
$$;

revoke all on function public.admin_stats_feed(integer, integer) from public, anon;
grant execute on function public.admin_stats_feed(integer, integer) to authenticated;


comment on function public.admin_stats_overview(timestamptz, timestamptz, timestamptz, text) is
  'Tableau de bord admin : indicateurs clés période courante / précédente. Réservé aux admins (is_admin + MFA), 42501 sinon.';
comment on function public.admin_stats_series(timestamptz, timestamptz, timestamptz, text) is
  'Tableau de bord admin : séries des graphiques. Réservé aux admins (is_admin + MFA), 42501 sinon.';
comment on function public.admin_stats_feed(integer, integer) is
  'Tableau de bord admin : dernières inscriptions / paiements (prénom + initiale) et compteurs d''alerte. Réservé aux admins.';


-- =====================================================================
-- ROLLBACK (manuel)
-- =====================================================================
-- drop function if exists public.admin_stats_feed(integer, integer);
-- drop function if exists public.admin_stats_series(timestamptz, timestamptz, timestamptz, text);
-- drop function if exists public.admin_stats_overview(timestamptz, timestamptz, timestamptz, text);
-- drop function if exists public.admin_stats_premium_at(timestamptz);
-- drop function if exists public.admin_stats_active_users(timestamptz, timestamptz);
-- drop function if exists public.admin_stats_check_period(timestamptz, timestamptz, timestamptz, text);
-- drop function if exists public.admin_stats_assert();
-- drop table if exists public.stats_events;
-- drop table if exists public.donations;
-- (les index idx_*_created peuvent rester : sans effet fonctionnel)
