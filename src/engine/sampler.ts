import { dbToGain } from "@/lib/decibels";
import { subscribeFrame } from "@/lib/frame-loop";
import type { FrameSource } from "@/lib/types";

import { DEFAULT_SOUNDS } from "./sampler-sounds";
import { Store } from "./store";

export type SampleMode = "one-shot" | "hold" | "loop" | "toggle";

export const SAMPLE_MODES: SampleMode[] = ["one-shot", "hold", "loop", "toggle"];
/** djay Pro sampler keys: X C V and B N M, then , and . for pads 7 and 8. */
export const SAMPLER_HOTKEYS = ["x", "c", "v", "b", "n", "m", ",", "."];

export interface SampleSlot {
  name: string;
  mode: SampleMode;
  status: "loading" | "ready" | "empty" | "error";
  playing: boolean;
}

interface SamplerState {
  slots: SampleSlot[];
}

interface Voice {
  source: AudioBufferSourceNode;
  startedAt: number;
}

/** Eight sample pads that play straight into the master bus. */
export class Sampler extends Store<SamplerState> {
  readonly output: GainNode;
  private readonly ctx: AudioContext;
  private readonly buffers: (AudioBuffer | null)[];
  private readonly voices = new Map<number, Voice>();
  private loaded = false;

  constructor(ctx: AudioContext) {
    super({
      slots: DEFAULT_SOUNDS.map((s) => ({ mode: s.mode, name: s.name, playing: false, status: "empty" })),
    });
    this.ctx = ctx;
    this.output = ctx.createGain();
    this.output.gain.value = dbToGain(-3);
    this.buffers = DEFAULT_SOUNDS.map(() => null);
  }

  private patchSlot(index: number, patch: Partial<SampleSlot>) {
    this.set({ slots: this.state.slots.map((s, i) => (i === index ? { ...s, ...patch } : s)) });
  }

  /** Renders the built-in sounds; called once, when the sampler first shows. */
  loadDefaults() {
    if (this.loaded) return;
    this.loaded = true;
    DEFAULT_SOUNDS.forEach((sound, index) => {
      if (this.buffers[index]) return;
      this.patchSlot(index, { status: "loading" });
      sound
        .render()
        .then((buffer) => {
          this.buffers[index] = buffer;
          this.patchSlot(index, { status: "ready" });
        })
        .catch(() => this.patchSlot(index, { status: "error" }));
    });
  }

  async loadFile(index: number, data: ArrayBuffer, name: string) {
    this.stop(index);
    this.patchSlot(index, { status: "loading" });
    try {
      this.buffers[index] = await this.ctx.decodeAudioData(data);
      this.patchSlot(index, { name, status: "ready" });
    } catch {
      this.patchSlot(index, { status: "error" });
    }
  }

  setMode(index: number, mode: SampleMode) {
    this.stop(index);
    this.patchSlot(index, { mode });
  }

  setVolume(db: number) {
    this.output.gain.setTargetAtTime(dbToGain(db), this.ctx.currentTime, 0.01);
  }

  trigger(index: number) {
    const buffer = this.buffers[index];
    if (!buffer) return;
    void this.ctx.resume();
    this.stop(index);
    const { mode } = this.state.slots[index];
    const source = new AudioBufferSourceNode(this.ctx, { buffer, loop: mode === "loop" || mode === "hold" });
    source.connect(this.output);
    source.onended = () => {
      if (this.voices.get(index)?.source !== source) return;
      this.voices.delete(index);
      this.patchSlot(index, { playing: false });
    };
    source.start();
    this.voices.set(index, { source, startedAt: this.ctx.currentTime });
    this.patchSlot(index, { playing: true });
  }

  stop(index: number) {
    const voice = this.voices.get(index);
    if (!voice) return;
    this.voices.delete(index);
    // A few milliseconds of fade so stopping mid-sound doesn't click.
    const fade = this.ctx.createGain();
    voice.source.disconnect();
    voice.source.connect(fade).connect(this.output);
    fade.gain.setTargetAtTime(0, this.ctx.currentTime, 0.008);
    voice.source.onended = null;
    voice.source.stop(this.ctx.currentTime + 0.05);
    this.patchSlot(index, { playing: false });
  }

  /** Playback progress of a pad, 0..1, for its progress bar. */
  progress(index: number): FrameSource<number> {
    return {
      subscribe: (listener) =>
        subscribeFrame(() => {
          const voice = this.voices.get(index);
          const buffer = this.buffers[index];
          if (!voice || !buffer) return listener(0);
          const elapsed = (this.ctx.currentTime - voice.startedAt) / buffer.duration;
          listener(voice.source.loop ? elapsed % 1 : Math.min(1, elapsed));
        }, "update"),
    };
  }
}
