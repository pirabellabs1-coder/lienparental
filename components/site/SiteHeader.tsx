'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowRight, BadgeEuro, BookOpenText, ChevronDown, Gem, Handshake, Heart, Info, Landmark, LayoutGrid,
  LifeBuoy, MessageSquareQuote, Newspaper, Smartphone, Users,
} from 'lucide-react'
import { Logo } from '@/components/brand/Logo'
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher'
import { cn } from '@/lib/cn'
import { signupPath, stripLocale } from '@/lib/i18n/routing'
import { guidePaths } from '@/lib/seo/site'
import { useLocalePath } from '@/components/i18n/useLocalePath'
import { TerritoryShape } from './territories'

// En-tête unique des pages publiques, avec méga menu (ordinateur) et menu plein écran en accordéon (mobile).
// Hors de l'accueil, les ancres pointent vers les sections de l'accueil (/#tarifs…).
// Accessibilité : motif « disclosure » (bouton + aria-expanded/aria-controls, pas de role=menu) ;
// Échap referme et rend le focus au bouton ; clic extérieur ou focus sorti de l'en-tête referment.
// Animations transform/opacity uniquement, coupées en prefers-reduced-motion (CSS ci-dessous).

export type HeaderTerritory = { code: string; name: string; path: string; available: boolean }

type GroupKey = 'app' | 'guide' | 'partners' | 'resources'
type Item = { key: string; href: string; icon: LucideIcon }

const GROUPS: { key: GroupKey; items: Item[] }[] = [
  {
    key: 'app',
    items: [
      { key: 'features', href: '/#fonctionnalites', icon: LayoutGrid },
      { key: 'pricing', href: '/#tarifs', icon: BadgeEuro },
      { key: 'testimonials', href: '/#temoignages', icon: MessageSquareQuote },
      { key: 'install', href: '/installer', icon: Smartphone },
    ],
  },
  { key: 'guide', items: [] },
  {
    key: 'partners',
    items: [
      { key: 'overview', href: '/partenaires', icon: Handshake },
      { key: 'institution', href: '/partenaires#institution', icon: Landmark },
      { key: 'association', href: '/partenaires#association', icon: Users },
      { key: 'createur', href: '/partenaires#createur', icon: Gem },
    ],
  },
  {
    key: 'resources',
    items: [
      { key: 'blog', href: '/blog', icon: Newspaper },
      { key: 'help', href: '/aide', icon: LifeBuoy },
      { key: 'about', href: '/a-propos', icon: Info },
      { key: 'donate', href: '/don', icon: Heart },
    ],
  },
]

/** Volet qui correspond à la page affichée (chemin SANS préfixe de langue). */
function currentGroup(path: string): GroupKey | 'home' | null {
  if (path === '/') return 'home'
  if (path === '/installer') return 'app'
  if (path === '/guide' || path.startsWith('/guide/')) return 'guide'
  if (path === '/partenaires' || path.startsWith('/partenaires/')) return 'partners'
  if (path.startsWith('/blog') || path.startsWith('/aide') || path === '/a-propos' || path === '/don') return 'resources'
  return null
}

const CSS = `
@keyframes mega-in{from{opacity:0;transform:translate3d(0,-8px,0)}to{opacity:1;transform:none}}
@keyframes mega-fade{from{opacity:0}to{opacity:1}}
.mega-panel{animation:mega-in .26s cubic-bezier(.22,1,.36,1) both}
.mega-scrim{animation:mega-fade .2s ease-out both}
.mega-pill{transition:transform .32s cubic-bezier(.22,1,.36,1),width .32s cubic-bezier(.22,1,.36,1),opacity .2s ease}
@media (prefers-reduced-motion:reduce){.mega-panel,.mega-scrim{animation:none}.mega-pill{transition:none}}
`

const BTN = 'inline-flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-full px-5 text-[14.5px] font-semibold transition-colors duration-200'
const BTN_PRIMARY = cn(BTN, 'bg-leaf-500 text-white hover:bg-leaf-600')
const BTN_OUTLINE = cn(BTN, 'bg-white text-night-900 ring-1 ring-inset ring-night-900/20 hover:bg-night-50')
const TOP = 'relative z-10 inline-flex h-10 items-center gap-1 whitespace-nowrap rounded-full px-3 text-[14.5px] font-medium transition-colors duration-200'

/** Délais d'ouverture / fermeture au survol : évite les volets qui clignotent en traversant la barre. */
const OPEN_DELAY = 70
const CLOSE_DELAY = 160

export function SiteHeader({ territories, soonLabel }: { territories: HeaderTerritory[]; soonLabel: string }) {
  const rawPathname = usePathname() ?? '/'
  const pathname = stripLocale(rawPathname).path
  const locale = useLocale()
  const lp = useLocalePath()
  const signupHref = signupPath(locale)
  const t = useTranslations('nav')
  const th = useTranslations('header')
  const ta = useTranslations('a11y')
  const current = currentGroup(pathname)

  const [open, setOpen] = useState(false) // menu mobile
  const [mobileGroup, setMobileGroup] = useState<GroupKey | null>(null)
  const [mega, setMega] = useState<GroupKey | null>(null) // volet ordinateur ouvert
  const [hovered, setHovered] = useState<string | null>(null)
  const [pill, setPill] = useState<{ x: number; w: number; on: boolean }>({ x: 0, w: 0, on: false })
  const [scrolled, setScrolled] = useState(false)

  const sentinel = useRef<HTMLSpanElement>(null)
  const header = useRef<HTMLElement>(null)
  const bar = useRef<HTMLUListElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const triggers = useRef<Partial<Record<GroupKey, HTMLButtonElement | null>>>({})

  const clearTimer = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null } }
  const later = (fn: () => void, ms: number) => { clearTimer(); timer.current = setTimeout(fn, ms) }
  const closeMega = useCallback((focusBack = false) => {
    clearTimer()
    setMega((g) => {
      if (focusBack && g) triggers.current[g]?.focus()
      return null
    })
  }, [])

  // Ombre et fond givré une fois la page défilée (IntersectionObserver sur une sentinelle : pas d'écouteur scroll).
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setScrolled(!e.isIntersecting))
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // Changement de page : tout se referme.
  useEffect(() => { setOpen(false); setMega(null); setMobileGroup(null) }, [pathname])
  useEffect(() => () => clearTimer(), [])

  // Pastille de fond : suit l'onglet survolé, sinon le volet ouvert, sinon la page en cours.
  const target = hovered ?? mega ?? current
  useLayoutEffect(() => {
    const ul = bar.current
    if (!ul) return
    const place = () => {
      const el = target ? ul.querySelector<HTMLElement>(`[data-nav="${target}"]`) : null
      if (!el) { setPill((p) => ({ ...p, on: false })); return }
      setPill({ x: el.offsetLeft, w: el.offsetWidth, on: true })
    }
    place()
    const ro = new ResizeObserver(place)
    ro.observe(ul)
    return () => ro.disconnect()
  }, [target, locale])

  // Volet ordinateur : Échap, clic extérieur, focus sorti de l'en-tête.
  useEffect(() => {
    if (!mega) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeMega(true) }
    const onDown = (e: PointerEvent) => { if (!header.current?.contains(e.target as Node)) closeMega() }
    const onFocus = (e: FocusEvent) => { if (e.target instanceof Node && !header.current?.contains(e.target)) closeMega() }
    window.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('focusin', onFocus)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('focusin', onFocus)
    }
  }, [mega, closeMega])

  // Menu mobile : défilement bloqué, focus piégé, Échap.
  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    menu.current?.querySelector<HTMLElement>('a[href], button')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); toggle.current?.focus(); return }
      if (e.key !== 'Tab') return
      const items = [toggle.current, ...Array.from(menu.current?.querySelectorAll<HTMLElement>('a[href], button') ?? [])].filter(Boolean) as HTMLElement[]
      const first = items[0], last = items[items.length - 1]
      if (!items.includes(document.activeElement as HTMLElement)) { e.preventDefault(); first.focus() }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    // Passage en affichage large (menu masqué par CSS) : on referme pour libérer le défilement.
    const wide = window.matchMedia('(min-width: 1280px)')
    const onWide = () => { if (wide.matches) setOpen(false) }
    window.addEventListener('keydown', onKey)
    wide.addEventListener('change', onWide)
    return () => {
      window.removeEventListener('keydown', onKey)
      wide.removeEventListener('change', onWide)
      document.body.style.overflow = ''
    }
  }, [open])

  const hoverOpen = (g: GroupKey) => later(() => setMega(g), mega ? 0 : OPEN_DELAY)
  const hoverClose = () => later(() => setMega(null), CLOSE_DELAY)
  const mouse = (e: React.PointerEvent) => e.pointerType === 'mouse'

  const itemText = (g: GroupKey, k: string) => ({ title: t(`mega.${g}.${k}.t`), desc: t(`mega.${g}.${k}.d`) })
  const groupLabel = (g: GroupKey) => (g === 'guide' ? t('guide') : t(g))

  /* ------------------------------ Volets ------------------------------ */

  const Tile = ({ href, icon: Icon, title, desc, onNavigate }: { href: string; icon: LucideIcon; title: string; desc: string; onNavigate?: () => void }) => (
    <Link href={lp(href)} onClick={onNavigate} className="group flex items-start gap-3.5 rounded-2xl p-3 transition-colors duration-200 hover:bg-leaf-50 focus-visible:bg-leaf-50">
      <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-night-50 text-night-700 transition-colors duration-200 group-hover:bg-white group-hover:text-leaf-600 group-hover:shadow-[0_4px_14px_-6px_rgba(11,45,91,0.25)]">
        <Icon className="h-5 w-5" strokeWidth={1.9} />
      </span>
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold text-night-900 group-hover:text-leaf-700">{title}</span>
        <span className="mt-0.5 block text-[13.5px] leading-snug text-night-600">{desc}</span>
      </span>
    </Link>
  )

  const Card = ({ title, text, href, cta, icon: Icon }: { title: string; text: string; href: string; cta: string; icon: LucideIcon }) => (
    <div className="flex h-full flex-col justify-between rounded-2xl bg-gradient-to-br from-leaf-50 via-white to-night-50 p-6 ring-1 ring-leaf-100">
      <div>
        <span aria-hidden className="grid h-12 w-12 place-items-center rounded-full bg-white text-leaf-600 shadow-[0_6px_18px_-8px_rgba(11,45,91,0.3)]">
          <Icon className="h-6 w-6" strokeWidth={1.8} />
        </span>
        <p className="mt-4 text-[17px] font-extrabold leading-snug text-night-900">{title}</p>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-night-700">{text}</p>
      </div>
      <Link href={href} onClick={() => closeMega()} className={cn(BTN_PRIMARY, 'mt-5 h-11 gap-1.5 self-start px-4 text-[14px]')}>
        {cta} <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  )

  const territoryList = (onNavigate?: () => void, compact = false) => (
    <ul className={cn('grid gap-2', compact ? 'grid-cols-2' : 'grid-cols-3')}>
      {territories.map((terr) => {
        const body = (
          <>
            <TerritoryShape path={terr.path} available={terr.available} className={cn('shrink-0', compact ? 'h-7 w-7' : 'h-9 w-9')} />
            <span className="min-w-0 leading-tight">
              <span className="block text-[14px] font-semibold text-night-900">{terr.name}</span>
              {!terr.available && <span className="block text-[12.5px] text-night-600">{soonLabel}</span>}
            </span>
          </>
        )
        const box = 'flex min-h-[48px] items-center gap-2.5 rounded-xl px-2.5 py-2 ring-1 transition-colors duration-200'
        return (
          <li key={terr.code}>
            {terr.available ? (
              <Link href={lp(guidePaths.territoire(terr.code))} onClick={onNavigate} className={cn(box, 'bg-leaf-50/60 ring-leaf-100 hover:bg-leaf-50 hover:ring-leaf-300')}>{body}</Link>
            ) : (
              <span className={cn(box, 'bg-white ring-[#E5E7EB]')}>{body}</span>
            )}
          </li>
        )
      })}
    </ul>
  )

  const panel = (g: GroupKey): ReactNode => {
    if (g === 'guide') {
      return (
        <div className="grid grid-cols-[minmax(0,1fr)_300px] gap-8">
          <div>
            <p className="text-[12.5px] font-bold uppercase tracking-[0.14em] text-night-600">{t('mega.guide.territories')}</p>
            <div className="mt-3">{territoryList(() => closeMega())}</div>
            <Link href={lp('/guide')} onClick={() => closeMega()} className="mt-4 inline-flex min-h-[44px] items-center gap-1.5 rounded-lg text-[14.5px] font-semibold text-leaf-700 hover:underline">
              {t('mega.guide.all')} <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          <Card title={t('mega.guide.cardTitle')} text={t('mega.guide.cardText')} href={lp('/guide')} cta={t('mega.guide.all')} icon={BookOpenText} />
        </div>
      )
    }
    const card = g === 'app'
      ? <Card title={t('mega.app.cardTitle')} text={t('mega.app.cardText')} href={signupHref} cta={t('mega.app.cardCta')} icon={Heart} />
      : g === 'partners'
        ? <Card title={t('mega.partners.cardTitle')} text={t('mega.partners.cardText')} href={lp('/partenaires/candidature')} cta={t('mega.partners.cardCta')} icon={Handshake} />
        : null
    const items = GROUPS.find((x) => x.key === g)!.items
    return (
      <div className={cn('grid gap-8', card ? 'grid-cols-[minmax(0,1fr)_300px]' : 'grid-cols-1')}>
        <ul className={cn('grid content-start gap-1', card ? 'grid-cols-2' : 'grid-cols-4')}>
          {items.map((it) => <li key={it.key}><Tile href={it.href} icon={it.icon} {...itemText(g, it.key)} onNavigate={() => closeMega()} /></li>)}
        </ul>
        {card}
      </div>
    )
  }

  /* ------------------------------ Rendu ------------------------------ */

  const topClass = (key: string) => cn(TOP, target === key || current === key ? 'text-leaf-700' : 'text-night-800 hover:text-night-900', current === key && 'font-semibold')

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <span ref={sentinel} aria-hidden className="pointer-events-none absolute left-0 top-0 h-px w-px" />
      <header
        ref={header}
        onPointerLeave={(e) => { if (mouse(e)) { setHovered(null); if (mega) hoverClose() } }}
        onPointerEnter={(e) => { if (mouse(e)) clearTimer() }}
        className={cn(
          'site-header sticky top-0 z-40 border-b transition-[box-shadow,border-color] duration-300',
          scrolled || mega ? 'border-[#E5E7EB] shadow-[0_10px_30px_-24px_rgba(11,45,91,0.45)]' : 'border-transparent',
        )}
      >
        {/* Fond (givré une fois la page défilée) sur un calque à part : un backdrop-filter posé sur l'en-tête
            lui-même deviendrait le repère des éléments `fixed` (menu mobile plein écran). */}
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-0 transition-colors duration-300',
            scrolled || mega ? 'bg-white/85 backdrop-blur-md supports-[backdrop-filter]:bg-white/75' : 'bg-white',
          )}
        />
        <div className="relative z-20 mx-auto flex h-[72px] w-full max-w-[1280px] items-center justify-between gap-4 px-5 sm:px-8">
          <Link href={lp('/')} aria-label={ta('homeLink')} className="shrink-0 rounded-lg">
            <Logo size="sm" layout="inline" />
          </Link>

          <nav aria-label={ta('mainNav')} className="hidden xl:block">
            <ul ref={bar} className="relative flex items-center gap-0.5">
              <span
                aria-hidden
                className="mega-pill pointer-events-none absolute left-0 top-1/2 h-10 rounded-full bg-leaf-50 ring-1 ring-leaf-100"
                style={{ width: pill.w, transform: `translate3d(${pill.x}px,-50%,0)`, opacity: pill.on ? 1 : 0 } as CSSProperties}
              />
              <li>
                <Link
                  href={lp('/')}
                  data-nav="home"
                  aria-current={current === 'home' ? 'page' : undefined}
                  onPointerEnter={(e) => { if (mouse(e)) { setHovered('home'); if (mega) hoverClose() } }}
                  className={topClass('home')}
                >
                  {t('home')}
                </Link>
              </li>
              {GROUPS.map(({ key }) => (
                <li key={key}>
                  <button
                    ref={(el) => { triggers.current[key] = el }}
                    type="button"
                    data-nav={key}
                    aria-expanded={mega === key}
                    aria-controls={`mega-${key}`}
                    onClick={() => { clearTimer(); setMega((g) => (g === key ? null : key)) }}
                    onPointerEnter={(e) => { if (mouse(e)) { setHovered(key); hoverOpen(key) } }}
                    className={topClass(key)}
                  >
                    {groupLabel(key)}
                    <ChevronDown aria-hidden className={cn('h-4 w-4 transition-transform duration-300', mega === key && 'rotate-180')} />
                  </button>
                </li>
              ))}
              {/* Lien direct seulement sur grand écran : en dessous, « Tarifs » reste dans le volet « L'application ». */}
              <li className="hidden min-[1440px]:block">
                <Link
                  href={lp('/#tarifs')}
                  data-nav="pricing"
                  onPointerEnter={(e) => { if (mouse(e)) { setHovered('pricing'); if (mega) hoverClose() } }}
                  className={topClass('pricing')}
                >
                  {t('pricing')}
                </Link>
              </li>
            </ul>
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <LanguageSwitcher />
            <Link href={lp('/onboarding/connexion')} className={cn(BTN_OUTLINE, 'hidden sm:inline-flex')}>{th('login')}</Link>
            <Link href={signupHref} className={cn(BTN_PRIMARY, 'hidden sm:inline-flex')}>{th('signup')}</Link>
            <button
              ref={toggle}
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-controls="site-menu"
              aria-label={open ? th('closeMenu') : th('openMenu')}
              className="relative grid h-11 w-11 place-items-center rounded-full bg-white ring-1 ring-[#E5E7EB] xl:hidden"
            >
              <span aria-hidden className={cn('absolute h-[1.5px] w-5 rounded-full bg-night-900 transition-transform duration-300', open ? 'rotate-45' : '-translate-y-[4px]')} />
              <span aria-hidden className={cn('absolute h-[1.5px] w-5 rounded-full bg-night-900 transition-transform duration-300', open ? '-rotate-45' : 'translate-y-[4px]')} />
            </button>
          </div>
        </div>

        {/* Volets du méga menu (ordinateur). Un seul rendu à la fois ; les autres restent dans le DOM, masqués. */}
        {GROUPS.map(({ key }) => (
          <div
            key={key}
            id={`mega-${key}`}
            role="region"
            aria-label={groupLabel(key)}
            hidden={mega !== key}
            onPointerEnter={(e) => { if (mouse(e)) clearTimer() }}
            className="absolute inset-x-0 top-full z-10 hidden xl:block"
          >
            {mega === key && (
              <div className="mega-panel border-b border-[#E5E7EB] bg-white shadow-[0_24px_48px_-28px_rgba(11,45,91,0.35)]">
                <div className="mx-auto w-full max-w-[1280px] px-8 py-7">{panel(key)}</div>
              </div>
            )}
          </div>
        ))}

        {/* Menu mobile plein écran : volets en accordéon. */}
        <div ref={menu} id="site-menu" hidden={!open} className="fixed inset-0 overflow-y-auto overscroll-contain bg-white px-5 pb-10 pt-24 xl:hidden">
          <nav aria-label={ta('mobileNav')} className="mx-auto flex max-w-md flex-col">
            <ul className="flex flex-col">
              <li className="site-rise border-b border-[#E5E7EB]" style={{ '--d': '40ms' } as CSSProperties}>
                <Link href={lp('/')} aria-current={current === 'home' ? 'page' : undefined} onClick={() => setOpen(false)} className={cn('flex min-h-[60px] items-center rounded-xl px-2 text-[19px] font-bold', current === 'home' ? 'text-leaf-600' : 'text-night-900')}>
                  {t('home')}
                </Link>
              </li>
              {GROUPS.map(({ key, items }, i) => {
                const expanded = mobileGroup === key
                return (
                  <li key={key} className="site-rise border-b border-[#E5E7EB]" style={{ '--d': `${75 + i * 35}ms` } as CSSProperties}>
                    <button
                      type="button"
                      aria-expanded={expanded}
                      aria-controls={`m-${key}`}
                      onClick={() => setMobileGroup((g) => (g === key ? null : key))}
                      className={cn('flex min-h-[60px] w-full items-center justify-between rounded-xl px-2 text-left text-[19px] font-bold transition-colors', expanded ? 'bg-leaf-50 text-leaf-700' : current === key ? 'text-leaf-600' : 'text-night-900')}
                    >
                      {groupLabel(key)}
                      <ChevronDown aria-hidden className={cn('h-5 w-5 transition-transform duration-300', expanded && 'rotate-180')} />
                    </button>
                    <div id={`m-${key}`} hidden={!expanded} className="pb-4 pt-2">
                      {key === 'guide' ? (
                        <>
                          {territoryList(() => setOpen(false), true)}
                          <Link href={lp('/guide')} onClick={() => setOpen(false)} className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 px-2 text-[15px] font-semibold text-leaf-700">
                            {t('mega.guide.all')} <ArrowRight className="h-4 w-4" aria-hidden />
                          </Link>
                        </>
                      ) : (
                        <ul className="space-y-1">
                          {items.map((it) => <li key={it.key}><Tile href={it.href} icon={it.icon} {...itemText(key, it.key)} onNavigate={() => setOpen(false)} /></li>)}
                          {key === 'partners' && (
                            <li>
                              <Link href={lp('/partenaires/candidature')} onClick={() => setOpen(false)} className={cn(BTN_PRIMARY, 'mt-2 w-full gap-1.5')}>
                                {t('mega.partners.cardCta')} <ArrowRight className="h-4 w-4" aria-hidden />
                              </Link>
                            </li>
                          )}
                        </ul>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
            <div className="mt-8 flex flex-col gap-3">
              <Link href={signupHref} onClick={() => setOpen(false)} className={cn(BTN_PRIMARY, 'h-14 text-[16px]')}>{th('signup')}</Link>
              <Link href={lp('/onboarding/connexion')} onClick={() => setOpen(false)} className={cn(BTN_OUTLINE, 'h-14 text-[16px]')}>{th('login')}</Link>
            </div>
            <div className="mt-8 flex justify-center">
              <LanguageSwitcher />
            </div>
          </nav>
        </div>
      </header>

      {/* Voile sous le volet ouvert : clic = fermeture. */}
      {mega && (
        <div aria-hidden onClick={() => closeMega()} className="mega-scrim fixed inset-0 top-[72px] z-30 hidden bg-night-950/15 xl:block" />
      )}
    </>
  )
}
