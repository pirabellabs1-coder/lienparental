/**
 * Export PDF de la conversation (pièce pour le dossier), généré dans le navigateur.
 * Module importé dynamiquement au clic pour ne pas alourdir l'écran de conversation.
 */
import { Document, Page, Text, View, pdf } from '@react-pdf/renderer'
import { C, PdfFooter, PdfHeader, PdfRow, frDateTime, pdfSafe, s } from '@/components/dossier/pdfKit'
import { displayName, durationLabel, participantsLabel, type Message, type Participant } from '@/lib/messages'

export { downloadBlob } from '@/components/dossier/pdfKit'

type ListProps = {
  me: Participant
  /** Autre parent (fil historique, dossier JAF). */
  other?: Participant
  /** Discussion à plusieurs : tous les autres participants. */
  participants?: Participant[]
  messages: Message[]
}

/** Liste des messages réutilisable (export seul ou section du dossier JAF). */
export function PdfMessageList({ me, other, participants = [], messages }: ListProps) {
  if (messages.length === 0) return <Text style={s.small}>Aucun message sur la période.</Text>
  const nameOf = (id: string) => {
    if (id === me.id) return displayName(me)
    const p = participants.find((x) => x.id === id) ?? other
    return p ? displayName(p) : 'Autre parent'
  }
  return (
    <View>
      {messages.map((m) => {
        const mine = m.senderId === me.id
        return (
          <View key={m.id} style={[s.entry, { borderLeftColor: mine ? C.leaf : C.night }]} wrap={false}>
            <View style={s.entryHead}>
              <Text style={s.bold}>{pdfSafe(nameOf(m.senderId))}</Text>
              <Text style={s.small}>{frDateTime(m.createdAt)}</Text>
            </View>
            {m.body ? <Text>{pdfSafe(m.body)}</Text> : null}
            {m.kind === 'audio'
              ? <Text style={s.small}>Note vocale ({durationLabel(m.audioDurationMs ?? 0)}), conservée dans l&apos;application et le coffre-fort</Text>
              : m.attachment ? <Text style={s.small}>Pièce jointe : {pdfSafe(m.attachment.name)}</Text> : null}
            {m.readAt ? <Text style={s.small}>Lu le {frDateTime(m.readAt)}</Text> : null}
          </View>
        )
      })}
    </View>
  )
}

type DocProps = { me: Participant; participants: Participant[]; title: string | null; messages: Message[]; generatedAt: string }

function ConversationDoc({ me, participants, title, messages, generatedAt }: DocProps) {
  const first = messages[0]?.createdAt
  const last = messages[messages.length - 1]?.createdAt
  const others = participants.map(displayName).join(', ') || 'Autre parent'
  return (
    <Document title={`Conversation ${displayName(me)} et ${others}`} author={displayName(me)} creator="Lien Parental">
      <Page size="A4" style={s.page}>
        <PdfHeader title="Export de conversation" />
        <PdfFooter label={`Lien Parental · conversation exportée le ${frDateTime(generatedAt)}`} />
        <Text style={s.eyebrow}>Messagerie entre parents</Text>
        <Text style={s.h1}>{title ? pdfSafe(title) : `Conversation avec ${pdfSafe(participantsLabel(participants))}`}</Text>
        <View style={s.card}>
          {title ? <PdfRow label="Sujet" value={pdfSafe(title)} /> : null}
          <PdfRow label="Participants" value={`${pdfSafe(displayName(me))}, ${pdfSafe(others)}`} />
          <PdfRow label="Nombre de messages" value={String(messages.length)} />
          {first && last ? <PdfRow label="Période" value={`du ${frDateTime(first)} au ${frDateTime(last)}`} /> : null}
          <PdfRow label="Export généré le" value={frDateTime(generatedAt)} />
        </View>
        <PdfMessageList me={me} participants={participants} messages={messages} />
        <Text style={s.notice}>
          Chaque message est horodaté par le serveur au moment de son envoi. Les messages ne peuvent être ni
          modifiés ni supprimés. Les pièces jointes sont listées par leur nom et conservées dans l&apos;application.
        </Text>
      </Page>
    </Document>
  )
}

export async function renderConversationPdf(props: Omit<DocProps, 'generatedAt'>): Promise<Blob> {
  return pdf(<ConversationDoc {...props} generatedAt={new Date().toISOString()} />).toBlob()
}
