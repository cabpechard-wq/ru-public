# Chronologie juridique — structure de présentation (Option A)

Livrable pour **ressources-universitaires.fr** · section **Bibliothèque**
(intégré sous `/bibliotheque/chronologie/`, et non `/ressources/chronologie/`
comme envisagé initialement dans le livrable d'origine).

Séparation données / présentation : le pipeline d’export régénère uniquement
`data/chronology-decisions.json` ; les fichiers HTML/CSS/JS restent stables
(seule exception apportée à l'intégration : `assets/chronologie.js` construit
désormais l'URL de fiche en `{ficheBaseUrl}{slugFiche}/` — routage par
dossier, cf. `/arrets/<slug>/` — au lieu de `{slugFiche}.html`, pour coller
au routage réel du site).

`build_assets.py` copie ce dossier tel quel vers `site/dist/site/bibliotheque/chronologie/`
lors du build (`scripts/build_site.ps1`) ; seul `data/chronology-decisions.json`
est destiné à être régénéré par l'export Notion.

### Origine des données actuelles

`data/chronology-decisions.json` contient les **995 décisions** de la base
Notion « Jurisprudence », interrogée directement (SQL en lecture seule sur
la data source `collection://39ba29ad-9f78-8045-a847-000b0f864cb6`) plutôt
que reconstruites par extraction des fiches HTML — `nom`, `date`,
`juridiction`, `formation`, `importance`, `theme`, `notions`, `objet`,
`verso`, `portee` et `urlOfficielle` (804/995) viennent tous directement des
propriétés Notion correspondantes (Nom, Date, Juridiction, Formation de
jugement, Importance, Thème, Notions, Objet, Verso, Portée, Décision
officielle). `slugFiche`/`id` sont obtenus en associant chaque ligne à sa
fiche réelle sous `ru-public/arrets/<slug>/` (désambiguïsation par
correspondance du paragraphe Objet pour les deux homonymes `TC, 1978, Sté
Le Profil`).

**`liees` reste vide pour les 995 entrées** : la propriété Notion
« Décisions liées… » est une relation « lecture seule à ce stade… à
alimenter seulement sur instruction expresse » — elle n'est pas encore
renseignée côté Notion, indépendamment de l'export.

Ce paquet n'a pas encore d'étape automatisée dans le pipeline CI
(`.github/workflows/deploy-pages.yml`) : la requête ci-dessus a été
exécutée manuellement via les outils Notion MCP. Un prochain chantier
consiste à ajouter un script équivalent à `extract/pull/jurisprudence.py`
pour régénérer ce fichier à chaque run, comme `/arrets/` l'est déjà.

### Frise : cinq lignes par juridiction, sans étiquette

`assets/chronologie.js` regroupe les décisions en cinq catégories fixes
(Tribunal des conflits, Juridictions adm., Conseil constitutionnel,
Juridictions civ., Juridictions int'les) rendues en grille CSS ; la colonne
d'étiquettes de ligne a été retirée (`.trow-label`) au profit de la seule
couleur du marqueur — voir la légende. Toutes les décisions s'affichent
individuellement (plus de regroupement « +N »).

Quand une décision reliée à d'autres (`liees`) est sélectionnée et que
« Afficher uniquement les décisions liées » est cochée, chaque marqueur
affiche son Nom au lieu de l'étiquette d'année/mois/jour. Les flèches
oranges arquées (`chainIndexMap`/`drawChainLinks`) existent depuis le
livrable d'origine mais n'ont rien à tracer tant que `liees` reste vide
(cf. ci-dessus) — vérifié fonctionnel avec des relations de test.

### Charte graphique : suit l'« Ambiance » du site

Comme Flipcards et Relier, `chronologie.css` ne définit plus sa propre
palette : elle hérite de `site.css` / `themes/*.css` via `site-theme.js`
(dix ambiances : Campus, Amphithéâtre, Salle de TD, Salle de lecture ×4
jour/nuit/accessibilité, Restau' U, Cafétéria, Résidence universitaire).
Concrètement :

- `--accent`, `--border`, `--radius`, `--accent-soft` ne sont **jamais**
  redéfinis dans `chronologie.css` (mêmes noms que `site.css`) — ils
  héritent du thème actif appliqué par `site-theme.js` (qui échange le
  `<link id="theme-css">`).
- `--text`/`--text-secondary`/`--canvas`/`--surface`/`--font` sont des
  alias vers `--ink`/`--muted`/`--bg`/`--bg-elevated`/`--font-ui`.
- Les six couleurs de marqueur (une par catégorie de juridiction) sont
  dérivées de la palette du thème : `--marker-ce` (accent), `--marker-adm`
  (link-dict), `--marker-tc` (secondary), `--marker-cons-constit`
  (link-arret), `--marker-civ` (danger), `--marker-intl` (ok) ; les
  flèches de décisions liées reprennent `--marker-cons-constit`
  (`--chain-link`).
- `index.html` porte `id="theme-css"`/`id="theme-fonts"` sur ses `<link>`
  site.css / Google Fonts, comme `demo/index.html` (Flipcards), pour que
  `site-theme.js` les retrouve et les mette à jour sans doublon.
- L'ancien fallback `@media (prefers-color-scheme: dark)` a été supprimé :
  le thème actif (pas la préférence OS) pilote désormais l'apparence.

Vérifié en Playwright sur Campus, Amphithéâtre, Salle de TD, Salle de
lecture (accessibilité) · jour et Cafétéria (dont un contrôle programmatique
que la couleur du marqueur CE correspond bien à la valeur calculée de
`--accent` du thème actif).

## Arborescence cible sur le site

```text
/bibliotheque/chronologie/
├── index.html                 ← coque (adaptée : nav Bibliothèque, ficheBaseUrl)
├── assets/
│   ├── chronologie.css
│   └── chronologie.js
└── data/
    └── chronology-decisions.json   ← RÉGÉNÉRÉ à chaque export Notion
```

En local de développement, ouvrir `index.html` via un serveur HTTP
(pas en `file://`) pour que le `fetch` du JSON fonctionne :

```bash
cd site/templates/chronologie
python3 -m http.server 8080
# → http://localhost:8080/index.html
```

## Contrat de données

Voir `schema/chronology-decisions.schema.json` (JSON Schema draft-07).

### Règles d’export (à brancher sur l’extracteur existant)

| Champ JSON | Source Notion | Notes |
|------------|---------------|-------|
| `id` | slug stable dérivé de `Nom` (ou id page) | **immuable** une fois publié ; utilisé par `liees` et futurs lots d’exercice |
| `nom` | `Nom` | ex. `CE, 2002, Synd. de l’éduc. nat’le` |
| `date` | `Date` | ISO `AAAA-MM-JJ` uniquement |
| `annee` | année de `Date` | redondant volontairement (filtres / buckets) |
| `juridiction` | `Juridiction` | libellé exact de l’option Notion |
| `formation` | `Formation de jugement` | peut être `""` |
| `importance` | `Importance` | entier `1`–`4` (★ → ★★★★) |
| `theme` | `Thème` | libellé exact, ex. `35-Contrats administratifs` |
| `notions` | `Notions` | tableau de libellés |
| `objet` | `Objet` (version éditoriale) | phrase nominale |
| `verso` | `Verso` | une phrase |
| `portee` | `Portée` | 1–4 phrases |
| `slugFiche` | slug de la fiche HTML cours | lien interne ; `null` si absente |
| `urlOfficielle` | `Décision officielle` | URL ou `null` |
| `liees` | `Décisions liées…` | **tableau d’`id`**, jamais de titres libres |
| `complete` | booléen calculé | `true` si verso + objet + date présents (ou fiche validée) |

### Exclusion

Ne pas exporter : Faits, Enjeu, Solution, Perspective (texte long), PDF,
relations Manuel / Méthode / Formule / Index.

### Inclusion phase 1 (recommandation)

- Inclure toute fiche avec `Date` renseignée.
- `complete: false` si la fiche est encore partielle → pastille grisée côté UI.
- Trier le tableau `decisions` par `date` croissante (l’UI re-trie, mais l’export ordonné facilite le debug).

### `meta`

```json
{
  "generatedAt": "2026-08-11T08:00:00Z",
  "count": 975,
  "version": 1,
  "source": "notion-jurisprudence"
}
```

`version` : incrémenter uniquement en cas de **rupture** de schéma
(le JS affiche un avertissement si `version` > version supportée).

## API JS publique

Exposée sur `window.Chronologie` après chargement :

| Méthode | Rôle |
|---------|------|
| `Chronologie.load(data)` | injecte un dataset (tests / fallback) |
| `Chronologie.filter(partial)` | applique des filtres |
| `Chronologie.focus(id)` | ouvre le panneau détail |
| `Chronologie.getState()` | état courant (debug) |

Le script charge par défaut `./data/chronology-decisions.json`.
Surcharge possible :

```html
<script>
  window.__CHRONO_CONFIG__ = {
    dataUrl: "/ressources/chronologie/data/chronology-decisions.json",
    ficheBaseUrl: "/ressources/fiches/",   // {slugFiche}.html
    defaultMinImportance: 1,              // 2 = masquer les ★ par défaut
    supportedDataVersion: 1
  };
</script>
<script src="assets/chronologie.js" defer></script>
```

## Phase 2 (hors livrable, contrat anticipé)

Fichier additionnel `data/chronology-sets.json` :

```json
{
  "meta": { "generatedAt": "…", "version": 1 },
  "sets": [
    {
      "id": "set-conventionnalite",
      "label": "Contrôle de conventionnalité",
      "decisionIds": ["ce-1989-nicolo", "ce-2001-snip"],
      "source": "liees"
    }
  ]
}
```

Même `id` de décision que dans `chronology-decisions.json`.

## Intégration page Bibliothèque

Carte ajoutée sur `/bibliotheque/` (et rappel sur `/` dans le pilier Bibliothèque) :

- Titre : Chronologie de la jurisprudence
- Accroche : Frise des décisions du fonds, filtrable par thème, notions et importance.
- Lien : `/bibliotheque/chronologie/`

## Fichiers de ce paquet

| Fichier | Rôle |
|---------|------|
| `index.html` | Page Bibliothèque |
| `assets/chronologie.css` | Styles |
| `assets/chronologie.js` | Rendu, filtres, détail |
| `data/chronology-decisions.json` | **Exemple** (~20 décisions) — à remplacer par l’export |
| `data/chronology-decisions.schema.json` | Contrat formel pour l’extracteur |
| `README.md` | Ce document |
