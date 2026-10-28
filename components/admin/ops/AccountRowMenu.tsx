'use client'
/**
 * Menu « ⋯ » d'une ligne de la liste des comptes : Voir la fiche, Avertir, Suspendre,
 * Désactiver ou Réactiver (selon l'état), Déconnecter, Supprimer. Les actions impossibles
 * restent dans le menu, désactivées, avec leur explication (au lieu d'être masquées).
 *
 * Accessibilité (motif « menu button » de l'APG) : bouton aria-haspopup/aria-expanded,
 * flèches haut/bas, Début/Fin, Échap (retour au bouton), Tab ferme ; éléments désactivés
 * focalisables (aria-disabled) pour que leur raison soit lue. Positionné en `fixed` pour ne
 * pas être rogné par le conteneur du tableau ; fermé au défilement et au redimensionnement.
 */
import Link from 'next/link'
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Eye, MoreHorizontal, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { MOD_ACTION_LABEL, actionAvailability, targetBlockReason, visibleActions, type ModAction } from '@/lib/admin/ops/moderation'
import { AccountActionDialog, type ActionTarget, type Feedback } from './moderation/AccountActionDialog'
import { ACTION_ICON } from './AccountActions'

const MENU_W = 300
const SHORT: Partial<Record<ModAction, string>> = { force_logout: 'Déconnecter', delete: 'Supprimer', resend_verification: 'Renvoyer la vérification' }
const DANGER: ReadonlySet<ModAction> = new Set(['suspend', 'deactivate', 'delete'])

export function AccountRowMenu({ target }: { target: ActionTarget }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const [action, setAction] = useState<ModAction | null>(null)
  const [msg, setMsg] = useState<Feedback | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const uid = useId()
  const avail = actionAvailability(target)
  const shared = targetBlockReason(target)
  const actions = visibleActions(target)

  const items = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
  const close = useCallback((focusButton = true) => {
    setMenuOpen(false)
    setPos(null)
    if (focusButton) btnRef.current?.focus()
  }, [])

  // Position : sous le bouton, aligné à droite ; au-dessus s'il manque de place en bas.
  useLayoutEffect(() => {
    if (!menuOpen) return
    const b = btnRef.current?.getBoundingClientRect()
    const h = menuRef.current?.offsetHeight ?? 0
    if (!b) return
    const left = Math.max(8, Math.min(b.right - MENU_W, window.innerWidth - MENU_W - 8))
    const below = b.bottom + 4
    const top = below + h > window.innerHeight - 8 && b.top - h - 4 > 8 ? b.top - h - 4 : below
    setPos({ top, left })
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen) return
    items()[0]?.focus()
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) close(false)
    }
    const onMove = () => close(false)
    document.addEventListener('mousedown', onDown)
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove, true)
    }
  }, [menuOpen, close])

  // Message de succès / d'erreur : effacé après 8 secondes.
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 8000)
    return () => clearTimeout(t)
  }, [msg])

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const list = items()
    const i = list.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length]?.focus() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length]?.focus() }
    else if (e.key === 'Home') { e.preventDefault(); list[0]?.focus() }
    else if (e.key === 'End') { e.preventDefault(); list.at(-1)?.focus() }
    else if (e.key === 'Escape') { e.preventDefault(); close() }
    else if (e.key === 'Tab') close(false)
  }

  const choose = (a: ModAction) => {
    if (!avail[a].allowed) return
    close(false)
    setMsg(null)
    setAction(a)
  }

  const itemCls = 'flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left text-[14px] focus-visible:outline-none focus-visible:bg-night-50 focus-visible:ring-2 focus-visible:ring-leaf-500'

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? `${uid}-menu` : undefined}
        aria-label={`Actions pour ${target.email}`}
        onClick={() => (menuOpen ? close(false) : setMenuOpen(true))}
        onKeyDown={(e) => { if (e.key === 'ArrowDown' && !menuOpen) { e.preventDefault(); setMenuOpen(true) } }}
        className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-night-600 hover:bg-night-100 hover:text-night-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500"
      >
        <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
      </button>

      {menuOpen && createPortal(
        <div
          ref={menuRef}
          id={`${uid}-menu`}
          role="menu"
          aria-label={`Actions pour ${target.email}`}
          onKeyDown={onKey}
          style={{ position: 'fixed', top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: MENU_W }}
          className="z-50 rounded-2xl border border-night-100 bg-white p-1.5 shadow-card"
        >
          {shared && <p id={`${uid}-shared`} className="mx-1.5 mb-1 mt-1 rounded-lg bg-night-50 px-2.5 py-2 text-[12.5px] leading-snug text-night-700">{shared}</p>}
          <Link href={`/admin/comptes/${target.id}`} role="menuitem" tabIndex={-1} className={cn(itemCls, 'font-semibold text-night-900 hover:bg-night-50')} onClick={() => close(false)}>
            <Eye className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> Voir la fiche
          </Link>
          <div role="separator" className="my-1 h-px bg-night-100" />
          {actions.map((a, idx) => {
            const av = avail[a]
            const Icon = ACTION_ICON[a]
            const own = !av.allowed && av.reason !== shared
            const sep = a === 'force_logout' && idx > 0
            return (
              <div key={a}>
                {sep && <div role="separator" className="my-1 h-px bg-night-100" />}
                <button
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  aria-disabled={!av.allowed || undefined}
                  aria-describedby={!av.allowed ? (own ? `${uid}-${a}` : `${uid}-shared`) : undefined}
                  onClick={() => choose(a)}
                  className={cn(
                    itemCls,
                    av.allowed ? (DANGER.has(a) ? 'text-alert-600 hover:bg-alert-50' : 'text-night-900 hover:bg-night-50') : 'cursor-not-allowed text-night-400',
                  )}
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block font-semibold">{SHORT[a] ?? MOD_ACTION_LABEL[a]}</span>
                    {own && <span id={`${uid}-${a}`} className="block text-[12px] font-normal leading-snug text-night-500">{av.reason}</span>}
                  </span>
                </button>
              </div>
            )
          })}
        </div>,
        document.body,
      )}

      {/* Portail : la fenêtre ne doit pas hériter de l'alignement de la cellule du tableau. */}
      {action && createPortal(
        <div className="text-left">
          <AccountActionDialog target={target} action={action} onClose={() => { setAction(null); btnRef.current?.focus() }} onDone={setMsg} />
        </div>,
        document.body,
      )}

      {msg && createPortal(
        <div
          role={msg.tone === 'err' ? 'alert' : 'status'}
          className={cn(
            'fixed bottom-4 right-4 z-50 flex max-w-[min(420px,calc(100vw-2rem))] items-start gap-3 rounded-2xl border px-4 py-3 text-[13.5px] font-semibold shadow-card',
            msg.tone === 'err' ? 'border-alert-200 bg-alert-50 text-alert-700' : 'border-leaf-200 bg-leaf-50 text-leaf-800',
          )}
        >
          <span className="min-w-0">{msg.text}</span>
          <button type="button" onClick={() => setMsg(null)} className="-m-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500" aria-label="Fermer le message">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>,
        document.body,
      )}
    </>
  )
}
