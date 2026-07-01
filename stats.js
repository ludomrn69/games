/*
  stats.js — Statistiques LOCALES par jeu (parties jouées, victoires, meilleur temps).

  100 % localStorage, donc HORS-LIGNE et privé à l'appareil. Distinct du « Défi du
  jour » (daily.js, qui gère séries et grilles datées) : ici on cumule TOUTES les
  parties d'un jeu (en ligne comme en solo), pour afficher un petit bilan sur son
  écran d'accueil (« 12 parties · 58 % ✓ · record 1:04 »).

  Alimenté AUTOMATIQUEMENT par les handlers centraux (lobby.js en ligne, offline.js
  en solo) à la fin de chaque partie — aucun code à ajouter dans les jeux.

  API : GameStats.of(gameKey) · GameStats.record(gameKey, {won, timeMs}) ·
        GameStats.summaryHTML(gameKey, fmtTime?) · GameStats.reset(gameKey)
*/
(function (root) {
  function key(g) { return 'stats.' + g + '.v1'; }
  function read(g) { try { return JSON.parse(localStorage.getItem(key(g))) || {}; } catch (e) { return {}; } }
  function write(g, v) { try { localStorage.setItem(key(g), JSON.stringify(v)); } catch (e) {} }

  var Stats = {
    of: function (g) {
      var s = read(g);
      return {
        plays: s.plays || 0, wins: s.wins || 0, bestMs: s.bestMs || null, lastAt: s.lastAt || null,
        winRate: s.plays ? Math.round((s.wins || 0) / s.plays * 100) : 0
      };
    },
    // À la fin d'une partie. `won` = le joueur a gagné ; `timeMs` = son temps (jeux
    // chronométrés) — le meilleur temps n'est retenu que sur une VICTOIRE. Idempotence
    // gérée par l'appelant (un seul enregistrement par partie terminée).
    record: function (g, r) {
      r = r || {};
      var s = read(g);
      s.plays = (s.plays || 0) + 1;
      if (r.won) s.wins = (s.wins || 0) + 1;
      if (r.timeMs && r.won && (!s.bestMs || r.timeMs < s.bestMs)) s.bestMs = r.timeMs;
      s.lastAt = Date.now();
      write(g, s);
      return Stats.of(g);
    },
    reset: function (g) { try { localStorage.removeItem(key(g)); } catch (e) {} },
    // Petit encart HTML (chip) pour l'accueil d'un jeu. Vide tant qu'aucune partie.
    summaryHTML: function (g, fmtTime) {
      var s = Stats.of(g);
      if (!s.plays) return '';
      var parts = [s.plays + (s.plays > 1 ? ' parties' : ' partie'), s.winRate + '% ✓'];
      if (s.bestMs && fmtTime) { try { parts.push('record ' + fmtTime(s.bestMs)); } catch (e) {} }
      return '<div style="margin:-4px 0 16px;font-size:.82rem;color:var(--ink-light)">📊 ' + parts.join(' · ') + '</div>';
    }
  };
  root.GameStats = Stats;
})(typeof window !== 'undefined' ? window : this);
