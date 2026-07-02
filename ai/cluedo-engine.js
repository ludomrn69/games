/*
  cluedo-engine.js — Moteur Cluedo PUR (sans DOM). Plateau fidèle à l'édition
  MODERNE Hasbro (manoir contemporain) : grille 20×20 de couloirs + 9 pièces,
  déplacement case par case, suggestions / réfutations, accusation, et IA de
  déduction. Testé par simulation, inclus tel quel dans cluedo.html.
*/
(function (root) {
  'use strict';

  var SUSPECTS = ['Moutarde', 'Rose', 'Violet', 'Leblanc', 'Olive', 'Pervenche'];
  var WEAPONS = ['Poignard', 'Chandelier', 'Revolver', 'Corde', 'Clé', 'Matraque'];
  // 9 pièces de l'édition moderne, placées comme sur le plateau :
  //   Chambre · Salle de bains · Bureau · Cuisine     (rangée du haut)
  //   Salle de jeux · [CLUEDO] · Salle à manger        (milieu)
  //   Garage · Entrée · Salon                          (rangée du bas)
  var ROOMS = ['Chambre', 'Salle de bains', 'Bureau', 'Cuisine', 'Salle de jeux', 'Salle à manger', 'Garage', 'Entrée', 'Salon'];
  // 2 passages secrets entre coins OPPOSÉS, comme sur le plateau :
  //   Chambre (0) ↔ Salon (8)  et  Cuisine (3) ↔ Garage (6).
  var SECRET = { 0: 8, 8: 0, 3: 6, 6: 3 };
  var ALLCARDS = SUSPECTS.concat(WEAPONS).concat(ROOMS);
  var START_ROOM = 7; // tous les joueurs commencent dans l'ENTRÉE, comme dans le vrai jeu

  function catOf(card) { return SUSPECTS.indexOf(card) >= 0 ? 'suspect' : WEAPONS.indexOf(card) >= 0 ? 'arme' : 'piece'; }
  function cardsOfCat(cat) { return cat === 'suspect' ? SUSPECTS : cat === 'arme' ? WEAPONS : ROOMS; }

  // ── Plateau (disposition fidèle à l'édition moderne) ─────────────────────────
  // Grille 20×20. Chaque pièce est un RECTANGLE [r0,r1,c0,c1] (inclus), placé comme
  // sur le vrai plateau ; la dalle CLUEDO centrale est franchissable ; tout le reste
  // est couloir. Les PORTES sont des cases couloir adjacentes par lesquelles on
  // entre/sort.
  var GRID_W = 20, GRID_H = 20;
  var ROOM_RECT = {
    0: [0, 4, 0, 3],    // Chambre        (haut-gauche, passage secret → Salon)
    1: [0, 4, 5, 8],    // Salle de bains (haut, centre-gauche)
    2: [0, 4, 11, 14],  // Bureau         (haut, centre-droite)
    3: [0, 4, 16, 19],  // Cuisine        (haut-droite, passage secret → Garage)
    4: [7, 12, 0, 4],   // Salle de jeux  (milieu-gauche, billard)
    5: [7, 12, 15, 19], // Salle à manger (milieu-droite)
    6: [15, 19, 0, 4],  // Garage         (bas-gauche, passage secret → Cuisine)
    7: [15, 19, 7, 12], // Entrée         (bas-centre : tout le monde part d'ici)
    8: [15, 19, 15, 19] // Salon          (bas-droite, passage secret → Chambre)
  };
  var CELLAR = [8, 11, 8, 11]; // dalle centrale « CLUEDO » (on y ACCUSE) — franchissable
  var DOORS = {
    0: [[5, 2], [2, 4]], 1: [[5, 6], [2, 9]], 2: [[5, 13], [2, 10]], 3: [[5, 17], [2, 15]],
    4: [[6, 2], [9, 5]], 5: [[6, 17], [9, 14]],
    6: [[14, 2], [17, 5]], 7: [[14, 8], [14, 11], [17, 6], [17, 13]], 8: [[14, 17], [17, 14]]
  };
  function inRect(r, c, R) { return r >= R[0] && r <= R[1] && c >= R[2] && c <= R[3]; }
  function roomOfCell(r, c) { for (var k = 0; k < 9; k++) { if (inRect(r, c, ROOM_RECT[k])) return k; } return -1; }
  // Le centre est la PISCINE (« Cluedo ») : case spéciale, FRANCHISSABLE, où l'on
  // doit se rendre pour porter une accusation.
  function isPoolCell(r, c) { return inRect(r, c, CELLAR); }
  function isPoolNode(node) { if (isRoomNode(node)) return false; var p = String(node).split(','); return isPoolCell(+p[0], +p[1]); }
  function isCorr(r, c) { return r >= 0 && r < GRID_H && c >= 0 && c < GRID_W && roomOfCell(r, c) < 0; }
  function poolCells() { var a = []; for (var r = CELLAR[0]; r <= CELLAR[1]; r++) for (var c = CELLAR[2]; c <= CELLAR[3]; c++) a.push([r, c]); return a; }
  function doorLanes(idx) { return DOORS[idx] || []; }
  function roomCells(idx) { var R = ROOM_RECT[idx], a = []; for (var r = R[0]; r <= R[1]; r++) for (var c = R[2]; c <= R[3]; c++) a.push([r, c]); return a; }
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
    // Tous les pions démarrent dans l'ENTRÉE (comme sur le vrai plateau moderne).
    var pos = {}; order.forEach(function (p) { pos[p] = 'R' + START_ROOM; });
    // Les 6 armes sont réparties au hasard dans 6 pièces différentes au départ.
    var weaponPos = {}, roomsIdx = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8], rnd);
    WEAPONS.forEach(function (w, i) { weaponPos[w] = roomsIdx[i]; });
    var s = {
      order: order.slice(), turn: order[0], phase: 'roll',
      pos: pos, hands: hands, solution: sol, weaponPos: weaponPos,
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
  // Firebase RTDB SUPPRIME les tableaux vides et les valeurs null : après un
  // aller-retour en ligne, `clauses`, `env`… peuvent manquer. On les restaure
  // avant toute lecture (sans quoi la première suggestion plante en ligne).
  function normMem(m) {
    m.hand = m.hand || []; m.holds = m.holds || {}; m.no = m.no || {}; m.clauses = m.clauses || [];
    m.env = m.env || {};
    return m;
  }
  function setNo(m, pid, card) { (m.no[pid] = m.no[pid] || {})[card] = true; }
  function setHolds(m, order, card, owner) { if (m.holds[card]) return; m.holds[card] = owner; order.forEach(function (P) { if (P !== owner) setNo(m, P, card); }); }
  function buildMem(s, pid) { var m = emptyMem(pid); m.hand = (s.hands[pid] || []).slice(); m.hand.forEach(function (c) { setHolds(m, s.order, c, pid); }); propagate(m, s.order); return m; }

  // Enregistre un événement public dans la mémoire de TOUS les joueurs.
  // ev = { by, cards:[s,w,r], disprover|null, shown|null, passers:[pids], responders:[pids] }
  function recordEvent(s, ev) { s.order.forEach(function (pid) { updateMem(s.mem[pid], s.order, ev, pid); }); }
  function updateMem(m, order, ev, observer) {
    normMem(m);
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
    normMem(m);
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
  function solved(m) { var e = normMem(m).env; return !!(e.suspect && e.arme && e.piece); }

  // ── Déroulé du tour ─────────────────────────────────────────────────────────
  function log(s, msg) { s.log = s.log || []; s.log.push(msg); if (s.log.length > 14) s.log = s.log.slice(s.log.length - 14); }
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
    if (s.phase !== 'action' && s.phase !== 'postsuggest' && s.phase !== 'roll' && s.phase !== 'move') return false;
    // On ne peut accuser qu'au centre (la piscine « Cluedo »).
    if (!isPoolNode(s.pos[s.turn])) return false;
    var ok = (suspect === s.solution.suspect && arme === s.solution.arme && piece === s.solution.piece);
    if (ok) { s.winner = s.turn; s.phase = 'over'; log(s, '🏆 ' + nm(s.turn) + ' accuse juste : ' + suspect + ' · ' + arme + ' · ' + piece + ' !'); return true; }
    s.eliminated = s.eliminated || {};
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
    s.eliminated = s.eliminated || {};
    s.suggestion = null; s.reach = null;
    s.turnCount++;
    var idx = s.order.indexOf(s.turn);
    for (var k = 1; k <= s.order.length; k++) {
      var cand = s.order[(idx + k) % s.order.length];
      if (!s.eliminated[cand]) { s.turn = cand; s.phase = 'roll'; return; }
    }
    s.phase = 'over';
  }

  // ── IA (déduction + déplacement) ─────────────────────────────────────────────
  // Tout passe par la base de connaissances `mem` (solveur par contraintes ci-dessus) :
  // on va vers une PIÈCE encore non disculpée, on suggère la carte la plus informative,
  // et dès que l'enveloppe est connue on FONCE au centre accuser. Niveau « facile » =
  // suggestions au hasard (déduit plus lentement).
  function man(a, dr, dc) { var p = a.split(','); return Math.abs(+p[0] - dr) + Math.abs(+p[1] - dc); }
  function chooseTargetRoom(m) {
    if (m.env.piece) return ROOMS.indexOf(m.env.piece);
    for (var i = 0; i < 9; i++) if (!m.holds[ROOMS[i]] && m.env.piece !== ROOMS[i]) return i;
    return 0;
  }
  function pickTest(cards, m, lvl) {
    var rem = cards.filter(function (c) { return !m.holds[c]; });
    if (!rem.length) rem = cards.slice();
    if (lvl === 'easy') return rem[Math.floor(Math.random() * rem.length)];
    return rem[0];
  }
  function closestTowardRoom(reach, targetIdx) {
    var doors = doorLanes(targetIdx), best = null, bd = 1e9;
    Object.keys(reach).forEach(function (n) {
      if (isRoomNode(n)) return;
      var d = Math.min.apply(null, doors.map(function (dl) { return man(n, dl[0], dl[1]); }));
      if (d < bd) { bd = d; best = n; }
    });
    return best;
  }
  function closestTowardPool(reach) {
    var pool = poolCells(), best = null, bd = 1e9;
    Object.keys(reach).forEach(function (n) {
      if (isRoomNode(n)) return;
      var d = Math.min.apply(null, pool.map(function (pc) { return man(n, pc[0], pc[1]); }));
      if (d < bd) { bd = d; best = n; }
    });
    return best;
  }
  // Joue UN pas du bot pour le joueur courant. level : 'easy' | 'normal' | 'hard'.
  function botStep(s, level) {
    if (s.phase === 'disprove') { disprove(s, botDisproveChoice(s)); return; }
    var pid = s.turn, m = normMem(s.mem[pid]);
    var solv = solved(m), inPool = isPoolNode(s.pos[pid]);
    if (s.phase === 'roll') {
      if (solv && inPool) { accuse(s, m.env.suspect, m.env.arme, m.env.piece); return; }
      roll(s); return;
    }
    if (s.phase === 'move') {
      if (solv) { // affaire résolue → foncer vers la piscine centrale pour accuser
        var reachP = s.reach || {};
        var poolReach = Object.keys(reachP).filter(function (n) { return isPoolNode(n); });
        if (poolReach.length) { moveTo(s, poolReach[0]); return; }
        var towardPool = closestTowardPool(reachP);
        if (towardPool) { moveTo(s, towardPool); return; }
        stay(s); return;
      }
      var node = s.pos[pid];
      if (isRoomNode(node)) {
        var rn = ROOMS[roomIdx(node)];
        if ((!m.env.piece && !m.holds[rn]) || m.env.piece === rn) { stay(s); return; }
      }
      var reach = s.reach || {}, target = chooseTargetRoom(m);
      if (reach['R' + target] != null) { moveTo(s, 'R' + target); return; }
      var useful = Object.keys(reach).filter(function (n) { return isRoomNode(n) && !m.holds[ROOMS[roomIdx(n)]]; });
      if (useful.length) { moveTo(s, useful[0]); return; }
      var cell = closestTowardRoom(reach, target);
      if (cell) { moveTo(s, cell); return; }
      var corr = Object.keys(reach).filter(function (n) { return !isRoomNode(n); });
      if (corr.length) { moveTo(s, corr[Math.floor(Math.random() * corr.length)]); return; }
      stay(s); return;
    }
    if (s.phase === 'action') {
      if (solv && inPool) { accuse(s, m.env.suspect, m.env.arme, m.env.piece); return; }
      if (isRoomNode(s.pos[pid])) { suggest(s, pickTest(SUSPECTS, m, level), pickTest(WEAPONS, m, level)); return; }
      endTurn(s); return;
    }
    if (s.phase === 'postsuggest') {
      if (solv && inPool) { accuse(s, m.env.suspect, m.env.arme, m.env.piece); return; }
      endTurn(s); return;
    }
  }

  // ── Exports ──────────────────────────────────────────────────────────────────
  root.CluedoEngine = {
    SUSPECTS: SUSPECTS, WEAPONS: WEAPONS, ROOMS: ROOMS, ALLCARDS: ALLCARDS, SECRET: SECRET,
    catOf: catOf, cardsOfCat: cardsOfCat,
    isCorr: isCorr, doorLanes: doorLanes, roomCells: roomCells, roomOfCell: roomOfCell,
    isPoolCell: isPoolCell, isPoolNode: isPoolNode, poolCells: poolCells,
    GRID_W: GRID_W, GRID_H: GRID_H, ROOM_RECT: ROOM_RECT, CELLAR: CELLAR, DOORS: DOORS,
    isRoomNode: isRoomNode, roomIdx: roomIdx, reachable: reachable, neighbors: neighbors,
    initGame: initGame, roll: roll, moveTo: moveTo, useSecret: useSecret, stay: stay,
    suggest: suggest, disprove: disprove, botDisproveChoice: botDisproveChoice, accuse: accuse,
    endTurn: endTurn, actor: actor, alivePlayers: alivePlayers,
    mem: function (s, pid) { return s.mem[pid]; }, solved: solved, recordEvent: recordEvent,
    setNameFn: function (f) { NAMEFN = f; }, nm: nm, log: log, botStep: botStep
  };
})(typeof module !== 'undefined' && module.exports ? module.exports : (this.window = this.window || this));
