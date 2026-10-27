'use client'

import { useId, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Check, Copy, Mail, MessageCircle, MessageSquareText, Share2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import { copyText } from '@/components/coffre/CopyLinkField'
import { invitationUrl, shareTargets, type IssuedInvitation } from '@/lib/coparents'
import { frDay, linkBtn } from './bits'

type Props = {
  issued: IssuedInvitation
  senderPrenom?: string
  announce: (msg: string) => void
  className?: string
}

// Note d'envoi : family.coparents.share.mailNote.<emailStatus> (traduite au rendu).

/** Lien d'invitation (affiché une seule fois) + partage WhatsApp, SMS, e-mail, copie. */
export function ShareInvite({ issued, senderPrenom = '', announce, className }: Props) {
  const t = useTranslations('family.coparents.share')
  const locale = useLocale()
  const uid = useId()
  const [copied, setCopied] = useState(false)
  const url = invitationUrl(issued.token)
  // Même texte que invitationMessage (lib/coparents), dans la langue de l'expéditeur.
  const message = senderPrenom ? t('messageFrom', { name: senderPrenom, url }) : t('messageMe', { url })
  const targets = shareTargets(message, issued.email)
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  const onCopy = async () => {
    if (await copyText(url)) {
      setCopied(true)
      announce(t('copiedAnnounce'))
      setTimeout(() => setCopied(false), 2200)
    }
  }

  return (
    <div className={cn('space-y-3', className)}>
      <p className="text-[13px] text-night-700">
        {t.rich('intro', {
          email: issued.email,
          date: frDay(issued.expiresAt, false, locale),
          strong: (chunks) => <strong className="break-all font-semibold text-night-900">{chunks}</strong>,
        })}{' '}
        {t(`mailNote.${issued.emailStatus}`)}
      </p>
      <div>
        <label htmlFor={`${uid}-link`} className="block text-[13px] font-bold text-night-900">{t('linkLabel')}</label>
        <div className="mt-1.5 flex gap-2">
          <input
            id={`${uid}-link`}
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            className="h-12 min-w-0 flex-1 rounded-xl border border-night-200 bg-night-50 px-3 text-[13px] text-night-800 focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-200"
          />
          <button type="button" onClick={() => void onCopy()} className={cn(linkBtn, 'h-12 shrink-0 border border-night-200 bg-white text-night-900 hover:bg-night-50')}>
            {copied ? <Check className="h-4 w-4 text-leaf-600" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
            {copied ? t('copied') : t('copy')}
          </button>
        </div>
        <p className="mt-1.5 text-[12px] text-night-600">
          {t('linkNote')}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2" role="group" aria-label={t('shareLink')}>
        <a href={targets.whatsapp} target="_blank" rel="noopener noreferrer" className={cn(linkBtn, 'flex-col gap-1 border border-night-100 bg-white py-2 text-night-900 hover:bg-night-50')}>
          <MessageCircle className="h-5 w-5 text-leaf-600" aria-hidden="true" />
          WhatsApp
          <span className="sr-only"> {t('newTab')}</span>
        </a>
        <a href={targets.sms} className={cn(linkBtn, 'flex-col gap-1 border border-night-100 bg-white py-2 text-night-900 hover:bg-night-50')}>
          <MessageSquareText className="h-5 w-5 text-sky-700" aria-hidden="true" />
          SMS
        </a>
        <a href={targets.email} className={cn(linkBtn, 'flex-col gap-1 border border-night-100 bg-white py-2 text-night-900 hover:bg-night-50')}>
          <Mail className="h-5 w-5 text-night-700" aria-hidden="true" />
          {t('email')}
        </a>
      </div>
      {canShare && (
        <button
          type="button"
          onClick={() => { navigator.share({ title: t('shareTitle'), text: message }).catch(() => undefined) }}
          className={cn(linkBtn, 'w-full border border-night-200 bg-white text-night-900 hover:bg-night-50')}
        >
          <Share2 className="h-4 w-4" aria-hidden="true" />
          {t('otherApps')}
        </button>
      )}
    </div>
  )
}
