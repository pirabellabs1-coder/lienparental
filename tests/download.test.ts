/**
 * lib/download.ts : lien gardé 60 s hors app iPhone, feuille de partage dans l'app installée,
 * bouton « Enregistrer le fichier » quand le geste a expiré. Faux navigateur minimal.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { saveBlob } from '../lib/download'

type Env = { clicks: string[]; shares: number; buttons: { click(): void; textContent: string }[]; revoked: number[] }

function fakeBrowser(opts: { iosApp: boolean; active?: boolean; shareError?: string }): Env {
  const env: Env = { clicks: [], shares: 0, buttons: [], revoked: [] }
  const body = {
    appendChild(el: { tagName: string; download?: string; listeners?: Record<string, () => void> }) {
      if (el.tagName === 'BUTTON') env.buttons.push({ click: () => el.listeners!.click!(), textContent: (el as unknown as { textContent: string }).textContent })
    },
  }
  const makeEl = (tagName: string) => {
    const el: Record<string, unknown> = { tagName, style: {}, listeners: {} as Record<string, () => void> }
    el.click = () => env.clicks.push(el.download as string)
    el.remove = () => undefined
    el.focus = () => undefined
    el.addEventListener = (type: string, fn: () => void) => { (el.listeners as Record<string, () => void>)[type] = fn }
    return el
  }
  const globals: Record<string, unknown> = {
    navigator: {
      userAgent: opts.iosApp ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)' : 'Mozilla/5.0 (Linux; Android 14)',
      platform: opts.iosApp ? 'iPhone' : 'Linux',
      maxTouchPoints: 5,
      standalone: opts.iosApp,
      userActivation: { isActive: opts.active ?? true },
      canShare: () => true,
      share: async () => {
        env.shares++
        if (opts.shareError) { const e = new Error('x'); e.name = opts.shareError; throw e }
      },
    },
    document: { body, documentElement: { lang: 'fr' }, createElement: (t: string) => makeEl(t.toUpperCase()), getElementById: () => null },
    window: { matchMedia: () => ({ matches: false }), setTimeout: () => 0, clearTimeout: () => undefined },
  }
  // navigator est un accesseur en lecture seule dans Node : redéfini plutôt qu'assigné.
  for (const [k, v] of Object.entries(globals)) Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true })
  globalThis.URL.createObjectURL = () => 'blob:x'
  return env
}

const tick = () => new Promise((r) => setTimeout(r, 0))
const blob = () => new Blob(['a'], { type: 'text/plain' })

test('hors app iPhone : lien de téléchargement, jamais la feuille de partage', async () => {
  const env = fakeBrowser({ iosApp: false })
  saveBlob(blob(), 'a.txt')
  await tick()
  assert.deepEqual(env.clicks, ['a.txt'])
  assert.equal(env.shares, 0)
})

test('app iPhone : partage ; annulation = rien d’autre', async () => {
  const env = fakeBrowser({ iosApp: true, shareError: 'AbortError' })
  saveBlob(blob(), 'a.pdf')
  await tick()
  assert.equal(env.shares, 1)
  assert.equal(env.clicks.length, 0)
  assert.equal(env.buttons.length, 0)
})

test('app iPhone, geste expiré : bouton « Enregistrer le fichier », partage au nouvel appui', async () => {
  const env = fakeBrowser({ iosApp: true, active: false })
  saveBlob(blob(), 'dossier.pdf')
  await tick()
  assert.equal(env.shares, 0)
  assert.equal(env.buttons.length, 1)
  assert.match(env.buttons[0]!.textContent, /Enregistrer le fichier · dossier\.pdf/)
  env.buttons[0]!.click()
  await tick()
  assert.equal(env.shares, 1)
})

test('app iPhone, partage refusé (NotAllowedError) : bouton plutôt qu’un lien inopérant', async () => {
  const env = fakeBrowser({ iosApp: true, shareError: 'NotAllowedError' })
  saveBlob(blob(), 'a.pdf')
  await tick()
  assert.equal(env.buttons.length, 1)
  assert.equal(env.clicks.length, 0)
})
