/*
  qrcode.js — Générateur de QR code AUTONOME (aucun réseau, 100 % hors-ligne).

  Chargé À LA DEMANDE par lobby.js quand on ouvre « QR code » dans la salle
  d'attente : il encode l'URL du salon en un vrai QR scannable, entièrement côté
  navigateur — aucun appel à une API externe (donc ça marche aussi dans l'avion).

  Implémentation ES5 de la norme QR : mode OCTET (URL/UTF-8), choix AUTOMATIQUE de
  la version (1 à 10, largement de quoi contenir un lien de salon), correction
  d'erreur niveau M, Reed–Solomon sur GF(256), et sélection du masque optimal par
  score de pénalité (les 4 règles de la norme). Rien de propriétaire : l'algorithme
  est celui de la spécification ISO/IEC 18004.

  API :  QR.svg(texte, { ecl:'M', border:4, dark:'#1b1712', light:'#fff' }) → <svg>
         QR.encode(texte, eclIndex) → { size, modules:[[bool]] }
*/
(function () {
  'use strict';

  // ── Reed–Solomon sur GF(256), polynôme réducteur 0x11D ─────────────────────
  function rsMul(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z & 0xFF;
  }
  // Polynôme générateur de degré `degree` (coefficients, plus haut degré d'abord).
  function rsDivisor(degree) {
    var result = [];
    for (var i = 0; i < degree - 1; i++) result.push(0);
    result.push(1);
    var root = 1;
    for (var i = 0; i < degree; i++) {
      for (var j = 0; j < result.length; j++) {
        result[j] = rsMul(result[j], root);
        if (j + 1 < result.length) result[j] ^= result[j + 1];
      }
      root = rsMul(root, 0x02);
    }
    return result;
  }
  // Reste de la division (= codewords de correction) de `data` par `divisor`.
  function rsRemainder(data, divisor) {
    var result = divisor.map(function () { return 0; });
    data.forEach(function (b) {
      var factor = b ^ result.shift();
      result.push(0);
      divisor.forEach(function (coef, i) { result[i] ^= rsMul(coef, factor); });
    });
    return result;
  }

  // ── Tables de correction d'erreur (versions 1..10) — index [ecl][version] ──
  // ecl : 0=L 1=M 2=Q 3=H. Version 0 inutilisée (-1). Valeurs de la norme.
  var ECL = { L: 0, M: 1, Q: 2, H: 3 };
  var ECC_CW = {  // codewords de correction PAR bloc
    0: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18],
    1: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26],
    2: [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24],
    3: [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28]
  };
  var ECC_BLK = { // nombre de blocs de correction
    0: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4],
    1: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5],
    2: [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8],
    3: [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8]
  };
  var MAX_VERSION = 10;

  // Nombre total de modules de données bruts (bits) pour une version.
  function rawDataModules(ver) {
    var result = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      var numAlign = Math.floor(ver / 7) + 2;
      result -= (25 * numAlign - 10) * numAlign - 55;
      if (ver >= 7) result -= 36; // deux blocs d'info de version (18 modules chacun)
    }
    return result;
  }
  function numDataCodewords(ver, ecl) {
    return Math.floor(rawDataModules(ver) / 8) - ECC_CW[ecl][ver] * ECC_BLK[ecl][ver];
  }
  // Position des motifs d'alignement (algorithme de la norme).
  function alignmentPositions(ver) {
    if (ver === 1) return [];
    var numAlign = Math.floor(ver / 7) + 2;
    var step = Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
    var result = [6];
    for (var pos = ver * 4 + 10; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
    return result;
  }
  // Bits du mode octet : compteur de caractères sur 8 bits (v1-9) ou 16 (v10+).
  function charCountBits(ver) { return ver <= 9 ? 8 : 16; }

  function toUtf8Bytes(str) {
    var s = unescape(encodeURIComponent(str)), out = [];
    for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
    return out;
  }
  function getBit(x, i) { return (x >>> i) & 1; }

  // ── Encodage complet → matrice de modules (booléens) ───────────────────────
  function encode(text, ecl) {
    if (ecl == null) ecl = ECL.M;
    var data = toUtf8Bytes(text);

    // 1) plus petite version qui contient les données
    var ver;
    for (ver = 1; ; ver++) {
      if (ver > MAX_VERSION) throw new Error('QR : données trop longues');
      var cap = numDataCodewords(ver, ecl) * 8;
      if (4 + charCountBits(ver) + data.length * 8 <= cap) break;
    }

    // 2) train de bits : mode octet (0100) + compteur + octets
    var bb = [];
    function appendBits(val, len) { for (var i = len - 1; i >= 0; i--) bb.push((val >>> i) & 1); }
    appendBits(4, 4);
    appendBits(data.length, charCountBits(ver));
    data.forEach(function (b) { appendBits(b, 8); });

    // terminateur + bourrage jusqu'à la capacité en codewords
    var capBits = numDataCodewords(ver, ecl) * 8;
    appendBits(0, Math.min(4, capBits - bb.length));
    appendBits(0, (8 - bb.length % 8) % 8);
    for (var pad = 0xEC; bb.length < capBits; pad ^= 0xEC ^ 0x11) appendBits(pad, 8);

    // bits → octets
    var dataCw = [];
    for (var i = 0; i < bb.length; i += 8) {
      var b = 0; for (var j = 0; j < 8; j++) b = (b << 1) | bb[i + j];
      dataCw.push(b);
    }

    // 3) correction d'erreur + entrelacement des blocs
    var allCw = addEccInterleave(dataCw, ver, ecl);

    // 4) tracé de la matrice
    var size = ver * 4 + 17;
    var mods = [], isFn = [];
    for (var y = 0; y < size; y++) { mods.push(new Array(size).fill(false)); isFn.push(new Array(size).fill(false)); }

    function setFn(x, y, dark) { if (x >= 0 && x < size && y >= 0 && y < size) { mods[y][x] = dark; isFn[y][x] = true; } }

    // motifs fixes
    drawFunctionPatterns(size, ver, ecl, setFn, isFn, mods);
    // données (zigzag)
    drawCodewords(size, isFn, mods, allCw);
    // masque optimal
    var mask = chooseMask(size, ver, ecl, isFn, mods);
    applyMask(size, isFn, mods, mask);
    drawFormatBits(size, ecl, mask, setFn);

    return { size: size, modules: mods };
  }

  function addEccInterleave(data, ver, ecl) {
    var numBlocks = ECC_BLK[ecl][ver];
    var eccLen = ECC_CW[ecl][ver];
    var rawCw = Math.floor(rawDataModules(ver) / 8);
    var numShort = numBlocks - rawCw % numBlocks;
    var shortLen = Math.floor(rawCw / numBlocks);
    var blocks = [], rsDiv = rsDivisor(eccLen), k = 0;
    for (var i = 0; i < numBlocks; i++) {
      var datLen = shortLen - eccLen + (i < numShort ? 0 : 1);
      var dat = data.slice(k, k + datLen); k += datLen;
      var ecc = rsRemainder(dat, rsDiv);
      if (i < numShort) dat.push(0);         // cellule de bourrage (entrelacement)
      blocks.push(dat.concat(ecc));
    }
    var result = [];
    for (var col = 0; col < blocks[0].length; col++) {
      for (var b = 0; b < blocks.length; b++) {
        // on saute la cellule de bourrage des blocs courts (colonne de données)
        if (col !== shortLen - eccLen || b >= numShort) result.push(blocks[b][col]);
      }
    }
    return result;
  }

  function drawFunctionPatterns(size, ver, ecl, setFn, isFn, mods) {
    var i;
    // chronologie (timing)
    for (i = 0; i < size; i++) { setFn(6, i, i % 2 === 0); setFn(i, 6, i % 2 === 0); }
    // repères d'angle (finder + séparateurs)
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    // motifs d'alignement
    var pos = alignmentPositions(ver), n = pos.length;
    for (i = 0; i < n; i++) for (var j = 0; j < n; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
      align(pos[i], pos[j]);
    }
    // réservation des zones format + version (valeurs réelles posées plus tard)
    drawFormatBits(size, ecl, 0, setFn);
    drawVersion(size, ver, setFn);

    function finder(cx, cy) {
      for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
        var dist = Math.max(Math.abs(dx), Math.abs(dy));
        setFn(cx + dx, cy + dy, dist !== 2 && dist !== 4);
      }
    }
    function align(cx, cy) {
      for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++)
        setFn(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }

  function drawFormatBits(size, ecl, mask, setFn) {
    var fmtEcl = [1, 0, 3, 2][ecl];             // L,M,Q,H → bits de format
    var data = (fmtEcl << 3) | mask, rem = data;
    for (var i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    var bits = ((data << 10) | rem) ^ 0x5412;   // 15 bits (avec masque de la norme)
    // copie 1 (autour du repère haut-gauche)
    for (var j = 0; j <= 5; j++) setFn(8, j, getBit(bits, j));
    setFn(8, 7, getBit(bits, 6)); setFn(8, 8, getBit(bits, 7)); setFn(7, 8, getBit(bits, 8));
    for (j = 9; j < 15; j++) setFn(14 - j, 8, getBit(bits, j));
    // copie 2 (le long des repères haut-droite / bas-gauche)
    for (j = 0; j < 8; j++) setFn(size - 1 - j, 8, getBit(bits, j));
    for (j = 8; j < 15; j++) setFn(8, size - 15 + j, getBit(bits, j));
    setFn(8, size - 8, true);                   // module toujours noir
  }

  function drawVersion(size, ver, setFn) {
    if (ver < 7) return;
    var rem = ver;
    for (var i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
    var bits = (ver << 12) | rem;               // 18 bits
    for (i = 0; i < 18; i++) {
      var bit = getBit(bits, i), a = size - 11 + i % 3, b = Math.floor(i / 3);
      setFn(a, b, bit); setFn(b, a, bit);
    }
  }

  function drawCodewords(size, isFn, mods, data) {
    var i = 0; // index de bit
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;               // saute la colonne de chronologie
      for (var vert = 0; vert < size; vert++) {
        for (var jj = 0; jj < 2; jj++) {
          var x = right - jj, upward = ((right + 1) & 2) === 0;
          var y = upward ? size - 1 - vert : vert;
          if (!isFn[y][x] && i < data.length * 8) {
            mods[y][x] = getBit(data[i >>> 3], 7 - (i & 7)) !== 0;
            i++;
          }
        }
      }
    }
  }

  function applyMask(size, isFn, mods, mask) {
    for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) {
      if (isFn[y][x]) continue;
      var invert;
      switch (mask) {
        case 0: invert = (x + y) % 2 === 0; break;
        case 1: invert = y % 2 === 0; break;
        case 2: invert = x % 3 === 0; break;
        case 3: invert = (x + y) % 3 === 0; break;
        case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
        case 5: invert = (x * y) % 2 + (x * y) % 3 === 0; break;
        case 6: invert = ((x * y) % 2 + (x * y) % 3) % 2 === 0; break;
        default: invert = ((x + y) % 2 + (x * y) % 3) % 2 === 0; break;
      }
      if (invert) mods[y][x] = !mods[y][x];
    }
  }

  function chooseMask(size, ver, ecl, isFn, mods) {
    var best = 0, min = Infinity;
    for (var m = 0; m < 8; m++) {
      applyMask(size, isFn, mods, m);
      drawFormatBits(size, ecl, m, function (x, y, d) { mods[y][x] = d; });
      var p = penalty(size, mods);
      if (p < min) { min = p; best = m; }
      applyMask(size, isFn, mods, m); // annule (XOR)
    }
    return best;
  }

  // Score de pénalité (les 4 règles de la norme) — plus c'est bas, mieux c'est.
  function penalty(size, mods) {
    var score = 0, x, y;
    // Règle 1 : suites de 5+ modules identiques (lignes et colonnes)
    for (y = 0; y < size; y++) {
      var run = 1, prev = mods[y][0];
      for (x = 1; x < size; x++) {
        if (mods[y][x] === prev) { run++; if (run === 5) score += 3; else if (run > 5) score++; }
        else { run = 1; prev = mods[y][x]; }
      }
    }
    for (x = 0; x < size; x++) {
      var run2 = 1, prev2 = mods[0][x];
      for (y = 1; y < size; y++) {
        if (mods[y][x] === prev2) { run2++; if (run2 === 5) score += 3; else if (run2 > 5) score++; }
        else { run2 = 1; prev2 = mods[y][x]; }
      }
    }
    // Règle 2 : blocs 2×2 de même couleur
    for (y = 0; y < size - 1; y++) for (x = 0; x < size - 1; x++) {
      var c = mods[y][x];
      if (c === mods[y][x + 1] && c === mods[y + 1][x] && c === mods[y + 1][x + 1]) score += 3;
    }
    // Règle 3 : motif 1:1:3:1:1 (faux repère) dans lignes et colonnes
    for (y = 0; y < size; y++) for (x = 0; x < size - 6; x++) {
      if (matchFinder(mods[y], x)) score += 40;
    }
    for (x = 0; x < size; x++) {
      var col = []; for (y = 0; y < size; y++) col.push(mods[y][x]);
      for (y = 0; y < size - 6; y++) if (matchFinder(col, y)) score += 40;
    }
    // Règle 4 : équilibre noir/blanc
    var dark = 0;
    for (y = 0; y < size; y++) for (x = 0; x < size; x++) if (mods[y][x]) dark++;
    var total = size * size;
    var k = Math.floor((Math.abs(dark * 20 - total * 10) + total - 1) / total) - 1;
    score += k * 10;
    return score;
  }
  function matchFinder(line, i) {
    // 1:1:3:1:1 entouré de 4 modules clairs (motif 0000101110111 / séquences)
    var p = [line[i], line[i + 1], line[i + 2], line[i + 3], line[i + 4], line[i + 5], line[i + 6]];
    return p[0] && !p[1] && p[2] && p[3] && p[4] && !p[5] && p[6];
  }

  // ── Rendu SVG (fond clair forcé : un QR doit rester noir-sur-blanc pour être
  //    scannable — il ne s'inverse donc PAS en thème sombre) ─────────────────
  function svg(text, opts) {
    opts = opts || {};
    var ecl = (opts.ecl != null && ECL[opts.ecl] != null) ? ECL[opts.ecl] : ECL.M;
    var qr = encode(text, ecl);
    var size = qr.size, border = opts.border == null ? 4 : opts.border;
    var dim = size + border * 2;
    var d = [];
    for (var y = 0; y < size; y++) for (var x = 0; x < size; x++)
      if (qr.modules[y][x]) d.push('M' + (x + border) + ' ' + (y + border) + 'h1v1h-1z');
    var light = opts.light || '#ffffff', dark = opts.dark || '#1b1712';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + dim + ' ' + dim + '" ' +
      'shape-rendering="crispEdges" width="100%" height="100%" role="img" aria-label="QR code du salon">' +
      '<rect width="' + dim + '" height="' + dim + '" fill="' + light + '"/>' +
      '<path d="' + d.join('') + '" fill="' + dark + '"/></svg>';
  }

  window.QR = { encode: encode, svg: svg, ECL: ECL };
})();
