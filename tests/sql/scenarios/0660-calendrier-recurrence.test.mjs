// Scénarios 0660_calendrier_recurrence.sql : règle et fuseau validés, fin couverte (occurs_until),
// exceptions d'occurrence réservées à l'auteur et lisibles par le parent lié d'une série partagée,
// historique des modifications, rappels des séries hors de la boucle des événements ponctuels.
import nodeFs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Le scénario 0440 rejoue sa migration (notif_enqueue_calendar_reminders d'origine) : on rejoue 0660 après.
const MIGRATION = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../supabase/migrations/0660_calendrier_recurrence.sql')
const U = (n) => `00000000-0000-0000-0000-0000000066${n}`
const A = { id: U('01'), email: 'a66@test.fr', prenom: 'Ana' }
const B = { id: U('02'), email: 'b66@test.fr', prenom: 'Bob' }
const X = { id: U('03'), email: 'x66@test.fr', prenom: 'Xia' }
let pass = 0, fail = 0
function check(name, cond, extra = '') { if (cond) { pass++; console.log('  ok  ', name) } else { fail++; console.log('  FAIL', name, extra) } }
async function as(db, who, sql, params = []) {
  return db.transaction(async (tx) => {
    const claims = { sub: who.id, email: who.email, aal: 'aal2', role: 'authenticated', session_id: crypto.randomUUID() }
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)])
    await tx.exec('set local role authenticated')
    return (await tx.query(sql, params)).rows
  })
}
async function err(p) { try { await p; return null } catch (e) { return e } }
const inHours = (h) => new Date(Date.now() + h * 3_600_000).toISOString()

export default async function run(db) {
  console.log('\n== Calendrier : événements récurrents (0660)')
  await db.exec(nodeFs.readFileSync(MIGRATION, 'utf8'))
  for (const u of [A, B, X]) {
    await db.query(`insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())`, [u.id, u.email])
    await db.query(`insert into public.users (id, email, prenom) values ($1, $2, $3) on conflict (id) do update set prenom = excluded.prenom`, [u.id, u.email, u.prenom])
  }
  const kid = U('c1')
  await db.query(`insert into public.children (id, user_id, prenom, date_naissance) values ($1, $2, 'Lina', '2019-05-12')`, [kid, A.id])
  const inv = await as(db, A, `select * from public.create_family_invitation($1, 'parent', array[$2]::uuid[])`, [B.email, kid])
  await as(db, B, `select public.accept_family_invitation($1)`, [inv[0].token])

  const INS = `insert into public.calendar_events (user_id, type, titre, start_at, end_at, children_ids, family_shared, rrule, tzid, occurs_until)
               values ($1, 'appel_video', 'Appel du soir', $2, $3, array[$4]::uuid[], true, $5, $6, $7) returning id, occurs_until, status`

  // --- Règle, fuseau, fin couverte
  const onceEnd = inHours(3)
  const once = (await as(db, A, INS, [A.id, inHours(2), onceEnd, kid, null, 'America/Cayenne', inHours(900)]))[0]
  check('ponctuel : occurs_until = fin (valeur fournie ignorée), statut « prévu »', new Date(once.occurs_until).getTime() === Date.parse(onceEnd) && once.status === 'prevu')
  const daily = (await as(db, A, INS, [A.id, inHours(1), inHours(1.5), kid, 'FREQ=DAILY', 'America/Cayenne', null]))[0]
  check('série sans fin : occurs_until = infinity', (await db.query(`select occurs_until = 'infinity' as inf from public.calendar_events where id = $1`, [daily.id])).rows[0].inf === true)
  const fin = (await as(db, A, INS, [A.id, inHours(1), inHours(1.5), kid, 'FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4', 'Europe/Paris', inHours(400)]))[0]
  check('série finie : occurs_until fourni conservé', Date.parse(fin.occurs_until) === Date.parse(inHours(400)) || Math.abs(Date.parse(fin.occurs_until) - Date.parse(inHours(400))) < 5000)
  check('règle invalide refusée (23514)', (await err(as(db, A, INS, [A.id, inHours(1), inHours(2), kid, 'FREQ=HOURLY', 'America/Cayenne', null])))?.code === '23514')
  check('injection dans la règle refusée (23514)', (await err(as(db, A, INS, [A.id, inHours(1), inHours(2), kid, "FREQ=DAILY;X=1'--", 'America/Cayenne', null])))?.code === '23514')
  check('fuseau invalide refusé (23514)', (await err(as(db, A, INS, [A.id, inHours(1), inHours(2), kid, 'FREQ=DAILY', 'UTC+3', null])))?.code === '23514')
  check('fuseau inconnu de PostgreSQL refusé (23514)', (await err(as(db, A, INS, [A.id, inHours(1), inHours(2), kid, 'FREQ=DAILY', 'Foo/Bar', null])))?.code === '23514')
  const xs = (await as(db, X, `insert into public.calendar_events (user_id, type, titre, start_at, series_parent_id) values ($1, 'autre', 'x', now(), $2) returning series_parent_id`, [X.id, daily.id]))[0]
  check('série parente d’un autre compte : ignorée', xs.series_parent_id === null)
  check('purge de l’historique : réservée au service', (await err(as(db, A, `select public.calendar_audit_purge()`))) !== null && (await err(db.query(`select public.calendar_audit_purge()`))) === null)
  check('statut invalide refusé (23514)', (await err(as(db, A, `update public.calendar_events set status = 'perdu' where id = $1`, [daily.id])))?.code === '23514')

  // --- Exceptions
  const occ = inHours(25)
  const EXC = `insert into public.calendar_event_exceptions (event_id, user_id, occurrence_start, deleted, start_at, end_at, status) values ($1, $2, $3, $4, $5, $6, $7) returning id`
  check('auteur : occurrence reportée enregistrée', (await err(as(db, A, EXC, [daily.id, A.id, occ, false, inHours(26), inHours(26.5), 'reporte']))) === null)
  check('même occurrence deux fois : refusée (23505)', (await err(as(db, A, EXC, [daily.id, A.id, occ, true, null, null, null])))?.code === '23505')
  check('déplacement incomplet refusé (23514)', (await err(as(db, A, EXC, [daily.id, A.id, inHours(49), false, inHours(50), null, null])))?.code === '23514')
  check('exception sur un événement ponctuel refusée (RLS)', (await err(as(db, A, EXC, [once.id, A.id, inHours(2), true, null, null, null]))) !== null)
  check('parent lié : ne modifie pas la série d’autrui', (await err(as(db, B, EXC, [daily.id, B.id, inHours(49), true, null, null, null]))) !== null)
  check('parent lié : lit les exceptions de la série partagée', (await as(db, B, `select 1 from public.calendar_event_exceptions where event_id = $1`, [daily.id])).length === 1)
  check('tiers : ne voit aucune exception', (await as(db, X, `select 1 from public.calendar_event_exceptions`)).length === 0)
  await as(db, A, `update public.calendar_events set family_shared = false where id = $1`, [daily.id])
  check('série redevenue privée : exceptions masquées au parent lié', (await as(db, B, `select 1 from public.calendar_event_exceptions where event_id = $1`, [daily.id])).length === 0)

  // --- Historique
  await as(db, A, `update public.calendar_events set titre = 'Appel vidéo' where id = $1`, [daily.id])
  await as(db, A, `insert into public.calendar_event_exceptions (event_id, user_id, occurrence_start, deleted) values ($1, $2, $3, true)`, [daily.id, A.id, inHours(73)])
  await as(db, A, `update public.calendar_events set deleted_at = now() where id = $1`, [daily.id])
  const log = await as(db, A, `select action, changes from public.calendar_event_audit where event_id = $1 order by id`, [daily.id])
  const actions = log.map((r) => r.action)
  check('historique : création, partage, titre, occurrences, suppression', ['create', 'occurrence_update', 'update', 'occurrence_delete', 'delete'].every((a) => actions.includes(a)), actions.join(','))
  check('historique : ancien et nouveau titre', log.some((r) => r.action === 'update' && JSON.stringify(r.changes.titre) === JSON.stringify(['Appel du soir', 'Appel vidéo'])))
  check('historique : invisible du parent lié et des tiers', (await as(db, B, `select 1 from public.calendar_event_audit`)).length === 0 && (await as(db, X, `select 1 from public.calendar_event_audit where owner_id <> $1`, [X.id])).length === 0)
  check('historique : non modifiable par l’utilisateur', (await err(as(db, A, `insert into public.calendar_event_audit (event_id, owner_id, action) values ($1, $2, 'update')`, [daily.id, A.id]))) !== null
    && (await err(as(db, A, `delete from public.calendar_event_audit where event_id = $1`, [daily.id]))) !== null
    && (await as(db, A, `select count(*)::int n from public.calendar_event_audit where event_id = $1`, [daily.id]))[0].n === log.length)

  // --- Rappels
  const rec = (await as(db, A, `insert into public.calendar_events (user_id, type, titre, start_at, end_at, children_ids, family_shared, rrule, reminder_minutes)
                                 values ($1, 'appel_video', 'Appel', $2, $3, array[$4]::uuid[], true, 'FREQ=DAILY', 15) returning id`, [A.id, inHours(0.1), inHours(0.6), kid]))[0].id
  await db.query(`select public.notif_enqueue_calendar_reminders(500)`)
  check('série : pas de rappel unique posé par la boucle des événements ponctuels',
    (await db.query(`select reminder_sent_at from public.calendar_events where id = $1`, [rec])).rows[0].reminder_sent_at === null
    && (await db.query(`select 1 from public.notification_jobs where event = 'calendar_reminder' and payload ->> 'event_id' = $1`, [rec])).rows.length === 0)
  const targets = (await db.query(`select * from public.notif_calendar_recurring_targets(100) where event_id = $1`, [rec])).rows
  check('série : titulaire listé pour le cron des occurrences (15 min)', targets.some((t) => t.user_id === A.id && t.mins === 15 && t.rrule === 'FREQ=DAILY' && t.tzid === 'America/Cayenne'))
  check('cibles des rappels : réservées au service', (await err(as(db, A, `select * from public.notif_calendar_recurring_targets(10)`))) !== null)

  console.log(`
0660 : ${pass} ok, ${fail} échec(s)`)
  if (fail) process.exitCode = 1
}
