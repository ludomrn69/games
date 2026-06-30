#!/usr/bin/env node
/*
  tools/bench-games.js — Banc d'essai des IA des JEUX (hors les 4 jeux de pure
  recherche, qui ont leur propre banc dans bench.js). Chaque IA de jeu vit dans son
  module `<jeu>-ai.js` (moteur PUR + IA, sans DOM), exactement comme p4-ai.js : on
  peut donc la faire jouer des parties entières en headless et MESURER sa force.

  Pour chaque jeu, on vérifie deux choses :
   • LÉGALITÉ : l'IA ne produit jamais de coup illégal sur des milliers de parties ;
   • FORCE : elle bat largement un joueur ALÉATOIRE (taux de victoire / score moyen),
     avec un seuil qui échoue la CI en cas de régression.

  Lancement : `node tools/bench-games.js`  ·  `node tools/bench-games.js --full`.
*/
'use strict';
var path = require('path');
var ROOT = path.resolve(__dirname, '..');
var FULL = process.argv.indexOf('--full') >= 0;
var failures = [];
function ok(msg) { console.log('  ✓ ' + msg); }
function fail(msg) { failures.push(msg); console.log('  ✗ ' + msg); }
function pct(x, n) { return (100 * x / n).toFixed(0) + '%'; }

// ── Bataille navale ──────────────────────────────────────────────────────────
// On mesure le nombre moyen de tirs pour couler toute la flotte (17 cases). Le
// minimum théorique est 17 ; un tir au hasard en consomme ~95. Une bonne IA de
// densité tourne autour de 45. On vérifie aussi qu'elle ne tire jamais deux fois
// au même endroit (légalité).
(function () {
  console.log('🚢 Bataille navale');
  var AI = require(path.join(ROOT, 'ai', 'bataille-navale-ai.js')).BattleshipAI;
  function shotsToClear(level) {
    var ships = AI.placeFleet(AI.FLEET);
    var cellShip = {}; ships.forEach(function (s, si) { s.cells.forEach(function (c) { cellShip[c] = si; }); });
    var shots = '.'.repeat(100).split(''); var n = 0, fired = {};
    while (n <= 100) {
      var sunkCells = {}, remaining = [];
      ships.forEach(function (s) {
        var sunk = s.cells.every(function (c) { return shots[c] === 'h'; });
        if (sunk) s.cells.forEach(function (c) { sunkCells[c] = true; }); else remaining.push(s.size);
      });
      if (!remaining.length) break;
      var t = AI.chooseShot(shots.join(''), remaining, sunkCells, level);
      if (t < 0 || fired[t]) { return { illegal: true }; }
      fired[t] = true; shots[t] = (cellShip[t] != null) ? 'h' : 'm'; n++;
    }
    return { shots: n };
  }
  var N = FULL ? 8000 : 1500, sumHard = 0, sumRnd = 0, illegal = 0;
  function rndClear() {
    var ships = AI.placeFleet(AI.FLEET), occ = {}; ships.forEach(function (s) { s.cells.forEach(function (c) { occ[c] = true; }); });
    var free = []; for (var i = 0; i < 100; i++) free.push(i);
    for (var a = free.length - 1; a > 0; a--) { var b = (Math.random() * (a + 1)) | 0; var t = free[a]; free[a] = free[b]; free[b] = t; }
    var hitsNeeded = 17, n = 0; for (var k = 0; k < free.length; k++) { n++; if (occ[free[k]]) { if (--hitsNeeded === 0) break; } }
    return n;
  }
  for (var i = 0; i < N; i++) {
    var r = shotsToClear('hard'); if (r.illegal) { illegal++; continue; }
    sumHard += r.shots; sumRnd += rndClear();
  }
  var avgHard = sumHard / N, avgRnd = sumRnd / N;
  console.log('  difficile : ' + avgHard.toFixed(1) + ' tirs/partie · aléatoire : ' + avgRnd.toFixed(1) + ' (min 17, ' + N + ' parties)');
  if (illegal) fail('Bataille navale : ' + illegal + ' tir(s) illégaux'); else ok('aucun tir illégal');
  if (avgHard < 52) ok('IA difficile efficace (< 52 tirs)'); else fail('Bataille navale : IA difficile trop lente (' + avgHard.toFixed(1) + ' ≥ 52)');
  if (avgHard < avgRnd - 30) ok('domine largement l\'aléatoire'); else fail('Bataille navale : avantage sur l\'aléatoire trop faible');
})();

// ── 6 qui prend ──────────────────────────────────────────────────────────────
// 2 IA contre 2 joueurs aléatoires DANS LA MÊME donne (comparaison équitable).
// On mesure les têtes de bœuf ramassées par joueur et par donne : moins = mieux.
(function () {
  console.log('🐮 6 qui prend');
  var AI = require(path.join(ROOT, 'ai', 'sixnimmt-ai.js')).SixNimmtAI;
  var N = FULL ? 4000 : 1200, aiHeads = 0, rndHeads = 0, illegal = 0;
  for (var g = 0; g < N; g++) {
    var d = AI.deal(4);
    var hands = d.hands.map(function (h) { return h.slice(); });
    var rows = d.rows.map(function (r) { return r.slice(); });
    var heads = [0, 0, 0, 0], isAI = [true, true, false, false];
    for (var turn = 0; turn < 10; turn++) {
      var picks = [];
      for (var p = 0; p < 4; p++) {
        var hand = hands[p]; if (!hand.length) continue;
        var val = isAI[p] ? AI.chooseCard(rows, hand) : hand[(Math.random() * hand.length) | 0];
        if (hand.indexOf(val) < 0) { illegal++; val = hand[0]; }
        hand.splice(hand.indexOf(val), 1);
        picks.push({ pid: p, val: val });
      }
      var res = AI.resolveTurn(rows, picks);
      for (var pid in res.heads) heads[pid] += res.heads[pid];
    }
    aiHeads += heads[0] + heads[1]; rndHeads += heads[2] + heads[3];
  }
  var aiAvg = aiHeads / (N * 2), rndAvg = rndHeads / (N * 2);
  console.log('  têtes/joueur/donne — IA : ' + aiAvg.toFixed(2) + ' · aléatoire : ' + rndAvg.toFixed(2) + ' (' + N + ' donnes)');
  if (illegal) fail('6 qui prend : ' + illegal + ' carte(s) illégales'); else ok('aucune carte illégale');
  if (aiAvg < rndAvg * 0.72) ok('IA ramasse nettement moins de têtes que l\'aléatoire');
  else fail('6 qui prend : IA pas assez forte (' + aiAvg.toFixed(2) + ' vs alea ' + rndAvg.toFixed(2) + ')');
})();

// ── Mastermind ───────────────────────────────────────────────────────────────
// Le solveur « difficile » (minimax de Knuth) doit craquer TOUT code en ≤ 5 coups,
// avec une moyenne ~4,5. On le vérifie sur un échantillon de codes secrets.
(function () {
  console.log('🎯 Mastermind');
  var AI = require(path.join(ROOT, 'ai', 'mastermind-ai.js')).MastermindAI;
  function solve(secret) {
    var hist = [];
    for (var step = 1; step <= 10; step++) {
      var g = AI.choose(hist, 'hard');
      var f = AI.feedback(g, secret);
      if (f.black === AI.PEGS) return step;
      hist.push({ g: g, black: f.black, white: f.white });
    }
    return 99;
  }
  // Échantillon de codes (tous les 1296 en --full, sinon un sous-ensemble réparti).
  var all = AI.allCodes();
  var sample = FULL ? all : all.filter(function (_, i) { return i % 7 === 0; });
  var total = 0, max = 0, fails = 0;
  sample.forEach(function (sec) { var n = solve(sec); total += n; if (n > max) max = n; if (n > 6) fails++; });
  var avg = total / sample.length;
  console.log('  difficile : ' + avg.toFixed(2) + ' coups en moyenne · pire cas ' + max + ' (' + sample.length + ' codes)');
  if (fails) fail('Mastermind : ' + fails + ' code(s) non craqués en ≤ 6 coups');
  else ok('tout code craqué en ≤ ' + max + ' coups');
  if (avg < 4.8) ok('moyenne quasi optimale (< 4,8)'); else fail('Mastermind : moyenne trop haute (' + avg.toFixed(2) + ')');
})();

// ── Président ─────────────────────────────────────────────────────────────────
// 2 IA contre 2 joueurs aléatoires. On mesure le RANG de fin moyen (0 = Président,
// 3 = Trou du cul) : l'IA doit finir nettement plus tôt que l'aléatoire.
(function () {
  console.log('🃏 Président');
  var AI = require(path.join(ROOT, 'ai', 'president-ai.js')).PresidentAI;
  function randomLegal(pile, hand) {
    var plays = AI.legalPlays(pile, hand);
    if (!pile) return plays[(Math.random() * plays.length) | 0];     // mener : on doit jouer
    if (!plays.length) return null;                                   // suivre sans pouvoir → passe
    return Math.random() < 0.5 ? null : plays[(Math.random() * plays.length) | 0];
  }
  function playGame(isAI) {
    var hands = AI.deal(4), pile = null, lastPlayer = null, finish = [], passes = 0, idx = 0, guard = 0;
    function activeCount() { var n = 0; for (var p = 0; p < 4; p++) if (hands[p].length) n++; return n; }
    while (activeCount() > 1 && guard++ < 5000) {
      var p = idx % 4;
      if (!hands[p].length) { idx++; continue; }
      if (pile && p === lastPlayer) { pile = null; passes = 0; }       // retour au meneur → relance
      var move = isAI[p] ? AI.chooseMove(pile, hands[p], 'hard') : randomLegal(pile, hands[p]);
      if (!pile && !move) move = AI.legalPlays(null, hands[p])[0];      // interdit de passer en menant
      if (move && move.length) {
        move.forEach(function (c) { hands[p].splice(hands[p].indexOf(c), 1); });
        pile = { rank: AI.rankVal(move[0]), count: move.length }; lastPlayer = p; passes = 0;
        if (!hands[p].length) finish.push(p);
      } else { passes++; }
      idx++;
      if (pile && passes >= activeCount()) { pile = null; passes = 0; } // tous ont passé → relance
    }
    for (var q = 0; q < 4; q++) if (hands[q].length) finish.push(q);    // dernier = Trou du cul
    return finish;
  }
  var N = FULL ? 6000 : 1500, aiRank = 0, rndRank = 0, illegal = 0;
  for (var g = 0; g < N; g++) {
    var isAI = [true, false, true, false];
    var fin = playGame(isAI);
    if (fin.length !== 4) { illegal++; continue; }
    fin.forEach(function (pid, pos) { if (isAI[pid]) aiRank += pos; else rndRank += pos; });
  }
  var aiAvg = aiRank / (N * 2), rndAvg = rndRank / (N * 2);
  console.log('  rang de fin moyen — IA : ' + aiAvg.toFixed(2) + ' · aléatoire : ' + rndAvg.toFixed(2) + ' (0=Président, ' + N + ' parties)');
  if (illegal) fail('Président : ' + illegal + ' partie(s) incohérentes'); else ok('parties cohérentes (4 joueurs classés)');
  if (aiAvg < rndAvg - 0.4) ok('IA finit nettement plus tôt que l\'aléatoire'); else fail('Président : IA pas assez forte (' + aiAvg.toFixed(2) + ' vs ' + rndAvg.toFixed(2) + ')');
})();

// ── Skyjo ────────────────────────────────────────────────────────────────────
// Simulation complète de manches à 4 (2 IA, 2 aléatoires). Score = somme de la
// grille (plus bas = mieux). L'IA doit scorer nettement moins que l'aléatoire.
(function () {
  console.log('🔢 Skyjo');
  var AI = require(path.join(ROOT, 'ai', 'skyjo-ai.js')).SkyjoAI;
  function rint(n) { return (Math.random() * n) | 0; }
  function playRound(isAI) {
    var deck = AI.buildDeck();
    for (var i = deck.length - 1; i > 0; i--) { var j = rint(i + 1); var t = deck[i]; deck[i] = deck[j]; deck[j] = t; }
    var P = []; for (var p = 0; p < 4; p++) { var grid = []; for (var k = 0; k < 12; k++) grid.push(deck.pop()); P.push({ grid: grid, flipped: arr(12, false), removed: arr(12, false) }); }
    var discard = [deck.pop()];
    function arr(n, v) { var a = []; for (var i = 0; i < n; i++) a.push(v); return a; }
    function hiddenIdx(pl) { var a = []; for (var i = 0; i < 12; i++) if (!pl.flipped[i] && !pl.removed[i]) a.push(i); return a; }
    function visSum(pl) { var s = 0; for (var i = 0; i < 12; i++) if (pl.flipped[i] && !pl.removed[i]) s += pl.grid[i]; return s; }
    function elim(pl) { for (var col = 0; col < 4; col++) { var ix = [col, col + 4, col + 8]; if (ix.every(function (c) { return pl.flipped[c] && !pl.removed[c]; }) && pl.grid[ix[0]] === pl.grid[ix[1]] && pl.grid[ix[1]] === pl.grid[ix[2]]) { ix.forEach(function (c) { pl.removed[c] = true; }); discard.push(pl.grid[ix[0]]); } } }
    function drawPileCard() { if (!deck.length) { var top = discard.pop(); deck = discard; discard = [top]; for (var i = deck.length - 1; i > 0; i--) { var j = rint(i + 1); var t = deck[i]; deck[i] = deck[j]; deck[j] = t; } } return deck.pop(); }
    // flip 2 chacun
    for (var q = 0; q < 4; q++) for (var f = 0; f < 2; f++) { var pl = P[q]; if (isAI[q]) { var a = AI.decide({ phase: 'flip2', grid: pl.grid, flipped: pl.flipped, removed: pl.removed }); pl.flipped[a.idx] = true; } else { var hs = hiddenIdx(pl); pl.flipped[hs[rint(hs.length)]] = true; } }
    function oppMin(self) { var m = Infinity; for (var p2 = 0; p2 < 4; p2++) if (p2 !== self) m = Math.min(m, visSum(P[p2])); return m; }
    function turnOf(idx) {
      var pl = P[idx];
      // 1) piocher ou prendre la défausse
      var top = discard.length ? discard[discard.length - 1] : null, drawn, from;
      var d1 = isAI[idx] ? AI.decide({ phase: 'turn', grid: pl.grid, flipped: pl.flipped, removed: pl.removed, discardTop: top, drawnCard: null, drawnFrom: null, oppMinVisibleSum: oppMin(idx) }, 'hard')
                         : ((top != null && Math.random() < 0.5) ? { type: 'takeDiscard' } : { type: 'drawPile' });
      if (d1.type === 'takeDiscard' && top != null) { drawn = discard.pop(); from = 'discard'; } else { drawn = drawPileCard(); from = 'pile'; }
      // 2) placer
      var d2 = isAI[idx] ? AI.decide({ phase: 'turn', grid: pl.grid, flipped: pl.flipped, removed: pl.removed, discardTop: discard.length ? discard[discard.length - 1] : null, drawnCard: drawn, drawnFrom: from, oppMinVisibleSum: oppMin(idx) }, 'hard')
                         : randPlace(pl, from);
      if (d2.type === 'discardFlip' && from === 'pile') { discard.push(drawn); pl.flipped[d2.idx] = true; }
      else { var idx2 = d2.idx; discard.push(pl.grid[idx2]); pl.grid[idx2] = drawn; pl.flipped[idx2] = true; }
      elim(pl);
    }
    function randPlace(pl, from) {
      var hs = hiddenIdx(pl);
      if (from === 'pile' && hs.length && Math.random() < 0.5) return { type: 'discardFlip', idx: hs[rint(hs.length)] };
      var slots = []; for (var c = 0; c < 12; c++) if (!pl.removed[c]) slots.push(c);
      return { type: 'replace', idx: slots[rint(slots.length)] };
    }
    var turn = rint(4), finisher = -1, after = 0, guard = 0;
    while (guard++ < 600) {
      turnOf(turn);
      if (finisher < 0 && hiddenIdx(P[turn]).length === 0) finisher = turn;
      turn = (turn + 1) % 4;
      if (finisher >= 0) { after++; if (after >= 3) break; } // les 3 autres jouent un dernier tour
    }
    // révéler tout + scorer
    var scores = []; for (var p3 = 0; p3 < 4; p3++) { var pl = P[p3], s = 0; for (var c = 0; c < 12; c++) if (!pl.removed[c]) s += pl.grid[c]; scores.push(s); }
    if (finisher >= 0) { var others = scores.filter(function (_, i) { return i !== finisher; }); if (scores[finisher] >= Math.min.apply(null, others)) scores[finisher] *= 2; }
    return scores;
  }
  var N = FULL ? 4000 : 1200, aiSum = 0, rndSum = 0;
  for (var g = 0; g < N; g++) { var isAI = [true, false, true, false]; var sc = playRound(isAI); aiSum += sc[0] + sc[2]; rndSum += sc[1] + sc[3]; }
  var aiAvg = aiSum / (N * 2), rndAvg = rndSum / (N * 2);
  console.log('  score/joueur/manche — IA : ' + aiAvg.toFixed(1) + ' · aléatoire : ' + rndAvg.toFixed(1) + ' (plus bas = mieux, ' + N + ' manches)');
  if (aiAvg < rndAvg - 8) ok('IA score nettement moins que l\'aléatoire'); else fail('Skyjo : IA pas assez forte (' + aiAvg.toFixed(1) + ' vs ' + rndAvg.toFixed(1) + ')');
})();

// ── Uno ──────────────────────────────────────────────────────────────────────
// Parties complètes à 4 (2 IA, 2 aléatoires). On compte les victoires (1er à vider
// sa main). Part équitable = 50 % par camp ; l'IA doit dépasser nettement.
(function () {
  console.log('🎴 Uno');
  var AI = require(path.join(ROOT, 'ai', 'uno-ai.js')).UnoAI;
  function rint(n) { return (Math.random() * n) | 0; }
  function randomDecide(view) {
    if (view.pendingDraw > 0) { var tw = view.hand.filter(function (c) { return AI.parseCard(c).action === 'D'; }); if (tw.length && Math.random() < 0.5) return { type: 'play', card: tw[0], color: AI.parseCard(tw[0]).color }; return { type: 'draw' }; }
    var pl = view.hand.filter(function (c) { return AI.canPlay(c, view.top, view.currentColor); });
    if (!pl.length) return view.drewThisTurn ? { type: 'pass' } : { type: 'draw' };
    var card = pl[rint(pl.length)], p = AI.parseCard(card);
    return { type: 'play', card: card, color: p.wild ? AI.COLORS[rint(4)] : p.color };
  }
  function playGame(isAI) {
    var d = AI.deal(4), hands = d.hands, deck = d.deck, discard = [];
    var first; do { first = deck.pop(); } while (first && AI.parseCard(first).wild && deck.length);
    discard.push(first);
    var currentColor = AI.parseCard(first).color || AI.COLORS[rint(4)], dir = 1, pendingDraw = 0, turn = rint(4), guard = 0;
    function drawOne() { if (!deck.length) { var top = discard.pop(); deck = discard; discard = [top]; for (var i = deck.length - 1; i > 0; i--) { var j = rint(i + 1); var t = deck[i]; deck[i] = deck[j]; deck[j] = t; } } return deck.pop(); }
    while (guard++ < 3000) {
      var pid = turn, hand = hands[pid], skip = false, drew = false, sub = 0;
      while (sub++ < 10) {
        var top = discard[discard.length - 1], nextP = (pid + dir + 4) % 4;
        var view = { hand: hand, top: top, currentColor: currentColor, pendingDraw: pendingDraw, nextCount: hands[nextP].length, drewThisTurn: drew, blunder: false };
        var act = isAI[pid] ? AI.decide(view) : randomDecide(view);
        if (act.type === 'draw') { if (pendingDraw > 0) { for (var k = 0; k < pendingDraw; k++) hand.push(drawOne()); pendingDraw = 0; break; } hand.push(drawOne()); drew = true; continue; }
        if (act.type === 'pass') break;
        var idx = hand.indexOf(act.card); if (idx < 0) { hand.push(drawOne()); break; }
        hand.splice(idx, 1); discard.push(act.card);
        var p = AI.parseCard(act.card);
        if (p.wild) { currentColor = act.color || AI.COLORS[rint(4)]; if (p.draw4) pendingDraw += 4; }
        else { currentColor = p.color; if (p.action === 'D') pendingDraw += 2; else if (p.action === 'S') skip = true; else if (p.action === 'V') dir = -dir; }
        if (hand.length === 0) return pid;
        break;
      }
      var n = (pid + dir + 4) % 4; if (skip) n = (n + dir + 4) % 4; turn = n;
    }
    return -1;
  }
  var N = FULL ? 4000 : 1200, aiWins = 0, rndWins = 0, nulls = 0;
  for (var g = 0; g < N; g++) { var isAI = [true, false, true, false]; var w = playGame(isAI); if (w < 0) { nulls++; continue; } if (isAI[w]) aiWins++; else rndWins++; }
  var dec = aiWins + rndWins;
  console.log('  victoires — IA : ' + pct(aiWins, dec) + ' · aléatoire : ' + pct(rndWins, dec) + ' (' + dec + ' parties décisives)');
  if (aiWins > rndWins * 1.25) ok('IA gagne nettement plus souvent que l\'aléatoire'); else fail('Uno : IA pas assez forte (' + aiWins + ' vs ' + rndWins + ')');
})();

// ── Papayoo ──────────────────────────────────────────────────────────────────
// Donnes complètes à 4 (2 IA, 2 aléatoires). 250 points en jeu par donne (Payoo
// 1..20 = 210 + Papayoo 40). L'IA doit en ramasser nettement moins.
(function () {
  console.log('🐔 Papayoo');
  var AI = require(path.join(ROOT, 'ai', 'papayoo-ai.js')).PapayooAI;
  function playDeal(isAI) {
    var d = AI.deal(4), hands = d.hands.map(function (h) { return h.slice(); }), pap = d.papSuit;
    var totals = [0, 0, 0, 0], leader = (Math.random() * 4) | 0;
    while (hands[0].length) {
      var trick = [], led = null, turn = leader;
      for (var k = 0; k < 4; k++) {
        var pid = turn, hand = hands[pid], legal = AI.legalCards(hand, led);
        var card = isAI[pid] ? AI.choosePlay({ papSuit: pap, ledSuit: led, trick: trick, nPlayers: 4, legal: legal }) : legal[(Math.random() * legal.length) | 0];
        hand.splice(hand.indexOf(card), 1); trick.push({ by: pid, card: card });
        if (k === 0) led = AI.suitOf(card);
        turn = (turn + 1) % 4;
      }
      var winner = AI.trickWinner(trick, led); totals[winner] += AI.trickPoints(trick, pap); leader = winner;
    }
    return totals;
  }
  var N = FULL ? 6000 : 1500, aiPts = 0, rndPts = 0;
  for (var g = 0; g < N; g++) { var isAI = [true, false, true, false]; var t = playDeal(isAI); aiPts += t[0] + t[2]; rndPts += t[1] + t[3]; }
  var aiAvg = aiPts / (N * 2), rndAvg = rndPts / (N * 2);
  console.log('  points/joueur/donne — IA : ' + aiAvg.toFixed(1) + ' · aléatoire : ' + rndAvg.toFixed(1) + ' (plus bas = mieux, ' + N + ' donnes)');
  if (aiAvg < rndAvg * 0.8) ok('IA ramasse nettement moins de points que l\'aléatoire'); else fail('Papayoo : IA pas assez forte (' + aiAvg.toFixed(1) + ' vs ' + rndAvg.toFixed(1) + ')');
})();

// ── Trio ─────────────────────────────────────────────────────────────────────
// Simulation complète (2 IA, 2 aléatoires) du mécanisme « retourne ou rate ».
// L'IA, qui démarre par ses propres cartes et complète à coup sûr, doit gagner plus.
(function () {
  console.log('🎴 Trio');
  var AI = require(path.join(ROOT, 'ai', 'trio-ai.js')).TrioAI;
  function rint(n) { return (Math.random() * n) | 0; }
  function playGame(isAI) {
    var deck = AI.makeDeck(); for (var i = deck.length - 1; i > 0; i--) { var j = rint(i + 1); var t = deck[i]; deck[i] = deck[j]; deck[j] = t; }
    var per = AI.HAND_PER[4], hands = []; for (var p = 0; p < 4; p++) hands.push(deck.slice(p * per, (p + 1) * per).sort(function (a, b) { return a - b; }));
    var center = deck.slice(per * 4), trios = [0, 0, 0, 0], turn = rint(4), winner = -1, guard = 0;
    function cardsLeft() { var n = center.length; for (var p = 0; p < 4; p++) n += hands[p].length; return n; }
    function accIdx(pid, flH, which) { var h = hands[pid], av = []; for (var i = 0; i < h.length; i++) if (!flH[pid][i]) av.push(i); if (!av.length) return -1; return which === 'low' ? av[0] : av[av.length - 1]; }
    function randomDecide(view, flH, flC, active) {
      var opts = [];
      if (view.myLow != null) opts.push({ type: 'hand', pid: active, which: 'low' });
      if (view.myHigh != null) opts.push({ type: 'hand', pid: active, which: 'high' });
      view.centerAvail.forEach(function (ci) { opts.push({ type: 'center', ci: ci }); });
      view.others.forEach(function (o) { opts.push({ type: 'hand', pid: o, which: 'low' }); opts.push({ type: 'hand', pid: o, which: 'high' }); });
      return opts.length ? opts[rint(opts.length)] : null;
    }
    while (winner < 0 && cardsLeft() >= 3 && guard++ < 4000) {
      var active = turn, picks = [], flH = [{}, {}, {}, {}], flC = {}, sub = 0, broke = false;
      while (sub++ < 80) {
        var loI = accIdx(active, flH, 'low'), hiI = accIdx(active, flH, 'high');
        var cAvail = []; for (var ci = 0; ci < center.length; ci++) if (!flC[ci]) cAvail.push(ci);
        var others = []; for (var q = 0; q < 4; q++) if (q !== active && hands[q].length) others.push(q);
        var view = { picks: picks, self: active, myLow: loI >= 0 ? hands[active][loI] : null, myHigh: hiI >= 0 ? hands[active][hiI] : null, centerAvail: cAvail, others: others, easy: false };
        var act = isAI[active] ? AI.decide(view) : randomDecide(view, flH, flC, active);
        if (!act) { turn = (active + 1) % 4; break; }
        var v;
        if (act.type === 'hand') { var idx = accIdx(act.pid, flH, act.which); if (idx < 0) { turn = (active + 1) % 4; break; } v = hands[act.pid][idx]; flH[act.pid][idx] = true; picks.push({ src: 'hand', pid: act.pid, idx: idx, v: v }); }
        else { if (flC[act.ci] || act.ci >= center.length) { turn = (active + 1) % 4; break; } v = center[act.ci]; flC[act.ci] = true; picks.push({ src: 'center', ci: act.ci, v: v }); }
        if (picks.length === 1) continue;
        if (v !== picks[0].v) { turn = (active + 1) % 4; break; }           // raté → tour suivant
        if (picks.length === 3) {                                           // Trio !
          var byPid = {}, centers = [];
          picks.forEach(function (pk) { if (pk.src === 'hand') (byPid[pk.pid] = byPid[pk.pid] || []).push(pk.idx); else centers.push(pk.ci); });
          Object.keys(byPid).forEach(function (pp) { byPid[pp].sort(function (a, b) { return b - a; }).forEach(function (ix) { hands[+pp].splice(ix, 1); }); });
          centers.sort(function (a, b) { return b - a; }).forEach(function (cc) { center.splice(cc, 1); });
          trios[active]++;
          if (picks[0].v === 7 || trios[active] >= 3) { winner = active; broke = true; break; }
          picks = []; flH = [{}, {}, {}, {}]; flC = {};
          if (cardsLeft() < 3) { broke = true; break; }
        }
      }
      if (broke) break;
    }
    if (winner < 0) { winner = 0; for (var p2 = 1; p2 < 4; p2++) if (trios[p2] > trios[winner]) winner = p2; }
    return winner;
  }
  var N = FULL ? 4000 : 1500, aiWins = 0, rndWins = 0;
  for (var g = 0; g < N; g++) { var isAI = [true, false, true, false]; var w = playGame(isAI); if (isAI[w]) aiWins++; else rndWins++; }
  console.log('  victoires — IA : ' + pct(aiWins, N) + ' · aléatoire : ' + pct(rndWins, N) + ' (' + N + ' parties)');
  if (aiWins > rndWins * 1.15) ok('IA gagne plus souvent que l\'aléatoire'); else fail('Trio : IA pas assez forte (' + aiWins + ' vs ' + rndWins + ')');
})();

// ── Blokus ───────────────────────────────────────────────────────────────────
// Parties complètes à 4 (IA = B,R · aléatoire = Y,G). Score = cases NON posées
// (89 au départ ; plus bas = mieux). L'IA doit en placer nettement plus.
(function () {
  console.log('🧩 Blokus');
  var AI = require(path.join(ROOT, 'ai', 'blokus-ai.js')).BlokusAI;
  var COLORS = ['B', 'Y', 'R', 'G'];
  function playGame(isAI) {
    var board = '.'.repeat(400), pieces = {}, first = {}, done = {};
    COLORS.forEach(function (c) { pieces[c] = AI.ALL_PIECE_IDS.slice(); first[c] = true; done[c] = false; });
    var guard = 0;
    while (!COLORS.every(function (c) { return done[c]; }) && guard++ < 100) {
      COLORS.forEach(function (c, idx) {
        if (done[c]) return;
        var move = isAI[idx] ? AI.chooseMove(board, c, pieces[c], first[c]) : AI.randomMove(board, c, pieces[c], first[c]);
        if (!move) { done[c] = true; return; }
        board = AI.applyMove(board, move.abs, c);
        pieces[c] = pieces[c].filter(function (p) { return p !== move.pid; });
        first[c] = false;
        if (!pieces[c].length) done[c] = true;
      });
    }
    return { B: AI.squaresOf(pieces.B), Y: AI.squaresOf(pieces.Y), R: AI.squaresOf(pieces.R), G: AI.squaresOf(pieces.G) };
  }
  var N = FULL ? 300 : 80, aiRem = 0, rndRem = 0;
  for (var g = 0; g < N; g++) { var isAI = [true, false, true, false]; var r = playGame(isAI); aiRem += r.B + r.R; rndRem += r.Y + r.G; }
  var aiAvg = aiRem / (N * 2), rndAvg = rndRem / (N * 2);
  console.log('  cases NON posées/joueur — IA : ' + aiAvg.toFixed(1) + ' · aléatoire : ' + rndAvg.toFixed(1) + ' (sur 89, plus bas = mieux, ' + N + ' parties)');
  if (aiAvg < rndAvg - 5) ok('IA place nettement plus de cases que l\'aléatoire'); else fail('Blokus : IA pas assez forte (' + aiAvg.toFixed(1) + ' vs ' + rndAvg.toFixed(1) + ')');
})();

// ── Mille Bornes ─────────────────────────────────────────────────────────────
// Parties complètes à 4 (2 IA, 2 aléatoires) jusqu'à 1000 km. L'IA doit gagner la
// course nettement plus souvent que sa part équitable (50 % par camp).
(function () {
  console.log('🚗 Mille Bornes');
  var AI = require(path.join(ROOT, 'ai', 'millebornes-ai.js')).MilleBornesAI;
  function rint(n) { return (Math.random() * n) | 0; }
  function view(P, p) { return { pid: p, dist: P[p].dist, rolling: P[p].rolling, hazard: P[p].hazard, limited: P[p].limited, safeties: P[p].safeties }; }
  function randomAct(P, p) {
    var me = P[p], hand = me.hand, plays = [];
    hand.forEach(function (card) {
      var c = AI.CARD[card];
      if (c.t === 'haz') { var tg = [0, 1, 2, 3].filter(function (q) { return q !== p && AI.canAttack(me, view(P, q), card); }); if (tg.length) plays.push({ type: 'play', card: card, target: tg[rint(tg.length)] }); }
      else if (AI.canPlaySelf(me, card)) plays.push({ type: 'play', card: card });
    });
    if (plays.length && Math.random() < 0.9) return plays[rint(plays.length)];
    return { type: 'discard', card: hand[rint(hand.length)] };
  }
  function playGame(isAI) {
    var deck = AI.buildDeck(), discard = [], P = [];
    for (var i = 0; i < 4; i++) P.push({ dist: 0, rolling: false, hazard: null, limited: false, safeties: [], hand: [] });
    for (var k = 0; k < 6; k++) for (var p = 0; p < 4; p++) P[p].hand.push(deck.pop());
    function draw(pp) { if (P[pp].hand.length < 7) { if (!deck.length && discard.length) { deck = discard; discard = []; for (var a = deck.length - 1; a > 0; a--) { var b = rint(a + 1); var t = deck[a]; deck[a] = deck[b]; deck[b] = t; } } if (deck.length) P[pp].hand.push(deck.pop()); } }
    var turn = 0, guard = 0, winner = -1;
    while (winner < 0 && guard++ < 1000) {
      draw(turn);
      var me = P[turn];
      var opps = [0, 1, 2, 3].filter(function (q) { return q !== turn; }).map(function (q) { return view(P, q); });
      var act = isAI[turn] ? AI.decide({ me: { dist: me.dist, rolling: me.rolling, hazard: me.hazard, limited: me.limited, safeties: me.safeties, hand: me.hand }, opponents: opps, easy: false }) : randomAct(P, turn);
      var idx = me.hand.indexOf(act.card); if (idx < 0) { idx = 0; act = { type: 'discard', card: me.hand[0] }; }
      me.hand.splice(idx, 1);
      if (act.type === 'discard') { discard.push(act.card); }
      else {
        var c = AI.CARD[act.card];
        if (c.t === 'dist') { me.dist += c.km; if (me.dist >= 1000) winner = turn; }
        else if (c.t === 'rem') { if (c.rem === 'stop') me.rolling = true; else if (c.rem === 'limit') me.limited = false; else me.hazard = null; discard.push(act.card); }
        else if (c.t === 'safe') { me.safeties.push(act.card); if (c.safe === me.hazard) me.hazard = null; if (c.safe === 'row') { me.rolling = true; me.limited = false; } }
        else if (c.t === 'haz') { var T = P[act.target]; if (c.haz === 'stop') T.rolling = false; else if (c.haz === 'limit') T.limited = true; else T.hazard = c.haz; discard.push(act.card); }
      }
      if (winner >= 0) break;
      turn = (turn + 1) % 4;
    }
    if (winner < 0) { winner = 0; for (var z = 1; z < 4; z++) if (P[z].dist > P[winner].dist) winner = z; }
    return winner;
  }
  var N = FULL ? 4000 : 1200, aiWins = 0, rndWins = 0;
  for (var g = 0; g < N; g++) { var isAI = [true, false, true, false]; var w = playGame(isAI); if (isAI[w]) aiWins++; else rndWins++; }
  console.log('  victoires (course à 1000) — IA : ' + pct(aiWins, N) + ' · aléatoire : ' + pct(rndWins, N) + ' (' + N + ' parties)');
  if (aiWins > rndWins * 1.25) ok('IA gagne la course nettement plus souvent'); else fail('Mille Bornes : IA pas assez forte (' + aiWins + ' vs ' + rndWins + ')');
})();

// ── Monopoly ─────────────────────────────────────────────────────────────────
// Parties entièrement jouées par des bots. On vérifie que le bot fait TOUJOURS
// avancer la partie (jamais bloqué) et qu'elle se termine par une faillite.
(function () {
  console.log('🏠 Monopoly');
  var ENG = require(path.join(ROOT, 'ai', 'monopoly-engine.js')).MonoEngine;
  var order = ['p0', 'p1', 'p2', 'p3'];
  var N = FULL ? 120 : 40, winners = 0, stuck = 0, totalTurns = 0;
  for (var g = 0; g < N; g++) {
    var s = ENG.initGame(order); // headless : pas de carte `players` → tous bots
    var guard = 0, lastSig = '', same = 0;
    while (!s.winner && guard++ < 8000) {
      ENG.botStep(s, 'normal');
      var cash = order.reduce(function (a, p) { return a + (s.cash[p] || 0); }, 0);
      var sig = s.phase + '|' + s.turn + '|' + (s.turnCount || 0) + '|' + cash;
      if (sig === lastSig) { if (++same > 300) { stuck++; break; } } else { same = 0; lastSig = sig; }
    }
    if (s.winner) { winners++; totalTurns += s.turnCount || 0; }
  }
  console.log('  faillites obtenues : ' + winners + '/' + N + (stuck ? ' · BLOQUÉES : ' + stuck : '') + ' · tours moyens : ' + (winners ? (totalTurns / winners).toFixed(0) : '—'));
  if (stuck === 0) ok('aucune partie bloquée (le bot fait toujours avancer le jeu)'); else fail('Monopoly : ' + stuck + ' partie(s) bloquée(s)');
  if (winners >= N * 0.7) ok('la grande majorité des parties se terminent'); else fail('Monopoly : trop peu de parties terminées (' + winners + '/' + N + ')');
})();

// ── Cluedo ───────────────────────────────────────────────────────────────────
// Parties entièrement jouées par des bots. On vérifie que le SOLVEUR DE DÉDUCTION
// (base de connaissances par contraintes) finit TOUJOURS par identifier l'enveloppe
// et accuser JUSTE (une accusation n'est gagnante que si elle est exacte).
(function () {
  console.log('🕵️ Cluedo');
  var CE = require(path.join(ROOT, 'ai', 'cluedo-engine.js')).CluedoEngine;
  var N = FULL ? 500 : 150, wins = 0, correct = 0, totalTurns = 0;
  for (var g = 0; g < N; g++) {
    var s = CE.initGame(['p0', 'p1', 'p2', 'p3']);
    var guard = 0;
    while (!s.winner && s.phase !== 'over' && guard++ < 4000) CE.botStep(s, 'hard');
    if (s.winner) {
      wins++;
      var sol = s.solution, m = CE.mem(s, s.winner);
      if (m.env.suspect === sol.suspect && m.env.arme === sol.arme && m.env.piece === sol.piece) correct++;
      totalTurns += s.turnCount || 0;
    }
  }
  console.log('  parties résolues : ' + wins + '/' + N + ' · accusations exactes : ' + correct + '/' + wins + ' · tours moyens : ' + (wins ? (totalTurns / wins).toFixed(0) : '—'));
  if (wins === N) ok('le solveur de déduction résout TOUTES les parties'); else fail('Cluedo : ' + (N - wins) + ' partie(s) non résolues');
  if (correct === wins) ok('toutes les accusations finales sont exactes'); else fail('Cluedo : ' + (wins - correct) + ' accusation(s) fausse(s)');
})();

// ── Graduation des niveaux ───────────────────────────────────────────────────
// PREUVE que facile < moyen < difficile : 4 joueurs Skyjo (difficile, moyen,
// facile, aléatoire) jouent les MÊMES manches. Score moyen, plus bas = plus fort.
// On exige que les niveaux soient correctement ordonnés.
(function () {
  console.log('📊 Graduation des niveaux (Skyjo : difficile / moyen / facile / aléatoire)');
  var AI = require(path.join(ROOT, 'ai', 'skyjo-ai.js')).SkyjoAI;
  var LEVELS = ['hard', 'normal', 'easy', 'random'];
  function rint(n) { return (Math.random() * n) | 0; }
  function arr(n, v) { var a = []; for (var i = 0; i < n; i++) a.push(v); return a; }
  function playRound() {
    var deck = AI.buildDeck(); for (var i = deck.length - 1; i > 0; i--) { var j = rint(i + 1); var t = deck[i]; deck[i] = deck[j]; deck[j] = t; }
    var P = []; for (var p = 0; p < 4; p++) { var grid = []; for (var k = 0; k < 12; k++) grid.push(deck.pop()); P.push({ grid: grid, flipped: arr(12, false), removed: arr(12, false) }); }
    var discard = [deck.pop()];
    function hiddenIdx(pl) { var a = []; for (var i = 0; i < 12; i++) if (!pl.flipped[i] && !pl.removed[i]) a.push(i); return a; }
    function visSum(pl) { var s = 0; for (var i = 0; i < 12; i++) if (pl.flipped[i] && !pl.removed[i]) s += pl.grid[i]; return s; }
    function elim(pl) { for (var col = 0; col < 4; col++) { var ix = [col, col + 4, col + 8]; if (ix.every(function (c) { return pl.flipped[c] && !pl.removed[c]; }) && pl.grid[ix[0]] === pl.grid[ix[1]] && pl.grid[ix[1]] === pl.grid[ix[2]]) { ix.forEach(function (c) { pl.removed[c] = true; }); discard.push(pl.grid[ix[0]]); } } }
    function drawCard() { if (!deck.length) { var top = discard.pop(); deck = discard; discard = [top]; for (var i = deck.length - 1; i > 0; i--) { var j = rint(i + 1); var t = deck[i]; deck[i] = deck[j]; deck[j] = t; } } return deck.pop(); }
    function oppMin(self) { var m = Infinity; for (var p2 = 0; p2 < 4; p2++) if (p2 !== self) m = Math.min(m, visSum(P[p2])); return m; }
    function randPlace(pl, from) { var hs = hiddenIdx(pl); if (from === 'pile' && hs.length && Math.random() < 0.5) return { type: 'discardFlip', idx: hs[rint(hs.length)] }; var slots = []; for (var c = 0; c < 12; c++) if (!pl.removed[c]) slots.push(c); return { type: 'replace', idx: slots[rint(slots.length)] }; }
    function decide(pl, p, phase, drawn, from) {
      if (LEVELS[p] === 'random') { if (phase === 'flip2') { var hs = hiddenIdx(pl); return { type: 'flip', idx: hs[rint(hs.length)] }; } if (drawn == null) return (Math.random() < 0.5 && discard.length) ? { type: 'takeDiscard' } : { type: 'drawPile' }; return randPlace(pl, from); }
      return AI.decide({ phase: phase, grid: pl.grid, flipped: pl.flipped, removed: pl.removed, discardTop: discard.length ? discard[discard.length - 1] : null, drawnCard: drawn, drawnFrom: from, oppMinVisibleSum: oppMin(p) }, LEVELS[p]);
    }
    for (var q = 0; q < 4; q++) for (var f = 0; f < 2; f++) { var a = decide(P[q], q, 'flip2', null, null); P[q].flipped[a.idx] = true; }
    var turn = rint(4), finisher = -1, after = 0, guard = 0;
    while (guard++ < 600) {
      var pl = P[turn], d1 = decide(pl, turn, 'turn', null, null), drawn, from;
      if (d1.type === 'takeDiscard' && discard.length) { drawn = discard.pop(); from = 'discard'; } else { drawn = drawCard(); from = 'pile'; }
      var d2 = decide(pl, turn, 'turn', drawn, from);
      if (d2.type === 'discardFlip' && from === 'pile') { discard.push(drawn); pl.flipped[d2.idx] = true; } else { var ix = d2.idx; discard.push(pl.grid[ix]); pl.grid[ix] = drawn; pl.flipped[ix] = true; }
      elim(pl);
      if (finisher < 0 && hiddenIdx(pl).length === 0) finisher = turn;
      turn = (turn + 1) % 4; if (finisher >= 0) { after++; if (after >= 3) break; }
    }
    var sc = []; for (var p3 = 0; p3 < 4; p3++) { var q2 = P[p3], s = 0; for (var c = 0; c < 12; c++) if (!q2.removed[c]) s += q2.grid[c]; sc.push(s); }
    if (finisher >= 0) { var others = sc.filter(function (_, i) { return i !== finisher; }); if (sc[finisher] >= Math.min.apply(null, others)) sc[finisher] *= 2; }
    return sc;
  }
  var N = FULL ? 2500 : 800, sum = [0, 0, 0, 0];
  for (var g = 0; g < N; g++) { var sc = playRound(); for (var p = 0; p < 4; p++) sum[p] += sc[p]; }
  var avg = sum.map(function (s) { return s / N; });
  console.log('  score moyen — difficile ' + avg[0].toFixed(1) + ' · moyen ' + avg[1].toFixed(1) + ' · facile ' + avg[2].toFixed(1) + ' · aléatoire ' + avg[3].toFixed(1) + ' (plus bas = plus fort)');
  if (avg[0] < avg[1] && avg[1] < avg[2] && avg[2] < avg[3]) ok('niveaux bien ordonnés : difficile < moyen < facile < aléatoire');
  else fail('Graduation : niveaux mal ordonnés (' + avg.map(function (x) { return x.toFixed(1); }).join(' / ') + ')');
})();

// ── Rapport ──────────────────────────────────────────────────────────────────
console.log('');
if (failures.length) {
  console.error('❌ Banc des jeux : ' + failures.length + ' seuil(s) non tenu(s) :');
  failures.forEach(function (f) { console.error('   - ' + f); });
  process.exit(1);
}
console.log('✅ Banc des jeux OK : IA légales et fortes.');
