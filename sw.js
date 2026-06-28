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
var CACHE = 'jeux-v12';
var ASSETS = [
  './', 'index.html', 'theme.css', 'game.css', 'manifest.webmanifest',
  'nav.js', 'avatars.js', 'lobby.js', 'presence.js', 'offline.js', 'firebase-init.js',
  'head.js', 'boot.js', 'p4-ai.js', 'morpion-ai.js',
  'tu-preferes.html', 'petit-bac.html', 'puissance4.html', 'dobble-emoji.html',
  'crack-list.html', 'lynx.html', 'pictionary.html', 'uno.html', 'skyjo.html',
  'blokus.html', 'bataille-navale.html', 'codenames.html', 'morpion.html',
  'undercover.html', 'president.html', 'ludo.html',
  'juste-prix.html', 'telephone-dessine.html',
  'monopoly.html', 'monopoly-engine.js',
  'cluedo.html', 'cluedo-engine.js'
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
      }).catch(function () { return caches.match(req).then(function (m) { return m || caches.match('index.html'); }); })
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
