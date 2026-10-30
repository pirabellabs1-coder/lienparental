/**
 * Titres SEO des pages publiques (lib/seo/titles.ts) et cohérence des textes ajoutés pour le référencement :
 * territoire dans le titre des fiches du Guide (les 6 territoires partagent les mêmes titres), FAQ de l'accueil
 * traduite, liens de l'accueil vers des fiches qui existent vraiment.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { IntlMessageFormat } from 'intl-messageformat'
import { localTitle, pageTitle, SUFFIX, TITLE_MAX } from '../lib/seo/titles'
import { titleTerritory } from '../lib/seo/territory-title'

const text = (t: ReturnType<typeof pageTitle>) => (typeof t === 'string' ? t + SUFFIX : t && 'absolute' in t ? t.absolute : '')
const read = (rel: string) => JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), 'utf8'))

test('localTitle ajoute le territoire et garde le suffixe du site quand ça tient', () => {
  assert.equal(localTitle('Médiation familiale', 'en Guyane', 'Guyane'), 'Médiation familiale en Guyane')
})

test('localTitle ne répète pas un territoire déjà cité', () => {
  assert.equal(localTitle('Aides au logement en Guyane', 'en Guyane', 'Guyane'), 'Aides au logement en Guyane')
})

test('localTitle trop long : le suffixe saute, puis le titre est raccourci, jamais le territoire', () => {
  const t = localTitle("Allocation d'éducation de l'enfant handicapé (AEEH) et MDPH", 'en Martinique', 'Martinique')
  const s = text(t)
  assert.ok(s.length <= TITLE_MAX, s)
  assert.ok(s.endsWith(' en Martinique'), s)
  assert.ok(!s.includes(SUFFIX), s)
})

test('chaque fiche du Guide a un titre unique une fois le territoire ajouté (FR)', () => {
  const where = new IntlMessageFormat(read('messages/fr/public.json').public.guide.inTerritory, 'fr')
  const root = path.join(process.cwd(), 'content/guide')
  const seen = new Map<string, string>()
  for (const code of fs.readdirSync(root)) {
    const dir = path.join(root, code, 'fiches')
    if (!fs.existsSync(dir)) continue
    const nom = read(`content/guide/${code}/territoire.json`).nom as string
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
      const fiche = read(`content/guide/${code}/fiches/${f}`)
      const s = text(localTitle(fiche.titre, String(where.format({ code, territory: nom })), nom))
      assert.ok(s.length <= TITLE_MAX, `${code}/${f} : ${s}`)
      assert.ok(!seen.has(s), `titre en double : « ${s} » (${seen.get(s)} et ${code}/${f})`)
      seen.set(s, `${code}/${f}`)
    }
  }
  assert.ok(seen.size > 200)
})

test('le complément de lieu est traduit pour chaque territoire, dans chaque langue', () => {
  const expected: Record<string, Record<string, string>> = {
    fr: { guyane: 'en Guyane', reunion: 'à La Réunion', mayotte: 'à Mayotte', france: 'en France' },
    en: { guyane: 'in French Guiana', france: 'in France' },
    pt: { guyane: 'na Guiana Francesa', guadeloupe: 'em Guadalupe', mayotte: 'em Mayotte', france: 'na França' },
  }
  for (const [locale, cases] of Object.entries(expected)) {
    const msg = new IntlMessageFormat(read(`messages/${locale}/public.json`).public.guide.inTerritory, locale)
    const names = read(`messages/${locale}/shared.json`).shared.territories
    for (const [code, want] of Object.entries(cases)) assert.equal(msg.format({ code, territory: names[code] }), want, `${locale}/${code}`)
  }
})

test('titleTerritory suit la langue du contenu, pas celle de l’interface', () => {
  assert.deepEqual(titleTerritory('guyane', 'fr'), { where: 'en Guyane', name: 'Guyane' })
  assert.deepEqual(titleTerritory('reunion', 'fr'), { where: 'à La Réunion', name: 'La Réunion' })
  assert.deepEqual(titleTerritory('guyane', 'en'), { where: 'in French Guiana', name: 'French Guiana' })
  assert.deepEqual(titleTerritory('martinique', 'pt'), { where: 'na Martinica', name: 'Martinica' })
  assert.equal(titleTerritory('guyane', 'xx').where, 'en Guyane')
})

test('titres EN et PT des fiches traduites : uniques et ≤ 60 caractères', () => {
  for (const lang of ['en', 'pt']) {
    const root = path.join(process.cwd(), `content/i18n/${lang}/guide`)
    if (!fs.existsSync(root)) continue
    const seen = new Map<string, string>()
    for (const code of fs.readdirSync(root)) {
      const dir = path.join(root, code, 'fiches')
      if (!fs.existsSync(dir)) continue
      const { where, name } = titleTerritory(code, lang)
      for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
        const titre = read(`content/i18n/${lang}/guide/${code}/fiches/${f}`).titre
        if (typeof titre !== 'string') continue
        const s = text(localTitle(titre, where, name))
        assert.ok(s.length <= TITLE_MAX, `${lang}/${code}/${f} : ${s}`)
        assert.ok(!seen.has(s), `${lang} : titre en double « ${s} »`)
        seen.set(s, f)
      }
    }
    assert.ok(seen.size > 100, `${lang} : ${seen.size} fiches`)
  }
})

test('FAQ et liens SEO de l’accueil présents dans les trois langues', () => {
  for (const locale of ['fr', 'en', 'pt']) {
    const m = read(`messages/${locale}.json`)
    for (const k of ['q7', 'a7', 'q8', 'a8', 'a8Link']) assert.ok(m.faq[k], `${locale} faq.${k}`)
    for (const k of ['separation', 'jaf', 'pension', 'mediation']) assert.ok(m.guide.popular[k], `${locale} guide.popular.${k}`)
    // « Chiffré de bout en bout » est interdit (docs/SECURITY.md) : chiffré en transit et au repos.
    assert.doesNotMatch(JSON.stringify(m.faq), /bout en bout|end-to-end|ponta a ponta/i)
  }
})

test('les liens de l’accueil vers le Guide visent des fiches et un parcours qui existent', () => {
  const src = fs.readFileSync(path.join(process.cwd(), 'components/accueil/Guide.tsx'), 'utf8')
  for (const [, slug] of src.matchAll(/guidePaths\.fiche\(POPULAR_TERRITORY, '([^']+)'\)/g)) {
    assert.ok(fs.existsSync(path.join(process.cwd(), `content/guide/guyane/fiches/${slug}.json`)), slug)
  }
  for (const [, slug] of src.matchAll(/guidePaths\.parcours\(POPULAR_TERRITORY, '([^']+)'\)/g)) {
    assert.ok(fs.existsSync(path.join(process.cwd(), `content/guide/guyane/parcours/${slug}.json`)), slug)
  }
  const faq = fs.readFileSync(path.join(process.cwd(), 'components/accueil/Faq.tsx'), 'utf8')
  const parcours = /lp\('\/guide\/guyane\/parcours\/([^']+)'\)/.exec(faq)?.[1]
  assert.ok(parcours && fs.existsSync(path.join(process.cwd(), `content/guide/guyane/parcours/${parcours}.json`)))
})
