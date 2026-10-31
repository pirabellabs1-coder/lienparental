// Scénarios 0630_prenoms_enfants.sql : un prénom par compte, homonymes à date différente signalés.
// A = parent titulaire de « Sharmine », B = autre parent qui partage sa propre « Sharmine » avec A.
const U = (n) => `00000000-0000-0000-0000-0000000063${n}`
const A = { id: U('0a'), email: 'pren63a@test.fr' }
const B = { id: U('0b'), email: 'pren63b@test.fr' }
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
  console.log('\n== Prénoms des enfants (0630)')
  for (const u of [A, B]) {
    await db.query(`insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())`, [u.id, u.email])
    await db.query(`insert into public.users (id, email, prenom) values ($1, $2, $3) on conflict (id) do update set prenom = excluded.prenom`, [u.id, u.email, u === A ? 'Lorenzo' : 'Mélanie'])
  }
  const a1 = (await db.query(`insert into public.children (user_id, prenom, date_naissance) values ($1, 'Sharmine', '2019-03-01') returning id`, [A.id])).rows[0].id

  let e = await err(db.query(`insert into public.children (user_id, prenom, date_naissance) values ($1, ' sharmine ', '2020-01-01')`, [A.id]))
  check('même compte : second « Sharmine » refusé (casse et espaces ignorés)', e?.code === '23505', e?.message)
  e = await err(db.query(`insert into public.children (user_id, prenom, date_naissance) values ($1, 'Shàrmine', '2020-01-01')`, [A.id]))
  check('même compte : variante accentuée refusée', e?.code === '23505', e?.message)
  e = await err(db.query(`insert into public.children (user_id, prenom, date_naissance) values ($1, 'Layana', '2021-01-01')`, [A.id]))
  check('même compte : autre prénom accepté', !e, e?.message)
  e = await err(db.query(`insert into public.children (user_id, prenom, date_naissance) values ($1, 'Sharmine', '2019-03-02')`, [B.id]))
  check('autre compte : même prénom accepté', !e, e?.message)

  // Fiche supprimée : le prénom redevient libre.
  await db.query(`update public.children set deleted_at = now() where id = $1`, [a1])
  e = await err(db.query(`insert into public.children (user_id, prenom, date_naissance) values ($1, 'Sharmine', '2019-03-01')`, [A.id]))
  check('après suppression : prénom de nouveau disponible', !e, e?.message)

  // B partage sa Sharmine avec A (gardien parent actif), dates de naissance différentes.
  const b1 = (await db.query(`select id from public.children where user_id = $1 and prenom = 'Sharmine'`, [B.id])).rows[0].id
  await db.query(`insert into public.child_guardians (child_id, user_id, role, status, invited_by) values ($1, $2, 'parent', 'active', $3)`, [b1, A.id, B.id])
  const conflicts = await as(db, A, `select * from public.list_child_name_conflicts()`)
  check('homonyme partagé à date différente signalé', conflicts.length === 1 && conflicts[0].shared_child_id === b1 && conflicts[0].shared_owner_prenom === 'Mélanie', JSON.stringify(conflicts))
  const merge = await as(db, A, `select * from public.list_merge_candidates()`)
  check('pas proposé à la fusion tant que les dates diffèrent', merge.length === 0)

  // A corrige la date : la fusion est proposée, le conflit disparaît.
  await db.query(`update public.children set date_naissance = '2019-03-02' where user_id = $1 and prenom = 'Sharmine' and deleted_at is null`, [A.id])
  check('date corrigée : conflit levé', (await as(db, A, `select * from public.list_child_name_conflicts()`)).length === 0)
  check('date corrigée : fusion proposée', (await as(db, A, `select * from public.list_merge_candidates()`)).length === 1)

  // Compte sans fiche ni partage : rien ne fuit (refus ou liste vide).
  let other = null
  e = await err(as(db, { id: '00000000-0000-0000-0000-000000006399', email: 'x@x.fr' }, `select * from public.list_child_name_conflicts()`).then((r) => { other = r }))
  check('compte étranger : aucune donnée', e !== null || (other && other.length === 0))

  return { pass, fail }
}
