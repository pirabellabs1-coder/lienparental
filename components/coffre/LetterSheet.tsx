import { Fragment, type ReactNode } from 'react'
import { Logo } from '@/components/brand/Logo'
import type { Modele } from '@/lib/mock-vault'
import { cn } from '@/lib/cn'

/** Surligne les occurrences de `q` (recherche dans le document). */
export function highlight(text: string, q: string): ReactNode {
  const needle = q.trim()
  if (!needle) return text
  const re = new RegExp(`(${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
  return text.split(re).map((part, i) =>
    i % 2 === 1 ? <mark key={i} className="rounded-sm bg-gold-200 text-night-900">{part}</mark> : <Fragment key={i}>{part}</Fragment>,
  )
}

type Props = {
  modele: Modele
  /** 0 = lettre ; n = annexe n. */
  page: number
  query?: string
  className?: string
}

/**
 * Une page « papier » du modèle (maquette « Lecture du document »).
 * La taille du texte est pilotée par `font-size` sur le conteneur (zoom en em).
 */
export function LetterSheet({ modele, page, query = '', className }: Props) {
  const L = modele.letter
  const hl = (t: string) => highlight(t, query)

  if (page > 0) {
    const a = modele.annexes[page - 1]
    return (
      <article className={cn('rounded-sm bg-white px-[2.2em] py-[2.4em] text-[1em] leading-[1.6] text-night-900 shadow-[0_2px_14px_-4px_rgba(11,45,91,0.22)]', className)}>
        <h3 className="mb-[1em] text-[1.25em] font-extrabold text-night-900">{hl(a.title)}</h3>
        <ul className="space-y-[0.5em]">
          {a.lines.map((l) => <li key={l}>• {hl(l)}</li>)}
        </ul>
      </article>
    )
  }

  return (
    <article className={cn('rounded-sm bg-white px-[2.2em] py-[2.4em] text-[1em] leading-[1.6] text-night-900 shadow-[0_2px_14px_-4px_rgba(11,45,91,0.22)]', className)}>
      <div className="flex items-start justify-between gap-4">
        <Logo size="sm" tagline />
        <p className="text-right text-[0.78em] leading-[1.7] text-night-600">
          Prénom Nom<br />Adresse<br />Code postal - Ville<br />Téléphone<br />Email
        </p>
      </div>
      <p className="ml-[38%] mt-[2em]">{L.recipient.map((r, i) => <Fragment key={r}>{i > 0 && <br />}{hl(r)}</Fragment>)}</p>
      <p className="mt-[1.2em] text-right">[Ville], le [Date]</p>
      <p className="mt-[1.4em]"><strong>Objet :</strong> {hl(L.objet)}</p>
      {L.salutation && <p className="mt-[1.2em]">{hl(L.salutation)}</p>}
      {L.paragraphs.map((p, i) => <p key={i} className="mt-[1em] text-justify">{hl(p)}</p>)}
      <p className="mt-[1em]">{hl(L.closing)}</p>
    </article>
  )
}
