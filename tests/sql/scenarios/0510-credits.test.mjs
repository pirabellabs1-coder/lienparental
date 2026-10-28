// Scénarios 0510_ai_credits.sql : crédits d'analyses du Coach IA (achat idempotent, quota puis crédit,
// lot le plus ancien d'abord, expiration, remboursement, concurrence, isolement entre comptes, RLS).
const U = (n) => `00000000-0000-0000-0000-0000000051${n}`
const A = { id: U('0a'), email: 'a51@test.fr' }
const B = { id: U('0b'), email: 'b51@test.fr' }
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

const session = (n) => `cs_test_${'s0510x'.padEnd(10, 'x')}${n}`
const grant = async (db, u, s, qty = 10, at = new Date().toISOString(), months = 12) =>
  (await svc(db, `select public.grant_ai_credits($1, 'pack10', $2, 299, 'EUR', $3, 'pi_x', $4::timestamptz, $5, now()) as r`, [u.id, qty, s, at, months]))[0].r
const reserve = async (db, u, limit = 2) =>
  (await svc(db, `select public.reserve_ai_analysis($1, $2, 30, $3) as r`, [u.id, limit, crypto.randomUUID()]))[0].r
const reserveWith = async (db, u, aid, limit = 2) =>
  (await svc(db, `select public.reserve_ai_analysis($1, $2, 30, $3) as r`, [u.id, limit, aid]))[0].r
const release = async (db, u, aid) => (await svc(db, `select public.release_ai_usage($1, $2) as r`, [u.id, aid]))[0].r
const lots = async (db, u) => (await db.query(`select stripe_session_id, remaining, quantity, expires_at from public.ai_credits where user_id = $1 order by expires_at`, [u.id])).rows
const balance = async (db, u) => (await db.query(`select coalesce(sum(remaining), 0)::int as n from public.ai_credits where user_id = $1 and expires_at > now()`, [u.id])).rows[0].n

export default async function run(db) {
  console.log('\n== Crédits IA (0510)')
  for (const u of [A, B]) {
    await db.query(`insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())`, [u.id, u.email])
    await db.query(`insert into public.users (id, email, prenom) values ($1, $2, 'T') on conflict (id) do nothing`, [u.id, u.email])
  }

  // --- Achat idempotent -----------------------------------------------------------
  let r = await grant(db, A, session(1), 3)
  check('achat crédité', r.outcome === 'granted' && (await balance(db, A)) === 3, JSON.stringify(r))
  r = await grant(db, A, session(1), 3)
  check('même session rejouée : duplicate, pas de double crédit', r.outcome === 'duplicate' && (await balance(db, A)) === 3, JSON.stringify(r))
  r = await grant(db, B, session(1), 3)
  check('même session pour un autre compte : duplicate, rien pour B', r.outcome === 'duplicate' && (await balance(db, B)) === 0)
  r = await grant(db, { id: U('99') }, session(2), 3)
  check('utilisateur inconnu → unknown_user', r.outcome === 'unknown_user')
  const exp = (await lots(db, A))[0].expires_at
  check('expiration = achat + 12 mois', Math.abs(new Date(exp).getTime() - Date.now() - 365 * 86_400_000) < 2 * 86_400_000, String(exp))
  check('session Stripe invalide refusée (contrainte)', !!(await err(svc(db, `select public.grant_ai_credits($1, 'pack10', 10, 299, 'eur', 'cs_bidon', null, now(), 12)`, [A.id]))))
  check('validité hors bornes refusée', !!(await err(grant(db, A, session(3), 10, new Date().toISOString(), 0))))

  // --- Quota d'abord, puis crédit -------------------------------------------------
  const r1 = await reserve(db, A), r2 = await reserve(db, A)
  check('quota (2) consommé en premier, crédits intacts', r1?.source === 'quota' && r2?.source === 'quota' && (await balance(db, A)) === 3)
  const aid = crypto.randomUUID()
  const r3 = await reserveWith(db, A, aid)
  check('quota atteint → 1 crédit consommé', r3?.source === 'credit' && (await balance(db, A)) === 2, JSON.stringify(r3))
  const q = (await db.query(`select count(*)::int as n from public.ai_usage where user_id = $1 and credit_id is null`, [A.id])).rows[0].n
  check('analyse payée par crédit non décomptée du quota', q === 2)
  check('reserve_ai_usage (0270) ignore les lignes payées par crédit', (await svc(db, `select public.reserve_ai_usage($1, 'analysis', 3, 30, $2) as r`, [A.id, crypto.randomUUID()]))[0].r !== null)

  // --- Libération ------------------------------------------------------------------
  check('échec de l’analyse : crédit rendu', (await release(db, A, aid)) === 'credit' && (await balance(db, A)) === 3)
  check('libération rejouée : sans effet', (await release(db, A, aid)) === 'none' && (await balance(db, A)) === 3)
  const aidB = crypto.randomUUID()
  await reserveWith(db, A, aidB)
  check('libération par un autre compte : sans effet', (await release(db, B, aidB)) === 'none' && (await balance(db, A)) === 2)
  check('libération par le propriétaire : crédit rendu', (await release(db, A, aidB)) === 'credit' && (await balance(db, A)) === 3)

  // --- Lot le plus ancien d'abord, expiration ------------------------------------------
  await grant(db, A, session(4), 5, new Date(Date.now() - 400 * 86_400_000).toISOString()) // expiré
  await grant(db, A, session(5), 2, new Date(Date.now() - 100 * 86_400_000).toISOString()) // plus ancien valide
  const before = await lots(db, A)
  await reserve(db, A, 0)
  const after = await lots(db, A)
  const dec = before.map((l, i) => l.remaining - after[i].remaining)
  const oldestValid = before.findIndex((l) => l.stripe_session_id === session(5))
  check('crédit pris sur le lot non expiré le plus ancien', dec[oldestValid] === 1 && dec.reduce((a, b) => a + b, 0) === 1, JSON.stringify(dec))
  const expired = before.findIndex((l) => l.stripe_session_id === session(4))
  check('lot expiré jamais consommé', dec[expired] === 0)

  // --- Épuisement, isolement ----------------------------------------------------------
  for (let i = 0; i < 4; i++) await reserve(db, A, 0)
  check('solde épuisé → NULL (quota atteint, aucun crédit)', (await reserve(db, A, 0)) === null && (await balance(db, A)) === 0)
  await grant(db, B, session(6), 1)
  check('crédits de B jamais consommés pour A', (await reserve(db, A, 0)) === null && (await balance(db, B)) === 1)

  // --- Concurrence : 1 crédit, 5 réservations simultanées ----------------------------------
  const res = await Promise.all(Array.from({ length: 5 }, () => reserve(db, B, 0).catch(() => null)))
  check('concurrence : un seul crédit consommé', res.filter(Boolean).length === 1 && (await balance(db, B)) === 0, JSON.stringify(res))

  // --- RLS / droits ------------------------------------------------------------------------
  const own = await as(db, A, `select pack, remaining, expires_at from public.ai_credits`)
  check('utilisateur : lit ses propres lots', own.length === 3, String(own.length))
  const other = await as(db, B, `select id from public.ai_credits where user_id = $1`, [A.id])
  check('utilisateur : ne lit pas les lots des autres', other.length === 0)
  let e = await err(as(db, A, `select stripe_session_id from public.ai_credits`))
  check('identifiants Stripe non lisibles par le client', e && /permission denied/.test(e.message), e?.message)
  e = await err(as(db, A, `update public.ai_credits set remaining = 999`))
  check('aucune écriture directe (update)', e && /permission denied/.test(e.message), e?.message)
  e = await err(as(db, A, `insert into public.ai_credits (user_id, pack, quantity, remaining, amount_cents, stripe_session_id, expires_at) values ($1, 'pack10', 10, 10, 0, $2, now() + interval '1 year')`, [A.id, session(7)]))
  check('aucune écriture directe (insert)', e && /permission denied/.test(e.message), e?.message)
  for (const fn of [
    `public.grant_ai_credits($1, 'pack10', 10, 0, 'eur', '${session(8)}', null, now(), 12)`,
    `public.reserve_ai_analysis($1, 99, 30, gen_random_uuid())`,
    `public.release_ai_usage($1, gen_random_uuid())`,
  ]) {
    e = await err(as(db, A, `select ${fn}`, [A.id]))
    check(`authenticated ne peut pas appeler ${fn.split('(')[0]}`, e && /permission denied/.test(e.message), e?.message)
  }
  const noPath = await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef and p.proname in ('grant_ai_credits', 'reserve_ai_analysis', 'release_ai_usage', 'reserve_ai_usage')
       and not ('search_path=""' = any (coalesce(p.proconfig, '{}')))`)
  check('SECURITY DEFINER crédits : search_path vide', noPath.rows.length === 0, noPath.rows.map((x) => x.proname).join(','))

  // --- Lot consommé : suppression isolée refusée (ses analyses ne repassent pas dans le quota) ---------
  const usedLot = (await db.query(`select c.id from public.ai_credits c where c.user_id = $1 and exists (select 1 from public.ai_usage u where u.credit_id = c.id) limit 1`, [A.id])).rows[0]
  check('lot déjà consommé : suppression isolée refusée', !!usedLot && !!(await err(svc(db, `delete from public.ai_credits where id = $1`, [usedLot.id]))))

  // --- Suppression du compte : cascade sur ai_usage et ai_credits malgré la clé étrangère du lot ---------
  const C = { id: U('0c'), email: 'c51@test.fr' }
  await db.query(`insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())`, [C.id, C.email])
  await db.query(`insert into public.users (id, email, prenom) values ($1, $2, 'T') on conflict (id) do nothing`, [C.id, C.email])
  await grant(db, C, session(9), 2)
  await reserve(db, C, 0)
  const delErr = await err(db.query(`delete from public.users where id = $1`, [C.id]))
  const left = (await db.query(`select (select count(*) from public.ai_credits where user_id = $1)::int + (select count(*) from public.ai_usage where user_id = $1)::int as n`, [C.id])).rows[0].n
  check('suppression du compte : lots et usages supprimés', !delErr && left === 0, delErr?.message)

  console.log(`\n0510 : ${pass} ok, ${fail} échec(s)`)
  if (fail) process.exitCode = 1
}
