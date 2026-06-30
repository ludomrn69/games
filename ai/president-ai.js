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

  // Groupes de même rang présents en main, triés par rang croissant.
  function groupsOf(hand) {
    var by = {};
    hand.forEach(function (c) { var v = rankVal(c); (by[v] = by[v] || { val: v, cards: [] }).cards.push(c); });
    return Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return a.val - b.val; });
  }

  // Toutes les poses légales (sert au joueur aléatoire du banc + aux vérifs).
  function legalPlays(pile, hand) {
    var groups = groupsOf(hand), plays = [];
    if (!pile) { groups.forEach(function (g) { for (var n = 1; n <= g.cards.length; n++) plays.push(g.cards.slice(0, n)); }); return plays; }
    groups.forEach(function (g) { if (g.val > pile.rank && g.cards.length >= pile.count) plays.push(g.cards.slice(0, pile.count)); });
    return plays;
  }

  function chooseMove(pile, hand, level) {
    if (!hand || !hand.length) return null;
    var groups = groupsOf(hand), easy = level === 'easy';
    if (!pile) { return (easy ? groups[Math.floor(Math.random() * groups.length)] : groups[0]).cards.slice(); }
    var need = pile.count, pr = pile.rank;
    var cand = groups.filter(function (g) { return g.val > pr && g.cards.length >= need; });
    if (!cand.length) return null;                            // passer
    if (easy) return cand[Math.floor(Math.random() * cand.length)].cards.slice(0, need);
    // Finir d'un coup si nos dernières cartes battent la pile.
    for (var i = 0; i < cand.length; i++) if (cand[i].cards.length === need && hand.length === need) return cand[i].cards.slice(0, need);
    // Préférer une taille EXACTE (ne pas casser un groupe plus grand).
    var exact = cand.filter(function (g) { return g.cards.length === need; });
    var pool = exact.length ? exact : cand;
    var pick = pool[0];                                       // plus petit rang
    // Garder 2 / As tant que la main est grande.
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
