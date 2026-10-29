/** Candidature « Devenir partenaire » : schéma partagé, e-mail interne, routes localisées, catalogue. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { partnerApplicationSchema } from '../lib/partenaires/types'
import { partnerApplicationEmail } from '../lib/email/templates/partnerApplication'
import { isPublicLocalizable } from '../lib/i18n/routing'
import { partnersOf, type Partner } from '../lib/partenaires/catalog'

const LONG = 'Nous accompagnons les familles monoparentales de Cayenne depuis dix ans.'
const VALID = {
  profil: 'association',
  structure: '  Association Familles 973 ',
  contactName: 'Nadia Pierre',
  email: '  Contact@Familles973.FR ',
  telephone: '',
  territoire: 'guyane',
  site: '',
  reseaux: '',
  presentation: LONG,
  proposition: LONG,
  consent: true,
}

test('schéma : candidature complète acceptée, valeurs normalisées', () => {
  const r = partnerApplicationSchema.safeParse(VALID)
  assert.ok(r.success)
  assert.equal(r.data.structure, 'Association Familles 973')
  assert.equal(r.data.email, 'contact@familles973.fr')
  assert.equal(r.data.telephone, undefined) // champ facultatif vide
  assert.equal(r.data.site, undefined)
})

test('schéma : champs obligatoires, formats et consentement contrôlés', () => {
  const codes = (input: Record<string, unknown>) => {
    const r = partnerApplicationSchema.safeParse({ ...VALID, ...input })
    return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [i.path.join('.'), i.message]))
  }
  assert.equal(codes({ structure: ' ' }).structure, 'required')
  assert.equal(codes({ email: 'pas-une-adresse' }).email, 'invalidEmail')
  assert.equal(codes({ telephone: 'abc' }).telephone, 'invalidPhone')
  assert.equal(codes({ site: 'javascript:alert(1)' }).site, 'invalidUrl')
  assert.equal(codes({ site: 'familles973.fr' }).site, 'invalidUrl')
  assert.equal(codes({ presentation: 'Trop court' }).presentation, 'tooShort')
  assert.equal(codes({ consent: false }).consent, 'required')
  assert.ok(codes({ profil: 'banque' }).profil)
  assert.ok(codes({ territoire: 'paris' }).territoire)
  assert.ok(codes({ proposition: 'x'.repeat(2001) }).proposition)
})

test('schéma : numéro et site valides acceptés', () => {
  const r = partnerApplicationSchema.safeParse({ ...VALID, telephone: '+594 694 12 34 56', site: 'https://familles973.fr' })
  assert.ok(r.success)
  assert.equal(r.data.telephone, '+594 694 12 34 56')
})

test('e-mail interne : contenu du candidat échappé, objet lisible', () => {
  const data = partnerApplicationSchema.parse({ ...VALID, structure: '<script>alert(1)</script>', presentation: `${LONG}\n<img src=x onerror=alert(1)>` })
  const { subject, html } = partnerApplicationEmail({ ...data, receivedAtIso: '2026-10-29T12:00:00.000Z', ipBucket: '203.0.113.7' })
  assert.ok(!html.includes('<script>alert(1)</script>'))
  assert.ok(html.includes('&lt;script&gt;'))
  assert.ok(!html.includes('<img src=x'))
  assert.ok(html.includes('<br>'), 'sauts de ligne conservés')
  assert.match(subject, /^Candidature partenaire — Association — /)
  assert.ok(html.includes('Guyane'))
})

test('routes : /partenaires et /partenaires/candidature localisables, pas les sous-chemins inconnus', () => {
  assert.equal(isPublicLocalizable('/partenaires'), true)
  assert.equal(isPublicLocalizable('/partenaires/candidature'), true)
  assert.equal(isPublicLocalizable('/partenaires/autre'), false)
  assert.equal(isPublicLocalizable('/partenaires/'), false)
})

test('catalogue : partenaires filtrés par catégorie', () => {
  const list: Partner[] = [
    { name: 'A', category: 'institution', image: '/a.svg' },
    { name: 'B', category: 'createur', image: '/b.jpg' },
  ]
  assert.deepEqual(partnersOf('institution', list).map((p) => p.name), ['A'])
  assert.deepEqual(partnersOf('association', list), [])
})

test('e-mail interne : site du candidat affiché en texte, jamais en lien', () => {
  const data = partnerApplicationSchema.parse({ ...VALID, site: 'https://familles973.fr/page?a=1&b=2' })
  const { html } = partnerApplicationEmail({ ...data, receivedAtIso: '2026-10-29T12:00:00.000Z', ipBucket: 'unknown' })
  assert.ok(html.includes('https://familles973.fr/page?a=1&amp;b=2'))
  assert.ok(!html.includes('href="https://familles973.fr'))
})

test('schéma : caractères invisibles et d’inversion retirés ; objet sans double échappement', () => {
  const data = partnerApplicationSchema.parse({ ...VALID, structure: 'Familles\u202E & Co\u200B' })
  assert.equal(data.structure, 'Familles & Co')
  const { subject } = partnerApplicationEmail({ ...data, receivedAtIso: '2026-10-29T12:00:00.000Z', ipBucket: 'unknown' })
  assert.ok(subject.endsWith('Familles & Co'))
})
