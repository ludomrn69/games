/*
  sw.js — Service worker : rend le site jouable HORS-LIGNE (avion).

  Après une première visite avec connexion, toutes les pages et scripts du site
  sont mis en cache. Ensuite, le site se charge même sans réseau — les jeux en
  mode « Solo » ou « Local » (voir offline.js) fonctionnent alors entièrement
  hors-ligne. Les modes EN LIGNE (Firebase) nécessitent toujours une connexion.

  Stratégie :
   • Pages HTML / navigations : réseau d'abord, repli sur le cache (contenu frais
     quand on est en ligne, fonctionne quand même hors-ligne).
   • Scripts / styles same-origin : cache d'abord (rapide + hors-ligne), mis à jour
     en arrière-plan.
   • Ressources externes (Firebase, Google Fonts) : réseau seul (pas mises en cache ;
     hors-ligne elles échouent proprement, le mode hors-ligne ne s'en sert pas).
*/
var CACHE = 'jeux-v26';
var ASSETS = [
  './', 'index.html', 'theme.css', 'game.css', 'manifest.webmanifest',
  'nav.js', 'avatars.js', 'lobby.js', 'presence.js', 'offline.js', 'firebase-init.js',
  'head.js', 'boot.js', 'puzzle.js', 'daily.js', 'sfx.js', 'ai/p4-ai.js', 'ai/morpion-ai.js', 'ai/reversi-ai.js', 'ai/dames-ai.js',
  'ai/monopoly-engine.js', 'ai/cluedo-engine.js',
  'ai/bataille-navale-ai.js', 'ai/uno-ai.js', 'ai/president-ai.js', 'ai/skyjo-ai.js', 'ai/sixnimmt-ai.js',
  'ai/papayoo-ai.js', 'ai/trio-ai.js', 'ai/blokus-ai.js', 'ai/mastermind-ai.js', 'ai/millebornes-ai.js',
  'games/petit-bac.html', 'games/puissance4.html', 'games/reversi.html', 'games/dames.html', 'games/blackjack.html', 'games/dobble-emoji.html',
  'games/crack-list.html', 'games/lynx.html', 'games/pictionary.html', 'games/uno.html', 'games/skyjo.html',
  'games/blokus.html', 'games/bataille-navale.html', 'games/codenames.html', 'games/morpion.html',
  'games/undercover.html', 'games/president.html', 'games/ludo.html',
  'games/juste-prix.html', 'games/telephone-dessine.html',
  'games/monopoly.html', 'games/cluedo.html',
  'games/papayoo.html', 'games/trio.html', 'games/sixnimmt.html', 'games/mastermind.html', 'games/themind.html', 'games/2048.html', 'games/sudoku.html', 'games/queens.html', 'games/tango.html', 'games/zip.html', 'games/sutom.html', 'games/solitaire.html', 'games/patches.html', 'games/balatro.html', 'games/millebornes.html', 'games/loupgarou.html', 'games/timesup.html', 'games/lapaye.html'
];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) {
    // addAll échoue en bloc si un fichier manque ; on ajoute donc un par un.
    return Promise.all(ASSETS.map(function (u) { return c.add(u).catch(function () {}); }));
  }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { if (k !== CACHE) return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return; // externe (Firebase, fonts) → réseau natif

  var isPage = req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/';
  if (isPage) {
    // réseau d'abord, repli cache
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () { return caches.match(req).then(function (m) { return m || caches.match('/index.html'); }); })
    );
  } else {
    // cache d'abord, repli réseau (et mise en cache)
    e.respondWith(
      caches.match(req).then(function (m) {
        return m || fetch(req).then(function (res) {
          var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); });
          return res;
        });
      })
    );
  }
});
