// AudioContext output selection (Chromium 110+), not yet in TypeScript's DOM lib.
interface AudioContext {
  readonly sinkId: string;
  setSinkId(sinkId: string): Promise<void>;
}
