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

## Mise en route (une seule fois)

### 1. Ouvrir la branche `games` dans Firebase
Le site réutilise le projet Firebase **flechettes-d54b1** (déjà sans login).
Il faut autoriser la lecture/écriture sous la branche `games` :

- Console Firebase → **Realtime Database** → onglet **Règles**
- Ajouter le bloc `games` (voir [`database.rules.example.json`](database.rules.example.json))
  à côté des règles existantes, puis **Publier**.

### 2. Tester en local
```bash
cd ~/Downloads/games
python3 -m http.server 8000
```
Ouvrir http://localhost:8000 dans **2 ou 3 onglets** pour simuler plusieurs
joueurs.

### 3. Déployer (Netlify)
Glisser le dossier sur Netlify (ou `netlify deploy`). Aucun build.

## Architecture
| Fichier | Rôle |
|---|---|
| `index.html` | Accueil : grille des jeux + rejoindre par code |
| `firebase-init.js` | Config Firebase (projet flechettes, branche `games`) |
| `lobby.js` | Moteur de salon : créer/rejoindre, identité, salle d'attente, démarrage auto |
| `presence.js` | Présence temps réel (qui est en ligne) |
| `avatars.js` | Palette de couleurs + liste d'émojis |
| `nav.js` | Barre du haut (accueil + thème clair/sombre) |
| `theme.css` | Palette + mode sombre + styles de lobby |
| `<jeu>.html` | Une page par jeu (logique du jeu) |

Chaque jeu s'enregistre via `GameRoom({ gameKey, name, minPlayers, maxPlayers, onState, onStart, … })`
et lit le salon via les helpers `window.Room.*`.

## Données Firebase
```
games/rooms/<CODE> = {
  game, status, host, createdAt,
  order: [pid, …],              // joueurs de la manche, dans l'ordre des tours
  players: { <pid>: { name, emoji, color, seat, online, ts, ready, … } },
  …état du jeu (board, turn, deck…)
}
```
