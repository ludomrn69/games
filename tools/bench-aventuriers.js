#!/usr/bin/env node
/*
  tools/bench-aventuriers.js — Prouve le moteur des « Aventuriers du Rail »
  (ai/aventuriers-engine.js) en HEADLESS : règles du plus long chemin (sentier),
  connexité (billets), légalité/paiement des routes, et parties complètes entre
  bots qui se terminent avec un vainqueur et des scores cohérents.

  En CI. Lancement : `node tools/bench-aventuriers.js`.
*/
'use strict';
var path = require('path');
var E = require(path.resolve(__dirname, '..', 'ai', 'aventuriers-engine.js')).Aventuriers;
var fails = [];
function ok(m) { console.log('  ✓ ' + m); }
function bad(m) { fails.push(m); console.log('  ✗ ' + m); }

console.log('🚂 Aventuriers du Rail (moteur)');

// 1) Plus long chemin (sentier : arêtes distinctes, sommets réutilisables).
(function () {
  var chain = [{ a: 'a', b: 'b', len: 2 }, { a: 'b', b: 'c', len: 3 }, { a: 'c', b: 'd', len: 1 }];
  if (E.longestPath(chain) === 6) ok('plus long chemin — chaîne = 6'); else bad('chaîne = ' + E.longestPath(chain));
  var y = [{ a: 'a', b: 'b', len: 2 }, { a: 'b', b: 'c', len: 3 }, { a: 'b', b: 'd', len: 4 }];
  if (E.longestPath(y) === 7) ok('plus long chemin — Y (sentier c-b-d) = 7'); else bad('Y = ' + E.longestPath(y));
  var cyc = [{ a: 'a', b: 'b', len: 1 }, { a: 'b', b: 'c', len: 1 }, { a: 'c', b: 'a', len: 1 }];
  if (E.longestPath(cyc) === 3) ok('plus long chemin — cycle = 3'); else bad('cycle = ' + E.longestPath(cyc));
})();

// 2) Connexité (billets).
(function () {
  var edges = [{ a: 'x', b: 'y' }, { a: 'y', b: 'z' }];
  if (E.connected(edges, 'x', 'z') && !E.connected(edges, 'x', 'w')) ok('connexité transitive OK'); else bad('connexité KO');
})();

// 3) Paiement / réclamation d'une route.
(function () {
  var st = E.setup(['A', 'B'], 42); st.order = ['A', 'B']; st.turn = 'A';
  st.players.A.hand = E.emptyHand(); st.players.A.hand.R = 1; // route r22 (grise, longueur 1 : Amsterdam–Bruxelles)
  var opts = E.paymentOptions(st, 'A', 'r22');
  if (opts.length && opts[0].colorCards === 1) ok('paiement d\'une route grise (1 carte)'); else bad('paiement grise KO');
  var trains = st.players.A.trains;
  E.claim(st, 'A', 'r22', opts[0]);
  if (st.claimed.r22 === 'A' && st.players.A.trains === trains - 1 && st.players.A.scoreRoutes === 1 && st.turn === 'B') ok('réclamation : débit wagons + score + fin de tour'); else bad('réclamation KO');
})();

// 4) Parties complètes (bots) : terminent, vainqueur au score max, billets scorés.
(function () {
  function run(n, seed) {
    var order = []; for (var i = 0; i < n; i++) order.push('p' + i);
    var st = E.setup(order, seed); st.order = order;
    var guard = 0;
    while (st.phase !== 'ended' && guard++ < 200000) {
      var actor = st.phase === 'chooseTickets' ? st.pendingTickets.pid : st.turn;
      E.applyBot(st, actor);
    }
    if (st.phase !== 'ended') throw new Error('non terminé (guard=' + guard + ')');
    if (!st.winner || !st.finalScores) throw new Error('fin incomplète');
    var maxp = order[0]; order.forEach(function (p) { if (st.finalScores[p].total > st.finalScores[maxp].total) maxp = p; });
    if (st.finalScores[st.winner].total !== st.finalScores[maxp].total) throw new Error('vainqueur pas au score max');
    return { winScore: st.finalScores[st.winner].total, routes: st.players[st.winner].routes.length };
  }
  var runs = 0, err = 0, totScore = 0;
  [2, 3, 4, 5].forEach(function (n) { for (var r = 0; r < 30; r++) { runs++; try { var res = run(n, 7 * n + r * 101 + 13); totScore += res.winScore; } catch (e) { err++; if (err <= 5) bad(n + 'j r' + r + ' : ' + e.message); } } });
  if (!err) ok(runs + ' parties (2-5 joueurs) terminent · score moyen vainqueur ' + Math.round(totScore / runs));
})();

console.log('');
if (fails.length) { console.error('❌ ' + fails.length + ' test(s) moteur échoué(s) :'); fails.forEach(function (f) { console.error('   - ' + f); }); process.exit(1); }
console.log('✅ Aventuriers du Rail OK : plus long chemin, connexité, réclamation, parties complètes.');
