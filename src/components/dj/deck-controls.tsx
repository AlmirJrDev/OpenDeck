import { Fader, FaderRange, FaderThumb, FaderTrack } from "@/components/ui/fader";
import { useEngine } from "@/engine/context";
import type { Deck } from "@/engine/deck";
import { useStore } from "@/engine/store";
import { cn } from "@/lib/utils";

import { Pad } from "./pad";
import { CAPTION, formatPitch } from "./theme";

const LOOP_SIZES = [1, 2, 4, 8, 16];

const formatBeats = (beats: number) => (beats < 1 ? `1/${Math.round(1 / beats)}` : String(beats));

const nextRange = (range: number) => (range === 8 ? 16 : range === 16 ? 50 : 8);

/** Control row: transport, hot cues, loops and tempo for one deck. */
export const DeckControls = ({ deck, mirrored = false }: { deck: Deck; mirrored?: boolean }) => {
  const engine = useEngine();
  const s = useStore(deck);
  const track = s.track;
  const name = `Deck ${deck.id}`;

  return (
    <section aria-label={`${name} controls`} className={cn("flex gap-4 bg-background p-4", mirrored && "flex-row-reverse")}>
      <div className="flex w-28 shrink-0 flex-col gap-2">
        <span className={CAPTION}>Transport</span>
        <Pad
          active={s.synced}
          aria-label={`${name} sync`}
          className="h-auto min-h-10 flex-1"
          disabled={!track}
          onClick={() => (s.synced ? deck.unsync() : deck.syncTo(engine.other(deck.id)))}
          toggle
        >
          Sync
        </Pad>
        <Pad active={s.quantize} aria-label={`${name} quantize`} className="h-auto min-h-10 flex-1" onClick={() => deck.setQuantize(!s.quantize)} toggle>
          Quant
        </Pad>
        <Pad aria-label={`${name} cue`} className="h-auto min-h-14 flex-[1.4]" disabled={!track} onClick={() => deck.cuePress()} size="lg">
          Cue
        </Pad>
        <Pad
          active={s.playing}
          aria-label={`${name} play`}
          className="h-auto min-h-14 flex-[1.4]"
          disabled={!track}
          onClick={() => deck.togglePlay()}
          size="lg"
          toggle
        >
          {s.playing ? "❚❚ Pause" : "▶ Play"}
        </Pad>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <span className={CAPTION}>Hot cues</span>
        <div className="grid flex-[2] auto-rows-fr grid-cols-4 gap-2">
          {s.hotCues.map((t, i) => (
            <Pad
              active={t !== null}
              aria-label={`${name} hot cue ${i + 1}, ${t !== null ? "set" : "empty"}`}
              disabled={!track}
              key={i}
              onClick={(e) => (e.shiftKey ? deck.clearHotCue(i) : deck.hotCue(i))}
              onContextMenu={(e) => {
                e.preventDefault();
                deck.clearHotCue(i);
              }}
              title="Click to set or jump. Shift+click or right-click to clear."
              className="h-auto min-h-10"
              tone="set"
            >
              {i + 1}
            </Pad>
          ))}
        </div>
        <span className={cn(CAPTION, "mt-2")}>Loop (beats)</span>
        <div className="grid flex-1 auto-rows-fr grid-cols-5 gap-2">
          {LOOP_SIZES.map((beats) => (
            <Pad
              active={s.loop?.beats === beats}
              aria-label={`${name} loop ${beats} beats`}
              disabled={!track}
              key={beats}
              className="h-auto min-h-10"
              onClick={() => deck.setLoop(beats)}
              toggle
            >
              {beats}
            </Pad>
          ))}
        </div>
        <div className="grid flex-1 auto-rows-fr grid-cols-5 gap-2">
          <Pad aria-label={`${name} jump back 4 beats`} className="h-auto min-h-10" disabled={!track} onClick={() => deck.beatJump(-4)}>
            ◀◀
          </Pad>
          <Pad aria-label={`${name} halve loop`} className="h-auto min-h-10" disabled={!s.loop} onClick={() => deck.scaleLoop(0.5)}>
            ½
          </Pad>
          <Pad aria-label={`${name} exit loop`} className="h-auto min-h-10" disabled={!s.loop} onClick={() => deck.exitLoop()}>
            {s.loop ? `Exit ${formatBeats(s.loop.beats)}` : "Exit"}
          </Pad>
          <Pad aria-label={`${name} double loop`} className="h-auto min-h-10" disabled={!s.loop} onClick={() => deck.scaleLoop(2)}>
            ×2
          </Pad>
          <Pad aria-label={`${name} jump forward 4 beats`} className="h-auto min-h-10" disabled={!track} onClick={() => deck.beatJump(4)}>
            ▶▶
          </Pad>
        </div>
      </div>

      <div className="flex w-20 shrink-0 flex-col items-center gap-2">
        <span className={CAPTION}>Tempo</span>
        <Pad
          aria-label={`${name} pitch range ±${s.pitchRange}%, change`}
          className="w-full"
          onClick={() => deck.setPitchRange(nextRange(s.pitchRange))}
          size="sm"
        >
          ±{s.pitchRange}%
        </Pad>
        <Fader
          aria-label={`${name} tempo`}
          className="min-h-40 flex-1"
          detents={[0]}
          fineStep={0.01}
          format={formatPitch}
          largeStep={1}
          max={s.pitchRange}
          min={-s.pitchRange}
          onValueChange={(v) => {
            deck.unsync();
            deck.setPitch(v);
          }}
          orientation="vertical"
          origin={0}
          resetValue={0}
          size="lg"
          step={0.02}
          value={s.pitch}
          variant="console"
        >
          <FaderTrack>
            <FaderRange />
            <FaderThumb />
          </FaderTrack>
        </Fader>
        <div className="grid w-full grid-cols-2 gap-1">
          <BendButton deck={deck} direction={-1} />
          <BendButton deck={deck} direction={1} />
        </div>
      </div>
    </section>
  );
};

const BendButton = ({ deck, direction }: { deck: Deck; direction: -1 | 1 }) => (
  <Pad
    aria-label={`Deck ${deck.id} pitch bend ${direction < 0 ? "down" : "up"}`}
    className="px-0"
    onKeyDown={(e) => (e.key === " " || e.key === "Enter") && deck.setBend(direction)}
    onKeyUp={() => deck.setBend(0)}
    onPointerCancel={() => deck.setBend(0)}
    onPointerDown={() => deck.setBend(direction)}
    onPointerLeave={() => deck.setBend(0)}
    onPointerUp={() => deck.setBend(0)}
  >
    {direction < 0 ? "−" : "+"}
  </Pad>
);
