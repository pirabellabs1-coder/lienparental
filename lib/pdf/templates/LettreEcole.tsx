import React from 'react';
import { Document, Page, Text, View } from '@react-pdf/renderer';
import { spacing, styles } from '../theme';
import { Footer, Header } from '../primitives';
import { formatDateFR } from '../format';
import type { LettreEcoleProps } from '../schemas';

const DOC_TITLE = 'Lettre à l’école';

export function LettreEcole(props: LettreEcoleProps) {
  const {
    reference,
    generatedAt,
    parent,
    ecole,
    enfant,
    objet,
    corps,
    lieu,
    date,
  } = props;

  // Split corps on blank-lines so paragraphs are preserved
  const paragraphs = corps
    .split(/\n{2,}/g)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <Document
      title={`Lettre école — ${enfant.prenom}`}
      author={`${parent.prenom} ${parent.nom}`}
      subject={objet}
      creator="Lien Parental"
    >
      <Page size="A4" style={styles.page}>
        <Header title={DOC_TITLE} reference={reference} />

        {/* En-tête parent (haut gauche) */}
        <View style={styles.letterAddress}>
          <Text style={{ fontWeight: 700 }}>
            {parent.prenom} {parent.nom}
          </Text>
          <Text>{parent.adresse}</Text>
          <Text>
            {parent.cp} {parent.ville}
          </Text>
          <Text>{parent.tel}</Text>
          <Text>{parent.email}</Text>
        </View>

        {/* Destinataire (haut droite) */}
        <View style={[styles.letterAddress, styles.letterRight]}>
          <Text style={{ fontWeight: 700 }}>{ecole.nom}</Text>
          <Text>{ecole.adresse}</Text>
        </View>

        {/* Lieu et date */}
        <View style={[styles.letterRight, { marginBottom: spacing.lg }]}>
          <Text>
            {lieu}, le {formatDateFR(date)}
          </Text>
        </View>

        {/* Objet */}
        <Text style={styles.letterObjet}>
          Objet : {objet}
        </Text>
        <Text style={{ marginBottom: spacing.md }}>
          Concernant : {enfant.prenom} — classe de {enfant.classe}
        </Text>

        {/* Formule d'appel */}
        <Text style={{ marginBottom: spacing.md }}>
          Madame, Monsieur,
        </Text>

        {/* Corps éditable */}
        {paragraphs.map((p, i) => (
          <Text key={i} style={styles.letterCorps}>
            {p}
          </Text>
        ))}

        {/* Formule de politesse */}
        <Text style={{ marginTop: spacing.md }}>
          Je vous prie d'agréer, Madame, Monsieur, l'expression de mes
          salutations distinguées.
        </Text>

        {/* Signature */}
        <View style={styles.signature}>
          <Text>{parent.prenom} {parent.nom}</Text>
          <Text style={styles.small}>Signature</Text>
        </View>

        <Footer reference={reference} generatedAt={generatedAt} />
      </Page>
    </Document>
  );
}

export default LettreEcole;
