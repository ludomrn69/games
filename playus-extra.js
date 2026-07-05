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
(function () {
  'use strict';
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
  function sfx(n) { try { if (window.Sfx && Sfx.on()) Sfx.play(n); } catch (e) {} }

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

  // ── Fin de partie : fanfare si Record, descente sinon ──
  var wasOver = overEl ? !overEl.classList.contains('hidden') : false;
  if (overEl) {
    new MutationObserver(function () {
      var over = !overEl.classList.contains('hidden');
      if (over && !wasOver) {
        var record = overMsg && /record/i.test(overMsg.textContent || '');
        sfx(record ? 'win' : 'lose');
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
