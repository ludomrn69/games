/*
  head.js — En-tête commun à toutes les pages (mutualise polices, métas, thème).
  Chargé SYNCHRONEMENT tout en haut du <head> :
      <script src="/head.js" data-title="Morpion ⭕" data-emoji="⭕"></script>
  Il :
   • pré-applique le thème sombre (avant le rendu → pas de flash) ;
   • pose le <title>, le favicon (émoji), robots, les polices (auto-hébergées, cf.
     fonts.css + tools/gen-fonts.js — aucun appel réseau externe, donc HORS-LIGNE) et theme.css/game.css.
  Tout est non bloquant et sans ordre critique (les scripts firebase + le <style> de la
  page restent en clair dans la page). Charset/viewport restent dans la page (requis tôt).
*/
(function () {
  try { if (localStorage.getItem('games-theme') === 'dark') document.documentElement.setAttribute('data-theme', 'dark'); } catch (e) {}
  var me = document.currentScript;
  var title = (me && me.getAttribute('data-title')) || 'Les jeux 🎲';
  var emoji = (me && me.getAttribute('data-emoji')) || '🎲';
  var head = document.head || document.getElementsByTagName('head')[0];
  function add(tag, attrs) { var el = document.createElement(tag); for (var k in attrs) { if (attrs[k] === '') el.setAttribute(k, ''); else el.setAttribute(k, attrs[k]); } head.appendChild(el); }
  // Un seul emoji dans l'onglet : celui du FAVICON (icône avant le nom). On retire
  // donc l'émoji final éventuel du titre pour ne pas le doubler visuellement.
  document.title = (title || '').replace(/[^\p{L}\p{N}!?'’.()\- ]+$/u, '').replace(/\s+$/, '') || title;
  add('meta', { name: 'robots', content: 'noindex, nofollow' });
  add('link', { rel: 'icon', href: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>" + emoji + "</text></svg>" });
  // iOS ignore les icônes du manifest : l'« Ajouter à l'écran d'accueil » a besoin
  // d'un apple-touch-icon en PNG (sinon icône blanche). Voir icons/.
  add('link', { rel: 'apple-touch-icon', href: '/icons/apple-touch-icon.png' });
  add('link', { rel: 'stylesheet', href: '/fonts.css' });
  add('link', { rel: 'stylesheet', href: '/theme.css' });
  add('link', { rel: 'stylesheet', href: '/game.css' });
})();
