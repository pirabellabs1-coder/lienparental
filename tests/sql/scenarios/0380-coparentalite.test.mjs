// Scénarios 0380_plan_coparentalite.sql. A titulaire de Lina, B gardien parent, C proche, X tiers.
const U = (n) => `00000000-0000-0000-0000-0000000008${n}`
const A = { id: U('0a'), email: 'julie8@test.fr', prenom: 'Julie' }
const B = { id: U('0b'), email: 'thomas8@test.fr', prenom: 'Thomas' }
const C = { id: U('0c'), email: 'rose8@test.fr', prenom: 'Rose' }
const X = { id: U('99'), email: 'x8@test.fr', prenom: 'X' }
const c1 = U('c1')
const sid = () => crypto.randomUUID()
let pass = 0, fail = 0
function check(name, cond, extra = '') { if (cond) { pass++; console.log('  ok  ', name) } else { fail++; console.log('  FAIL', name, extra) } }
async function as(db, who, sql, params = []) {
  return db.transaction(async (tx) => {
    const claims = { sub: who.id, email: who.email, aal: 'aal1', role: 'authenticated', session_id: sid() }
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)])
    await tx.exec('set local role authenticated')
    return (await tx.query(sql, params)).rows
  })
}
async function svc(db, sql, params = []) {
  return db.transaction(async (tx) => { await tx.exec('set local role service_role'); return (await tx.query(sql, params)).rows })
}
async function err(p) { try { await p; return null } catch (e) { return e } }
const eff = async (db, u) => (await svc(db, `select * from public.effective_plan_details($1)`, [u.id]))[0]

export default async function run(db) {
  console.log('\n== Coparentalité+ (0380)')
  for (const u of [A, B, C, X]) {
    await db.query(`insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())`, [u.id, u.email])
    await db.query(`insert into public.users (id, email, prenom) values ($1, $2, $3) on conflict (id) do update set prenom = excluded.prenom`, [u.id, u.email, u.prenom])
  }
  await db.query(`insert into public.children (id, user_id, prenom, date_naissance) values ($1, $2, 'Lina', '2019-05-12')`, [c1, A.id])
  const invB = await as(db, A, `select * from public.create_family_invitation($1, 'parent', array[$2]::uuid[])`, [B.email, c1])
  await as(db, B, `select public.accept_family_invitation($1)`, [invB[0].token])
  const invC = await as(db, A, `select * from public.create_family_invitation($1, 'proche', array[$2]::uuid[])`, [C.email, c1])
  await as(db, C, `select public.accept_family_invitation($1)`, [invC[0].token])

  // Enum + garde-fou
  check('service_role pose users.plan = coparentalite', !(await err(svc(db, `update public.users set plan = 'coparentalite' where id = $1`, [A.id]))))
  const e1 = await err(as(db, B, `update public.users set plan = 'coparentalite' where id = auth.uid()`))
  check('authenticated ne peut pas se donner coparentalite (privilège de colonne ou garde-fou)', e1 && /read-only|permission denied/.test(e1.message), e1?.message)
  check('subscription_plan accepte coparentalite_yearly', !(await err(db.query(`select 'coparentalite_yearly'::public.subscription_plan`))))

  // Plan effectif
  let r = await eff(db, A); check('A titulaire coparentalite → coparentalite/abonnement', r.plan === 'coparentalite' && r.via === 'abonnement', JSON.stringify(r))
  r = await eff(db, B); check('B gardien parent → premium via famille', r.plan === 'premium' && r.own_plan === 'free' && r.via === 'famille', JSON.stringify(r))
  r = await eff(db, C); check('C proche → free', r.plan === 'free' && r.via === null, JSON.stringify(r))
  r = await eff(db, X); check('X tiers → free', r.plan === 'free', JSON.stringify(r))
  r = (await svc(db, `select public.effective_plan($1) as p`, [U('77')]))[0]; check('inconnu → free', r.p === 'free')

  // Symétrie : B paie, A gratuit
  await svc(db, `update public.users set plan = 'free' where id = $1`, [A.id])
  await svc(db, `update public.users set plan = 'coparentalite' where id = $1`, [B.id])
  r = await eff(db, A); check('symétrique : A titulaire gratuit, B coparentalite → A premium via famille', r.plan === 'premium' && r.via === 'famille', JSON.stringify(r))
  r = await eff(db, C); check('proche jamais bénéficiaire', r.plan === 'free')
  // Premium n'est pas partagé
  await svc(db, `update public.users set plan = 'premium' where id = $1`, [B.id])
  r = await eff(db, A); check('premium ne se partage pas', r.plan === 'free', JSON.stringify(r))
  await svc(db, `update public.users set plan = 'free' where id = $1`, [B.id])
  await svc(db, `update public.users set plan = 'coparentalite' where id = $1`, [A.id])

  // Accès refusé aux clients
  const e2 = await err(as(db, B, `select public.effective_plan($1)`, [A.id]))
  check('authenticated ne lit pas le plan d\'un tiers', e2 && /permission denied/.test(e2.message), e2?.message)

  // Tickets
  let t = await as(db, B, `insert into public.support_tickets (user_id, subject, body, priority) values (auth.uid(), 's', 'b', 'urgent') returning priority`)
  check('ticket B (premium via famille) → normal, urgent ignoré', t[0].priority === 'normal', t[0].priority)
  t = await as(db, A, `insert into public.support_tickets (user_id, subject, body) values (auth.uid(), 's', 'b') returning id, priority`)
  check('ticket A (coparentalite) → high', t[0].priority === 'high', t[0].priority)
  const u2 = await as(db, A, `update public.support_tickets set priority = 'urgent', subject = 's2' where id = $1 returning priority, subject`, [t[0].id])
  check('l\'utilisateur ne change pas la priorité', u2[0].priority === 'high' && u2[0].subject === 's2', JSON.stringify(u2[0]))
  t = await as(db, X, `insert into public.support_tickets (user_id, subject, body) values (auth.uid(), 's', 'b') returning priority`)
  check('ticket gratuit → low', t[0].priority === 'low')
  t = await svc(db, `insert into public.support_tickets (user_id, subject, body, priority) values ($1, 's', 'b', 'urgent') returning priority`, [X.id])
  check('service_role garde la main', t[0].priority === 'urgent')

  // Quota historique
  const q = (await svc(db, `select quota from public.compute_ai_cycle_window($1)`, [B.id]))[0]
  check('compute_ai_cycle_window : B premium via famille → 10', q.quota === 10, JSON.stringify(q))
  const q2 = (await svc(db, `select quota from public.compute_ai_cycle_window($1)`, [X.id]))[0]
  check('compute_ai_cycle_window : gratuit → 3', q2.quota === 3)

  // Stats admin
  await svc(db, `insert into public.subscriptions (user_id, stripe_customer_id, stripe_subscription_id, plan, status, created_at)
                 values ($1, 'cus_a8', 'sub_a8', 'coparentalite_yearly', 'active', now() - interval '40 days')`, [A.id])
  const s = (await svc(db, `select * from public.admin_stats_coparentalite_at(now())`))[0]
  check('admin_stats_coparentalite_at compte l\'annuel', Number(s.yearly) === 1 && Number(s.monthly) === 0, JSON.stringify(s))
  const p = (await svc(db, `select * from public.admin_stats_premium_at(now())`))[0]
  check('admin_stats_premium_at ne double-compte pas', Number(p.yearly) === 0 && Number(p.monthly) === 0, JSON.stringify(p))
  const e3 = await err(as(db, B, `select public.admin_stats_coparentalite(now() - interval '30 days', now())`))
  check('admin_stats_coparentalite refusée à un non-admin', e3 && /admin only/.test(e3.message), e3?.message)

  // Révocation
  await svc(db, `update public.child_guardians set status = 'revoked', revoked_at = now() where user_id = $1`, [B.id])
  r = await eff(db, B); check('révocation → B redevient free', r.plan === 'free', JSON.stringify(r))

  console.log(`\n0380 : ${pass} ok, ${fail} échec(s)`)
  if (fail) process.exitCode = 1
}
