'use client'

import { useId, useState } from 'react'
import { Check, Copy, Mail, MessageCircle, MessageSquareText, Share2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import { copyText } from '@/components/coffre/CopyLinkField'
import { invitationMessage, invitationUrl, shareTargets, type IssuedInvitation } from '@/lib/coparents'
import { frDay, linkBtn } from './bits'

type Props = {
  issued: IssuedInvitation
  senderPrenom?: string
  announce: (msg: string) => void
  className?: string
}

const MAIL_NOTE: Record<IssuedInvitation['emailStatus'], string> = {
  sent: 'Un e-mail d’invitation vient d’être envoyé.',
  skipped: 'L’envoi d’e-mails n’est pas configuré : partagez le lien ci-dessous.',
  failed: 'L’e-mail n’a pas pu être envoyé : partagez le lien ci-dessous.',
}

/** Lien d'invitation (affiché une seule fois) + partage WhatsApp, SMS, e-mail, copie. */
export function ShareInvite({ issued, senderPrenom = '', announce, className }: Props) {
  const uid = useId()
  const [copied, setCopied] = useState(false)
  const url = invitationUrl(issued.token)
  const message = invitationMessage(senderPrenom, url)
  const targets = shareTargets(message, issued.email)
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  const onCopy = async () => {
    if (await copyText(url)) {
      setCopied(true)
      announce('Lien copié dans le presse-papiers')
      setTimeout(() => setCopied(false), 2200)
    }
  }

  return (
    <div className={cn('space-y-3', className)}>
      <p className="text-[13px] text-night-700">
        Invitation pour <strong className="break-all font-semibold text-night-900">{issued.email}</strong>, valable jusqu&apos;au {frDay(issued.expiresAt)}. {MAIL_NOTE[issued.emailStatus]}
      </p>
      <div>
        <label htmlFor={`${uid}-link`} className="block text-[13px] font-bold text-night-900">Lien d&apos;invitation</label>
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
            {copied ? 'Copié' : 'Copier'}
          </button>
        </div>
        <p className="mt-1.5 text-[12px] text-night-600">
          Ce lien ne s&apos;affichera plus : seul un compte vérifié avec cette adresse e-mail pourra l&apos;utiliser.
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Partager le lien">
        <a href={targets.whatsapp} target="_blank" rel="noopener noreferrer" className={cn(linkBtn, 'flex-col gap-1 border border-night-100 bg-white py-2 text-night-900 hover:bg-night-50')}>
          <MessageCircle className="h-5 w-5 text-leaf-600" aria-hidden="true" />
          WhatsApp
          <span className="sr-only"> (nouvel onglet)</span>
        </a>
        <a href={targets.sms} className={cn(linkBtn, 'flex-col gap-1 border border-night-100 bg-white py-2 text-night-900 hover:bg-night-50')}>
          <MessageSquareText className="h-5 w-5 text-sky-700" aria-hidden="true" />
          SMS
        </a>
        <a href={targets.email} className={cn(linkBtn, 'flex-col gap-1 border border-night-100 bg-white py-2 text-night-900 hover:bg-night-50')}>
          <Mail className="h-5 w-5 text-night-700" aria-hidden="true" />
          E-mail
        </a>
      </div>
      {canShare && (
        <button
          type="button"
          onClick={() => { navigator.share({ title: 'Invitation Lien Parental', text: message }).catch(() => undefined) }}
          className={cn(linkBtn, 'w-full border border-night-200 bg-white text-night-900 hover:bg-night-50')}
        >
          <Share2 className="h-4 w-4" aria-hidden="true" />
          Autres applications
        </button>
      )}
    </div>
  )
}
