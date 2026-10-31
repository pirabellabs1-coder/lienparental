// Écrans de lancement iOS (apple-touch-startup-image) : fond bleu nuit de la marque + logo clair centré.
// Sans eux, l'iPhone affiche un écran blanc ou noir à l'ouverture de l'appli installée (retour bêta-test).
// Usage : node scripts/generate-splash.mjs  →  public/splash/*.png (déclarés dans app/layout.tsx).
import { mkdir, readFile } from 'node:fs/promises'
import sharp from 'sharp'
import { SPLASH_SCREENS, SPLASH_BACKGROUND } from '../lib/pwa/splash.mjs'

const logo = await readFile(new URL('../public/brand/logo-baseline-clair.svg', import.meta.url))
await mkdir(new URL('../public/splash/', import.meta.url), { recursive: true })

for (const s of SPLASH_SCREENS) {
  const width = s.w * s.ratio
  const height = s.h * s.ratio
  const logoWidth = Math.round(width * 0.46)
  const mark = await sharp(logo, { density: 600 }).resize({ width: logoWidth }).png().toBuffer()
  await sharp({ create: { width, height, channels: 4, background: SPLASH_BACKGROUND } })
    .composite([{ input: mark, gravity: 'center' }])
    .png({ compressionLevel: 9, palette: true })
    .toFile(new URL(`../public/splash/${s.file}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
  console.log('✓', s.file, `${width}×${height}`)
}
