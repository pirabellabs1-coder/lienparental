/**
 * Modèles de départ (semences) : reprennent les « Documents prêts à l'emploi » historiques
 * (lib/mock-vault.ts, mêmes slugs) au format administrable. Servent au mode démonstration
 * et au script d'import SQL (scripts/seed-contenus-sql.ts).
 * Textes neutres, sans chiffre ni promesse : à relire par un professionnel avant publication réelle.
 */
import { documentTemplateSchema, type DocumentTemplate, type TemplateField } from './template'

const expediteurChamps: TemplateField[] = [
  { key: 'nom_complet', label: 'Votre prénom et nom', type: 'texte', obligatoire: true, aide: '', exemple: 'Julie Martin', options: [] },
  { key: 'adresse', label: 'Votre adresse', type: 'texte', obligatoire: true, aide: 'Numéro et rue', exemple: '12 rue des Palmistes', options: [] },
  { key: 'code_postal_ville', label: 'Code postal et ville', type: 'texte', obligatoire: true, aide: '', exemple: '97300 Cayenne', options: [] },
  { key: 'telephone', label: 'Téléphone', type: 'telephone', obligatoire: false, aide: '', exemple: '', options: [] },
  { key: 'email', label: 'Adresse e-mail', type: 'email', obligatoire: false, aide: '', exemple: '', options: [] },
]
const EXPEDITEUR = '{{nom_complet}}\n{{adresse}}\n{{code_postal_ville}}\n{{telephone}}\n{{email}}'

const champ = (key: string, label: string, type: TemplateField['type'] = 'texte', exemple = '', obligatoire = true, aide = ''): TemplateField =>
  ({ key, label, type, obligatoire, aide, exemple, options: [] })

const lieuDate = [champ('ville', 'Ville où vous signez', 'texte', 'Cayenne'), champ('date', 'Date du courrier', 'date')]

const raw: unknown[] = [
  {
    slug: 'courrier-jaf-residence-alternee',
    titre: 'Courrier au JAF : demande de résidence alternée',
    categorie: 'juridique',
    badge: 'Populaire',
    description: 'Formulez une demande de résidence alternée devant le juge aux affaires familiales.',
    champs: [
      ...expediteurChamps,
      champ('autre_parent', 'Prénom et nom de l’autre parent', 'texte', 'Marc Dupont'),
      champ('adresse_autre_parent', 'Adresse de l’autre parent', 'texte', '5 avenue Léopold Héder, 97300 Cayenne'),
      champ('prenom_enfant', 'Prénom de l’enfant', 'texte', 'Lina'),
      champ('date_naissance_enfant', 'Date de naissance de l’enfant', 'date'),
      champ('tribunal', 'Tribunal judiciaire', 'texte', 'Tribunal judiciaire de Cayenne'),
      ...lieuDate,
    ],
    corps: [
      'Madame, Monsieur le Juge,',
      'Nous soussignés, {{nom_complet}}, demeurant {{adresse}}, {{code_postal_ville}}, et {{autre_parent}}, demeurant {{adresse_autre_parent}}, parents de {{prenom_enfant}}, né(e) le {{date_naissance_enfant}}, sollicitons par la présente la mise en place d’une résidence alternée.',
      'Cette demande est motivée par notre volonté commune de préserver l’équilibre affectif de notre enfant et de maintenir des liens étroits et réguliers avec chacun de ses parents.',
      'Nos domiciles respectifs permettent d’assurer la continuité de la scolarité et des activités de {{prenom_enfant}}.',
      'Nous proposons une alternance hebdomadaire ainsi qu’un partage par moitié des vacances scolaires, selon le calendrier joint.',
      'Nous vous prions d’agréer, Madame, Monsieur le Juge, l’expression de notre haute considération.',
      '---',
      '## Proposition de calendrier',
      '- Semaines paires : résidence chez {{nom_complet}}\n- Semaines impaires : résidence chez {{autre_parent}}\n- Vacances scolaires : partage par moitié, alternance chaque année\n- Jours fériés : rattachés à la semaine en cours',
      '## Pièces jointes',
      '- Copie du livret de famille\n- Justificatif de domicile de moins de 3 mois\n- Certificat de scolarité de l’enfant',
    ].join('\n\n'),
    miseEnPage: {
      type: 'lettre', expediteur: EXPEDITEUR,
      destinataire: 'À l’attention du juge aux affaires familiales\n{{tribunal}}',
      lieuDate: '{{ville}}, le {{date}}',
      objet: 'Demande de résidence alternée de notre enfant {{prenom_enfant}}',
      signature: '{{nom_complet}}          {{autre_parent}}',
    },
  },
  {
    slug: 'lettre-organisation-visites',
    titre: 'Lettre à l’autre parent : organisation des visites',
    categorie: 'communication',
    badge: 'Populaire',
    description: 'Proposez une organisation claire et apaisée des visites et des transitions de l’enfant.',
    champs: [
      ...expediteurChamps,
      champ('autre_parent', 'Prénom de l’autre parent', 'texte', 'Marc'),
      champ('prenom_enfant', 'Prénom de l’enfant', 'texte', 'Lina'),
      champ('jour', 'Jour des transitions', 'choix', 'Vendredi', true),
      champ('heure', 'Heure des transitions', 'texte', '18 h'),
      champ('lieu', 'Lieu des transitions', 'texte', 'devant l’école'),
      ...lieuDate,
    ].map((f) => (f.key === 'jour' ? { ...f, options: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'] } : f)),
    corps: [
      '{{autre_parent}},',
      'Je souhaite que nous puissions convenir ensemble d’une organisation stable pour les visites de {{prenom_enfant}} dans les semaines à venir.',
      'Je te propose que les transitions aient lieu le {{jour}} à {{heure}}, {{lieu}}, afin de limiter les trajets et de rassurer {{prenom_enfant}}.',
      'Je reste disponible pour en discuter et ajuster ce calendrier si besoin, dans l’intérêt de notre enfant.',
      'Bien cordialement,',
    ].join('\n\n'),
    miseEnPage: { type: 'lettre', expediteur: EXPEDITEUR, destinataire: '{{autre_parent}}', lieuDate: '{{ville}}, le {{date}}', objet: 'Organisation des visites de {{prenom_enfant}}', signature: '{{nom_complet}}' },
  },
  {
    slug: 'attestation-hebergement',
    titre: 'Attestation d’hébergement',
    categorie: 'autre',
    badge: 'Nouveau',
    description: 'Attestez sur l’honneur que vous hébergez une personne à votre domicile.',
    champs: [
      ...expediteurChamps,
      champ('date_naissance', 'Votre date de naissance', 'date'),
      champ('lieu_naissance', 'Votre lieu de naissance', 'texte', 'Cayenne'),
      champ('personne_hebergee', 'Prénom et nom de la personne hébergée', 'texte', 'Lina Martin'),
      champ('date_debut', 'Hébergée depuis le', 'date'),
      ...lieuDate,
    ],
    corps: [
      '# Attestation sur l’honneur',
      'Je soussigné(e) {{nom_complet}}, né(e) le {{date_naissance}} à {{lieu_naissance}}, demeurant {{adresse}}, {{code_postal_ville}}, atteste sur l’honneur héberger à mon domicile {{personne_hebergee}} depuis le {{date_debut}}.',
      'Cette attestation est établie pour servir et valoir ce que de droit.',
    ].join('\n\n'),
    miseEnPage: { type: 'document', expediteur: EXPEDITEUR, lieuDate: 'Fait à {{ville}}, le {{date}}', signature: '{{nom_complet}}', piedDePage: 'Attestation sur l’honneur' },
  },
  {
    slug: 'levee-secret-medical',
    titre: 'Autorisation de transmission d’informations médicales',
    categorie: 'autre',
    description: 'Autorisez la transmission d’informations médicales concernant votre enfant à l’autre parent.',
    champs: [
      ...expediteurChamps,
      champ('medecin', 'Nom du médecin', 'texte', 'Dr Marchand'),
      champ('adresse_cabinet', 'Adresse du cabinet', 'texte', '3 rue Lallouette, 97300 Cayenne'),
      champ('autre_parent', 'Prénom et nom de l’autre parent', 'texte', 'Marc Dupont'),
      champ('prenom_enfant', 'Prénom de l’enfant', 'texte', 'Lina'),
      ...lieuDate,
    ],
    corps: [
      'Docteur,',
      'En ma qualité de parent titulaire de l’autorité parentale, je vous autorise à communiquer à {{autre_parent}} les informations relatives au suivi médical de {{prenom_enfant}}.',
      'Je vous prie d’agréer, Docteur, mes salutations distinguées.',
    ].join('\n\n'),
    miseEnPage: { type: 'lettre', expediteur: EXPEDITEUR, destinataire: '{{medecin}}\n{{adresse_cabinet}}', lieuDate: '{{ville}}, le {{date}}', objet: 'Accès aux informations médicales de {{prenom_enfant}}', signature: '{{nom_complet}}' },
  },
  {
    slug: 'demande-mediation-familiale',
    titre: 'Demande de médiation familiale',
    categorie: 'juridique',
    description: 'Sollicitez un service de médiation familiale pour renouer le dialogue autour de l’enfant.',
    champs: [
      ...expediteurChamps,
      champ('service', 'Service de médiation familiale', 'texte', 'Service de médiation familiale de Cayenne'),
      champ('adresse_service', 'Adresse du service', 'texte', '', false),
      champ('autre_parent', 'Prénom et nom de l’autre parent', 'texte', 'Marc Dupont'),
      ...lieuDate,
    ],
    corps: [
      'Madame, Monsieur,',
      'Je souhaite engager une démarche de médiation familiale avec {{autre_parent}} afin de trouver un accord durable concernant l’organisation de la vie de notre enfant.',
      'Je vous remercie de bien vouloir me proposer un premier entretien d’information.',
      'Veuillez agréer, Madame, Monsieur, mes salutations distinguées.',
    ].join('\n\n'),
    miseEnPage: { type: 'lettre', expediteur: EXPEDITEUR, destinataire: '{{service}}\n{{adresse_service}}', lieuDate: '{{ville}}, le {{date}}', objet: 'Demande de rendez-vous de médiation familiale', signature: '{{nom_complet}}' },
  },
  {
    slug: 'lettre-ecole',
    titre: 'Lettre à l’établissement scolaire',
    categorie: 'scolaire',
    description: 'Informez l’école de la situation parentale et demandez la transmission des informations aux deux parents.',
    champs: [
      ...expediteurChamps,
      champ('etablissement', 'Nom de l’établissement', 'texte', 'École élémentaire Jean Macé'),
      champ('prenom_enfant', 'Prénom et nom de l’enfant', 'texte', 'Lina Martin'),
      champ('classe', 'Classe', 'texte', 'CE2'),
      champ('coordonnees_autre_parent', 'Coordonnées de l’autre parent', 'texte_long', '', true, 'Nom, adresse, téléphone, e-mail'),
      ...lieuDate,
    ],
    corps: [
      'Madame, Monsieur,',
      'Je vous informe que les parents de {{prenom_enfant}}, scolarisé(e) en classe de {{classe}}, sont séparés et exercent conjointement l’autorité parentale.',
      'Je vous remercie de bien vouloir adresser l’ensemble des informations scolaires aux deux parents, à leurs adresses respectives.',
      'Je vous prie d’agréer, Madame, Monsieur, mes salutations distinguées.',
      '---',
      '## Coordonnées des parents',
      '- Parent 1 : {{nom_complet}}, {{adresse}}, {{code_postal_ville}}\n- Parent 2 : {{coordonnees_autre_parent}}',
    ].join('\n\n'),
    miseEnPage: { type: 'lettre', expediteur: EXPEDITEUR, destinataire: 'À l’attention de la direction\n{{etablissement}}', lieuDate: '{{ville}}, le {{date}}', objet: 'Transmission des informations scolaires de {{prenom_enfant}}', signature: '{{nom_complet}}' },
  },
  {
    slug: 'chronologie-faits',
    titre: 'Chronologie des faits',
    categorie: 'juridique',
    description: 'Reconstituez les faits datés et sourcés pour votre avocat ou le juge.',
    champs: [
      ...expediteurChamps,
      champ('avocat', 'Nom de votre avocat', 'texte', 'Maître Durand', false),
      champ('prenom_enfant', 'Prénom de l’enfant', 'texte', 'Lina'),
      champ('faits', 'Faits datés', 'texte_long', '', true, 'Une ligne par fait : date, description factuelle, source (pièce, témoin, message).'),
      ...lieuDate,
    ],
    corps: [
      '# Chronologie des faits concernant {{prenom_enfant}}',
      'Pièce à l’attention de {{avocat}}.',
      '{{faits}}',
      'Document établi le {{date}} par {{nom_complet}}.',
    ].join('\n\n'),
    miseEnPage: { type: 'document', expediteur: EXPEDITEUR, lieuDate: '{{ville}}, le {{date}}', signature: '{{nom_complet}}', piedDePage: 'Chronologie des faits' },
  },
]

export const SEED_TEMPLATES: DocumentTemplate[] = raw.map((t) => documentTemplateSchema.parse(t))
