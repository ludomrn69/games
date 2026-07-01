#!/usr/bin/env node
/*
  tools/gen-fonts.js — (Re)génère les polices AUTO-HÉBERGÉES (fonts.css + fonts/).

  Le site n'appelle plus Google Fonts : les polices sont servies depuis le même
  domaine → rendu identique HORS-LIGNE (avion) et aucune fuite vers Google.
  Ce script télécharge les .woff2 (sous-ensembles latin + latin-ext, suffisants
  pour le français) et réécrit fonts.css pour pointer vers /fonts/*.woff2.

  Nécessite un accès réseau (Google Fonts). NON lancé en CI — à relancer seulement
  si on change les familles/graisses ci-dessous. Licences : OFL (Google Fonts).

  Usage : node tools/gen-fonts.js
*/
'use strict';
var fs = require('fs');
var path = require('path');
var https = require('https');
var ROOT = path.resolve(__dirname, '..');
var FONTS_DIR = path.join(ROOT, 'fonts');
var CSS_URL = 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&family=DM+Sans:wght@400;500;700&family=Caveat:wght@500;700&display=swap';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
var KEEP = { 'latin': 1, 'latin-ext': 1 };

function get(url, binary) {
  return new Promise(function (resolve, reject) {
    https.get(url, { headers: { 'User-Agent': UA } }, function (res) {
      if (res.statusCode !== 200) { reject(new Error(url + ' → HTTP ' + res.statusCode)); return; }
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () { resolve(binary ? Buffer.concat(chunks) : Buffer.concat(chunks).toString('utf8')); });
    }).on('error', reject);
  });
}

async function main() {
  var css = await get(CSS_URL, false);
  var re = /\/\*\s*([a-z0-9-]+)\s*\*\/\s*(@font-face\s*\{[\s\S]*?\})/g;
  var m, kept = [], dl = {};
  while ((m = re.exec(css))) {
    var subset = m[1], block = m[2];
    if (!KEEP[subset]) continue;
    var um = /url\((https:\/\/[^)]+\.woff2)\)/.exec(block);
    var fm = /font-family:\s*'([^']+)'/.exec(block);
    if (!um) continue;
    var fam = (fm ? fm[1] : 'font').toLowerCase().replace(/[^a-z0-9]+/g, '');
    // Polices variables : une même URL sert plusieurs graisses → 1 fichier par
    // (famille, sous-ensemble), partagé entre les @font-face.
    var local = fam + '-' + subset + '.woff2';
    kept.push('/* ' + subset + ' */\n' + block.replace(um[1], '/fonts/' + local));
    dl[um[1]] = local;
  }
  if (!fs.existsSync(FONTS_DIR)) fs.mkdirSync(FONTS_DIR);
  var urls = Object.keys(dl);
  for (var i = 0; i < urls.length; i++) {
    var buf = await get(urls[i], true);
    fs.writeFileSync(path.join(FONTS_DIR, dl[urls[i]]), buf);
    console.log('  ✓ ' + dl[urls[i]] + ' (' + buf.length + ' o)');
  }
  var header = '/* Polices auto-hébergées (Google Fonts, OFL) — régénérer via tools/gen-fonts.js */\n';
  fs.writeFileSync(path.join(ROOT, 'fonts.css'), header + kept.join('\n') + '\n');
  console.log('✅ fonts.css régénéré (' + kept.length + ' @font-face, ' + urls.length + ' fichiers).');
}
main().catch(function (e) { console.error('❌ ' + e.message); process.exit(1); });
