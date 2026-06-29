/*
  othello-ai.js — Cœur de l'IA Othello / Reversi (PUR, sans DOM). Négamax α-β +
  table de transposition + approfondissement itératif + borne de nœuds (ne fige
  jamais le navigateur). Fonction d'évaluation positionnelle classique : table de
  poids par case (coins forts, cases X/C négatives), mobilité, et bascule en
  comptage de pions en fin de partie. À profondeur 6–8 elle joue très fort sans
  aucun apprentissage (Othello se domine très bien à la recherche + heuristique).

  Utilisé par games/othello.html (solo / ordis en ligne) ET par tools/bench.js
  (auto-jeu headless) — une seule logique, pas de divergence.

  API : OthelloAI.bestMove(board, me, opp, maxDepth)
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
      // 4) En toute fin de partie, ce qui compte c'est le NOMBRE de pions.
      if (filled >= 52) sc += (filled >= 60 ? 30 : 6) * (cnt[me] - cnt[opp]);
      return side === me ? sc : -sc;
    }

    var NODE_CAP = 200000, nodes = 0, aborted = false, TT = {};
    // Négamax α-β. `passed` = le camp précédent a déjà passé (2 passes → fin).
    function search(bb, side, depth, alpha, beta, passed) {
      if (++nodes > NODE_CAP) { aborted = true; return 0; }
      var key = bb + side + depth, tt = TT[key];
      if (tt != null) return tt;
      var moves = legalMoves(bb, side);
      if (!moves.length) {
        if (passed) { // deux passes de suite → partie finie : score réel (pions).
          var cnt = counts(bb), diff = cnt[me] - cnt[opp];
          var term = diff > 0 ? 100000 + diff : diff < 0 ? -100000 + diff : 0;
          return side === me ? term : -term;
        }
        var vPass = -search(bb, opp === side ? me : opponent(side), depth, -beta, -alpha, true);
        return vPass;
      }
      if (depth <= 0) { var e = evaluate(bb, side); return e; }
      // Tri des coups : coins d'abord, puis poids — meilleures coupures.
      moves.sort(function (a, z) { return W[z] - W[a]; });
      var best = -1e9, other = opponent(side);
      for (var i = 0; i < moves.length; i++) {
        var nb = applyMove(bb, moves[i], side);
        var v = -search(nb, other, depth - 1, -beta, -alpha, false);
        if (aborted) return best > -1e9 ? best : v;
        if (v > best) best = v;
        if (best > alpha) alpha = best;
        if (alpha >= beta) break;
      }
      if (!aborted) TT[key] = best;
      return best;
    }

    var rootMoves = legalMoves(b, me);
    if (!rootMoves.length) return -1; // on passe
    if (rootMoves.length === 1) return rootMoves[0];
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

  root.OthelloAI = {
    bestMove: bestMove,
    legalMoves: legalMoves,
    applyMove: applyMove,
    wouldFlip: wouldFlip,
    opponent: opponent
  };
})(typeof module !== 'undefined' && module.exports ? module.exports : (this.window = this.window || this));
