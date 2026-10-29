// Scénarios 0540_securite_base.sql (PGlite + stubs Supabase).
// Garde-fous de non-régression du durcissement : les contenus publics restent lisibles par un
// visiteur (leurs politiques appellent is_admin / is_admin_aal2), l'inscription crée toujours le
// profil (déclencheur handle_new_auth_user sans droit EXECUTE pour les rôles applicatifs), et plus
// aucun rôle applicatif ne peut vider une table.

let pass = 0, fail = 0
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log('  ok  ', name) } else { fail++; console.log('  FAIL', name, extra) }
}
async function asAnon(db, sql, params = []) {
  return db.transaction(async (tx) => { await tx.exec('set local role anon'); return (await tx.query(sql, params)).rows })
}
async function err(p) { try { await p; return null } catch (e) { return e } }

const PUBLIC_TABLES = ['guide_territoires', 'blog_posts', 'faq_items', 'guide_fiches', 'guide_parcours', 'guide_partners', 'tutorials', 'daily_tips', 'document_templates']

export default async function run(db) {
  console.log('\n== Durcissement de la base (0540)')

  console.log(' -- contenus publics lisibles par un visiteur')
  for (const t of PUBLIC_TABLES) {
    const exists = (await db.query(`select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = $1`, [t])).rows.length
    if (!exists) continue
    const e = await err(asAnon(db, `select count(*) from public.${t}`))
    check(`anon lit ${t}`, e === null, e?.message ?? '')
  }
  check('anon peut exécuter is_admin() et is_admin_aal2()',
    (await db.query(`select has_function_privilege('anon', 'public.is_admin()', 'execute') a, has_function_privilege('anon', 'public.is_admin_aal2()', 'execute') b`)).rows.every((r) => r.a && r.b))

  console.log(' -- inscription')
  const id = '00000000-0000-4000-8000-000000000540'
  await db.query(`insert into auth.users (id, email, email_confirmed_at) values ($1, 'inscription540@test.fr', now())`, [id])
  check('le profil public.users est créé par le déclencheur', (await db.query(`select 1 from public.users where id = $1`, [id])).rows.length === 1)
  check('déclencheur non appelable par anon', !(await db.query(`select has_function_privilege('anon', 'public.handle_new_auth_user()', 'execute') x`)).rows[0].x)

  console.log(' -- TRUNCATE')
  const truncs = (await db.query(`select count(*)::int n from information_schema.role_table_grants where table_schema = 'public' and privilege_type = 'TRUNCATE' and grantee in ('anon', 'authenticated')`)).rows[0].n
  check('aucun TRUNCATE pour anon / authenticated', truncs === 0, String(truncs))
  check('search_path figé sur soft_delete_document', (await db.query(`select proconfig from pg_proc where proname = 'soft_delete_document'`)).rows[0]?.proconfig?.length > 0)

  console.log(`\n0540 : ${pass} ok, ${fail} échec(s)`)
  if (fail) process.exitCode = 1
}
