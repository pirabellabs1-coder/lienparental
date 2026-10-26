import React from 'react';
import { Document, Page, Text, View } from '@react-pdf/renderer';
import { colors, spacing, styles } from '../theme';
import { Footer, Header, Row, Section } from '../primitives';
import { formatDateFR, formatDateShortFR } from '../format';
import type { TemoignageCerfaProps } from '../schemas';

const DOC_TITLE = 'Témoignage — modèle Cerfa';

export function TemoignageCerfa(props: TemoignageCerfaProps) {
  const {
    reference,
    generatedAt,
    temoin,
    lienAvecParties,
    partiesConcernees,
    faitsConstates,
    lieu,
    date,
  } = props;

  return (
    <Document
      title={`Témoignage ${reference}`}
      author={`${temoin.prenom} ${temoin.nom}`}
      subject="Attestation de témoin (modèle Cerfa 11527*03)"
      creator="Lien Parental"
    >
      <Page size="A4" style={styles.page}>
        <Header title={DOC_TITLE} reference={reference} />

        <Text style={styles.coverEyebrow}>
          Attestation de témoin — article 202 du Code de procédure civile
        </Text>
        <Text style={styles.h1}>Témoignage écrit</Text>
        <Text style={styles.coverSub}>Référence unique : {reference}</Text>

        <Section title="Identité du témoin">
          <Row label="Nom et prénom" value={`${temoin.prenom} ${temoin.nom}`} />
          <Row
            label="Date et lieu de naissance"
            value={`${formatDateShortFR(temoin.dateNaissance)} à ${temoin.lieuNaissance}`}
          />
          <Row
            label="Adresse"
            value={`${temoin.adresse}, ${temoin.cp} ${temoin.ville}`}
          />
          {temoin.profession ? (
            <Row label="Profession" value={temoin.profession} />
          ) : null}
          {temoin.nationalite ? (
            <Row label="Nationalité" value={temoin.nationalite} />
          ) : null}
        </Section>

        <Section title="Lien avec les parties">
          <Text style={styles.p}>{lienAvecParties}</Text>
          {partiesConcernees.length > 0 ? (
            <View style={{ marginTop: spacing.sm }}>
              {partiesConcernees.map((p, i) => (
                <Text key={i} style={styles.small}>
                  — {p.prenom} {p.nom}
                  {p.role ? ` (${p.role})` : ''}
                </Text>
              ))}
            </View>
          ) : null}
        </Section>

        <Section title="Faits auxquels le témoin a assisté ou qu'il a personnellement constatés">
          <Text style={[styles.p, { lineHeight: 1.6, textAlign: 'justify' }]}>
            {faitsConstates}
          </Text>
        </Section>

        <View style={styles.legalNotice}>
          <Text style={{ fontWeight: 700, marginBottom: 4 }}>
            Mentions pénales
          </Text>
          <Text>
            Je sais que la présente attestation sera produite en justice et que
            je m'expose à des sanctions pénales en cas de fausse attestation
            (article 441-7 du Code pénal) ou de faux témoignage (article
            434-13 du Code pénal).
          </Text>
        </View>

        <View style={{ marginTop: spacing.lg }}>
          <Text>
            Fait à {lieu}, le {formatDateFR(date)}.
          </Text>
          <Text style={{ marginTop: spacing.sm, fontStyle: 'italic', color: colors.muted }}>
            La présente attestation doit être accompagnée d'une copie d'une
            pièce d'identité officielle du témoin.
          </Text>
        </View>

        <View style={[styles.signature, { marginTop: spacing.xl }]}>
          <Text style={{ fontWeight: 700 }}>
            {temoin.prenom} {temoin.nom}
          </Text>
          <Text style={styles.small}>
            (Signature manuscrite précédée de la mention « Lu et approuvé »)
          </Text>
        </View>

        <View
          style={{
            position: 'absolute',
            bottom: 48,
            left: 48,
            right: 48,
            textAlign: 'center',
          }}
          fixed
        >
          <Text style={[styles.small, { textAlign: 'center' }]}>
            Référence unique du témoignage : {reference}
          </Text>
        </View>

        <Footer reference={reference} generatedAt={generatedAt} />
      </Page>
    </Document>
  );
}

export default TemoignageCerfa;
