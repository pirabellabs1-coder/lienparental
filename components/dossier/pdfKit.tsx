/**
 * Briques PDF côté navigateur (@react-pdf/renderer), chargées dynamiquement à l'export.
 *
 * Charte (guide d'identité visuelle) : Montserrat pour le texte, Allura pour la signature
 * « Parental », bleu marine #0B2D5B et vert lien #4CAF50. Les polices sont auto-hébergées
 * dans /public/fonts (même origine : compatible avec la CSP connect-src 'self').
 */
import type { ReactNode } from 'react'
import { Font, StyleSheet, Text, View } from '@react-pdf/renderer'
import { dayKeyInTz, fmtDayKey, timeInTz } from '@/lib/tz'

const fontUrl = (file: string) => `${typeof window !== 'undefined' ? window.location.origin : ''}/fonts/${file}`

Font.register({
  family: 'Montserrat',
  fonts: [
    { src: fontUrl('montserrat-400.ttf'), fontWeight: 400 },
    { src: fontUrl('montserrat-600.ttf'), fontWeight: 600 },
    { src: fontUrl('montserrat-700.ttf'), fontWeight: 700 },
    { src: fontUrl('montserrat-800.ttf'), fontWeight: 800 },
  ],
})
Font.register({ family: 'Allura', src: fontUrl('allura-400.ttf') })
// Pas de césure automatique : les mots français restent entiers.
Font.registerHyphenationCallback((word) => [word])

export const C = {
  night: '#0b2d5b',
  leaf: '#2e7d32',
  leafBrand: '#4caf50',
  leafSoft: '#edf7ee',
  iris: '#4a35c9',
  gold: '#a2670c',
  ink: '#16233a',
  muted: '#5b6275',
  line: '#e5e7eb',
  surface: '#f4f6f9',
} as const

export const s = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 60, paddingHorizontal: 48, fontSize: 10, lineHeight: 1.5, color: C.ink, fontFamily: 'Montserrat' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: C.line },
  brand: { fontFamily: 'Montserrat', fontWeight: 800, fontSize: 18, lineHeight: 1, color: C.night, letterSpacing: -0.4 },
  brandScript: { fontFamily: 'Allura', fontSize: 28, lineHeight: 1, color: C.leafBrand, marginTop: -4, marginLeft: 2 },
  brandSub: { fontSize: 6.5, lineHeight: 1.3, color: C.night, fontWeight: 600, letterSpacing: 1.2, marginTop: 6 },
  brandSub2: { fontSize: 6.5, lineHeight: 1.3, color: C.leaf, fontWeight: 600, letterSpacing: 1.2 },
  headRight: { fontSize: 8, color: C.muted, textAlign: 'right' },
  eyebrow: { fontSize: 8, color: C.leaf, fontFamily: 'Montserrat', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  h1: { fontFamily: 'Montserrat', fontWeight: 700, fontSize: 22, lineHeight: 1.25, color: C.night, marginBottom: 8 },
  h2: { fontFamily: 'Montserrat', fontWeight: 700, fontSize: 13, color: C.night, marginBottom: 10, marginTop: 4 },
  h3: { fontFamily: 'Montserrat', fontWeight: 700, fontSize: 10.5, color: C.night, marginBottom: 4, marginTop: 6 },
  p: { marginBottom: 6 },
  small: { fontSize: 8.5, color: C.muted },
  bold: { fontFamily: 'Montserrat', fontWeight: 700 },
  section: { marginBottom: 18 },
  row: { flexDirection: 'row', paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: C.line },
  rowLabel: { width: 140, color: C.muted, fontSize: 9 },
  rowValue: { flex: 1 },
  card: { backgroundColor: C.surface, borderRadius: 6, padding: 12, marginBottom: 12 },
  entry: { marginBottom: 9, paddingLeft: 9, borderLeftWidth: 2, borderLeftColor: C.line },
  entryHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  tag: { fontSize: 7.5, color: C.iris, fontFamily: 'Montserrat', fontWeight: 700, textTransform: 'uppercase' },
  notice: { marginTop: 10, padding: 10, borderRadius: 6, backgroundColor: C.leafSoft, fontSize: 8.5, color: C.ink },
  footer: { position: 'absolute', bottom: 26, left: 48, right: 48, fontSize: 7.5, color: C.muted, flexDirection: 'row', justifyContent: 'space-between' },
})

export function PdfHeader({ title, reference }: { title: string; reference?: string }) {
  return (
    <View style={s.head} fixed>
      <View>
        <Text style={s.brand}>Lien</Text>
        <Text style={s.brandScript}>Parental</Text>
        <Text style={s.brandSub}>INFORMER • ACCOMPAGNER • PRÉSERVER</Text>
        <Text style={s.brandSub2}>LE LIEN PARENT-ENFANT</Text>
      </View>
      <View>
        <Text style={s.headRight}>{title}</Text>
        {reference ? <Text style={s.headRight}>Réf. {reference}</Text> : null}
      </View>
    </View>
  )
}

export function PdfFooter({ label }: { label: string }) {
  return (
    <View style={s.footer} fixed>
      <Text>{label}</Text>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
    </View>
  )
}

export function PdfSection({ title, children, breakBefore }: { title: string; children: ReactNode; breakBefore?: boolean }) {
  return (
    <View style={s.section} break={breakBefore}>
      <Text style={s.h2}>{title}</Text>
      {children}
    </View>
  )
}

export function PdfRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.row} wrap={false}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue}>{value}</Text>
    </View>
  )
}

export function PdfEmpty({ children }: { children: string }) {
  return <Text style={s.small}>{children}</Text>
}

/** Retire les caractères (emoji…) absents du sous-ensemble latin de Montserrat. */
export function pdfSafe(text: string): string {
  return text.replace(/[^\u0000-\u024F\u2013-\u201E\u2022\u2026\u20AC]/g, '')
}

const NUMERIC_DAY = { day: '2-digit', month: '2-digit', year: 'numeric' } as const

/** Instant → « 25/10/2026 14:30 » dans DEFAULT_TZ. */
export function frDateTime(iso: string): string {
  return `${fmtDayKey(dayKeyInTz(iso), NUMERIC_DAY)} ${timeInTz(iso)}`
}

/** Jour seul ("yyyy-mm-dd") ou instant (jour DEFAULT_TZ) → « 25/10/2026 ». */
export function frDay(iso: string): string {
  return fmtDayKey(dayKeyInTz(iso), NUMERIC_DAY)
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
