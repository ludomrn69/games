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
var P4 = require(path.join(ROOT, 'ai', 'p4-ai.js')).P4AI;
var MP = require(path.join(ROOT, 'ai', 'morpion-ai.js')).MorpionAI;
var OT = require(path.join(ROOT, 'ai', 'reversi-ai.js')).ReversiAI;
var DA = require(path.join(ROOT, 'ai', 'dames-ai.js')).DamesAI;

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

// ── Reversi / Reversi ──────────────────────────────────────────────────────
function otStart() { var a = '.'.repeat(64).split(''); a[27] = '1'; a[28] = '0'; a[35] = '0'; a[36] = '1'; return a.join(''); }
function otCount(b, m) { var n = 0; for (var i = 0; i < 64; i++) if (b[i] === m) n++; return n; }
function otRandom(b, me) { var lm = OT.legalMoves(b, me); return lm.length ? lm[(Math.random() * lm.length) | 0] : -1; }
// pickX(board, me, opp) → index (ou -1 = passe). A = '0' (noir, commence), B = '1'.
function otPlay(pickA, pickB) {
  var b = otStart(), marks = ['0', '1'], turn = 0, passes = 0, guard = 0;
  while (guard++ < 80) {
    var me = marks[turn], opp = marks[1 - turn];
    var lm = OT.legalMoves(b, me);
    if (!lm.length) { if (++passes >= 2) break; turn = 1 - turn; continue; }
    passes = 0;
    var mv = (turn === 0 ? pickA : pickB)(b, me, opp);
    if (mv < 0 || OT.wouldFlip(b, mv, me).length === 0) mv = lm[0];
    b = OT.applyMove(b, mv, me);
    turn = 1 - turn;
  }
  var n0 = otCount(b, '0'), n1 = otCount(b, '1');
  return n0 === n1 ? 'draw' : (n0 > n1 ? 'A' : 'B');
}
function otMatch(label, pickA, pickB, n, expect) {
  var w = { A: 0, B: 0, draw: 0 };
  for (var i = 0; i < n; i++) w[otPlay(pickA, pickB)]++;
  report('Reversi', label, w, n, expect);
}

// ── Dames / Checkers ───────────────────────────────────────────────────────
function daMat(b) { var c = DA.counts(b); return c.w + c.b + c.W + c.B; }
function daRandom(b, side) { var m = DA.legalMoves(b, side); return m.length ? m[(Math.random() * m.length) | 0] : null; }
// A = blanc ('w', commence), B = noir ('b'). En cas de blocage par la règle des
// 60 demi-coups sans capture, on tranche par la DOMINATION matérielle : mater un
// roi seul qui fuit n'est pas l'objet du banc (et il n'y a pas de telle limite en
// vrai jeu) ; ce qui mesure la force, c'est d'écraser au matériel. Un écart ≥ 3
// pièces compte comme victoire, sinon nulle.
function daDominance(b) {
  var c = DA.counts(b), white = c.w + c.W, black = c.b + c.B;
  if (white - black >= 3) return 'A';
  if (black - white >= 3) return 'B';
  return 'draw';
}
function daPlay(pickA, pickB) {
  var b = DA.startBoard(), side = 'w', plies = 0, sinceCap = 0, lastMat = daMat(b);
  while (plies++ < 120) {
    var mv = (side === 'w') ? pickA(b, 'w', 'b') : pickB(b, 'b', 'w');
    if (!mv) return side === 'w' ? 'B' : 'A'; // bloqué → l'autre gagne
    b = DA.applyMove(b, mv, side);
    var m = daMat(b);
    sinceCap = (m < lastMat) ? 0 : sinceCap + 1; lastMat = m;
    // Partie décidée (écart ≥ 5) → inutile de jouer la longue traque du roi seul.
    var c = DA.counts(b), gap = (c.w + c.W) - (c.b + c.B);
    if (gap >= 4) return 'A'; if (gap <= -4) return 'B';
    if (sinceCap >= 30) return daDominance(b);
    side = DA.other(side);
  }
  return daDominance(b);
}
function daMatch(label, pickA, pickB, n, expect) {
  var w = { A: 0, B: 0, draw: 0 };
  for (var i = 0; i < n; i++) w[daPlay(pickA, pickB)]++;
  report('Dames', label, w, n, expect);
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
var hardM = function (b, me, opp) { return MP.bestMove(b, me, opp, FULL ? 10 : 7); };
var easyM = function (b, me, opp) { return MP.bestMove(b, me, opp, 2); };
var HARDO_DEPTH = FULL ? 7 : 4;
var rndO = function (b, me) { return otRandom(b, me); };
var hardO = function (b, me, opp) { return OT.bestMove(b, me, opp, HARDO_DEPTH); };
var easyO = function (b, me, opp) { return OT.bestMove(b, me, opp, 1); };
var HARDD_DEPTH = FULL ? 7 : 4;
var rndD = function (b, side) { return daRandom(b, side); };
var hardD = function (b, me, opp) { return DA.bestMove(b, me, opp, HARDD_DEPTH); };
var easyD = function (b, me, opp) { return DA.bestMove(b, me, opp, 2); };

console.log('🤖 Banc d\'essai des IA' + (FULL ? ' (complet)' : '') + '\n');
var N4 = FULL ? 200 : 24, NM = FULL ? 200 : 40, NO = FULL ? 100 : 12, ND = FULL ? 40 : 10;

// Puissance 4 : « difficile » doit écraser l'aléatoire et ne jamais perdre contre lui.
p4Match('difficile (A) vs aléatoire (B)', hard4, rnd4, N4, { minA: 0.9, maxBLoss: 0.02 });
p4Match('difficile (A) vs facile (B)', hard4, easy4, FULL ? 60 : 10, { minA: 0.6 });

// Morpion : « difficile » ne doit jamais perdre contre l'aléatoire.
mpMatch('difficile (A) vs aléatoire (B)', hardM, rndM, NM, { maxBLoss: 0.0 });
mpMatch('difficile (A) vs facile (B)', hardM, easyM, Math.max(20, NM / 3 | 0), { maxBLoss: 0.05 });

// Reversi : « difficile » doit largement dominer l'aléatoire et le « facile ».
otMatch('difficile (A) vs aléatoire (B)', hardO, rndO, NO, { minA: 0.9, maxBLoss: 0.05 });
otMatch('difficile (A) vs facile (B)', hardO, easyO, Math.max(16, NO / 2 | 0), { minA: 0.6 });

// Dames : « difficile » domine l'aléatoire au matériel et ne perd JAMAIS (ni contre
// l'aléatoire, ni contre « facile »). Mater un roi seul qui fuit n'est pas l'objet
// du banc : on mesure la domination (cf. daDominance / arrêt anticipé sur écart).
daMatch('difficile (A) vs aléatoire (B)', hardD, rndD, ND, { minA: 0.55, maxBLoss: 0.0 });
daMatch('difficile (A) vs facile (B)', hardD, easyD, FULL ? 20 : 5, { maxBLoss: 0.0 });

console.log('');
if (failures.length) {
  console.error('❌ Benchmark : seuils non tenus :');
  failures.forEach(function (f) { console.error('   - ' + f); });
  process.exit(1);
}
console.log('✅ Benchmark OK : les bots « difficile » dominent comme attendu.');
