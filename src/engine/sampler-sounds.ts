const SR = 44100;

const offline = (seconds: number, channels = 2) => new OfflineAudioContext(channels, Math.ceil(seconds * SR), SR);

const noiseBuffer = (ctx: BaseAudioContext, seconds = 2) => {
  const b = ctx.createBuffer(1, Math.ceil(seconds * ctx.sampleRate), ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1;
  return b;
};

const envelope = (param: AudioParam, at: number, peak: number, attack: number, hold: number, release: number) => {
  param.setValueAtTime(0, at);
  param.linearRampToValueAtTime(peak, at + attack);
  param.setValueAtTime(peak, at + attack + hold);
  param.linearRampToValueAtTime(0, at + attack + hold + release);
};

const distortion = (ctx: BaseAudioContext, amount: number) => {
  const shaper = ctx.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i += 1) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * amount);
  }
  shaper.curve = curve;
  return shaper;
};

const airHorn = () => {
  const ctx = offline(1.5);
  const out = ctx.createGain();
  out.gain.value = 0.35;
  const tone = Object.assign(ctx.createBiquadFilter(), { type: "bandpass" as const });
  tone.frequency.value = 1400;
  tone.Q.value = 0.7;
  tone.connect(distortion(ctx, 3)).connect(out).connect(ctx.destination);
  const blasts: [number, number][] = [[0, 0.16], [0.24, 0.16], [0.48, 0.85]];
  for (const [at, length] of blasts) {
    const amp = ctx.createGain();
    envelope(amp.gain, at, 1, 0.01, length, 0.05);
    amp.connect(tone);
    for (const f of [466, 587, 698, 932]) {
      const osc = new OscillatorNode(ctx, { detune: (Math.random() - 0.5) * 12, frequency: f, type: "sawtooth" });
      osc.frequency.setValueAtTime(f * 1.04, at);
      osc.frequency.exponentialRampToValueAtTime(f, at + 0.05);
      osc.connect(amp);
      osc.start(at);
      osc.stop(at + length + 0.1);
    }
  }
  return ctx.startRendering();
};

/** A two-second siren whose phase closes exactly, so it loops without a click. */
const siren = async () => {
  const seconds = 2;
  const buffer = new AudioBuffer({ length: seconds * SR, numberOfChannels: 2, sampleRate: SR });
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);
  let phase = 0;
  for (let i = 0; i < left.length; i += 1) {
    const t = i / SR;
    const f = 900 + 380 * Math.sin(2 * Math.PI * 1 * t);
    phase += (2 * Math.PI * f) / SR;
    const v = 0.3 * (Math.sin(phase) + 0.3 * Math.sin(3 * phase) + 0.15 * Math.sin(5 * phase));
    left[i] = v;
    right[i] = v;
  }
  return buffer;
};

const laser = () => {
  const ctx = offline(0.8);
  const out = ctx.createGain();
  out.gain.value = 0.25;
  out.connect(ctx.destination);
  for (const at of [0, 0.22, 0.44]) {
    const osc = new OscillatorNode(ctx, { frequency: 2200, type: "square" });
    osc.frequency.setValueAtTime(2200, at);
    osc.frequency.exponentialRampToValueAtTime(110, at + 0.2);
    const amp = ctx.createGain();
    envelope(amp.gain, at, 1, 0.002, 0.12, 0.08);
    osc.connect(amp).connect(out);
    osc.start(at);
    osc.stop(at + 0.22);
  }
  return ctx.startRendering();
};

const riser = () => {
  const seconds = 4;
  const ctx = offline(seconds + 0.1);
  const noise = new AudioBufferSourceNode(ctx, { buffer: noiseBuffer(ctx, seconds + 0.1) });
  const band = new BiquadFilterNode(ctx, { Q: 2.5, frequency: 300, type: "bandpass" });
  band.frequency.setValueAtTime(300, 0);
  band.frequency.exponentialRampToValueAtTime(9000, seconds);
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.02, 0);
  amp.gain.exponentialRampToValueAtTime(0.9, seconds);
  amp.gain.linearRampToValueAtTime(0, seconds + 0.05);
  noise.connect(band).connect(amp).connect(ctx.destination);
  const sweep = new OscillatorNode(ctx, { frequency: 180, type: "sawtooth" });
  sweep.frequency.exponentialRampToValueAtTime(1400, seconds);
  const sweepAmp = ctx.createGain();
  sweepAmp.gain.setValueAtTime(0.01, 0);
  sweepAmp.gain.exponentialRampToValueAtTime(0.12, seconds);
  sweepAmp.gain.linearRampToValueAtTime(0, seconds + 0.05);
  sweep.connect(sweepAmp).connect(ctx.destination);
  noise.start();
  sweep.start();
  return ctx.startRendering();
};

const impact = () => {
  const ctx = offline(2.5);
  const boom = new OscillatorNode(ctx, { frequency: 90, type: "sine" });
  boom.frequency.exponentialRampToValueAtTime(32, 1.2);
  const boomAmp = ctx.createGain();
  boomAmp.gain.setValueAtTime(1, 0);
  boomAmp.gain.exponentialRampToValueAtTime(0.001, 2.3);
  boom.connect(distortion(ctx, 1.6)).connect(boomAmp).connect(ctx.destination);
  const noise = new AudioBufferSourceNode(ctx, { buffer: noiseBuffer(ctx, 1) });
  const lp = new BiquadFilterNode(ctx, { frequency: 2500, type: "lowpass" });
  lp.frequency.exponentialRampToValueAtTime(150, 0.6);
  const noiseAmp = ctx.createGain();
  noiseAmp.gain.setValueAtTime(0.7, 0);
  noiseAmp.gain.exponentialRampToValueAtTime(0.001, 0.7);
  noise.connect(lp).connect(noiseAmp).connect(ctx.destination);
  boom.start();
  boom.stop(2.4);
  noise.start();
  return ctx.startRendering();
};

const rewind = () => {
  const ctx = offline(1.3);
  const out = ctx.createGain();
  out.gain.value = 0.3;
  out.connect(ctx.destination);
  // A record spun backwards: pitch races up, wobbling, then drops away.
  const wobble = new OscillatorNode(ctx, { frequency: 11 });
  const wobbleDepth = new GainNode(ctx, { gain: 120 });
  wobble.connect(wobbleDepth);
  for (const ratio of [1, 1.5, 2.01]) {
    const osc = new OscillatorNode(ctx, { frequency: 150 * ratio, type: "sawtooth" });
    osc.frequency.setValueAtTime(150 * ratio, 0);
    osc.frequency.exponentialRampToValueAtTime(1600 * ratio, 0.8);
    osc.frequency.exponentialRampToValueAtTime(60 * ratio, 1.2);
    wobbleDepth.connect(osc.detune);
    const amp = ctx.createGain();
    envelope(amp.gain, 0, 0.5, 0.05, 0.9, 0.3);
    osc.connect(new BiquadFilterNode(ctx, { frequency: 3000, type: "lowpass" })).connect(amp).connect(out);
    osc.start();
  }
  wobble.start();
  return ctx.startRendering();
};

const snareRoll = () => {
  const seconds = 2.2;
  const ctx = offline(seconds + 0.3);
  const noise = noiseBuffer(ctx, 0.3);
  const beat = 60 / 128;
  const hits: number[] = [];
  let t = 0;
  for (const [division, beats] of [[2, 1], [4, 2], [8, 1], [16, 0.5]] as const) {
    for (let i = 0; i < division * beats && t < seconds; i += 1) {
      hits.push(t);
      t += beat / division;
    }
  }
  hits.forEach((at, index) => {
    const level = 0.15 + (0.7 * index) / hits.length;
    const src = new AudioBufferSourceNode(ctx, { buffer: noise });
    const bp = new BiquadFilterNode(ctx, { Q: 0.9, frequency: 1800, type: "bandpass" });
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(level, at);
    amp.gain.exponentialRampToValueAtTime(0.001, at + 0.14);
    src.connect(bp).connect(amp).connect(ctx.destination);
    src.start(at);
    src.stop(at + 0.15);
    const body = new OscillatorNode(ctx, { frequency: 190, type: "triangle" });
    const bodyAmp = ctx.createGain();
    bodyAmp.gain.setValueAtTime(level * 0.6, at);
    bodyAmp.gain.exponentialRampToValueAtTime(0.001, at + 0.08);
    body.connect(bodyAmp).connect(ctx.destination);
    body.start(at);
    body.stop(at + 0.1);
  });
  return ctx.startRendering();
};

const scratch = () => {
  const seconds = 0.5;
  const ctx = offline(seconds);
  const out = ctx.createGain();
  out.gain.value = 0.35;
  out.connect(ctx.destination);
  // Two back-and-forth strokes per loop.
  const pitch = (param: AudioParam, base: number) => {
    param.setValueAtTime(base, 0);
    param.linearRampToValueAtTime(base * 3, 0.1);
    param.linearRampToValueAtTime(base * 0.6, 0.25);
    param.linearRampToValueAtTime(base * 3.2, 0.35);
    param.linearRampToValueAtTime(base, 0.5);
  };
  const osc = new OscillatorNode(ctx, { type: "sawtooth" });
  pitch(osc.frequency, 220);
  const noise = new AudioBufferSourceNode(ctx, { buffer: noiseBuffer(ctx, seconds) });
  const band = new BiquadFilterNode(ctx, { Q: 3, type: "bandpass" });
  pitch(band.frequency, 900);
  const amp = ctx.createGain();
  for (const at of [0, 0.25]) envelope(amp.gain, at, 1, 0.01, 0.2, 0.03);
  osc.connect(amp);
  noise.connect(band).connect(amp);
  amp.connect(out);
  osc.start();
  noise.start();
  return ctx.startRendering();
};

/** Scales a rendered sound so every pad peaks at the same level. */
const normalized = (render: () => Promise<AudioBuffer>) => async () => {
  const buffer = await render();
  let peak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c += 1) {
    for (const v of buffer.getChannelData(c)) peak = Math.max(peak, Math.abs(v));
  }
  if (peak > 0) {
    const scale = 0.85 / peak;
    for (let c = 0; c < buffer.numberOfChannels; c += 1) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < data.length; i += 1) data[i] *= scale;
    }
  }
  return buffer;
};

export const DEFAULT_SOUNDS = [
  { mode: "one-shot", name: "Air Horn", render: normalized(airHorn) },
  { mode: "loop", name: "Siren", render: normalized(siren) },
  { mode: "one-shot", name: "Laser", render: normalized(laser) },
  { mode: "one-shot", name: "Riser", render: normalized(riser) },
  { mode: "one-shot", name: "Impact", render: normalized(impact) },
  { mode: "one-shot", name: "Rewind", render: normalized(rewind) },
  { mode: "one-shot", name: "Snare Roll", render: normalized(snareRoll) },
  { mode: "hold", name: "Scratch", render: normalized(scratch) },
] as const;
