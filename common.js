/*
  common.js — GÉNÉRÉ par tools/gen-common.js — NE PAS ÉDITER À LA MAIN.

  Concaténation, dans l'ordre, des scripts de corps communs aux pages de jeu.
  Chargé par chaque page via une balise bloquante classique (plus de document.write) :
      <script src="/common.js"></script>
  Pour modifier : édite le fichier source concerné puis relance `node tools/gen-common.js`.
  Sources : nav.js, daily.js, stats.js, sfx.js, presence.js, avatars.js, lobby.js, offline.js
*/

// ════════════════════ nav.js ════════════════════
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
    home.href = '/index.html';
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
;

// ════════════════════ daily.js ════════════════════
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
;

// ════════════════════ stats.js ════════════════════
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
;

// ════════════════════ sfx.js ════════════════════
/*
  sfx.js — Sons PARTAGÉS, discrets, 100 % HORS-LIGNE.

  Les sons sont SYNTHÉTISÉS à la volée (Web Audio, oscillateurs) : aucun fichier
  audio à télécharger → fonctionne parfaitement en avion. Tout respecte la bascule
  localStorage 'games.sound' (même réglage que le bip de tour). Rien ici ne touche
  au réseau.

  API : Sfx.play('win'|'lose'|'place'|'click'|'coin'|'flip'|'score'|'error'|'turn'|'big')
*/
(function (root) {
  var ctx = null;
  function on() { try { return localStorage.getItem('games.sound') !== '0'; } catch (e) { return true; } }
  function ac() {
    if (!ctx) { try { ctx = new (root.AudioContext || root.webkitAudioContext)(); } catch (e) { return null; } }
    if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
    return ctx;
  }
  // Une note : { f, to (sweep), dur, type, delay, vol }.
  function tone(o) {
    var c = ac(); if (!c) return;
    var t = c.currentTime + (o.delay || 0);
    var osc = c.createOscillator(), g = c.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.to) { try { osc.frequency.exponentialRampToValueAtTime(o.to, t + o.dur); } catch (e) {} }
    var v = o.vol == null ? 0.2 : o.vol;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    osc.connect(g); g.connect(c.destination);
    osc.start(t); osc.stop(t + o.dur + 0.03);
  }
  function seq(notes, type, vol, step) { notes.forEach(function (f, i) { tone({ f: f, dur: (step || 0.1) * 1.4, type: type, vol: vol, delay: i * (step || 0.1) }); }); }
  var SOUNDS = {
    click: function () { tone({ f: 320, dur: 0.05, type: 'square', vol: 0.10 }); },
    place: function () { tone({ f: 200, to: 130, dur: 0.09, type: 'sine', vol: 0.2 }); },
    flip:  function () { tone({ f: 520, to: 900, dur: 0.05, type: 'triangle', vol: 0.1 }); },
    deal:  function () { tone({ f: 440, to: 300, dur: 0.05, type: 'triangle', vol: 0.12 }); },
    coin:  function () { tone({ f: 988, dur: 0.06, type: 'square', vol: 0.12 }); tone({ f: 1319, dur: 0.1, type: 'square', vol: 0.12, delay: 0.06 }); },
    error: function () { tone({ f: 160, to: 90, dur: 0.18, type: 'sawtooth', vol: 0.16 }); },
    score: function () { tone({ f: 660, to: 990, dur: 0.04, type: 'square', vol: 0.07 }); },
    turn:  function () { tone({ f: 660, dur: 0.12, type: 'sine', vol: 0.2 }); tone({ f: 880, dur: 0.16, type: 'sine', vol: 0.2, delay: 0.12 }); },
    win:   function () { seq([523, 659, 784, 1047], 'triangle', 0.2, 0.1); },
    lose:  function () { seq([392, 330, 262], 'sawtooth', 0.14, 0.14); },
    big:   function () { seq([523, 659, 784, 1047, 1319], 'square', 0.16, 0.07); }
  };

  root.Sfx = {
    on: on,
    play: function (name) { if (!on()) return; var s = SOUNDS[name]; if (s) { try { s(); } catch (e) {} } },
    tone: tone
  };
})(typeof window !== 'undefined' ? window : this);
;

// ════════════════════ presence.js ════════════════════
/*
  presence.js — Présence multijoueur robuste, PARTAGÉE par tous les jeux.

  Différence avec l'ancien site (Eli/Ludo) : la liste des joueurs est DYNAMIQUE.
  On ne connaît pas les joueurs à l'avance — on scanne `players` du salon.

  Mécanique :
   1. Heartbeat : tant qu'on est connecté, on rafraîchit players/<moi>/ts
      (timestamp serveur) toutes les 5 s. Un joueur réellement en ligne a donc
      toujours un ts récent.
   2. onDisconnect : players/<moi>/online repasse à false dès que la socket ferme.
   3. Reaper : toutes les ~8 s on scanne les joueurs. Ceux dont le ts est périmé
      sont repassés hors ligne — et carrément RETIRÉS du salon si la partie n'a
      pas commencé (status 'waiting'), pour que la salle d'attente reste propre.
*/
(function () {
  var HEARTBEAT_MS = 5000;
  var REAP_MS      = 8000;
  var STALE_MS     = 45000; // online ignoré si ts plus vieux que 45 s

  var serverOffset = 0;
  function serverNow() { return Date.now() + serverOffset; }

  var curRoom = null;   // référence du salon (games/rooms/<CODE>)
  var curPid  = null;
  var meRef   = null;   // players/<curPid>
  var beatTimer = null, reapTimer = null;
  var connectedBound = false, offsetBound = false;

  function beat() {
    if (!meRef) return;
    meRef.update({ online: true, ts: firebase.database.ServerValue.TIMESTAMP });
  }

  window.GamePresence = {
    // roomRef : référence Firebase du salon ; pid : identifiant du joueur courant
    start: function (roomRef, pid) {
      if (!roomRef || !pid) return;
      if (typeof firebase === 'undefined' || !firebase.database) return;
      if (curRoom === roomRef && curPid === pid) return;

      // On changeait de joueur/salon : on solde proprement l'ancien.
      if (meRef) {
        if (beatTimer) { clearInterval(beatTimer); beatTimer = null; }
        try { meRef.child('online').onDisconnect().cancel(); } catch (e) {}
        try { meRef.child('online').set(false); } catch (e) {}
      }

      curRoom = roomRef;
      curPid  = pid;
      meRef   = roomRef.child('players/' + pid);

      if (!offsetBound) {
        offsetBound = true;
        try {
          firebase.database().ref('.info/serverTimeOffset').on('value', function (s) {
            serverOffset = s.val() || 0;
          });
        } catch (e) {}
      }

      if (!connectedBound) {
        connectedBound = true;
        try {
          firebase.database().ref('.info/connected').on('value', function (snap) {
            if (snap.val() === true && meRef) {
              meRef.child('online').onDisconnect().set(false);
              beat();
            }
          });
        } catch (e) {}
      } else {
        try { meRef.child('online').onDisconnect().set(false); } catch (e) {}
      }

      beat();
      beatTimer = setInterval(beat, HEARTBEAT_MS);

      if (!reapTimer) {
        reapTimer = setInterval(function () {
          if (!curRoom) return;
          // Transaction : on traite tous les fantômes d'un coup et on SUPPRIME le
          // salon s'il ne reste plus personne (évite les coquilles vides en base).
          curRoom.transaction(function (room) {
            if (!room) return room;
            var players = room.players || {};
            var waiting = (room.status || 'waiting') === 'waiting';
            var changed = false;
            Object.keys(players).forEach(function (p) {
              var d = players[p];
              if (!d) return;
              var stale = serverNow() - (d.ts || 0) > STALE_MS;
              if (!stale) return;
              if (waiting && p !== curPid) {
                // Salle d'attente : on retire le fantôme pour garder la liste nette.
                delete players[p]; changed = true;
              } else if (d.online === true) {
                players[p].online = false; changed = true;
              }
            });
            if (waiting && !Object.keys(players).length) return null; // salon vide → supprimé
            if (!changed) return; // rien à modifier → on abandonne (pas d'écriture)
            return room;
          });
        }, REAP_MS);
      }
    },

    // Annule proprement (quand on quitte le salon volontairement).
    stop: function () {
      if (beatTimer) { clearInterval(beatTimer); beatTimer = null; }
      if (meRef) {
        try { meRef.child('online').onDisconnect().cancel(); } catch (e) {}
      }
      meRef = null; curRoom = null; curPid = null;
    }
  };
})();
;

// ════════════════════ avatars.js ════════════════════
/*
  avatars.js — Palette d'avatars PARTAGÉE par tous les jeux.

  Un joueur choisit un émoji (son avatar visible) dans le lobby ; le site lui
  attribue en plus une COULEUR (pions, bordures, scores) prise dans une palette
  en évitant les doublons dans le salon. Repris de l'esprit de
  « quizz cremailleres/src/config.js ».
*/
(function () {
  // Couleurs assez contrastées entre elles (max ~12 joueurs).
  var COLORS = [
    '#C4745A', '#5B7EC7', '#8B9E7E', '#C6985A', '#B0689B',
    '#4FA3A5', '#D98E48', '#7E6BC4', '#CC6677', '#5C9E5C',
    '#3E7CB1', '#A05A8A'
  ];

  // Émojis proposés dans la grille (animaux + quelques têtes rigolotes).
  var EMOJIS = [
    '🦊', '🐼', '🐧', '🦁', '🐸', '🐰', '🦄', '🐵',
    '🐯', '🐨', '🐷', '🐙', '🦉', '🐝', '🦋', '🐬',
    '🦕', '🐢', '🦔', '🐳', '🦓', '🦒', '🐺', '🐲',
    '🦩', '🐌', '🐡', '🦦', '🦥', '🐹', '🐔', '🦅',
    '🐈', '🐶', '🦂', '🦞', '🐊', '🦛', '🦘', '🦨',
    '👽', '🤖', '🎃', '👻', '🦖', '🐞', '🦀', '🐠'
  ];

  // Renvoie une couleur libre dans le salon (sinon une au hasard).
  function pickColor(players) {
    var used = {};
    Object.keys(players || {}).forEach(function (k) {
      var c = players[k] && players[k].color;
      if (c) used[c] = true;
    });
    var free = COLORS.filter(function (c) { return !used[c]; });
    if (free.length) return free[Math.floor(Math.random() * free.length)];
    return COLORS[Math.floor(Math.random() * COLORS.length)];
  }

  // Premier émoji non pris dans le salon (pour pré-sélectionner dans la grille).
  function firstFreeEmoji(players) {
    var used = {};
    Object.keys(players || {}).forEach(function (k) {
      var e = players[k] && players[k].emoji;
      if (e) used[e] = true;
    });
    var free = EMOJIS.filter(function (e) { return !used[e]; });
    return free.length ? free[0] : EMOJIS[0];
  }

  window.Avatars = {
    COLORS: COLORS,
    EMOJIS: EMOJIS,
    pickColor: pickColor,
    firstFreeEmoji: firstFreeEmoji
  };
})();
;

// ════════════════════ lobby.js ════════════════════
/*
  lobby.js — Moteur de SALON partagé par tous les jeux (remplace l'ancien couple
  games-common.js + auth.js). AUCUN login.

  Ce qu'il fournit, une fois pour toutes, à chaque page de jeu :
   • Écran ACCUEIL  : « Créer une partie » ou « Rejoindre avec un code ».
   • Écran IDENTITÉ : prénom + choix d'un émoji (avatar), mémorisés sur l'appareil.
   • Écran SALLE D'ATTENTE : code du salon + partage, liste des joueurs (avatar,
     pastille en ligne), bouton « Prêt ». La partie démarre AUTOMATIQUEMENT quand
     tous les joueurs en ligne sont prêts (et qu'on a atteint le minimum).

  Un jeu s'enregistre via GameRoom({...}) :
     gameKey     : identifiant unique du jeu        (ex. 'puissance4')   [requis]
     name        : titre affiché                     (ex. 'Puissance 4')  [requis]
     emoji       : émoji du jeu                       (ex. '🔴')          [option]
     tagline     : sous-titre court                                       [option]
     minPlayers  : joueurs minimum pour démarrer      (défaut 2)
     maxPlayers  : joueurs maximum                    (défaut 8)
     rules       : tableau de chaînes (règles rapides, écran accueil)     [option]
     onState     : handler 'value' du jeu — reçoit le snapshot du salon   [requis]
     onStart     : (orderedPlayers, room) → objet de champs à fusionner   [option]
                   dans le salon au lancement (board, turn, deck…)
     beforeJoin  : appelé avant d'entrer en salle d'attente               [option]
     afterJoin   : appelé après être entré en salle d'attente             [option]
     onLeave     : nettoyage spécifique au jeu quand on quitte            [option]

  Variables globales partagées (lues/écrites par les pages de jeu) :
     window.roomRef (= window.gameRef alias), window.myPid, window.room
  Helpers de lecture : window.Room.* (voir plus bas).
*/
(function () {
  var ROOT = window.GAMES_ROOT || 'games';
  var ID_KEY = 'games.identity.v1';
  var PID_KEY = 'games.pid';
  var CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // lettres + chiffres, sans I/O/0/1 (lisibilité)
  var CODE_LEN = 5;

  function cfg() { return window.ROOM || {}; }
  function db() { return firebase.database(); }

  // ── Identité de l'appareil ────────────────────────────────────────────────
  function getPid() {
    // Auth anonyme active → l'uid cryptographique fait office d'identité (impossible
    // à usurper dans la console). Sinon, identité stable localStorage (comportement actuel).
    if (window.GAMES_UID) return window.GAMES_UID;
    var p = null;
    try { p = localStorage.getItem(PID_KEY); } catch (e) {}
    if (!p) {
      p = 'p_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
      try { localStorage.setItem(PID_KEY, p); } catch (e) {}
    }
    return p;
  }
  function getIdentity() {
    try { var raw = localStorage.getItem(ID_KEY); if (raw) return JSON.parse(raw); } catch (e) {}
    return null;
  }
  function saveIdentity(id) {
    try { localStorage.setItem(ID_KEY, JSON.stringify(id)); } catch (e) {}
  }

  // ── Écrans / modales / toast ──────────────────────────────────────────────
  window.showScreen = function (id) {
    document.querySelectorAll('.screen').forEach(function (s) { s.classList.remove('active'); });
    var el = document.getElementById(id);
    if (el) el.classList.add('active');
    // Le bouton flottant « revoir le plateau » ne survit pas à un changement d'écran
    // (sauf quand c'est lui qui affiche le plateau de jeu).
    if (id !== 's-playing') { var pb = document.getElementById('lb-peek'); if (pb) pb.style.display = 'none'; }
  };
  window.openModal = function (id) { var m = document.getElementById(id); if (m) m.classList.add('active'); };
  window.closeModal = function (id) { var m = document.getElementById(id); if (m) m.classList.remove('active'); };
  window.lbToast = function (msg) {
    var t = document.getElementById('lb-toast');
    if (!t) { t = document.createElement('div'); t.id = 'lb-toast'; t.className = 'lb-toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._timer); t._timer = setTimeout(function () { t.classList.remove('show'); }, 2200);
  };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  // Échappement HTML PARTAGÉ : les jeux font « var escapeHtml = window.esc; »
  // au lieu de redéfinir la même fonction dans chaque page.
  window.esc = esc;

  // ── Helpers de lecture du salon (utilisés par les jeux) ───────────────────
  window.Room = {
    players: function () { return (window.room && window.room.players) || {}; },
    // tous les joueurs du salon, triés par siège (ordre d'arrivée)
    list: function () {
      var ps = window.Room.players();
      return Object.keys(ps).map(function (k) { var o = Object.assign({ pid: k }, ps[k]); return o; })
        .sort(function (a, b) { return (a.seat || 0) - (b.seat || 0); });
    },
    // pids participant à la manche en cours (figés au lancement), dans l'ordre des tours
    order: function () { return (window.room && window.room.order) || []; },
    get: function (pid) { return window.Room.players()[pid] || null; },
    name: function (pid) { var p = window.Room.get(pid); return p ? p.name : '?'; },
    emoji: function (pid) { var p = window.Room.get(pid); return p ? p.emoji : '❓'; },
    color: function (pid) { var p = window.Room.get(pid); return (p && p.color) || 'var(--gold)'; },
    me: function () { return window.Room.get(window.myPid); },
    isMe: function (pid) { return pid === window.myPid; },
    // pid suivant dans l'ordre des tours (cyclique)
    next: function (pid) {
      var ord = window.Room.order(); if (!ord.length) return pid;
      var i = ord.indexOf(pid); return ord[(i + 1) % ord.length];
    },
    // petite pastille avatar (HTML) : émoji sur fond coloré
    avatarHTML: function (pid, size) {
      var p = window.Room.get(pid) || {}; size = size || 42;
      return '<span class="lb-avatar" style="width:' + size + 'px;height:' + size + 'px;font-size:' +
        Math.round(size * 0.55) + 'px;--av-color:' + (p.color || 'var(--gold)') + '">' + (p.emoji || '❓') + '</span>';
    }
  };

  // ── Alerte « c'est ton tour » (son + vibration), partagée ─────────────────
  // Un jeu n'a rien à faire : masterOnState (en ligne) et offline.js (hors-ligne)
  // appellent turnAlertFor(room) à chaque changement d'état ; le bip + la vibration
  // ne se déclenchent qu'au PASSAGE à ton tour. Désactivable (localStorage games.sound).
  var _lastMine = false, _audioCtx = null;
  function soundOn() { try { return localStorage.getItem('games.sound') !== '0'; } catch (e) { return true; } }
  function beep() {
    if (!soundOn()) return;
    try {
      _audioCtx = _audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (_audioCtx.state === 'suspended') _audioCtx.resume();
      var o = _audioCtx.createOscillator(), g = _audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = 880; o.connect(g); g.connect(_audioCtx.destination);
      var t = _audioCtx.currentTime; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32); o.start(t); o.stop(t + 0.34);
    } catch (e) {}
  }
  window.Lobby = window.Lobby || {};
  window.Lobby.toggleSound = function () { var on = !soundOn(); try { localStorage.setItem('games.sound', on ? '1' : '0'); } catch (e) {} if (on) beep(); return on; };
  window.Lobby.soundOn = soundOn;
  window.Lobby.turnAlertFor = function (room) {
    var mine = !!(room && room.status === 'playing' && !room.winner && room.turn === window.myPid);
    if (mine && !_lastMine) { if (window.Sfx) Sfx.play('turn'); else beep(); try { if (soundOn() && navigator.vibrate) navigator.vibrate(180); } catch (e) {} }
    _lastMine = mine;
    updateTurnClock(room);
  };

  // ── Chrono de tour — pastille flottante, jeux EN LIGNE au tour par tour ───────
  // Compte à rebours local depuis le dernier changement de `turn`. À zéro, si un
  // JOUEUR HUMAIN traîne (ou s'est déconnecté), l'HÔTE joue un coup légal à sa
  // place via l'IA du jeu (cfg.bot) — la partie ne reste jamais bloquée.
  //   • EN LIGNE uniquement : en solo/local (mode avion) le chrono est masqué et
  //     rien n'est joué automatiquement → le hors-ligne n'est pas touché.
  //   • Réutilise le mécanisme « l'hôte pilote les ordis » : aucun double coup.
  var _clockTurn = null, _clockStart = 0, _clockInt = null, _timedOutTurn = null;
  var TURN_SECONDS_DEFAULT = 40;
  // Temps adapté à chaque jeu (secondes). Un jeu peut surcharger via cfg.turnSeconds.
  var TURN_SECONDS_BY_GAME = {
    morpion: 20, puissance4: 25, reversi: 35, dames: 45, mastermind: 40,
    uno: 30, skyjo: 35, president: 35, papayoo: 40, millebornes: 40, trio: 25, blackjack: 25,
    blokus: 45, ludo: 25, monopoly: 60, cluedo: 45, 'bataille-navale': 30
  };
  function turnSecondsFor() { var c = cfg() || {}; return c.turnSeconds || TURN_SECONDS_BY_GAME[c.gameKey] || TURN_SECONDS_DEFAULT; }
  function isOfflineMode() { try { var m = new URLSearchParams(location.search).get('mode'); return m === 'solo' || m === 'local'; } catch (e) { return false; } }
  function turnClockEl() {
    var el = document.getElementById('lb-turnclock');
    if (!el) { el = document.createElement('div'); el.id = 'lb-turnclock'; el.className = 'lb-turnclock'; document.body.appendChild(el); }
    return el;
  }
  function updateTurnClock(room) {
    var active = room && room.status === 'playing' && !room.winner && room.turn;
    // Au moins 2 HUMAINS dans la manche (exclut solo + ordis) et jeu EN LIGNE.
    var humans = active && room.order ? room.order.filter(function (pid) { return room.players[pid] && !room.players[pid].isBot; }) : [];
    var multi = humans.length >= 2 && !isOfflineMode();
    if (!active || !multi) { if (_clockInt) { clearInterval(_clockInt); _clockInt = null; } var e = document.getElementById('lb-turnclock'); if (e) e.style.display = 'none'; _clockTurn = null; return; }
    if (room.turn !== _clockTurn) { _clockTurn = room.turn; _clockStart = Date.now(); _timedOutTurn = null; }
    if (_clockInt) clearInterval(_clockInt);
    var total = turnSecondsFor();
    var render = function () {
      var left = Math.max(0, total - Math.floor((Date.now() - _clockStart) / 1000));
      var el = turnClockEl(); el.style.display = 'block';
      var mine = room.turn === window.myPid;
      el.textContent = '⏱ ' + left + 's' + (mine ? ' — à toi' : '');
      el.className = 'lb-turnclock' + (left <= 10 ? ' urgent' : '') + (mine ? ' mine' : '');
      if (left <= 0) {
        clearInterval(_clockInt); _clockInt = null;
        if (_timedOutTurn !== _clockTurn) { _timedOutTurn = _clockTurn; timeoutActivePlayer(window.room); }
      }
    };
    render(); _clockInt = setInterval(render, 1000);
  }
  // Joue un coup pour le joueur actif humain qui a dépassé le temps (hôte seulement).
  function timeoutActivePlayer(room) {
    var c = cfg();
    if (!c || !c.bot || !room || room.status !== 'playing' || room.winner) return;
    if (room.host !== window.myPid) return;              // seul l'hôte pilote (comme les ordis)
    if (isOfflineMode()) return;                          // sécurité : jamais en mode avion
    var pid = botActivePid(room), p = pid && room.players && room.players[pid];
    if (!p || p.isBot) return;                            // uniquement à la place d'un HUMAIN
    var saved = window.myPid; window.myPid = pid;
    try { c.bot(JSON.parse(JSON.stringify(room)), pid); }
    catch (e) { console.error('timeout autoplay', e); }
    finally { window.myPid = saved; }
  }

  // ── Difficulté des ordis (partagée par tous les jeux) ─────────────────────
  // Niveau stocké dans le salon (room.difficulty) : 'easy' | 'normal' | 'hard'.
  // Les bots de chaque jeu lisent window.Bots.level(state) et adaptent soit leur
  // profondeur de recherche (Puissance 4, Morpion), soit leur taux d'« erreur »
  // (jeux à heuristique : ils jouent parfois un coup au hasard en facile).
  window.Bots = {
    LEVELS: ['easy', 'normal', 'hard'],
    LABELS: { easy: 'Facile', normal: 'Moyen', hard: 'Difficile' },
    level: function (state) {
      var d = (state && state.difficulty) || (window.room && window.room.difficulty) || 'normal';
      return (d === 'easy' || d === 'hard') ? d : 'normal';
    },
    // Choisit une valeur selon le niveau : pick(state, {easy:.., normal:.., hard:..}).
    pick: function (state, m) { var l = window.Bots.level(state); return (m[l] !== undefined) ? m[l] : m.normal; },
    // Probabilité, par niveau, de jouer un coup volontairement sous-optimal (au
    // hasard parmi les coups légaux). Espacement net : DIFFICILE ne se trompe JAMAIS
    // (force maximale), MOYEN se trompe parfois (1 coup sur 5), FACILE souvent (plus
    // d'1 coup sur 2) → trois niveaux franchement différents.
    blunderP: function (state) { return window.Bots.pick(state, { easy: 0.55, normal: 0.2, hard: 0 }); },
    // true s'il faut jouer un coup au hasard ce tour-ci (selon le niveau).
    shouldBlunder: function (state) { return Math.random() < window.Bots.blunderP(state); }
  };

  // ── Firebase / salon ──────────────────────────────────────────────────────
  function setRoom(code) {
    window.roomCode = code;
    window.roomRef = db().ref(ROOT + '/rooms/' + code);
    window.gameRef = window.roomRef; // alias pour faciliter le portage des jeux
  }
  function genCode() {
    var s = '';
    for (var i = 0; i < CODE_LEN; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    return s;
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  window.GameRoom = function (config) {
    window.ROOM = config || {};
    function begin() {
      window.myPid = getPid();
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
      } else { init(); }
    }
    // Auth anonyme active mais uid pas encore prêt : on attend l'uid pour que le
    // salon soit créé/rejoint sous la bonne identité (repli 2,5 s si l'auth traîne).
    if (window.GAMES_USE_AUTH && !window.GAMES_UID && window.whenGamesAuth) {
      var done = false, go = function () { if (done) return; done = true; begin(); };
      window.whenGamesAuth(go);
      setTimeout(go, 2500);
    } else { begin(); }
  };

  function init() {
    renderHome();
    var params = new URLSearchParams(location.search);
    var code = (params.get('room') || '').trim().toUpperCase();
    if (code) joinRoomByCode(code, true);
    else window.showScreen('s-home');
  }

  // Encart « Défi du jour » (jeux de puzzle solo) — grille du jour + série.
  function dailyHomeHTML(c) {
    var t = window.Daily.today(), st = window.Daily.stateOf(c.gameKey);
    var sub = st.doneToday
      ? ('✅ Fait aujourd\'hui' + (st.best && window.Puzzle ? ' en ' + window.Puzzle.fmtTime(st.best) : ''))
      : ('Difficulté du jour : ' + window.Daily.levelLabel());
    var streak = st.streak > 0 ? ' · série ' + st.streak + ' 🔥' : '';
    return '<button class="lb-btn" style="background:linear-gradient(135deg,var(--terracotta),var(--gold));color:#fff" onclick="Lobby.goDaily()">🗓️ Défi du jour — ' + esc(t.label) + '</button>' +
      '<div style="margin:-6px 0 16px;font-size:0.82rem;color:var(--ink-light)">' + sub + streak + '</div>';
  }

  // ── Écran ACCUEIL d'un jeu ────────────────────────────────────────────────
  function renderHome() {
    var host = document.getElementById('s-home');
    if (!host) return;
    var c = cfg();
    var min = c.minPlayers || 2, max = c.maxPlayers || 8;
    var range = (min === max) ? (min + ' joueurs') : (min + ' à ' + max + ' joueurs');
    var rules = (c.rules || []).map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('');
    host.innerHTML =
      '<div class="lb-wrap">' +
        (c.emoji ? '<div class="lb-emoji-big">' + c.emoji + '</div>' : '') +
        '<h1 class="lb-title">' + esc(c.name || 'Jeu') + '</h1>' +
        '<p class="lb-sub">' + esc(c.tagline || '') + (c.tagline ? ' · ' : '') + range + '</p>' +
        ((c.offline && c.offline.daily && window.Daily) ? dailyHomeHTML(c) : '') +
        (window.GameStats ? GameStats.summaryHTML(c.gameKey, window.Puzzle ? Puzzle.fmtTime : null) : '') +
        '<button class="lb-btn" onclick="Lobby.createRoom()">Créer une partie</button>' +
        '<div style="margin:18px 0 8px;color:var(--ink-light);font-size:0.85rem">ou rejoindre avec un code</div>' +
        '<input id="lb-join-code" class="lb-input code" maxlength="5" placeholder="CODE" autocomplete="off" autocapitalize="characters" inputmode="text">' +
        '<button class="lb-btn ghost" onclick="Lobby.joinFromInput()">Rejoindre</button>' +
        (c.offline ? ('<div style="margin:18px 0 6px;color:var(--ink-light);font-size:0.85rem">ou sans connexion ✈️</div>' +
          (c.offline.solo ? '<button class="lb-btn ghost" onclick="Lobby.goOffline(\'solo\')">' + (c.offline.soloNoBots ? '⏱ Solo (chrono)' : '🤖 Solo (contre l\'ordi)') + '</button>' : '') +
          (c.offline.local ? '<button class="lb-btn ghost" onclick="Lobby.goOffline(\'local\')">📱 Local (même appareil)</button>' : '')) : '') +
        (rules ? '<div class="lb-code-card" style="text-align:left;margin-top:24px"><div class="lb-code-label">Règles rapides</div><ul style="list-style:none;margin-top:6px;display:flex;flex-direction:column;gap:6px;font-size:0.86rem;color:var(--ink-light)">' + rules + '</ul></div>' : '') +
        '<a class="lb-link" href="/index.html">← Tous les jeux</a>' +
      '</div>';
    var inp = document.getElementById('lb-join-code');
    if (inp) {
      inp.addEventListener('input', function () { inp.value = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') joinFromInput(); });
    }
  }

  function joinFromInput() {
    var inp = document.getElementById('lb-join-code');
    var code = (inp && inp.value || '').trim().toUpperCase();
    if (code.length < CODE_LEN) { lbToast('Entre les 5 caractères du code'); return; }
    joinRoomByCode(code, false);
  }

  // ── Créer un salon ────────────────────────────────────────────────────────
  function createRoom(attempt) {
    attempt = attempt || 0;
    var c = cfg();
    var code = genCode();
    setRoom(code);
    window.roomRef.transaction(function (cur) {
      if (cur) return; // code déjà pris (rarissime) → la transaction abandonne
      return { game: c.gameKey, status: 'waiting', host: window.myPid, createdAt: firebase.database.ServerValue.TIMESTAMP };
    }, function (err, committed) {
      if (err) { lbToast('Connexion impossible'); return; }
      if (!committed) {
        // Code déjà pris : on retente automatiquement avec un nouveau code.
        if (attempt < 5) { createRoom(attempt + 1); return; }
        lbToast('Réessaie'); return;
      }
      // refléter le code dans l'URL (lien partageable, survit au rafraîchissement)
      try { history.replaceState(null, '', location.pathname + '?room=' + code); } catch (e) {}
      ensureIdentityThenEnter();
    });
  }

  // ── Rejoindre un salon par code ───────────────────────────────────────────
  function joinRoomByCode(code, fromUrl) {
    db().ref(ROOT + '/rooms/' + code).once('value').then(function (snap) {
      var room = snap.val();
      if (!room) { lbToast('Salon introuvable'); if (fromUrl) window.showScreen('s-home'); return; }
      // Mauvais jeu pour cette page → on redirige vers la bonne page de jeu.
      if (room.game && room.game !== cfg().gameKey) {
        location.href = '/games/' + room.game + '.html?room=' + code; return;
      }
      var players = room.players || {};
      var iAmIn = !!players[window.myPid];
      var onlineCount = Object.keys(players).filter(function (k) { return players[k].online; }).length;
      var max = cfg().maxPlayers || 8;
      if (!iAmIn && room.status !== 'waiting') { lbToast('La partie a déjà commencé'); if (fromUrl) window.showScreen('s-home'); return; }
      if (!iAmIn && onlineCount >= max) { lbToast('Salon complet'); if (fromUrl) window.showScreen('s-home'); return; }
      setRoom(code);
      if (!fromUrl) { try { history.replaceState(null, '', location.pathname + '?room=' + code); } catch (e) {} }
      ensureIdentityThenEnter();
    }).catch(function () { lbToast('Connexion impossible'); });
  }

  // ── Identité (prénom + émoji) ──────────────────────────────────────────────
  function ensureIdentityThenEnter() {
    var id = getIdentity();
    if (id && id.name && id.emoji) { enterRoom(); }
    else renderIdentity();
  }

  function renderIdentity(forChange) {
    var host = document.getElementById('s-identity');
    if (!host) return;
    var id = getIdentity() || {};
    var players = (window.room && window.room.players) || {};
    var chosen = id.emoji || (window.Avatars && Avatars.firstFreeEmoji(players)) || '🦊';
    var grid = (window.Avatars ? Avatars.EMOJIS : []).map(function (e) {
      return '<button type="button" class="lb-emoji' + (e === chosen ? ' selected' : '') + '" data-emoji="' + e + '">' + e + '</button>';
    }).join('');
    host.innerHTML =
      '<div class="lb-wrap">' +
        '<h1 class="lb-title" style="font-size:clamp(1.6rem,6vw,2.2rem)">Qui es-tu ?</h1>' +
        '<p class="lb-sub">Choisis un émoji et entre ton prénom</p>' +
        '<div class="lb-emoji-grid" id="lb-emoji-grid">' + grid + '</div>' +
        '<input id="lb-name" class="lb-input" maxlength="14" placeholder="Ton prénom" autocomplete="off" value="' + esc(id.name || '') + '">' +
        '<button class="lb-btn" onclick="Lobby.submitIdentity()">C’est parti</button>' +
        (forChange ? '<button class="lb-link" onclick="Lobby.cancelChange()">Annuler</button>' : '') +
      '</div>';
    var g = document.getElementById('lb-emoji-grid');
    g.addEventListener('click', function (e) {
      var b = e.target.closest('.lb-emoji'); if (!b) return;
      g.querySelectorAll('.lb-emoji').forEach(function (x) { x.classList.remove('selected'); });
      b.classList.add('selected'); g._chosen = b.dataset.emoji;
    });
    g._chosen = chosen;
    var nm = document.getElementById('lb-name');
    nm.addEventListener('keydown', function (e) { if (e.key === 'Enter') submitIdentity(); });
    window.showScreen('s-identity');
    setTimeout(function () { nm.focus(); }, 120);
  }

  function submitIdentity() {
    var nm = document.getElementById('lb-name');
    var g = document.getElementById('lb-emoji-grid');
    var name = (nm && nm.value || '').trim();
    var emoji = (g && g._chosen) || '🦊';
    if (!name) { lbToast('Entre ton prénom'); nm && nm.focus(); return; }
    saveIdentity({ name: name, emoji: emoji });
    if (window._changingIdentity) {
      window._changingIdentity = false;
      // mettre à jour le joueur déjà présent dans le salon
      if (window.roomRef && window.myPid) window.roomRef.child('players/' + window.myPid).update({ name: name, emoji: emoji });
      window.showScreen('s-lobby');
    } else {
      enterRoom();
    }
  }

  // ── Entrer dans la salle d'attente ────────────────────────────────────────
  function enterRoom() {
    var c = cfg();
    var id = getIdentity();
    if (c.beforeJoin) try { c.beforeJoin(); } catch (e) {}
    window.roomRef.transaction(function (cur) {
      if (!cur) cur = { game: c.gameKey, status: 'waiting', host: window.myPid, createdAt: Date.now() };
      cur.players = cur.players || {};
      var mine = cur.players[window.myPid] || {};
      var seat = (mine.seat != null) ? mine.seat : Object.keys(cur.players).length;
      var color = mine.color || (window.Avatars ? Avatars.pickColor(cur.players) : 'var(--gold)');
      cur.players[window.myPid] = {
        name: id.name, emoji: id.emoji, color: color, seat: seat,
        online: true, ready: mine.ready || false,
        joinedAt: mine.joinedAt || Date.now()
      };
      return cur;
    }, function (err, committed, snap) {
      // anti-fantôme : si on ferme l'onglet pendant l'attente, on disparaît.
      try { window.roomRef.child('players/' + window.myPid).onDisconnect().remove(); } catch (e) {}
      if (window.GamePresence) GamePresence.start(window.roomRef, window.myPid);
      // Si la partie n'a pas (encore) commencé, on montre la salle d'attente ;
      // sinon on laisse le jeu router vers son écran de jeu (reconnexion en cours).
      var status = (snap && snap.val() && snap.val().status) || 'waiting';
      if (status === 'waiting') window.showScreen('s-lobby');
      if (!window.listenersOn) { window.roomRef.on('value', masterOnState); window.listenersOn = true; }
      if (c.afterJoin) try { c.afterJoin(); } catch (e) {}
    });
  }

  // ── Handler central : route les écrans + relaie au jeu ────────────────────
  function masterOnState(snap) {
    var room = snap.val() || {};
    window.room = room;
    var status = room.status || 'waiting';

    maybeMigrateHost(room);

    if (status === 'waiting') {
      // En attente : la salle d'attente est gérée ici. On y revient si on était
      // sur l'écran de jeu (fin de partie) ou encore sur l'accueil (auto-join).
      if (isActive('s-playing') || isActive('s-home')) window.showScreen('s-lobby');
      if (isActive('s-lobby')) renderLobby(room);
      maybeAutoStart(room);
    }
    // Dans tous les cas on laisse le jeu réagir (il gère son écran 's-playing').
    if (cfg().onState) try { cfg().onState(snap); } catch (e) { console.error(e); }
    // Puis l'hôte fait jouer les ordis dont c'est le tour (no-op s'il n'y en a pas).
    try { driveBots(room); } catch (e) { console.error(e); }
    try { window.Lobby.turnAlertFor(room); } catch (e) {}
    try { recordStatsFor(room); } catch (e) {}
  }

  // ── Stats par jeu (localStorage) : enregistrées une fois par partie terminée ──
  var _statsEndRecorded = false;
  function recordStatsFor(room) {
    if (!window.GameStats) return;
    var ended = room.status === 'ended' || room.status === 'finished' || !!room.winner;
    if (!ended) { _statsEndRecorded = false; return; }
    if (_statsEndRecorded) return;
    _statsEndRecorded = true;
    var me = room.players && room.players[window.myPid];
    GameStats.record(cfg().gameKey, { won: room.winner === window.myPid, timeMs: (me && me.finishedAt) || null });
  }
  function isActive(id) { var el = document.getElementById(id); return el && el.classList.contains('active'); }

  // ── Migration d'hôte ──────────────────────────────────────────────────────
  // Le champ `host` est figé à la création du salon. Si l'hôte se déconnecte, on
  // le réattribue au premier joueur encore en ligne (plus petit siège). Un seul
  // client — l'héritier désigné — réécrit, pour éviter les courses.
  function maybeMigrateHost(room) {
    var players = room.players || {};
    var host = room.host;
    if (host && players[host] && players[host].online) return; // hôte valide → rien à faire
    var online = Object.keys(players).map(function (k) { return Object.assign({ pid: k }, players[k]); })
      .filter(function (p) { return p.online; })
      .sort(function (a, b) { return (a.seat || 0) - (b.seat || 0); });
    if (!online.length) return;
    var heir = online[0].pid;
    if (heir !== window.myPid || !window.roomRef) return; // seul l'héritier écrit
    window.roomRef.child('host').transaction(function (cur) {
      var ps = (window.room && window.room.players) || {};
      if (cur && ps[cur] && ps[cur].online) return; // déjà repris/valide → on abandonne
      return heir;
    });
  }

  // ── Rendu de la salle d'attente ───────────────────────────────────────────
  function renderLobby(room) {
    var host = document.getElementById('s-lobby');
    if (!host) return;
    var c = cfg();
    var players = window.Room.list();
    var min = c.minPlayers || 2;
    var onlineReady = players.filter(function (p) { return p.online && p.ready; }).length;
    var onlineCount = players.filter(function (p) { return p.online; }).length;
    var me = window.Room.me();
    var iReady = me && me.ready;

    var rows = players.map(function (p) {
      var st = !p.online ? '<span class="lb-dot"></span>Hors ligne'
        : p.ready ? '<span class="lb-dot ready"></span>Prêt·e'
        : '<span class="lb-dot online"></span>Connecté·e';
      return '<div class="lb-player">' + window.Room.avatarHTML(p.pid, 42) +
        '<span class="lb-player-name">' + esc(p.name) + (p.pid === window.myPid ? ' <span class="lb-player-tag">(toi)</span>' : '') + '</span>' +
        '<span class="lb-player-status">' + st + '</span></div>';
    }).join('');

    var waitMsg = onlineCount < min
      ? ('En attente de joueurs… (' + onlineCount + '/' + min + ' minimum)')
      : (iReady ? 'En attente des autres joueurs…' : 'Clique sur « Prêt » quand tu es prêt·e');

    // Réglages spécifiques au jeu (ex. nombre de manches), insérés dans le salon.
    var extra = '';
    if (c.lobbyExtraHTML) { try { extra = c.lobbyExtraHTML(room) || ''; } catch (e) {} }
    // Réglages « ordis » (ajouter des bots + difficulté), pour les jeux qui les supportent.
    var botCtl = botControlsHTML(room);

    host.innerHTML =
      '<div class="lb-wrap">' +
        '<p class="lb-kicker">Salle d’attente</p>' +
        '<h1 class="lb-title" style="font-size:clamp(1.6rem,6vw,2.2rem)">' + esc(c.name || 'Jeu') + '</h1>' +
        '<div class="lb-code-card"><div class="lb-code-label">Code du salon</div><div class="lb-code">' + esc(window.roomCode || '') + '</div>' +
          '<div class="lb-code-actions"><button class="lb-btn small ghost" onclick="Lobby.shareRoom()">Partager le lien</button></div></div>' +
        '<div class="lb-players">' + rows + '</div>' +
        botCtl +
        extra +
        '<div class="lb-wait-msg">' + esc(waitMsg) + '</div>' +
        '<button class="lb-btn" id="lb-ready-btn" onclick="Lobby.toggleReady()"' + (onlineCount < min ? ' disabled' : '') + '>' +
          (iReady ? 'Annuler' : 'Je suis prêt·e ✓') + '</button>' +
        '<button class="lb-link" onclick="Lobby.changeIdentity()">Changer de nom / émoji</button>' +
        '<button class="lb-link" onclick="Lobby.leaveRoom()">Quitter le salon</button>' +
      '</div>';
  }

  function toggleReady() {
    var me = window.Room.me();
    if (!me) return;
    window.roomRef.child('players/' + window.myPid + '/ready').set(!me.ready);
  }

  // ── Ordis dans un salon EN LIGNE (ajout/retrait + difficulté) ─────────────
  // Visible seulement pour les jeux au tour par tour (cfg.bot). L'hôte ajoute des
  // ordis (joueurs synthétiques isBot) ; ils sont « prêts » d'office et c'est
  // l'hôte qui jouera leurs tours (voir driveBots). Aucun impact si on n'en ajoute pas.
  var BOT_EMOJIS = ['🤖', '👾', '🐲', '🦾', '🛸', '⚙️'];
  function splitPlayers(room) {
    var ps = (room && room.players) || {}, humans = [], bots = [];
    Object.keys(ps).forEach(function (k) { (ps[k].isBot ? bots : humans).push(Object.assign({ pid: k }, ps[k])); });
    return { humans: humans, bots: bots };
  }
  function botControlsHTML(room) {
    var c = cfg();
    if (!c.bot) return ''; // jeu sans ordi
    var max = c.maxPlayers || 8;
    var sp = splitPlayers(room);
    var maxBots = Math.max(0, max - sp.humans.length);
    var isHost = room.host === window.myPid;
    var curBots = sp.bots.length;
    var level = window.Bots.level(room);

    var countBtns = '';
    for (var n = 0; n <= maxBots; n++) {
      countBtns += '<button type="button" class="lb-set-btn' + (n === curBots ? ' active' : '') + '"' +
        (isHost ? ' onclick="Lobby.setBotCount(' + n + ')"' : ' disabled') + '>' + n + '</button>';
    }
    var diffBtns = window.Bots.LEVELS.map(function (lv) {
      return '<button type="button" class="lb-set-btn' + (lv === level ? ' active' : '') + '"' +
        (isHost ? ' onclick="Lobby.setDifficulty(\'' + lv + '\')"' : ' disabled') + '>' + window.Bots.LABELS[lv] + '</button>';
    }).join('');

    var hint = isHost ? '' : '<div class="lb-set-hint">Réglé par l’hôte</div>';
    return '<div class="lb-botset">' +
      '<div class="lb-set"><div class="lb-set-label">🤖 Ordis</div><div class="lb-set-row">' + countBtns + '</div></div>' +
      (curBots > 0 || !isHost ? '<div class="lb-set"><div class="lb-set-label">Niveau</div><div class="lb-set-row">' + diffBtns + '</div></div>' : '') +
      hint + '</div>';
  }
  function setDifficulty(level) {
    if (window.Bots.LEVELS.indexOf(level) < 0) return;
    if (window.roomRef) window.roomRef.child('difficulty').set(level);
  }
  function setBotCount(n) {
    var c = cfg(), max = c.maxPlayers || 8;
    window.roomRef.transaction(function (cur) {
      if (!cur || cur.status !== 'waiting') return cur;
      if (cur.host !== window.myPid) return cur; // seul l'hôte gère les ordis
      cur.players = cur.players || {};
      var humans = [], bots = [];
      Object.keys(cur.players).forEach(function (k) { (cur.players[k].isBot ? bots : humans).push(k); });
      var want = Math.max(0, Math.min(n, max - humans.length));
      bots.sort(function (a, b) { return (cur.players[a].seat || 0) - (cur.players[b].seat || 0); });
      // Retirer le surplus (sièges les plus hauts d'abord).
      while (bots.length > want) { delete cur.players[bots.pop()]; }
      // Ajouter ce qu'il manque.
      var seat = Object.keys(cur.players).reduce(function (m, k) { return Math.max(m, cur.players[k].seat || 0); }, -1);
      var idx = 1;
      while (bots.length < want) {
        while (cur.players['bot_' + idx]) idx++;
        var pid = 'bot_' + idx;
        seat += 1;
        var color = (window.Avatars ? Avatars.pickColor(cur.players) : 'var(--gold)');
        cur.players[pid] = {
          name: 'Ordi ' + idx, emoji: BOT_EMOJIS[(idx - 1) % BOT_EMOJIS.length], color: color,
          seat: seat, online: true, ready: true, isBot: true, joinedAt: Date.now()
        };
        bots.push(pid); idx++;
      }
      if (cur.difficulty == null && want > 0) cur.difficulty = 'normal';
      return cur;
    });
  }

  // ── Pilote des ordis (salon EN LIGNE) ─────────────────────────────────────
  // Seul l'hôte exécute les tours des ordis : il appelle cfg.bot() avec l'identité
  // de l'ordi le temps de l'action (les fonctions de jeu lisent window.myPid).
  // Idempotent et sans risque : un coup avorté (re-run de transaction) est un
  // no-op rejoué au tour suivant ; aucun bot ajouté ⇒ ce code ne fait rien.
  var BOT_DRIVE_DELAY = 700;
  var botDrive = { sig: null, t: 0 };
  function botActivePid(room) {
    var c = cfg();
    if (c.offlineTurn) { try { return c.offlineTurn(room); } catch (e) { return room.turn; } }
    return room.turn;
  }
  function driveBots(room) {
    var c = cfg();
    if (!c.bot || !room || room.status !== 'playing') return;
    if (room.winner || room.status === 'ended' || room.status === 'finished') return;
    if (room.host !== window.myPid) return; // seul l'hôte pilote
    var pid = botActivePid(room);
    var p = pid && room.players && room.players[pid];
    if (!p || !p.isBot) return;
    var sig = pid + '|' + (room.turn || '') + '|' + (room.phase || '') + '|' + (room.status || '');
    var now = Date.now();
    if (sig === botDrive.sig && (now - botDrive.t) < 4000) return; // anti-rafale / déjà programmé
    botDrive = { sig: sig, t: now };
    setTimeout(function () {
      var r = window.room;
      if (!r || r.host !== window.myPid || r.status !== 'playing' || r.winner) return;
      var a = botActivePid(r), pp = a && r.players && r.players[a];
      if (!pp || !pp.isBot) return;
      var saved = window.myPid;
      window.myPid = a;
      try { c.bot(JSON.parse(JSON.stringify(r)), a); }
      catch (e) { console.error('bot', e); }
      finally { window.myPid = saved; }
    }, BOT_DRIVE_DELAY);
  }

  // ── Démarrage automatique quand tout le monde est prêt ────────────────────
  function maybeAutoStart(room) {
    var c = cfg();
    var min = c.minPlayers || 2;
    var players = room.players || {};
    var online = Object.keys(players).map(function (k) { return Object.assign({ pid: k }, players[k]); })
      .filter(function (p) { return p.online; });
    if (online.length < min) return;
    if (!online.every(function (p) { return p.ready; })) return;

    window.roomRef.transaction(function (cur) {
      if (!cur || cur.status !== 'waiting' || !cur.players) return cur;
      var on = Object.keys(cur.players).map(function (k) { return Object.assign({ pid: k }, cur.players[k]); })
        .filter(function (p) { return p.online; });
      if (on.length < min) return cur;
      if (!on.every(function (p) { return p.ready; })) return cur;
      on.sort(function (a, b) { return (a.seat || 0) - (b.seat || 0); });
      // pids participant à la manche, dans l'ordre des tours
      cur.order = on.map(function (p) { return p.pid; });
      cur.status = 'playing';
      on.forEach(function (p) { cur.players[p.pid].ready = false; });
      // état initial fourni par le jeu
      if (c.onStart) {
        var extra = c.onStart(on, cur);
        if (extra) for (var k in extra) if (extra.hasOwnProperty(k)) cur[k] = extra[k];
      }
      return cur;
    });
  }

  // ── Retour à la salle d'attente (rejouer) — appelé par les jeux ───────────
  // keep : tableau de clés de players/<pid> à conserver (ex. ['wins','score']).
  function resetToLobby(keep) {
    keep = keep || [];
    window.roomRef.transaction(function (cur) {
      if (!cur) return cur;
      cur.status = 'waiting';
      cur.order = null;
      var ps = cur.players || {};
      Object.keys(ps).forEach(function (k) {
        var isBot = !!ps[k].isBot;
        // on ne garde de l'ancien que name/emoji/color/seat/online/ts + les clés demandées.
        // Les ordis restent « prêts » (l'hôte les pilote) pour ne pas bloquer le redémarrage.
        var base = { name: ps[k].name, emoji: ps[k].emoji, color: ps[k].color, seat: ps[k].seat,
          online: isBot ? true : ps[k].online, ts: ps[k].ts, ready: isBot, joinedAt: ps[k].joinedAt };
        if (isBot) base.isBot = true;
        keep.forEach(function (kk) { if (ps[k][kk] !== undefined) base[kk] = ps[k][kk]; });
        ps[k] = base;
      });
      return cur;
    });
  }

  // ── Partage ────────────────────────────────────────────────────────────────
  function shareRoom() {
    var url = location.origin + location.pathname + '?room=' + window.roomCode;
    var data = { title: cfg().name || 'Jeu', text: 'Rejoins ma partie ! Code : ' + window.roomCode, url: url };
    if (navigator.share) { navigator.share(data).catch(function () {}); return; }
    if (navigator.clipboard) { navigator.clipboard.writeText(url).then(function () { lbToast('Lien copié !'); }, function () { lbToast(url); }); return; }
    lbToast(url);
  }

  // ── Changer d'identité / quitter ──────────────────────────────────────────
  function changeIdentity() { window._changingIdentity = true; renderIdentity(true); }
  function cancelChange() { window._changingIdentity = false; window.showScreen('s-lobby'); }

  // Bascule vers un mode hors-ligne (solo / local) — voir offline.js.
  function goOffline(m) { location.href = location.pathname + '?mode=' + m; }
  function goDaily() { location.href = location.pathname + '?mode=solo&daily=1'; }

  // ── « Revoir le plateau » (après une fin de partie) ───────────────────────
  // Affiche l'écran de jeu (le plateau/la main reste rendu derrière) et propose un
  // bouton flottant pour revenir à l'écran de résultats. Partagé par tous les jeux :
  //   Lobby.peekBoard(function () { showScreen('s-results'); render(...); })
  function peekBoard(restore) {
    window.showScreen('s-playing');
    var b = document.getElementById('lb-peek');
    if (!b) {
      b = document.createElement('button'); b.id = 'lb-peek'; b.className = 'lb-peek-btn';
      document.body.appendChild(b);
    }
    b.textContent = '↩ Revenir aux résultats';
    b.onclick = function () { b.style.display = 'none'; try { restore && restore(); } catch (e) {} };
    b.style.display = 'block';
  }
  function hidePeek() { var b = document.getElementById('lb-peek'); if (b) b.style.display = 'none'; }

  // ── Nettoyage TTL des vieux salons (best-effort, appelé depuis l'accueil) ──
  // Supprime les salons abandonnés (créés il y a plus de maxAgeMs). Borné à
  // quelques suppressions par passage pour rester léger. Nécessite l'index
  // « createdAt » côté règles Firebase (voir database.rules.json).
  function sweepOldRooms(maxAgeMs) {
    maxAgeMs = maxAgeMs || 12 * 60 * 60 * 1000; // 12 h par défaut
    if (typeof firebase === 'undefined' || !firebase.database) return;
    try {
      db().ref(ROOT + '/rooms').orderByChild('createdAt').endAt(Date.now() - maxAgeMs).limitToFirst(20)
        .once('value', function (snap) {
          snap.forEach(function (child) { try { child.ref.remove(); } catch (e) {} });
        });
    } catch (e) {}
  }

  function leaveRoom() {
    var c = cfg();
    if (window.roomRef && window.myPid) {
      try { window.roomRef.child('players/' + window.myPid).onDisconnect().cancel(); } catch (e) {}
      // On se retire ; si on était le dernier, le salon est supprimé (pas de
      // coquille vide qui traîne dans la base).
      window.roomRef.transaction(function (cur) {
        if (!cur) return cur;
        if (cur.players) delete cur.players[window.myPid];
        var rest = cur.players ? Object.keys(cur.players) : [];
        // salon vide, ou ne contenant plus que des ordis → supprimé (pas de coquille).
        if (!rest.length || rest.every(function (k) { return cur.players[k].isBot; })) return null;
        return cur;
      });
    }
    if (window.listenersOn) { window.roomRef.off('value', masterOnState); window.listenersOn = false; }
    if (window.GamePresence) GamePresence.stop();
    if (c.onLeave) try { c.onLeave(); } catch (e) {}
    location.href = '/index.html';
  }

  // ── Gestion d'un joueur absent en cours de partie (helpers d'UI partagés) ──
  // Un jeu au tour par tour appelle, depuis son onState :
  //   Lobby.absentBanner(holderOuNull, onSkip)
  // où holder = le joueur dont c'est le tour s'il est absent (sinon null), et
  // onSkip = la transaction (propre au jeu) qui fait avancer le tour.
  function isOffline(state, pid) {
    var p = (state && state.players && state.players[pid]);
    if (!p) return false;
    if (p.online === false) return true;            // déconnexion propre (onDisconnect)
    if (p.online && p.ts) return (Date.now() - p.ts) > 20000; // en ligne mais ts périmé (perte réseau)
    return false; // en ligne sans ts (mode hors-ligne : pas de heartbeat) → présent
  }
  function absentBanner(holder, onSkip) {
    var el = document.getElementById('lb-absent');
    if (!holder) { if (el) el.classList.remove('show'); return; }
    if (!el) {
      el = document.createElement('div'); el.id = 'lb-absent'; el.className = 'lb-absent';
      el.innerHTML = '<span class="lb-absent-txt"></span><button class="lb-absent-btn" type="button">Passer son tour</button>';
      document.body.appendChild(el);
    }
    var name = (window.Room && Room.name) ? Room.name(holder) : holder;
    el.querySelector('.lb-absent-txt').textContent = '⏳ ' + name + ' semble absent·e';
    el.querySelector('.lb-absent-btn').onclick = function () { el.classList.remove('show'); try { onSkip && onSkip(); } catch (e) {} };
    el.classList.add('show');
  }

  // ── API publique appelée par les onclick injectés et par les jeux ─────────
  window.Lobby = {
    createRoom: createRoom,
    joinRoomByCode: joinRoomByCode,
    joinFromInput: joinFromInput,
    submitIdentity: submitIdentity,
    toggleReady: toggleReady,
    setBotCount: setBotCount,
    setDifficulty: setDifficulty,
    shareRoom: shareRoom,
    changeIdentity: changeIdentity,
    cancelChange: cancelChange,
    leaveRoom: leaveRoom,
    resetToLobby: resetToLobby,
    goOffline: goOffline,
    goDaily: goDaily,
    peekBoard: peekBoard,
    hidePeek: hidePeek,
    sweepOldRooms: sweepOldRooms,
    isOffline: isOffline,
    absentBanner: absentBanner
  };
})();
;

// ════════════════════ offline.js ════════════════════
/*
  offline.js — Moteur HORS-LIGNE (solo contre l'ordi + local « passe l'appareil »).

  Activé uniquement si l'URL contient ?mode=solo ou ?mode=local. Dans ce cas, il
  REMPLACE Firebase + le salon en ligne par un moteur 100 % en mémoire, et rejoue
  la logique EXISTANTE de chaque jeu (mêmes onStart/onState, mêmes transactions)
  — donc aucune règle n'est dupliquée ni divergente.

  Il ne fonctionne que pour les jeux AU TOUR PAR TOUR (un champ `turn` = joueur
  actif). Un jeu déclare son support via GameRoom({ offline:{solo,local}, bot }).
   • solo  : 1 humain + des ordis. À chaque tour d'ordi, on appelle cfg.bot().
   • local : plusieurs humains sur un appareil ; on bascule l'identité (myPid) sur
     le joueur actif et on affiche un écran « passe l'appareil ».

  Réutilise tels quels les utilitaires déjà fournis par lobby.js : window.Room,
  showScreen, openModal, closeModal, lbToast.
*/
(function () {
  var params = new URLSearchParams(location.search);
  var mode = params.get('mode');
  if (mode !== 'solo' && mode !== 'local') return; // mode EN LIGNE → on ne touche à rien
  var daily = params.get('daily') === '1' && mode === 'solo'; // Défi du jour (voir daily.js)
  var dailyRecorded = false, endFx = false; // endFx : son/confetti de fin joués une seule fois

  // ── firebase factice (au cas où le SDK n'a pas pu se charger, ex. en avion) ──
  if (typeof window.firebase === 'undefined') {
    window.firebase = { apps: [], initializeApp: function () {}, database: function () { return {}; } };
  }
  if (typeof window.firebase.database !== 'function') window.firebase.database = function () { return {}; };
  window.firebase.database.ServerValue = window.firebase.database.ServerValue || { TIMESTAMP: Date.now() };

  // ── état du moteur ──────────────────────────────────────────────────────────
  var cfg = null, room = null, players = [], totalPlayers = 2;
  var humanPids = [], humanPid = null, lastTurnShown = null;
  var offlineDifficulty = 'normal';
  var statsRecorded = false; // stats par jeu : un seul enregistrement par partie
  var BOT_DELAY = 650;

  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function snap() { var r = clone(room); return { val: function () { return r; } }; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function isBot(pid) { return !!(room && room.players[pid] && room.players[pid].isBot); }
  function ended() { return !!(room && (room.winner || room.status === 'ended' || room.status === 'finished')); }

  // ── Accès par chemin sur l'objet `room` en mémoire ──────────────────────────
  function getPath(parts) { var o = room; for (var i = 0; i < parts.length; i++) { if (o == null) return undefined; o = o[parts[i]]; } return o; }
  function setPath(parts, v) { var o = room; for (var i = 0; i < parts.length - 1; i++) { var k = parts[i]; if (o[k] == null || typeof o[k] !== 'object') o[k] = {}; o = o[k]; } o[parts[parts.length - 1]] = v; }
  function delPath(parts) { var o = room; for (var i = 0; i < parts.length - 1; i++) { if (o == null) return; o = o[parts[i]]; } if (o) delete o[parts[parts.length - 1]]; }
  var noDisc = { set: function () {}, remove: function () {}, cancel: function () {} };

  // ── ref enfant (set/update/remove/transaction/once) sur un chemin ───────────
  function childRef(parts) {
    return {
      set: function (v, cb) { setPath(parts, clone(v)); window.room = room; if (cb) cb(null); afterChange(); },
      update: function (obj, cb) { for (var k in obj) if (obj.hasOwnProperty(k)) setPath(parts.concat(String(k).split('/')), clone(obj[k])); window.room = room; if (cb) cb(null); afterChange(); },
      remove: function (cb) { delPath(parts); window.room = room; if (cb) cb(null); afterChange(); },
      transaction: function (fn, cb) { var res = fn(clone(getPath(parts))); if (res === undefined || res === null) { if (cb) cb(null, false); return; } setPath(parts, res); window.room = room; if (cb) cb(null, true); afterChange(); },
      child: function (sub) { return childRef(parts.concat(String(sub).split('/'))); },
      onDisconnect: function () { return noDisc; },
      on: function () {}, off: function () {},
      once: function (cb) { if (typeof cb === 'function') cb({ val: function () { return clone(getPath(parts)); } }); return Promise.resolve({ val: function () { return clone(getPath(parts)); } }); }
    };
  }

  // ── roomRef factice (transaction + child) ────────────────────────────────────
  window.roomRef = window.gameRef = {
    transaction: function (fn, cb) {
      var res = fn(clone(room));
      if (res === undefined || res === null) { if (cb) cb(null, false, snap()); return; }
      room = res; window.room = room;
      if (cb) cb(null, true, snap());
      afterChange();
    },
    child: function (path) { return childRef(String(path).split('/')); },
    onDisconnect: function () { return noDisc; },
    on: function () {}, off: function () {},
    once: function (cb) { if (typeof cb === 'function') cb(snap()); return Promise.resolve(snap()); }
  };

  // ── Lobby factice ────────────────────────────────────────────────────────────
  window.Lobby = window.Lobby || {};
  window.Lobby.resetToLobby = function (keep) { replay(keep || []); };
  window.Lobby.createRoom = function () {};
  window.Lobby.joinFromInput = function () {};

  // ── GameRoom : on intercepte l'enregistrement du jeu ─────────────────────────
  window.GameRoom = function (c) {
    cfg = c || {};
    window.myPid = null;
    injectStyles();
    // Défi du jour : on saute l'écran de réglages et on démarre la grille du jour.
    var enter = (daily && (cfg.offline || {}).daily && window.Daily) ? startDaily : renderSetup;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enter, { once: true });
    else enter();
  };

  // ── Défi du jour (solo) : graine + difficulté imposées par la DATE ───────────
  function startDaily() {
    var off = cfg.offline || {};
    if (!off.solo || !cfg.bot) { renderSetup(); return; } // repli si le solo n'est pas géré
    // Graine fixée au jour : onStart appelle Puzzle.seed() → on lui rend la graine du jour.
    if (window.Puzzle) { var ds = Daily.seed(cfg.gameKey); Puzzle.seed = function () { return ds; }; }
    offlineDifficulty = Daily.level();
    totalPlayers = 1;
    startGame(null);
  }
  function fmtDur(ms) { return window.Puzzle ? Puzzle.fmtTime(ms) : Math.max(0, Math.round(ms / 1000)) + 's'; }
  function recordDaily() {
    if (!window.Daily || dailyRecorded) return;
    var me = room.players[humanPid], won = room.winner === humanPid;
    if (!won) { showDailyShare(false, 0, Daily.stateOf(cfg.gameKey)); return; } // raté → propose de réessayer
    dailyRecorded = true;
    var t = (me && me.finishedAt) || (room.startedAt ? Date.now() - room.startedAt : 0);
    showDailyShare(true, t, Daily.record(cfg.gameKey, t));
  }
  function dailyShareText(t) {
    var d = Daily.today(), name = cfg.name || cfg.gameKey;
    return name + ' — défi du ' + d.label + ' (' + Daily.levelLabel() + ')\n✅ résolu en ' + fmtDur(t) +
      '\n' + location.origin + location.pathname;
  }
  function showDailyShare(won, t, st) {
    var old = document.getElementById('off-daily'); if (old) old.remove();
    var box = document.createElement('div'); box.id = 'off-daily';
    box.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:3000;background:var(--white);border:1.5px solid var(--gold);border-radius:18px;box-shadow:var(--shadow-hover);padding:14px 18px;max-width:340px;width:calc(100% - 28px);text-align:center;font-family:DM Sans,sans-serif';
    if (won) {
      box.innerHTML = '<div style="font-weight:800;color:var(--terracotta)">🗓️ Défi du jour réussi !</div>' +
        '<div style="margin:6px 0;font-size:.9rem">⏱ ' + esc(fmtDur(t)) + (st.streak ? ' · série ' + st.streak + ' 🔥' : '') + '</div>' +
        '<button id="off-daily-share" style="border:none;border-radius:30px;padding:.55rem 1.4rem;font-weight:800;cursor:pointer;background:linear-gradient(135deg,var(--terracotta),var(--gold));color:#fff">📤 Partager</button>';
      box.querySelector('#off-daily-share').onclick = function () { var r = Daily.share(dailyShareText(t)); if (window.lbToast) lbToast(r === 'copy' ? 'Résultat copié !' : r === 'share' ? '' : dailyShareText(t)); };
    } else {
      box.innerHTML = '<div style="font-weight:800;color:var(--terracotta)">🗓️ Défi du jour</div>' +
        '<div style="margin:6px 0;font-size:.9rem">Pas encore trouvé — réessaie, c\'est la même grille aujourd\'hui.</div>' +
        '<button style="border:none;border-radius:30px;padding:.55rem 1.4rem;font-weight:800;cursor:pointer;background:linear-gradient(135deg,var(--terracotta),var(--gold));color:#fff" onclick="location.reload()">↻ Réessayer</button>';
    }
    document.body.appendChild(box);
  }

  // ── Écran de configuration hors-ligne ───────────────────────────────────────
  function renderSetup() {
    var host = document.getElementById('s-home');
    if (!host) return;
    var min = cfg.minPlayers || 2, max = cfg.maxPlayers || 8;
    var off = cfg.offline || {};

    if (mode === 'solo' && (!off.solo || !cfg.bot)) { unsupported(host, 'Le mode solo n\'est pas disponible pour ce jeu.'); return; }
    if (mode === 'local' && !off.local) { unsupported(host, 'Le mode local n\'est pas disponible pour ce jeu.'); return; }

    // Nombre minimum d'adversaires ordi en solo. Par défaut 1 ; un jeu peut
    // autoriser 0 (vrai solo : le joueur seul, ex. Le juste prix) via
    // offline:{ soloMinBots: 0 }.
    var loBots = (off.soloMinBots != null) ? off.soloMinBots : 1;
    // Jeu SOLO PUR (puzzle au chrono : Sudoku, Zip, Patches…) : aucun adversaire
    // ordi, on cache le compteur d'adversaires et on parle de « Difficulté ».
    var noBots = mode === 'solo' && off.soloNoBots;
    var controls = '';
    if (mode === 'solo') {
      if (max > 2 && !noBots) controls = counterRow('Adversaires (ordi)', loBots, max - 1, loBots);
      // Difficulté (des ordis, ou de la grille pour un solo pur).
      if (max - 1 >= 1) controls += diffRow(noBots ? 'Difficulté' : 'Niveau des ordis');
    } else {
      controls = counterRow('Nombre de joueurs', min, max, min);
    }
    var sub = mode === 'solo'
      ? (noBots ? 'Toi contre le chrono ⏱' : (loBots === 0 ? 'Toi contre le jeu' : 'Tu joues contre l\'ordi'))
      : 'Chacun son tour, on se passe l\'appareil';
    // Reprise d'une partie interrompue (le plus utile en avion) : proposée en tête,
    // avant les réglages, si un snapshot valide existe pour ce jeu et ce mode.
    var saved = loadResume();
    var resumeBtn = saved
      ? '<button class="lb-btn" id="off-resume" style="background:linear-gradient(135deg,var(--terracotta),var(--gold));color:#fff">▶ Reprendre la partie</button>' +
        '<div style="margin:-6px 0 14px;font-size:.82rem;color:var(--ink-light)">' + resumeAgeLabel(saved.ts) + ' · <button id="off-resume-drop" style="background:none;border:none;color:var(--ink-light);text-decoration:underline;cursor:pointer;font:inherit;padding:0">effacer</button></div>'
      : '';
    host.innerHTML =
      '<div class="lb-wrap">' +
        (cfg.emoji ? '<div class="lb-emoji-big">' + cfg.emoji + '</div>' : '') +
        '<h1 class="lb-title">' + esc(cfg.name || 'Jeu') + '</h1>' +
        '<p class="lb-sub">' + (mode === 'solo' ? '🤖 Solo' : '📱 Local') + ' · ' + sub + '</p>' +
        (window.GameStats ? GameStats.summaryHTML(cfg.gameKey, window.Puzzle ? Puzzle.fmtTime : null) : '') +
        resumeBtn +
        controls +
        '<button class="lb-btn" id="off-start">' + (saved ? 'Nouvelle partie' : 'Commencer') + '</button>' +
        '<a class="lb-link" href="' + location.pathname + '">↺ Passer en mode en ligne</a>' +
        '<a class="lb-link" href="/index.html">← Tous les jeux</a>' +
      '</div>';
    document.getElementById('off-start').onclick = startFromSetup;
    if (saved) {
      var rb = document.getElementById('off-resume');
      if (rb) rb.onclick = function () { resumeGame(loadResume()); };
      var rd = document.getElementById('off-resume-drop');
      if (rd) rd.onclick = function () { clearResume(); renderSetup(); };
    }
    // Sélecteur générique : un clic active un bouton dans SA rangée (compteur ou difficulté).
    host.querySelectorAll('.off-set-row').forEach(function (row) {
      row.addEventListener('click', function (e) {
        var b = e.target.closest('.off-num, .off-diff'); if (!b) return;
        row.querySelectorAll('.off-num, .off-diff').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
      });
    });
    showScreen('s-home');
  }
  function unsupported(host, msg) {
    host.innerHTML = '<div class="lb-wrap"><div class="lb-emoji-big">🚫</div><h1 class="lb-title">' + esc(cfg.name || 'Jeu') + '</h1>' +
      '<p class="lb-sub">' + esc(msg) + '</p>' +
      '<a class="lb-btn" href="' + location.pathname + '">Jouer en ligne</a>' +
      '<a class="lb-link" href="/index.html">← Tous les jeux</a></div>';
    showScreen('s-home');
  }
  function counterRow(label, lo, hi, initial) {
    var btns = '';
    for (var v = lo; v <= hi; v++) btns += '<button type="button" class="off-num' + (v === initial ? ' active' : '') + '" data-val="' + v + '">' + v + '</button>';
    return '<div class="off-set"><div class="off-set-label">' + label + '</div><div class="off-set-row">' + btns + '</div></div>';
  }
  function diffRow(label) {
    var B = window.Bots || { LEVELS: ['easy', 'normal', 'hard'], LABELS: { easy: 'Facile', normal: 'Moyen', hard: 'Difficile' } };
    var def = 'normal';
    var btns = B.LEVELS.map(function (lv) {
      return '<button type="button" class="off-diff' + (lv === def ? ' active' : '') + '" data-diff="' + lv + '">' + B.LABELS[lv] + '</button>';
    }).join('');
    return '<div class="off-set"><div class="off-set-label">' + (label || 'Niveau des ordis') + '</div><div class="off-set-row">' + btns + '</div></div>';
  }
  function startFromSetup() {
    var min = cfg.minPlayers || 2, max = cfg.maxPlayers || 8;
    var noBots = mode === 'solo' && cfg.offline && cfg.offline.soloNoBots;
    var active = document.querySelector('.off-num.active');
    var val = active ? +active.dataset.val : min;
    if (mode === 'solo') totalPlayers = noBots ? 1 : ((max > 2) ? (1 + val) : 2);
    else totalPlayers = (max > 2) ? val : min;
    // En solo « 0 adversaire autorisé », le plancher tombe à 1 (joueur seul).
    var soloPure = (mode === 'solo' && cfg.offline && cfg.offline.soloMinBots === 0);
    totalPlayers = Math.max(soloPure ? 1 : min, Math.min(max, totalPlayers));
    var d = document.querySelector('.off-diff.active');
    offlineDifficulty = (d && d.dataset.diff) || 'normal';
    startGame(null);
  }

  // ── Démarrage / relance d'une partie ─────────────────────────────────────────
  function readIdentity() { try { var r = localStorage.getItem('games.identity.v1'); if (r) return JSON.parse(r); } catch (e) {} return null; }
  var BOT_EMOJI = ['🤖', '👾', '🐲', '🦾'];

  function startGame(savedKeep) {
    endFx = false; // ré-arme le son/confetti de fin pour cette nouvelle partie
    statsRecorded = false;
    var id0 = readIdentity();
    var pmap = {}, ids = [];
    players = [];
    for (var i = 0; i < totalPlayers; i++) {
      var pid = 'p' + i;
      var bot = (mode === 'solo' && i > 0);
      var name, emoji;
      if (bot) { name = totalPlayers > 2 ? ('Ordi ' + i) : 'Ordi'; emoji = BOT_EMOJI[(i - 1) % BOT_EMOJI.length]; }
      else if (i === 0 && id0 && id0.name) { name = id0.name; emoji = id0.emoji || (window.Avatars ? Avatars.firstFreeEmoji(pmap) : '🦊'); }
      else { name = 'Joueur ' + (i + 1); emoji = window.Avatars ? Avatars.firstFreeEmoji(pmap) : '🦊'; }
      var color = window.Avatars ? Avatars.pickColor(pmap) : 'var(--gold)';
      pmap[pid] = { name: name, emoji: emoji, color: color, seat: i, online: true, ready: false, isBot: bot };
      if (savedKeep && savedKeep[pid]) for (var k in savedKeep[pid]) pmap[pid][k] = savedKeep[pid][k];
      players.push({ pid: pid, name: name, emoji: emoji, color: color, seat: i, isBot: bot });
      ids.push(pid);
    }
    humanPids = players.filter(function (p) { return !p.isBot; }).map(function (p) { return p.pid; });
    humanPid = humanPids[0];

    room = { game: cfg.gameKey, status: 'playing', host: ids[0], players: pmap, order: ids, difficulty: offlineDifficulty };
    window.room = room; window.roomCode = (mode === 'solo' ? 'SOLO' : 'LOCAL');

    var onList = players.map(function (p) { return { pid: p.pid, name: p.name, emoji: p.emoji, color: p.color, seat: p.seat }; });
    var extra = cfg.onStart ? cfg.onStart(onList, room) : null;
    if (extra) for (var kk in extra) if (extra.hasOwnProperty(kk)) room[kk] = extra[kk];

    lastTurnShown = null;
    hidePass();
    afterChange();
  }

  function replay(keep) {
    var saved = {};
    (players || []).forEach(function (p) {
      var src = room && room.players && room.players[p.pid];
      if (!src) return;
      saved[p.pid] = {};
      (keep || []).forEach(function (k) { if (src[k] !== undefined) saved[p.pid][k] = src[k]; });
    });
    startGame(saved);
  }

  // ── Sauvegarde / reprise d'une partie hors-ligne (le plus utile en avion) ────
  //  Tout l'état durable d'un jeu de plateau/cartes vit dans `room` : le jeu se
  //  re-rend intégralement depuis `room` via onState (comme un client qui rejoint
  //  une partie en cours). On sérialise donc `room` dans localStorage à chaque
  //  changement ; « Reprendre » recharge ce snapshot. On EXCLUT les puzzles-chrono
  //  (soloNoBots : leur grille vit dans les variables locales de la page, pas dans
  //  `room`) et le défi du jour (grille imposée par la date).
  function resumeKey() { return 'games.resume.' + ((cfg && cfg.gameKey) || 'x') + '.' + mode; }
  function canResume() { return !!cfg && !(cfg.offline && cfg.offline.soloNoBots) && !daily; }
  function saveResume() {
    if (!canResume() || !room) return;
    if (ended() || room.status !== 'playing') { clearResume(); return; }
    try {
      localStorage.setItem(resumeKey(), JSON.stringify({
        v: 1, ts: Date.now(), room: room,
        totalPlayers: totalPlayers, offlineDifficulty: offlineDifficulty
      }));
    } catch (e) {}
  }
  function clearResume() { try { localStorage.removeItem(resumeKey()); } catch (e) {} }
  function resumeAgeLabel(ts) {
    var m = Math.max(0, Math.round((Date.now() - (ts || 0)) / 60000));
    if (m < 1) return 'sauvegardée à l\'instant';
    if (m < 60) return 'interrompue il y a ' + m + ' min';
    var h = Math.round(m / 60);
    return 'interrompue il y a ' + h + ' h';
  }
  function loadResume() {
    if (!canResume()) return null;
    try {
      var raw = localStorage.getItem(resumeKey()); if (!raw) return null;
      var d = JSON.parse(raw);
      if (!d || !d.room || d.room.game !== cfg.gameKey || d.room.status !== 'playing') return null;
      return d;
    } catch (e) { return null; }
  }
  // Repart d'un snapshot sauvegardé : on reconstruit l'état moteur puis on laisse
  // afterChange re-rendre le jeu (et relancer l'ordi si c'est son tour).
  function resumeGame(saved) {
    if (!saved || !saved.room) { renderSetup(); return; }
    endFx = false;
    room = saved.room;
    var order = (room.order && room.order.length) ? room.order : Object.keys(room.players || {});
    totalPlayers = saved.totalPlayers || order.length;
    offlineDifficulty = saved.offlineDifficulty || room.difficulty || 'normal';
    players = order.map(function (pid) {
      var p = (room.players || {})[pid] || {};
      return { pid: pid, name: p.name, emoji: p.emoji, color: p.color, seat: p.seat, isBot: !!p.isBot };
    });
    humanPids = players.filter(function (p) { return !p.isBot; }).map(function (p) { return p.pid; });
    humanPid = humanPids[0];
    window.room = room;
    window.roomCode = (mode === 'solo' ? 'SOLO' : 'LOCAL');
    lastTurnShown = null;
    hidePass();
    afterChange();
  }

  // ── Après chaque changement d'état : router l'écran / faire jouer l'ordi ──────
  function safeOnState() { try { if (cfg.onState) cfg.onState(snap()); } catch (e) { console.error(e); } }

  // Joueur censé agir maintenant. Par défaut room.turn ; un jeu à phases (placement,
  // distribution, tours par couleur…) fournit cfg.offlineTurn(room).
  function activePidOf() {
    if (!room) return null;
    if (cfg && cfg.offlineTurn) { try { return cfg.offlineTurn(room); } catch (e) { return room.turn; } }
    return room.turn;
  }

  function afterChange() {
    if (!room) return;
    var active = activePidOf();
    if (mode === 'solo') {
      window.myPid = humanPid;
      safeOnState();
      try { if (window.Lobby && Lobby.turnAlertFor) Lobby.turnAlertFor(room); } catch (e) {}
      if (!ended() && active && isBot(active)) setTimeout(botStep, BOT_DELAY);
      if (ended() && !endFx) { endFx = true; if (window.Sfx) Sfx.play(room.winner ? 'win' : 'lose'); }
      if (daily && ended()) setTimeout(recordDaily, 450); // Défi du jour : enregistre + partage
      // Stats par jeu (solo, hors défi du jour qui a son propre suivi) : une fois par partie.
      if (ended() && !daily && window.GameStats && !statsRecorded) {
        statsRecorded = true;
        try { GameStats.record(cfg.gameKey, { won: room.winner === humanPid, timeMs: (room.players[humanPid] || {}).finishedAt || null }); } catch (e) {}
      }
      if (ended()) clearResume(); else saveResume();
    } else {
      if (ended()) { hidePass(); lastTurnShown = null; window.myPid = humanPids[0] || (room.order || [])[0]; safeOnState(); clearResume(); return; }
      window.myPid = active || room.turn || (room.order || [])[0];
      var changed = (active !== lastTurnShown);
      safeOnState();
      // À chaque changement de joueur actif : réinit éventuelle de l'état local du jeu.
      if (changed && cfg.offlineEnter) { try { cfg.offlineEnter(room, window.myPid); } catch (e) {} }
      if (changed && active) { showPass(active); lastTurnShown = active; }
      saveResume();
    }
  }

  function botStep() {
    if (mode !== 'solo' || !room || ended()) return;
    var active = activePidOf();
    if (!isBot(active)) return;
    window.myPid = active;
    try { cfg.bot(clone(room), active); } catch (e) { console.error('bot', e); }
    // L'action du bot déclenche une transaction → afterChange (remet myPid, relance si besoin).
  }

  // ── Écran « passe l'appareil » (mode local) ──────────────────────────────────
  function passEl() {
    var el = document.getElementById('off-pass');
    if (!el) {
      el = document.createElement('div'); el.id = 'off-pass';
      el.innerHTML = '<div class="off-pass-card"><div class="off-pass-av" id="off-pass-av"></div>' +
        '<div class="off-pass-title" id="off-pass-title"></div>' +
        '<div class="off-pass-sub">Passe l\'appareil à ce joueur, puis touche le bouton.</div>' +
        '<button class="lb-btn" id="off-pass-btn">C\'est à moi — jouer</button></div>';
      document.body.appendChild(el);
      el.querySelector('#off-pass-btn').onclick = hidePass;
    }
    return el;
  }
  function showPass(pid) {
    if (mode !== 'local' || totalPlayers < 2) return;
    var p = (room.players && room.players[pid]) || {};
    var el = passEl();
    var av = el.querySelector('#off-pass-av');
    av.textContent = p.emoji || '🎲'; av.style.background = p.color || 'var(--gold)';
    el.querySelector('#off-pass-title').textContent = 'Au tour de ' + (p.name || '?');
    el.classList.add('show');
  }
  function hidePass() { var el = document.getElementById('off-pass'); if (el) el.classList.remove('show'); }

  // ── Styles injectés (indépendants des CSS de chaque jeu) ─────────────────────
  function injectStyles() {
    if (document.getElementById('off-styles')) return;
    var css =
      '.off-set{margin:6px 0 10px;}' +
      '.off-set-label{font-size:.8rem;color:var(--ink-light);margin-bottom:6px;}' +
      '.off-set-row{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-bottom:6px;}' +
      '.off-num,.off-diff{min-width:46px;padding:.5rem .8rem;border:1.5px solid var(--gold-light);border-radius:12px;background:var(--white);color:var(--ink);font-weight:700;font-family:"DM Sans",sans-serif;cursor:pointer;}' +
      '.off-num.active,.off-diff.active{background:linear-gradient(135deg,var(--terracotta),var(--gold));color:#fff;border-color:transparent;}' +
      '#off-pass{position:fixed;inset:0;z-index:9000;display:none;align-items:center;justify-content:center;padding:24px;background:rgba(20,16,28,.82);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);}' +
      '#off-pass.show{display:flex;}' +
      '.off-pass-card{background:var(--white);border-radius:22px;padding:32px 26px;text-align:center;max-width:340px;width:100%;box-shadow:var(--shadow-hover);}' +
      '.off-pass-av{width:64px;height:64px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:2rem;margin:0 auto 12px;border:3px solid #fff;box-shadow:0 0 0 3px var(--gold-light);}' +
      '.off-pass-title{font-family:"Playfair Display",serif;font-weight:900;font-size:1.4rem;margin-bottom:4px;}' +
      '.off-pass-sub{color:var(--ink-light);font-size:.9rem;margin-bottom:18px;}';
    var s = document.createElement('style'); s.id = 'off-styles'; s.textContent = css;
    document.head.appendChild(s);
  }
})();
;
