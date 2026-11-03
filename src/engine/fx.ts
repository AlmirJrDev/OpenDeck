export type FxType = "echo" | "pingpong" | "reverb" | "flanger" | "phaser" | "trans" | "roll" | "crush";

export const FX_TYPES: FxType[] = ["echo", "pingpong", "reverb", "flanger", "phaser", "trans", "roll", "crush"];
export const FX_BEATS = [0.25, 0.5, 1, 2, 4];

/** Effects whose beat buttons do nothing. */
export const UNTIMED_FX: FxType[] = ["reverb", "crush"];

export interface FxState {
  type: FxType;
  /** Delay, gate and roll length in beats; flanger and phaser sweep in bars. */
  beats: number;
  /** Wet level or depth, 0..1. */
  level: number;
  on: boolean;
}

export const DEFAULT_FX: FxState = { beats: 0.5, level: 0.6, on: false, type: "echo" };

interface FxUnit {
  send: GainNode;
  ret: GainNode;
}

const RAMP = 0.012;
/** Effects that keep ringing after they are switched off. */
const TAILS: FxType[] = ["echo", "pingpong", "reverb"];

const reverbImpulse = (ctx: BaseAudioContext, seconds: number) => {
  const length = Math.round(seconds * ctx.sampleRate);
  const ir = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let c = 0; c < 2; c += 1) {
    const data = ir.getChannelData(c);
    for (let i = 0; i < length; i += 1) {
      const t = i / ctx.sampleRate;
      data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 2.4) * Math.min(1, t * 200);
    }
  }
  return ir;
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
 * One beat-synced effect slot in the style of a DJ mixer's Beat FX. The dry
 * signal passes through a gate (for Trans); every other effect runs on its own
 * send, so echo-like tails ring out after switching off.
 */
export class BeatFx {
  readonly input: GainNode;
  readonly output: GainNode;
  private readonly ctx: BaseAudioContext;
  private readonly dry: GainNode;
  private readonly gate: GainNode;
  private readonly units: Record<Exclude<FxType, "trans">, FxUnit>;
  private readonly delays: DelayNode[] = [];
  private readonly sweeps: OscillatorNode[] = [];
  private readonly rollDelay: DelayNode;
  private readonly rollIn: GainNode;
  private readonly rollFeedback: GainNode;
  private readonly crusher: WaveShaperNode;
  private transLfo: OscillatorNode | null = null;
  private transDepth: GainNode | null = null;
  private rolling = false;
  private state: FxState = DEFAULT_FX;
  private beatSeconds = 0.5;

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.dry = ctx.createGain();
    this.gate = ctx.createGain();
    this.input.connect(this.dry).connect(this.gate).connect(this.output);

    const unit = (): FxUnit => {
      const send = ctx.createGain();
      const ret = ctx.createGain();
      send.gain.value = 0;
      ret.gain.value = 0;
      this.input.connect(send);
      ret.connect(this.output);
      return { ret, send };
    };
    this.units = {
      crush: unit(),
      echo: unit(),
      flanger: unit(),
      phaser: unit(),
      pingpong: unit(),
      reverb: unit(),
      roll: unit(),
    };

    this.buildEcho();
    this.buildPingPong();
    this.buildReverb();
    this.buildFlanger();
    this.buildPhaser();

    // Roll: capture one loop length into a delay line, then let it repeat itself.
    this.rollDelay = ctx.createDelay(8);
    this.rollIn = ctx.createGain();
    this.rollFeedback = ctx.createGain();
    this.rollIn.gain.value = 0;
    this.rollFeedback.gain.value = 0;
    this.units.roll.send.connect(this.rollIn).connect(this.rollDelay);
    this.rollDelay.connect(this.rollFeedback).connect(this.rollDelay);
    this.rollDelay.connect(this.units.roll.ret);

    this.crusher = ctx.createWaveShaper();
    this.crusher.curve = crushCurve(5);
    const crushTone = Object.assign(ctx.createBiquadFilter(), { type: "lowpass" as const });
    crushTone.frequency.value = 9000;
    this.units.crush.send.connect(this.crusher).connect(crushTone).connect(this.units.crush.ret);

    this.applyTiming();
  }

  private buildEcho() {
    const ctx = this.ctx;
    const delay = ctx.createDelay(8);
    const hp = Object.assign(ctx.createBiquadFilter(), { type: "highpass" as const });
    hp.frequency.value = 250;
    const lp = Object.assign(ctx.createBiquadFilter(), { type: "lowpass" as const });
    lp.frequency.value = 6000;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.5;
    this.units.echo.send.connect(delay);
    delay.connect(hp).connect(lp).connect(feedback).connect(delay);
    delay.connect(this.units.echo.ret);
    this.delays.push(delay);
  }

  private buildPingPong() {
    const ctx = this.ctx;
    const left = ctx.createDelay(8);
    const right = ctx.createDelay(8);
    const cross = ctx.createGain();
    const back = ctx.createGain();
    cross.gain.value = 0.6;
    back.gain.value = 0.6;
    const panLeft = new StereoPannerNode(ctx, { pan: -1 });
    const panRight = new StereoPannerNode(ctx, { pan: 1 });
    this.units.pingpong.send.connect(left);
    left.connect(panLeft).connect(this.units.pingpong.ret);
    left.connect(cross).connect(right);
    right.connect(panRight).connect(this.units.pingpong.ret);
    right.connect(back).connect(left);
    this.delays.push(left, right);
  }

  private buildReverb() {
    const ctx = this.ctx;
    const convolver = ctx.createConvolver();
    convolver.buffer = reverbImpulse(ctx, 3);
    // The convolver normalises the impulse quietly; bring the wet signal up to the dry level.
    const makeup = ctx.createGain();
    makeup.gain.value = 4;
    this.units.reverb.send.connect(convolver).connect(makeup).connect(this.units.reverb.ret);
  }

  private buildFlanger() {
    const ctx = this.ctx;
    const delay = ctx.createDelay(0.05);
    delay.delayTime.value = 0.004;
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    depth.gain.value = 0.0032;
    lfo.connect(depth).connect(delay.delayTime);
    lfo.start();
    const feedback = ctx.createGain();
    feedback.gain.value = 0.65;
    this.units.flanger.send.connect(delay);
    delay.connect(feedback).connect(delay);
    delay.connect(this.units.flanger.ret);
    this.sweeps.push(lfo);
  }

  private buildPhaser() {
    const ctx = this.ctx;
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    depth.gain.value = 700;
    lfo.connect(depth);
    lfo.start();
    let node: AudioNode = this.units.phaser.send;
    const stages: BiquadFilterNode[] = [];
    for (let i = 0; i < 6; i += 1) {
      const stage = Object.assign(ctx.createBiquadFilter(), { type: "allpass" as const });
      stage.frequency.value = 900;
      stage.Q.value = 0.5;
      depth.connect(stage.frequency);
      node.connect(stage);
      node = stage;
      stages.push(stage);
    }
    const feedback = ctx.createGain();
    feedback.gain.value = 0.45;
    node.connect(feedback).connect(stages[0]);
    node.connect(this.units.phaser.ret);
    this.sweeps.push(lfo);
  }

  setBeatLength(seconds: number) {
    if (!(seconds > 0) || Math.abs(seconds - this.beatSeconds) < 1e-6) return;
    this.beatSeconds = seconds;
    this.applyTiming();
  }

  /**
   * Applies a new state. `nextBeatAt` is the context time of the next beat,
   * where Trans and Roll start so they land on the grid.
   */
  set(state: FxState, nextBeatAt = this.ctx.currentTime) {
    const previous = this.state;
    this.state = state;
    this.applyTiming();
    const now = this.ctx.currentTime;
    const start = Math.max(now, nextBeatAt);

    for (const type of Object.keys(this.units) as (keyof typeof this.units)[]) {
      if (type === "roll") continue;
      const { send, ret } = this.units[type];
      const selected = state.type === type;
      const active = selected && state.on;
      send.gain.setTargetAtTime(active ? 1 : 0, now, RAMP);
      const keepTail = selected && TAILS.includes(type);
      ret.gain.setTargetAtTime(active || keepTail ? state.level : 0, now, RAMP);
    }

    const crushing = state.on && state.type === "crush";
    const rollOn = state.on && state.type === "roll";
    const rollChanged = rollOn && this.rolling && previous.beats !== state.beats;
    const keepsRolling = rollOn && this.rolling && !rollChanged;
    this.dry.gain.setTargetAtTime(crushing || keepsRolling ? 1 - state.level : 1, now, RAMP);

    const transOn = state.on && state.type === "trans";
    const transRetrigger = transOn && previous.on && previous.type === "trans" && previous.beats !== state.beats;
    if (!transOn || transRetrigger) this.stopTrans(now);
    if (transOn) this.startTrans(start);
    else this.gate.gain.setTargetAtTime(1, now, 0.005);

    if ((!rollOn && this.rolling) || rollChanged) this.stopRoll(now);
    if (rollOn && !this.rolling) this.startRoll(start);
    else if (rollOn) this.units.roll.ret.gain.setTargetAtTime(state.level, now, RAMP);
  }

  private startTrans(at: number) {
    if (this.transLfo) {
      const now = this.ctx.currentTime;
      this.transDepth?.gain.setTargetAtTime(this.state.level / 2, now, RAMP);
      this.gate.gain.setTargetAtTime(1 - this.state.level / 2, now, RAMP);
      return;
    }
    // A square wave between 1 and 1 - depth chops the dry signal on the beat.
    const lfo = this.ctx.createOscillator();
    lfo.type = "square";
    lfo.frequency.value = 1 / (this.state.beats * this.beatSeconds);
    const depth = this.ctx.createGain();
    depth.gain.value = this.state.level / 2;
    this.gate.gain.cancelScheduledValues(at);
    this.gate.gain.setValueAtTime(1 - this.state.level / 2, at);
    lfo.connect(depth).connect(this.gate.gain);
    lfo.start(at);
    this.transLfo = lfo;
    this.transDepth = depth;
  }

  private stopTrans(now: number) {
    if (!this.transLfo) return;
    this.transLfo.stop(now);
    this.transLfo.disconnect();
    this.transDepth?.disconnect();
    this.transLfo = null;
    this.transDepth = null;
    this.gate.gain.cancelScheduledValues(now);
    this.gate.gain.setValueAtTime(1, now);
  }

  private startRoll(at: number) {
    const length = Math.min(8, this.state.beats * this.beatSeconds);
    const loopStart = at + length;
    const { send, ret } = this.units.roll;
    this.rollDelay.delayTime.setValueAtTime(length, this.ctx.currentTime);
    send.gain.setValueAtTime(1, this.ctx.currentTime);
    // Record exactly one loop, then close the input and recirculate.
    this.rollIn.gain.setValueAtTime(1, at);
    this.rollIn.gain.setValueAtTime(0, loopStart);
    this.rollFeedback.gain.setValueAtTime(1, loopStart);
    ret.gain.setValueAtTime(this.state.level, loopStart);
    this.dry.gain.cancelScheduledValues(loopStart);
    this.dry.gain.setTargetAtTime(1 - this.state.level, loopStart, 0.003);
    this.rolling = true;
  }

  private stopRoll(now: number) {
    for (const param of [this.rollIn.gain, this.rollFeedback.gain, this.units.roll.ret.gain, this.dry.gain]) {
      param.cancelScheduledValues(now);
    }
    this.rollIn.gain.setValueAtTime(0, now);
    this.rollFeedback.gain.setTargetAtTime(0, now, 0.003);
    this.units.roll.ret.gain.setTargetAtTime(0, now, 0.003);
    this.dry.gain.setTargetAtTime(1, now, 0.003);
    this.rolling = false;
  }

  private applyTiming() {
    const now = this.ctx.currentTime;
    const delay = Math.min(8, this.state.beats * this.beatSeconds);
    for (const node of this.delays) node.delayTime.setTargetAtTime(delay, now, 0.02);
    const sweepHz = 1 / (this.state.beats * 4 * this.beatSeconds);
    for (const lfo of this.sweeps) lfo.frequency.setTargetAtTime(sweepHz, now, 0.02);
    this.transLfo?.frequency.setTargetAtTime(1 / (this.state.beats * this.beatSeconds), now, 0.01);
  }
}
