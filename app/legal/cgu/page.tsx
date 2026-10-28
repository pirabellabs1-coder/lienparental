import type { Metadata } from 'next';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { intlLocale } from '@/lib/i18n/config';
import { localePath } from '@/lib/i18n/routing';
import { pageMetadata } from '@/lib/seo/metadata';
import { LEGAL_UPDATED, isoDate } from '@/lib/seo/pages';
import { AI_CREDIT_VALIDITY_MONTHS, packSummaries } from '@/lib/billing/credit-packs';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('public.legal.cgu');
  const ts = await getTranslations('seo.pages.cgu');
  return pageMetadata({ title: t('metaTitle'), description: ts('description'), path: '/legal/cgu', locale: await getLocale() });
}

// Date partagée avec le sitemap (lib/seo/pages.ts).
const LAST_UPDATED = isoDate(LEGAL_UPDATED.cgu);

// `credits` : crédits d'analyses du Coach IA (prix et validité issus de lib/billing/credit-packs.ts).
const SECTIONS = ['s1', 's2', 's3', 's4', 's5', 'credits', 's6'] as const;

export default async function CGUPage() {
  const t = await getTranslations('public.legal.cgu');
  const tl = await getTranslations('public.legal');
  const locale = await getLocale();
  const lastUpdated = new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: 'long', timeZone: 'UTC' }).format(LAST_UPDATED);
  const packs = new Intl.ListFormat(intlLocale(locale), { style: 'long', type: 'disjunction' }).format(
    packSummaries(intlLocale(locale), (count, price) => t('credits.packItem', { count, price })),
  );
  const values = { packs, months: AI_CREDIT_VALIDITY_MONTHS };
  return (
    <div className="px-5 py-12 text-night-900 sm:px-8 sm:py-16">
      <article className="mx-auto max-w-[760px] rounded-3xl bg-white p-6 ring-1 ring-[#E5E7EB] sm:p-10">
        <Link
          href={localePath(locale, '/')}
          className="inline-flex items-center gap-2 min-h-[44px] text-[14px] font-semibold text-night-700 hover:text-leaf-600 underline underline-offset-4"
        >
          <span aria-hidden="true">←</span> {tl('backHome')}
        </Link>

        <h1 className="mt-6 text-[32px] font-extrabold leading-tight tracking-[-0.02em] text-night-900 sm:text-[38px]">
          {t('title')}
        </h1>
        <p className="mt-2 text-sm text-night-600">
          {tl('updated', { date: lastUpdated })}
        </p>
        {locale !== 'fr' && (
          <p className="mt-4 rounded-xl bg-night-50 p-4 text-sm text-night-800" role="note">
            {tl('bindingNotice')}
          </p>
        )}

        <div className="mt-10 space-y-8 text-[15.5px] text-night-800 leading-relaxed">
          {SECTIONS.map((s) => (
            <section key={s}>
              <h2 className="font-display text-xl font-bold text-night-900">
                {t(`${s}.title`)}
              </h2>
              <p className="mt-3">
                {t(`${s}.body`, values)}
              </p>
            </section>
          ))}
        </div>
      </article>
    </div>
  );
}
