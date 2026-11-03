export interface MusicalKey {
  /** Pitch class of the tonic, 0 = C. */
  tonic: number;
  mode: "major" | "minor";
}

const NOTE_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

// Krumhansl–Kessler key profiles.
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

export const keyName = (key: MusicalKey) =>
  `${NOTE_NAMES[key.tonic]}${key.mode === "minor" ? "m" : ""}`;

/** Camelot wheel position, e.g. 8A for A minor and 8B for C major. */
export const camelot = (key: MusicalKey) => {
  const major = key.mode === "major" ? key.tonic : (key.tonic + 3) % 12;
  return { letter: key.mode === "minor" ? "A" : "B", number: (((major * 7) % 12) + 7) % 12 + 1 };
};

export const camelotLabel = (key: MusicalKey) => {
  const c = camelot(key);
  return `${c.number}${c.letter}`;
};

/** The key heard after a pitch change, without key lock. */
export const shiftKey = (key: MusicalKey, semitones: number): MusicalKey => ({
  mode: key.mode,
  tonic: (((key.tonic + semitones) % 12) + 12) % 12,
});

export const semitonesForPitch = (pitchPercent: number) =>
  Math.round(12 * Math.log2(1 + pitchPercent / 100));

/** Same key, relative major/minor, or one step around the Camelot wheel. */
export const keysCompatible = (a: MusicalKey, b: MusicalKey) => {
  const ca = camelot(a);
  const cb = camelot(b);
  if (ca.number === cb.number) return true;
  if (ca.letter !== cb.letter) return false;
  const diff = (ca.number - cb.number + 12) % 12;
  return diff === 1 || diff === 11;
};

const fft = (re: Float64Array, im: Float64Array) => {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wr = Math.cos(angle);
    const wi = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k += 1) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const next = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = next;
      }
    }
  }
};

const correlate = (chroma: number[], profile: number[], rotation: number) => {
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < 12; i += 1) {
    sx += chroma[(i + rotation) % 12];
    sy += profile[i];
  }
  const mx = sx / 12;
  const my = sy / 12;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < 12; i += 1) {
    const x = chroma[(i + rotation) % 12] - mx;
    const y = profile[i] - my;
    num += x * y;
    dx += x * x;
    dy += y * y;
  }
  return num / Math.sqrt(dx * dy || 1);
};

const FRAME = 8192;

/** Estimates the key from a pitch-class profile of the whole track. */
export const detectKey = (mono: Float32Array, sampleRate: number): MusicalKey | null => {
  const factor = Math.max(1, Math.round(sampleRate / 11025));
  const rate = sampleRate / factor;
  const length = Math.floor(mono.length / factor);
  const down = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    let sum = 0;
    for (let j = 0; j < factor; j += 1) sum += mono[i * factor + j];
    down[i] = sum / factor;
  }

  const window = new Float64Array(FRAME);
  for (let i = 0; i < FRAME; i += 1) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1));
  const binClass = new Int8Array(FRAME / 2).fill(-1);
  for (let k = 1; k < FRAME / 2; k += 1) {
    const f = (k * rate) / FRAME;
    if (f < 50 || f > 2000) continue;
    const midi = 69 + 12 * Math.log2(f / 440);
    binClass[k] = ((Math.round(midi) % 12) + 12) % 12;
  }

  const chroma = Array<number>(12).fill(0);
  const frame = Array<number>(12);
  const re = new Float64Array(FRAME);
  const im = new Float64Array(FRAME);
  for (let start = 0; start + FRAME <= length; start += FRAME / 2) {
    for (let i = 0; i < FRAME; i += 1) {
      re[i] = down[start + i] * window[i];
      im[i] = 0;
    }
    fft(re, im);
    frame.fill(0);
    for (let k = 1; k < FRAME / 2; k += 1) {
      const pc = binClass[k];
      if (pc >= 0) frame[pc] += Math.sqrt(re[k] * re[k] + im[k] * im[k]);
    }
    // Normalise per frame so loud sections don't dominate the profile.
    const max = Math.max(...frame);
    if (max > 1e-6) for (let i = 0; i < 12; i += 1) chroma[i] += frame[i] / max;
  }
  if (chroma.every((v) => v === 0)) return null;

  let best: MusicalKey = { mode: "major", tonic: 0 };
  let bestScore = -Infinity;
  for (let tonic = 0; tonic < 12; tonic += 1) {
    for (const [mode, profile] of [["major", MAJOR], ["minor", MINOR]] as const) {
      const score = correlate(chroma, profile, tonic);
      if (score > bestScore) {
        bestScore = score;
        best = { mode, tonic };
      }
    }
  }
  return best;
};
