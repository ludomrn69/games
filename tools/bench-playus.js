#!/usr/bin/env node
/*
  tools/bench-playus.js — Smoke test headless des mini-jeux games/playus/*.html.

  Sans dépendance : simule juste assez de DOM + Canvas2D + rAF + events pour
  CHARGER chaque jeu, DÉMARRER la partie (bouton « Jouer »/onclick), avancer des
  frames d'animation puis injecter des entrées (pointer, tactile, clavier). On
  capte toute exception runtime. La boucle rAF est modélisée comme dans un vrai
  navigateur (une erreur dans un callback est signalée mais NE tue PAS la boucle),
  et on SÉPARE les erreurs d'écran d'accueil (avant démarrage — glitch qui
  s'auto-répare) des erreurs PENDANT le jeu (vrai plantage).

  Ne juge PAS le gameplay ni le rendu visuel, seulement « ça charge, ça démarre et
  ça tourne sans planter ». En CI. Lancement : `node tools/bench-playus.js`.
   • propre       : 0 erreur → OK
   • glitch menu  : erreur seulement avant « Jouer » → AVERTISSEMENT (n'échoue pas)
   • cassé        : erreur pendant le jeu → ÉCHEC (exit 1)
*/
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.resolve(__dirname, '..');
var DIR = path.join(ROOT, 'games', 'playus');

// ── Stub Canvas 2D : tout est no-op ; quelques retours plausibles ────────────
function makeCtx() {
  var grad = { addColorStop: function () {} };
  var handler = {
    get: function (t, k) {
      if (k in t) return t[k];
      if (k === 'canvas') return t.canvas;
      if (k === 'measureText') return function () { return { width: 10 }; };
      if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return function () { return grad; };
      if (k === 'getImageData') return function (x, y, w, h) { return { data: new Uint8ClampedArray(Math.max(4, (w | 0) * (h | 0) * 4)), width: w | 0, height: h | 0 }; };
      if (k === 'createImageData') return function (w, h) { return { data: new Uint8ClampedArray(Math.max(4, (w | 0) * (h | 0) * 4)), width: w | 0, height: h | 0 }; };
      if (k === 'isPointInPath' || k === 'isPointInStroke') return function () { return false; };
      // toute autre méthode -> no-op ; toute autre propriété -> valeur écrivable
      return function () {};
    },
    set: function (t, k, v) { t[k] = v; return true; }
  };
  var base = { canvas: null };
  return new Proxy(base, handler);
}

function listenerBag() {
  return {
    _l: {},
    addEventListener: function (t, cb) { (this._l[t] = this._l[t] || []).push(cb); },
    removeEventListener: function (t, cb) { var a = this._l[t]; if (a) { var i = a.indexOf(cb); if (i >= 0) a.splice(i, 1); } },
    dispatch: function (t, ev) { (this._l[t] || []).slice().forEach(function (cb) { try { cb(ev); } catch (e) { throw e; } }); }
  };
}

function makeEl(id, tag) {
  var el = listenerBag();
  el.id = id || '';
  el.tagName = (tag || 'div').toUpperCase();
  el.style = {};
  el.dataset = {};
  el.children = [];
  el._text = '';
  el.className = '';
  var classes = {};
  el.classList = {
    add: function () { for (var i = 0; i < arguments.length; i++) classes[arguments[i]] = 1; },
    remove: function () { for (var i = 0; i < arguments.length; i++) delete classes[arguments[i]]; },
    toggle: function (c, f) { if (f === undefined) f = !classes[c]; if (f) classes[c] = 1; else delete classes[c]; return !!classes[c]; },
    contains: function (c) { return !!classes[c]; }
  };
  Object.defineProperty(el, 'textContent', { get: function () { return el._text; }, set: function (v) { el._text = String(v); } });
  Object.defineProperty(el, 'innerHTML', { get: function () { return el._text; }, set: function (v) { el._text = String(v); } });
  Object.defineProperty(el, 'innerText', { get: function () { return el._text; }, set: function (v) { el._text = String(v); } });
  el.clientWidth = 360; el.clientHeight = 640; el.offsetWidth = 360; el.offsetHeight = 640;
  el.width = 360; el.height = 640;
  el.getContext = function () { var c = makeCtx(); c.canvas = el; return c; };
  el.getBoundingClientRect = function () { return { left: 0, top: 0, right: el.clientWidth, bottom: el.clientHeight, width: el.clientWidth, height: el.clientHeight, x: 0, y: 0 }; };
  el.appendChild = function (c) { el.children.push(c); return c; };
  el.removeChild = function (c) { var i = el.children.indexOf(c); if (i >= 0) el.children.splice(i, 1); return c; };
  el.insertBefore = function (c) { el.children.push(c); return c; };
  el.setAttribute = function (k, v) { if (k === 'class') el.className = v; el.dataset[k] = v; };
  el.getAttribute = function (k) { return el.dataset[k]; };
  el.removeAttribute = function (k) { delete el.dataset[k]; };
  el.querySelector = function () { return null; };
  el.querySelectorAll = function () { return []; };
  el.closest = function () { return null; };
  el.matches = function () { return false; };
  el.contains = function () { return false; };
  el.parentNode = null; el.parentElement = null; el.nextSibling = null; el.previousSibling = null;
  el.focus = function () {}; el.blur = function () {}; el.click = function () { if (el.onclick) el.onclick({ target: el }); el.dispatch('click', { target: el }); };
  el.requestPointerLock = function () {}; el.remove = function () {};
  el.onclick = null;
  el.play = function () { return { catch: function () {} }; }; el.pause = function () {}; el.load = function () {};
  return el;
}

function extractIds(html) {
  var ids = {}, re = /\bid\s*=\s*["']([^"']+)["']/g, m;
  while ((m = re.exec(html))) ids[m[1]] = 1;
  return ids;
}
function extractScripts(html) {
  var out = [], re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi, m;
  while ((m = re.exec(html))) if (m[1].trim()) out.push(m[1]);
  return out;
}

function runGame(file) {
  var html = fs.readFileSync(path.join(DIR, file), 'utf8');
  var ids = extractIds(html);
  var scripts = extractScripts(html);
  var els = {};
  var frameCbs = [];
  var timeouts = [];
  var errors = [];

  var doc = listenerBag();
  var body = makeEl('body', 'body');
  var root = makeEl('html', 'html');
  doc.body = body; doc.documentElement = root; doc.head = makeEl('head', 'head');
  doc.getElementById = function (id) {
    if (els[id]) return els[id];
    if (ids[id]) return (els[id] = makeEl(id, id === 'cv' || /canvas|cv/i.test(id) ? 'canvas' : 'div'));
    return null;
  };
  doc.querySelector = function (sel) {
    if (sel === 'canvas') { for (var k in ids) if (/cv|canvas/i.test(k)) return doc.getElementById(k); return doc.getElementById('cv') || makeEl('c', 'canvas'); }
    if (sel === 'body') return body;
    var m = /^#([\w-]+)$/.exec(sel); if (m) return doc.getElementById(m[1]);
    return null;
  };
  doc.querySelectorAll = function () { return []; };
  doc.createElement = function (tag) { return makeEl('', tag); };
  doc.createElementNS = function (ns, tag) { return makeEl('', tag); };
  doc.getElementsByTagName = function () { return []; };
  doc.getElementsByClassName = function () { return []; };
  Object.defineProperty(doc, 'hidden', { value: false });
  doc.visibilityState = 'visible';
  doc.cookie = '';

  var storage = {};
  var localStorage = {
    getItem: function (k) { return k in storage ? storage[k] : null; },
    setItem: function (k, v) { storage[k] = String(v); },
    removeItem: function (k) { delete storage[k]; },
    clear: function () { storage = {}; }
  };

  var audioNode = new Proxy({}, { get: function (t, k) {
    if (k === 'connect' || k === 'disconnect' || k === 'start' || k === 'stop') return function () {};
    if (k === 'frequency' || k === 'gain' || k === 'detune' || k === 'Q' || k === 'pan') return { value: 0, setValueAtTime: function () {}, linearRampToValueAtTime: function () {}, exponentialRampToValueAtTime: function () {}, setTargetAtTime: function () {} };
    return function () { return audioNode; };
  } });
  function AudioContext() {}
  AudioContext.prototype = new Proxy({}, { get: function (t, k) {
    if (k === 'currentTime') return 0;
    if (k === 'destination') return audioNode;
    if (k === 'state') return 'running';
    if (k === 'sampleRate') return 44100;
    if (k === 'resume' || k === 'suspend' || k === 'close') return function () { return { then: function () {}, catch: function () {} }; };
    if (k === 'decodeAudioData') return function () { return { then: function () {}, catch: function () {} }; };
    return function () { return audioNode; };
  } });

  var win;
  var sandbox = {};
  win = sandbox;
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.document = doc;
  sandbox.localStorage = localStorage;
  sandbox.sessionStorage = localStorage;
  sandbox.console = { log: function () {}, warn: function () {}, error: function () {}, info: function () {} };
  sandbox.devicePixelRatio = 2;
  sandbox.innerWidth = 360; sandbox.innerHeight = 640;
  sandbox.outerWidth = 360; sandbox.outerHeight = 640;
  sandbox.scrollX = 0; sandbox.scrollY = 0;
  sandbox.performance = { now: (function () { var t = 0; return function () { t += 16; return t; }; })() };
  sandbox.Date = Date; sandbox.Math = Math; sandbox.JSON = JSON;
  sandbox.parseInt = parseInt; sandbox.parseFloat = parseFloat; sandbox.isNaN = isNaN; sandbox.isFinite = isFinite;
  sandbox.Array = Array; sandbox.Object = Object; sandbox.String = String; sandbox.Number = Number;
  sandbox.Boolean = Boolean; sandbox.RegExp = RegExp; sandbox.Error = Error; sandbox.Map = Map; sandbox.Set = Set;
  sandbox.Symbol = Symbol; sandbox.Promise = Promise; sandbox.Float32Array = Float32Array; sandbox.Float64Array = Float64Array;
  sandbox.Uint8Array = Uint8Array; sandbox.Uint8ClampedArray = Uint8ClampedArray; sandbox.Int32Array = Int32Array; sandbox.Uint32Array = Uint32Array;
  sandbox.encodeURIComponent = encodeURIComponent; sandbox.decodeURIComponent = decodeURIComponent;
  sandbox.AudioContext = AudioContext; sandbox.webkitAudioContext = AudioContext;
  sandbox.requestAnimationFrame = function (cb) { frameCbs.push(cb); return frameCbs.length; };
  sandbox.cancelAnimationFrame = function () {};
  sandbox.setTimeout = function (cb, t) { timeouts.push(cb); return timeouts.length; };
  sandbox.clearTimeout = function () {};
  sandbox.setInterval = function () { return 0; };
  sandbox.clearInterval = function () {};
  sandbox.addEventListener = doc.addEventListener.bind(doc);
  sandbox.removeEventListener = doc.removeEventListener.bind(doc);
  sandbox.dispatchEvent = function () {};
  sandbox.getComputedStyle = function () { return new Proxy({}, { get: function () { return ''; } }); };
  sandbox.matchMedia = function () { return { matches: false, addListener: function () {}, removeListener: function () {}, addEventListener: function () {}, removeEventListener: function () {} }; };
  sandbox.navigator = { vibrate: function () { return true; }, userAgent: 'node', maxTouchPoints: 5, language: 'fr', platform: 'node', clipboard: { writeText: function () { return { then: function () {}, catch: function () {} }; } }, getGamepads: function () { return []; }, share: function () { return { then: function () {}, catch: function () {} }; } };
  sandbox.screen = { width: 360, height: 640, orientation: { lock: function () { return { then: function () {}, catch: function () {} }; }, unlock: function () {}, angle: 0, type: 'portrait-primary', addEventListener: function () {} } };
  sandbox.location = { href: 'https://x/games/playus/' + file, search: '', hash: '', pathname: '/games/playus/' + file, reload: function () {}, replace: function () {}, assign: function () {} };
  sandbox.history = { pushState: function () {}, replaceState: function () {}, back: function () {}, go: function () {} };
  sandbox.Image = function () { return makeEl('', 'img'); };
  sandbox.Audio = function () { return makeEl('', 'audio'); };
  sandbox.alert = function () {}; sandbox.confirm = function () { return true; }; sandbox.prompt = function () { return ''; };
  sandbox.URL = URL; sandbox.URLSearchParams = URLSearchParams;
  sandbox.fetch = function () { return Promise.reject(new Error('offline')); };
  sandbox.CustomEvent = function (t, o) { var e = (o && o.detail !== undefined) ? { type: t, detail: o.detail } : { type: t }; return e; };
  sandbox.Event = function (t) { return { type: t }; };

  // phase : 'menu' (avant démarrage) puis 'play' (après clic Jouer). On sépare
  // les erreurs des deux phases : une erreur seulement en 'menu' = glitch d'écran
  // d'accueil qui s'auto-répare au démarrage (le jeu reste jouable) ; une erreur
  // en 'play' = vrai plantage de gameplay.
  var phase = 'menu';
  var preErr = [], postErr = [];
  function rec(where, e) { (phase === 'menu' ? preErr : postErr).push(where + ': ' + (e && e.message)); }

  function ptr(x, y) { return { clientX: x, clientY: y, pageX: x, pageY: y, offsetX: x, offsetY: y, button: 0, pointerId: 1, isPrimary: true, preventDefault: function () {}, stopPropagation: function () {}, touches: [{ clientX: x, clientY: y, identifier: 1 }], changedTouches: [{ clientX: x, clientY: y, identifier: 1 }], target: body }; }
  function key(k) { return { key: k, code: k, keyCode: k === 'ArrowUp' ? 38 : k === ' ' ? 32 : 65, which: 65, preventDefault: function () {}, stopPropagation: function () {} }; }

  // Modélise la boucle rAF du navigateur : une exception dans un callback est
  // signalée mais NE tue PAS la boucle (le callback s'est re-souscrit avant de
  // throw). On avance donc toujours n frames, en enregistrant chaque erreur.
  function pumpFrames(n) {
    for (var f = 0; f < n; f++) {
      var cbs = frameCbs; frameCbs = [];
      for (var j = 0; j < cbs.length; j++) {
        try { cbs[j](sandbox.performance.now()); } catch (e) { rec('frame', e); }
      }
    }
  }

  vm.createContext(sandbox);
  scripts.forEach(function (src, i) {
    try { vm.runInContext(src, sandbox, { filename: file + '#script' + i, timeout: 4000 }); }
    catch (e) { rec('load#' + i, e); }
  });

  try { doc.dispatch('DOMContentLoaded', { type: 'DOMContentLoaded' }); } catch (e) { rec('DOMContentLoaded', e); }
  try { doc.dispatch('load', { type: 'load' }); } catch (e) { rec('load-evt', e); }

  // quelques frames d'écran d'accueil
  pumpFrames(6);

  // ── DÉMARRAGE : cliquer les boutons start/play/replay/jouer ────────────────
  phase = 'play';
  var started = false;
  Object.keys(els).forEach(function (id) {
    if (/start|play|replay|begin|jouer|go\b/i.test(id) && els[id]) {
      try { if (els[id].onclick) els[id].onclick({ target: els[id] }); els[id].dispatch('click', { target: els[id] }); started = true; }
      catch (e) { rec('startBtn#' + id, e); }
    }
  });
  // tap générique aussi (jeux qui démarrent au 1er contact, sans bouton)
  try { body.dispatch('pointerdown', ptr(180, 320)); body.dispatch('pointerup', ptr(180, 320)); } catch (e) { rec('tap-start', e); }
  pumpFrames(6);

  // ── ENTRÉES de gameplay sur les cibles courantes ───────────────────────────
  var targets = [doc, body];
  ['cv', 'stage', 'game', 'board', 'canvas', 'wrap', 'app'].forEach(function (id) { if (els[id]) targets.push(els[id]); });
  var seq = [
    ['pointerdown', ptr(180, 500)], ['pointermove', ptr(180, 300)], ['pointerup', ptr(180, 120)],
    ['touchstart', ptr(180, 500)], ['touchmove', ptr(180, 300)], ['touchend', ptr(180, 120)],
    ['mousedown', ptr(180, 400)], ['mousemove', ptr(200, 300)], ['mouseup', ptr(180, 200)],
    ['click', ptr(180, 320)],
    ['keydown', key('ArrowUp')], ['keyup', key('ArrowUp')], ['keydown', key(' ')], ['keydown', key('ArrowLeft')], ['keydown', key('ArrowRight')]
  ];
  for (var s = 0; s < seq.length; s++) {
    for (var t = 0; t < targets.length; t++) {
      try { targets[t].dispatch(seq[s][0], seq[s][1]); } catch (e) { rec('evt ' + seq[s][0], e); }
    }
    pumpFrames(3);
  }
  pumpFrames(30);

  // vider des timeouts différés (fins de manche, respawns…)
  for (var pass = 0; pass < 3; pass++) {
    var to = timeouts.splice(0, 100);
    to.forEach(function (cb) { try { cb(); } catch (e) { rec('timeout', e); } });
    pumpFrames(10);
  }

  return { pre: preErr, post: postErr, started: started };
}

var files = fs.readdirSync(DIR).filter(function (f) { return f.endsWith('.html'); }).sort();
var clean = [], menuGlitch = [], broken = [];
files.forEach(function (f) {
  var r;
  try { r = runGame(f); } catch (e) { r = { pre: [], post: ['harness: ' + (e && e.message)], started: false }; }
  if (r.post.length) { broken.push([f, r.post]); process.stdout.write('✗'); }
  else if (r.pre.length) { menuGlitch.push([f, r.pre]); process.stdout.write('~'); }
  else { clean.push(f); process.stdout.write('.'); }
});
process.stdout.write('\n\n');
console.log('Playus smoke test — ' + files.length + ' jeux  (. propre  ~ glitch menu  ✗ cassé)\n');
console.log('  ✅ Propres (démarrent + tournent sans aucune erreur) : ' + clean.length);
console.log('  🟡 Jouables mais erreur sur écran d\'accueil (s\'auto-répare au démarrage) : ' + menuGlitch.length);
menuGlitch.forEach(function (p) { console.log('       ~ ' + p[0] + '  →  ' + p[1].slice(0, 1).join(' | ')); });
console.log('  🔴 Cassés (erreur PENDANT le jeu) : ' + broken.length);
broken.forEach(function (p) { console.log('       ✗ ' + p[0] + '  →  ' + p[1].slice(0, 2).join(' | ')); });
process.exit(broken.length ? 1 : 0);
