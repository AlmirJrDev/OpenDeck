/**
 * Beat FX in the style of a DJ mixer: one effect slot per deck, tempo-synced
 * to the deck's beat length. Only the selected effect's graph exists; picking
 * another one fades the old graph out and builds the new one.
 */

export type FxType =
  | "delay"
  | "echo"
  | "spiral"
  | "reverb"
  | "revdelay"
  | "mtdelay"
  | "upecho"
  | "downecho"
  | "trans"
  | "pan"
  | "filter"
  | "flanger"
  | "phaser"
  | "sliproll"
  | "roll"
  | "revroll"
  | "robot"
  | "pitch"
  | "enigmajet"
  | "mobiussaw"
  | "mobiustri"
  | "lowcutecho"
  | "pingpong"
  | "helix"
  | "vinylbrake"
  | "stretch"
  | "bpfecho"
  | "noise"
  | "spiralup"
  | "reverbup"
  | "hpfecho"
  | "lpfecho"
  | "crushecho"
  | "spiraldown"
  | "reverbdown";

export interface FxInfo {
  type: FxType;
  label: string;
  hint: string;
  /** What the beat buttons set: a length in beats, a sweep in bars, or nothing. */
  timing: "beats" | "bars" | "none";
  /** Knob caption when it does something other than set the level. */
  knob?: string;
}

const info = (type: FxType, label: string, timing: FxInfo["timing"], hint: string, knob?: string): FxInfo => ({
  hint,
  knob,
  label,
  timing,
  type,
});

/** The effect menu, in display order, split into groups by a divider. */
export const FX_GROUPS: FxInfo[][] = [
  [
    info("delay", "Delay", "beats", "A single tempo-synced repeat"),
    info("echo", "Echo", "beats", "Tempo-synced echo with darkening repeats"),
    info("spiral", "Spiral", "beats", "Long smeared echo; changing beats bends the pitch"),
    info("reverb", "Reverb", "none", "Room tail that rings out after switching off"),
    info("revdelay", "Rev Delay", "beats", "Echoes of the last beats played backwards"),
    info("mtdelay", "MT Delay", "beats", "Four taps spread across the stereo field"),
    info("upecho", "Up Echo", "beats", "Each repeat rises in pitch"),
    info("downecho", "Down Echo", "beats", "Each repeat falls in pitch"),
    info("trans", "Trans", "beats", "Cuts the sound on and off on the beat"),
    info("pan", "Pan", "beats", "Moves the sound left and right on the beat"),
    info("filter", "Filter", "bars", "Resonant filter sweep; beats set the sweep in bars"),
    info("flanger", "Flanger", "bars", "Jet sweep; beats set the sweep in bars"),
    info("phaser", "Phaser", "bars", "Swirling notches; beats set the sweep in bars"),
    info("sliproll", "Slip Roll", "beats", "Roll that grabs fresh audio every bar"),
    info("roll", "Roll", "beats", "Repeats the next beats as a loop while on"),
    info("revroll", "Rev Roll", "beats", "Repeats the last beats backwards as a loop"),
    info("robot", "Robot", "none", "Metallic ring-modulated voice"),
    info("pitch", "Pitch", "none", "Shifts the pitch up to an octave either way", "Pitch"),
    info("enigmajet", "Enigma Jet", "bars", "Resonant jet with a sweeping band"),
    info("mobiussaw", "Mobius Saw", "bars", "Endless rising flanger sweep"),
    info("mobiustri", "Mobius Tri", "bars", "Stereo flanger and phaser, up and down"),
    info("lowcutecho", "Low Cut Echo", "beats", "Thins out the track while an echo builds"),
  ],
  [
    info("pingpong", "Ping Pong", "beats", "Echo bouncing between left and right"),
    info("helix", "Helix", "beats", "Holds the next beats and repeats them over the track"),
    info("vinylbrake", "Vinyl Brake", "beats", "Slows the deck to a stop over the chosen beats"),
    info("stretch", "Stretch", "beats", "Half-speed playback in tempo-length slices"),
  ],
  [
    info("bpfecho", "BPF Echo", "beats", "Echo through a band-pass filter"),
    info("noise", "Noise", "bars", "Filtered white noise sweep; level sets the amount"),
    info("spiralup", "Spiral Up", "beats", "Spiral echo rising in pitch"),
    info("reverbup", "Reverb Up", "bars", "Reverb that thins out over the chosen bars"),
    info("hpfecho", "HPF Echo", "beats", "Echo that gets thinner with each repeat"),
    info("lpfecho", "LPF Echo", "beats", "Echo that gets darker with each repeat"),
    info("crushecho", "Crush Echo", "beats", "Echo that gets crunchier with each repeat"),
    info("spiraldown", "Spiral Down", "beats", "Spiral echo falling in pitch"),
    info("reverbdown", "Reverb Down", "bars", "Reverb that darkens over the chosen bars"),
  ],
];

export const FX_INFO = Object.fromEntries(FX_GROUPS.flat().map((fx) => [fx.type, fx])) as Record<FxType, FxInfo>;
export const FX_BEATS = [0.25, 0.5, 1, 2, 4];

export interface FxState {
  type: FxType;
  /** Delay, gate and roll length in beats; sweeps in bars. */
  beats: number;
  /** Wet level or depth, 0..1 (pitch amount for Pitch). */
  level: number;
  on: boolean;
}

export const DEFAULT_FX: FxState = { beats: 0.5, level: 0.6, on: false, type: "echo" };

/** Semitones the Pitch effect shifts by for a knob value. */
export const pitchSemitones = (level: number) => Math.round((level * 2 - 1) * 12);

const RAMP = 0.012;
const MAX_LEN = 8;

// ---------------------------------------------------------------------------
// Building blocks

const gain = (ctx: BaseAudioContext, value: number) => new GainNode(ctx, { gain: value });
const filter = (ctx: BaseAudioContext, type: BiquadFilterType, frequency: number, Q = 0.707) =>
  new BiquadFilterNode(ctx, { Q, frequency, type });
const ramp = (param: AudioParam, value: number, now: number, tau = RAMP) => param.setTargetAtTime(value, now, tau);

const chain = (...nodes: AudioNode[]) => {
  for (let i = 0; i < nodes.length - 1; i += 1) nodes[i].connect(nodes[i + 1]);
  return nodes[nodes.length - 1];
};

const impulses = new WeakMap<BaseAudioContext, AudioBuffer>();
const reverbImpulse = (ctx: BaseAudioContext) => {
  const cached = impulses.get(ctx);
  if (cached) return cached;
  const length = Math.round(3 * ctx.sampleRate);
  const ir = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let c = 0; c < 2; c += 1) {
    const data = ir.getChannelData(c);
    for (let i = 0; i < length; i += 1) {
      const t = i / ctx.sampleRate;
      data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 2.4) * Math.min(1, t * 200);
    }
  }
  impulses.set(ctx, ir);
  return ir;
};

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();
const noiseBuffer = (ctx: BaseAudioContext) => {
  const cached = noiseBuffers.get(ctx);
  if (cached) return cached;
  const buffer = ctx.createBuffer(2, 2 * ctx.sampleRate, ctx.sampleRate);
  for (let c = 0; c < 2; c += 1) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  }
  noiseBuffers.set(ctx, buffer);
  return buffer;
};

const crushCurve = (bits: number) => {
  const curve = new Float32Array(4096);
  const steps = 2 ** bits / 2;
  for (let i = 0; i < curve.length; i += 1) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.round(x * steps) / steps;
  }
  return curve;
};

/**
 * Ramp and window shapes for two grains half a period apart: a sawtooth from
 * -1 to 1 whose jump falls where its raised-cosine window is silent.
 */
const grainWaves = new WeakMap<BaseAudioContext, PeriodicWave[]>();
const waves = (ctx: BaseAudioContext) => {
  const cached = grainWaves.get(ctx);
  if (cached) return cached;
  const n = 512;
  const make = (shift: boolean) => {
    const imag = new Float32Array(n);
    for (let k = 1; k < n; k += 1) imag[k] = (-2 / (Math.PI * k)) * (shift && k % 2 ? -1 : 1);
    const winReal = new Float32Array(2);
    winReal[1] = shift ? 0.5 : -0.5;
    return [
      ctx.createPeriodicWave(new Float32Array(n), imag, { disableNormalization: true }),
      ctx.createPeriodicWave(winReal, new Float32Array(2), { disableNormalization: true }),
    ];
  };
  const result = [...make(false), ...make(true)];
  grainWaves.set(ctx, result);
  return result;
};

/** Everything an effect gets from its slot. */
interface Slot {
  ctx: BaseAudioContext;
  /** Input feed for the effect, silent until the effect opens it. */
  send: GainNode;
  /** Effect output into the slot output. */
  ret: GainNode;
  /** The slot's dry path. */
  dry: GainNode;
  /** Sources stopped when the effect is removed. */
  sources: AudioScheduledSourceNode[];
}

/**
 * Two crossfaded taps on a modulated delay line: the classic delay-line pitch
 * shifter. A ratio of -1 plays each slice backwards.
 */
class Grains {
  readonly input: GainNode;
  readonly output: GainNode;
  private readonly delays: DelayNode[] = [];
  private readonly depths: GainNode[] = [];
  private readonly oscs: OscillatorNode[] = [];

  constructor(s: Slot, maxDelay: number) {
    const { ctx } = s;
    const [saw0, win0, saw1, win1] = waves(ctx);
    this.input = gain(ctx, 1);
    this.output = gain(ctx, 1);
    const at = ctx.currentTime + 0.005;
    for (const [saw, win] of [
      [saw0, win0],
      [saw1, win1],
    ]) {
      const delay = new DelayNode(ctx, { maxDelayTime: maxDelay });
      const ramper = new OscillatorNode(ctx, { frequency: 10, periodicWave: saw });
      const depth = gain(ctx, 0);
      ramper.connect(depth).connect(delay.delayTime);
      const fade = new OscillatorNode(ctx, { frequency: 10, periodicWave: win });
      const vca = gain(ctx, 0.5);
      fade.connect(vca.gain);
      chain(this.input, delay, vca, this.output);
      ramper.start(at);
      fade.start(at);
      s.sources.push(ramper, fade);
      this.delays.push(delay);
      this.depths.push(depth);
      this.oscs.push(ramper, fade);
    }
  }

  /** Each tap's delay sweeps from `base - depth` to `base + depth` once per `period` seconds. */
  sweep(base: number, depth: number, period: number, now: number, tau = 0.02) {
    for (const osc of this.oscs) ramp(osc.frequency, 1 / period, now, tau);
    for (const d of this.depths) ramp(d.gain, depth, now, tau);
    for (const d of this.delays) ramp(d.delayTime, base, now, tau);
  }

  pitch(ratio: number, period: number, now: number, tau?: number) {
    const depth = ((1 - ratio) * period) / 2;
    this.sweep(Math.abs(depth) + 0.003, depth, period, now, tau);
  }
}

/** A delay line that records `length` seconds once and then repeats them. */
class Looper {
  readonly input: GainNode;
  readonly output: DelayNode;
  private readonly gate: GainNode;
  private readonly feedback: GainNode;

  constructor(ctx: BaseAudioContext) {
    this.input = gain(ctx, 1);
    this.gate = gain(ctx, 0);
    this.output = new DelayNode(ctx, { maxDelayTime: MAX_LEN });
    this.feedback = gain(ctx, 0);
    chain(this.input, this.gate, this.output);
    chain(this.output, this.feedback, this.output);
  }

  capture(at: number, length: number) {
    this.output.delayTime.setValueAtTime(length, at);
    this.gate.gain.setValueAtTime(1, at);
    this.gate.gain.setValueAtTime(0, at + length);
    this.feedback.gain.setValueAtTime(0, at);
    this.feedback.gain.setValueAtTime(1, at + length);
  }

  /** Stops recording and lets the loop fade with `decay` feedback. */
  release(now: number, decay = 0) {
    this.gate.gain.cancelScheduledValues(now);
    this.feedback.gain.cancelScheduledValues(now);
    this.gate.gain.setValueAtTime(0, now);
    this.feedback.gain.setTargetAtTime(decay, now, 0.003);
  }
}

/** A sine or triangle LFO driving parameters, one sweep per `period`. */
const lfo = (s: Slot, type: OscillatorType, targets: [AudioParam, number][]) => {
  const osc = new OscillatorNode(s.ctx, { frequency: 0.25, type });
  for (const [param, depth] of targets) osc.connect(gain(s.ctx, depth)).connect(param);
  osc.start();
  s.sources.push(osc);
  return (period: number, now: number) => ramp(osc.frequency, 1 / period, now, 0.02);
};

// ---------------------------------------------------------------------------
// Effects

interface Params {
  on: boolean;
  level: number;
  beats: number;
  /** Seconds per beat. */
  beat: number;
  /** min(beats × beat, 8 s). */
  len: number;
  /** beats bars in seconds. */
  bars: number;
  now: number;
  /** Next beat on the grid, where quantized effects start. */
  at: number;
  /** State before this change, or null when the effect was just picked. */
  prev: FxState | null;
}

interface Effect {
  update(p: Params): void;
  dispose?(): void;
}

type Factory = (s: Slot) => Effect;

/**
 * How the dry signal behaves while the effect is on: `add` leaves it alone,
 * `mix` crossfades it with the effect by level, `replace` swaps it for the effect.
 */
type DryMode = "add" | "mix" | "replace";

const levels = (s: Slot, p: Params, mode: DryMode, tail: boolean) => {
  const { on, level, now } = p;
  ramp(s.send.gain, on ? 1 : 0, now);
  const wet = mode === "replace" ? 1 : level;
  ramp(s.ret.gain, on || (tail && mode === "add") ? wet : 0, now);
  ramp(s.dry.gain, !on || mode === "add" ? 1 : mode === "mix" ? 1 - level : 0, now);
};

const simple =
  (mode: DryMode, tail: boolean, build: (s: Slot) => (p: Params) => void): Factory =>
  (s) => {
    const timing = build(s);
    return {
      update: (p) => {
        timing(p);
        levels(s, p, mode, tail);
      },
    };
  };

interface EchoOptions {
  feedback: number;
  /** Filters in the feedback loop; the output is taken before them. */
  loop?: (ctx: BaseAudioContext) => AudioNode[];
  /** Semitones each repeat moves by. */
  shift?: number;
  /** Time constant for delay changes; long values bend the pitch. */
  glide?: number;
}

const echo = ({ feedback, loop, shift, glide = 0.02 }: EchoOptions): Factory =>
  simple("add", true, (s) => {
    const { ctx } = s;
    const delay = new DelayNode(ctx, { maxDelayTime: MAX_LEN });
    const fb = gain(ctx, feedback);
    const nodes = loop?.(ctx) ?? [];
    let grains: Grains | null = null;
    if (shift) {
      grains = new Grains(s, 0.2);
      nodes.push(grains.input, grains.output);
    }
    s.send.connect(delay);
    chain(delay, ...nodes, fb, delay);
    delay.connect(s.ret);
    return (p) => {
      ramp(delay.delayTime, p.len, p.now, glide);
      grains?.pitch(2 ** ((shift ?? 0) / 12), 0.08, p.now);
    };
  });

const darkEcho = (ctx: BaseAudioContext) => [filter(ctx, "highpass", 250), filter(ctx, "lowpass", 6000)];

const spiral = (shift?: number): Factory =>
  echo({
    feedback: shift ? 0.6 : 0.8,
    glide: 0.35,
    loop: (ctx) => [filter(ctx, "highpass", 150), filter(ctx, "lowpass", 5000), filter(ctx, "allpass", 700), filter(ctx, "allpass", 2300)],
    shift,
  });

const reverbNet = (s: Slot) => {
  const convolver = new ConvolverNode(s.ctx, { buffer: reverbImpulse(s.ctx) });
  // The convolver normalises the impulse quietly; bring the wet signal up to the dry level.
  const makeup = gain(s.ctx, 4);
  s.send.connect(convolver).connect(makeup);
  return makeup;
};

const reverb: Factory = simple("add", true, (s) => {
  reverbNet(s).connect(s.ret);
  return () => {};
});

/** Reverb with a filter that sweeps from `from` to `to` Hz over the chosen bars each time it is switched on. */
const sweptReverb = (type: BiquadFilterType, from: number, to: number): Factory =>
  simple("add", true, (s) => {
    const f = filter(s.ctx, type, from);
    chain(reverbNet(s), f, s.ret);
    return (p) => {
      if (!p.on || p.prev?.on) return;
      f.frequency.cancelScheduledValues(p.now);
      f.frequency.setValueAtTime(from, p.now);
      f.frequency.exponentialRampToValueAtTime(to, p.now + p.bars);
    };
  });

const revDelay: Factory = simple("add", true, (s) => {
  const grains = new Grains(s, 2.2 * MAX_LEN + 0.1);
  const fb = gain(s.ctx, 0.35);
  s.send.connect(grains.input);
  chain(grains.output, filter(s.ctx, "highpass", 200), fb, grains.input);
  grains.output.connect(s.ret);
  return (p) => grains.pitch(-1, p.len, p.now);
});

const mtDelay: Factory = simple("add", true, (s) => {
  const { ctx } = s;
  const taps = [
    { at: 0.25, gain: 0.45, pan: -0.7 },
    { at: 0.5, gain: 0.6, pan: 0.7 },
    { at: 0.75, gain: 0.75, pan: -0.35 },
    { at: 1, gain: 0.9, pan: 0.35 },
  ].map((t) => {
    const delay = new DelayNode(ctx, { maxDelayTime: MAX_LEN });
    chain(s.send, delay, gain(ctx, t.gain), new StereoPannerNode(ctx, { pan: t.pan }), s.ret);
    return { delay, frac: t.at };
  });
  const last = taps[taps.length - 1].delay;
  chain(last, filter(ctx, "lowpass", 7000), gain(ctx, 0.4), last);
  return (p) => {
    for (const t of taps) ramp(t.delay.delayTime, p.len * t.frac, p.now, 0.02);
  };
});

const pingPong: Factory = simple("add", true, (s) => {
  const { ctx } = s;
  const left = new DelayNode(ctx, { maxDelayTime: MAX_LEN });
  const right = new DelayNode(ctx, { maxDelayTime: MAX_LEN });
  s.send.connect(left);
  chain(left, new StereoPannerNode(ctx, { pan: -1 }), s.ret);
  chain(left, gain(ctx, 0.6), right);
  chain(right, new StereoPannerNode(ctx, { pan: 1 }), s.ret);
  chain(right, gain(ctx, 0.6), left);
  return (p) => {
    ramp(left.delayTime, p.len, p.now, 0.02);
    ramp(right.delayTime, p.len, p.now, 0.02);
  };
});

/** Restartable LFO that begins on the beat, for Trans and Pan. */
const beatLfo = (s: Slot, type: OscillatorType, target: AudioParam, rest: (p: Params) => number, depth: (p: Params) => number, cycle: number) => {
  let osc: OscillatorNode | null = null;
  let amount: GainNode | null = null;
  const stop = (now: number) => {
    if (!osc) return;
    osc.stop(now);
    osc.disconnect();
    amount?.disconnect();
    osc = null;
    amount = null;
    target.cancelScheduledValues(now);
    target.setValueAtTime(target.defaultValue, now);
  };
  return {
    dispose: () => osc?.stop(),
    update: (p: Params) => {
      const retrigger = p.prev?.on && p.prev.beats !== p.beats;
      if (!p.on || retrigger) stop(p.now);
      if (!p.on) return;
      if (osc && amount) {
        ramp(osc.frequency, 1 / (p.len * cycle), p.now, 0.01);
        ramp(amount.gain, depth(p), p.now);
        ramp(target, rest(p), p.now);
        return;
      }
      osc = new OscillatorNode(s.ctx, { frequency: 1 / (p.len * cycle), type });
      amount = gain(s.ctx, depth(p));
      target.cancelScheduledValues(p.at);
      target.setValueAtTime(rest(p), p.at);
      osc.connect(amount).connect(target);
      osc.start(p.at);
    },
  };
};

const trans: Factory = (s) => {
  const gate = gain(s.ctx, 1);
  chain(s.send, gate, s.ret);
  // A square wave between 1 and 1 - level chops the sound on the beat.
  const motion = beatLfo(s, "square", gate.gain, (p) => 1 - p.level / 2, (p) => p.level / 2, 1);
  return {
    dispose: motion.dispose,
    update: (p) => {
      motion.update(p);
      levels(s, p, "replace", false);
    },
  };
};

const pan: Factory = (s) => {
  const panner = new StereoPannerNode(s.ctx);
  chain(s.send, panner, s.ret);
  // One side per length: a full left-right cycle takes two.
  const motion = beatLfo(s, "sine", panner.pan, () => 0, (p) => p.level, 2);
  return {
    dispose: motion.dispose,
    update: (p) => {
      motion.update(p);
      levels(s, p, "replace", false);
    },
  };
};

const sweepFilter: Factory = (s) => {
  const f = filter(s.ctx, "lowpass", 1200, 7);
  chain(s.send, f, s.ret);
  const amount = gain(s.ctx, 0);
  const osc = new OscillatorNode(s.ctx, { frequency: 0.25, type: "sine" });
  osc.connect(amount).connect(f.detune);
  osc.start();
  s.sources.push(osc);
  return {
    update: (p) => {
      ramp(osc.frequency, 1 / p.bars, p.now, 0.02);
      // Up to two and a half octaves either side of 1.2 kHz.
      ramp(amount.gain, 600 + 2400 * p.level, p.now);
      levels(s, p, "mix", false);
    },
  };
};

const flanger: Factory = simple("add", false, (s) => {
  const delay = new DelayNode(s.ctx, { delayTime: 0.004, maxDelayTime: 0.05 });
  const sweep = lfo(s, "sine", [[delay.delayTime, 0.0032]]);
  s.send.connect(delay);
  chain(delay, gain(s.ctx, 0.65), delay);
  delay.connect(s.ret);
  return (p) => sweep(p.bars, p.now);
});

const phaserStages = (s: Slot, input: AudioNode, count: number, feedback: number) => {
  const stages: BiquadFilterNode[] = [];
  let node = input;
  for (let i = 0; i < count; i += 1) {
    const stage = filter(s.ctx, "allpass", 900, 0.5);
    node.connect(stage);
    node = stage;
    stages.push(stage);
  }
  chain(node, gain(s.ctx, feedback), stages[0]);
  return { output: node, stages };
};

const phaser: Factory = simple("add", false, (s) => {
  const { output, stages } = phaserStages(s, s.send, 6, 0.45);
  const sweep = lfo(
    s,
    "sine",
    stages.map((st) => [st.frequency, 700]),
  );
  output.connect(s.ret);
  return (p) => sweep(p.bars, p.now);
});

const enigmaJet: Factory = simple("add", false, (s) => {
  const { ctx } = s;
  const delay = new DelayNode(ctx, { delayTime: 0.003, maxDelayTime: 0.05 });
  const band = filter(ctx, "bandpass", 1500, 3);
  const sweep = lfo(s, "sine", [
    [delay.delayTime, 0.0026],
    [band.detune, 2400],
  ]);
  s.send.connect(delay);
  const out = gain(ctx, 0.45);
  chain(delay, gain(ctx, -0.85), delay);
  chain(delay, band, gain(ctx, 1.6), out);
  chain(delay, out, s.ret);
  return (p) => sweep(p.bars, p.now);
});

const mobiusSaw: Factory = simple("add", false, (s) => {
  const grains = new Grains(s, 0.05);
  s.send.connect(grains.input);
  chain(grains.output, gain(s.ctx, 0.55), grains.input);
  grains.output.connect(s.ret);
  // The comb notches slide one way forever: each tap's delay only ever grows.
  return (p) => grains.sweep(0.0055, 0.0045, p.bars, p.now);
});

const mobiusTri: Factory = simple("add", false, (s) => {
  const { ctx } = s;
  const left = new DelayNode(ctx, { delayTime: 0.004, maxDelayTime: 0.05 });
  const right = new DelayNode(ctx, { delayTime: 0.004, maxDelayTime: 0.05 });
  const { output, stages } = phaserStages(s, s.send, 4, 0.3);
  const sweep = lfo(s, "triangle", [
    [left.delayTime, 0.003],
    [right.delayTime, -0.003],
    ...stages.map((st): [AudioParam, number] => [st.frequency, 600]),
  ]);
  for (const [delay, side] of [
    [left, -0.8],
    [right, 0.8],
  ] as const) {
    output.connect(delay);
    chain(delay, gain(ctx, 0.6), delay);
    chain(delay, new StereoPannerNode(ctx, { pan: side }), s.ret);
  }
  return (p) => sweep(p.bars, p.now);
});

const robot: Factory = simple("mix", false, (s) => {
  const { ctx } = s;
  const comb = new DelayNode(ctx, { delayTime: 1 / 110, maxDelayTime: 0.05 });
  const ring = gain(ctx, 0.5);
  const carrier = new OscillatorNode(ctx, { frequency: 70 });
  carrier.connect(gain(ctx, 0.5)).connect(ring.gain);
  carrier.start();
  s.sources.push(carrier);
  chain(s.send, comb, ring, filter(ctx, "highpass", 150), gain(ctx, 1.4), s.ret);
  chain(comb, gain(ctx, 0.72), comb);
  return () => {};
});

const pitch: Factory = (s) => {
  const grains = new Grains(s, 0.2);
  chain(s.send, grains.input);
  grains.output.connect(s.ret);
  return {
    update: (p) => {
      grains.pitch(2 ** (pitchSemitones(p.level) / 12), 0.07, p.now, 0.005);
      levels(s, p, "replace", false);
    },
  };
};

const stretch: Factory = simple("mix", false, (s) => {
  const grains = new Grains(s, 0.6 * MAX_LEN + 0.1);
  chain(s.send, grains.input);
  grains.output.connect(s.ret);
  return (p) => grains.pitch(0.5, p.len, p.now);
});

const lowCutEcho: Factory = (s) => {
  const { ctx } = s;
  const through = gain(ctx, 0);
  const cut = filter(ctx, "highpass", 20, 0.9);
  chain(s.send, cut, through, s.ret);
  const delay = new DelayNode(ctx, { maxDelayTime: MAX_LEN });
  const wet = gain(ctx, 0);
  s.send.connect(delay);
  chain(delay, ...darkEcho(ctx), gain(ctx, 0.5), delay);
  chain(delay, wet, s.ret);
  ramp(s.ret.gain, 1, ctx.currentTime);
  return {
    update: (p) => {
      ramp(delay.delayTime, p.len, p.now, 0.02);
      ramp(cut.frequency, 20 * 40 ** p.level, p.now);
      ramp(s.send.gain, p.on ? 1 : 0, p.now);
      ramp(through.gain, p.on ? 1 : 0, p.now);
      ramp(s.dry.gain, p.on ? 0 : 1, p.now);
      ramp(wet.gain, 0.7 * p.level, p.now);
    },
  };
};

const noise: Factory = (s) => {
  const { ctx } = s;
  const source = new AudioBufferSourceNode(ctx, { buffer: noiseBuffer(ctx), loop: true });
  const band = filter(ctx, "bandpass", 1200, 1.5);
  const sweep = lfo(s, "sine", [[band.detune, 2400]]);
  chain(source, band, gain(ctx, 0.5), s.ret);
  source.start();
  s.sources.push(source);
  return {
    update: (p) => {
      sweep(p.bars, p.now);
      ramp(s.ret.gain, p.on ? p.level : 0, p.now);
    },
  };
};

const helix: Factory = (s) => {
  const looper = new Looper(s.ctx);
  chain(s.send, looper.input);
  chain(looper.output, s.ret);
  s.send.gain.value = 1;
  let holding = false;
  return {
    update: (p) => {
      if (holding && (!p.on || (p.prev && p.prev.beats !== p.beats))) {
        looper.release(p.now, p.on ? 0 : 0.6);
        holding = false;
      }
      if (p.on && !holding) {
        looper.capture(p.at, p.len);
        holding = true;
      }
      ramp(s.ret.gain, p.level, p.now);
    },
  };
};

/**
 * Roll: records the next beats and loops them over a ducked track.
 * `slip` grabs fresh audio every bar; `reverse` loops the last beats backwards.
 */
const roll =
  (variant: "plain" | "slip" | "reverse"): Factory =>
  (s) => {
    const { ctx } = s;
    const looper = new Looper(ctx);
    let grains: Grains | null = null;
    if (variant === "reverse") {
      grains = new Grains(s, 2.2 * MAX_LEN + 0.1);
      chain(s.send, grains.input);
      chain(grains.output, looper.input);
    } else {
      chain(s.send, looper.input);
    }
    chain(looper.output, s.ret);
    s.send.gain.value = 1;
    let rolling = false;
    let timer = 0;

    const stop = (now: number) => {
      window.clearInterval(timer);
      looper.release(now);
      for (const param of [s.ret.gain, s.dry.gain]) param.cancelScheduledValues(now);
      ramp(s.ret.gain, 0, now, 0.003);
      ramp(s.dry.gain, 1, now, 0.003);
      rolling = false;
    };

    const start = (p: Params) => {
      const loopStart = p.at + p.len;
      grains?.pitch(-1, p.len, p.now);
      looper.capture(p.at, p.len);
      s.ret.gain.cancelScheduledValues(p.now);
      s.ret.gain.setValueAtTime(0, p.now);
      s.ret.gain.setValueAtTime(p.level, loopStart);
      s.dry.gain.cancelScheduledValues(loopStart);
      s.dry.gain.setTargetAtTime(1 - p.level, loopStart, 0.003);
      rolling = true;
      if (variant !== "slip") return;
      // Schedule each bar's fresh capture a little ahead of time.
      let nextBar = p.at + 4 * p.beat;
      timer = window.setInterval(() => {
        while (nextBar < ctx.currentTime + 0.25) {
          looper.capture(nextBar, p.len);
          nextBar += 4 * p.beat;
        }
      }, 50);
    };

    return {
      dispose: () => window.clearInterval(timer),
      update: (p) => {
        const changed = p.prev && p.prev.beats !== p.beats;
        if (rolling && (!p.on || changed)) stop(p.now);
        if (!p.on) return;
        if (!rolling) start(p);
        else {
          ramp(s.ret.gain, p.level, p.now);
          ramp(s.dry.gain, 1 - p.level, p.now);
        }
      },
    };
  };

/** Vinyl Brake slows the deck itself; the deck handles it. */
const none: Factory = () => ({ update: () => {} });

const FACTORIES: Record<FxType, Factory> = {
  bpfecho: echo({ feedback: 0.6, loop: (ctx) => [filter(ctx, "bandpass", 1000, 1.4), gain(ctx, 1.4)] }),
  crushecho: echo({
    feedback: 0.55,
    loop: (ctx) => [new WaveShaperNode(ctx, { curve: crushCurve(4) }), filter(ctx, "lowpass", 7000)],
  }),
  delay: echo({ feedback: 0.2 }),
  downecho: echo({ feedback: 0.62, loop: darkEcho, shift: -2 }),
  echo: echo({ feedback: 0.5, loop: darkEcho }),
  enigmajet: enigmaJet,
  filter: sweepFilter,
  flanger,
  helix,
  hpfecho: echo({ feedback: 0.6, loop: (ctx) => [filter(ctx, "highpass", 900, 1)] }),
  lowcutecho: lowCutEcho,
  lpfecho: echo({ feedback: 0.6, loop: (ctx) => [filter(ctx, "lowpass", 1200, 1)] }),
  mobiussaw: mobiusSaw,
  mobiustri: mobiusTri,
  mtdelay: mtDelay,
  noise,
  pan,
  phaser,
  pingpong: pingPong,
  pitch,
  reverb,
  reverbdown: sweptReverb("lowpass", 14000, 300),
  reverbup: sweptReverb("highpass", 60, 5000),
  revdelay: revDelay,
  revroll: roll("reverse"),
  robot,
  roll: roll("plain"),
  sliproll: roll("slip"),
  spiral: spiral(),
  spiraldown: spiral(-1),
  spiralup: spiral(1),
  stretch,
  trans,
  upecho: echo({ feedback: 0.62, loop: darkEcho, shift: 2 }),
  vinylbrake: none,
};

// ---------------------------------------------------------------------------

interface Live {
  type: FxType;
  slot: Slot;
  effect: Effect;
}

/** One beat-synced effect slot. */
export class BeatFx {
  readonly input: GainNode;
  readonly output: GainNode;
  private readonly ctx: BaseAudioContext;
  private readonly dry: GainNode;
  private live: Live | null = null;
  private state: FxState = DEFAULT_FX;
  private beatSeconds = 0.5;

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.input = gain(ctx, 1);
    this.output = gain(ctx, 1);
    this.dry = gain(ctx, 1);
    chain(this.input, this.dry, this.output);
  }

  setBeatLength(seconds: number) {
    if (!(seconds > 0) || Math.abs(seconds - this.beatSeconds) < 1e-6) return;
    this.beatSeconds = seconds;
    this.apply(this.state, this.ctx.currentTime);
  }

  /**
   * Applies a new state. `nextBeatAt` is the context time of the next beat,
   * where quantized effects start so they land on the grid.
   */
  set(state: FxState, nextBeatAt = this.ctx.currentTime) {
    this.apply(state, nextBeatAt);
  }

  private apply(state: FxState, nextBeatAt: number) {
    const previous = this.state;
    this.state = state;
    let prev: FxState | null = previous;
    if (this.live?.type !== state.type) {
      this.switchTo(state.type);
      prev = null;
    }
    const now = this.ctx.currentTime;
    const beat = this.beatSeconds;
    this.live?.effect.update({
      at: Math.max(now, nextBeatAt),
      bars: state.beats * 4 * beat,
      beat,
      beats: state.beats,
      len: Math.min(MAX_LEN, state.beats * beat),
      level: state.level,
      now,
      on: state.on,
      prev,
    });
  }

  private switchTo(type: FxType) {
    const now = this.ctx.currentTime;
    const old = this.live;
    if (old) {
      ramp(old.slot.send.gain, 0, now, 0.01);
      old.slot.ret.gain.cancelScheduledValues(now);
      ramp(old.slot.ret.gain, 0, now, 0.01);
      window.setTimeout(() => {
        old.effect.dispose?.();
        for (const src of old.slot.sources) {
          try {
            src.stop();
          } catch {
            // Never started or already stopped.
          }
        }
        old.slot.send.disconnect();
        old.slot.ret.disconnect();
      }, 120);
    }
    this.dry.gain.cancelScheduledValues(now);
    ramp(this.dry.gain, 1, now, 0.01);

    const send = gain(this.ctx, 0);
    const ret = gain(this.ctx, 0);
    this.input.connect(send);
    ret.connect(this.output);
    const slot: Slot = { ctx: this.ctx, dry: this.dry, ret, send, sources: [] };
    this.live = { effect: FACTORIES[type](slot), slot, type };
  }
}
