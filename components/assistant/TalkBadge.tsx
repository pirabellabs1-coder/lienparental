import { useId } from 'react'

/** Pastille violette en bulle de dialogue, « … » blanc, pointe en bas à gauche. */
export function TalkBadge({ className }: { className?: string }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg viewBox="0 0 40 36" aria-hidden className={className}>
      <defs>
        <radialGradient id={`${id}-b`} cx="35%" cy="28%" r="80%">
          <stop offset="0" stopColor="#a38ff6" />
          <stop offset="0.5" stopColor="#7c4dff" />
          <stop offset="1" stopColor="#4a1fb8" />
        </radialGradient>
      </defs>
      <path d="M21 2C30.4 2 38 8.3 38 16.2S30.4 30.4 21 30.4c-2 0-3.9-.3-5.7-.8L5 34l3.6-7.6C5.5 23.8 4 20.2 4 16.2 4 8.3 11.6 2 21 2Z" fill={`url(#${id}-b)`} />
      <circle cx="13.5" cy="16.4" r="2.7" fill="#fff" />
      <circle cx="21" cy="16.4" r="2.7" fill="#fff" />
      <circle cx="28.5" cy="16.4" r="2.7" fill="#fff" />
    </svg>
  )
}
