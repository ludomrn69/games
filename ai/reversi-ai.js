/*
  reversi-ai.js — Cœur de l'IA Reversi / Reversi (PUR, sans DOM). Négamax α-β +
  table de transposition BORNÉE (drapeau exact/min/max + meilleur coup mémorisé,
  ré-essayé en premier) + approfondissement itératif + borne de nœuds (ne fige
  jamais le navigateur). Évaluation positionnelle forte : table de poids par case
  (coins forts, cases X/C négatives), mobilité, PIONS FRONTIÈRES (le facteur qui
  fait le plus gagner), coins possédés, et comptage de pions en fin de partie. En
  prime, RÉSOLUTION EXACTE de la finale : dès qu'il reste ≤ 12 cases vides, elle
  cherche jusqu'au bout et joue la fin de partie parfaitement. À profondeur 6–8 +
  finale résolue, elle joue très fort sans aucun apprentissage.

  Utilisé par games/reversi.html (solo / ordis en ligne) ET par tools/bench.js
  (auto-jeu headless) — une seule logique, pas de divergence.

  API : ReversiAI.bestMove(board, me, opp, maxDepth)
    board   : 64 caractères (8×8, index r*8+c, '.'=vide), me/opp : marques ('0'/'1')
    maxDepth: profondeur max (demi-coups) ; ~1 facile, 4 moyen, 7 difficile
  → index 0..63 du coup à jouer, ou -1 si aucun coup légal (on passe).

  Helpers exportés (réutilisés par la page et le banc) : legalMoves, applyMove,
  wouldFlip, opponent.
*/
(function (root) {
  'use strict';
  var N = 8;
  // 8 directions (dr, dc).
  var DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

  // Table de poids positionnels (coins très forts ; cases adjacentes aux coins
  // dangereuses). Valeurs classiques façon « Iago ».
  var W = [
    120, -20, 20, 5, 5, 20, -20, 120,
    -20, -40, -5, -5, -5, -5, -40, -20,
    20, -5, 15, 3, 3, 15, -5, 20,
    5, -5, 3, 3, 3, 3, -5, 5,
    5, -5, 3, 3, 3, 3, -5, 5,
    20, -5, 15, 3, 3, 15, -5, 20,
    -20, -40, -5, -5, -5, -5, -40, -20,
    120, -20, 20, 5, 5, 20, -20, 120
  ];
  var CORNERS = [0, 7, 56, 63];

  function opponent(m) { return m === '0' ? '1' : '0'; }
  function inB(r, c) { return r >= 0 && r < N && c >= 0 && c < N; }

  // Renvoie le tableau des cases retournées si `me` joue en idx, sinon [].
  function wouldFlip(b, idx, me) {
    if (b[idx] !== '.') return [];
    var opp = opponent(me), r = Math.floor(idx / N), c = idx % N, flips = [];
    for (var d = 0; d < 8; d++) {
      var dr = DIRS[d][0], dc = DIRS[d][1], rr = r + dr, cc = c + dc, line = [];
      while (inB(rr, cc) && b[rr * N + cc] === opp) { line.push(rr * N + cc); rr += dr; cc += dc; }
      if (line.length && inB(rr, cc) && b[rr * N + cc] === me) flips = flips.concat(line);
    }
    return flips;
  }

  function legalMoves(b, me) {
    var mv = [];
    for (var i = 0; i < 64; i++) { if (b[i] === '.' && wouldFlip(b, i, me).length) mv.push(i); }
    return mv;
  }

  // Applique le coup (suppose légal) et renvoie le NOUVEAU plateau (chaîne).
  function applyMove(b, idx, me) {
    var flips = wouldFlip(b, idx, me);
    if (!flips.length) return b;
    var a = b.split('');
    a[idx] = me;
    for (var i = 0; i < flips.length; i++) a[flips[i]] = me;
    return a.join('');
  }

  function counts(b) { var m = { '.': 0, '0': 0, '1': 0 }; for (var i = 0; i < 64; i++) m[b[i]]++; return m; }

  function bestMove(board, me, opp, maxDepth) {
    var b = board || '.'.repeat(64);
    maxDepth = maxDepth || 4;
    opp = opp || opponent(me);

    function evaluate(bb, side) {
      // Score positif = bon pour `me`. (Renvoyé ensuite relatif au trait.)
      var cnt = counts(bb), filled = 64 - cnt['.'];
      var sc = 0, i;
      // 1) Poids positionnels.
      for (i = 0; i < 64; i++) { if (bb[i] === me) sc += W[i]; else if (bb[i] === opp) sc -= W[i]; }
      // 2) Mobilité (différence de coups légaux) — décisive en milieu de partie.
      var mMe = legalMoves(bb, me).length, mOp = legalMoves(bb, opp).length;
      if (mMe + mOp) sc += 8 * (mMe - mOp);
      // 3) Coins possédés (renforce au-delà de la table).
      for (i = 0; i < 4; i++) { if (bb[CORNERS[i]] === me) sc += 40; else if (bb[CORNERS[i]] === opp) sc -= 40; }
      // 4) Pions FRONTIÈRES (au contact d'une case vide) : ce sont des passifs — ils
      // offrent des retournements à l'adversaire. En avoir MOINS que lui est bon.
      // C'est l'heuristique « pas chère » qui fait le plus gagner en force. (Inutile
      // en toute fin de partie où le comptage de pions prend le relais.)
      if (filled < 56) {
        var fMe = 0, fOp = 0;
        for (i = 0; i < 64; i++) {
          var p = bb[i]; if (p === '.') continue;
          var r = Math.floor(i / N), c = i % N, isF = false;
          for (var d = 0; d < 8; d++) { var rr = r + DIRS[d][0], cc = c + DIRS[d][1]; if (inB(rr, cc) && bb[rr * N + cc] === '.') { isF = true; break; } }
          if (isF) { if (p === me) fMe++; else fOp++; }
        }
        sc += 5 * (fOp - fMe);
      }
      // 5) En toute fin de partie, ce qui compte c'est le NOMBRE de pions.
      if (filled >= 52) sc += (filled >= 60 ? 30 : 6) * (cnt[me] - cnt[opp]);
      return side === me ? sc : -sc;
    }

    var NODE_CAP = 300000, nodes = 0, aborted = false, TT = {};
    // Négamax α-β à fenêtre + table de transposition BORNÉE : on mémorise le score
    // AVEC son drapeau (exact / borne min / borne max) et le MEILLEUR coup. Stocker
    // le drapeau est indispensable — une coupure α-β ne donne qu'une borne, pas le
    // vrai score ; le meilleur coup mémorisé est ré-essayé en premier (coupures bien
    // plus tôt → on cherche plus profond dans le même budget). `passed` = le camp
    // précédent a déjà passé (2 passes → fin de partie).
    function search(bb, side, depth, alpha, beta, passed) {
      if (++nodes > NODE_CAP) { aborted = true; return 0; }
      var a0 = alpha, key = bb + side, tt = TT[key], ttMove = -1;
      if (tt) {
        ttMove = tt.move;
        if (tt.d >= depth) {
          if (tt.flag === 0) return tt.val;
          if (tt.flag < 0) { if (tt.val < beta) beta = tt.val; } else { if (tt.val > alpha) alpha = tt.val; }
          if (alpha >= beta) return tt.val;
        }
      }
      var moves = legalMoves(bb, side);
      if (!moves.length) {
        if (passed) { // deux passes de suite → partie finie : score réel (pions).
          var cnt = counts(bb), diff = cnt[me] - cnt[opp];
          var term = diff > 0 ? 100000 + diff : diff < 0 ? -100000 + diff : 0;
          return side === me ? term : -term;
        }
        return -search(bb, opponent(side), depth, -beta, -alpha, true);
      }
      if (depth <= 0) return evaluate(bb, side);
      // Tri des coups : coup de la TT d'abord, puis coins/poids — meilleures coupures.
      moves.sort(function (a, z) { return W[z] - W[a]; });
      if (ttMove >= 0) { var pos = moves.indexOf(ttMove); if (pos > 0) { moves.splice(pos, 1); moves.unshift(ttMove); } }
      var best = -1e9, bestMv = moves[0], other = opponent(side);
      for (var i = 0; i < moves.length; i++) {
        var nb = applyMove(bb, moves[i], side);
        var v = -search(nb, other, depth - 1, -beta, -alpha, false);
        if (aborted) return best > -1e9 ? best : v;
        if (v > best) { best = v; bestMv = moves[i]; }
        if (best > alpha) alpha = best;
        if (alpha >= beta) break;
      }
      if (!aborted) TT[key] = { d: depth, val: best, move: bestMv, flag: best <= a0 ? -1 : best >= beta ? 1 : 0 };
      return best;
    }

    var rootMoves = legalMoves(b, me);
    if (!rootMoves.length) return -1; // on passe
    if (rootMoves.length === 1) return rootMoves[0];
    // ── Résolution EXACTE de la finale ────────────────────────────────────────
    // Quand il ne reste que peu de cases vides, on cherche JUSQU'AU BOUT (le score
    // terminal = différence de pions) : l'IA joue alors parfaitement la fin de
    // partie — là où chaque pion compte et où l'heuristique se trompe le plus. On
    // ne l'active qu'au-delà du niveau « facile » (maxDepth ≥ 4).
    var empties = 0; for (var e = 0; e < 64; e++) if (b[e] === '.') empties++;
    if (maxDepth >= 4 && empties <= 12) maxDepth = empties;
    rootMoves.sort(function (a, z) { return W[z] - W[a]; });

    var best = rootMoves[0];
    for (var dep = 1; dep <= maxDepth; dep++) {
      var localBest = best, localV = -1e18, alpha = -1e18;
      var roots = [best].concat(rootMoves.filter(function (m) { return m !== best; }));
      for (var k = 0; k < roots.length; k++) {
        var nb = applyMove(b, roots[k], me);
        var v = -search(nb, opp, dep - 1, -1e18, -alpha, false);
        if (aborted) break;
        if (v > localV) { localV = v; localBest = roots[k]; }
        if (localV > alpha) alpha = localV;
      }
      if (!aborted) best = localBest;
      if (aborted) break;
    }
    return best;
  }

  root.ReversiAI = {
    bestMove: bestMove,
    legalMoves: legalMoves,
    applyMove: applyMove,
    wouldFlip: wouldFlip,
    opponent: opponent
  };
})(typeof module !== 'undefined' && module.exports ? module.exports : (this.window = this.window || this));
