# Design system — boutons et éléments interactifs

Règle d'or : **un seul système de couleurs pour toute l'application**. Toute nouvelle page réutilise les helpers ci-dessous plutôt que d'écrire des classes à la main.

Palette (`tailwind.config.ts`) : `night` (bleu nuit, textes), `leaf` (vert forêt, actions), `iris` (violet, Coach IA), `gold` (Premium), `alert` (rouge, suppression / erreur).

## 1. Hiérarchie des boutons

| Rôle | Classes | Quand |
|---|---|---|
| **Principal** | `bg-leaf-500 text-white hover:bg-leaf-600 active:scale-[0.98]` + ombre optionnelle `shadow-[0_8px_20px_-10px_rgba(31,122,61,0.55)]` | L'action principale de l'écran : Continuer, Enregistrer, Se connecter, Créer mon compte, Valider, Suivant, Envoyer, Ajouter… **Un seul par écran.** |
| **Secondaire** | `bg-white text-night-900 border border-night-200 hover:bg-night-50` | Annuler, Retour, Modifier, actions alternatives. |
| **Tertiaire / lien** | `text-leaf-600 font-semibold hover:underline` | Liens texte, « Mot de passe oublié ? », « Voir tout ». Dans un paragraphe, garder le soulignement. |
| **Destructif (confirmation)** | `bg-alert-500 text-white hover:bg-alert-600` | Bouton final « Supprimer » d'une confirmation. |
| **Destructif (déclencheur)** | `border border-alert-300 bg-white text-alert-600 hover:bg-alert-50` | Bouton qui ouvre la confirmation. |

Gabarit commun : `h-12` (48 px, `min-h-[48px]` si le libellé peut passer sur deux lignes), `rounded-xl` (12 px), `font-semibold`, `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:ring-offset-2`, `disabled:opacity-50 disabled:cursor-not-allowed`, `motion-reduce:active:scale-100`.

## 2. Exceptions et interdits

- **Coach IA** (`app/app/coach/**`, `components/coach/**` uniquement) : l'action principale reste violette, `bg-iris-500 hover:bg-iris-600`. Le secondaire suit le système commun.
- **Partout ailleurs, aucun bouton violet.** Dans les témoignages, le violet reste un accent (icônes, badges, barre de progression), jamais un fond de bouton.
- **Bleu nuit (`night-900`)** : textes et titres uniquement. Jamais en fond de bouton.
- **Or (`gold`)** : badges et couronnes Premium uniquement. Les CTA Premium sont des boutons principaux verts.
- **Page d'accueil marketing** (`app/page.tsx`, `components/home/**`, `components/marketing/**`) : boutons en pilule `rounded-full`, c'est voulu. Ne pas aligner.

## 3. États sélectionnés, toggles, focus

- Onglets, contrôles segmentés, pills de filtre, jour sélectionné du calendrier :
  - plein : `bg-leaf-500 text-white`
  - doux : `bg-leaf-50 text-leaf-700 ring-1 ring-leaf-200`
- Toggle / case / radio activés : vert (`peer-checked:bg-leaf-500`, `checked:bg-leaf-500`).
- Étape en cours d'un stepper : `bg-leaf-500 text-white`.
- Anneau de focus : toujours `ring-leaf-500` (le Coach IA peut utiliser `ring-iris-500`).
- Ne pas exprimer la sélection par la couleur seule : `aria-selected`, `aria-pressed`, `aria-current` ou une coche.

## 4. Rayons

- Boutons : `rounded-xl` (12 px)
- Champs de saisie : `rounded-xl` (12 px)
- Cartes : `rounded-2xl` (16 px)
- Boutons ronds d'icône (FAB, chevrons, fermer) : `rounded-full`, c'est voulu.

## 5. Helpers à utiliser

| Contexte | Helper | Variantes |
|---|---|---|
| Générique | `components/ui/Button.tsx` (`<Button>`, `buttonVariants`) | `primary` (défaut), `secondary`, `ghost`, `danger`, `iris` (Coach seulement) |
| Onboarding / témoin / enfants | `components/onboarding/styles.ts` → `btn`, `linkLeaf` | `btn.primary`, `btn.secondary` |
| Profil / Premium / Aide | `components/profil/kit.tsx` → `btn` | `primary`, `secondary`, `danger`, `dangerOutline` |
| Coffre-fort / témoignages / modèles | `components/coffre/buttons.ts` → `btn({ variant })` | `primary`, `secondary`, `ghost`, `danger`, `dangerOutline` |
| Coach IA | `components/coach/ui.tsx` → `btn` | `primary` (violet), `secondary`, `danger` |
| Formulaires journal / calendrier | `components/journal/FormFields.tsx` → `SubmitBar` | bouton principal vert pleine largeur |

Les anciens noms (`leaf`, `night`, `gold`, `iris` hors Coach, `outline`, `outlineLeaf`, `outlineNight`, `outlineIris`, `ghostLeaf`, `ghostIris`, `soft`, `navy`, `navyOutline`) existent encore comme **alias dépréciés** qui renvoient vers le système. Ne pas les utiliser dans du nouveau code.

```tsx
// Écran type : un principal, un secondaire
<button type="submit" className={btn.primary}>Enregistrer</button>
<Link href="/app/profil" className={btn.secondary}>Annuler</Link>

// Composant générique
<Button>Continuer</Button>
<Button variant="secondary">Retour</Button>
<Button variant="danger">Supprimer définitivement</Button>
```
