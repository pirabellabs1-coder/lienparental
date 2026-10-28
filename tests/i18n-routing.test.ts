/** URL par langue des pages publiques : liste blanche, préfixes, décision de la middleware, en-têtes internes. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  LOCALE_HEADER,
  PATH_HEADER,
  decideLocaleRoute,
  forwardHeaders,
  isPublicLocalizable,
  localePath,
  signupPath,
  stripLocale,
} from '../lib/i18n/routing'
import { LOCALE_AUTO_COOKIE, LOCALE_COOKIE } from '../lib/i18n/config'
import { localeAlternates } from '../lib/seo/metadata'
import { localizedEntries } from '../lib/seo/sitemap-i18n'

test('liste blanche : pages publiques acceptées', () => {
  for (const p of [
    '/', '/aide', '/blog', '/blog/garde-alternee-guyane', '/guide', '/guide/guyane', '/guide/guyane/caf-allocations',
    '/guide/guyane/categorie/sante', '/guide/guyane/parcours/separation', '/legal/mentions', '/legal/cgu',
    '/legal/confidentialite', '/don', '/installer', '/a-propos', '/onboarding/connexion', '/onboarding/inscription',
  ]) assert.equal(isPublicLocalizable(p), true, p)
})

test('liste blanche : espaces privés et chemins douteux refusés', () => {
  for (const p of [
    '', '/app', '/app/guide', '/admin', '/admin/comptes', '/api', '/api/health', '/console', '/console/secret',
    '/onboarding', '/onboarding/profil', '/mot-de-passe-oublie', '/abonner', '/auth/callback', '/temoin/x', '/partage/x',
    '/aide/', '/blog/', '/blog/a/b', '/blog/Majuscule', '/blog/a%2Fb', '/blog/..', '/blog/a..b', '/blog/a_b',
    '/guide/guyane/a/b', '/guide/guyane/categorie/sante/x', '/legal/autre', '//evil.com', '/aide?x=1', '/inconnu',
    `/blog/${'a'.repeat(400)}`,
  ]) assert.equal(isPublicLocalizable(p), false, p)
})

test('stripLocale', () => {
  assert.deepEqual(stripLocale('/en'), { locale: 'en', path: '/' })
  assert.deepEqual(stripLocale('/pt/aide'), { locale: 'pt', path: '/aide' })
  assert.deepEqual(stripLocale('/fr/blog/x'), { locale: 'fr', path: '/blog/x' })
  assert.deepEqual(stripLocale('/aide'), { locale: null, path: '/aide' })
  assert.deepEqual(stripLocale('/english'), { locale: null, path: '/english' })
  assert.deepEqual(stripLocale('/EN/aide'), { locale: null, path: '/EN/aide' })
  assert.deepEqual(stripLocale('/'), { locale: null, path: '/' })
})

test('localePath : préfixe seulement la liste blanche, conserve requête et ancre', () => {
  assert.equal(localePath('en', '/'), '/en')
  assert.equal(localePath('pt', '/aide'), '/pt/aide')
  assert.equal(localePath('en', '/#tarifs'), '/en#tarifs')
  assert.equal(localePath('en', '/blog?categorie=droit&page=2'), '/en/blog?categorie=droit&page=2')
  assert.equal(localePath('fr', '/aide'), '/aide')
  assert.equal(localePath('fr', '/en/aide'), '/aide')
  assert.equal(localePath('en', '/pt/aide'), '/en/aide')
  assert.equal(localePath('en', '/en/aide'), '/en/aide')
  assert.equal(localePath(undefined, '/aide'), '/aide')
  assert.equal(localePath('xx', '/aide'), '/aide')
  // Hors liste blanche : inchangé (l'espace connecté n'a jamais de préfixe).
  assert.equal(localePath('en', '/app'), '/app')
  assert.equal(localePath('en', '/app/guide?territoire=guyane'), '/app/guide?territoire=guyane')
  assert.equal(localePath('en', '/onboarding'), '/onboarding')
  assert.equal(localePath('pt', '/onboarding/connexion?suite=%2Fapp'), '/pt/onboarding/connexion?suite=%2Fapp')
  // Liens externes, ancres, protocole relatif : inchangés.
  assert.equal(localePath('en', 'https://example.org/aide'), 'https://example.org/aide')
  assert.equal(localePath('en', 'mailto:a@b.c'), 'mailto:a@b.c')
  assert.equal(localePath('en', '#contenu'), '#contenu')
  assert.equal(localePath('en', '//evil.com/aide'), '//evil.com/aide')
})

test('signupPath', () => {
  assert.equal(signupPath('fr'), '/onboarding')
  assert.equal(signupPath('en'), '/en/onboarding/inscription')
  assert.equal(signupPath('pt'), '/pt/onboarding/inscription')
})

test('middleware : /en|pt/<page publique> → réécriture avec la langue imposée', () => {
  assert.deepEqual(decideLocaleRoute({ pathname: '/en', cookieLocale: 'en' }), { kind: 'rewrite', locale: 'en', path: '/' })
  assert.deepEqual(decideLocaleRoute({ pathname: '/pt', cookieLocale: 'pt' }), { kind: 'rewrite', locale: 'pt', path: '/' })
  assert.deepEqual(decideLocaleRoute({ pathname: '/en/aide', cookieLocale: 'fr' }), { kind: 'rewrite', locale: 'en', path: '/aide' })
  assert.deepEqual(decideLocaleRoute({ pathname: '/pt/guide/guyane/caf', cookieLocale: 'en' }), { kind: 'rewrite', locale: 'pt', path: '/guide/guyane/caf' })
  // La langue de l'URL l'emporte sur le cookie, et la réécriture vaut pour toutes les méthodes (actions serveur).
  assert.deepEqual(decideLocaleRoute({ pathname: '/en/blog', method: 'POST', cookieLocale: 'pt' }), { kind: 'rewrite', locale: 'en', path: '/blog' })
})

test('middleware : premier passage sur /en|pt sans cookie → la langue d\'arrivée est mémorisée, jamais écrasée', () => {
  assert.deepEqual(decideLocaleRoute({ pathname: '/en/aide' }), { kind: 'rewrite', locale: 'en', path: '/aide', setCookie: 'en' })
  assert.deepEqual(decideLocaleRoute({ pathname: '/pt', method: 'HEAD', cookieLocale: null }), { kind: 'rewrite', locale: 'pt', path: '/', setCookie: 'pt' })
  // Cookie existant (même invalide ou vide) : jamais écrasé.
  for (const cookieLocale of ['fr', 'en', 'pt', 'xx', '']) {
    const r = decideLocaleRoute({ pathname: '/en/aide', cookieLocale })
    assert.equal(r.kind === 'rewrite' && r.setCookie, undefined, String(cookieLocale))
  }
  // Mutation (action serveur) : pas de cookie posé ; hors liste blanche ou sans préfixe : jamais.
  assert.equal((decideLocaleRoute({ pathname: '/en/aide', method: 'POST' }) as { setCookie?: string }).setCookie, undefined)
  assert.equal(decideLocaleRoute({ pathname: '/en/app' }).kind, 'notFound')
  assert.deepEqual(decideLocaleRoute({ pathname: '/aide' }), { kind: 'next', locale: 'fr' })
})

test('middleware : préfixe hors liste blanche → 404, jamais servi', () => {
  for (const pathname of ['/en/app', '/en/app/guide', '/en/admin', '/en/admin/comptes', '/en/api', '/en/api/health',
    '/en/console', '/en/console/xyz', '/pt/inconnu', '/pt/onboarding', '/pt/onboarding/profil', '/en/en/aide', '/en//evil.com',
    '/fr/app', '/fr/admin', '/fr/inconnu']) {
    const r = decideLocaleRoute({ pathname, method: 'GET', cookieLocale: 'en' })
    assert.equal(r.kind, 'notFound', pathname)
  }
  for (const method of ['POST', 'PUT', 'DELETE']) {
    assert.equal(decideLocaleRoute({ pathname: '/en/api/coparents', method }).kind, 'notFound')
  }
})

test('middleware : /fr/<page publique> → 308 vers l\'URL sans préfixe', () => {
  assert.deepEqual(decideLocaleRoute({ pathname: '/fr/aide' }), { kind: 'redirect', status: 308, location: '/aide' })
  assert.deepEqual(decideLocaleRoute({ pathname: '/fr' }), { kind: 'redirect', status: 308, location: '/' })
})

test('middleware : page publique sans préfixe', () => {
  // Sans cookie (Googlebot) : français imposé, jamais de redirection (Accept-Language ignoré).
  assert.deepEqual(decideLocaleRoute({ pathname: '/' }), { kind: 'next', locale: 'fr' })
  assert.deepEqual(decideLocaleRoute({ pathname: '/aide', cookieLocale: 'fr' }), { kind: 'next', locale: 'fr' })
  assert.deepEqual(decideLocaleRoute({ pathname: '/aide', cookieLocale: 'xx' }), { kind: 'next', locale: 'fr' })
  // Cookie en|pt explicitement choisi (pas de marqueur lp_locale_auto) : 307 vers la version préfixée (GET/HEAD seulement).
  assert.deepEqual(decideLocaleRoute({ pathname: '/', cookieLocale: 'en' }), { kind: 'redirect', status: 307, location: '/en' })
  assert.deepEqual(decideLocaleRoute({ pathname: '/blog/x', method: 'HEAD', cookieLocale: 'pt' }), { kind: 'redirect', status: 307, location: '/pt/blog/x' })
  assert.deepEqual(decideLocaleRoute({ pathname: '/aide', method: 'POST', cookieLocale: 'en' }), { kind: 'next', locale: 'fr' })
  // Marqueur absent explicitement : même décision (choix explicite).
  assert.deepEqual(decideLocaleRoute({ pathname: '/aide', cookieLocale: 'en', cookieLocaleAuto: false }), { kind: 'redirect', status: 307, location: '/en/aide' })
})

test('middleware : cookie lp_locale posé automatiquement (marqueur lp_locale_auto) → jamais de 307, l\'URL décide', () => {
  for (const pathname of ['/', '/aide', '/blog/x', '/guide/guyane', '/onboarding/inscription']) {
    for (const cookieLocale of ['en', 'pt']) {
      for (const method of ['GET', 'HEAD']) {
        assert.deepEqual(
          decideLocaleRoute({ pathname, method, cookieLocale, cookieLocaleAuto: true }),
          { kind: 'next', locale: 'fr' },
          `${method} ${pathname} ${cookieLocale}`,
        )
      }
    }
  }
  // Les URL préfixées restent servies normalement, sans reposer de cookie (il existe déjà).
  assert.deepEqual(decideLocaleRoute({ pathname: '/en/aide', cookieLocale: 'en', cookieLocaleAuto: true }), { kind: 'rewrite', locale: 'en', path: '/aide' })
  // Espaces privés : inchangés (langue du cookie).
  assert.deepEqual(decideLocaleRoute({ pathname: '/app', cookieLocale: 'en', cookieLocaleAuto: true }), { kind: 'next', locale: null })
  // Le marqueur ne change rien aux 404 hors liste blanche ni à la 308 de /fr/….
  assert.equal(decideLocaleRoute({ pathname: '/en/app', cookieLocale: 'en', cookieLocaleAuto: true }).kind, 'notFound')
  assert.deepEqual(decideLocaleRoute({ pathname: '/fr/aide', cookieLocale: 'en', cookieLocaleAuto: true }), { kind: 'redirect', status: 308, location: '/aide' })
})

test('middleware : premier passage préfixé sans cookie → passThrough pose lp_locale ET lp_locale_auto (mêmes attributs)', async () => {
  const { NextRequest } = await import('next/server')
  const { passThrough } = await import('../lib/supabase/middleware')
  const route = decideLocaleRoute({ pathname: '/en/aide' })
  assert.ok(route.kind === 'rewrite' && route.setCookie === 'en')
  const req = new NextRequest('http://localhost:3000/en/aide')
  const res = passThrough(req, { locale: 'en', rewrite: new URL('http://localhost:3000/aide'), setLocaleCookie: route.setCookie })
  const locale = res.cookies.get(LOCALE_COOKIE)
  const auto = res.cookies.get(LOCALE_AUTO_COOKIE)
  assert.equal(locale?.value, 'en')
  assert.equal(auto?.value, '1')
  for (const k of ['path', 'maxAge', 'sameSite', 'secure', 'httpOnly'] as const) assert.equal(auto?.[k], locale?.[k], k)
  // Requête suivante (les deux cookies présents) : pas de 307 sur les URL françaises.
  assert.deepEqual(decideLocaleRoute({ pathname: '/aide', cookieLocale: locale?.value, cookieLocaleAuto: true }), { kind: 'next', locale: 'fr' })
  // Sans setLocaleCookie : aucun cookie posé.
  const plain = passThrough(new NextRequest('http://localhost:3000/aide'), { locale: 'fr' })
  assert.equal(plain.cookies.get(LOCALE_COOKIE), undefined)
  assert.equal(plain.cookies.get(LOCALE_AUTO_COOKIE), undefined)
})

test('middleware : espaces privés inchangés (langue du cookie, aucune redirection)', () => {
  for (const pathname of ['/app', '/app/guide', '/admin', '/console', '/console/secret', '/api/health', '/onboarding', '/onboarding/profil', '/inconnu']) {
    assert.deepEqual(decideLocaleRoute({ pathname, cookieLocale: 'en' }), { kind: 'next', locale: null }, pathname)
  }
})

test('middleware : les redirections ne visent qu\'un chemin interne de la liste blanche (pas d\'open redirect)', () => {
  const samples = ['/fr//evil.com', '/fr/\\evil.com', '/fr/https:/evil.com', '//evil.com', '/fr/%2F%2Fevil.com', '/fr/aide', '/', '/blog/x']
  for (const pathname of samples) {
    for (const cookieLocale of [undefined, 'en', 'pt', 'fr']) {
      const r = decideLocaleRoute({ pathname, cookieLocale })
      if (r.kind !== 'redirect') continue
      assert.ok(r.location.startsWith('/') && !r.location.startsWith('//'), `${pathname} → ${r.location}`)
      assert.ok(isPublicLocalizable(stripLocale(r.location).path), `${pathname} → ${r.location}`)
    }
  }
})

test('en-têtes internes : la valeur du client est toujours supprimée ou écrasée', () => {
  const client = new Headers({ [LOCALE_HEADER]: 'en', [PATH_HEADER]: '/admin', cookie: 'a=b', 'x-autre': '1' })
  const none = forwardHeaders(client, null)
  assert.equal(none.get(LOCALE_HEADER), null)
  assert.equal(none.get(PATH_HEADER), null)
  assert.equal(none.get('cookie'), 'a=b')
  assert.equal(none.get('x-autre'), '1')
  assert.equal(forwardHeaders(client, 'fr').get(LOCALE_HEADER), 'fr')
  assert.equal(forwardHeaders(new Headers({ [LOCALE_HEADER]: 'pt' }), 'en').get(LOCALE_HEADER), 'en')
  // La source n'est pas modifiée.
  assert.equal(client.get(LOCALE_HEADER), 'en')
})

test('alternates : canonical de la langue courante + hreflang fr/en/pt-BR/x-default', () => {
  const a = localeAlternates('/aide', { locale: 'en' })
  assert.match(a.canonical, /\/en\/aide$/)
  assert.deepEqual(Object.keys(a.languages ?? {}).sort(), ['en', 'fr', 'pt-BR', 'x-default'])
  assert.match(a.languages!['x-default']!, /\/aide$/)
  assert.ok(!/\/(en|pt)\//.test(a.languages!['x-default']!))
  assert.match(a.languages!['pt-BR']!, /\/pt\/aide$/)
  assert.match(localeAlternates('/', { locale: 'pt' }).canonical, /\/pt$/)
  assert.match(localeAlternates('/blog?page=2', { locale: 'en' }).canonical, /\/en\/blog\?page=2$/)
})

test('alternates : contenu non traduit (repli français) → canonical FR, aucun hreflang', () => {
  const a = localeAlternates('/guide/guyane/caf', { locale: 'en', contentLocale: 'fr', available: ['fr'] })
  assert.ok(a.canonical.endsWith('/guide/guyane/caf') && !a.canonical.includes('/en/'))
  assert.equal(a.languages, undefined)
  // Version française d'un contenu traduit seulement en anglais : le portugais n'est pas cité.
  const fr = localeAlternates('/blog/x', { locale: 'fr', available: ['fr', 'en'] })
  assert.deepEqual(Object.keys(fr.languages ?? {}).sort(), ['en', 'fr', 'x-default'])
})

test('sitemap : une entrée par langue réellement traduite, avec alternates', () => {
  const all = localizedEntries('/aide', { priority: 0.6 })
  assert.equal(all.length, 3)
  assert.ok(all.every((e) => e.alternates?.languages && Object.keys(e.alternates.languages).length === 4))
  const fiche = localizedEntries('/guide/guyane/caf', { priority: 0.7 }, ['fr', 'pt'])
  assert.deepEqual(fiche.map((e) => e.url.replace(/^https?:\/\/[^/]+/, '')), ['/guide/guyane/caf', '/pt/guide/guyane/caf'])
  const frOnly = localizedEntries('/blog/x', { priority: 0.6 }, ['fr'])
  assert.equal(frOnly.length, 1)
  assert.equal(frOnly[0]!.alternates, undefined)
})
