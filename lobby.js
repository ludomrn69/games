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
  var CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ'; // sans I ni O (lisibilité)

  function cfg() { return window.ROOM || {}; }
  function db() { return firebase.database(); }

  // ── Identité de l'appareil ────────────────────────────────────────────────
  function getPid() {
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

  // ── Firebase / salon ──────────────────────────────────────────────────────
  function setRoom(code) {
    window.roomCode = code;
    window.roomRef = db().ref(ROOT + '/rooms/' + code);
    window.gameRef = window.roomRef; // alias pour faciliter le portage des jeux
  }
  function genCode() {
    var s = '';
    for (var i = 0; i < 4; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    return s;
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  window.GameRoom = function (config) {
    window.ROOM = config || {};
    window.myPid = getPid();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init, { once: true });
    } else { init(); }
  };

  function init() {
    renderHome();
    var params = new URLSearchParams(location.search);
    var code = (params.get('room') || '').trim().toUpperCase();
    if (code) joinRoomByCode(code, true);
    else window.showScreen('s-home');
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
        '<button class="lb-btn" onclick="Lobby.createRoom()">Créer une partie</button>' +
        '<div style="margin:18px 0 8px;color:var(--ink-light);font-size:0.85rem">ou rejoindre avec un code</div>' +
        '<input id="lb-join-code" class="lb-input code" maxlength="4" placeholder="CODE" autocomplete="off" inputmode="text">' +
        '<button class="lb-btn ghost" onclick="Lobby.joinFromInput()">Rejoindre</button>' +
        (c.offline ? ('<div style="margin:18px 0 6px;color:var(--ink-light);font-size:0.85rem">ou sans connexion ✈️</div>' +
          (c.offline.solo ? '<button class="lb-btn ghost" onclick="Lobby.goOffline(\'solo\')">🤖 Solo (contre l\'ordi)</button>' : '') +
          (c.offline.local ? '<button class="lb-btn ghost" onclick="Lobby.goOffline(\'local\')">📱 Local (même appareil)</button>' : '')) : '') +
        (rules ? '<div class="lb-code-card" style="text-align:left;margin-top:24px"><div class="lb-code-label">Règles rapides</div><ul style="list-style:none;margin-top:6px;display:flex;flex-direction:column;gap:6px;font-size:0.86rem;color:var(--ink-light)">' + rules + '</ul></div>' : '') +
        '<a class="lb-link" href="index.html">← Tous les jeux</a>' +
      '</div>';
    var inp = document.getElementById('lb-join-code');
    if (inp) {
      inp.addEventListener('input', function () { inp.value = inp.value.toUpperCase().replace(/[^A-Z]/g, ''); });
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') joinFromInput(); });
    }
  }

  function joinFromInput() {
    var inp = document.getElementById('lb-join-code');
    var code = (inp && inp.value || '').trim().toUpperCase();
    if (code.length < 4) { lbToast('Entre les 4 lettres du code'); return; }
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
        location.href = room.game + '.html?room=' + code; return;
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

    if (status === 'waiting') {
      // En attente : la salle d'attente est gérée ici. On y revient si on était
      // sur l'écran de jeu (fin de partie) ou encore sur l'accueil (auto-join).
      if (isActive('s-playing') || isActive('s-home')) window.showScreen('s-lobby');
      if (isActive('s-lobby')) renderLobby(room);
      maybeAutoStart(room);
    }
    // Dans tous les cas on laisse le jeu réagir (il gère son écran 's-playing').
    if (cfg().onState) try { cfg().onState(snap); } catch (e) { console.error(e); }
  }
  function isActive(id) { var el = document.getElementById(id); return el && el.classList.contains('active'); }

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

    host.innerHTML =
      '<div class="lb-wrap">' +
        '<p class="lb-kicker">Salle d’attente</p>' +
        '<h1 class="lb-title" style="font-size:clamp(1.6rem,6vw,2.2rem)">' + esc(c.name || 'Jeu') + '</h1>' +
        '<div class="lb-code-card"><div class="lb-code-label">Code du salon</div><div class="lb-code">' + esc(window.roomCode || '') + '</div>' +
          '<div class="lb-code-actions"><button class="lb-btn small ghost" onclick="Lobby.shareRoom()">Partager le lien</button></div></div>' +
        '<div class="lb-players">' + rows + '</div>' +
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
        ps[k].ready = false;
        // on ne garde de l'ancien que name/emoji/color/seat/online/ts + les clés demandées
        var base = { name: ps[k].name, emoji: ps[k].emoji, color: ps[k].color, seat: ps[k].seat,
          online: ps[k].online, ts: ps[k].ts, ready: false, joinedAt: ps[k].joinedAt };
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

  function leaveRoom() {
    var c = cfg();
    if (window.roomRef && window.myPid) {
      try { window.roomRef.child('players/' + window.myPid).onDisconnect().cancel(); } catch (e) {}
      window.roomRef.child('players/' + window.myPid).remove();
    }
    if (window.listenersOn) { window.roomRef.off('value', masterOnState); window.listenersOn = false; }
    if (window.GamePresence) GamePresence.stop();
    if (c.onLeave) try { c.onLeave(); } catch (e) {}
    location.href = 'index.html';
  }

  // ── API publique appelée par les onclick injectés et par les jeux ─────────
  window.Lobby = {
    createRoom: createRoom,
    joinRoomByCode: joinRoomByCode,
    joinFromInput: joinFromInput,
    submitIdentity: submitIdentity,
    toggleReady: toggleReady,
    shareRoom: shareRoom,
    changeIdentity: changeIdentity,
    cancelChange: cancelChange,
    leaveRoom: leaveRoom,
    resetToLobby: resetToLobby,
    goOffline: goOffline
  };
})();
