/*
  monopoly-engine.js — Moteur Monopoly PUR (sans DOM). Testé par simulation, puis
  copié tel quel dans monopoly.html. Tout opère sur un objet d'état `s` (le salon).
*/
(function (root) {
  'use strict';

  // ── Plateau français (40 cases) ──────────────────────────────────────────
  // type: go|prop|rail|util|tax|chance|chest|jail|gotojail|parking
  // prop: group, price, house (coût/maison), rent=[base,1,2,3,4,hotel]
  var B = [
    { n: 'Départ', t: 'go' },
    { n: 'Bd de Belleville', t: 'prop', g: 'brown', p: 60, h: 50, r: [2, 10, 30, 90, 160, 250] },
    { n: 'Caisse de Communauté', t: 'chest' },
    { n: 'Rue Lecourbe', t: 'prop', g: 'brown', p: 60, h: 50, r: [4, 20, 60, 180, 320, 450] },
    { n: 'Impôt sur le revenu', t: 'tax', amt: 200 },
    { n: 'Gare Montparnasse', t: 'rail', p: 200 },
    { n: 'Rue de Vaugirard', t: 'prop', g: 'lblue', p: 100, h: 50, r: [6, 30, 90, 270, 400, 550] },
    { n: 'Chance', t: 'chance' },
    { n: 'Rue de Courcelles', t: 'prop', g: 'lblue', p: 100, h: 50, r: [6, 30, 90, 270, 400, 550] },
    { n: 'Av. de la République', t: 'prop', g: 'lblue', p: 120, h: 50, r: [8, 40, 100, 300, 450, 600] },
    { n: 'Prison (visite)', t: 'jail' },
    { n: 'Bd de la Villette', t: 'prop', g: 'pink', p: 140, h: 100, r: [10, 50, 150, 450, 625, 750] },
    { n: 'Électricité', t: 'util', p: 150 },
    { n: 'Av. de Neuilly', t: 'prop', g: 'pink', p: 140, h: 100, r: [10, 50, 150, 450, 625, 750] },
    { n: 'Rue de Paradis', t: 'prop', g: 'pink', p: 160, h: 100, r: [12, 60, 180, 500, 700, 900] },
    { n: 'Gare de Lyon', t: 'rail', p: 200 },
    { n: 'Av. Mozart', t: 'prop', g: 'orange', p: 180, h: 100, r: [14, 70, 200, 550, 750, 950] },
    { n: 'Caisse de Communauté', t: 'chest' },
    { n: 'Bd Saint-Michel', t: 'prop', g: 'orange', p: 180, h: 100, r: [14, 70, 200, 550, 750, 950] },
    { n: 'Place Pigalle', t: 'prop', g: 'orange', p: 200, h: 100, r: [16, 80, 220, 600, 800, 1000] },
    { n: 'Parc Gratuit', t: 'parking' },
    { n: 'Av. Matignon', t: 'prop', g: 'red', p: 220, h: 150, r: [18, 90, 250, 700, 875, 1050] },
    { n: 'Chance', t: 'chance' },
    { n: 'Bd Malesherbes', t: 'prop', g: 'red', p: 220, h: 150, r: [18, 90, 250, 700, 875, 1050] },
    { n: 'Av. Henri-Martin', t: 'prop', g: 'red', p: 240, h: 150, r: [20, 100, 300, 750, 925, 1100] },
    { n: 'Gare du Nord', t: 'rail', p: 200 },
    { n: 'Fbg Saint-Honoré', t: 'prop', g: 'yellow', p: 260, h: 150, r: [22, 110, 330, 800, 975, 1150] },
    { n: 'Place de la Bourse', t: 'prop', g: 'yellow', p: 260, h: 150, r: [22, 110, 330, 800, 975, 1150] },
    { n: 'Cie des Eaux', t: 'util', p: 150 },
    { n: 'Rue La Fayette', t: 'prop', g: 'yellow', p: 280, h: 150, r: [24, 120, 360, 850, 1025, 1200] },
    { n: 'Allez en prison', t: 'gotojail' },
    { n: 'Av. de Breteuil', t: 'prop', g: 'green', p: 300, h: 200, r: [26, 130, 390, 900, 1100, 1275] },
    { n: 'Av. Foch', t: 'prop', g: 'green', p: 300, h: 200, r: [26, 130, 390, 900, 1100, 1275] },
    { n: 'Caisse de Communauté', t: 'chest' },
    { n: 'Bd des Capucines', t: 'prop', g: 'green', p: 320, h: 200, r: [28, 150, 450, 1000, 1200, 1400] },
    { n: 'Gare Saint-Lazare', t: 'rail', p: 200 },
    { n: 'Chance', t: 'chance' },
    { n: 'Champs-Élysées', t: 'prop', g: 'dblue', p: 350, h: 200, r: [35, 175, 500, 1100, 1300, 1500] },
    { n: 'Taxe de luxe', t: 'tax', amt: 100 },
    { n: 'Rue de la Paix', t: 'prop', g: 'dblue', p: 400, h: 200, r: [50, 200, 600, 1400, 1700, 2000] }
  ];
  var GROUPS = {}; // group -> [indices]
  B.forEach(function (sp, i) { if (sp.t === 'prop') { (GROUPS[sp.g] = GROUPS[sp.g] || []).push(i); } });
  var RAILS = [5, 15, 25, 35], UTILS = [12, 28];
  var JAIL_POS = 10, GO_TO_JAIL = 30, JAIL_FINE = 50, GO_SALARY = 200, START_CASH = 1500;

  // ── Cartes Chance / Caisse ────────────────────────────────────────────────
  // a: action — go(pos,collectGo), move(delta), cash(amt), pay(amt), each(amt) (à chaque joueur),
  //    collectEach(amt), jail, getout, repairs(perHouse,perHotel), goNearestRail, goNearestUtil
  var CHANCE = [
    { x: 'Avancez jusqu’au Départ', a: 'go', pos: 0 },
    { x: 'Allez Rue de la Paix', a: 'go', pos: 39 },
    { x: 'Allez Av. Henri-Martin. Si vous passez par le Départ, touchez 200', a: 'go', pos: 24 },
    { x: 'Avancez à la Gare la plus proche', a: 'nearRail' },
    { x: 'Avancez à la Gare la plus proche', a: 'nearRail' },
    { x: 'Avancez au service public le plus proche', a: 'nearUtil' },
    { x: 'La banque vous verse un dividende de 50', a: 'cash', amt: 50 },
    { x: 'Sortez de prison gratuitement', a: 'getout' },
    { x: 'Reculez de 3 cases', a: 'move', delta: -3 },
    { x: 'Allez en prison directement', a: 'jail' },
    { x: 'Faites des réparations : 25/maison, 100/hôtel', a: 'repairs', ph: 25, pht: 100 },
    { x: 'Amende pour excès de vitesse : payez 15', a: 'pay', amt: 15 },
    { x: 'Allez à la Gare Montparnasse', a: 'go', pos: 5 },
    { x: 'Vous êtes élu·e : payez 50 à chaque joueur', a: 'each', amt: 50 },
    { x: 'Votre immeuble rapporte : touchez 150', a: 'cash', amt: 150 },
    { x: 'Recevez des intérêts : touchez 25', a: 'cash', amt: 25 }
  ];
  var CHEST = [
    { x: 'Avancez jusqu’au Départ', a: 'go', pos: 0 },
    { x: 'Erreur de la banque en votre faveur : touchez 200', a: 'cash', amt: 200 },
    { x: 'Frais médicaux : payez 50', a: 'pay', amt: 50 },
    { x: 'Vente de stock : touchez 50', a: 'cash', amt: 50 },
    { x: 'Sortez de prison gratuitement', a: 'getout' },
    { x: 'Allez en prison directement', a: 'jail' },
    { x: 'C’est votre anniversaire : recevez 10 de chaque joueur', a: 'collectEach', amt: 10 },
    { x: 'Remboursement d’impôts : touchez 20', a: 'cash', amt: 20 },
    { x: 'La vie est belle : touchez 100', a: 'cash', amt: 100 },
    { x: 'Honoraires de médecin : payez 50', a: 'pay', amt: 50 },
    { x: 'Note d’hôpital : payez 100', a: 'pay', amt: 100 },
    { x: 'Frais de scolarité : payez 50', a: 'pay', amt: 50 },
    { x: 'Prix de beauté : touchez 10', a: 'cash', amt: 10 },
    { x: 'Héritage : touchez 100', a: 'cash', amt: 100 },
    { x: 'Réparations de voirie : 40/maison, 115/hôtel', a: 'repairs', ph: 40, pht: 115 },
    { x: 'Assurance-vie : touchez 100', a: 'cash', amt: 100 }
  ];

  function shuffle(n, rnd) { var a = []; for (var i = 0; i < n; i++) a.push(i); for (var j = n - 1; j > 0; j--) { var k = Math.floor((rnd ? rnd() : Math.random()) * (j + 1)); var t = a[j]; a[j] = a[k]; a[k] = t; } return a; }

  // ── Initialisation ────────────────────────────────────────────────────────
  function initGame(order, rnd) {
    var s = {
      order: order.slice(), turn: order[0], phase: 'roll',
      cash: {}, pos: {}, jail: {}, getout: {},
      owners: {}, houses: {}, mortg: {}, bankrupt: {},
      dice: [0, 0], doubles: 0, pending: null, auction: null, trade: null,
      chanceDeck: shuffle(CHANCE.length, rnd), chancePtr: 0,
      chestDeck: shuffle(CHEST.length, rnd), chestPtr: 0,
      log: [], winner: null, turnCount: 0, round: 1
    };
    order.forEach(function (p) { s.cash[p] = START_CASH; s.pos[p] = 0; s.jail[p] = 0; s.getout[p] = 0; });
    return s;
  }

  // Firebase supprime les objets vides à l'écriture → on recrée les maps manquantes
  // avant toute lecture/écriture (sinon s.owners[x] planterait).
  function norm(s) {
    ['cash', 'pos', 'jail', 'getout', 'owners', 'houses', 'mortg', 'bankrupt'].forEach(function (k) { if (!s[k]) s[k] = {}; });
    if (!s.log) s.log = [];
    if (!s.dice) s.dice = [0, 0];
    return s;
  }
  function log(s, msg) { s.log = s.log || []; s.log.push(msg); if (s.log.length > 12) s.log = s.log.slice(s.log.length - 12); }
  function alive(s) { return s.order.filter(function (p) { return !(s.bankrupt || {})[p]; }); }
  function actor(s) { return (s.phase === 'auction' && s.auction) ? s.auction.turn : s.turn; }

  // ── Valeur / possessions ──────────────────────────────────────────────────
  function ownedInGroup(s, g, pid) { return GROUPS[g].filter(function (i) { return s.owners[i] === pid; }).length; }
  // g peut être indéfini (gares/services n'ont pas de couleur) : dans ce cas, pas de
  // « monopole de couleur ». On garde-fou pour ne pas planter sur GROUPS[undefined].
  function hasMonopoly(s, g, pid) { return !!(g && GROUPS[g]) && GROUPS[g].every(function (i) { return s.owners[i] === pid; }); }
  function countRails(s, pid) { return RAILS.filter(function (i) { return s.owners[i] === pid; }).length; }
  function countUtils(s, pid) { return UTILS.filter(function (i) { return s.owners[i] === pid; }).length; }
  function groupHouses(s, g) { return (GROUPS[g] || []).reduce(function (a, i) { return a + (s.houses[i] || 0); }, 0); }

  function rentOf(s, prop, diceSum) {
    var sp = B[prop], owner = s.owners[prop];
    if (owner == null || s.mortg[prop]) return 0;
    if (sp.t === 'rail') { var c = countRails(s, owner); return [0, 25, 50, 100, 200][c]; }
    if (sp.t === 'util') { var u = countUtils(s, owner); return (u === 2 ? 10 : 4) * diceSum; }
    var h = s.houses[prop] || 0;
    if (h === 0) { var base = sp.r[0]; if (hasMonopoly(s, sp.g, owner)) base *= 2; return base; }
    return sp.r[h];
  }

  function netWorth(s, pid) { norm(s);
    var w = s.cash[pid] || 0;
    B.forEach(function (sp, i) {
      if (s.owners[i] !== pid) return;
      if (s.mortg[i]) w += Math.floor(sp.p / 2);
      else { w += sp.p; w += (s.houses[i] || 0) * (sp.h || 0); } // maisons à valeur d'achat (approx pour IA)
    });
    return w;
  }

  // ── Paiement avec liquidation forcée puis faillite ─────────────────────────
  function rawAssetsValue(s, pid) { norm(s); // ce qu'on peut lever en liquidant tout
    var v = s.cash[pid] || 0;
    B.forEach(function (sp, i) {
      if (s.owners[i] !== pid) return;
      v += (s.houses[i] || 0) * Math.floor((sp.h || 0) / 2);
      if (!s.mortg[i]) v += Math.floor(sp.p / 2);
    });
    return v;
  }
  function liquidateToward(s, pid, need) {
    // Vend les maisons (uniformément) puis hypothèque, jusqu'à atteindre `need` de cash.
    var guard = 0;
    while ((s.cash[pid] || 0) < need && guard++ < 500) {
      // vendre une maison du groupe le plus bâti
      var bestProp = -1, bestH = 0;
      B.forEach(function (sp, i) { if (s.owners[i] === pid && (s.houses[i] || 0) > bestH) { bestH = s.houses[i]; bestProp = i; } });
      if (bestProp >= 0) {
        // respecter la construction uniforme : ne vendre que si c'est un max du groupe
        var g = B[bestProp].g, mx = Math.max.apply(null, GROUPS[g].map(function (i) { return s.houses[i] || 0; }));
        var sellProp = GROUPS[g].filter(function (i) { return (s.houses[i] || 0) === mx; })[0];
        s.houses[sellProp]--; s.cash[pid] += Math.floor((B[sellProp].h || 0) / 2);
        continue;
      }
      // hypothéquer une propriété sans maison
      var mProp = -1;
      B.forEach(function (sp, i) { if (s.owners[i] === pid && !s.mortg[i] && !(s.houses[i] > 0)) { if (mProp < 0) mProp = i; } });
      if (mProp >= 0) { s.mortg[mProp] = true; s.cash[pid] += Math.floor(B[mProp].p / 2); continue; }
      break; // plus rien à liquider
    }
  }

  // Paye `amt` de `pid` vers `to` (pid ou null=banque). Liquide si besoin ; faillite sinon.
  function pay(s, pid, amt, to) {
    if (amt <= 0) return true;
    if ((s.cash[pid] || 0) < amt) liquidateToward(s, pid, amt);
    if ((s.cash[pid] || 0) < amt) { bankrupt(s, pid, to); return false; }
    s.cash[pid] -= amt;
    if (to != null && !s.bankrupt[to]) s.cash[to] = (s.cash[to] || 0) + amt;
    return true;
  }

  function bankrupt(s, pid, to) {
    log(s, '💀 ' + nameish(pid) + ' fait faillite' + (to != null ? ' — argent et propriétés (hypothèques comprises) vont à ' + nameish(to) : ' — ses biens retournent à la banque'));
    // Transférer l'argent restant et les propriétés au créancier, ou à la banque.
    if (to != null && !s.bankrupt[to]) {
      s.cash[to] = (s.cash[to] || 0) + (s.cash[pid] || 0);
      B.forEach(function (sp, i) {
        if (s.owners[i] === pid) {
          s.owners[i] = to;
          // les maisons sont revendues à la banque (règle) : on les enlève, créancier paie 0
          if (s.houses[i]) s.houses[i] = 0;
        }
      });
    } else {
      // banque : propriétés libérées et dé-hypothéquées (simplification : remises en jeu, non hypothéquées)
      B.forEach(function (sp, i) { if (s.owners[i] === pid) { delete s.owners[i]; s.houses[i] = 0; delete s.mortg[i]; } });
    }
    s.cash[pid] = 0; s.bankrupt[pid] = true;
    if (alive(s).length <= 1) { s.winner = alive(s)[0] || null; s.phase = 'over'; }
  }

  var NAMEFN = null; // injecté par l'UI pour de jolis logs ; sinon le pid
  function nameish(pid) { return NAMEFN ? NAMEFN(pid) : pid; }

  // ── Lancer de dés ───────────────────────────────────────────────────────────
  function roll(s, rnd) { norm(s);
    if (s.phase !== 'roll' || s.winner) return;
    var pid = s.turn;
    var d1 = 1 + Math.floor((rnd ? rnd() : Math.random()) * 6);
    var d2 = 1 + Math.floor((rnd ? rnd() : Math.random()) * 6);
    s.dice = [d1, d2]; var sum = d1 + d2, dbl = d1 === d2;

    if (s.jail[pid] > 0) { // en prison
      if (dbl) { s.jail[pid] = 0; log(s, nameish(pid) + ' sort de prison (double !)'); move(s, pid, sum, rnd); s.doubles = 0; }
      else {
        s.jail[pid]++;
        if (s.jail[pid] > 3) { // 3 essais ratés → payer l'amende et avancer
          if (pay(s, pid, JAIL_FINE, null)) { s.jail[pid] = 0; log(s, nameish(pid) + ' paie ' + JAIL_FINE + ' et sort'); move(s, pid, sum, rnd); }
          if (s.phase !== 'over') endTurnFlow(s, false);
        } else { log(s, nameish(pid) + ' reste en prison'); endTurnFlow(s, false); }
      }
      return;
    }

    if (dbl) { s.doubles++; if (s.doubles >= 3) { log(s, nameish(pid) + ' fait 3 doubles → prison'); goJail(s, pid); endTurnFlow(s, false); return; } }
    else s.doubles = 0;
    move(s, pid, sum, rnd);
  }

  function goJail(s, pid) { s.pos[pid] = JAIL_POS; s.jail[pid] = 1; s.doubles = 0; }

  function move(s, pid, steps, rnd) {
    var np = (s.pos[pid] + steps) % 40;
    if (s.pos[pid] + steps >= 40) { s.cash[pid] += GO_SALARY; log(s, nameish(pid) + ' passe le Départ (+' + GO_SALARY + ')'); }
    s.pos[pid] = np;
    landOn(s, pid, np, steps, rnd);
  }
  function moveTo(s, pid, pos, collectGo, rnd) {
    if (collectGo && pos <= s.pos[pid]) { s.cash[pid] += GO_SALARY; log(s, nameish(pid) + ' passe le Départ (+' + GO_SALARY + ')'); }
    s.pos[pid] = pos; landOn(s, pid, pos, (s.dice[0] + s.dice[1]), rnd);
  }

  function landOn(s, pid, pos, diceSum, rnd) {
    var sp = B[pos];
    if (sp.t === 'go' || sp.t === 'jail' || sp.t === 'parking') { afterResolve(s, pid); return; }
    if (sp.t === 'gotojail') { log(s, nameish(pid) + ' va en prison'); goJail(s, pid); endTurnFlow(s, false); return; }
    if (sp.t === 'tax') { log(s, nameish(pid) + ' paie ' + sp.amt + ' (' + sp.n + ')'); pay(s, pid, sp.amt, null); afterResolve(s, pid); return; }
    if (sp.t === 'chance') { drawCard(s, pid, 'chance', rnd); return; }
    if (sp.t === 'chest') { drawCard(s, pid, 'chest', rnd); return; }
    // propriété / gare / service
    var owner = s.owners[pos];
    if (owner == null) { s.pending = pos; s.phase = 'buy'; return; }
    if (owner === pid) { afterResolve(s, pid); return; }
    if (s.mortg[pos]) { afterResolve(s, pid); return; }
    var rent = rentOf(s, pos, diceSum);
    log(s, nameish(pid) + ' paie ' + rent + ' de loyer à ' + nameish(owner) + ' (' + sp.n + ')');
    pay(s, pid, rent, owner);
    afterResolve(s, pid);
  }

  function drawCard(s, pid, deckName, rnd) {
    var deck = deckName === 'chance' ? CHANCE : CHEST;
    var order = deckName === 'chance' ? s.chanceDeck : s.chestDeck;
    var ptr = deckName === 'chance' ? s.chancePtr : s.chestPtr;
    var card = deck[order[ptr % order.length]];
    if (deckName === 'chance') s.chancePtr = (s.chancePtr + 1) % order.length; else s.chestPtr = (s.chestPtr + 1) % order.length;
    log(s, '🃏 ' + nameish(pid) + ' : ' + card.x);
    s.lastCard = { deck: deckName, x: card.x };
    applyCard(s, pid, card, rnd);
  }

  function applyCard(s, pid, c, rnd) {
    switch (c.a) {
      case 'go': moveTo(s, pid, c.pos, true, rnd); return;
      case 'move': { var np = ((s.pos[pid] + c.delta) % 40 + 40) % 40; s.pos[pid] = np; landOn(s, pid, np, (s.dice[0] + s.dice[1]), rnd); return; }
      case 'cash': s.cash[pid] += c.amt; afterResolve(s, pid); return;
      case 'pay': pay(s, pid, c.amt, null); afterResolve(s, pid); return;
      case 'getout': s.getout[pid] = (s.getout[pid] || 0) + 1; afterResolve(s, pid); return;
      case 'jail': goJail(s, pid); endTurnFlow(s, false); return;
      case 'each': { alive(s).forEach(function (q) { if (q !== pid) { pay(s, pid, c.amt, q); } }); afterResolve(s, pid); return; }
      case 'collectEach': { alive(s).forEach(function (q) { if (q !== pid && !s.bankrupt[pid]) { pay(s, q, c.amt, pid); } }); afterResolve(s, pid); return; }
      case 'repairs': { var tot = 0; B.forEach(function (sp, i) { if (s.owners[i] === pid) { var h = s.houses[i] || 0; if (h === 5) tot += c.pht; else tot += h * c.ph; } }); pay(s, pid, tot, null); afterResolve(s, pid); return; }
      case 'nearRail': { var np2 = nearestFrom(s.pos[pid], RAILS); moveTo(s, pid, np2, true, rnd); return; }
      case 'nearUtil': { var np3 = nearestFrom(s.pos[pid], UTILS); moveTo(s, pid, np3, true, rnd); return; }
    }
    afterResolve(s, pid);
  }
  function nearestFrom(pos, arr) { for (var d = 1; d < 40; d++) { var p = (pos + d) % 40; if (arr.indexOf(p) >= 0) return p; } return arr[0]; }

  // Après résolution d'une case sans décision en attente : passer en phase 'manage'.
  // Si le joueur actif a fait faillite pendant la résolution, on enchaîne au suivant.
  function afterResolve(s, pid) {
    if (s.phase === 'over' || s.winner) return;
    if (s.bankrupt[s.turn]) { endTurnFlow(s, false); return; }
    s.phase = 'manage';
  }

  // ── Achat / enchère ─────────────────────────────────────────────────────────
  function buy(s, pid) { norm(s);
    if (s.phase !== 'buy' || s.pending == null) return;
    var prop = s.pending, price = B[prop].p;
    if ((s.cash[pid] || 0) < price) return; // pas assez (l'UI empêche)
    s.cash[pid] -= price; s.owners[prop] = pid;
    log(s, nameish(pid) + ' achète ' + B[prop].n + ' (' + price + ')');
    s.pending = null; afterResolve(s, pid);
  }
  function declineBuy(s) { norm(s);
    if (s.phase !== 'buy' || s.pending == null) return;
    startAuction(s, s.pending);
  }
  function startAuction(s, prop) {
    // Règle maison : le joueur qui refuse d'acheter (et met donc la case aux
    // enchères) NE participe PAS à l'enchère — seuls les autres peuvent miser.
    var decliner = s.turn;
    var bidders = alive(s).filter(function (p) { return p !== decliner; });
    if (!bidders.length) { // personne d'autre en jeu → la case reste à la banque
      s.pending = null; s.auction = null; s.phase = 'manage';
      log(s, B[prop].n + ' reste à la banque'); afterResolve(s, decliner); return;
    }
    s.auction = { prop: prop, turn: bidders[0], high: null, highBid: 0, passed: {}, bidders: bidders };
    s.pending = null; s.phase = 'auction';
    log(s, 'Enchère : ' + B[prop].n + ' (celui qui a refusé ne mise pas)');
  }
  function auctionAct(s, pid, bid) { norm(s);
    if (s.phase !== 'auction' || !s.auction || s.auction.turn !== pid) return;
    var au = s.auction;
    if (bid != null && bid > au.highBid && (s.cash[pid] || 0) >= bid) { au.high = pid; au.highBid = bid; }
    else { au.passed[pid] = true; }
    // joueur suivant non passé
    var active = au.bidders.filter(function (p) { return !au.passed[p] && !s.bankrupt[p]; });
    if (active.length <= 1 && au.high != null) { finishAuction(s); return; }
    if (active.length === 0) { finishAuction(s); return; }
    // avancer le tour d'enchère
    var idx = au.bidders.indexOf(au.turn);
    for (var k = 1; k <= au.bidders.length; k++) { var cand = au.bidders[(idx + k) % au.bidders.length]; if (!au.passed[cand] && !s.bankrupt[cand]) { au.turn = cand; break; } }
  }
  function finishAuction(s) {
    var au = s.auction, prop = au.prop;
    if (au.high != null && au.highBid > 0) { s.cash[au.high] -= au.highBid; s.owners[prop] = au.high; log(s, nameish(au.high) + ' remporte ' + B[prop].n + ' pour ' + au.highBid); }
    else log(s, B[prop].n + ' reste à la banque');
    var roller = s.turn; s.auction = null; afterResolve(s, roller);
  }

  // ── Construction / hypothèques ───────────────────────────────────────────────
  function canBuildOn(s, prop, pid) {
    var sp = B[prop]; if (sp.t !== 'prop' || s.owners[prop] !== pid) return false;
    if (!hasMonopoly(s, sp.g, pid)) return false;
    if (GROUPS[sp.g].some(function (i) { return s.mortg[i]; })) return false;
    if ((s.houses[prop] || 0) >= 5) return false;
    var mn = Math.min.apply(null, GROUPS[sp.g].map(function (i) { return s.houses[i] || 0; }));
    return (s.houses[prop] || 0) === mn; // construction uniforme
  }
  function buildHouse(s, prop, pid) { norm(s);
    if (!canBuildOn(s, prop, pid)) return false;
    var cost = B[prop].h; if ((s.cash[pid] || 0) < cost) return false;
    s.cash[pid] -= cost; s.houses[prop] = (s.houses[prop] || 0) + 1;
    log(s, nameish(pid) + ' bâtit sur ' + B[prop].n);
    return true;
  }
  function canSellOn(s, prop, pid) {
    var sp = B[prop]; if (s.owners[prop] !== pid || !(s.houses[prop] > 0)) return false;
    var mx = Math.max.apply(null, GROUPS[sp.g].map(function (i) { return s.houses[i] || 0; }));
    return (s.houses[prop] || 0) === mx;
  }
  function sellHouse(s, prop, pid) { norm(s);
    if (!canSellOn(s, prop, pid)) return false;
    s.houses[prop]--; s.cash[pid] += Math.floor(B[prop].h / 2);
    return true;
  }
  function mortgage(s, prop, pid) { norm(s);
    if (s.owners[prop] !== pid || s.mortg[prop] || (s.houses[prop] || 0) > 0) return false;
    // ne pas hypothéquer si le groupe a des maisons
    if (B[prop].t === 'prop' && groupHouses(s, B[prop].g) > 0) return false;
    s.mortg[prop] = true; s.cash[pid] += Math.floor(B[prop].p / 2); return true;
  }
  function unmortgage(s, prop, pid) { norm(s);
    if (s.owners[prop] !== pid || !s.mortg[prop]) return false;
    var cost = Math.ceil(B[prop].p / 2 * 1.1); if ((s.cash[pid] || 0) < cost) return false;
    s.cash[pid] -= cost; delete s.mortg[prop]; return true;
  }

  // ── Échanges ─────────────────────────────────────────────────────────────────
  // trade = { from, to, give:{props:[],cash:n}, recv:{props:[],cash:n} }
  function tradeValid(s, t) { norm(s);
    if (!t) return false;
    if (s.bankrupt[t.from] || s.bankrupt[t.to]) return false;
    // On peut échanger n'importe quelle propriété qu'on possède, y compris une
    // COULEUR COMPLÈTE (avec maisons) : les maisons éventuelles sont revendues à la
    // banque au moment d'appliquer l'échange (cf. applyTrade). Seule contrainte réelle :
    // bien être propriétaire de ce qu'on propose.
    var okProps = (t.give.props || []).every(function (i) { return s.owners[i] === t.from; });
    var okProps2 = (t.recv.props || []).every(function (i) { return s.owners[i] === t.to; });
    if (!okProps || !okProps2) return false;
    if ((t.give.cash || 0) > (s.cash[t.from] || 0)) return false;
    if ((t.recv.cash || 0) > (s.cash[t.to] || 0)) return false;
    return true;
  }
  function applyTrade(s, t) { norm(s);
    if (!tradeValid(s, t)) return false;
    // Échanger une propriété dont le groupe a des maisons : on ne peut pas garder de
    // maisons sans posséder toute la couleur → on les revend d'abord à la banque
    // (moitié prix, remboursées au propriétaire actuel), puis on transfère la rue nue.
    var sold = false;
    function sellGroup(prop, owner) {
      var g = B[prop].g; if (!g) return;
      GROUPS[g].forEach(function (i) { var h = s.houses[i] || 0; if (h > 0) { s.cash[owner] += h * Math.floor(B[i].h / 2); s.houses[i] = 0; sold = true; } });
    }
    (t.give.props || []).forEach(function (i) { sellGroup(i, t.from); });
    (t.recv.props || []).forEach(function (i) { sellGroup(i, t.to); });
    (t.give.props || []).forEach(function (i) { s.owners[i] = t.to; });
    (t.recv.props || []).forEach(function (i) { s.owners[i] = t.from; });
    s.cash[t.from] -= (t.give.cash || 0); s.cash[t.to] += (t.give.cash || 0);
    s.cash[t.to] -= (t.recv.cash || 0); s.cash[t.from] += (t.recv.cash || 0);
    log(s, '🤝 Échange entre ' + nameish(t.from) + ' et ' + nameish(t.to) + (sold ? ' (maisons revendues à la banque)' : ''));
    return true;
  }

  // Toutes les propriétés ACHETABLES (rues couleur + gares + services) ont-elles un
  // propriétaire ? Tant qu'une carte reste à vendre (ex. Gare Saint-Lazare), aucun
  // échange n'est autorisé — règle voulue : on n'échange qu'une fois le plateau vendu.
  function allStreetsOwned(s) {
    for (var i = 0; i < B.length; i++) { var t = B[i].t; if ((t === 'prop' || t === 'rail' || t === 'util') && s.owners[i] == null) return false; }
    return true;
  }
  // ── IA d'échange : le bot cherche à compléter un monopole ──────────────────
  // Comme pour les humains : pas d'échange tant que toutes les rues ne sont pas vendues.
  // Groupes où `who` est à UNE case du monopole (case manquante détenue par un autre).
  function oneAwayGroups(s, who) {
    var res = [];
    for (var g in GROUPS) {
      var idxs = GROUPS[g];
      if (groupHouses(s, g) > 0) continue;
      if (idxs.filter(function (i) { return s.owners[i] === who; }).length !== idxs.length - 1) continue;
      var need = idxs.filter(function (i) { return s.owners[i] !== who; })[0];
      res.push({ g: g, need: need, owner: s.owners[need] });
    }
    return res;
  }
  function aiProposeTrade(s, pid) { norm(s);
    if (!allStreetsOwned(s)) return null;
    var mineNeeds = oneAwayGroups(s, pid).filter(function (n) { return n.owner != null && !s.bankrupt[n.owner] && n.owner !== pid; });
    if (!mineNeeds.length) return null;
    // 1) ÉCHANGE GAGNANT-GAGNANT : je donne à l'adversaire la case qui LUI complète une
    //    couleur, contre celle qui me complète la mienne (+ cash d'appoint si besoin).
    for (var a = 0; a < mineNeeds.length; a++) {
      var mn = mineNeeds[a], o = mn.owner;
      var theirNeeds = oneAwayGroups(s, o);
      for (var b = 0; b < theirNeeds.length; b++) {
        var tn = theirNeeds[b];
        if (tn.g === mn.g || s.owners[tn.need] !== pid) continue; // c'est MOI qui détiens la case qui complète O
        var giveCash = Math.max(0, B[mn.need].p - B[tn.need].p);  // je compense si je donne moins cher
        if ((s.cash[pid] || 0) < giveCash + 100) continue;
        var t = { from: pid, to: o, give: { props: [tn.need], cash: giveCash }, recv: { props: [mn.need], cash: 0 } };
        if (tradeValid(s, t)) return t;
      }
    }
    // 2) sinon, ACHAT CASH (offre généreuse) de la case qui me manque.
    for (var c = 0; c < mineNeeds.length; c++) {
      var m = mineNeeds[c], offer = Math.round(B[m.need].p * 1.4);
      if ((s.cash[pid] || 0) < offer + 120) continue; // garder un coussin pour bâtir
      var t2 = { from: pid, to: m.owner, give: { props: [], cash: offer }, recv: { props: [m.need], cash: 0 } };
      if (tradeValid(s, t2)) return t2;
    }
    return null;
  }
  // Prix minimum que le bot (t.to) réclame pour céder ce qu'on lui demande (t.recv) :
  //  • couleur COMPLÈTE : ≈ 1,8× la valeur NUE des rues + la moitié de l'investissement
  //    en maisons (l'autre moitié lui est remboursée par la banque lors de l'échange) ;
  //  • simple rue : sa valeur (rue + maisons éventuelles) + 15 %.
  // Barème calibré par simulation (des centaines de parties rejouées) : à ce prix,
  // l'échange d'un monopole est équitable — le vendeur n'y perd pas et l'acheteur y
  // gagne un peu — alors qu'une prime de +60 % faisait payer l'acheteur trop cher.
  function tradeAsk(s, recv) {
    var bare = (recv.cash || 0), houseInv = 0, mono = false;
    (recv.props || []).forEach(function (i) { bare += B[i].p; houseInv += (s.houses[i] || 0) * (B[i].h || 0); });
    (recv.props || []).forEach(function (i) { if (hasMonopoly(s, B[i].g, s.owners[i])) mono = true; });
    return mono ? (1.8 * bare + 0.5 * houseInv) : ((bare + houseInv) * 1.15);
  }
  // Valeur, pour `pid`, de ce qu'il REÇOIT dans un échange (cash + rues) :
  //  • prix nu de la rue en temps normal ;
  //  • MOITIÉ prix si la rue est hypothéquée (elle ne rapporte rien et coûte à lever) ;
  //  • BONUS (≈ ×2) si la rue lui COMPLÈTE une couleur — un monopole vaut bien plus que
  //    la rue seule, donc le bot accepte plus volontiers une rue vraiment utile pour lui.
  function tradeRecvValue(s, give, pid) {
    var v = (give.cash || 0);
    (give.props || []).forEach(function (i) {
      var base = s.mortg[i] ? Math.floor(B[i].p / 2) : B[i].p;
      var g = B[i].g;
      if (g && GROUPS[g].every(function (k) { return k === i || s.owners[k] === pid; })) base += B[i].p;
      v += base;
    });
    return v;
  }
  // Le destinataire `t.to` évalue : accepte si la valeur reçue dépasse son prix demandé.
  function aiAcceptTrade(s, t) { norm(s);
    return tradeRecvValue(s, t.give, t.to) >= tradeAsk(s, t.recv);
  }
  // Si le bot (t.to) refuse, il peut faire une CONTRE-OFFRE : mêmes propriétés mais
  // il réclame le cash qui atteindrait son prix demandé (prime renforcée pour un
  // monopole). Renvoie un trade RETOURNÉ (du bot vers l'humain), ou null.
  function aiCounterTrade(s, t) { norm(s);
    if (!t || s.bankrupt[t.from] || s.bankrupt[t.to]) return null;
    var bot = t.to;
    var recvV = tradeRecvValue(s, t.give, bot);             // ce que le bot reçoit (rues utiles valorisées)
    var target = Math.ceil(tradeAsk(s, t.recv));            // prix demandé par le bot pour ce qu'il cède
    if (recvV >= target) return null;                       // il accepterait déjà
    var extra = target - recvV;                             // cash en plus demandé à l'humain
    if ((t.give.cash || 0) + extra > (s.cash[t.from] || 0)) return null; // l'humain ne peut pas payer
    return {
      from: bot, to: t.from, counter: true,
      give: { props: (t.recv.props || []).slice(), cash: (t.recv.cash || 0) },        // le bot donne ce que l'humain voulait
      recv: { props: (t.give.props || []).slice(), cash: (t.give.cash || 0) + extra }  // le bot réclame l'offre de l'humain + extra
    };
  }

  function useGetout(s, pid) { norm(s);
    if (s.jail[pid] > 0 && (s.getout[pid] || 0) > 0) { s.getout[pid]--; s.jail[pid] = 0; log(s, nameish(pid) + ' utilise une carte « sortie de prison »'); return true; }
    return false;
  }
  function payJail(s, pid) { norm(s);
    if (s.jail[pid] > 0 && (s.cash[pid] || 0) >= JAIL_FINE) { s.cash[pid] -= JAIL_FINE; s.jail[pid] = 0; log(s, nameish(pid) + ' paie la caution'); return true; }
    return false;
  }

  // ── Fin de tour ──────────────────────────────────────────────────────────────
  function endTurn(s, rnd) { norm(s); // appelé par l'UI/bot en phase 'manage'
    if (s.phase !== 'manage') return;
    endTurnFlow(s, true);
  }
  // allowDouble : si true et qu'on a fait un double sans aller en prison → on rejoue.
  function endTurnFlow(s, allowDouble) { norm(s);
    if (s.winner || s.phase === 'over') return;
    s.turnCount = (s.turnCount || 0) + 1;
    var pid = s.turn;
    if (allowDouble && s.doubles > 0 && s.jail[pid] === 0 && !s.bankrupt[pid]) { s.phase = 'roll'; return; } // rejoue
    s.doubles = 0;
    var ord = s.order, idx = ord.indexOf(pid);
    for (var k = 1; k <= ord.length; k++) {
      var cand = ord[(idx + k) % ord.length];
      if (s.bankrupt[cand]) continue;
      if ((idx + k) >= ord.length) { // on a bouclé la table → nouveau tour de plateau
        s.round = (s.round || 1) + 1;
        // Partie COURTE (s.turnLimit = nombre de tours de table, réglé au salon) :
        // au bout du dernier tour, le plus gros patrimoine gagne.
        if (s.turnLimit && s.round > s.turnLimit) { finishByNetWorth(s); return; }
      }
      s.turn = cand; s.phase = 'roll'; return;
    }
    s.phase = 'over';
  }

  // Fin de la partie courte : classement au PATRIMOINE (argent + propriétés +
  // maisons). Départage d'égalité : l'ordre du tour (le premier servi gagne).
  function finishByNetWorth(s) {
    var best = null, bw = -1;
    alive(s).forEach(function (p) { var w = netWorth(s, p); if (w > bw) { bw = w; best = p; } });
    s.winner = best; s.phase = 'over';
    log(s, '⏱ ' + s.turnLimit + ' tours joués — ' + nameish(best) + ' gagne avec le plus gros patrimoine (' + bw + ')');
  }

  // ── IA (un pas de bot) ───────────────────────────────────────────────────────
  // Décision du bot pour le joueur courant, selon la phase. Achète si la trésorerie
  // reste saine, enchérit jusqu'à ~70 % de la valeur (110 % pour compléter un
  // monopole), construit dès qu'un monopole est nu, propose un échange utile à un
  // autre bot. « facile » : laisse parfois filer une propriété et ne construit pas.
  function botStep(s, level) {
    if (s.winner) return;
    var pid = actor(s), ph = s.phase;
    if (s.trade && s.trade.from === pid) return; // attend une réponse
    if (ph === 'roll') {
      if (s.jail[pid] > 0) {
        if (s.getout[pid] > 0) { useGetout(s, pid); return; }
        if (s.cash[pid] >= JAIL_FINE + 300) { payJail(s, pid); return; }
      }
      roll(s); return;
    }
    var easy = level === 'easy';
    if (ph === 'buy') {
      var price = B[s.pending].p;
      if (easy && Math.random() < 0.4) { declineBuy(s); return; }
      if (s.cash[pid] - price >= 50) buy(s, pid); else declineBuy(s);
      return;
    }
    if (ph === 'auction') {
      var au = s.auction, pr = B[au.prop].p, g = B[au.prop].g;
      var maxWant = pr * 0.7;
      if (g && ownedInGroup(s, g, pid) === GROUPS[g].length - 1) maxWant = pr * 1.1;
      var cap = Math.min(s.cash[pid] - 30, maxWant), next = au.highBid + 10;
      if (next <= cap) auctionAct(s, pid, next); else auctionAct(s, pid, null);
      return;
    }
    if (ph === 'manage') {
      if (easy) { endTurn(s); return; } // facile : ne construit pas
      for (var i = 0; i < 40; i++) { if (canBuildOn(s, i, pid) && s.cash[pid] - B[i].h >= 50) { buildHouse(s, i, pid); return; } }
      // Échange : le bot cherche à compléter un monopole. `botProposed` évite de
      // re-proposer en boucle si l'humain a déjà répondu ce tour-ci.
      if (s.botProposed !== pid) {
        var t = aiProposeTrade(s, pid);
        if (t) {
          var toIsBot = !s.players || (s.players[t.to] && s.players[t.to].isBot);
          if (toIsBot) { if (aiAcceptTrade(s, t)) { applyTrade(s, t); return; } } // bot ↔ bot : applique si l'autre accepte
          else { s.trade = t; s.botProposed = pid; return; } // bot → HUMAIN : on propose et on ATTEND sa réponse
        }
      }
      s.botProposed = null;
      endTurn(s); return;
    }
  }

  // ── Exports ──────────────────────────────────────────────────────────────────
  root.MonoEngine = {
    B: B, GROUPS: GROUPS, RAILS: RAILS, UTILS: UTILS, JAIL_POS: JAIL_POS,
    CHANCE: CHANCE, CHEST: CHEST, START_CASH: START_CASH, JAIL_FINE: JAIL_FINE,
    initGame: initGame, roll: roll, buy: buy, declineBuy: declineBuy, auctionAct: auctionAct,
    buildHouse: buildHouse, sellHouse: sellHouse, mortgage: mortgage, unmortgage: unmortgage,
    canBuildOn: canBuildOn, canSellOn: canSellOn, endTurn: endTurn,
    tradeValid: tradeValid, applyTrade: applyTrade, aiProposeTrade: aiProposeTrade, aiAcceptTrade: aiAcceptTrade, aiCounterTrade: aiCounterTrade,
    tradeAsk: tradeAsk, tradeRecvValue: tradeRecvValue,
    useGetout: useGetout, payJail: payJail,
    actor: actor, alive: alive, rentOf: rentOf, netWorth: netWorth, hasMonopoly: hasMonopoly,
    ownedInGroup: ownedInGroup, countRails: countRails, countUtils: countUtils,
    setNameFn: function (f) { NAMEFN = f; }, nameish: nameish, log: log, botStep: botStep
  };
})(typeof module !== 'undefined' && module.exports ? module.exports : (this.window = this.window || this));
if (typeof module !== 'undefined' && module.exports) { /* node */ }
