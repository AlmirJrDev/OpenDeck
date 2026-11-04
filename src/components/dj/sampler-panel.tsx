import { useEffect, useMemo, useState } from "react";

import {
  SoundPad,
  SoundPadGrid,
  SoundPadLabel,
  SoundPadProgress,
  SoundPadShortcut,
} from "@/components/ui/sound-pad";
import { useEngine } from "@/engine/context";
import { SAMPLE_MODES, SAMPLER_HOTKEYS, type SampleMode } from "@/engine/sampler";
import { useStore } from "@/engine/store";
import { cn } from "@/lib/utils";

import { DjKnob } from "./mixer-panel";
import { CAPTION } from "./theme";

const MODE_LABEL: Record<SampleMode, string> = {
  hold: "Hold",
  loop: "Loop",
  "one-shot": "One shot",
  toggle: "Toggle",
};

const nextMode = (mode: SampleMode) => SAMPLE_MODES[(SAMPLE_MODES.indexOf(mode) + 1) % SAMPLE_MODES.length];

/** Center of the performance row: DESIGN.md `pad` square sampler pads with `primary` as the active state. */
export const SamplerPanel = () => {
  const { sampler } = useEngine();
  const { slots } = useStore(sampler);
  const progress = useMemo(() => SAMPLER_HOTKEYS.map((_, i) => sampler.progress(i)), [sampler]);
  const [dropTarget, setDropTarget] = useState<number | null>(null);

  useEffect(() => sampler.loadDefaults(), [sampler]);

  return (
    <section aria-label="Sampler" className="flex flex-col gap-3 bg-background p-4">
      <div className="flex items-baseline gap-3">
        <span className={CAPTION}>Sampler</span>
        <span className="truncate text-xs text-text-secondary">
          Keys X–M , . Drop an audio file on a pad to replace it. Right-click a pad to change its mode.
        </span>
      </div>
      <div className="flex items-start gap-4">
        <SoundPadGrid
          className="min-w-0 flex-1 [--pad-gap:0.5rem]"
          columns={4}
          hotkeyScope="global"
          hotkeys
        >
          {slots.map((slot, i) => (
            <SoundPad
              accent="var(--primary)"
              aria-label={`Sample ${slot.name}, ${MODE_LABEL[slot.mode]}, key ${SAMPLER_HOTKEYS[i].toUpperCase()}`}
              className={cn(
                "border border-pad-outline bg-background hover:border-foreground hover:bg-background data-playing:border-signal data-playing:bg-signal data-playing:text-on-signal data-playing:ring-0",
                dropTarget === i && "border-signal"
              )}
              disabled={slot.status === "empty" || slot.status === "error"}
              hotkey={SAMPLER_HOTKEYS[i]}
              key={i}
              loading={slot.status === "loading"}
              mode={slot.mode}
              onContextMenu={(e) => {
                e.preventDefault();
                sampler.setMode(i, nextMode(slot.mode));
              }}
              onDragLeave={() => setDropTarget(null)}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDropTarget(i);
              }}
              onDrop={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                setDropTarget(null);
                const file = e.dataTransfer.files[0];
                if (file) await sampler.loadFile(i, await file.arrayBuffer(), file.name.replace(/\.[^.]+$/, ""));
              }}
              onStop={() => sampler.stop(i)}
              onTrigger={() => sampler.trigger(i)}
              playing={slot.playing}
              size="sm"
            >
              <SoundPadShortcut className="rounded-none" />
              <span className="relative font-mono text-[11px] tracking-[0.11em] uppercase opacity-80">
                {slot.status === "error" ? "Error" : MODE_LABEL[slot.mode]}
              </span>
              <SoundPadLabel className="font-mono text-xs font-semibold tracking-[0.05em] uppercase">{slot.name}</SoundPadLabel>
              <SoundPadProgress source={progress[i]} />
            </SoundPad>
          ))}
        </SoundPadGrid>
        <DjKnob
          defaultValue={-3}
          format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(0)} dB`}
          label="Vol"
          max={6}
          min={-30}
          onChange={(v) => sampler.setVolume(v)}
          scope="Sampler"
          step={0.5}
        />
      </div>
    </section>
  );
};
