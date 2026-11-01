// Scénarios 0650_agent_whatsapp.sql : conversations et messages WhatsApp réservés à l'administration,
// message fournisseur traité une seule fois, conservation 6 mois.
const U = (n) => `00000000-0000-0000-0000-0000000065${n}`
const ADM = { id: U('a1'), email: 'admin65@test.fr', prenom: 'Ada' }
const P = { id: U('01'), email: 'parent65@test.fr', prenom: 'Paul' }
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
async function anon(db, sql, params = []) {
  return db.transaction(async (tx) => { await tx.exec('set local role anon'); return (await tx.query(sql, params)).rows })
}
async function err(p) { try { await p; return null } catch (e) { return e } }

export default async function run(db) {
  console.log('\n== Agent WhatsApp (0650)')
  for (const u of [ADM, P]) {
    await db.query(`insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())`, [u.id, u.email])
    await db.query(`insert into public.users (id, email, prenom) values ($1, $2, $3) on conflict (id) do update set prenom = excluded.prenom`, [u.id, u.email, u.prenom])
  }
  await db.query(`update public.users set plan = 'admin' where id = $1`, [ADM.id])

  const conv = (await db.query(`insert into public.agent_wa_conversations (phone, name) values ('594694000001', 'Marie') returning id`)).rows[0].id
  const MSG = `insert into public.agent_wa_messages (conversation_id, direction, author, wa_id, body) values ($1, 'in', 'contact', $2, 'Bonjour')`
  await db.query(MSG, [conv, 'WA-1'])
  check('même message fournisseur rejoué : refusé (23505)', (await err(db.query(MSG, [conv, 'WA-1'])))?.code === '23505')
  check('messages sans identifiant : acceptés', (await err(db.query(MSG, [conv, null]))) === null && (await err(db.query(MSG, [conv, null]))) === null)
  check('numéro invalide refusé (23514)', (await err(db.query(`insert into public.agent_wa_conversations (phone) values ('+33 6 12')`)))?.code === '23514')
  check('un seul fil par numéro (23505)', (await err(db.query(`insert into public.agent_wa_conversations (phone) values ('594694000001')`)))?.code === '23505')

  for (const t of ['agent_wa_conversations', 'agent_wa_messages']) {
    check(`anon : aucune lecture de ${t}`, (await err(anon(db, `select * from public.${t}`))) !== null)
    check(`utilisateur : rien de visible dans ${t}`, (await as(db, P, `select 1 from public.${t}`)).length === 0)
  }
  check('admin : lit la conversation', (await as(db, ADM, `select id from public.agent_wa_messages where conversation_id = $1`, [conv])).length === 3)
  check('admin : rend la main à l’assistant', (await as(db, ADM, `update public.agent_wa_conversations set mode = 'bot' where id = $1 returning id`, [conv])).length === 1)

  const old = (await db.query(`insert into public.agent_wa_conversations (phone, last_inbound_at) values ('594694000002', now() - interval '7 months') returning id`)).rows[0].id
  await db.query(`insert into public.agent_wa_messages (conversation_id, direction, author, body, created_at) values ($1, 'in', 'contact', 'ancien', now() - interval '7 months')`, [conv])
  const purged = (await db.query(`select public.agent_purge() p`)).rows[0].p
  check('messages de plus de 6 mois supprimés', purged.wa_messages === 1)
  check('conversation inactive depuis 6 mois supprimée, récente gardée',
    purged.wa_conversations === 1 && (await db.query(`select count(*)::int n from public.agent_wa_conversations where id in ($1, $2)`, [conv, old])).rows[0].n === 1)

  console.log(' -- rendez-vous WhatsApp')
  const rep = (await db.query(`insert into public.agent_representatives (name, languages, services) values ('Rep65', '{fr}', '{info}') returning id`)).rows[0].id
  const rep2 = (await db.query(`insert into public.agent_representatives (name, languages, services) values ('Rep65b', '{fr}', '{info}') returning id`)).rows[0].id
  const APPT = `insert into public.agent_appointments (ref, type_code, service, representative_id, starts_at, ends_at, busy_until, contact_name, contact_phone, language, channel, confirm_channel)
    values ($1, 'decouverte', 'info', $2, $3::timestamptz, $3::timestamptz + interval '30 minutes', $3::timestamptz + interval '45 minutes', 'Léo', '594694000009', 'fr', 'whatsapp', 'whatsapp') returning id`
  const first = (await db.query(APPT, ['RDV-WA0001', rep, '2026-12-07T13:00:00Z'])).rows[0].id
  const dup = await err(db.query(APPT, ['RDV-WA0002', rep2, '2026-12-07T13:00:00Z']))
  check('double « oui » : second rendez-vous du même numéro au même créneau refusé (23505)', dup?.code === '23505' && /one_per_phone_slot/.test(dup.message))
  const next = JSON.stringify({ id: crypto.randomUUID(), ref: 'RDV-WA0003', type_code: 'decouverte', service: 'info', representative_id: rep,
    starts_at: '2026-12-08T13:00:00Z', ends_at: '2026-12-08T13:30:00Z', busy_until: '2026-12-08T13:45:00Z', contact_name: 'Léo', contact_phone: '594694000009', language: 'fr', channel: 'whatsapp' })
  check('déplacement : ok', (await db.query(`select public.agent_reschedule($1, $2::jsonb) r`, [first, next])).rows[0].r === 'ok')
  check('déplacement : canal de confirmation WhatsApp conservé (rappels)', (await db.query(`select confirm_channel from public.agent_appointments where ref = 'RDV-WA0003'`)).rows[0].confirm_channel === 'whatsapp')

  console.log(`\n0650 : ${pass} ok, ${fail} échec(s)`)
  if (fail) process.exitCode = 1
}
