// Scénarios 0610_stockage_supplementaire.sql : espace acheté ajouté au quota, idempotence, révocation.
// A = compte gratuit (2 Go) qui achète +20 Go, B = autre compte gratuit.
const U = (n) => `00000000-0000-0000-0000-0000000061${n}`
const A = { id: U('0a'), email: 'stock61a@test.fr' }
const B = { id: U('0b'), email: 'stock61b@test.fr' }
const GiB = 1073741824
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
const grant = (db, u, session, pi, at = 'now()') => db.query(
  `select public.grant_storage_pack($1, 'storage_20', 20, 999, 'EUR', $2, $3, ${at}, 12) as r`, [u.id, session, pi])
// Document de `gb` Go (taille déclarée ; aucun objet Storage, la taille déclarée fait foi).
const addDoc = (db, u, name, gb) => db.query(
  `insert into public.documents (user_id, name, mime, size_bytes, storage_path) values ($1::uuid, $2::text, 'application/pdf', $3, $1::text || '/' || $2::text)`,
  [u.id, name, Math.round(gb * GiB)])
const quota = async (db, u) => Number((await as(db, u, `select quota_bytes from public.my_storage_usage()`))[0].quota_bytes)

export default async function run(db) {
  console.log('\n== Espace de stockage acheté (0610)')
  for (const u of [A, B]) {
    await db.query(`insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())`, [u.id, u.email])
    await db.query(`insert into public.users (id, email, prenom) values ($1, $2, 'T') on conflict (id) do nothing`, [u.id, u.email])
  }

  check('gratuit : quota de 2 Go', (await quota(db, A)) === 2 * GiB)
  await addDoc(db, A, 'a1.pdf', 1.5)
  let refused = false
  try { await addDoc(db, A, 'a2.pdf', 1) } catch (e) { refused = e.code === '54000' }
  check('au-delà de 2 Go : ajout refusé', refused)

  let r = (await grant(db, A, 'cs_test_61aaaaaaaaaaaa', 'pi_61aaaaaaaa')).rows[0].r
  check('achat accordé', r.outcome === 'granted', JSON.stringify(r))
  r = (await grant(db, A, 'cs_test_61aaaaaaaaaaaa', 'pi_61aaaaaaaa')).rows[0].r
  check('même session rejouée : aucun double octroi', r.outcome === 'duplicate')
  check('quota = 2 + 20 Go', (await quota(db, A)) === 22 * GiB)
  let ok = true
  try { await addDoc(db, A, 'a3.pdf', 5) } catch { ok = false }
  check('ajout de 5 Go accepté après achat', ok)

  check('le propriétaire voit son lot', (await as(db, A, `select gigabytes from public.storage_purchases`)).length === 1)
  check('un autre compte ne le voit pas', (await as(db, B, `select gigabytes from public.storage_purchases`)).length === 0)
  check('autre compte : quota inchangé', (await quota(db, B)) === 2 * GiB)

  let denied = false
  try { await as(db, A, `select public.grant_storage_pack($1, 'storage_100', 100, 0, 'eur', 'cs_test_61forgedforged', null, now(), 12)`, [A.id]) } catch { denied = true }
  check('grant_storage_pack refusé aux comptes connectés', denied)
  denied = false
  try { await as(db, A, `insert into public.storage_purchases (user_id, pack, gigabytes, amount_cents, currency, stripe_session_id, purchased_at, expires_at) values ($1, 'storage_100', 100, 0, 'eur', 'x', now(), now() + interval '1 year')`, [A.id]) } catch { denied = true }
  check('insertion directe refusée', denied)

  // Remboursement : lot révoqué, fichiers conservés, nouveaux ajouts bloqués.
  const n = Number((await db.query(`select public.storage_revoke_payment('pi_61aaaaaaaa', 'refund') as n`)).rows[0].n)
  check('remboursement : lot révoqué', n === 1 && (await quota(db, A)) === 2 * GiB)
  check('fichiers conservés', (await db.query(`select count(*)::int as c from public.documents where user_id = $1`, [A.id])).rows[0].c === 2)
  refused = false
  try { await addDoc(db, A, 'a4.pdf', 0.01) } catch (e) { refused = e.code === '54000' }
  check('après révocation : nouvel ajout refusé', refused)

  // Lot expiré : ne compte plus.
  await grant(db, B, 'cs_test_61bbbbbbbbbbbb', 'pi_61bbbbbbbb', `now() - interval '13 months'`)
  check('lot expiré : quota de base', (await quota(db, B)) === 2 * GiB)

  return { pass, fail }
}
