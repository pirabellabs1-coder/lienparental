/**
 * Attestation de témoin pré-remplie (PDF, en français pour le tribunal), générée dans le
 * navigateur du témoin — aucun envoi réseau. Importé dynamiquement au clic.
 * Reprend les éléments de l'article 202 du Code de procédure civile ; un cadre est laissé
 * pour la mention « Lu et approuvé » et la signature manuscrites si le tribunal les exige.
 */
import { Document, Image, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer'
import { pdfSafe } from '@/components/dossier/pdfKit'

const NAVY = '#0b2d5b'

const s = StyleSheet.create({
  page: { paddingTop: 44, paddingBottom: 56, paddingHorizontal: 50, fontSize: 10.5, lineHeight: 1.5, color: '#1c2333', fontFamily: 'Helvetica' },
  title: { fontFamily: 'Helvetica-Bold', fontSize: 15, color: NAVY, marginBottom: 2 },
  sub: { fontSize: 9, color: '#5b6275', marginBottom: 18 },
  p: { marginBottom: 6, textAlign: 'justify' },
  box: { borderWidth: 1, borderColor: '#c9cedb', borderRadius: 4, padding: 10, marginTop: 14 },
  boxTitle: { fontFamily: 'Helvetica-Bold', fontSize: 9.5, marginBottom: 6 },
  sig: { width: 210, height: 70, objectFit: 'contain' },
  footer: { position: 'absolute', bottom: 24, left: 50, right: 50, fontSize: 8, color: '#8a90a2', textAlign: 'center' },
})

export type AttestationPdfInput = {
  /** Texte complet de l'attestation en français (compileAttestation(…, 'fr')). */
  text: string
  /** Signature tracée à l'écran (data URL JPEG), si disponible. */
  signature: string | null
  reference?: string
}

function AttestationDoc({ text, signature, reference }: AttestationPdfInput) {
  return (
    <Document title="Attestation de témoin" creator="Lien Parental" subject="Attestation (article 202 du Code de procédure civile)">
      <Page size="A4" style={s.page}>
        <Text style={s.title}>Attestation de témoin</Text>
        <Text style={s.sub}>Article 202 du Code de procédure civile — modèle conforme au formulaire Cerfa n° 11527*03{reference ? ` — réf. ${reference}` : ''}</Text>
        {pdfSafe(text).split('\n').map((line, i) => (
          <Text key={i} style={s.p}>{line || ' '}</Text>
        ))}
        <View style={s.box} wrap={false}>
          <Text style={s.boxTitle}>Signature tracée à l’écran</Text>
          {signature ? <Image src={signature} style={s.sig} /> : <Text>—</Text>}
        </View>
        <View style={s.box} wrap={false}>
          <Text style={s.boxTitle}>Si le tribunal l’exige : mention « Lu et approuvé », date et signature manuscrites</Text>
          <View style={{ height: 70 }} />
        </View>
        <Text style={s.footer} fixed>
          Joindre la copie d’une pièce d’identité officielle du témoin comportant sa signature. Généré avec Lien Parental.
        </Text>
      </Page>
    </Document>
  )
}

export async function renderAttestationPdf(input: AttestationPdfInput): Promise<Blob> {
  return pdf(<AttestationDoc {...input} />).toBlob()
}

export { downloadBlob } from '@/components/dossier/pdfKit'
