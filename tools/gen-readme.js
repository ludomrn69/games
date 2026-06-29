#!/usr/bin/env node
/*
  tools/gen-readme.js — Génère le TABLEAU DES JEUX du README à partir de l'unique
  source de vérité : le catalogue `GAMES` de index.html. Fini les dérives (jeu
  listé mais inexistant, ou l'inverse).

  Le tableau est inséré entre les marqueurs, dans README.md :
      <!-- GAMES:START (généré par tools/gen-readme.js — ne pas éditer à la main) -->
      …tableau…
      <!-- GAMES:END -->

  Usage :
    node tools/gen-readme.js          → réécrit README.md
    node tools/gen-readme.js --check  → échoue (exit 1) si README pas à jour (CI)
*/
'use strict';
var fs = require('fs');
var path = require('path');
var ROOT = path.resolve(__dirname, '..');
var README = path.join(ROOT, 'README.md');
var START = '<!-- GAMES:START (généré par tools/gen-readme.js — ne pas éditer à la main) -->';
var END = '<!-- GAMES:END -->';

// Extrait le littéral `var GAMES = [ … ];` de index.html et l'évalue.
function readGames() {
  var html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  var m = html.match(/var\s+GAMES\s*=\s*(\[[\s\S]*?\]);/);
  if (!m) throw new Error('Catalogue GAMES introuvable dans index.html');
  // eslint-disable-next-line no-new-func
  return (new Function('return ' + m[1] + ';'))();
}

function buildTable(games) {
  var rows = games.filter(function (g) { return g.on; }).map(function (g) {
    var offline = g.offline ? '✈️' : '';
    var type = g.type || '';
    return '| ' + g.emoji + ' ' + g.name + ' | ' + g.players + ' | ' + offline + ' | ' + type + ' |';
  });
  return [
    START,
    '',
    '| Jeu | Joueurs | Hors-ligne | Type |',
    '|---|---|:---:|---|',
  ].concat(rows).concat(['', END]).join('\n');
}

function apply(content, table) {
  var s = content.indexOf(START), e = content.indexOf(END);
  if (s >= 0 && e > s) {
    return content.slice(0, s) + table + content.slice(e + END.length);
  }
  // Pas encore de marqueurs : on remplace l'ancien tableau sous le titre « ## Les jeux ».
  var re = /(##\s*Les jeux\s*\n)([\s\S]*?)(\n##\s)/;
  if (re.test(content)) return content.replace(re, '$1\n' + table + '\n$3');
  throw new Error('Ni marqueurs GAMES ni section « ## Les jeux » trouvés dans README.md');
}

function main() {
  var games = readGames();
  var table = buildTable(games);
  var content = fs.readFileSync(README, 'utf8');
  var next = apply(content, table);
  var check = process.argv.indexOf('--check') >= 0;
  if (check) {
    if (next !== content) {
      console.error('❌ README.md n\'est pas à jour avec index.html.\n   Lance : node tools/gen-readme.js');
      process.exit(1);
    }
    console.log('✅ README à jour (' + games.filter(function (g) { return g.on; }).length + ' jeux).');
    return;
  }
  if (next !== content) { fs.writeFileSync(README, next); console.log('✅ README régénéré (' + games.filter(function (g) { return g.on; }).length + ' jeux).'); }
  else console.log('✅ README déjà à jour.');
}
main();
