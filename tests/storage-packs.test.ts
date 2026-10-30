/** Packs d'espace de stockage : catalogue et validation d'une session Checkout payée. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { STORAGE_KIND, STORAGE_PACKS, parseStoragePack, storageGrantFromSession, storagePricePerGb, type StorageSessionLike } from '../lib/billing/storage-packs'

const USER = '11111111-2222-3333-4444-555555555555'
const session = (over: Partial<StorageSessionLike> = {}): StorageSessionLike => ({
  id: 'cs_test_abcdefghijkl',
  mode: 'payment',
  status: 'complete',
  payment_status: 'paid',
  client_reference_id: USER,
  amount_total: 1999,
  currency: 'eur',
  created: 1_800_000_000,
  metadata: { kind: STORAGE_KIND, pack: 'storage_50', user_id: USER, waiver_at: '1800000000' },
  payment_intent: 'pi_abcdefgh',
  ...over,
})

test('catalogue : +20 / +50 / +100 Go à 9,99 / 19,99 / 34,99 €', () => {
  assert.deepEqual(STORAGE_PACKS.map((p) => [p.gigabytes, p.priceCents]), [[20, 999], [50, 1999], [100, 3499]])
  assert.equal(storagePricePerGb(STORAGE_PACKS[2]), 0.35)
  assert.equal(parseStoragePack('storage_20')?.gigabytes, 20)
  assert.equal(parseStoragePack('storage_999'), null)
  assert.equal(parseStoragePack(undefined), null)
})

test('session payée valide : espace accordé', () => {
  const r = storageGrantFromSession(session())
  assert.ok(r.ok)
  if (r.ok) {
    assert.equal(r.grant.pack.gigabytes, 50)
    assert.equal(r.grant.paymentIntent, 'pi_abcdefgh')
    assert.equal(r.grant.waiverAt, new Date(1_800_000_000_000).toISOString())
  }
})

test('sessions refusées : autre type, non payée, montant ou compte incohérent', () => {
  assert.deepEqual(storageGrantFromSession(session({ metadata: { kind: 'ai_credits', pack: 'storage_50', user_id: USER } })), { ok: false, reason: 'not_storage' })
  assert.deepEqual(storageGrantFromSession(session({ payment_status: 'unpaid' })), { ok: false, reason: 'not_paid' })
  assert.deepEqual(storageGrantFromSession(session({ amount_total: 999 })), { ok: false, reason: 'invalid' })
  assert.deepEqual(storageGrantFromSession(session({ client_reference_id: '99999999-2222-3333-4444-555555555555' })), { ok: false, reason: 'invalid' })
  assert.deepEqual(storageGrantFromSession(session({ currency: 'usd' })), { ok: false, reason: 'invalid' })
})

test('prix figé dans la session et paiement contesté', () => {
  const frozen = storageGrantFromSession(session({ amount_total: 1499, metadata: { kind: STORAGE_KIND, pack: 'storage_50', user_id: USER, price_cents: '1499', gigabytes: '50', validity_months: '12' } }))
  assert.ok(frozen.ok && frozen.grant.amountCents === 1499 && frozen.grant.validityMonths === 12)
  const disputed = storageGrantFromSession(session({ payment_intent: { id: 'pi_abcdefgh', latest_charge: { refunded: false, disputed: true } } }))
  assert.deepEqual(disputed, { ok: false, reason: 'reversed' })
})
