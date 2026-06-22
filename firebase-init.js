/*
  firebase-init.js — Configuration Firebase, SOURCE UNIQUE.

  On réutilise le projet « flechettes-d54b1 » (déjà SANS login). Toutes les
  données du site de jeux vivent sous la branche `games/` de la Realtime
  Database, isolées du reste (flechettes, quiz crémaillère…).

  La clé API web est publique par design : la sécurité repose sur les règles de
  la base (voir database.rules.example.json — il faut ouvrir la branche `games`
  en lecture/écriture dans la console Firebase).

  Pas d'authentification : n'importe qui ayant le lien peut jouer.
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
})();
