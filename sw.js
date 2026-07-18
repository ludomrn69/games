/*
  sw.js — Service worker : rend le site jouable HORS-LIGNE (avion).

  Après une première visite avec connexion, toutes les pages et scripts du site
  sont mis en cache. Ensuite, le site se charge même sans réseau — les jeux en
  mode « Solo » ou « Local » (voir offline.js) fonctionnent alors entièrement
  hors-ligne. Les modes EN LIGNE (Firebase) nécessitent toujours une connexion.

  Stratégie :
   • Pages HTML / navigations : cache d'abord puis rafraîchissement réseau en
     arrière-plan (« stale-while-revalidate ») → ouverture instantanée, contenu
     mis à jour au prochain chargement, et fonctionne hors-ligne.
   • Scripts / styles same-origin : cache d'abord (rapide + hors-ligne), mis à jour
     en arrière-plan.
   • Polices : auto-hébergées (fonts.css + fonts/*.woff2, même origine) → en cache
     comme le reste, donc rendu identique hors-ligne.
   • Firebase (externe) : réseau seul (pas mis en cache ; hors-ligne il échoue
     proprement, le mode hors-ligne ne s'en sert pas).
*/
// La version est estampillée automatiquement (empreinte du contenu mis en cache)
// par `node tools/gen-sw-version.js` — vérifiée en CI. Ne pas éditer à la main.
var CACHE = 'jeux-18584dfaac';
var ASSETS = [
  './', 'index.html', 'fonts.css', 'game.css', 'theme.css', 'manifest.webmanifest',
  'fonts/caveat-latin-ext.woff2', 'fonts/caveat-latin.woff2', 'fonts/dmsans-latin-ext.woff2', 'fonts/dmsans-latin.woff2', 'fonts/pixelifysans-latin-ext.woff2', 'fonts/pixelifysans-latin.woff2', 'fonts/playfairdisplay-latin-ext.woff2', 'fonts/playfairdisplay-latin.woff2',
  'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
  'a11y.js', 'avatars.js', 'common.js', 'daily.js', 'firebase-init.js', 'fx.js', 'head.js', 'lobby.js', 'nav.js', 'offline.js', 'playus-extra.js', 'presence.js', 'puzzle.js', 'qrcode.js', 'sfx.js', 'stats.js',
  'ai/bataille-navale-ai.js', 'ai/blokus-ai.js', 'ai/cluedo-engine.js', 'ai/dames-ai.js', 'ai/mastermind-ai.js', 'ai/millebornes-ai.js', 'ai/monopoly-engine.js', 'ai/morpion-ai.js', 'ai/openfront-engine.js', 'ai/p4-ai.js', 'ai/papayoo-ai.js', 'ai/president-ai.js', 'ai/reversi-ai.js', 'ai/sixnimmt-ai.js', 'ai/skyjo-ai.js', 'ai/trio-ai.js', 'ai/uno-ai.js',
  'games/2048.html', 'games/balatro.html', 'games/bataille-navale.html', 'games/blackjack.html', 'games/blokus.html', 'games/cluedo.html',
  'games/codenames.html', 'games/crack-list.html', 'games/dames.html', 'games/diamants.html', 'games/dobble-emoji.html', 'games/juste-prix.html',
  'games/lapaye.html', 'games/loupgarou.html', 'games/ludo.html', 'games/lynx.html', 'games/mastermind.html', 'games/millebornes.html',
  'games/mini-metro.html', 'games/mini-motorways.html', 'games/monopoly.html', 'games/morpion.html', 'games/nothanks.html', 'games/openfront.html',
  'games/papayoo.html', 'games/patches.html', 'games/perudo.html', 'games/petit-bac.html', 'games/pictionary.html', 'games/playus/arena.html',
  'games/playus/astro-glide.html', 'games/playus/balldrop.html', 'games/playus/balloon-pop.html', 'games/playus/ballracer.html', 'games/playus/balls-cups.html', 'games/playus/bloopy.html',
  'games/playus/bouncy.html', 'games/playus/boxguesser.html', 'games/playus/call-me.html', 'games/playus/center-hit.html', 'games/playus/color-memory.html', 'games/playus/color-reflex.html',
  'games/playus/count.html', 'games/playus/dangerwall.html', 'games/playus/descend.html', 'games/playus/drift.html', 'games/playus/flap.html', 'games/playus/grid.html',
  'games/playus/jumpy.html', 'games/playus/keep-up.html', 'games/playus/kenneys-race.html', 'games/playus/knife-throw.html', 'games/playus/memorizer.html', 'games/playus/memory.html',
  'games/playus/ninja-chop.html', 'games/playus/on-time.html', 'games/playus/perfect-shape.html', 'games/playus/piano.html', 'games/playus/react.html', 'games/playus/rhythm.html',
  'games/playus/slicer.html', 'games/playus/snake.html', 'games/playus/speed-tap.html', 'games/playus/speedgolf.html', 'games/playus/swipe-fast.html', 'games/playus/sword-balance.html',
  'games/playus/target-speed.html', 'games/playus/tilted.html', 'games/playus/times-up.html', 'games/playus/tower-stack.html', 'games/playus/trampbox.html', 'games/playus/zig.html',
  'games/poker.html', 'games/president.html', 'games/puissance4.html', 'games/queens.html', 'games/reversi.html', 'games/sixnimmt.html',
  'games/skyjo.html', 'games/soiree.html', 'games/solitaire.html', 'games/sudoku.html', 'games/sutom.html', 'games/tango.html',
  'games/telephone-dessine.html', 'games/themind.html', 'games/timesup.html', 'games/trio.html', 'games/undercover.html', 'games/uno.html',
  'games/yams.html', 'games/zip.html'
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

// ── Messages depuis la page (indicateur « prêt pour l'avion » sur l'accueil) ──
//  • CACHE_STATUS : combien de ressources préchargées sont déjà en cache.
//  • PRECACHE     : (re)télécharge tout ce qui manque, puis renvoie le statut.
// La réponse revient via postMessage sur le port fourni (ou le client émetteur).
function cacheStatus() {
  return caches.open(CACHE).then(function (c) {
    return Promise.all(ASSETS.map(function (u) { return c.match(u).then(function (m) { return m ? 1 : 0; }); }));
  }).then(function (arr) {
    var cached = arr.reduce(function (a, b) { return a + b; }, 0);
    var games = ASSETS.filter(function (u) { return u.indexOf('games/') === 0; }).length;
    return { cached: cached, total: ASSETS.length, games: games, ready: cached >= ASSETS.length };
  });
}
self.addEventListener('message', function (e) {
  var data = e.data || {};
  var reply = function (msg) { if (e.ports && e.ports[0]) e.ports[0].postMessage(msg); else if (e.source) e.source.postMessage(msg); };
  if (data.type === 'CACHE_STATUS') {
    e.waitUntil(cacheStatus().then(function (s) { s.type = 'CACHE_STATUS'; reply(s); }));
  } else if (data.type === 'PRECACHE') {
    e.waitUntil(caches.open(CACHE).then(function (c) {
      return Promise.all(ASSETS.map(function (u) { return c.match(u).then(function (m) { return m || c.add(u).catch(function () {}); }); }));
    }).then(cacheStatus).then(function (s) { s.type = 'PRECACHE_DONE'; reply(s); }));
  }
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return; // externe (Firebase) → réseau natif

  var isPage = req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/';
  if (isPage) {
    // « stale-while-revalidate » : on sert la page DEPUIS LE CACHE tout de suite
    // (ouverture quasi instantanée, même en ligne), et on va la rechercher sur le
    // réseau EN ARRIÈRE-PLAN pour rafraîchir le cache → nouvelle version au
    // prochain chargement (le toast « nouvelle version » gère les maj du site).
    // ignoreSearch : le précache contient « games/uno.html » SANS query alors
    // qu'on y navigue avec « ?mode=solo » / « ?room=CODE » (sinon repli raté).
    e.respondWith(
      caches.match(req, { ignoreSearch: true }).then(function (cached) {
        var net = fetch(req).then(function (res) {
          var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); });
          return res;
        }).catch(function () { return cached || caches.match('/index.html'); });
        if (cached) { e.waitUntil(net.catch(function () {})); return cached; } // cache d'abord
        return net;                                                            // 1re visite : réseau
      })
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
