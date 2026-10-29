/**
 * Audit C3 : chaque zone ne fournit aux composants client que certains namespaces
 * (lib/i18n/client-namespaces.ts). Ce test parcourt le graphe d'imports depuis chaque
 * page/layout de app/ et vérifie que tout useTranslations('x.y') atteint par un composant
 * CLIENT ('use client', ou importé par un composant client) est couvert par la liste de sa zone,
 * et que chaque namespace listé existe dans les trois langues.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { pick } from '../lib/i18n/pick'
import * as Z from '../lib/i18n/client-namespaces'

const ROOT = process.cwd()
const EXTS = ['.tsx', '.ts', '/index.tsx', '/index.ts']

function resolve(from: string, spec: string): string | null {
  let base: string
  if (spec.startsWith('@/')) base = path.join(ROOT, spec.slice(2))
  else if (spec.startsWith('.')) base = path.join(path.dirname(from), spec)
  else return null
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return base
  for (const e of EXTS) if (fs.existsSync(base + e)) return base + e
  return null
}

type Info = { isClient: boolean; imports: string[]; ns: string[]; dynamicNs: boolean }
const cache = new Map<string, Info>()
function info(file: string): Info {
  const hit = cache.get(file)
  if (hit) return hit
  const src = fs.readFileSync(file, 'utf8')
  const isClient = /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*['"]use client['"]/.test(src)
  const imports: string[] = []
  const re = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s*['"]([^'"]+)['"]/gm
  for (const m of src.matchAll(re)) {
    const r = resolve(file, m[1] ?? m[2] ?? m[3])
    if (r) imports.push(r)
  }
  const ns = [...src.matchAll(/useTranslations\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1])
  // useTranslations() sans namespace littéral, ou useMessages() : impossible à vérifier statiquement.
  const dynamicNs = /useTranslations\(\s*(?![\s'"])|useTranslations\(\s*\)|\buseMessages\(\)/.test(src)
  const res = { isClient, imports, ns, dynamicNs }
  cache.set(file, res)
  return res
}

/** Namespaces lus par du code client atteignable depuis `entry`, avec le fichier qui les lit. */
function clientNamespaces(entry: string): Map<string, string> {
  const out = new Map<string, string>()
  const seen = new Set<string>()
  const stack: [string, boolean][] = [[entry, false]]
  while (stack.length) {
    const [f, parentClient] = stack.pop()!
    const i = info(f)
    const client = parentClient || i.isClient
    const key = `${f}|${client}`
    if (seen.has(key)) continue
    seen.add(key)
    if (client) {
      for (const n of i.ns) out.set(n, path.relative(ROOT, f))
      if (i.dynamicNs) out.set('<dynamique>', path.relative(ROOT, f))
    }
    for (const d of i.imports) stack.push([d, client])
  }
  return out
}

function entries(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return e.name === 'api' ? [] : entries(p)
    return /^(page|layout|not-found|error|loading|template|global-error|default)\.tsx$/.test(e.name) ? [p] : []
  })
}

/** Zone (liste de namespaces) qui fournit les messages client à un fichier de route. */
function zoneOf(rel: string): [string, readonly string[]] {
  const r = rel.replace(/\\/g, '/')
  if (r.startsWith('app/app/')) return ['APP', Z.CLIENT_NS_APP]
  if (r.startsWith('app/admin/')) return ['ADMIN', Z.CLIENT_NS_ADMIN]
  if (r.startsWith('app/(public)/')) return ['PUBLIC_FLOWS', Z.CLIENT_NS_PUBLIC_FLOWS]
  if (r.startsWith('app/offline/')) return ['OFFLINE', Z.CLIENT_NS_OFFLINE]
  if (r.startsWith('app/partage/')) return ['PARTAGE', Z.CLIENT_NS_PARTAGE]
  if (r.startsWith('app/temoin/')) return ['TEMOIN', Z.CLIENT_NS_TEMOIN]
  if (r === 'app/layout.tsx' || r.startsWith('app/console/') || r.startsWith('app/auth/')) return ['ROOT', Z.CLIENT_NS_ROOT]
  // Tout le reste est le site public, rendu dans SiteShell (+ extraNamespaces propres à la page).
  if (r === 'app/page.tsx') return ['SITE+HOME', [...Z.CLIENT_NS_SITE, ...Z.CLIENT_NS_SITE_HOME]]
  if (r.startsWith('app/installer/')) return ['SITE+INSTALL', [...Z.CLIENT_NS_SITE, ...Z.CLIENT_NS_SITE_INSTALL]]
  if (r.startsWith('app/partenaires/candidature/')) return ['SITE+PARTNER_APPLY', [...Z.CLIENT_NS_SITE, ...Z.CLIENT_NS_SITE_PARTNER_APPLY]]
  return ['SITE', Z.CLIENT_NS_SITE]
}

const covered = (ns: string, list: readonly string[]) => list.some((z) => ns === z || ns.startsWith(`${z}.`))

test('chaque namespace lu côté client est fourni par le provider de sa zone', () => {
  const missing: string[] = []
  for (const e of entries(path.join(ROOT, 'app'))) {
    const rel = path.relative(ROOT, e)
    const [zone, list] = zoneOf(rel)
    for (const [ns, file] of clientNamespaces(e)) {
      if (!covered(ns, list)) missing.push(`${rel} [${zone}] : '${ns}' (${file})`)
    }
  }
  assert.deepEqual(missing, [], `Namespaces absents de lib/i18n/client-namespaces.ts :\n${missing.join('\n')}`)
})

test('chaque namespace listé existe dans les catalogues fr/en/pt', () => {
  const lists = Object.entries(Z) as [string, readonly string[]][]
  for (const locale of ['fr', 'en', 'pt']) {
    const dir = path.join(ROOT, 'messages', locale)
    const all: Record<string, unknown> = JSON.parse(fs.readFileSync(path.join(ROOT, 'messages', `${locale}.json`), 'utf8'))
    for (const f of fs.readdirSync(dir)) Object.assign(all, JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))
    for (const [name, list] of lists) {
      for (const ns of list) {
        let node: unknown = all
        for (const k of ns.split('.')) node = node && typeof node === 'object' ? (node as Record<string, unknown>)[k] : undefined
        assert.ok(node !== undefined, `${locale} : ${name} référence '${ns}', absent du catalogue`)
      }
    }
  }
})

test('pick : chemins racine et imbriqués, ancêtre prioritaire, source intacte', () => {
  const m = { a: { x: '1', y: { z: '2' } }, b: 'B', c: { d: '3' } }
  const snapshot = JSON.stringify(m)
  assert.deepEqual(pick(m, ['a.y.z', 'b']), { a: { y: { z: '2' } }, b: 'B' })
  assert.deepEqual(pick(m, ['a.y', 'a']), { a: m.a })
  assert.deepEqual(pick(m, ['a.x', 'a.y.z', 'inconnu', 'c.nope']), { a: { x: '1', y: { z: '2' } } })
  assert.deepEqual(pick(m, []), {})
  assert.equal(JSON.stringify(m), snapshot)
})
