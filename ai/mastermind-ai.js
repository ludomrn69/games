/*
  mastermind-ai.js — Moteur + IA du Mastermind (PUR, sans DOM). Code = 4 pions
  parmi 6 couleurs (répétitions permises) → 1296 codes possibles.

  IA :
   • Ouverture de Knuth : 1122 (couleurs {0,0,1,1}) — la meilleure 1re tentative.
   • « difficile » = MINIMAX DE KNUTH COMPLET : on évalue CHAQUE code possible comme
     prochaine tentative (pas seulement les codes encore cohérents) et on garde
     celui qui MINIMISE la plus grosse partition de réponses — à égalité, on
     préfère un code encore cohérent (il peut être le bon). Cette stratégie résout
     tout code en ≤ 5 coups (~4,48 en moyenne) : optimal au pire cas.
   • « moyen » = tentative au hasard parmi les codes encore cohérents (résout
     toujours, mais moins vite).
   • « facile » = tentative au hasard (pour être réellement battable).

  API :
    MastermindAI.choose(history, level) → code [c0,c1,c2,c3]  (ci ∈ 0..5)
       history = [{ g:[...], black, white }, ...] (tentatives passées + réponses)
    MastermindAI.feedback(guess, code) → { black, white }
    MastermindAI.consistentWith(history) → codes compatibles avec tout l'historique
    MastermindAI.allCodes() · randomSecret(rnd) · PEGS · NC

  Utilisé par games/mastermind.html ET par tools/bench-games.js.
*/
(function (root) {
  'use strict';
  var PEGS = 4, NC = 6;

  function feedback(g, code) {
    var black = 0, cc = [0, 0, 0, 0, 0, 0], gc = [0, 0, 0, 0, 0, 0];
    for (var i = 0; i < PEGS; i++) { if (g[i] === code[i]) black++; else { cc[code[i]]++; gc[g[i]]++; } }
    var white = 0; for (var k = 0; k < NC; k++) white += Math.min(cc[k], gc[k]);
    return { black: black, white: white };
  }

  var _all = null;
  function allCodes() {
    if (_all) return _all;
    var out = [];
    for (var a = 0; a < NC; a++) for (var b = 0; b < NC; b++) for (var c = 0; c < NC; c++) for (var d = 0; d < NC; d++) out.push([a, b, c, d]);
    _all = out; return out;
  }
  function consistentWith(history) {
    return allCodes().filter(function (cand) {
      return history.every(function (h) { var f = feedback(h.g, cand); return f.black === h.black && f.white === h.white; });
    });
  }
  function randomSecret(rnd) { rnd = rnd || Math.random; var c = []; for (var i = 0; i < PEGS; i++) c.push(Math.floor(rnd() * NC)); return c; }

  function randItem(arr) { return arr[Math.floor(Math.random() * arr.length)].slice(); }

  function choose(history, level) {
    if (!history.length) return [0, 0, 1, 1];                  // ouverture de Knuth (1122)
    if (level === 'easy') return randItem(allCodes());
    var cons = consistentWith(history);
    if (!cons.length) return randItem(allCodes());             // (ne devrait pas arriver)
    if (cons.length <= 2) return cons[0].slice();
    if (level !== 'hard') return randItem(cons);               // moyen : au hasard parmi les cohérents

    // Minimax de Knuth COMPLET : meilleur coup = celui dont la plus grosse classe
    // de réponses possibles est la plus petite (on réduit le pire cas). À égalité,
    // on préfère un coup cohérent.
    var consSet = {}; cons.forEach(function (c) { consSet[c.join('')] = true; });
    var all = allCodes();
    var best = cons[0], bestWorst = Infinity, bestIsCons = false;
    for (var i = 0; i < all.length; i++) {
      var guess = all[i], part = {}, worst = 0;
      for (var j = 0; j < cons.length; j++) {
        var f = feedback(guess, cons[j]), key = f.black * 10 + f.white;
        var v = (part[key] = (part[key] || 0) + 1);
        if (v > worst) worst = v;
        if (worst > bestWorst) break; // élagage : déjà strictement pire → inutile de finir
      }
      if (worst > bestWorst) continue;
      var isCons = !!consSet[guess.join('')];
      if (worst < bestWorst || (worst === bestWorst && isCons && !bestIsCons)) {
        bestWorst = worst; best = guess; bestIsCons = isCons;
      }
    }
    return best.slice();
  }

  root.MastermindAI = {
    choose: choose, feedback: feedback, consistentWith: consistentWith,
    allCodes: allCodes, randomSecret: randomSecret, PEGS: PEGS, NC: NC
  };
})(typeof module !== 'undefined' && module.exports ? module.exports : (this.window = this.window || this));
