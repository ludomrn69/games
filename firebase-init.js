/*
  firebase-init.js — Configuration Firebase, SOURCE UNIQUE.

  On réutilise le projet « flechettes-d54b1 » (déjà SANS login). Toutes les
  données du site de jeux vivent sous la branche `games/` de la Realtime
  Database, isolées du reste (flechettes, quiz crémaillère…).

  La clé API web est publique par design : la sécurité repose sur les règles de
  la base (voir database.rules.json — il faut ouvrir la branche `games`
  en lecture/écriture dans la console Firebase).

  Auth anonyme ACTIVE (invisible) : chaque appareil obtient un auth.uid, exigé par
  les règles. UX toujours « sans login » (aucun formulaire). Voir plus bas.
*/
(function () {
  var config = {
    apiKey: 'AIzaSyBw1nsvo2QQ5S0Oir0mR8L4Wvfonif_0UM',
    authDomain: 'flechettes-d54b1.firebaseapp.com',
    databaseURL: 'https://flechettes-d54b1-default-rtdb.europe-west1.firebasedatabase.app',
    projectId: 'flechettes-d54b1',
    storageBucket: 'flechettes-d54b1.firebasestorage.app',
    messagingSenderId: '880930635426',
    appId: '1:880930635426:web:8a25672de9dabd2ec521fb'
  };
  // Racine de toutes les données de ce site dans la base.
  window.GAMES_ROOT = 'games';
  window.FIREBASE_CONFIG = config;
  if (typeof firebase !== 'undefined' && firebase.apps && !firebase.apps.length) {
    firebase.initializeApp(config);
  }

  // ── Auth anonyme (SecOps) — ACTIVE (mode nominal) ───────────────────────────
  // Attribue un uid cryptographique par session, lié à la présence et aux règles
  // strictes (database.rules.json exige auth != null). PRÉREQUIS côté console :
  //   1. « Anonymous » activé dans Firebase Console → Authentication ;
  //   2. database.rules.json déployées (règles strictes basées sur auth).
  // Si ces prérequis manquent, les écritures EN LIGNE sont refusées (le mode
  // hors-ligne / avion n'est jamais concerné). Repasser à false RÉTABLIT l'ancien
  // modèle sans auth (identité = pid localStorage) — pense alors à assouplir les
  // règles en conséquence, sinon plus rien ne peut écrire.
  window.GAMES_USE_AUTH = true;
  window.GAMES_UID = null;
  var authWaiters = [];
  // whenGamesAuth(cb) : rappelé avec l'uid dès qu'il est disponible (ou jamais si
  // l'auth est désactivée / hors-ligne → l'appelant doit prévoir un repli).
  window.whenGamesAuth = function (cb) { if (window.GAMES_UID) cb(window.GAMES_UID); else authWaiters.push(cb); };
  function flushAuth(uid) { window.GAMES_UID = uid; authWaiters.splice(0).forEach(function (cb) { try { cb(uid); } catch (e) {} }); }

  if (window.GAMES_USE_AUTH && typeof firebase !== 'undefined' && firebase.initializeApp) {
    // Chargement DYNAMIQUE du SDK auth (une seule page à toucher) — échoue en
    // silence hors-ligne (avion) : on retombe alors sur le pid localStorage.
    var s = document.createElement('script');
    s.src = 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js';
    s.async = true;
    s.onload = function () {
      try {
        firebase.auth().onAuthStateChanged(function (user) { if (user && user.uid) flushAuth(user.uid); });
        firebase.auth().signInAnonymously().catch(function () {}); // non activé côté console → on ignore
      } catch (e) {}
    };
    document.head.appendChild(s);
  }
})();
