// Scénarios 0640_agent_accueil.sql : agenda sans double réservation (AC-24), une seule version publiée
// par fiche, accès réservé à l'administrateur, statistiques en lecture seule, conservation.
const U = (n) => `00000000-0000-0000-0000-0000000064${n}`
const ADM = { id: U('a1'), email: 'admin64@test.fr', prenom: 'Ada' }
const P = { id: U('01'), email: 'parent64@test.fr', prenom: 'Paul' }
let pass = 0, fail = 0
function check(name, cond, extra = '') { if (cond) { pass++; console.log('  ok  ', name) } else { fail++; console.log('  FAIL', name, extra) } }
async function as(db, who, sql, params = [], aal = 'aal2') {
  return db.transaction(async (tx) => {
    const claims = { sub: who.id, email: who.email, aal, role: 'authenticated', session_id: crypto.randomUUID() }
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)])
    await tx.exec('set local role authenticated')
    return (await tx.query(sql, params)).rows
  })
}
async function anon(db, sql, params = []) {
  return db.transaction(async (tx) => { await tx.exec('set local role anon'); return (await tx.query(sql, params)).rows })
}
async function err(p) { try { await p; return null } catch (e) { return e } }

const APPT = `insert into public.agent_appointments
  (ref, type_code, service, representative_id, starts_at, ends_at, busy_until, contact_name, contact_email, language, channel, status)
  values ($1, 'decouverte', 'info', $2, $3::timestamptz, $3::timestamptz + interval '30 minutes', $3::timestamptz + interval '45 minutes', 'Marie', 'm@test.fr', 'fr', 'web', $4) returning id`

export default async function run(db) {
  console.log('\n== Agent d’accueil (0640)')
  for (const u of [ADM, P]) {
    await db.query(`insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())`, [u.id, u.email])
    await db.query(`insert into public.users (id, email, prenom) values ($1, $2, $3) on conflict (id) do update set prenom = excluded.prenom`, [u.id, u.email, u.prenom])
  }
  await db.query(`update public.users set plan = 'admin' where id = $1`, [ADM.id])

  check('services et types de rendez-vous initialisés', (await db.query(`select count(*)::int n from public.agent_appointment_types`)).rows[0].n >= 5)
  const rep = (await db.query(`insert into public.agent_representatives (name, languages, services, hours) values ('Rep', '{fr}', '{info}', '{"1":[["08:00","12:00"]]}') returning id`)).rows[0].id
  const rep2 = (await db.query(`insert into public.agent_representatives (name, languages, services) values ('Rep 2', '{fr,pt}', '{info}') returning id`)).rows[0].id

  console.log(' -- agenda : jamais deux rendez-vous sur le même créneau')
  await db.query(APPT, ['RDV-AAAAA1', rep, '2026-11-02T13:00:00Z', 'confirmed'])
  check('même créneau, même représentant : refusé (23P01)', (await err(db.query(APPT, ['RDV-AAAAA2', rep, '2026-11-02T13:00:00Z', 'confirmed'])))?.code === '23P01')
  check('chevauchement dans le temps tampon : refusé', (await err(db.query(APPT, ['RDV-AAAAA3', rep, '2026-11-02T13:40:00Z', 'confirmed'])))?.code === '23P01')
  check('juste après le tampon : accepté', (await err(db.query(APPT, ['RDV-AAAAA4', rep, '2026-11-02T13:45:00Z', 'confirmed']))) === null)
  check('même créneau, autre représentant : accepté', (await err(db.query(APPT, ['RDV-AAAAA5', rep2, '2026-11-02T13:00:00Z', 'confirmed']))) === null)
  check('rendez-vous annulé : ne bloque pas le créneau', (await err(db.query(APPT, ['RDV-AAAAA6', rep, '2026-11-03T13:00:00Z', 'cancelled']))) === null
    && (await err(db.query(APPT, ['RDV-AAAAA7', rep, '2026-11-03T13:00:00Z', 'confirmed']))) === null)
  check('sans téléphone ni e-mail : refusé (23514)', (await err(db.query(`insert into public.agent_appointments (ref, type_code, service, representative_id, starts_at, ends_at, busy_until, contact_name, language, channel)
    values ('RDV-AAAAA8', 'decouverte', 'info', $1, '2026-11-05T13:00:00Z', '2026-11-05T13:30:00Z', '2026-11-05T13:45:00Z', 'Marie', 'fr', 'web')`, [rep])))?.code === '23514')
  check('langue de représentant inconnue : refusée', (await err(db.query(`insert into public.agent_representatives (name, languages) values ('X', '{de}')`)))?.code === '23514')

  console.log(' -- base de connaissances : une seule version publiée')
  const kb = `insert into public.agent_kb_entries (entry_key, locale, category, version, status, title, answer) values ('horaires', 'fr', 'contact', $1, $2, 'Horaires', 'Du lundi au vendredi.') returning id`
  await db.query(kb, [1, 'published'])
  check('deuxième version publiée de la même fiche : refusée (23505)', (await err(db.query(kb, [2, 'published'])))?.code === '23505')
  check('brouillon de la même fiche : accepté', (await err(db.query(kb, [2, 'draft']))) === null)
  check('programmée sans date : refusée (23514)', (await err(db.query(kb, [3, 'scheduled'])))?.code === '23514')

  console.log(' -- accès')
  for (const t of ['agent_appointments', 'agent_callbacks', 'agent_kb_entries', 'agent_representatives', 'agent_events']) {
    check(`anon : aucune lecture de ${t}`, (await err(anon(db, `select * from public.${t}`))) !== null)
    check(`utilisateur : rien de visible dans ${t}`, (await as(db, P, `select 1 from public.${t}`)).length === 0)
  }
  check('utilisateur : aucune réservation directe', (await err(as(db, P, APPT, ['RDV-BBBBB1', rep, '2026-11-09T13:00:00Z', 'confirmed']))) !== null)
  check('admin : voit les rendez-vous', (await as(db, ADM, `select id from public.agent_appointments`)).length >= 4)
  check('admin : gère les représentants', (await as(db, ADM, `update public.agent_representatives set status = 'unavailable' where id = $1 returning id`, [rep2])).length === 1)
  check('admin : statistiques en lecture seule', (await err(as(db, ADM, `insert into public.agent_events (channel, locale, kind) values ('web', 'fr', 'test')`))) !== null)

  console.log(' -- conservation')
  await db.query(APPT, ['RDV-OLD001', rep, '2024-01-08T13:00:00Z', 'confirmed'])
  await db.query(`insert into public.agent_events (at, channel, locale, kind) values (now() - interval '100 days', 'web', 'fr', 'old'), (now(), 'web', 'fr', 'recent')`)
  const purged = (await db.query(`select public.agent_purge() p`)).rows[0].p
  check('rendez-vous de plus de 12 mois supprimés', purged.appointments === 1)
  check('événements de plus de 90 jours supprimés, récents gardés', purged.events === 1 && (await db.query(`select count(*)::int n from public.agent_events where kind = 'recent'`)).rows[0].n === 1)
  check('purge réservée au serveur', (await err(as(db, ADM, `select public.agent_purge()`))) !== null)

  console.log(' -- réservation en attente de confirmation e-mail')
  await db.query(APPT, ['RDV-PEND01', rep, '2026-11-16T13:00:00Z', 'pending'])
  check('créneau tenu par une réservation en attente (23P01)', (await err(db.query(APPT, ['RDV-PEND02', rep, '2026-11-16T13:00:00Z', 'confirmed'])))?.code === '23P01')

  console.log(' -- déplacement atomique')
  const old = (await db.query(APPT, ['RDV-MOVE01', rep, '2026-11-23T13:00:00Z', 'confirmed'])).rows[0].id
  await db.query(`update public.agent_appointments set manage_token_hash = 'hash-move' where id = $1`, [old])
  await db.query(APPT, ['RDV-BLOCK1', rep, '2026-11-24T13:00:00Z', 'confirmed'])
  const next = (start, ref) => JSON.stringify({ id: crypto.randomUUID(), ref, type_code: 'decouverte', service: 'info', representative_id: rep,
    starts_at: start, ends_at: new Date(Date.parse(start) + 30 * 60_000).toISOString(), busy_until: new Date(Date.parse(start) + 45 * 60_000).toISOString(),
    contact_name: 'Marie', contact_email: 'm@test.fr', language: 'fr', channel: 'web', reminders_consent: true })
  const clash = await err(db.query(`select public.agent_reschedule($1, $2::jsonb)`, [old, next('2026-11-24T13:00:00Z', 'RDV-MOVE02')]))
  const after = (await db.query(`select status, manage_token_hash from public.agent_appointments where id = $1`, [old])).rows[0]
  check('créneau pris : erreur et ancien rendez-vous intact (statut et lien)', clash?.message?.includes('agent_slot_taken') && after.status === 'confirmed' && after.manage_token_hash === 'hash-move')
  check('déplacement réussi', (await db.query(`select public.agent_reschedule($1, $2::jsonb) r`, [old, next('2026-11-25T13:00:00Z', 'RDV-MOVE03')])).rows[0].r === 'ok')
  const moved = (await db.query(`select status, manage_token_hash, rescheduled_from from public.agent_appointments where ref = 'RDV-MOVE03'`)).rows[0]
  check('le même lien suit le nouveau rendez-vous', moved.status === 'confirmed' && moved.manage_token_hash === 'hash-move' && moved.rescheduled_from === old)
  check('ancien rendez-vous annulé, sans lien', (await db.query(`select status, manage_token_hash from public.agent_appointments where id = $1`, [old])).rows[0].manage_token_hash === null)
  check('déplacer un rendez-vous déjà annulé : not_found', (await db.query(`select public.agent_reschedule($1, $2::jsonb) r`, [old, next('2026-11-26T13:00:00Z', 'RDV-MOVE04')])).rows[0].r === 'not_found')
  check('déplacement réservé au serveur', (await err(as(db, ADM, `select public.agent_reschedule($1, '{}'::jsonb)`, [old]))) !== null)

  console.log(' -- publication et versions programmées')
  const v2 = (await db.query(`select id from public.agent_kb_entries where entry_key = 'horaires' and version = 2`)).rows[0].id
  check('publication refusée à un non-admin (42501)', (await err(as(db, P, `select public.agent_kb_publish($1)`, [v2])))?.code === '42501')
  await as(db, ADM, `select public.agent_kb_publish($1)`, [v2])
  const st = (await db.query(`select version, status from public.agent_kb_entries where entry_key = 'horaires' order by version`)).rows
  check('publier v2 archive v1 en une opération', st[0].status === 'archived' && st[1].status === 'published')
  await db.query(`insert into public.agent_kb_entries (entry_key, locale, category, version, status, title, answer, effective_at) values
    ('horaires', 'fr', 'contact', 4, 'scheduled', 'Horaires', 'Nouveaux horaires.', now() - interval '1 minute'),
    ('horaires', 'fr', 'contact', 5, 'scheduled', 'Horaires', 'Plus tard.', now() + interval '1 day')`)
  check('version programmée échue activée', (await db.query(`select public.agent_kb_activate_due() n`)).rows[0].n === 1)
  const st2 = Object.fromEntries((await db.query(`select version, status from public.agent_kb_entries where entry_key = 'horaires'`)).rows.map((r) => [r.version, r.status]))
  check('v4 publiée, v2 archivée, v5 toujours programmée', st2[4] === 'published' && st2[2] === 'archived' && st2[5] === 'scheduled')
  check('activation réservée au serveur', (await err(as(db, ADM, `select public.agent_kb_activate_due()`))) !== null)

  console.log(`\n0640 : ${pass} ok, ${fail} échec(s)`)
  if (fail) process.exitCode = 1
}
