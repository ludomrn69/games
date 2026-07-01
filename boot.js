/*
  boot.js — Scripts de corps communs à toutes les pages de jeu. Chargé tout en
  haut du <body>, AVANT le <script> inline du jeu :
      <script src="/boot.js"></script>
      <script src="/boot.js" data-engine="monopoly-engine.js"></script>  (Monopoly/Cluedo)

  Il insère, dans l'ordre et de façon BLOQUANTE (document.write, même origine →
  pas d'« intervention » Chrome qui ne vise que le cross-origin), les scripts
  partagés. L'ordre est garanti, et ils s'exécutent avant le script du jeu qui suit.
*/
(function () {
  var me = document.currentScript;
  var engine = me && me.getAttribute('data-engine');
  var list = ['/nav.js', '/daily.js', '/sfx.js', '/presence.js', '/avatars.js', '/lobby.js', '/offline.js'];
  if (engine) list.push('/' + engine);
  document.write(list.map(function (s) { return '<script src="' + s + '"><\/script>'; }).join(''));
})();
