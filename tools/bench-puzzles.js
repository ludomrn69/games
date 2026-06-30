#!/usr/bin/env node
/*
  tools/bench-puzzles.js — Tests de la brique « puzzle-course » (puzzle.js) et
  vérifs de cohérence des jeux solo (Sudoku, Queens, Tango, Zip, Sutom, Solitaire).

  On teste surtout puzzle.js car c'est le tronc commun : le DÉTERMINISME du
  générateur par graine est ce qui garantit que TOUT LE MONDE reçoit le même puzzle
  en salon. Une régression ici casserait silencieusement le mode course.

  Lancé en CI. Lancement : `node tools/bench-puzzles.js`.
*/
'use strict';
var path = require('path');
var ROOT = path.resolve(__dirname, '..');
var P = require(path.join(ROOT, 'puzzle.js')).Puzzle;
var fails = [];
function ok(m) { console.log('  ✓ ' + m); }
function bad(m) { fails.push(m); console.log('  ✗ ' + m); }
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

console.log('🧩 puzzle.js (brique puzzle-course)');

// 1) RNG déterministe : même graine → même suite (sinon le « même puzzle pour tous » casse).
(function () {
  var a = P.rng(12345), b = P.rng(12345), seqA = [], seqB = [];
  for (var i = 0; i < 200; i++) { seqA.push(a()); seqB.push(b()); }
  if (eq(seqA, seqB)) ok('rng(graine) reproductible (même graine → même suite)'); else bad('rng non déterministe');
  var c = P.rng(99999), diff = false; for (var j = 0; j < 200; j++) if (c() !== seqA[j]) { diff = true; break; }
  if (diff) ok('graines différentes → suites différentes'); else bad('rng : graines différentes donnent la même suite');
  // valeurs dans [0,1)
  var d = P.rng(7), inRange = true; for (var k = 0; k < 500; k++) { var v = d(); if (v < 0 || v >= 1) { inRange = false; break; } }
  if (inRange) ok('rng ∈ [0,1)'); else bad('rng hors [0,1)');
})();

// 2) shuffle déterministe avec une graine, et préserve les éléments.
(function () {
  function arr() { var a = []; for (var i = 0; i < 50; i++) a.push(i); return a; }
  var s1 = P.shuffle(arr(), P.rng(42)), s2 = P.shuffle(arr(), P.rng(42));
  if (eq(s1, s2)) ok('shuffle reproductible (même graine)'); else bad('shuffle non déterministe');
  var sorted = s1.slice().sort(function (a, b) { return a - b; });
  if (eq(sorted, arr())) ok('shuffle préserve les éléments'); else bad('shuffle perd/duplique des éléments');
})();

// 3) Formatage du temps.
(function () {
  var cases = [[0, '0:00'], [1000, '0:01'], [65000, '1:05'], [600000, '10:00'], [-50, '0:00']];
  var allOk = cases.every(function (c) { return P.fmtTime(c[0]) === c[1]; });
  if (allOk) ok('fmtTime correct (0:00, 1:05, 10:00…)'); else bad('fmtTime incorrect');
})();

// 4) Course : finish() note le temps, désigne le 1er, et termine quand tous ont fini.
(function () {
  var s = { order: ['a', 'b'], players: { a: {}, b: {} }, startedAt: Date.now() - 5000, winner: null, status: 'playing' };
  P.finish(s, 'a');
  if (s.winner === 'a' && s.players.a.finishedAt != null && s.status === 'playing') ok('finish : 1er = vainqueur, partie continue'); else bad('finish : 1er joueur mal géré');
  P.finish(s, 'a'); // 2e appel ne doit rien changer
  if (s.winner === 'a') ok('finish idempotent pour un même joueur'); else bad('finish non idempotent');
  P.finish(s, 'b');
  if (s.status === 'ended') ok('finish : partie terminée quand tout le monde a fini'); else bad('finish ne termine pas la partie');
})();

// 5) rankByTime : les finisseurs par temps croissant, puis les autres par progression.
(function () {
  var s = { order: ['a', 'b', 'c'], players: { a: { finishedAt: 8000 }, b: { finishedAt: 4000 }, c: {} } };
  var rank = P.rankByTime(s, function (st, pid) { return pid === 'c' ? 7 : 0; });
  if (eq(rank, ['b', 'a', 'c'])) ok('rankByTime : b(4s) < a(8s) < c(non fini)'); else bad('rankByTime mauvais ordre : ' + rank.join(','));
})();

console.log('');
if (fails.length) { console.error('❌ ' + fails.length + ' test(s) puzzle.js échoué(s) :'); fails.forEach(function (f) { console.error('   - ' + f); }); process.exit(1); }
console.log('✅ puzzle.js OK : RNG déterministe, course et classement corrects.');
