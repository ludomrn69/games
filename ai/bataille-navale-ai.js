/*
  bataille-navale-ai.js — Moteur + IA de la Bataille navale (PUR, sans DOM).
  Grille 10×10 (index r*10+c). `shots` = 100 caractères : '.' (pas tiré), 'h'
  (touché), 'm' (manqué).

  IA de tir = chasse par DENSITÉ DE PROBABILITÉ + poursuite des touches :
   • Poursuite : dès qu'un bateau encore à flot est touché, on compte les
     placements (vraie forme, Porte-avions 2×4 compris) qui EXPLIQUENT les touches
     actives, pondérés par le nombre de touches couvertes → case la plus probable.
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
    BattleshipAI.placeFleet(specs, rnd) → [{ size, cells:[...] }]  (placement aléatoire légal)
    BattleshipAI.cellsFor(spec, idx, dir) → [cells] | null   (spec = longueur OU { w, l })
    BattleshipAI.FLEET → flotte standard : Porte-avions 2×4 + lignes 4,3,3,2

  Utilisé par games/bataille-navale.html ET par tools/bench-games.js (auto-jeu).
*/
(function (root) {
  'use strict';
  var SIZE = 10, CELLS = SIZE * SIZE;
  // Un bateau est décrit soit par une LONGUEUR (bateau-ligne, 1 case de large), soit
  // par une forme rectangulaire { w, l } (largeur × longueur). Le Porte-avions est un
  // rectangle 2×4 (8 cases) ; les autres restent des lignes.
  var FLEET = [{ w: 2, l: 4 }, 4, 3, 3, 2];

  function shapeOf(spec) { return (typeof spec === 'number') ? { w: 1, l: spec } : spec; }
  // Cases occupées si on pose la forme `spec` avec son coin en `idx`, orientée `dir`
  // ('h' : longueur le long des colonnes ; 'v' : longueur le long des lignes).
  function cellsFor(spec, idx, dir) {
    var sp = shapeOf(spec);
    var rows = dir === 'v' ? sp.l : sp.w, cols = dir === 'v' ? sp.w : sp.l;
    var r0 = Math.floor(idx / SIZE), c0 = idx % SIZE, cells = [];
    for (var dr = 0; dr < rows; dr++) for (var dc = 0; dc < cols; dc++) {
      var rr = r0 + dr, cc = c0 + dc;
      if (rr >= SIZE || cc >= SIZE) return null;
      cells.push(rr * SIZE + cc);
    }
    return cells;
  }

  // Placement aléatoire légal (bateaux non chevauchants). rnd() ∈ [0,1) injectable.
  // `specs` : longueurs et/ou formes { w, l } (cf. FLEET). `size` renvoyé = nb de cases.
  function placeFleet(specs, rnd) {
    rnd = rnd || Math.random;
    var occ = {}, ships = [];
    specs.forEach(function (sz) {
      var ok = false, tries = 0;
      while (!ok && tries++ < 3000) {
        var dir = rnd() < 0.5 ? 'h' : 'v', idx = Math.floor(rnd() * CELLS);
        var cells = cellsFor(sz, idx, dir);
        if (!cells) continue;
        var clash = false; for (var k = 0; k < cells.length; k++) if (occ[cells[k]]) { clash = true; break; }
        if (clash) continue;
        cells.forEach(function (c) { occ[c] = true; });
        ships.push({ size: cells.length, cells: cells });
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

  // Une taille reçue en NOMBRE DE CASES (c'est ce que passe la page) est ramenée à
  // sa vraie forme : 8 cases = le Porte-avions 2×4 (et non une ligne de 8).
  function specOf(sz) {
    if (typeof sz !== 'number') return sz;
    if (sz > 5) { for (var i = 0; i < FLEET.length; i++) { var f = FLEET[i]; if (typeof f !== 'number' && f.w * f.l === sz) return f; } }
    return sz;
  }

  function chooseShot(shots, remainingSizes, sunkCells, level, opts) {
    sunkCells = sunkCells || {};
    opts = opts || {};
    var sizes = ((remainingSizes && remainingSizes.length) ? remainingSizes : FLEET).map(specOf);
    function tried(i) { return shots[i] !== '.'; }
    // Touche « active » = sur un bateau encore à flot (pas une case déjà coulée).
    function active(i) { return shots[i] === 'h' && !sunkCells[i]; }

    var free = [], nActive = 0;
    for (var f = 0; f < CELLS; f++) { if (!tried(f)) free.push(f); else if (active(f)) nActive++; }
    if (!free.length) return -1;
    if (level === 'easy') return free[Math.floor(Math.random() * free.length)];

    // Moyen : la CHASSE est parfois aléatoire (≈ 1 fois sur 3). La POURSUITE d'une
    // touche reste sérieuse à tous les niveaux (on ne lâche pas un bateau entamé).
    if (level === 'normal' && !nActive && Math.random() < 0.35) return free[Math.floor(Math.random() * free.length)];

    // ── Densité unifiée ────────────────────────────────────────────────────────
    // On énumère TOUS les placements encore possibles de chaque bateau à flot, avec
    // sa vraie forme (un placement ne peut couvrir ni un tir manqué ni une case
    // coulée, mais il PEUT couvrir des touches actives). W = densité de chasse ;
    // WH = densité de poursuite : placements qui expliquent des touches actives,
    // pondérés très fortement par le nombre de touches couvertes.
    var W = new Array(CELLS), WH = new Array(CELLS), z;
    for (z = 0; z < CELLS; z++) { W[z] = 0; WH[z] = 0; }
    var HW = opts.hitW || 12;
    for (var si = 0; si < sizes.length; si++) {
      var L = sizes[si], sp = shapeOf(L), ndir = (sp.w === sp.l) ? 1 : 2;
      for (var dir = 0; dir < ndir; dir++) {
        for (var p = 0; p < CELLS; p++) {
          var cells = cellsFor(L, p, dir ? 'v' : 'h'); if (!cells) continue;
          var okP = true, hits = 0;
          for (var k = 0; k < cells.length; k++) {
            var ch = shots[cells[k]];
            if (ch === 'm' || sunkCells[cells[k]]) { okP = false; break; }
            if (ch === 'h') hits++;
          }
          if (!okP || hits === cells.length) continue;
          if (hits) { var wt = Math.pow(HW, hits - 1); for (var b = 0; b < cells.length; b++) WH[cells[b]] += wt; }
          else { for (var b2 = 0; b2 < cells.length; b2++) W[cells[b2]] += 1; }
        }
      }
    }
    var bc = -1, bw = -1, c2;
    if (nActive) {
      for (c2 = 0; c2 < CELLS; c2++) {
        if (tried(c2) || WH[c2] <= 0) continue;
        var sc = WH[c2] + W[c2] * 0.01 + Math.random() * 0.001;
        if (sc > bw) { bw = sc; bc = c2; }
      }
      if (bc >= 0) return bc;
    }
    // Plus petite DIMENSION restante : sert au damier (parité).
    var minSize = Math.min.apply(null, sizes.map(function (sz) { return (typeof sz === 'number') ? sz : Math.min(sz.w, sz.l); }));
    var usePar = level === 'hard' && minSize >= 2 && !opts.noParity;
    for (c2 = 0; c2 < CELLS; c2++) {
      if (tried(c2)) continue;
      if (usePar && ((Math.floor(c2 / SIZE) + (c2 % SIZE)) % 2 !== 0)) continue;
      var s2 = W[c2] + Math.random() * 0.5;
      if (s2 > bw && W[c2] > 0) { bw = s2; bc = c2; }
    }
    if (bc >= 0) return bc;
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
