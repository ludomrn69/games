#!/usr/bin/env node
/*
  tools/check.js — Vérifs rapides du site (lancées en CI et en local : `node tools/check.js`).
   1. Syntaxe JS de tous les .js racine.
   2. Syntaxe du JS inline de chaque .html.
   3. Cohérence : chaque jeu listé dans index.html a son fichier <jeu>.html,
      est présent dans le cache du service worker (sw.js), et réciproquement.
   4. JSON valides (manifest, règles).
*/
'use strict';
var fs = require('fs');
var path = require('path');
var cp = require('child_process');
var ROOT = path.resolve(__dirname, '..');
var errors = [];
function err(m) { errors.push(m); }
function read(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }
function checkSyntax(code, label) {
  var tmp = path.join(require('os').tmpdir(), 'chk_' + Math.random().toString(36).slice(2) + '.js');
  fs.writeFileSync(tmp, code);
  try { cp.execSync('node --check ' + JSON.stringify(tmp), { stdio: 'pipe' }); }
  catch (e) { err('Syntaxe JS : ' + label + '\n' + (e.stderr ? e.stderr.toString().split('\n').slice(0, 4).join('\n') : e.message)); }
  finally { try { fs.unlinkSync(tmp); } catch (_) {} }
}

var files = fs.readdirSync(ROOT);

// 1) .js racine
files.filter(function (f) { return f.endsWith('.js'); }).forEach(function (f) { checkSyntax(read(f), f); });

// 2) JS inline des .html
var htmls = files.filter(function (f) { return f.endsWith('.html'); });
htmls.forEach(function (f) {
  var s = read(f);
  var re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g, m, i = 0;
  while ((m = re.exec(s))) { if (m[1].trim()) checkSyntax(m[1], f + ' (script inline #' + (++i) + ')'); }
});

// 3) cohérence index.html / sw.js / fichiers
var index = read('index.html');
var gameKeys = [];
var kre = /key:\s*'([^']+)'/g, km;
while ((km = kre.exec(index))) gameKeys.push(km[1]);
if (gameKeys.length < 5) err('index.html : trop peu de jeux détectés (' + gameKeys.length + ')');

var sw = read('sw.js');
gameKeys.forEach(function (k) {
  if (!fs.existsSync(path.join(ROOT, k + '.html'))) err('Jeu « ' + k +' » listé dans index.html mais ' + k + '.html absent');
  if (sw.indexOf("'" + k + ".html'") < 0) err('Jeu « ' + k + ' » absent du cache service worker (sw.js ASSETS)');
});
// l'inverse : chaque <jeu>.html (hors index) listé dans sw doit être dans index
htmls.filter(function (f) { return f !== 'index.html'; }).forEach(function (f) {
  var k = f.replace('.html', '');
  if (sw.indexOf("'" + f + "'") < 0) err('Fichier ' + f + ' absent du cache service worker (sw.js)');
  if (gameKeys.indexOf(k) < 0) err('Fichier ' + f + ' présent mais pas listé dans index.html (jeu orphelin ?)');
});
// moteurs partagés référencés par des pages doivent être en cache
['monopoly-engine.js', 'cluedo-engine.js'].forEach(function (eng) {
  if (fs.existsSync(path.join(ROOT, eng)) && sw.indexOf("'" + eng + "'") < 0) err(eng + ' présent mais absent du cache service worker');
});

// 4) JSON
['manifest.webmanifest', 'database.rules.example.json'].forEach(function (f) {
  try { JSON.parse(read(f)); } catch (e) { err('JSON invalide : ' + f + ' — ' + e.message); }
});

if (errors.length) { console.error('❌ ' + errors.length + ' problème(s) :\n\n' + errors.join('\n\n')); process.exit(1); }
console.log('✅ Vérifs OK : ' + files.filter(function (f) { return f.endsWith('.js'); }).length + ' JS, ' + htmls.length + ' HTML, ' + gameKeys.length + ' jeux cohérents (index/sw/fichiers).');
