'use client'

import { usePathname } from 'next/navigation'
import { useCredits } from '@/components/coach/CreditCost'
import { CHAT_MAX_TOTAL_CHARS, CHAT_MAX_TURNS } from '@/lib/ai/schemas'
import { AssistantWidget, COACH_MAX_CHARS, type Msg } from './AssistantWidget'
import { bubbleHiddenOn } from './visibility'

// Bulle de l'espace connecté : même mascotte que le site, reliée au Coach parental.
// Masquée là où elle gênerait : pages du Coach (il y est déjà), fils de messagerie (zone de saisie
// en bas d'écran), coffre (écran de déverrouillage et bouton « Verrouiller » au même endroit).
// /admin n'utilise pas ce gabarit.

/** Historique envoyé au Coach : derniers tours, dans les limites du serveur, commençant par une question. */
function buildHistory(msgs: Msg[], question: string) {
  let history = msgs.filter((m) => !m.error && m.content.trim()).map((m) => ({ role: m.role, content: m.content.slice(0, COACH_MAX_CHARS) }))
  history = history.slice(-(CHAT_MAX_TURNS - 1))
  let total = history.reduce((n, h) => n + h.content.length, question.length)
  while (history.length && (total > CHAT_MAX_TOTAL_CHARS || history[0]!.role !== 'user')) {
    total -= history[0]!.content.length
    history = history.slice(1)
  }
  return [...history, { role: 'user' as const, content: question }]
}

export function CoachBubble() {
  const pathname = usePathname() ?? ''
  const { data: credits, refresh } = useCredits()
  if (bubbleHiddenOn(pathname)) return null
  return <AssistantWidget coach={{ credits, refreshCredits: refresh, buildHistory }} />
}
