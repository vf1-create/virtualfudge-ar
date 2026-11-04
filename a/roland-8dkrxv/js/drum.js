// A small 808-style drum machine. Every sound is synthesized live with Web Audio:
// no samples, no audio files. The AudioContext is only created inside a tap/click,
// so nothing can play before the visitor touches something (and iPhone allows it).

export const ROWS = [
  { id: 'bd', name: 'Kick', short: 'BD' },
  { id: 'sd', name: 'Snare', short: 'SD' },
  { id: 'cp', name: 'Clap', short: 'CP' },
  { id: 'ch', name: 'Closed hat', short: 'CH' },
  { id: 'oh', name: 'Open hat', short: 'OH' },
  { id: 'cb', name: 'Cowbell', short: 'CB' },
];

// Three original patterns in an early-80s style. Written for this demo; not taken from any record.
const pat = (o) => Object.fromEntries(ROWS.map((r) => [r.id, Array.from({ length: 16 }, (_, i) => (o[r.id] || []).includes(i))]));
export const PRESETS = [
  { name: 'West 14th', bpm: 108, steps: pat({ bd: [0, 6, 10, 13], sd: [4, 12], cp: [12], ch: [0, 2, 4, 6, 8, 10, 12, 14], oh: [15], cb: [3, 9] }) },
  { name: 'Late Night', bpm: 90, steps: pat({ bd: [0, 3, 8, 14], sd: [4, 12], cp: [12, 13], ch: [0, 2, 4, 5, 6, 8, 10, 12, 14], oh: [11], cb: [] }) },
  { name: 'Roller Rink', bpm: 122, steps: pat({ bd: [0, 4, 8, 12], sd: [], cp: [4, 12], ch: [2, 6, 10, 14], oh: [7, 15], cb: [1, 5, 9, 11, 13] }) },
];

export class Drum {
  constructor() {
    this.ctx = null;
    this.bpm = 108;
    this.steps = pat({});
    this.playing = false;
    this.step = 0;
    this.onStep = () => {};
    this.queue = [];
  }

  // call from inside a user gesture
  unlock() {
    if (!this.ctx) {
      // iPhone: play through the ring/silent switch like a music app would (iOS 17+)
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC({ latencyHint: 'interactive' });
      const c = this.ctx;
      this.out = c.createGain(); this.out.gain.value = 0.8;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -10; comp.ratio.value = 4;
      this.out.connect(comp).connect(c.destination);
      const len = c.sampleRate;
      this.noise = c.createBuffer(1, len, c.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      window.__audio = { created: performance.now(), hits: 0 };
    }
    if (this.ctx.state !== 'running') this.ctx.resume();
    // a silent one-sample buffer, played inside the gesture, wakes up older iPhones
    const b = this.ctx.createBufferSource(); b.buffer = this.ctx.createBuffer(1, 1, 22050); b.connect(this.ctx.destination); b.start();
    return this.ctx;
  }

  env(g, t, peak, decay, attack = 0.001) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }
  noiseSrc(t, dur) {
    const s = this.ctx.createBufferSource(); s.buffer = this.noise;
    s.start(t, Math.random() * 0.5); s.stop(t + dur);
    return s;
  }

  hit(id, t = this.ctx.currentTime) {
    const c = this.ctx;
    if (window.__audio) window.__audio.hits++;
    if (id === 'bd') {
      const o = c.createOscillator(); const g = c.createGain();
      o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(49, t + 0.07);
      this.env(g, t, 1, 0.55);
      o.connect(g).connect(this.out); o.start(t); o.stop(t + 0.6);
    } else if (id === 'sd') {
      for (const f of [180, 330]) {
        const o = c.createOscillator(); const g = c.createGain(); o.type = 'triangle'; o.frequency.value = f;
        this.env(g, t, 0.35, 0.11); o.connect(g).connect(this.out); o.start(t); o.stop(t + 0.15);
      }
      const n = this.noiseSrc(t, 0.25); const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800;
      const g = c.createGain(); this.env(g, t, 0.55, 0.17); n.connect(hp).connect(g).connect(this.out);
    } else if (id === 'cp') {
      const n = this.noiseSrc(t, 0.35); const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 1.4;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t);
      // three quick slaps, then the room tail
      for (const k of [0, 0.011, 0.022]) { g.gain.setValueAtTime(0.9, t + k); g.gain.exponentialRampToValueAtTime(0.08, t + k + 0.009); }
      g.gain.setValueAtTime(0.7, t + 0.032); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      n.connect(bp).connect(g).connect(this.out);
    } else if (id === 'ch' || id === 'oh') {
      if (this.openHat) { const og = this.openHat; og.gain.cancelScheduledValues(t); og.gain.setTargetAtTime(0.0001, t, 0.008); this.openHat = null; }
      const g = c.createGain(); const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 10000; bp.Q.value = 0.8;
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000;
      const dur = id === 'ch' ? 0.05 : 0.38;
      for (const f of [205.3, 304.4, 369.6, 522.7, 540, 800]) {
        const o = c.createOscillator(); o.type = 'square'; o.frequency.value = f * 1.2; o.connect(bp); o.start(t); o.stop(t + dur + 0.05);
      }
      this.env(g, t, id === 'ch' ? 0.32 : 0.28, dur);
      bp.connect(hp).connect(g).connect(this.out);
      if (id === 'oh') this.openHat = g;
    } else if (id === 'cb') {
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2640; bp.Q.value = 1.2;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.002); g.gain.exponentialRampToValueAtTime(0.15, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      for (const f of [540, 800]) { const o = c.createOscillator(); o.type = 'square'; o.frequency.value = f; o.connect(bp); o.start(t); o.stop(t + 0.32); }
      bp.connect(g).connect(this.out);
    }
  }

  start() {
    if (!this.ctx || this.playing) return;
    this.playing = true;
    this.step = 0;
    this.next = this.ctx.currentTime + 0.06;
    this.timer = setInterval(() => this.schedule(), 25);
    this.schedule();
    const run = (this.run = (this.run || 0) + 1); // a quick stop/start retires the previous draw loop
    const draw = () => {
      if (!this.playing || run !== this.run) return;
      const now = this.ctx.currentTime;
      while (this.queue.length && this.queue[0].t <= now) this.onStep(this.queue.shift().step);
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  }
  schedule() {
    const ahead = this.ctx.currentTime + 0.12;
    while (this.next < ahead) {
      for (const r of ROWS) if (this.steps[r.id][this.step]) this.hit(r.id, this.next);
      this.queue.push({ step: this.step, t: this.next });
      this.next += 60 / this.bpm / 4;
      this.step = (this.step + 1) % 16;
    }
  }
  stop() {
    this.playing = false;
    clearInterval(this.timer);
    this.queue = [];
    this.onStep(-1);
  }
}
