// Scénarios 0560_quota_stockage.sql : blocage en base au-delà du quota de l'offre.
// Verrou du coffre désactivé pour ces comptes (vaultOpen).
export const vaultOpen = true
const U = (n) => `00000000-0000-0000-0000-0000000056${n}`
const F = { id: U('01'), email: 'free56@test.fr', prenom: 'Fanny' }
const P = { id: U('02'), email: 'premium56@test.fr', prenom: 'Pierre' }
const GO = 1073741824
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

const INSERT = `insert into public.documents (user_id, name, mime, size_bytes, storage_path)
  values ($1::uuid, 'doc', 'application/pdf', $2::bigint, $1::text || '/' || gen_random_uuid()::text || '.pdf') returning id, size_bytes`

export default async function run(db) {
  console.log('\n== Quota de stockage (0560)')
  for (const u of [F, P]) {
    await db.query(`insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())`, [u.id, u.email])
    await db.query(`insert into public.users (id, email, prenom) values ($1, $2, $3) on conflict (id) do update set prenom = excluded.prenom`, [u.id, u.email, u.prenom])
  }
  await db.query(`update public.users set plan = 'premium' where id = $1`, [P.id])

  console.log(' -- quota de l’offre')
  check('gratuit : un fichier sous la limite passe', (await as(db, F, INSERT, [F.id, 2 * GO - 1000])).length === 1)
  const e1 = await err(as(db, F, INSERT, [F.id, 2000]))
  check('gratuit : au-delà de 2 Go refusé (54000 storage_quota)', e1?.code === '54000' && e1?.hint === 'storage_quota', e1?.message)
  check('gratuit : un petit fichier qui tient encore passe', (await as(db, F, INSERT, [F.id, 500])).length === 1)
  check('premium : 5 Go passent', (await as(db, P, INSERT, [P.id, 5 * GO])).length === 1)
  const e2 = await err(as(db, P, INSERT, [P.id, 6 * GO]))
  check('premium : au-delà de 10 Go refusé', e2?.code === '54000', e2?.message)

  console.log(' -- corbeille et taille réelle')
  await db.query(`update public.documents set deleted_at = now() where user_id = $1`, [P.id])
  check('la corbeille occupe encore la place', (await err(as(db, P, INSERT, [P.id, 6 * GO])))?.code === '54000')
  const path = `${P.id}/reel.pdf`
  await db.query(`insert into storage.objects (bucket_id, name, owner, metadata) values ('documents', $1, $2, jsonb_build_object('size', $3::bigint))`, [path, P.id, 6 * GO])
  const lie = await err(as(db, P, `insert into public.documents (user_id, name, mime, size_bytes, storage_path) values ($1, 'x', 'application/pdf', 1, $2)`, [P.id, path]))
  check('taille déclarée mensongère : la taille réelle est comptée', lie?.code === '54000', lie?.message)

  console.log(' -- lecture de l’usage')
  const me = (await as(db, F, `select * from public.my_storage_usage()`))[0]
  check('my_storage_usage : ses propres chiffres', Number(me?.used_bytes) === 2 * GO - 500 && Number(me?.quota_bytes) === 2 * GO && me?.plan === 'free', JSON.stringify(me))
  check('storage_used_bytes non appelable par un utilisateur', (await err(as(db, F, `select public.storage_used_bytes($1)`, [P.id]))) !== null)

  console.log(`\n0560 : ${pass} ok, ${fail} échec(s)`)
  if (fail) process.exitCode = 1
}
