import { cn } from '@/lib/cn'
import type { Participant } from '@/lib/messages'
import { initials } from './format'

// Teintes d'avatar (iris et gold exclus : réservés au Coach IA et au Premium).
const TONES = [
  'bg-sky-50 text-sky-700 ring-sky-100',
  'bg-leaf-50 text-leaf-700 ring-leaf-100',
  'bg-rose-50 text-rose-700 ring-rose-100',
  'bg-night-50 text-night-800 ring-night-100',
] as const

function toneOf(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return TONES[Math.abs(h) % TONES.length]
}

/** Avatar à initiales (décoratif : le nom est toujours écrit à côté). */
export function Avatar({ person, size = 'md', className }: { person: Participant; size?: 'sm' | 'md'; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid shrink-0 place-items-center rounded-full font-bold ring-2 ring-white',
        size === 'md' ? 'h-12 w-12 text-[14px]' : 'h-9 w-9 text-[12px]',
        toneOf(person.id),
        className,
      )}
    >
      {initials(person.prenom, person.nom)}
    </span>
  )
}

/** Un avatar, ou deux superposés pour une discussion à plusieurs. */
export function AvatarStack({ people }: { people: Participant[] }) {
  if (people.length <= 1) {
    return people[0] ? <Avatar person={people[0]} /> : <span aria-hidden="true" className="h-12 w-12 shrink-0 rounded-full bg-night-50" />
  }
  return (
    <span aria-hidden="true" className="relative h-12 w-12 shrink-0">
      <Avatar person={people[0]} size="sm" className="absolute left-0 top-0" />
      <Avatar person={people[1]} size="sm" className="absolute bottom-0 right-0" />
    </span>
  )
}
