import { detectKey, type MusicalKey } from "./key";

/** Points per second of the zoomed, three-band waveform. */
export const DETAIL_RATE = 150;

export interface TrackAnalysis {
  bpm: number;
  /** Time of the first beat of the grid, in seconds. */
  firstBeat: number;
  /** Estimated musical key, or null when the track has no pitched content. */
  key: MusicalKey | null;
  /** Overview peaks for the whole-track waveform, 0..1. */
  overview: Float32Array;
  /** Per-band peaks at DETAIL_RATE points per second, 0..1. */
  low: Float32Array;
  mid: Float32Array;
  high: Float32Array;
}

const onePole = (cutoff: number, sampleRate: number) =>
  Math.exp((-2 * Math.PI * cutoff) / sampleRate);

const monoMix = (channels: Float32Array[]): Float32Array => {
  const out = new Float32Array(channels[0]?.length ?? 0);
  for (const data of channels) {
    for (let i = 0; i < data.length; i += 1) {
      out[i] += data[i] / channels.length;
    }
  }
  return out;
};

const overviewPeaks = (mono: Float32Array, samples: number) => {
  const peaks = new Float32Array(samples);
  const bucket = mono.length / samples;
  let loudest = 0;
  for (let i = 0; i < mono.length; i += 1) {
    const p = Math.floor(i / bucket);
    const a = Math.abs(mono[i]);
    if (a > peaks[p]) peaks[p] = a;
    if (a > loudest) loudest = a;
  }
  if (loudest > 0) for (let p = 0; p < samples; p += 1) peaks[p] /= loudest;
  return peaks;
};

const bandWaveform = (mono: Float32Array, sampleRate: number) => {
  const points = Math.ceil((mono.length / sampleRate) * DETAIL_RATE);
  const bucket = sampleRate / DETAIL_RATE;
  const low = new Float32Array(points);
  const mid = new Float32Array(points);
  const high = new Float32Array(points);
  const aLow = onePole(200, sampleRate);
  const aHigh = onePole(2500, sampleRate);
  let lp1 = 0;
  let lp2 = 0;
  let hp1 = 0;
  let max = 0;
  for (let i = 0; i < mono.length; i += 1) {
    const x = mono[i];
    lp1 = (1 - aLow) * x + aLow * lp1;
    lp2 = (1 - aLow) * lp1 + aLow * lp2;
    hp1 = (1 - aHigh) * x + aHigh * hp1;
    const p = Math.floor(i / bucket);
    const l = Math.abs(lp2);
    const m = Math.abs(hp1 - lp2);
    const h = Math.abs(x - hp1);
    if (l > low[p]) low[p] = l;
    if (m > mid[p]) mid[p] = m;
    if (h > high[p]) high[p] = h;
    const a = Math.abs(x);
    if (a > max) max = a;
  }
  if (max > 0) {
    for (let p = 0; p < points; p += 1) {
      low[p] = Math.min(1, (low[p] / max) * 1.3);
      mid[p] = Math.min(1, (mid[p] / max) * 1.6);
      high[p] = Math.min(1, (high[p] / max) * 2.2);
    }
  }
  return { high, low, mid };
};

const TARGET_ENVELOPE_RATE = 200;

/** Onset strength: positive change in low-band and full-band energy. */
const onsetEnvelope = (mono: Float32Array, sampleRate: number) => {
  const hop = Math.round(sampleRate / TARGET_ENVELOPE_RATE);
  const frames = Math.floor(mono.length / hop);
  const env = new Float32Array(frames);
  const a = onePole(150, sampleRate);
  let lp1 = 0;
  let lp2 = 0;
  let prevLow = 0;
  let prevFull = 0;
  for (let f = 0; f < frames; f += 1) {
    let low = 0;
    let full = 0;
    const start = f * hop;
    for (let i = start; i < start + hop; i += 1) {
      const x = mono[i];
      lp1 = (1 - a) * x + a * lp1;
      lp2 = (1 - a) * lp1 + a * lp2;
      low += lp2 * lp2;
      full += x * x;
    }
    low = Math.sqrt(low / hop);
    full = Math.sqrt(full / hop);
    env[f] = Math.max(0, low - prevLow) * 2 + Math.max(0, full - prevFull);
    prevLow = low;
    prevFull = full;
  }
  return { env, rate: sampleRate / hop };
};

const coarseTempo = (env: Float32Array, rate: number) => {
  let best = 120;
  let bestScore = -Infinity;
  for (let bpm = 60; bpm <= 200; bpm += 0.5) {
    const lag = (rate * 60) / bpm;
    const l0 = Math.floor(lag);
    const frac = lag - l0;
    let sum = 0;
    for (let i = 0; i + l0 + 1 < env.length; i += 1) {
      sum += env[i] * (env[i + l0] * (1 - frac) + env[i + l0 + 1] * frac);
    }
    // Prefer the common dance-music range when octaves are ambiguous.
    const weight = Math.exp(-0.5 * (Math.log2(bpm / 125) / 0.6) ** 2);
    const score = sum * weight;
    if (score > bestScore) {
      bestScore = score;
      best = bpm;
    }
  }
  while (best < 78) best *= 2;
  while (best > 180) best /= 2;
  return best;
};

const BINS = 96;

/** Folds the envelope by the beat period; a sharp peak means the tempo fits. */
const foldScore = (env: Float32Array, rate: number, bpm: number) => {
  const period = (rate * 60) / bpm;
  const hist = new Float32Array(BINS);
  for (let i = 0; i < env.length; i += 1) {
    const phase = (i % period) / period;
    hist[Math.floor(phase * BINS) % BINS] += env[i];
  }
  let peakBin = 0;
  let peak = -Infinity;
  for (let b = 0; b < BINS; b += 1) {
    const v = hist[b] + 0.5 * (hist[(b + 1) % BINS] + hist[(b + BINS - 1) % BINS]);
    if (v > peak) {
      peak = v;
      peakBin = b;
    }
  }
  return { peak, phaseSec: ((peakBin + 0.5) / BINS) * (60 / bpm) };
};

const detectTempo = (mono: Float32Array, sampleRate: number) => {
  const { env, rate } = onsetEnvelope(mono, sampleRate);
  const coarse = coarseTempo(env, rate);
  let best = { bpm: coarse, peak: -Infinity, phaseSec: 0 };
  for (let bpm = coarse - 2; bpm <= coarse + 2; bpm += 0.01) {
    const { peak, phaseSec } = foldScore(env, rate, bpm);
    if (peak > best.peak) best = { bpm, peak, phaseSec };
  }
  const rounded = Math.round(best.bpm);
  // Most produced music sits on a whole-number tempo.
  const bpm = Math.abs(best.bpm - rounded) <= 0.03 ? rounded : Math.round(best.bpm * 100) / 100;
  const beat = 60 / bpm;
  let firstBeat = best.phaseSec % beat;
  // A beat just before the start of the file belongs at (slightly below) zero.
  if (firstBeat > beat - 0.03) firstBeat -= beat;
  return { bpm, firstBeat };
};

/** Runs the full analysis synchronously; call it from a worker. */
export const analyzeChannels = (channels: Float32Array[], sampleRate: number): TrackAnalysis => {
  const mono = monoMix(channels);
  return {
    ...bandWaveform(mono, sampleRate),
    ...detectTempo(mono, sampleRate),
    key: detectKey(mono, sampleRate),
    overview: overviewPeaks(mono, 1200),
  };
};
