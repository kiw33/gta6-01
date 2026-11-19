// Solmar Heat — every sound is synthesized with WebAudio. No audio files,
// no network: oscillators and filtered noise, built the first time the
// player presses a key or clicks (browsers demand a gesture first).
export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineNodes = null;
    this.sirenNodes = null;
    this.sirenTimer = 0;
  }

  // Call from any user gesture. Safe to call twice; safe headless.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.5;
  }

  _noiseBuffer(seconds = 1) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  // A short filtered noise burst: the pistol.
  shoot() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(0.18);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1800;
    filter.Q.value = 0.8;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.9, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t);
    src.stop(t + 0.18);
  }

  // A low thud for bumps and rams.
  thud(strength = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.7 * strength, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.18);
  }

  // A two-note pickup blip.
  blip(freq = 660) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.setValueAtTime(freq * 1.5, t + 0.09);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.16, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.24);
  }

  // The mission-complete jingle: four rising notes.
  jingle() {
    if (!this.ctx) return;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const t = this.ctx.currentTime + i * 0.11;
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.connect(gain).connect(this.master);
      osc.start(t);
      osc.stop(t + 0.32);
    });
  }

  // The engine: a sawtooth through a low-pass, pitch following speed.
  startEngine() {
    if (!this.ctx || this.engineNodes) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 55;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.0;
    osc.connect(filter).connect(gain).connect(this.master);
    osc.start();
    this.engineNodes = { osc, filter, gain };
  }

  setEngine(speed01, on) {
    if (!this.engineNodes) return;
    const t = this.ctx.currentTime;
    this.engineNodes.osc.frequency.setTargetAtTime(52 + speed01 * 130, t, 0.08);
    this.engineNodes.filter.frequency.setTargetAtTime(380 + speed01 * 900, t, 0.08);
    this.engineNodes.gain.gain.setTargetAtTime(on ? 0.05 + speed01 * 0.07 : 0.0, t, 0.1);
  }

  stopEngine() {
    if (!this.engineNodes) return;
    try {
      this.engineNodes.osc.stop();
    } catch {
      // Already stopped.
    }
    this.engineNodes = null;
  }

  // A two-tone siren that wails while the heat is on.
  startSiren() {
    if (!this.ctx || this.sirenNodes) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 750;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.045;
    osc.connect(gain).connect(this.master);
    osc.start();
    this.sirenNodes = { osc, gain };
    this.sirenTimer = 0;
  }

  updateSiren(dt) {
    if (!this.sirenNodes) return;
    this.sirenTimer += dt;
    const high = Math.floor(this.sirenTimer / 0.42) % 2 === 0;
    this.sirenNodes.osc.frequency.setTargetAtTime(high ? 950 : 700, this.ctx.currentTime, 0.05);
  }

  stopSiren() {
    if (!this.sirenNodes) return;
    try {
      this.sirenNodes.osc.stop();
    } catch {
      // Already stopped.
    }
    this.sirenNodes = null;
  }
}
