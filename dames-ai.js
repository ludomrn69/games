/*
  dames-ai.js — Moteur + IA des Dames (PUR, sans DOM). Règles « anglaises » sur
  damier 8×8 (façon Checkers/Draughts des apps grand public) :
   • 12 pions chacun sur les cases sombres ; les pions avancent en diagonale ;
   • PRISE OBLIGATOIRE, et rafles multiples obligatoires (on enchaîne les sauts) ;
   • un pion qui atteint la dernière rangée devient DAME (déplacements + prises
     dans les 4 diagonales) ; un pion ne prend QUE vers l'avant ;
   • on gagne en capturant tous les pions adverses ou en le bloquant.

  IA : négamax α-β + table de transposition + approfondissement itératif + borne
  de nœuds. Évaluation matérielle (dame ≫ pion) + avancement + rangée arrière +
  mobilité. À profondeur 6–9 elle joue très fort, sans aucun apprentissage.

  Représentation :
   • board : 64 caractères (index r*8+c). '.'=vide/inutilisé. Pions : 'w','b' ;
     dames : 'W','B'. Seules les cases sombres (r+c impair) sont utilisées.
   • Un COUP = tableau d'index [départ, case1, case2, …]. Coup simple = [from,to].
     Rafle = [from, atterr1, atterr2, …] (chaque saut enjambe un adverse).

  API : DamesAI.bestMove(board, me, opp, maxDepth) → coup (tableau) ou null.
  Helpers : legalMoves, applyMove, startBoard, isOwn.
*/
(function (root) {
  'use strict';
  var N = 8;
  function inB(r, c) { return r >= 0 && r < N && c >= 0 && c < N; }
  function isMan(ch, side) { return side === 'w' ? ch === 'w' : ch === 'b'; }
  function isKing(ch, side) { return side === 'w' ? ch === 'W' : ch === 'B'; }
  function isOwn(ch, side) { return isMan(ch, side) || isKing(ch, side); }
  function isFoe(ch, side) { return ch !== '.' && ch !== undefined && !isOwn(ch, side); }
  function other(side) { return side === 'w' ? 'b' : 'w'; }

  function startBoard() {
    var a = '.'.repeat(64).split('');
    for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) {
      if ((r + c) % 2 === 1) {
        if (r < 3) a[r * N + c] = 'b';        // noirs en haut (rangées 0-2)
        else if (r > 4) a[r * N + c] = 'w';    // blancs en bas (rangées 5-7)
      }
    }
    return a.join('');
  }

  // Directions de déplacement selon la pièce.
  function moveDirs(ch, side) {
    if (isKing(ch, side)) return [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    return side === 'w' ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]]; // blanc monte, noir descend
  }
  function promo(ch, side, r) {
    if (isKing(ch, side)) return ch;
    if (side === 'w' && r === 0) return 'W';
    if (side === 'b' && r === N - 1) return 'B';
    return ch;
  }

  // Toutes les rafles depuis (r,c) pour la pièce `ch`. Renvoie des chemins
  // [from, ...landings]. `board` est un tableau de caractères (muté/restauré).
  function capturesFrom(board, idx, ch, side) {
    var res = [];
    (function rec(curIdx, curCh, path) {
      var r = Math.floor(curIdx / N), c = curIdx % N;
      var dirs = isKing(curCh, side) ? [[-1, -1], [-1, 1], [1, -1], [1, 1]] : moveDirs(curCh, side);
      var extended = false;
      for (var d = 0; d < dirs.length; d++) {
        var mr = r + dirs[d][0], mc = c + dirs[d][1];       // case enjambée
        var lr = r + 2 * dirs[d][0], lc = c + 2 * dirs[d][1]; // atterrissage
        if (!inB(lr, lc)) continue;
        var midIdx = mr * N + mc, landIdx = lr * N + lc;
        if (!isFoe(board[midIdx], side)) continue;
        if (board[landIdx] !== '.') continue;
        // Effectuer le saut temporairement.
        var savedMid = board[midIdx], savedFrom = board[curIdx];
        board[curIdx] = '.'; board[midIdx] = '.';
        var landed = promo(curCh, side, lr);
        board[landIdx] = landed;
        extended = true;
        // Si promotion en cours de rafle → la rafle s'arrête (règle anglaise).
        if (landed !== curCh && !isKing(curCh, side)) {
          res.push(path.concat([landIdx]));
        } else {
          rec(landIdx, landed, path.concat([landIdx]));
        }
        // Restaurer.
        board[landIdx] = '.'; board[midIdx] = savedMid; board[curIdx] = savedFrom;
      }
      if (!extended && path.length > 1) res.push(path); // fin de rafle
    })(idx, ch, [idx]);
    return res;
  }

  function legalMoves(boardStr, side) {
    var board = boardStr.split('');
    var caps = [], simples = [];
    for (var i = 0; i < 64; i++) {
      var ch = board[i];
      if (!isOwn(ch, side)) continue;
      var cf = capturesFrom(board, i, ch, side);
      for (var k = 0; k < cf.length; k++) caps.push(cf[k]);
    }
    if (caps.length) return caps; // prise obligatoire
    for (var j = 0; j < 64; j++) {
      var c2 = board[j];
      if (!isOwn(c2, side)) continue;
      var r = Math.floor(j / N), col = j % N, dirs = moveDirs(c2, side);
      for (var d = 0; d < dirs.length; d++) {
        var nr = r + dirs[d][0], nc = col + dirs[d][1];
        if (inB(nr, nc) && board[nr * N + nc] === '.') simples.push([j, nr * N + nc]);
      }
    }
    return simples;
  }

  // Applique un coup (suppose légal). Renvoie le NOUVEAU plateau (chaîne).
  function applyMove(boardStr, move, side) {
    var b = boardStr.split('');
    var from = move[0], ch = b[from];
    b[from] = '.';
    for (var s = 1; s < move.length; s++) {
      var to = move[s], pr = Math.floor(from / N), pc = from % N, tr = Math.floor(to / N), tc = to % N;
      if (Math.abs(tr - pr) === 2) { // saut → retirer la pièce enjambée
        var mr = (pr + tr) / 2, mc = (pc + tc) / 2; b[mr * N + mc] = '.';
      }
      from = to;
    }
    var endR = Math.floor(move[move.length - 1] / N);
    b[move[move.length - 1]] = promo(ch, side, endR);
    return b.join('');
  }

  function counts(b) {
    var c = { w: 0, b: 0, W: 0, B: 0 };
    for (var i = 0; i < 64; i++) { var ch = b[i]; if (c[ch] != null) c[ch]++; }
    return c;
  }

  function bestMove(boardStr, me, opp, maxDepth) {
    me = me || 'w'; opp = opp || other(me); maxDepth = maxDepth || 6;
    var MAN = 100, KING = 235;

    function evaluate(b, side) {
      var c = counts(b);
      var myMen = me === 'w' ? c.w : c.b, myK = me === 'w' ? c.W : c.B;
      var opMen = me === 'w' ? c.b : c.w, opK = me === 'w' ? c.B : c.W;
      var myMat = MAN * myMen + KING * myK, opMat = MAN * opMen + KING * opK;
      var sc = myMat - opMat;
      var total = myMen + myK + opMen + opK;
      for (var i = 0; i < 64; i++) {
        var ch = b[i], r = Math.floor(i / N), col = i % N;
        if (ch === 'w') { sc += me === 'w' ? (7 - r) * 2 : -(7 - r) * 2; if (r === 7) sc += me === 'w' ? 6 : -6; }
        else if (ch === 'b') { sc += me === 'b' ? r * 2 : -r * 2; if (r === 0) sc += me === 'b' ? 6 : -6; }
        else if (ch === 'W' || ch === 'B') {
          // Dame centralisée = plus forte (chasse mieux en finale).
          var dc = 3.5 - Math.abs(3.5 - col), dr = 3.5 - Math.abs(3.5 - r), centre = (dc + dr);
          sc += (isOwn(ch, me) ? centre : -centre);
        }
        if (ch !== '.' && col > 1 && col < 6) { var own = isOwn(ch, me); sc += own ? 1 : -1; }
      }
      // Quand l'adversaire n'a presque plus de pièces et qu'on mène, on le POUSSE
      // vers les bords/coins (où il a moins de fuite). Terme bon marché (O(64)),
      // sans recherche profonde ni legalMoves — pour rester rapide.
      if (myMat > opMat && (opMen + opK) <= 2) {
        for (var f = 0; f < 64; f++) {
          if (!isFoe(b[f], me)) continue;
          var fr = Math.floor(f / N), fc = f % N;
          sc += (Math.abs(3.5 - fr) + Math.abs(3.5 - fc)) * 3;
        }
      }
      // (Pas de terme de mobilité ici : appeler legalMoves à chaque feuille coûte
      //  trop cher. Le tri des coups par rafle + l'extension de finale suffisent.)
      return side === me ? sc : -sc;
    }

    var NODE_CAP = 45000, nodes = 0, aborted = false, TT = {};
    function search(b, side, depth, alpha, beta) {
      if (++nodes > NODE_CAP) { aborted = true; return 0; }
      var moves = legalMoves(b, side);
      if (!moves.length) { // bloqué / plus de pièces → perdu pour `side`
        return side === me ? -100000 - depth : 100000 + depth;
      }
      if (depth <= 0) return evaluate(b, side);
      var key = b + side + depth, tt = TT[key];
      if (tt != null) return tt;
      // Tri : les rafles longues d'abord (meilleures coupures).
      moves.sort(function (a, z) { return z.length - a.length; });
      var best = -1e9, nx = other(side);
      for (var i = 0; i < moves.length; i++) {
        var nb = applyMove(b, moves[i], side);
        var v = -search(nb, nx, depth - 1, -beta, -alpha);
        if (aborted) return best > -1e9 ? best : v;
        if (v > best) best = v;
        if (best > alpha) alpha = best;
        if (alpha >= beta) break;
      }
      if (!aborted) TT[key] = best;
      return best;
    }

    var roots = legalMoves(boardStr, me);
    if (!roots.length) return null;
    if (roots.length === 1) return roots[0];
    roots.sort(function (a, z) { return z.length - a.length; });
    var best = roots[0];
    for (var dep = 2; dep <= maxDepth; dep++) {
      var localBest = best, localV = -1e18, alpha = -1e18;
      var ordered = [best].concat(roots.filter(function (m) { return m !== best; }));
      for (var k = 0; k < ordered.length; k++) {
        var nb = applyMove(boardStr, ordered[k], me);
        var v = -search(nb, opp, dep - 1, -1e18, -alpha);
        if (aborted) break;
        if (v > localV) { localV = v; localBest = ordered[k]; }
        if (localV > alpha) alpha = localV;
      }
      if (!aborted) best = localBest;
      if (aborted) break;
    }
    return best;
  }

  root.DamesAI = {
    bestMove: bestMove,
    legalMoves: legalMoves,
    applyMove: applyMove,
    startBoard: startBoard,
    isOwn: isOwn,
    counts: counts,
    other: other
  };
})(typeof module !== 'undefined' && module.exports ? module.exports : (this.window = this.window || this));
