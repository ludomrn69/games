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
    // Synchronise la couleur de la barre d'adresse mobile (meta posée par head.js).
    try {
      var m = document.querySelector('meta[name="theme-color"]');
      if (m) m.setAttribute('content', t === 'dark' ? '#0e0b12' : '#FDF6EC');
    } catch (e) {}
  }
  // Préférence explicite si l'utilisateur a déjà basculé, sinon on suit le thème
  // du téléphone (prefers-color-scheme). Dès qu'on bascule, une valeur explicite
  // est stockée et prend le dessus sur le système.
  function hasExplicitTheme() {
    try { var t = localStorage.getItem(THEME_KEY); return t === 'dark' || t === 'light'; } catch (e) { return false; }
  }
  function systemTheme() {
    try { return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light'; } catch (e) { return 'light'; }
  }
  function currentTheme() {
    try { var t = localStorage.getItem(THEME_KEY); if (t === 'dark' || t === 'light') return t; } catch (e) {}
    return systemTheme();
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
    home.href = '/index.html';
    home.innerHTML = '<span class="logo">🎲</span><span>Les jeux</span>';

    var toggle = document.createElement('button');
    toggle.className = 'nav-theme';
    toggle.type = 'button';
    toggle.setAttribute('aria-label', 'Basculer le thème');
    function refreshIcon() { toggle.textContent = currentTheme() === 'dark' ? '☀️' : '🌙'; }
    refreshIcon();
    // Tant que l'utilisateur n'a pas fait de choix explicite, on suit le thème du
    // téléphone en temps réel (bascule auto quand l'OS passe en nuit/jour).
    try {
      var mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
      if (mq) {
        var onSys = function () { if (!hasExplicitTheme()) { applyTheme(systemTheme()); refreshIcon(); } };
        if (mq.addEventListener) mq.addEventListener('change', onSys);
        else if (mq.addListener) mq.addListener(onSys);
      }
    } catch (e) {}
    toggle.addEventListener('click', function () {
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
      applyTheme(next); refreshIcon();
    });

    // Bouton son (bip + vibration quand c'est ton tour) — mémorisé.
    var snd = document.createElement('button');
    snd.className = 'nav-theme'; snd.type = 'button'; snd.style.marginLeft = '6px';
    snd.setAttribute('aria-label', 'Activer/couper le son');
    function soundIsOn() { try { return localStorage.getItem('games.sound') !== '0'; } catch (e) { return true; } }
    function refreshSnd() { snd.textContent = soundIsOn() ? '🔔' : '🔕'; }
    refreshSnd();
    snd.addEventListener('click', function () {
      var on = (window.Lobby && Lobby.toggleSound) ? Lobby.toggleSound() : (function () { var v = !soundIsOn(); try { localStorage.setItem('games.sound', v ? '1' : '0'); } catch (e) {} return v; })();
      refreshSnd();
    });

    var right = document.createElement('div'); right.style.display = 'flex'; right.style.alignItems = 'center';
    right.appendChild(snd); right.appendChild(toggle);
    nav.appendChild(home);
    nav.appendChild(right);
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
  // + toast « nouvelle version » : quand un SW mis à jour prend la main (le site
  // a changé depuis le chargement), on propose de recharger tout de suite.
  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    try {
      var hadController = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.register('/sw.js').catch(function () {});
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (!hadController) { hadController = true; return; } // 1ʳᵉ installation : rien à dire
        showUpdateToast();
      });
    } catch (e) {}
  }
  function showUpdateToast() {
    if (document.getElementById('sw-update-toast')) return;
    var t = document.createElement('div');
    t.id = 'sw-update-toast';
    t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:9500;display:flex;align-items:center;gap:10px;' +
      'background:var(--ink);color:var(--cream);padding:10px 12px 10px 18px;border-radius:30px;font-family:"DM Sans",sans-serif;' +
      'font-size:0.88rem;font-weight:600;box-shadow:0 6px 20px rgba(0,0,0,0.3);max-width:92vw';
    t.innerHTML = '✨ Nouvelle version du site disponible' +
      '<button style="border:none;border-radius:30px;padding:6px 14px;cursor:pointer;font-family:inherit;font-weight:700;font-size:0.82rem;' +
      'background:linear-gradient(135deg,var(--terracotta),var(--gold));color:#fff;white-space:nowrap">↻ Recharger</button>';
    t.querySelector('button').onclick = function () { location.reload(); };
    document.body.appendChild(t);
  }

  applyTheme(currentTheme());
  injectManifest();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build, { once: true });
  } else { build(); }
  window.addEventListener('load', registerSW);
})();
