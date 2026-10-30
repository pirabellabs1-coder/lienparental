// Scénarios 0580_photo_enfant.sql : chemin de la photo de l'enfant limité au dossier du titulaire.
const U = (n) => `00000000-0000-0000-0000-0000000058${n}`
const A = { id: U('01'), email: 'parent58@test.fr', prenom: 'Anaïs' }
const B = { id: U('02'), email: 'autre58@test.fr', prenom: 'Bastien' }
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
async function err(p) { try { await p; return null } catch (e) { return e } }

export default async function run(db) {
  console.log('\n== Photo de l’enfant (0580)')
  for (const u of [A, B]) {
    await db.query(`insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())`, [u.id, u.email])
    await db.query(`insert into public.users (id, email, prenom) values ($1, $2, $3) on conflict (id) do update set prenom = excluded.prenom`, [u.id, u.email, u.prenom])
  }
  const c = (await db.query(`insert into public.children (user_id, prenom, date_naissance) values ($1, 'Léa', '2018-04-12') returning id`, [A.id])).rows[0].id
  const upd = (path) => as(db, A, `update public.children set photo_url = $2 where id = $1 returning photo_url`, [c, path])

  check('chemin dans son propre dossier accepté', (await upd(`${A.id}/child-${c}.jpg`))[0]?.photo_url === `${A.id}/child-${c}.jpg`)
  check('photo retirée (null) acceptée', (await upd(null))[0]?.photo_url === null)
  check('chemin dans le dossier d’un autre compte refusé', (await err(upd(`${B.id}/child-${c}.jpg`)))?.code === '23514')
  check('chemin avec « .. » refusé', (await err(upd(`${A.id}/../${B.id}/x.jpg`)))?.code === '23514')
  check('ancienne adresse https admise', (await upd('https://exemple.test/photo.jpg'))[0]?.photo_url === 'https://exemple.test/photo.jpg')

  console.log(`\n0580 : ${pass} ok, ${fail} échec(s)`)
  if (fail) process.exitCode = 1
}
