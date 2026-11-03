import { Waveform, WaveformCanvas, WaveformCursor, WaveformHover, WaveformMarker, WaveformRegion } from "@/components/ui/waveform";
import { useEngine } from "@/engine/context";
import type { Deck } from "@/engine/deck";
import { camelotLabel, keyName, keysCompatible } from "@/engine/key";
import { useStore } from "@/engine/store";
import { cn } from "@/lib/utils";

import { CAPTION, formatClock, formatPitch, useSlowPosition } from "./theme";

const Readout = ({ caption, value, className }: { caption: string; value: string; className?: string }) => (
  <div className={cn("flex flex-col gap-1", className)}>
    <span className={CAPTION}>{caption}</span>
    <span className="font-mono text-2xl leading-none font-medium tabular-nums">{value}</span>
  </div>
);

/** Readout row half: DESIGN.md `readout-bpm`, `readout-value`, `track-title`, `key-match`, `key-clash`. */
export const DeckReadout = ({ deck, mirrored = false }: { deck: Deck; mirrored?: boolean }) => {
  const engine = useEngine();
  const s = useStore(deck);
  useStore(engine.other(deck.id));
  const pos = useSlowPosition(deck);
  const track = s.track;
  const bpm = deck.effectiveBpm;
  const beatIndex = track && deck.beatLength ? Math.floor(deck.beatAt(pos) + 1e-3) : null;
  const beatInBar = beatIndex === null ? -1 : ((beatIndex % 4) + 4) % 4;
  const bar = beatIndex === null || beatIndex < 0 ? "--.-" : `${Math.floor(beatIndex / 4) + 1}.${beatInBar + 1}`;
  const barInPhrase = beatIndex === null || beatIndex < 0 ? -1 : Math.floor(beatIndex / 4) % 8;
  const key = deck.effectiveKey;
  const otherKey = engine.other(deck.id).effectiveKey;
  const keyMatch = key && otherKey ? keysCompatible(key, otherKey) : null;

  return (
    <section aria-label={`Deck ${deck.id} readout`} className="flex min-w-0 flex-col gap-3 bg-background p-4">
      <div className={cn("flex items-start gap-4", mirrored && "flex-row-reverse text-right")}>
        <span className="font-mono text-sm font-bold tracking-[0.15em]" aria-hidden>
          {deck.id}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg leading-tight font-semibold tracking-[-0.01em]">
            <span className="sr-only">Deck {deck.id}: </span>
            {track?.title ?? "No track"}
          </h2>
          <p className="truncate text-xs text-text-secondary">
            {track ? track.artist || "Unknown artist" : "Load a track from the library"}
          </p>
        </div>
        {key && (
          <span
            className={cn(
              "shrink-0 px-1.5 py-0.5 font-mono text-[11px] font-medium tracking-[0.11em] uppercase",
              keyMatch === null && "border border-pad-outline",
              keyMatch === true && "bg-signal text-on-signal",
              keyMatch === false && "bg-destructive text-black"
            )}
            title={`${keyName(key)}${keyMatch === null ? "" : keyMatch ? ", compatible with the other deck" : ", clashes with the other deck"}`}
          >
            {camelotLabel(key)} {keyMatch === true ? "Match" : keyMatch === false ? "Clash" : ""}
          </span>
        )}
      </div>

      <div className={cn("flex items-end gap-6", mirrored && "flex-row-reverse")}>
        <div className="flex flex-col gap-1">
          <span className={CAPTION}>BPM</span>
          <span aria-live="off" className="font-mono text-[64px] leading-none font-medium tracking-[-0.03em] tabular-nums">
            {bpm ? bpm.toFixed(1) : "---.-"}
          </span>
        </div>
        <Readout caption="Pitch" value={formatPitch(s.pitch)} />
        <Readout caption="Key" value={key ? camelotLabel(key) : "--"} />
        <Readout caption="Bar" value={bar} />
        <Readout caption="Remain" value={`-${formatClock(deck.duration - pos)}`} className={cn(mirrored ? "mr-auto" : "ml-auto")} />
      </div>

      <div className={cn("flex items-center gap-3", mirrored && "flex-row-reverse")}>
        <div aria-label={`Beat ${beatInBar + 1} of 4`} className="flex gap-1" role="img">
          {[0, 1, 2, 3].map((b) => (
            <span className={cn("h-1.5 w-8", b === beatInBar && s.playing ? "bg-signal" : "bg-divider")} key={b} />
          ))}
        </div>
        <div aria-label={`Bar ${barInPhrase + 1} of 8 in the phrase`} className="flex gap-1" role="img">
          {Array.from({ length: 8 }, (_, b) => (
            <span className={cn("size-1.5 rounded-full", b <= barInPhrase ? "bg-foreground" : "bg-divider")} key={b} />
          ))}
        </div>
        <span className={cn(CAPTION, mirrored ? "mr-auto" : "ml-auto")}>{s.playing ? "Playing" : track ? "Paused" : "Empty"}</span>
      </div>

      <Waveform
        aria-label={`Deck ${deck.id} track overview`}
        className="h-10 [--waveform-progress:var(--color-text-secondary)] [--waveform:var(--color-divider)] [--waveform-cursor:var(--color-signal)]"
        disabled={!track}
        duration={deck.duration}
        largeStep={deck.beatLength * 16 || 15}
        onSeekCommitted={(t) => deck.seek(t)}
        peaks={track?.analysis.overview ?? null}
        step={deck.beatLength * 4 || 5}
        time={deck.time}
        variant="mirror"
      >
        <WaveformCanvas />
        <WaveformCursor />
        <WaveformHover />
        {s.loop && <WaveformRegion draggable={false} end={s.loop.end} resizable={false} start={s.loop.start} />}
        {track && <WaveformMarker className="bg-signal" time={s.cue} />}
        {s.hotCues.map((t, i) =>
          t === null ? null : (
            <WaveformMarker className="bg-set" key={i} time={t}>
              {i + 1}
            </WaveformMarker>
          )
        )}
      </Waveform>
    </section>
  );
};
