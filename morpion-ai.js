/*
  morpion-ai.js — Cœur de l'IA Morpion / « 3 pions » (PUR, sans DOM).

  Le jeu : on pose 3 pions chacun, puis on en DÉPLACE un sur n'importe quelle case
  libre ; le premier qui aligne ses 3 pions gagne. Comme il n'existe PAS de règle de
  répétition, le « jeu parfait » n'est pas fini (on peut tourner en rond) : l'IA fait
  donc une recherche négamax α-β À PROFONDEUR BORNÉE, avec :
   • détection de répétition sur le chemin courant (position déjà vue → nulle, 0),
     ce qui évite les boucles infinies et permet de chercher profond ;
   • table de transposition (accélération) ;
   • approfondissement itératif (résultat utilisable même si on coupe par budget).
  Elle ne perd jamais dans son horizon et punit les erreurs adverses ; elle ne
  prétend pas être « parfaite » (le jeu ne l'est pas sans règle de nulle).

  Utilisé par morpion.html ET tools/bench.js.

  API : MorpionAI.bestMove(board, me, opp, maxDepth)
    board : 9 caractères ('.'=vide), me/opp : marques (ex. '0'/'1')
  → { i: idx } pour poser, ou { f: from, t: to } pour déplacer, ou null.
*/
(function (root) {
  'use strict';
  var LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  var PLACE_ORDER = [4, 0, 2, 6, 8, 1, 3, 5, 7]; // centre, coins, bords (meilleures coupures)

  function winLineFor(b, m) {
    for (var i = 0; i < LINES.length; i++) { var l = LINES[i]; if (b[l[0]] === m && b[l[1]] === m && b[l[2]] === m) return l; }
    return null;
  }
  function cntM(bb, mk) { var n = 0; for (var i = 0; i < 9; i++) if (bb[i] === mk) n++; return n; }
  function emp(bb) { var a = []; for (var i = 0; i < 9; i++) if (bb[i] === '.') a.push(i); return a; }
  function gen(bb, mk) {
    var mv = [], e = emp(bb), i;
    if (cntM(bb, mk) < 3) {
      PLACE_ORDER.forEach(function (p) { if (bb[p] === '.') mv.push({ i: p }); });
    } else {
      for (var f = 0; f < 9; f++) { if (bb[f] !== mk) continue; for (i = 0; i < e.length; i++) mv.push({ f: f, t: e[i] }); }
    }
    return mv;
  }
  function app(bb, mk, m) { var a = bb.split(''); if (m.f != null) { a[m.f] = '.'; a[m.t] = mk; } else a[m.i] = mk; return a.join(''); }

  function bestMove(board, me, opp, maxDepth) {
    var b = board || '.........';
    maxDepth = maxDepth || 6;
    function evalH(bb) {
      var s = 0;
      for (var x = 0; x < LINES.length; x++) {
        var l = LINES[x], a = 0, d = 0;
        for (var y = 0; y < 3; y++) { if (bb[l[y]] === me) a++; else if (bb[l[y]] === opp) d++; }
        if (d === 0) s += a * a; if (a === 0) s -= d * d;
      }
      return s;
    }
    var NODE_CAP = 300000, nodes = 0, aborted = false, TT = {};
    function nega(bb, mk, depth, alpha, beta, path) {
      if (++nodes > NODE_CAP) { aborted = true; return 0; }
      if (path[bb + mk]) return 0;                           // répétition sur le chemin → nulle
      var a0 = alpha, key = bb + mk, tt = TT[key];
      if (tt && tt.d >= depth) {
        if (tt.flag === 0) return tt.val;
        if (tt.flag < 0) { if (tt.val < beta) beta = tt.val; } else { if (tt.val > alpha) alpha = tt.val; }
        if (alpha >= beta) return tt.val;
      }
      var omk = mk === me ? opp : me, mv = gen(bb, mk); if (!mv.length) return 0;
      var best = -1e9;
      path[key] = true;
      for (var k = 0; k < mv.length; k++) {
        var nb = app(bb, mk, mv[k]), v;
        if (winLineFor(nb, mk)) v = 10000 - (maxDepth - depth);
        else if (depth <= 0) v = (mk === me ? evalH(nb) : -evalH(nb));
        else v = -nega(nb, omk, depth - 1, -beta, -alpha, path);
        if (aborted) { best = best > -1e9 ? best : v; break; }
        if (v > best) best = v;
        if (best > alpha) alpha = best;
        if (alpha >= beta) break;
      }
      delete path[key];
      if (!aborted) TT[key] = { d: depth, val: best, flag: best <= a0 ? -1 : best >= beta ? 1 : 0 };
      return best;
    }
    var moves = gen(b, me); if (!moves.length) return null;
    // Gain immédiat → on le prend tout de suite.
    for (var w = 0; w < moves.length; w++) { if (winLineFor(app(b, me, moves[w]), me)) return moves[w]; }
    var best = moves[0], bestV = -1e18;
    for (var dep = 1; dep <= maxDepth; dep++) {
      var lBest = best, lV = -1e18, alpha = -1e18;
      var roots = [best].concat(moves.filter(function (m) { return m !== best; }));
      for (var i = 0; i < roots.length; i++) {
        var nb = app(b, me, roots[i]), v;
        if (winLineFor(nb, me)) v = 1e9; else v = -nega(nb, opp, dep - 1, -1e18, -alpha, {});
        if (aborted) break;
        if (v > lV) { lV = v; lBest = roots[i]; }
        if (lV > alpha) alpha = lV;
      }
      if (!aborted) { best = lBest; bestV = lV; }
      if (aborted || bestV >= 9000) break;
    }
    return best;
  }

  root.MorpionAI = { bestMove: bestMove, winLineFor: winLineFor, LINES: LINES };
})(typeof module !== 'undefined' && module.exports ? module.exports : (this.window = this.window || this));
