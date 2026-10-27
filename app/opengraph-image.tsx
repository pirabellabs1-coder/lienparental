import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'
import { getTranslations } from 'next-intl/server'
import { SITE } from '@/lib/seo/site'

// Image de partage par défaut (Open Graph / Twitter), 1200×630. Polices et logo lus dans public/ :
// aucun appel réseau. Police absente : repli sur la police intégrée de next/og.
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'Lien Parental'

const read = (...parts: string[]) => readFile(join(process.cwd(), 'public', ...parts)).catch(() => null)

export default async function OpengraphImage() {
  const t = await getTranslations('seo')
  const [logo, bold, regular] = await Promise.all([read('brand', 'logo.svg'), read('fonts', 'montserrat-800.ttf'), read('fonts', 'montserrat-400.ttf')])
  const fonts = [
    ...(bold ? [{ name: 'Montserrat', data: bold, weight: 800 as const, style: 'normal' as const }] : []),
    ...(regular ? [{ name: 'Montserrat', data: regular, weight: 400 as const, style: 'normal' as const }] : []),
  ]
  const host = new URL(SITE).host

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: '#ffffff', padding: '64px 80px', fontFamily: fonts.length ? 'Montserrat' : undefined }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- rendu next/og (pas de next/image)
            <img src={`data:image/svg+xml;base64,${logo.toString('base64')}`} width={264} height={160} alt="" />
          ) : (
            <span style={{ fontSize: 56, fontWeight: 800, color: '#0b2d5b' }}>Lien Parental</span>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ width: 96, height: 8, borderRadius: 4, background: '#3f9a43', marginBottom: 28 }} />
          <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.02em', color: '#0b2d5b' }}>{t('ogTagline')}</div>
          <div style={{ marginTop: 20, fontSize: 30, fontWeight: 400, lineHeight: 1.35, color: '#334155', maxWidth: 980 }}>{t('ogSub')}</div>
        </div>
        <div style={{ display: 'flex', fontSize: 26, fontWeight: 800, color: '#3f9a43' }}>{host}</div>
      </div>
    ),
    { ...size, fonts },
  )
}
