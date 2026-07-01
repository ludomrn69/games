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
          // Un seul reaper à la fois : l'HÔTE (sinon chaque client transactionne
          // tout le salon toutes les 8 s — bande passante et conflits inutiles).
          // Si l'hôte lui-même semble parti (offline ou ts périmé), tout le monde
          // reprend la main — la transaction absorbe les courses éventuelles.
          var r = window.room;
          if (r && r.host && r.host !== curPid) {
            var h = r.players && r.players[r.host];
            if (h && h.online !== false && (serverNow() - (h.ts || 0)) <= STALE_MS) return;
          }
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
