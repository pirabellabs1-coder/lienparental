/**
 * Navigation rapide de l'espace connecté : chaque écran de /app a son loading.tsx (squelette
 * immédiat au clic, et seule façon pour Next de précharger une route dynamique), SAUF sous les
 * layouts-gardes du coffre-fort : un loading.tsx y ferait précharger le layout, donc l'état du
 * verrou, qui serait réutilisé (jusqu'à 5 min plus tard) au lieu d'être réévalué au clic.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { FULL_PREFETCH } from '../components/mobile/navItems'

const APP = path.join(process.cwd(), 'app', 'app')
const GATED = ['coffre', 'dossier'].map((d) => path.join(APP, d))

function pageDirs(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return pageDirs(p)
    return e.name === 'page.tsx' ? [dir] : []
  })
}

function allFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    return e.isDirectory() ? allFiles(p) : [p]
  })
}

const isGated = (dir: string) => GATED.some((g) => dir === g || dir.startsWith(g + path.sep))
const rel = (d: string) => path.relative(process.cwd(), d).replace(/\\/g, '/')

/**
 * Anciennes URL qui ne font que rediriger (redirect() serveur, aucun rendu) : un squelette n'y
 * montrerait qu'un écran intermédiaire et retarderait la redirection d'un chargement direct.
 */
function isRedirectOnly(dir: string): boolean {
  const src = fs.readFileSync(path.join(dir, 'page.tsx'), 'utf8')
  // Aucun `return` : la page redirige toujours, sans jamais rien rendre.
  return /\bredirect\(/.test(src) && !/\breturn\b/.test(src)
}

test('chaque écran de /app (hors coffre, dossier et redirections) a un loading.tsx', () => {
  const missing = pageDirs(APP).filter((d) => !isGated(d) && !isRedirectOnly(d) && !fs.existsSync(path.join(d, 'loading.tsx')))
  assert.deepEqual(missing.map(rel), [])
})

test('aucun loading.tsx sous les layouts-gardes du coffre-fort, à toute profondeur', () => {
  const found = GATED.flatMap(allFiles).filter((f) => path.basename(f) === 'loading.tsx')
  assert.deepEqual(found.map(rel), [])
})

test('les rubriques préchargées en entier sont des pages client hors coffre', () => {
  for (const href of FULL_PREFETCH) {
    assert.ok(!/^\/app\/(coffre|dossier)(\/|$)/.test(href), `${href} est sous une garde du coffre`)
    const seg = href === '/app' ? '(accueil)' : href.slice('/app/'.length)
    const page = fs.readFileSync(path.join(APP, seg, 'page.tsx'), 'utf8')
    assert.match(page, /^'use client'/, `${href} : page serveur, ses données préchargées pourraient être périmées`)
  }
})
