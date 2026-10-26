/**
 * Validation du contenu du Guide Parent (`npm run check:guide`).
 *
 * Pour chaque territoire de content/guide/<territoire>/ : territoire.json, fiches/*.json,
 * parcours/*.json et partenaires.demo.json (facultatif) sont validés avec les schémas zod
 * de lib/guide/types ; on vérifie aussi que le nom de fichier d'une fiche = son slug et
 * que chaque parcours ne référence que des fiches existantes.
 * Code de sortie 1 au moindre problème (utilisable en CI). Aucune dépendance ajoutée :
 * exécuté par `npx tsx`.
 */
import fs from 'node:fs'
import path from 'node:path'
import type { ZodTypeAny, z } from 'zod'
import { ficheSchema, parcoursSchema, partenaireSchema, territoireSchema } from '../lib/guide/types'

const GUIDE_DIR = path.join(process.cwd(), 'content', 'guide')
let problems = 0

function report(msg: string) {
  problems++
  console.log(`  ✗ ${msg}`)
}

function readJson(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (e) {
    report(`${path.relative(process.cwd(), file)} : JSON illisible (${e instanceof Error ? e.message : String(e)})`)
    return undefined
  }
}

function check<S extends ZodTypeAny>(schema: S, file: string, value: unknown = readJson(file)): z.infer<S> | undefined {
  if (value === undefined) return undefined
  const r = schema.safeParse(value)
  if (!r.success) {
    report(`${path.relative(process.cwd(), file)} : ${r.error.issues.map((i) => `${i.path.join('.') || '(racine)'} : ${i.message}`).join(' ; ')}`)
    return undefined
  }
  return r.data
}

const jsonFiles = (dir: string) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort() : [])

const territoires = fs.existsSync(GUIDE_DIR)
  ? fs.readdirSync(GUIDE_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()
  : []

if (territoires.length === 0) report(`aucun territoire dans ${path.relative(process.cwd(), GUIDE_DIR)}`)

for (const t of territoires) {
  const root = path.join(GUIDE_DIR, t)
  console.log(`Territoire « ${t} »`)
  check(territoireSchema, path.join(root, 'territoire.json'))

  const slugs = new Set<string>()
  for (const f of jsonFiles(path.join(root, 'fiches'))) {
    const fiche = check(ficheSchema, path.join(root, 'fiches', f))
    if (!fiche) continue
    if (`${fiche.slug}.json` !== f) report(`fiches/${f} : le slug « ${fiche.slug} » ne correspond pas au nom du fichier`)
    if (slugs.has(fiche.slug)) report(`fiches/${f} : slug « ${fiche.slug} » en double`)
    slugs.add(fiche.slug)
  }

  let parcoursCount = 0
  for (const f of jsonFiles(path.join(root, 'parcours'))) {
    const parcours = check(parcoursSchema, path.join(root, 'parcours', f))
    if (!parcours) continue
    parcoursCount++
    for (const e of parcours.elements) {
      if (e.fiche && !slugs.has(e.fiche)) report(`parcours/${f} : élément « ${e.id} » → fiche inconnue « ${e.fiche} »`)
    }
  }

  const partnersFile = path.join(root, 'partenaires.demo.json')
  if (fs.existsSync(partnersFile)) {
    const list = readJson(partnersFile)
    if (list !== undefined && !Array.isArray(list)) report('partenaires.demo.json : un tableau est attendu')
    else if (Array.isArray(list)) list.forEach((p, i) => check(partenaireSchema, `${partnersFile}#${i}`, p))
  }

  console.log(`  ${slugs.size} fiche(s), ${parcoursCount} parcours`)
}

if (problems > 0) {
  console.log(`\n${problems} problème(s) détecté(s).`)
  process.exit(1)
}
console.log('\nContenu du guide valide.')
