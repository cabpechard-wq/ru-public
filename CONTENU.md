# Où modifier le site

Les pages « structurelles » (accueil, hubs, login) sont des `index.html`.
Le bandeau, le pied de page et **les changements une fois connecté** sont dans des JS à la racine — pas dans chaque page.

## Pages à éditer (HTML)

| Vous voulez changer… | Fichier |
|---|---|
| Accueil | `index.html` |
| Bibliothèque universitaire (hub) | `bibliotheque-universitaire/index.html` |
| **Cours magistral** (hub) | `cours-magistral/index.html` |
| **Cours** (sommaire + fiches) | `cours/index.html` et `cours/dp-000/…/index.html` |
| Travaux dirigés (hub) | `travaux-diriges/index.html` |
| Inscriptions | `checkout/index.html` |
| Connexion / mot de passe / compte | `membre/index.html`, `membre/forgot/`, `membre/reset/`, `membre/compte/` |
| Dictionnaire | `dictionnaire/index.html` (+ `entries.json`) |
| Fiche d’arrêt | `arrets/<slug>/index.html` |
| Chronologie **démo** (15 décisions) | `demo-chronologie/index.html` + `demo-chronologie/data/…-demo.json` |
| Chronologie **membres** (fonds complet) | `chronologie/index.html` + `chronologie/data/chronology-decisions.json` |
| Flipcards / Relier **démo** | `demo/`, `demo-flipcards-dico/`, `demo-relier/`, `demo-relier-dico/` |
| Enchaînements **démo** | `demo-enchainements-logiques/index.html` |
| Enchaînements **membres** | `enchainements-logiques/index.html` |
| Mentions / CGV | `mentions-legales/`, `cgv/`, `confidentialite/` |

Anciennes adresses **redirigées** (ne plus y écrire le contenu) :

- `/manuel/…` → `/cours/…`
- `/bibliotheque/` → `/bibliotheque-universitaire/`
- `/ressources/` → `/cours-magistral/`
- `/exercices/` → `/travaux-diriges/`
- `/ressources/chronologie/` et `/bibliotheque/chronologie/` → `/demo-chronologie/`

## Une fois connecté (ne pas chercher dans chaque HTML)

| Fichier | Rôle |
|---|---|
| `auth.js` | Session (jeton) uniquement |
| `site-nav.js` | Bandeau, fil d’Ariane, aperçu du cours, pastilles « Ouvrir → », liens vers les apps membres |
| `member-boot.js` | Remplace toute la page Flipcards / Relier membres (contenu chiffré, pas éditable ici) |
| `site-theme.js` | Chartes graphiques (accueil) |
| `site-search.js` | Barre de recherche |

Hors connexion, l’accueil et les TD restent **tels qu’écrits dans le HTML**.

## Chronologie : un seul moteur

- Code JS/CSS : `chronologie/assets/` (la démo le réutilise).
- Données membres : `chronologie/data/chronology-decisions.json` (aussi lues par Enchaînements membres).
- Données démo : `demo-chronologie/data/chronology-decisions-demo.json` (aussi lues par Enchaînements démo).

## Cours : JSON d’index

Après modification des liens d’exercices dans le cours : `cours/exercices.json`, puis `node scripts/sync-linked-resources.mjs`.
