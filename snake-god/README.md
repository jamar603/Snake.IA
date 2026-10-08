# Snakora

**Snakora** : Snake 3D multijoueur à trois joueurs. **Simple à contrôler, difficile à maîtriser** : le Snake ne fait que tourner à gauche ou à droite, la complexité vient de la map.

Trois maps :
- **CUBE** (mode principal, l'identité de Snakora) : les Snakes rampent sur les 6 faces d'un cube de verre (grille lumineuse sur les faces) : le Snake God voit les Snakes sur toutes les faces, même derrière. Le passage d'une face à l'autre est automatique ; la caméra anticipe chaque arête. Le cube grandit de 7 à 13 cases de côté.
- **CUBE 3D** (version classique) : les Snakes volent dans tout le volume du cube, avec haut et bas en plus (↑ ↓). Le bord du cube est un mur ; le Snake God vise une couche (↑ ↓ ou Maj + molette) et choisit l'axe (R).
- **WORLD** (mode accessible) : un grand terrain plat en 3D (17 à 29 cases de côté), avec ruines, terrasses en relief et murets. Gameplay de Snake classique, bord = mur.

- **Snake 1** et **Snake 2** : survivre, manger, grandir, évoluer. 2 PV sur le CUBE, 3 PV sur WORLD.
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
  - **Solo contre l'IA** : choisis la map (Cube ou World), la durée (1:30, 2:00, 2:30, 3:00 ou illimitée) puis Snake ou Snake God ; l'IA joue les deux autres rôles.
  - **Multijoueur** : crée un salon (public ou privé) et partage son code de 4 lettres, ou rejoins un salon avec un code ou depuis la liste des salons publics. L'hôte choisit la map et la durée, puis lance la partie ; les rôles libres sont joués par l'IA.
  - **Démonstration IA** : regarde trois IA s'affronter.
- **Personnaliser** : nom, espèce (Néon, Magma, Venin, Spectre, Royal, Abysse), accessoire (cornes, couronne, crête, visière), traînée, avec un aperçu 3D et un aperçu de chaque palier d'évolution.
- **Paramètres** : qualité graphique, bloom, distance de la caméra, champ de vision, tremblements de l'écran, aide en jeu. Gardés dans le navigateur.
- **Fin de partie** : verdict, carte de résultats par joueur (score, longueur, survie, nourriture, dégâts, pièges), MVP, pouvoirs utilisés par le dieu ; Rejouer, Retour au salon ou Menu principal.

Raccourcis de test : `http://localhost:8080/?play=snake1` (ou `snake2`, `god`, `demo`) lance directement une partie rapide (ajouter `&map=volume` pour le Cube 3D classique, `&map=world` pour le terrain plat) ; `?menu=mode` (ou `online`, `customize`, `settings`) ouvre directement un écran.
En partie : bouton **Quitter** (ou Échap) à tout moment, avec confirmation ; l'IA prend ta place.

Options du serveur : `MATCH_SECONDS=40` (durée par défaut des salons ; 90 s sinon), `COUNTDOWN_SECONDS=10` (compte à rebours), `PORT=8081`.

Si la connexion est perdue, l'IA prend le relais ; la page se reconnecte toute seule et le joueur retrouve son salon et son rôle (jeton conservé par onglet).

## Commandes

**Snake** (vue à la troisième personne, commandes relatives à la tête) :
- ← → (ou Q/D, A/D) : tourner à gauche / à droite. Sur le CUBE, le Snake passe seul d'une face à l'autre
- ↑ ↓ (ou Z/S, W/S) : monter / descendre, seulement dans le CUBE 3D
- Espace (ou 1) : Sprint · E (ou 2) : Bouclier · F (ou 3) : Phase
- Flèches autour de la tête : rouge = mur juste derrière ce virage, ambre = peu de place
- Mobile : glisser à gauche / à droite (ou toucher la moitié gauche / droite de l'écran), et toucher les boutons de compétences

**Snake God** (vue d'ensemble) :
- 1 à 8 : Piège, Mur, Mur rotatif, Démolition, Déclencher, Zone dangereuse, Téléporteur, Expansion
- Clic directement sur une face du cube (ou sur le terrain) : poser le pouvoir (aperçu violet = possible, rouge = impossible, avec la raison)
- R : orientation des murs sur la face
- Glisser : tourner la vue, molette : zoom

## Règles

- Mur, obstacle, corps d'un Snake, choc frontal ou bord du terrain WORLD : -1 PV puis réapparition ailleurs, avec 1,8 s d'invulnérabilité (le Snake clignote et traverse les autres Snakes).
- Piège : -1 PV, le piège disparaît, le Snake continue.
- Mur rotatif : pivote de 90° toutes les 2,2 s et écrase ce qui se trouve sur son passage (-1 PV). Les cases balayées rougissent 0,7 s avant.
- Piège : ses pointes sortent et sa rune s'allume quand ton Snake approche.
- Zone dangereuse et impact de météore : -1 PV à qui s'y trouve une fois l'avertissement passé.
- 0 PV : Snake éliminé.
- Le dieu ne peut pas poser de piège ou de mur à une case ou moins d'une tête.
- **Les Snakes gagnent** si au moins un survit jusqu'à la fin du timer (1 min 30 par défaut). **Le Snake God gagne** s'il les élimine tous avant.
- **Partie illimitée** : pas de timer. Les Snakes gagnent quand l'un d'eux atteint la taille 150 ; le dieu gagne s'il les élimine tous. Phases et expansions suivent le rythme d'une partie de 3 min, puis le Chaos dure jusqu'à la fin.
- Partie courte : le dieu recharge son énergie plus vite (x2 en 1 min 30, x1 en 3 min).

Points :
- Snake : 10 par nourriture, 50 par fruit doré, 5 par segment à la fin, 100 s'il survit.
- Snake God : 25 par dégât causé par ses pouvoirs ou les événements, 100 par élimination, 200 en cas de victoire.

### Compétences des Snakes

| Touche | Compétence | Durée | Recharge | Effet |
|---|---|---|---|---|
| Espace / 1 | Sprint | 1,5 s | 12 s | Avance de 2 cases par tick |
| E / 2 | Bouclier | 3 s | 25 s | Bloque le prochain dégât |
| F / 3 | Phase | 1 s | 22 s | Traverse murs, pièges et corps (pas les bords ni les zones) |

### Pouvoirs du Snake God

| Touche | Pouvoir | Coût | Phase | Effet |
|---|---|---|---|---|
| 1 | Piège | 15 | 1 | -1 PV au Snake qui passe dessus |
| 2 | Mur | 20 | 1 | Mur de 3 cases pendant 20 s |
| 3 | Mur rotatif | 45 | 2 | Lame de 5 cases qui pivote et écrase |
| 4 | Démolition | 10 | 1 | Détruit un mur ou un pilier : ouvre un passage |
| 5 | Déclencher | 25 | 2 | Déclenche tout de suite le prochain événement du monde |
| 6 | Zone dangereuse | 30 | 3 | Dalle de 3 × 3 qui brûle après 1 s d'avertissement |
| 7 | Téléporteur | 25 | 2 | Portail sur la case visée, relié à une sortie sûre tirée au hasard (autre face, loin des Snakes, face à une voie libre), 18 s |
| 8 | Expansion | 40 | 2 | Agrandit le monde tout de suite |

Les murs, lames et dalles se posent sur la face visée et ne la dépassent jamais.

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

### Monde dynamique

Les deux maps grandissent pendant la partie : CUBE **7 → 9 → 11 → 13**, WORLD **17 → 21 → 25 → 29**. Chaque expansion se déclenche dès qu'un critère est atteint : temps écoulé, longueur cumulée des Snakes, ou place disponible (murs + corps / cases jouables) ; le Snake God peut aussi la forcer.

Équité : une nouvelle zone n'apparaît jamais sur un Snake. Sur le CUBE, le bloc grossit et tout ce qui est en surface glisse vers l'extérieur avec lui ; les nouvelles cases naissent aux arêtes, et un corps à cheval sur une arête est recollé. Sur WORLD, le terrain s'étend sur ses bords. Les nouveaux obstacles ne sont jamais à moins de 3 cases d'une tête, ni sur sa route. Un temps minimum par étape garde une montée progressive (les seuils de temps sont des fractions de la durée de la partie).

Une expansion dure 2,8 s : annonce « WORLD EXPANSION », contour fantôme à la future taille qui pulse de plus en plus vite, puis le monde grandit, de nouveaux obstacles apparaissent dans les nouvelles zones et la nourriture devient plus abondante.

### Son

Tout le son est synthétisé en direct (Web Audio API), sans fichier audio, dans un style arcade sci-fi / darksynth : synthèse FM cristalline, supersaws, sub-basses, glitch numérique, écho stéréo calé sur le tempo, réverbération, compression et égalisation sur le master.

- **Musique dynamique** générative : nappe supersaw, arpège à écho, sub-basse, grosse caisse avec effet de pompe (sidechain), charleston, basse roulante (basse "reese" en mode chaos), clap, mélodie thème, roulements de toms et montées de tension. Les couches entrent et sortent en fondu, le tempo accélère (92 → 148 BPM) et l'harmonie s'assombrit : exploration (phase 1), croissance (phase 2), danger (phase 3), chaos (phase 4), puis tension maximale dans les 20 dernières secondes. Les changements de phase et les expansions déclenchent une montée de filtre puis un impact musical. L'intensité dépend aussi de la taille des Snakes, des expansions et du danger.
- **Combo** : des repas enchaînés font monter la note du son "pickup".
- **Expansion du cube** : montée de tension, pulsations d'activation qui accélèrent, crépitements de construction, impact final.
- **Snakes** : déplacement, manger, fruit doré, croissance, évolution, perte de PV, récupération de PV, collision, piège, réapparition, mort. Chaque son varie légèrement à chaque fois.
- **Snake God** : signature grave et réverbérée, un son reconnaissable par pouvoir (piège, mur, mur rotatif et ses rotations, démolition, zone, déclenchement).
- **Vision divine** : une cloche cristalline, entendue par le Snake God seul, signale chaque nouvelle révélation.
- **Danger** : battement de cœur discret quand un piège, une zone ou une lame est tout proche, ou quand il ne reste qu'un PV. Le bourdon d'ambiance gronde à mesure que le monde approche de sa taille maximale.
- **Audio spatial 3D** (HRTF) : pièges, murs, pouvoirs, impacts et événements sont placés dans l'espace ; l'auditeur suit la caméra.
- **Fin de partie** : fanfare (victoire des Snakes), chœur sombre (victoire du dieu), descente douce (défaite), cloche (fin du timer), sting d'élimination. Un annonceur (synthèse vocale du navigateur) annonce phases, expansions, 20 dernières secondes et résultat.
- **Paramètres** : volume général, musique, effets, ambiance, voix ; coupure séparée de chaque catégorie (musique, ambiance, voix, effets, Snakes, Snake God, monde, interface).

Le son démarre au premier clic ou à la première touche (règle des navigateurs).

Le fruit doré rend aussi 1 PV (sans dépasser le maximum).

## IA

Les rôles sans joueur sont joués par l'IA, côté serveur, avec les mêmes règles que les humains (mêmes virages, même énergie, mêmes cooldowns).
- **Snake IA** : choisit à chaque tick parmi les 3 mouvements possibles (tout droit, gauche, droite) ; évite murs, corps, pièges, zones et murs rotatifs sur le point de pivoter ; refuse les zones trop petites pour son corps ; va vers la nourriture. Elle a parfois un moment d'inattention.
- **Snake God IA** : vise le Snake le plus fragile ; pose des pièges sur son chemin vers la nourriture, des murs et des zones en travers de sa route, des murs rotatifs devant lui ; utilise sa vision divine pour déclencher les météores quand un Snake est dessous.
- Réglages dans `AI` (`shared/config.js`). Sur 40 parties 100 % IA de 1 min 30, le dieu gagne environ 30 % du temps sur le CUBE et 18 % sur WORLD (60 % sur le CUBE en 3 min). Simulation : `node test/balance.mjs 40 90 cube` ; coût serveur : `node test/perf.mjs`.

## Architecture

Le serveur fait autorité : les clients envoient seulement des intentions (virage, pouvoir). Chaque salon simule sa partie et diffuse l'état complet à chaque tick (avec la vision divine pour le Snake God uniquement). Le client interpole entre deux ticks.

```
shared/                   code commun serveur + client
  config.js               réglages du jeu, pouvoirs, phases, événements, IA
  cosmetics.js            espèces, accessoires, traînées, paliers d'évolution
  grid.js                 maths de grille (rotations, murs, zones)
  maps/CubeWorld.js       CUBE : cellules de surface, normales, passage des arêtes, agrandissement
  maps/VolumeWorld.js     CUBE 3D (classique) : volume, 6 directions, bords
  maps/FlatWorld.js       WORLD : terrain plat, bords
  maps/index.js           createMap(kind) : même topologie côté serveur et côté client
  protocol.js             messages réseau
server/
  index.js                serveur HTTP (fichiers statiques) + WebSocket
  MultiplayerManager.js   connexions, profils, salons, reconnexion
  Room.js                 un salon : rôles, IA de remplacement, boucle de partie
  GameManager.js          cycle de partie, tick, collisions, victoire
  MapManager.js           map de la partie (topologie), cellules libres, voies libres
  SnakeController.js      déplacement et virages relatifs
  SnakeHealth.js          PV, invulnérabilité
  SnakeGrowth.js          croissance
  FoodSystem.js           nourriture, fruits spéciaux, prochaines apparitions
  WorldEventSystem.js     événements du monde planifiés à l'avance
  DynamicWorldManager.js  monde dynamique : déclenchement et agrandissement sans injustice
  TeleporterSystem.js     portails du dieu
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
  render/WorldController.js  cube de verre et sa grille / bordure du terrain, obstacles, lames, mines, portails, fruits, zones, météores
  render/Environment.js   ciel, socle runique, poussières, lumières, couleur des phases
  render/PostFX.js        bloom
  render/Effects.js       particules et ondes de choc
  render/Cameras.js       CameraController : caméra Snake (anticipe les arêtes), caméra du dieu, caméra des menus
  render/MenuStage.js     décor animé des menus et aperçu de personnalisation
  render/textures.js      textures procédurales (peaux, circuits, runes)
  input/SnakeInput.js     clavier / tactile des Snakes
  input/GodController.js  pouvoir, clic sur la surface, orientation, aperçu
  audio/AudioManager.js   contexte audio, bus par catégorie, réverbération, audio spatial, annonceur
  audio/Music.js          musique générative en couches
  audio/Ambient.js        vent cosmique et bourdon
  audio/GameAudio.js      événements du jeu -> sons, intensité, danger, vision divine
  audio/sounds/           recettes sonores : snake, god, world, ui
  audio/synth.js          primitives de synthèse
  ui/UIManager.js         menus et navigation
  ui/Hud.js               interface en jeu
  ui/EndScreen.js         écran de fin
test/                     tests des règles, de l'IA et du multijoueur (npm test)
```

Ajouter un pouvoir : le déclarer dans `POWERS` (`shared/config.js`), écrire sa validation et son exécution dans `GodPowerSystem`, son aperçu dans `GodController.previewCells` et son icône dans `client/ui/icons.js`.

## Prochaines étapes

Mur mobile, rotation d'une face du cube, événements de coopération (générateur à détruire, clé). Le téléporteur et l'expansion forcée n'ont pas encore de signature sonore propre.
