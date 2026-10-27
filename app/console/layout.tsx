import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { NOINDEX_NOFOLLOW } from '@/lib/seo/metadata'

// Connexion de l'administration : jamais indexée (aussi X-Robots-Tag dans next.config.mjs). Interface non traduite.
export const metadata: Metadata = { title: 'Console', robots: NOINDEX_NOFOLLOW }

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  return children
}
