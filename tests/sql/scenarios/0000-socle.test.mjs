// Invariants transverses, vérifiés après toutes les migrations (PGlite + stubs Supabase).
// Toute nouvelle table ou migration doit continuer à les respecter.
let pass = 0, fail = 0
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log('  ok  ', name) } else { fail++; console.log('  FAIL', name, extra) }
}

export default async function run(db) {
  console.log('\n== Socle (storage.sql avant les migrations, RLS partout)')

  const buckets = (await db.query(`select id, public, file_size_limit from storage.buckets order by id`)).rows
  // Exceptions voulues : blog-images (0300) et partner-logos (0550), images publiques, écriture réservée au serveur / aux admins.
  const PUBLIC_BUCKETS = ['blog-images', 'partner-logos']
  check('tous les buckets sont privés (sauf blog-images, partner-logos)', buckets.length > 0 && buckets.every((b) => b.public === false || PUBLIC_BUCKETS.includes(b.id)),
    JSON.stringify(buckets.filter((b) => b.public !== false && !PUBLIC_BUCKETS.includes(b.id))))
  const docs = buckets.find((b) => b.id === 'documents')
  check('bucket documents : 20 Mo (0210 appliquée après storage.sql)', Number(docs?.file_size_limit) === 20 * 1024 * 1024,
    String(docs?.file_size_limit))

  const noRls = (await db.query(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity order by 1`)).rows
  check('RLS activée sur toutes les tables de public', noRls.length === 0, noRls.map((r) => r.relname).join(','))

  const anonTables = (await db.query(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relrowsecurity
       and exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname
                     and p.permissive = 'PERMISSIVE' and ('anon' = any (p.roles) or 'public' = any (p.roles))
                     and p.qual is not null and btrim(p.qual) = 'true')
     order by 1`)).rows
  check('aucune politique « using (true) » ouverte à anon', anonTables.length === 0, anonTables.map((r) => r.relname).join(','))

  console.log(`\n== ${pass} réussis, ${fail} échecs`)
  if (fail) process.exitCode = 1
}
