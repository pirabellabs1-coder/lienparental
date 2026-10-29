// Scénarios 0570_signalement_temoignages.sql : témoignage irréversible, signalement par le parent,
// décision de l'administrateur (rejet ou suppression), sans lecture du contenu.
export const vaultOpen = true
const U = (n) => `00000000-0000-0000-0000-0000000057${n}`
const A = { id: U('01'), email: 'parent57@test.fr', prenom: 'Alice' }
const B = { id: U('02'), email: 'autre57@test.fr', prenom: 'Bruno' }
const ADM = { id: U('a1'), email: 'admin57@test.fr', prenom: 'Ada' }
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

async function testimony(db, owner, ref, attachments = '[]') {
  const req = await db.query(`insert into public.testimony_requests (user_id, token, expires_at, subject) values ($1, 'tok57-' || md5(random()::text), now() + interval '30 days', 'Sujet') returning id`, [owner.id])
  const t = await db.query(`insert into public.testimonies (request_id, user_id, reference, temoin, texte_original, texte_envoye, attachments) values ($1, $2, $3, '{}'::jsonb, 'brut', 'envoyé', $4::jsonb) returning id`, [req.rows[0].id, owner.id, ref, attachments])
  return t.rows[0].id
}

export default async function run(db) {
  console.log('\n== Signalement des témoignages (0570)')
  for (const u of [A, B, ADM]) {
    await db.query(`insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())`, [u.id, u.email])
    await db.query(`insert into public.users (id, email, prenom) values ($1, $2, $3) on conflict (id) do update set prenom = excluded.prenom`, [u.id, u.email, u.prenom])
  }
  await db.query(`update public.users set plan = 'admin' where id = $1`, [ADM.id])
  const t1 = await testimony(db, A, 'TMG-2026-5701', '[{"path":"temoignage-attachments/x/piece.pdf","mime":"application/pdf","size":10}]')
  const t2 = await testimony(db, A, 'TMG-2026-5702')

  console.log(' -- irréversible')
  await as(db, A, `delete from public.testimonies where id = $1`, [t1])
  check('le parent ne peut pas supprimer un témoignage reçu', (await db.query(`select 1 from public.testimonies where id = $1`, [t1])).rows.length === 1)
  check('aucune écriture directe dans les signalements',
    (await err(as(db, A, `insert into public.testimony_reports (testimony_id, reference, owner_id, reporter_id, reason_code) values ($1, 'x', $2, $2, 'test')`, [t1, A.id]))) !== null)

  console.log(' -- signalement')
  const r1 = (await as(db, A, `select public.report_testimony($1, 'test', 'Envoyé pour essayer') as id`, [t1]))[0].id
  check('le parent signale son témoignage', !!r1)
  const again = (await as(db, A, `select public.report_testimony($1, 'abus', null) as id`, [t1]))[0].id
  check('un second signalement renvoie celui en cours (pas de doublon)', again === r1)
  check('un autre parent ne peut pas signaler ce témoignage', (await err(as(db, B, `select public.report_testimony($1, 'test', null)`, [t1])))?.code === 'P0002')
  check('motif inconnu refusé', (await err(as(db, A, `select public.report_testimony($1, 'nimporte', null)`, [t2])))?.code === '22023')
  check('« autre » sans précision refusé', (await err(as(db, A, `select public.report_testimony($1, 'autre', '  ')`, [t2])))?.code === '22023')
  check('le parent voit son signalement', (await as(db, A, `select status from public.testimony_reports where id = $1`, [r1]))[0]?.status === 'open')
  check('un autre parent ne le voit pas', (await as(db, B, `select 1 from public.testimony_reports`)).length === 0)

  console.log(' -- administration')
  check('liste réservée aux administrateurs', (await err(as(db, A, `select public.admin_list_testimony_reports('open', 50)`))) !== null)
  const list = (await as(db, ADM, `select public.admin_list_testimony_reports('open', 50) as l`))[0].l
  const row = list.find((x) => x.id === r1)
  check('l’admin voit le motif et la référence', row?.reason_code === 'test' && row?.reference === 'TMG-2026-5701', JSON.stringify(row))
  check('la liste ne contient pas le contenu du témoignage', !JSON.stringify(list).includes('envoyé') && !('texte_envoye' in (row ?? {})))
  check('un parent ne décide pas', (await err(as(db, A, `select public.admin_decide_testimony_report($1, 'removed', null)`, [r1]))) !== null)

  const r2 = (await as(db, A, `select public.report_testimony($1, 'doublon', null) as id`, [t2]))[0].id
  const rej = (await as(db, ADM, `select public.admin_decide_testimony_report($1, 'rejected', 'Témoignage valable') as d`, [r2]))[0].d
  check('rejet : le témoignage reste', rej?.status === 'rejected' && (await db.query(`select 1 from public.testimonies where id = $1`, [t2])).rows.length === 1)
  check('une décision ne se prend qu’une fois', (await err(as(db, ADM, `select public.admin_decide_testimony_report($1, 'removed', null)`, [r2])))?.code === '22023')

  const rem = (await as(db, ADM, `select public.admin_decide_testimony_report($1, 'removed', null) as d`, [r1]))[0].d
  check('suppression : le témoignage est effacé', rem?.status === 'removed' && (await db.query(`select 1 from public.testimonies where id = $1`, [t1])).rows.length === 0)
  check('suppression : chemins des pièces renvoyés pour le stockage', JSON.stringify(rem?.attachments) === '["temoignage-attachments/x/piece.pdf"]', JSON.stringify(rem))
  const hist = (await db.query(`select status, testimony_id, reference from public.testimony_reports where id = $1`, [r1])).rows[0]
  check('l’historique du signalement est conservé', hist?.status === 'removed' && hist.testimony_id === null && hist.reference === 'TMG-2026-5701', JSON.stringify(hist))
  const audit = (await db.query(`select action from public.audit_log where entity = 'testimony_reports' order by created_at`)).rows.map((r) => r.action)
  check('signalements et décisions journalisés', audit.includes('testimony.report') && audit.includes('admin.testimony.remove') && audit.includes('admin.testimony.report_reject'), audit.join(','))

  console.log(`\n0570 : ${pass} ok, ${fail} échec(s)`)
  if (fail) process.exitCode = 1
}
