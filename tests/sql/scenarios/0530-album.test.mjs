// Scénarios 0530_album.sql (PGlite + stubs Supabase) : album de l'enfant.
// A = Nadia (titulaire d'Ines), B = David (gardien parent d'Ines), D = Ana (proche d'Ines), X = tiers.
// Verrou du coffre désactivé pour ces comptes (vaultOpen).
export const vaultOpen = true
const U = (n) => `00000000-0000-0000-0000-0000000005${n}`
const A = { id: U('0a'), email: 'nadia53@test.fr', prenom: 'Nadia' }
const B = { id: U('0b'), email: 'david53@test.fr', prenom: 'David' }
const D = { id: U('0d'), email: 'ana53@test.fr', prenom: 'Ana' }
const X = { id: U('99'), email: 'x53@test.fr', prenom: 'X' }
const c1 = U('c1')

let pass = 0, fail = 0
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log('  ok  ', name) } else { fail++; console.log('  FAIL', name, extra) }
}
async function as(db, who, sql, params = []) {
  return db.transaction(async (tx) => {
    const claims = { sub: who.id, email: who.email, aal: 'aal1', role: 'authenticated' }
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)])
    await tx.exec('set local role authenticated')
    return (await tx.query(sql, params)).rows
  })
}
async function err(p) { try { await p; return null } catch (e) { return e } }
const objs = async (db, who) => (await as(db, who, `select name from storage.objects where bucket_id = 'documents' order by name`)).map((r) => r.name)

export default async function run(db) {
  console.log('\n== Album de l\'enfant (0530)')
  for (const u of [A, B, D, X]) {
    await db.query(`insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())`, [u.id, u.email])
    await db.query(`insert into public.users (id, email, prenom) values ($1, $2, $3) on conflict (id) do update set prenom = excluded.prenom`, [u.id, u.email, u.prenom])
  }
  await db.query(`insert into public.children (id, user_id, prenom, date_naissance) values ($1, $2, 'Ines', '2020-03-08')`, [c1, A.id])
  const inv = await as(db, A, `select * from public.create_family_invitation($1, 'parent', array[$2]::uuid[])`, [B.email, c1])
  await as(db, B, `select public.accept_family_invitation($1)`, [inv[0].token])
  const invD = await as(db, A, `select * from public.create_family_invitation($1, 'proche', array[$2]::uuid[])`, [D.email, c1])
  await as(db, D, `select public.accept_family_invitation($1)`, [invD[0].token])

  // --- 1. Ajout de photos par la titulaire ------------------------------------
  console.log(' -- ajout')
  const rows = await as(db, A, `insert into public.documents
      (user_id, name, mime, size_bytes, storage_path, thumb_path, doc_date, children_ids, album, important, family_shared) values
      ($1::uuid, 'Premier jour d''école', 'image/jpeg', 10, $1::text || '/p1.jpg', $1::text || '/p1-thumb.jpg', '2026-09-01', array[$2]::uuid[], 'ecole', true, true),
      ($1::uuid, 'Plage', 'image/jpeg', 10, $1::text || '/p2.jpg', $1::text || '/p2-thumb.jpg', '2026-07-14', array[$2]::uuid[], 'vacances', false, false)
      returning id, name`, [A.id, c1])
  const pShared = rows.find((r) => r.name === 'Premier jour d\'école').id
  const pPrivate = rows.find((r) => r.name === 'Plage').id
  await db.query(`insert into storage.objects (bucket_id, name) select 'documents', $1::text || p from unnest(array['/p1.jpg','/p1-thumb.jpg','/p2.jpg','/p2-thumb.jpg']) p`, [A.id])
  check('photo enregistrée avec album, moment important et vignette', rows.length === 2)
  check('album inconnu refusé (23514)', (await err(as(db, A, `update public.documents set album = 'soiree' where id = $1`, [pPrivate])))?.code === '23514')
  check('la titulaire reclasse sa photo (album, moment important)', (await as(db, A, `update public.documents set album = 'famille', important = true where id = $1 returning id`, [pPrivate])).length === 1)

  // --- 2. Vignette hors du dossier du propriétaire -----------------------------
  console.log(' -- vignette')
  check('vignette dans le dossier d\'un autre utilisateur refusée (23514)',
    (await err(as(db, A, `insert into public.documents (user_id, name, mime, size_bytes, storage_path, thumb_path) values ($1::uuid, 'x', 'image/jpeg', 1, $1::text || '/x.jpg', $2::text || '/secret.jpg')`, [A.id, X.id])))?.code === '23514')
  check('vignette avec « .. » refusée (23514)',
    (await err(as(db, A, `insert into public.documents (user_id, name, mime, size_bytes, storage_path, thumb_path) values ($1::uuid, 'x', 'image/jpeg', 1, $1::text || '/x.jpg', $1::text || '/../x.jpg')`, [A.id])))?.code === '23514')
  check('vignette non modifiable après coup (aucun droit UPDATE)',
    (await err(as(db, A, `update public.documents set thumb_path = $1::text || '/autre.jpg' where id = $2`, [A.id, pShared]))) !== null)

  // --- 3. Lecture par l'autre parent, un proche, un tiers ----------------------
  console.log(' -- partage')
  const seenB = (await as(db, B, `select id from public.documents where mime like 'image/%'`)).map((r) => r.id)
  check('B (parent) voit la photo partagée', seenB.includes(pShared))
  check('B ne voit pas la photo privée', !seenB.includes(pPrivate))
  const fB = await objs(db, B)
  check('B lit le fichier ET la vignette de la photo partagée', fB.includes(`${A.id}/p1.jpg`) && fB.includes(`${A.id}/p1-thumb.jpg`), fB.join(','))
  check('B ne lit ni le fichier ni la vignette de la photo privée', !fB.includes(`${A.id}/p2.jpg`) && !fB.includes(`${A.id}/p2-thumb.jpg`))
  check('B ne peut pas reclasser la photo de A',
    (await as(db, B, `update public.documents set album = 'autre', important = false where id = $1 returning id`, [pShared])).length === 0)
  check('B ne peut pas la mettre en corbeille',
    (await err(as(db, B, `select public.soft_delete_document($1)`, [pShared]))) !== null
      || (await as(db, A, `select deleted_at from public.documents where id = $1`, [pShared]))[0].deleted_at === null)
  check('proche : aucune photo (documents réservés aux parents)', (await as(db, D, `select id from public.documents`)).length === 0)
  check('proche : aucun fichier', (await objs(db, D)).length === 0)
  check('tiers : aucune photo, aucun fichier', (await as(db, X, `select id from public.documents`)).length === 0 && (await objs(db, X)).length === 0)

  // --- 4. Fin du partage ---------------------------------------------------------
  console.log(' -- fin du partage')
  await as(db, A, `update public.documents set family_shared = false where id = $1`, [pShared])
  const fB2 = await objs(db, B)
  check('partage retiré : B ne lit plus le fichier ni la vignette', !fB2.includes(`${A.id}/p1.jpg`) && !fB2.includes(`${A.id}/p1-thumb.jpg`), fB2.join(','))
  await as(db, A, `update public.documents set family_shared = true where id = $1`, [pShared])
  await as(db, A, `select public.soft_delete_document($1)`, [pShared])
  check('photo en corbeille : B ne lit plus la vignette', !(await objs(db, B)).includes(`${A.id}/p1-thumb.jpg`))

  console.log(`\n0530 : ${pass} ok, ${fail} échec(s)`)
  if (fail) process.exitCode = 1
}
