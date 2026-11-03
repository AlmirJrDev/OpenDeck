import type { TrackAnalysis } from "./analysis";

type Reply = { id: number; analysis?: TrackAnalysis; error?: string };

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (a: TrackAnalysis) => void; reject: (e: Error) => void }>();

const getWorker = () => {
  if (!worker) {
    worker = new Worker(new URL("./analysis.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<Reply>) => {
      const job = pending.get(event.data.id);
      if (!job) return;
      pending.delete(event.data.id);
      if (event.data.analysis) job.resolve(event.data.analysis);
      else job.reject(new Error(event.data.error ?? "Analysis failed"));
    };
  }
  return worker;
};

/** Analyses tempo, beat grid and waveforms off the main thread. */
export const analyzeBuffer = (buffer: AudioBuffer): Promise<TrackAnalysis> =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { reject, resolve });
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c).slice());
    getWorker().postMessage(
      { channels, id, sampleRate: buffer.sampleRate },
      { transfer: channels.map((c) => c.buffer) }
    );
  });
