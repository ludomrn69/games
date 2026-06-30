/*
  sixnimmt-ai.js — Moteur + IA de « 6 qui prend ! » (PUR, sans DOM).

  Règles utiles : 104 cartes, 4 rangées. À chaque tour, tout le monde choisit une
  carte ; on les révèle et on les place par ordre CROISSANT. Une carte va sur la
  rangée dont la dernière carte est la plus haute SANS dépasser la carte jouée. Si
  cette rangée a déjà 5 cartes, le joueur la ramasse (têtes de bœuf = pénalité) et
  la remplace par sa carte. Si la carte est plus basse que toutes les fins de
  rangée, le joueur prend la rangée de son choix (la moins chère).

  IA (chooseCard) — gloutonne mais plus fine que « pénalité immédiate » seule :
   • éviter de ramasser des têtes (poids dominant) ;
   • à pénalité égale, éviter de remplir une rangée vers 5 (risque futur) ;
   • se caler au plus près d'une fin de rangée (petit écart → l'adversaire ne se
     glisse pas entre les deux) ;
   • si la carte est trop basse (sacrifice forcé), préférer sacrifier une carte
     BASSE (les petites cartes sont des fardeaux) sur la rangée la moins chère.

  API :
    SixNimmtAI.chooseCard(rows, hand)  → valeur de carte à jouer
    SixNimmtAI.chooseRow(rows)         → index 0..3 de la rangée la moins chère
    SixNimmtAI.heads(n) / sumHeads(row)→ têtes de bœuf
    SixNimmtAI.resolveTurn(rows, picks)→ simulation pure d'un tour (pour le banc) :
        picks=[{pid,val}] → { rows, heads:{pid:Δtêtes} }  (rangées mutées en place)
    SixNimmtAI.deal(nPlayers, rnd)     → { hands:[...], rows:[...] }  (distribution)
*/
(function (root) {
  'use strict';

  function heads(n) { if (n === 55) return 7; if (n % 11 === 0) return 5; if (n % 10 === 0) return 3; if (n % 5 === 0) return 2; return 1; }
  function sumHeads(row) { var s = 0; for (var i = 0; i < (row || []).length; i++) s += heads(row[i]); return s; }

  // Rangée la moins chère (cas « carte trop basse »).
  function chooseRow(rows) {
    var best = 0, bh = Infinity;
    for (var i = 0; i < rows.length; i++) { var h = sumHeads(rows[i]); if (h < bh) { bh = h; best = i; } }
    return best;
  }

  function chooseCard(rows, hand) {
    if (!hand || !hand.length) return null;
    var best = hand[0], bestScore = Infinity;
    for (var k = 0; k < hand.length; k++) {
      var val = hand[k], tgt = -1, tend = -1;
      for (var i = 0; i < rows.length; i++) { var end = rows[i][rows[i].length - 1]; if (end < val && end > tend) { tend = end; tgt = i; } }
      var headsNow = 0, lenRisk = 0, gap = 0, tie = 0;
      if (tgt < 0) {                                  // trop basse → on prendra une rangée
        var minH = Infinity; for (var j = 0; j < rows.length; j++) minH = Math.min(minH, sumHeads(rows[j]));
        headsNow = minH; tie = val;                   // sacrifier de préférence une carte basse
      } else {
        var row = rows[tgt], len = row.length;
        if (len >= 5) { headsNow = sumHeads(row); gap = val - tend; }   // on ramasse la rangée
        else { lenRisk = len + 1; gap = val - tend; }                   // placement sûr (rangée à len+1)
      }
      var score = headsNow * 1000 + lenRisk * 25 + gap + tie * 0.01;
      if (score < bestScore) { bestScore = score; best = val; }
    }
    return best;
  }

  // Simulation PURE d'un tour : place toutes les cartes par ordre croissant, gère
  // débordement (6e carte) et carte trop basse (le joueur prend la moins chère).
  function resolveTurn(rows, picks) {
    var q = picks.slice().sort(function (a, b) { return a.val - b.val; });
    var gained = {};
    q.forEach(function (it) {
      var val = it.val, tgt = -1, tend = -1;
      for (var i = 0; i < rows.length; i++) { var end = rows[i][rows[i].length - 1]; if (end < val && end > tend) { tend = end; tgt = i; } }
      if (tgt < 0) { var r = chooseRow(rows); gained[it.pid] = (gained[it.pid] || 0) + sumHeads(rows[r]); rows[r] = [val]; return; }
      var row = rows[tgt];
      if (row.length >= 5) { gained[it.pid] = (gained[it.pid] || 0) + sumHeads(row); rows[tgt] = [val]; }
      else row.push(val);
    });
    return { rows: rows, heads: gained };
  }

  // Distribution d'une donne (n joueurs : n×10 cartes + 4 rangées d'1 carte).
  function deal(nPlayers, rnd) {
    rnd = rnd || Math.random;
    var deck = []; for (var i = 1; i <= 104; i++) deck.push(i);
    for (var a = deck.length - 1; a > 0; a--) { var b = Math.floor(rnd() * (a + 1)); var t = deck[a]; deck[a] = deck[b]; deck[b] = t; }
    var hands = []; for (var p = 0; p < nPlayers; p++) hands.push(deck.slice(p * 10, p * 10 + 10).sort(function (x, y) { return x - y; }));
    var rows = []; for (var r = 0; r < 4; r++) rows.push([deck[nPlayers * 10 + r]]);
    return { hands: hands, rows: rows };
  }

  root.SixNimmtAI = { chooseCard: chooseCard, chooseRow: chooseRow, heads: heads, sumHeads: sumHeads, resolveTurn: resolveTurn, deal: deal };
})(typeof module !== 'undefined' && module.exports ? module.exports : (this.window = this.window || this));
