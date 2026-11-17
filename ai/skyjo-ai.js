/*
  skyjo-ai.js — Moteur + IA du Skyjo (PUR, sans DOM). Grille de 12 cartes (3×4),
  on retourne / échange pour MINIMISER la somme de sa grille. Trois cartes égales
  dans une colonne → colonne défaussée (0 point). Le deck : 5×(-2), 10×(-1), 15×0,
  puis 10× chaque valeur 1..12 (espérance d'une carte cachée ≈ 5).

  L'IA décide une ACTION ABSTRAITE (la page l'exécute via Firebase) :
   • { type:'flip', idx }        — phase de départ : retourner 2 cartes ;
   • { type:'drawPile' }         — piocher une carte cachée ;
   • { type:'takeDiscard' }      — prendre le sommet de la défausse ;
   • { type:'replace', idx }     — remplacer la case idx par la carte en main ;
   • { type:'discardFlip', idx } — défausser la carte piochée et retourner la case idx.

  Stratégie : compléter une colonne (élimination → 0), construire des paires,
  remplacer ses plus grosses cartes visibles, prendre une carte basse de la défausse
  quand le gain est net, et ÉVITER DE FINIR LA MANCHE quand on n'est pas le plus bas
  (le finisseur non-plus-bas voit son score doublé).

  API :
    SkyjoAI.decide(view, level) → action  (view : voir plus bas)
    SkyjoAI.buildDeck() · SkyjoAI.EXP
  Utilisé par games/skyjo.html ET par tools/bench-games.js.
*/
(function (root) {
  'use strict';
  var EXP = 5; // espérance d'une carte cachée

  function buildDeck() {
    var d = [], i, v;
    for (i = 0; i < 5; i++) d.push(-2);
    for (i = 0; i < 10; i++) d.push(-1);
    for (i = 0; i < 15; i++) d.push(0);
    for (v = 1; v <= 12; v++) for (i = 0; i < 10; i++) d.push(v);
    return d;
  }

  // Répartition du paquet (150 cartes) : sert à l'espérance de la pioche.
  var DIST = {}; (function () { DIST[-2] = 5; DIST[-1] = 10; DIST[0] = 15; for (var v = 1; v <= 12; v++) DIST[v] = 10; })();
  // Réglages (mesurés en auto-jeu) : P2 = chance estimée de finir une colonne dont
  // deux cartes sont déjà égales ; FLIP = petite valeur de l'information gagnée en
  // retournant une carte ; MARGIN = avance exigée sur le meilleur adversaire pour
  // oser fermer la manche.
  var TUNE = { P2: 0.3, P1: 0.04, FLIP: 0.8, MARGIN: 4 };

  // Score FINAL ESTIMÉ d'une grille : cartes visibles + espérance des cachées,
  // moins l'espoir d'élimination des colonnes à paire. vals[i] = valeur, ou null
  // si cachée ; une colonne de 3 cartes égales visibles vaut 0 (elle part).
  function estimate(vals, rm, exp, T) {
    var tot = 0;
    for (var col = 0; col < 4; col++) {
      if (rm[col]) continue;
      var a = vals[col], b = vals[col + 4], c = vals[col + 8];
      var na = a == null, nb = b == null, nc = c == null;
      if (!na && !nb && !nc && a === b && b === c) continue;            // colonne éliminée
      var base = (na ? exp : a) + (nb ? exp : b) + (nc ? exp : c);
      var pair = null, third = 0, thirdHidden = false;
      if (!na && !nb && a === b) { pair = a; third = nc ? exp : c; thirdHidden = nc; }
      else if (!na && !nc && a === c) { pair = a; third = nb ? exp : b; thirdHidden = nb; }
      else if (!nb && !nc && b === c) { pair = b; third = na ? exp : a; thirdHidden = na; }
      if (pair != null) {
        var save = 2 * pair + third;
        if (save > 0) base -= (thirdHidden ? T.P2 * 1.15 : T.P2) * save;
      } else {
        // une seule carte visible, deux cachées : mince espoir de brelan
        var nh = (na ? 1 : 0) + (nb ? 1 : 0) + (nc ? 1 : 0);
        if (nh === 2) { var v1 = na ? (nb ? c : b) : a; if (v1 > 0) base -= T.P1 * (v1 + 2 * exp); }
      }
      tot += base;
    }
    return tot;
  }

  // IA « experte » : compare toutes les actions par leur score final estimé.
  function decideSmart(view, T) {
    var grid = view.grid || [], fl = view.flipped || [], rm = view.removed || [];
    var vals = [], rmCol = [], i, hid = [], slots = [];
    for (i = 0; i < 12; i++) {
      if (rm[i]) { vals.push(0); continue; }
      slots.push(i);
      if (fl[i]) vals.push(grid[i]); else { vals.push(null); hid.push(i); }
    }
    for (i = 0; i < 4; i++) rmCol.push(!!(rm[i] || rm[i + 4] || rm[i + 8]));
    // Espérance d'une carte inconnue, corrigée des cartes que JE vois.
    var cnt = {}, left = 0, sum = 0, v;
    for (v = -2; v <= 12; v++) cnt[v] = DIST[v];
    function see(x) { if (x != null && cnt[x] > 0) cnt[x]--; }
    for (i = 0; i < 12; i++) if (fl[i] || rm[i]) see(grid[i]);
    see(view.discardTop); see(view.drawnCard);
    for (v = -2; v <= 12; v++) { left += cnt[v]; sum += cnt[v] * v; }
    var exp = left ? sum / left : EXP;
    var oppMin = (view.oppMinVisibleSum != null) ? view.oppMinVisibleSum : Infinity;

    // Coût d'une position (plus bas = mieux). `closing` = l'action retourne ma
    // dernière carte cachée → je FERME la manche : mon score double si je ne suis
    // pas strictement le plus bas. On n'ose que nettement devant.
    function cost(vs, closing) {
      var e = estimate(vs, rmCol, exp, T);
      if (closing && oppMin !== Infinity) {
        var pd = e <= oppMin - T.MARGIN - 4 ? 0.08 : e <= oppMin - T.MARGIN ? 0.3 : e <= oppMin ? 0.65 : 0.95;
        if (e > 0) e += e * pd;
      }
      return e;
    }
    // Meilleur remplacement par la carte `card` → { idx, cost }.
    function bestReplace(card) {
      var bi = -1, bc = Infinity;
      for (var k = 0; k < slots.length; k++) {
        var s = slots[k], old = vals[s];
        vals[s] = card;
        var c = cost(vals, old == null && hid.length === 1);
        vals[s] = old;
        if (c < bc - 1e-9) { bc = c; bi = s; }
      }
      return { idx: bi, cost: bc };
    }
    // Retourner une carte cachée (après défausse de la pioche) → { idx, cost }.
    function bestFlip() {
      if (!hid.length) return null;
      var c0 = cost(vals, false) - T.FLIP;
      if (hid.length === 1) {
        // ferme la manche : espérance sur la valeur retournée
        var s = hid[0], acc = 0;
        for (var x = -2; x <= 12; x++) { if (!cnt[x]) continue; vals[s] = x; acc += cnt[x] * cost(vals, true); }
        vals[s] = null; c0 = acc / left;
      }
      // de préférence une colonne où une paire attend sa 3e carte
      var pick = hid[0], bestP = -1;
      for (var k = 0; k < hid.length; k++) {
        var col = hid[k] % 4, ks = [col, col + 4, col + 8], kv = [], p = 0;
        for (var q = 0; q < 3; q++) if (vals[ks[q]] != null) kv.push(vals[ks[q]]);
        if (kv.length === 2 && kv[0] === kv[1] && kv[0] > 0) p = 2 + kv[0]; else if (kv.length === 1) p = 1;
        if (p > bestP) { bestP = p; pick = hid[k]; }
      }
      return { idx: pick, cost: c0 };
    }

    if (view.drawnCard == null) {
      var top = view.discardTop;
      if (top == null) return { type: 'drawPile' };
      var takeCost = bestReplace(top).cost;
      // Espérance de la pioche : pour chaque valeur possible, la meilleure suite.
      var fb = bestFlip(), acc2 = 0;
      for (v = -2; v <= 12; v++) {
        if (!cnt[v]) continue;
        var br = bestReplace(v).cost;
        if (fb && fb.cost < br) br = fb.cost;
        acc2 += cnt[v] * br;
      }
      var drawCost = left ? acc2 / left : Infinity;
      return takeCost < drawCost ? { type: 'takeDiscard' } : { type: 'drawPile' };
    }
    var card = view.drawnCard, rep = bestReplace(card);
    if (view.drawnFrom !== 'discard') {
      var f2 = bestFlip();
      if (f2 && f2.cost < rep.cost) return { type: 'discardFlip', idx: f2.idx };
    }
    return { type: 'replace', idx: rep.idx >= 0 ? rep.idx : (slots[0] || 0) };
  }

  // view = { phase, grid:[12], flipped:[12], removed:[12], discardTop, drawnCard,
  //          drawnFrom, oppMinVisibleSum }
  function decide(view, level) {
    var fl = view.flipped || [], rm = view.removed || [];
    // Taux de coup « au pif » selon le niveau : facile joue souvent sans réfléchir,
    // moyen parfois, difficile JAMAIS → 3 niveaux distincts.
    var blunderRate = level === 'easy' ? 0.6 : level === 'normal' ? 0.22 : 0;
    function blunder() { return blunderRate > 0 && Math.random() < blunderRate; }
    if (view.phase === 'flip2') {
      for (var i = 0; i < 12; i++) if (!fl[i] && !rm[i]) return { type: 'flip', idx: i };
      return null;
    }
    if (view.drawnCard == null) { if (blunder()) return { type: 'drawPile' }; }
    else if (blunder()) {
      var slots = []; for (var z = 0; z < 12; z++) if (!rm[z]) slots.push(z);
      if (slots.length) return { type: 'replace', idx: slots[Math.floor(Math.random() * slots.length)] };
    }
    return decideSmart(view, view.tune || TUNE);
  }

  root.SkyjoAI = { decide: decide, buildDeck: buildDeck, EXP: EXP };
})(typeof module !== 'undefined' && module.exports ? module.exports : (this.window = this.window || this));
