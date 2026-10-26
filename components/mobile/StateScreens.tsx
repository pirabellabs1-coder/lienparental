'use client'

import Link from 'next/link'
import { useId, type ReactNode } from 'react'
import {
  CircleCheck, CloudOff, Wrench, Settings, Wifi, Clock, Cloud, RefreshCw, CloudUpload,
  Trash2, FileDown, FileText, ShieldCheck,
} from 'lucide-react'
import { cn } from '@/lib/cn'

// États système & opérations longues — maquettes « États système » (5) et (6).
// Grand pictogramme dans un cercle doux (+ petites pastilles décoratives), titre, texte,
// encart d'information éventuel, puis actions pleine largeur.

// --- Actions -----------------------------------------------------------------

export type StateAction = {
  label: string
  /** Navigation (sérialisable : utilisable depuis un Server Component) */
  href?: string
  /** Recharge la page */
  reload?: boolean
  /** Revient à la page précédente (repli : `href` ou « / ») */
  back?: boolean
  onClick?: () => void
}

type ActionVariant = 'leaf' | 'danger' | 'outline'

const actionClass: Record<ActionVariant, string> = {
  leaf: 'bg-leaf-500 text-white hover:bg-leaf-600 shadow-[0_8px_20px_-10px_rgba(46,125,50,0.55)]',
  danger: 'bg-alert-500 text-white hover:bg-alert-600 shadow-[0_8px_20px_-12px_rgba(217,33,40,0.8)]',
  outline: 'border border-night-200 bg-white text-night-900 hover:bg-night-50',
}

function ActionButton({ action, variant }: { action: StateAction; variant: ActionVariant }) {
  const cls = cn(
    'flex h-12 w-full items-center justify-center rounded-xl px-5 text-[14px] font-semibold transition-colors motion-safe:active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:ring-offset-2',
    actionClass[variant],
  )
  if (action.href && !action.back && !action.reload && !action.onClick) {
    return <Link href={action.href} className={cls}>{action.label}</Link>
  }
  const handle = () => {
    if (action.onClick) return action.onClick()
    if (action.reload) return window.location.reload()
    if (action.back) {
      if (window.history.length > 1) return window.history.back()
      window.location.href = action.href ?? '/'
    }
  }
  return <button type="button" onClick={handle} className={cls}>{action.label}</button>
}

// --- Visuel -------------------------------------------------------------------

export type StateTone = 'neutral' | 'leaf' | 'alert' | 'iris' | 'blue'

const toneCircle: Record<StateTone, string> = {
  neutral: 'bg-night-50 text-night-800',
  leaf: 'bg-leaf-50 text-leaf-600',
  alert: 'bg-alert-50 text-alert-500',
  iris: 'bg-iris-50 text-iris-600',
  blue: 'bg-blue-50 text-blue-600',
}

const toneDot: Record<StateTone, string> = {
  neutral: 'bg-night-300',
  leaf: 'bg-leaf-400',
  alert: 'bg-alert-400',
  iris: 'bg-iris-400',
  blue: 'bg-blue-400',
}

/** Petites pastilles décoratives autour du cercle (maquettes opérations longues). */
function DotsDecor({ tone }: { tone: StateTone }) {
  const dot = toneDot[tone]
  const pos = [
    'left-0 top-[34%] h-1.5 w-1.5', 'left-2 top-[52%] h-1 w-1 opacity-60', 'left-3 top-[70%] h-1 w-1 opacity-40',
    'right-0 top-[26%] h-1 w-1 opacity-60', 'right-1 top-[50%] h-1.5 w-1.5', 'right-3 top-[66%] h-1 w-1 opacity-40',
  ]
  return (
    <>
      {pos.map((p, i) => (
        <span key={i} className={cn('absolute rounded-full', dot, p)} />
      ))}
    </>
  )
}

/** Petites croix multicolores (maquette « Opération réussie ! »). */
function ConfettiDecor() {
  const items = [
    { c: 'text-blue-500', p: 'left-1 top-1' },
    { c: 'text-leaf-500', p: 'right-2 -top-1' },
    { c: 'text-sky-400', p: 'right-0 top-[38%]' },
    { c: 'text-gold-400', p: 'left-0 top-[66%]' },
    { c: 'text-alert-400', p: 'right-1 bottom-0' },
  ]
  return (
    <>
      {items.map((it, i) => (
        <svg key={i} viewBox="0 0 10 10" className={cn('absolute h-2.5 w-2.5', it.c, it.p)}>
          <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      ))}
    </>
  )
}

function Pictogram({ icon, tone, decor }: { icon: ReactNode; tone: StateTone; decor: 'none' | 'dots' | 'confetti' }) {
  return (
    <div aria-hidden="true" className="relative flex h-[112px] w-[150px] items-center justify-center motion-safe:animate-fade-up">
      {decor === 'dots' && <DotsDecor tone={tone} />}
      {decor === 'confetti' && <ConfettiDecor />}
      <div className={cn('grid h-[92px] w-[92px] place-items-center rounded-full', toneCircle[tone])}>{icon}</div>
    </div>
  )
}

/** Encart gris clair (code d'erreur, info hors connexion, maintenance…). */
export function StateNote({ icon, children, className }: { icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-center gap-3 rounded-xl border border-night-100 bg-night-50/50 px-4 py-3 text-left text-[12px] leading-snug text-night-700', className)}>
      {icon && <span aria-hidden="true" className="shrink-0 text-night-800">{icon}</span>}
      <span className={cn(!icon && 'text-center')}>{children}</span>
    </div>
  )
}

// --- Écran générique -------------------------------------------------------------

export type StateScreenProps = {
  icon: ReactNode
  tone?: StateTone
  decor?: 'none' | 'dots' | 'confetti'
  title: string
  description?: ReactNode
  /** Encart entre le texte et les actions */
  children?: ReactNode
  primary?: StateAction
  primaryVariant?: 'leaf' | 'danger'
  secondary?: StateAction
  /** `status` (polite) ou `alert` (assertive) — à réserver aux changements dynamiques */
  live?: 'status' | 'alert'
  headingLevel?: 1 | 2
  /** Version insérée dans une page (moins de hauteur) */
  compact?: boolean
  className?: string
}

export function StateScreen({
  icon, tone = 'neutral', decor = 'none', title, description, children,
  primary, primaryVariant = 'leaf', secondary, live, headingLevel = 2, compact, className,
}: StateScreenProps) {
  const H = headingLevel === 1 ? 'h1' : 'h2'
  return (
    <section
      role={live}
      aria-live={live === 'status' ? 'polite' : undefined}
      className={cn(
        'mx-auto flex w-full max-w-sm flex-col items-center px-6 text-center',
        compact ? 'py-8' : 'min-h-[calc(100dvh-10rem)] pt-10 pb-6',
        className,
      )}
    >
      <Pictogram icon={icon} tone={tone} decor={decor} />
      <H className="mt-6 text-[17px] font-bold leading-snug text-night-900">{title}</H>
      {description && (
        <p className="mt-2.5 max-w-[17rem] text-[13px] leading-relaxed text-night-600">{description}</p>
      )}
      {children && <div className="mt-7 w-full">{children}</div>}
      {(primary || secondary) && (
        <div className={cn('flex w-full flex-col gap-3', children ? 'mt-5' : compact ? 'mt-7' : 'mt-16')}>
          {primary && <ActionButton action={primary} variant={primaryVariant} />}
          {secondary && <ActionButton action={secondary} variant="outline" />}
        </div>
      )}
    </section>
  )
}

// --- Pictogrammes spécifiques ----------------------------------------------------

/** Spinner à 8 points (maquette « Chargement »). Tourne uniquement si mouvement autorisé. */
function DotsSpinner() {
  return (
    <svg viewBox="0 0 40 40" className="h-10 w-10 text-night-900 motion-safe:animate-spin motion-safe:[animation-duration:1.4s]">
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4
        return (
          <circle key={i} cx={20 + 14 * Math.cos(a)} cy={20 + 14 * Math.sin(a)} r={i % 2 ? 2.6 : 3.2}
            fill="currentColor" opacity={0.25 + (i / 8) * 0.75} />
        )
      })}
    </svg>
  )
}

function ErrorTriangle() {
  return (
    <svg viewBox="0 0 48 48" className="h-12 w-12">
      <path d="M21.4 6.6a3 3 0 0 1 5.2 0l17 29.5A3 3 0 0 1 41 40.6H7a3 3 0 0 1-2.6-4.5l17-29.5Z" fill="#d92128" />
      <path d="M24 17v11" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
      <circle cx="24" cy="34" r="2.4" fill="#fff" />
    </svg>
  )
}

function EmptyTray() {
  return (
    <svg viewBox="0 0 56 56" className="h-14 w-14">
      <path d="M10 30 16 13a3 3 0 0 1 2.8-2h18.4a3 3 0 0 1 2.8 2L46 30v12a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4V30Z" fill="#c3c8ee" />
      <path d="M10 30h11l3 5h8l3-5h11v12a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4V30Z" fill="#8f99d8" />
    </svg>
  )
}

function MaintenanceIcon() {
  return (
    <span className="relative block h-12 w-12">
      <Wrench className="h-11 w-11 text-night-700" strokeWidth={1.6} />
      <Settings className="absolute -bottom-1 -right-1 h-6 w-6 text-night-700" fill="currentColor" stroke="white" strokeWidth={1.6} />
    </span>
  )
}

function SyncCloud() {
  return (
    <span className="relative grid h-12 w-12 place-items-center">
      <Cloud className="h-12 w-12 text-night-900" strokeWidth={1.7} />
      <RefreshCw className="absolute left-1/2 top-[56%] h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 text-night-900" strokeWidth={2.2} />
    </span>
  )
}

// --- États généraux --------------------------------------------------------------

type BaseProps = {
  title?: string
  description?: ReactNode
  /** Compat : ancienne API à action unique */
  action?: { label: string; onClick: () => void }
  primary?: StateAction
  secondary?: StateAction
  icon?: ReactNode
  headingLevel?: 1 | 2
  compact?: boolean
  className?: string
}

export function LoadingState({
  title = 'Chargement en cours',
  description = 'Veuillez patienter quelques instants, nous préparons votre espace.',
  headingLevel, compact, className,
}: BaseProps) {
  return (
    <StateScreen
      live="status"
      icon={<DotsSpinner />}
      title={title}
      description={description}
      headingLevel={headingLevel}
      compact={compact}
      className={className}
    />
  )
}

export function SuccessState({
  title = 'Opération réussie !',
  description = 'Votre action a été effectuée avec succès.',
  primary = { label: 'Continuer', href: '/app' },
  secondary, action, headingLevel, compact, className,
}: BaseProps) {
  return (
    <StateScreen
      live="status"
      tone="leaf"
      decor="confetti"
      icon={<CircleCheck className="h-12 w-12" strokeWidth={1.8} />}
      title={title}
      description={description}
      primary={action ?? primary}
      secondary={secondary}
      headingLevel={headingLevel}
      compact={compact}
      className={className}
    />
  )
}

export function ErrorState({
  title = 'Oups, une erreur est survenue',
  description = "Nous n'avons pas pu effectuer cette action.",
  code,
  primary = { label: 'Réessayer', reload: true },
  secondary = { label: "Retour à l'accueil", href: '/app' },
  action, headingLevel, compact, className,
}: BaseProps & { code?: string | number }) {
  return (
    <StateScreen
      live="alert"
      tone="alert"
      icon={<ErrorTriangle />}
      title={title}
      description={description}
      primary={action ?? primary}
      primaryVariant="danger"
      secondary={secondary}
      headingLevel={headingLevel}
      compact={compact}
      className={className}
    >
      {code != null && <StateNote>Code d&apos;erreur : {code}</StateNote>}
    </StateScreen>
  )
}

export function OfflineState({
  title = 'Pas de connexion Internet',
  description = 'Vérifiez votre connexion et réessayez pour accéder à vos données.',
  primary = { label: 'Réessayer', reload: true },
  secondary = { label: 'Travailler hors ligne', back: true, href: '/' },
  action, headingLevel, compact, className,
}: BaseProps) {
  return (
    <StateScreen
      icon={<CloudOff className="h-12 w-12" strokeWidth={1.6} />}
      title={title}
      description={description}
      primary={action ?? primary}
      secondary={secondary}
      headingLevel={headingLevel}
      compact={compact}
      className={className}
    >
      <StateNote icon={<Wifi className="h-5 w-5" />}>
        Certaines fonctionnalités peuvent être limitées hors connexion.
      </StateNote>
    </StateScreen>
  )
}

export function EmptyState({
  title = 'Aucune donnée disponible',
  description = 'Commencez par ajouter votre premier élément pour le voir apparaître ici.',
  icon, primary, secondary, action, headingLevel, compact, className,
}: BaseProps) {
  return (
    <StateScreen
      icon={icon ?? <EmptyTray />}
      title={title}
      description={description}
      primary={action ?? primary}
      secondary={secondary}
      headingLevel={headingLevel}
      compact={compact}
      className={className}
    />
  )
}

export function MaintenanceState({
  title = 'Application en maintenance',
  description = 'Nous améliorons votre expérience. Merci de réessayer plus tard.',
  primary = { label: 'Réessayer plus tard', reload: true },
  action, headingLevel, compact, className,
}: BaseProps) {
  return (
    <StateScreen
      icon={<MaintenanceIcon />}
      title={title}
      description={description}
      primary={action ?? primary}
      headingLevel={headingLevel}
      compact={compact}
      className={className}
    >
      <StateNote icon={<Clock className="h-5 w-5" />}>Nous serons de retour très bientôt.</StateNote>
    </StateScreen>
  )
}

export function UpToDateState({
  title = 'Tout est à jour !',
  description = 'Vous utilisez la dernière version de Lien Parental.',
  version = '1.8.0',
  primary = { label: 'Parfait !', href: '/app' },
  action, headingLevel, compact, className,
}: BaseProps & { version?: string }) {
  return (
    <StateScreen
      live="status"
      tone="leaf"
      decor="dots"
      icon={<CircleCheck className="h-12 w-12" strokeWidth={1.8} />}
      title={title}
      description={description}
      primary={action ?? primary}
      headingLevel={headingLevel}
      compact={compact}
      className={className}
    >
      <div className="rounded-2xl border border-leaf-100 bg-leaf-50/60 px-5 py-5 text-center">
        <ShieldCheck aria-hidden="true" className="mx-auto h-6 w-6 text-leaf-600" strokeWidth={1.8} />
        <p className="mt-2 text-[12px] font-bold text-night-900">Version {version}</p>
        <p className="mt-1 text-[12px] leading-relaxed text-night-600">
          Vous bénéficiez des dernières fonctionnalités et correctifs.
        </p>
      </div>
    </StateScreen>
  )
}

// --- Opérations longues ------------------------------------------------------------

export type OperationKind = 'synchronisation' | 'sauvegarde' | 'suppression' | 'importation' | 'mise-a-jour'

const OPERATIONS: Record<OperationKind, {
  title: string
  description: string
  tone: StateTone
  bar: string
  icon: ReactNode
  layout: 'plain' | 'danger' | 'file' | 'version'
  cancelLabel: string
}> = {
  synchronisation: {
    title: 'Synchronisation en cours',
    description: 'Vos données sont en cours de synchronisation sur tous vos appareils.',
    tone: 'neutral', bar: 'bg-leaf-500', icon: <SyncCloud />, layout: 'plain', cancelLabel: 'Annuler',
  },
  sauvegarde: {
    title: 'Sauvegarde en cours',
    description: 'Nous sauvegardons vos données en toute sécurité.',
    tone: 'leaf', bar: 'bg-leaf-500', icon: <CloudUpload className="h-12 w-12" strokeWidth={1.7} />, layout: 'plain', cancelLabel: 'Annuler',
  },
  suppression: {
    title: 'Suppression en cours',
    description: 'Veuillez patienter pendant que nous supprimons vos éléments.',
    tone: 'alert', bar: 'bg-alert-500', icon: <Trash2 className="h-11 w-11" strokeWidth={1.7} />, layout: 'danger', cancelLabel: 'Annuler',
  },
  importation: {
    title: 'Importation en cours',
    description: 'Vos fichiers sont en cours d’importation dans votre coffre-fort.',
    tone: 'iris', bar: 'bg-iris-500', icon: <FileDown className="h-11 w-11 text-night-700" strokeWidth={1.7} />, layout: 'file', cancelLabel: 'Annuler',
  },
  'mise-a-jour': {
    title: 'Mise à jour en cours',
    description: 'Nous améliorons votre application pour une meilleure expérience.',
    tone: 'blue', bar: 'bg-blue-600', icon: <Settings className="h-12 w-12 text-blue-500" fill="currentColor" stroke="white" strokeWidth={1.4} />, layout: 'version', cancelLabel: 'Annuler la mise à jour',
  },
}

export type ProgressOperationProps = {
  kind: OperationKind
  /** 0 → 100 */
  value: number
  title?: string
  description?: ReactNode
  /** Suppression : éléments traités / total (affiche « 1 / 2 ») */
  current?: number
  total?: number
  /** Importation */
  fileName?: string
  fileSize?: string
  remainingLabel?: string
  /** Mise à jour */
  version?: string
  /** « Rester sur cette page » (sync / sauvegarde) */
  onStay?: () => void
  /** « Continuer en arrière-plan » (sync / sauvegarde) */
  onBackground?: () => void
  /** « Annuler » */
  onCancel?: () => void
  cancelLabel?: string
  headingLevel?: 1 | 2
  className?: string
}

/** Barre de progression animée uniquement via `transform` (compositor). */
export function ProgressBar({ value, color, labelledBy, valueText, className }: {
  value: number; color: string; labelledBy?: string; valueText?: string; className?: string
}) {
  const v = Math.max(0, Math.min(100, value))
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v)}
      aria-valuetext={valueText ?? `${Math.round(v)} %`}
      aria-labelledby={labelledBy}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-night-100/70', className)}
    >
      <div
        className={cn('h-full w-full origin-left rounded-full motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-out', color)}
        style={{ transform: `scaleX(${v / 100})` }}
      />
    </div>
  )
}

export function ProgressOperation({
  kind, value, title, description, current, total, fileName, fileSize, remainingLabel,
  version = '1.8.0', onStay, onBackground, onCancel, cancelLabel, headingLevel = 2, className,
}: ProgressOperationProps) {
  const cfg = OPERATIONS[kind]
  const titleId = useId()
  const pct = Math.round(Math.max(0, Math.min(100, value)))
  // Annonce lecteur d'écran par paliers de 10 % (évite le bavardage).
  const milestone = Math.floor(pct / 10) * 10
  const H = headingLevel === 1 ? 'h1' : 'h2'
  const countText = current != null && total != null ? `${current} / ${total}` : undefined

  const pctLabel = <p className="mt-3 text-center text-[13px] font-bold tabular-nums text-night-900">{pct} %</p>

  let panel: ReactNode
  if (cfg.layout === 'plain') {
    panel = (
      <div className="px-1">
        <ProgressBar value={pct} color={cfg.bar} labelledBy={titleId} />
        {pctLabel}
      </div>
    )
  } else if (cfg.layout === 'danger') {
    panel = (
      <div className="rounded-2xl border border-alert-100 bg-alert-50/60 px-4 py-4">
        <p className="flex items-center gap-2.5 text-[12px] font-medium text-night-900">
          <Trash2 aria-hidden="true" className="h-[18px] w-[18px] text-alert-500" />
          {total != null ? `${total} fichier${total > 1 ? 's' : ''} en cours de suppression` : 'Éléments en cours de suppression'}
        </p>
        <ProgressBar
          value={pct}
          color={cfg.bar}
          labelledBy={titleId}
          valueText={countText ? `${current} sur ${total}` : undefined}
          className="mt-3.5 bg-white"
        />
        <p className="mt-3 text-center text-[12px] font-semibold tabular-nums text-night-800">{countText ?? `${pct} %`}</p>
      </div>
    )
  } else if (cfg.layout === 'file') {
    panel = (
      <div className="rounded-2xl border border-night-100 bg-night-50/50 px-4 py-4 text-left">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="relative text-night-700">
            <FileText className="h-7 w-7" strokeWidth={1.6} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[12px] font-semibold text-night-900">{fileName ?? 'Document.pdf'}</p>
            {fileSize && <p className="text-[11px] text-night-600">{fileSize}</p>}
          </div>
        </div>
        <ProgressBar value={pct} color={cfg.bar} labelledBy={titleId} className="mt-3.5 bg-white" />
        {pctLabel}
        {remainingLabel && <p className="mt-1 text-center text-[11px] text-night-600">{remainingLabel}</p>}
      </div>
    )
  } else {
    panel = (
      <div className="rounded-2xl border border-blue-100 bg-blue-50/40 px-4 py-4 text-left">
        <p className="text-[12px] font-bold text-night-900">Version {version}</p>
        <p className="mt-1 text-[11px] text-night-600">Téléchargement en cours…</p>
        <ProgressBar value={pct} color={cfg.bar} labelledBy={titleId} className="mt-3.5 bg-white" />
        {pctLabel}
      </div>
    )
  }

  const btn = 'flex h-12 w-full items-center justify-center rounded-xl px-5 text-[14px] font-semibold transition-colors motion-safe:active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:ring-offset-2'
  const plain = cfg.layout === 'plain'

  return (
    <section className={cn('mx-auto flex min-h-[calc(100dvh-10rem)] w-full max-w-sm flex-col items-center px-6 pb-6 pt-10 text-center', className)}>
      <Pictogram icon={cfg.icon} tone={cfg.tone} decor="dots" />
      <H id={titleId} className="mt-6 text-[17px] font-bold leading-snug text-night-900">{title ?? cfg.title}</H>
      <p className="mt-2.5 max-w-[17rem] text-[13px] leading-relaxed text-night-600">{description ?? cfg.description}</p>

      <div className="mt-8 w-full">{panel}</div>

      <p role="status" aria-live="polite" className="sr-only">
        {(title ?? cfg.title)} : {countText ? `${current} sur ${total}` : `${milestone} %`}
      </p>

      <div className="mt-6 flex w-full flex-col gap-3">
        {plain ? (
          <>
            {onStay !== undefined && (
              <button type="button" onClick={onStay} className={cn(btn, actionClass.leaf)}>Rester sur cette page</button>
            )}
            {onBackground && (
              <button type="button" onClick={onBackground} className={cn(btn, actionClass.outline)}>Continuer en arrière-plan</button>
            )}
            {onCancel && (
              <button type="button" onClick={onCancel} className={cn(btn, actionClass.outline)}>{cancelLabel ?? cfg.cancelLabel}</button>
            )}
          </>
        ) : (
          <>
            {onCancel && (
              <button type="button" onClick={onCancel} className={cn(btn, actionClass.outline)}>{cancelLabel ?? cfg.cancelLabel}</button>
            )}
            {onBackground && (
              <button type="button" onClick={onBackground} className={cn(btn, actionClass.outline)}>Continuer en arrière-plan</button>
            )}
          </>
        )}
      </div>
    </section>
  )
}
