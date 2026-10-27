import type { Metadata } from 'next'
import Link from 'next/link'
import { Heart, ArrowLeft } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { SiteShell } from '@/components/site/SiteShell'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('public.donate')
  return { title: t('metaTitle') }
}

// La plateforme de don (Stripe, HelloAsso…) reste à choisir par le client (CDC §13 Q7).
const DON_URL = process.env.NEXT_PUBLIC_DON_URL

export default async function DonPage() {
  const t = await getTranslations('public.donate')
  return (
    <SiteShell mainClassName="grid place-items-center bg-[#F7F9FC] px-5 py-16">
      <div className="w-full max-w-md rounded-2xl border border-night-100 bg-white p-8 text-center shadow-soft">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-leaf-50">
          <Heart className="h-8 w-8 text-leaf-500" aria-hidden />
        </span>
        <h1 className="mt-4 text-[28px] font-extrabold text-night-900">{t('title')}</h1>
        <p className="mt-3 text-sm leading-relaxed text-night-700">
          {t('text')}
        </p>
        {DON_URL ? (
          <a href={DON_URL} rel="noopener" className="mt-6 inline-flex h-12 items-center gap-2 rounded-xl bg-leaf-500 px-6 font-semibold text-white hover:bg-leaf-600">
            <Heart className="h-4 w-4" aria-hidden /> {t('cta')}
          </a>
        ) : (
          <p className="mt-6 rounded-lg bg-leaf-50 px-4 py-3 text-sm font-medium text-leaf-700">{t('soon')}</p>
        )}
        <Link href="/" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-night-900 hover:text-leaf-500">
          <ArrowLeft className="h-4 w-4" aria-hidden /> {t('backHome')}
        </Link>
      </div>
    </SiteShell>
  )
}
