/*
  blokus-ai.js — Moteur (géométrie) + IA du Blokus (PUR, sans DOM). Plateau 20×20
  (chaîne de 400 cases, index r*20+c, '.' = vide, sinon couleur B/Y/R/G). 21 pièces
  (polyominos de 1 à 5 cases). Règle de pose : la 1re pièce touche le coin de départ
  de sa couleur ; ensuite chaque pièce touche une pièce de SA couleur par un COIN
  (diagonale) mais JAMAIS par un côté.

  IA (chooseMove) — gloutonne mais efficace : pose la PLUS GROSSE pièce jouable, en
  maximisant les COINS libres créés (mobilité future) et la progression vers le
  centre. Énumération ancrée sur les coins disponibles → rapide.

  API :
    BlokusAI.chooseMove(board, color, pieces, first) → { pid, abs:[[r,c]…] } | null
    BlokusAI.randomMove(board, color, pieces, first)  → un coup valide au hasard | null
    BlokusAI.isValidPlacement · blokusAnchors · applyMove(board, abs, color)
    BlokusAI.PIECES · ORIENT · ALL_PIECE_IDS · COLOR_CORNER · squaresOf(pieces)
  Utilisé par games/blokus.html ET par tools/bench-games.js.
*/
(function (root) {
  'use strict';
  var SIZE = 20;
  var COLOR_CORNER = { B: [0, 0], Y: [0, 19], R: [19, 19], G: [19, 0] };
  var PIECES = {
    '1': [[0, 0]], '2': [[0, 0], [0, 1]], '3I': [[0, 0], [0, 1], [0, 2]], '3V': [[0, 0], [0, 1], [1, 0]],
    '4I': [[0, 0], [0, 1], [0, 2], [0, 3]], '4O': [[0, 0], [0, 1], [1, 0], [1, 1]], '4L': [[0, 0], [0, 1], [0, 2], [1, 0]], '4T': [[0, 0], [0, 1], [0, 2], [1, 1]], '4S': [[0, 1], [0, 2], [1, 0], [1, 1]],
    '5F': [[0, 1], [0, 2], [1, 0], [1, 1], [2, 1]], '5I': [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]], '5L': [[0, 0], [1, 0], [2, 0], [3, 0], [3, 1]], '5N': [[0, 1], [1, 1], [2, 0], [2, 1], [3, 0]], '5P': [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0]],
    '5T': [[0, 0], [0, 1], [0, 2], [1, 1], [2, 1]], '5U': [[0, 0], [0, 2], [1, 0], [1, 1], [1, 2]], '5V': [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]], '5W': [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2]], '5X': [[0, 1], [1, 0], [1, 1], [1, 2], [2, 1]], '5Y': [[0, 1], [1, 0], [1, 1], [2, 1], [3, 1]], '5Z': [[0, 0], [0, 1], [1, 1], [2, 1], [2, 2]]
  };
  var ALL_PIECE_IDS = ['1', '2', '3I', '3V', '4I', '4O', '4L', '4T', '4S', '5F', '5I', '5L', '5N', '5P', '5T', '5U', '5V', '5W', '5X', '5Y', '5Z'];

  function normalizeCells(cells) {
    var minR = 1e9, minC = 1e9;
    cells.forEach(function (c) { if (c[0] < minR) minR = c[0]; if (c[1] < minC) minC = c[1]; });
    return cells.map(function (c) { return [c[0] - minR, c[1] - minC]; }).sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
  }
  function rotateCellsCW(cells) { return normalizeCells(cells.map(function (c) { return [c[1], -c[0]]; })); }
  function flipCells(cells) { return normalizeCells(cells.map(function (c) { return [c[0], -c[1]]; })); }
  function getCell(board, r, c) { if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return null; var v = board.charAt(r * SIZE + c); return v === '.' ? null : v; }
  function applyMove(board, abs, color) { var a = board.split(''); abs.forEach(function (c) { a[c[0] * SIZE + c[1]] = color; }); return a.join(''); }

  // Toutes les orientations distinctes (rotations + symétrie) de chaque pièce.
  var ORIENT = {};
  ALL_PIECE_IDS.forEach(function (pid) {
    var base = normalizeCells(PIECES[pid]), variants = [], cur = base, i;
    for (i = 0; i < 4; i++) { variants.push(cur); cur = rotateCellsCW(cur); }
    cur = flipCells(base);
    for (i = 0; i < 4; i++) { variants.push(cur); cur = rotateCellsCW(cur); }
    var seen = {}, list = [];
    variants.forEach(function (v) { var k = v.map(function (c) { return c[0] + ',' + c[1]; }).join(';'); if (!seen[k]) { seen[k] = true; list.push(v); } });
    ORIENT[pid] = list;
  });

  function isValidPlacement(board, color, abs, isFirst) {
    for (var i = 0; i < abs.length; i++) { var r = abs[i][0], c = abs[i][1]; if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return false; if (getCell(board, r, c) !== null) return false; }
    if (isFirst) { var corner = COLOR_CORNER[color]; return abs.some(function (a) { return a[0] === corner[0] && a[1] === corner[1]; }); }
    var cornerOk = false;
    for (var k = 0; k < abs.length; k++) {
      var rr = abs[k][0], cc = abs[k][1];
      var edges = [[rr - 1, cc], [rr + 1, cc], [rr, cc - 1], [rr, cc + 1]];
      for (var e = 0; e < 4; e++) if (getCell(board, edges[e][0], edges[e][1]) === color) return false;
      var corners = [[rr - 1, cc - 1], [rr - 1, cc + 1], [rr + 1, cc - 1], [rr + 1, cc + 1]];
      for (var d = 0; d < 4; d++) if (getCell(board, corners[d][0], corners[d][1]) === color) cornerOk = true;
    }
    return cornerOk;
  }

  function blokusAnchors(board, color, first) {
    if (first) return [COLOR_CORNER[color]];
    var seen = {}, res = [];
    for (var r = 0; r < SIZE; r++) for (var c = 0; c < SIZE; c++) {
      if (getCell(board, r, c) !== color) continue;
      [[r - 1, c - 1], [r - 1, c + 1], [r + 1, c - 1], [r + 1, c + 1]].forEach(function (d) {
        if (d[0] < 0 || d[0] > 19 || d[1] < 0 || d[1] > 19) return;
        if (getCell(board, d[0], d[1]) !== null) return;
        var key = d[0] * SIZE + d[1]; if (!seen[key]) { seen[key] = true; res.push([d[0], d[1]]); }
      });
    }
    return res;
  }

  function blokusScore(board, color, abs) {
    var occ = {}; abs.forEach(function (c) { occ[c[0] * SIZE + c[1]] = true; });
    function mine(r, c) { if (r < 0 || r > 19 || c < 0 || c > 19) return false; return occ[r * SIZE + c] || getCell(board, r, c) === color; }
    var cornerSeen = {}, corners = 0;
    abs.forEach(function (c) {
      [[c[0] - 1, c[1] - 1], [c[0] - 1, c[1] + 1], [c[0] + 1, c[1] - 1], [c[0] + 1, c[1] + 1]].forEach(function (d) {
        var r = d[0], cc = d[1]; if (r < 0 || r > 19 || cc < 0 || cc > 19) return;
        if (occ[r * SIZE + cc] || getCell(board, r, cc) !== null) return;
        if (mine(r - 1, cc) || mine(r + 1, cc) || mine(r, cc - 1) || mine(r, cc + 1)) return; // pas un vrai coin
        var k = r * SIZE + cc; if (!cornerSeen[k]) { cornerSeen[k] = true; corners++; }
      });
    });
    var minDist = 1e9; abs.forEach(function (c) { var d = Math.abs(c[0] - 9.5) + Math.abs(c[1] - 9.5); if (d < minDist) minDist = d; });
    return abs.length * 1000 + corners * 8 + (40 - minDist) * 2;
  }

  function chooseMove(board, color, pieces, first) {
    if (!pieces || !pieces.length) return null;
    var anchors = blokusAnchors(board, color, first);
    if (!anchors.length) return null;
    var bySize = {}; pieces.forEach(function (pid) { var sz = PIECES[pid].length; (bySize[sz] = bySize[sz] || []).push(pid); });
    var sizes = Object.keys(bySize).map(Number).sort(function (a, b) { return b - a; });
    for (var si = 0; si < sizes.length; si++) {
      var cands = [];
      bySize[sizes[si]].forEach(function (pid) {
        ORIENT[pid].forEach(function (cells) {
          anchors.forEach(function (ac) {
            for (var pv = 0; pv < cells.length; pv++) {
              var dr = ac[0] - cells[pv][0], dc = ac[1] - cells[pv][1];
              var abs = cells.map(function (c) { return [c[0] + dr, c[1] + dc]; });
              if (!isValidPlacement(board, color, abs, first)) continue;
              cands.push({ pid: pid, abs: abs, sc: blokusScore(board, color, abs) });
            }
          });
        });
      });
      if (!cands.length) continue;                          // ce calibre ne passe pas → plus petit
      // VARIÉTÉ : on ne joue pas TOUJOURS le coup unique optimal (sinon les bots
      // jouent tous pareil et se reflètent). On tire au hasard parmi les coups
      // PROCHES du meilleur (mêmes grosses pièces, presque autant de coins) → jeu
      // toujours fort mais des adversaires aux styles différents.
      cands.sort(function (a, b) { return b.sc - a.sc; });
      var best = cands[0].sc;
      var pool = cands.filter(function (c) { return c.sc >= best - 12; });
      if (pool.length < 4) pool = cands.slice(0, Math.min(4, cands.length));
      var pick = pool[Math.floor(Math.random() * pool.length)];
      return { pid: pick.pid, abs: pick.abs };
    }
    return null;
  }

  // Un coup valide au hasard (joueur « facile » / référence du banc). Énumère les
  // coups valides (plafonnés) puis en tire un — ne « passe » que s'il n'y en a aucun.
  function randomMove(board, color, pieces, first) {
    if (!pieces || !pieces.length) return null;
    var anchors = blokusAnchors(board, color, first);
    if (!anchors.length) return null;
    var found = [], CAP = 250;
    for (var pi = 0; pi < pieces.length && found.length < CAP; pi++) {
      var pid = pieces[pi], orients = ORIENT[pid];
      for (var oi = 0; oi < orients.length && found.length < CAP; oi++) {
        var cells = orients[oi];
        for (var ai = 0; ai < anchors.length && found.length < CAP; ai++) {
          var ac = anchors[ai];
          for (var pv = 0; pv < cells.length; pv++) {
            var dr = ac[0] - cells[pv][0], dc = ac[1] - cells[pv][1];
            var abs = cells.map(function (c) { return [c[0] + dr, c[1] + dc]; });
            if (isValidPlacement(board, color, abs, first)) { found.push({ pid: pid, abs: abs }); break; }
          }
        }
      }
    }
    return found.length ? found[Math.floor(Math.random() * found.length)] : null;
  }

  function squaresOf(pieces) { var s = 0; (pieces || []).forEach(function (p) { s += (PIECES[p] || []).length; }); return s; }

  // Coup « débutant plausible » (niveau facile) : privilégie les GROSSES pièces
  // — comme un humain qui sait qu'il faut les caser tôt — mais les place au
  // hasard, sans optimiser coins ni mobilité. Bien plus crédible que randomMove
  // (qui pose volontiers le mono-carré au 2e tour), tout en restant très battable.
  function weakMove(board, color, pieces, first) {
    if (!pieces || !pieces.length) return null;
    var maxSz = 0;
    pieces.forEach(function (p) { var sz = (PIECES[p] || []).length; if (sz > maxSz) maxSz = sz; });
    var bigs = pieces.filter(function (p) { return (PIECES[p] || []).length >= maxSz - 1; });
    return randomMove(board, color, bigs, first) || randomMove(board, color, pieces, first);
  }

  root.BlokusAI = {
    chooseMove: chooseMove, randomMove: randomMove, weakMove: weakMove, isValidPlacement: isValidPlacement,
    blokusAnchors: blokusAnchors, applyMove: applyMove, squaresOf: squaresOf,
    PIECES: PIECES, ORIENT: ORIENT, ALL_PIECE_IDS: ALL_PIECE_IDS, COLOR_CORNER: COLOR_CORNER, SIZE: SIZE
  };
})(typeof module !== 'undefined' && module.exports ? module.exports : (this.window = this.window || this));
