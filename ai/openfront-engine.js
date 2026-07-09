/*
  ai/openfront-engine.js — SIMULATION COMPLÈTE d'OpenFront, sans DOM (source unique).

  Ce module EST le jeu : carte (procédurale + cartes réalistes), économie (troupes/or,
  plafond de population), expansion/guerre par fronts, structures (ville, port, défense,
  silo, SAM), unités (bateaux, commerce, navires, missiles + interception SAM),
  diplomatie (alliances, coalition anti-leader, focus-fire, repli, trahison), traits de
  nation et IA à personnalités × difficulté. Déterministe (RNG seedé).

  Chargé À LA FOIS par la page (games/openfront.html : rendu + entrées + son) et par le
  banc d'essai (tools/bench-openfront.js). Une seule logique → le benchmark mesure la
  VRAIE IA et le jeu ne peut plus « dériver » du test. La page ne garde que l'affichage,
  les entrées, l'UI, le son et le brouillard (une vue, pas une règle).

  API : OpenFrontEngine.createGame(opts) → moteur (voir le `return` en bas).
        opts = { seed, w, h, mapType, meId, nations:[{name,flag,rgb,perso,diff,trait,human}] }
*/
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.OpenFrontEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var OCEAN = 0, LAND = 1, MOUNTAIN = 2;   // MOUNTAIN = infranchissable (chokepoints)
  var PERSOS = ['aggressive', 'defensive', 'expansionist', 'opportunist', 'balanced'];
  var TRAITS = ['none', 'expansion', 'economy', 'military', 'fortress', 'naval'];
  // Coûts (or) et paramètres des constructions — source unique partagée avec l'UI.
  var BUILD = {
    city:   { cost: 5000,  need: 'land' },
    port:   { cost: 4000,  need: 'coast' },
    defense:{ cost: 2000,  need: 'land' },
    silo:   { cost: 9000,  need: 'land' },
    sam:    { cost: 7000,  need: 'land' },
    warship:{ cost: 4500,  need: 'portUnit' },
    atom:   { cost: 12000, need: 'nuke', r: 6,  warheads: 1 },
    hydro:  { cost: 26000, need: 'nuke', r: 12, warheads: 1 },
    mirv:   { cost: 45000, need: 'nuke', r: 7,  warheads: 3 }
  };
  var WORLD_BLOBS = [
    [0.17,0.32,0.11,0.15],[0.22,0.50,0.03,0.06],[0.28,0.72,0.06,0.16],
    [0.49,0.30,0.05,0.06],[0.53,0.60,0.09,0.16],
    [0.72,0.31,0.15,0.13],[0.66,0.50,0.04,0.05],[0.80,0.55,0.05,0.04],
    [0.86,0.78,0.06,0.05]
  ];
  var EUROPE_BLOBS = [
    [0.20,0.70,0.05,0.05],[0.31,0.55,0.055,0.055],[0.24,0.33,0.035,0.055],
    [0.47,0.17,0.05,0.11],[0.49,0.47,0.08,0.07],[0.44,0.69,0.02,0.075],
    [0.56,0.62,0.05,0.06],[0.72,0.42,0.13,0.13],[0.73,0.73,0.06,0.04]
  ];

  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function valueNoise(seed) {
    var pr = mulberry32(seed), gw = 24, gh = 16, g = new Float32Array(gw * gh);
    for (var i = 0; i < g.length; i++) g[i] = pr();
    return function (x, y) {
      var fx = x * (gw - 1), fy = y * (gh - 1), x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0;
      var a = g[y0 * gw + x0], b = g[y0 * gw + x0 + 1], c = g[(y0 + 1) * gw + x0], d = g[(y0 + 1) * gw + x0 + 1];
      tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
      return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    };
  }
  function skillOf(diff) { return diff === 'insane' ? 1.3 : diff === 'hard' ? 1 : diff === 'easy' ? 0 : 0.6; }

  function createGame(opts) {
    opts = opts || {};
    var MW = opts.w || 200, MH = opts.h || 125, N = MW * MH;
    var seed = opts.seed != null ? opts.seed : (Math.random() * 1e9) | 0;
    var rng = mulberry32(seed);
    var mapType = opts.mapType != null ? opts.mapType : 1;
    var meId = opts.meId || 0;
    var nationData = opts.nations || [];
    var nations = nationData.length || opts.nations || 6;
    // Règles de partie (façon lobby) : départ + activation missiles / naval.
    var startTroops = opts.startTroops != null ? opts.startTroops : 6000;
    var startGold = opts.startGold != null ? opts.startGold : 1000;
    var nukesOn = opts.nukes !== false, navalOn = opts.naval !== false;

    var terr = new Uint8Array(N), elev = new Uint8Array(N), owner = new Int16Array(N), defMap = new Uint8Array(N);
    var players = [null], attacks = [], attackKey = {}, units = [], structAt = {};
    var touch = [], touchesNeutral = [], hasCoastCache = [], borderTiles = [], centroid = [], coastTiles = [];
    var LAND_TOTAL = 0, leaderId = 0, elapsed = 0, touchClock = 0, tradeClock = 0, invasionCd = 0;
    var events = [];
    function emit(type, o) { o = o || {}; o.type = type; events.push(o); }

    function nb4(i) { var x = i % MW, y = (i / MW) | 0, r = []; if (x > 0) r.push(i - 1); if (x < MW - 1) r.push(i + 1); if (y > 0) r.push(i - MW); if (y < MH - 1) r.push(i + MW); return r; }
    function terrainMult(i) { var e = elev[i]; return e > 200 ? 2.6 : e > 150 ? 1.7 : e > 90 ? 1.15 : 1; }
    function isCoast(i) { if (terr[i] !== LAND) return false; var nn = nb4(i); for (var k = 0; k < nn.length; k++) if (terr[nn[k]] === OCEAN) return true; return false; }

    // ── Carte ──────────────────────────────────────────────────────────────────
    function genMap() {
      var oct = [valueNoise(seed), valueNoise(seed * 7 + 3), valueNoise(seed * 13 + 9), valueNoise(seed * 29 + 1)];
      var amp = [1, 0.5, 0.26, 0.13], sc = [1, 2.1, 4.3, 8.7];
      function fbm(nx, ny) { var e = 0, tot = 0; for (var o = 0; o < 4; o++) { e += oct[o](nx * sc[o] % 1, ny * sc[o] % 1) * amp[o]; tot += amp[o]; } return e / tot; }
      var i;
      if (mapType >= 3) {
        var blobs = (mapType === 3) ? WORLD_BLOBS : EUROPE_BLOBS;
        for (var y = 0; y < MH; y++) for (var x = 0; x < MW; x++) {
          i = y * MW + x; var nx = x / MW, ny = y / MH, cov = 0;
          for (var bI = 0; bI < blobs.length; bI++) { var B = blobs[bI], ddx = (nx - B[0]) / B[2], ddy = (ny - B[1]) / B[3]; cov += Math.exp(-(ddx * ddx + ddy * ddy)); }
          cov += (fbm(nx, ny) - 0.5) * 0.55;
          var land = cov > 0.55 && nx > 0.015 && nx < 0.985 && ny > 0.02 && ny < 0.98;
          if (land) { terr[i] = LAND; elev[i] = clamp(Math.round(clamp((cov - 0.55) / 1.15, 0, 1) * 255), 0, 255); }
          else { terr[i] = OCEAN; elev[i] = clamp(Math.round(clamp(cov / 0.55, 0, 1) * 120), 0, 255); }
        }
      } else {
        var sea = mapType === 2 ? 0.30 : mapType === 0 ? 0.42 : 0.50;
        var edge = mapType === 2 ? 0.55 : mapType === 0 ? 0.9 : 1.15;
        for (var y2 = 0; y2 < MH; y2++) for (var x2 = 0; x2 < MW; x2++) {
          i = y2 * MW + x2; var e = fbm(x2 / MW, y2 / MH);
          var dx = (x2 / MW - 0.5) * 2, dy = (y2 / MH - 0.5) * 2, d = Math.sqrt(dx * dx + dy * dy);
          e -= Math.max(0, (d - 0.35)) * edge;
          if (mapType === 1) e -= Math.abs(oct[1]((x2 / MW) * 3 % 1, (y2 / MH) * 3 % 1) - 0.5) * 0.35;
          if (e > sea) { terr[i] = LAND; elev[i] = clamp(Math.round((e - sea) / (1 - sea) * 255), 0, 255); }
          else { terr[i] = OCEAN; elev[i] = clamp(Math.round(e / sea * 255), 0, 255); }
        }
      }
      for (var p = 0; p < 2; p++) { var snap = terr.slice();
        for (i = 0; i < N; i++) { var nn = nb4(i), ld = 0; for (var k = 0; k < nn.length; k++) if (snap[nn[k]] === LAND) ld++;
          if (snap[i] === OCEAN && ld >= nn.length) terr[i] = LAND; if (snap[i] === LAND && ld === 0) terr[i] = OCEAN; } }
      // montagnes infranchissables (chokepoints) sur les cartes non-réalistes
      if (mapType < 3) for (i = 0; i < N; i++) if (terr[i] === LAND && elev[i] > 240) terr[i] = MOUNTAIN;
      LAND_TOTAL = 0; coastTiles = [];
      for (i = 0; i < N; i++) if (terr[i] === LAND) LAND_TOTAL++;
      for (i = 0; i < N; i++) if (isCoast(i)) coastTiles.push(i);
    }
    function spawnBlob(id, center, radius) {
      var cx = center % MW, cy = (center / MW) | 0, q = [center], seen = {}; seen[center] = 1;
      var got = 0, cap = radius * radius * 3;
      while (q.length && got < cap) { var i = q.shift(), x = i % MW, y = (i / MW) | 0;
        if (terr[i] !== LAND || owner[i] !== 0) continue; if (Math.hypot(x - cx, y - cy) > radius) continue;
        owner[i] = id; got++;
        var nn = nb4(i); for (var k = 0; k < nn.length; k++) if (!seen[nn[k]]) { seen[nn[k]] = 1; q.push(nn[k]); } }
      return got;
    }
    function pickSpawns(count) {
      var land = []; for (var i = 0; i < N; i++) if (terr[i] === LAND) land.push(i);
      if (!land.length) return [];
      var pts = [land[(rng() * land.length) | 0]];
      while (pts.length < count) { var best = -1, bestD = -1;
        for (var t = 0; t < 400; t++) { var c = land[(rng() * land.length) | 0], x = c % MW, y = (c / MW) | 0, md = 1e9;
          for (var p = 0; p < pts.length; p++) { var px = pts[p] % MW, py = (pts[p] / MW) | 0, dd = Math.hypot(x - px, y - py); if (dd < md) md = dd; }
          if (md > bestD) { bestD = md; best = c; } }
        pts.push(best); }
      return pts;
    }

    function makePlayer(id, data) {
      var wild = !!data.wild;
      return { id: id, name: data.name || ('IA ' + id), flag: data.flag || '⚑', rgb: data.rgb || [200, 200, 200],
        human: !!data.human, wild: wild, perso: data.perso || null, diff: data.diff || 'normal', trait: data.trait || 'none',
        alive: true, gold: wild ? 0 : startGold, troops: wild ? (400 + rng() * 500) : startTroops,
        tiles: 0, cities: 0, ports: 0, silos: 0, sams: 0, defenses: 0,
        allies: {}, war: {}, traitor: false, seed: 0, capital: 0, ratio: wild ? 0.85 : 0.55, focus: 0, prevTiles: 0, aiCd: rng() * 1.5 };
    }

    // ── Économie (traits appliqués) — débits exposés au HUD ───────────────────
    var GOLD_MUL = 1.8;                                    // éco accélérée : villes/nukes atteignables
    function armyCap(p) { return 5000 + p.tiles * 120 + p.cities * 25000; }
    function troopRate(p) { var cap = armyCap(p);
      if (p.troops >= cap) return -p.troops * 0.02;   // surplus (départ Éclair, dons, capitale) : se résorbe doucement
      return ((cap - p.troops) * 0.16 * (0.35 + p.ratio) + p.tiles * 2.2) * (p.trait === 'military' ? 1.2 : 1); }
    function goldRate(p) { return (p.tiles * 0.34 + p.ports * 11 + p.cities * 5 + 8) * (1.35 - p.ratio * 0.85) * (p.trait === 'economy' ? 1.3 : 1) * GOLD_MUL; }
    function economy(p, dt) { if (!p.alive) return; var cap = armyCap(p), r = troopRate(p);
      p.troops = r >= 0 ? Math.min(cap, p.troops + r * dt) : Math.max(0, p.troops + r * dt);
      p.gold += goldRate(p) * dt; }

    // ── Expansion / guerre ───────────────────────────────────────────────────
    function capturable(i, atkId, tgt) {
      if (terr[i] !== LAND) return false; if (owner[i] !== tgt) return false; if (owner[i] === atkId) return false;
      if (tgt > 0 && players[atkId].allies[tgt]) return false; return true;
    }
    function tileCost(i, atkId, tgt) {
      var tm = terrainMult(i), base;
      if (tgt === 0) base = 6 * (players[atkId].trait === 'expansion' ? 0.8 : 1);
      else { var d = players[tgt], dens = d.troops / Math.max(1, d.tiles); base = 4 + Math.sqrt(dens) * 3; if (d.trait === 'fortress') base *= 1.35; }
      if (defMap[i] > 0 && tgt > 0) base *= 1.9;
      return base * tm;
    }
    function launchAttack(atkId, tgtId, troops, aim) {
      var atk = players[atkId]; if (!atk || !atk.alive || troops < 50) return;
      if (tgtId > 0 && (atk.allies[tgtId] || atk.id === tgtId)) return;
      troops = Math.min(troops, atk.troops); atk.troops -= troops;
      var key = atkId + '>' + tgtId, a = attackKey[key];
      if (a) { a.troops += troops; a.aim = aim || null; if (a.dead) a.dead = false; seedFrontier(a); }
      else { a = { atk: atkId, tgt: tgtId, troops: troops, front: [], head: 0, seen: new Set(), carry: 0, dead: false, aim: aim || null };
        attackKey[key] = a; attacks.push(a); seedFrontier(a); }
    }
    function seedFrontier(a) {
      var atkId = a.atk, tgt = a.tgt, bl = borderTiles[atkId], cands = [];
      if (bl && bl.length) { for (var b = 0; b < bl.length; b++) { var i = bl[b]; if (owner[i] !== atkId) continue;
        var nn = nb4(i); for (var k = 0; k < nn.length; k++) if (capturable(nn[k], atkId, tgt)) { cands.push(i); break; } } }
      else { for (var j = 0; j < N; j++) { if (owner[j] !== atkId) continue; var mm = nb4(j);
        for (var m = 0; m < mm.length; m++) if (capturable(mm[m], atkId, tgt)) { cands.push(j); break; } } }
      if (a.aim && cands.length) {
        var ax = a.aim.x, ay = a.aim.y, rad = clamp(10 + Math.sqrt(a.troops) / 6, 10, 42);
        cands.sort(function (p, q) { return ((p % MW - ax) * (p % MW - ax) + ((p / MW | 0) - ay) * ((p / MW | 0) - ay)) - ((q % MW - ax) * (q % MW - ax) + ((q / MW | 0) - ay) * ((q / MW | 0) - ay)); });
        var near = []; for (var c = 0; c < cands.length; c++) { var i2 = cands[c], dd = (i2 % MW - ax) * (i2 % MW - ax) + ((i2 / MW | 0) - ay) * ((i2 / MW | 0) - ay);
          if (dd <= rad * rad || near.length < 6) near.push(i2); else break; } cands = near;
      }
      for (var f = 0; f < cands.length; f++) { var t = cands[f]; if (!a.seen.has(t)) { a.seen.add(t); a.front.push(t); } }
    }
    function processAttack(a, dt) {
      if (a.dead) return; var atk = players[a.atk]; if (!atk || !atk.alive) { a.dead = true; return; }
      var speed = clamp(9 + a.troops / 240, 9, 140), budget = speed * dt + a.carry, steps = Math.floor(budget); a.carry = budget - steps;
      var did = 0;
      while (steps-- > 0) {
        while (a.head < a.front.length && owner[a.front[a.head]] !== a.atk) a.head++;
        if (a.head >= a.front.length) { a.dead = true; break; }
        var t = a.front[a.head], nn = nb4(t), best = -1, bc = 1e9;
        for (var k = 0; k < nn.length; k++) { var n = nn[k]; if (capturable(n, a.atk, a.tgt)) { var c = tileCost(n, a.atk, a.tgt); if (c < bc) { bc = c; best = n; } } }
        if (best < 0) { a.head++; continue; }
        if (a.troops < bc) { a.dead = true; atk.troops += a.troops * 0.5; a.troops = 0; break; }
        var prev = owner[best];
        if (prev > 0) {
          atk.gold += players[prev].wild ? 9 : 4;                               // butin : les territoires sauvages rapportent plus
          if (structAt[best]) { atk.gold += structAt[best].k === 'city' ? 3000 : 800; removeStruct(best); } // pillage
          if (best === players[prev].capital) captureCapital(prev, a.atk);       // décapitation
          var dp = players[prev]; dp.tiles--; dp.troops = Math.max(0, dp.troops - bc * 0.8); if (dp.tiles <= 0) eliminate(prev, a.atk);
        }
        owner[best] = a.atk; atk.tiles++; a.troops -= bc;
        if (!a.seen.has(best)) { a.seen.add(best); a.front.push(best); }
        did++;
        if (a.head > 20000) { a.front = a.front.slice(a.head); a.head = 0; }
      }
      if (a.troops <= 1 && !did) a.dead = true;
    }
    function eliminate(id, by) {
      var p = players[id]; if (!p.alive) return; p.alive = false; p.capital = 0;
      for (var idx in structAt) if (structAt[idx].owner === id) removeStruct(+idx);
      for (var i = 0; i < N; i++) if (owner[i] === id) owner[i] = 0; p.tiles = 0;
      if (p.wild && by && players[by]) players[by].gold += 250;   // prime en conquérant un territoire sauvage
      emit('eliminated', { id: id, by: by, wild: p.wild });
    }
    // Bonus de défense permanent autour d'une capitale (rayon 3).
    function capBonus(i, d) { var x = i % MW, y = (i / MW) | 0, R = 3;
      for (var dy = -R; dy <= R; dy++) for (var dx = -R; dx <= R; dx++) { if (dx * dx + dy * dy > R * R) continue;
        var xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= MW || yy >= MH) continue; var j = yy * MW + xx; defMap[j] = clamp(defMap[j] + d, 0, 255); } }
    // Prise d'une capitale : gros butin, -30 % de troupes à la victime, capitale relocalisée.
    function captureCapital(victimId, byId) {
      var v = players[victimId]; v.troops = Math.max(0, v.troops * 0.7); players[byId].gold += 5000;
      capBonus(v.capital, -2);
      var nc = 0; for (var i = 0; i < N; i++) if (owner[i] === victimId && i !== v.capital) { nc = i; break; }
      v.capital = nc; if (nc) capBonus(nc, 2);
      emit('capital', { victim: victimId, by: byId });
    }

    // ── Structures ─────────────────────────────────────────────────────────────
    function stampDef(i, delta) { var x = i % MW, y = (i / MW) | 0, R = 4;
      for (var dy = -R; dy <= R; dy++) for (var dx = -R; dx <= R; dx++) { if (dx * dx + dy * dy > R * R) continue;
        var xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= MW || yy >= MH) continue; var j = yy * MW + xx; defMap[j] = clamp(defMap[j] + delta, 0, 255); } }
    function buildCost(k, ownerId) { var c = BUILD[k].cost; if (k === 'port' && players[ownerId] && players[ownerId].trait === 'naval') c *= 0.6; return Math.round(c); }
    function placeStruct(i, k, ownerId) { var pl = players[ownerId]; structAt[i] = { k: k, owner: ownerId };
      if (k === 'city') pl.cities++; else if (k === 'port') pl.ports++; else if (k === 'silo') pl.silos++; else if (k === 'sam') pl.sams++; else if (k === 'defense') { pl.defenses++; stampDef(i, 1); } }
    function removeStruct(i) { var s = structAt[i]; if (!s) return; var pl = players[s.owner];
      if (pl) { if (s.k === 'city') pl.cities--; else if (s.k === 'port') pl.ports--; else if (s.k === 'silo') pl.silos--; else if (s.k === 'sam') pl.sams--; else if (s.k === 'defense') { pl.defenses--; stampDef(i, -1); } }
      delete structAt[i]; }
    // Construction validée + facturée (renvoie true, ou une chaîne d'erreur).
    function build(i, k, ownerId) {
      var pl = players[ownerId], b = BUILD[k]; if (!b || !pl) return 'invalide';
      if (!navalOn && k === 'port') return 'désactivé';
      if (!nukesOn && (k === 'silo' || k === 'sam')) return 'désactivé';
      if (owner[i] !== ownerId) return 'territoire';
      if (structAt[i]) return 'occupé';
      if (b.need === 'coast' && !isCoast(i)) return 'côte';
      var cost = buildCost(k, ownerId); if (pl.gold < cost) return 'or';
      pl.gold -= cost; placeStruct(i, k, ownerId); return true;
    }
    function nearestStruct(ownerId, k, tx, ty) { var best = -1, bd = 1e9;
      for (var idx in structAt) { var s = structAt[idx]; if (s.owner !== ownerId || s.k !== k) continue; var i = +idx, x = i % MW, y = (i / MW) | 0, d = (x - tx) * (x - tx) + (y - ty) * (y - ty); if (d < bd) { bd = d; best = i; } }
      return best; }

    // ── Unités (bateaux / commerce / navires / missiles) ──────────────────────
    function launchBoat(ownerId, fromTile, toTile, troops) {
      if (!navalOn) return;
      var mul = players[ownerId].trait === 'naval' ? 1.25 : 1;
      units.push({ type: 'boat', owner: ownerId, x: fromTile % MW + 0.5, y: (fromTile / MW | 0) + 0.5, tx: toTile % MW + 0.5, ty: (toTile / MW | 0) + 0.5, tgtTile: toTile, troops: troops * mul, spd: 11 });
    }
    function launchTrade(fromTile, toTile, ownerId, destOwner) {
      if (!navalOn) return;
      units.push({ type: 'trade', owner: ownerId, dest: destOwner, x: fromTile % MW + 0.5, y: (fromTile / MW | 0) + 0.5, tx: toTile % MW + 0.5, ty: (toTile / MW | 0) + 0.5, tgtTile: toTile, gold: 900 + rng() * 700, spd: 8 });
    }
    function launchWarship(ownerId, atTile) {
      if (!navalOn) return;
      units.push({ type: 'warship', owner: ownerId, x: atTile % MW + 0.5, y: (atTile / MW | 0) + 0.5, tx: atTile % MW + 0.5, ty: (atTile / MW | 0) + 0.5, home: atTile, spd: 9, cd: 0 });
    }
    function launchMissile(ownerId, fromTile, toTile, kind) {
      if (!nukesOn) return;
      var b = BUILD[kind];
      units.push({ type: 'missile', owner: ownerId, x: fromTile % MW + 0.5, y: (fromTile / MW | 0) + 0.5, tx: toTile % MW + 0.5, ty: (toTile / MW | 0) + 0.5, tgtTile: toTile, r: b.r, warheads: b.warheads || 1, spd: 26, kind: kind });
    }
    function detonate(i0, radius, byId) {
      var x0 = i0 % MW, y0 = (i0 / MW) | 0;
      for (var dy = -radius; dy <= radius; dy++) for (var dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > radius * radius) continue; var xx = x0 + dx, yy = y0 + dy; if (xx < 0 || yy < 0 || xx >= MW || yy >= MH) continue;
        var i = yy * MW + xx; if (structAt[i]) removeStruct(i);
        if (owner[i] > 0) { var p = players[owner[i]]; p.tiles--; p.troops = Math.max(0, p.troops - 40); owner[i] = 0; if (p.tiles <= 0) eliminate(p.id, byId); }
      }
      units.push({ type: 'blast', x: x0 + 0.5, y: y0 + 0.5, r: radius, t: 0, life: 0.7 });
      emit('detonate', { by: byId });
    }
    function updateUnits(dt) {
      for (var u = units.length - 1; u >= 0; u--) {
        var it = units[u];
        if (it.type === 'blast') { it.t += dt; if (it.t >= it.life) units.splice(u, 1); continue; }
        var dx = it.tx - it.x, dy = it.ty - it.y, d = Math.hypot(dx, dy);
        if (it.type === 'missile') {
          var hit = false;
          for (var idx in structAt) { var s = structAt[idx]; if (s.k !== 'sam') continue; if (s.owner === it.owner || players[s.owner].allies[it.owner]) continue;
            var si = +idx, sx = si % MW, sy = (si / MW) | 0; if (Math.hypot(sx - it.x, sy - it.y) < 9 && rng() < 0.65 * dt * 8) { units.push({ type: 'blast', x: it.x, y: it.y, r: 2, t: 0, life: 0.5 }); units.splice(u, 1); hit = true; break; } }
          if (hit) continue;
        }
        if (d < 0.6) { arrive(it); units.splice(u, 1); continue; }
        var mv = it.spd * dt; it.x += dx / d * Math.min(mv, d); it.y += dy / d * Math.min(mv, d);
        if (it.type === 'warship') {
          it.cd = (it.cd || 0) - dt;
          for (var v = units.length - 1; v >= 0; v--) { var e = units[v]; if (v === u) continue;
            if ((e.type === 'boat' || e.type === 'trade') && e.owner !== it.owner && !players[it.owner].allies[e.owner]) {
              if (Math.hypot(e.x - it.x, e.y - it.y) < 6) { it.tx = e.x; it.ty = e.y;
                if (it.cd <= 0 && Math.hypot(e.x - it.x, e.y - it.y) < 2.5) { units.push({ type: 'blast', x: e.x, y: e.y, r: 1.5, t: 0, life: 0.4 }); units.splice(v, 1); it.cd = 1.2; if (v < u) u--; } break; } } }
          if (it.tx === it.x && it.ty === it.y) { it.tx = it.home % MW + 0.5; it.ty = (it.home / MW | 0) + 0.5; }
        }
      }
    }
    function arrive(it) {
      if (it.type === 'boat') {
        var i = it.tgtTile; if (terr[i] !== LAND) return;
        var prev = owner[i]; if (prev === it.owner || players[it.owner].allies[prev]) return;
        if (prev > 0) { players[prev].tiles--; if (players[prev].tiles <= 0) eliminate(prev, it.owner); }
        owner[i] = it.owner; players[it.owner].tiles++;
        var a = { atk: it.owner, tgt: prev, troops: it.troops, front: [i], head: 0, seen: new Set(), carry: 0, dead: false, aim: null }; a.seen.add(i); attacks.push(a);
      } else if (it.type === 'trade') {
        var o = players[it.owner], de = players[it.dest], mul = 1;
        if (o && o.alive) { o.gold += it.gold * 0.6 * (o.trait === 'naval' ? 1.6 : 1); }
        if (de && de.alive) { de.gold += it.gold * 0.4 * (de.trait === 'naval' ? 1.6 : 1); }
      } else if (it.type === 'missile') {
        if (it.warheads > 1) { for (var w = 0; w < it.warheads; w++) { var jx = clamp(it.tgtTile % MW + ((rng() - 0.5) * 14 | 0), 0, MW - 1), jy = clamp((it.tgtTile / MW | 0) + ((rng() - 0.5) * 14 | 0), 0, MH - 1); detonate(jy * MW + jx, it.r, it.owner); } }
        else detonate(it.tgtTile, it.r, it.owner);
      }
    }
    function nearestCoast(ownerId, tx, ty) { var best = -1, bd = 1e9;
      for (var c = 0; c < coastTiles.length; c++) { var i = coastTiles[c]; if (owner[i] !== ownerId) continue; var x = i % MW, y = (i / MW) | 0, d = (x - tx) * (x - tx) + (y - ty) * (y - ty); if (d < bd) { bd = d; best = i; } }
      return best; }
    function coastNear(tile) { if (terr[tile] === LAND) return tile; var best = -1, bd = 1e9, x0 = tile % MW, y0 = (tile / MW) | 0;
      for (var c = 0; c < coastTiles.length; c++) { var i = coastTiles[c]; var x = i % MW, y = (i / MW) | 0, d = (x - x0) * (x - x0) + (y - y0) * (y - y0); if (d < bd) { bd = d; best = i; } }
      return best; }
    function findOverseasTarget(id, fromTile) { var best = -1, bd = 1e9, fx = fromTile % MW, fy = (fromTile / MW) | 0;
      for (var c = 0; c < coastTiles.length; c++) { var i = coastTiles[c]; var o = owner[i]; if (o === id || (o > 0 && players[id].allies[o])) continue; var x = i % MW, y = (i / MW) | 0, d = (x - fx) * (x - fx) + (y - fy) * (y - fy); if (d > 16 && d < bd) { bd = d; best = i; } }
      return best; }

    // ── Adjacence + caches ─────────────────────────────────────────────────────
    function computeTouch() {
      var P = players.length; touch = []; touchesNeutral = []; hasCoastCache = []; borderTiles = []; centroid = [];
      var sx = new Float64Array(P), sy = new Float64Array(P), cnt = new Float64Array(P);
      for (var a = 0; a < P; a++) { touch.push(new Uint8Array(P)); touchesNeutral.push(false); hasCoastCache.push(false); borderTiles.push([]); centroid.push(null); }
      for (var i = 0; i < N; i++) { var o = owner[i]; if (o <= 0) continue; var x = i % MW, y = (i / MW) | 0, isB = false, coast = false;
        sx[o] += x; sy[o] += y; cnt[o]++;
        var ns = [x > 0 ? i - 1 : -1, x < MW - 1 ? i + 1 : -1, y > 0 ? i - MW : -1, y < MH - 1 ? i + MW : -1];
        for (var k = 0; k < 4; k++) { var n = ns[k]; if (n < 0) continue; if (terr[n] === OCEAN) { coast = true; continue; } var no = owner[n];
          if (no !== o) { isB = true; if (no > 0) touch[o][no] = 1; else touchesNeutral[o] = true; } }
        if (isB) borderTiles[o].push(i); if (coast) hasCoastCache[o] = true; }
      for (a = 1; a < P; a++) if (cnt[a] > 0) centroid[a] = { x: sx[a] / cnt[a], y: sy[a] / cnt[a] };
      leaderId = 0; var lt = -1; for (var q = 1; q < players.length; q++) if (players[q].alive && players[q].tiles > lt) { lt = players[q].tiles; leaderId = q; }
    }
    function neutralAdjacent(id) { return !!touchesNeutral[id]; }
    function hasCoast(id) { return !!hasCoastCache[id]; }
    function hasFrontier(id, tgt) { var bl = borderTiles[id]; if (!bl) return false;
      for (var b = 0; b < bl.length; b++) { var i = bl[b]; if (owner[i] !== id) continue; var nn = nb4(i); for (var k = 0; k < nn.length; k++) if (capturable(nn[k], id, tgt)) return true; } return false; }

    // ── Diplomatie ─────────────────────────────────────────────────────────────
    function requestAlliance(fromId, toId) {
      var from = players[fromId], to = players[toId]; if (!from.alive || !to.alive || from.allies[toId]) return;
      if (to.wild || from.wild) return;   // les territoires sauvages ne font pas d'alliance
      if (toId === meId) { emit('allyRequest', { from: fromId }); return; }
      if (aiAccepts(to, from)) makeAlliance(fromId, toId);
    }
    function aiAccepts(ai, other) {
      if (ai.perso === 'aggressive') return rng() < 0.2; if (ai.war[other.id]) return rng() < 0.3;
      if (other.traitor) return rng() < 0.25; return rng() < (ai.perso === 'defensive' ? 0.85 : 0.6);
    }
    function makeAlliance(a, b) { players[a].allies[b] = 1; players[b].allies[a] = 1; delete players[a].war[b]; delete players[b].war[a]; killFront(a, b); killFront(b, a); emit('ally', { a: a, b: b }); }
    function breakAlliance(a, b, treason) { if (!players[a].allies[b]) return; delete players[a].allies[b]; delete players[b].allies[a]; if (treason) players[a].traitor = true; emit('break', { a: a, b: b, treason: !!treason }); }
    function killFront(a, b) { var at = attackKey[a + '>' + b]; if (at) at.dead = true; }
    // Dons entre alliés (le joueur peut soutenir un allié).
    function giftGold(fromId, toId, amt) { var f = players[fromId], t = players[toId]; if (!f || !t || !f.allies[toId]) return false; amt = Math.min(amt, f.gold); if (amt <= 0) return false; f.gold -= amt; t.gold += amt; return true; }
    function giftTroops(fromId, toId, amt) { var f = players[fromId], t = players[toId]; if (!f || !t || !f.allies[toId]) return false; amt = Math.min(amt, f.troops * 0.9); if (amt <= 0) return false; f.troops -= amt; t.troops += amt; return true; }
    // Fin de partie : part du territoire CONQUIS tenue par soi + alliés ; « dernier bloc ».
    function ownedTotal() { var s = 0; for (var i = 1; i < players.length; i++) if (players[i].alive) s += players[i].tiles; return s; }
    function dominationPct(id) { var me = players[id]; if (!me) return 0; var mine = me.tiles; for (var al in me.allies) { var a = players[al]; if (a && a.alive) mine += a.tiles; } var tot = ownedTotal(); return tot > 0 ? mine / tot : 0; }
    function onlyBlocLeft(id) { var me = players[id]; for (var i = 1; i < players.length; i++) { var p = players[i]; if (!p.alive || i === id || p.wild) continue; if (!me.allies[i]) return false; } return true; }

    // ── IA ─────────────────────────────────────────────────────────────────────
    function placeAIStruct(p, k) {
      var cost = buildCost(k, p.id); if (p.gold < cost) return;
      var c = centroid[p.id]; if (!c) return; var cx = c.x | 0, cy = c.y | 0;   // recherche BORNÉE autour du centre (perf : pas de scan O(N))
      for (var r = 1; r < 45; r++) for (var a = 0; a < 10; a++) {
        var ang = a / 10 * 6.2832 + r * 0.7, x = (cx + Math.cos(ang) * r) | 0, y = (cy + Math.sin(ang) * r) | 0;
        if (x < 0 || y < 0 || x >= MW || y >= MH) continue; var i = y * MW + x;
        if (owner[i] === p.id && !structAt[i] && (k !== 'port' || isCoast(i))) { p.gold -= cost; placeStruct(i, k, p.id); return; }
      }
    }
    function enemyRichTile(id) { for (var idx in structAt) if (structAt[idx].owner === id) return +idx; for (var i = 0; i < N; i++) if (owner[i] === id) return i; return -1; }
    function aiSpend(p, neigh, underAtk, skill) {
      var coast = hasCoast(p.id);
      if (underAtk && p.gold >= 2000 && rng() < 0.7) placeAIStruct(p, 'defense');
      else if (p.gold >= 5000 && p.tiles > 35 && rng() < 0.3 + 0.5 * skill) placeAIStruct(p, 'city');
      if (navalOn && coast && p.ports === 0 && p.gold >= buildCost('port', p.id)) placeAIStruct(p, 'port');
      if (nukesOn && p.tiles > 90 && p.silos === 0 && p.gold >= 9000 && rng() < 0.4 + 0.4 * skill) placeAIStruct(p, 'silo');
      if (nukesOn && p.sams === 0 && p.tiles > 110 && p.gold >= 7000 && rng() < 0.4) placeAIStruct(p, 'sam');
      if (nukesOn && p.silos > 0 && p.gold >= 12000 && rng() < 0.4 * (0.5 + skill)) {
        var enemy = null; for (var n = 0; n < neigh.length; n++) { var e = neigh[n]; if (!p.allies[e.id] && (p.war[e.id] || e.tiles > p.tiles)) { enemy = e; break; } }
        if (enemy) { var tt = enemyRichTile(enemy.id); if (tt >= 0) { var silo = nearestStruct(p.id, 'silo', tt % MW, tt / MW | 0);
          if (silo >= 0) { var kind = p.gold >= 26000 ? 'hydro' : 'atom'; p.gold -= BUILD[kind].cost; launchMissile(p.id, silo, tt, kind); emit('nuke', { by: p.id, kind: kind }); } } }
      }
    }
    function aiThink(p, dt) {
      p.aiCd -= dt; if (p.aiCd > 0) return; p.aiCd = 1.1 + rng() * 1.4; if (!p.alive) return;
      var skill = skillOf(p.diff);
      var underAtk = false; for (var ua = 0; ua < attacks.length; ua++) if (!attacks[ua].dead && attacks[ua].tgt === p.id) { underAtk = true; break; }
      var losing = p.prevTiles > 0 && p.tiles < p.prevTiles * 0.9; p.prevTiles = p.tiles;
      p.ratio = underAtk ? 0.82 : (p.perso === 'defensive' ? 0.5 : p.perso === 'aggressive' ? 0.72 : 0.6);
      if (rng() > 0.45 + 0.55 * skill) return;   // les IA faibles agissent moins souvent
      var pAgg = { aggressive: 1.4, defensive: 0.5, expansionist: 0.7, opportunist: 1.0, balanced: 0.9 }[p.perso];  // agressivité = PERSONNALITÉ
      var neigh = []; for (var q = 1; q < players.length; q++) { if (q === p.id || !players[q].alive) continue; if (touch[p.id] && touch[p.id][q]) neigh.push(players[q]); }

      aiSpend(p, neigh, underAtk, skill);

      var strongest = null; for (var s = 0; s < neigh.length; s++) if (!strongest || neigh[s].tiles > strongest.tiles) strongest = neigh[s];
      if (strongest && strongest.tiles > p.tiles * 1.4 && p.perso !== 'aggressive' && rng() < 0.55) {
        var partner = null; for (var s2 = 0; s2 < neigh.length; s2++) { var e2 = neigh[s2]; if (e2.id === leaderId) continue; if (!p.allies[e2.id] && !p.war[e2.id] && (!partner || e2.tiles > partner.tiles)) partner = e2; }
        if (!partner) partner = strongest; if (partner && !p.allies[partner.id] && !p.war[partner.id]) requestAlliance(p.id, partner.id);
      }
      if (p.perso === 'opportunist') for (var al in p.allies) { var A = players[al]; if (A && A.alive && A.tiles < p.tiles * 0.5 && rng() < 0.25) breakAlliance(p.id, +al, true); }

      var aggressor = 0; for (var ax = 0; ax < attacks.length; ax++) { var AA = attacks[ax]; if (!AA.dead && AA.tgt === p.id) { aggressor = AA.atk; break; } }
      if (underAtk && losing) {
        // capitulation : une petite nation écrasée se rend (accélère la fin de partie)
        if (p.tiles <= 4 && aggressor && p.troops < players[aggressor].troops * 0.3) { emit('capitulate', { id: p.id, by: aggressor }); eliminate(p.id, aggressor); return; }
        if (aggressor && p.perso !== 'aggressive' && !p.allies[aggressor] && rng() < 0.6) requestAlliance(p.id, aggressor); return;
      }

      var neutral = neutralAdjacent(p.id);
      var reserve = armyCap(p) * (0.32 - 0.18 * skill), send = p.troops * (0.28 + 0.32 * rng()) * (0.7 + 0.5 * skill);
      if (p.perso === 'expansionist') send *= 1.15;
      var forceWar = p.perso === 'aggressive' && rng() < 0.35, didAttack = false;   // l'envie de guerre = personnalité, PAS difficulté
      if (neutral && p.troops > reserve && !forceWar) { launchAttack(p.id, 0, send); didAttack = true; }
      if (!didAttack && neigh.length) {
        var target = null, tb = 1e9;
        for (var n = 0; n < neigh.length; n++) { var e = neigh[n]; if (p.allies[e.id]) continue; var dens = e.troops / Math.max(1, e.tiles) + e.tiles * 0.4; if (dens < tb) { tb = dens; target = e; } }
        if (leaderId && leaderId !== p.id && touch[p.id] && touch[p.id][leaderId] && !p.allies[leaderId] && players[leaderId].tiles > p.tiles * 1.25 && rng() < 0.6) target = players[leaderId];
        if (p.focus && players[p.focus] && players[p.focus].alive && touch[p.id] && touch[p.id][p.focus] && !p.allies[p.focus] && rng() < 0.7) target = players[p.focus];
        if (target) p.focus = target.id;
        var warNeed = 1.18 - Math.max(0, pAgg - 0.9) * 0.22;   // avantage requis pour attaquer (indépendant de la difficulté)
        if (target && p.troops > target.troops * warNeed && p.troops > reserve) {
          p.war[target.id] = 1; target.war[p.id] = 1; if (p.allies[target.id]) breakAlliance(p.id, target.id, true);
          launchAttack(p.id, target.id, p.troops * (0.4 + 0.3 * rng()), centroid[target.id] ? { x: centroid[target.id].x, y: centroid[target.id].y } : null);
          if (target.id === meId && invasionCd <= 0) { invasionCd = 6; emit('invasion', { by: p.id }); }
        } else if (neutral && p.troops > reserve) launchAttack(p.id, 0, send);
      }
      // colonisation / débarquement outre-mer
      if (navalOn && p.ports > 0 && rng() < 0.35 && !neutral) { var from = nearestCoast(p.id, p.seed % MW, (p.seed / MW | 0));
        if (from >= 0) { var tgt = findOverseasTarget(p.id, from); if (tgt >= 0) launchBoat(p.id, from, tgt, p.troops * 0.3); } }
    }
    function autoTrade() {
      if (!navalOn) return;
      var ports = []; for (var idx in structAt) if (structAt[idx].k === 'port') ports.push({ i: +idx, o: structAt[idx].owner });
      if (ports.length < 2) return;
      for (var t = 0; t < ports.length; t++) { if (rng() > 0.4) continue; var src = ports[t];
        var opts2 = ports.filter(function (x) { return x.o !== src.o; }); if (!opts2.length) continue;
        var dst = opts2[(rng() * opts2.length) | 0]; if (players[src.o].war[dst.o]) continue; launchTrade(src.i, dst.i, src.o, dst.o); }
    }

    // ── Boucle ────────────────────────────────────────────────────────────────
    function step(dt) {
      elapsed += dt; if (invasionCd > 0) invasionCd -= dt;
      for (var p = 1; p < players.length; p++) economy(players[p], dt);
      for (var a = 0; a < attacks.length; a++) processAttack(attacks[a], dt);
      if (attacks.length) { var live = []; for (var i = 0; i < attacks.length; i++) { var A = attacks[i]; if (A.dead) delete attackKey[A.atk + '>' + A.tgt]; else live.push(A); } attacks = live; }
      updateUnits(dt);
      touchClock -= dt; if (touchClock <= 0) { touchClock = 1.0; computeTouch(); }
      tradeClock -= dt; if (tradeClock <= 0) { tradeClock = 2.5; autoTrade(); }
      for (p = 1; p < players.length; p++) { var pl = players[p]; if (pl.alive && !pl.human && !pl.wild) aiThink(pl, dt); }
    }

    // ── Setup ─────────────────────────────────────────────────────────────────
    genMap();
    // vraies nations = spawns bien espacés ; territoires sauvages = petits blobs dispersés.
    var realCount = 0; for (var ri = 0; ri < nations; ri++) if (!(nationData[ri] && nationData[ri].wild)) realCount++;
    var realSpawns = pickSpawns(realCount || 1), ridx = 0;
    var landTiles = []; for (var lt = 0; lt < N; lt++) if (terr[lt] === LAND) landTiles.push(lt);
    for (var pi = 0; pi < nations; pi++) {
      var data = nationData[pi] || { perso: PERSOS[pi % PERSOS.length], diff: opts.diff || 'normal', human: (pi + 1) === meId };
      var pl = makePlayer(pi + 1, data); players.push(pl);
      if (pl.wild) { pl.seed = landTiles.length ? landTiles[(rng() * landTiles.length) | 0] : 0; spawnBlob(pi + 1, pl.seed, 2.4 + rng() * 1.6); }
      else { pl.seed = realSpawns[ridx++] || landTiles[(rng() * landTiles.length) | 0]; pl.capital = pl.seed; spawnBlob(pi + 1, pl.seed, 5.5); }
    }
    for (var rp = 1; rp < players.length; rp++) players[rp].tiles = 0;
    for (var ti = 0; ti < N; ti++) if (owner[ti] > 0) players[owner[ti]].tiles++;
    for (var cp = 1; cp < players.length; cp++) if (players[cp].capital) capBonus(players[cp].capital, 2);
    computeTouch();

    return {
      MW: MW, MH: MH, N: N, terr: terr, elev: elev, owner: owner, defMap: defMap,
      get players() { return players; }, get attacks() { return attacks; }, get units() { return units; }, get structAt() { return structAt; },
      get touch() { return touch; }, get borderTiles() { return borderTiles; }, get centroid() { return centroid; }, get coastTiles() { return coastTiles; },
      get leaderId() { return leaderId; }, get elapsed() { return elapsed; },
      MOUNTAIN: MOUNTAIN,
      BUILD: BUILD, buildCost: buildCost, landTotal: function () { return LAND_TOTAL; }, armyCap: armyCap,
      goldPerSec: function (id) { return players[id] ? goldRate(players[id]) : 0; },
      troopsPerSec: function (id) { return players[id] ? troopRate(players[id]) : 0; },
      dominationPct: dominationPct, onlyBlocLeft: onlyBlocLeft, giftGold: giftGold, giftTroops: giftTroops,
      nukesOn: nukesOn, navalOn: navalOn,
      step: step, takeEvents: function () { var e = events; events = []; return e; },
      launchAttack: launchAttack, build: build, launchBoat: launchBoat, launchWarship: launchWarship, launchMissile: launchMissile,
      requestAlliance: requestAlliance, makeAlliance: makeAlliance, breakAlliance: breakAlliance,
      neutralAdjacent: neutralAdjacent, hasCoast: hasCoast, hasFrontier: hasFrontier, isCoast: isCoast,
      coastNear: coastNear, nearestCoast: nearestCoast, nearestStruct: nearestStruct,
      tilesOf: function (id) { return players[id] ? players[id].tiles : 0; },
      aliveIds: function () { var r = []; for (var i = 1; i < players.length; i++) if (players[i].alive) r.push(i); return r; },
      winner: function () { var al = this.aliveIds(); return al.length === 1 ? al[0] : 0; }
    };
  }

  return { createGame: createGame, PERSOS: PERSOS, TRAITS: TRAITS, BUILD: BUILD };
});
