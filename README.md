# 🎲 Les jeux — site de jeux entre copains

Un petit site de jeux multijoueurs **sans compte / sans login**. On crée un
salon, on partage un **code** (ou le lien), chacun entre son **prénom + un émoji**
et c'est parti. Tout est statique (HTML/CSS/JS) + Firebase Realtime Database pour
la synchro temps réel.

## Comment ça marche
1. Page d'accueil → on choisit un jeu.
2. **Créer une partie** → un code à 4 lettres est généré.
3. On partage le code (ou le lien `…?room=CODE`) aux copains.
4. Chacun choisit un émoji + un prénom → salle d'attente.
5. Quand tout le monde clique **Prêt**, la partie démarre toute seule.

## Modes de jeu
- **En ligne** : plusieurs appareils, un code de salon partagé (défaut).
- **Solo (contre l'ordi)** ✈️ : un humain + des ordis, 100 % hors-ligne.
- **Local (même appareil)** ✈️ : on se passe le téléphone, chacun son tour.

### Ordis & difficulté
- Dans **chaque salon** (en ligne et hors-ligne), on règle le **niveau des
  ordis** : **Facile / Moyen / Difficile**.
- En ligne, l'**hôte** peut **ajouter / retirer des ordis** pour compléter une
  partie (ils sont pilotés par l'hôte ; aucun impact si on n'en ajoute pas).
- Les IA des jeux de réflexion (Puissance 4, Morpion, Othello) utilisent une vraie
  recherche (négamax α-β + table de transposition + approfondissement itératif) ;
  en « difficile » elles jouent très fort. Les jeux à heuristique
  (Skyjo, Uno, Président, Ludo, Blokus, Cluedo, Bataille navale, Papayoo, Trio,
  6 qui prend…) ont une IA dédiée, plus ou moins faillible selon le niveau.
- Après une partie, **🔍 Revoir le plateau** affiche l'état final (coup gagnant,
  positions…) avant de revenir aux résultats.

## Les jeux


<!-- GAMES:START (généré par tools/gen-readme.js — ne pas éditer à la main) -->

| Jeu | Joueurs | Hors-ligne | Type |
|---|---|:---:|---|
| 🎉 Mode Soirée | 2–8 |  | tournoi multi-jeux |
| 📝 Petit bac | 2–12 |  | mots |
| 🔴 Puissance 4 | 2 | ✈️ | réflexion (IA forte) |
| ⚫ Reversi | 2 | ✈️ | réflexion (IA forte) |
| 🔴 Dames | 2 | ✈️ | réflexion (IA forte) |
| ✨ Dobble | 2–8 |  | rapidité |
| ⚡ Crack-list | 2–8 |  | mots |
| 🔍 Lynx | 2–12 |  | observation |
| 🎨 Pictionary | 2–12 |  | dessin |
| 🂡 Blackjack | 1–6 | ✈️ | cartes / 21 |
| ♠️ Poker | 2–6 | ✈️ | cartes / Texas Hold'em |
| 🃏 Uno | 2–8 | ✈️ | cartes |
| 🎴 Skyjo | 2–8 | ✈️ | cartes |
| 🧩 Blokus | 2–4 | ✈️ | placement |
| 🚢 Bataille navale | 2 | ✈️ | déduction |
| 🕵️ Codenames | 4–8 |  | mots / équipes |
| ⭕ Morpion | 2 | ✈️ | réflexion |
| 🕵️‍♂️ Undercover | 3–12 |  | déduction sociale |
| 🤵 Président | 3–8 | ✈️ | cartes |
| 🐴 Petits chevaux | 2–4 | ✈️ | plateau / dés |
| 💰 Le juste prix | 2–8 | ✈️ | déduction |
| 🖍️ Gartic Phone | 3–10 |  | dessin |
| 🏠 Monopoly | 2–6 | ✈️ | plateau |
| 🔎 Cluedo | 2–6 | ✈️ | déduction (plateau) |
| 🐔 Papayoo | 3–6 | ✈️ | plis |
| 🔢 Trio | 3–6 | ✈️ | mémoire |
| 🐮 6 qui prend ! | 2–10 | ✈️ | cartes simultanées |
| 🎯 Mastermind | 1–8 | ✈️ | déduction (IA solveur) |
| 🧠 The Mind | 2–6 | ✈️ | coopératif / timing |
| 🔢 2048 | 1–6 | ✈️ | puzzle / course (IA) |
| 9️⃣ Sudoku | 1–6 | ✈️ | solo + course (chrono) |
| 👑 Queens | 1–6 | ✈️ | solo + course (chrono) |
| 🌙 Tango | 1–6 | ✈️ | solo + course (chrono) |
| 🔗 Zip | 1–6 | ✈️ | solo + course (chrono) |
| 🧩 Patches | 1–6 | ✈️ | solo + course (chrono) |
| 🟥 Sutom | 1–6 | ✈️ | mot mystère (chrono) |
| 🃏 Solitaire | 1–6 | ✈️ | cartes solo (chrono) |
| 🃏 Balatro | 1 | ✈️ | roguelike poker (solo) |
| 🚗 Mille Bornes | 2–4 | ✈️ | cartes / course |
| 🐺 Loup-Garou | 4–12 | ✈️ | déduction sociale (IA) |
| ⏱️ Time's Up | 4–12 | ✈️ | équipes (4 min · + solo chrono) |
| 💰 La Bonne Paye | 2–6 | ✈️ | gestion / cartes |
| 💎 Diamants | 2–8 | ✈️ | stop-ou-encore |
| 🎲 Perudo | 2–6 | ✈️ | dés / bluff |
| 🚂 Aventuriers du Rail | 2–5 | ✈️ | plateau / réseau |
| 🙅 No Thanks! | 2–7 | ✈️ | stop-ou-encore |
| 🎲 Qwixx | 1–5 | ✈️ | dés / roll-and-write |
| 🎲 Yam's | 1–6 | ✈️ | dés / combinaisons |

<!-- GAMES:END -->

## Mise en route (une seule fois)

### 1. Activer l'authentification anonyme
Le site réutilise le projet Firebase **flechettes-d54b1**. Les salons en ligne
exigent désormais un `auth.uid` (anonyme, invisible pour le joueur) : il faut donc
activer l'authentification anonyme, sinon **toutes les écritures en ligne sont
refusées** par les règles.

- Console Firebase → **Authentication** → **Sign-in method** → activer **Anonyme**.

L'UX reste « sans login » : la connexion anonyme se fait automatiquement au
chargement. Le mode hors-ligne (avion) n'est jamais concerné.

### 2. Ouvrir la branche `games` dans Firebase
Il faut autoriser la lecture/écriture sous la branche `games` :

- Console Firebase → **Realtime Database** → onglet **Règles**
- Publier le bloc `games` (voir [`database.rules.json`](database.rules.json))
  à côté des règles existantes.

### 3. Tester en local
```bash
cd ~/Downloads/games
python3 -m http.server 8000
```
Ouvrir http://localhost:8000 dans **2 ou 3 onglets** pour simuler plusieurs
joueurs.

### 4. Déployer (Netlify)
Glisser le dossier sur Netlify (ou `netlify deploy`). Aucun build.

## Architecture
| Fichier | Rôle |
|---|---|
| `index.html` | Accueil : grille des jeux + rejoindre par code |
| `firebase-init.js` | Config Firebase (projet flechettes, branche `games`) |
| `lobby.js` | Salon : créer/rejoindre, identité, salle d'attente, démarrage auto, **difficulté + ordis en ligne**, **revoir le plateau** |
| `offline.js` | Moteur HORS-LIGNE (solo vs ordis + local), rejoue la logique de chaque jeu |
| `presence.js` | Présence temps réel (qui est en ligne) |
| `avatars.js` | Palette de couleurs + liste d'émojis |
| `nav.js` | Barre du haut (accueil + thème clair/sombre) |
| `head.js` / `common.js` | En-tête HTML commun + bundle des scripts partagés (généré par `tools/gen-common.js`) |
| `theme.css` / `game.css` | Palette + mode sombre + coquille commune des jeux |
| `p4-ai.js` / `morpion-ai.js` / `othello-ai.js` / `dames-ai.js` | Cœurs d'IA purs (réutilisés par la page **et** le benchmark) |
| `monopoly-engine.js` / `cluedo-engine.js` | Moteurs de règles purs (sans DOM) |
| `games/<jeu>.html` | Une page par jeu (logique + rendu) — toutes regroupées dans `games/` |
| `tools/check.js` | Vérifs CI : syntaxe JS, cohérence index/sw, JSON |
| `tools/bench.js` | Banc d'essai des IA (auto-jeu headless, seuils de victoire en CI) |

Chaque jeu s'enregistre via `GameRoom({ gameKey, name, minPlayers, maxPlayers, onState, onStart, offline, bot, … })`
et lit le salon via les helpers `window.Room.*`. Les ordis lisent le niveau via
`window.Bots.level(state)`.

## Données Firebase
```
games/rooms/<CODE> = {
  game, status, host, createdAt, difficulty,
  order: [pid, …],              // joueurs de la manche, dans l'ordre des tours
  players: { <pid>: { name, emoji, color, seat, online, ts, ready, isBot?, … } },
  …état du jeu (board, turn, deck…)
}
```

## Outils / qualité
```bash
node tools/check.js          # syntaxe + cohérence (rapide, lancé en CI)
node tools/gen-readme.js     # régénère le tableau des jeux depuis index.html
node tools/bench.js          # banc d'essai des IA (~1 min)
node tools/bench.js --full   # plus de parties, profondeur de jeu réelle
node tools/bench-playus.js   # smoke test des mini-jeux Playus (charge + démarre)
```
Le tableau « Les jeux » ci-dessus est **généré** depuis le catalogue `GAMES` de
`index.html` (source unique). Ne l'édite pas à la main : modifie `index.html` puis
lance `node tools/gen-readme.js`. La CI échoue si le README n'est pas à jour.

### Hook pre-commit (recommandé)
Pour ne plus jamais oublier de régénérer les fichiers dérivés (`sw.js`, `README.md`,
`common.js`) avant de committer — première cause de CI rouge — active le hook fourni,
**une fois par clone** :
```bash
git config core.hooksPath .githooks
```
Il régénère automatiquement ces fichiers, les ré-indexe et lance `tools/check.js`
avant chaque commit.
Le benchmark vérifie que les bots « difficile » écrasent l'aléatoire/facile et ne
perdent jamais au morpion — garde-fou contre les régressions d'IA.

## Sécurité (modèle & limites)
Le site est **sans login visible** par choix (on partage un code, on joue). Sous le
capot, chaque appareil obtient un `auth.uid` **anonyme** (connexion automatique et
invisible) : c'est le mode **nominal** (`GAMES_USE_AUTH = true` dans
[`firebase-init.js`](firebase-init.js)). La sécurité repose sur les **règles de la
base** (voir [`database.rules.json`](database.rules.json)), qui exigent `auth != null`.

**Prérequis :** l'auth anonyme doit être **activée** dans la console Firebase
(voir « Mise en route » plus haut), sinon les écritures en ligne sont refusées.

**Ce que les règles protègent :**
- lecture/écriture réservées aux sessions authentifiées (`auth != null`) — bloque le
  vandalisme par script anonyme ;
- écriture limitée à `games/rooms/*` (aucune donnée parasite ailleurs sous `games`,
  via `$other: false`) ;
- longueurs bornées des codes de salon, pseudos, émojis et couleurs (anti-spam / anti-gonflement de la base) ;
- chemins privés par joueur sous `games/private/<code>/<uid>` (lisibles/écrivables
  seulement par leur propriétaire) ;
- index `createdAt` pour le nettoyage des vieux salons.

**Limites assumées (inhérentes au « sans login ») :**
- un joueur **déjà dans un salon** peut lire l'état complet du salon — donc, pour les
  jeux à information cachée (Cluedo, Uno, Skyjo, Président, Papayoo, Trio, 6 qui
  prend, Codenames…), un joueur curieux peut techniquement **tricher** en lisant la base
  (sauf pour les données passées par les chemins privés) ;
- l'auth anonyme n'exige aucune preuve d'identité : quelqu'un qui **devine un code**
  à 4 lettres peut toujours rejoindre et écrire dans ce salon (pas d'anti-grief fort).

**Durcissement possible :** lier chaque `players/<pid>` à son `auth.uid` dans les
règles pour empêcher d'écrire à la place des autres, et étendre l'usage des chemins
privés (`games/private/*`) pour masquer les mains aux co-joueurs.

## Idées de jeux à ajouter
Des jeux qui collent au format (multi sans login, mobile, parties courtes, IA possible) :

**Cartes / familial** : Skull King, Sushi Go!, Rami, Belote / Coinche, Love Letter.
**Réflexion 2 joueurs (IA forte)** : Awalé (Oware), Quarto, Onitama. ✅ _Othello et Dames déjà ajoutés._
**Dés** : Yam's (Yahtzee), 421, Cochon qui rit.
**Soirée / déduction** : Just One (coopératif d'indices), Concept, Saboteur.
**Mots / solo** : Motus / Wordle, Le Pendu, Démineur.
