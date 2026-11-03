import type { Deck } from "@/engine/deck";
import { FX_BEATS, FX_TYPES, UNTIMED_FX, type FxType } from "@/engine/fx";
import { useStore } from "@/engine/store";
import { cn } from "@/lib/utils";

import { DjKnob } from "./mixer-panel";
import { Pad } from "./pad";
import { CAPTION } from "./theme";

const FX_LABEL: Record<FxType, string> = {
  crush: "Crush",
  echo: "Echo",
  flanger: "Flanger",
  phaser: "Phaser",
  pingpong: "Ping Pong",
  reverb: "Reverb",
  roll: "Roll",
  trans: "Trans",
};

const FX_HINT: Record<FxType, string> = {
  crush: "Bit crusher; level blends it in",
  echo: "Tempo-synced echo with darkening repeats",
  flanger: "Jet sweep; beats set the sweep in bars",
  phaser: "Swirling notches; beats set the sweep in bars",
  pingpong: "Echo bouncing between left and right",
  reverb: "Room tail that rings out after switching off",
  roll: "Repeats the next beats as a loop while on",
  trans: "Cuts the sound on and off on the beat",
};

const beatLabel = (beats: number) => (beats < 1 ? `1/${1 / beats}` : String(beats));

/** Performance row slot: DESIGN.md `pad`, `pad-active`, knob, and `readout-caption`. */
export const FxPanel = ({ deck, mirrored }: { deck: Deck; mirrored: boolean }) => {
  const { fx, track, playing } = useStore(deck);
  const timed = !UNTIMED_FX.includes(fx.type);
  const name = `Deck ${deck.id}`;

  return (
    <section aria-label={`${name} beat FX`} className="flex flex-col gap-3 bg-background p-4">
      <div className={cn("flex items-baseline gap-3", mirrored && "flex-row-reverse")}>
        <span className={CAPTION}>FX {deck.id}</span>
        <span className={cn("truncate text-xs text-text-secondary", mirrored ? "mr-auto" : "ml-auto")}>{FX_HINT[fx.type]}</span>
      </div>
      <div className="grid grid-cols-4 gap-2" role="group" aria-label={`${name} effect`}>
        {FX_TYPES.map((type) => (
          <Pad
            active={fx.type === type}
            aria-label={`${name} effect ${FX_LABEL[type]}`}
            key={type}
            onClick={() => deck.setFx({ type })}
            size="sm"
            title={FX_HINT[type]}
            toggle
          >
            {FX_LABEL[type]}
          </Pad>
        ))}
      </div>
      <div className={cn("flex items-center gap-3", mirrored && "flex-row-reverse")}>
        <div
          aria-label={`${name} ${fx.type === "flanger" || fx.type === "phaser" ? "sweep length in bars" : "length in beats"}`}
          className="grid min-w-0 flex-1 grid-cols-5 gap-2"
          role="group"
        >
          {FX_BEATS.map((beats) => (
            <Pad
              active={timed && fx.beats === beats}
              className="normal-case"
              disabled={!timed}
              key={beats}
              onClick={() => deck.setFx({ beats })}
              toggle
            >
              {beatLabel(beats)}
            </Pad>
          ))}
        </div>
        <DjKnob
          defaultValue={0.6}
          format={(v) => `${Math.round(v * 100)}%`}
          label="Level"
          max={1}
          min={0}
          onChange={(level) => deck.setFx({ level })}
          scope={`${name} FX`}
          step={0.01}
        />
        <Pad active={fx.on} aria-label={`${name} FX on`} className="w-16 shrink-0" disabled={!track} onClick={() => deck.setFx({ on: !fx.on })} toggle>
          {fx.on ? "On" : "Off"}
        </Pad>
        <Pad
          aria-label={`${name} vinyl brake`}
          className="shrink-0"
          disabled={!playing}
          onClick={() => deck.brake(2)}
          title="Vinyl brake: slow the deck to a stop over 2 beats"
        >
          Brake
        </Pad>
      </div>
    </section>
  );
};
