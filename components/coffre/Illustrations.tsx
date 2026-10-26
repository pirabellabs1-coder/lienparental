import { Check, Link2, MailOpen } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** Confettis décoratifs (points + traits) disposés autour d'un médaillon central. */
function Confetti({ palette }: { palette: string[] }) {
  // Positions en % autour du centre — stables (pas d'aléatoire → pas d'écart SSR/CSR).
  const bits: { x: number; y: number; r: number; kind: 'dot' | 'dash'; c: number; rot?: number }[] = [
    { x: 14, y: 22, r: 3, kind: 'dot', c: 0 }, { x: 26, y: 8, r: 2.5, kind: 'dash', c: 1, rot: 30 },
    { x: 44, y: 3, r: 2, kind: 'dot', c: 2 }, { x: 64, y: 6, r: 2.5, kind: 'dash', c: 3, rot: -20 },
    { x: 82, y: 16, r: 3, kind: 'dot', c: 1 }, { x: 92, y: 38, r: 2, kind: 'dash', c: 0, rot: 60 },
    { x: 90, y: 64, r: 3, kind: 'dot', c: 2 }, { x: 80, y: 86, r: 2.5, kind: 'dash', c: 3, rot: 15 },
    { x: 58, y: 96, r: 2, kind: 'dot', c: 0 }, { x: 34, y: 94, r: 2.5, kind: 'dash', c: 2, rot: -40 },
    { x: 14, y: 80, r: 3, kind: 'dot', c: 3 }, { x: 5, y: 54, r: 2, kind: 'dash', c: 1, rot: 80 },
    { x: 6, y: 34, r: 1.8, kind: 'dot', c: 2 }, { x: 96, y: 50, r: 1.8, kind: 'dot', c: 3 },
  ]
  return (
    <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden="true" focusable="false">
      {bits.map((b, i) =>
        b.kind === 'dot' ? (
          <circle key={i} cx={b.x} cy={b.y} r={b.r / 2 + 0.4} className={palette[b.c % palette.length]} fill="currentColor" />
        ) : (
          <rect key={i} x={b.x - 2} y={b.y - 0.7} width="4" height="1.4" rx="0.7" transform={`rotate(${b.rot ?? 0} ${b.x} ${b.y})`} className={palette[b.c % palette.length]} fill="currentColor" />
        ),
      )}
    </svg>
  )
}

const PALETTE = ['text-leaf-400', 'text-iris-400', 'text-orange-400', 'text-blue-500']

/** Médaillon de succès (coche verte) + confettis — « Document ajouté », « Témoignage confirmé ». */
export function SuccessBurst({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <div className={cn('relative mx-auto h-48 w-48', className)} aria-hidden="true">
      <Confetti palette={PALETTE} />
      <div className="absolute inset-[22%] flex items-center justify-center rounded-full bg-leaf-500 shadow-[0_18px_40px_-14px_rgba(46,125,50,0.7)] motion-safe:animate-fade-up">
        {children ?? <Check className="h-14 w-14 text-white" strokeWidth={3} />}
      </div>
    </div>
  )
}

/** Icône lien dans un cercle violet doux + confettis — « Lien de témoignage généré ». */
export function LinkBurst({ className }: { className?: string }) {
  return (
    <div className={cn('relative mx-auto h-44 w-44', className)} aria-hidden="true">
      <Confetti palette={['text-iris-300', 'text-leaf-300', 'text-orange-300', 'text-iris-500']} />
      <div className="absolute inset-[24%] flex items-center justify-center rounded-full bg-iris-100 ring-8 ring-iris-50 motion-safe:animate-fade-up">
        <Link2 className="h-11 w-11 -rotate-45 text-iris-500" strokeWidth={2.4} />
      </div>
    </div>
  )
}

/** Enveloppe + horloge dans un cercle violet — « Témoignage non encore envoyé ». */
export function EnvelopeWaiting({ className }: { className?: string }) {
  return (
    <div className={cn('relative mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-iris-100', className)} aria-hidden="true">
      <svg viewBox="0 0 64 64" className="h-14 w-14" focusable="false">
        <rect x="6" y="16" width="44" height="32" rx="5" className="text-iris-500" fill="currentColor" />
        <path d="M8 19l20 15 20-15" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="48" cy="20" r="12" fill="white" />
        <circle cx="48" cy="20" r="9.5" fill="none" className="text-iris-500" stroke="currentColor" strokeWidth="3" />
        <path d="M48 15v5.5l3.5 2.5" fill="none" className="text-iris-500" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      </svg>
    </div>
  )
}

/** Illustration « Nouveau témoignage » : presse-papiers coché + personne + feuillage. */
export function ClipboardPersonIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 280 190" className={cn('mx-auto h-auto w-full max-w-[290px]', className)} aria-hidden="true" focusable="false">
      {/* sol + halo */}
      <ellipse cx="140" cy="176" rx="118" ry="9" fill="#eef0fb" />
      <circle cx="132" cy="92" r="78" fill="#f4f6fd" />
      {/* feuillage gauche */}
      <g fill="#a7d8b5">
        <path d="M34 176c-4-22 4-40 18-52-2 18 0 36-6 52z" />
        <path d="M50 176c2-16 12-28 26-34-6 12-10 24-14 34z" fill="#72bf88" />
        <path d="M24 176c-10-12-12-26-6-38 6 12 10 26 12 38z" fill="#d3ecda" />
      </g>
      {/* feuillage droit */}
      <g>
        <path d="M244 176c4-18-2-34-14-44 1 16-1 30 4 44z" fill="#d3ecda" />
        <path d="M256 176c6-12 6-24 0-34-4 12-6 24-8 34z" fill="#a7d8b5" />
      </g>
      {/* presse-papiers */}
      <rect x="72" y="34" width="104" height="134" rx="12" fill="#0b2d5b" />
      <rect x="80" y="44" width="88" height="116" rx="7" fill="#ffffff" />
      <rect x="104" y="26" width="40" height="20" rx="6" fill="#3c4ca8" />
      <circle cx="124" cy="30" r="3.5" fill="#dde1f5" />
      {[66, 92, 118].map((y) => (
        <g key={y}>
          <rect x="90" y={y - 8} width="16" height="16" rx="4" fill="#ecf6ef" stroke="#2e7d32" strokeWidth="1.6" />
          <path d={`M93.5 ${y}l3.2 3.4 6-6.6`} fill="none" stroke="#2e7d32" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="112" y={y - 5} width="46" height="4" rx="2" fill="#b9c0ea" />
          <rect x="112" y={y + 2} width="30" height="3.5" rx="1.75" fill="#dde1f5" />
        </g>
      ))}
      <rect x="90" y="136" width="16" height="16" rx="4" fill="#fff" stroke="#b9c0ea" strokeWidth="1.6" />
      <rect x="112" y="139" width="40" height="4" rx="2" fill="#dde1f5" />
      {/* personne */}
      <g>
        <path d="M205 176l4-46h14l2 46z" fill="#0b2d5b" />
        <path d="M198 176h12l1-6h-12zM214 176h12l-1-6h-12z" fill="#0b1240" />
        <path d="M200 132c0-24 6-40 18-40s18 16 18 40z" fill="#5b45e3" />
        <path d="M204 104c-10 4-20 6-30 4l-2 6c12 4 24 2 34-4z" fill="#5b45e3" />
        <circle cx="171" cy="111" r="4.5" fill="#f2c7a5" />
        <rect x="211" y="84" width="10" height="10" rx="3" fill="#f2c7a5" />
        <circle cx="217" cy="72" r="13" fill="#f2c7a5" />
        <path d="M204 72c0-10 6-16 14-16s13 5 13 12c-6 0-12-2-16-6-2 4-6 8-11 10z" fill="#3a2506" />
        <path d="M229 66c4 6 4 14 0 22" stroke="#3a2506" strokeWidth="5" strokeLinecap="round" fill="none" />
      </g>
    </svg>
  )
}

/** Petite pastille enveloppe ouverte (vue témoin reçue). */
export function ReceivedMedal({ className }: { className?: string }) {
  return (
    <div className={cn('mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-leaf-50', className)} aria-hidden="true">
      <MailOpen className="h-11 w-11 text-leaf-500" strokeWidth={2} />
    </div>
  )
}
