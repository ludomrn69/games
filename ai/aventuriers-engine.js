/*
  ai/aventuriers-engine.js — Moteur PUR (isomorphe : aucune référence à window/document)
  des « Aventuriers du Rail » version compacte (carte de France ~20 villes).

  Comme monopoly-engine.js / cluedo-engine.js : toute la logique de règles vit ici
  et est TESTABLE en Node (banc headless). La page games/aventuriers-du-rail.html ne
  fait que le rendu (carte SVG, main, billets) et appelle ce moteur dans ses transactions.

  Exporté en global (window.Aventuriers dans le navigateur) ET en module (bench Node).
*/
(function (root) {
  'use strict';

  // ── Carte (coords en 0..100 pour le SVG) ────────────────────────────────────
  // Carte EUROPE (villes réelles = repères géographiques ; le réseau de routes et
  // les billets ci-dessous sont une création propre à ce jeu, pas une reproduction
  // d'un plateau existant). Coordonnées x (ouest→est) / y (nord→sud) en 0..100.
  var CITIES = [
    { id: 'lisboa', n: 'Lisbonne', x: 6, y: 76 }, { id: 'madrid', n: 'Madrid', x: 15, y: 72 },
    { id: 'barcelona', n: 'Barcelone', x: 25, y: 66 }, { id: 'marseille', n: 'Marseille', x: 33, y: 60 },
    { id: 'paris', n: 'Paris', x: 29, y: 42 }, { id: 'london', n: 'Londres', x: 23, y: 31 },
    { id: 'amsterdam', n: 'Amsterdam', x: 34, y: 33 }, { id: 'bruxelles', n: 'Bruxelles', x: 31, y: 37 },
    { id: 'frankfurt', n: 'Francfort', x: 40, y: 40 }, { id: 'zurich', n: 'Zurich', x: 39, y: 49 },
    { id: 'milano', n: 'Milan', x: 43, y: 55 }, { id: 'roma', n: 'Rome', x: 49, y: 68 },
    { id: 'venezia', n: 'Venise', x: 47, y: 53 }, { id: 'munchen', n: 'Munich', x: 45, y: 47 },
    { id: 'berlin', n: 'Berlin', x: 51, y: 33 }, { id: 'hamburg', n: 'Hambourg', x: 45, y: 27 },
    { id: 'kobenhavn', n: 'Copenhague', x: 49, y: 22 }, { id: 'stockholm', n: 'Stockholm', x: 58, y: 11 },
    { id: 'praha', n: 'Prague', x: 50, y: 42 }, { id: 'wien', n: 'Vienne', x: 55, y: 47 },
    { id: 'budapest', n: 'Budapest', x: 60, y: 50 }, { id: 'zagreb', n: 'Zagreb', x: 54, y: 55 },
    { id: 'warszawa', n: 'Varsovie', x: 61, y: 33 }, { id: 'beograd', n: 'Belgrade', x: 63, y: 58 },
    { id: 'sofia', n: 'Sofia', x: 67, y: 63 }, { id: 'bucuresti', n: 'Bucarest', x: 72, y: 54 },
    { id: 'athina', n: 'Athènes', x: 65, y: 79 }, { id: 'istanbul', n: 'Istanbul', x: 78, y: 67 },
    { id: 'kyiv', n: 'Kiev', x: 77, y: 40 }, { id: 'riga', n: 'Riga', x: 65, y: 21 },
    { id: 'moskva', n: 'Moscou', x: 88, y: 26 }, { id: 'minsk', n: 'Minsk', x: 73, y: 33 }
  ];

  // Couleurs wagon : R O Y G B P K W ; X = grise (n'importe quelle couleur). L = locomotive (joker).
  var COLORS = ['R', 'O', 'Y', 'G', 'B', 'P', 'K', 'W'];
  function R(id, a, b, color, len) { return { id: id, a: a, b: b, color: color, len: len }; }
  var ROUTES = [
    R('r1', 'lisboa', 'madrid', 'P', 3), R('r2', 'amsterdam', 'bruxelles', 'X', 1), R('r3', 'madrid', 'barcelona', 'Y', 2),
    R('r4', 'barcelona', 'marseille', 'G', 3), R('r5', 'marseille', 'paris', 'B', 4), R('r6', 'barcelona', 'paris', 'X', 4),
    R('r7', 'paris', 'london', 'W', 2), R('r8', 'paris', 'bruxelles', 'R', 2), R('r9', 'marseille', 'zurich', 'O', 3),
    R('r10', 'marseille', 'milano', 'K', 4), R('r11', 'amsterdam', 'hamburg', 'Y', 2), R('r12', 'bruxelles', 'frankfurt', 'P', 2),
    R('r13', 'frankfurt', 'zurich', 'W', 2), R('r14', 'zurich', 'milano', 'G', 2), R('r15', 'zurich', 'munchen', 'X', 2),
    R('r16', 'frankfurt', 'munchen', 'R', 2), R('r17', 'frankfurt', 'berlin', 'K', 3), R('r18', 'munchen', 'venezia', 'B', 3),
    R('r19', 'milano', 'venezia', 'X', 1), R('r20', 'venezia', 'zagreb', 'Y', 2), R('r21', 'hamburg', 'berlin', 'O', 2),
    R('r22', 'hamburg', 'kobenhavn', 'R', 2), R('r23', 'kobenhavn', 'stockholm', 'B', 3), R('r24', 'london', 'amsterdam', 'K', 2),
    R('r25', 'berlin', 'warszawa', 'P', 3), R('r26', 'berlin', 'praha', 'G', 2), R('r27', 'praha', 'wien', 'X', 2),
    R('r28', 'praha', 'munchen', 'Y', 2), R('r29', 'wien', 'munchen', 'O', 2), R('r30', 'wien', 'budapest', 'R', 1),
    R('r31', 'wien', 'zagreb', 'P', 2), R('r32', 'budapest', 'zagreb', 'K', 2), R('r33', 'budapest', 'beograd', 'G', 2),
    R('r34', 'zagreb', 'beograd', 'X', 1), R('r35', 'beograd', 'sofia', 'B', 2), R('r36', 'beograd', 'bucuresti', 'Y', 3),
    R('r37', 'sofia', 'bucuresti', 'O', 2), R('r38', 'sofia', 'istanbul', 'P', 3), R('r39', 'sofia', 'athina', 'R', 3),
    R('r40', 'roma', 'milano', 'W', 3), R('r41', 'roma', 'venezia', 'G', 3), R('r42', 'roma', 'athina', 'K', 5),
    R('r43', 'istanbul', 'bucuresti', 'X', 3), R('r44', 'istanbul', 'athina', 'Y', 4), R('r45', 'warszawa', 'minsk', 'X', 2),
    R('r46', 'minsk', 'kyiv', 'G', 2), R('r47', 'minsk', 'riga', 'O', 2), R('r48', 'riga', 'stockholm', 'B', 4),
    R('r49', 'warszawa', 'riga', 'P', 3), R('r50', 'kyiv', 'bucuresti', 'R', 3), R('r51', 'kyiv', 'moskva', 'W', 3),
    R('r52', 'minsk', 'moskva', 'Y', 4), R('r53', 'riga', 'moskva', 'K', 4), R('r54', 'warszawa', 'praha', 'X', 3),
    R('r55', 'roma', 'zagreb', 'B', 4), R('r56', 'barcelona', 'madrid', 'W', 2)
  ];
  // Billets de destination : relier a↔b rapporte pts (ou les perd si non relié en fin de partie).
  var TICKETS = [
    { a: 'lisboa', b: 'moskva', pts: 25 }, { a: 'lisboa', b: 'wien', pts: 20 }, { a: 'madrid', b: 'berlin', pts: 18 },
    { a: 'london', b: 'istanbul', pts: 21 }, { a: 'paris', b: 'warszawa', pts: 15 }, { a: 'paris', b: 'athina', pts: 21 },
    { a: 'barcelona', b: 'kyiv', pts: 20 }, { a: 'amsterdam', b: 'roma', pts: 13 }, { a: 'stockholm', b: 'roma', pts: 21 },
    { a: 'stockholm', b: 'athina', pts: 25 }, { a: 'berlin', b: 'bucuresti', pts: 12 }, { a: 'frankfurt', b: 'riga', pts: 13 },
    { a: 'munchen', b: 'sofia', pts: 12 }, { a: 'zurich', b: 'budapest', pts: 10 }, { a: 'roma', b: 'istanbul', pts: 15 },
    { a: 'paris', b: 'moskva', pts: 22 }, { a: 'london', b: 'roma', pts: 17 }, { a: 'kobenhavn', b: 'beograd', pts: 14 },
    { a: 'warszawa', b: 'athina', pts: 18 }, { a: 'milano', b: 'kyiv', pts: 16 }, { a: 'madrid', b: 'marseille', pts: 8 }
  ];
  var SCORE_BY_LEN = { 1: 1, 2: 2, 3: 4, 4: 7, 5: 10, 6: 15 };
  var START_TRAINS = 30, START_TICKETS = 2, HAND_START = 4, MARKET_SIZE = 5;

  // ── RNG déterministe (mulberry32) pour tests reproductibles ─────────────────
  function rng(seed) { var s = (seed >>> 0) || 1; return function () { s |= 0; s = s + 0x6D2B79F5 | 0; var t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function shuffle(a, rnd) { rnd = rnd || Math.random; for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  function fullDeck() {
    var d = [];
    COLORS.forEach(function (c) { for (var i = 0; i < 12; i++) d.push(c); });
    for (var l = 0; l < 14; l++) d.push('L');
    return d;
  }
  function emptyHand() { var h = {}; COLORS.forEach(function (c) { h[c] = 0; }); h.L = 0; return h; }
  function handCount(h) { var n = 0; for (var k in h) n += h[k] || 0; return n; }

  // ── Mise en place ───────────────────────────────────────────────────────────
  function setup(order, seed) {
    var rnd = rng(seed || 1);
    var deck = shuffle(fullDeck(), rnd);
    var players = {};
    order.forEach(function (p) {
      var hand = emptyHand();
      for (var i = 0; i < HAND_START; i++) hand[deck.pop()]++;
      players[p] = { hand: hand, trains: START_TRAINS, routes: [], tickets: [], drawn: 0, scoreRoutes: 0 };
    });
    var ticketDeck = TICKETS.map(function (_, i) { return i; }); shuffle(ticketDeck, rnd);
    order.forEach(function (p) { for (var i = 0; i < START_TICKETS; i++) players[p].tickets.push(ticketDeck.pop()); });
    var market = []; for (var m = 0; m < MARKET_SIZE; m++) market.push(deck.pop());
    return {
      deck: deck, discard: [], market: market, ticketDeck: ticketDeck,
      claimed: {}, players: players, turn: order[0], phase: 'play',
      lastRound: false, endBy: null, pendingTickets: null, banner: '', sinceClaim: 0
    };
  }

  // ── Requêtes ────────────────────────────────────────────────────────────────
  function routeById(id) { for (var i = 0; i < ROUTES.length; i++) if (ROUTES[i].id === id) return ROUTES[i]; return null; }
  function isClaimed(state, id) { return !!state.claimed[id]; }
  function activeOrder(state) { return state.order || Object.keys(state.players); }

  // Options de paiement d'une route pour un joueur : liste de {color, wild} valides.
  // Une route de longueur L se paie avec L cartes d'UNE même couleur (ou grise = n'importe
  // quelle couleur) + les locomotives L en joker.
  function paymentOptions(state, pid, id) {
    var route = routeById(id); if (!route || isClaimed(state, id)) return [];
    var P = state.players[pid]; if (!P || P.trains < route.len) return [];
    var hand = P.hand, loco = hand.L || 0, opts = [];
    var cols = route.color === 'X' ? COLORS : [route.color];
    cols.forEach(function (c) {
      var have = hand[c] || 0;
      for (var useLoco = 0; useLoco <= loco; useLoco++) {
        var useCol = route.len - useLoco;
        if (useCol >= 0 && useCol <= have) { opts.push({ color: c, colorCards: useCol, loco: useLoco }); break; } // le moins de locos possible
      }
    });
    return opts;
  }
  function canClaim(state, pid, id) { return paymentOptions(state, pid, id).length > 0; }

  // ── Actions (mutent state) ──────────────────────────────────────────────────
  function refillMarket(state) {
    while (state.market.length < MARKET_SIZE) {
      if (!state.deck.length) { if (!state.discard.length) break; state.deck = shuffle(state.discard, Math.random); state.discard = []; }
      state.market.push(state.deck.pop());
    }
  }
  function drawFromDeck(state, pid) {
    if (!state.deck.length) { if (!state.discard.length) return null; state.deck = state.discard; state.discard = []; shuffle(state.deck, Math.random); }
    var c = state.deck.pop(); if (c == null) return null;
    state.players[pid].hand[c]++;
    return c;
  }
  // Pioche d'une carte visible (index) ou de la pioche aveugle (index<0). Renvoie true si le tour se termine.
  function drawCard(state, pid, marketIndex) {
    var P = state.players[pid];
    if (marketIndex != null && marketIndex >= 0) {
      var c = state.market[marketIndex]; if (c == null) return false;
      P.hand[c]++;
      state.market.splice(marketIndex, 1); refillMarket(state);
      if (c === 'L') { P.drawn = 2; endTurn(state); return true; } // loco visible = tout le tour
    } else {
      if (drawFromDeck(state, pid) == null && P.drawn === 0) { endTurn(state); return true; }
    }
    P.drawn++;
    if (P.drawn >= 2) { endTurn(state); return true; }
    return false;
  }
  function claim(state, pid, id, payment) {
    var route = routeById(id), P = state.players[pid];
    if (!route || isClaimed(state, id) || !P) return false;
    var opts = paymentOptions(state, pid, id);
    var opt = payment ? opts.filter(function (o) { return o.color === payment.color; })[0] : opts[0];
    if (!opt) return false;
    P.hand[opt.color] -= opt.colorCards; P.hand.L -= opt.loco;
    for (var i = 0; i < opt.colorCards; i++) state.discard.push(opt.color);
    for (var j = 0; j < opt.loco; j++) state.discard.push('L');
    P.trains -= route.len;
    P.routes.push(id);
    P.scoreRoutes += (SCORE_BY_LEN[route.len] || 0);
    state.claimed[id] = pid;
    state.sinceClaim = -1; // remis à 0 par endTurn (progression : une route a été prise)
    endTurn(state);
    return true;
  }
  function drawTickets(state, pid) {
    var n = Math.min(3, state.ticketDeck.length);
    if (!n) { endTurn(state); return []; }
    var drawn = []; for (var i = 0; i < n; i++) drawn.push(state.ticketDeck.pop());
    state.pendingTickets = { pid: pid, offered: drawn };
    state.phase = 'chooseTickets';
    return drawn;
  }
  // Garde un sous-ensemble (≥1) des billets proposés ; remet les autres sous la pioche.
  function keepTickets(state, pid, keepIdx) {
    if (!state.pendingTickets || state.pendingTickets.pid !== pid) return false;
    var offered = state.pendingTickets.offered;
    var keep = (keepIdx && keepIdx.length) ? keepIdx : [offered[0]];
    keep = keep.filter(function (t) { return offered.indexOf(t) >= 0; });
    if (!keep.length) keep = [offered[0]];
    keep.forEach(function (t) { state.players[pid].tickets.push(t); });
    offered.forEach(function (t) { if (keep.indexOf(t) < 0) state.ticketDeck.unshift(t); });
    state.pendingTickets = null; state.phase = 'play';
    endTurn(state);
    return true;
  }

  // ── Fin de tour / de partie ─────────────────────────────────────────────────
  function nextPid(state, from) { var o = activeOrder(state); var i = o.indexOf(from); return o[(i + 1) % o.length]; }
  function endTurn(state) {
    var pid = state.turn, P = state.players[pid];
    P.drawn = 0;
    state.sinceClaim = (state.sinceClaim || 0) + 1; // tours écoulés depuis la dernière route prise
    // Déclenche le dernier tour quand un joueur descend à ≤ 2 wagons, si la carte est
    // saturée, ou (garde-fou anti-blocage) si personne ne construit depuis plusieurs tours
    // (cartes bloquées en mains + pioche épuisée).
    var mapFull = ROUTES.every(function (r) { return isClaimed(state, r.id); });
    var stalled = state.sinceClaim >= activeOrder(state).length * 4;
    if (!state.lastRound && (P.trains <= 2 || mapFull || stalled)) { state.lastRound = true; state.endBy = pid; }
    var nxt = nextPid(state, pid);
    if (state.lastRound && nxt === state.endBy) { state.phase = 'ended'; finalize(state); return; }
    state.turn = nxt; state.phase = 'play';
  }

  // ── Connexité (billets) & plus long chemin ──────────────────────────────────
  function edgesOf(state, pid) { return (state.players[pid].routes || []).map(function (id) { var r = routeById(id); return { a: r.a, b: r.b, len: r.len, id: id }; }); }
  function connected(edges, a, b) {
    if (a === b) return true;
    var adj = {}; edges.forEach(function (e) { (adj[e.a] = adj[e.a] || []).push(e.b); (adj[e.b] = adj[e.b] || []).push(e.a); });
    var seen = {}, stack = [a]; seen[a] = 1;
    while (stack.length) { var c = stack.pop(); if (c === b) return true; (adj[c] || []).forEach(function (nb) { if (!seen[nb]) { seen[nb] = 1; stack.push(nb); } }); }
    return false;
  }
  // Plus long chemin continu (somme des longueurs de wagons), chaque route utilisée une fois.
  function longestPath(edges) {
    if (!edges.length) return 0;
    var adj = {};
    edges.forEach(function (e, i) { (adj[e.a] = adj[e.a] || []).push({ to: e.b, len: e.len, i: i }); (adj[e.b] = adj[e.b] || []).push({ to: e.a, len: e.len, i: i }); });
    var best = 0, used = {};
    function dfs(node, acc) {
      if (acc > best) best = acc;
      (adj[node] || []).forEach(function (e) { if (used[e.i]) return; used[e.i] = 1; dfs(e.to, acc + e.len); used[e.i] = 0; });
    }
    var nodes = {}; edges.forEach(function (e) { nodes[e.a] = 1; nodes[e.b] = 1; });
    Object.keys(nodes).forEach(function (n) { dfs(n, 0); });
    return best;
  }

  function finalize(state) {
    var order = activeOrder(state), longest = 0, longBy = [];
    var totals = {};
    order.forEach(function (pid) {
      var P = state.players[pid], edges = edgesOf(state, pid);
      var pts = P.scoreRoutes;
      var tick = P.tickets.map(function (ti) { var t = TICKETS[ti]; var ok = connected(edges, t.a, t.b); return { t: t, ok: ok, pts: ok ? t.pts : -t.pts }; });
      tick.forEach(function (r) { pts += r.pts; });
      var lp = longestPath(edges);
      if (lp > longest) { longest = lp; longBy = [pid]; } else if (lp === longest && lp > 0) longBy.push(pid);
      totals[pid] = { routes: P.scoreRoutes, tickets: tick, longest: lp, base: pts };
    });
    longBy.forEach(function (pid) { totals[pid].base += 10; totals[pid].longestBonus = true; });
    order.forEach(function (pid) { totals[pid].total = totals[pid].base; });
    state.finalScores = totals; state.longestPathLen = longest;
    // vainqueur : score max (départage : plus de billets réussis)
    var win = order[0];
    order.forEach(function (pid) {
      if (totals[pid].total > totals[win].total) win = pid;
      else if (totals[pid].total === totals[win].total) {
        var tp = totals[pid].tickets.filter(function (x) { return x.ok; }).length, tw = totals[win].tickets.filter(function (x) { return x.ok; }).length;
        if (tp > tw) win = pid;
      }
    });
    state.winner = win; state.status = 'ended';
    return totals;
  }

  // ── IA ──────────────────────────────────────────────────────────────────────
  // Routes utilisables par pid : libres OU déjà à lui (pour chaîner un billet).
  function availableFor(state, pid) { return ROUTES.filter(function (r) { return !state.claimed[r.id] || state.claimed[r.id] === pid; }); }
  // Dijkstra (par longueur de wagons) : plus court chemin a→b réalisable ; renvoie les
  // routes LIBRES qu'il faudrait encore réclamer sur ce chemin.
  function shortestPathRoutes(state, pid, a, b) {
    var avail = availableFor(state, pid), adj = {};
    avail.forEach(function (r) { (adj[r.a] = adj[r.a] || []).push({ to: r.b, r: r }); (adj[r.b] = adj[r.b] || []).push({ to: r.a, r: r }); });
    var dist = {}, prev = {}; dist[a] = 0; var pq = [[0, a]];
    while (pq.length) {
      pq.sort(function (x, y) { return x[0] - y[0]; }); var top = pq.shift(), d = top[0], node = top[1];
      if (d > (dist[node] == null ? Infinity : dist[node])) continue;
      (adj[node] || []).forEach(function (e) { var nd = d + e.r.len; if (dist[e.to] == null || nd < dist[e.to]) { dist[e.to] = nd; prev[e.to] = { node: node, r: e.r }; pq.push([nd, e.to]); } });
    }
    if (dist[b] == null) return { reachable: false, routeIds: [] };
    var ids = [], cur = b, guard = 0; while (cur !== a && prev[cur] && guard++ < 100) { var r = prev[cur].r; if (state.claimed[r.id] !== pid) ids.push(r.id); cur = prev[cur].node; }
    return { reachable: true, routeIds: ids };
  }
  // Priorité par route libre (somme des points des billets ouverts qui en ont besoin).
  function neededRoutes(state, pid) {
    var P = state.players[pid], edges = edgesOf(state, pid), need = {};
    P.tickets.map(function (ti) { return TICKETS[ti]; }).forEach(function (t) {
      if (connected(edges, t.a, t.b)) return;
      var sp = shortestPathRoutes(state, pid, t.a, t.b);
      if (sp.reachable) sp.routeIds.forEach(function (id) { need[id] = (need[id] || 0) + t.pts; });
    });
    return need;
  }
  // Heuristique : réclame en priorité les routes du plus court chemin vers un billet ouvert ;
  // sinon pioche les cartes de la couleur de la prochaine route visée. Renvoie un descripteur.
  function botAction(state, pid, level) {
    level = level || 'normal';
    var P = state.players[pid];
    var need = neededRoutes(state, pid);
    function usefulness(route) { return (need[route.id] ? need[route.id] + 5 : 0) + (SCORE_BY_LEN[route.len] || 0) * 0.25; }

    var claimable = ROUTES.filter(function (r) { return !isClaimed(state, r.id) && canClaim(state, pid, r.id); });
    if (claimable.length) {
      claimable.sort(function (a, b) { return usefulness(b) - usefulness(a); });
      var pickRoute = claimable[0];
      var blunder = level === 'easy' && Math.random() < 0.45;
      var useful = need[pickRoute.id] > 0;
      // Réclame si la route sert un billet, si peu de wagons, sinon parfois (occuper le terrain).
      if (!blunder && (useful || P.trains <= 8 || Math.random() < 0.3)) {
        return { type: 'claim', id: pickRoute.id, payment: paymentOptions(state, pid, pickRoute.id)[0] };
      }
    }
    // Prendre de nouveaux billets si le réseau est déjà bien avancé et qu'il reste des wagons.
    if (state.ticketDeck.length && P.trains > 14 && Object.keys(need).length === 0 && P.tickets.length < 4 && Math.random() < 0.5) {
      return { type: 'tickets' };
    }
    // Sinon : viser la couleur de la route « la plus voulue » encore non abordable.
    var target = null, bestU = -1;
    ROUTES.forEach(function (r) { if (isClaimed(state, r.id) || P.trains < r.len || canClaim(state, pid, r.id)) return; var u = usefulness(r); if (u > bestU) { bestU = u; target = r; } });
    if (!target) { ROUTES.forEach(function (r) { if (isClaimed(state, r.id) || P.trains < r.len) return; var u = usefulness(r); if (u > bestU) { bestU = u; target = r; } }); }
    var wantColor = target && target.color !== 'X' ? target.color : null;
    var mi = -1;
    for (var i = 0; i < state.market.length; i++) { var c = state.market[i]; if (c === 'L' || (wantColor && c === wantColor)) { mi = i; break; } }
    return { type: 'draw', marketIndex: mi };
  }

  // Applique un descripteur d'action du bot (utilisé par le banc headless).
  function applyBot(state, pid) {
    if (state.phase === 'chooseTickets' && state.pendingTickets && state.pendingTickets.pid === pid) {
      // Garde les billets réalisables (déjà reliés, ou à ≤ 3 routes du réseau) ; au moins 1.
      var offered = state.pendingTickets.offered, edges = edgesOf(state, pid), keep = [];
      offered.forEach(function (ti) {
        var t = TICKETS[ti];
        if (connected(edges, t.a, t.b)) { keep.push(ti); return; }
        var sp = shortestPathRoutes(state, pid, t.a, t.b);
        if (sp.reachable && sp.routeIds.length <= 3) keep.push(ti);
      });
      if (!keep.length) { var cheap = offered[0]; offered.forEach(function (ti) { if (TICKETS[ti].pts < TICKETS[cheap].pts) cheap = ti; }); keep = [cheap]; }
      return keepTickets(state, pid, keep);
    }
    var act = botAction(state, pid);
    if (act.type === 'claim') return claim(state, pid, act.id, act.payment);
    if (act.type === 'tickets') { drawTickets(state, pid); return true; }
    // draw : deux cartes (sauf loco visible qui termine le tour)
    var ended = drawCard(state, pid, act.marketIndex);
    if (!ended) drawCard(state, pid, -1);
    return true;
  }

  root.Aventuriers = {
    CITIES: CITIES, ROUTES: ROUTES, TICKETS: TICKETS, COLORS: COLORS, SCORE_BY_LEN: SCORE_BY_LEN,
    START_TRAINS: START_TRAINS, MARKET_SIZE: MARKET_SIZE,
    rng: rng, shuffle: shuffle, emptyHand: emptyHand, handCount: handCount,
    setup: setup, routeById: routeById, isClaimed: isClaimed, paymentOptions: paymentOptions, canClaim: canClaim,
    drawCard: drawCard, claim: claim, drawTickets: drawTickets, keepTickets: keepTickets, refillMarket: refillMarket,
    endTurn: endTurn, connected: connected, longestPath: longestPath, edgesOf: edgesOf, finalize: finalize,
    availableFor: availableFor, shortestPathRoutes: shortestPathRoutes, neededRoutes: neededRoutes,
    botAction: botAction, applyBot: applyBot, nextPid: nextPid
  };
})(typeof module !== 'undefined' && module.exports ? module.exports : (typeof window !== 'undefined' ? window : this));
