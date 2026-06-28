/*
  cluedo-engine.js — Moteur Cluedo PUR (sans DOM). Plateau 13×13 (lattice de
  couloirs + 9 pièces), déplacement case par case, suggestions / réfutations,
  accusation, et IA de déduction. Testé par simulation, inclus tel quel dans
  cluedo.html.
*/
(function (root) {
  'use strict';

  var SUSPECTS = ['Moutarde', 'Rose', 'Violet', 'Leblanc', 'Olive', 'Pervenche'];
  var WEAPONS = ['Poignard', 'Chandelier', 'Revolver', 'Corde', 'Clé', 'Matraque'];
  // 9 pièces, index = br*3+bc (br,bc ∈ 0..2). Disposition fidèle au Cluedo : les 4
  // COINS sont les pièces à passage secret, comme sur le plateau Hasbro :
  //   Cuisine (HG) · Salle de bal (HC) · Véranda (HD)
  //   Salle à manger (MG) · Bibliothèque (M) · Billard (MD)
  //   Salon (BG) · Vestibule (BC) · Bureau (BD)
  var ROOMS = ['Cuisine', 'Salle de bal', 'Véranda', 'Salle à manger', 'Bibliothèque', 'Billard', 'Salon', 'Vestibule', 'Bureau'];
  // Passages secrets entre coins OPPOSÉS, comme dans le vrai jeu :
  //   Cuisine (0) ↔ Bureau (8)  et  Véranda (2) ↔ Salon (6).
  var SECRET = { 0: 8, 8: 0, 2: 6, 6: 2 };
  var ALLCARDS = SUSPECTS.concat(WEAPONS).concat(ROOMS);
  var START_CELLS = ['0,2', '12,10', '0,10', '12,2', '6,0', '6,12']; // jusqu'à 6 joueurs

  function catOf(card) { return SUSPECTS.indexOf(card) >= 0 ? 'suspect' : WEAPONS.indexOf(card) >= 0 ? 'arme' : 'piece'; }
  function cardsOfCat(cat) { return cat === 'suspect' ? SUSPECTS : cat === 'arme' ? WEAPONS : ROOMS; }

  // ── Plateau ────────────────────────────────────────────────────────────────
  function isCorr(r, c) { return r >= 0 && r <= 12 && c >= 0 && c <= 12 && (r % 4 === 0 || c % 4 === 0); }
  function doorLanes(idx) { var br = Math.floor(idx / 3), bc = idx % 3; return [[4 * br, 4 * bc + 2], [4 * br + 4, 4 * bc + 2], [4 * br + 2, 4 * bc], [4 * br + 2, 4 * bc + 4]]; }
  function roomCells(idx) { var br = Math.floor(idx / 3), bc = idx % 3, a = []; for (var r = 4 * br + 1; r <= 4 * br + 3; r++) for (var c = 4 * bc + 1; c <= 4 * bc + 3; c++) a.push([r, c]); return a; }
  function roomOfCell(r, c) { if (r % 4 === 0 || c % 4 === 0) return -1; return Math.floor((r - 1) / 4) * 3 + Math.floor((c - 1) / 4); }
  function isRoomNode(n) { return typeof n === 'string' && n[0] === 'R'; }
  function roomIdx(n) { return +n.slice(1); }

  function occupiedCorr(s, exclude) {
    var occ = {};
    s.order.forEach(function (p) { if (p === exclude) return; var n = s.pos[p]; if (n && !isRoomNode(n)) occ[n] = true; });
    return occ;
  }
  // Voisins d'un nœud (couloir 'r,c' ou pièce 'Rk'). Renvoie [{node, terminal}].
  function neighbors(s, node, occ) {
    var out = [];
    if (isRoomNode(node)) {
      doorLanes(roomIdx(node)).forEach(function (d) { var id = d[0] + ',' + d[1]; if (!occ[id]) out.push({ node: id, terminal: false }); });
      return out;
    }
    var parts = node.split(','), r = +parts[0], c = +parts[1];
    [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].forEach(function (nb) {
      if (isCorr(nb[0], nb[1])) { var id = nb[0] + ',' + nb[1]; if (!occ[id]) out.push({ node: id, terminal: false }); }
    });
    // portes vers une pièce
    for (var k = 0; k < 9; k++) { var dl = doorLanes(k); for (var j = 0; j < dl.length; j++) { if (dl[j][0] === r && dl[j][1] === c) { out.push({ node: 'R' + k, terminal: true }); } } }
    return out;
  }
  // Nœuds atteignables en 1..die pas (BFS). Les pièces sont terminales.
  function reachable(s, pid, die) {
    var start = s.pos[pid], occ = occupiedCorr(s, pid);
    var dist = {}; dist[start] = 0; var q = [start], res = {};
    while (q.length) {
      var cur = q.shift(), d = dist[cur];
      if (d >= die) continue;
      if (isRoomNode(cur) && cur !== start) continue; // ne pas traverser une pièce
      neighbors(s, cur, occ).forEach(function (nb) {
        if (dist[nb.node] == null) { dist[nb.node] = d + 1; res[nb.node] = d + 1; if (!nb.terminal) q.push(nb.node); else q.push(nb.node); }
      });
    }
    delete res[start];
    return res; // {node: dist}
  }

  // ── Cartes / distribution ───────────────────────────────────────────────────
  function shuffle(a, rnd) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor((rnd ? rnd() : Math.random()) * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function pick(arr, rnd) { return arr[Math.floor((rnd ? rnd() : Math.random()) * arr.length)]; }

  function initGame(order, rnd) {
    var sol = { suspect: pick(SUSPECTS, rnd), arme: pick(WEAPONS, rnd), piece: pick(ROOMS, rnd) };
    var deck = ALLCARDS.filter(function (c) { return c !== sol.suspect && c !== sol.arme && c !== sol.piece; });
    shuffle(deck, rnd);
    var hands = {}; order.forEach(function (p) { hands[p] = []; });
    deck.forEach(function (c, i) { hands[order[i % order.length]].push(c); });
    var pos = {}; order.forEach(function (p, i) { pos[p] = START_CELLS[i % START_CELLS.length]; });
    var s = {
      order: order.slice(), turn: order[0], phase: 'roll',
      pos: pos, hands: hands, solution: sol,
      dice: 0, reach: null, suggestion: null, eliminated: {},
      mem: {}, winner: null, log: [], turnCount: 0
    };
    order.forEach(function (p) { s.mem[p] = buildMem(s, p); });
    return s;
  }

  // ── Base de connaissances de déduction (par joueur — utilisée par l'IA) ──────
  // Solveur par contraintes mis à jour à chaque ÉVÉNEMENT PUBLIC (suggestion +
  // qui a réfuté / passé). Chaque joueur (observateur) en tient une.
  //   holds[card] = pid        : on sait que pid détient la carte (donc pas l'enveloppe)
  //   no[pid][card] = true     : on sait que pid NE détient PAS la carte
  //   clauses = [{pid,cards}]   : pid détient AU MOINS une de ces cartes (réfutation vue de loin)
  //   env[cat] = card          : carte solution identifiée
  function emptyMem(pid) { return { self: pid, hand: [], holds: {}, no: {}, clauses: [], env: { suspect: null, arme: null, piece: null } }; }
  function setNo(m, pid, card) { (m.no[pid] = m.no[pid] || {})[card] = true; }
  function setHolds(m, order, card, owner) { if (m.holds[card]) return; m.holds[card] = owner; order.forEach(function (P) { if (P !== owner) setNo(m, P, card); }); }
  function buildMem(s, pid) { var m = emptyMem(pid); m.hand = (s.hands[pid] || []).slice(); m.hand.forEach(function (c) { setHolds(m, s.order, c, pid); }); propagate(m, s.order); return m; }

  // Enregistre un événement public dans la mémoire de TOUS les joueurs.
  // ev = { by, cards:[s,w,r], disprover|null, shown|null, passers:[pids], responders:[pids] }
  function recordEvent(s, ev) { s.order.forEach(function (pid) { updateMem(s.mem[pid], s.order, ev, pid); }); }
  function updateMem(m, order, ev, observer) {
    (ev.passers || []).forEach(function (P) { ev.cards.forEach(function (c) { setNo(m, P, c); }); });
    if (ev.disprover) {
      if (observer === ev.by && ev.shown) setHolds(m, order, ev.shown, ev.disprover);
      else m.clauses.push({ pid: ev.disprover, cards: ev.cards.slice() });
    } else {
      (ev.responders || []).forEach(function (P) { ev.cards.forEach(function (c) { setNo(m, P, c); }); });
    }
    propagate(m, order);
  }

  function propagate(m, order) {
    var changed = true, guard = 0;
    while (changed && guard++ < 60) {
      changed = false;
      // 0) une carte de l'enveloppe n'est détenue par PERSONNE (clé des déductions)
      ['suspect', 'arme', 'piece'].forEach(function (cat) {
        var c = m.env[cat]; if (!c) return;
        order.forEach(function (P) { if (!(m.no[P] && m.no[P][c])) { setNo(m, P, c); changed = true; } });
      });
      // 1) résolution des clauses (pid détient ≥1 des cartes)
      for (var i = m.clauses.length - 1; i >= 0; i--) {
        var cl = m.clauses[i];
        if (cl.cards.some(function (c) { return m.holds[c] === cl.pid; })) { m.clauses.splice(i, 1); changed = true; continue; }
        var rem = cl.cards.filter(function (c) { return !(m.holds[c] && m.holds[c] !== cl.pid) && !(m.no[cl.pid] && m.no[cl.pid][c]); });
        if (rem.length === 1) { setHolds(m, order, rem[0], cl.pid); m.clauses.splice(i, 1); changed = true; }
        else if (rem.length === 0) { m.clauses.splice(i, 1); changed = true; }
      }
      // 2) enveloppe : carte que PERSONNE ne peut détenir
      ALLCARDS.forEach(function (c) {
        if (m.holds[c]) return;
        var cat = catOf(c); if (m.env[cat]) return;
        if (order.every(function (P) { return m.no[P] && m.no[P][c]; })) { m.env[cat] = c; changed = true; }
      });
      // 3) catégorie : si 5 cartes sur 6 (ou 8/9) ont un détenteur connu → la dernière est l'enveloppe
      ['suspect', 'arme', 'piece'].forEach(function (cat) {
        if (m.env[cat]) return;
        var unplaced = cardsOfCat(cat).filter(function (c) { return !m.holds[c]; });
        if (unplaced.length === 1) { m.env[cat] = unplaced[0]; changed = true; }
      });
    }
  }
  function solved(m) { return !!(m.env.suspect && m.env.arme && m.env.piece); }

  // ── Déroulé du tour ─────────────────────────────────────────────────────────
  function log(s, msg) { s.log.push(msg); if (s.log.length > 14) s.log = s.log.slice(s.log.length - 14); }
  var NAMEFN = null; function nm(pid) { return NAMEFN ? NAMEFN(pid) : pid; }

  function actor(s) {
    if (s.phase === 'disprove' && s.suggestion) return s.suggestion.responders[s.suggestion.idx];
    return s.turn;
  }
  function alivePlayers(s) { return s.order; } // les éliminés jouent encore (réfutent) mais ne gagnent pas

  function roll(s, rnd) {
    if (s.phase !== 'roll') return;
    s.dice = 1 + Math.floor((rnd ? rnd() : Math.random()) * 6);
    s.reach = reachable(s, s.turn, s.dice);
    s.phase = 'move';
  }
  // Déplacement vers un nœud atteignable (couloir ou pièce).
  function moveTo(s, node) {
    if (s.phase !== 'move') return false;
    if (!s.reach || s.reach[node] == null) return false;
    s.pos[s.turn] = node; s.reach = null;
    if (isRoomNode(node)) { log(s, nm(s.turn) + ' entre : ' + ROOMS[roomIdx(node)]); s.phase = 'action'; }
    else { s.phase = 'action'; }
    return true;
  }
  function useSecret(s) {
    if (s.phase !== 'move' && s.phase !== 'action' && s.phase !== 'roll') return false;
    var n = s.pos[s.turn]; if (!isRoomNode(n)) return false;
    var dest = SECRET[roomIdx(n)]; if (dest == null) return false;
    s.pos[s.turn] = 'R' + dest; s.reach = null;
    log(s, nm(s.turn) + ' emprunte un passage secret → ' + ROOMS[dest]); s.phase = 'action';
    return true;
  }
  function stay(s) { if (s.phase === 'move') { s.reach = null; s.phase = 'action'; } }

  // Suggestion : possible seulement dans une pièce. Déplace suspect+arme « accusés »
  // dans la pièce (réalisme : les pions bougent). Lance la phase de réfutation.
  function suggest(s, suspect, arme) {
    if (s.phase !== 'action') return false;
    var n = s.pos[s.turn]; if (!isRoomNode(n)) return false;
    var room = ROOMS[roomIdx(n)];
    // déplacer le suspect suggéré dans la pièce (si c'est un joueur)
    s.order.forEach(function (p) { if (s.players && s.players[p]) {} });
    movePawnTo(s, suspect, n);
    s.weaponPos = s.weaponPos || {}; s.weaponPos[arme] = roomIdx(n);
    var idx = s.order.indexOf(s.turn);
    var responders = []; for (var k = 1; k < s.order.length; k++) responders.push(s.order[(idx + k) % s.order.length]);
    s.suggestion = { by: s.turn, suspect: suspect, arme: arme, piece: room, responders: responders, idx: 0, shown: null, disprover: null, cards: [suspect, arme, room] };
    log(s, nm(s.turn) + ' suggère : ' + suspect + ' · ' + arme + ' · ' + room);
    s.phase = 'disprove';
    autoResolveDisprove(s);
    return true;
  }
  // Place le pion-suspect (s'il correspond à un joueur incarnant ce suspect) — ici
  // purement cosmétique : on mémorise la position du pion suspect.
  function movePawnTo(s, suspect, node) { s.suspectPos = s.suspectPos || {}; s.suspectPos[suspect] = roomIdx(node); }

  // Avance la phase de réfutation en sautant les joueurs qui n'ont aucune des 3
  // cartes. S'arrête sur le premier qui peut réfuter (il doit choisir une carte
  // — automatique pour un bot, manuel pour un humain).
  function autoResolveDisprove(s) {
    var sg = s.suggestion; sg.passers = sg.passers || [];
    while (sg.idx < sg.responders.length) {
      var pid = sg.responders[sg.idx];
      var has = sg.cards.filter(function (c) { return (s.hands[pid] || []).indexOf(c) >= 0; });
      if (has.length === 0) {
        log(s, nm(pid) + ' ne peut pas réfuter');
        sg.passers.push(pid);
        sg.idx++;
        continue;
      }
      // ce joueur peut réfuter — on s'arrête, c'est à lui d'agir (choisir une carte)
      return;
    }
    finishDisprove(s, null, null); // personne n'a pu réfuter
  }
  // Le réfutant `pid` montre `card` (au suggérant). Si pid est un bot, on choisit.
  function disprove(s, card) {
    var sg = s.suggestion; if (!sg) return false;
    var pid = sg.responders[sg.idx];
    var has = sg.cards.filter(function (c) { return (s.hands[pid] || []).indexOf(c) >= 0; });
    if (!has.length) return false;
    if (has.indexOf(card) < 0) card = has[0];
    finishDisprove(s, pid, card);
    return true;
  }
  function botDisproveChoice(s) {
    var sg = s.suggestion; var pid = sg.responders[sg.idx];
    var has = sg.cards.filter(function (c) { return (s.hands[pid] || []).indexOf(c) >= 0; });
    // montrer de préférence une carte déjà montrée à ce suggérant (minimise l'info) — sinon une au hasard
    return has[0];
  }
  function finishDisprove(s, pid, card) {
    var sg = s.suggestion;
    sg.disprover = pid; sg.shown = card;
    if (pid) log(s, nm(pid) + ' réfute (montre une carte à ' + nm(sg.by) + ')');
    else log(s, 'Personne n’a pu réfuter !');
    recordEvent(s, { by: sg.by, cards: sg.cards.slice(), disprover: pid, shown: card, passers: sg.passers || [], responders: sg.responders.slice() });
    s.phase = 'postsuggest';
  }

  // Accusation : termine la partie (gagne) ou élimine le joueur.
  function accuse(s, suspect, arme, piece) {
    if (s.phase !== 'action' && s.phase !== 'postsuggest' && s.phase !== 'roll') return false;
    var ok = (suspect === s.solution.suspect && arme === s.solution.arme && piece === s.solution.piece);
    if (ok) { s.winner = s.turn; s.phase = 'over'; log(s, '🏆 ' + nm(s.turn) + ' accuse juste : ' + suspect + ' · ' + arme + ' · ' + piece + ' !'); return true; }
    s.eliminated[s.turn] = true;
    log(s, '❌ ' + nm(s.turn) + ' accuse à tort (' + suspect + ' · ' + arme + ' · ' + piece + ') et est éliminé');
    // s'il ne reste qu'un non-éliminé → il gagne
    var rem = s.order.filter(function (p) { return !s.eliminated[p]; });
    if (rem.length === 1) { s.winner = rem[0]; s.phase = 'over'; log(s, '🏆 ' + nm(rem[0]) + ' gagne (dernier en lice)'); return false; }
    endTurn(s);
    return false;
  }

  function endTurn(s) {
    if (s.winner) return;
    s.suggestion = null; s.reach = null;
    s.turnCount++;
    var idx = s.order.indexOf(s.turn);
    for (var k = 1; k <= s.order.length; k++) {
      var cand = s.order[(idx + k) % s.order.length];
      if (!s.eliminated[cand]) { s.turn = cand; s.phase = 'roll'; return; }
    }
    s.phase = 'over';
  }

  // ── Exports ──────────────────────────────────────────────────────────────────
  root.CluedoEngine = {
    SUSPECTS: SUSPECTS, WEAPONS: WEAPONS, ROOMS: ROOMS, ALLCARDS: ALLCARDS, SECRET: SECRET,
    catOf: catOf, cardsOfCat: cardsOfCat,
    isCorr: isCorr, doorLanes: doorLanes, roomCells: roomCells, roomOfCell: roomOfCell,
    isRoomNode: isRoomNode, roomIdx: roomIdx, reachable: reachable, neighbors: neighbors,
    initGame: initGame, roll: roll, moveTo: moveTo, useSecret: useSecret, stay: stay,
    suggest: suggest, disprove: disprove, botDisproveChoice: botDisproveChoice, accuse: accuse,
    endTurn: endTurn, actor: actor, alivePlayers: alivePlayers,
    mem: function (s, pid) { return s.mem[pid]; }, solved: solved, recordEvent: recordEvent,
    setNameFn: function (f) { NAMEFN = f; }, nm: nm, log: log
  };
})(typeof module !== 'undefined' && module.exports ? module.exports : (this.window = this.window || this));
