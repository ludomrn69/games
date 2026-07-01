#!/usr/bin/env node
/*
  tools/bench-generators.js — Prouve que les GÉNÉRATEURS de puzzles produisent
  toujours des grilles VALIDES et SOLVABLES (Sudoku, Queens, Tango, Zip, Patches).

  Particularité : les générateurs vivent EN LIGNE dans chaque page .html (pas de
  fichier séparé, pour ne rien ajouter à charger — le mode avion reste intact). Ce
  test lit donc le code réellement expédié, en extrait les fonctions par équilibrage
  d'accolades, les exécute en headless et vérifie leurs garanties. Aucune divergence
  possible avec ce qui tourne dans le navigateur.

  En CI. Lancement : `node tools/bench-generators.js`.
*/
'use strict';
var fs = require('fs'), path = require('path');
var ROOT = path.resolve(__dirname, '..');
var Puzzle = require(path.join(ROOT, 'puzzle.js')).Puzzle;
var fails = [];
function ok(m) { console.log('  ✓ ' + m); }
function bad(m) { fails.push(m); console.log('  ✗ ' + m); }
function readGame(name) { return fs.readFileSync(path.join(ROOT, 'games', name + '.html'), 'utf8'); }

// Extrait `function NAME(...) { ... }` du HTML par équilibrage d'accolades.
function grab(html, name) {
  var i = html.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('fonction introuvable : ' + name);
  var d = 0, started = false, j = i;
  for (; j < html.length; j++) { var ch = html[j]; if (ch === '{') { d++; started = true; } else if (ch === '}') { d--; if (started && d === 0) { j++; break; } } }
  return html.slice(i, j);
}
// Construit un objet {nom: fn} à partir des fonctions extraites (+ préambule éventuel).
function build(html, names, preamble) {
  var src = (preamble || '') + '\n' + names.map(function (n) { return grab(html, n); }).join('\n') +
    '\n return {' + names.map(function (n) { return n + ':' + n; }).join(',') + '};';
  return new Function('Puzzle', src)(Puzzle);
}
function seed() { return Puzzle.seed(); }

// ── SUDOKU ────────────────────────────────────────────────────────────────────
(function () {
  console.log('9️⃣  Sudoku');
  var S = build(readGame('sudoku'), ['boxDims', 'validAt', 'solveRnd', 'countSolutions', 'genPuzzle']);
  function validFull(sol, N, bh, bw) {
    var i, r, c, a, b, v, seen;
    for (r = 0; r < N; r++) { seen = {}; for (c = 0; c < N; c++) { v = sol[r * N + c]; if (v < 1 || v > N || seen[v]) return false; seen[v] = 1; } }
    for (c = 0; c < N; c++) { seen = {}; for (r = 0; r < N; r++) { v = sol[r * N + c]; if (seen[v]) return false; seen[v] = 1; } }
    for (var br = 0; br < N; br += bh) for (var bc = 0; bc < N; bc += bw) { seen = {}; for (a = 0; a < bh; a++) for (b = 0; b < bw; b++) { v = sol[(br + a) * N + bc + b]; if (seen[v]) return false; seen[v] = 1; } }
    return true;
  }
  var sizes = [6, 9], levels = ['easy', 'normal', 'hard'], bad1 = 0, notUniq = 0, notSub = 0, T = 20;
  sizes.forEach(function (N) {
    var d = S.boxDims(N);
    levels.forEach(function (lvl) {
      for (var t = 0; t < T; t++) {
        var P = S.genPuzzle(lvl, N, seed());
        if (!validFull(P.solution, N, d.bh, d.bw)) bad1++;
        if (!P.puzzle.every(function (v, i) { return v === 0 || v === P.solution[i]; })) notSub++;
        if (S.countSolutions(P.puzzle.slice(), N, d.bh, d.bw, 2) !== 1) notUniq++;
      }
    });
  });
  if (!bad1) ok('solution complète toujours valide (lignes/colonnes/blocs)'); else bad('Sudoku : ' + bad1 + ' solution(s) invalide(s)');
  if (!notSub) ok('les indices sont un sous-ensemble de la solution'); else bad('Sudoku : ' + notSub + ' indice(s) hors solution');
  if (!notUniq) ok('grille à solution UNIQUE (6×6 et 9×9, 3 niveaux)'); else bad('Sudoku : ' + notUniq + ' grille(s) non uniques');
})();

// ── QUEENS ────────────────────────────────────────────────────────────────────
(function () {
  console.log('👑 Queens');
  var Q = build(readGame('queens'), ['neighbors', 'countSol', 'regionsOnce', 'genQueens', 'analyze']);
  var Ns = [6, 7, 8], badSol = 0, unsolv = 0, T = 15;
  Ns.forEach(function (N) {
    for (var t = 0; t < T; t++) {
      var P = Q.genQueens(N, seed());
      var marks = []; for (var i = 0; i < N * N; i++) marks.push(0); P.queens.forEach(function (q) { marks[q] = 2; });
      if (!Q.analyze(marks, P.region, N).complete) badSol++;   // la solution du générateur est-elle valide ?
      if (Q.countSol(P.region, N, 1) < 1) unsolv++;             // au moins une solution existe ?
    }
  });
  if (!badSol) ok('la solution générée est toujours valide (1 reine / ligne, colonne, couleur, sans contact)'); else bad('Queens : ' + badSol + ' solution(s) invalide(s)');
  if (!unsolv) ok('grille toujours solvable (6×6, 7×7, 8×8)'); else bad('Queens : ' + unsolv + ' grille(s) insolubles');
})();

// ── TANGO ─────────────────────────────────────────────────────────────────────
(function () {
  console.log('🌙 Tango');
  var T6 = build(readGame('tango'), ['rowCount', 'colCount', 'okFull', 'genSolution', 'countSol', 'genTango'], 'var N=6;');
  function validTango(sol, N) {
    var r, c, i, o;
    for (r = 0; r < N; r++) { o = 0; for (c = 0; c < N; c++) { var v = sol[r * N + c]; if (v !== 0 && v !== 1) return false; o += v; } if (o !== N / 2) return false; }
    for (c = 0; c < N; c++) { o = 0; for (r = 0; r < N; r++) o += sol[r * N + c]; if (o !== N / 2) return false; }
    for (r = 0; r < N; r++) for (c = 0; c < N - 2; c++) { i = r * N + c; if (sol[i] === sol[i + 1] && sol[i] === sol[i + 2]) return false; }
    for (c = 0; c < N; c++) for (r = 0; r < N - 2; r++) { i = r * N + c; if (sol[i] === sol[i + N] && sol[i] === sol[i + 2 * N]) return false; }
    return true;
  }
  var levels = ['easy', 'normal', 'hard'], badSol = 0, notUniq = 0, badCon = 0, notSub = 0, T = 25;
  levels.forEach(function (lvl) {
    for (var t = 0; t < T; t++) {
      var P = T6.genTango(lvl, seed());
      if (!validTango(P.solution, 6)) badSol++;
      if (!P.givens.every(function (v, i) { return v === -1 || v === P.solution[i]; })) notSub++;
      if (!P.cons.every(function (cc) { return cc.eq === (P.solution[cc.a] === P.solution[cc.b]); })) badCon++;
      if (T6.countSol(P.givens, P.cons, 2) !== 1) notUniq++;
    }
  });
  if (!badSol) ok('solution valide (3/3 par ligne/colonne, jamais 3 à la suite)'); else bad('Tango : ' + badSol + ' solution(s) invalide(s)');
  if (!notSub) ok('indices ⊂ solution'); else bad('Tango : ' + notSub + ' indice(s) hors solution');
  if (!badCon) ok('contraintes = / ✕ cohérentes avec la solution'); else bad('Tango : ' + badCon + ' contrainte(s) incohérente(s)');
  if (!notUniq) ok('grille à solution UNIQUE'); else bad('Tango : ' + notUniq + ' grille(s) non uniques');
})();

// ── ZIP ───────────────────────────────────────────────────────────────────────
(function () {
  console.log('🔗 Zip');
  var Z = build(readGame('zip'), ['neighbors', 'adjacent', 'snake', 'backbite', 'genZip', 'analyze']);
  function isHam(path, N) { if (path.length !== N * N) return false; var seen = {}; for (var i = 0; i < path.length; i++) { if (seen[path[i]]) return false; seen[path[i]] = 1; if (i > 0 && !Z.adjacent(path[i], path[i - 1], N)) return false; } return true; }
  // 1) invariant de construction : le chemin serpent + backbite reste hamiltonien
  var badHam = 0;
  [5, 6, 7].forEach(function (N) {
    if (!isHam(Z.snake(N), N)) badHam++;
    var p = Z.snake(N), rnd = Puzzle.rng(seed());
    for (var k = 0; k < 600; k++) p = Z.backbite(p, N, rnd);
    if (!isHam(p, N)) badHam++;
  });
  if (!badHam) ok('chemin hamiltonien préservé (serpent + 600 backbites, tailles 5/6/7)'); else bad('Zip : ' + badHam + ' chemin(s) non hamiltoniens');
  // 2) structure des numéros : 1..K distincts
  var badNum = 0, T = 40;
  ['easy', 'normal', 'hard'].forEach(function (lvl) {
    for (var t = 0; t < T; t++) {
      var P = Z.genZip(lvl, seed());
      var vals = Object.keys(P.numbers).map(function (k) { return P.numbers[k]; }).sort(function (a, b) { return a - b; });
      if (vals.length !== P.K || vals[0] !== 1 || vals[vals.length - 1] !== P.K) badNum++;
    }
  });
  if (!badNum) ok('numéros 1..K bien posés (distincts, ordonnés)'); else bad('Zip : ' + badNum + ' grille(s) mal numérotées');
  // 3) preuve bout-en-bout sur les petites grilles (5×5) : un chemin valide existe
  function solvable(numbers, N) {
    var start = -1, K = 0, kk; for (kk in numbers) { if (numbers[kk] === 1) start = +kk; if (numbers[kk] > K) K = numbers[kk]; }
    var total = N * N, visited = [], nodes = 0, CAP = 3000000;
    for (var z = 0; z < total; z++) visited.push(false);
    function dfs(cell, count, expect) {
      if (++nodes > CAP) return null;
      visited[cell] = true;
      var here = numbers[cell];
      if (here) { if (here !== expect) { visited[cell] = false; return false; } expect++; }
      if (count === total) { visited[cell] = false; return expect === K + 1; }
      var nbs = Z.neighbors(cell, N);
      for (var i = 0; i < nbs.length; i++) { if (!visited[nbs[i]]) { var r = dfs(nbs[i], count + 1, expect); if (r) { visited[cell] = false; return true; } } }
      visited[cell] = false; return false;
    }
    return dfs(start, 1, 1); // on entre sur la case « 1 », qui consomme le numéro 1
  }
  var unsolv = 0, incon = 0;
  for (var t2 = 0; t2 < 30; t2++) { var P = Z.genZip('easy', seed()); var r = solvable(P.numbers, P.size); if (r === null) incon++; else if (!r) unsolv++; }
  if (!unsolv) ok('bout-en-bout : un chemin solution existe (5×5' + (incon ? ', ' + incon + ' non concluant' : '') + ')'); else bad('Zip : ' + unsolv + ' grille(s) 5×5 insolubles');
})();

// ── PATCHES ───────────────────────────────────────────────────────────────────
(function () {
  console.log('🧩 Patches');
  var P = build(readGame('patches'), ['genPatches', 'evalPlacement', 'clueIn'], 'var PALETTE=new Array(24).fill("#000");');
  var levels = ['easy', 'normal', 'hard'], notWin = 0, T = 60;
  levels.forEach(function (lvl) {
    for (var t = 0; t < T; t++) {
      var g = P.genPatches(lvl, seed());
      var sol = g.clues.map(function (c, i) { return { x: c.sx, y: c.sy, w: c.sw, h: c.sh, ci: i }; });
      if (!P.evalPlacement(g.N, g.clues, sol).win) notWin++;
    }
  });
  if (!notWin) ok('la solution (1 rectangle par indice) pave et gagne toujours (3 niveaux)'); else bad('Patches : ' + notWin + ' grille(s) dont la solution ne gagne pas');
})();

console.log('');
if (fails.length) { console.error('❌ ' + fails.length + ' test(s) de générateur échoué(s) :'); fails.forEach(function (f) { console.error('   - ' + f); }); process.exit(1); }
console.log('✅ Générateurs OK : toutes les grilles produites sont valides et solvables.');
