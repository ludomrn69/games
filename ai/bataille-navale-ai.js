/*
  bataille-navale-ai.js — Moteur + IA de la Bataille navale (PUR, sans DOM).
  Grille 10×10 (index r*10+c). `shots` = 100 caractères : '.' (pas tiré), 'h'
  (touché), 'm' (manqué).

  IA de tir = chasse par DENSITÉ DE PROBABILITÉ + poursuite des touches :
   • Poursuite : dès qu'un bateau encore à flot est touché, on prolonge la ligne
     (forte préférence à l'alignement de deux touches) jusqu'à le couler.
   • Chasse : on compte, pour chaque case vierge, combien de placements LÉGAUX des
     bateaux ENCORE EN VIE pourraient l'occuper → on tire sur la case la plus
     probable. En « difficile », on se limite au damier (parité) : un bateau de
     taille ≥ 2 occupe forcément une case sur deux → on couvre deux fois plus vite.

  Deux finesses qui rendent l'IA nettement plus efficace que la version naïve :
   • la densité n'utilise que les tailles des bateaux NON ENCORE COULÉS (un bateau
     coulé ne doit plus peser dans le calcul) ;
   • les cases d'un bateau DÉJÀ COULÉ sont traitées comme des murs : on ne gaspille
     plus de tirs à sonder autour d'elles.

  API :
    BattleshipAI.chooseShot(shots, remainingSizes, sunkCells, level) → index 0..99 (ou -1)
      remainingSizes : tailles des bateaux pas encore coulés (ex. [5,4,3,2])
      sunkCells      : objet { index: true } des cases de bateaux déjà coulés
      level          : 'easy' | 'normal' | 'hard'
    BattleshipAI.placeFleet(sizes, rnd) → [{ size, cells:[...] }]  (placement aléatoire légal)
    BattleshipAI.cellsFor(size, idx, dir) → [cells] | null
    BattleshipAI.FLEET → tailles de la flotte standard ([5,4,3,3,2])

  Utilisé par games/bataille-navale.html ET par tools/bench-games.js (auto-jeu).
*/
(function (root) {
  'use strict';
  var SIZE = 10, CELLS = SIZE * SIZE;
  var FLEET = [5, 4, 3, 3, 2];

  function cellsFor(size, idx, dir) {
    var r = Math.floor(idx / SIZE), c = idx % SIZE, cells = [];
    for (var k = 0; k < size; k++) {
      var rr = dir === 'v' ? r + k : r, cc = dir === 'h' ? c + k : c;
      if (rr >= SIZE || cc >= SIZE) return null;
      cells.push(rr * SIZE + cc);
    }
    return cells;
  }

  // Placement aléatoire légal (bateaux non chevauchants). rnd() ∈ [0,1) injectable.
  function placeFleet(sizes, rnd) {
    rnd = rnd || Math.random;
    var occ = {}, ships = [];
    sizes.forEach(function (sz) {
      var ok = false, tries = 0;
      while (!ok && tries++ < 3000) {
        var dir = rnd() < 0.5 ? 'h' : 'v', idx = Math.floor(rnd() * CELLS);
        var cells = cellsFor(sz, idx, dir);
        if (!cells) continue;
        var clash = false; for (var k = 0; k < cells.length; k++) if (occ[cells[k]]) { clash = true; break; }
        if (clash) continue;
        cells.forEach(function (c) { occ[c] = true; });
        ships.push({ size: sz, cells: cells });
        ok = true;
      }
    });
    return ships;
  }

  function neighbors(i) {
    var r = Math.floor(i / SIZE), c = i % SIZE, a = [];
    if (r > 0) a.push(i - SIZE); if (r < SIZE - 1) a.push(i + SIZE);
    if (c > 0) a.push(i - 1); if (c < SIZE - 1) a.push(i + 1);
    return a;
  }

  function chooseShot(shots, remainingSizes, sunkCells, level) {
    sunkCells = sunkCells || {};
    var sizes = (remainingSizes && remainingSizes.length) ? remainingSizes : FLEET;
    function tried(i) { return shots[i] !== '.'; }
    // Touche « active » = sur un bateau encore à flot (pas une case déjà coulée).
    function active(i) { return shots[i] === 'h' && !sunkCells[i]; }

    var free = [];
    for (var f = 0; f < CELLS; f++) if (!tried(f)) free.push(f);
    if (!free.length) return -1;
    if (level === 'easy') return free[Math.floor(Math.random() * free.length)];

    // ── Poursuite : prolonger une touche active ───────────────────────────────
    var best = -1, bestSc = -1;
    for (var i = 0; i < CELLS; i++) {
      if (!active(i)) continue;
      var ns = neighbors(i);
      for (var x = 0; x < ns.length; x++) {
        var nb = ns[x]; if (tried(nb)) continue;
        var di = nb - i, opp = i - di, sc = 2;
        // Si la case OPPOSÉE est aussi une touche active → on est sur la ligne du
        // bateau : prolonger ici est presque sûr de toucher encore.
        if (opp >= 0 && opp < CELLS && active(opp)) {
          var sameRow = Math.abs(di) === 1 ? (Math.floor(opp / SIZE) === Math.floor(i / SIZE)) : true;
          if (sameRow) sc = 18;
        }
        if (sc > bestSc || (sc === bestSc && Math.random() < 0.4)) { bestSc = sc; best = nb; }
      }
    }
    if (best >= 0) return best;

    // Moyen : la CHASSE est parfois aléatoire (≈ 1 fois sur 4) → nettement moins
    // efficace que « difficile » (densité + damier systématiques). La POURSUITE
    // d'une touche, elle, reste optimale à tous les niveaux (on ne lâche jamais un
    // bateau entamé).
    if (level === 'normal' && Math.random() < 0.25) return free[Math.floor(Math.random() * free.length)];

    // ── Chasse : densité de placements des bateaux ENCORE EN VIE ───────────────
    var W = new Array(CELLS); for (var z = 0; z < CELLS; z++) W[z] = 0;
    for (var si = 0; si < sizes.length; si++) {
      var L = sizes[si];
      for (var dir = 0; dir < 2; dir++) {
        for (var p = 0; p < CELLS; p++) {
          var cells = cellsFor(L, p, dir ? 'v' : 'h'); if (!cells) continue;
          var clean = true; for (var k = 0; k < cells.length; k++) { if (tried(cells[k])) { clean = false; break; } }
          if (!clean) continue;
          for (var b = 0; b < cells.length; b++) W[cells[b]] += 1;
        }
      }
    }
    var minSize = Math.min.apply(null, sizes);
    var bc = -1, bw = -1;
    for (var c2 = 0; c2 < CELLS; c2++) {
      if (tried(c2)) continue;
      // Damier (parité) en difficile : inutile de viser une case sur deux tant que
      // le plus petit bateau restant fait ≥ 2.
      if (level === 'hard' && minSize >= 2 && ((Math.floor(c2 / SIZE) + (c2 % SIZE)) % 2 !== 0)) continue;
      if (W[c2] > bw) { bw = W[c2]; bc = c2; }
    }
    if (bc >= 0 && bw > 0) return bc;
    // Repli : meilleure densité sans contrainte de parité, sinon n'importe quelle case.
    bc = -1; bw = -1;
    for (var c3 = 0; c3 < CELLS; c3++) { if (tried(c3)) continue; if (W[c3] > bw) { bw = W[c3]; bc = c3; } }
    return bc >= 0 ? bc : free[0];
  }

  root.BattleshipAI = {
    chooseShot: chooseShot, placeFleet: placeFleet, cellsFor: cellsFor,
    FLEET: FLEET, SIZE: SIZE
  };
})(typeof module !== 'undefined' && module.exports ? module.exports : (this.window = this.window || this));
