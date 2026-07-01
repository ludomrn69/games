/*
  uno-ai.js — Moteur + IA du Uno (PUR, sans DOM). Cartes : couleur+chiffre (0-9),
  couleur+action (S=passe, V=sens inverse, D=+2), 'W' (joker), 'W4' (joker +4).

  IA (decide) — décision d'UN coup, comme l'appelle la page à chaque tour :
   • si une pioche est en attente (+2 cumulés) : reposer un +2 si possible, sinon
     subir la pioche ;
   • sinon jouer la meilleure carte jouable, sinon piocher (puis passer) ;
   • choix de carte : si l'adversaire suivant est proche de gagner (≤ 2 cartes),
     le perturber (+2 / passe, voire +4 s'il n'a qu'1 carte) ; sinon garder la
     couleur DOMINANTE, jouer les chiffres avant les actions, et à couleur égale
     lâcher le plus GROS chiffre (réduit ses points + les cartes dures à placer) ;
     garder les jokers pour quand on est bloqué ;
   • couleur de relance d'un joker = couleur la plus présente en main.

  API :
    UnoAI.decide(view) → { type:'play', card, color } | { type:'draw' } | { type:'pass' }
       view = { hand, top, currentColor, pendingDraw, nextCount, drewThisTurn, blunder }
    UnoAI.canPlay(card, top, currentColor) · parseCard(card)
    UnoAI.buildDeck() · deal(nPlayers, rnd) · COLORS
  Utilisé par games/uno.html ET par tools/bench-games.js.
*/
(function (root) {
  'use strict';
  var COLORS = ['R', 'Y', 'G', 'B'];

  function parseCard(card) {
    if (!card) return null;
    if (card === 'W') return { wild: true, draw4: false };
    if (card === 'W4') return { wild: true, draw4: true };
    var c = card.charAt(0), rest = card.slice(1);
    if (rest === 'S' || rest === 'V' || rest === 'D') return { color: c, action: rest };
    return { color: c, number: parseInt(rest, 10) };
  }
  function canPlay(card, top, currentColor) {
    var p = parseCard(card); if (!p) return false;
    if (p.wild) return true;
    if (p.color === currentColor) return true;
    var t = parseCard(top); if (!t || t.wild) return false;
    if (p.action && t.action && p.action === t.action) return true;
    if (typeof p.number === 'number' && typeof t.number === 'number' && p.number === t.number) return true;
    return false;
  }
  function buildDeck() {
    var deck = [];
    COLORS.forEach(function (c) {
      deck.push(c + '0');
      for (var n = 1; n <= 9; n++) { deck.push(c + n); deck.push(c + n); }
      ['S', 'V', 'D'].forEach(function (a) { deck.push(c + a); deck.push(c + a); });
    });
    for (var i = 0; i < 4; i++) { deck.push('W'); deck.push('W4'); }
    return deck;
  }
  function deal(nPlayers, rnd) {
    rnd = rnd || Math.random;
    var deck = buildDeck();
    for (var i = deck.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = deck[i]; deck[i] = deck[j]; deck[j] = t; }
    var hands = []; for (var p = 0; p < nPlayers; p++) hands.push([]);
    for (var k = 0; k < 7; k++) for (var q = 0; q < nPlayers; q++) hands[q].push(deck.pop());
    return { hands: hands, deck: deck };
  }

  function colorCount(hand, col) { var n = 0; for (var i = 0; i < hand.length; i++) { var p = parseCard(hand[i]); if (p && !p.wild && p.color === col) n++; } return n; }
  function bestColor(hand) { var best = 'R', bc = -1; COLORS.forEach(function (col) { var n = colorCount(hand, col); if (n > bc) { bc = n; best = col; } }); return best; }

  function choose(hand, playable, nextCount) {
    var nonWild = playable.filter(function (c) { return !(parseCard(c) || {}).wild; });
    if (nextCount <= 2) {                          // adversaire suivant proche de gagner → perturber
      var disrupt = nonWild.filter(function (c) { var a = parseCard(c).action; return a === 'D' || a === 'S'; });
      if (disrupt.length) { disrupt.sort(function (a, b) { return (parseCard(b).action === 'D' ? 1 : 0) - (parseCard(a).action === 'D' ? 1 : 0); }); return disrupt[0]; }
      if (nextCount <= 1 && playable.indexOf('W4') >= 0) return 'W4';
    }
    if (nonWild.length) {
      nonWild.sort(function (a, b) {
        var pa = parseCard(a), pb = parseCard(b);
        var ca = colorCount(hand, pa.color), cb = colorCount(hand, pb.color);
        if (ca !== cb) return cb - ca;             // garder la couleur dominante
        var aAct = pa.action ? 1 : 0, bAct = pb.action ? 1 : 0;
        if (aAct !== bAct) return aAct - bAct;     // chiffres avant actions (on garde les actions)
        var na = (typeof pa.number === 'number') ? pa.number : 0, nb = (typeof pb.number === 'number') ? pb.number : 0;
        return nb - na;                            // à couleur égale, lâcher le plus gros chiffre
      });
      return nonWild[0];
    }
    var w = playable.filter(function (c) { return c === 'W'; });   // garder le +4 si possible
    return w.length ? 'W' : playable[0];
  }

  function decide(view) {
    var hand = view.hand || [], top = view.top, cc = view.currentColor, pend = view.pendingDraw || 0;
    if (pend > 0) {
      var twos = hand.filter(function (c) { return (parseCard(c) || {}).action === 'D'; });
      if (twos.length) return { type: 'play', card: twos[0], color: parseCard(twos[0]).color };
      return { type: 'draw' };
    }
    var playable = hand.filter(function (c) { return canPlay(c, top, cc); });
    if (!playable.length) return view.drewThisTurn ? { type: 'pass' } : { type: 'draw' };
    var card = view.blunder ? playable[Math.floor(Math.random() * playable.length)] : choose(hand, playable, view.nextCount == null ? 99 : view.nextCount);
    var p = parseCard(card);
    return { type: 'play', card: card, color: p.wild ? bestColor(hand) : p.color };
  }

  root.UnoAI = { decide: decide, canPlay: canPlay, parseCard: parseCard, buildDeck: buildDeck, deal: deal, bestColor: bestColor, COLORS: COLORS };
})(typeof module !== 'undefined' && module.exports ? module.exports : (this.window = this.window || this));
