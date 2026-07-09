/*
  ai/openfront-engine.js — Cœur de simulation PUR d'OpenFront (sans DOM).

  Objectif : disposer d'un moteur headless, déterministe (RNG seedé), qui reproduit
  fidèlement les RÈGLES qui font la force de l'IA : génération de carte, économie
  (troupes/or, plafond de population), expansion/guerre par fronts, structures
  (ville/défense), diplomatie (alliances, coalition anti-leader, focus-fire, repli)
  et conditions de victoire.

  Il est chargé par la page de jeu (games/openfront.html, via data-engine) ET par le
  banc d'essai (tools/bench-openfront.js) — même logique des deux côtés, donc le
  benchmark mesure la VRAIE IA. Aucune dépendance : marche dans le navigateur
  (window.OpenFrontEngine) comme dans Node (module.exports).

  API : OpenFrontEngine.createGame(opts) → { step(dt), owner, players, tilesOf(id),
        aliveIds(), winner(), leaderId, launchAttack(...), build(...) , … }
        opts = { seed, w, h, nations, persos:[], diffs:[], meId }
*/
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.OpenFrontEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var OCEAN = 0, LAND = 1;
  var PERSOS = ['aggressive', 'defensive', 'expansionist', 'opportunist', 'balanced'];

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

  function createGame(opts) {
    opts = opts || {};
    var MW = opts.w || 160, MH = opts.h || 100, N = MW * MH;
    var seed = opts.seed != null ? opts.seed : (Math.random() * 1e9) | 0;
    var rng = mulberry32(seed);
    var mapType = opts.mapType != null ? opts.mapType : 1;
    var nations = opts.nations || 6;

    var terr = new Uint8Array(N), elev = new Uint8Array(N), owner = new Int16Array(N), defMap = new Uint8Array(N);
    var players = [null], attacks = [], attackKey = {};
    var touch = [], touchesNeutral = [], borderTiles = [], centroid = [];
    var LAND_TOTAL = 0, leaderId = 0, elapsed = 0, touchClock = 0;
    var meId = opts.meId || 0;

    function nb4(i) { var x = i % MW, y = (i / MW) | 0, r = []; if (x > 0) r.push(i - 1); if (x < MW - 1) r.push(i + 1); if (y > 0) r.push(i - MW); if (y < MH - 1) r.push(i + MW); return r; }
    function terrainMult(i) { var e = elev[i]; return e > 200 ? 2.6 : e > 150 ? 1.7 : e > 90 ? 1.15 : 1; }

    // ── Carte (procédurale, même formule que la page) ──────────────────────────
    function genMap() {
      var oct = [valueNoise(seed), valueNoise(seed * 7 + 3), valueNoise(seed * 13 + 9), valueNoise(seed * 29 + 1)];
      var amp = [1, 0.5, 0.26, 0.13], sc = [1, 2.1, 4.3, 8.7];
      function fbm(nx, ny) { var e = 0, tot = 0; for (var o = 0; o < 4; o++) { e += oct[o](nx * sc[o] % 1, ny * sc[o] % 1) * amp[o]; tot += amp[o]; } return e / tot; }
      var sea = mapType === 2 ? 0.30 : mapType === 0 ? 0.42 : 0.50;
      var edge = mapType === 2 ? 0.55 : mapType === 0 ? 0.9 : 1.15;
      for (var y = 0; y < MH; y++) for (var x = 0; x < MW; x++) {
        var i = y * MW + x, nx = x / MW, ny = y / MH, e = fbm(nx, ny);
        var dx = (nx - 0.5) * 2, dy = (ny - 0.5) * 2, d = Math.sqrt(dx * dx + dy * dy);
        e -= Math.max(0, (d - 0.35)) * edge;
        if (mapType === 1) e -= Math.abs(oct[1](nx * 3 % 1, ny * 3 % 1) - 0.5) * 0.35;
        if (e > sea) { terr[i] = LAND; elev[i] = clamp(Math.round((e - sea) / (1 - sea) * 255), 0, 255); }
        else { terr[i] = OCEAN; elev[i] = clamp(Math.round(e / sea * 255), 0, 255); }
      }
      for (var p = 0; p < 2; p++) { var snap = terr.slice();
        for (i = 0; i < N; i++) { var nn = nb4(i), ld = 0; for (var k = 0; k < nn.length; k++) if (snap[nn[k]] === LAND) ld++;
          if (snap[i] === OCEAN && ld >= nn.length) terr[i] = LAND; if (snap[i] === LAND && ld === 0) terr[i] = OCEAN; } }
      LAND_TOTAL = 0; for (i = 0; i < N; i++) if (terr[i] === LAND) LAND_TOTAL++;
    }

    function spawnBlob(id, center, radius) {
      var cx = center % MW, cy = (center / MW) | 0, q = [center], seen = {}; seen[center] = 1;
      var got = 0, cap = radius * radius * 3;
      while (q.length && got < cap) { var i = q.shift(), x = i % MW, y = (i / MW) | 0;
        if (terr[i] !== LAND || owner[i] !== 0) continue;
        if (Math.hypot(x - cx, y - cy) > radius) continue;
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

    function makePlayer(id, human, perso, diff) {
      return { id: id, human: human, perso: perso, diff: diff || 'normal', alive: true,
        gold: 1000, troops: 6000, tiles: 0, cities: 0, defenses: 0,
        allies: {}, war: {}, traitor: false, seed: 0, ratio: 0.55, focus: 0, prevTiles: 0, aiCd: rng() * 1.5 };
    }

    // ── Économie (identique page) ─────────────────────────────────────────────
    function armyCap(p) { return 5000 + p.tiles * 120 + p.cities * 25000; }
    function economy(p, dt) {
      if (!p.alive) return;
      var rat = p.ratio, cap = armyCap(p);
      var grow = (cap - p.troops) * 0.16 * (0.35 + rat) * dt + p.tiles * 2.2 * dt;
      p.troops = clamp(p.troops + grow, 0, cap);
      p.gold += (p.tiles * 0.34 + p.cities * 5 + 8) * (1.35 - rat * 0.85) * dt;
    }

    // ── Expansion / guerre (identique page) ───────────────────────────────────
    function capturable(i, atkId, tgt) {
      if (terr[i] !== LAND) return false; if (owner[i] !== tgt) return false; if (owner[i] === atkId) return false;
      if (tgt > 0 && players[atkId].allies[tgt]) return false; return true;
    }
    function tileCost(i, atkId, tgt) {
      var tm = terrainMult(i), base;
      if (tgt === 0) base = 6; else { var d = players[tgt], dens = d.troops / Math.max(1, d.tiles); base = 4 + Math.sqrt(dens) * 3; }
      if (defMap[i] > 0 && tgt > 0) base *= 1.9;
      return base * tm;
    }
    function launchAttack(atkId, tgtId, troops, aim) {
      var atk = players[atkId]; if (!atk || !atk.alive || troops < 50) return;
      if (tgtId > 0 && (atk.allies[tgtId] || atk.id === tgtId)) return;
      troops = Math.min(troops, atk.troops); atk.troops -= troops;
      var key = atkId + '>' + tgtId, a = attackKey[key];
      if (a) { a.troops += troops; a.aim = aim || null; if (a.dead) a.dead = false; seedFrontier(a); }
      else { a = { atk: atkId, tgt: tgtId, troops: troops, front: [], head: 0, seen: new Uint8Array(N), carry: 0, dead: false, aim: aim || null };
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
      for (var f = 0; f < cands.length; f++) { var t = cands[f]; if (!a.seen[t]) { a.seen[t] = 1; a.front.push(t); } }
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
        if (prev > 0) { var dp = players[prev]; dp.tiles--; dp.troops = Math.max(0, dp.troops - bc * 0.8); if (dp.tiles <= 0) eliminate(prev, a.atk); }
        owner[best] = a.atk; atk.tiles++; a.troops -= bc;
        if (!a.seen[best]) { a.seen[best] = 1; a.front.push(best); }
        did++;
        if (a.head > 20000) { a.front = a.front.slice(a.head); a.head = 0; }
      }
      if (a.troops <= 1 && !did) a.dead = true;
    }
    function eliminate(id, by) {
      var p = players[id]; if (!p.alive) return; p.alive = false;
      for (var i = 0; i < N; i++) if (owner[i] === id) owner[i] = 0; p.tiles = 0;
    }

    // ── Structures (ville / défense) ──────────────────────────────────────────
    function stampDef(i, delta) { var x = i % MW, y = (i / MW) | 0, R = 4;
      for (var dy = -R; dy <= R; dy++) for (var dx = -R; dx <= R; dx++) { if (dx * dx + dy * dy > R * R) continue;
        var xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= MW || yy >= MH) continue; var j = yy * MW + xx; defMap[j] = clamp(defMap[j] + delta, 0, 255); } }
    function build(i, k, ownerId) { var pl = players[ownerId];
      if (k === 'city') pl.cities++; else if (k === 'defense') { pl.defenses++; stampDef(i, 1); } }
    function placeAIStruct(p, k) {
      var cost = k === 'city' ? 5000 : 2000; if (p.gold < cost) return;
      var cands = []; for (var i = 0; i < N; i++) if (owner[i] === p.id) cands.push(i);
      if (!cands.length) return; p.gold -= cost; build(cands[(rng() * cands.length) | 0], k, p.id);
    }

    // ── Adjacence + caches (identique page) ───────────────────────────────────
    function computeTouch() {
      var P = players.length; touch = []; touchesNeutral = []; borderTiles = []; centroid = [];
      var sx = new Float64Array(P), sy = new Float64Array(P), cnt = new Float64Array(P);
      for (var a = 0; a < P; a++) { touch.push(new Uint8Array(P)); touchesNeutral.push(false); borderTiles.push([]); centroid.push(null); }
      for (var i = 0; i < N; i++) { var o = owner[i]; if (o <= 0) continue; var x = i % MW, y = (i / MW) | 0, isB = false;
        sx[o] += x; sy[o] += y; cnt[o]++;
        var ns = [x > 0 ? i - 1 : -1, x < MW - 1 ? i + 1 : -1, y > 0 ? i - MW : -1, y < MH - 1 ? i + MW : -1];
        for (var k = 0; k < 4; k++) { var n = ns[k]; if (n < 0) continue; if (terr[n] === OCEAN) continue; var no = owner[n];
          if (no !== o) { isB = true; if (no > 0) touch[o][no] = 1; else touchesNeutral[o] = true; } }
        if (isB) borderTiles[o].push(i); }
      for (a = 1; a < P; a++) if (cnt[a] > 0) centroid[a] = { x: sx[a] / cnt[a], y: sy[a] / cnt[a] };
      leaderId = 0; var lt = -1; for (var q = 1; q < players.length; q++) if (players[q].alive && players[q].tiles > lt) { lt = players[q].tiles; leaderId = q; }
    }
    function neutralAdjacent(id) { return !!touchesNeutral[id]; }

    // ── Diplomatie (identique page) ───────────────────────────────────────────
    function requestAlliance(fromId, toId) {
      var from = players[fromId], to = players[toId]; if (!from.alive || !to.alive || from.allies[toId]) return;
      if (toId === meId) return; // décision humaine : gérée hors moteur
      if (aiAccepts(to, from)) makeAlliance(fromId, toId);
    }
    function aiAccepts(ai, other) {
      if (ai.perso === 'aggressive') return rng() < 0.2; if (ai.war[other.id]) return rng() < 0.3;
      if (other.traitor) return rng() < 0.25; return rng() < (ai.perso === 'defensive' ? 0.85 : 0.6);
    }
    function makeAlliance(a, b) { players[a].allies[b] = 1; players[b].allies[a] = 1; delete players[a].war[b]; delete players[b].war[a];
      killFront(a, b); killFront(b, a); }
    function breakAlliance(a, b, treason) { if (!players[a].allies[b]) return; delete players[a].allies[b]; delete players[b].allies[a]; if (treason) players[a].traitor = true; }
    function killFront(a, b) { var at = attackKey[a + '>' + b]; if (at) at.dead = true; }

    // ── IA (identique page, mais difficulté PAR joueur pour le bench) ──────────
    function aiThink(p, dt) {
      p.aiCd -= dt; if (p.aiCd > 0) return; p.aiCd = 1.1 + rng() * 1.4; if (!p.alive) return;
      // niveau : 0 (facile) .. 1 (difficile) — pilote l'EFFICACITÉ, pas l'agressivité.
      var skill = p.diff === 'hard' ? 1 : p.diff === 'easy' ? 0 : 0.6;
      var underAtk = false; for (var ua = 0; ua < attacks.length; ua++) if (!attacks[ua].dead && attacks[ua].tgt === p.id) { underAtk = true; break; }
      var losing = p.prevTiles > 0 && p.tiles < p.prevTiles * 0.9; p.prevTiles = p.tiles;
      p.ratio = underAtk ? 0.82 : (p.perso === 'defensive' ? 0.5 : p.perso === 'aggressive' ? 0.72 : 0.6);
      // les IA faibles agissent moins souvent → grossissent plus lentement
      if (rng() > 0.45 + 0.55 * skill) return;
      var diffMul = 0.6 + 0.75 * skill;
      var persoAgg = { aggressive: 1.4, defensive: 0.5, expansionist: 0.7, opportunist: 1.0, balanced: 0.9 }[p.perso] * diffMul;
      var neigh = []; for (var q = 1; q < players.length; q++) { if (q === p.id || !players[q].alive) continue; if (touch[p.id] && touch[p.id][q]) neigh.push(players[q]); }

      aiSpend(p, neigh, underAtk, skill);

      var strongest = null; for (var s = 0; s < neigh.length; s++) if (!strongest || neigh[s].tiles > strongest.tiles) strongest = neigh[s];
      var myThreat = strongest && strongest.tiles > p.tiles * 1.4;
      if (myThreat && p.perso !== 'aggressive' && rng() < 0.55) {
        var partner = null; for (var s2 = 0; s2 < neigh.length; s2++) { var e2 = neigh[s2]; if (e2.id === leaderId) continue; if (!p.allies[e2.id] && !p.war[e2.id] && (!partner || e2.tiles > partner.tiles)) partner = e2; }
        if (!partner) partner = strongest; if (partner && !p.allies[partner.id] && !p.war[partner.id]) requestAlliance(p.id, partner.id);
      }
      if (p.perso === 'opportunist') for (var al in p.allies) { var A = players[al]; if (A && A.alive && A.tiles < p.tiles * 0.5 && rng() < 0.25) breakAlliance(p.id, +al, true); }

      var aggressor = 0; for (var ax = 0; ax < attacks.length; ax++) { var AA = attacks[ax]; if (!AA.dead && AA.tgt === p.id) { aggressor = AA.atk; break; } }
      if (underAtk && losing) { if (aggressor && p.perso !== 'aggressive' && !p.allies[aggressor] && rng() < 0.6) requestAlliance(p.id, aggressor); return; }

      // Expansion : le NEUTRE (peu cher) d'abord ; la guerre quand on a l'avantage.
      var neutral = neutralAdjacent(p.id);
      var reserve = armyCap(p) * (0.32 - 0.18 * skill);           // « difficile » engage plus tôt
      var send = p.troops * (0.28 + 0.32 * rng()) * (0.7 + 0.5 * skill);
      if (p.perso === 'expansionist') send *= 1.15;
      var forceWar = p.perso === 'aggressive' && rng() < 0.4 * (0.5 + skill);
      var didAttack = false;
      if (neutral && p.troops > reserve && !forceWar) { launchAttack(p.id, 0, send); didAttack = true; }
      if (!didAttack && neigh.length) {
        var target = null, tb = 1e9;
        for (var n = 0; n < neigh.length; n++) { var e = neigh[n]; if (p.allies[e.id]) continue; var dens = e.troops / Math.max(1, e.tiles) + e.tiles * 0.4; if (dens < tb) { tb = dens; target = e; } }
        if (leaderId && leaderId !== p.id && touch[p.id] && touch[p.id][leaderId] && !p.allies[leaderId] && players[leaderId].tiles > p.tiles * 1.25 && rng() < 0.6) target = players[leaderId];
        if (p.focus && players[p.focus] && players[p.focus].alive && touch[p.id] && touch[p.id][p.focus] && !p.allies[p.focus] && rng() < 0.7) target = players[p.focus];
        if (target) p.focus = target.id;
        var warNeed = (1.25 - 0.55 * skill) - Math.max(0, persoAgg - 0.9) * 0.22;
        if (target && p.troops > target.troops * warNeed && p.troops > reserve) {
          p.war[target.id] = 1; target.war[p.id] = 1; if (p.allies[target.id]) breakAlliance(p.id, target.id, true);
          launchAttack(p.id, target.id, p.troops * (0.4 + 0.3 * rng()), centroid[target.id] ? { x: centroid[target.id].x, y: centroid[target.id].y } : null);
        } else if (neutral && p.troops > reserve) launchAttack(p.id, 0, send);
      }
    }
    function aiSpend(p, neigh, underAtk, skill) {
      if (underAtk && p.gold >= 2000 && rng() < 0.7) placeAIStruct(p, 'defense');
      else if (p.gold >= 5000 && p.tiles > 35 && rng() < 0.3 + 0.5 * skill) placeAIStruct(p, 'city');
    }

    // ── Boucle ────────────────────────────────────────────────────────────────
    function step(dt) {
      elapsed += dt;
      for (var p = 1; p < players.length; p++) economy(players[p], dt);
      for (var a = 0; a < attacks.length; a++) processAttack(attacks[a], dt);
      if (attacks.length) { var live = []; for (var i = 0; i < attacks.length; i++) { var A = attacks[i]; if (A.dead) delete attackKey[A.atk + '>' + A.tgt]; else live.push(A); } attacks = live; }
      touchClock -= dt; if (touchClock <= 0) { touchClock = 1.0; computeTouch(); }
      for (p = 1; p < players.length; p++) { var pl = players[p]; if (pl.alive && !pl.human) aiThink(pl, dt); }
    }

    // ── Setup ─────────────────────────────────────────────────────────────────
    genMap();
    var spawns = pickSpawns(nations);
    for (var pi = 0; pi < nations; pi++) {
      var human = (pi + 1) === meId;
      var perso = opts.persos && opts.persos[pi] ? opts.persos[pi] : PERSOS[pi % PERSOS.length];
      var diff = opts.diffs && opts.diffs[pi] ? opts.diffs[pi] : (opts.diff || 'normal');
      var pl = makePlayer(pi + 1, human, perso, diff); pl.seed = spawns[pi]; players.push(pl);
      spawnBlob(pi + 1, spawns[pi], 4.5);
    }
    for (var rp = 1; rp < players.length; rp++) players[rp].tiles = 0;
    for (var ti = 0; ti < N; ti++) if (owner[ti] > 0) players[owner[ti]].tiles++;
    computeTouch();

    return {
      MW: MW, MH: MH, N: N, terr: terr, elev: elev, owner: owner, defMap: defMap,
      get players() { return players; }, get attacks() { return attacks; },
      get touch() { return touch; }, get borderTiles() { return borderTiles; }, get centroid() { return centroid; },
      get leaderId() { return leaderId; }, get elapsed() { return elapsed; }, LAND_TOTAL: function () { return LAND_TOTAL; },
      step: step, launchAttack: launchAttack, build: build, computeTouch: computeTouch,
      neutralAdjacent: neutralAdjacent, requestAlliance: requestAlliance, makeAlliance: makeAlliance, breakAlliance: breakAlliance,
      tilesOf: function (id) { return players[id] ? players[id].tiles : 0; },
      aliveIds: function () { var r = []; for (var i = 1; i < players.length; i++) if (players[i].alive) r.push(i); return r; },
      winner: function () { var al = this.aliveIds(); return al.length === 1 ? al[0] : 0; }
    };
  }

  return { createGame: createGame, PERSOS: PERSOS };
});
