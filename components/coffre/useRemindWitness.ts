'use client'

import { useTranslations } from 'next-intl'
import { LIVE } from '@/lib/data/core'
import { TESTIMONY_LINK_BASE } from '@/lib/mock-vault'
import { testimonyUrl } from '@/lib/data/testimonies'
import { copyText } from './CopyLinkField'

/**
 * Relance d'un témoin. Les témoins reçoivent le lien de la main du parent (aucune adresse
 * n'est connue de l'application) : la relance repart donc depuis la messagerie du parent,
 * via le partage natif (WhatsApp, SMS…) ou, à défaut, en copiant un message prêt à coller.
 */
export function useRemindWitness(announce: (msg: string) => void) {
  const t = useTranslations('vault.testimonials')
  return async (token: string, done: string) => {
    const url = LIVE ? testimonyUrl(token) : `https://${TESTIMONY_LINK_BASE}${token}`
    const text = t('reminderText')
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: t('reminderTitle'), text, url })
        announce(done)
      } catch { /* partage annulé */ }
      return
    }
    if (await copyText(`${text}\n${url}`)) announce(t('reminderCopied'))
  }
}
