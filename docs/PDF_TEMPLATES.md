# Templates PDF — Lien Parental

Les PDF sont générés par l'API Next.js :

```
POST /api/pdf/[template]
Content-Type: application/json
Body : { "data": { ... } }
```

Templates disponibles : `dossier-jaf`, `lettre-ecole`, `chronologie`,
`attestation-hebergement`, `temoignage`. Toute autre valeur renvoie `400`.
La validation est faite par Zod (`lib/pdf/schemas.ts`).

Chaque PDF inclut :

- en-tête : marque **Lien Parental**, titre du document, référence ;
- pied de page : `Lien Parental` à gauche, `Document généré par Lien Parental · <référence> · page X/Y` au centre, date de génération ISO à droite ;
- polices : Inter + Fraunces (Google Fonts, remplaçables par des TTF locaux pour un rendu hors-ligne).

---

## 1. `dossier-jaf`

Dossier à destination du Juge aux Affaires Familiales.

**Variables** : `reference`, `generatedAt` (ISO), `parent`, `autreParent?`, `enfant`, `evenements[]`, `documents[]`, `temoignages[]`, `resume?`.

**Exemple de payload** :

```json
{
  "data": {
    "reference": "DJF-2026-00042",
    "generatedAt": "2026-10-25T10:00:00.000Z",
    "parent": {
      "prenom": "Camille", "nom": "Durand",
      "adresse": "12 rue des Lilas", "cp": "75011", "ville": "Paris",
      "email": "camille.durand@example.fr", "tel": "06 12 34 56 78"
    },
    "autreParent": { "prenom": "Alex", "nom": "Martin" },
    "enfant": { "prenom": "Lou", "nom": "Durand", "dateNaissance": "2017-04-18", "classe": "CE2" },
    "evenements": [
      { "id": "e1", "type": "garde", "date": "2026-09-05", "heure": "18:00",
        "titre": "Retour tardif", "resume": "Enfant rendu avec 2h de retard.", "lieu": "Domicile" }
    ],
    "documents": [
      { "nom": "Ordonnance JAF 2025", "type": "ordonnance", "date": "2025-11-02", "reference": "ORD-2025-9981" }
    ],
    "temoignages": [
      { "reference": "TMG-2026-0007", "auteur": "Sophie Albert", "lien": "voisine",
        "date": "2026-09-10", "extrait": "J'ai constaté le retour de l'enfant à 20h07." }
    ],
    "resume": "Dossier préparé en vue de l'audience du 12 décembre 2026."
  }
}
```

## 2. `lettre-ecole`

Lettre type sur papier A4 pour l'école.

**Variables** : `reference`, `generatedAt`, `parent`, `ecole {nom, adresse}`, `enfant {prenom, classe}`, `objet`, `corps`, `lieu`, `date`.

```json
{
  "data": {
    "reference": "LET-2026-00018",
    "generatedAt": "2026-10-25T10:00:00.000Z",
    "parent": {
      "prenom": "Camille", "nom": "Durand",
      "adresse": "12 rue des Lilas", "cp": "75011", "ville": "Paris",
      "email": "camille.durand@example.fr", "tel": "06 12 34 56 78"
    },
    "ecole": { "nom": "École élémentaire Jean Jaurès", "adresse": "4 rue de l'École, 75011 Paris" },
    "enfant": { "prenom": "Lou", "classe": "CE2" },
    "objet": "Demande de communication conjointe des informations scolaires",
    "corps": "Je vous informe par la présente que je suis titulaire de l'autorité parentale conjointe concernant ma fille Lou.\n\nJe vous remercie de bien vouloir me transmettre, en parallèle de l'autre parent, l'ensemble des documents scolaires : bulletins, convocations, informations relatives à la vie de l'école.",
    "lieu": "Paris",
    "date": "2026-10-25"
  }
}
```

## 3. `chronologie`

Timeline des événements regroupés par mois.

**Variables** : `reference`, `generatedAt`, `parent`, `enfant`, `periode {debut, fin}`, `entries: AppEvent[]`.

```json
{
  "data": {
    "reference": "CHR-2026-00005",
    "generatedAt": "2026-10-25T10:00:00.000Z",
    "parent": { "prenom": "Camille", "nom": "Durand",
      "adresse": "12 rue des Lilas", "cp": "75011", "ville": "Paris",
      "email": "camille.durand@example.fr", "tel": "06 12 34 56 78" },
    "enfant": { "prenom": "Lou", "dateNaissance": "2017-04-18" },
    "periode": { "debut": "2026-09-01", "fin": "2026-10-31" },
    "entries": [
      { "id": "e1", "type": "garde", "date": "2026-09-05", "heure": "18:00", "titre": "Retour tardif", "resume": "Retard de 2h." },
      { "id": "e2", "type": "rdv", "date": "2026-10-12", "heure": "14:30", "titre": "RDV pédiatre", "lieu": "Cabinet Dr. Chen" }
    ]
  }
}
```

## 4. `attestation-hebergement`

Attestation sur l'honneur d'hébergement, format légal.

**Variables** : `reference`, `generatedAt`, `declarant`, `heberge`, `adresseHebergement`, `periode`, `lieu`, `date`.
Mention légale incluse : **article 441-7 du Code pénal**.

```json
{
  "data": {
    "reference": "ATT-2026-00011",
    "generatedAt": "2026-10-25T10:00:00.000Z",
    "declarant": {
      "prenom": "Camille", "nom": "Durand",
      "dateNaissance": "1985-03-21", "lieuNaissance": "Lyon",
      "adresse": "12 rue des Lilas", "cp": "75011", "ville": "Paris",
      "profession": "Ingénieure"
    },
    "heberge": {
      "prenom": "Lou", "nom": "Durand",
      "dateNaissance": "2017-04-18", "lieuNaissance": "Paris"
    },
    "adresseHebergement": { "rue": "12 rue des Lilas", "cp": "75011", "ville": "Paris" },
    "periode": { "debut": "2024-01-01" },
    "lieu": "Paris",
    "date": "2026-10-25"
  }
}
```

## 5. `temoignage`

Témoignage en forme Cerfa (modèle 11527*03).

**Variables** : `reference` (`TMG-YYYY-XXXX`), `generatedAt`, `temoin`, `lienAvecParties`, `partiesConcernees[]`, `faitsConstates`, `lieu`, `date`.
Mentions pénales incluses : **articles 441-7 et 434-13 du Code pénal**.

```json
{
  "data": {
    "reference": "TMG-2026-0007",
    "generatedAt": "2026-10-25T10:00:00.000Z",
    "temoin": {
      "prenom": "Sophie", "nom": "Albert",
      "dateNaissance": "1979-07-02", "lieuNaissance": "Nantes",
      "adresse": "14 rue des Lilas", "cp": "75011", "ville": "Paris",
      "profession": "Infirmière", "nationalite": "Française"
    },
    "lienAvecParties": "Voisine de palier depuis 2020, aucun lien de parenté.",
    "partiesConcernees": [
      { "prenom": "Camille", "nom": "Durand", "role": "mère" },
      { "prenom": "Lou", "nom": "Durand", "role": "enfant" }
    ],
    "faitsConstates": "Le samedi 5 septembre 2026 à 20h07, j'ai croisé Lou dans le hall de l'immeuble...",
    "lieu": "Paris",
    "date": "2026-10-25"
  }
}
```

---

## Tester en ligne de commande

```bash
curl -X POST http://localhost:3000/api/pdf/lettre-ecole \
  -H "Content-Type: application/json" \
  -d @payload.json \
  --output lettre.pdf
```

Un payload invalide renvoie `400` avec le tableau d'erreurs Zod (`issues`).
Un template inconnu renvoie `400` avec la liste des templates autorisés.
