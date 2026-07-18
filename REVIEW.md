# 🔍 Revue complète du site — juillet 2026

> Revue faite en jouant réellement : ~45 pages lancées dans un navigateur (mobile 390 px
> et PC 1280 px, thème clair **et** sombre), parties solo démarrées contre les ordis,
> captures d'écran à l'appui, plus lecture du code (lobby.js, offline.js, sw.js, les
> pages de jeu). `node tools/check.js` passe ✅ et **aucune erreur JS** n'est apparue
> sur les ~45 pages testées.

---

## ✅ Déjà corrigé dans cette passe (juillet 2026)

1. **Cartes injouables en mode sombre** — remplacé l'`opacity` (qui laissait passer
   le fond noir et rendait les cartes ternes/bordeaux) par une **désaturation opaque**
   (`filter: grayscale`) : les couleurs restent identiques en clair et en sombre,
   les cartes jouables ressortent. Fait sur **Uno**, **Mille Bornes**, **Président**.
   (Skyjo : ses couleurs étaient déjà fixées par tranche de valeur — rien à changer.)
2. **En-têtes mobiles tronqués** — **Puissance 4** et **Reversi** passent sur 2 rangées
   sous 470 px (tour en haut, scores centrés dessous) → « À toi de jouer » ne se coupe plus.
3. **Coins du Monopoly illisibles sur mobile** — émoji au-dessus + libellé compact
   dessous (Départ / Prison / Parc / En prison) au lieu du texte inline rogné (« riso! »).
4. **Layout PC des jeux de cartes** — **Uno**, **Skyjo** et **Président** exploitent
   maintenant la largeur sur grand écran : adversaires étalés en haut, table agrandie,
   main de cartes plus grande répartie sur toute la largeur (fini la colonne mobile
   perdue dans le vide).
5. **Salle d'attente enrichie** (tous les jeux, via `lobby.js`) :
   **▶ Lancer maintenant** (l'hôte démarre sans attendre les retardataires),
   **✕ retirer un joueur** (l'hôte exclut un squatteur — le joueur exclu est ramené
   à l'accueil), et un **rappel repliable des « Règles rapides »** pour ceux qui
   rejoignent par lien sans passer par l'écran d'accueil.

Vérifié en jouant : captures mobile + PC, clair + sombre, et **0 erreur JS** sur les
7 jeux modifiés. Reste à faire : QR code du salon, réordonnancement des sièges,
options de fidélité (flotte navale classique, dames 10×10, enchères Monopoly, rôles
Loup-Garou), et l'extension du layout PC aux autres jeux de cartes.

---

## Verdict global

Le projet est **impressionnant** : 49 jeux + 42 mini-jeux Playus, une coquille commune
cohérente (lobby, thème, sons, stats, accessibilité), un moteur hors-ligne qui rejoue la
vraie logique de chaque jeu (zéro règle dupliquée), des IA sérieuses et benchmarkées en
CI. La qualité d'ensemble est très au-dessus du « petit site entre copains » : c'est
propre, rapide, et la plupart des jeux sont **fidèles aux mécaniques réelles**.

Ce qui ressort comme axes de progrès, par ordre d'impact :
1. **Le PC est sous-exploité** : presque tous les jeux affichent la colonne mobile
   centrée dans un grand vide (sauf Monopoly, très bien avec son panneau latéral).
2. **Les couleurs « objets de jeu » changent avec le thème** : cartes Uno rouge/jaune
   qui virent bordeaux/olive en sombre. Un objet de jeu devrait garder sa couleur.
3. Quelques **débordements mobiles** (coins du Monopoly, en-têtes Puissance 4/Reversi).
4. Le **lobby est très bon** mais peut accueillir plus de réglages « règles maison ».
5. Le **hors-ligne est exemplaire** — quelques incohérences d'affichage à régler.

---

## ✅ Ce qui est déjà très bon (à garder tel quel)

- **Lobby sans compte** : code 5 lettres lisible (sans I/O/0/1), lien partageable,
  identité prénom+émoji mémorisée, démarrage auto quand tout le monde est prêt,
  migration d'hôte, mode spectateur, bandeau « joueur absent » avec *Passer* /
  *Remplacer par un ordi*, palmarès du salon (séries de victoires 🔥), réactions émoji.
- **Ordis** : nombre / niveau / vitesse réglables partout, pilotés par l'hôte en ligne,
  curseur de vitesse flottant en jeu — c'est mieux que beaucoup d'applis payantes.
- **Hors-ligne** : SW qui précache les ~120 fichiers (pages, IA, polices auto-hébergées),
  indicateur « Prêt pour l'avion » avec bouton *Préparer*, reprise de partie interrompue,
  défi du jour à graine locale. Testé réseau coupé : les pages se chargent et jouent.
- **Cohérence visuelle** : palette crème/terracotta chaleureuse, mode sombre soigné,
  tables « feutre » qui restent identiques dans les deux thèmes (exactement le bon
  réflexe — cf. point n°2 ci-dessous à généraliser), `prefers-reduced-motion` respecté,
  couche a11y automatique (ARIA, aria-live) : rare et précieux.
- **Outillage** : check.js, benchs d'IA avec seuils en CI, générateurs (README, SW,
  common.js), hook pre-commit. Le README est excellent.

---

## 🎨 Chantiers transverses (tous les jeux)

### 1. Desktop : utiliser la largeur
Sur PC, Uno/Skyjo/Président/etc. = colonne de ~640 px au centre, deux tiers de l'écran
vides. Monopoly montre la bonne recette : **plateau/table à gauche, panneau joueurs +
actions à droite**. À généraliser au moins pour les jeux de cartes multi-joueurs :
adversaires disposés autour de la table (haut/côtés), ta main en bas — c'est aussi ce
qui rapproche le plus du « vrai » jeu physique.

### 2. Couleurs de jeu invariantes au thème
Les cartes/pions passent par les variables de thème : en sombre, les cartes Uno rouges
deviennent bordeaux, les jaunes olive (screenshot uno-mobile-dark). Le feutre, lui,
reste identique — c'est la bonne règle : **le chrome du site s'adapte au thème, les
objets de jeu gardent leurs couleurs saturées** (un jeu de cartes est le même le soir).
Jeux concernés repérés : Uno (net), Skyjo (léger), Mille Bornes (cartes grisées).
NB : le grisage des cartes **injouables** est un excellent repère UX — à garder, mais
en baissant l'opacité plutôt qu'en changeant la teinte.

### 3. En-têtes mobiles qui débordent
- Puissance 4 : « À toi de jou… » tronqué par les scores sur 390 px.
- Reversi : « À … » idem (le libellé de tour disparaît sous les compteurs).
- **Monopoly mobile : les 4 coins sont illisibles** (« Prison ! » → « riso! », « Départ »
  coupé). Sur mobile, mettre l'icône seule (🏁 ⛓ 🅿️ 🚓) et le libellé en dessous en
  0.5rem, ou en biais comme sur le vrai plateau.
- Règle simple : sous 420 px, l'en-tête passe sur 2 lignes (tour puis scores) ou les
  scores deviennent des pastilles compactes.

### 4. État de chargement
Quand Firebase est lent/injoignable, l'accueil d'un jeu reste **blanc jusqu'à 2,5 s**
(le repli `whenGamesAuth`). Afficher tout de suite l'écran d'accueil avec un petit
« connexion… » sur les boutons Créer/Rejoindre serait plus rassurant (les boutons
hors-ligne, eux, peuvent être actifs immédiatement).

### 5. Contrastes ponctuels
- **La Bonne Paye (clair)** : la légende du calendrier (`.lp-legend`, `--ink-light`)
  est posée sur le fond bleu du calendrier → quasi illisible. En sombre ça passe.
  Mettre la légende **sous** la carte bleue ou en blanc à 85 %.
- Vérifier aussi les petits libellés Caveat sur feutre (souvent OK grâce à
  `.felt-label`, mais quelques pages posent du `--ink-light` sur feutre).

---

## 🛋️ Le lobby : constat et réglages à ajouter

### Constat
Le flux Créer → identité → salle d'attente → prêt → démarrage auto est limpide, et le
fait que 14 jeux aient déjà des réglages dédiés (seuils Skyjo/Papayoo/6 qui prend,
manches + **règles maison Uno** (cumul +4, 7-0, jump-in — bravo), jetons Blackjack,
durée Monopoly, chrono de tour, ordis) est un vrai plus. Rien d'anti-intuitif relevé.

### Améliorations génériques (une fois dans lobby.js, tous les jeux en profitent)
| Idée | Pourquoi |
|---|---|
| **Bouton hôte « Lancer maintenant »** | Aujourd'hui il faut que *tous* cliquent Prêt ; avec un copain AFK, on attend. L'hôte pourrait forcer (en excluant les non-prêts ou en les passant ordis). |
| **Exclure un joueur (hôte)** | Anti-squatteur/anti-erreur — il n'y a aucun moyen de sortir quelqu'un d'un salon. |
| **QR code du salon** | On joue surtout en présentiel : un QR à scanner va plus vite que taper un code. (Générable en pur JS local, hors-ligne OK.) |
| **Réordonner les sièges** (drag ou flèches, hôte) | L'ordre des tours = ordre d'arrivée, or à table on veut souvent recoller à l'ordre réel des chaises. |
| **Équipes visibles dans le lobby** (jeux d'équipe : Codenames, Time's Up) | Composer les équipes *avant* de lancer, en glissant les avatars, plutôt que de subir la répartition auto. |
| Rappel des « Règles rapides » aussi en salle d'attente | Elles n'existent que sur l'écran d'accueil ; les retardataires qui rejoignent par lien ne les voient jamais. |

### Réglages par jeu qui manquent (les plus demandés en vrai)
- **Uno** : nombre de cartes de départ (5/7/10) ; mode « points » (compter les mains).
- **Poker** : montée des blinds (lente/normale/rapide), cave de départ.
- **Président** : variantes *ta-gueule*, échange de cartes Président↔Trou (si absent),
  nombre de manches.
- **Monopoly** : enchères on/off, argent au Parc gratuit (règle maison), cash de départ.
- **Bataille navale** : choix de flotte **classique 5/4/3/3/2** vs actuelle (porte-avions
  2×4) — les puristes tiqueront sur le rectangle.
- **Dames** : option **10×10 « internationales »** (c'est LA variante française) avec
  prise majoritaire obligatoire et dames volantes.
- **Loup-Garou** : cocher les rôles (il y a Voyante/Sorcière/Chasseur — ajouter Cupidon,
  Petite fille, Salvateur…) et le nombre de loups.
- **Skyjo** : nombre de manches vs seuil (déjà seuil ✓) ; règle « colonne » on/off.
- **Sudoku** : le réglage de taille existe ✓ — ajouter un toggle « notes crayon ».
- **Codenames** : dictionnaires thématiques (films, bouffe…), taille de grille.

---

## ✈️ Hors-ligne : verdict

**Oui, c'est réellement 100 % jouable dans l'avion** pour les 40 jeux marqués ✈️ :
- SW précache tout (pages + IA + polices + icônes), versionné par empreinte de contenu ;
- `ignoreSearch` géré (naviguer vers `?mode=solo` hors-ligne sert bien la page) ;
- Firebase absent → shim silencieux ; polices auto-hébergées → rendu identique ;
- reprise de partie interrompue, défi du jour, stats locales : tout marche sans réseau.
- L'indicateur « Prêt pour l'avion » avec préchargement forcé est exactement ce qu'il
  faut. Testé réseau coupé (CDN Firebase bloqué) : aucun blocage.

Petites retouches :
1. **Time's Up** : la carte de l'accueil annonce « + solo chrono » et le badge ✈️, mais
   `?mode=solo` répond « Le mode solo n'est pas disponible » (seul le local l'est —
   le code du solo chrono existe pourtant dans la page). Soit brancher
   `offline:{solo:true}`, soit retirer « solo chrono » du catalogue.
2. Les 9 jeux **en ligne seulement** (Petit bac, Codenames, Pictionary, Gartic,
   Dobble, Lynx, Crack-list, Undercover, Soirée) ne disent nulle part *sur leur propre
   page* qu'il faut du réseau — le badge n'existe que sur l'accueil. Une ligne « 🌐
   nécessite une connexion » sous le titre éviterait la surprise en avion.
3. Proposer le widget « Prêt pour l'avion » aussi dans le menu d'un jeu (pas seulement
   tout en bas de l'accueil) — c'est le réflexe de dernière minute à l'embarquement.

---

## 🎲 Revue jeu par jeu

Format : ✔ ce qui est fidèle/réussi · → ce que j'améliorerais.

### Réflexion & logique
- **Puissance 4** ✔ plateau bleu classique, coups légaux évidents, IA négamax redoutable.
  → jeton « fantôme » au-dessus de la colonne visée + chute avec rebond ; surligner les
  4 pions gagnants ; en-tête mobile tronqué (cf. transverse n°3).
- **Reversi** ✔ pastilles des coups légaux, comptage en tête. → animation de
  retournement (flip) des pions capturés — c'est le plaisir n°1 du jeu réel ; en-tête
  mobile serré.
- **Dames** ✔ 8×8 net, prises enchaînées. → variante 10×10 internationale (cf. lobby) ;
  couronne plus visible sur les dames ; indiquer la prise obligatoire quand il y en a une.
- **Morpion** ✔ efficace. → RAS ; bonus éventuel : morpion « ultimate » 9 grilles.
- **Mastermind** ✔ 6 couleurs/4 trous, solveur. → feedback avec les pions rouges/blancs
  classiques bien distincts ; options lobby : 5 trous, couleurs répétées oui/non.
- **Sudoku / Queens / Tango / Zip / Patches** ✔ suite « puzzle quotidien » exemplaire
  (chrono, défi du jour, série, course en ligne, tailles réglables). → Sudoku : mode
  notes ; Queens/Tango : déjà au niveau des originaux du genre.
- **2048** ✔ tuiles beiges classiques, swipe + flèches + boutons. → vérifier l'anim
  « pop » de fusion ; afficher le meilleur score sur l'écran de jeu.
- **Yam's** ✔ feuille complète (section haute, bonus 63→35, combinaisons), vrais dés à
  points. → verrouillage visuel des dés gardés bien marqué ; proposer 2 colonnes
  (montante/libre) en variante.

### Cartes
- **Solitaire** ✔ Klondike propre, indice/annuler, chrono. → option tirage 3 cartes ;
  auto-complétion quand tout est retourné.
- **Balatro** ✔ la boucle est là : antes 1→8, petit/grand/boss blind avec effets,
  récompenses, jokers, paquets célestes, police pixel — très convaincant. → le « crépitement »
  du score (jetons × mult qui s'incrémentent carte par carte) est l'âme du jeu réel :
  si l'anim n'est pas encore là, c'est LE truc à ajouter ; prévisualiser la main de
  poker détectée pendant la sélection.
- **Blackjack** ✔ mises avec présets, double, split. → assurance en option ; montrer la
  main du croupier qui se complète carte à carte avec pause dramatique.
- **Uno** ✔ règles maison (cumul +4, 7-0, jump-in), contre-UNO, manches gagnantes,
  grisage des cartes injouables. → valeur dans les coins des cartes (lisibilité quand
  la main est pleine) ; flèche de sens de jeu animée à chaque inversion ; couleurs
  saturées en sombre (transverse n°2).
- **Skyjo** ✔ grille 3×4, élimination de colonnes, seuil 50/100/150, dos texturés.
  → caler les couleurs exactement sur les tranches (négatif violet, 0 bleu, 1-4 vert,
  5-8 jaune, 9-12 rouge) si ce n'est pas déjà strict ; animation quand une colonne
  saute ; montrer la somme visible de chaque joueur.
- **Président** ✔ révolution, types de plis (simple/double/triple), 3-8 joueurs.
  → main en éventail chevauché plutôt qu'en grille (18 cartes = 3 rangées peu
  « cartes ») ; échange de cartes Président/Trou en début de manche si absent ; badges
  de rôles en fin de manche.
- **Papayoo** ✔ passe de 5, payoos, seuil réglable. → compteur de points de la donne
  visible pendant les plis.
- **Trio** ✔ fidèle et lisible. → RAS.
- **6 qui prend !** ✔ 4 rangées, têtes de bœuf, choix simultané, seuil réglable.
  → révélation des cartes choisies avec flip séquentiel (le moment de tension du vrai
  jeu) ; grossir les têtes 🐮 sur les cartes à 5+/7 têtes.
- **Mille Bornes** ✔ bottes/attaques/parades, feu rouge, piste 0→1000 avec bornes.
  → cartes façon panneaux (rond rouge feu, borne kilométrique) plus grandes et
  colorées ; mettre en scène le « coup fourré ».
- **La Bonne Paye** ✔ mois calendaire, courrier, affaires, emprunts/épargne avec
  intérêts. → contraste de la légende (transverse n°5) ; tirer les événements comme des
  mini-cartes retournées pour le plaisir du tirage.
- **No Thanks!** ✔ mécanique exacte (carte + jetons). → montrer les suites constituées
  et le score courant de chacun en direct.

### Déduction & bluff
- **Undercover** ✔ (en ligne). → RAS majeur.
- **Loup-Garou** ✔ jouable HORS-LIGNE avec IA (rare !), Voyante/Sorcière/Chasseur.
  → habillage « nuit » plein écran pendant les phases de nuit (fond sombre forcé,
  ambiance) ; rôles paramétrables dans le lobby ; à 4 joueurs la partie peut se plier
  en un tour — suggérer 6+ par défaut.
- **Codenames** ✔ équipes/maîtres-espions. → réglages lobby (dictionnaires, grille) ;
  mode duo coopératif.
- **Cluedo** ✔ plateau illustré avec passages secrets, personnages français (Moutarde,
  Rose, Olive, Pervenche…), carnet de détective, dé. → pions joueurs plus gros sur le
  plateau ; option carnet auto-coché ; à 2 joueurs les interrogatoires tournent vite —
  proposer la variante « fiches face visible » du vrai jeu à 2.
- **Le juste prix** ✔ simple et marrant. → historique des propositions à l'écran ;
  habillage « plateau TV » (spots, applaudimètre) pour le fun.
- **Bataille navale** ✔ placement avec rotation/aléatoire, grilles doubles, IA à
  heuristique. → option flotte classique (cf. lobby) ; silhouette du navire coulé sur
  la grille adverse ; croix/plouf animés à chaque tir.
- **Diamants** ✔ stop-ou-encore, dangers, partage du butin, 5 expéditions. → dessiner la
  progression dans la grotte (chemin de cartes retournées) pour matérialiser le risque.
- **Perudo** ✔ paco, dudo, calza, enchères. → gobelet qu'on « secoue » (vibration +
  son) au début du tour ; frise des enchères de la manche.

### Mots & dessin
- **Petit bac** ✔. → RAS majeur.
- **Sutom** ✔ AZERTY, première lettre donnée, chrono — conforme à l'original.
  → griser/colorer les touches du clavier selon les essais si absent.
- **Crack-list** ✔. → RAS.
- **Pictionary** ✔. → tailles de pinceau + gomme + couleurs supplémentaires.
- **Gartic Phone (Téléphone dessiné)** ✔ flux album. → RAS majeur.

### Observation & ambiance
- **Dobble** ✔. **Lynx** ✔. → RAS.
- **Time's Up** ✔ 2 équipes, 3 manches (libre/un mot/mime), 4 min. → incohérence solo
  (cf. hors-ligne n°1) ; sablier visuel géant en dernière ligne droite.
- **The Mind** ✔ niveaux/vies/shurikens, très fidèle. → petit « pouls » visuel commun
  (halo qui bat) pour renforcer la tension du silence.

### Gestion & réseau
- **Mini Métro** ✔ minimalisme juste (formes, rivière, lignes limitées, pause).
  → dans l'original, chaque « semaine » offre un choix d'amélioration (ligne, wagon,
  tunnel…) : si ce rythme hebdo n'y est pas, c'est l'ajout n°1 ; courbes de lignes
  adoucies (45°) pour le look métro.
- **Mini Motorways** ✔ maisons/destinations colorées, routes, ponts, autoroutes,
  ronds-points, feux — la panoplie y est. → même remarque sur le choix hebdomadaire ;
  heatmap de trafic en fin de partie.

### Plateau
- **Monopoly** ✔ rues françaises, gares/compagnies, hypothèques, durée de partie
  réglable, panneau latéral PC très réussi. → coins mobiles illisibles (transverse
  n°3) ; maisons/hôtels visibles sur les cases ; enchères en option ; cartes
  Chance/Caisse tirées avec un recto illustré.
- **Petits chevaux** ✔ croix classique, écuries, montée finale colorée. → dé
  automatique des ordis plus visible (mini toast « Ordi fait 4 ») ✓ déjà là ; règle de
  barrière en option ; petit hennissement à la sortie d'écurie 🐴.
- **Blokus** ✔ 20×20, 21 pièces triées, coins de départ marqués, décompte. → boutons
  rotation/miroir bien visibles au-dessus du plateau + aperçu fantôme de la pièce sur
  la grille (si absent) ; à la fin, colorier les zones mortes de chacun.
- **Aventuriers du Rail** ✔ silhouette Europe, ~25 villes, routes colorées à longueur
  affichée, marché de cartes, billets cachés, décompte de wagons — le flux « 2 cartes /
  route / billets » est le bon. → **mobile : cibles de routes trop petites** (390 px) —
  zoom par pincement ou tap→confirmation ; ajouter tunnels/ferries/gares ou un bonus
  « route la plus longue » pour se rapprocher de l'édition Europe ; désaturer les
  segments déjà pris.

### Soirée & tournoi
- **Mode Soirée** ✔ tournoi multi-jeux avec cumul de points et retour auto au salon —
  excellente colle entre tous les jeux. → filtrer les jeux proposés selon le nombre de
  joueurs présents ; podium final avec confettis.

### 🕹️ Playus Arena (42 mini-jeux)
✔ Écrans d'intro clairs (« Tape pour… »), un geste = une partie, mode Duel 2 joueurs,
médailles bronze/argent/or sur l'accueil, tout hors-ligne. C'est le bon format.
→ Trois pistes : un « enchaînement aléatoire » (3 mini-jeux d'affilée, score cumulé,
façon party game) ; harmoniser la barre haute (certains jeux ont un bandeau violet,
d'autres bleu) ; afficher la médaille visée pendant la partie (« encore 3 pts → 🥈 »).

---

## ⚖️ Note rapide : noms & visuels des jeux du commerce

Pour un site privé entre copains, le risque est faible. Mais si le site devient public
un jour : les **mécaniques** de jeu ne sont pas protégeables, en revanche les **noms**
(Monopoly, Uno, Cluedo, Dobble, Skyjo, Balatro, Mini Metro/Motorways, La Bonne Paye,
Mille Bornes, Time's Up, Codenames, Perudo, The Mind, Blokus…) sont des marques, et les
chartes graphiques officielles sont protégées. La voie sûre est celle que tu suis déjà
sur plusieurs pages : une **identité visuelle à toi** qui évoque l'esprit du jeu sans
copier ses assets, et le cas échéant des noms alternatifs (« Le rail d'Europe »,
« 21 », « Qui prend perd »…). Garde tes propres visuels — ils sont déjà bons.

---

## 🎯 Top 10 des priorités (mon ordre)

1. **Couleurs de jeu fixes entre clair/sombre** (Uno, Mille Bornes, Skyjo).
2. **Monopoly mobile : coins lisibles** + en-têtes tronqués P4/Reversi.
3. **Layout PC 2 colonnes** pour les jeux de cartes (recette Monopoly).
4. **Lobby : « Lancer maintenant » (hôte), exclure un joueur, QR code.**
5. **Aventuriers mobile : cibles tactiles / zoom.**
6. **Balatro : animation de décompte jetons × mult** (l'âme du jeu).
7. **Légende Bonne Paye en clair** + petit audit de contraste sur feutre.
8. **Options fidélité** : flotte navale classique, dames 10×10, enchères Monopoly,
   rôles Loup-Garou paramétrables.
9. **Écran d'accueil de jeu sans blanc** pendant l'attente Firebase (2,5 s).
10. **Time's Up : clarifier le solo chrono** + mention « nécessite une connexion » sur
    les 9 jeux en ligne.

Bonne continuation — le socle est excellent, la marge de progrès est surtout dans la
finition visuelle desktop et les petits réglages « règles maison » qui font qu'on se
dispute moins. 🎲
