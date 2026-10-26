import React from 'react';
import { Document, Page, Text, View } from '@react-pdf/renderer';
import { styles } from '../theme';
import { Badge, Footer, Header, Row, Section } from '../primitives';
import { formatDateFR, formatDateShortFR, formatMonthFR, monthKey } from '../format';
import type { ChronologieProps, AppEvent } from '../schemas';

const DOC_TITLE = 'Chronologie';

function groupByMonth(entries: AppEvent[]): Array<{ key: string; label: string; items: AppEvent[] }> {
  const sorted = [...entries].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const groups = new Map<string, AppEvent[]>();
  for (const e of sorted) {
    const k = monthKey(e.date);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(e);
  }
  return [...groups.entries()].map(([key, items]) => ({
    key,
    label: formatMonthFR(items[0].date),
    items,
  }));
}

export function Chronologie(props: ChronologieProps) {
  const { reference, generatedAt, parent, enfant, periode, entries } = props;
  const groups = groupByMonth(entries);

  return (
    <Document
      title={`Chronologie — ${enfant.prenom}`}
      author={`${parent.prenom} ${parent.nom}`}
      creator="Lien Parental"
    >
      <Page size="A4" style={styles.page}>
        <Header title={DOC_TITLE} reference={reference} />

        <Text style={styles.coverEyebrow}>Journal des événements</Text>
        <Text style={styles.h1}>
          Chronologie — {enfant.prenom}
        </Text>
        <Text style={styles.coverSub}>
          Période du {formatDateFR(periode.debut)} au{' '}
          {formatDateFR(periode.fin)}
        </Text>

        <Section>
          <Row label="Parent" value={`${parent.prenom} ${parent.nom}`} />
          <Row
            label="Enfant"
            value={`${enfant.prenom}${enfant.nom ? ' ' + enfant.nom : ''}`}
          />
          <Row label="Total d'événements" value={String(entries.length)} />
        </Section>

        {groups.length === 0 ? (
          <Text style={styles.small}>
            Aucun événement sur la période sélectionnée.
          </Text>
        ) : (
          groups.map((g) => (
            <View key={g.key} wrap>
              <Text style={styles.timelineMonth}>{g.label}</Text>
              {g.items.map((e) => (
                <View key={e.id} style={styles.tlEntry} wrap={false}>
                  <View style={styles.tlEntryHead}>
                    <Text style={styles.tlDate}>
                      {formatDateShortFR(e.date)}
                      {e.heure ? ` · ${e.heure}` : ''}
                    </Text>
                    <Badge tone="leaf">{e.type}</Badge>
                  </View>
                  <Text style={styles.tlTitle}>{e.titre}</Text>
                  {e.lieu ? (
                    <Text style={styles.small}>Lieu : {e.lieu}</Text>
                  ) : null}
                  {e.resume ? <Text style={styles.p}>{e.resume}</Text> : null}
                </View>
              ))}
            </View>
          ))
        )}

        <Footer reference={reference} generatedAt={generatedAt} />
      </Page>
    </Document>
  );
}

export default Chronologie;
