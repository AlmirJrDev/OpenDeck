import { createAnalyserTap, type AnalyserTap } from "@/hooks/use-audio-analyser";
import { dbToGain } from "@/lib/decibels";

import { native, type NativeAudioFile } from "@/native";

import type { TrackAnalysis } from "./analysis";
import { analyzeBuffer } from "./analyze-buffer";
import { Deck, type DeckId } from "./deck";
import { DEMO_SPECS, renderDemoTrack, type DemoSpec } from "./demo-tracks";
import { Sampler } from "./sampler";
import { Store } from "./store";

export interface LibraryTrack {
  id: string;
  title: string;
  artist: string;
  status: "queued" | "analyzing" | "ready" | "error";
  duration?: number;
  bpm?: number;
  error?: string;
  analysis?: TrackAnalysis;
}

type TrackSource =
  | { kind: "file"; file: File }
  | { kind: "native"; path: string }
  | { kind: "demo"; spec: DemoSpec }
  | { kind: "buffer"; buffer: AudioBuffer };

const ANALYSIS_CONCURRENCY = 2;
const AUDIO_FILE = /.(mp3|wav|flac|ogg|m4a|aac|aiff?|opus)$/i;

interface EngineState {
  library: LibraryTrack[];
  crossfader: number;
  /** Decks sent to the headphones. */
  cue: Record<DeckId, boolean>;
  /** 0 is cue only, 1 is master only. */
  cueMix: number;
  /** Output device ids; null is the system default (master) or off (phones). */
  masterDevice: string | null;
  phonesDevice: string | null;
  deviceError: string | null;
}

const titleFromFile = (name: string) => name.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ");

const splitArtist = (title: string) => {
  const parts = title.split(" - ");
  return parts.length > 1
    ? { artist: parts[0].trim(), title: parts.slice(1).join(" - ").trim() }
    : { artist: "", title };
};

export class Engine extends Store<EngineState> {
  readonly ctx = new AudioContext({ latencyHint: "interactive" });
  readonly decks: Record<DeckId, Deck>;
  readonly masterTap: AnalyserTap;
  readonly sampler: Sampler;
  private readonly xfA: GainNode;
  private readonly xfB: GainNode;
  private readonly master: GainNode;
  private readonly cueSends: Record<DeckId, GainNode>;
  private readonly cueBus: GainNode;
  private readonly masterToPhones: GainNode;
  private readonly phones: GainNode;
  private phonesStream: MediaStreamAudioDestinationNode | null = null;
  private phonesCtx: AudioContext | null = null;
  private nextId = 1;
  // Decoded audio is large, so the library keeps where each track comes from
  // and decodes it again when a deck loads it.
  private readonly sources = new Map<string, TrackSource>();
  private readonly queue: string[] = [];
  private analyzing = 0;

  constructor() {
    super({
      crossfader: 0,
      cue: { A: false, B: false },
      cueMix: 0,
      deviceError: null,
      library: [],
      masterDevice: null,
      phonesDevice: null,
    });
    const ctx = this.ctx;
    this.master = ctx.createGain();
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -1;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.1;
    this.master.connect(limiter).connect(ctx.destination);
    this.masterTap = createAnalyserTap(ctx, limiter, { channels: "stereo" });

    this.decks = { A: new Deck(ctx, "A"), B: new Deck(ctx, "B") };
    this.xfA = ctx.createGain();
    this.xfB = ctx.createGain();
    this.decks.A.output.connect(this.xfA).connect(this.master);
    this.decks.B.output.connect(this.xfB).connect(this.master);
    this.setCrossfader(0);
    this.sampler = new Sampler(ctx);
    this.sampler.output.connect(this.master);

    this.cueBus = ctx.createGain();
    this.masterToPhones = ctx.createGain();
    this.phones = ctx.createGain();
    this.cueSends = { A: ctx.createGain(), B: ctx.createGain() };
    for (const id of ["A", "B"] as const) {
      this.cueSends[id].gain.value = 0;
      this.decks[id].preFader.connect(this.cueSends[id]).connect(this.cueBus);
    }
    limiter.connect(this.masterToPhones);
    this.cueBus.connect(this.phones);
    this.masterToPhones.connect(this.phones);
    this.setCueMix(0);

    const follow = (leader: Deck, follower: Deck) => {
      leader.onTempoChange = () => {
        if (follower.getSnapshot().synced) follower.followTempo(leader);
      };
    };
    follow(this.decks.A, this.decks.B);
    follow(this.decks.B, this.decks.A);
  }

  other(id: DeckId) {
    return this.decks[id === "A" ? "B" : "A"];
  }

  /** Equal-power crossfader, -1 is full A and 1 is full B. */
  setCrossfader(value: number) {
    const x = (value + 1) / 2;
    const now = this.ctx.currentTime;
    this.xfA.gain.setTargetAtTime(Math.cos((x * Math.PI) / 2), now, 0.005);
    this.xfB.gain.setTargetAtTime(Math.sin((x * Math.PI) / 2), now, 0.005);
    this.set({ crossfader: value });
  }

  setMasterGain(db: number) {
    this.master.gain.setTargetAtTime(dbToGain(db), this.ctx.currentTime, 0.01);
  }

  toggleCue(id: DeckId) {
    const cue = { ...this.state.cue, [id]: !this.state.cue[id] };
    this.cueSends[id].gain.setTargetAtTime(cue[id] ? 1 : 0, this.ctx.currentTime, 0.005);
    this.set({ cue });
  }

  setCueMix(value: number) {
    const now = this.ctx.currentTime;
    this.cueBus.gain.setTargetAtTime(Math.cos((value * Math.PI) / 2), now, 0.01);
    this.masterToPhones.gain.setTargetAtTime(Math.sin((value * Math.PI) / 2), now, 0.01);
    this.set({ cueMix: value });
  }

  setPhonesGain(db: number) {
    this.phones.gain.setTargetAtTime(dbToGain(db), this.ctx.currentTime, 0.01);
  }

  async setMasterDevice(id: string | null) {
    try {
      await this.ctx.setSinkId(id ?? "");
      this.set({ deviceError: null, masterDevice: id });
    } catch (error) {
      this.set({ deviceError: `Master output: ${error instanceof Error ? error.message : String(error)}` });
    }
  }

  /**
   * Headphones play through a second AudioContext on their own device, fed
   * from this graph through a MediaStream (one context has one output).
   */
  async setPhonesDevice(id: string | null) {
    try {
      if (id === null) {
        await this.phonesCtx?.close();
        this.phonesCtx = null;
        if (this.phonesStream) this.phones.disconnect(this.phonesStream);
        this.phonesStream = null;
      } else {
        if (!this.phonesStream) {
          this.phonesStream = this.ctx.createMediaStreamDestination();
          this.phones.connect(this.phonesStream);
        }
        if (!this.phonesCtx) {
          this.phonesCtx = new AudioContext({ latencyHint: "interactive" });
          this.phonesCtx.createMediaStreamSource(this.phonesStream.stream).connect(this.phonesCtx.destination);
        }
        await this.phonesCtx.setSinkId(id);
        await this.phonesCtx.resume();
      }
      this.set({ deviceError: null, phonesDevice: id });
    } catch (error) {
      this.set({ deviceError: `Headphones: ${error instanceof Error ? error.message : String(error)}` });
    }
  }

  /** Resumes both contexts; browsers need a user gesture first. */
  resume() {
    void this.ctx.resume();
    void this.phonesCtx?.resume();
  }

  private patchTrack(id: string, patch: Partial<LibraryTrack>) {
    this.set({
      library: this.state.library.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    });
  }

  private async decode(id: string): Promise<AudioBuffer> {
    const source = this.sources.get(id);
    if (!source) throw new Error("Unknown track");
    switch (source.kind) {
      case "buffer":
        return source.buffer;
      case "demo": {
        const buffer = await renderDemoTrack(source.spec);
        this.sources.set(id, { buffer, kind: "buffer" });
        return buffer;
      }
      case "file":
        return this.ctx.decodeAudioData(await source.file.arrayBuffer());
      case "native": {
        if (!native) throw new Error("Native file access is only available in the desktop app");
        return this.ctx.decodeAudioData(await native.readAudio(source.path));
      }
    }
  }

  private enqueue(meta: { title: string; artist: string }, source: TrackSource) {
    const id = `t${this.nextId++}`;
    this.sources.set(id, source);
    this.queue.push(id);
    this.set({ library: [...this.state.library, { id, ...meta, status: "queued" }] });
    this.pump();
  }

  private pump() {
    while (this.analyzing < ANALYSIS_CONCURRENCY && this.queue.length > 0) {
      const id = this.queue.shift()!;
      this.analyzing += 1;
      void this.analyze(id).finally(() => {
        this.analyzing -= 1;
        this.pump();
      });
    }
  }

  private async analyze(id: string) {
    this.patchTrack(id, { status: "analyzing" });
    try {
      const buffer = await this.decode(id);
      const analysis = await analyzeBuffer(buffer);
      this.patchTrack(id, { analysis, bpm: analysis.bpm, duration: buffer.duration, status: "ready" });
    } catch (error) {
      this.patchTrack(id, {
        error: error instanceof Error ? error.message : String(error),
        status: "error",
      });
    }
  }

  addFiles(files: Iterable<File>) {
    for (const file of files) {
      if (file.type.startsWith("audio/") || AUDIO_FILE.test(file.name)) {
        this.enqueue(splitArtist(titleFromFile(file.name)), { file, kind: "file" });
      }
    }
  }

  addNativeFiles(files: NativeAudioFile[]) {
    for (const file of files) {
      this.enqueue(splitArtist(titleFromFile(file.name)), { kind: "native", path: file.path });
    }
  }

  addDemoTracks() {
    for (const spec of DEMO_SPECS) {
      this.enqueue({ artist: spec.artist, title: spec.title }, { kind: "demo", spec });
    }
  }

  async loadToDeck(trackId: string, deckId: DeckId) {
    const track = this.state.library.find((t) => t.id === trackId);
    if (!track?.analysis) return;
    const buffer = await this.decode(trackId);
    this.decks[deckId].load({ analysis: track.analysis, artist: track.artist, buffer, id: track.id, title: track.title });
  }
}
