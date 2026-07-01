/*
  sfx.js — Sons PARTAGÉS, discrets, 100 % HORS-LIGNE.

  Les sons sont SYNTHÉTISÉS à la volée (Web Audio, oscillateurs) : aucun fichier
  audio à télécharger → fonctionne parfaitement en avion. Tout respecte la bascule
  localStorage 'games.sound' (même réglage que le bip de tour). Rien ici ne touche
  au réseau.

  API : Sfx.play('win'|'lose'|'place'|'click'|'coin'|'flip'|'score'|'error'|'turn'|'big')
*/
(function (root) {
  var ctx = null;
  function on() { try { return localStorage.getItem('games.sound') !== '0'; } catch (e) { return true; } }
  function ac() {
    if (!ctx) { try { ctx = new (root.AudioContext || root.webkitAudioContext)(); } catch (e) { return null; } }
    if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
    return ctx;
  }
  // Une note : { f, to (sweep), dur, type, delay, vol }.
  function tone(o) {
    var c = ac(); if (!c) return;
    var t = c.currentTime + (o.delay || 0);
    var osc = c.createOscillator(), g = c.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.to) { try { osc.frequency.exponentialRampToValueAtTime(o.to, t + o.dur); } catch (e) {} }
    var v = o.vol == null ? 0.2 : o.vol;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    osc.connect(g); g.connect(c.destination);
    osc.start(t); osc.stop(t + o.dur + 0.03);
  }
  function seq(notes, type, vol, step) { notes.forEach(function (f, i) { tone({ f: f, dur: (step || 0.1) * 1.4, type: type, vol: vol, delay: i * (step || 0.1) }); }); }
  var SOUNDS = {
    click: function () { tone({ f: 320, dur: 0.05, type: 'square', vol: 0.10 }); },
    place: function () { tone({ f: 200, to: 130, dur: 0.09, type: 'sine', vol: 0.2 }); },
    flip:  function () { tone({ f: 520, to: 900, dur: 0.05, type: 'triangle', vol: 0.1 }); },
    deal:  function () { tone({ f: 440, to: 300, dur: 0.05, type: 'triangle', vol: 0.12 }); },
    coin:  function () { tone({ f: 988, dur: 0.06, type: 'square', vol: 0.12 }); tone({ f: 1319, dur: 0.1, type: 'square', vol: 0.12, delay: 0.06 }); },
    error: function () { tone({ f: 160, to: 90, dur: 0.18, type: 'sawtooth', vol: 0.16 }); },
    score: function () { tone({ f: 660, to: 990, dur: 0.04, type: 'square', vol: 0.07 }); },
    turn:  function () { tone({ f: 660, dur: 0.12, type: 'sine', vol: 0.2 }); tone({ f: 880, dur: 0.16, type: 'sine', vol: 0.2, delay: 0.12 }); },
    win:   function () { seq([523, 659, 784, 1047], 'triangle', 0.2, 0.1); },
    lose:  function () { seq([392, 330, 262], 'sawtooth', 0.14, 0.14); },
    big:   function () { seq([523, 659, 784, 1047, 1319], 'square', 0.16, 0.07); }
  };

  root.Sfx = {
    on: on,
    play: function (name) { if (!on()) return; var s = SOUNDS[name]; if (s) { try { s(); } catch (e) {} } },
    tone: tone
  };
})(typeof window !== 'undefined' ? window : this);
