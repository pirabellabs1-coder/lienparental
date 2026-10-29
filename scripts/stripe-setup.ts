/**
 * Configuration Stripe de Lien Parental, IDEMPOTENTE (rejouable sans doublon).
 *
 *   npx --yes tsx scripts/stripe-setup.ts                 mode test (clé sk_test_ / rk_test_)
 *   npx --yes tsx scripts/stripe-setup.ts --live          autorise une clé live (production)
 *   options : --base-url=https://lienparental.fr   --rotate-webhook   --dry-run
 *
 * Clé : STRIPE_SECRET_KEY de l'environnement, sinon lue dans .env.vercel.local
 * (puis .env.local). Elle n'est JAMAIS affichée. STRIPE_TAX est lu de la même façon.
 *
 * Crée ou met à jour :
 *  1. deux produits (metadata lp_product = premium | coparentalite) ;
 *  2. quatre prix EUR récurrents (tarifs V6, components/profil/pricing.ts), retrouvés par lookup_key :
 *       lp_premium_monthly 14,99 €   lp_premium_yearly 149 €
 *       lp_coparentalite_monthly 24,99 €   lp_coparentalite_yearly 249 €
 *     tax_behavior « inclusive » (prix TTC) si STRIPE_TAX=on, sinon « unspecified ».
 *     Un prix existant au mauvais montant n'est jamais modifié (Stripe l'interdit) :
 *     un nouveau prix reprend la lookup_key (transfer_lookup_key), l'ancien est archivé. Les
 *     abonnés existants restent sur l'ancien prix (reconnu grâce à ses metadata) tant qu'ils ne
 *     sont pas migrés depuis le Dashboard ;
 *     Les recharges de crédits IA n'ont PAS de prix Stripe : leur montant est construit à chaque
 *     paiement depuis la configuration active (Checkout `price_data`, app/api/stripe/credits),
 *     pour rester modifiable depuis l'administration sans créer de prix immuables ;
 *  3. l'endpoint webhook <base>/api/stripe/webhook, version d'API STRIPE_API_VERSION, abonné
 *     EXACTEMENT aux événements traités par le code (lib/billing/events.ts). Son secret n'est lisible qu'à la
 *     création : il est affiché UNE seule fois ;
 *  4. une configuration du portail client (moyen de paiement, factures, résiliation
 *     en fin de période ; les changements de formule restent dans l'application).
 * Puis affiche les variables d'environnement à renseigner (noms ET valeurs).
 */
import fs from 'node:fs'
import path from 'node:path'
import Stripe from 'stripe'
import { HANDLED_STRIPE_EVENTS, STRIPE_API_VERSION } from '../lib/billing/events'
import { PRICING } from '../components/profil/pricing'

type PlanKey = 'premium' | 'coparentalite'
type Interval = 'month' | 'year'

const args = new Set(process.argv.slice(2))
const argValue = (name: string) => process.argv.slice(2).find(a => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=')
const LIVE_ALLOWED = args.has('--live')
const DRY_RUN = args.has('--dry-run')
const ROTATE_WEBHOOK = args.has('--rotate-webhook')
const BASE_URL = (argValue('base-url') ?? 'https://lienparental.fr').replace(/\/+$/, '')

// --- Lecture des variables (sans jamais les afficher) -------------------------

function readEnvFile(file: string): Record<string, string> {
  const p = path.resolve(process.cwd(), file)
  if (!fs.existsSync(p)) return {}
  const out: Record<string, string> = {}
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)
    if (!m) continue
    let v = m[2]!
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    out[m[1]!] = v.replace(/\\n/g, '').trim()
  }
  return out
}

const fileEnv = { ...readEnvFile('.env.local'), ...readEnvFile('.env.vercel.local') }
const env = (name: string) => process.env[name] || fileEnv[name] || ''

function fail(msg: string): never {
  console.error(`\n✖ ${msg}\n`)
  process.exit(1)
}

const KEY = env('STRIPE_SECRET_KEY')
if (!KEY) fail('STRIPE_SECRET_KEY introuvable (environnement, .env.vercel.local ou .env.local).')
if (!/^(sk|rk)_(test|live)_/.test(KEY)) fail('STRIPE_SECRET_KEY ne ressemble pas à une clé secrète Stripe (sk_… ou rk_…).')
const IS_LIVE = /^(sk|rk)_live_/.test(KEY)
if (IS_LIVE && !LIVE_ALLOWED) fail('Clé LIVE détectée : relancez avec --live pour configurer la production (commencez par le mode test).')

const TAX_ON = env('STRIPE_TAX') === 'on'
const TAX_BEHAVIOR: Stripe.PriceCreateParams.TaxBehavior = TAX_ON ? 'inclusive' : 'unspecified'

const stripe = new Stripe(KEY, { apiVersion: STRIPE_API_VERSION, maxNetworkRetries: 2, appInfo: { name: 'lien-parental-setup' } })

// --- Catalogue ------------------------------------------------------------------

const PRODUCTS: Record<PlanKey, { name: string; description: string }> = {
  premium: { name: 'Lien Parental Premium', description: '60 crédits IA par mois, tous les modèles, coffre-fort de 10 Go, exports.' },
  coparentalite: { name: 'Lien Parental Coparentalité+', description: 'Tout Premium, 200 crédits IA par mois, coffre-fort de 25 Go, espace familial partagé sur invitation.' },
}

const PRICES: { plan: PlanKey; interval: Interval; amount: number; lookupKey: string; env: string }[] = [
  { plan: 'premium', interval: 'month', amount: cents(PRICING.premium.monthly), lookupKey: 'lp_premium_monthly', env: 'STRIPE_PRICE_MONTHLY' },
  { plan: 'premium', interval: 'year', amount: cents(PRICING.premium.yearly), lookupKey: 'lp_premium_yearly', env: 'STRIPE_PRICE_YEARLY' },
  { plan: 'coparentalite', interval: 'month', amount: cents(PRICING.coparentalite.monthly), lookupKey: 'lp_coparentalite_monthly', env: 'STRIPE_PRICE_COPARENTALITE_MONTHLY' },
  { plan: 'coparentalite', interval: 'year', amount: cents(PRICING.coparentalite.yearly), lookupKey: 'lp_coparentalite_yearly', env: 'STRIPE_PRICE_COPARENTALITE_YEARLY' },
]

function cents(eur: number): number {
  return Math.round(eur * 100)
}

const log = (s: string) => console.log(`  ${s}`)

async function listAll<T extends { id: string }>(page: (startingAfter?: string) => Promise<Stripe.ApiList<T>>): Promise<T[]> {
  const all: T[] = []
  let after: string | undefined
  for (let i = 0; i < 50; i++) {
    const res = await page(after)
    all.push(...res.data)
    if (!res.has_more || res.data.length === 0) break
    after = res.data[res.data.length - 1]!.id
  }
  return all
}

// --- 1. Produits ------------------------------------------------------------------

async function ensureProducts(): Promise<Record<PlanKey, string>> {
  const existing = await listAll(after => stripe.products.list({ limit: 100, ...(after ? { starting_after: after } : {}) }))
  const ids = {} as Record<PlanKey, string>
  for (const plan of ['premium', 'coparentalite'] as const) {
    const found = existing.find(p => p.metadata?.lp_product === plan)
    const spec = PRODUCTS[plan]
    if (found) {
      if (!DRY_RUN && (!found.active || found.name !== spec.name || found.description !== spec.description)) {
        await stripe.products.update(found.id, { active: true, name: spec.name, description: spec.description })
        log(`Produit ${plan} mis à jour (${found.id})`)
      } else log(`Produit ${plan} : déjà présent (${found.id})`)
      ids[plan] = found.id
    } else if (DRY_RUN) {
      log(`[dry-run] créerait le produit ${plan}`)
      ids[plan] = `prod_DRYRUN_${plan}`
    } else {
      const p = await stripe.products.create(
        { name: spec.name, description: spec.description, metadata: { lp_product: plan } },
        { idempotencyKey: `lp-setup-product-${plan}-v1` },
      )
      log(`Produit ${plan} créé (${p.id})`)
      ids[plan] = p.id
    }
  }
  return ids
}

// --- 2. Prix ----------------------------------------------------------------------

async function ensurePrices(products: Record<PlanKey, string>): Promise<Record<string, string>> {
  const existing = await stripe.prices.list({ lookup_keys: PRICES.map(p => p.lookupKey), limit: 100, expand: ['data.product'] })
  const out: Record<string, string> = {}
  for (const spec of PRICES) {
    const cur = existing.data.find(p => p.lookup_key === spec.lookupKey)
    const productId = products[spec.plan]
    const matches =
      cur &&
      cur.active &&
      cur.currency === 'eur' &&
      cur.unit_amount === spec.amount &&
      cur.recurring?.interval === spec.interval &&
      (typeof cur.product === 'string' ? cur.product : cur.product.id) === productId &&
      // Sans Stripe Tax, tout comportement fiscal convient ; avec, « unspecified » se corrige sur place.
      (TAX_BEHAVIOR === 'unspecified' || cur.tax_behavior === TAX_BEHAVIOR || cur.tax_behavior === 'unspecified')

    if (cur && matches) {
      if (TAX_BEHAVIOR !== 'unspecified' && cur.tax_behavior === 'unspecified' && !DRY_RUN) {
        // « unspecified » → « inclusive » : seul changement de taxe autorisé sur un prix existant.
        await stripe.prices.update(cur.id, { tax_behavior: TAX_BEHAVIOR })
        log(`Prix ${spec.lookupKey} : comportement fiscal passé à ${TAX_BEHAVIOR}`)
      } else log(`Prix ${spec.lookupKey} : déjà correct (${cur.id})`)
      out[spec.env] = cur.id
      continue
    }
    if (DRY_RUN) {
      log(`[dry-run] ${cur ? 'remplacerait' : 'créerait'} le prix ${spec.lookupKey} (${spec.amount / 100} € / ${spec.interval})`)
      out[spec.env] = cur?.id ?? `price_DRYRUN_${spec.lookupKey}`
      continue
    }
    const created = await stripe.prices.create(
      {
        product: productId,
        currency: 'eur',
        unit_amount: spec.amount,
        recurring: { interval: spec.interval },
        tax_behavior: TAX_BEHAVIOR,
        lookup_key: spec.lookupKey,
        transfer_lookup_key: true,
        nickname: `${PRODUCTS[spec.plan].name} ${spec.interval === 'year' ? 'annuel' : 'mensuel'}`,
        // Repli de lib/billing/prices.ts#offerFromPrice si les variables ne sont pas à jour.
        metadata: { plan: spec.plan, lp_lookup_key: spec.lookupKey },
      },
      { idempotencyKey: `lp-setup-price-${spec.lookupKey}-${spec.amount}-${TAX_BEHAVIOR}-${productId}` },
    )
    if (cur) {
      await stripe.prices.update(cur.id, { active: false })
      log(`Prix ${spec.lookupKey} remplacé : ${cur.id} archivé, nouveau ${created.id} (les abonnés existants gardent l'ancien prix)`)
    } else log(`Prix ${spec.lookupKey} créé (${created.id})`)
    out[spec.env] = created.id
  }
  return out
}

// --- 3. Webhook -------------------------------------------------------------------

async function ensureWebhook(): Promise<{ id: string; secret: string | null }> {
  const url = `${BASE_URL}/api/stripe/webhook`
  const events = [...HANDLED_STRIPE_EVENTS] as Stripe.WebhookEndpointCreateParams.EnabledEvent[]
  const all = await listAll(after => stripe.webhookEndpoints.list({ limit: 100, ...(after ? { starting_after: after } : {}) }))
  const found = all.find(w => w.url === url)

  // La version d'API d'un endpoint est figée à sa création : si elle diffère de celle du
  // code (forme des payloads), l'endpoint est recréé (nouveau secret affiché).
  const versionMismatch = !!found && found.api_version !== STRIPE_API_VERSION
  if (versionMismatch) log(`Webhook ${found!.id} : version d'API ${found!.api_version ?? 'inconnue'} ≠ ${STRIPE_API_VERSION}, recréation`)
  if (found && !ROTATE_WEBHOOK && !versionMismatch) {
    const same = found.enabled_events.length === events.length && events.every(e => found.enabled_events.includes(e))
    if ((!same || found.status !== 'enabled') && !DRY_RUN) {
      await stripe.webhookEndpoints.update(found.id, { enabled_events: events, disabled: false })
      log(`Webhook ${found.id} : événements alignés sur le code (${events.length})`)
    } else log(`Webhook ${found.id} : déjà configuré (${url})`)
    return { id: found.id, secret: null }
  }
  if (DRY_RUN) {
    log(`[dry-run] ${found ? 'recréerait' : 'créerait'} le webhook ${url}`)
    return { id: found?.id ?? 'we_DRYRUN', secret: null }
  }
  if (found) {
    await stripe.webhookEndpoints.del(found.id)
    log(`Webhook ${found.id} supprimé (${versionMismatch ? 'version d’API' : '--rotate-webhook'})`)
  }
  const created = await stripe.webhookEndpoints.create({
    url,
    api_version: STRIPE_API_VERSION,
    enabled_events: events,
    description: 'Lien Parental : synchronisation des abonnements',
    metadata: { lp_webhook: 'billing' },
  })
  log(`Webhook créé (${created.id}) : ${url}`)
  return { id: created.id, secret: created.secret ?? null }
}

// --- 4. Portail client --------------------------------------------------------------

async function ensurePortal(): Promise<string> {
  const params: Stripe.BillingPortal.ConfigurationCreateParams = {
    business_profile: {
      headline: 'Lien Parental : gérez votre abonnement',
      privacy_policy_url: `${BASE_URL}/legal/confidentialite`,
      terms_of_service_url: `${BASE_URL}/legal/cgu`,
    },
    default_return_url: `${BASE_URL}/app/abonnement?info=portal`,
    features: {
      payment_method_update: { enabled: true },
      invoice_history: { enabled: true },
      customer_update: { enabled: true, allowed_updates: ['email', 'address', 'name'] },
      subscription_cancel: {
        enabled: true,
        mode: 'at_period_end',
        proration_behavior: 'none',
        cancellation_reason: { enabled: true, options: ['too_expensive', 'unused', 'missing_features', 'switched_service', 'other'] },
      },
      // Les changements de formule se font dans l'application (« Mon abonnement ») : règles de
      // prorata et programmation à l'échéance maîtrisées, droits resynchronisés. Désactivé ici.
      subscription_update: { enabled: false },
    },
    metadata: { lp_portal: 'v1' },
  }
  const all = await listAll(after => stripe.billingPortal.configurations.list({ limit: 100, ...(after ? { starting_after: after } : {}) }))
  const found = all.find(c => c.metadata?.lp_portal === 'v1' && c.active)
  if (DRY_RUN) {
    log(`[dry-run] ${found ? 'mettrait à jour' : 'créerait'} la configuration du portail`)
    return found?.id ?? 'bpc_DRYRUN'
  }
  if (found) {
    const { metadata: _m, ...update } = params
    await stripe.billingPortal.configurations.update(found.id, update)
    log(`Portail client : configuration ${found.id} mise à jour`)
    return found.id
  }
  const created = await stripe.billingPortal.configurations.create(params)
  log(`Portail client : configuration créée (${created.id})`)
  return created.id
}

// --- Exécution --------------------------------------------------------------------

async function main() {
  console.log(`\nStripe : mode ${IS_LIVE ? 'LIVE (production)' : 'test'}${DRY_RUN ? ', simulation (--dry-run)' : ''}`)
  console.log(`Base : ${BASE_URL}   Taxe : ${TAX_ON ? 'Stripe Tax actif, prix TTC (inclusive)' : 'désactivée (unspecified)'}\n`)

  console.log('1. Produits')
  const products = await ensureProducts()
  console.log('2. Prix')
  const prices = await ensurePrices(products)
  console.log('3. Webhook')
  const webhook = await ensureWebhook()
  console.log('4. Portail client')
  const portal = await ensurePortal()

  console.log('\nVariables à renseigner (Vercel > Settings > Environment Variables, puis redéployer) :\n')
  for (const spec of PRICES) console.log(`${spec.env}=${prices[spec.env]}`)
  console.log(`STRIPE_PORTAL_CONFIGURATION=${portal}`)
  console.log(`STRIPE_TAX=${TAX_ON ? 'on' : ''}`)
  if (webhook.secret) {
    console.log(`STRIPE_WEBHOOK_SECRET=${webhook.secret}`)
    console.log('\n⚠ Le secret du webhook (whsec_…) n’est affiché QU’UNE SEULE FOIS : copiez-le maintenant dans Vercel.')
    console.log('  Il ne pourra plus être relu par ce script ; en cas de perte : --rotate-webhook (nouvel endpoint, nouveau secret).')
  } else {
    console.log('STRIPE_WEBHOOK_SECRET=(inchangé : valeur déjà enregistrée, visible dans Dashboard > Développeurs > Webhooks)')
  }
  console.log('\nSTRIPE_SECRET_KEY : déjà en place (non affichée). Terminé.\n')
}

main().catch((err: unknown) => {
  const e = err as { type?: string; code?: string; message?: string }
  fail(`Échec Stripe${e?.type ? ` (${e.type}${e.code ? `, ${e.code}` : ''})` : ''} : ${e?.message ?? 'erreur inconnue'}`)
})
