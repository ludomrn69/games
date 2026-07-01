#!/usr/bin/env node
/*
  tools/gen-sw-version.js — Maintient AUTOMATIQUEMENT le cache du service worker.

  Deux choses, dans l'ordre :
   1. SCAN de l'arborescence → régénère le tableau `var ASSETS = [ … ];` de sw.js
      (index + CSS + JS globaux + polices + modules ai/ + toutes les pages games/).
      Fini le « j'ai ajouté un jeu mais oublié de l'ajouter au cache » : le SW
      précharge toujours l'intégralité du site jouable hors-ligne.
   2. ESTAMPILLE la version (`var CACHE = 'jeux-<empreinte>';`) à partir du CONTENU
      réellement mis en cache. Dès qu'un fichier préchargé change, l'empreinte
      change, le SW se réinstalle, les visiteurs reçoivent la nouvelle version.

  Ce qui N'EST PAS mis en cache (volontairement) : le SDK Firebase (externe, réseau
  seul), robots.txt, _headers, netlify.toml, README, database.rules*, le dossier
  tools/. Le mode hors-ligne ne s'appuie que sur les ressources same-origin listées.

  Usage :
    node tools/gen-sw-version.js          → réécrit sw.js (ASSETS + version)
    node tools/gen-sw-version.js --check  → échoue (exit 1) si sw.js pas à jour (CI)
*/
'use strict';
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var ROOT = path.resolve(__dirname, '..');
var SW = path.join(ROOT, 'sw.js');

// ── 1. Scan : construit la liste ASSETS depuis le disque ──────────────────────
function ls(dir, filter) {
  var abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs).filter(filter).sort().map(function (f) { return (dir ? dir + '/' : '') + f; });
}
// Liste récursive des fichiers correspondant au filtre (utilisée pour games/ qui
// contient désormais des sous-dossiers, ex : games/playus/). Chemins relatifs à ROOT.
function lsRec(dir, filter) {
  var abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  var out = [];
  fs.readdirSync(abs).sort().forEach(function (name) {
    var rel = dir ? dir + '/' + name : name;
    var st = fs.statSync(path.join(ROOT, rel));
    if (st.isDirectory()) out = out.concat(lsRec(rel, filter));
    else if (filter(name)) out.push(rel);
  });
  return out;
}
function endsWith(ext) { return function (f) { return f.endsWith(ext); }; }

function scanAssets() {
  // sw.js s'exclut de son propre cache : son contenu change à chaque estampillage
  // (rendrait l'empreinte instable), et le navigateur le gère hors du cache applicatif.
  var rootJs = ls('', endsWith('.js')).filter(function (f) { return f !== 'sw.js'; });
  var rootCss = ls('', endsWith('.css'));      // theme, game, fonts
  var fonts = ls('fonts', endsWith('.woff2')); // polices auto-hébergées
  var icons = ls('icons', endsWith('.png'));   // icônes PWA (manifest + apple-touch)
  var ai = ls('ai', endsWith('.js'));          // moteurs / IA partagés
  var games = lsRec('games', endsWith('.html')); // toutes les pages de jeu (+ sous-dossiers, ex : games/playus/)

  // './' est l'alias de index.html (racine servie sans nom de fichier).
  var head = ['./', 'index.html'];
  var meta = fs.existsSync(path.join(ROOT, 'manifest.webmanifest')) ? ['manifest.webmanifest'] : [];
  return head.concat(rootCss, meta, fonts, icons, rootJs, ai, games);
}

// Sérialise ASSETS en un bloc lisible, regroupé par famille (une famille par ligne
// logique), pour garder un diff propre dans sw.js.
function serializeAssets(assets) {
  var groups = {
    head:  [], css: [], meta: [], fonts: [], icons: [], js: [], ai: [], games: []
  };
  assets.forEach(function (a) {
    if (a === './' || a === 'index.html') groups.head.push(a);
    else if (a === 'manifest.webmanifest') groups.meta.push(a);
    else if (a.endsWith('.css')) groups.css.push(a);
    else if (a.indexOf('fonts/') === 0) groups.fonts.push(a);
    else if (a.indexOf('icons/') === 0) groups.icons.push(a);
    else if (a.indexOf('ai/') === 0) groups.ai.push(a);
    else if (a.indexOf('games/') === 0) groups.games.push(a);
    else if (a.endsWith('.js')) groups.js.push(a);
    else groups.head.push(a);
  });
  var q = function (arr) { return arr.map(function (a) { return "'" + a + "'"; }).join(', '); };
  var lines = [];
  lines.push('  ' + q(groups.head.concat(groups.css, groups.meta)) + ',');
  if (groups.fonts.length) lines.push('  ' + q(groups.fonts) + ',');
  if (groups.icons.length) lines.push('  ' + q(groups.icons) + ',');
  if (groups.js.length) lines.push('  ' + q(groups.js) + ',');
  if (groups.ai.length) lines.push('  ' + q(groups.ai) + ',');
  // Les pages de jeu : plusieurs par ligne pour rester compact mais lisible.
  for (var i = 0; i < groups.games.length; i += 6) {
    var chunk = groups.games.slice(i, i + 6);
    lines.push('  ' + q(chunk) + (i + 6 < groups.games.length ? ',' : ''));
  }
  return 'var ASSETS = [\n' + lines.join('\n') + '\n];';
}

// ── 2. Version : empreinte du contenu réellement mis en cache ─────────────────
function computeVersion(assets) {
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
  var assetsRe = /var\s+ASSETS\s*=\s*\[[\s\S]*?\];/;
  var cacheRe = /(var\s+CACHE\s*=\s*')[^']*(';)/;
  if (!assetsRe.test(sw)) throw new Error('Bloc `var ASSETS = [ … ];` introuvable dans sw.js');
  if (!cacheRe.test(sw)) throw new Error("Ligne `var CACHE = '…';` introuvable dans sw.js");

  var assets = scanAssets();
  var next = sw.replace(assetsRe, serializeAssets(assets));
  next = next.replace(cacheRe, '$1' + computeVersion(assets) + '$2');

  var check = process.argv.indexOf('--check') >= 0;
  if (check) {
    if (next !== sw) {
      console.error('❌ sw.js n\'est pas à jour (liste ASSETS et/ou version du cache).\n   Lance : node tools/gen-sw-version.js');
      process.exit(1);
    }
    console.log('✅ sw.js à jour : ' + assets.length + ' ressources en cache.');
    return;
  }
  if (next !== sw) {
    fs.writeFileSync(SW, next);
    var version = (next.match(cacheRe) || [])[0] || '';
    console.log('✅ sw.js régénéré : ' + assets.length + ' ressources, ' + version.replace(/var\s+CACHE\s*=\s*'|';/g, '') + '.');
  } else {
    console.log('✅ sw.js déjà à jour (' + assets.length + ' ressources).');
  }
}
main();
