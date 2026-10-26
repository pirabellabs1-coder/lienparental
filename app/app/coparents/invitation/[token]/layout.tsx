import type { Metadata } from 'next'
import type { ReactNode } from 'react'

// Le jeton figure dans l'URL : jamais transmis en Referer, jamais indexé.
export const metadata: Metadata = {
  title: 'Invitation',
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
}

export default function InvitationLayout({ children }: { children: ReactNode }) {
  return children
}
