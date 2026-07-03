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
    if (window.Sfx) return Sfx.play('turn'); // même son, synthèse mutualisée (sfx.js)
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
    if (mine && !_lastMine) { beep(); try { if (soundOn() && navigator.vibrate) navigator.vibrate(180); } catch (e) {} }
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
    // Signature = joueur actif + phase : les jeux multi-étapes (Cluedo, Bataille
    // navale…) réarment le chrono à chaque étape — un absent est débloqué à
    // chaque phase, pas seulement au changement de `turn`.
    var clockSig = String(room.turn) + '|' + String(room.phase || '') + '|' + String(botActivePid(room) || '');
    if (clockSig !== _clockTurn) { _clockTurn = clockSig; _clockStart = Date.now(); _timedOutTurn = null; }
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
    shouldBlunder: function (state) { return Math.random() < window.Bots.blunderP(state); },

    // ── Vitesse des ORDIS ──────────────────────────────────────────────────
    // Délai avant chaque coup d'ordi. Par défaut « humaine » (≈ 1,3 s) pour
    // qu'on SUIVE la partie ; réglable dans le salon (room.botSpeed) et en jeu.
    // Repli sur une préférence locale (appareil) puis « humaine ».
    SPEEDS: ['chill', 'human', 'brisk', 'fast'],
    SPEED_LABELS: { chill: '🐢 Posée', human: '🚶 Humaine', brisk: '🏃 Vive', fast: '⚡ Rapide' },
    SPEED_MS: { chill: 2200, human: 1300, brisk: 750, fast: 320 },
    speedPref: function () { try { return localStorage.getItem('games.botSpeed'); } catch (e) { return null; } },
    setSpeedPref: function (s) { try { localStorage.setItem('games.botSpeed', s); } catch (e) {} },
    speed: function (state) {
      var s = (state && state.botSpeed) || (window.room && window.room.botSpeed) || window.Bots.speedPref() || 'human';
      return window.Bots.SPEED_MS[s] != null ? s : 'human';
    },
    speedDelay: function (state) { return window.Bots.SPEED_MS[window.Bots.speed(state)]; }
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
    // Couleur de la pastille selon la difficulté du jour (repère visuel clair).
    var lvl = window.Daily.level ? window.Daily.level() : 'normal';
    var lvlColor = lvl === 'easy' ? 'var(--sage)' : lvl === 'hard' ? 'var(--terracotta)' : 'var(--gold)';
    var badges;
    if (st.doneToday) {
      badges = '<span class="lb-daily-badge" style="background:var(--sage);color:#fff">✅ Fait aujourd\'hui' +
        (st.best && window.Puzzle ? ' · ' + window.Puzzle.fmtTime(st.best) : '') + '</span>';
    } else {
      badges = '<span class="lb-daily-badge" style="background:' + lvlColor + ';color:#fff">' +
        'Difficulté : ' + esc(window.Daily.levelLabel()) + '</span>';
    }
    if (st.streak > 0) badges += '<span class="lb-daily-badge" style="background:var(--white);color:var(--terracotta);border:1.5px solid var(--gold-light)">série ' + st.streak + ' 🔥</span>';
    return '<button class="lb-btn" style="margin-bottom:10px;background:linear-gradient(135deg,var(--terracotta),var(--gold));color:#fff" onclick="Lobby.goDaily()">🗓️ Défi du jour — ' + esc(t.label) + '</button>' +
      '<div class="lb-daily-badges" style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:0 0 18px">' + badges + '</div>';
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
      // « déjà dedans » : présent dans players, OU membre de la manche en cours
      // (room.order) — couvre la reconnexion après une coupure qui aurait effacé
      // le nœud joueur (on peut alors revenir au lieu d'être exclu).
      var iAmIn = !!players[window.myPid] || (room.order || []).indexOf(window.myPid) >= 0;
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

  // ── Garde « anti-fantôme » (salle d'attente SEULEMENT) ────────────────────
  // En attente : si on ferme l'onglet, notre nœud joueur disparaît (liste nette).
  // En PARTIE : surtout pas — le nœud joueur porte l'état du jeu (main, score…) ;
  // une coupure réseau le détruirait et exclurait le joueur définitivement. On
  // annule donc le remove() au démarrage, et presence.js se contente de basculer
  // online=false à la déconnexion. (cancel() annule aussi les onDisconnect des
  // chemins ENFANTS → on ré-arme celui de presence juste après.)
  var _ghostArmed = false;
  function armGhostGuard() {
    if (_ghostArmed || !window.roomRef || !window.myPid) return;
    try { window.roomRef.child('players/' + window.myPid).onDisconnect().remove(); _ghostArmed = true; } catch (e) {}
  }
  function disarmGhostGuard() {
    if (!_ghostArmed || !window.roomRef || !window.myPid) return;
    _ghostArmed = false;
    try {
      window.roomRef.child('players/' + window.myPid).onDisconnect().cancel();
      window.roomRef.child('players/' + window.myPid + '/online').onDisconnect().set(false);
    } catch (e) {}
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
      var status = (snap && snap.val() && snap.val().status) || 'waiting';
      // anti-fantôme : seulement tant qu'on ATTEND (voir armGhostGuard).
      if (status === 'waiting') armGhostGuard();
      if (window.GamePresence) GamePresence.start(window.roomRef, window.myPid);
      // Si la partie n'a pas (encore) commencé, on montre la salle d'attente ;
      // sinon on laisse le jeu router vers son écran de jeu (reconnexion en cours).
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
      armGhostGuard(); // retour au lobby (rejouer) → la garde anti-fantôme reprend
      if (isActive('s-playing') || isActive('s-home')) window.showScreen('s-lobby');
      if (isActive('s-lobby')) renderLobby(room);
      maybeAutoStart(room);
    } else {
      disarmGhostGuard(); // partie lancée : le nœud joueur ne doit plus s'effacer
    }
    // Dans tous les cas on laisse le jeu réagir (il gère son écran 's-playing').
    if (cfg().onState) try { cfg().onState(snap); } catch (e) { console.error(e); }
    // Puis l'hôte fait jouer les ordis dont c'est le tour (no-op s'il n'y en a pas).
    try { driveBots(room); } catch (e) { console.error(e); }
    try { refreshBotSpeedUI(); } catch (e) {}
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

    var speed = window.Bots.speed(room);
    var speedBtns = window.Bots.SPEEDS.map(function (sp2) {
      return '<button type="button" class="lb-set-btn' + (sp2 === speed ? ' active' : '') + '"' +
        (isHost ? ' onclick="Lobby.setBotSpeed(\'' + sp2 + '\')"' : ' disabled') + '>' + window.Bots.SPEED_LABELS[sp2] + '</button>';
    }).join('');

    var hint = isHost ? '' : '<div class="lb-set-hint">Réglé par l’hôte</div>';
    var showBotOpts = curBots > 0 || !isHost;
    return '<div class="lb-botset">' +
      '<div class="lb-set"><div class="lb-set-label">🤖 Ordis</div><div class="lb-set-row">' + countBtns + '</div></div>' +
      (showBotOpts ? '<div class="lb-set"><div class="lb-set-label">Niveau</div><div class="lb-set-row">' + diffBtns + '</div></div>' : '') +
      (showBotOpts ? '<div class="lb-set"><div class="lb-set-label">Vitesse des ordis</div><div class="lb-set-row">' + speedBtns + '</div></div>' : '') +
      hint + '</div>';
  }
  function setDifficulty(level) {
    if (window.Bots.LEVELS.indexOf(level) < 0) return;
    if (window.roomRef) window.roomRef.child('difficulty').set(level);
  }
  function setBotSpeed(sp) {
    if (window.Bots.SPEEDS.indexOf(sp) < 0) return;
    window.Bots.setSpeedPref(sp);                 // préférence appareil (repli hors-ligne)
    if (window.roomRef) window.roomRef.child('botSpeed').set(sp);
  }

  // ── Contrôle de vitesse des ordis EN JEU (curseur flottant) ────────────────
  // Visible pendant la partie dès qu'il y a des ordis : un petit CURSEUR qu'on
  // glisse (Posée → Humaine → Vive → Rapide). Fonctionne en ligne (room.botSpeed)
  // et hors-ligne (préférence appareil + shim roomRef).
  function refreshBotSpeedUI() {
    var c = cfg(), room = window.room;
    var hasBots = !!(c.bot && room && room.players && Object.keys(room.players).some(function (k) { return room.players[k] && room.players[k].isBot; }));
    var playing = !!(room && room.status === 'playing' && !room.winner);
    var el = document.getElementById('lb-botspeed');
    if (!hasBots || !playing || !isActive('s-playing')) { if (el) el.style.display = 'none'; return; }
    if (!el) {
      el = document.createElement('div');
      el.id = 'lb-botspeed'; el.className = 'lb-botspeed';
      el.title = 'Vitesse des ordis (glisse le curseur)';
      el.innerHTML = '<span class="lb-botspeed-ic">🤖</span>' +
        '<input type="range" id="lb-botspeed-range" min="0" max="' + (window.Bots.SPEEDS.length - 1) + '" step="1" aria-label="Vitesse des ordis">' +
        '<span class="lb-botspeed-lbl" id="lb-botspeed-lbl"></span>';
      el.querySelector('#lb-botspeed-range').addEventListener('input', function () { onBotSpeedSlide(+this.value); });
      document.body.appendChild(el);
    }
    el.style.display = 'inline-flex';
    var rng = document.getElementById('lb-botspeed-range');
    if (document.activeElement !== rng) rng.value = window.Bots.SPEEDS.indexOf(window.Bots.speed(room)); // pas de saut pendant le glissé
    var lbl = document.getElementById('lb-botspeed-lbl'); if (lbl) lbl.textContent = window.Bots.SPEED_LABELS[window.Bots.speed(room)];
  }
  function onBotSpeedSlide(i) {
    var order = window.Bots.SPEEDS, sp = order[Math.max(0, Math.min(order.length - 1, i))];
    setBotSpeed(sp);
    var lbl = document.getElementById('lb-botspeed-lbl'); if (lbl) lbl.textContent = window.Bots.SPEED_LABELS[sp];
  }
  function cycleBotSpeed() { // compat : gardé au cas où appelé ailleurs
    var order = window.Bots.SPEEDS, cur = window.Bots.speed(window.room);
    onBotSpeedSlide((order.indexOf(cur) + 1) % order.length);
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
    if (sig === botDrive.sig && (now - botDrive.t) < 6000) return; // anti-rafale / déjà programmé
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
    }, window.Bots.speedDelay(room));
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
          snap.forEach(function (child) {
            var v = child.val() || {};
            // partie encore EN COURS (createdAt figé à la création : une soirée
            // marathon dépasse 12 h) → épargnée jusqu'à 48 h.
            if (v.status === 'playing' && (v.createdAt || 0) > Date.now() - 48 * 60 * 60 * 1000) return;
            try { child.ref.remove(); } catch (e) {}
          });
        });
    } catch (e) {}
  }

  function leaveRoom() {
    var c = cfg();
    if (window.roomRef && window.myPid) {
      _ghostArmed = false;
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
  // FUSION (surtout pas d'écrasement) : window.Lobby porte déjà toggleSound,
  // soundOn et turnAlertFor, posés plus haut — un objet littéral les perdrait
  // (bip de tour, chrono et coup automatique sur timeout morts en silence).
  Object.assign(window.Lobby, {
    createRoom: createRoom,
    joinRoomByCode: joinRoomByCode,
    joinFromInput: joinFromInput,
    submitIdentity: submitIdentity,
    toggleReady: toggleReady,
    setBotCount: setBotCount,
    setDifficulty: setDifficulty,
    setBotSpeed: setBotSpeed,
    refreshBotSpeedUI: refreshBotSpeedUI,
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
  });
})();
