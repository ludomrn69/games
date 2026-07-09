#!/usr/bin/env node
/*
  tools/bench-openfront.js — Banc d'essai de l'IA d'OpenFront (auto-jeu headless).

  Réutilise le cœur de simulation livré (ai/openfront-engine.js) — même logique que
  la page — et le fait tourner en accéléré pour VÉRIFIER, en CI :
   1. Terminaison : chaque partie se résout (survivant unique, domination, ou
      stalemate entre alliés) sous un plafond de temps — pas de boucle infinie.
   2. Force de la difficulté : à personnalités identiques, les nations « difficile »
      écrasent nettement les « facile » (territoire + victoires).
   3. Robustesse : aucune exception sur des centaines de parties seedées.

  Lancement : `node tools/bench-openfront.js`  ·  `--full` pour plus de parties.
*/
'use strict';
var path = require('path');
var ENG = require(path.join(__dirname, '..', 'ai', 'openfront-engine.js'));
var FULL = process.argv.indexOf('--full') >= 0;
var failures = [];
var W = 120, H = 74;

function pct(a, b) { return Math.round(a / Math.max(1, b) * 100); }
function mkNations(diffs, persos) { return diffs.map(function (d, i) { return { perso: persos[i], diff: d }; }); }

// Fait tourner une partie jusqu'à résolution (ou plafond). Renvoie l'état final.
function runToEnd(seed, diffs, persos, cap) {
  var g = ENG.createGame({ seed: seed, w: W, h: H, nations: mkNations(diffs, persos) });
  var land = g.landTotal(), resolved = false, t = 0, lastSig = -1, stall = 0;
  for (; t < cap; t++) {
    g.step(0.1);
    var al = g.aliveIds();
    if (al.length <= 1) { resolved = true; break; }
    var lead = 0, ownedTot = 0; for (var a = 0; a < al.length; a++) { var tt = g.tilesOf(al[a]); ownedTot += tt; if (tt > lead) lead = tt; }
    // domination : le leader tient >70 % du territoire conquis
    if (ownedTot > 0 && lead / ownedTot > 0.7) { resolved = true; break; }
    // un seul bloc d'alliance survit → guerre finie (ils ne se combattront pas)
    if (t > 150 && allianceComponents(g, al) === 1) { resolved = true; break; }
    // carte figée : plus aucun changement de territoire depuis ~30 s → réglé
    var sig = lead * 100003 + ownedTot;
    if (sig === lastSig) { if (++stall > 300) { resolved = true; break; } } else { stall = 0; lastSig = sig; }
  }
  return { g: g, ticks: t, resolved: resolved, land: land };
}
// Nombre de composantes connexes du graphe d'alliances parmi les survivants.
function allianceComponents(g, ids) {
  var P = g.players, parent = {}; ids.forEach(function (i) { parent[i] = i; });
  function find(x) { while (parent[x] !== x) x = parent[x] = parent[parent[x]]; return x; }
  ids.forEach(function (i) { for (var a in P[i].allies) if (parent[a] != null) parent[find(i)] = find(+a); });
  var roots = {}; ids.forEach(function (i) { roots[find(i)] = 1; });
  return Object.keys(roots).length;
}

// Territoire à un horizon fixe (comparaison stable difficile vs facile).
function runToHorizon(seed, diffs, persos, ticks) {
  var g = ENG.createGame({ seed: seed, w: W, h: H, nations: mkNations(diffs, persos) });
  for (var t = 0; t < ticks; t++) g.step(0.1);
  return g;
}

// ── 1. Terminaison + robustesse ────────────────────────────────────────────
(function () {
  var games = FULL ? 60 : 24, unresolved = 0, crashed = 0, maxTicks = 3500;
  for (var s = 0; s < games; s++) {
    var n = 4 + (s % 5), diffs = [], persos = [];
    for (var i = 0; i < n; i++) { diffs.push(['easy', 'normal', 'hard'][(s + i) % 3]); persos.push(ENG.PERSOS[(s + i) % ENG.PERSOS.length]); }
    try { var r = runToEnd(1000 + s * 37, diffs, persos, maxTicks); if (!r.resolved) unresolved++; }
    catch (e) { crashed++; console.error('  crash seed ' + (1000 + s * 37) + ' : ' + e.message); }
  }
  console.log('Terminaison : ' + (games - unresolved) + '/' + games + ' parties résolues · ' + crashed + ' plantage(s).');
  if (crashed > 0) failures.push('Terminaison : ' + crashed + ' partie(s) ont planté.');
  if (unresolved > games * 0.1) failures.push('Terminaison : trop de parties non résolues (' + unresolved + '/' + games + ').');
})();

// ── 2. Difficile écrase facile (personnalités identiques) ──────────────────
(function () {
  var games = FULL ? 50 : 24, ticks = 1800;
  var HARD = 0, EASY = 0, hardWins = 0, easyWins = 0;
  var diffs = ['hard', 'hard', 'hard', 'easy', 'easy', 'easy'];
  var persos = ['balanced', 'balanced', 'balanced', 'balanced', 'balanced', 'balanced'];
  for (var s = 0; s < games; s++) {
    var g = runToHorizon(4000 + s * 101, diffs, persos, ticks);
    var hb = 0, eb = 0, bestId = 1, bestT = -1;
    for (var id = 1; id <= 6; id++) { var t = g.tilesOf(id); if (id <= 3) hb += t; else eb += t; if (t > bestT) { bestT = t; bestId = id; } }
    HARD += hb; EASY += eb; if (bestId <= 3) hardWins++; else easyWins++;
  }
  var ratio = HARD / Math.max(1, EASY);
  console.log('Difficulté : territoire cumulé HARD ' + HARD + ' vs EASY ' + EASY + ' (x' + ratio.toFixed(2) + ') · victoires ' + hardWins + '–' + easyWins + '.');
  if (ratio < 1.3) failures.push('Difficulté : « difficile » ne domine pas assez « facile » (x' + ratio.toFixed(2) + ' < 1.3).');
  if (hardWins <= easyWins) failures.push('Difficulté : « difficile » ne gagne pas la majorité des parties (' + hardWins + '–' + easyWins + ').');
})();

// ── 3. Sanité des personnalités (info) ─────────────────────────────────────
(function () {
  var games = FULL ? 40 : 18, ticks = 1600, sum = {}, cnt = {};
  ENG.PERSOS.forEach(function (p) { sum[p] = 0; cnt[p] = 0; });
  for (var s = 0; s < games; s++) {
    var persos = ENG.PERSOS.slice();
    var g = runToHorizon(9000 + s * 53, ['normal', 'normal', 'normal', 'normal', 'normal'], persos, ticks);
    for (var id = 1; id <= 5; id++) { var p = persos[id - 1]; sum[p] += g.tilesOf(id); cnt[p]++; }
  }
  var line = ENG.PERSOS.map(function (p) { return p + ' ' + Math.round(sum[p] / Math.max(1, cnt[p])); }).join(' · ');
  console.log('Personnalités (territoire moyen) : ' + line + '.');
  ENG.PERSOS.forEach(function (p) { if (sum[p] === 0) failures.push('Personnalité « ' + p + ' » ne conquiert jamais rien (bug ?).'); });
})();

// ── 4. Monotonie de la difficulté (facile < normal < difficile < insane) ────
(function () {
  var games = FULL ? 30 : 14, ticks = 1600, levels = ['easy', 'normal', 'hard', 'insane'], avg = {};
  levels.forEach(function (lv) {
    var tot = 0;
    for (var s = 0; s < games; s++) {
      var diffs = [lv, lv, lv, lv], persos = ['balanced', 'balanced', 'balanced', 'balanced'];
      var g = runToHorizon(20000 + s * 61 + lv.length, diffs, persos, ticks);
      for (var id = 1; id <= 4; id++) tot += g.tilesOf(id);
    }
    avg[lv] = Math.round(tot / games);
  });
  console.log('Monotonie difficulté (territoire moyen/partie) : ' + levels.map(function (l) { return l + ' ' + avg[l]; }).join(' < '));
  if (!(avg.easy < avg.normal && avg.normal < avg.hard && avg.hard <= avg.insane * 1.02))
    failures.push('Monotonie : le territoire devrait croître avec la difficulté (' + levels.map(function (l) { return avg[l]; }).join(' / ') + ').');
})();

if (failures.length) { console.error('\n❌ OpenFront bench : ' + failures.length + ' échec(s) :\n - ' + failures.join('\n - ')); process.exit(1); }
console.log('\n✅ OpenFront bench OK.');
