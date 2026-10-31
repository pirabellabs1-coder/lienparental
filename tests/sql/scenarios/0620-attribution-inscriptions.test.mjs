// Scénarios 0620_attribution_inscriptions.sql : rattachement à l'inscription, nettoyage, rapport admin.
// N = nouveau compte, O = compte ancien, ADM = administrateur.
const U = (n) => `00000000-0000-0000-0000-0000000062${n}`
const N = { id: U('0a'), email: 'attr62n@test.fr' }
const O = { id: U('0b'), email: 'attr62o@test.fr' }
const ADM = { id: U('0c'), email: 'attr62adm@test.fr' }
let pass = 0, fail = 0
function check(name, cond, extra = '') { if (cond) { pass++; console.log('  ok  ', name) } else { fail++; console.log('  FAIL', name, extra) } }
async function as(db, who, sql, params = []) {
  return db.transaction(async (tx) => {
    const claims = { sub: who.id, email: who.email, aal: 'aal1', role: 'authenticated', session_id: crypto.randomUUID() }
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)])
    await tx.exec('set local role authenticated')
    return (await tx.query(sql, params)).rows
  })
}
const touch = (s, extra = {}) => ({ s, m: 'organic', c: 'LP_W45_depenses', t: 'MD-2026-W45-01', p: '/guide', at: 1_800_000_000, ...extra })
const record = (db, who, attr) => as(db, who, `select public.record_signup_attribution($1::jsonb) as r`, [JSON.stringify(attr)])

export default async function run(db) {
  console.log('\n== Attribution des inscriptions (0620)')
  for (const u of [N, O, ADM]) {
    await db.query(`insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())`, [u.id, u.email])
    await db.query(`insert into public.users (id, email, prenom) values ($1, $2, 'T') on conflict (id) do nothing`, [u.id, u.email])
  }
  await db.query(`update public.users set created_at = now() - interval '10 days' where id = $1`, [O.id])
  await db.query(`update public.users set plan = 'admin' where id = $1`, [ADM.id])

  let r = (await record(db, N, { f: touch('tiktok'), l: touch('instagram', { c: '<b>LP_W46</b>' }) }))[0].r
  check('nouveau compte : attribution enregistrée', r === 'recorded', r)
  const row = (await db.query(`select * from public.signup_attributions where user_id = $1`, [N.id])).rows[0]
  check('premier et dernier contact distincts', row?.first_source === 'tiktok' && row?.last_source === 'instagram')
  check('valeur nettoyée (pas de HTML)', row?.last_campaign === 'bLP_W46/b', row?.last_campaign)
  check('horodatage du contact conservé', row?.first_at instanceof Date && row.first_at.getTime() === 1_800_000_000_000)
  r = (await record(db, N, { f: touch('google'), l: touch('google') }))[0].r
  check('second appel : aucune réécriture', r === 'duplicate' && (await db.query(`select first_source from public.signup_attributions where user_id = $1`, [N.id])).rows[0].first_source === 'tiktok')

  r = (await record(db, O, { f: touch('tiktok'), l: touch('tiktok') }))[0].r
  check('compte ancien : pas une inscription, rien enregistré', r === 'not_new')
  r = (await record(db, N, { f: { s: '' }, l: touch('x') }))[0].r
  check('contact invalide refusé', r === 'invalid' || r === 'duplicate')

  let denied = false
  try { await as(db, N, `select * from public.signup_attributions`) } catch { denied = true }
  check('table illisible pour un compte connecté', denied)
  denied = false
  try { await as(db, N, `select * from public.admin_acquisition_report(now() - interval '30 days', now())`) } catch (e) { denied = /admin only/.test(e.message) }
  check('rapport refusé à un non-admin', denied)

  const rep = await as(db, ADM, `select * from public.admin_acquisition_report(now() - interval '30 days', now() + interval '1 minute', 'last')`)
  const ig = rep.find((x) => x.source === 'instagram')
  check('rapport admin : inscription attribuée au dernier contact', ig && Number(ig.signups) === 1, JSON.stringify(rep))
  check('rapport admin : comptes non attribués regroupés', rep.some((x) => x.source === '(direct / non attribué)'))
  const first = await as(db, ADM, `select * from public.admin_acquisition_report(now() - interval '30 days', now() + interval '1 minute', 'first')`)
  check('rapport admin : modèle premier contact', first.some((x) => x.source === 'tiktok'))

  return { pass, fail }
}
