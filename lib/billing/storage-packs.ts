// Packs d'espace de stockage supplémentaire (paiement unique, valables 12 mois).
// Module PUR : importable par la route de paiement, le webhook, les écrans et les tests.
//
// Règles :
//  - disponibles pour toutes les formules, Gratuit compris ; l'espace s'ajoute au quota de l'offre
//    (storage_extra_bytes, 0610) et n'ouvre aucun autre droit ;
//  - valables 12 mois après l'achat ; plusieurs packs se cumulent ;
//  - à l'expiration, aucun fichier n'est supprimé : seuls les nouveaux ajouts sont refusés tant
//    que l'espace utilisé dépasse le quota.
// Le montant facturé est construit côté serveur (Stripe Checkout `price_data`) : le client
// n'envoie qu'un identifiant de pack.

export type StoragePack = {
  id: string
  /** Espace ajouté, en Go. */
  gigabytes: number
  /** Prix TTC en centimes d'euro. */
  priceCents: number
}

export const STORAGE_PACKS: readonly StoragePack[] = [
  { id: 'storage_20', gigabytes: 20, priceCents: 999 },
  { id: 'storage_50', gigabytes: 50, priceCents: 1999 },
  { id: 'storage_100', gigabytes: 100, priceCents: 3499 },
]

export const STORAGE_VALIDITY_MONTHS = 12
export const STORAGE_CURRENCY = 'eur'
/** `metadata.kind` des sessions Checkout d'achat d'espace (distingue des crédits et abonnements). */
export const STORAGE_KIND = 'storage_pack'

/** Pack mis en avant (meilleur rapport). */
export const STORAGE_FEATURED = 'storage_50'

/** Identifiant de pack d'une entrée non fiable (formulaire, metadata) ; null si inconnu. */
export function parseStoragePack(value: unknown): StoragePack | null {
  const v = Array.isArray(value) ? value[0] : value
  if (typeof v !== 'string') return null
  return STORAGE_PACKS.find((p) => p.id === v) ?? null
}

/** Prix au Go et par an, en euros (0,50 ; 0,40 ; 0,35). */
export function storagePricePerGb(pack: StoragePack): number {
  return Math.round(pack.priceCents / pack.gigabytes) / 100
}

// --- Validation d'une session Checkout payée -------------------------------------------------

export type StorageSessionLike = {
  id: string
  mode: string | null
  status: string | null
  payment_status: string | null
  client_reference_id: string | null
  amount_total: number | null
  currency: string | null
  created: number
  metadata: Record<string, string> | null
  /** Développé (`expand: ['payment_intent.latest_charge']`) : un paiement remboursé ou contesté n'accorde rien. */
  payment_intent: string | { id: string; latest_charge?: string | { refunded?: boolean; disputed?: boolean } | null } | null
}

export type StorageGrant = {
  userId: string
  pack: StoragePack
  amountCents: number
  currency: string
  sessionId: string
  paymentIntent: string | null
  purchasedAt: string
  waiverAt: string | null
  /** Durée figée dans la session à sa création. */
  validityMonths: number
}

export type StorageGrantSkip = 'not_storage' | 'not_paid' | 'invalid' | 'reversed'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SESSION_RE = /^cs_(test|live)_[A-Za-z0-9]{10,200}$/

/**
 * Pack FIGÉ dans la session à sa création (prix et espace des metadata écrites par le serveur) :
 * un changement de tarif pendant la validité de la session ne fait jamais perdre un paiement.
 */
function sessionPack(meta: Record<string, string> | null): StoragePack | null {
  const known = parseStoragePack(meta?.pack)
  if (!known) return null
  const priceCents = Number(meta?.price_cents ?? known.priceCents)
  const gigabytes = Number(meta?.gigabytes ?? known.gigabytes)
  if (!Number.isInteger(priceCents) || priceCents < 0 || !Number.isInteger(gigabytes) || gigabytes < 1 || gigabytes > 1000) return null
  return { id: known.id, gigabytes, priceCents }
}

/** Session d'achat d'espace ? (pour aiguiller le webhook sans rien valider d'autre). */
export function isStorageSession(s: Pick<StorageSessionLike, 'mode' | 'metadata'>): boolean {
  return s.mode === 'payment' && s.metadata?.kind === STORAGE_KIND
}

/**
 * Valide une session payée et en déduit l'espace à accorder. Utilisateur, pack, montant et devise
 * sont recoupés côté serveur ; un montant différent du prix du pack n'est jamais accordé.
 */
export function storageGrantFromSession(s: StorageSessionLike): { ok: true; grant: StorageGrant } | { ok: false; reason: StorageGrantSkip } {
  if (!isStorageSession(s)) return { ok: false, reason: 'not_storage' }
  if (s.status !== 'complete' || s.payment_status !== 'paid') return { ok: false, reason: 'not_paid' }
  const userId = s.client_reference_id
  const pack = sessionPack(s.metadata)
  if (!SESSION_RE.test(s.id) || !userId || !UUID_RE.test(userId) || s.metadata?.user_id !== userId || !pack) return { ok: false, reason: 'invalid' }
  if (s.amount_total !== pack.priceCents || (s.currency ?? '').toLowerCase() !== STORAGE_CURRENCY) return { ok: false, reason: 'invalid' }
  const pi = s.payment_intent
  const charge = pi && typeof pi === 'object' ? pi.latest_charge : null
  if (charge && typeof charge === 'object' && (charge.refunded || charge.disputed)) return { ok: false, reason: 'reversed' }
  const waiver = Number(s.metadata?.waiver_at)
  const months = Number(s.metadata?.validity_months)
  return {
    ok: true,
    grant: {
      userId,
      pack,
      amountCents: s.amount_total,
      currency: STORAGE_CURRENCY,
      sessionId: s.id,
      paymentIntent: typeof pi === 'string' ? pi : pi?.id ?? null,
      purchasedAt: new Date(s.created * 1000).toISOString(),
      waiverAt: Number.isFinite(waiver) && waiver > 0 ? new Date(waiver * 1000).toISOString() : null,
      validityMonths: Number.isInteger(months) && months >= 1 && months <= 36 ? months : STORAGE_VALIDITY_MONTHS,
    },
  }
}
