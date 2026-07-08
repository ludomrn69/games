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
    if (/[?&]duel=1/.test(location.search)) return; // en duel, le panneau duel suffit
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

  /* ══ MODE DUEL (?duel=1) : Joueur 1 puis Joueur 2, même appareil ══ */
  var duel = /[?&]duel=1/.test(location.search);
  if (!duel || !overEl || !finalEl || !replayBtn) { window._puDuel = null; return; }

  var D = { attempt: 1, s: [null, null] };
  var panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;inset:0;z-index:80;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
    'gap:14px;text-align:center;padding:24px;background:rgba(12,10,30,0.88);backdrop-filter:blur(6px);color:#fff;' +
    'font-family:system-ui,-apple-system,"Segoe UI",sans-serif';
  function btnHTML(label) {
    return '<button style="border:none;border-radius:16px;padding:14px 36px;font-size:1.1rem;font-weight:800;cursor:pointer;color:#fff;' +
      'background:linear-gradient(135deg,#ffb020,#ff7a3d);box-shadow:0 8px 24px rgba(255,122,61,.45);font-family:inherit">' + label + '</button>';
  }
  function show(title, sub, label, action) {
    panel.innerHTML = '<div style="font-size:2rem;font-weight:900">' + title + '</div>' +
      (sub ? '<div style="color:#cbbdf5;max-width:300px;line-height:1.4">' + sub + '</div>' : '') + btnHTML(label);
    panel.querySelector('button').onclick = function () { panel.remove(); action(); };
    document.body.appendChild(panel);
  }
  function onGameOver() {
    if (!duel || !D || !finalEl) return; // hors duel : la fin de partie ne fait que sonner
    var sc = parseInt((finalEl.textContent || '0').replace(/\D/g, ''), 10) || 0;
    if (D.attempt === 1) {
      D.s[0] = sc;
      setTimeout(function () {
        show('⚔️ Joueur 1 : ' + sc, 'Passe l\'appareil — à toi Joueur 2 !', '▶ Joueur 2, joue !', function () {
          D.attempt = 2; replayBtn.click();
        });
      }, 700);
    } else {
      D.s[1] = sc;
      var t = D.s[0] === D.s[1] ? '🤝 Égalité ' + D.s[0] + ' – ' + D.s[1]
        : (D.s[0] > D.s[1] ? '🏆 Joueur 1 gagne ' + D.s[0] + ' – ' + D.s[1] : '🏆 Joueur 2 gagne ' + D.s[1] + ' – ' + D.s[0]);
      setTimeout(function () {
        show(t, 'Meilleur score en un essai chacun.', '↻ Revanche', function () {
          D.attempt = 1; D.s = [null, null]; replayBtn.click();
        });
      }, 700);
    }
  }
  // Écran d'accueil du duel : J1 commence.
  if (startBtn) {
    show('⚔️ Duel', 'Un essai chacun, meilleur score gagne.<br>Joueur 1 commence !', '▶ Joueur 1, joue !', function () {
      startBtn.click();
    });
  }
  window._puDuel = D;
})();
