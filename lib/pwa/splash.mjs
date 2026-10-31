// Écrans de lancement iOS : tailles CSS des iPhone en portrait (points) et densité d'écran.
// Partagé par scripts/generate-splash.mjs (génération des PNG) et app/layout.tsx (balises <link>).
export const SPLASH_BACKGROUND = '#0b2d5b'

export const SPLASH_SCREENS = [
  { w: 440, h: 956, ratio: 3, file: 'splash-1320x2868.png' }, // 16 Pro Max
  { w: 402, h: 874, ratio: 3, file: 'splash-1206x2622.png' }, // 16 Pro
  { w: 430, h: 932, ratio: 3, file: 'splash-1290x2796.png' }, // 14 Pro Max, 15 Plus / Pro Max, 16 Plus
  { w: 393, h: 852, ratio: 3, file: 'splash-1179x2556.png' }, // 14 Pro, 15, 15 Pro, 16
  { w: 428, h: 926, ratio: 3, file: 'splash-1284x2778.png' }, // 12 / 13 Pro Max, 14 Plus
  { w: 390, h: 844, ratio: 3, file: 'splash-1170x2532.png' }, // 12, 13, 14
  { w: 375, h: 812, ratio: 3, file: 'splash-1125x2436.png' }, // X, XS, 11 Pro, 12 / 13 mini
  { w: 414, h: 896, ratio: 3, file: 'splash-1242x2688.png' }, // XS Max, 11 Pro Max
  { w: 414, h: 896, ratio: 2, file: 'splash-828x1792.png' }, // XR, 11
  { w: 375, h: 667, ratio: 2, file: 'splash-750x1334.png' }, // SE 2e / 3e génération, 8
]

/** Media query de l'écran (portrait). */
export function splashMedia(s) {
  return `(device-width: ${s.w}px) and (device-height: ${s.h}px) and (-webkit-device-pixel-ratio: ${s.ratio}) and (orientation: portrait)`
}
