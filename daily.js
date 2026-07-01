/*
  daily.js — « Défi du jour » PARTAGÉ par les jeux de puzzle solo.

  100 % HORS-LIGNE : la grille du jour ne dépend que de la DATE locale (aucune
  requête réseau), les stats (séries, meilleurs temps) vivent en localStorage, et
  le partage passe par navigator.share / presse-papiers. Rien ici ne peut casser
  le mode avion.

  Mécanique façon LinkedIn : la difficulté MONTE dans la semaine — lundi très
  facile → dimanche très difficile (voir LEVELS). Tout le monde a la même grille
  le même jour (graine = hash de gameKey + date).
*/
(function (root) {
  function two(n) { return (n < 10 ? '0' : '') + n; }
  function ymdOf(d) { return d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate()); }
  var DAYS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
  // Niveau par jour (lundi=0 … dimanche=6) : ça monte en difficulté dans la semaine.
  var LEVELS = ['easy', 'easy', 'normal', 'normal', 'normal', 'hard', 'hard'];

  function read(g) { try { return JSON.parse(localStorage.getItem('daily.' + g + '.v1')) || {}; } catch (e) { return {}; } }
  function write(g, v) { try { localStorage.setItem('daily.' + g + '.v1', JSON.stringify(v)); } catch (e) {} }

  var Daily = {
    // Jour courant : { ymd, dow (0=lundi..6=dimanche), label 'mer. 30/06', day 1..7 }.
    today: function () {
      var d = new Date(), dow = (d.getDay() + 6) % 7;
      return { ymd: ymdOf(d), dow: dow, label: DAYS[dow] + ' ' + two(d.getDate()) + '/' + two(d.getMonth() + 1), day: dow + 1 };
    },
    level: function () { return LEVELS[Daily.today().dow]; },
    levelLabel: function () { return { easy: 'Facile', normal: 'Moyen', hard: 'Difficile' }[Daily.level()]; },
    // Graine déterministe (jeu + date) → même grille pour tous, change chaque jour.
    seed: function (gameKey) {
      var s = (gameKey || 'x') + '|' + Daily.today().ymd, h = 2166136261;
      for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
      return (h >>> 0) || 1;
    },
    // ── Stats locales (localStorage) ──
    stateOf: function (g) {
      var s = read(g), t = Daily.today();
      return { streak: s.streak || 0, last: s.last || null, best: (s.times && s.times[t.ymd]) || null, doneToday: s.last === t.ymd, plays: s.plays || 0 };
    },
    doneToday: function (g) { return read(g).last === Daily.today().ymd; },
    // À appeler quand le défi du jour est RÉUSSI. Gère la série (jours consécutifs)
    // et garde le meilleur temps. Idempotent : rejouer le même jour n'inflate rien.
    record: function (g, timeMs) {
      var s = read(g), t = Daily.today();
      if (s.last !== t.ymd) {
        var y = new Date(); y.setDate(y.getDate() - 1);
        s.streak = (s.last === ymdOf(y)) ? (s.streak || 0) + 1 : 1;
        s.last = t.ymd; s.plays = (s.plays || 0) + 1;
      }
      s.times = s.times || {};
      if (!s.times[t.ymd] || timeMs < s.times[t.ymd]) s.times[t.ymd] = timeMs;
      write(g, s); return Daily.stateOf(g);
    },
    share: function (text) {
      try { if (navigator.share) { navigator.share({ text: text }).catch(function () {}); return 'share'; } } catch (e) {}
      try { if (navigator.clipboard) { navigator.clipboard.writeText(text); return 'copy'; } } catch (e) {}
      return 'none';
    }
  };
  root.Daily = Daily;
})(typeof window !== 'undefined' ? window : this);
