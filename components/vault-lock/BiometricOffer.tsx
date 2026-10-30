'use client'
/**
 * Proposition « Ouvrir le coffre avec l'empreinte », affichée une fois le coffre déverrouillé.
 * L'activation était cachée dans Profil › Sécurité › Coffre-fort : on la propose ici, au bon moment,
 * sur les appareils qui ont un capteur (Touch ID, Face ID, Windows Hello, empreinte Android).
 * « Plus tard » ou une activation réussie mémorisent le choix sur cet appareil (localStorage).
 */
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Fingerprint, X } from 'lucide-react'
import type { VaultStatus } from '@/lib/vault-lock/config'
import { VaultApiError, vaultApi } from './api'
import { WebauthnError, guessDeviceName, platformAuthenticatorAvailable, webauthnErrorMessage } from './webauthn-browser'

const DONE_KEY = 'lp-vault-bio-offer'

function readDone(): boolean {
  try {
    return localStorage.getItem(DONE_KEY) !== null
  } catch {
    return true // stockage indisponible : on ne harcèle pas à chaque ouverture
  }
}

function markDone(value: 'later' | 'enabled') {
  try {
    localStorage.setItem(DONE_KEY, value)
  } catch {
    // navigation privée : la proposition reviendra, sans conséquence
  }
}

export function BiometricOffer({ status, onStatus }: { status: VaultStatus; onStatus: (s: VaultStatus) => void }) {
  const t = useTranslations('vault.lock.gate.bioOffer')
  const tp = useTranslations('vault.lock.settings.passkeys')
  const te = useTranslations('vault.lock.errors')
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const hasReal = status.passkeys.some((p) => !p.simulated)

  useEffect(() => {
    // Compte de démonstration : l'empreinte y est simulée, la proposition n'a pas de sens.
    if (!status.enabled || status.demo || hasReal || readDone()) return
    let alive = true
    void platformAuthenticatorAvailable().then((ok) => { if (alive && ok) setVisible(true) })
    return () => { alive = false }
  }, [status.enabled, status.demo, hasReal])

  if (!visible) return null

  const enable = async () => {
    setBusy(true)
    setError(null)
    try {
      const name = guessDeviceName({ thisDevice: tp('thisDevice'), android: tp('android'), windows: tp('windows') })
      onStatus(await vaultApi.registerPasskey(name))
      markDone('enabled')
      setDone(true)
    } catch (e) {
      if (e instanceof WebauthnError) {
        if (e.kind !== 'cancelled') setError(webauthnErrorMessage(e, (k) => te(`webauthn.${k}`)))
      } else {
        setError(e instanceof VaultApiError && e.code !== 'network' ? e.message : te('network'))
      }
    } finally {
      setBusy(false)
    }
  }

  const later = () => {
    markDone('later')
    setVisible(false)
  }

  return (
    <div className="px-4 pt-3 lg:px-8">
      <section
        aria-labelledby="bio-offer-title"
        className="relative flex items-start gap-3 rounded-2xl border border-leaf-100 bg-leaf-50/70 p-4 pr-12"
      >
        <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-leaf-600 ring-1 ring-leaf-100">
          <Fingerprint className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="bio-offer-title" className="text-[14px] font-bold text-night-900">
            {done ? t('doneTitle') : t('title')}
          </h2>
          <p role={done ? 'status' : undefined} className="mt-0.5 text-[12.5px] leading-relaxed text-night-700">
            {done ? t('doneText') : t('text')}
          </p>
          {!done && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void enable()}
                disabled={busy}
                aria-busy={busy}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-leaf-500 px-4 text-[13.5px] font-semibold text-white transition-colors hover:bg-leaf-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:ring-offset-2 disabled:opacity-60"
              >
                <Fingerprint className="h-4 w-4" aria-hidden="true" />
                {busy ? tp('waiting') : t('enable')}
              </button>
              <button
                type="button"
                onClick={later}
                className="inline-flex min-h-[44px] items-center rounded-xl px-3 text-[13.5px] font-semibold text-night-700 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500"
              >
                {t('later')}
              </button>
              <Link href="/app/profil/securite/coffre" className="min-h-[44px] content-center px-1 text-[12.5px] font-semibold text-leaf-700 underline-offset-4 hover:underline">
                {t('settings')}
              </Link>
            </div>
          )}
          {error && <p role="alert" className="mt-2 text-[12.5px] font-semibold text-alert-600">{error}</p>}
        </div>
        <button
          type="button"
          onClick={later}
          aria-label={t('close')}
          className="absolute right-2 top-2 grid h-11 w-11 place-items-center rounded-full text-night-600 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </section>
    </div>
  )
}
