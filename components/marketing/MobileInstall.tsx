'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { ArrowLeft, Bell, CheckCircle2, ChevronDown, Download, Heart, HelpCircle, Lock, ShieldCheck, Smartphone, X, Zap } from 'lucide-react'
import { Logo } from '@/components/brand/Logo'
import { InstallSteps, type InstallOS } from '@/components/install/InstallSteps'
import { PhoneIllustration } from '@/components/install/PhoneIllustration'
import { cn } from '@/lib/cn'

/** Événement non standard (Chromium) émis quand l'installation de la PWA est possible. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const TABS: { id: InstallOS; label: string }[] = [
  { id: 'ios', label: 'iPhone (iOS)' },
  { id: 'android', label: 'Android' },
]

const BENEFITS = [
  { icon: Zap, text: 'Accès rapide depuis votre écran d’accueil' },
  { icon: Bell, text: 'Notifications importantes en temps réel' },
  { icon: ShieldCheck, text: 'Expérience fluide et sécurisée, comme une vraie application' },
]

const DON_HIDDEN_KEY = 'lp:install-don-hidden'

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // Safari iOS (écran d'accueil)
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

type Props = {
  /** `/app` si connecté, sinon `/onboarding`. */
  continueHref: string
  /** QR code (composant serveur) affiché sur ordinateur pour ouvrir la page sur le téléphone. */
  qr: ReactNode
}

export function MobileInstall({ continueHref, qr }: Props) {
  const router = useRouter()
  const baseId = useId()
  const [os, setOs] = useState<InstallOS>('ios')
  const [installed, setInstalled] = useState(false)
  const [promptEvt, setPromptEvt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installStatus, setInstallStatus] = useState('')
  const [donOpen, setDonOpen] = useState(true)
  const [donHidden, setDonHidden] = useState(false)
  const tabRefs = useRef<Record<InstallOS, HTMLButtonElement | null>>({ ios: null, android: null })

  useEffect(() => {
    if (/android/i.test(navigator.userAgent)) setOs('android')
    if (isStandalone()) setInstalled(true)
    try { if (sessionStorage.getItem(DON_HIDDEN_KEY) === '1') setDonHidden(true) } catch { /* stockage indisponible */ }

    const mq = window.matchMedia('(display-mode: standalone)')
    const onMode = (e: MediaQueryListEvent) => { if (e.matches) setInstalled(true) }
    const onBIP = (e: Event) => { e.preventDefault(); setPromptEvt(e as BeforeInstallPromptEvent) }
    const onInstalled = () => { setPromptEvt(null); setInstalled(true) }
    mq.addEventListener('change', onMode)
    window.addEventListener('beforeinstallprompt', onBIP)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      mq.removeEventListener('change', onMode)
      window.removeEventListener('beforeinstallprompt', onBIP)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const tabId = (k: InstallOS) => `${baseId}-tab-${k}`
  const panelId = `${baseId}-panel`

  function onTabKey(e: KeyboardEvent<HTMLButtonElement>) {
    const i = TABS.findIndex(t => t.id === os)
    let next = -1
    if (e.key === 'ArrowRight') next = (i + 1) % TABS.length
    else if (e.key === 'ArrowLeft') next = (i - 1 + TABS.length) % TABS.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = TABS.length - 1
    if (next < 0) return
    e.preventDefault()
    const k = TABS[next].id
    setOs(k)
    tabRefs.current[k]?.focus()
  }

  async function installNow() {
    const evt = promptEvt
    if (!evt) return
    try {
      await evt.prompt()
      const { outcome } = await evt.userChoice
      setInstallStatus(outcome === 'accepted'
        ? 'Installation en cours. Lien Parental sera bientôt sur votre écran d’accueil.'
        : 'Installation annulée. Vous pouvez suivre les étapes ci-dessous à tout moment.')
    } catch {
      setInstallStatus('L’installation automatique n’a pas pu démarrer. Suivez les étapes ci-dessous.')
    } finally {
      // L'événement ne peut servir qu'une fois.
      setPromptEvt(null)
    }
  }

  function hideDon() {
    setDonHidden(true)
    try { sessionStorage.setItem(DON_HIDDEN_KEY, '1') } catch { /* stockage indisponible */ }
  }

  function goBack(e: MouseEvent<HTMLAnchorElement>) {
    // Revient à la page précédente du site si elle existe, sinon suit le lien vers l'accueil.
    if (document.referrer.startsWith(window.location.origin) && window.history.length > 1) {
      e.preventDefault()
      router.back()
    }
  }

  return (
    <div className="min-h-dvh bg-white md:bg-night-50 md:px-6 md:py-10">
      <main className="mx-auto max-w-[480px] px-5 pb-10 pt-4 md:max-w-[520px] md:rounded-3xl md:border md:border-[#E5E7EB] md:bg-white md:px-8 md:pb-10 md:pt-6 md:shadow-card">
        <header className="grid grid-cols-[44px_1fr_auto] items-center gap-2">
          <Link href="/" onClick={goBack} aria-label="Retour" className="grid h-11 w-11 place-items-center rounded-full text-night-900 hover:bg-night-50">
            <ArrowLeft className="h-5 w-5" aria-hidden />
          </Link>
          <span aria-hidden />
          <Link href="/aide" className="inline-flex h-11 items-center gap-1.5 rounded-full border border-[#E5E7EB] bg-white px-3.5 text-[13px] font-semibold text-night-900 hover:bg-night-50">
            <HelpCircle className="h-4 w-4 text-leaf-500" aria-hidden /> Centre d’aide
          </Link>
        </header>
        <div className="mt-1 flex justify-center">
          <Link href="/" aria-label="Lien Parental, accueil" className="rounded-xl">
            <Logo size="sm" tagline className="items-center text-center" />
          </Link>
        </div>

        <section aria-labelledby={`${baseId}-title`} className="mt-6 grid grid-cols-[minmax(0,1fr)_104px] items-center gap-4 sm:grid-cols-[minmax(0,1fr)_120px]">
          <div>
            <h1 id={`${baseId}-title`} className="text-[25px] font-extrabold leading-[1.15] text-night-900 sm:text-[28px]">
              {installed ? (
                <>Lien Parental est déjà <span className="text-leaf-500">installé</span></>
              ) : (
                <>Installez Lien Parental sur votre <span className="text-leaf-500">{os === 'ios' ? 'iPhone' : 'Android'}</span></>
              )}
            </h1>
            <p className="mt-3 text-[14px] leading-relaxed text-night-700">
              {installed
                ? 'Vous utilisez l’application depuis votre écran d’accueil.'
                : 'Ajoutez l’application à votre écran d’accueil pour y accéder rapidement, comme une vraie application.'}
            </p>
          </div>
          <PhoneIllustration className="ml-auto mr-2 h-[184px] w-[92px] sm:h-[204px] sm:w-[104px]" />
        </section>

        {installed ? (
          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-leaf-200 bg-leaf-50 p-4">
            <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-leaf-500" aria-hidden />
            <div>
              <p className="text-[15px] font-bold text-night-900">Tout est prêt</p>
              <p className="mt-1 text-[13px] leading-relaxed text-night-700">Retrouvez l’icône Lien Parental sur votre écran d’accueil. Touchez « Continuer » pour accéder à votre espace.</p>
            </div>
          </div>
        ) : (
          <>
            {/* Sur ordinateur : ouvrir la page sur le téléphone */}
            <div className="mt-6 hidden items-center gap-5 rounded-2xl border border-[#E5E7EB] p-5 [@media(min-width:768px)_and_(pointer:fine)]:flex">
              <div className="shrink-0 rounded-xl bg-white p-2.5 ring-1 ring-night-100">{qr}</div>
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[14px] font-bold text-night-900"><Smartphone className="h-4 w-4 text-leaf-500" aria-hidden /> Vous êtes sur ordinateur ?</p>
                <p className="mt-1 text-[13px] leading-relaxed text-night-700">Scannez ce QR code avec l’appareil photo de votre téléphone pour ouvrir cette page, puis suivez les étapes.</p>
              </div>
            </div>

            <div role="tablist" aria-label="Choisissez votre téléphone" className="mt-6 grid grid-cols-2 gap-1 rounded-xl bg-night-50 p-1">
              {TABS.map(t => {
                const selected = os === t.id
                return (
                  <button
                    key={t.id}
                    ref={el => { tabRefs.current[t.id] = el }}
                    type="button"
                    role="tab"
                    id={tabId(t.id)}
                    aria-selected={selected}
                    aria-controls={panelId}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => setOs(t.id)}
                    onKeyDown={onTabKey}
                    className={cn(
                      'inline-flex h-11 items-center justify-center gap-2 rounded-lg text-[14px] font-semibold transition-colors motion-reduce:transition-none',
                      selected ? 'bg-white text-night-900 shadow-soft ring-1 ring-leaf-400' : 'text-night-600 hover:text-night-900',
                    )}
                  >
                    <Smartphone className={cn('h-4 w-4', selected ? 'text-leaf-500' : 'text-night-400')} aria-hidden />
                    {t.label}
                  </button>
                )
              })}
            </div>

            <div
              role="tabpanel"
              id={panelId}
              aria-labelledby={tabId(os)}
              tabIndex={0}
              className="mt-4 rounded-2xl border border-[#E5E7EB] p-4 sm:p-5"
            >
              <h2 className="sr-only">Étapes pour {os === 'ios' ? 'iPhone' : 'Android'}</h2>

              {os === 'android' && promptEvt && (
                <div className="mb-5 rounded-xl bg-leaf-50 p-4">
                  <p className="text-[13px] leading-relaxed text-night-800">Votre navigateur permet d’installer l’application en un geste.</p>
                  <button type="button" onClick={installNow} className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-leaf-500 text-[15px] font-semibold text-white hover:bg-leaf-600">
                    <Download className="h-4 w-4" aria-hidden /> Installer maintenant
                  </button>
                  <p className="mt-2 text-center text-[12px] text-night-600">Ou suivez les étapes ci-dessous.</p>
                </div>
              )}
              <p role="status" className={cn('text-[13px] font-medium text-leaf-700', installStatus && 'mb-4')}>{installStatus}</p>

              <InstallSteps os={os} />
            </div>

            <section aria-labelledby={`${baseId}-why`} className="mt-4 rounded-2xl bg-leaf-50 p-4 sm:p-5">
              <h2 id={`${baseId}-why`} className="text-[15px] font-bold text-night-900">Pourquoi ajouter l’application ?</h2>
              <ul className="mt-3 space-y-2.5">
                {BENEFITS.map(({ icon: Icon, text }) => (
                  <li key={text} className="flex items-start gap-3 text-[13.5px] leading-snug text-night-800">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white text-leaf-500 ring-1 ring-leaf-200">
                      <Icon className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <span className="pt-1">{text}</span>
                  </li>
                ))}
              </ul>
            </section>

            {!donHidden && (
              <section aria-labelledby={`${baseId}-don`} className="mt-4 rounded-2xl border border-[#E5E7EB] p-4">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-leaf-50">
                    <Heart className="h-5 w-5 fill-leaf-400 text-leaf-500" aria-hidden />
                  </span>
                  <h2 id={`${baseId}-don`} className="min-w-0 flex-1 text-[15px] font-bold text-night-900">Soutenez Lien Parental</h2>
                  <button
                    type="button"
                    aria-expanded={donOpen}
                    aria-controls={`${baseId}-don-body`}
                    onClick={() => setDonOpen(o => !o)}
                    className="grid h-11 w-11 place-items-center rounded-full text-night-700 hover:bg-night-50"
                  >
                    <ChevronDown className={cn('h-5 w-5 transition-transform duration-200 motion-reduce:transition-none', donOpen && 'rotate-180')} aria-hidden />
                    <span className="sr-only">{donOpen ? 'Replier' : 'Déplier'} le message de soutien</span>
                  </button>
                  <button type="button" onClick={hideDon} className="grid h-11 w-11 place-items-center rounded-full text-night-700 hover:bg-night-50">
                    <X className="h-5 w-5" aria-hidden />
                    <span className="sr-only">Fermer le message de soutien</span>
                  </button>
                </div>
                <div id={`${baseId}-don-body`} hidden={!donOpen} className="mt-2 pl-[52px]">
                  <p className="text-[13px] leading-relaxed text-night-700">Lien Parental est développé pour les familles. Votre soutien nous aide à créer gratuitement de nouveaux outils pour préserver le lien parent-enfant.</p>
                  <Link href="/don" className="mt-3 inline-flex h-11 items-center gap-2 rounded-xl border border-leaf-500 bg-white px-4 text-[14px] font-semibold text-leaf-600 hover:bg-leaf-50">
                    <Heart className="h-4 w-4" aria-hidden /> Faire un don
                  </Link>
                </div>
              </section>
            )}
          </>
        )}

        <Link href={continueHref} className="mt-6 flex h-12 w-full items-center justify-center rounded-xl bg-night-900 text-[15px] font-semibold text-white hover:bg-night-800">
          Continuer
        </Link>
        <div className="mt-4 text-center">
          <p className="flex items-center justify-center gap-1.5 text-[13px] font-semibold text-night-900"><Lock className="h-3.5 w-3.5 text-leaf-500" aria-hidden /> Vos données sont en sécurité</p>
          <p className="mt-0.5 text-[12.5px] text-night-700">Lien Parental protège vos informations familiales.</p>
        </div>
      </main>
    </div>
  )
}
