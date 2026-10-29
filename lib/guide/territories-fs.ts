/** Lecture des territoire.json du dépôt (sans `server-only` : utilisée aussi par les scripts et les tests). */
import fs from 'node:fs'
import path from 'node:path'
import { territoireSchema, type Territoire } from './types'
import { TERRITORY_CODE_RE, sortTerritoires } from './territories'

/**
 * Territoires décrits dans `<root>/<code>/territoire.json` (un dossier = un territoire).
 * Un dossier sans territoire.json (contenu en cours de rédaction) est ignoré ; un territoire.json
 * invalide, ou dont le code diffère du dossier, lève une erreur explicite.
 */
export function readFileTerritoires(root: string): Territoire[] {
  if (!fs.existsSync(root)) return []
  const out: Territoire[] = []
  for (const d of fs.readdirSync(root, { withFileTypes: true })) {
    if (!d.isDirectory() || !TERRITORY_CODE_RE.test(d.name)) continue
    const file = path.join(root, d.name, 'territoire.json')
    if (!fs.existsSync(file)) continue
    const r = territoireSchema.safeParse(JSON.parse(fs.readFileSync(file, 'utf8')))
    if (!r.success) throw new Error(`[guide] ${d.name}/territoire.json invalide : ${r.error.issues.map((i) => `${i.path.join('.') || '(racine)'} : ${i.message}`).join(' ; ')}`)
    if (r.data.code !== d.name) throw new Error(`[guide] ${d.name}/territoire.json : code « ${r.data.code} » différent du dossier`)
    out.push(r.data)
  }
  return sortTerritoires(out)
}

