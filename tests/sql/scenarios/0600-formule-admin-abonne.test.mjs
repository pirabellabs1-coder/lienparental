// Scénarios 0600_formule_admin_abonne.sql : un administrateur abonné reçoit la formule qu'il paie.
// M = admin abonné Coparentalité+, N = admin sans abonnement, F = compte gratuit, P = parent lié à M.
const U = (n) => `00000000-0000-0000-0000-0000000060${n}`
const M = { id: U('0a'), email: 'admin60@test.fr' }
const N = { id: U('0b'), email: 'admin60b@test.fr' }
const F = { id: U('0f'), email: 'free60@test.fr' }
const P = { id: U('0c'), email: 'parent60@test.fr' }
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
const eff = async (db, u) => (await db.query(`select * from public.effective_plan_details($1)`, [u.id])).rows[0]
const creditsPlan = async (db, u) => (await db.query(`select plan from public._credits_period($1, now())`, [u.id])).rows[0].plan

export default async function run(db) {
  console.log('\n== Formule d’un administrateur abonné (0600)')
  for (const u of [M, N, F, P]) {
    await db.query(`insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())`, [u.id, u.email])
    await db.query(`insert into public.users (id, email, prenom) values ($1, $2, 'T') on conflict (id) do nothing`, [u.id, u.email])
  }
  await db.query(`update public.users set plan = 'admin' where id in ($1, $2)`, [M.id, N.id])
  await db.query(
    `insert into public.subscriptions (user_id, stripe_customer_id, stripe_subscription_id, plan, status, current_period_start, current_period_end)
     values ($1, 'cus_60', 'sub_60', 'coparentalite_monthly', 'active', now() - interval '1 day', now() + interval '29 days')`, [M.id])

  let e = await eff(db, M)
  check('admin abonné : formule Coparentalité+', e.plan === 'coparentalite' && e.own_plan === 'coparentalite' && e.via === 'abonnement', JSON.stringify(e))
  check('admin abonné : crédits de la formule', (await creditsPlan(db, M)) === 'coparentalite')
  check('admin abonné : reste administrateur', (await db.query(`select plan::text from public.users where id = $1`, [M.id])).rows[0].plan === 'admin')
  e = await eff(db, N)
  check('admin sans abonnement : gratuit', e.plan === 'free' && e.via === null, JSON.stringify(e))
  check('admin sans abonnement : crédits gratuits', (await creditsPlan(db, N)) === 'gratuit')
  e = await eff(db, F)
  check('compte gratuit inchangé', e.plan === 'free', JSON.stringify(e))

  // Parent lié à l'admin abonné Coparentalité+ : relevé à Premium (même règle qu'un abonné ordinaire).
  await db.query(`insert into public.children (id, user_id, prenom, date_naissance) values ($1, $2, 'Léa', '2019-06-01')`, [c1, M.id])
  const inv = await as(db, M, `select * from public.create_family_invitation($1, 'parent', array[$2]::uuid[])`, [P.email, c1])
  await as(db, P, `select public.accept_family_invitation($1)`, [inv[0].token])
  e = await eff(db, P)
  check('parent lié : Premium via la famille', e.plan === 'premium' && e.via === 'famille', JSON.stringify(e))

  // Abonnement résilié : retour au gratuit.
  await db.query(`update public.subscriptions set status = 'canceled' where user_id = $1`, [M.id])
  e = await eff(db, M)
  check('admin résilié : gratuit', e.plan === 'free', JSON.stringify(e))
  check('admin résilié : crédits gratuits', (await creditsPlan(db, M)) === 'gratuit')

  // Accès : la fonction reste réservée au serveur.
  let denied = false
  try { await as(db, F, `select public.user_own_tier($1)`, [M.id]) } catch { denied = true }
  check('user_own_tier refusé aux comptes connectés', denied)

  return { pass, fail }
}
