import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { getLocale, getTranslations } from 'next-intl/server';
import { intlLocale } from '@/lib/i18n/config';
import { localePath } from '@/lib/i18n/routing';
import { pageMetadata } from '@/lib/seo/metadata';
import { LEGAL_UPDATED, isoDate } from '@/lib/seo/pages';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('public.legal.privacy');
  const ts = await getTranslations('seo.pages.privacy');
  return pageMetadata({ title: t('metaTitle'), description: ts('description'), path: '/legal/confidentialite', locale: await getLocale() });
}

// Date partagée avec le sitemap (lib/seo/pages.ts).
const LAST_UPDATED = isoDate(LEGAL_UPDATED.confidentialite);

/**
 * Sous-traitants et destinataires techniques (art. 28 et 44 et suivants du RGPD).
 * Textes : public.legal.privacy.processors.<key>.{name,purpose,data,location} ;
 * la garantie de transfert (clauses contractuelles types) est commune : processors.scc.
 */
const SUBPROCESSORS = ['supabase', 'vercel', 'anthropic', 'stripe', 'resend', 'google'] as const;
const FIELDS = ['purpose', 'data', 'location', 'safeguard'] as const;

const strong = (c: ReactNode) => <strong>{c}</strong>;

export default async function ConfidentialitePage() {
  const t = await getTranslations('public.legal.privacy');
  const tl = await getTranslations('public.legal');
  const locale = await getLocale();
  const lastUpdated = new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: 'long', timeZone: 'UTC' }).format(LAST_UPDATED);
  const p = (key: string) => <p className="mt-3">{t.rich(key, { b: strong })}</p>;
  const h2 = (key: string, id?: string) => (
    <h2 id={id} className="font-display text-xl font-bold text-night-900">
      {t(key)}
    </h2>
  );

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
          <section>
            {h2('controller.title')}
            {p('controller.p1')}
          </section>

          <section>
            {h2('purposes.title')}
            {p('purposes.p1')}
          </section>

          <section>
            {h2('storage.title')}
            {p('storage.p1')}
            {p('storage.p2')}
          </section>

          <section aria-labelledby="sous-traitants">
            {h2('processors.title', 'sous-traitants')}
            {p('processors.intro')}
            <ul className="mt-5 space-y-4">
              {SUBPROCESSORS.map((s) => (
                <li key={s} className="rounded-2xl p-5 ring-1 ring-[#E5E7EB]">
                  <h3 className="text-[16.5px] font-bold text-night-900">{t(`processors.${s}.name`)}</h3>
                  <dl className="mt-2 space-y-1.5 text-[15px]">
                    {FIELDS.map((f) => (
                      <div key={f}>
                        <dt className="inline font-semibold text-night-900">{t(`processors.labels.${f}`)} </dt>
                        <dd className="inline">{f === 'safeguard' ? t('processors.scc') : t(`processors.${s}.${f}`)}</dd>
                      </div>
                    ))}
                  </dl>
                </li>
              ))}
            </ul>
            <p className="mt-4">
              {t.rich('processors.outro', { b: strong })}
            </p>
          </section>

          <section aria-labelledby="donnees-google">
            {h2('google.title', 'donnees-google')}
            {p('google.p1')}
            {p('google.p2')}
            <p className="mt-3">
              {t.rich('google.p3', {
                link: (c) => (
                  <a
                    href="https://developers.google.com/terms/api-services-user-data-policy"
                    className="font-semibold text-leaf-700 underline underline-offset-2"
                  >
                    {c}
                  </a>
                ),
              })}
            </p>
          </section>

          <section>
            {h2('security.title')}
            {p('security.p1')}
          </section>

          <section>
            {h2('retention.title')}
            {p('retention.p1')}
          </section>

          <section>
            {h2('rights.title')}
            {p('rights.p1')}
          </section>
        </div>
      </article>
    </div>
  );
}
