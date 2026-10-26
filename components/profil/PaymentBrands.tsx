import { cn } from '@/lib/cn'

/** Logos de moyens de paiement (simplifiés, décoratifs). */
export function VisaMark({ className = '' }: { className?: string }) {
  return (
    <span aria-hidden className={cn("inline-flex h-7 items-center rounded-md border border-night-100 bg-white px-2 text-[13px] font-extrabold italic tracking-tight text-[#1a1f71]", className)}>
      VISA
    </span>
  )
}

export function MastercardMark() {
  return (
    <span aria-hidden className="inline-flex h-7 items-center rounded-md border border-night-100 bg-white px-2">
      <span className="h-4 w-4 rounded-full bg-[#eb001b]" />
      <span className="-ml-1.5 h-4 w-4 rounded-full bg-[#f79e1b] mix-blend-multiply" />
    </span>
  )
}

export function WalletPayMark() {
  return (
    <span aria-hidden className="inline-flex h-7 items-center gap-0.5 rounded-md border border-night-100 bg-white px-2 text-[12px] font-semibold text-night-950">
      <svg viewBox="0 0 14 16" className="h-3 w-3 fill-current"><path d="M11.2 8.5c0-1.6 1.3-2.4 1.4-2.4-.8-1.1-2-1.3-2.4-1.3-1-.1-2 .6-2.5.6s-1.3-.6-2.2-.6C4.3 4.8 3.2 5.5 2.6 6.6c-1.2 2.1-.3 5.2.9 6.9.6.8 1.2 1.7 2.1 1.7.8 0 1.2-.5 2.2-.5s1.3.5 2.2.5 1.5-.9 2-1.7c.6-.9.9-1.8.9-1.9 0 0-1.7-.6-1.7-3.1ZM9.6 3.6c.5-.6.8-1.3.7-2.1-.7 0-1.5.5-2 1.1-.4.5-.8 1.3-.7 2 .8.1 1.5-.4 2-1Z" /></svg>
      Pay
    </span>
  )
}
