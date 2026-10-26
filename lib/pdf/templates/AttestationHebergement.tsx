import React from 'react';
import { Document, Page, Text, View } from '@react-pdf/renderer';
import { spacing, styles } from '../theme';
import { Footer, Header, Row, Section } from '../primitives';
import { formatDateFR, formatDateShortFR } from '../format';
import type { AttestationHebergementProps } from '../schemas';

const DOC_TITLE = 'Attestation d’hébergement';

export function AttestationHebergement(props: AttestationHebergementProps) {
  const {
    reference,
    generatedAt,
    declarant,
    heberge,
    adresseHebergement,
    periode,
    lieu,
    date,
  } = props;

  const periodeTxt = periode.fin
    ? `du ${formatDateShortFR(periode.debut)} au ${formatDateShortFR(periode.fin)}`
    : `depuis le ${formatDateShortFR(periode.debut)} (hébergement en cours)`;

  return (
    <Document
      title={`${DOC_TITLE} — ${heberge.prenom} ${heberge.nom}`}
      author={`${declarant.prenom} ${declarant.nom}`}
      creator="Lien Parental"
    >
      <Page size="A4" style={styles.page}>
        <Header title={DOC_TITLE} reference={reference} />

        <Text style={styles.coverEyebrow}>Attestation sur l'honneur</Text>
        <Text style={styles.h1}>Attestation d'hébergement</Text>

        <Section title="Identité du déclarant">
          <Row
            label="Nom et prénom"
            value={`${declarant.prenom} ${declarant.nom}`}
          />
          <Row
            label="Date et lieu de naissance"
            value={`${formatDateShortFR(declarant.dateNaissance)} à ${declarant.lieuNaissance}`}
          />
          <Row
            label="Adresse"
            value={`${declarant.adresse}, ${declarant.cp} ${declarant.ville}`}
          />
          {declarant.profession ? (
            <Row label="Profession" value={declarant.profession} />
          ) : null}
        </Section>

        <Section title="Personne hébergée">
          <Row
            label="Nom et prénom"
            value={`${heberge.prenom} ${heberge.nom}`}
          />
          <Row
            label="Date de naissance"
            value={
              heberge.lieuNaissance
                ? `${formatDateShortFR(heberge.dateNaissance)} à ${heberge.lieuNaissance}`
                : formatDateShortFR(heberge.dateNaissance)
            }
          />
        </Section>

        <Section title="Déclaration">
          <Text style={[styles.p, { lineHeight: 1.6, textAlign: 'justify' }]}>
            Je soussigné(e) {declarant.prenom} {declarant.nom}, demeurant{' '}
            {declarant.adresse}, {declarant.cp} {declarant.ville}, atteste sur
            l'honneur héberger à mon domicile {heberge.prenom} {heberge.nom},
            né(e) le {formatDateShortFR(heberge.dateNaissance)}, à l'adresse
            suivante : {adresseHebergement.rue}, {adresseHebergement.cp}{' '}
            {adresseHebergement.ville}, {periodeTxt}.
          </Text>
          <Text style={[styles.p, { lineHeight: 1.6, textAlign: 'justify' }]}>
            Je m'engage à signaler toute modification de cette situation et
            certifie exacts les renseignements portés sur la présente
            attestation.
          </Text>
        </Section>

        <View style={styles.legalNotice}>
          <Text style={{ fontWeight: 700, marginBottom: 4 }}>
            Mention légale
          </Text>
          <Text>
            L'auteur d'une fausse attestation s'expose aux sanctions prévues
            par l'article 441-7 du Code pénal.
          </Text>
        </View>

        <View style={{ marginTop: spacing.xl }}>
          <Text>
            Fait à {lieu}, le {formatDateFR(date)}.
          </Text>
        </View>

        <View style={[styles.signature, { marginTop: spacing.xl }]}>
          <Text style={{ fontWeight: 700 }}>
            {declarant.prenom} {declarant.nom}
          </Text>
          <Text style={styles.small}>
            (Signature précédée de la mention « Lu et approuvé »)
          </Text>
        </View>

        <Footer reference={reference} generatedAt={generatedAt} />
      </Page>
    </Document>
  );
}

export default AttestationHebergement;
