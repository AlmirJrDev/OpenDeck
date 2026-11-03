import { analyzeChannels } from "./analysis";

self.onmessage = (event: MessageEvent<{ id: number; channels: Float32Array[]; sampleRate: number }>) => {
  const { id, channels, sampleRate } = event.data;
  try {
    const analysis = analyzeChannels(channels, sampleRate);
    self.postMessage({ analysis, id }, {
      transfer: [analysis.overview.buffer, analysis.low.buffer, analysis.mid.buffer, analysis.high.buffer],
    });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error), id });
  }
};
