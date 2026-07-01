#!/usr/bin/env node
/*
  tools/gen-sw-version.js — Estampille AUTOMATIQUEMENT la version du cache du
  service worker (`var CACHE = 'jeux-<empreinte>';` dans sw.js) à partir du
  CONTENU réellement mis en cache (la liste ASSETS). Fini le « j'ai oublié de
  bumper la version » : dès qu'un fichier préchargé change, l'empreinte change,
  le SW se réinstalle et les visiteurs reçoivent la nouvelle version.

  Usage :
    node tools/gen-sw-version.js          → réécrit sw.js avec la bonne version
    node tools/gen-sw-version.js --check  → échoue (exit 1) si sw.js pas à jour (CI)
*/
'use strict';
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var ROOT = path.resolve(__dirname, '..');
var SW = path.join(ROOT, 'sw.js');

function computeVersion(sw) {
  var m = sw.match(/var\s+ASSETS\s*=\s*(\[[\s\S]*?\]);/);
  if (!m) throw new Error('Liste ASSETS introuvable dans sw.js');
  // eslint-disable-next-line no-new-func
  var assets = (new Function('return ' + m[1] + ';'))();
  var h = crypto.createHash('sha256');
  assets.slice().sort().forEach(function (rel) {
    if (rel === './') return; // alias de index.html, déjà pris en compte
    var f = path.join(ROOT, rel);
    if (!fs.existsSync(f)) return; // sw.js ignore aussi les fichiers manquants
    h.update(rel + '\0');
    h.update(fs.readFileSync(f));
  });
  return 'jeux-' + h.digest('hex').slice(0, 10);
}

function main() {
  var sw = fs.readFileSync(SW, 'utf8');
  var re = /(var\s+CACHE\s*=\s*')[^']*(';)/;
  if (!re.test(sw)) throw new Error("Ligne `var CACHE = '…';` introuvable dans sw.js");
  var version = computeVersion(sw);
  var next = sw.replace(re, '$1' + version + '$2');
  var check = process.argv.indexOf('--check') >= 0;
  if (check) {
    if (next !== sw) {
      console.error('❌ La version du cache (sw.js) n\'est pas à jour avec le contenu préchargé.\n   Lance : node tools/gen-sw-version.js');
      process.exit(1);
    }
    console.log('✅ Version du cache à jour (' + version + ').');
    return;
  }
  if (next !== sw) { fs.writeFileSync(SW, next); console.log('✅ Version du cache estampillée : ' + version + '.'); }
  else console.log('✅ Version du cache déjà à jour (' + version + ').');
}
main();
