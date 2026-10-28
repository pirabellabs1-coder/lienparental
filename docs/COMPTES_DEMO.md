# Comptes de démonstration (temporaires)

Pour tester le parcours complet sans backend. Chaque connexion ouvre une session de **8 heures**.

| Rôle | E-mail | Mot de passe | Arrivée |
|---|---|---|---|
| Parent, offre Gratuite | julie.gratuit@demo.lienparental.fr | Demo2026! | /app |
| Parent, offre Premium | julie.premium@demo.lienparental.fr | Demo2026! | /app (profil en Premium) |
| Administrateur | admin@demo.lienparental.fr | Demo2026! | /admin |

Sur l'écran de connexion, l'encart **Comptes de démonstration** permet aussi de se connecter en un clic.
Créer un compte via l'inscription ouvre également une session de démonstration à la dernière étape.
Code de vérification de l'inscription en démonstration : **123456** (ou 1234567, 12345678… jusqu'à 1234567890, pour essayer les codes de 6 à 10 chiffres).
« Se déconnecter » (Profil) ferme la session.

## Fonctionnement

- `lib/demo-auth.ts` : liste des comptes, cookie `lp_demo`, durée de session.
- `middleware.ts` : `/app/*` exige une session de démo, `/admin/*` exige le compte administrateur.
- Le mode démo est **actif en développement** et **désactivé par défaut en production**.
  - `NEXT_PUBLIC_DEMO_MODE=on` pour l'activer sur une pré-production de démonstration.
  - `NEXT_PUBLIC_DEMO_MODE=off` pour le couper partout.

## Coffre-fort

Le coffre-fort (`/app/coffre`) est verrouillé par défaut pour tous les comptes de démonstration.

| Méthode | Valeur |
|---|---|
| Code à 6 chiffres | **123456** |
| Mot de passe du compte | Demo2026! (réinitialise aussi le blocage du code) |
| Empreinte / visage | Profil > Sécurité > Coffre-fort > « Ajouter cet appareil ». Réelle si l'appareil la propose (Touch ID, Windows Hello…), sinon **simulée** |

- 5 codes erronés : blocage temporaire (30 s, puis 1 min, 2 min…).
- Déverrouillage valable 10 minutes d'inactivité (réglable), bouton « Verrouiller » en bas à droite.
- Les réglages de démonstration sont gardés en mémoire du serveur : ils reviennent aux valeurs par défaut (code 123456) au redémarrage.

## Avant la mise en production

Le cookie de démonstration n'est pas une preuve d'identité. Dès que l'authentification Supabase est branchée :
1. mettre `NEXT_PUBLIC_DEMO_MODE=off` ;
2. remplacer la vérification du middleware par la session Supabase ;
3. supprimer l'encart des comptes de démonstration (il disparaît automatiquement quand le mode démo est coupé).
