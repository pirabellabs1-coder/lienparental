'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Logo } from '@/components/brand/Logo'
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher'
import { cn } from '@/lib/cn'

// En-tête unique des pages publiques (accueil, blog, aide, pages légales, don, installation).
// « Guide parental » mène au Guide public (/guide). Hors de l'accueil, les ancres pointent vers les sections de l'accueil (/#tarifs…) ;
// « FAQ » mène alors au centre d'aide complet (/aide).

type NavKey = 'home' | 'features' | 'guide' | 'pricing' | 'testimonials' | 'faq' | 'blog'
type NavLink = { href: string; key: NavKey; current: boolean }

function navLinks(pathname: string): NavLink[] {
  const home = pathname === '/'
  return [
    { href: '/', key: 'home', current: home },
    { href: '/#fonctionnalites', key: 'features', current: false },
    { href: '/guide', key: 'guide', current: pathname === '/guide' || pathname.startsWith('/guide/') },
    { href: '/#tarifs', key: 'pricing', current: false },
    { href: '/#temoignages', key: 'testimonials', current: false },
    { href: home ? '/#faq' : '/aide', key: 'faq', current: pathname.startsWith('/aide') },
    { href: '/blog', key: 'blog', current: pathname.startsWith('/blog') },
  ]
}

const BTN = 'inline-flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-full px-5 text-[14.5px] font-semibold transition-colors duration-200'
const BTN_PRIMARY = cn(BTN, 'bg-leaf-500 text-white hover:bg-leaf-600')
const BTN_OUTLINE = cn(BTN, 'bg-white text-night-900 ring-1 ring-inset ring-night-900/20 hover:bg-night-50')

export function SiteHeader() {
  const pathname = usePathname() ?? '/'
  const links = navLinks(pathname)
  const t = useTranslations('nav')
  const th = useTranslations('header')
  const ta = useTranslations('a11y')
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const sentinel = useRef<HTMLSpanElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)

  // Ombre légère une fois la page défilée (IntersectionObserver sur une sentinelle : pas d'écouteur scroll).
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setScrolled(!e.isIntersecting))
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // Le menu se ferme à chaque changement de page.
  useEffect(() => { setOpen(false) }, [pathname])

  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    menu.current?.querySelector<HTMLElement>('a[href]')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); toggle.current?.focus(); return }
      // Focus piégé dans le menu ouvert : bouton de fermeture + liens du menu.
      if (e.key !== 'Tab') return
      const items = [toggle.current, ...Array.from(menu.current?.querySelectorAll<HTMLElement>('a[href]') ?? [])].filter(Boolean) as HTMLElement[]
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

  return (
    <>
      <span ref={sentinel} aria-hidden className="pointer-events-none absolute left-0 top-0 h-px w-px" />
      <header className={cn('site-header sticky top-0 z-40 border-b bg-white transition-shadow duration-200', scrolled ? 'border-[#E5E7EB] shadow-[0_8px_24px_-20px_rgba(11,45,91,0.35)]' : 'border-transparent')}>
        <div className="relative z-10 mx-auto flex h-[72px] w-full max-w-[1280px] items-center justify-between gap-4 bg-white px-5 sm:px-8">
          <Link href="/" aria-label={ta('homeLink')} className="shrink-0 rounded-lg">
            <Logo size="sm" layout="inline" />
          </Link>

          <nav aria-label={ta('mainNav')} className="hidden xl:block">
            <ul className="flex items-center">
              {links.map(l => (
                <li key={l.key}>
                  <Link
                    href={l.href}
                    aria-current={l.current ? 'page' : undefined}
                    className={cn(
                      'relative inline-flex h-11 items-center whitespace-nowrap rounded-lg px-2.5 text-[14.5px] font-medium transition-colors duration-200 hover:text-leaf-600',
                      l.current ? 'font-semibold text-leaf-600 after:absolute after:inset-x-2.5 after:bottom-1.5 after:h-0.5 after:rounded-full after:bg-leaf-400' : 'text-night-800',
                    )}
                  >
                    {t(l.key)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <LanguageSwitcher />
            <Link href="/onboarding/connexion" className={cn(BTN_OUTLINE, 'hidden sm:inline-flex')}>{th('login')}</Link>
            <Link href="/onboarding" className={cn(BTN_PRIMARY, 'hidden sm:inline-flex')}>{th('signup')}</Link>
            <button
              ref={toggle}
              type="button"
              onClick={() => setOpen(o => !o)}
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

        <div ref={menu} id="site-menu" hidden={!open} className="fixed inset-0 overflow-y-auto overscroll-contain bg-white px-6 pb-10 pt-24 xl:hidden">
          <nav aria-label={ta('mobileNav')} className="mx-auto flex max-w-md flex-col">
            <ul className="flex flex-col">
              {links.map((l, i) => (
                <li key={l.key} className="site-rise border-b border-[#E5E7EB]" style={{ '--d': `${40 + i * 35}ms` } as React.CSSProperties}>
                  <Link
                    href={l.href}
                    aria-current={l.current ? 'page' : undefined}
                    onClick={() => setOpen(false)}
                    className={cn('flex min-h-[56px] items-center text-[20px] font-bold', l.current ? 'text-leaf-600' : 'text-night-900')}
                  >
                    {t(l.key)}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-col gap-3">
              <Link href="/onboarding" onClick={() => setOpen(false)} className={cn(BTN_PRIMARY, 'h-14 text-[16px]')}>{th('signup')}</Link>
              <Link href="/onboarding/connexion" onClick={() => setOpen(false)} className={cn(BTN_OUTLINE, 'h-14 text-[16px]')}>{th('login')}</Link>
            </div>
            <div className="mt-8 flex justify-center">
              <LanguageSwitcher />
            </div>
          </nav>
        </div>
      </header>
    </>
  )
}
