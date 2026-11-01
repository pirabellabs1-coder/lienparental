/**
 * Génération des documents à partir d'un modèle administrable (navigateur).
 * Importé dynamiquement (au clic) : @react-pdf/renderer n'alourdit pas le bundle initial.
 * Les valeurs saisies sont rendues comme du texte (react-pdf n'interprète aucun balisage) ;
 * l'export Word échappe tout le HTML.
 */
import { Document, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer'
import {
  LAYOUT_MARGINS, LAYOUT_SIZES, interpolate, lines, parseTemplateBody,
  type DocumentTemplate, type InterpolateMode, type TemplateValues,
} from './template'
import { saveBlob } from '@/lib/download'

export type TemplateExportFormat = 'pdf' | 'word'

const NAVY = '#0b2d5b'
const GREEN = '#2e7d32'
const FONTS = {
  helvetica: { regular: 'Helvetica', bold: 'Helvetica-Bold', italic: 'Helvetica-Oblique' },
  times: { regular: 'Times-Roman', bold: 'Times-Bold', italic: 'Times-Italic' },
} as const

function TemplatePdf({ t, values, mode }: { t: DocumentTemplate; values: TemplateValues; mode: InterpolateMode }) {
  const L = t.miseEnPage
  const F = FONTS[L.police]
  const size = LAYOUT_SIZES[L.taille]
  const margin = LAYOUT_MARGINS[L.marges]
  const I = (s: string) => interpolate(s, t.champs, values, mode)
  const s = StyleSheet.create({
    page: { paddingTop: margin - 6, paddingBottom: margin + 10, paddingHorizontal: margin, fontSize: size, lineHeight: 1.55, color: '#1c2333', fontFamily: F.regular },
    head: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 26 },
    brandLien: { fontFamily: 'Helvetica-Bold', fontSize: 18, color: NAVY },
    brandParental: { fontFamily: 'Helvetica-Oblique', fontSize: 12, color: GREEN, marginTop: -4 },
    sender: { textAlign: 'right', fontSize: size - 1.5, color: '#5b6275' },
    recipient: { marginLeft: 200, marginBottom: 14 },
    right: { textAlign: 'right', marginBottom: 16 },
    objet: { marginBottom: 16 },
    bold: { fontFamily: F.bold },
    p: { marginBottom: 9, textAlign: 'justify' },
    h1: { fontFamily: F.bold, fontSize: size + 4, color: NAVY, marginBottom: 14, textAlign: 'center' },
    h2: { fontFamily: F.bold, fontSize: size + 2, color: NAVY, marginTop: 4, marginBottom: 10 },
    li: { marginBottom: 5, paddingLeft: 10 },
    signature: { marginTop: 22, marginLeft: 260 },
    footer: { position: 'absolute', bottom: margin / 2, left: margin, right: margin, fontSize: 8, color: '#8a90a2', textAlign: 'center' },
  })
  const pages = parseTemplateBody(t.corps)
  const footerText = I(L.piedDePage) || t.titre
  const footer = <Text style={s.footer} render={({ pageNumber, totalPages }) => `${footerText} · Lien Parental · ${pageNumber} / ${totalPages}`} fixed />
  const expediteur = lines(I(L.expediteur))
  const destinataire = lines(I(L.destinataire))

  return (
    <Document title={t.titre} author="Lien Parental" subject={t.description} creator="Lien Parental">
      {pages.map((blocks, pi) => (
        <Page key={pi} size="A4" style={s.page}>
          {pi === 0 && (L.logo || expediteur.length > 0) && (
            <View style={s.head}>
              <View>
                {L.logo && (
                  <>
                    <Text style={s.brandLien}>Lien</Text>
                    <Text style={s.brandParental}>Parental</Text>
                  </>
                )}
              </View>
              <View>{expediteur.map((x, i) => <Text key={i} style={s.sender}>{x}</Text>)}</View>
            </View>
          )}
          {pi === 0 && L.type === 'lettre' && (
            <>
              {destinataire.length > 0 && <View style={s.recipient}>{destinataire.map((x, i) => <Text key={i}>{x}</Text>)}</View>}
              {L.lieuDate && <Text style={s.right}>{I(L.lieuDate)}</Text>}
              {L.objet && <Text style={s.objet}><Text style={s.bold}>Objet : </Text>{I(L.objet)}</Text>}
            </>
          )}
          {blocks.map((b, i) => {
            if (b.type === 'h1') return <Text key={i} style={s.h1}>{I(b.text)}</Text>
            if (b.type === 'h2') return <Text key={i} style={s.h2}>{I(b.text)}</Text>
            if (b.type === 'ul') return <View key={i} style={{ marginBottom: 8 }}>{b.items.map((it, j) => <Text key={j} style={s.li}>•  {I(it)}</Text>)}</View>
            return <Text key={i} style={s.p}>{I(b.text)}</Text>
          })}
          {pi === 0 && (
            <View wrap={false}>
              {L.type === 'document' && L.lieuDate && <Text style={{ marginTop: 18 }}>{I(L.lieuDate)}</Text>}
              {L.signature && <Text style={s.signature}>{I(L.signature)}</Text>}
            </View>
          )}
          {footer}
        </Page>
      ))}
    </Document>
  )
}

const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Document Word (HTML compatible Word, extension .doc), modifiable sans dépendance. */
function wordHtml(t: DocumentTemplate, values: TemplateValues, mode: InterpolateMode) {
  const L = t.miseEnPage
  const I = (s: string) => esc(interpolate(s, t.champs, values, mode))
  const font = L.police === 'times' ? "'Times New Roman',serif" : 'Calibri,Arial,sans-serif'
  const pages = parseTemplateBody(t.corps).map((blocks) => blocks.map((b) => {
    if (b.type === 'h1') return `<h1>${I(b.text)}</h1>`
    if (b.type === 'h2') return `<h2>${I(b.text)}</h2>`
    if (b.type === 'ul') return `<ul>${b.items.map((it) => `<li>${I(it)}</li>`).join('')}</ul>`
    return `<p>${I(b.text).replace(/\n/g, '<br/>')}</p>`
  }).join(''))
  const sender = lines(interpolate(L.expediteur, t.champs, values, mode)).map(esc).join('<br/>')
  const recipient = lines(interpolate(L.destinataire, t.champs, values, mode)).map(esc).join('<br/>')
  const head = [
    sender ? `<p class="r">${sender}</p>` : '',
    L.type === 'lettre' && recipient ? `<p style="margin-left:7cm">${recipient}</p>` : '',
    L.type === 'lettre' && L.lieuDate ? `<p class="r">${I(L.lieuDate)}</p>` : '',
    L.type === 'lettre' && L.objet ? `<p><b>Objet :</b> ${I(L.objet)}</p>` : '',
  ].join('')
  const tail = `${L.type === 'document' && L.lieuDate ? `<p>${I(L.lieuDate)}</p>` : ''}${L.signature ? `<p style="margin-left:9cm">${I(L.signature)}</p>` : ''}`
  const body = pages.map((p, i) => (i === 0 ? `${head}${p}${tail}` : `<br style="page-break-before:always"/>${p}`)).join('')
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${esc(t.titre)}</title>
<style>body{font-family:${font};font-size:11pt;color:#1c2333}h1{color:#0b2d5b;text-align:center;font-size:16pt}h2{color:#0b2d5b;font-size:13pt}.r{text-align:right}</style></head><body>${body}</body></html>`
}

function fileBase(title: string) {
  return title.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'document'
}

export async function buildTemplateFile(
  t: DocumentTemplate,
  values: TemplateValues,
  format: TemplateExportFormat,
  mode: InterpolateMode = 'final',
): Promise<{ blob: Blob; filename: string }> {
  const base = fileBase(t.titre)
  if (format === 'word') return { blob: new Blob(['﻿', wordHtml(t, values, mode)], { type: 'application/msword' }), filename: `${base}.doc` }
  const blob = await pdf(<TemplatePdf t={t} values={values} mode={mode} />).toBlob()
  return { blob, filename: `${base}.pdf` }
}

/** Déclenche le téléchargement d'un Blob. */
export function downloadBlob(blob: Blob, filename: string) {
  saveBlob(blob, filename)
}
