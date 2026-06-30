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

  // view = { phase, grid:[12], flipped:[12], removed:[12], discardTop, drawnCard,
  //          drawnFrom, oppMinVisibleSum }
  function decide(view, level) {
    var grid = view.grid || [], fl = view.flipped || [], rm = view.removed || [];
    // Taux de coup « au pif » selon le niveau : facile joue souvent sans réfléchir,
    // moyen parfois, difficile JAMAIS (optimisation totale) → 3 niveaux distincts.
    var blunderRate = level === 'easy' ? 0.6 : level === 'normal' ? 0.22 : 0;
    function blunder() { return blunderRate > 0 && Math.random() < blunderRate; }
    function visibles() { var a = []; for (var i = 0; i < 12; i++) if (fl[i] && !rm[i]) a.push(i); return a; }
    function hiddens() { var a = []; for (var i = 0; i < 12; i++) if (!fl[i] && !rm[i]) a.push(i); return a; }
    function maxVisible() { var mi = -1, mv = -Infinity; visibles().forEach(function (i) { if (grid[i] > mv) { mv = grid[i]; mi = i; } }); return { idx: mi, val: mv }; }
    function sumVisible() { var s = 0; visibles().forEach(function (i) { s += grid[i] || 0; }); return s; }
    // Colonne où 2 cartes retournées valent `card` et la 3e est remplaçable.
    function columnTarget(card) {
      for (var col = 0; col < 4; col++) {
        var idx = [col, col + 4, col + 8];
        if (rm[idx[0]] || rm[idx[1]] || rm[idx[2]]) continue;
        var eq = 0, target = -1;
        idx.forEach(function (c) { if (fl[c] && grid[c] === card) eq++; else target = c; });
        if (eq === 2 && target >= 0) return target;
      }
      return -1;
    }
    // Colonne où UNE case visible vaut déjà `card` : meilleure case à remplacer.
    function columnBuild(card) {
      var best = -1, bestGain = -Infinity;
      for (var col = 0; col < 4; col++) {
        var idx = [col, col + 4, col + 8];
        if (rm[idx[0]] || rm[idx[1]] || rm[idx[2]]) continue;
        var match = 0; idx.forEach(function (c) { if (fl[c] && grid[c] === card) match++; });
        if (match !== 1) continue;
        idx.forEach(function (c) {
          if (fl[c] && grid[c] === card) return;
          var gain = fl[c] ? (grid[c] - card) : (EXP - card - 1);
          if (gain > bestGain && gain > 0) { bestGain = gain; best = c; }
        });
      }
      return best;
    }

    // ── Phase de départ : retourner une carte cachée ──────────────────────────
    if (view.phase === 'flip2') {
      var h0 = hiddens(); return h0.length ? { type: 'flip', idx: h0[0] } : null;
    }

    // ── Décision pioche / défausse (pas encore de carte en main) ───────────────
    if (view.drawnCard == null) {
      if (blunder()) return { type: 'drawPile' };
      var top = view.discardTop;
      if (top == null) return { type: 'drawPile' };
      var mv = maxVisible();
      var gainVis = mv.idx >= 0 ? (mv.val - top) : -Infinity;
      var gainHid = hiddens().length ? (EXP - top) : -Infinity;
      var take = Math.max(gainVis, gainHid, columnTarget(top) >= 0 ? 6 : -Infinity);
      return take >= 2 ? { type: 'takeDiscard' } : { type: 'drawPile' };
    }

    // ── Placement de la carte en main ─────────────────────────────────────────
    if (blunder()) {
      var slots = []; for (var z = 0; z < 12; z++) if (!rm[z]) slots.push(z);
      if (slots.length) return { type: 'replace', idx: slots[Math.floor(Math.random() * slots.length)] };
    }
    var card = view.drawnCard, from = view.drawnFrom, mvx = maxVisible();
    var colT = columnTarget(card);
    if (colT >= 0) return { type: 'replace', idx: colT };          // éliminer une colonne
    var colB = columnBuild(card);
    if (from === 'discard') {
      if (colB >= 0 && (mvx.idx < 0 || card <= mvx.val)) return { type: 'replace', idx: colB };
      if (mvx.idx >= 0 && card < mvx.val) return { type: 'replace', idx: mvx.idx };
      if (hiddens().length) return { type: 'replace', idx: hiddens()[0] };
      return { type: 'replace', idx: mvx.idx >= 0 ? mvx.idx : (visibles()[0] || 0) };
    }
    // pioche : bâtir une paire avec une carte basse, sinon échanger / défausser
    if (colB >= 0 && card <= 4) return { type: 'replace', idx: colB };
    var gv = mvx.idx >= 0 ? (mvx.val - card) : -Infinity;
    var gh = hiddens().length ? (EXP - card) : -Infinity;
    if (gv >= gh && gv > 0) return { type: 'replace', idx: mvx.idx };
    // Anti-pénalité : éviter de retourner sa DERNIÈRE carte cachée (= finir la
    // manche) si on n'est pas compétitif (le finisseur non plus bas double son score).
    var myVis = sumVisible(), oppMin = (view.oppMinVisibleSum != null) ? view.oppMinVisibleSum : Infinity;
    var avoidFinish = (hiddens().length === 1) && (myVis > oppMin + 3) && mvx.idx >= 0;
    if (card <= 2 && hiddens().length) return { type: 'replace', idx: avoidFinish ? mvx.idx : hiddens()[0] };
    if (hiddens().length) { if (avoidFinish) return { type: 'replace', idx: mvx.idx }; return { type: 'discardFlip', idx: hiddens()[0] }; }
    return { type: 'replace', idx: mvx.idx >= 0 ? mvx.idx : 0 };
  }

  root.SkyjoAI = { decide: decide, buildDeck: buildDeck, EXP: EXP };
})(typeof module !== 'undefined' && module.exports ? module.exports : (this.window = this.window || this));
