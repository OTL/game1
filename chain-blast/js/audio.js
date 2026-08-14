/* audio.js — WebAudio による軽量な効果音（外部ファイル不要） */
(function (global) {
  'use strict';

  var ctx = null;
  var enabled = true;

  function ensure() {
    if (!enabled) return null;
    if (!ctx) {
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) { enabled = false; return null; }
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(opts) {
    var ac = ensure();
    if (!ac) return;
    var t0 = ac.currentTime + (opts.delay || 0);
    var osc = ac.createOscillator();
    var gain = ac.createGain();
    osc.type = opts.type || 'triangle';
    osc.frequency.setValueAtTime(opts.freq, t0);
    if (opts.to) osc.frequency.exponentialRampToValueAtTime(Math.max(40, opts.to), t0 + opts.dur);
    var vol = (opts.vol == null ? 0.16 : opts.vol);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + opts.dur + 0.03);
  }

  function noise(dur, vol) {
    var ac = ensure();
    if (!ac) return;
    var len = Math.floor(ac.sampleRate * dur);
    var buf = ac.createBuffer(1, len, ac.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
    }
    var src = ac.createBufferSource();
    src.buffer = buf;
    var filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1600;
    var gain = ac.createGain();
    gain.gain.value = vol == null ? 0.2 : vol;
    src.connect(filter).connect(gain).connect(ac.destination);
    src.start();
  }

  var Sound = {
    setEnabled: function (v) {
      enabled = v;
      if (v) ensure();
    },
    isEnabled: function () { return enabled; },
    unlock: function () { ensure(); },

    pick: function () { tone({ freq: 520, to: 680, dur: 0.07, vol: 0.08, type: 'sine' }); },
    drop: function () { tone({ freq: 260, to: 180, dur: 0.1, vol: 0.12, type: 'square' }); },
    deny: function () { tone({ freq: 150, to: 90, dur: 0.16, vol: 0.12, type: 'sawtooth' }); },

    clear: function (combo) {
      var base = 480 + Math.min(combo, 8) * 55;
      [0, 1, 2].forEach(function (i) {
        tone({ freq: base * Math.pow(1.26, i), dur: 0.16, vol: 0.11, delay: i * 0.045, type: 'triangle' });
      });
      noise(0.18, 0.12);
    },
    blast: function () {
      noise(0.34, 0.26);
      tone({ freq: 180, to: 45, dur: 0.3, vol: 0.18, type: 'sawtooth' });
    },
    star: function () {
      [0, 1, 2, 3].forEach(function (i) {
        tone({ freq: 700 + i * 220, dur: 0.12, vol: 0.09, delay: i * 0.035, type: 'sine' });
      });
    },
    power: function () {
      [660, 880, 1320].forEach(function (f, i) {
        tone({ freq: f, dur: 0.18, vol: 0.1, delay: i * 0.07, type: 'triangle' });
      });
    },
    levelup: function () {
      [523, 659, 784, 1047].forEach(function (f, i) {
        tone({ freq: f, dur: 0.2, vol: 0.1, delay: i * 0.08, type: 'square' });
      });
    },
    over: function () {
      [440, 350, 262, 175].forEach(function (f, i) {
        tone({ freq: f, dur: 0.35, vol: 0.13, delay: i * 0.13, type: 'triangle' });
      });
    }
  };

  global.Sound = Sound;
})(window);
