#!/usr/bin/env node
/*
  tools/bench-offline.js — PROUVE que le mode hors-ligne (avion) fonctionne.

  Le plus grand risque en ajoutant des fonctionnalités, c'est de casser le jeu
  SANS CONNEXION. Ce banc charge offline.js dans un DOM simulé AVEC firebase absent
  (exactement comme en avion quand le SDK ne se charge pas) et vérifie que :
   • un faux firebase/roomRef est bien créé (aucune dépendance réseau) ;
   • une partie SOLO démarre (onStart appelé, statut « playing », transaction OK) ;
   • le DÉFI DU JOUR impose bien la graine et la difficulté du jour, sans réseau.

  En CI. Lancement : `node tools/bench-offline.js`.
*/
'use strict';
var fs = require('fs'), path = require('path');
var ROOT = path.resolve(__dirname, '..');
var OFFLINE = fs.readFileSync(path.join(ROOT, 'offline.js'), 'utf8');
var DAILY = fs.readFileSync(path.join(ROOT, 'daily.js'), 'utf8');
var fails = [];
function ok(m) { console.log('  ✓ ' + m); }
function bad(m) { fails.push(m); console.log('  ✗ ' + m); }

// ── Faux DOM minimal ──────────────────────────────────────────────────────────
function fakeEl() {
  return { style: {}, _h: '', set innerHTML(v) { this._h = v; }, get innerHTML() { return this._h; }, textContent: '',
    classList: { add: function () {}, remove: function () {}, toggle: function () {} }, dataset: {}, onclick: null,
    appendChild: function () {}, remove: function () {}, setAttribute: function () {}, addEventListener: function () {},
    querySelector: function () { return null; }, querySelectorAll: function () { return []; }, parentNode: { insertBefore: function () {} } };
}

// Charge offline.js dans un environnement neuf pour une URL donnée (avion : pas de firebase).
function loadOffline(search) {
  var els = {};
  var win = {};
  var doc = {
    readyState: 'complete',
    getElementById: function (id) { return els[id] || (els[id] = fakeEl()); },
    createElement: function () { return fakeEl(); },
    addEventListener: function () {},
    querySelector: function () { return null; }, querySelectorAll: function () { return []; },
    head: { appendChild: function () {} }, body: { appendChild: function () {} }
  };
  var store = {};
  // Puzzle minimal : seed() renvoie une valeur ALÉATOIRE (comme le vrai) — le daily doit l'écraser.
  var rndSeed = 777777;
  win.Puzzle = { seed: function () { return (rndSeed = (rndSeed * 16807) % 2147483647); }, fmtTime: function (ms) { return Math.round(ms / 1000) + 's'; },
    rng: function (s) { var x = (s >>> 0) || 1; return function () { x = (x * 16807) % 2147483647; return x / 2147483647; }; },
    shuffle: function (a) { return a; }, elapsed: function () { return 1234; }, finish: function () {}, rankByTime: function () { return []; } };
  win.Lobby = {};
  // NB : window.firebase reste UNDEFINED → on simule l'avion (SDK non chargé).

  // Globals que lobby.js fournit dans le navigateur (offline.js les référence directement).
  // defineProperty : certains (navigator/localStorage) sont en lecture seule sous Node récent.
  function setG(k, v) { Object.defineProperty(global, k, { value: v, configurable: true, writable: true }); }
  setG('window', win);
  setG('document', doc);
  setG('location', { search: search, pathname: '/games/sudoku.html', origin: 'http://localhost', reload: function () {} });
  setG('localStorage', { getItem: function (k) { return store[k] || null; }, setItem: function (k, v) { store[k] = v; }, removeItem: function (k) { delete store[k]; } });
  setG('showScreen', function () {}); setG('openModal', function () {}); setG('closeModal', function () {}); setG('lbToast', function () {});
  setG('Room', { name: function () { return 'Moi'; }, emoji: function () { return '🦊'; }, color: function () { return '#000'; }, me: function () { return null; } });
  setG('Avatars', { firstFreeEmoji: function () { return '🦊'; }, pickColor: function () { return '#000'; } });

  (0, eval)(DAILY);          // daily.js → window.Daily
  setG('Daily', win.Daily);  // dans le navigateur, Daily et Puzzle sont des globals
  setG('Puzzle', win.Puzzle);
  (0, eval)(OFFLINE);        // puis offline.js
  return { win: win, els: els, store: store };
}

// cfg d'un jeu de puzzle (comme Sudoku) : onStart lit cur.difficulty + Puzzle.seed().
function puzzleCfg(captured) {
  return {
    gameKey: 'sudoku', name: 'Sudoku', minPlayers: 1, maxPlayers: 6,
    offline: { solo: true, soloMinBots: 0, soloNoBots: true, daily: true },
    bot: function () {}, offlineTurn: function () { return null; },
    onStart: function (players, cur) { captured.difficulty = cur.difficulty; captured.seed = this.P.seed(); captured.onStart = true; return { seed: captured.seed, startedAt: 1000, winner: null }; },
    onState: function () { captured.onState = true; }
  };
}

console.log('✈️  Mode hors-ligne (avion)');

// ── 1) SOLO simple (sans daily) ───────────────────────────────────────────────
(function () {
  var r = loadOffline('?mode=solo');
  if (typeof r.win.firebase === 'object' && typeof r.win.firebase.database === 'function') ok('firebase FACTICE créé quand le SDK est absent (avion)'); else bad('pas de firebase factice → planterait en avion');
  if (r.win.roomRef && typeof r.win.roomRef.transaction === 'function') ok('roomRef local avec transaction (aucun réseau)'); else bad('roomRef local absent');
  // démarre une partie solo via l'écran de réglages
  var cap = {}; var cfg = puzzleCfg(cap); cfg.P = r.win.Puzzle;
  r.win.GameRoom(cfg);
  var startBtn = r.els['off-start'];
  if (startBtn && typeof startBtn.onclick === 'function') { startBtn.onclick(); } else bad('bouton « Commencer » introuvable');
  if (cap.onStart && r.win.room && r.win.room.status === 'playing') ok('partie SOLO démarrée hors-ligne (onStart + statut playing)'); else bad('la partie solo ne démarre pas hors-ligne');
  // une transaction locale doit committer et appeler afterChange (→ onState)
  cap.onState = false;
  r.win.roomRef.transaction(function (cur) { if (!cur) return cur; cur.ping = 1; return cur; });
  if (r.win.room && r.win.room.ping === 1 && cap.onState) ok('transaction locale OK (commit + rendu) sans connexion'); else bad('transaction locale KO hors-ligne');
})();

// ── 2) DÉFI DU JOUR (offline + date) ──────────────────────────────────────────
(function () {
  var r = loadOffline('?mode=solo&daily=1');
  var cap = {}; var cfg = puzzleCfg(cap); cfg.P = r.win.Puzzle;
  r.win.GameRoom(cfg); // en daily, démarre directement (pas d'écran de réglages)
  var D = r.win.Daily;
  if (cap.onStart && r.win.room && r.win.room.status === 'playing') ok('défi du jour démarre directement, sans réseau'); else bad('le défi du jour ne démarre pas');
  if (cap.seed === D.seed('sudoku')) ok('graine imposée = graine du JOUR (même grille pour tous)'); else bad('graine du jour non appliquée (' + cap.seed + ' ≠ ' + D.seed('sudoku') + ')');
  if (cap.difficulty === D.level()) ok('difficulté imposée = difficulté du JOUR (' + D.level() + ')'); else bad('difficulté du jour non appliquée (' + cap.difficulty + ' ≠ ' + D.level() + ')');
})();

console.log('');
if (fails.length) { console.error('❌ ' + fails.length + ' test(s) hors-ligne échoué(s) :'); fails.forEach(function (f) { console.error('   - ' + f); }); process.exit(1); }
console.log('✅ Hors-ligne OK : avion, solo et défi du jour fonctionnent sans aucune connexion.');
