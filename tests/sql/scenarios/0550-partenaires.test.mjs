// Scénarios 0550_partenaires.sql : candidatures privées, validation par l'admin, porte publique.
const U = (n) => `00000000-0000-0000-0000-0000000055${n}`
const ADM = { id: U('a1'), email: 'admin55@test.fr', prenom: 'Ada' }
const P = { id: U('01'), email: 'parent55@test.fr', prenom: 'Paul' }
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

const INSERT = `insert into public.partner_applications
  (profil, structure, contact_name, email, territoire, presentation, proposition, category, logo_path)
  values ($1, $2, 'Nadia', 'contact@asso.test', 'guyane', repeat('p', 40), repeat('q', 40), $3, $4) returning id`

export default async function run(db) {
  console.log('\n== Partenaires (0550)')
  for (const u of [ADM, P]) {
    await db.query(`insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())`, [u.id, u.email])
    await db.query(`insert into public.users (id, email, prenom) values ($1, $2, $3) on conflict (id) do update set prenom = excluded.prenom`, [u.id, u.email, u.prenom])
  }
  await db.query(`update public.users set plan = 'admin' where id = $1`, [ADM.id])

  // Insertion côté serveur (superutilisateur = service_role dans ce banc).
  const a1 = (await db.query(INSERT, ['association', 'Familles 973', 'association', '00000000-0000-4000-8000-0000000055a1.png'])).rows[0].id
  const a2 = (await db.query(INSERT, ['createur', 'Maman Solo', 'createur', null])).rows[0].id

  console.log(' -- confidentialité des candidatures')
  check('anon : aucune lecture de la table', (await err(anon(db, `select * from public.partner_applications`))) !== null)
  check('anon : aucune insertion directe', (await err(anon(db, INSERT, ['association', 'X', 'association', null]))) !== null)
  check('utilisateur : aucune candidature visible', (await as(db, P, `select id from public.partner_applications`)).length === 0)
  check('utilisateur : aucune insertion directe', (await err(as(db, P, INSERT, ['association', 'X', 'association', null]))) !== null)
  check('utilisateur : aucune validation', (await as(db, P, `update public.partner_applications set status = 'approved' where id = $1 returning id`, [a1])).length === 0)
  check('admin : voit les candidatures', (await as(db, ADM, `select id from public.partner_applications where id in ($1, $2)`, [a1, a2])).length === 2)

  console.log(' -- validation')
  check('validation sans nom ni logo public refusée (23514)',
    (await err(as(db, ADM, `update public.partner_applications set status = 'approved' where id = $1`, [a1])))?.code === '23514')
  check('chemin de logo hors format refusé (23514)',
    (await err(as(db, ADM, `update public.partner_applications set logo_public_path = '../x.png' where id = $1`, [a1])))?.code === '23514')
  check('admin : ne modifie pas le contenu de la candidature',
    (await err(as(db, ADM, `update public.partner_applications set email = 'pirate@x.test' where id = $1`, [a1]))) !== null)
  check('admin : valide dans la catégorie',
    (await as(db, ADM, `update public.partner_applications set status = 'approved', category = 'association', public_name = 'Familles 973',
       tagline = 'Guyane', logo_public_path = '00000000-0000-4000-8000-0000000055a1.png', decided_at = now(), decided_by = $2 where id = $1 returning id`, [a1, ADM.id])).length === 1)

  console.log(' -- porte publique')
  const pub = await anon(db, `select * from public.list_public_partners()`)
  check('anon : seuls les partenaires validés', pub.length === 1 && pub[0].id === a1, JSON.stringify(pub))
  check('anon : colonnes d’affichage seulement (ni e-mail ni téléphone)', !('email' in pub[0]) && !('telephone' in pub[0]) && pub[0].category === 'association')
  await as(db, ADM, `update public.partner_applications set status = 'hidden' where id = $1`, [a1])
  check('partenaire masqué : plus public', (await anon(db, `select * from public.list_public_partners()`)).length === 0)

  console.log(' -- stockage')
  check('bucket des candidatures privé', (await db.query(`select public from storage.buckets where id = 'partner-submissions'`)).rows[0]?.public === false)
  check('bucket des logos publiés public', (await db.query(`select public from storage.buckets where id = 'partner-logos'`)).rows[0]?.public === true)

  console.log(`\n0550 : ${pass} ok, ${fail} échec(s)`)
  if (fail) process.exitCode = 1
}
