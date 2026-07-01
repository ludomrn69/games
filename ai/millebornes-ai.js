/*
  millebornes-ai.js — Moteur (cartes/règles utiles à l'IA) + IA du Mille Bornes
  (PUR, sans DOM). Course à 1000 km : cartes Distance (25→200), Attaques (feu rouge,
  panne, crevaison, accident, limite 50), Parades (feu vert, essence, roue, répar.,
  fin de limite), Bottes (immunités). Chaque tour : piocher 1, jouer ou défausser 1.

  IA (decide) — ordre de priorité éprouvé :
   1) poser une BOTTE utile tout de suite (pare l'attaque en cours / redémarre) ;
   2) PARER un blocage (parade du danger, feu vert si arrêté, fin de limite) ;
   3) ROULER la plus grande borne jouable (sans dépasser 1000 — finit pile au but) ;
   4) ATTAQUER le LEADER (plus grand kilométrage) avec un danger qu'il subit ;
   5) sinon jouer un coup légal, sinon défausser la carte la moins utile.

  API :
    MilleBornesAI.decide(view) → { type:'play', card, target? } | { type:'discard', card }
       view = { me:{dist,rolling,hazard,limited,safeties,hand},
                opponents:[{pid,dist,rolling,hazard,limited,safeties}], easy }
    MilleBornesAI.CARD · buildDeck() · immune(P,haz) · canPlaySelf(P,card) · canAttack(att,tgt,card)
  Utilisé par games/millebornes.html ET par tools/bench-games.js.
*/
(function (root) {
  'use strict';
  var CARD = {
    d25: { t: 'dist', km: 25 }, d50: { t: 'dist', km: 50 }, d75: { t: 'dist', km: 75 }, d100: { t: 'dist', km: 100 }, d200: { t: 'dist', km: 200 },
    hStop: { t: 'haz', haz: 'stop' }, hGas: { t: 'haz', haz: 'gas' }, hFlat: { t: 'haz', haz: 'flat' }, hCrash: { t: 'haz', haz: 'crash' }, hLimit: { t: 'haz', haz: 'limit' },
    rGo: { t: 'rem', rem: 'stop' }, rGas: { t: 'rem', rem: 'gas' }, rFlat: { t: 'rem', rem: 'flat' }, rRepair: { t: 'rem', rem: 'crash' }, rLimit: { t: 'rem', rem: 'limit' },
    sAce: { t: 'safe', safe: 'crash' }, sTank: { t: 'safe', safe: 'gas' }, sPunc: { t: 'safe', safe: 'flat' }, sRoW: { t: 'safe', safe: 'row' }
  };

  function buildDeck(rnd) {
    rnd = rnd || Math.random;
    var d = [], add = function (id, n) { for (var i = 0; i < n; i++) d.push(id); };
    add('d25', 10); add('d50', 10); add('d75', 10); add('d100', 12); add('d200', 4);
    add('hStop', 5); add('hGas', 3); add('hFlat', 3); add('hCrash', 3); add('hLimit', 4);
    add('rGo', 14); add('rGas', 6); add('rFlat', 6); add('rRepair', 6); add('rLimit', 6);
    add('sAce', 1); add('sTank', 1); add('sPunc', 1); add('sRoW', 1);
    for (var i = d.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = d[i]; d[i] = d[j]; d[j] = t; }
    return d;
  }

  function immune(P, haz) {
    var saf = P.safeties || [];
    if (haz === 'stop' || haz === 'limit') { if (saf.indexOf('sRoW') >= 0) return true; }
    return saf.some(function (s) { return CARD[s].safe === haz; });
  }
  function canPlaySelf(P, card) {            // dist / rem / safe (pas les attaques)
    var c = CARD[card];
    if (c.t === 'dist') return P.rolling && !P.hazard && (!P.limited || c.km <= 50) && (P.dist + c.km <= 1000);
    if (c.t === 'rem') { if (c.rem === 'stop') return !P.rolling; return P.hazard === c.rem || (c.rem === 'limit' && P.limited); }
    if (c.t === 'safe') return true;
    return false;
  }
  function canAttack(att, target, card) {    // attaque `card` contre `target`
    var c = CARD[card]; if (c.t !== 'haz' || !target) return false;
    if (immune(target, c.haz)) return false;
    if (c.haz === 'stop') return target.rolling;
    if (c.haz === 'limit') return !target.limited;
    return target.rolling && !target.hazard;   // gas / flat / crash
  }

  function decide(view) {
    var P = view.me, hand = P.hand || [], easy = view.easy, opps = view.opponents || [];
    function targetsFor(card) { return opps.filter(function (o) { return canAttack(P, o, card); }); }

    // 1) Botte utile maintenant (pare l'attaque en cours, ou redémarre si arrêté/limité).
    for (var b = 0; b < hand.length; b++) { var cb = CARD[hand[b]]; if (cb.t === 'safe' && (cb.safe === P.hazard || (cb.safe === 'row' && (!P.rolling || P.limited)))) return { type: 'play', card: hand[b] }; }
    // 2) Parer un blocage.
    if (P.hazard) { for (var r = 0; r < hand.length; r++) { if (CARD[hand[r]].t === 'rem' && CARD[hand[r]].rem === P.hazard) return { type: 'play', card: hand[r] }; } }
    if (!P.rolling && hand.indexOf('rGo') >= 0) return { type: 'play', card: 'rGo' };
    if (P.limited && hand.indexOf('rLimit') >= 0) return { type: 'play', card: 'rLimit' };
    // 3) Rouler la plus grande borne jouable.
    if (!easy) {
      var dists = hand.filter(function (c) { return CARD[c].t === 'dist' && canPlaySelf(P, c); }).sort(function (a, b2) { return CARD[b2].km - CARD[a].km; });
      if (dists.length) return { type: 'play', card: dists[0] };
    }
    // 4) Attaquer le leader.
    var hazs = hand.filter(function (c) { return CARD[c].t === 'haz' && targetsFor(c).length; });
    if (hazs.length) {
      var card = easy ? hazs[Math.floor(Math.random() * hazs.length)] : hazs[0];
      var targets = targetsFor(card).sort(function (a, b3) { return b3.dist - a.dist; });
      return { type: 'play', card: card, target: targets[0].pid };
    }
    // 5) Sinon : coup légal au hasard (facile), une borne, ou défausser l'inutile.
    if (easy) { var legal = hand.filter(function (c) { return CARD[c].t !== 'haz' && canPlaySelf(P, c); }); if (legal.length) return { type: 'play', card: legal[Math.floor(Math.random() * legal.length)] }; }
    var dist2 = hand.filter(function (c) { return CARD[c].t === 'dist' && canPlaySelf(P, c); }).sort(function (a, b4) { return CARD[b4].km - CARD[a].km; });
    if (dist2.length) return { type: 'play', card: dist2[0] };
    var dump = hand.find(function (c) { return CARD[c].t === 'haz' && !targetsFor(c).length; }) || hand[0];
    return { type: 'discard', card: dump };
  }

  root.MilleBornesAI = { decide: decide, CARD: CARD, buildDeck: buildDeck, immune: immune, canPlaySelf: canPlaySelf, canAttack: canAttack };
})(typeof module !== 'undefined' && module.exports ? module.exports : (this.window = this.window || this));
