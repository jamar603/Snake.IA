# Snake.IA

Snake en 3D (Three.js) avec des modèles créés dans Blender.

Affronte un serpent IA rouge qui chasse les mêmes pommes (niveaux Facile, Normal, Difficile, ou Sans IA). Si l'IA percute un mur, ton corps ou elle-même, tu gagnes 5 points et elle réapparaît quelques secondes plus tard.

## Jouer

Double-clique sur `lancer.bat` : un serveur local démarre et le jeu s'ouvre sur http://localhost:8000.
Un serveur est nécessaire, car le navigateur bloque le chargement des modèles 3D depuis `file://`.

Commandes : flèches ou ZQSD, Espace pour la pause, glisser sur mobile.

## Déployer sur GitHub Pages

Le workflow GitHub Actions publie automatiquement le jeu à chaque push sur `main`.
Dans les paramètres du dépôt, ouvrez **Pages** et choisissez **GitHub Actions** comme source de déploiement.
Après le premier déploiement réussi, le jeu sera disponible à l'adresse indiquée dans l'exécution du workflow (généralement `https://jamar603.github.io/Snake.IA/`).

## Modèles 3D

Les fichiers `assets/models/*.glb` sont générés par `blender/build_models.py` :

```
"C:\Program Files\Blender Foundation\Blender 4.5\blender.exe" --background --python blender/build_models.py
```
