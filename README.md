# Site Coiffure Étoile – Cluses (Site&Go)

| Dossier / fichier | Rôle |
|---|---|
| `site/` | Le site prêt à mettre en ligne. Copier tout le dossier chez l'hébergeur. |
| `data.py` | **Seul fichier de contenu** : salon, horaires, prestations, FAQ, équipe. |
| `build.py` | Génère `site/` et `apps-script/Code.gs` à partir de `data.py`. |
| `src/` | Feuille de styles, script, polices (WOFF2 locales, licence OFL), image de partage. |
| `apps-script/` | Réservation Google Agenda : `Code.gs`, `appsscript.json`, `LISEZMOI.md`. |
| `tests/` | Tests du script (objets Google simulés) et tests navigateur Playwright. |
| `captures/` | Captures d'écran sur mobile (390 px) et sur ordinateur. |
| `recherche-sources.md` | Sources consultées et différences repérées. |
| `a-completer.txt` | Liste générée automatiquement des éléments « À COMPLÉTER ». |

## Mettre à jour

Lancez ces commandes depuis le dossier du projet.

Régénérer le site après une modification de `data.py` :

```bash
python3 build.py
```

Tester le script de réservation (objets Google simulés) :

```bash
TZ=Europe/Paris node tests/gas.test.js
```

Lancer les tests navigateur (Playwright) :

```bash
TZ=Europe/Paris node tests/e2e.js
```

## Avant la mise en ligne

1. Remplacer `base_url` dans `data.py` par le vrai domaine, puis régénérer le site.
2. Coller l'URL Apps Script dans `booking_script_url`, puis régénérer le site.
3. Vérifier que `a-completer.txt` est vide.
4. Mesurer le score sur PageSpeed Insights, version mobile. L'objectif est 90 ou plus.
