/*
  papayoo-ai.js — Moteur + IA du Papayoo (PUR, sans DOM). Levées sans atout : 4
  couleurs (R,B,G,Y) de 1 à 10 + une couleur « Payoo » (P) de 1 à 20. Pénalités :
  chaque Payoo Pv vaut v points ; le 7 de la couleur PAPAYOO (tirée au sort par
  donne) vaut 40. But : ramasser le MOINS de points possible.

  IA :
   • Passe : se débarrasser des cartes les plus dangereuses (gros points, puis
     hautes).
   • Mener : sortir une petite carte d'une couleur normale (garder les Payoo).
   • Suivre : passer SOUS le meilleur de la couleur quand c'est possible (ne pas
     ramasser) ; si le pli est sans point et qu'on joue en dernier, monter pour
     gagner la main ; sinon, forcé de dépasser, jouer la plus basse.
   • Défausser (couleur absente) : balancer la carte la plus chère (gros Payoo / le
     Papayoo à 40) sur le pli d'un autre.

  API :
    PapayooAI.choosePlay(view) → carte   (view : papSuit, ledSuit, trick, nPlayers, legal)
    PapayooAI.choosePass(hand, papSuit, need) → [cartes]
    PapayooAI.legalCards(hand, ledSuit) · cardPoints(c, papSuit) · trickWinner · trickPoints
    PapayooAI.buildDeck() · deal(nPlayers, rnd) · SUITS
  Utilisé par games/papayoo.html ET par tools/bench-games.js.
*/
(function (root) {
  'use strict';
  var SUITS = ['R', 'B', 'G', 'Y'];

  function suitOf(c) { return c[0]; }
  function valOf(c) { return +c.slice(1); }
  function isPayoo(c) { return c[0] === 'P'; }
  function cardPoints(c, papSuit) { if (isPayoo(c)) return valOf(c); if (c === papSuit + '7') return 40; return 0; }
  function buildDeck() { var d = []; SUITS.forEach(function (s) { for (var v = 1; v <= 10; v++) d.push(s + v); }); for (var v = 1; v <= 20; v++) d.push('P' + v); return d; }
  function legalCards(hand, ledSuit) { if (!ledSuit) return hand.slice(); var follow = hand.filter(function (c) { return suitOf(c) === ledSuit; }); return follow.length ? follow : hand.slice(); }
  function trickWinner(trick, ledSuit) { var best = null, bv = -1; trick.forEach(function (t) { if (suitOf(t.card) === ledSuit && valOf(t.card) > bv) { bv = valOf(t.card); best = t.by; } }); return best; }
  function trickPoints(trick, papSuit) { return trick.reduce(function (s, t) { return s + cardPoints(t.card, papSuit); }, 0); }

  function deal(nPlayers, rnd) {
    rnd = rnd || Math.random;
    var deck = buildDeck();
    for (var i = deck.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = deck[i]; deck[i] = deck[j]; deck[j] = t; }
    var per = Math.floor(deck.length / nPlayers), hands = [];
    for (var p = 0; p < nPlayers; p++) hands.push(deck.slice(p * per, p * per + per));
    return { hands: hands, papSuit: SUITS[Math.floor(rnd() * SUITS.length)] };
  }

  function choosePass(hand, papSuit, need) {
    return hand.slice().sort(function (a, b) { return (cardPoints(b, papSuit) - cardPoints(a, papSuit)) || (valOf(b) - valOf(a)); }).slice(0, need);
  }

  function choosePlay(view) {
    var pap = view.papSuit, led = view.ledSuit, trick = view.trick || [], n = view.nPlayers, legal = view.legal;
    function pts(c) { return cardPoints(c, pap); }
    var lastToPlay = (trick.length === n - 1);
    if (!led) {
      var normals = legal.filter(function (c) { return !isPayoo(c); });
      var pool = normals.length ? normals : legal;
      return pool.slice().sort(function (a, b) { return valOf(a) - valOf(b); })[0];
    }
    var canFollow = legal.some(function (c) { return suitOf(c) === led; });
    if (canFollow) {
      var followCards = legal.filter(function (c) { return suitOf(c) === led; });
      var curBest = -1; trick.forEach(function (t) { if (suitOf(t.card) === led) curBest = Math.max(curBest, valOf(t.card)); });
      var pot = trickPoints(trick, pap);
      var under = followCards.filter(function (c) { return valOf(c) < curBest; });
      if (lastToPlay && pot === 0) return followCards.slice().sort(function (a, b) { return valOf(b) - valOf(a); })[0]; // monter pour gagner un pli vide
      if (under.length) return under.sort(function (a, b) { return valOf(b) - valOf(a); })[0];                          // la plus haute qui passe sous
      return followCards.slice().sort(function (a, b) { return valOf(a) - valOf(b); })[0];                              // forcé de dépasser → la plus basse
    }
    var byPts = legal.slice().sort(function (a, b) { return pts(b) - pts(a) || valOf(b) - valOf(a); });
    if (pts(byPts[0]) > 0) return byPts[0];                    // se débarrasser de la carte à points
    return legal.slice().sort(function (a, b) { return valOf(b) - valOf(a); })[0];  // sinon, la plus haute normale
  }

  root.PapayooAI = {
    choosePlay: choosePlay, choosePass: choosePass, legalCards: legalCards, cardPoints: cardPoints,
    trickWinner: trickWinner, trickPoints: trickPoints, buildDeck: buildDeck, deal: deal,
    suitOf: suitOf, valOf: valOf, isPayoo: isPayoo, SUITS: SUITS
  };
})(typeof module !== 'undefined' && module.exports ? module.exports : (this.window = this.window || this));
