// Scénarios 0590_photo_enfant_famille.sql : l'autre parent lit la photo de l'enfant, pas le reste du bucket.
// A = titulaire de Léo, B = gardien parent, D = proche, X = tiers.
const U = (n) => `00000000-0000-0000-0000-0000000059${n}`
const A = { id: U('0a'), email: 'anais59@test.fr', prenom: 'Anaïs' }
const B = { id: U('0b'), email: 'bruno59@test.fr', prenom: 'Bruno' }
const D = { id: U('0d'), email: 'dina59@test.fr', prenom: 'Dina' }
const X = { id: U('99'), email: 'x59@test.fr', prenom: 'X' }
const c1 = U('c1')
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
const avatars = async (db, who) => (await as(db, who, `select name from storage.objects where bucket_id = 'avatars' order by name`)).map((r) => r.name)

export default async function run(db) {
  console.log('\n== Photo de l’enfant visible par l’autre parent (0590)')
  for (const u of [A, B, D, X]) {
    await db.query(`insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())`, [u.id, u.email])
    await db.query(`insert into public.users (id, email, prenom) values ($1, $2, $3) on conflict (id) do update set prenom = excluded.prenom`, [u.id, u.email, u.prenom])
  }
  await db.query(`insert into public.children (id, user_id, prenom, date_naissance) values ($1, $2, 'Léo', '2019-06-01')`, [c1, A.id])
  const inv = await as(db, A, `select * from public.create_family_invitation($1, 'parent', array[$2]::uuid[])`, [B.email, c1])
  await as(db, B, `select public.accept_family_invitation($1)`, [inv[0].token])
  const invD = await as(db, A, `select * from public.create_family_invitation($1, 'proche', array[$2]::uuid[])`, [D.email, c1])
  await as(db, D, `select public.accept_family_invitation($1)`, [invD[0].token])

  const photo = `${A.id}/child-${c1}.jpg`
  const own = `${A.id}/avatar.jpg`
  await db.query(`insert into storage.objects (bucket_id, name) values ('avatars', $1), ('avatars', $2)`, [photo, own])
  check('photo non liée : l’autre parent ne lit rien', (await avatars(db, B)).length === 0)
  await as(db, A, `update public.children set photo_url = $2 where id = $1`, [c1, photo])

  check('titulaire : lit ses deux fichiers', (await avatars(db, A)).length === 2)
  const seenB = await avatars(db, B)
  check('autre parent : lit la photo de l’enfant', seenB.length === 1 && seenB[0] === photo, JSON.stringify(seenB))
  check('autre parent : ne lit pas l’avatar du titulaire', !seenB.includes(own))
  check('proche : ne lit pas la photo', (await avatars(db, D)).length === 0)
  check('tiers : ne lit pas la photo', (await avatars(db, X)).length === 0)
  check('autre parent : ne peut pas déposer dans le dossier du titulaire',
    !!(await as(db, B, `insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [`${A.id}/child-x.jpg`]).then(() => null, (e) => e)))

  await db.query(`update public.children set deleted_at = now() where id = $1`, [c1])
  check('fiche supprimée : l’autre parent ne lit plus la photo', (await avatars(db, B)).length === 0)

  console.log(`\n0590 : ${pass} ok, ${fail} échec(s)`)
  if (fail) process.exitCode = 1
}
