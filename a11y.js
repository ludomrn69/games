/*
  a11y.js — Accessibilité TRANSVERSE, appliquée automatiquement à toutes les
  pages de jeu (chargé via common.js). Aucun jeu n'a besoin d'être modifié :
  un décorateur passe sur le DOM (initial + re-rendus, via MutationObserver) et
  pose les attributs ARIA manquants.

   • Modales : role="dialog" + aria-modal + aria-labelledby (sur .modal-title).
   • Régions vivantes : toast (#lb-toast) et bandeau de tour (.turnbar) annoncés
     aux lecteurs d'écran (aria-live) — l'info « à qui de jouer » n'est plus
     purement visuelle.
   • Boutons icône : tout bouton SANS texte lisible (émoji/symbole seul) reçoit
     un aria-label — copié depuis son `title`, sinon depuis la table des
     composants connus (règles « ? », rejouer « ↻ », historique « 📜 »…).

  Débit : le décorateur est déclenché par MutationObserver mais REGROUPÉ (au
  plus une passe toutes les 400 ms) — négligeable même sur les jeux qui
  re-rendent tout leur écran à chaque état.
*/
(function () {
  'use strict';
  if (typeof document === 'undefined') return;

  // Libellés de secours pour les boutons icône connus qui n'auraient pas de title.
  var CLASS_LABELS = [
    ['game-rules-btn', 'Règles du jeu'],
    ['game-restart-btn', 'Nouvelle partie'],
    ['game-stats-btn', 'Statistiques de la partie'],
    ['lb-react-fab', 'Réagir avec un émoji'],
    ['lb-absent-bot', 'Remplacer le joueur absent par un ordi']
  ];

  // Un « texte lisible » = au moins une lettre ou un chiffre. Un bouton dont le
  // contenu est un émoji/symbole seul (« ? », « ↻ », « 📜 », « ✕ ») n'en a pas.
  function hasReadableText(el) {
    return /[\p{L}\p{N}]/u.test(el.textContent || '');
  }

  function labelButtons(rootEl) {
    var btns = rootEl.querySelectorAll('button:not([aria-label]):not([aria-labelledby])');
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      if (hasReadableText(b)) continue;
      var label = b.getAttribute('title');
      if (!label) {
        for (var c = 0; c < CLASS_LABELS.length; c++) {
          if (b.classList.contains(CLASS_LABELS[c][0])) { label = CLASS_LABELS[c][1]; break; }
        }
      }
      if (label) b.setAttribute('aria-label', label);
    }
  }

  var _dlgSeq = 0;
  function decorateModals(rootEl) {
    var modals = rootEl.querySelectorAll('.modal:not([role]), .uno-overlay:not([role])');
    for (var i = 0; i < modals.length; i++) {
      var m = modals[i];
      m.setAttribute('role', 'dialog');
      m.setAttribute('aria-modal', 'true');
      var title = m.querySelector('.modal-title, .uno-overlay-title');
      if (title) {
        if (!title.id) title.id = 'a11y-dlg-' + (++_dlgSeq);
        m.setAttribute('aria-labelledby', title.id);
      }
    }
  }

  function decorateLive() {
    var toast = document.getElementById('lb-toast');
    if (toast && !toast.getAttribute('role')) { toast.setAttribute('role', 'status'); toast.setAttribute('aria-live', 'polite'); }
    var absent = document.getElementById('lb-absent');
    if (absent && !absent.getAttribute('role')) absent.setAttribute('role', 'status');
    var bars = document.querySelectorAll('.turnbar:not([aria-live]), .uno-turn-banner:not([aria-live])');
    for (var i = 0; i < bars.length; i++) bars[i].setAttribute('aria-live', 'polite');
  }

  function pass() {
    try {
      labelButtons(document);
      decorateModals(document);
      decorateLive();
    } catch (e) {}
  }

  // Passe initiale + regroupée sur mutation (les jeux re-rendent par innerHTML).
  var scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(function () { scheduled = false; pass(); }, 400);
  }
  function start() {
    pass();
    if (typeof MutationObserver !== 'undefined') {
      new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
