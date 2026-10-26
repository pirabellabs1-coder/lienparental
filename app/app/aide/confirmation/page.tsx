import Link from 'next/link'
import { Check } from 'lucide-react'
import { TopBar } from '@/components/mobile/TopBar'
import { btn } from '@/components/profil/kit'
import { cn } from '@/lib/cn'

export default function AideConfirmationPage() {
  return (
    <>
      <TopBar title="Contact - Confirmation" showBack backHref="/app/aide" showBell={false} />
      <div className="px-5 pb-8 pt-10">
        <div role="status" className="flex flex-col items-center text-center">
          <span aria-hidden className="inline-flex h-24 w-24 items-center justify-center rounded-full bg-leaf-50">
            <span className="inline-flex h-16 w-16 items-center justify-center rounded-full border-[3px] border-leaf-500 text-leaf-600">
              <Check className="h-8 w-8" strokeWidth={3} />
            </span>
          </span>
          <h1 className="mt-8 text-[17px] font-extrabold text-night-900">Message envoyé !</h1>
          <p className="mt-3 max-w-[250px] text-[12.5px] leading-relaxed text-night-800">
            Merci ! Votre message a bien été envoyé. Nous vous répondrons dans les plus brefs délais.
          </p>
        </div>
        <Link href="/app/aide" className={cn(btn.secondary, 'mt-16 text-[13px]')}>Retour au centre d’aide</Link>
      </div>
    </>
  )
}
