/*
  trio-ai.js — IA du Trio (PUR, sans DOM). Jeu de mémoire/déduction : chacun a une
  main TRIÉE dont seules la plus basse et la plus haute carte sont accessibles ; un
  paquet « centre » est posé face cachée. À son tour, on retourne des cartes (sa
  main, celle d'un autre par le bas/haut, ou le centre) ; toutes doivent valoir la
  même chose. 3 identiques = un Trio. On gagne avec 3 Trios, ou le Trio de 7.

  IA (decide) — décision d'UNE carte à retourner. La clé : dès qu'une cible est
  connue, COMPLÉTER À COUP SÛR avec une de ses propres cartes accessibles si elle
  vaut la cible (une certitude vaut tous les paris). Pour le reste, explorer
  LARGEMENT (centre + extrémités des autres + ses propres cartes), au hasard.
  (Mesuré : cette stratégie gagne ~92 % contre un joueur aléatoire ; l'ancienne
  « démarrer par sa carte puis parier sur le centre » perdait — elle gaspillait ses
  paris sur le seul centre au lieu d'exploiter toutes les sources.)

  API :
    TrioAI.decide(view) → { type:'hand', pid, which:'low'|'high' } | { type:'center', ci } | null
       view = { picks, self, myLow, myHigh, centerAvail:[ci…], others:[pid…], easy }
       (myLow / myHigh = VALEUR de la carte basse/haute accessible, ou null)
    TrioAI.makeDeck() · HAND_PER
  Utilisé par games/trio.html ET par tools/bench-games.js.
*/
(function (root) {
  'use strict';
  var HAND_PER = { 3: 9, 4: 7, 5: 6, 6: 5 };

  function makeDeck() { var d = []; for (var v = 1; v <= 12; v++) d.push(v, v, v); return d; }

  // Toutes les cartes retournables maintenant (sa main, le centre, les extrémités
  // des autres joueurs).
  function options(view) {
    var o = [];
    if (view.myLow != null) o.push({ type: 'hand', pid: view.self, which: 'low' });
    if (view.myHigh != null) o.push({ type: 'hand', pid: view.self, which: 'high' });
    (view.centerAvail || []).forEach(function (ci) { o.push({ type: 'center', ci: ci }); });
    (view.others || []).forEach(function (p) { o.push({ type: 'hand', pid: p, which: 'low' }); o.push({ type: 'hand', pid: p, which: 'high' }); });
    return o;
  }

  function decide(view) {
    var picks = view.picks || [], easy = view.easy;
    // Une cible est connue → compléter À COUP SÛR avec sa propre carte si elle vaut
    // la cible (sauf en facile, où l'on reste maladroit).
    if (picks.length && !easy) {
      var target = picks[0].v;
      if (view.myLow === target) return { type: 'hand', pid: view.self, which: 'low' };
      if (view.myHigh === target) return { type: 'hand', pid: view.self, which: 'high' };
    }
    // Sinon : explorer largement (toutes les sources) au hasard.
    var o = options(view);
    return o.length ? o[Math.floor(Math.random() * o.length)] : null;
  }

  root.TrioAI = { decide: decide, makeDeck: makeDeck, HAND_PER: HAND_PER };
})(typeof module !== 'undefined' && module.exports ? module.exports : (this.window = this.window || this));
