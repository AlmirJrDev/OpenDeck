import { Fragment } from "react";

import { Select, SelectContent, SelectGroup, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Deck } from "@/engine/deck";
import { FX_BEATS, FX_GROUPS, FX_INFO, pitchSemitones, type FxType } from "@/engine/fx";
import { useStore } from "@/engine/store";
import { cn } from "@/lib/utils";

import { DjKnob } from "./mixer-panel";
import { Pad } from "./pad";
import { CAPTION } from "./theme";

const beatLabel = (beats: number) => (beats < 1 ? `1/${1 / beats}` : String(beats));
const percent = (v: number) => `${Math.round(v * 100)}%`;
const semitones = (v: number) => {
  const st = pitchSemitones(v);
  return `${st > 0 ? "+" : ""}${st} st`;
};

/** Performance row slot: DESIGN.md `pad`, `pad-active`, knob, and `readout-caption`. */
export const FxPanel = ({ deck, mirrored }: { deck: Deck; mirrored: boolean }) => {
  const { fx, track, playing } = useStore(deck);
  const current = FX_INFO[fx.type];
  const timed = current.timing !== "none";
  const brake = fx.type === "vinylbrake";
  const name = `Deck ${deck.id}`;

  return (
    <section aria-label={`${name} beat FX`} className="flex flex-col gap-3 bg-background p-4">
      <div className={cn("flex items-center gap-3", mirrored && "flex-row-reverse")}>
        <span className={CAPTION}>FX {deck.id}</span>
        <Select items={Object.fromEntries(FX_GROUPS.flat().map((f) => [f.type, f.label]))} onValueChange={(type) => type && deck.setFx({ type: type as FxType })} value={fx.type}>
          <SelectTrigger
            aria-label={`${name} effect`}
            className="h-8 w-40 shrink-0 rounded-none font-mono text-xs font-semibold tracking-[0.05em] text-foreground uppercase"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-[min(70vh,var(--available-height))] rounded-none">
            {FX_GROUPS.map((group, i) => (
              <Fragment key={group[0].type}>
                {i > 0 && <SelectSeparator />}
                <SelectGroup>
                  {group.map((f) => (
                    <SelectItem className="rounded-none font-mono text-xs tracking-[0.05em] uppercase" key={f.type} value={f.type}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </Fragment>
            ))}
          </SelectContent>
        </Select>
        <span className={cn("min-w-0 truncate text-xs text-text-secondary", mirrored ? "mr-auto" : "ml-auto")}>{current.hint}</span>
      </div>
      <div className={cn("flex items-center gap-3", mirrored && "flex-row-reverse")}>
        <div
          aria-label={`${name} ${current.timing === "bars" ? "sweep length in bars" : "length in beats"}`}
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
          format={current.knob === "Pitch" ? semitones : percent}
          label={current.knob ?? "Level"}
          max={1}
          min={0}
          onChange={(level) => deck.setFx({ level })}
          scope={`${name} FX`}
          step={0.01}
        />
        {brake ? (
          <Pad
            aria-label={`${name} vinyl brake`}
            className="w-16 shrink-0"
            disabled={!playing}
            onClick={() => deck.setFx({ on: true })}
            title="Slow the deck to a stop over the chosen beats"
          >
            Stop
          </Pad>
        ) : (
          <Pad active={fx.on} aria-label={`${name} FX on`} className="w-16 shrink-0" disabled={!track} onClick={() => deck.setFx({ on: !fx.on })} toggle>
            {fx.on ? "On" : "Off"}
          </Pad>
        )}
      </div>
    </section>
  );
};
