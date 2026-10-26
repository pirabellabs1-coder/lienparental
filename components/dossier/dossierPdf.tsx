/**
 * Dossier JAF généré dans le navigateur (repli quand POST /api/pdf/dossier-jaf
 * n'est pas disponible, par exemple en démonstration sans session Supabase).
 * Même structure que lib/pdf/templates/DossierJAF.tsx, enrichie des sections
 * calendrier, dépenses/pension (Journal) et messages. Importé dynamiquement au clic.
 */
import { Document, Page, Text, View, pdf } from '@react-pdf/renderer'
import { journalTypeLabels } from '@/lib/mock-data'
import { getEventType } from '@/lib/calendrier'
import { DEPENSE_CATEGORIE_LABELS, allJustificatifs, formatTotals, modeLabel } from '@/lib/journal-finances'
import { displayName } from '@/lib/messages'
import { PdfMessageList } from '@/components/messages/conversationPdf'
import { C, PdfEmpty, PdfFooter, PdfHeader, PdfRow, PdfSection, frDateTime, frDay, pdfSafe, s } from './pdfKit'
import { SECTION_META, SECTION_ORDER, expenseAmount, expenseParties, type DossierExpense, type DossierModel, type ExpenseGroup } from './compose'

export { downloadBlob } from './pdfKit'

/** Montant fr-FR pour la police PDF : espace fine insécable (U+202F, absente de la police) → espace insécable. */
const pdfMoney = (text: string) => pdfSafe(text.replace(/\u202f/g, '\u00a0'))

/** Une opération : date, libellé, sens et payeur, montant réglé (et reste dû). */
function ExpenseLine({ e }: { e: DossierExpense }) {
  const d = e.depense
  const { regle, detail } = expenseAmount(d)
  const n = allJustificatifs(d).length
  return (
    <View style={s.row} wrap={false}>
      <Text style={[s.rowLabel, { width: 70 }]}>{frDay(e.date)}</Text>
      <View style={s.rowValue}>
        <Text>{pdfSafe(e.title)} · {DEPENSE_CATEGORIE_LABELS[d.categorie]}</Text>
        <Text style={s.small}>{pdfSafe(expenseParties(d))}</Text>
        <Text style={s.small}>{pdfSafe(modeLabel(d))}{n ? (n > 1 ? ` · ${n} justificatifs` : ' · justificatif joint') : ' · sans justificatif'}</Text>
      </View>
      <View style={{ width: 96 }}>
        <Text style={{ textAlign: 'right' }}>{pdfMoney(regle)}</Text>
        {detail ? <Text style={[s.small, { textAlign: 'right' }]}>{pdfMoney(detail)}</Text> : null}
      </View>
    </View>
  )
}

/** Liste + total calculé sur les lignes affichées (montant réglé), avec mention du reste dû. */
function ExpenseList({ g, totalLabel, empty }: { g: ExpenseGroup; totalLabel: string; empty: string }) {
  if (g.items.length === 0) return <PdfEmpty>{empty}</PdfEmpty>
  return (
    <>
      {g.items.map((e) => <ExpenseLine key={e.id} e={e} />)}
      <PdfRow label={`${totalLabel} (${g.items.length})`} value={pdfMoney(formatTotals(g.totals))} />
      {g.reste.length ? <PdfRow label="Reste dû sur ces lignes" value={pdfMoney(formatTotals(g.reste))} /> : null}
    </>
  )
}

function DossierDoc({ m }: { m: DossierModel }) {
  const included = SECTION_ORDER.filter((k) => m.sections[k])
  const num = (k: (typeof SECTION_ORDER)[number]) => included.indexOf(k) + 1
  const parentName = pdfSafe(displayName(m.profile))
  const other = m.otherParent ? pdfSafe(displayName(m.otherParent)) : null
  const footer = `Lien Parental · ${m.reference} · généré le ${frDateTime(m.generatedAt)}`

  return (
    <Document title={`Dossier JAF - ${m.child.prenom}`} author={parentName} subject="Dossier parental à destination du JAF" creator="Lien Parental">
      <Page size="A4" style={s.page}>
        <PdfHeader title="Dossier JAF" reference={m.reference} />
        <PdfFooter label={footer} />
        <View style={{ marginTop: 40, marginBottom: 28 }}>
          <Text style={s.eyebrow}>Dossier confidentiel</Text>
          <Text style={[s.h1, { fontSize: 28, marginBottom: 10 }]}>Dossier JAF : {pdfSafe(m.child.prenom)}</Text>
          <Text style={{ fontSize: 12, color: C.muted }}>Préparé par {parentName}</Text>
        </View>
        <View style={s.card}>
          <PdfRow label="Référence" value={m.reference} />
          <PdfRow label="Date de génération" value={frDateTime(m.generatedAt)} />
          <PdfRow label="Période couverte" value={`du ${frDay(m.period.from)} au ${frDay(m.period.to)}`} />
          <PdfRow label="Enfant concerné" value={`${pdfSafe(m.child.prenom)}${m.child.dateNaissance ? `, né(e) le ${frDay(m.child.dateNaissance)}` : ''}`} />
          {other ? <PdfRow label="Autre parent" value={other} /> : null}
        </View>
        <Text style={s.h2}>Sommaire</Text>
        {included.map((k) => (
          <View key={k} style={s.row}>
            <Text style={s.rowValue}>{num(k)}. {SECTION_META[k].label}</Text>
          </View>
        ))}
        <View style={s.row}>
          <Text style={s.rowValue}>{included.length + 1}. Mentions</Text>
        </View>
      </Page>

      <Page size="A4" style={s.page}>
        <PdfHeader title="Dossier JAF" reference={m.reference} />
        <PdfFooter label={footer} />

        {m.sections.infos && (
          <PdfSection title={`${num('infos')}. Informations`}>
            <Text style={s.h3}>Parent demandeur</Text>
            <PdfRow label="Nom complet" value={parentName || 'Non renseigné'} />
            <PdfRow label="E-mail" value={pdfSafe(m.profile.email) || 'Non renseigné'} />
            <Text style={s.h3}>Enfant concerné</Text>
            <PdfRow label="Prénom" value={pdfSafe(m.child.prenom)} />
            <PdfRow label="Date de naissance" value={m.child.dateNaissance ? frDay(m.child.dateNaissance) : 'Non renseignée'} />
            {m.child.classe ? <PdfRow label="Classe" value={pdfSafe(m.child.classe)} /> : null}
            {other ? (
              <>
                <Text style={s.h3}>Autre parent</Text>
                <PdfRow label="Nom complet" value={other} />
              </>
            ) : null}
          </PdfSection>
        )}

        {m.sections.journal && (
          <PdfSection title={`${num('journal')}. ${SECTION_META.journal.label}`}>
            {m.journal.length === 0 ? <PdfEmpty>Aucun événement sur la période.</PdfEmpty> : m.journal.map((e) => (
              <View key={e.id} style={s.entry} wrap={false}>
                <View style={s.entryHead}>
                  <Text style={s.small}>{frDay(e.date)}{e.heure ? ` · ${e.heure}` : ''}</Text>
                  <Text style={s.tag}>{journalTypeLabels[e.type] ?? 'Journal'}</Text>
                </View>
                <Text style={s.bold}>{pdfSafe(e.title)}</Text>
                {e.lieu ? <Text style={s.small}>Lieu : {pdfSafe(e.lieu)}</Text> : null}
                {e.description ? <Text>{pdfSafe(e.description)}</Text> : null}
                {e.createdAt ? <Text style={s.small}>Saisi le {frDateTime(e.createdAt)}</Text> : null}
              </View>
            ))}
          </PdfSection>
        )}

        {m.sections.calendrier && (
          <PdfSection title={`${num('calendrier')}. ${SECTION_META.calendrier.label}`}>
            {m.events.length === 0 ? <PdfEmpty>Aucun rendez-vous sur la période.</PdfEmpty> : m.events.map((e) => (
              <View key={e.id} style={s.entry} wrap={false}>
                <View style={s.entryHead}>
                  <Text style={s.small}>{frDateTime(e.start)}</Text>
                  <Text style={s.tag}>{getEventType(e.type).label}</Text>
                </View>
                <Text style={s.bold}>{pdfSafe(e.title)}</Text>
                {e.location ? <Text style={s.small}>Lieu : {pdfSafe(e.location)}</Text> : null}
                {e.description ? <Text>{pdfSafe(e.description)}</Text> : null}
              </View>
            ))}
          </PdfSection>
        )}

        {m.sections.documents && (
          <PdfSection title={`${num('documents')}. ${SECTION_META.documents.label}`}>
            {m.documents.length === 0 ? <PdfEmpty>Aucun document sélectionné.</PdfEmpty> : m.documents.map((d) => (
              <View key={d.id} style={s.row} wrap={false}>
                <Text style={s.rowLabel}>{frDay(d.docDate)}</Text>
                <View style={s.rowValue}>
                  <Text>{pdfSafe(d.name)}</Text>
                  <Text style={s.small}>{d.ext}{d.source ? ` · ${pdfSafe(d.source)}` : ''}</Text>
                </View>
              </View>
            ))}
            <Text style={[s.small, { marginTop: 6 }]}>Les pièces sont conservées dans le coffre-fort et produites séparément.</Text>
          </PdfSection>
        )}

        {m.sections.temoignages && (
          <PdfSection title={`${num('temoignages')}. ${SECTION_META.temoignages.label}`}>
            {m.testimonies.length === 0 ? <PdfEmpty>Aucun témoignage reçu.</PdfEmpty> : m.testimonies.map((t) => (
              <View key={t.id} style={[s.entry, { borderLeftColor: C.gold }]} wrap={false}>
                <View style={s.entryHead}>
                  <Text style={s.bold}>{pdfSafe(t.author)}{t.relation ? ` (${pdfSafe(t.relation)})` : ''}</Text>
                  <Text style={s.small}>{t.reference} · {frDay(t.date)}</Text>
                </View>
                <Text>{pdfSafe(t.summary)}</Text>
                {t.facts.map((f, i) => <Text key={i} style={s.small}>• {pdfSafe(f)}</Text>)}
              </View>
            ))}
          </PdfSection>
        )}

        {m.sections.frais && (
          <PdfSection title={`${num('frais')}. ${SECTION_META.frais.label}`}>
            <Text style={s.h3}>Dépenses réglées par {parentName || 'le parent'}</Text>
            <ExpenseList g={m.expenseSummary.depenses} totalLabel="Total réglé" empty="Aucune dépense réglée sur la période." />
            {m.expenseSummary.pensionVersee.length ? (
              <PdfRow label="Dont pension / contribution versée" value={pdfMoney(formatTotals(m.expenseSummary.pensionVersee))} />
            ) : null}
            {m.expenseSummary.byCategory.length > 0 && (
              <>
                <Text style={s.h3}>Dépenses réglées, par catégorie</Text>
                {m.expenseSummary.byCategory.map((c) => (
                  <PdfRow key={c.categorie} label={`${c.label} (${c.count})`} value={pdfMoney(formatTotals(c.totals))} />
                ))}
              </>
            )}

            <Text style={s.h3}>Sommes reçues</Text>
            <ExpenseList g={m.expenseSummary.recues} totalLabel="Total reçu" empty="Aucune somme reçue sur la période." />
            {m.expenseSummary.pensionRecue.length ? (
              <PdfRow label="Dont pension / contribution reçue" value={pdfMoney(formatTotals(m.expenseSummary.pensionRecue))} />
            ) : null}

            <Text style={s.h3}>Opérations réglées par l&apos;autre parent ou un tiers</Text>
            <ExpenseList g={m.expenseSummary.tiers} totalLabel="Total réglé par d'autres" empty="Aucune opération réglée par l'autre parent ou un tiers sur la période." />
            {m.expenseSummary.tiers.items.length ? (
              <Text style={s.small}>Ces opérations sont listées pour l&apos;historique : elles ne sont pas comptées dans les dépenses du parent.</Text>
            ) : null}

            <Text style={[s.small, { marginTop: 6 }]}>
              Montants déclarés par le parent, comptés pour la part effectivement réglée : Lien Parental ne certifie pas qu&apos;un paiement a réellement été effectué. Chaque opération figure dans une seule liste. Les devises ne sont pas converties entre elles.
            </Text>
          </PdfSection>
        )}

        {m.sections.messages && (
          <PdfSection title={`${num('messages')}. ${SECTION_META.messages.label}`}>
            {m.me && m.otherParent ? (
              <PdfMessageList me={m.me} other={m.otherParent} messages={m.messages} />
            ) : (
              <PdfEmpty>Aucune conversation avec l&apos;autre parent.</PdfEmpty>
            )}
          </PdfSection>
        )}

        <PdfSection title={`${included.length + 1}. Mentions`}>
          <Text style={s.p}>
            Ce dossier a été généré par Lien Parental à partir des éléments saisis par le parent demandeur. Les entrées du
            journal et les messages sont horodatés à leur création et ne peuvent pas être modifiés a posteriori.
          </Text>
          <Text style={s.notice}>
            Les attestations et témoignages sont soumis aux articles 441-7 et 434-13 du Code pénal. Les pièces référencées
            doivent être produites en original ou en copie devant la juridiction compétente.
          </Text>
        </PdfSection>

      </Page>
    </Document>
  )
}

export async function renderDossierPdf(model: DossierModel): Promise<Blob> {
  return pdf(<DossierDoc m={model} />).toBlob()
}
