// Scénarios 0450_admin_stats_trends.sql : séries du tableau de bord, cohortes, bandeau « Aujourd'hui ».
// La base est partagée avec les scénarios précédents (données datées de maintenant) : le jeu d'essai est
// placé en mars 2020 pour que les agrégats des périodes interrogées ne portent que sur lui.
// Fuseau America/Cayenne (UTC−3) : 13:00Z = 10:00 heure locale.
const U = (n) => `00000000-0000-0000-0000-0000000045${n}`
const ADM = { id: U('a1'), email: 'admin45@test.fr' }
const A = { id: U('01'), email: 'anna45@test.fr', created: '2020-02-20T15:00:00Z' }
const B = { id: U('02'), email: 'bruno45@test.fr', created: '2020-03-03T15:00:00Z' }
const C = { id: U('03'), email: 'chloe45@test.fr', created: '2020-03-04T15:00:00Z', deleted: '2020-03-06T15:00:00Z' }
const D = { id: U('04'), email: 'diane45@test.fr', created: '2020-02-15T15:00:00Z' }
const E = { id: U('05'), email: 'emile45@test.fr', created: '2100-01-01T00:00:00Z' } // inscrit « aujourd'hui » plus bas (bandeau du jour)
const TZ = 'America/Cayenne'
// Période du lundi 2 au dimanche 8 mars 2020 (heure locale), période précédente : 7 jours avant.
const P = ['2020-03-02T03:00:00Z', '2020-03-09T03:00:00Z', '2020-02-24T03:00:00Z', TZ]
const TRENDS = `select public.admin_stats_trends($1, $2, $3, $4) as t`

let pass = 0, fail = 0
function check(name, cond, extra = '') { if (cond) { pass++; console.log('  ok  ', name) } else { fail++; console.log('  FAIL', name, extra) } }
async function as(db, who, sql, params = [], aal = 'aal1') {
  return db.transaction(async (tx) => {
    const claims = { sub: who.id, email: who.email, aal, role: 'authenticated', session_id: crypto.randomUUID() }
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)])
    await tx.exec('set local role authenticated')
    return (await tx.query(sql, params)).rows
  })
}
const adm = (db, sql, params = []) => as(db, ADM, sql, params, 'aal2')
async function anon(db, sql, params = []) {
  return db.transaction(async (tx) => { await tx.exec('set local role anon'); return (await tx.query(sql, params)).rows })
}
async function err(p) { try { await p; return null } catch (e) { return e } }
const byDay = (rows) => Object.fromEntries(rows.map((r) => [r.d, r]))
const json = (o) => JSON.stringify(o)

export default async function run(db) {
  console.log('\n== Tableau de bord admin : séries, cohortes, aujourd’hui (0450)')
  for (const u of [ADM, A, B, C, D, E]) {
    await db.query(`insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())`, [u.id, u.email])
    await db.query(`insert into public.users (id, email, prenom, email_verified) values ($1, $2, 'Test', true) on conflict (id) do update set prenom = excluded.prenom, email_verified = true`, [u.id, u.email])
  }
  await db.query(`update public.users set plan = 'admin' where id = $1`, [ADM.id])
  for (const u of [A, B, C, D, E]) await db.query(`update public.users set created_at = $2 where id = $1`, [u.id, u.created])
  await db.query(`update public.users set deleted_at = $2 where id = $1`, [C.id, C.deleted])

  // Activité produit (Coach IA). C est supprimé : exclu des actifs, compté dans l'activité brute.
  const ai = [
    [A.id, '2020-02-25T13:00:00Z'], // période précédente
    [A.id, '2020-03-02T13:00:00Z'], [A.id, '2020-03-02T20:00:00Z'], [A.id, '2020-03-05T13:00:00Z'],
    [B.id, '2020-03-03T18:00:00Z'], [B.id, '2020-03-10T13:00:00Z'],
    [C.id, '2020-03-04T18:00:00Z'],
    [ADM.id, '2020-03-04T18:00:00Z'], // admin : jamais compté comme actif
  ]
  for (const [id, at] of ai) await db.query(`insert into public.ai_usage (user_id, kind, created_at) values ($1, 'analysis', $2)`, [id, at])

  // Abonnements : A Premium mensuel du 3 au 6 mars (résilié), B Coparentalité+ annuel depuis le 4 mars.
  await db.query(`insert into public.subscriptions (user_id, stripe_customer_id, stripe_subscription_id, plan, status, created_at, canceled_at)
                  values ($1, 'cus_45a', 'sub_45a', 'premium_monthly', 'canceled', '2020-03-03T15:00:00Z', '2020-03-06T15:00:00Z'),
                         ($2, 'cus_45b', 'sub_45b', 'coparentalite_yearly', 'active', '2020-03-04T15:00:00Z', null)`, [A.id, B.id])
  // D : Premium annuel depuis le 1er mars, résiliation demandée le 4 « en fin de période » (accès jusqu'au 7 à 12 h).
  await db.query(`insert into public.subscriptions (user_id, stripe_customer_id, stripe_subscription_id, plan, status, created_at, canceled_at, cancel_at_period_end, current_period_end)
                  values ($1, 'cus_45d', 'sub_45d', 'premium_yearly', 'active', '2020-03-01T15:00:00Z', '2020-03-04T15:00:00Z', true, '2020-03-07T15:00:00Z')`, [D.id])

  // Sessions (auth.sessions) : user-agents jamais renvoyés, seulement classés.
  const sessions = [
    [A.id, '2020-02-26T13:00:00Z', 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari'], // précédente
    [A.id, '2020-03-03T13:00:00Z', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile Safari'],
    [B.id, '2020-03-04T13:00:00Z', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120'],
    [B.id, '2020-03-05T13:00:00Z', 'Mozilla/5.0 (iPad; CPU OS 16_0) Safari'],
    [A.id, '2020-03-06T13:00:00Z', null],
    [ADM.id, '2020-03-06T13:00:00Z', 'Mozilla/5.0 (Windows NT 10.0) Chrome/120'], // admin exclu
  ]
  for (const [id, at, ua] of sessions) await db.query(`insert into auth.sessions (user_id, created_at, user_agent, aal) values ($1, $2, $3, 'aal1')`, [id, at, ua])

  // --- Garde -----------------------------------------------------------------
  // 0480 : la 2FA n'est plus exigée pour l'administration.
  let e = await err(as(db, ADM, TRENDS, P, 'aal1'))
  check('séries : admin aal1 accepté (0480)', !e, e?.message)
  e = await err(as(db, A, TRENDS, P, 'aal2'))
  check('séries : utilisateur aal2 refusé', e && /admin only/.test(e.message), e?.message)
  e = await err(anon(db, TRENDS, P))
  check('séries : anon refusé (pas de droit d’exécution)', e && /permission denied/.test(e.message), e?.message)
  e = await err(as(db, A, `select public.admin_stats_cohorts(now(), $1, 12)`, [TZ], 'aal2'))
  check('cohortes : utilisateur refusé', e && /admin only/.test(e.message), e?.message)
  e = await err(as(db, A, `select public.admin_stats_today($1)`, [TZ], 'aal2'))
  check('aujourd’hui : utilisateur refusé', e && /admin only/.test(e.message), e?.message)
  e = await err(as(db, ADM, `select public.admin_stats_today($1)`, [TZ], 'aal1'))
  check('aujourd’hui : admin aal1 accepté (0480)', !e, e?.message)
  e = await err(adm(db, `select * from public.admin_stats_activity_days(now() - interval '1 day', now(), $1)`, [TZ]))
  check('fonction interne activity_days non exécutable (même admin)', e && /permission denied/.test(e.message), e?.message)
  e = await err(anon(db, `select public.admin_stats_cohorts(now(), $1, 12)`, [TZ]))
  check('cohortes : anon refusé', e && /permission denied/.test(e.message), e?.message)
  e = await err(anon(db, `select public.admin_stats_today($1)`, [TZ]))
  check('aujourd’hui : anon refusé', e && /permission denied/.test(e.message), e?.message)
  for (const fn of [`admin_stats_device_class('x')`, `admin_stats_check_tz('UTC')`, `admin_stats_sub_end(false, null, null)`, `admin_stats_premium_at(now())`]) {
    e = await err(adm(db, `select public.${fn}`))
    check(`fonction interne ${fn.split('(')[0]} non exécutable`, e && /permission denied/.test(e.message), e?.message)
  }
  e = await err(adm(db, TRENDS, [P[0], P[1], '0001-01-01T00:00:00Z', TZ]))
  check('séries : période précédente > 800 jours refusée (22023)', e && /invalid period/.test(e.message), e?.message)
  e = await err(adm(db, TRENDS, [P[1], P[0], P[2], TZ]))
  check('séries : période inversée refusée (22023)', e && /invalid period/.test(e.message), e?.message)
  e = await err(adm(db, `select public.admin_stats_cohorts(now(), $1, 12)`, ['x; drop table']))
  check('cohortes : fuseau invalide refusé', e && /invalid time zone/.test(e.message), e?.message)

  // --- Séries ------------------------------------------------------------------
  const t = (await adm(db, TRENDS, P))[0].t
  check('séries : 7 jours dans chaque série', ['active_daily', 'accounts_daily', 'subs_daily', 'subs_flow_daily', 'activity_daily'].every((k) => t[k].length === 7) && t.active_prev_daily.length === 7,
    Object.keys(t).map((k) => `${k}:${t[k]?.length}`).join(' '))

  const act = byDay(t.active_daily)
  check('DAU : 1, 1, 0 (supprimé et admin exclus), 1', act['2020-03-02'].dau === 1 && act['2020-03-03'].dau === 1 && act['2020-03-04'].dau === 0 && act['2020-03-05'].dau === 1 && act['2020-03-08'].dau === 0, json(t.active_daily))
  check('WAU : fenêtre de 7 jours glissants (1 le 2, 2 le 3 et le 8)', act['2020-03-02'].wau === 1 && act['2020-03-03'].wau === 2 && act['2020-03-08'].wau === 2, json(t.active_daily))
  const prev = byDay(t.active_prev_daily)
  check('DAU période précédente : 1 le 25 février', prev['2020-02-25']?.dau === 1 && prev['2020-02-24']?.dau === 0, json(t.active_prev_daily))

  const accounts = t.accounts_daily.map((r) => r.n)
  check('comptes cumulés : 2, 3, 4, 4, 3, 3, 3 (suppression le 6)', json(accounts) === json([2, 3, 4, 4, 3, 3, 3]), json(accounts))

  const subs = byDay(t.subs_daily)
  check('abonnés : Premium mensuel du 3 au 5, Coparentalité+ annuel dès le 4',
    subs['2020-03-02'].pm === 0 && subs['2020-03-03'].pm === 1 && subs['2020-03-05'].pm === 1 && subs['2020-03-06'].pm === 0
    && subs['2020-03-03'].cy === 0 && subs['2020-03-04'].cy === 1 && subs['2020-03-08'].cy === 1 && subs['2020-03-04'].cm === 0,
    json(t.subs_daily))
  check('résiliation en fin de période : abonné jusqu’à la fin de l’accès payé (pas dès la demande)',
    t.subs_daily.map((r) => r.py).join() === '1,1,1,1,1,0,0', t.subs_daily.map((r) => r.py).join())
  const flow = byDay(t.subs_flow_daily)
  check('flux : nouveaux le 3 et le 4 ; fins le 6 (immédiate) et le 7 (fin de période)',
    flow['2020-03-03'].new === 1 && flow['2020-03-04'].new === 1 && flow['2020-03-06'].canceled === 1 && flow['2020-03-07'].canceled === 1 && flow['2020-03-04'].canceled === 0
    && t.subs_flow_daily.reduce((s, r) => s + r.new, 0) === 2 && t.subs_flow_daily.reduce((s, r) => s + r.canceled, 0) === 2, json(t.subs_flow_daily))
  // Conservation : stock de fin = stock de la veille + nouveaux − fins.
  const tot = (r) => r.pm + r.py + r.cm + r.cy
  check('flux cohérents avec le stock quotidien', t.subs_daily.every((r, i) => i === 0 || tot(r) === tot(t.subs_daily[i - 1]) + t.subs_flow_daily[i].new - t.subs_flow_daily[i].canceled), json(t.subs_daily.map(tot)))
  const activity = byDay(t.activity_daily)
  check('activité : analyses Coach IA par jour (2, 1, 2, 1)', activity['2020-03-02'].ai === 2 && activity['2020-03-03'].ai === 1 && activity['2020-03-04'].ai === 2 && activity['2020-03-05'].ai === 1, json(t.activity_daily))

  const dv = t.devices
  check('appareils : 1 mobile, 1 ordinateur, 1 tablette, 1 inconnu (admin exclu)',
    dv.current.mobile === 1 && dv.current.ordinateur === 1 && dv.current.tablette === 1 && dv.current.inconnu === 1, json(dv))
  check('appareils : période précédente (1 mobile Android)', dv.previous.mobile === 1 && dv.previous.ordinateur === 0, json(dv.previous))
  check('appareils : PWA déclarée non mesurée', dv.pwa_measured === false)
  const txt = json(t)
  check('séries : aucune donnée personnelle (ni id, ni e-mail, ni user-agent)', !/0000-0000|@test\.fr|Mozilla|iPhone|Windows/.test(txt), txt.slice(0, 200))

  const cls = (await db.query(`select public.admin_stats_device_class(x) as c from unnest(array['Mozilla/5.0 (Linux; Android 13; SM-X200) Safari', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)', '', 'Opera Mini/1.0']) x`)).rows.map((r) => r.c)
  check('classement des user-agents (tablette Android, Mac, vide, Opera Mini)', json(cls) === json(['tablette', 'ordinateur', 'inconnu', 'mobile']), json(cls))

  // --- Cohortes ----------------------------------------------------------------
  // Fin de période : dimanche 15 mars 2020. 4 semaines : 17/02, 24/02, 02/03, 09/03.
  const coh = (await adm(db, `select public.admin_stats_cohorts($1, $2, 4) as c`, ['2020-03-16T03:00:00Z', TZ]))[0].c
  check('cohortes : semaine en cours et 4 cohortes', coh.current_week === '2020-03-09' && coh.cohorts.length === 4, json(coh))
  const cw = Object.fromEntries(coh.cohorts.map((c) => [c.w, c]))
  check('cohorte du 17/02 : 1 inscrit, actif en semaines 1 et 2', cw['2020-02-17'].size === 1 && json(cw['2020-02-17'].active) === json([0, 1, 1, 0]), json(cw['2020-02-17']))
  check('cohorte du 24/02 : vide, 3 semaines', cw['2020-02-24'].size === 0 && json(cw['2020-02-24'].active) === json([0, 0, 0]), json(cw['2020-02-24']))
  check('cohorte du 02/03 : 1 inscrit (supprimé exclu), actif en semaines 0 et 1', cw['2020-03-02'].size === 1 && json(cw['2020-03-02'].active) === json([1, 1]), json(cw['2020-03-02']))
  check('cohorte du 09/03 : semaine partielle', cw['2020-03-09'].size === 0 && cw['2020-03-09'].active.length === 1)
  check('cohortes : aucune donnée personnelle', !/0000-0000|@test\.fr/.test(json(coh)))
  const coh26 = (await adm(db, `select public.admin_stats_cohorts($1, $2, 500) as c`, ['2020-03-16T03:00:00Z', TZ]))[0].c
  check('cohortes : nombre de semaines borné à 26', coh26.cohorts.length === 26, String(coh26.cohorts.length))

  // --- Aujourd'hui -------------------------------------------------------------
  const TODAY = `select public.admin_stats_today($1) as t`
  const before = (await adm(db, TODAY, [TZ]))[0].t
  await db.query(`update public.users set created_at = now() where id = $1`, [E.id])
  // E : une action maintenant et une action hier, juste avant la même heure.
  await db.query(`insert into public.ai_usage (user_id, kind, created_at) values ($1, 'analysis', now() - interval '1 second'), ($1, 'analysis', now() - interval '1 day' - interval '2 seconds')`, [E.id])
  const today = (await adm(db, TODAY, [TZ]))[0].t
  const keys = Object.keys(today).sort().join(',')
  check('aujourd’hui : clés attendues', keys === 'active,active_prev,day,messages,messages_prev,signups,signups_prev,tickets_new,tickets_open', keys)
  check('aujourd’hui : une inscription de plus comptée', today.signups === before.signups + 1, `${before.signups} → ${today.signups}`)
  // Hors des 3 premières secondes après minuit (heure de Cayenne), l'action d'hier tombe dans la fenêtre « hier ».
  const sinceMidnight = Number((await db.query(`select extract(epoch from (now() at time zone $1)::time) as s`, [TZ])).rows[0].s)
  check('aujourd’hui : actifs du jour et d’hier à la même heure (actions)', sinceMidnight < 3 || (today.active === before.active + 1 && today.active_prev === before.active_prev + 1), `${json(before)} → ${json(today)}`)
  check('aujourd’hui : jour au format AAAA-MM-JJ', /^\d{4}-\d{2}-\d{2}$/.test(today.day))

  // --- Dernier jour = maintenant : cohérent avec les indicateurs ----------------------
  const now = (await db.query(`select (now() + interval '1 day')::text as to_, (now() - interval '6 days')::text as from_, (now() - interval '13 days')::text as prev_`)).rows[0]
  const live = (await adm(db, TRENDS, [now.from_, now.to_, now.prev_, TZ]))[0].t
  const ov = (await adm(db, `select public.admin_stats_overview($1, $2, $3, $4) as o`, [now.from_, now.to_, now.prev_, TZ]))[0].o
  const cp = (await adm(db, `select public.admin_stats_coparentalite($1, $2) as c`, [now.from_, now.to_]))[0].c
  const last = live.subs_daily[live.subs_daily.length - 1]
  check('dernier point des abonnés = indicateurs (statuts actuels)',
    last.pm === ov.users.premium_monthly && last.py === ov.users.premium_yearly && last.cm === cp.monthly && last.cy === cp.yearly, `${json(last)} vs ${json(ov.users)} ${json(cp)}`)

  // --- Structure ---------------------------------------------------------------
  const defs = (await db.query(`select p.proname, p.prosecdef, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('admin_stats_trends', 'admin_stats_cohorts', 'admin_stats_today', 'admin_stats_activity_days',
       'admin_stats_device_class', 'admin_stats_check_tz', 'admin_stats_sub_end', 'admin_stats_premium_at', 'admin_stats_coparentalite_at')`)).rows
  const definer = new Set(['admin_stats_trends', 'admin_stats_cohorts', 'admin_stats_today', 'admin_stats_activity_days', 'admin_stats_premium_at', 'admin_stats_coparentalite_at'])
  check('0450 : search_path vide partout ; SECURITY DEFINER seulement là où une table est lue',
    defs.length === 9 && defs.every((d) => d.prosecdef === definer.has(d.proname) && (d.proconfig ?? []).some((c) => /^search_path=("")?$/.test(c))), json(defs))
  const svcExec = (await db.query(`select has_function_privilege('service_role', 'public.admin_stats_activity_days(timestamptz, timestamptz, text)', 'execute') as x`)).rows[0].x
  check('activity_days (lignes par utilisateur) non exécutable par service_role', svcExec === false)

  console.log(`\n0450 : ${pass} ok, ${fail} échec(s)`)
  if (fail) process.exitCode = 1
}
