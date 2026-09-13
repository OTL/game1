/* YoursCraft — 効果音（音声ファイルなし。WebAudio で作る） */
(function (global) {
  'use strict';
  var YC = global.YC || (global.YC = {});
  var B = YC.Blocks;

  function Audio2() {
    this.ctx = null;
    this.enabled = true;
    this.noise = null;
    this.master = null;
  }

  Audio2.prototype.init = function () {
    if (this.ctx) return;
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    try { this.ctx = new AC(); } catch (e) { this.enabled = false; return; }
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    /* ホワイトノイズを 1 秒ぶん作って使いまわす */
    var sr = this.ctx.sampleRate;
    var buf = this.ctx.createBuffer(1, sr, sr);
    var d = buf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
  };

  Audio2.prototype.resume = function () {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  };

  /* ノイズを帯域で切って短く鳴らす = 掘る音・足音の素 */
  Audio2.prototype._burst = function (o) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    var ctx = this.ctx, t = ctx.currentTime;
    var src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.playbackRate.value = o.rate || 1;
    var filt = ctx.createBiquadFilter();
    filt.type = o.type || 'bandpass';
    filt.frequency.value = o.freq;
    filt.Q.value = o.q || 1;
    if (o.sweep) {
      filt.frequency.setValueAtTime(o.freq, t);
      filt.frequency.exponentialRampToValueAtTime(Math.max(60, o.freq * o.sweep), t + o.dur);
    }
    var g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(o.gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0008, t + o.dur);
    src.connect(filt); filt.connect(g); g.connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + o.dur + 0.02);
  };

  Audio2.prototype._tone = function (freq, dur, gain, type, slide) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    var ctx = this.ctx, t = ctx.currentTime;
    var osc = ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + dur + 0.02);
  };

  var MAT = {
    stone: { freq: 900, q: 0.9, dur: 0.16, gain: 0.5, sweep: 0.5 },
    wood: { freq: 520, q: 1.2, dur: 0.15, gain: 0.5, sweep: 0.6 },
    grass: { freq: 1500, q: 0.7, dur: 0.14, gain: 0.35, sweep: 0.5 },
    gravel: { freq: 700, q: 0.6, dur: 0.17, gain: 0.45, sweep: 0.5 },
    sand: { freq: 1900, q: 0.5, dur: 0.16, gain: 0.3, sweep: 0.4 },
    glass: { freq: 2600, q: 2.5, dur: 0.2, gain: 0.4, sweep: 1.4 },
    wool: { freq: 420, q: 0.6, dur: 0.13, gain: 0.32, sweep: 0.6 },
    snow: { freq: 1200, q: 0.6, dur: 0.13, gain: 0.3, sweep: 0.5 },
    metal: { freq: 1500, q: 3.5, dur: 0.25, gain: 0.35, sweep: 1.6 },
    water: { freq: 800, q: 0.5, dur: 0.25, gain: 0.3, sweep: 0.4 }
  };

  function matOf(id) {
    var b = B.get(id);
    return (b && MAT[b.sound]) ? b.sound : 'stone';
  }

  Audio2.prototype.dig = function (id) {
    var m = MAT[matOf(id)];
    this._burst({ freq: m.freq, q: m.q, dur: m.dur, gain: m.gain, sweep: m.sweep, rate: 0.9 + Math.random() * 0.25 });
  };
  Audio2.prototype.place = function (id) {
    var m = MAT[matOf(id)];
    this._burst({ freq: m.freq * 0.8, q: m.q, dur: m.dur * 0.8, gain: m.gain * 0.9, sweep: 0.6, rate: 0.85 + Math.random() * 0.3 });
    this._tone(matOf(id) === 'metal' ? 660 : 180, 0.07, 0.12, 'triangle', 0.7);
  };
  Audio2.prototype.step = function (id) {
    var m = MAT[matOf(id)];
    this._burst({ freq: m.freq * 0.7, q: 0.8, dur: 0.08, gain: m.gain * 0.42, sweep: 0.5, rate: 0.8 + Math.random() * 0.4 });
  };
  Audio2.prototype.splash = function () {
    this._burst({ freq: 1200, q: 0.4, dur: 0.4, gain: 0.4, sweep: 0.25, rate: 1 });
  };
  Audio2.prototype.click = function () { this._tone(660, 0.05, 0.16, 'square', 1.5); };
  Audio2.prototype.open = function () { this._tone(440, 0.07, 0.12, 'triangle', 1.6); };

  YC.Audio = new Audio2();
})(typeof window !== 'undefined' ? window : globalThis);
