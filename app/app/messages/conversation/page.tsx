'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { TopBar } from '@/components/mobile/TopBar'
import { LoadingState } from '@/components/mobile/StateScreens'
import { listConversations } from '@/lib/messages'

// Ancienne adresse (V1, fil unique) : redirige vers la conversation la plus récente.
export default function LegacyConversationRedirect() {
  const router = useRouter()
  useEffect(() => {
    let alive = true
    listConversations()
      .then((list) => {
        if (!alive) return
        const target = list.find((c) => !c.archived) ?? list[0]
        router.replace(target ? `/app/messages/${encodeURIComponent(target.id)}` : '/app/messages')
      })
      .catch(() => { if (alive) router.replace('/app/messages') })
    return () => { alive = false }
  }, [router])

  return (
    <>
      <TopBar title="Conversation" showBack backHref="/app/messages" showBell={false} />
      <LoadingState compact title="Ouverture de la conversation" description="" />
    </>
  )
}
