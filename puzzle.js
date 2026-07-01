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

  // ── Aide au joueur (puzzles) : boutons « Annuler » + « Indice » PARTAGÉS ──────
  // Chaque jeu fournit des rappels : snapshot() (copie de SON état éditable),
  // restore(snap) (transaction qui réécrit cet état), hint() (transaction qui révèle
  // UN coup correct — facultatif). Le helper gère la pile d'annulation et pose deux
  // petits boutons dans le conteneur d'en-tête `mount`. 100 % hors-ligne (aucun réseau).
  //   var A = Puzzle.assist({ mount:'su-actions', canEdit, snapshot, restore, hint });
  //   A.record();  // à appeler AVANT de valider un coup (empile l'état d'avant)
  //   A.reset();   // à chaque nouvelle partie
  function assist(opts) {
    opts = opts || {};
    var stack = [], undoBtn = null, hintBtn = null, built = false;
    function canEdit() { return !opts.canEdit || !!opts.canEdit(); }
    function build() {
      if (built || typeof document === 'undefined') return;
      var mount = document.getElementById(opts.mount);
      if (!mount) return;
      built = true;
      undoBtn = document.createElement('button');
      undoBtn.type = 'button'; undoBtn.className = 'game-restart-btn'; undoBtn.title = 'Annuler'; undoBtn.textContent = '↶';
      undoBtn.onclick = doUndo;
      mount.insertBefore(undoBtn, mount.firstChild);
      if (opts.hint) {
        hintBtn = document.createElement('button');
        hintBtn.type = 'button'; hintBtn.className = 'game-rules-btn'; hintBtn.title = 'Indice'; hintBtn.textContent = '💡';
        hintBtn.onclick = function () { if (canEdit()) { try { opts.hint(); } catch (e) {} } };
        mount.insertBefore(hintBtn, mount.firstChild);
      }
      refresh();
    }
    function doUndo() {
      if (!canEdit() || !stack.length) return;
      var prev = stack.pop();
      try { opts.restore(prev); } catch (e) {}
      refresh();
    }
    function record() {
      if (!canEdit()) return;
      try { stack.push(opts.snapshot()); } catch (e) { return; }
      if (stack.length > 300) stack.shift();
      refresh();
    }
    function reset() { stack = []; refresh(); }
    function refresh() {
      build();
      if (undoBtn) undoBtn.disabled = !stack.length || !canEdit();
      if (hintBtn) hintBtn.disabled = !canEdit();
    }
    build();
    return { record: record, reset: reset, refresh: refresh };
  }

  root.Puzzle = { rng: rng, shuffle: shuffle, seed: seed, fmtTime: fmtTime, elapsed: elapsed, finish: finish, rankByTime: rankByTime, assist: assist };
})(typeof module !== 'undefined' && module.exports ? module.exports : (this.window = this.window || this));
