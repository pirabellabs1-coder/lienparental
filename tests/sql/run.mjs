// Banc de tests SQL : rejoue supabase/storage.sql puis TOUTES les migrations sur PGlite (PostgreSQL en
// WebAssembly, en mémoire), vérifie la ré-exécutabilité des migrations récentes, puis lance les scénarios
// de tests/sql/scenarios/*.test.mjs (RLS, RPC, triggers) dans l'ordre de leur nom.
//
//   npm run test:sql                  tout
//   npm run test:sql -- famille coffre   seulement les scénarios dont le nom contient l'un des filtres
//
// Code de sortie 1 si une migration échoue ou si une assertion échoue. Voir tests/sql/README.md.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
// SQL_TEST_ROOT : racine d'un autre checkout dont on veut tester les migrations (défaut : ce dépôt).
const root = path.resolve(process.env.SQL_TEST_ROOT || path.resolve(here, '../..'))
const migrationsDir = path.join(root, 'supabase/migrations')
const storageSql = path.join(root, 'supabase/storage.sql')
const scenariosDir = path.join(here, 'scenarios')

// Migrations ré-exécutées une seconde fois après la passe complète (idempotence). À partir de 0360, chaque
// migration est déclarée ré-exécutable ; on les rejoue dans l'ordre pour conserver l'état final.
const IDEMPOTENT_FROM = '0360'

let pglite
try {
  pglite = {
    ...(await import('@electric-sql/pglite')),
    citext: (await import('@electric-sql/pglite/contrib/citext')).citext,
    pgcrypto: (await import('@electric-sql/pglite/contrib/pgcrypto')).pgcrypto,
    uuid_ossp: (await import('@electric-sql/pglite/contrib/uuid_ossp')).uuid_ossp,
  }
} catch {
  console.error('PGlite est absent. Installer la dépendance de développement :\n  npm install --save-dev --save-exact @electric-sql/pglite@0.5.11')
  process.exit(1)
}

const filters = process.argv.slice(2).map((f) => f.toLowerCase())
const db = await pglite.PGlite.create({ extensions: { citext: pglite.citext, pgcrypto: pglite.pgcrypto, uuid_ossp: pglite.uuid_ossp } })

let failedMigrations = 0
async function apply(file, label) {
  const sql = fs.readFileSync(file, 'utf8')
  try {
    await db.exec(sql)
    console.log('OK  ', label)
  } catch (e) {
    let err = e
    // db.exec() exécute le fichier comme un seul bloc transactionnel : une valeur d'enum ajoutée par
    // « alter type … add value » ne peut pas y être utilisée (même contrainte que l'éditeur SQL de
    // Supabase). On exécute d'abord ces lignes seules, puis le fichier entier. Signalé par « OK* ».
    if (/unsafe use of new value|invalid input value for enum/.test(e.message)) {
      for (const m of sql.matchAll(/alter type[^;]*add value[^;]*;/gi)) {
        try { await db.exec(m[0]) } catch { /* valeur déjà présente */ }
      }
      try { await db.exec(sql); console.log('OK* ', label); return } catch (e2) { err = e2 }
    }
    failedMigrations++
    console.log('FAIL', label, '→', err.message)
  }
}

// 1. Environnement Supabase minimal, puis storage.sql AVANT les migrations (ordre de docs/DEPLOIEMENT.md §1.5).
await db.exec(fs.readFileSync(path.join(here, 'supabase-stubs.sql'), 'utf8'))
await apply(storageSql, 'storage.sql')

// 2. Toutes les migrations, dans l'ordre des préfixes.
const migrations = fs.readdirSync(migrationsDir).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort()
for (const f of migrations) await apply(path.join(migrationsDir, f), f)

// 3. Ré-exécution (idempotence).
for (const f of migrations.filter((m) => m >= IDEMPOTENT_FROM)) {
  await apply(path.join(migrationsDir, f), `${f} (ré-exécution)`)
}

if (failedMigrations) {
  console.log(`\n${failedMigrations} migration(s) en échec : scénarios non lancés.`)
  process.exit(1)
}

// 4. Scénarios. Ceux qui exportent `vaultOpen = true` sont antérieurs au verrou du coffre en base (0370) :
// leurs comptes sont créés avec le verrou désactivé, comme un parent qui l'a coupé.
await db.exec(`
  create function public._test_vault_open() returns trigger language plpgsql as $$
  begin
    insert into public.vault_lock_settings (user_id, enabled) values (new.id, false) on conflict do nothing;
    return new;
  end $$;`)

const scenarios = fs.readdirSync(scenariosDir)
  .filter((f) => f.endsWith('.test.mjs'))
  .filter((f) => filters.length === 0 || filters.some((x) => f.toLowerCase().includes(x)))
  .sort()
if (scenarios.length === 0) {
  console.log('Aucun scénario ne correspond aux filtres :', filters.join(', '))
  process.exit(1)
}

let crashed = 0
// Contrôles en échec renvoyés par les scénarios ({ pass, fail }) : ils font échouer la suite
// (auparavant seul un plantage le faisait, un contrôle KO restait « vert »).
let failedChecks = 0
for (const f of scenarios) {
  const mod = await import(pathToFileURL(path.join(scenariosDir, f)).href)
  if (mod.vaultOpen) await db.exec(`create trigger _test_vault_open after insert on public.users for each row execute function public._test_vault_open()`)
  try {
    const res = await mod.default(db)
    if (res && typeof res.fail === 'number' && res.fail > 0) {
      failedChecks += res.fail
      console.log(`
FAIL ${f} : ${res.fail} contrôle(s) en échec`)
    }
  } catch (e) {
    crashed++
    console.log(`\nFAIL ${f} interrompu :`, e?.message ?? e)
  } finally {
    if (mod.vaultOpen) await db.exec(`drop trigger if exists _test_vault_open on public.users`)
  }
}

await db.close()
if (crashed || failedChecks) process.exitCode = 1
console.log(`\n${migrations.length} migrations + storage.sql, ${scenarios.length} scénario(s) : ${process.exitCode ? 'ÉCHEC' : 'tout est vert'}.`)
