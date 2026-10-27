import { getTranslations } from 'next-intl/server'
import { Laptop, LockKeyhole, Mail, ShieldCheck, Trash2, FolderLock } from 'lucide-react'
import { Banner, BrandHeader, ListRow, PageTitle, SectionTitle } from '@/components/profil/kit'
import { SUPABASE_ENABLED } from '@/lib/supabase/config'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// Démonstration : valeur fictive. Supabase : sessions de l'utilisateur via RPC list_my_sessions (0200).
const DEMO_SESSIONS_COUNT = 2

async function sessionsCount(): Promise<number | null> {
  if (!SUPABASE_ENABLED) return DEMO_SESSIONS_COUNT
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('list_my_sessions')
  return error || !data ? null : data.length
}

export default async function SecuritePage() {
  const t = await getTranslations('account.security.home')
  const count = await sessionsCount()
  return (
    <>
      <BrandHeader bell={false} />
      <div className="px-5 pb-8 pt-3">
        <PageTitle title={t('title')} />

        <Banner tone="green" className="mt-5 py-5" icon={<ShieldCheck className="h-8 w-8" strokeWidth={1.8} />} title={t('protectedTitle')}>
          {t('protectedText')}
        </Banner>

        <section aria-labelledby="sec-compte" className="mt-7">
          <SectionTitle id="sec-compte">{t('accountSection')}</SectionTitle>
          <ul className="space-y-3">
            <li><ListRow standalone href="/app/profil/securite/mot-de-passe" icon={<LockKeyhole className="h-6 w-6" strokeWidth={1.7} />} title={t('password')} subtitle={t('passwordSub')} /></li>
            <li><ListRow standalone href="/app/profil/securite/2fa" icon={<ShieldCheck className="h-6 w-6" strokeWidth={1.7} />} title={t('twoFactor')} subtitle={t('twoFactorSub')} /></li>
            <li><ListRow standalone href="/app/profil/securite/coffre" icon={<FolderLock className="h-6 w-6" strokeWidth={1.7} />} title={t('vaultLock')} subtitle={t('vaultLockSub')} /></li>
            <li>
              <ListRow
                standalone
                href="/app/profil/securite/sessions"
                icon={<Laptop className="h-6 w-6" strokeWidth={1.7} />}
                title={<span className="flex items-center justify-between gap-2">{t('sessions')} {count !== null && <span className="text-[12.5px] font-bold text-leaf-600">{t('sessionsCount', { count })}</span>}</span>}
                subtitle={t('sessionsSub')}
                chevron={false}
              />
            </li>
            <li><ListRow standalone href="/app/profil/securite/emails" icon={<Mail className="h-6 w-6" strokeWidth={1.7} />} title={t('loginEmails')} subtitle={t('loginEmailsSub')} /></li>
          </ul>
        </section>

        <section aria-labelledby="sec-avancee" className="mt-7">
          <SectionTitle id="sec-avancee">{t('advanced')}</SectionTitle>
          <ListRow
            standalone
            tone="danger"
            href="/app/profil/securite/suppression"
            icon={<Trash2 className="h-6 w-6" strokeWidth={1.7} />}
            title={<span className="text-night-900">{t('deleteAccount')}</span>}
            subtitle={t('deleteAccountSub')}
          />
        </section>
      </div>
    </>
  )
}
