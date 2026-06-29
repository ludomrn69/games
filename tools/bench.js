#!/usr/bin/env node
/*
  tools/bench.js — Banc d'essai des IA (auto-jeu headless).

  But : MESURER la force des bots de recherche (Puissance 4, Morpion) en les faisant
  jouer les uns contre les autres, et SERVIR DE GARDE-FOU EN CI (taux de victoire
  attendus). Réutilise EXACTEMENT les cœurs d'IA livrés au site (p4-ai.js,
  morpion-ai.js) — pas de logique dupliquée, donc le benchmark reflète le vrai jeu.

  Lancement : `node tools/bench.js`  (rapide) · `node tools/bench.js --full` (plus de parties).
  Sortie : tableau de taux de victoire + échec si un seuil n'est pas tenu.
*/
'use strict';
var path = require('path');
var ROOT = path.resolve(__dirname, '..');
var P4 = require(path.join(ROOT, 'p4-ai.js')).P4AI;
var MP = require(path.join(ROOT, 'morpion-ai.js')).MorpionAI;

var FULL = process.argv.indexOf('--full') >= 0;
var failures = [];

// ── Puissance 4 ────────────────────────────────────────────────────────────
function p4Empty() { return '.'.repeat(42); }
function p4Cols(b) { var r = []; for (var c = 0; c < 7; c++) if (b[c] === '.') r.push(c); return r; }
function p4RandomCol(b) { var v = p4Cols(b); return v[Math.floor(Math.random() * v.length)]; }
// Joue une partie ; pickA/pickB(board, me, opp) → colonne. Renvoie 'A' | 'B' | 'draw'.
function p4Play(pickA, pickB) {
  var b = p4Empty(), marks = ['0', '1'], turn = 0;
  for (var ply = 0; ply < 42; ply++) {
    var me = marks[turn], opp = marks[1 - turn];
    var col = (turn === 0 ? pickA : pickB)(b, me, opp);
    var d = P4.drop(b, col, me); if (!d) return 'draw';
    if (P4.winAt(d.b, d.idx, me)) return turn === 0 ? 'A' : 'B';
    b = d.b; turn = 1 - turn;
  }
  return 'draw';
}
function p4Match(label, pickA, pickB, n, expect) {
  var w = { A: 0, B: 0, draw: 0 };
  for (var i = 0; i < n; i++) w[p4Play(pickA, pickB)]++;
  report('Puissance4', label, w, n, expect);
}

// ── Morpion ────────────────────────────────────────────────────────────────
function mpEmpty() { return '.........'; }
function mpCount(b, m) { var n = 0; for (var i = 0; i < 9; i++) if (b[i] === m) n++; return n; }
function mpApply(b, m, mv) { var a = b.split(''); if (mv.f != null) { a[mv.f] = '.'; a[mv.t] = m; } else a[mv.i] = m; return a.join(''); }
function mpRandom(b, m) {
  var emp = [], own = [], i; for (i = 0; i < 9; i++) { if (b[i] === '.') emp.push(i); else if (b[i] === m) own.push(i); }
  if (mpCount(b, m) < 3) return emp.length ? { i: emp[(Math.random() * emp.length) | 0] } : null;
  if (!own.length || !emp.length) return null;
  return { f: own[(Math.random() * own.length) | 0], t: emp[(Math.random() * emp.length) | 0] };
}
// pickX(board, me, opp) → coup. Limite de coups (le jeu peut tourner en rond) → nulle.
function mpPlay(pickA, pickB, maxPlies) {
  var b = mpEmpty(), marks = ['0', '1'], turn = 0;
  for (var ply = 0; ply < (maxPlies || 60); ply++) {
    var me = marks[turn], opp = marks[1 - turn];
    var mv = (turn === 0 ? pickA : pickB)(b, me, opp);
    if (!mv) return 'draw';
    b = mpApply(b, me, mv);
    if (MP.winLineFor(b, me)) return turn === 0 ? 'A' : 'B';
    turn = 1 - turn;
  }
  return 'draw';
}
function mpMatch(label, pickA, pickB, n, expect) {
  var w = { A: 0, B: 0, draw: 0 };
  for (var i = 0; i < n; i++) w[mpPlay(pickA, pickB)]++;
  report('Morpion', label, w, n, expect);
}

// ── Rapport + seuils ───────────────────────────────────────────────────────
function pct(x, n) { return (100 * x / n).toFixed(0) + '%'; }
function report(game, label, w, n, expect) {
  var line = '  [' + game + '] ' + label + ' → A ' + pct(w.A, n) + ' · nul ' + pct(w.draw, n) + ' · B ' + pct(w.B, n) + ' (' + n + ' parties)';
  console.log(line);
  if (expect) {
    if (expect.minA != null && w.A / n < expect.minA) failures.push(label + ' : A=' + pct(w.A, n) + ' < attendu ' + (expect.minA * 100) + '%');
    if (expect.maxBLoss != null && w.B / n > expect.maxBLoss) failures.push(label + ' : B=' + pct(w.B, n) + ' > toléré ' + (expect.maxBLoss * 100) + '%');
  }
}

// Adversaires. La profondeur « difficile » du benchmark est volontairement un peu
// plus basse en mode rapide (CI) qu'en jeu réel (9) : déjà dominante, et bien plus
// rapide. `--full` la pousse à 9 sur beaucoup de parties.
var HARD4_DEPTH = FULL ? 9 : 7;
var rnd4 = function (b) { return p4RandomCol(b); };
var hard4 = function (b, me, opp) { return P4.bestColumn(b, me, opp, HARD4_DEPTH); };
var easy4 = function (b, me, opp) { return P4.bestColumn(b, me, opp, 2); };
var rndM = function (b, m) { return mpRandom(b, m); };
var hardM = function (b, me, opp) { return MP.bestMove(b, me, opp, 10); };
var easyM = function (b, me, opp) { return MP.bestMove(b, me, opp, 2); };

console.log('🤖 Banc d\'essai des IA' + (FULL ? ' (complet)' : '') + '\n');
var N4 = FULL ? 200 : 24, NM = FULL ? 200 : 60;

// Puissance 4 : « difficile » doit écraser l'aléatoire et ne jamais perdre contre lui.
p4Match('difficile (A) vs aléatoire (B)', hard4, rnd4, N4, { minA: 0.9, maxBLoss: 0.02 });
p4Match('difficile (A) vs facile (B)', hard4, easy4, FULL ? 60 : 10, { minA: 0.6 });

// Morpion : « difficile » ne doit jamais perdre contre l'aléatoire.
mpMatch('difficile (A) vs aléatoire (B)', hardM, rndM, NM, { maxBLoss: 0.0 });
mpMatch('difficile (A) vs facile (B)', hardM, easyM, Math.max(20, NM / 3 | 0), { maxBLoss: 0.05 });

console.log('');
if (failures.length) {
  console.error('❌ Benchmark : seuils non tenus :');
  failures.forEach(function (f) { console.error('   - ' + f); });
  process.exit(1);
}
console.log('✅ Benchmark OK : les bots « difficile » dominent comme attendu.');
