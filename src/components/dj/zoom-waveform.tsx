import { useEffect, useRef } from "react";

import { DETAIL_RATE } from "@/engine/analysis";
import type { Deck } from "@/engine/deck";
import { subscribeFrame } from "@/lib/frame-loop";

import { CANVAS, formatClock, useSlowPosition } from "./theme";

const MIN_SPAN = 2;
const MAX_SPAN = 32;

/** Scrolling three-band waveform around the playhead, with beat grid, cues and loop. */
export const ZoomWaveform = ({ deck }: { deck: Deck }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spanRef = useRef(8);
  const dragRef = useRef<{ x: number; pos: number; wasPlaying: boolean } | null>(null);
  const pos = useSlowPosition(deck, 250);
  const zoom = (factor: number) => {
    spanRef.current = Math.min(MAX_SPAN, Math.max(MIN_SPAN, spanRef.current * factor));
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = canvas.getContext("2d");
    if (!g) return;

    return subscribeFrame(() => {
      const dpr = window.devicePixelRatio || 1;
      const W = Math.round(canvas.clientWidth * dpr);
      const H = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W;
        canvas.height = H;
      }
      g.clearRect(0, 0, W, H);
      const cy = H / 2;
      const s = deck.getSnapshot();
      const track = s.track;

      if (track) {
        const { low, mid, high } = track.analysis;
        const span = spanRef.current;
        const pos = deck.position;
        const t0 = pos - span / 2;
        const perPx = span / W;
        const toX = (t: number) => ((t - t0) / span) * W;

        if (s.loop) {
          g.globalAlpha = 0.14;
          g.fillStyle = CANVAS.signal;
          g.fillRect(toX(s.loop.start), 0, toX(s.loop.end) - toX(s.loop.start), H);
          g.globalAlpha = 1;
        }

        const amp = cy * 0.92;
        for (let x = 0; x < W; x += 1) {
          const time = t0 + x * perPx;
          if (time < 0 || time > deck.duration) continue;
          const i0 = Math.floor(time * DETAIL_RATE);
          const i1 = Math.max(i0 + 1, Math.floor((time + perPx) * DETAIL_RATE));
          let l = 0;
          let m = 0;
          let h = 0;
          for (let i = i0; i < i1 && i < low.length; i += 1) {
            if (low[i] > l) l = low[i];
            if (mid[i] > m) m = mid[i];
            if (high[i] > h) h = high[i];
          }
          g.fillStyle = CANVAS.waveformLow;
          g.fillRect(x, cy - l * amp, 1, l * amp * 2);
          g.fillStyle = CANVAS.waveformMid;
          g.fillRect(x, cy - m * amp * 0.8, 1, m * amp * 1.6);
          g.fillStyle = CANVAS.waveformHigh;
          g.fillRect(x, cy - h * amp * 0.55, 1, h * amp * 1.1);
        }

        // Played part.
        g.globalAlpha = 0.5;
        g.fillStyle = CANVAS.surface;
        g.fillRect(0, 0, W / 2, H);
        g.globalAlpha = 1;

        // Beat grid.
        if (deck.beatLength > 0) {
          const first = Math.ceil(deck.beatAt(t0));
          const last = Math.floor(deck.beatAt(t0 + span));
          for (let b = first; b <= last; b += 1) {
            const x = Math.round(toX(deck.timeOfBeat(b)));
            const bar = ((b % 4) + 4) % 4 === 0;
            g.fillStyle = bar ? CANVAS.set : CANVAS.outline;
            const tick = bar ? H * 0.22 : H * 0.12;
            g.fillRect(x, 0, Math.max(1, dpr), tick);
            g.fillRect(x, H - tick, Math.max(1, dpr), tick);
            if (bar && b >= 0) {
              const barNumber = b / 4 + 1;
              // Phrase starts (every 8 bars) stand out.
              const phrase = (barNumber - 1) % 8 === 0;
              g.font = `${phrase ? "bold " : ""}${10 * dpr}px ui-monospace, monospace`;
              g.fillStyle = phrase ? CANVAS.signal : CANVAS.tertiary;
              g.textBaseline = "top";
              g.fillText(String(barNumber), x + 3 * dpr, 2 * dpr);
              g.textBaseline = "alphabetic";
            }
          }
        }

        const marker = (t: number, color: string, label?: string) => {
          const x = toX(t);
          if (x < -20 || x > W + 20) return;
          g.fillStyle = color;
          g.fillRect(x, 0, Math.max(1, dpr), H);
          g.beginPath();
          g.moveTo(x, 0);
          g.lineTo(x + 7 * dpr, 0);
          g.lineTo(x, 8 * dpr);
          g.fill();
          if (label) {
            g.fillRect(x, H - 12 * dpr, 12 * dpr, 12 * dpr);
            g.fillStyle = "#000";
            g.font = `bold ${9 * dpr}px ui-monospace, monospace`;
            g.fillText(label, x + 3 * dpr, H - 3 * dpr);
          }
        };
        marker(s.cue, CANVAS.signal);
        s.hotCues.forEach((t, i) => {
          if (t !== null) marker(t, CANVAS.set, String(i + 1));
        });
      }

      // Playhead.
      g.fillStyle = CANVAS.signal;
      g.fillRect(W / 2 - dpr, 0, 2 * dpr, H);
    });
  }, [deck]);

  return (
    <canvas
      aria-description="Arrows move by one sixteenth beat, Shift with arrows by one beat. Plus and minus change the zoom."
      aria-label={`Deck ${deck.id} zoomed waveform`}
      aria-valuemax={Math.round(deck.duration)}
      aria-valuemin={0}
      aria-valuenow={Math.round(pos)}
      aria-valuetext={`${formatClock(pos)} of ${formatClock(deck.duration)}`}
      className="block h-full w-full cursor-grab touch-none active:cursor-grabbing"
      onKeyDown={(e) => {
        const beat = deck.beatLength || 0.5;
        const step = e.shiftKey ? beat : beat / 16;
        const actions: Record<string, () => void> = {
          "+": () => zoom(0.8),
          "-": () => zoom(1.25),
          "=": () => zoom(0.8),
          ArrowLeft: () => deck.seek(deck.position - step),
          ArrowRight: () => deck.seek(deck.position + step),
        };
        const action = actions[e.key];
        if (!action) return;
        e.preventDefault();
        e.stopPropagation();
        action();
      }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        const wasPlaying = deck.getSnapshot().playing;
        if (wasPlaying) deck.pause();
        dragRef.current = { pos: deck.position, wasPlaying, x: e.clientX };
      }}
      onPointerMove={(e) => {
        const drag = dragRef.current;
        if (!drag) return;
        const dx = e.clientX - drag.x;
        deck.seek(drag.pos - (dx / e.currentTarget.clientWidth) * spanRef.current);
      }}
      onPointerUp={() => {
        const drag = dragRef.current;
        dragRef.current = null;
        if (drag?.wasPlaying) deck.play();
      }}
      onWheel={(e) => zoom(e.deltaY > 0 ? 1.25 : 0.8)}
      ref={canvasRef}
      role="slider"
      tabIndex={0}
    />
  );
};
