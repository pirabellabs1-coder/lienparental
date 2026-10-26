import { TopBar } from '@/components/mobile/TopBar'
import { AideHome } from '@/components/aide/AideHome'
import { getHelpFaq } from '@/lib/aide/public'

// Revalidé aussi à la publication depuis le back-office (lib/contenus/api.ts → revalidateFor).
export const revalidate = 300

export default async function AidePage() {
  const faq = (await getHelpFaq()).map(f => ({ slug: f.slug, question: f.question }))
  return (
    <>
      <TopBar title="Centre d’aide" showBack backHref="/app/profil" showBell={false} />
      <AideHome faq={faq} />
    </>
  )
}
