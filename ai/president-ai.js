/*
  president-ai.js — Moteur + IA du Président (PUR, sans DOM). Jeu de défausse : on
  pose des combinaisons de même rang (simple, paire, brelan, carré) qui doivent
  battre la pile (même nombre de cartes, rang strictement supérieur) ; sinon on
  passe. Premier à se défausser = Président ; dernier = Trou du cul.

  IA (chooseMove) — défausse maligne, plus fine que « le plus petit qui bat » :
   • mener par le plus petit rang (on garde les fortes pour plus tard) ;
   • pour suivre : préférer un groupe de TAILLE EXACTE (ne PAS casser un brelan
     pour jouer une simple) ;
   • finir d'un coup si nos dernières cartes battent la pile ;
   • garder les 2 et les As tant que la main est grande (cartes maîtresses).

  Rangs : 3<4<…<K<A<2 (le 2 est le plus fort). Carte = rang + couleur, ex. '7H',
  'AS', '2C'. rankVal('2') = 12 (max).

  API :
    PresidentAI.chooseMove(pile, hand, level) → [cartes] à jouer, ou null (passer)
       pile = null (on mène) | { rank:rangVal, count:nbCartes }
    PresidentAI.legalPlays(pile, hand) → toutes les poses légales [[...], ...]
    PresidentAI.rankVal(card) · groupsOf(hand) · deal(nPlayers, rnd)

  Utilisé par games/president.html ET par tools/bench-games.js.
*/
(function (root) {
  'use strict';
  var RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
  var SUITS = ['S', 'H', 'D', 'C'];
  var ACE = RANKS.indexOf('A');

  function rankOf(card) { return card.slice(0, -1); }
  function rankVal(card) { return RANKS.indexOf(rankOf(card)); }
  var TOP = RANKS.length - 1;
  // Valeur EFFECTIVE : en RÉVOLUTION (ctx.rev), l'ordre des rangs s'inverse.
  function valFn(ctx) {
    if (ctx && ctx.rev) return function (c) { return TOP - rankVal(c); };
    return rankVal;
  }

  // Groupes de même rang présents en main, triés par rang croissant.
  function groupsOf(hand, ctx) {
    var val = valFn(ctx), by = {};
    hand.forEach(function (c) { var v = val(c); (by[v] = by[v] || { val: v, cards: [] }).cards.push(c); });
    return Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return a.val - b.val; });
  }

  // Toutes les poses légales (sert au joueur aléatoire du banc + aux vérifs).
  function legalPlays(pile, hand, ctx) {
    var groups = groupsOf(hand, ctx), plays = [];
    if (!pile) { groups.forEach(function (g) { for (var n = 1; n <= g.cards.length; n++) plays.push(g.cards.slice(0, n)); }); return plays; }
    // La page accepte une valeur ÉGALE (« même hauteur » : saute le joueur suivant).
    groups.forEach(function (g) { if (g.val >= pile.rank && g.cards.length >= pile.count) plays.push(g.cards.slice(0, pile.count)); });
    return plays;
  }

  // ── COMPTAGE (niveau difficile, si ctx.seen fourni) ─────────────────────────
  // Combien de cartes STRICTEMENT plus fortes que `gval` restent DEHORS (ni déjà
  // tombées, ni dans ma main), par valeur effective. Un groupe est « imbattable »
  // si aucun rang supérieur n'a encore `need` cartes dehors.
  function outsideHigher(gval, hand, seen, val) {
    var left = {};
    for (var v = gval + 1; v <= TOP; v++) left[v] = 4;
    (seen || []).forEach(function (c) { var v2 = val(c); if (v2 > gval && left[v2] != null) left[v2]--; });
    (hand || []).forEach(function (c) { var v3 = val(c); if (v3 > gval && left[v3] != null) left[v3]--; });
    return left;
  }
  function isUnbeatable(gval, need, hand, seen, val) {
    var left = outsideHigher(gval, hand, seen, val);
    for (var v in left) if (left[v] >= need) return false;
    return true;
  }

  // Une pose de `n` cartes de valeur `gval` REMPORTE le pli à coup sûr si personne
  // dehors ne peut la battre NI l'égaler (une pose à la même hauteur est légale).
  // La carte maîtresse (2, ou 3 en révolution) ferme toujours le pli.
  function winsTrick(gval, n, hand, seen, val) {
    if (gval === TOP) return true;
    if (!seen) return false;
    var left = {}, v;
    for (v = gval; v <= TOP; v++) left[v] = 4;
    seen.forEach(function (c) { var v2 = val(c); if (left[v2] != null) left[v2]--; });
    hand.forEach(function (c) { var v3 = val(c); if (left[v3] != null) left[v3]--; });
    for (v = gval; v <= TOP; v++) if (left[v] >= n) return false;
    return true;
  }
  // Nombre de groupes « perdants » (qui ne remportent pas le pli à coup sûr) : avec
  // 0 ou 1 perdant, la main se déroule jusqu'au bout sans que personne reprenne.
  function losers(groups, hand, seen, val) {
    var n = 0;
    groups.forEach(function (g) { if (!winsTrick(g.val, g.cards.length, hand, seen, val)) n++; });
    return n;
  }
  function without(hand, cards) { var h = hand.slice(); cards.forEach(function (c) { h.splice(h.indexOf(c), 1); }); return h; }
  function onlyClosers(hand, val) { return hand.length > 0 && hand.every(function (c) { return val(c) === TOP; }); }

  function chooseMove(pile, hand, level, ctx) {
    if (!hand || !hand.length) return null;
    var val = valFn(ctx);
    var groups = groupsOf(hand, ctx), easy = level === 'easy';
    var counting = level === 'hard' && ctx && ctx.seen; // IA COMPTEUSE
    var seen = counting ? ctx.seen : null;
    if (!pile) {
      if (easy) return groups[Math.floor(Math.random() * groups.length)].cards.slice();
      var cl = groups[groups.length - 1].val === TOP ? groups[groups.length - 1] : null;
      var nonCl = cl ? groups.slice(0, -1) : groups;
      if (!nonCl.length) return cl.cards.slice();              // que des maîtresses : rien à sauver
      // INTERDIT de finir sur la carte maîtresse (Trou du cul d'office) : s'il ne
      // me reste qu'un groupe à côté, je pose d'abord la maîtresse (elle ferme le
      // pli, je rejoue) puis je finis sur l'autre groupe.
      if (cl && nonCl.length === 1) return cl.cards.slice();
      // DÉROULER : au plus un groupe perdant → je joue mes poses gagnantes (personne
      // ne peut reprendre la main) et je termine par le perdant.
      if (counting && losers(nonCl, hand, seen, val) <= 1) {
        if (cl) return cl.cards.slice();
        for (var u = nonCl.length - 1; u >= 0; u--) {
          if (winsTrick(nonCl[u].val, nonCl[u].cards.length, hand, seen, val)) return nonCl[u].cards.slice();
        }
        return nonCl[0].cards.slice();
      }
      var g0 = nonCl[0];
      // Carré en main : le poser d'un coup déclenche la révolution — seulement si
      // le reste de ma main est plutôt BAS (elle m'arrange) ; sinon j'en garde un.
      if (g0.cards.length === 4 && hand.length > 4) {
        var rest0 = without(hand, g0.cards), sum0 = 0;
        rest0.forEach(function (c) { sum0 += val(c); });
        if (sum0 / rest0.length > 5.5) return g0.cards.slice(0, 3);
      }
      return g0.cards.slice();
    }
    var need = pile.count, pr = pile.rank;
    // Valeur ÉGALE permise (même hauteur). On écarte ce qui me ferait finir sur la
    // carte maîtresse, ou ne me laisserait QUE des maîtresses en main.
    var cand = groups.filter(function (g) {
      if (g.val < pr || g.cards.length < need) return false;
      if (easy) return true;
      if (g.val === TOP && hand.length === need) return false;
      if (g.val !== TOP && onlyClosers(without(hand, g.cards.slice(0, need)), val)) return false;
      return true;
    });
    if (!cand.length) return null;                            // passer
    if (easy) return cand[Math.floor(Math.random() * cand.length)].cards.slice(0, need);
    // Finir d'un coup si nos dernières cartes battent la pile.
    for (var i = 0; i < cand.length; i++) if (hand.length === need) return cand[i].cards.slice(0, need);
    // DÉROULER : une pose qui remporte le pli et laisse une main à ≤ 1 perdant.
    if (counting) {
      for (var w = 0; w < cand.length; w++) {
        var mvw = cand[w].cards.slice(0, need);
        if (!winsTrick(cand[w].val, need, hand, seen, val)) continue;
        var restW = without(hand, mvw);
        if (onlyClosers(restW, val)) continue;
        var gr = groupsOf(restW, ctx), ncl = gr.filter(function (g) { return g.val !== TOP; });
        var hasCl = ncl.length !== gr.length;
        if (losers(ncl, restW, seen, val) <= 1 && (ncl.length > 0 || !hasCl)) return mvw;
      }
    }
    // Préférer une taille EXACTE (ne pas casser un groupe plus grand).
    var exact = cand.filter(function (g) { return g.cards.length === need; });
    var pool = exact.length ? exact : cand;
    var pick = pool[0];                                       // plus petit rang
    // COMPTAGE : si mon choix par défaut reste battable mais que je détiens une
    // pose IMBATTABLE, je prends la main avec quand la main raccourcit.
    if (counting && hand.length <= 9 && !winsTrick(pick.val, need, hand, seen, val)) {
      for (var s2 = 0; s2 < pool.length; s2++) {
        if (winsTrick(pool[s2].val, need, hand, seen, val)) { pick = pool[s2]; break; }
      }
    }
    // Garder les deux plus fortes valeurs tant que la main est grande.
    if (pick.val >= ACE && hand.length > 6) {
      var cheaper = pool.filter(function (g) { return g.val < ACE; });
      if (cheaper.length) pick = cheaper[0];
      else { var cheaperAll = cand.filter(function (g) { return g.val < ACE; }); if (!cheaperAll.length) return null; pick = cheaperAll[0]; }
    }
    return pick.cards.slice(0, need);
  }

  function deal(nPlayers, rnd) {
    rnd = rnd || Math.random;
    var deck = []; SUITS.forEach(function (s) { RANKS.forEach(function (r) { deck.push(r + s); }); });
    for (var i = deck.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = deck[i]; deck[i] = deck[j]; deck[j] = t; }
    var hands = []; for (var p = 0; p < nPlayers; p++) hands.push([]);
    deck.forEach(function (c, i2) { hands[i2 % nPlayers].push(c); });
    return hands;
  }

  root.PresidentAI = { chooseMove: chooseMove, legalPlays: legalPlays, groupsOf: groupsOf, rankVal: rankVal, deal: deal, RANKS: RANKS };
})(typeof module !== 'undefined' && module.exports ? module.exports : (this.window = this.window || this));
