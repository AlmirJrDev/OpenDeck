const SAMPLE_RATE = 44100;

export interface DemoSpec {
  title: string;
  artist: string;
  bpm: number;
  /** Root note of the bass line, in Hz. */
  root: number;
  bars: number;
  /** Semitone offsets for each bar of a four-bar bass phrase. */
  progression: number[];
}

export const DEMO_SPECS: DemoSpec[] = [
  { artist: "OpenDeck Demo", bars: 48, bpm: 124, progression: [0, 0, 3, -2], root: 55, title: "Warehouse Drive" },
  { artist: "OpenDeck Demo", bars: 48, bpm: 128, progression: [0, 5, 3, 0], root: 49, title: "Neon Pulse" },
  { artist: "OpenDeck Demo", bars: 48, bpm: 120, progression: [0, -4, -2, 0], root: 61.7, title: "Late Night Groove" },
];

const noiseBuffer = (ctx: BaseAudioContext) => {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
};

const TAIL = 0.6;

/** Renders one bar plus its decay tail. */
const renderBar = async (bpm: number, section: number, freq: number): Promise<AudioBuffer> => {
  const beat = 60 / bpm;
  const ctx = new OfflineAudioContext(2, Math.ceil((4 * beat + TAIL) * SAMPLE_RATE), SAMPLE_RATE);
  const noise = noiseBuffer(ctx);
  const master = ctx.createGain();
  master.gain.value = 0.8;
  master.connect(ctx.destination);

  const kick = (t: number) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + 0.4);
  };

  const hat = (t: number, level: number, length: number) => {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + length);
    src.connect(hp).connect(g).connect(master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + length + 0.01);
  };

  const clap = (t: number) => {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1500;
    bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    src.connect(bp).connect(g).connect(master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + 0.2);
  };

  const bass = (t: number, freq: number, length: number) => {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = freq;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(200, t + length);
    lp.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.35, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + length);
    osc.connect(lp).connect(g).connect(master);
    osc.start(t);
    osc.stop(t + length + 0.02);
  };

  const stab = (t: number, freq: number) => {
    for (const ratio of [1, 1.19, 1.5]) {
      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.value = freq * 4 * ratio;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 2200;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.06, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      osc.connect(lp).connect(g).connect(master);
      osc.start(t);
      osc.stop(t + 0.3);
    }
  };

  for (let b = 0; b < 4; b += 1) {
    const t = b * beat;
    const breakdown = section === 3;
    if (!breakdown) kick(t);
    if (section > 0) hat(t + beat / 2, 0.35, 0.05);
    if (section > 1) hat(t + beat / 4, 0.12, 0.03);
    if (section > 0 && (b === 1 || b === 3)) clap(t);
    if (section !== 0) bass(t + beat / 2, freq, beat / 2.2);
    if ((breakdown || section > 3) && b % 2 === 0) stab(t + beat * 0.75, freq);
  }

  return ctx.startRendering();
};

/**
 * Renders a procedural house track, so the app works without files. Each
 * distinct bar is rendered once and overlap-added into place: scheduling the
 * whole track in one offline graph is far slower.
 */
export const renderDemoTrack = async (spec: DemoSpec): Promise<AudioBuffer> => {
  const barLength = (4 * 60) / spec.bpm;
  const length = Math.ceil((spec.bars * barLength + TAIL) * SAMPLE_RATE);
  const out = new AudioBuffer({ length, numberOfChannels: 2, sampleRate: SAMPLE_RATE });
  const cache = new Map<string, Promise<AudioBuffer>>();

  for (let bar = 0; bar < spec.bars; bar += 1) {
    const section = Math.floor(bar / 8);
    const semis = spec.progression[bar % spec.progression.length];
    const key = `${section}:${semis}`;
    let rendered = cache.get(key);
    if (!rendered) {
      rendered = renderBar(spec.bpm, section, spec.root * 2 ** (semis / 12));
      cache.set(key, rendered);
    }
    const audio = await rendered;
    const offset = Math.round(bar * barLength * SAMPLE_RATE);
    for (let c = 0; c < 2; c += 1) {
      const src = audio.getChannelData(c);
      const dst = out.getChannelData(c);
      const n = Math.min(src.length, dst.length - offset);
      for (let i = 0; i < n; i += 1) dst[offset + i] += src[i];
    }
  }
  return out;
};
