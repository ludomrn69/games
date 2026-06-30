/*
  puzzle.js — Brique commune des jeux « puzzle-course » (Sudoku, Queens, Tango,
  Zip…). Ces jeux n'ont PAS d'IA : on joue en SOLO (chronomètre, bats ton temps)
  ou en SALON où TOUT LE MONDE a EXACTEMENT le même puzzle en parallèle — le plus
  RAPIDE à le finir gagne. Cette brique fournit le tronc commun :

   • générateur ALÉATOIRE REPRODUCTIBLE à partir d'une graine (même graine → même
     puzzle pour tous les joueurs du salon) ;
   • chronomètre (formatage, temps écoulé) ;
   • cycle de course : enregistrer le temps de fin d'un joueur, désigner le 1er,
     terminer quand tout le monde a fini ; classement par temps.

  Chargé via boot.js : <script src="/boot.js" data-engine="puzzle.js"></script>.
  Utilisé par games/sudoku.html, games/queens.html, … (et testable en headless).
*/
(function (root) {
  'use strict';

  // RNG déterministe (mulberry32) : Puzzle.rng(seed)() → nombre dans [0,1).
  function rng(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s |= 0; s = s + 0x6D2B79F5 | 0;
      var t = Math.imul(s ^ s >>> 15, 1 | s);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function shuffle(a, rnd) { rnd = rnd || Math.random; for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  // Graine pseudo-aléatoire (pour fabriquer un puzzle au démarrage d'une partie).
  function seed() { return (Math.floor(Math.random() * 0x7FFFFFFF) >>> 0) || 1; }

  // Temps écoulé (ms) → « m:ss ».
  function fmtTime(ms) { var s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function elapsed(state) { return state && state.startedAt ? (Date.now() - state.startedAt) : 0; }

  // Un joueur a terminé : on note son temps, on désigne le 1er, et on termine la
  // partie quand TOUT LE MONDE a fini. À appeler dans la transaction du jeu.
  function finish(cur, pid) {
    var P = cur.players && cur.players[pid]; if (!P || P.finishedAt != null) return;
    P.finishedAt = Math.max(1, Date.now() - (cur.startedAt || Date.now())); // temps en ms
    if (!cur.winner) { cur.winner = pid; cur.firstAt = P.finishedAt; }
    var order = cur.order || [];
    if (order.every(function (p) { return cur.players[p] && cur.players[p].finishedAt != null; })) { cur.status = 'ended'; }
  }

  // Classement : ceux qui ont fini (par temps croissant) d'abord, puis les autres
  // par progression décroissante (progressFn(state, pid) → nombre, optionnel).
  function rankByTime(state, progressFn) {
    return (state.order || []).slice().sort(function (a, b) {
      var fa = state.players[a] && state.players[a].finishedAt, fb = state.players[b] && state.players[b].finishedAt;
      if (fa != null && fb != null) return fa - fb;
      if (fa != null) return -1; if (fb != null) return 1;
      return progressFn ? (progressFn(state, b) - progressFn(state, a)) : 0;
    });
  }

  root.Puzzle = { rng: rng, shuffle: shuffle, seed: seed, fmtTime: fmtTime, elapsed: elapsed, finish: finish, rankByTime: rankByTime };
})(typeof module !== 'undefined' && module.exports ? module.exports : (this.window = this.window || this));
