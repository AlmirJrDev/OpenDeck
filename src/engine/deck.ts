import { createAnalyserTap, type AnalyserTap } from "@/hooks/use-audio-analyser";
import { dbToGain } from "@/lib/decibels";
import { subscribeFrame } from "@/lib/frame-loop";
import type { FrameSource } from "@/lib/types";

import type { TrackAnalysis } from "./analysis";
import { BeatFx, DEFAULT_FX, type FxState } from "./fx";
import { semitonesForPitch, shiftKey, type MusicalKey } from "./key";
import { Store } from "./store";

export type DeckId = "A" | "B";

export interface LoadedTrack {
  id: string;
  title: string;
  artist: string;
  buffer: AudioBuffer;
  analysis: TrackAnalysis;
}

export interface DeckState {
  track: LoadedTrack | null;
  playing: boolean;
  /** Pitch fader, in percent. */
  pitch: number;
  pitchRange: number;
  cue: number;
  hotCues: (number | null)[];
  loop: { start: number; end: number; beats: number } | null;
  synced: boolean;
  quantize: boolean;
  /** Position when the state last changed; read `time` for a live value. */
  position: number;
  fx: FxState;
}

const HOT_CUES = 8;
const BEND = 0.04;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export class Deck extends Store<DeckState> {
  readonly id: DeckId;
  readonly ctx: AudioContext;
  /** Channel output, before the crossfader. */
  readonly output: GainNode;
  /** After EQ, filter and FX, before the channel fader: the headphone cue tap. */
  readonly preFader: AudioNode;
  readonly meterTap: AnalyserTap;

  private readonly trim: GainNode;
  private readonly eqLow: BiquadFilterNode;
  private readonly eqMid: BiquadFilterNode;
  private readonly eqHigh: BiquadFilterNode;
  private readonly hpf: BiquadFilterNode;
  private readonly lpf: BiquadFilterNode;
  private readonly fx: BeatFx;
  private source: AudioBufferSourceNode | null = null;
  private anchorTime = 0;
  private anchorPos = 0;
  private bend = 0;
  /** A vinyl brake in progress: speed falls linearly from `rate` to 0 over `seconds`. */
  private braking: { start: number; pos: number; rate: number; seconds: number; timer: number } | null = null;

  /** Called when this deck's tempo changes, so synced decks can follow. */
  onTempoChange: (() => void) | null = null;

  readonly time: FrameSource<number> = {
    subscribe: (listener) => subscribeFrame(() => listener(this.position), "update"),
  };

  constructor(ctx: AudioContext, id: DeckId) {
    super({
      cue: 0,
      fx: DEFAULT_FX,
      hotCues: Array(HOT_CUES).fill(null),
      loop: null,
      pitch: 0,
      pitchRange: 8,
      playing: false,
      position: 0,
      quantize: true,
      synced: false,
      track: null,
    });
    this.ctx = ctx;
    this.id = id;
    this.trim = ctx.createGain();
    this.eqLow = Object.assign(ctx.createBiquadFilter(), { type: "lowshelf" });
    this.eqLow.frequency.value = 180;
    this.eqMid = Object.assign(ctx.createBiquadFilter(), { type: "peaking" });
    this.eqMid.frequency.value = 1000;
    this.eqMid.Q.value = 0.7;
    this.eqHigh = Object.assign(ctx.createBiquadFilter(), { type: "highshelf" });
    this.eqHigh.frequency.value = 3500;
    this.hpf = Object.assign(ctx.createBiquadFilter(), { type: "highpass" });
    this.hpf.frequency.value = 10;
    this.lpf = Object.assign(ctx.createBiquadFilter(), { type: "lowpass" });
    this.lpf.frequency.value = 22000;
    this.output = ctx.createGain();
    this.trim.connect(this.eqLow).connect(this.eqMid).connect(this.eqHigh).connect(this.hpf).connect(this.lpf);
    this.fx = new BeatFx(ctx);
    this.lpf.connect(this.fx.input);
    this.fx.output.connect(this.output);
    this.preFader = this.fx.output;
    this.meterTap = createAnalyserTap(ctx, this.fx.output, { channels: "stereo" });
  }

  get rate() {
    return (1 + this.state.pitch / 100) * (1 + this.bend);
  }

  get duration() {
    return this.state.track?.buffer.duration ?? 0;
  }

  get bpm() {
    return this.state.track?.analysis.bpm ?? 0;
  }

  /** Tempo as heard, with the pitch fader applied. */
  get effectiveBpm() {
    return this.bpm * (1 + this.state.pitch / 100);
  }

  /** Key as heard: without key lock, the pitch fader transposes it. */
  get effectiveKey(): MusicalKey | null {
    const key = this.state.track?.analysis.key;
    return key ? shiftKey(key, semitonesForPitch(this.state.pitch)) : null;
  }

  get beatLength() {
    return this.bpm > 0 ? 60 / this.bpm : 0;
  }

  get position(): number {
    if (!this.state.playing) return this.anchorPos;
    if (this.braking) {
      const { start, pos, rate, seconds } = this.braking;
      const t = Math.min(this.ctx.currentTime - start, seconds);
      return Math.min(pos + rate * (t - (t * t) / (2 * seconds)), this.duration);
    }
    let pos = this.anchorPos + (this.ctx.currentTime - this.anchorTime) * this.rate;
    const { loop } = this.state;
    if (loop && pos >= loop.end) {
      pos = loop.start + ((pos - loop.start) % (loop.end - loop.start));
    }
    return Math.min(pos, this.duration);
  }

  /** Beat index (fractional) at a track time. */
  beatAt(time: number) {
    const a = this.state.track?.analysis;
    if (!a || !this.beatLength) return 0;
    return (time - a.firstBeat) / this.beatLength;
  }

  timeOfBeat(beat: number) {
    const a = this.state.track?.analysis;
    return (a?.firstBeat ?? 0) + beat * this.beatLength;
  }

  private snap(time: number) {
    if (!this.state.quantize || !this.beatLength) return time;
    return Math.max(0, this.timeOfBeat(Math.round(this.beatAt(time))));
  }

  private reanchor() {
    this.anchorPos = this.position;
    this.anchorTime = this.ctx.currentTime;
    if (this.braking) {
      this.endBrake();
      this.source?.playbackRate.cancelScheduledValues(this.ctx.currentTime);
    }
  }

  private startSource(at: number) {
    const { track, loop } = this.state;
    if (!track) return;
    const src = this.ctx.createBufferSource();
    src.buffer = track.buffer;
    src.playbackRate.value = this.rate;
    if (loop) {
      src.loop = true;
      src.loopStart = loop.start;
      src.loopEnd = loop.end;
    }
    src.connect(this.trim);
    src.onended = () => {
      if (this.source !== src) return;
      this.source = null;
      this.anchorPos = this.duration;
      this.set({ playing: false, position: this.duration });
    };
    this.anchorPos = at;
    this.anchorTime = this.ctx.currentTime;
    src.start(0, at);
    this.source = src;
  }

  private endBrake() {
    if (!this.braking) return;
    clearTimeout(this.braking.timer);
    this.braking = null;
  }

  private stopSource() {
    this.endBrake();
    const src = this.source;
    this.source = null;
    if (src) {
      src.onended = null;
      try {
        src.stop();
      } catch {
        // Never started.
      }
      src.disconnect();
    }
  }

  load(track: LoadedTrack) {
    this.stopSource();
    this.anchorPos = 0;
    this.bend = 0;
    const cue = Math.max(0, track.analysis.firstBeat);
    this.anchorPos = cue;
    this.set({
      cue,
      hotCues: Array(HOT_CUES).fill(null),
      loop: null,
      playing: false,
      position: cue,
      synced: false,
      track,
    });
    this.applyRate();
  }

  play() {
    if (!this.state.track || this.state.playing) return;
    if (this.anchorPos >= this.duration) this.anchorPos = 0;
    void this.ctx.resume();
    this.startSource(this.anchorPos);
    this.set({ playing: true });
  }

  pause() {
    if (!this.state.playing) return;
    this.anchorPos = this.position;
    this.stopSource();
    this.set({ playing: false, position: this.anchorPos });
  }

  /** Slows the platter to a stop over `beats` beats, like switching a turntable off. */
  brake(beats = 2) {
    const src = this.source;
    if (!this.state.playing || !src || this.braking) return;
    const now = this.ctx.currentTime;
    const rate = this.rate;
    const seconds = Math.max(0.3, ((this.beatLength || 0.5) * beats) / rate);
    const pos = this.position;
    src.playbackRate.cancelScheduledValues(now);
    src.playbackRate.setValueAtTime(rate, now);
    src.playbackRate.linearRampToValueAtTime(0.0001, now + seconds);
    const timer = window.setTimeout(() => {
      if (this.source !== src) return;
      this.anchorPos = this.position;
      this.stopSource();
      this.set({ playing: false, position: this.anchorPos });
    }, seconds * 1000);
    this.braking = { pos, rate, seconds, start: now, timer };
  }

  /** Context time of the next beat on the grid, or now when that is not known. */
  nextBeatTime() {
    const now = this.ctx.currentTime;
    if (!this.state.playing || !this.beatLength || !this.state.quantize) return now;
    const beat = this.beatAt(this.position);
    const remaining = Math.ceil(beat - 1e-3) - beat;
    return now + (remaining * this.beatLength) / this.rate;
  }

  togglePlay() {
    if (this.state.playing) this.pause();
    else this.play();
  }

  seek(time: number) {
    const at = clamp(time, 0, this.duration);
    if (this.state.playing) {
      this.stopSource();
      this.startSource(at);
    } else {
      this.anchorPos = at;
    }
    this.set({ position: at });
  }

  /** CDJ style: while playing, return to cue and stop; while stopped, set the cue. */
  cuePress() {
    if (!this.state.track) return;
    if (this.state.playing) {
      this.pause();
      this.seek(this.state.cue);
    } else {
      const cue = this.snap(this.position);
      this.seek(cue);
      this.set({ cue });
    }
  }

  hotCue(index: number) {
    const existing = this.state.hotCues[index];
    if (!this.state.track) return;
    if (existing === null) {
      const hotCues = [...this.state.hotCues];
      hotCues[index] = this.snap(this.position);
      this.set({ hotCues });
    } else {
      this.seek(existing);
      if (!this.state.playing) this.play();
    }
  }

  clearHotCue(index: number) {
    const hotCues = [...this.state.hotCues];
    hotCues[index] = null;
    this.set({ hotCues });
  }

  setPitch(pitch: number) {
    this.reanchor();
    this.set({ pitch });
    this.applyRate();
    this.onTempoChange?.();
  }

  setPitchRange(pitchRange: number) {
    this.set({ pitchRange });
    if (Math.abs(this.state.pitch) > pitchRange) {
      this.setPitch(clamp(this.state.pitch, -pitchRange, pitchRange));
    }
  }

  /** Temporary speed-up or slow-down while a bend button is held. */
  setBend(direction: -1 | 0 | 1) {
    this.reanchor();
    this.bend = direction * BEND;
    this.applyRate();
  }

  setFx(patch: Partial<FxState>) {
    const fx = { ...this.state.fx, ...patch };
    this.set({ fx });
    this.fx.set(fx, this.nextBeatTime());
  }

  private applyRate() {
    this.fx.setBeatLength(this.effectiveBpm > 0 ? 60 / this.effectiveBpm : 0.5);
    this.source?.playbackRate.setValueAtTime(this.rate, this.ctx.currentTime);
  }

  private applyLoop() {
    const { loop } = this.state;
    if (!this.source) return;
    if (loop) {
      this.source.loopStart = loop.start;
      this.source.loopEnd = loop.end;
      this.source.loop = true;
    } else {
      this.source.loop = false;
    }
  }

  setLoop(beats: number) {
    if (!this.state.track || !this.beatLength) return;
    if (this.state.loop?.beats === beats) {
      this.exitLoop();
      return;
    }
    const pos = this.position;
    const start = this.state.loop?.start ??
      (this.state.quantize ? this.timeOfBeat(Math.floor(this.beatAt(pos) + 1e-3)) : pos);
    const end = Math.min(this.duration, start + beats * this.beatLength);
    this.reanchor();
    this.set({ loop: { beats, end, start } });
    if (this.anchorPos >= end) this.seek(start);
    this.applyLoop();
  }

  exitLoop() {
    if (!this.state.loop) return;
    this.reanchor();
    this.set({ loop: null });
    this.applyLoop();
  }

  scaleLoop(factor: 0.5 | 2) {
    const { loop } = this.state;
    if (!loop) return;
    const beats = clamp(loop.beats * factor, 1 / 8, 64);
    this.reanchor();
    const end = Math.min(this.duration, loop.start + beats * this.beatLength);
    this.set({ loop: { beats, end, start: loop.start } });
    if (this.anchorPos >= end) this.seek(loop.start);
    this.applyLoop();
  }

  /** Jumps by whole beats, keeping the phase. */
  beatJump(beats: number) {
    this.seek(this.position + beats * this.beatLength);
  }

  /** Matches tempo to `master` and lines up the beat phase. */
  syncTo(master: Deck) {
    if (!this.bpm || !master.bpm) return;
    const pitch = ((master.effectiveBpm / this.bpm) - 1) * 100;
    const needed = Math.abs(pitch);
    const range = [8, 16, 50].find((r) => r >= needed) ?? 50;
    if (range > this.state.pitchRange) this.set({ pitchRange: range });
    this.setPitch(clamp(pitch, -range, range));
    if (master.state.playing) {
      const frac = (x: number) => ((x % 1) + 1) % 1;
      const masterPhase = frac(master.beatAt(master.position));
      const myPhase = frac(this.beatAt(this.position));
      let diff = masterPhase - myPhase;
      if (diff > 0.5) diff -= 1;
      if (diff < -0.5) diff += 1;
      this.seek(this.position + diff * this.beatLength);
    }
    this.set({ synced: true });
  }

  /** Follows a master's tempo change without touching the phase. */
  followTempo(master: Deck) {
    if (!this.bpm || !master.bpm) return;
    const pitch = ((master.effectiveBpm / this.bpm) - 1) * 100;
    this.reanchor();
    this.set({ pitch: clamp(pitch, -this.state.pitchRange, this.state.pitchRange) });
    this.applyRate();
  }

  unsync() {
    this.set({ synced: false });
  }

  setQuantize(quantize: boolean) {
    this.set({ quantize });
  }

  setTrim(db: number) {
    this.trim.gain.setTargetAtTime(dbToGain(db), this.ctx.currentTime, 0.01);
  }

  /** EQ band gain in dB; the bottom of the range is a kill. */
  setEq(band: "low" | "mid" | "high", db: number) {
    const node = band === "low" ? this.eqLow : band === "mid" ? this.eqMid : this.eqHigh;
    const gain = db <= -25.9 ? -40 : db;
    node.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.01);
  }

  /** One-knob filter: below 0 is a low-pass, above 0 a high-pass. */
  setFilter(value: number) {
    const now = this.ctx.currentTime;
    const lp = value < 0 ? 20000 * 10 ** (value * 2.7) : 22000;
    const hp = value > 0 ? 10 * 10 ** (value * 3.2) : 10;
    const q = Math.abs(value) > 0.02 ? 4 : 0.7;
    this.lpf.frequency.setTargetAtTime(lp, now, 0.02);
    this.hpf.frequency.setTargetAtTime(hp, now, 0.02);
    this.lpf.Q.setTargetAtTime(q, now, 0.02);
    this.hpf.Q.setTargetAtTime(q, now, 0.02);
  }

  setVolume(db: number) {
    const gain = Number.isFinite(db) ? dbToGain(db) : 0;
    this.output.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.01);
  }
}
