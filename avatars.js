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
