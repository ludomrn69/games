/*
  fx.js — Petits EFFETS partagés (game feel), 100 % HORS-LIGNE.

  Complète sfx.js (les sons) avec le reste du « juice » :
   • tap universel : chaque <button> du site fait un petit clic + micro-vibration
     (branché UNE fois ici, aucun jeu à modifier) — respecte la bascule son ;
   • Fx.sfx(name) / Fx.vib(pattern) : raccourcis sûrs (no-op si indisponible) ;
   • Fx.count(el, from, to) : compteur animé (score, argent) — généralise celui
     de Balatro ;
   • Fx.pop(el|id) / Fx.shake(el|id) : rejoue une petite animation CSS (classes
     .fx-pop / .fx-shake de game.css) même si l'élément vient d'être re-rendu ;
   • Fx.float(emoji, opts) : émoji flottant (réactions en ligne, célébrations) ;
   • Fx.die(n, px) : HTML d'un dé À POINTS (classe .pipdie de game.css).

  Aucun réseau, aucune dépendance : tout est neutralisé proprement en headless
  (bancs d'essai) comme en avion.
*/
(function (root) {
  'use strict';
  var doc = (typeof document !== 'undefined') ? document : null;

  function soundOn() { try { return localStorage.getItem('games.sound') !== '0'; } catch (e) { return true; } }
  function sfx(name) { try { if (soundOn() && root.Sfx) root.Sfx.play(name); } catch (e) {} }
  function vib(pattern) { try { if (soundOn() && typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(pattern); } catch (e) {} }

  // ── Tap universel sur les boutons (délégation, une seule écoute globale) ────
  // Clic très discret ; les sons « métier » (pose, pioche, gain…) restent joués
  // par chaque jeu au bon moment. Capture : on sonne même si le jeu stoppe la
  // propagation. Les boutons désactivés ne sonnent pas.
  if (doc) {
    doc.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var b = t.closest('button, .lb-btn, .btn-primary, .card-tap');
      if (!b || b.disabled) return;
      sfx('click'); vib(8);
    }, true);
  }

  function elOf(x) { return (typeof x === 'string' && doc) ? doc.getElementById(x) : x; }

  // Rejoue une animation CSS même si la classe est déjà posée (reflow forcé).
  function replay(el, cls) {
    el = elOf(el); if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  // ── Compteur animé (score / argent qui « monte ») ───────────────────────────
  function count(el, from, to, opts) {
    el = elOf(el); if (!el) return;
    opts = opts || {};
    var ms = opts.ms || 500;
    var fmt = opts.fmt || function (v) { try { return v.toLocaleString('fr'); } catch (e) { return String(v); } };
    if (typeof requestAnimationFrame !== 'function' || from === to) { el.textContent = fmt(to); return; }
    var start = null;
    function step(ts) {
      if (start == null) start = ts;
      var p = Math.min(1, (ts - start) / ms);
      var v = Math.round(from + (to - from) * p * (2 - p)); // ease-out
      el.textContent = fmt(v);
      if (p < 1) requestAnimationFrame(step); else el.textContent = fmt(to);
    }
    requestAnimationFrame(step);
  }

  // ── Émoji flottant (réaction d'un joueur, petite célébration locale) ────────
  // opts : { name (étiquette sous l'émoji), x (0..1 de la largeur), size (rem) }
  function float(emoji, opts) {
    if (!doc || !doc.body) return;
    opts = opts || {};
    var el = doc.createElement('div');
    el.className = 'fx-float';
    el.setAttribute('aria-hidden', 'true'); // purement décoratif
    var x = (opts.x != null) ? opts.x : (0.14 + Math.random() * 0.72);
    el.style.left = Math.round(x * 100) + 'vw';
    el.style.bottom = '12vh';
    if (opts.size) el.style.fontSize = opts.size + 'rem';
    el.textContent = emoji;
    if (opts.name) {
      var nm = doc.createElement('span');
      nm.className = 'fx-float-name';
      nm.textContent = opts.name;
      el.appendChild(nm);
    }
    doc.body.appendChild(el);
    setTimeout(function () { try { el.remove(); } catch (e) {} }, 2600);
  }

  // ── Vol d'un élément (carte, jeton, billet…) d'un point A à un point B ──────
  // Fx.flyTo(from, to, html, opts) : pose un clone visuel en position fixe sur
  // `from` puis le fait GLISSER jusqu'à `to` (éléments ou ids). Le jeu reste
  // maître de son état : c'est purement décoratif (retiré tout seul).
  // opts : { ms, scale, rotate, fade, delay, onDone }
  function flyTo(from, to, html, opts) {
    if (!doc || !doc.body || typeof requestAnimationFrame !== 'function') return;
    from = elOf(from); to = elOf(to);
    if (!from || !to) return;
    opts = opts || {};
    var a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
    if ((!a.width && !a.height) || (!b.width && !b.height)) return; // élément caché
    var el = doc.createElement('div');
    el.className = 'fx-fly';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = html;
    el.style.left = (a.left + a.width / 2) + 'px';
    el.style.top = (a.top + a.height / 2) + 'px';
    var dx = (b.left + b.width / 2) - (a.left + a.width / 2);
    var dy = (b.top + b.height / 2) - (a.top + a.height / 2);
    var ms = opts.ms || 620;
    el.style.transition = 'transform ' + ms + 'ms cubic-bezier(0.25, 0.7, 0.3, 1), opacity ' + ms + 'ms ease-in';
    function go() {
      doc.body.appendChild(el);
      requestAnimationFrame(function () { requestAnimationFrame(function () {
        el.style.transform = 'translate(-50%, -50%) translate(' + dx + 'px, ' + dy + 'px) ' +
          'rotate(' + (opts.rotate != null ? opts.rotate : 18) + 'deg) scale(' + (opts.scale != null ? opts.scale : 0.55) + ')';
        if (opts.fade !== false) el.style.opacity = '0.1';
      }); });
      setTimeout(function () {
        try { el.remove(); } catch (e) {}
        if (opts.onDone) { try { opts.onDone(); } catch (e) {} }
      }, ms + 80);
    }
    if (opts.delay) setTimeout(go, opts.delay); else go();
  }

  // Angle stable pour une carte de défausse : pseudo-aléa DÉTERMINISTE dérivé
  // d'une clé (id de carte…) — l'éventail ne « refrétille » pas à chaque rendu.
  function fanAngle(key, max) {
    var h = 0, s = String(key);
    for (var i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    var r = ((h % 1000) + 1000) % 1000 / 1000; // 0..1 stable
    var m = max || 7;
    return Math.round((r * 2 - 1) * m * 10) / 10; // -max..+max, 0.1° près
  }

  // ── Dé à points (HTML) ──────────────────────────────────────────────────────
  // Position des points allumés (grille 3×3, indices 0..8) pour chaque valeur.
  var PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  function die(n, px, extraClass) {
    var on = PIPS[n] || [];
    var cells = '';
    for (var i = 0; i < 9; i++) cells += '<i' + (on.indexOf(i) >= 0 ? ' class="on"' : '') + '></i>';
    var style = px ? ' style="--dpx:' + px + 'px"' : '';
    return '<span class="pipdie' + (extraClass ? ' ' + extraClass : '') + '"' + style + ' aria-label="dé : ' + n + '">' + cells + '</span>';
  }

  root.Fx = {
    sfx: sfx,
    vib: vib,
    count: count,
    pop: function (el) { replay(el, 'fx-pop'); },
    shake: function (el) { replay(el, 'fx-shake'); },
    replay: replay,
    float: float,
    flyTo: flyTo,
    fanAngle: fanAngle,
    die: die
  };
})(typeof window !== 'undefined' ? window : this);
