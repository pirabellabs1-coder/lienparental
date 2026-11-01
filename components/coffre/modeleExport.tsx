/**
 * Génération côté navigateur des fichiers « modèles prêts à l'emploi ».
 * Ce module est importé dynamiquement (au clic sur un format) pour ne pas
 * alourdir le bundle initial : @react-pdf/renderer n'est chargé qu'à l'export.
 */
import { Document, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer'
import type { Modele } from '@/lib/mock-vault'
import { saveBlob } from '@/lib/download'

export type ExportFormat = 'pdf' | 'word' | 'canva'

const NAVY = '#0b2d5b'
const GREEN = '#2e7d32'

const s = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 56, paddingHorizontal: 54, fontSize: 10.5, lineHeight: 1.55, color: '#1c2333', fontFamily: 'Helvetica' },
  head: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 28 },
  brandLien: { fontFamily: 'Helvetica-Bold', fontSize: 20, color: NAVY },
  brandParental: { fontFamily: 'Helvetica-Oblique', fontSize: 13, color: GREEN, marginTop: -4 },
  sender: { textAlign: 'right', fontSize: 9, color: '#5b6275' },
  recipient: { marginLeft: 180, marginBottom: 14, fontSize: 10 },
  date: { textAlign: 'right', marginBottom: 18 },
  objet: { marginBottom: 16 },
  bold: { fontFamily: 'Helvetica-Bold' },
  p: { marginBottom: 9, textAlign: 'justify' },
  h2: { fontFamily: 'Helvetica-Bold', fontSize: 13, color: NAVY, marginBottom: 12 },
  li: { marginBottom: 6 },
  footer: { position: 'absolute', bottom: 26, left: 54, right: 54, fontSize: 8, color: '#8a90a2', textAlign: 'center' },
})

function ModelePdf({ m }: { m: Modele }) {
  const L = m.letter
  const footer = (
    <Text style={s.footer} render={({ pageNumber, totalPages }) => `${m.title} — Lien Parental — ${pageNumber} / ${totalPages}`} fixed />
  )
  return (
    <Document title={m.title} author="Lien Parental" subject={m.description}>
      <Page size="A4" style={s.page}>
        <View style={s.head}>
          <View>
            <Text style={s.brandLien}>Lien</Text>
            <Text style={s.brandParental}>Parental</Text>
          </View>
          <View>
            {['Prénom Nom', 'Adresse', 'Code postal - Ville', 'Téléphone', 'Email'].map((x) => (
              <Text key={x} style={s.sender}>{x}</Text>
            ))}
          </View>
        </View>
        <View style={s.recipient}>{L.recipient.map((x) => <Text key={x}>{x}</Text>)}</View>
        <Text style={s.date}>[Ville], le [Date]</Text>
        <Text style={s.objet}><Text style={s.bold}>Objet : </Text>{L.objet}</Text>
        {L.salutation ? <Text style={s.p}>{L.salutation}</Text> : null}
        {L.paragraphs.map((p, i) => <Text key={i} style={s.p}>{p}</Text>)}
        <Text style={[s.p, { marginTop: 6 }]}>{L.closing}</Text>
        {footer}
      </Page>
      {m.annexes.map((a) => (
        <Page key={a.title} size="A4" style={s.page}>
          <Text style={s.h2}>{a.title}</Text>
          {a.lines.map((l) => <Text key={l} style={s.li}>•  {l}</Text>)}
          {footer}
        </Page>
      ))}
    </Document>
  )
}

const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Document Word (HTML compatible Word, extension .doc) — modifiable sans dépendance. */
function wordHtml(m: Modele) {
  const L = m.letter
  const annexes = m.annexes.map((a) => `<br style="page-break-before:always"/><h2>${esc(a.title)}</h2><ul>${a.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`).join('')
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${esc(m.title)}</title>
<style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#1c2333}h2{color:#0b2d5b}.r{text-align:right}</style></head><body>
<p class="r">Prénom Nom<br/>Adresse<br/>Code postal - Ville<br/>Téléphone<br/>Email</p>
<p style="margin-left:7cm">${L.recipient.map(esc).join('<br/>')}</p>
<p class="r">[Ville], le [Date]</p>
<p><b>Objet :</b> ${esc(L.objet)}</p>
${L.salutation ? `<p>${esc(L.salutation)}</p>` : ''}
${L.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}
<p>${esc(L.closing)}</p>${annexes}</body></html>`
}

function slugFile(title: string) {
  return title.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export function exportFilename(m: Modele, format: ExportFormat) {
  return format === 'word' ? `${m.title}.doc` : format === 'canva' ? `${m.title} (Canva).pdf` : `${m.title}.pdf`
}

export async function buildModeleFile(m: Modele, format: ExportFormat): Promise<{ blob: Blob; filename: string }> {
  const base = slugFile(m.title)
  if (format === 'word') {
    return { blob: new Blob(['﻿', wordHtml(m)], { type: 'application/msword' }), filename: `${base}.doc` }
  }
  // PDF (et Canva : Canva importe directement les PDF).
  const blob = await pdf(<ModelePdf m={m} />).toBlob()
  return { blob, filename: format === 'canva' ? `${base}-canva.pdf` : `${base}.pdf` }
}

/** Déclenche le téléchargement d'un Blob (« Enregistrer dans Fichiers » sur mobile). */
export function downloadBlob(blob: Blob, filename: string) {
  saveBlob(blob, filename)
}
