import React from 'react';
import { Document, Page, Text, View } from '@react-pdf/renderer';
import { colors, spacing, styles } from '../theme';
import {
  Badge,
  Divider,
  Footer,
  Header,
  Row,
  Section,
} from '../primitives';
import { formatDateFR, formatDateShortFR } from '../format';
import type { DossierJAFProps } from '../schemas';

const DOC_TITLE = 'Dossier JAF';

export function DossierJAF(props: DossierJAFProps) {
  const {
    reference,
    generatedAt,
    parent,
    autreParent,
    enfant,
    evenements,
    documents,
    temoignages,
    resume,
  } = props;

  return (
    <Document
      title={`${DOC_TITLE} — ${enfant.prenom}`}
      author={`${parent.prenom} ${parent.nom}`}
      subject="Dossier parental à destination du JAF"
      creator="Lien Parental"
    >
      {/* Page 1 — Couverture + TOC */}
      <Page size="A4" style={styles.page}>
        <Header title={DOC_TITLE} reference={reference} />

        <View style={styles.cover}>
          <Text style={styles.coverEyebrow}>Dossier confidentiel</Text>
          <Text style={styles.coverTitle}>
            Dossier JAF — {enfant.prenom}
          </Text>
          <Text style={styles.coverSub}>
            Préparé par {parent.prenom} {parent.nom}
          </Text>

          <View style={styles.coverMeta}>
            <Row label="Référence" value={reference} />
            <Row
              label="Date de génération"
              value={formatDateFR(generatedAt)}
            />
            <Row
              label="Enfant concerné"
              value={`${enfant.prenom}${enfant.nom ? ' ' + enfant.nom : ''}${
                enfant.dateNaissance
                  ? ' — né·e le ' + formatDateShortFR(enfant.dateNaissance)
                  : ''
              }`}
            />
            {autreParent ? (
              <Row
                label="Autre parent"
                value={`${autreParent.prenom} ${autreParent.nom}`}
              />
            ) : null}
          </View>
        </View>

        <Section title="Sommaire">
          <View style={styles.tocItem}>
            <Text>1. Informations générales</Text>
            <Text style={styles.small}>p. 2</Text>
          </View>
          <View style={styles.tocItem}>
            <Text>2. Chronologie des événements</Text>
            <Text style={styles.small}>p. 3</Text>
          </View>
          <View style={styles.tocItem}>
            <Text>3. Documents joints</Text>
            <Text style={styles.small}>—</Text>
          </View>
          <View style={styles.tocItem}>
            <Text>4. Témoignages reçus</Text>
            <Text style={styles.small}>—</Text>
          </View>
          <View style={styles.tocItem}>
            <Text>5. Mentions légales</Text>
            <Text style={styles.small}>dernière page</Text>
          </View>
        </Section>

        {resume ? (
          <Section title="Résumé">
            <Text style={styles.p}>{resume}</Text>
          </Section>
        ) : null}

        <Footer reference={reference} generatedAt={generatedAt} />
      </Page>

      {/* Page 2 — Informations générales */}
      <Page size="A4" style={styles.page}>
        <Header title={DOC_TITLE} reference={reference} />

        <Section title="1. Informations générales">
          <Text style={styles.h3}>Parent demandeur</Text>
          <Row label="Nom complet" value={`${parent.prenom} ${parent.nom}`} />
          <Row label="Adresse" value={parent.adresse} />
          <Row label="Code postal · Ville" value={`${parent.cp} ${parent.ville}`} />
          <Row label="Téléphone" value={parent.tel} />
          <Row label="E-mail" value={parent.email} />

          <Divider />

          <Text style={styles.h3}>Enfant concerné</Text>
          <Row
            label="Nom complet"
            value={`${enfant.prenom}${enfant.nom ? ' ' + enfant.nom : ''}`}
          />
          <Row
            label="Date de naissance"
            value={formatDateShortFR(enfant.dateNaissance)}
          />
          {enfant.classe ? <Row label="Classe" value={enfant.classe} /> : null}

          {autreParent ? (
            <>
              <Divider />
              <Text style={styles.h3}>Autre parent</Text>
              <Row
                label="Nom complet"
                value={`${autreParent.prenom} ${autreParent.nom}`}
              />
            </>
          ) : null}
        </Section>

        <Footer reference={reference} generatedAt={generatedAt} />
      </Page>

      {/* Page 3+ — Chronologie, Documents, Témoignages */}
      <Page size="A4" style={styles.page}>
        <Header title={DOC_TITLE} reference={reference} />

        <Section title="2. Chronologie des événements">
          {evenements.length === 0 ? (
            <Text style={styles.small}>Aucun événement enregistré.</Text>
          ) : (
            evenements.map((e) => (
              <View key={e.id} style={styles.tlEntry} wrap={false}>
                <View style={styles.tlEntryHead}>
                  <Text style={styles.tlDate}>
                    {formatDateShortFR(e.date)}
                    {e.heure ? ` · ${e.heure}` : ''}
                  </Text>
                  <Badge tone="iris">{e.type}</Badge>
                </View>
                <Text style={styles.tlTitle}>{e.titre}</Text>
                {e.lieu ? (
                  <Text style={styles.small}>Lieu : {e.lieu}</Text>
                ) : null}
                {e.resume ? <Text style={styles.p}>{e.resume}</Text> : null}
              </View>
            ))
          )}
        </Section>

        <Section title="3. Documents joints">
          {documents.length === 0 ? (
            <Text style={styles.small}>Aucun document référencé.</Text>
          ) : (
            documents.map((d, i) => (
              <View key={`${d.nom}-${i}`} style={styles.row} wrap={false}>
                <Text style={styles.rowLabel}>
                  {formatDateShortFR(d.date)}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowValue}>{d.nom}</Text>
                  <Text style={styles.small}>
                    {d.type}
                    {d.reference ? ` · ${d.reference}` : ''}
                  </Text>
                </View>
              </View>
            ))
          )}
        </Section>

        <Section title="4. Témoignages reçus">
          {temoignages.length === 0 ? (
            <Text style={styles.small}>Aucun témoignage référencé.</Text>
          ) : (
            temoignages.map((t) => (
              <View
                key={t.reference}
                style={{
                  marginBottom: spacing.md,
                  paddingLeft: spacing.md,
                  borderLeftWidth: 2,
                  borderLeftColor: colors.gold,
                }}
                wrap={false}
              >
                <View style={styles.tlEntryHead}>
                  <Text style={styles.tlDate}>{t.reference}</Text>
                  <Text style={styles.small}>·</Text>
                  <Text style={styles.small}>{formatDateShortFR(t.date)}</Text>
                </View>
                <Text style={styles.tlTitle}>
                  {t.auteur}{' '}
                  <Text style={styles.small}>({t.lien})</Text>
                </Text>
                <Text style={styles.p}>« {t.extrait} »</Text>
              </View>
            ))
          )}
        </Section>

        <View break />

        <Section title="5. Mentions légales">
          <Text style={styles.p}>
            Ce dossier a été généré automatiquement par Lien Parental à partir
            des éléments saisis par le parent demandeur. Les données affichées
            n'engagent que leur auteur. Les documents, événements et
            témoignages référencés doivent être produits en original ou en
            copie certifiée conforme devant la juridiction compétente.
          </Text>
          <Text style={styles.p}>
            Référence unique du dossier : {reference}. Date de génération :{' '}
            {formatDateFR(generatedAt)}.
          </Text>
          <View style={styles.legalNotice}>
            <Text>
              Les attestations et témoignages joints sont soumis aux
              dispositions des articles 441-7 et 434-13 du Code pénal. L'auteur
              d'une fausse attestation ou d'un faux témoignage s'expose aux
              sanctions prévues par ces articles.
            </Text>
          </View>
        </Section>

        <Footer reference={reference} generatedAt={generatedAt} />
      </Page>
    </Document>
  );
}

export default DossierJAF;
