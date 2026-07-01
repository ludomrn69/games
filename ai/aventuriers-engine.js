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
  var CITIES = [
    { id: 'brest', n: 'Brest', x: 7, y: 30 }, { id: 'rennes', n: 'Rennes', x: 20, y: 33 },
    { id: 'nantes', n: 'Nantes', x: 22, y: 45 }, { id: 'bordeaux', n: 'Bordeaux', x: 27, y: 66 },
    { id: 'toulouse', n: 'Toulouse', x: 40, y: 79 }, { id: 'montpellier', n: 'Montpellier', x: 55, y: 74 },
    { id: 'marseille', n: 'Marseille', x: 66, y: 78 }, { id: 'nice', n: 'Nice', x: 79, y: 72 },
    { id: 'lyon', n: 'Lyon', x: 62, y: 55 }, { id: 'grenoble', n: 'Grenoble', x: 73, y: 58 },
    { id: 'clermont', n: 'Clermont', x: 49, y: 55 }, { id: 'limoges', n: 'Limoges', x: 38, y: 58 },
    { id: 'paris', n: 'Paris', x: 45, y: 30 }, { id: 'orleans', n: 'Orléans', x: 44, y: 40 },
    { id: 'tours', n: 'Tours', x: 34, y: 43 }, { id: 'lille', n: 'Lille', x: 52, y: 11 },
    { id: 'reims', n: 'Reims', x: 58, y: 22 }, { id: 'nancy', n: 'Nancy', x: 72, y: 25 },
    { id: 'strasbourg', n: 'Strasbourg', x: 83, y: 27 }, { id: 'dijon', n: 'Dijon', x: 64, y: 42 }
  ];

  // Couleurs wagon : R O Y G B P K W ; X = grise (n'importe quelle couleur). L = locomotive (joker).
  var COLORS = ['R', 'O', 'Y', 'G', 'B', 'P', 'K', 'W'];
  function R(id, a, b, color, len) { return { id: id, a: a, b: b, color: color, len: len }; }
  var ROUTES = [
    R('r1', 'brest', 'rennes', 'X', 2), R('r2', 'rennes', 'nantes', 'X', 1), R('r3', 'rennes', 'paris', 'K', 3),
    R('r4', 'rennes', 'tours', 'G', 2), R('r5', 'nantes', 'tours', 'X', 2), R('r6', 'nantes', 'bordeaux', 'Y', 4),
    R('r7', 'bordeaux', 'toulouse', 'P', 3), R('r8', 'bordeaux', 'limoges', 'O', 3), R('r9', 'toulouse', 'montpellier', 'B', 3),
    R('r10', 'toulouse', 'limoges', 'W', 4), R('r11', 'montpellier', 'marseille', 'X', 2), R('r12', 'marseille', 'nice', 'R', 2),
    R('r13', 'marseille', 'lyon', 'B', 4), R('r14', 'nice', 'grenoble', 'Y', 4), R('r15', 'lyon', 'grenoble', 'X', 1),
    R('r16', 'lyon', 'clermont', 'G', 3), R('r17', 'lyon', 'dijon', 'O', 2), R('r18', 'grenoble', 'dijon', 'P', 5),
    R('r19', 'clermont', 'limoges', 'X', 2), R('r20', 'clermont', 'orleans', 'B', 4), R('r21', 'limoges', 'tours', 'R', 3),
    R('r22', 'tours', 'orleans', 'X', 1), R('r23', 'orleans', 'paris', 'X', 2), R('r24', 'paris', 'lille', 'R', 2),
    R('r25', 'paris', 'reims', 'G', 2), R('r26', 'lille', 'reims', 'X', 1), R('r27', 'reims', 'nancy', 'K', 2),
    R('r28', 'nancy', 'strasbourg', 'W', 2), R('r29', 'reims', 'dijon', 'Y', 4), R('r30', 'dijon', 'paris', 'B', 4),
    R('r31', 'nancy', 'dijon', 'O', 3), R('r32', 'paris', 'nancy', 'P', 4), R('r33', 'clermont', 'lyon', 'X', 3),
    R('r34', 'montpellier', 'lyon', 'W', 4)
  ];
  // Billets de destination : relier a↔b rapporte pts (ou les perd si non relié en fin de partie).
  var TICKETS = [
    { a: 'brest', b: 'marseille', pts: 20 }, { a: 'brest', b: 'nice', pts: 21 }, { a: 'paris', b: 'nice', pts: 13 },
    { a: 'lille', b: 'toulouse', pts: 15 }, { a: 'nantes', b: 'strasbourg', pts: 17 }, { a: 'bordeaux', b: 'lyon', pts: 8 },
    { a: 'bordeaux', b: 'nice', pts: 16 }, { a: 'rennes', b: 'grenoble', pts: 13 }, { a: 'paris', b: 'marseille', pts: 11 },
    { a: 'strasbourg', b: 'toulouse', pts: 20 }, { a: 'lille', b: 'nice', pts: 18 }, { a: 'nantes', b: 'nancy', pts: 13 },
    { a: 'clermont', b: 'strasbourg', pts: 10 }, { a: 'toulouse', b: 'nancy', pts: 15 }, { a: 'bordeaux', b: 'lille', pts: 12 },
    { a: 'rennes', b: 'dijon', pts: 9 }, { a: 'montpellier', b: 'paris', pts: 10 }, { a: 'brest', b: 'dijon', pts: 12 }
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
