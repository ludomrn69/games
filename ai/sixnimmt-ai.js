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

  function greedyCard(rows, hand) {
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

  // Rangée visée par `val` (-1 si trop basse).
  function targetRow(rows, val) {
    var tgt = -1, tend = -1;
    for (var i = 0; i < rows.length; i++) { var end = rows[i][rows[i].length - 1]; if (end < val && end > tend) { tend = end; tgt = i; } }
    return tgt;
  }

  // IA principale : SIMULATION (Monte-Carlo) du tour. On ne connaît que les rangées
  // et sa main : toutes les autres cartes sont « dehors ». Pour chaque carte de sa
  // main, on tire des mains adverses plausibles parmi les cartes inconnues, on fait
  // jouer les adversaires (gloutons, parfois au hasard), on résout le tour et on
  // compte les têtes ramassées + un petit risque résiduel pour le tour suivant.
  // opts (facultatif) : { nPlayers, sims, rnd }.
  function chooseCard(rows, hand, opts) {
    if (!hand || !hand.length) return null;
    if (hand.length === 1) return hand[0];
    opts = opts || {};
    var rnd = opts.rnd || Math.random;
    var nOpp = Math.max(1, (opts.nPlayers || 4) - 1);
    var known = {}, i, j;
    for (i = 0; i < rows.length; i++) for (j = 0; j < rows[i].length; j++) known[rows[i][j]] = true;
    for (i = 0; i < hand.length; i++) known[hand[i]] = true;
    var unseen = []; for (i = 1; i <= 104; i++) if (!known[i]) unseen.push(i);
    var per = Math.min(hand.length, Math.floor(unseen.length / nOpp));
    if (per < 1) return greedyCard(rows, hand);
    var sims = opts.sims || Math.max(30, Math.min(120, Math.floor(1400 / hand.length)));
    var tot = []; for (i = 0; i < hand.length; i++) tot.push(0);
    for (var s = 0; s < sims; s++) {
      // Mains adverses : tirage partiel (Fisher-Yates) parmi les cartes inconnues.
      var need = per * nOpp, oppPicks = [];
      for (i = 0; i < need; i++) { j = i + Math.floor(rnd() * (unseen.length - i)); var t = unseen[i]; unseen[i] = unseen[j]; unseen[j] = t; }
      for (var o = 0; o < nOpp; o++) {
        var oh = unseen.slice(o * per, o * per + per);
        oppPicks.push(rnd() < 0.7 ? greedyCard(rows, oh) : oh[Math.floor(rnd() * oh.length)]);
      }
      for (var k = 0; k < hand.length; k++) {
        var r2 = [rows[0].slice(), rows[1].slice(), rows[2].slice(), rows[3].slice()];
        var picks = [{ pid: 'me', val: hand[k] }];
        for (o = 0; o < nOpp; o++) picks.push({ pid: 'o' + o, val: oppPicks[o] });
        var res = resolveTurn(r2, picks);
        var cost = res.heads.me || 0;
        // Risque résiduel : ce que la main restante peut encore jouer sans danger.
        var safe = 0, lowest = 105;
        for (j = 0; j < hand.length; j++) {
          if (j === k) continue;
          var tg = targetRow(r2, hand[j]);
          if (tg >= 0 && r2[tg].length < 4) safe++;
          if (hand[j] < lowest) lowest = hand[j];
        }
        if (hand.length > 1 && safe === 0) cost += 1.5;
        tot[k] += cost - safe * 0.15;
      }
    }
    var best = 0;
    for (i = 1; i < hand.length; i++) if (tot[i] < tot[best] - 1e-9) best = i;
    return hand[best];
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

  root.SixNimmtAI = { chooseCard: chooseCard, greedyCard: greedyCard, chooseRow: chooseRow, heads: heads, sumHeads: sumHeads, resolveTurn: resolveTurn, deal: deal };
})(typeof module !== 'undefined' && module.exports ? module.exports : (this.window = this.window || this));
