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

  // ── Clavier TRANSVERSE (toutes les pages) ─────────────────────────────────
  // • Contour de focus visible pour la navigation au clavier.
  // • Modales : Échap ferme, Tab reste piégé dedans, focus posé à l'ouverture.
  // • Entrée/Espace activent un contrôle personnalisé (role="button" non natif) —
  //   utile pour les cases de plateau rendues focalisables (voir window.Kbd).
  function injectFocusCSS() {
    if (document.getElementById('a11y-kbd-css')) return;
    var s = document.createElement('style');
    s.id = 'a11y-kbd-css';
    s.textContent =
      ':focus-visible{outline:3px solid var(--gold,#C6985A);outline-offset:2px;border-radius:6px}' +
      '.kbd-cell{cursor:pointer}.kbd-cell:focus-visible{outline:3px solid var(--terracotta,#C4745A);outline-offset:-3px;z-index:3}';
    (document.head || document.documentElement).appendChild(s);
  }
  function isVisible(n) { return !!(n && !n.disabled && (n.offsetWidth || n.offsetHeight || n.getClientRects().length)); }
  function activeModals() {
    var sel = '.modal.active, .lb-modal.active, .uno-overlay.active';
    return Array.prototype.filter.call(document.querySelectorAll(sel), isVisible);
  }
  function focusablesIn(el) {
    return Array.prototype.filter.call(
      el.querySelectorAll('button, [href], input, select, textarea, [tabindex]'),
      function (n) { return n.tabIndex >= 0 && isVisible(n); });
  }
  function closeModal(m) {
    if (m.id && typeof window.closeModal === 'function') { try { window.closeModal(m.id); return; } catch (e) {} }
    m.classList.remove('active');
  }
  function onKeydown(e) {
    var mods = activeModals(), top = mods[mods.length - 1];
    if (top) {
      if (e.key === 'Escape') { closeModal(top); e.preventDefault(); return; }
      if (e.key === 'Tab') {
        var f = focusablesIn(top); if (!f.length) return;
        var first = f[0], last = f[f.length - 1], a = document.activeElement;
        if (e.shiftKey && (a === first || !top.contains(a))) { last.focus(); e.preventDefault(); }
        else if (!e.shiftKey && (a === last || !top.contains(a))) { first.focus(); e.preventDefault(); }
      }
      return;
    }
    // Hors modale : Entrée/Espace « cliquent » un contrôle personnalisé focalisé.
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      var t = e.target;
      if (t && t.getAttribute && t.getAttribute('role') === 'button' &&
          !/^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(t.tagName || '')) {
        t.click(); e.preventDefault();
      }
    }
  }
  var _openModals = (typeof WeakSet !== 'undefined') ? new WeakSet() : null;
  function focusOpenedModals() {
    activeModals().forEach(function (m) {
      if (_openModals && _openModals.has(m)) return;
      if (_openModals) _openModals.add(m);
      var target = m.querySelector('[autofocus]') || focusablesIn(m)[0];
      if (target) { try { target.focus(); } catch (e) {} }
    });
    if (_openModals) {
      // Oublier les modales refermées (pour re-focaliser à la prochaine ouverture).
      var open = activeModals();
      Array.prototype.forEach.call(document.querySelectorAll('.modal, .lb-modal, .uno-overlay'), function (m) {
        if (open.indexOf(m) < 0) _openModals.delete(m);
      });
    }
  }
  function setupKeyboard() {
    injectFocusCSS();
    document.addEventListener('keydown', onKeydown, true);
    if (typeof MutationObserver !== 'undefined') {
      new MutationObserver(focusOpenedModals).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
    }
  }

  // ── window.Kbd.grid : navigation fléchée sur un plateau de cases ───────────
  // Les jeux au plateau (Morpion, Puissance 4, Reversi…) re-rendent leur grille à
  // chaque coup. Un jeu appelle Kbd.grid(container, '.xx-cell', cols) une fois ;
  // le helper (délégation) gère ⬆︎⬇︎⬅︎➡︎ + Entrée/Espace, rend les cases focalisables
  // et restaure le focus sur la même case après un re-rendu.
  window.Kbd = window.Kbd || {};
  window.Kbd.grid = function (container, selector, cols) {
    if (!container || container._kbdGrid) return; // une seule fois
    container._kbdGrid = true;
    var focusIdx = 0;
    function cells() { return Array.prototype.slice.call(container.querySelectorAll(selector)); }
    function decorate() {
      var cs = cells();
      for (var i = 0; i < cs.length; i++) {
        var c = cs[i];
        c.classList.add('kbd-cell');
        if (!c.hasAttribute('tabindex')) c.tabIndex = 0;
        if (!c.getAttribute('role')) c.setAttribute('role', 'button');
      }
      return cs;
    }
    function focusCell(i) {
      var cs = decorate(); if (!cs.length) return;
      focusIdx = Math.max(0, Math.min(cs.length - 1, i));
      try { cs[focusIdx].focus(); } catch (e) {}
    }
    container.addEventListener('keydown', function (e) {
      var cs = decorate(); if (!cs.length) return;
      var cur = cs.indexOf(document.activeElement);
      if (cur < 0) cur = focusIdx;
      var n = typeof cols === 'function' ? cols() : cols;
      var d = 0;
      if (e.key === 'ArrowRight') d = 1;
      else if (e.key === 'ArrowLeft') d = -1;
      else if (e.key === 'ArrowDown') d = n;
      else if (e.key === 'ArrowUp') d = -n;
      else if (e.key === 'Home') { focusCell(0); e.preventDefault(); return; }
      else if (e.key === 'End') { focusCell(cs.length - 1); e.preventDefault(); return; }
      else if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { if (cur >= 0) { cs[cur].click(); e.preventDefault(); } return; }
      else return;
      focusCell(cur + d); e.preventDefault();
    });
    // Après un re-rendu (innerHTML), rendre les nouvelles cases focalisables et,
    // si le focus était dans la grille, le remettre sur la même position.
    if (typeof MutationObserver !== 'undefined') {
      new MutationObserver(function () {
        var had = container.contains(document.activeElement);
        var cs = decorate();
        if (had && cs[focusIdx]) { try { cs[focusIdx].focus(); } catch (e) {} }
      }).observe(container, { childList: true });
    }
    decorate();
  };

  // Passe initiale + regroupée sur mutation (les jeux re-rendent par innerHTML).
  var scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(function () { scheduled = false; pass(); }, 400);
  }
  function start() {
    pass();
    setupKeyboard();
    if (typeof MutationObserver !== 'undefined') {
      new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
