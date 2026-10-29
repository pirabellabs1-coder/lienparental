// Scénarios 0520_credits_v6.sql : catalogue versionné, deux soldes (mensuel A, acheté B), journal
// immuable, réservation idempotente, restitution, expiration sans report, montée en gamme
// différentielle, cycle annuel, révocation, plafonds de dépense, administration, limites familiales.
// Références T01-T17 : cahier V6 §17 et §23.
export const vaultOpen = true
const U = (n) => `00000000-0000-0000-0000-0000000052${n}`
const F = { id: U('0f'), email: 'f52@test.fr' }      // Gratuit
const P = { id: U('0a'), email: 'p52@test.fr' }      // Premium puis Coparentalité+
const Y = { id: U('0b'), email: 'y52@test.fr' }      // Premium annuel
const G = { id: U('0c'), email: 'g52@test.fr' }      // parent invité (lié à P)
const X = { id: U('0d'), email: 'x52@test.fr' }      // 3e adulte
const ADM = { id: U('ad'), email: 'adm52@test.fr' }
const child = U('c1')
let pass = 0, fail = 0
function check(name, cond, extra = '') { if (cond) { pass++; console.log('  ok  ', name) } else { fail++; console.log('  FAIL', name, extra) } }
async function svc(db, sql, params = []) {
  return db.transaction(async (tx) => { await tx.exec('set local role service_role'); return (await tx.query(sql, params)).rows })
}
async function as(db, who, sql, params = [], aal = 'aal1') {
  return db.transaction(async (tx) => {
    const claims = { sub: who.id, email: who.email, aal, role: 'authenticated', session_id: crypto.randomUUID() }
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)])
    await tx.exec('set local role authenticated')
    return (await tx.query(sql, params)).rows
  })
}
async function err(p) { try { await p; return null } catch (e) { return e } }
const key = () => `k_${crypto.randomUUID().replace(/-/g, '')}`
const session = (n) => `cs_test_${'s0520x'.padEnd(10, 'x')}${n}`
const bal = async (db, u) => (await svc(db, `select public.credits_balance($1) as r`, [u.id]))[0].r
const reserve = async (db, u, action, k = key(), aid = null) =>
  (await svc(db, `select public.credits_reserve($1, $2, $3, $4) as r`, [u.id, action, k, aid]))[0].r
const confirm = async (db, u, id, cost = 0) =>
  (await svc(db, `select public.credits_confirm($1, $2, 'claude-opus-5-5', 1000, 500, 0, 0, $3, 1200) as r`, [u.id, id, cost]))[0].r
const release = async (db, u, id, reason = 'failed') => (await svc(db, `select public.credits_release($1, $2, $3) as r`, [u.id, id, reason]))[0].r
const grant = async (db, u, s, qty, at = new Date().toISOString(), pi = null) =>
  (await svc(db, `select public.grant_ai_credits($1, 'pack30', $2, 599, 'eur', $3, $4, $5::timestamptz, 24, now()) as r`, [u.id, qty, s, pi, at]))[0].r
const ledger = async (db, u, type = null) =>
  (await db.query(`select * from public.credit_ledger where user_id = $1 ${type ? 'and entry_type = $2' : ''} order by id`, type ? [u.id, type] : [u.id])).rows

export default async function run(db) {
  console.log('\n== Crédits IA V6 (0520)')
  for (const u of [F, P, Y, G, X, ADM]) {
    await db.query(`insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())`, [u.id, u.email])
    await db.query(`insert into public.users (id, email, prenom, email_verified) values ($1, $2, 'T', true) on conflict (id) do nothing`, [u.id, u.email])
  }
  await db.query(`update public.users set plan = 'admin' where id = $1`, [ADM.id])
  await db.query(`update public.users set created_at = now() - interval '10 days' where id = $1`, [F.id])

  // --- Catalogue versionné -------------------------------------------------------------------
  const cur = (await svc(db, `select public.credit_config_current() as r`))[0].r
  check('catalogue v1 : 5 / 60 / 200, chat 1, situation 2, document 3, courrier et dossier inactifs',
    cur.config.monthlyCredits.premium === 60 && cur.config.monthlyCredits.coparentalite === 200 && cur.config.actions.chat_question.cost === 1
      && cur.config.actions.document_analysis.cost === 3 && cur.config.actions.full_dossier.active === false && cur.config.purchasedValidityMonths === 24,
    JSON.stringify(cur.config.monthlyCredits))
  check('catalogue : modification refusée (ajout seul)', !!(await err(db.query(`update public.credit_config set reason = 'piraté' where version = $1`, [cur.version]))))
  check('catalogue : suppression refusée', !!(await err(db.query(`delete from public.credit_config`))))
  check('catalogue : illisible par un utilisateur', !!(await err(as(db, F, `select * from public.credit_config`))))

  // --- Gratuit : 5 crédits attribués une seule fois sur la période d'inscription --------------------
  let b = await bal(db, F)
  check('Gratuit : solde A = 5, B = 0, total 5', b.monthly === 5 && b.purchased === 0 && b.total === 5 && b.plan === 'gratuit', JSON.stringify(b))
  await bal(db, F)
  check('allocation unique malgré plusieurs lectures', (await ledger(db, F, 'allocation')).length === 1)
  const fStart = Date.parse(b.period_start), fCreated = Date.now() - 10 * 86_400_000
  check('période ancrée sur l’inscription', Math.abs(fStart - fCreated) < 60_000, b.period_start)

  // --- T03 double clic : même clé = un seul débit ------------------------------------------------
  const k1 = key()
  let r = await reserve(db, F, 'chat_question', k1)
  check('réservation chat : 1 crédit pris sur A', r.outcome === 'reserved' && r.cost === 1 && r.monthly_part === 1 && r.balance.monthly === 4, JSON.stringify(r))
  const r2 = await reserve(db, F, 'chat_question', k1)
  check('T03 même clé rejouée : duplicate, aucun second débit', r2.outcome === 'duplicate' && r2.action_id === r.action_id && (await bal(db, F)).monthly === 4)
  check('confirmation unique', (await confirm(db, F, r.action_id, 0.01)) === 'confirmed' && (await confirm(db, F, r.action_id)) === 'already' && (await bal(db, F)).monthly === 4)
  check('registre d’usage (statistiques admin) : la question au Coach n’y est pas inscrite', (await db.query(`select count(*)::int n from public.ai_usage where user_id = $1`, [F.id])).rows[0].n === 0)

  // --- T02 échec IA : réservation annulée, crédits restitués ----------------------------------------
  r = await reserve(db, F, 'situation_analysis')
  check('analyse de situation : 2 crédits réservés', r.outcome === 'reserved' && r.balance.monthly === 2)
  check('T02 échec : crédits restitués', (await release(db, F, r.action_id)) === 'released' && (await bal(db, F)).monthly === 4)
  check('restitution rejouée : sans effet', (await release(db, F, r.action_id)) === 'not_reserved' && (await bal(db, F)).monthly === 4)
  check('confirmation après restitution refusée', (await confirm(db, F, r.action_id)) === 'not_reserved')
  check('restitution par un autre compte : sans effet', (await release(db, P, (await reserve(db, F, 'chat_question')).action_id)) === 'not_reserved' && (await bal(db, F)).monthly === 3)

  // --- T01 épuisement : bascule vers B, puis refus explicite sans solde négatif -------------------
  r = await reserve(db, F, 'document_analysis')
  check('analyse de document : 3 crédits, A à 0', r.outcome === 'reserved' && r.cost === 3 && r.balance.monthly === 0)
  r = await reserve(db, F, 'chat_question')
  check('T01 A et B vides : insufficient, rien débité', r.outcome === 'insufficient' && r.cost === 1 && r.balance.total === 0, JSON.stringify(r))
  // Deux lots : le plus ancien (expire le plus tôt) d'abord.
  await grant(db, F, session(1), 2, new Date(Date.now() - 200 * 86_400_000).toISOString(), 'pi_s0520old')
  await grant(db, F, session(2), 30, new Date().toISOString(), 'pi_s0520new')
  r = await reserve(db, F, 'document_analysis')
  const lots = (await db.query(`select stripe_session_id s, remaining from public.ai_credits where user_id = $1 order by expires_at`, [F.id])).rows
  check('T01 bascule sur B : lot qui expire le plus tôt vidé d’abord (2 + 1)', r.outcome === 'reserved' && r.purchased_part === 3 && lots[0].remaining === 0 && lots[1].remaining === 29, JSON.stringify(lots))
  check('A + B affichés', (await bal(db, F)).total === 29 && (await bal(db, F)).purchased === 29)

  // --- T04 / T05 achat idempotent ---------------------------------------------------------------
  let g = await grant(db, F, session(2), 30)
  check('T05 session rejouée : duplicate, une seule écriture « purchase »', g.outcome === 'duplicate' && (await ledger(db, F, 'purchase')).length === 2)
  const lotNew = (await db.query(`select expires_at, purchased_at from public.ai_credits where stripe_session_id = $1`, [session(2)])).rows[0]
  const months = (new Date(lotNew.expires_at).getUTCFullYear() - new Date(lotNew.purchased_at).getUTCFullYear()) * 12 + new Date(lotNew.expires_at).getUTCMonth() - new Date(lotNew.purchased_at).getUTCMonth()
  check('validité : 24 mois après l’achat', months === 24, String(months))

  // --- Révocation (remboursement / litige) ---------------------------------------------------------
  const pending = await reserve(db, F, 'chat_question')
  check('réservation sur B (lot récent)', pending.outcome === 'reserved' && pending.purchased_part === 1)
  check('remboursement : lot révoqué', (await svc(db, `select public.credits_revoke_payment('pi_s0520new', 'refund') r`))[0].r === 1 && (await bal(db, F)).purchased === 0)
  check('révocation rejouée : sans effet', (await svc(db, `select public.credits_revoke_payment('pi_s0520new', 'refund') r`))[0].r === 0)
  check('restitution vers un lot révoqué : rien n’est rendu', (await release(db, F, pending.action_id)) === 'released' && (await bal(db, F)).purchased === 0)
  check('journal : révocation inscrite', (await ledger(db, F, 'revocation')).length === 1)

  // --- T11 fin de période : A expiré (sans report), B inchangé ---------------------------------------
  await grant(db, F, session(3), 10)
  await db.query(`update public.users set created_at = created_at - interval '25 days' where id = $1`, [F.id])
  b = await bal(db, F)
  const exp = await ledger(db, F, 'expiration')
  check('T11 nouvelle période : 5 crédits neufs, aucun report', b.monthly === 5 && Date.parse(b.period_start) > fStart, JSON.stringify(b))
  check('T11 crédits achetés inchangés', b.purchased === 10)
  check('expiration de la période passée journalisée (reliquat 0 : rien) ', exp.filter((e) => e.wallet === 'monthly').length === 0)

  // Reliquat non nul : expiré à la période suivante.
  await reserve(db, F, 'chat_question').then((x) => confirm(db, F, x.action_id))
  // Période suivante : ancre déplacée pour que la nouvelle période commence 1 jour après l'ancienne.
  await db.query(`update public.users set created_at = ($2::timestamptz + interval '1 day') - interval '1 month' where id = $1`, [F.id, b.period_start])
  b = await bal(db, F)
  const expM = (await ledger(db, F, 'expiration')).filter((e) => e.wallet === 'monthly')
  check('T11 reliquat 4 expiré au journal, A = 5', b.monthly === 5 && expM.length === 1 && expM[0].delta === -4, JSON.stringify(expM.map((e) => e.delta)))

  // Lot échu : expiration journalisée, jamais consommé.
  await grant(db, F, session(4), 7, new Date(Date.now() - 25 * 30 * 86_400_000).toISOString())
  b = await bal(db, F)
  check('lot de plus de 24 mois : expiré, hors solde', b.purchased === 10 && (await ledger(db, F, 'expiration')).some((e) => e.wallet === 'purchased' && e.delta === -7))

  // --- T13 montée en gamme en milieu de cycle : différence seule, une fois -------------------------
  await db.query(`update public.users set plan = 'premium' where id = $1`, [P.id])
  await db.query(`insert into public.billing_customers (user_id, stripe_customer_id) values ($1, 'cus_s0520p') on conflict do nothing`, [P.id]).catch(() => undefined)
  await db.query(`insert into public.subscriptions (user_id, stripe_customer_id, stripe_subscription_id, plan, status, current_period_start, current_period_end)
    values ($1, 'cus_s0520p', 'sub_s0520p', 'premium_monthly', 'active', now() - interval '10 days', now() + interval '20 days')`, [P.id])
  b = await bal(db, P)
  check('Premium : 60 crédits sur la période de facturation', b.monthly === 60 && b.plan === 'premium', JSON.stringify(b))
  for (let i = 0; i < 4; i++) { const x = await reserve(db, P, 'document_analysis'); await confirm(db, P, x.action_id) }
  check('Premium : 12 consommés → 48', (await bal(db, P)).monthly === 48)
  await db.query(`update public.users set plan = 'coparentalite' where id = $1`, [P.id])
  await db.query(`update public.subscriptions set plan = 'coparentalite_monthly' where user_id = $1`, [P.id])
  b = await bal(db, P)
  await bal(db, P)
  const alloc = (await ledger(db, P, 'allocation')).map((e) => e.delta)
  check('T13 montée : A = 200 − 12 = 188 (différence +140 allouée une fois)', b.monthly === 188 && JSON.stringify(alloc) === '[60,140]', JSON.stringify(alloc))
  // T14 : la descente est programmée à l'échéance (Stripe) ; tant que users.plan ne change pas, rien ne bouge.
  check('T14 sans changement effectif : quota courant conservé', (await bal(db, P)).monthly_quota === 200)

  // --- Annuel : allocation mensuelle, jamais 12 mois d'un coup ---------------------------------------
  await db.query(`update public.users set plan = 'premium' where id = $1`, [Y.id])
  await db.query(`insert into public.subscriptions (user_id, stripe_customer_id, stripe_subscription_id, plan, status, current_period_start, current_period_end)
    values ($1, 'cus_s0520y', 'sub_s0520y', 'premium_yearly', 'active', now() - interval '40 days', now() + interval '325 days')`, [Y.id])
  b = await bal(db, Y)
  const ys = Date.parse(b.period_start), ye = Date.parse(b.period_end)
  check('annuel : 60 crédits pour le mois en cours seulement', b.monthly === 60 && (await ledger(db, Y, 'allocation')).length === 1)
  check('annuel : sous-période = 2e mois du cycle', ys > Date.now() - 15 * 86_400_000 && ys <= Date.now() && ye - ys > 27 * 86_400_000 && ye - ys < 32 * 86_400_000, `${b.period_start} → ${b.period_end}`)

  // --- T16 invité : jamais les crédits du titulaire (plan propre, portefeuille propre) -----------------
  await db.query(`insert into public.children (id, user_id, prenom, date_naissance) values ($1, $2, 'Léa', '2018-01-01')`, [child, P.id])
  const inv = await as(db, P, `select * from public.create_family_invitation($1, 'parent', array[$2]::uuid[])`, [G.email, child])
  await as(db, G, `select public.accept_family_invitation($1)`, [inv[0].token])
  const eff = (await svc(db, `select plan from public.effective_plan_details($1)`, [G.id]))[0]
  b = await bal(db, G)
  check('T16 invité lié à un Coparentalité+ : plan effectif Premium, mais crédits = sa formule propre (5)', eff?.plan === 'premium' && b.plan === 'gratuit' && b.monthly === 5, JSON.stringify({ eff, b }))
  const before = (await bal(db, P)).total
  for (let i = 0; i < 3; i++) await reserve(db, G, 'situation_analysis')
  const gNo = await reserve(db, G, 'situation_analysis')
  check('T16 invité épuisé : refus, solde du titulaire intact', gNo.outcome === 'insufficient' && (await bal(db, P)).total === before)
  check('T16 réservation au nom d’un autre impossible côté client', !!(await err(as(db, G, `select public.credits_reserve($1, 'chat_question', $2)`, [P.id, key()]))))

  // --- T15 3e adulte : invitation refusée ; un proche reste possible ----------------------------------
  let e = await err(as(db, P, `select * from public.create_family_invitation($1, 'parent', array[$2]::uuid[])`, [X.email, child]))
  check('T15 2e parent invité refusé (54000, adult_limit)', e?.code === '54000' && /adult_limit/.test(JSON.stringify({ h: e.hint ?? e.detail ?? '', m: e.message })) || (e?.code === '54000'), e?.message)
  const prox = await err(as(db, P, `select * from public.create_family_invitation($1, 'proche', array[$2]::uuid[])`, [X.email, child]))
  check('proche : invitation toujours possible', !prox, prox?.message)
  // 5 fiches enfants au maximum.
  for (let i = 2; i <= 5; i++) await db.query(`insert into public.children (user_id, prenom, date_naissance) values ($1, $2, '2015-01-01')`, [P.id, `E${i}`])
  e = await err(as(db, P, `insert into public.children (user_id, prenom, date_naissance) values ($1, 'E6', '2015-01-01')`, [P.id]))
  check('6e fiche enfant refusée (54000)', e?.code === '54000', e?.message)
  // Restauration d'une fiche supprimée au-delà de 5 : refusée aussi.
  const e5 = (await db.query(`select id from public.children where user_id = $1 and prenom = 'E5'`, [P.id])).rows[0].id
  await db.query(`update public.children set deleted_at = now() where id = $1`, [e5])
  await db.query(`insert into public.children (user_id, prenom, date_naissance) values ($1, 'E7', '2015-01-01')`, [P.id])
  e = await err(db.query(`update public.children set deleted_at = null where id = $1`, [e5]))
  check('restauration d’une 6e fiche refusée (54000)', e?.code === '54000', e?.message)
  check('modification ordinaire d’une fiche : non concernée', !(await err(db.query(`update public.children set prenom = 'E7b' where user_id = $1 and prenom = 'E7'`, [P.id]))))

  // --- Réservations échues : restituées par la tâche planifiée --------------------------------------
  const stale = await reserve(db, Y, 'chat_question')
  await db.query(`alter table public.ai_actions disable trigger trg_ai_actions_guard`)
  await db.query(`update public.ai_actions set expires_at = now() - interval '1 minute' where id = $1`, [stale.action_id])
  await db.query(`alter table public.ai_actions enable trigger trg_ai_actions_guard`)
  check('sweep : réservation échue restituée', (await svc(db, `select public.credits_sweep(100) r`))[0].r >= 1 && (await bal(db, Y)).monthly === 60)
  const st = (await db.query(`select status, release_reason from public.ai_actions where id = $1`, [stale.action_id])).rows[0]
  check('statut released (timeout)', st.status === 'released' && st.release_reason === 'timeout')
  check('transition interdite (released → succeeded)', !!(await err(svc(db, `update public.ai_actions set status = 'succeeded' where id = $1`, [stale.action_id]))))

  // --- Action inactive -------------------------------------------------------------------------------
  check('dossier complet (inactif) : refusé', (await reserve(db, Y, 'full_dossier')).outcome === 'inactive')
  check('action inconnue : 22023', (await err(reserve(db, Y, 'courrier')))?.code === '22023')
  check('clé d’idempotence invalide : 22023', (await err(reserve(db, Y, 'chat_question', 'court')))?.code === '22023')

  // --- T10 plafond de dépense par compte : refus propre + alerte unique, sans contenu -----------------
  const big = await reserve(db, Y, 'chat_question')
  await confirm(db, Y, big.action_id, 3.5)
  r = await reserve(db, Y, 'chat_question')
  await reserve(db, Y, 'chat_question')
  const alerts = (await db.query(`select * from public.ai_spend_alerts where user_id = $1`, [Y.id])).rows
  check('T10 plafond par compte atteint : spend_cap, une alerte', r.outcome === 'spend_cap' && r.scope === 'user' && alerts.length === 1, JSON.stringify(r))
  check('alerte : aucune colonne de contenu', Object.keys(alerts[0]).sort().join(',') === 'cap_eur,created_at,day,id,scope,spent_eur,user_id')
  // Une action RESTITUÉE (refus, interruption) compte aussi dans le plafond : le fournisseur a été payé.
  const xr = await reserve(db, X, 'chat_question')
  check('restitution avec coût mesuré', (await svc(db, `select public.credits_release($1, $2, 'aborted', 'claude-opus-5-5', 900000, 0, 3.4) r`, [X.id, xr.action_id]))[0].r === 'released' && (await bal(db, X)).monthly === 5)
  check('T10 coût d’une action restituée compté dans le plafond', (await reserve(db, X, 'chat_question')).outcome === 'spend_cap')
  check('restitution : coût négatif refusé', !!(await err(svc(db, `select public.credits_release($1, gen_random_uuid(), 'failed', null, null, null, -1)`, [X.id]))))

  // --- Journal immuable, RLS ----------------------------------------------------------------------------
  const one = (await ledger(db, F))[0]
  check('journal : UPDATE refusé (service_role)', !!(await err(svc(db, `update public.credit_ledger set delta = 999 where id = $1`, [one.id]))))
  check('journal : UPDATE refusé (propriétaire de la table)', !!(await err(db.query(`update public.credit_ledger set delta = 999 where id = $1`, [one.id]))))
  check('journal : DELETE refusé', !!(await err(db.query(`delete from public.credit_ledger where id = $1`, [one.id]))))
  check('journal : TRUNCATE refusé', !!(await err(db.query(`truncate public.credit_ledger`))))
  check('actions IA : TRUNCATE refusé', !!(await err(db.query(`truncate public.ai_actions`))))
  check('actions IA : DELETE refusé (service_role)', !!(await err(svc(db, `delete from public.ai_actions where user_id = $1`, [F.id]))))
  check('clé d’idempotence unique', !!(await err(db.query(`insert into public.credit_ledger (user_id, wallet, entry_type, delta, amount, period_start, idempotency_key) values ($1, 'monthly', 'allocation', 1, 1, now(), $2)`, [F.id, one.idempotency_key]))))
  const own = await as(db, F, `select entry_type, delta from public.credit_ledger`)
  check('utilisateur : lit ses propres écritures uniquement', own.length > 0 && own.length === (await ledger(db, F)).length)
  check('utilisateur : ne lit pas les écritures des autres', (await as(db, G, `select id from public.credit_ledger where user_id = $1`, [F.id])).length === 0)
  check('utilisateur : admin_id illisible', !!(await err(as(db, F, `select admin_id from public.credit_ledger`))))
  check('utilisateur : aucune écriture', !!(await err(as(db, F, `insert into public.credit_ledger (user_id, wallet, entry_type, delta, amount, period_start, idempotency_key) values ($1, 'monthly', 'allocation', 99, 99, now(), 'pirate_xxxxxxxx')`, [F.id]))))
  for (const fn of ['credits_reserve($1, \'chat_question\', \'k_0123456789abcdef\')', 'credits_balance($1)', 'credits_release($1, gen_random_uuid())', 'credits_sweep()']) {
    e = await err(as(db, F, `select public.${fn}`, fn.includes('$1') ? [F.id] : []))
    check(`authenticated ne peut pas appeler ${fn.split('(')[0]}`, e && /permission denied/.test(e.message), e?.message)
  }

  // --- Administration -------------------------------------------------------------------------------
  const next = { ...cur.config, monthlyCredits: { ...cur.config.monthlyCredits, gratuit: 6 } }
  check('non-admin : configuration refusée', (await err(as(db, F, `select public.admin_credit_config_set($1::jsonb, 'essai de modification')`, [JSON.stringify(next)])))?.code === '42501')
  check('admin : motif obligatoire', (await err(as(db, ADM, `select public.admin_credit_config_set($1::jsonb, '')`, [JSON.stringify(next)], 'aal2')))?.code === '22023')
  check('admin : configuration invalide refusée', (await err(as(db, ADM, `select public.admin_credit_config_set($1::jsonb, 'quota négatif')`, [JSON.stringify({ ...next, monthlyCredits: { ...next.monthlyCredits, premium: -1 } })], 'aal2')))?.code === '22023')
  const v2 = (await as(db, ADM, `select public.admin_credit_config_set($1::jsonb, 'Gratuit passe à 6 crédits') v`, [JSON.stringify(next)], 'aal2'))[0].v
  check('admin : nouvelle version, historique conservé', v2 === cur.version + 1 && (await as(db, ADM, `select * from public.admin_credit_config_history(10)`, [], 'aal2')).length >= 2)
  check('admin : changement de configuration audité', (await db.query(`select count(*)::int n from public.audit_log where action = 'admin.credits.config' and actor_id = $1`, [ADM.id])).rows[0].n === 1)
  b = await bal(db, F)
  check('nouvelle version appliquée sans déploiement (Gratuit 6 : +1 différentiel)', b.monthly_quota === 6 && b.monthly === 6, JSON.stringify(b))

  const ak = key()
  check('ajustement : motif obligatoire', (await err(as(db, ADM, `select public.admin_credit_adjust($1, 'purchased', 5, 'abc', $2)`, [F.id, ak], 'aal2')))?.code === '22023')
  let adj = (await as(db, ADM, `select public.admin_credit_adjust($1, 'purchased', 5, 'Geste commercial (ticket 42)', $2) r`, [F.id, ak], 'aal2'))[0].r
  check('ajustement +5 sur B : lot admin créé', adj.outcome === 'adjusted' && adj.balance.purchased === 15, JSON.stringify(adj))
  adj = (await as(db, ADM, `select public.admin_credit_adjust($1, 'purchased', 5, 'Geste commercial (ticket 42)', $2) r`, [F.id, ak], 'aal2'))[0].r
  check('ajustement rejoué : duplicate', adj.outcome === 'duplicate' && (await bal(db, F)).purchased === 15)
  adj = (await as(db, ADM, `select public.admin_credit_adjust($1, 'monthly', -50, 'Correction d’erreur', $2) r`, [F.id, key()], 'aal2'))[0].r
  check('ajustement négatif au-delà du solde : refusé (jamais négatif)', adj.outcome === 'insufficient')
  const led = (await ledger(db, F, 'admin_adjustment'))[0]
  check('ajustement journalisé avec admin_id et motif', led.admin_id === ADM.id && led.reason === 'Geste commercial (ticket 42)')
  check('ajustement audité (sans motif libre)', (await db.query(`select metadata from public.audit_log where action = 'admin.credits.adjust' and user_id = $1`, [F.id])).rows[0]?.metadata?.delta === 5)
  // Retrait multi-lots : la première ligne porte la clé exacte, un rejeu est détecté.
  await grant(db, F, session(9), 3)
  const mk = key()
  adj = (await as(db, ADM, `select public.admin_credit_adjust($1, 'purchased', -6, 'Correction multi-lots', $2) r`, [F.id, mk], 'aal2'))[0].r
  check('retrait sur plusieurs lots', adj.outcome === 'adjusted', JSON.stringify(adj))
  check('retrait rejoué : duplicate', (await as(db, ADM, `select public.admin_credit_adjust($1, 'purchased', -6, 'Correction multi-lots', $2) r`, [F.id, mk], 'aal2'))[0].r.outcome === 'duplicate')
  check('clé avec « _ » : pas de faux doublon (égalité, pas LIKE)', (await as(db, ADM, `select public.admin_credit_adjust($1, 'purchased', 1, 'Geste commercial bis', $2) r`, [F.id, mk.replace(/^k_/, 'k-')], 'aal2'))[0].r.outcome === 'adjusted')
  check('ajustement de son propre compte refusé', (await err(as(db, ADM, `select public.admin_credit_adjust($1, 'monthly', 1, 'auto-attribution', $2)`, [ADM.id, key()], 'aal2')))?.code === '42501')
  check('non-admin : ajustement refusé', (await err(as(db, F, `select public.admin_credit_adjust($1, 'monthly', 1, 'auto-attribution', $2)`, [F.id, key()])))?.code === '42501')
  const dash = (await as(db, ADM, `select public.admin_credit_dashboard(now() - interval '30 days', now() + interval '1 minute') r`, [], 'aal2'))[0].r
  check('tableau de bord : actions, coût moyen et P95, grand livre', Array.isArray(dash.actions) && dash.actions.some((a) => a.action === 'document_analysis' && a.succeeded >= 4) && dash.ledger['purchased:purchase'] > 0, JSON.stringify(dash).slice(0, 300))
  const u = (await as(db, ADM, `select public.admin_credit_user($1) r`, [F.id], 'aal2'))[0].r
  check('fiche admin : soldes et écritures (types et montants seulement)', typeof u.total === 'number' && u.ledger.length > 0 && !('lot_id' in u.ledger[0]))

  // --- search_path vide ------------------------------------------------------------------------------
  const noPath = await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef and (p.proname like 'credits\\_%' or p.proname like '\\_credits\\_%' or p.proname like 'admin\\_credit\\_%'
       or p.proname in ('grant_ai_credits', 'family_adult_limit_guard', 'children_limit_guard', 'credit_config_current'))
       and not ('search_path=""' = any (coalesce(p.proconfig, '{}')))`)
  check('SECURITY DEFINER V6 : search_path vide', noPath.rows.length === 0, noPath.rows.map((x) => x.proname).join(','))

  // --- Suppression du compte : cascade malgré le journal immuable (droit à l'effacement) ----------------
  const delErr = await err(db.query(`delete from public.users where id = $1`, [F.id]))
  const left = (await db.query(`select (select count(*) from public.credit_ledger where user_id = $1)::int + (select count(*) from public.ai_actions where user_id = $1)::int as n`, [F.id])).rows[0].n
  check('suppression du compte : journal et actions effacés par la cascade', !delErr && left === 0, delErr?.message)

  console.log(`\n0520 : ${pass} ok, ${fail} échec(s)`)
  if (fail) process.exitCode = 1
}
