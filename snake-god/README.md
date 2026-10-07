# Snake God

Snake 3D multijoueur à trois joueurs, dans un cube de 9 × 9 × 9 cellules.

- **Snake 1** et **Snake 2** : survivre, manger, grandir, évoluer. Chaque Snake a 3 PV.
- **Snake God** : contrôle et transforme le monde avec la **World Energy**, voit à l'avance les prochains événements, et doit éliminer les deux Snakes avant la fin du timer.

Les rôles sans joueur sont joués par l'IA : une partie peut toujours commencer.

## Lancer

Il faut [Node.js](https://nodejs.org) 18 ou plus récent.

```
cd snake-god
npm install
npm start
```

Ou double-clique sur `lancer.bat`. Ouvre ensuite http://localhost:8080.

## Menus

- **Jouer**
  - **Solo contre l'IA** : choisis Snake ou Snake God, l'IA joue les deux autres rôles.
  - **Multijoueur** : crée un salon (public ou privé) et partage son code de 4 lettres, ou rejoins un salon avec un code ou depuis la liste des salons publics. L'hôte lance la partie ; les rôles libres sont joués par l'IA.
  - **Démonstration IA** : regarde trois IA s'affronter.
- **Personnaliser** : nom, espèce (Néon, Magma, Venin, Spectre, Royal, Abysse), accessoire (cornes, couronne, crête, visière), traînée, avec un aperçu 3D et un aperçu de chaque palier d'évolution.
- **Paramètres** : qualité graphique, bloom, distance de la caméra, champ de vision, tremblements de l'écran, aide en jeu. Gardés dans le navigateur.
- **Fin de partie** : verdict, carte de résultats par joueur (score, longueur, survie, nourriture, dégâts, pièges), MVP, pouvoirs utilisés par le dieu ; Rejouer, Retour au salon ou Menu principal.

Raccourci de test : `http://localhost:8080/?play=snake1` (ou `snake2`, `god`, `demo`) lance directement une partie rapide.
Options du serveur : `MATCH_SECONDS=40` (partie courte), `COUNTDOWN_SECONDS=10` (compte à rebours), `PORT=8081`.

Si la connexion est perdue, l'IA prend le relais ; la page se reconnecte toute seule et le joueur retrouve son salon et son rôle (jeton conservé par onglet).

## Commandes

**Snake** (vue à la troisième personne, commandes relatives à la tête) :
- ← → (ou Q/D, A/D) : tourner à gauche / à droite
- ↑ ↓ (ou Z/S, W/S) : monter / descendre
- Mobile : glisser

**Snake God** (vue d'ensemble du cube) :
- 1 à 6 : Piège, Mur, Mur rotatif, Démolition, Déclencher, Zone dangereuse
- Clic : poser le pouvoir sur la cellule visée (aperçu violet = possible, rouge = impossible)
- ↑ ↓ ou Maj + molette : changer de couche (hauteur)
- R : changer l'axe
- Glisser : tourner la vue, molette : zoom

## Règles

- Bord du cube, mur, corps d'un Snake ou choc frontal : -1 PV puis réapparition ailleurs, avec 1,8 s d'invulnérabilité (le Snake clignote et traverse les autres Snakes).
- Piège : -1 PV, le piège disparaît, le Snake continue.
- Mur rotatif : pivote de 90° toutes les 2,2 s et écrase ce qui se trouve sur son passage (-1 PV).
- Zone dangereuse et impact de météore : -1 PV à qui s'y trouve une fois l'avertissement passé.
- 0 PV : Snake éliminé.
- Le dieu ne peut pas poser de piège ou de mur à une case ou moins d'une tête.
- **Les Snakes gagnent** si au moins un survit jusqu'à la fin du timer (3 min). **Le Snake God gagne** s'il les élimine tous avant.

Points :
- Snake : 10 par nourriture, 50 par fruit doré, 5 par segment à la fin, 100 s'il survit.
- Snake God : 25 par dégât causé par ses pouvoirs ou les événements, 100 par élimination, 200 en cas de victoire.

### Pouvoirs du Snake God

| Touche | Pouvoir | Coût | Phase | Effet |
|---|---|---|---|---|
| 1 | Piège | 15 | 1 | -1 PV au Snake qui passe dessus |
| 2 | Mur | 20 | 1 | Mur de 3 cases pendant 20 s |
| 3 | Mur rotatif | 45 | 2 | Lame de 5 cases qui pivote et écrase |
| 4 | Démolition | 10 | 1 | Détruit un mur ou un pilier : ouvre un passage |
| 5 | Déclencher | 25 | 2 | Déclenche tout de suite le prochain événement du monde |
| 6 | Zone dangereuse | 35 | 3 | Dalle de 3 × 3 qui brûle après 1,2 s d'avertissement |

### Vision divine (information exclusive)

Le Snake God, et lui seul, voit à l'avance le prochain événement du monde (type, emplacement, délai) et les 3 prochaines apparitions de nourriture. Le serveur n'envoie cette information qu'à lui.

Événements du monde (toutes les 16 à 24 s) : **fruit doré** (+50 points, +3 segments), **pluie de nourriture**, **pluie de météores** (impacts annoncés 1,5 s avant).

### Évolution des Snakes

| Palier | Taille | Apparence |
|---|---|---|
| I · Éclosion | 0 | Corps lisse, yeux lumineux |
| II · Chasseur | 7 | Nageoires dorsales |
| III · Prédateur | 13 | Pointes d'énergie, veines pulsantes |
| IV · Légende | 21 | Aura, halo, traînée intense |

### Phases

| Phase | Début | Nouveauté |
|---|---|---|
| 1 · Éveil | 0 % | Piège, Mur, Démolition |
| 2 · Colère | 25 % | Mur rotatif, Déclencher |
| 3 · Tempête | 50 % | Zone dangereuse, Snakes plus rapides |
| 4 · Chaos | 80 % | Vitesse maximale, recharge maximale |

La couleur du monde change à chaque phase. Tous les réglages sont dans `shared/config.js` et `shared/cosmetics.js`.

## IA

Les rôles sans joueur sont joués par l'IA, côté serveur, avec les mêmes règles que les humains (mêmes virages, même énergie, mêmes cooldowns).
- **Snake IA** : choisit à chaque tick parmi les 5 mouvements possibles ; évite murs, corps, pièges, zones et murs rotatifs sur le point de pivoter ; refuse les zones trop petites pour son corps ; va vers la nourriture. Elle a parfois un moment d'inattention.
- **Snake God IA** : vise le Snake le plus fragile ; pose des pièges sur son chemin vers la nourriture, des murs et des zones en travers de sa route, des murs rotatifs devant lui ; utilise sa vision divine pour déclencher les météores quand un Snake est dessous.
- Réglages dans `AI` (`shared/config.js`). Sur 40 parties 100 % IA, le dieu gagne environ 55 % du temps.

## Architecture

Le serveur fait autorité : les clients envoient seulement des intentions (virage, pouvoir). Chaque salon simule sa partie et diffuse l'état complet à chaque tick (avec la vision divine pour le Snake God uniquement). Le client interpole entre deux ticks.

```
shared/                   code commun serveur + client
  config.js               réglages du jeu, pouvoirs, phases, événements, IA
  cosmetics.js            espèces, accessoires, traînées, paliers d'évolution
  grid.js                 maths de grille (rotations, murs, zones)
  protocol.js             messages réseau
server/
  index.js                serveur HTTP (fichiers statiques) + WebSocket
  MultiplayerManager.js   connexions, profils, salons, reconnexion
  Room.js                 un salon : rôles, IA de remplacement, boucle de partie
  GameManager.js          cycle de partie, tick, collisions, victoire
  WorldGrid.js            cube, cellules libres
  SnakeController.js      déplacement et virages relatifs
  SnakeHealth.js          PV, invulnérabilité
  SnakeGrowth.js          croissance
  FoodSystem.js           nourriture, fruits spéciaux, prochaines apparitions
  WorldEventSystem.js     événements du monde planifiés à l'avance
  ZoneSystem.js           zones dangereuses et impacts de météores
  GodPowerSystem.js       World Energy, cooldowns, validation des pouvoirs
  TrapSystem.js           pièges
  WallSystem.js           piliers, murs temporaires, murs rotatifs
  ScoreManager.js         points et récapitulatif final
  ai/                     Navigation (vue du monde), SnakeAI, GodAI
client/
  main.js                 assemblage, passage menu/jeu, effets d'événements, boucle de rendu
  settings.js             paramètres et profil (navigateur)
  net/MultiplayerClient.js
  render/SnakeModel.js    modèle 3D du Snake : corps tubulaire, tête, accessoires, évolutions
  render/SnakeView.js     Snake en jeu : interpolation, traînée, rayon de visée
  render/WorldController.js  cube, cristaux, monolithes, lame rotative, mines, fruits, zones, météores, vision divine
  render/Environment.js   ciel, socle runique, poussières, lumières, couleur des phases
  render/PostFX.js        bloom
  render/Effects.js       particules et ondes de choc
  render/Cameras.js       caméra troisième personne, caméra du dieu, caméra des menus
  render/MenuStage.js     décor animé des menus et aperçu de personnalisation
  render/textures.js      textures procédurales (peaux, circuits, runes)
  input/SnakeInput.js     clavier / tactile des Snakes
  input/GodController.js  pouvoir, couche, axe, aperçu, clic
  ui/UIManager.js         menus et navigation
  ui/Hud.js               interface en jeu
  ui/EndScreen.js         écran de fin
test/                     tests des règles, de l'IA et du multijoueur (npm test)
```

Ajouter un pouvoir : le déclarer dans `POWERS` (`shared/config.js`), écrire sa validation et son exécution dans `GodPowerSystem`, son aperçu dans `GodController.previewCells` et son icône dans `client/ui/icons.js`.

## Prochaines étapes

Mur mobile, téléporteurs, rotation d'une partie du monde, événements de coopération (générateur à détruire, clé), sons et musique.
