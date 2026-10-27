# Traduction du contenu éditorial (EN / PT)

Complète `docs/I18N.md` (interface). Ici : FAQ, tutoriels, blog, Guide parental, modèles de documents, conseils du jour.

## Où vivent les traductions

1. **Fichiers du dépôt** (source par défaut, et import « Importer depuis le dépôt » de l'admin) :
   `content/i18n/<locale>/` reproduit **exactement** l'arborescence et le format de `content/` :

   | Original français | Traduction (ex. anglais) |
   |---|---|
   | `content/faq/index.json`, `content/faq/<slug>.md` | `content/i18n/en/faq/index.json`, `content/i18n/en/faq/<slug>.md` |
   | `content/tutoriels/index.json`, `content/tutoriels/<slug>.md` | `content/i18n/en/tutoriels/…` |
   | `content/blog/<slug>.md` | `content/i18n/en/blog/<slug>.md` |
   | `content/guide/guyane/fiches/<slug>.json` (+ `parcours/`, `territoire.json`, `partenaires.demo.json`) | `content/i18n/en/guide/guyane/…` |
   | modèle `<slug>` de `lib/modeles/seeds.ts` | `content/i18n/en/modeles/<slug>.json` (objet complet du modèle) |
   | conseils du jour (`mockTips`, `lib/aide/seed.ts` → `readSeedConseils`) | `content/i18n/en/conseils.json` : `{ "<slug>": { "titre": "…", "texte": "…" } }` |

   Même nom de fichier, mêmes clés JSON, même frontmatter, mêmes longueurs de tableaux. Seul le texte change.

2. **Base de données** (contenus créés ou modifiés dans l'admin) : colonne `translations jsonb` sur chaque table
   de contenu, `{ "en": <objet complet>, "pt": <objet complet> }`, éditée dans l'admin (sélecteur de langue).

À l'affichage : version de la langue choisie si elle existe **et** est valide, sinon le français. Les champs
invariants viennent toujours du français.

## Champs invariants (jamais traduits)

Liste exacte : `lib/contenus/i18n-invariants.ts`. En résumé : slugs, identifiants, territoire, catégories (clés),
types, ordres, badges, icônes, **URL et liens**, téléphones, montants, dates ISO, durées, booléens.
**Modèles de documents** : on traduit seulement `titre`, `description`, `champs[].label` et `champs[].aide`.
Le document produit (`corps`, `miseEnPage`, `exemple`, `options`) **reste en français** : il est destiné à une
administration ou une école françaises (même règle que les PDF officiels).

## Règles de traduction

- Anglais : naturel, clair (US/international). Portugais : **portugais du Brésil** (beaucoup de familles brésiliennes
  vivent en Guyane). Vouvoiement → « you » / « você ». Ton chaleureux, simple, jamais juridique-jargon.
- **Ne rien ajouter, ne rien retirer** : mêmes informations, mêmes conditions, mêmes montants, mêmes délais.
  Précision juridique et administrative avant l'élégance.
- **Institutions et démarches françaises** : garder le nom officiel français (et le sigle), avec une explication courte
  dans la langue cible **à la première mention** de chaque fiche/article, ex. « the Caf (Caisse d'allocations familiales,
  the family benefits office) » / « a Caf (Caisse d'allocations familiales, órgão de benefícios familiares) ».
  Sigles inchangés : Caf, CPAM, JAF, ARIPA, PMI, ALSH, MDPH, AEEH, PAJE, ASF, CSS, ANTS, etc. Noms de formulaires
  (Cerfa n° …), d'aides officielles et de sites restent en français quand c'est ce que la personne devra chercher.
- Montants : toujours en euros, jamais convertis, au format de la langue (« €11.99 » en anglais, « 11,99 € » en
  portugais). Dates écrites en toutes lettres : format de la langue (« October 25, 2026 », « 25 de outubro de 2026 »).
- Markdown : conserver titres, listes, gras, liens (texte traduit, URL inchangée), sauts de paragraphe.
- `motsCles` (Guide) : mots-clés de recherche dans la langue cible ; on peut ajouter les sigles français utiles.
- Glossaire de l'application (`docs/I18N.md`) : Coffre-fort → Vault / Cofre ; Journal → Journal / Diário ;
  Coach IA → AI Coach / Coach com IA ; Témoignages → Testimonials / Depoimentos ; Guide parental → Parenting guide /
  Guia parental ; Parents liés → Linked parents / Pais vinculados ; Mon dossier JAF → My court file / Meu processo judicial ;
  Coparentalité → Co-parenting / Coparentalidade. Marques non traduites : Lien Parental, Premium, Coparentalité+.
- Sécurité : « chiffré en transit et au repos », **jamais** « de bout en bout ».
- Les tableaux (dont `motsCles`) gardent **exactement** le même nombre d'éléments que le français.
- Un renvoi vers une autre fiche reprend **exactement** le `titre` traduit de cette fiche.

## Glossaire du Guide (retenu le 27/10/2026)

| Français | Anglais | Portugais (Brésil) |
|---|---|---|
| allocation(s) familiale(s) | (family) allowance(s) | auxílio(s) (familiares) |
| résidence alternée | shared residence | residência alternada |
| aide juridictionnelle | legal aid (aide juridictionnelle) | assistência jurídica gratuita (aide juridictionnelle) |
| aides au logement | housing benefit(s) | auxílio(s)-moradia |
| l'autre parent / parent isolé | the other parent / single parent | o outro genitor / pai ou mãe solo |
| mairie | town hall (mairie) | prefeitura (mairie) |
| greffe | court registry (greffe) | cartório do tribunal (greffe) |
| homologation | court approval (homologation) | homologação |
| JAF | family court judge (juge aux affaires familiales, JAF) | juiz de família (juge aux affaires familiales, JAF) |
| pension alimentaire | child support | pensão alimentícia |
| livret de famille | family record book (livret de famille) | livro de família (livret de famille) |
| mutuelle | mutuelle (top-up health insurance) | mutuelle (plano de saúde complementar) |
| assistante maternelle | registered childminder (assistante maternelle) | assistente maternal credenciada (assistante maternelle) |
| PACS | PACS (civil partnership) | PACS (união civil) |

Anglais : orthographe américaine. Noms de lieux : Cayenne, Kourou, Saint-Laurent (non traduits).
- Respecter les **limites de longueur** des schémas (le portugais est souvent plus long : condenser sans perdre d'info).

## Contrôle

```bash
npx tsx scripts/check-content-i18n.ts            # tout
npx tsx scripts/check-content-i18n.ts pt guide   # une langue, un préfixe
```

Zéro erreur exigé. Les avertissements « identique au français » sont à examiner un par un (un nom propre est normal).
