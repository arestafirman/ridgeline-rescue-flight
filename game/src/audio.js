// audio.js — procedural sound only: a WebAudio engine hum tied to throttle,
// wind noise tied to airspeed, and short beeps for rings, drops and landing.
// No audio files, no network, nothing to load.

export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let windSource = null;
  let windGain = null;
  let windFilter = null;
  let muted = false;
  let started = false;

  function start() {
    if (started) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      ctx = new AudioCtx();
    } catch {
      return;
    }
    started = true;

    // Engine: two detuned sawtooths through a low-pass, pitch follows throttle.
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 70;
    const engineOsc2 = ctx.createOscillator();
    engineOsc2.type = 'sawtooth';
    engineOsc2.frequency.value = 71.5;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0.0;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    engineOsc.connect(engineFilter);
    engineOsc2.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(ctx.destination);
    engineOsc.start();
    engineOsc2.start();

    // Wind: looped noise buffer through a band-pass.
    const len = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    windSource = ctx.createBufferSource();
    windSource.buffer = buffer;
    windSource.loop = true;
    windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 700;
    windFilter.Q.value = 0.6;
    windGain = ctx.createGain();
    windGain.gain.value = 0.0;
    windSource.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(ctx.destination);
    windSource.start();
  }

  function setFlight(throttle, speed) {
    if (!started || !ctx) return;
    const t = ctx.currentTime;
    engineOsc.frequency.setTargetAtTime(58 + throttle * 95, t, 0.1);
    engineGain.gain.setTargetAtTime(muted ? 0 : 0.05 + throttle * 0.05, t, 0.1);
    windGain.gain.setTargetAtTime(muted ? 0 : Math.min(0.12, speed * 0.0016), t, 0.2);
    windFilter.frequency.setTargetAtTime(500 + speed * 14, t, 0.2);
  }

  function beep(freq, seconds) {
    if (!started || !ctx || muted) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.16, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + seconds);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + seconds);
  }

  function thud() {
    if (!started || !ctx || muted) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(38, ctx.currentTime + 0.18);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.22);
  }

  return {
    start,
    setFlight,
    beep,
    thud,
    toggleMute() {
      muted = !muted;
      return muted;
    },
    get muted() {
      return muted;
    },
  };
}
