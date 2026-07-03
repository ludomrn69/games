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
      // Signature Firebase : once('value', cb) — on tolère aussi once(cb).
      once: function (ev, cb) {
        var f = (typeof ev === 'function') ? ev : cb;
        var s = { val: function () { return clone(getPath(parts)); } };
        if (typeof f === 'function') f(s);
        return Promise.resolve(s);
      }
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
    // Signature Firebase : once('value', cb) — on tolère aussi once(cb).
    once: function (ev, cb) { var f = (typeof ev === 'function') ? ev : cb; if (typeof f === 'function') f(snap()); return Promise.resolve(snap()); }
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
      if (!noBots && cfg.bot) controls += speedRow();   // vitesse des ordis (pas pour un solo-chrono pur)
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
        var b = e.target.closest('.off-num, .off-diff, .off-speed'); if (!b) return;
        row.querySelectorAll('.off-num, .off-diff, .off-speed').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        // Vitesse des ordis : mémorisée immédiatement (préférence appareil).
        if (b.classList.contains('off-speed') && window.Bots) window.Bots.setSpeedPref(b.dataset.speed);
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
  function speedRow() {
    var B = window.Bots; if (!B || !B.SPEEDS) return '';
    var def = B.speedPref() || 'human';
    var btns = B.SPEEDS.map(function (sp) {
      return '<button type="button" class="off-speed' + (sp === def ? ' active' : '') + '" data-speed="' + sp + '">' + B.SPEED_LABELS[sp] + '</button>';
    }).join('');
    return '<div class="off-set"><div class="off-set-label">Vitesse des ordis</div><div class="off-set-row">' + btns + '</div></div>';
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
      try { if (window.Lobby && window.Lobby.refreshBotSpeedUI) window.Lobby.refreshBotSpeedUI(); } catch (e) {}
      try { if (window.Lobby && window.Lobby.refreshGameStatsUI) window.Lobby.refreshGameStatsUI(room); } catch (e) {}
      if (!ended() && active && isBot(active)) setTimeout(botStep, (window.Bots && window.Bots.speedDelay) ? window.Bots.speedDelay(room) : BOT_DELAY);
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
      try { if (window.Lobby && window.Lobby.refreshGameStatsUI) window.Lobby.refreshGameStatsUI(room); } catch (e) {}
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
      '.off-num,.off-diff,.off-speed{min-width:46px;padding:.5rem .8rem;border:1.5px solid var(--gold-light);border-radius:12px;background:var(--white);color:var(--ink);font-weight:700;font-family:"DM Sans",sans-serif;cursor:pointer;}' +
      '.off-num.active,.off-diff.active,.off-speed.active{background:linear-gradient(135deg,var(--terracotta),var(--gold));color:#fff;border-color:transparent;}' +
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
