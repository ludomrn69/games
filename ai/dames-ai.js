/*
  dames-ai.js — Moteur + IA des Dames (PUR, sans DOM). Règles « anglaises » sur
  damier 8×8 (façon Checkers/Draughts des apps grand public) :
   • 12 pions chacun sur les cases sombres ; les pions avancent en diagonale ;
   • PRISE OBLIGATOIRE, et rafles multiples obligatoires (on enchaîne les sauts) ;
   • un pion qui atteint la dernière rangée devient DAME (déplacements + prises
     dans les 4 diagonales) ; un pion ne prend QUE vers l'avant ;
   • on gagne en capturant tous les pions adverses ou en le bloquant.

  IA : négamax α-β + table de transposition BORNÉE (drapeau + meilleur coup) +
  approfondissement itératif + QUIESCENCE sur les prises (la prise étant
  obligatoire, on prolonge les échanges forcés avant d'évaluer → supprime l'effet
  d'horizon, le plus gros gain de force) + borne de nœuds. Évaluation matérielle
  (dame ≫ pion) + avancement + rangée arrière + centralisation des dames. À
  profondeur 7–9 + quiescence, elle joue très fort, sans aucun apprentissage.

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
  // ── Variante configurable ──
  //  • en8   (défaut) : dames anglaises 8×8 — pions prennent vers l'avant,
  //    dame = 1 pas, promotion immédiate (stoppe la rafle).
  //  • int10 : dames INTERNATIONALES 10×10 — pions prennent AUSSI en arrière,
  //    DAMES VOLANTES (glissent/prennent à distance), PRISE MAJORITAIRE
  //    obligatoire, promotion seulement si le coup SE TERMINE sur la dernière
  //    rangée, pièces prises retirées en fin de rafle (marquées '*' : on ne
  //    peut ni les rejumper ni passer au travers).
  var N = 8, SZ = 64, INTL = false, MENROWS = 3;
  function configure(variant) {
    INTL = variant === 'int10';
    N = INTL ? 10 : 8; SZ = N * N; MENROWS = INTL ? 4 : 3;
  }
  function inB(r, c) { return r >= 0 && r < N && c >= 0 && c < N; }
  function isMan(ch, side) { return side === 'w' ? ch === 'w' : ch === 'b'; }
  function isKing(ch, side) { return side === 'w' ? ch === 'W' : ch === 'B'; }
  function isOwn(ch, side) { return isMan(ch, side) || isKing(ch, side); }
  function isFoe(ch, side) { return ch !== '.' && ch !== '*' && ch !== undefined && !isOwn(ch, side); }
  function other(side) { return side === 'w' ? 'b' : 'w'; }

  function startBoard() {
    var a = '.'.repeat(SZ).split('');
    for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) {
      if ((r + c) % 2 === 1) {
        if (r < MENROWS) a[r * N + c] = 'b';              // noirs en haut
        else if (r > N - 1 - MENROWS) a[r * N + c] = 'w'; // blancs en bas
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
      var king = isKing(curCh, side);
      // International : les PIONS prennent aussi en ARRIÈRE (4 diagonales).
      var dirs = (king || INTL) ? [[-1, -1], [-1, 1], [1, -1], [1, 1]] : moveDirs(curCh, side);
      var extended = false;
      for (var d = 0; d < dirs.length; d++) {
        var jumps = []; // [{mid, land}] possibles dans cette direction
        if (king && INTL) {
          // DAME VOLANTE : avance sur les cases vides, saute la 1ʳᵉ pièce adverse
          // rencontrée, atterrit sur n'importe quelle case vide derrière.
          var rr = r + dirs[d][0], cc = c + dirs[d][1];
          while (inB(rr, cc) && board[rr * N + cc] === '.') { rr += dirs[d][0]; cc += dirs[d][1]; }
          if (inB(rr, cc) && isFoe(board[rr * N + cc], side)) {
            var mid2 = rr * N + cc, lr2 = rr + dirs[d][0], lc2 = cc + dirs[d][1];
            while (inB(lr2, lc2) && board[lr2 * N + lc2] === '.') {
              jumps.push({ mid: mid2, land: lr2 * N + lc2 });
              lr2 += dirs[d][0]; lc2 += dirs[d][1];
            }
          }
        } else {
          var mr = r + dirs[d][0], mc = c + dirs[d][1];         // case enjambée
          var lr = r + 2 * dirs[d][0], lc = c + 2 * dirs[d][1]; // atterrissage
          if (inB(lr, lc) && isFoe(board[mr * N + mc], side) && board[lr * N + lc] === '.') {
            jumps.push({ mid: mr * N + mc, land: lr * N + lc });
          }
        }
        for (var jj = 0; jj < jumps.length; jj++) {
          var midIdx = jumps[jj].mid, landIdx = jumps[jj].land;
          // Effectuer le saut temporairement. International : la pièce prise reste
          // en place comme OBSTACLE ('*') jusqu'à la fin de la rafle.
          var savedMid = board[midIdx], savedFrom = board[curIdx];
          board[curIdx] = '.'; board[midIdx] = INTL ? '*' : '.';
          var landed = INTL ? curCh : promo(curCh, side, Math.floor(landIdx / N));
          board[landIdx] = landed;
          extended = true;
          // Règle anglaise : promotion en cours de rafle → la rafle s'arrête.
          if (!INTL && landed !== curCh && !king) {
            res.push(path.concat([landIdx]));
          } else {
            rec(landIdx, landed, path.concat([landIdx]));
          }
          // Restaurer.
          board[landIdx] = '.'; board[midIdx] = savedMid; board[curIdx] = savedFrom;
        }
      }
      if (!extended && path.length > 1) res.push(path); // fin de rafle
    })(idx, ch, [idx]);
    return res;
  }

  function legalMoves(boardStr, side) {
    var board = boardStr.split('');
    var caps = [], simples = [];
    for (var i = 0; i < SZ; i++) {
      var ch = board[i];
      if (!isOwn(ch, side)) continue;
      var cf = capturesFrom(board, i, ch, side);
      for (var k = 0; k < cf.length; k++) caps.push(cf[k]);
    }
    if (caps.length) {
      // International : PRISE MAJORITAIRE — on doit jouer une rafle du maximum.
      if (INTL) {
        var mx = 0;
        for (var m = 0; m < caps.length; m++) if (caps[m].length > mx) mx = caps[m].length;
        caps = caps.filter(function (p) { return p.length === mx; });
      }
      caps._caps = true;
      return caps; // prise obligatoire
    }
    for (var j = 0; j < SZ; j++) {
      var c2 = board[j];
      if (!isOwn(c2, side)) continue;
      var r = Math.floor(j / N), col = j % N, dirs = moveDirs(c2, side);
      for (var d = 0; d < dirs.length; d++) {
        if (INTL && isKing(c2, side)) {
          // Dame volante : glisse d'autant de cases vides qu'elle veut.
          var nr2 = r + dirs[d][0], nc2 = col + dirs[d][1];
          while (inB(nr2, nc2) && board[nr2 * N + nc2] === '.') {
            simples.push([j, nr2 * N + nc2]);
            nr2 += dirs[d][0]; nc2 += dirs[d][1];
          }
        } else {
          var nr = r + dirs[d][0], nc = col + dirs[d][1];
          if (inB(nr, nc) && board[nr * N + nc] === '.') simples.push([j, nr * N + nc]);
        }
      }
    }
    return simples;
  }

  // Applique un coup (suppose légal). Renvoie le NOUVEAU plateau (chaîne).
  // On balaie chaque segment de la diagonale : toute pièce adverse rencontrée
  // en chemin est retirée (couvre le saut court ET la dame volante).
  function applyMove(boardStr, move, side) {
    var b = boardStr.split('');
    var from = move[0], ch = b[from];
    b[from] = '.';
    for (var s = 1; s < move.length; s++) {
      var to = move[s], pr = Math.floor(from / N), pc = from % N, tr = Math.floor(to / N), tc = to % N;
      var dr = tr > pr ? 1 : -1, dc = tc > pc ? 1 : -1;
      var rr = pr + dr, cc = pc + dc;
      while (rr !== tr && inB(rr, cc)) {
        if (b[rr * N + cc] !== '.') b[rr * N + cc] = '.';
        rr += dr; cc += dc;
      }
      from = to;
    }
    var endR = Math.floor(move[move.length - 1] / N);
    b[move[move.length - 1]] = promo(ch, side, endR);
    return b.join('');
  }

  function counts(b) {
    var c = { w: 0, b: 0, W: 0, B: 0 };
    for (var i = 0; i < SZ; i++) { var ch = b[i]; if (c[ch] != null) c[ch]++; }
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
      var LAST = N - 1, MID = LAST / 2, START_TOTAL = MENROWS * N; // 24 en 8×8, 40 en 10×10
      for (var i = 0; i < SZ; i++) {
        var ch = b[i], r = Math.floor(i / N), col = i % N;
        if (ch === 'w') { sc += me === 'w' ? (LAST - r) * 2 : -(LAST - r) * 2; if (r === LAST) sc += me === 'w' ? 6 : -6; }
        else if (ch === 'b') { sc += me === 'b' ? r * 2 : -r * 2; if (r === 0) sc += me === 'b' ? 6 : -6; }
        else if (ch === 'W' || ch === 'B') {
          // Dame centralisée = plus forte (chasse mieux en finale).
          var dc = MID - Math.abs(MID - col), dr = MID - Math.abs(MID - r), centre = (dc + dr);
          sc += (isOwn(ch, me) ? centre : -centre);
        }
        if (ch !== '.' && col > 1 && col < N - 2) { var own = isOwn(ch, me); sc += own ? 1 : -1; }
      }
      // ── Conversion d'avantage (anti-nul) ────────────────────────────────
      // Sans ces termes, « difficile » pouvait mener au matériel puis tourner
      // en rond sans jamais conclure (parties stériles). Trois idées classiques :
      // 1) QUAND ON MÈNE, ÉCHANGER : le même écart matériel vaut plus quand il
      //    reste peu de pièces (+X% par pièce disparue) → l'IA simplifie au lieu
      //    d'éviter les échanges égaux.
      if (myMat > opMat) sc += Math.round((myMat - opMat) * (START_TOTAL - total)) >> 4;
      else if (opMat > myMat) sc -= Math.round((opMat - myMat) * (START_TOTAL - total)) >> 4;
      // 2) EN FINALE, TRAQUER : on pousse l'adversaire vers bords/coins (moins de
      //    fuites) et on RAPPROCHE nos dames de ses pièces (une dame qui chasse à
      //    distance ne mate jamais). Bon marché (O(64) + O(k²) sur peu de pièces).
      if (myMat > opMat && (opMen + opK) <= 4) {
        var foes = [], myKings = [];
        for (var f = 0; f < SZ; f++) {
          if (isFoe(b[f], me)) foes.push(f);
          else if (b[f] === (me === 'w' ? 'W' : 'B')) myKings.push(f);
        }
        for (var fi = 0; fi < foes.length; fi++) {
          var fr = Math.floor(foes[fi] / N), fc = foes[fi] % N;
          sc += (Math.abs(MID - fr) + Math.abs(MID - fc)) * 3;
          // distance de Tchebychev de la dame la plus proche → plus près = mieux
          var bestDist = 99;
          for (var ki = 0; ki < myKings.length; ki++) {
            var kr = Math.floor(myKings[ki] / N), kc = myKings[ki] % N;
            var dch = Math.max(Math.abs(kr - fr), Math.abs(kc - fc));
            if (dch < bestDist) bestDist = dch;
          }
          if (bestDist < 99) sc += (7 - bestDist) * 4;
        }
      }
      // (Pas de terme de mobilité ici : appeler legalMoves à chaque feuille coûte
      //  trop cher. Le tri des coups par rafle + l'extension de finale suffisent.)
      return side === me ? sc : -sc;
    }

    // Cap de nœuds GÉNÉREUX : aux Dames une recherche profondeur 8–9 s'achève en
    // quelques dizaines de ms ; un cap trop bas tronquait la profondeur visée (le
    // niveau « difficile » n'atteignait jamais sa profondeur nominale). Le cap ne
    // sert plus que de garde-fou pour les positions pathologiques.
    var NODE_CAP = 600000, nodes = 0, aborted = false, TT = {};
    // Quiescence seulement à partir de « moyen » (maxDepth ≥ 4) : en « facile »
    // (profondeur 2) on la coupe pour que le bot reste réellement faible.
    var useQuiesce = maxDepth >= 4;
    // legalMoves ne renvoie JAMAIS un mélange : soit uniquement des prises (elles
    // sont obligatoires), soit uniquement des déplacements simples. Une prise saute
    // 2 rangées → on teste le 1er coup pour savoir si la liste est faite de prises.
    function isCaptureList(moves) {
      // legalMoves marque la liste des prises (le test « saut de 2 rangées » ne
      // couvre pas les dames volantes de la variante internationale).
      if (moves._caps) return true;
      return moves.length > 0 && Math.abs(((moves[0][1] / N) | 0) - ((moves[0][0] / N) | 0)) === 2;
    }
    // Quiescence : la PRISE étant OBLIGATOIRE, une position où l'on doit prendre
    // n'est pas « calme ». On prolonge donc la recherche sur les seules prises
    // (forcées, donc bornées par le matériel restant) AVANT d'évaluer — ce qui
    // supprime l'effet d'horizon : couper au milieu d'un échange fausse totalement
    // le bilan matériel. C'est le plus gros gain de force aux Dames.
    function quiesce(b, side, alpha, beta) {
      if (++nodes > NODE_CAP) { aborted = true; return 0; }
      var moves = legalMoves(b, side);
      if (!moves.length) return side === me ? -100000 : 100000; // bloqué → perdu
      if (!isCaptureList(moves)) return evaluate(b, side);        // position calme
      moves.sort(function (a, z) { return z.length - a.length; });
      var best = -1e9, nx = other(side);
      for (var i = 0; i < moves.length; i++) {
        var v = -quiesce(applyMove(b, moves[i], side), nx, -beta, -alpha);
        if (aborted) return best > -1e9 ? best : v;
        if (v > best) best = v;
        if (best > alpha) alpha = best;
        if (alpha >= beta) break;
      }
      return best;
    }
    // Négamax α-β + table de transposition BORNÉE (drapeau exact/min/max + meilleur
    // coup mémorisé, ré-essayé en premier). Stocker le drapeau est indispensable :
    // une coupure α-β ne donne qu'une borne, pas le vrai score.
    function search(b, side, depth, alpha, beta) {
      if (++nodes > NODE_CAP) { aborted = true; return 0; }
      var moves = legalMoves(b, side);
      if (!moves.length) return side === me ? -100000 - depth : 100000 + depth; // bloqué → perdu
      if (depth <= 0) return useQuiesce ? quiesce(b, side, alpha, beta) : evaluate(b, side);
      var a0 = alpha, key = b + side, tt = TT[key], ttMove = null;
      if (tt) {
        ttMove = tt.move;
        if (tt.d >= depth) {
          if (tt.flag === 0) return tt.val;
          if (tt.flag < 0) { if (tt.val < beta) beta = tt.val; } else { if (tt.val > alpha) alpha = tt.val; }
          if (alpha >= beta) return tt.val;
        }
      }
      // Tri : coup de la TT d'abord, puis rafles longues — meilleures coupures.
      moves.sort(function (a, z) { return z.length - a.length; });
      if (ttMove) { for (var t = 0; t < moves.length; t++) { if (moves[t].join(',') === ttMove) { moves.unshift(moves.splice(t, 1)[0]); break; } } }
      var best = -1e9, bestMv = moves[0], nx = other(side);
      for (var i = 0; i < moves.length; i++) {
        var nb = applyMove(b, moves[i], side);
        var v = -search(nb, nx, depth - 1, -beta, -alpha);
        if (aborted) return best > -1e9 ? best : v;
        if (v > best) { best = v; bestMv = moves[i]; }
        if (best > alpha) alpha = best;
        if (alpha >= beta) break;
      }
      if (!aborted) TT[key] = { d: depth, val: best, move: bestMv.join(','), flag: best <= a0 ? -1 : best >= beta ? 1 : 0 };
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
    configure: configure,
    size: function () { return N; },
    bestMove: bestMove,
    legalMoves: legalMoves,
    applyMove: applyMove,
    startBoard: startBoard,
    isOwn: isOwn,
    counts: counts,
    other: other
  };
})(typeof module !== 'undefined' && module.exports ? module.exports : (this.window = this.window || this));
