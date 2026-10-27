/**
 * Export PDF de la conversation (pièce pour le dossier), généré dans le navigateur.
 * Module importé dynamiquement au clic pour ne pas alourdir l'écran de conversation.
 */
import { Document, Page, Text, View, pdf } from '@react-pdf/renderer'
import { C, PdfFooter, PdfHeader, PdfRow, frDateTime, pdfSafe, s } from '@/components/dossier/pdfKit'
import { displayName, durationLabel, participantsLabel, type Message, type Participant } from '@/lib/messages'

export { downloadBlob } from '@/components/dossier/pdfKit'

/**
 * Textes du PDF (langue de l'utilisateur). Les appelants qui n'en fournissent pas
 * (ex. dossier JAF) obtiennent le rendu français d'origine, inchangé.
 */
export type ConversationPdfLabels = {
  noMessages: string
  dateTime: (iso: string) => string
  displayName: (p: Participant) => string
  participantsLabel: (list: Participant[]) => string
  otherParent: string
  voiceNote: (duration: string) => string
  attachment: (name: string) => string
  readOn: (date: string) => string
  docTitle: (me: string, others: string) => string
  header: string
  footer: (date: string) => string
  eyebrow: string
  titleWith: (names: string) => string
  topic: string
  participants: string
  count: string
  period: string
  periodValue: (from: string, to: string) => string
  generated: string
  notice: string
}

export const FR_PDF_LABELS: ConversationPdfLabels = {
  noMessages: 'Aucun message sur la période.',
  dateTime: frDateTime,
  displayName,
  participantsLabel,
  otherParent: 'Autre parent',
  voiceNote: (d) => `Note vocale (${d}), conservée dans l'application et le coffre-fort`,
  attachment: (n) => `Pièce jointe : ${n}`,
  readOn: (d) => `Lu le ${d}`,
  docTitle: (me, others) => `Conversation ${me} et ${others}`,
  header: 'Export de conversation',
  footer: (d) => `Lien Parental · conversation exportée le ${d}`,
  eyebrow: 'Messagerie entre parents',
  titleWith: (names) => `Conversation avec ${names}`,
  topic: 'Sujet',
  participants: 'Participants',
  count: 'Nombre de messages',
  period: 'Période',
  periodValue: (from, to) => `du ${from} au ${to}`,
  generated: 'Export généré le',
  notice: "Chaque message est horodaté par le serveur au moment de son envoi. Les messages ne peuvent être ni modifiés ni supprimés. Les pièces jointes sont listées par leur nom et conservées dans l'application.",
}

type ListProps = {
  me: Participant
  /** Autre parent (fil historique, dossier JAF). */
  other?: Participant
  /** Discussion à plusieurs : tous les autres participants. */
  participants?: Participant[]
  messages: Message[]
  /** Textes traduits (français par défaut). */
  labels?: ConversationPdfLabels
}

/** Liste des messages réutilisable (export seul ou section du dossier JAF). */
export function PdfMessageList({ me, other, participants = [], messages, labels: L = FR_PDF_LABELS }: ListProps) {
  if (messages.length === 0) return <Text style={s.small}>{L.noMessages}</Text>
  const nameOf = (id: string) => {
    if (id === me.id) return L.displayName(me)
    const p = participants.find((x) => x.id === id) ?? other
    return p ? L.displayName(p) : L.otherParent
  }
  return (
    <View>
      {messages.map((m) => {
        const mine = m.senderId === me.id
        return (
          <View key={m.id} style={[s.entry, { borderLeftColor: mine ? C.leaf : C.night }]} wrap={false}>
            <View style={s.entryHead}>
              <Text style={s.bold}>{pdfSafe(nameOf(m.senderId))}</Text>
              <Text style={s.small}>{L.dateTime(m.createdAt)}</Text>
            </View>
            {m.body ? <Text>{pdfSafe(m.body)}</Text> : null}
            {m.kind === 'audio'
              ? <Text style={s.small}>{L.voiceNote(durationLabel(m.audioDurationMs ?? 0))}</Text>
              : m.attachment ? <Text style={s.small}>{L.attachment(pdfSafe(m.attachment.name))}</Text> : null}
            {m.readAt ? <Text style={s.small}>{L.readOn(L.dateTime(m.readAt))}</Text> : null}
          </View>
        )
      })}
    </View>
  )
}

type DocProps = {
  me: Participant
  participants: Participant[]
  title: string | null
  messages: Message[]
  generatedAt: string
  labels?: ConversationPdfLabels
}

function ConversationDoc({ me, participants, title, messages, generatedAt, labels: L = FR_PDF_LABELS }: DocProps) {
  const first = messages[0]?.createdAt
  const last = messages[messages.length - 1]?.createdAt
  const others = participants.map(L.displayName).join(', ') || L.otherParent
  return (
    <Document title={L.docTitle(L.displayName(me), others)} author={L.displayName(me)} creator="Lien Parental">
      <Page size="A4" style={s.page}>
        <PdfHeader title={L.header} />
        <PdfFooter label={L.footer(L.dateTime(generatedAt))} />
        <Text style={s.eyebrow}>{L.eyebrow}</Text>
        <Text style={s.h1}>{title ? pdfSafe(title) : L.titleWith(pdfSafe(L.participantsLabel(participants)))}</Text>
        <View style={s.card}>
          {title ? <PdfRow label={L.topic} value={pdfSafe(title)} /> : null}
          <PdfRow label={L.participants} value={`${pdfSafe(L.displayName(me))}, ${pdfSafe(others)}`} />
          <PdfRow label={L.count} value={String(messages.length)} />
          {first && last ? <PdfRow label={L.period} value={L.periodValue(L.dateTime(first), L.dateTime(last))} /> : null}
          <PdfRow label={L.generated} value={L.dateTime(generatedAt)} />
        </View>
        <PdfMessageList me={me} participants={participants} messages={messages} labels={L} />
        <Text style={s.notice}>{L.notice}</Text>
      </Page>
    </Document>
  )
}

export async function renderConversationPdf(props: Omit<DocProps, 'generatedAt'>): Promise<Blob> {
  return pdf(<ConversationDoc {...props} generatedAt={new Date().toISOString()} />).toBlob()
}
