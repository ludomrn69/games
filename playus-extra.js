/*
  playus-extra.js — Brique COMMUNE des mini-jeux Playus Arena, chargée par chaque
  page après sfx.js. Zéro intégration à faire par jeu : elle s'accroche aux ids
  standard de la coquille (score / over / overMsg / finalScore / startBtn /
  replayBtn) et se neutralise proprement si l'un manque.

   • SONS : tick au point marqué, fanfare/descente à la fin (selon Record ou non),
     petit clic sur les boutons — via sfx.js (respecte la bascule 🔔 du site).
   • DUEL (?duel=1) : deux joueurs sur le même appareil — J1 joue, J2 joue,
     comparaison des scores, revanche. Générique : on observe l'écran de fin.
*/
/* ══ MÉDAILLES (partagées accueil + pages de jeu) ═══════════════════════════
   Seuils bronze/argent/or par mini-jeu, comparés au meilleur score local
   (localStorage). SOURCE UNIQUE : l'accueil (index.html) affiche la médaille
   sur la carte, et chaque page de jeu affiche la progression sur son écran de
   fin (« plus que X pour 🥈 »). La clé localStorage est dérivée ici aussi —
   un seul endroit à corriger si un slug change. */
(function (root) {
  'use strict';
  var THRESHOLDS = {
    'center-hit': [5, 15, 30], 'knife-throw': [8, 18, 32], 'color-reflex': [10, 25, 45], 'on-time': [5, 12, 24],
    'perfect-shape': [5, 12, 22], 'target-speed': [10, 25, 45], 'times-up': [10, 25, 45], 'flap': [5, 15, 35],
    'keep-up': [8, 20, 40], 'descend': [10, 30, 60], 'bloopy': [8, 20, 40], 'bouncy': [10, 30, 60],
    'trampbox': [8, 20, 40], 'balldrop': [10, 25, 50], 'ballracer': [10, 30, 60], 'grid': [10, 25, 45],
    'speed-tap': [15, 35, 60], 'swipe-fast': [10, 25, 45], 'react': [8, 18, 32], 'count': [5, 12, 22],
    'call-me': [4, 9, 15], 'slicer': [15, 40, 80], 'balloon-pop': [15, 40, 80], 'drift': [8, 20, 40],
    'zig': [10, 30, 60], 'kenneys-race': [10, 25, 50], 'tilted': [8, 20, 40], 'sword-balance': [8, 20, 40],
    'tower-stack': [10, 25, 45], 'ninja-chop': [15, 35, 65], 'dangerwall': [10, 25, 50], 'astro-glide': [10, 30, 60],
    'jumpy': [10, 25, 50], 'speedgolf': [3, 7, 14], 'color-memory': [5, 10, 18], 'memorizer': [5, 10, 18],
    'memory': [4, 8, 14], 'balls-cups': [5, 10, 18], 'boxguesser': [5, 10, 18], 'snake': [10, 25, 50],
    'piano': [15, 40, 80], 'rhythm': [10, 25, 50]
  };
  var EMOJI = ['🥉', '🥈', '🥇'];
  root.PlayusMedals = {
    THRESHOLDS: THRESHOLDS,
    EMOJI: EMOJI,
    // Clé localStorage du record local — même dérivation que les pages de jeu
    // (« playus_<slug sans tirets>_best »).
    keyOf: function (slug) { return 'playus_' + String(slug).replace(/-/g, '') + '_best'; },
    bestOf: function (slug) {
      try { return +localStorage.getItem(root.PlayusMedals.keyOf(slug)) || 0; } catch (e) { return 0; }
    },
    // '🥇' | '🥈' | '🥉' | '' pour un score donné.
    medalOf: function (slug, score) {
      var th = THRESHOLDS[slug];
      if (!th || !score) return '';
      return score >= th[2] ? EMOJI[2] : score >= th[1] ? EMOJI[1] : score >= th[0] ? EMOJI[0] : '';
    },
    // Ligne de progression pour l'écran de fin : médaille obtenue + prochain palier.
    progressText: function (slug, score) {
      var th = THRESHOLDS[slug];
      if (!th) return '';
      if (score >= th[2]) return '🥇 Médaille d\'or !';
      var m = root.PlayusMedals.medalOf(slug, score);
      var next = score >= th[1] ? 2 : score >= th[0] ? 1 : 0;
      var need = th[next] - score;
      return (m ? m + ' ' : '') + 'Plus que ' + need + ' pour ' + EMOJI[next];
    }
  };

  /* ══ JEU DU JOUR ═══════════════════════════════════════════════════════════
     Le même mini-jeu pour tout le monde chaque jour (tiré selon la date sur
     l'accueil). Ici on suit, 100 % en local : le meilleur score du jour et la
     SÉRIE de jours consécutifs joués. Aucune requête réseau. */
  function ymd(d) { d = d || new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  root.PlayusDaily = {
    KEY: 'playus.daily.v1',
    read: function () { try { return JSON.parse(localStorage.getItem(root.PlayusDaily.KEY)) || {}; } catch (e) { return {}; } },
    write: function (v) { try { localStorage.setItem(root.PlayusDaily.KEY, JSON.stringify(v)); } catch (e) {} },
    state: function () { var s = root.PlayusDaily.read(), t = ymd(); return { streak: s.streak || 0, doneToday: s.last === t, best: (s.scores && s.scores[t]) || 0 }; },
    // À appeler à la fin d'une partie « jeu du jour ». Série += 1 au 1er jeu du
    // jour (remise à 1 si un jour a été sauté), et on garde le meilleur score.
    record: function (score) {
      var s = root.PlayusDaily.read(), t = ymd();
      if (s.last !== t) {
        var y = new Date(); y.setDate(y.getDate() - 1);
        s.streak = (s.last === ymd(y)) ? (s.streak || 0) + 1 : 1;
        s.last = t;
      }
      s.scores = s.scores || {};
      if (!s.scores[t] || score > s.scores[t]) s.scores[t] = score;
      root.PlayusDaily.write(s); return root.PlayusDaily.state();
    }
  };
})(typeof window !== 'undefined' ? window : this);

(function () {
  'use strict';
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
  function sfx(n) { try { if (window.Sfx && Sfx.on()) Sfx.play(n); } catch (e) {} }

  // Animations réduites : les pages Playus ne chargent pas theme.css, on injecte
  // le même garde-fou d'accessibilité ici (les écrans/boutons CSS, pas le canvas).
  try {
    var rm = document.createElement('style');
    rm.textContent = '@media (prefers-reduced-motion: reduce){*,*::before,*::after{animation-duration:0.01ms !important;animation-iteration-count:1 !important;transition-duration:0.01ms !important;scroll-behavior:auto !important}}';
    (document.head || document.documentElement).appendChild(rm);
  } catch (e) {}

  var scoreEl = document.getElementById('score');
  var overEl = document.getElementById('over');
  var overMsg = document.getElementById('overMsg');
  var finalEl = document.getElementById('finalScore');
  var replayBtn = document.getElementById('replayBtn');
  var startBtn = document.getElementById('startBtn');
  var isDaily = /[?&]daily=1/.test(location.search);
  // « Embarqué » = le mini-jeu tourne dans l'iframe d'une page arène (salon).
  function inArena() { try { return window.parent && window.parent !== window; } catch (e) { return true; } }

  // ── Tick sonore quand le score bouge (borné : pas plus d'un tick / 70 ms) ──
  if (scoreEl) {
    var lastTick = 0;
    new MutationObserver(function () {
      var now = Date.now();
      if (now - lastTick < 70) return;
      lastTick = now;
      sfx('score');
    }).observe(scoreEl, { childList: true, characterData: true, subtree: true });
  }

  // ── Fin de partie : fanfare si Record, descente sinon + progression MÉDAILLE ──
  var slug = (location.pathname.match(/playus\/([a-z0-9-]+)\.html/) || [])[1] || '';
  function showMedalProgress() {
    if (!window.PlayusMedals || !finalEl || !overMsg) return;
    if (inArena()) return; // en salon (iframe), l'arène affiche son propre classement
    var score = parseInt((finalEl.textContent || '0').replace(/\D/g, ''), 10) || 0;
    var txt = window.PlayusMedals.progressText(slug, score);
    if (!txt) return;
    var el = document.getElementById('pu-medal');
    if (!el) {
      el = document.createElement('div');
      el.id = 'pu-medal';
      el.style.cssText = 'margin-top:2px;font-weight:800;font-size:1.02rem;color:#ffd45e';
      overMsg.parentNode.insertBefore(el, overMsg.nextSibling);
    }
    el.textContent = txt;
  }
  var wasOver = overEl ? !overEl.classList.contains('hidden') : false;
  if (overEl) {
    new MutationObserver(function () {
      var over = !overEl.classList.contains('hidden');
      if (over && !wasOver) {
        var record = overMsg && /record/i.test(overMsg.textContent || '');
        sfx(record ? 'win' : 'lose');
        showMedalProgress();
        onGameOver();
      }
      wasOver = over;
    }).observe(overEl, { attributes: true, attributeFilter: ['class'] });
  }

  // ── Clic discret sur les boutons de la coquille ──
  document.addEventListener('click', function (e) {
    if (e.target && e.target.closest && e.target.closest('.btn')) sfx('click');
  }, true);

  /* ══ FIN DE PARTIE : jeu du jour (local) + salon (remontée du score) ══
     Plus de « duel local à 2 sur le même appareil » : la compétition passe par
     le SALON en ligne (page arène, mini-jeu embarqué en iframe). Ici on ne fait
     que capturer le score final et le router au bon endroit. */
  function currentScore() { return parseInt((finalEl && finalEl.textContent || '0').replace(/\D/g, ''), 10) || 0; }
  function onGameOver() {
    var sc = currentScore();
    // Jeu du jour (?daily=1) : meilleur score du jour + série, affichés sur l'écran de fin.
    if (isDaily && window.PlayusDaily && overMsg) {
      var st = window.PlayusDaily.record(sc);
      var line = document.getElementById('pu-daily-line');
      if (!line) { line = document.createElement('div'); line.id = 'pu-daily-line'; line.style.cssText = 'margin-top:4px;font-weight:800;color:#ffd45e'; overMsg.parentNode.insertBefore(line, overMsg.nextSibling); }
      line.textContent = '🗓️ Jeu du jour · record ' + (st.best || sc) + (st.streak ? ' · série ' + st.streak + ' 🔥' : '');
    }
    // Salon (iframe) : on remonte le score à la page arène parente.
    if (inArena()) { try { window.parent.postMessage({ type: 'playus-score', slug: slug, score: sc }, '*'); } catch (e) {} }
  }
})();
