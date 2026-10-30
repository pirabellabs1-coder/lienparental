# Mots-clés et pages cibles : lienparental.fr (30/10/2026)

Complète `docs/SEO-AUDIT.md`. L'objectif est d'associer chaque intention de recherche des parents séparés à **une seule page** du site, pour éviter la cannibalisation, et de repérer les manques.

## Méthode et limites

- **Sources.** Les résultats de recherche web du 30/10/2026 ont été analysés pour chaque requête : sites présents, type de contenu, concurrents (voir la section [Concurrence](#concurrence)). Les suggestions et questions associées ont servi à formuler les variantes.
- **Pas de volumes absolus.** Je n'ai eu accès ni à Google Keyword Planner, ni à Search Console (le site vient d'être vérifié), ni à un outil payant (Semrush, Ahrefs). Le **volume** est donc une estimation relative sur 5 niveaux :
  - ●●●●● : requête nationale très courante (dizaines de milliers de recherches par mois) ;
  - ●○○○○ : requête de niche, quelques dizaines par mois.
- **Difficulté** (Facile, Moyenne, Forte) : elle dépend de qui occupe la première page. Service-Public, la Caf et justice.fr sont quasi imbattables. Les cabinets d'avocats et les sites juridiques (Justifit, Legalstart, droit-finances) sont battables sur une requête locale. Les comparatifs d'applications sont surtout anglophones.
- **À faire dans 4 à 6 semaines.** Remplacer ces estimations par les impressions réelles de Search Console (rapport Performances, filtres Pays = Guyane française, Martinique…) et réajuster la carte.

### Intentions

| Code | Intention | Ce que veut l'internaute | Page qui y répond |
|---|---|---|---|
| **T** | Transactionnelle | Un outil à utiliser | Accueil, inscription |
| **C** | Comparaison | Choisir entre plusieurs applications | Accueil, futur article comparatif |
| **I** | Informationnelle | Comprendre une démarche | Fiche du Guide, article de blog |
| **L** | Locale | Démarche ou organisme d'un territoire | Fiche du Guide du territoire |
| **N** | Navigationnelle | Une marque précise | Hors cible, sauf « Lien Parental » |

## Priorités

1. **Combinaison démarche + territoire en Outre-mer.** Exemples : « pension alimentaire impayée Guyane », « médiation familiale Cayenne », « JAF Fort-de-France ». La concurrence y est faible : les sites nationaux ne localisent pas, et nos 232 fiches sont déjà écrites par territoire. C'est la voie la plus rapide vers la première page.
2. **Requêtes produit en français.** Exemples : « application coparentalité », « appli parents séparés », « calendrier garde alternée application ». La concurrence est moyenne : 2houses, Kiido, Share(d), Parentiz, TI3RS, plus des listes « meilleures applis ». L'accueil doit porter ces mots dans le `title`, le H1 et le texte.
3. **Requêtes nationales informationnelles.** Exemples : « garde alternée », « pension alimentaire », « saisir le JAF ». La concurrence y est forte. La version « France métropolitaine » du Guide et le blog y répondent à long terme, surtout par la longue traîne (« … quand on est séparés », « … documents à fournir »).
4. **EN et PT.**
   - Anglais : faible volume (expatriés en France, anglophones des Antilles). Cible : « co-parenting app France », « child custody France ».
   - Portugais : enjeu particulier en Guyane, avec la communauté brésilienne (environ 25 000 personnes) et la frontière de l'Oyapock. Cible : « pensão alimentícia Guiana Francesa », « guarda compartilhada França ».
   - Le portugais servi est le pt-BR.

## Carte mots-clés → page cible (français)

### Produit (accueil)

| Mot-clé principal | Variantes | Intention | Vol. | Diff. | Page cible |
|---|---|---|---|---|---|
| application coparentalité | appli coparentalité, application de coparentalité gratuite | T/C | ●●●○○ | Moyenne | `/` (title, H1, FAQ) |
| application parents séparés | appli parents divorcés, application pour parents séparés | T | ●●●○○ | Moyenne | `/` |
| calendrier de garde alternée | planning garde alternée, agenda partagé parents séparés | T/I | ●●●○○ | Moyenne | `/` (section agenda) + `/blog/garde-alternee-rythmes-et-calendrier` |
| communication entre parents séparés | messagerie parents séparés, communiquer avec son ex | I/T | ●●○○○ | Moyenne | `/` (section Messagerie) + `/blog/communiquer-avec-l-autre-parent` |
| partage des frais enfant parents séparés | dépenses partagées, frais exceptionnels enfant | T/I | ●●○○○ | Moyenne | `/` (fonctionnalité Dépenses) |
| dossier JAF | préparer son dossier JAF, pièces pour le JAF | I/T | ●●○○○ | Moyenne | `/` (fonctionnalité Dossier JAF) + fiche JAF |
| attestation de témoin JAF | cerfa 11527, attestation de témoin modèle | I | ●●●●○ | Forte (Service-Public) | `/blog/attestation-de-temoin-jaf-cerfa-11527` + `/aide` |
| coffre-fort numérique famille | documents enfant en ligne | T | ●○○○○ | Faible | `/` |
| Lien Parental | lienparental | N | ●○○○○ | — | `/`, `/a-propos` |

### Guide : démarches de séparation (la Guyane d'abord)

Gabarit des fiches : `/guide/<territoire>/<slug>`. Le `title` contient désormais le territoire (voir les corrections de cette PR), par exemple « Médiation familiale en Guyane ».

| Mot-clé principal | Variantes locales | Intention | Vol. national | Diff. locale | Page cible |
|---|---|---|---|---|---|
| saisir le juge aux affaires familiales | JAF Cayenne, tribunal judiciaire Cayenne affaires familiales, cerfa 11530 | I/L | ●●●●○ | Faible en Outre-mer | `/guide/guyane/saisir-juge-affaires-familiales` (× 6 territoires) |
| pension alimentaire impayée | ARIPA Guyane, Caf pension alimentaire impayée, intermédiation financière | I/L | ●●●●○ | Faible en Outre-mer | `/guide/<t>/pension-alimentaire-aripa` + `/blog/pension-alimentaire-impayee-caf-aripa` |
| pension alimentaire impôts | déclarer pension alimentaire, déduire pension | I | ●●●●○ | Forte | `/guide/<t>/pension-alimentaire-impots` |
| médiation familiale | médiation familiale Cayenne, UDAF Guyane médiation, médiateur familial Martinique | I/L | ●●●○○ | Faible | `/guide/<t>/mediation-familiale` |
| allocation de soutien familial | ASF parent isolé, ASF pension impayée | I | ●●●●○ | Forte (Caf) | `/guide/<t>/allocation-soutien-familial` |
| déclarer sa séparation à la Caf | changement de situation Caf séparation, garde alternée Caf | I | ●●●○○ | Moyenne | `/guide/<t>/declarer-separation-caf` |
| aide juridictionnelle | aide juridictionnelle JAF, avocat gratuit Cayenne | I/L | ●●●●○ | Faible en Outre-mer | `/guide/<t>/aide-juridictionnelle` |
| autorisation de sortie du territoire | AST mineur, enfant voyage Brésil ou Suriname | I/L | ●●●●○ | Moyenne | `/guide/<t>/autorisation-sortie-territoire` |
| changer l'adresse de l'enfant après séparation | déménagement parent séparé école | I | ●●○○○ | Faible | `/guide/<t>/changer-adresse-enfant-separation` |
| je viens de me séparer, que faire | démarches après séparation, séparation avec enfant étapes | I | ●●●○○ | Moyenne | `/guide/<t>/parcours/je-viens-de-me-separer` |
| guide parental Guyane | aides parents Guyane, démarches famille Guyane | L | ●○○○○ | Faible | `/guide/guyane` |
| aides Caf Guyane | allocations familiales Guyane, prime naissance Guyane | L | ●●○○○ | Moyenne (Caf) | `/guide/guyane/categorie/aides` et les fiches Caf |

Les autres fiches (école, santé, naissance, logement, loisirs) visent la longue traîne « démarche + territoire ». Elles n'ont rien à changer, hormis le `title` localisé.

### Manques : pages ou contenus à créer (non créés dans cette PR, à valider)

| Mot-clé | Vol. | Pourquoi c'est un manque | Proposition |
|---|---|---|---|
| garde alternée / résidence alternée | ●●●●● | Aucune fiche dédiée. Le sujet n'apparaît qu'en mot-clé secondaire des fiches Caf. C'est la requête la plus forte du domaine. | Fiche « Résidence alternée : mettre en place et organiser » dans les 6 territoires, rattachée au parcours « Je viens de me séparer » |
| calendrier garde alternée 2-2-3 / 2-2-5-5 / une semaine sur deux | ●●●○○ | Forte intention, proche du produit (agenda) | **Fait (30/10)** : `/blog/garde-alternee-rythmes-et-calendrier` |
| attestation de témoin cerfa 11527 | ●●●●○ | Le produit aide un proche à préparer une attestation selon la forme prévue par l'article 202 du CPC (modèle cerfa 11527) ; le juge en apprécie librement la valeur. Aucune page publique ne l'explique | **Fait (30/10)** : `/blog/attestation-de-temoin-jaf-cerfa-11527` |
| droit de visite et d'hébergement | ●●●●○ | Abordé seulement dans la fiche JAF | Fiche ou article |
| calcul pension alimentaire (barème) | ●●●●● | Simulateurs déjà présents (justice.fr, Service-Public) | Article qui renvoie vers le simulateur officiel, sans recréer d'outil |
| application coparentalité comparatif | ●●○○○ | Les résultats sont dominés par des listes anglophones | Article « Choisir une application de coparentalité : critères » (honnête, sans dénigrer de concurrent nommé) |
| page `/tarifs` | ●○○○○ | Les tarifs sont une ancre `/#tarifs` de l'accueil ; la requête « Lien Parental prix » reste marginale | Pas de page à créer : l'ancre suffit |

## Anglais (`/en`)

| Mot-clé | Intention | Vol. | Diff. | Page cible |
|---|---|---|---|---|
| co-parenting app France | T/C | ●○○○○ | Faible (peu d'offres anglophones visant la France) | `/en` |
| app for separated parents | T | ●●○○○ (mondial) | Forte (OurFamilyWizard, 2houses, TalkingParents) | `/en` |
| child custody France / shared custody France | I | ●●○○○ | Moyenne (cabinets d'avocats anglophones) | `/en/guide/france/saisir-juge-affaires-familiales` |
| child support France unpaid / ARIPA | I | ●○○○○ | Faible | `/en/guide/france/pension-alimentaire-aripa` |
| family mediation France | I | ●○○○○ | Faible | `/en/guide/france/mediation-familiale` |
| French Guiana family services / benefits | L | ●○○○○ | Faible | `/en/guide/guyane` |
| witness statement French court (cerfa 11527) | I | ●○○○○ | Faible | `/en/aide` |

## Portugais (`/pt`, pt-BR)

| Mot-clé | Intention | Vol. | Diff. | Page cible |
|---|---|---|---|---|
| aplicativo de coparentalidade | T | ●●○○○ (Brésil) | Moyenne. Au Brésil, le marché est surtout institutionnel (outil « Vida Compartilhada » du TJRJ). | `/pt` |
| app para pais separados | T | ●●○○○ | Moyenne | `/pt` |
| guarda compartilhada França | I | ●○○○○ | Faible | `/pt/guide/france/saisir-juge-affaires-familiales` |
| pensão alimentícia Guiana Francesa / França | I/L | ●○○○○ | Très faible | `/pt/guide/guyane/pension-alimentaire-aripa` |
| autorização de viagem menor Guiana Francesa Brasil | I/L | ●○○○○ | Très faible | `/pt/guide/guyane/autorisation-sortie-territoire` |
| mediação familiar Caiena | L | ●○○○○ | Très faible | `/pt/guide/guyane/mediation-familiale` |

Le portugais est le meilleur rapport effort/résultat **en Guyane** : presque aucun contenu pt-BR n'explique les démarches françaises sur place. Il faut le vérifier dans Search Console, dont le filtre de langue n'existe pas : passer par Pays (Brésil, Guyane française) et par les URL `/pt`.

## Concurrence

| Acteur | Type | Ce qu'il occupe |
|---|---|---|
| Service-Public.fr, Caf, justice.fr, pension-alimentaire.caf.fr | Officiel | Toutes les requêtes informationnelles nationales. Ne pas lutter de front : les citer comme sources (c'est déjà le cas) et viser la localisation. |
| Justifit, Legalstart, Captain Contrat, droit-finances, cabinets d'avocats | Juridique | Pension, JAF, attestation de témoin, garde alternée. Beaucoup de texte, peu de contenu Outre-mer. |
| 2houses (Belgique, FR/EN), Kiido (Perpignan), Share(d) (Paris), Parentiz, TI3RS, Team'Parents | Applications | « application coparentalité », « appli parents séparés ». Aucune ne cible l'Outre-mer ni n'a de guide des démarches par territoire : c'est notre différence. |
| OurFamilyWizard, TalkingParents, AppClose, coParenter | Applications anglophones | Requêtes en anglais. Hors cible directe. |

## Règles d'écriture (à respecter dans les futurs contenus)

- **Une intention, une page.** Pas deux articles sur le même mot-clé ; en cas de doute, enrichir la page existante.
- **Placer le mot-clé là où il compte**, sans répétition artificielle :
  - le territoire dans le `title` des fiches ;
  - « coparentalité » ou « parents séparés » dans le H1 de l'accueil ;
  - les variantes dans le texte, les ancres et les questions de FAQ.
- **Formulations interdites ou encadrées.**
  - Jamais « chiffrement de bout en bout » : écrire « chiffré en transit et au repos ».
  - Ne pas écrire « valeur juridique garantie » : le juge apprécie librement les preuves.
  - Pas de faux avis, ni d'`aggregateRating`.
- **FAQ en JSON-LD.** Seules des questions **visibles** sur la page y figurent, mot pour mot.
- **Contenus.** Rédigés en français, puis traduits en EN et PT. Un contenu non traduit garde son canonical en français (déjà géré par `lib/seo/metadata.ts`).
