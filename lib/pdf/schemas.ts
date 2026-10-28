/**
 * Zod schemas + inferred TypeScript types for every PDF template.
 * Shared between the templates and the API route so client payloads stay
 * strictly validated.
 */
import { z } from 'zod';

// Common fragments
export const parentSchema = z.object({
  prenom: z.string().min(1),
  nom: z.string().min(1),
  adresse: z.string().min(1),
  cp: z.string().min(1),
  ville: z.string().min(1),
  email: z.string().email(),
  tel: z.string().min(1),
});

export const enfantSchema = z.object({
  prenom: z.string().min(1),
  nom: z.string().optional(),
  dateNaissance: z.string().optional(), // ISO
  classe: z.string().optional(),
});

export const appEventSchema = z.object({
  id: z.string(),
  type: z.string(), // ex: "garde", "rdv", "message", "incident"
  date: z.string(), // ISO date
  heure: z.string().optional(),
  titre: z.string(),
  resume: z.string().optional(),
  lieu: z.string().optional(),
});
export type AppEvent = z.infer<typeof appEventSchema>;

export const documentJointSchema = z.object({
  nom: z.string(),
  type: z.string(), // "ordonnance", "mail", "sms"...
  date: z.string(), // ISO
  reference: z.string().optional(),
});

export const temoignageRefSchema = z.object({
  reference: z.string(), // TMG-YYYY-XXXX
  auteur: z.string(),
  lien: z.string(), // lien avec l'enfant/parent
  date: z.string(),
  extrait: z.string(),
});

// ---------- DossierJAF ----------
export const dossierJAFSchema = z.object({
  reference: z.string().min(1),
  generatedAt: z.string().min(1), // ISO
  parent: parentSchema,
  autreParent: z
    .object({ prenom: z.string(), nom: z.string() })
    .optional(),
  enfant: enfantSchema,
  evenements: z.array(appEventSchema).default([]),
  documents: z.array(documentJointSchema).default([]),
  temoignages: z.array(temoignageRefSchema).default([]),
  resume: z.string().optional(),
});
export type DossierJAFProps = z.infer<typeof dossierJAFSchema>;

// ---------- LettreEcole ----------
export const lettreEcoleSchema = z.object({
  reference: z.string().min(1),
  generatedAt: z.string().min(1),
  parent: parentSchema,
  ecole: z.object({
    nom: z.string().min(1),
    adresse: z.string().min(1),
  }),
  enfant: z.object({
    prenom: z.string().min(1),
    classe: z.string().min(1),
  }),
  objet: z.string().min(1),
  corps: z.string().min(1),
  lieu: z.string().min(1),
  date: z.string().min(1), // ISO ou format FR
});
export type LettreEcoleProps = z.infer<typeof lettreEcoleSchema>;

// ---------- Chronologie ----------
export const chronologieSchema = z.object({
  reference: z.string().min(1),
  generatedAt: z.string().min(1),
  parent: parentSchema,
  enfant: enfantSchema,
  periode: z.object({
    debut: z.string(), // ISO
    fin: z.string(), // ISO
  }),
  entries: z.array(appEventSchema).default([]),
});
export type ChronologieProps = z.infer<typeof chronologieSchema>;

// ---------- AttestationHebergement ----------
export const attestationHebergementSchema = z.object({
  reference: z.string().min(1),
  generatedAt: z.string().min(1),
  declarant: z.object({
    prenom: z.string().min(1),
    nom: z.string().min(1),
    dateNaissance: z.string().min(1),
    lieuNaissance: z.string().min(1),
    adresse: z.string().min(1),
    cp: z.string().min(1),
    ville: z.string().min(1),
    profession: z.string().optional(),
  }),
  heberge: z.object({
    prenom: z.string().min(1),
    nom: z.string().min(1),
    dateNaissance: z.string().min(1),
    lieuNaissance: z.string().optional(),
  }),
  adresseHebergement: z.object({
    rue: z.string().min(1),
    cp: z.string().min(1),
    ville: z.string().min(1),
  }),
  periode: z.object({
    debut: z.string().min(1),
    fin: z.string().optional(), // optionnel = en cours
  }),
  lieu: z.string().min(1),
  date: z.string().min(1),
});
export type AttestationHebergementProps = z.infer<
  typeof attestationHebergementSchema
>;

// ---------- TemoignageCerfa ----------
export const temoignageCerfaSchema = z.object({
  reference: z.string().min(1), // TMG-YYYY-XXXX
  generatedAt: z.string().min(1),
  temoin: z.object({
    prenom: z.string().min(1),
    nom: z.string().min(1),
    dateNaissance: z.string().min(1),
    lieuNaissance: z.string().min(1),
    adresse: z.string().min(1),
    cp: z.string().min(1),
    ville: z.string().min(1),
    profession: z.string().optional(),
    nationalite: z.string().optional(),
  }),
  lienAvecParties: z.string().min(1),
  partiesConcernees: z
    .array(
      z.object({
        prenom: z.string(),
        nom: z.string(),
        role: z.string().optional(),
      })
    )
    .default([]),
  faitsConstates: z.string().min(1),
  lieu: z.string().min(1),
  date: z.string().min(1),
  /** Signature tracée à l'écran par le témoin (PNG en data URL), facultative. */
  signature: z.string().max(400_000).regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/).optional(),
  /** Copie de la pièce d'identité du témoin reçue (jointe séparément au dossier). */
  pieceIdentiteJointe: z.boolean().optional(),
});
export type TemoignageCerfaProps = z.infer<typeof temoignageCerfaSchema>;

// Union pour la route API
export const templateMap = {
  'dossier-jaf': dossierJAFSchema,
  'lettre-ecole': lettreEcoleSchema,
  chronologie: chronologieSchema,
  'attestation-hebergement': attestationHebergementSchema,
  temoignage: temoignageCerfaSchema,
} as const;

export type TemplateKey = keyof typeof templateMap;
