// Scénarios 0460_billing_sync_guard.sql : synchronisation Stripe atomique et ordonnée.
const U = (n) => `00000000-0000-0000-0000-0000000046${n}`
const A = { id: U('0a'), email: 'a46@test.fr' }
const ADM = { id: U('0b'), email: 'admin46@test.fr' }
const sid = () => crypto.randomUUID()
let pass = 0, fail = 0
function check(name, cond, extra = '') { if (cond) { pass++; console.log('  ok  ', name) } else { fail++; console.log('  FAIL', name, extra) } }
async function svc(db, sql, params = []) {
  return db.transaction(async (tx) => { await tx.exec('set local role service_role'); return (await tx.query(sql, params)).rows })
}
async function as(db, who, sql, params = []) {
  return db.transaction(async (tx) => {
    const claims = { sub: who.id, email: who.email, aal: 'aal1', role: 'authenticated', session_id: sid() }
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)])
    await tx.exec('set local role authenticated')
    return (await tx.query(sql, params)).rows
  })
}
async function err(p) { try { await p; return null } catch (e) { return e } }

const row = (over = {}) => ({
  user_id: A.id, stripe_customer_id: 'cus_46', stripe_subscription_id: 'sub_46A', plan: 'premium_monthly', status: 'active',
  current_period_start: '2026-10-01T00:00:00Z', current_period_end: '2026-11-01T00:00:00Z',
  cancel_at_period_end: false, canceled_at: null, trial_end: null, ...over,
})
const apply = async (db, r, tier, at) =>
  (await svc(db, `select public.billing_apply_subscription($1::jsonb, $2, $3::timestamptz) as res`, [JSON.stringify(r), tier, at]))[0].res
const plan = async (db, u) => (await db.query(`select plan from public.users where id = $1`, [u.id])).rows[0].plan
const sub = async (db, u) => (await db.query(`select * from public.subscriptions where user_id = $1`, [u.id])).rows[0]

export default async function run(db) {
  console.log('\n== Synchronisation Stripe (0460)')
  for (const u of [A, ADM]) {
    await db.query(`insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())`, [u.id, u.email])
    await db.query(`insert into public.users (id, email, prenom) values ($1, $2, 'T') on conflict (id) do nothing`, [u.id, u.email])
  }
  await db.query(`update public.users set plan = 'admin' where id = $1`, [ADM.id])

  let r = await apply(db, row(), 'premium', '2026-10-27T10:00:00Z')
  check('écrit abonnement + users.plan', r.outcome === 'ok' && (await plan(db, A)) === 'premium', JSON.stringify(r))
  r = await apply(db, row(), 'premium', '2026-10-27T10:00:00Z')
  check('rejouer : idempotent', r.outcome === 'ok' && (await sub(db, A)).status === 'active')

  r = await apply(db, row({ plan: 'coparentalite_monthly' }), 'coparentalite', '2026-10-27T10:05:00Z')
  check('lecture plus récente appliquée', r.outcome === 'ok' && (await plan(db, A)) === 'coparentalite')
  r = await apply(db, row({ plan: 'premium_monthly' }), 'premium', '2026-10-27T10:01:00Z')
  check('lecture plus ANCIENNE ignorée (course webhook / retour Checkout)', r.outcome === 'outdated' && (await plan(db, A)) === 'coparentalite', JSON.stringify(r))

  r = await apply(db, row({ stripe_subscription_id: 'sub_46OLD', status: 'canceled' }), 'free', '2026-10-27T11:00:00Z')
  check('ancien abonnement terminé n’écrase pas l’abonnement en cours', r.outcome === 'stale' && (await sub(db, A)).stripe_subscription_id === 'sub_46A')

  r = await apply(db, row({ status: 'canceled' }), 'free', '2026-10-27T12:00:00Z')
  check('résiliation : users.plan repasse free', r.outcome === 'ok' && (await plan(db, A)) === 'free' && r.previous?.status === 'active')

  r = await apply(db, row({ user_id: ADM.id, stripe_customer_id: 'cus_46adm', stripe_subscription_id: 'sub_46ADM' }), 'premium', '2026-10-27T10:00:00Z')
  check('un administrateur reste administrateur', r.outcome === 'ok' && (await plan(db, ADM)) === 'admin')

  r = await apply(db, row({ user_id: U('77'), stripe_subscription_id: 'sub_46X' }), 'premium', '2026-10-27T10:00:00Z')
  check('utilisateur inconnu → unknown_user, rien écrit', r.outcome === 'unknown_user')

  check('tier invalide refusé', !!(await err(apply(db, row(), 'admin', '2026-10-27T13:00:00Z'))))
  const e = await err(as(db, A, `select public.billing_apply_subscription($1::jsonb, 'coparentalite', now())`, [JSON.stringify(row())]))
  check('authenticated ne peut pas appeler la fonction', e && /permission denied/.test(e.message), e?.message)

  console.log(`\n0460 : ${pass} ok, ${fail} échec(s)`)
  if (fail) process.exitCode = 1
}
