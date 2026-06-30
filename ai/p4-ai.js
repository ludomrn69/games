/*
  p4-ai.js — Cœur de l'IA Puissance 4 (PUR, sans DOM). Négamax α-β + table de
  transposition (avec drapeau ET meilleur coup mémorisé) + tri des coups par coup
  de TT / « killer » / centre + approfondissement itératif, avec borne de nœuds
  pour ne jamais figer le navigateur. Le bon ordre des coups multiplie les coupures
  → recherche bien plus profonde à budget égal. Le Puissance 4 étant résolu, cette
  profondeur joue quasi parfaitement.

  Utilisé par puissance4.html (mode solo / ordis en ligne) ET par tools/bench.js
  (auto-jeu headless) — une seule logique, pas de divergence.

  API : P4AI.bestColumn(board, me, opp, maxDepth)
    board   : chaîne de 42 caractères (6 lignes × 7 colonnes, index r*7+c, '.'=vide)
    me/opp  : marques des deux joueurs (ex. '0' et '1')
    maxDepth: profondeur max (demi-coups) ; ~2 facile, 6 moyen, 9 difficile
  → numéro de colonne (0..6) à jouer, ou -1 si plateau plein.
*/
(function (root) {
  'use strict';
  var ORD = [3, 2, 4, 1, 5, 0, 6];

  function cols(bb) { var r = []; for (var c = 0; c < 7; c++) if (bb[c] === '.') r.push(c); return r; }
  function drop(bb, c, m) { var a = bb.split(''); for (var r = 5; r >= 0; r--) if (a[r * 7 + c] === '.') { a[r * 7 + c] = m; return { b: a.join(''), idx: r * 7 + c }; } return null; }
  function lineAt(b, idx, ch) {
    var r = Math.floor(idx / 7), c = idx % 7, dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
    for (var d = 0; d < 4; d++) {
      var dr = dirs[d][0], dc = dirs[d][1], n = 1, rr, cc;
      rr = r + dr; cc = c + dc; while (rr >= 0 && rr < 6 && cc >= 0 && cc < 7 && b[rr * 7 + cc] === ch) { n++; rr += dr; cc += dc; }
      rr = r - dr; cc = c - dc; while (rr >= 0 && rr < 6 && cc >= 0 && cc < 7 && b[rr * 7 + cc] === ch) { n++; rr -= dr; cc -= dc; }
      if (n >= 4) return true;
    }
    return false;
  }
  function winAt(bb, idx, m) { return lineAt(bb, idx, m); }

  function bestColumn(board, me, opp, maxDepth) {
    var b = board || '.'.repeat(42);
    maxDepth = maxDepth || 6;
    function evalB(bb) {
      var sc = 0, r, c;
      for (r = 0; r < 6; r++) { if (bb[r * 7 + 3] === me) sc += 3; else if (bb[r * 7 + 3] === opp) sc -= 3; }
      function w(cells) { var cm = 0, co = 0; for (var i = 0; i < 4; i++) { var v = bb[cells[i]]; if (v === me) cm++; else if (v === opp) co++; } if (cm && co) return 0; if (cm) return cm === 3 ? 100 : cm === 2 ? 10 : 1; if (co) return co === 3 ? -120 : co === 2 ? -10 : -1; return 0; }
      for (r = 0; r < 6; r++) for (c = 0; c < 4; c++) sc += w([r * 7 + c, r * 7 + c + 1, r * 7 + c + 2, r * 7 + c + 3]);
      for (c = 0; c < 7; c++) for (r = 0; r < 3; r++) sc += w([r * 7 + c, (r + 1) * 7 + c, (r + 2) * 7 + c, (r + 3) * 7 + c]);
      for (r = 0; r < 3; r++) for (c = 0; c < 4; c++) sc += w([r * 7 + c, (r + 1) * 7 + c + 1, (r + 2) * 7 + c + 2, (r + 3) * 7 + c + 3]);
      for (r = 0; r < 3; r++) for (c = 3; c < 7; c++) sc += w([r * 7 + c, (r + 1) * 7 + c - 1, (r + 2) * 7 + c - 2, (r + 3) * 7 + c - 3]);
      return sc;
    }
    // Cap de nœuds : borne de sécurité (≈ une demi-seconde au pire). Un meilleur
    // ORDRE des coups (coup de la TT, puis « killer », puis centre) provoque bien
    // plus de coupures α-β → on cherche nettement plus profond dans le même budget.
    var NODE_CAP = 400000, nodes = 0, aborted = false, TT = {}, killer = {};
    function search(bb, depth, alpha, beta, cur) {
      if (++nodes > NODE_CAP) { aborted = true; return 0; }
      var vc = cols(bb); if (!vc.length) return 0;
      if (depth <= 0) return (cur === me ? evalB(bb) : -evalB(bb));
      var a0 = alpha, key = bb + cur, tt = TT[key], ttCol = -1;
      if (tt) {
        ttCol = tt.col;
        if (tt.d >= depth) {
          if (tt.flag === 0) return tt.val;
          if (tt.flag < 0) { if (tt.val < beta) beta = tt.val; } else { if (tt.val > alpha) alpha = tt.val; }
          if (alpha >= beta) return tt.val;
        }
      }
      var other = cur === me ? opp : me, best = -1e9, bestCol = -1;
      // Ordre : coup de la TT, puis le « killer » (coup qui a déjà coupé à cette
      // profondeur ailleurs), puis l'ordre statique centre→bords.
      var order = [], seen = [false, false, false, false, false, false, false], kill = killer[depth];
      if (ttCol >= 0 && vc.indexOf(ttCol) >= 0) { order.push(ttCol); seen[ttCol] = true; }
      if (kill != null && kill >= 0 && !seen[kill] && vc.indexOf(kill) >= 0) { order.push(kill); seen[kill] = true; }
      for (var z = 0; z < ORD.length; z++) { var oc = ORD[z]; if (!seen[oc] && vc.indexOf(oc) >= 0) order.push(oc); }
      for (var i = 0; i < order.length; i++) {
        var d = drop(bb, order[i], cur), val;
        if (winAt(d.b, d.idx, cur)) val = 100000 + depth;
        else val = -search(d.b, depth - 1, -beta, -alpha, other);
        if (aborted) return best > -1e9 ? best : val;
        if (val > best) { best = val; bestCol = order[i]; }
        if (best > alpha) alpha = best;
        if (alpha >= beta) { killer[depth] = order[i]; break; }
      }
      TT[key] = { d: depth, val: best, col: bestCol, flag: best <= a0 ? -1 : best >= beta ? 1 : 0 };
      return best;
    }
    var vc = cols(b); if (!vc.length) return -1;
    // Gagner tout de suite / bloquer une victoire adverse immédiate.
    for (var i = 0; i < vc.length; i++) { var d1 = drop(b, vc[i], me); if (winAt(d1.b, d1.idx, me)) return vc[i]; }
    for (var j = 0; j < vc.length; j++) { var d2 = drop(b, vc[j], opp); if (winAt(d2.b, d2.idx, opp)) return vc[j]; }
    var oc = ORD.filter(function (c) { return vc.indexOf(c) >= 0; });
    var best = oc[0], bestV = -1e18;
    for (var dep = 2; dep <= maxDepth; dep++) {
      var localBest = best, localV = -1e18, alpha = -1e18;
      var roots = [best].concat(oc.filter(function (c) { return c !== best; }));
      for (var k = 0; k < roots.length; k++) {
        var dd = drop(b, roots[k], me);
        var v = winAt(dd.b, dd.idx, me) ? 1e9 : -search(dd.b, dep - 1, -1e18, -alpha, opp);
        if (aborted) break;
        if (v > localV) { localV = v; localBest = roots[k]; }
        if (localV > alpha) alpha = localV;
      }
      if (!aborted) { best = localBest; bestV = localV; }
      if (aborted || bestV >= 100000) break;
    }
    return best;
  }

  root.P4AI = { bestColumn: bestColumn, winAt: winAt, drop: drop, cols: cols };
})(typeof module !== 'undefined' && module.exports ? module.exports : (this.window = this.window || this));
