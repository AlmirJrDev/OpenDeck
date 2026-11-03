import { useEffect, useState } from "react";

import type { Deck } from "@/engine/deck";
import { subscribeFrame } from "@/lib/frame-loop";

/** DESIGN.md colors for canvas drawing, where CSS variables do not apply. */
export const CANVAS = {
  divider: "#2E2E2E",
  outline: "#6E6E6E",
  set: "#FFFFFF",
  signal: "#E5FF00",
  surface: "#000000",
  tertiary: "#8F8F8F",
  waveformHigh: "#F8FAFC",
  waveformLow: "#1D4ED8",
  waveformMid: "#F59E0B",
};

export const formatClock = (seconds: number) => {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return `${String(m).padStart(2, "0")}:${rest.toFixed(1).padStart(4, "0")}`;
};

export const formatPitch = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;

/** Position for text readouts, updated a few times a second. */
export const useSlowPosition = (deck: Deck, intervalMs = 100) => {
  const [pos, setPos] = useState(deck.position);
  useEffect(() => {
    let last = 0;
    return subscribeFrame((now) => {
      if (now - last < intervalMs) return;
      last = now;
      setPos(deck.position);
    }, "update");
  }, [deck, intervalMs]);
  return pos;
};

/** Small uppercase caption, DESIGN.md `readout-caption`. */
export const CAPTION = "font-mono text-[11px] font-medium tracking-[0.11em] text-text-tertiary uppercase";
