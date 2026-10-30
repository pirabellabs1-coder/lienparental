'use client'
/**
 * Garde du coffre-fort (côté navigateur).
 *
 * Le serveur reste l'autorité : app/app/coffre/layout.tsx ne transmet les écrans du
 * coffre (children) QUE si le cookie de session coffre est valide. Ce composant :
 * - affiche l'écran de déverrouillage tant que le coffre est verrouillé ;
 * - après déverrouillage, rafraîchit la route (router.refresh) pour recevoir les écrans ;
 * - reverrouille : inactivité (délai réglable), arrière-plan prolongé, bouton
 *   « Verrouiller », expiration serveur, verrouillage depuis un autre onglet ;
 * - prolonge le cookie côté serveur au fil de l'activité (au plus 1 appel par minute).
 */
import { useRouter } from 'next/navigation'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, Lock } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { VaultStatus } from '@/lib/vault-lock/config'
import { VaultApiError, vaultApi } from './api'
import { BiometricOffer } from './BiometricOffer'
import { VaultUnlockScreen } from './VaultUnlockScreen'

type LockReason = 'manual' | 'inactivity' | 'background' | 'expired' | 'other-tab'

type Ctx = {
  status: VaultStatus
  setStatus: (s: VaultStatus) => void
  lock: (reason?: LockReason) => void
}

const VaultContext = createContext<Ctx | null>(null)

export function useVault(): Ctx {
  const ctx = useContext(VaultContext)
  if (!ctx) throw new Error('useVault() hors de <VaultGate>')
  return ctx
}

const TOUCH_EVERY_MS = 60_000
const CHECK_EVERY_MS = 5_000
const CHANNEL = 'lp-vault-lock'

/** Clés des messages affichés après verrouillage (vault.lock.gate.notices.*). */
const NOTICE_KEYS: Record<LockReason, string> = {
  manual: 'manual',
  inactivity: 'inactivity',
  background: 'background',
  expired: 'expired',
  'other-tab': 'otherTab',
}

type Props = {
  initialStatus: VaultStatus | null
  /** Refus serveur (configuration absente, double authentification…). */
  blocked?: { title: string; message: string; href?: string; cta?: string } | null
  context?: 'coffre' | 'settings'
  /** Bouton flottant « Verrouiller » (écrans du coffre). */
  showLockButton?: boolean
  children?: ReactNode
}

export function VaultGate({ initialStatus, blocked, context = 'coffre', showLockButton = true, children }: Props) {
  const router = useRouter()
  const t = useTranslations('vault.lock.gate')
  const tc = useTranslations('vault.common')
  const [status, setStatusState] = useState<VaultStatus | null>(initialStatus)
  const [notice, setNotice] = useState<string | null>(null)
  const [announce, setAnnounce] = useState('')
  const lastActivity = useRef(Date.now())
  const lastTouch = useRef(Date.now())
  const hiddenAt = useRef<number | null>(null)
  const channel = useRef<BroadcastChannel | null>(null)

  const unlocked = Boolean(status && status.unlocked)

  const setStatus = useCallback((s: VaultStatus) => setStatusState(s), [])

  const lock = useCallback((reason: LockReason = 'manual') => {
    setStatusState((s) => (s && s.enabled ? { ...s, unlocked: false, expiresAt: null } : s))
    setNotice(t(`notices.${NOTICE_KEYS[reason]}`))
    setAnnounce(t('locked'))
    if (reason !== 'other-tab') channel.current?.postMessage({ type: 'locked' })
    // Puis retire les écrans du coffre de l'arbre rendu côté serveur, une fois le cookie effacé.
    if (reason === 'background') {
      vaultApi.lockBeacon()
      router.refresh()
    } else if (reason === 'other-tab' || reason === 'expired') {
      router.refresh()
    } else {
      void vaultApi.lock().catch(() => undefined).finally(() => router.refresh())
    }
  }, [router, t])

  const onUnlocked = useCallback((s: VaultStatus) => {
    setStatusState(s)
    setNotice(null)
    setAnnounce(t('unlocked'))
    lastActivity.current = Date.now()
    lastTouch.current = Date.now()
    channel.current?.postMessage({ type: 'unlocked' })
    router.refresh()
  }, [router, t])

  // Synchronisation entre onglets du même navigateur.
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const bc = new BroadcastChannel(CHANNEL)
    channel.current = bc
    bc.onmessage = (ev: MessageEvent<{ type: string }>) => {
      if (ev.data?.type === 'locked') lock('other-tab')
      if (ev.data?.type === 'unlocked') {
        void vaultApi.status().then((s) => { if (s.unlocked) { setStatusState(s); setNotice(null); router.refresh() } }).catch(() => undefined)
      }
    }
    return () => { bc.close(); channel.current = null }
  }, [lock, router])

  // Inactivité, échéance serveur et arrière-plan : seulement quand le verrou est actif et ouvert.
  const active = Boolean(status?.enabled && status.unlocked)
  const timeoutMs = (status?.timeoutMinutes ?? 10) * 60_000
  const backgroundMs = (status?.backgroundSeconds ?? 60) * 1000
  const expiresAt = status?.expiresAt ?? null

  useEffect(() => {
    if (!active) return
    lastActivity.current = Date.now()

    const onActivity = () => {
      const now = Date.now()
      lastActivity.current = now
      if (now - lastTouch.current < TOUCH_EVERY_MS) return
      lastTouch.current = now
      vaultApi.touch()
        .then((r) => setStatusState((s) => (s ? { ...s, expiresAt: r.expiresAt } : s)))
        .catch((e) => { if (e instanceof VaultApiError && e.code === 'vault_locked') lock('expired') })
    }
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const
    events.forEach((ev) => window.addEventListener(ev, onActivity, { passive: true, capture: true }))

    const tick = setInterval(() => {
      const now = Date.now()
      if (document.visibilityState === 'hidden') return
      if (now - lastActivity.current >= timeoutMs) lock('inactivity')
      else if (expiresAt && now >= expiresAt) lock('expired')
    }, CHECK_EVERY_MS)

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now()
        if (backgroundMs === 0) lock('background')
        return
      }
      const away = hiddenAt.current ? Date.now() - hiddenAt.current : 0
      hiddenAt.current = null
      if (away >= backgroundMs || Date.now() - lastActivity.current >= timeoutMs) lock('background')
      else onActivity()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, onActivity, { capture: true }))
      clearInterval(tick)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [active, timeoutMs, backgroundMs, expiresAt, lock])

  const ctx = useMemo<Ctx | null>(() => (status ? { status, setStatus, lock } : null), [status, setStatus, lock])

  const live = <p className="sr-only" role="status" aria-live="polite">{announce}</p>

  if (blocked || !status || !ctx) {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center px-6 text-center">
        <span aria-hidden="true" className="flex h-16 w-16 items-center justify-center rounded-full bg-night-900 text-white">
          <Lock className="h-7 w-7" />
        </span>
        <h1 className="mt-5 text-[20px] font-extrabold text-night-900">{blocked?.title ?? t('unavailableTitle')}</h1>
        <p className="mt-2 max-w-[320px] text-[14px] leading-relaxed text-night-600">
          {blocked?.message ?? t('unavailableText')}
        </p>
        {blocked?.href && (
          <a href={blocked.href} className="mt-5 inline-flex min-h-[48px] items-center rounded-xl bg-leaf-500 px-5 text-[15px] font-semibold text-white hover:bg-leaf-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:ring-offset-2">
            {blocked.cta ?? tc('continue')}
          </a>
        )}
      </div>
    )
  }

  if (!unlocked) {
    return (
      <VaultContext.Provider value={ctx}>
        {live}
        <VaultUnlockScreen status={status} onUnlocked={onUnlocked} context={context} notice={notice} />
      </VaultContext.Provider>
    )
  }

  return (
    <VaultContext.Provider value={ctx}>
      {live}
      {/* Écrans du coffre : proposer l'empreinte sur cet appareil s'il en a une et qu'aucune n'est enregistrée. */}
      {context === 'coffre' && children && <BiometricOffer status={status} onStatus={setStatus} />}
      {children ?? (
        // Déverrouillé : les écrans arrivent du serveur (router.refresh en cours).
        <div role="status" className="flex min-h-[60dvh] items-center justify-center gap-2 text-[14px] font-semibold text-night-700">
          <Loader2 className="h-5 w-5 motion-safe:animate-spin" aria-hidden="true" /> {t('opening')}
        </div>
      )}
      {showLockButton && status.enabled && <LockButton onLock={() => lock('manual')} />}
    </VaultContext.Provider>
  )
}

/**
 * Bouton flottant « Verrouiller ». Mobile : au-dessus de la barre d'onglets, remonté
 * quand une barre d'actions collante (StickyActions) est présente à l'écran.
 */
function LockButton({ onLock }: { onLock: () => void }) {
  const t = useTranslations('vault.lock.gate')
  return (
    <button
      type="button"
      onClick={onLock}
      className={cn(
        'fixed right-4 z-40 inline-flex min-h-[44px] items-center gap-2 rounded-full border border-night-100 bg-white/95 px-4 text-[13.5px] font-bold text-night-900',
        'shadow-card backdrop-blur transition-[background-color,transform] duration-200 hover:bg-night-50 active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:ring-offset-2',
        'bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] lg:bottom-8 lg:right-12',
        // Écran avec barre d'actions collante : pastille ronde compacte, au-dessus de la barre.
        '[body:has([data-sticky-actions])_&]:bottom-[calc(9.75rem+env(safe-area-inset-bottom,0px))] [body:has([data-sticky-actions])_&]:w-11 [body:has([data-sticky-actions])_&]:justify-center [body:has([data-sticky-actions])_&]:px-0',
        'lg:[body:has([data-sticky-actions])_&]:bottom-8 lg:[body:has([data-sticky-actions])_&]:w-auto lg:[body:has([data-sticky-actions])_&]:px-4',
      )}
    >
      <Lock className="h-4 w-4 shrink-0 text-leaf-600" aria-hidden="true" />
      <span className="[body:has([data-sticky-actions])_&]:sr-only lg:[body:has([data-sticky-actions])_&]:not-sr-only">{t('lockButton')}</span>
    </button>
  )
}
