/*
  nav.js — Barre de navigation minimaliste, PARTAGÉE par toutes les pages.
  Plus de login ni de menu Eli/Ludo : juste un retour vers l'accueil (tous les
  jeux) et une bascule clair/sombre (mémorisée dans localStorage 'games-theme').
*/
(function () {
  var THEME_KEY = 'games-theme';

  // Appliquer le thème le plus tôt possible (les pages le pré-appliquent aussi
  // via un petit script inline pour éviter le flash).
  function applyTheme(t) {
    if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
  }
  function currentTheme() {
    try { return localStorage.getItem(THEME_KEY) || 'light'; } catch (e) { return 'light'; }
  }

  function injectStyles() {
    if (document.getElementById('nav-styles')) return;
    var css =
      '.site-nav{position:fixed;top:0;left:0;right:0;height:52px;z-index:1000;display:flex;align-items:center;' +
        'justify-content:space-between;padding:0 14px;background:var(--nav-bg);backdrop-filter:blur(10px);' +
        '-webkit-backdrop-filter:blur(10px);border-bottom:1px solid var(--gold-light);}' +
      '.nav-home{display:flex;align-items:center;gap:7px;text-decoration:none;color:var(--ink);font-weight:700;' +
        'font-family:"DM Sans",sans-serif;font-size:0.98rem;}' +
      '.nav-home .logo{font-size:1.2rem;}' +
      '.nav-theme{background:none;border:1.5px solid var(--gold-light);border-radius:30px;width:38px;height:34px;' +
        'cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:1rem;color:var(--ink);' +
        'transition:all .18s;}' +
      '.nav-theme:hover{border-color:var(--gold);}';
    var s = document.createElement('style');
    s.id = 'nav-styles'; s.textContent = css;
    document.head.appendChild(s);
  }

  function build() {
    injectStyles();
    if (document.querySelector('.site-nav')) return;
    var nav = document.createElement('nav');
    nav.className = 'site-nav';

    var home = document.createElement('a');
    home.className = 'nav-home';
    home.href = 'index.html';
    home.innerHTML = '<span class="logo">🎲</span><span>Les jeux</span>';

    var toggle = document.createElement('button');
    toggle.className = 'nav-theme';
    toggle.type = 'button';
    toggle.setAttribute('aria-label', 'Basculer le thème');
    function refreshIcon() { toggle.textContent = currentTheme() === 'dark' ? '☀️' : '🌙'; }
    refreshIcon();
    toggle.addEventListener('click', function () {
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
      applyTheme(next); refreshIcon();
    });

    nav.appendChild(home);
    nav.appendChild(toggle);
    document.body.insertBefore(nav, document.body.firstChild);
  }

  // ── Lien du manifest (installation « ajouter à l'écran d'accueil ») ─────────
  function injectManifest() {
    try {
      if (!document.querySelector('link[rel="manifest"]')) {
        var l = document.createElement('link'); l.rel = 'manifest'; l.href = '/manifest.webmanifest';
        document.head.appendChild(l);
      }
    } catch (e) {}
  }

  // ── Service worker : disponibilité hors-ligne après une première visite ────
  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    try { navigator.serviceWorker.register('/sw.js').catch(function () {}); } catch (e) {}
  }

  applyTheme(currentTheme());
  injectManifest();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build, { once: true });
  } else { build(); }
  window.addEventListener('load', registerSW);
})();
