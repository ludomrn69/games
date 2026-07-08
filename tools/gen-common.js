#!/usr/bin/env node
/*
  tools/gen-common.js — Génère common.js, le bundle des scripts de corps communs
  à toutes les pages de jeu (nav, daily, stats, sfx, presence, avatars, lobby,
  offline), dans l'ordre. Remplace l'ancien boot.js qui les injectait un par un
  via document.write (déprécié, bloquant le rendu).

  Une seule balise bloquante classique suffit désormais côté page de jeu :
      <script src="/common.js"></script>
  (le moteur d'IA éventuel du jeu est chargé par sa propre balise, juste après.)

  Usage :
    node tools/gen-common.js          → (ré)écrit common.js
    node tools/gen-common.js --check  → échoue (exit 1) si common.js pas à jour (CI)
*/
'use strict';
var fs = require('fs');
var path = require('path');
var ROOT = path.resolve(__dirname, '..');
var OUT = path.join(ROOT, 'common.js');

// Ordre HISTORIQUE (identique à celui de l'ancien boot.js) : les dépendances
// (lobby, offline) arrivent après les briques de base.
var SOURCES = ['nav.js', 'daily.js', 'stats.js', 'sfx.js', 'fx.js', 'a11y.js', 'presence.js', 'avatars.js', 'lobby.js', 'offline.js'];

function build() {
  var banner =
    '/*\n' +
    '  common.js — GÉNÉRÉ par tools/gen-common.js — NE PAS ÉDITER À LA MAIN.\n' +
    '\n' +
    '  Concaténation, dans l\'ordre, des scripts de corps communs aux pages de jeu.\n' +
    '  Chargé par chaque page via une balise bloquante classique (plus de document.write) :\n' +
    '      <script src="/common.js"></script>\n' +
    '  Pour modifier : édite le fichier source concerné puis relance `node tools/gen-common.js`.\n' +
    '  Sources : ' + SOURCES.join(', ') + '\n' +
    '*/\n';
  // Chaque bloc se termine par « ; » : garantit qu'une IIFE non terminée par un
  // point-virgule ne se colle pas à la suivante (`})()` + `(function` → appel).
  var parts = SOURCES.map(function (f) {
    var code = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\s+$/, '');
    return '// ════════════════════ ' + f + ' ════════════════════\n' + code + '\n;';
  });
  return banner + '\n' + parts.join('\n\n') + '\n';
}

function main() {
  var next = build();
  var cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  var check = process.argv.indexOf('--check') >= 0;
  if (check) {
    if (next !== cur) {
      console.error('❌ common.js n\'est pas à jour (bundle des scripts communs).\n   Lance : node tools/gen-common.js');
      process.exit(1);
    }
    console.log('✅ common.js à jour : ' + SOURCES.length + ' scripts groupés.');
    return;
  }
  if (next !== cur) {
    fs.writeFileSync(OUT, next);
    console.log('✅ common.js régénéré : ' + SOURCES.length + ' scripts groupés.');
  } else {
    console.log('✅ common.js déjà à jour (' + SOURCES.length + ' scripts).');
  }
}
main();
