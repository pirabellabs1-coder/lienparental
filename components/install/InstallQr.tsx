import QRCode from 'qrcode'
import { getTranslations } from 'next-intl/server'
import { AppIcon } from './AppIcon'

// QR code (SVG généré côté serveur) aux couleurs de la marque, avec une petite icône
// au centre (environ 5 % de la surface, bien en dessous de la marge de correction H de 30 %).
export async function InstallQr({ url, size = 168 }: { url: string; size?: number }) {
  const svg = await QRCode.toString(url, {
    type: 'svg',
    errorCorrectionLevel: 'H',
    margin: 0,
    color: { dark: '#0b2d5b', light: '#ffffff' },
  })
  const icon = Math.round(size * 0.22)
  const t = await getTranslations('public.install')
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <div
        role="img"
        aria-label={t('qrLabel')}
        className="h-full w-full [&>svg]:h-full [&>svg]:w-full"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[10px] bg-white p-1">
        <span className="block" style={{ width: icon, height: icon }}>
          <AppIcon className="block h-full w-full" />
        </span>
      </span>
    </div>
  )
}
