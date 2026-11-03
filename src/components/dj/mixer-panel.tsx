import { Fader, FaderRange, FaderThumb, FaderTrack } from "@/components/ui/fader";
import { Knob, KnobDial, KnobLabel, KnobPointer, KnobRange, KnobTrack, KnobValue } from "@/components/ui/knob";
import { LevelMeter } from "@/components/ui/level-meter";
import { useEngine } from "@/engine/context";
import type { Deck } from "@/engine/deck";
import { useStore } from "@/engine/store";

import { Pad } from "./pad";
import { CAPTION } from "./theme";

const formatDb = (v: number) => (v <= -25.9 ? "KILL" : `${v > 0 ? "+" : ""}${v.toFixed(1)}`);

const formatFilter = (v: number) => {
  if (Math.abs(v) < 0.01) return "OFF";
  return v < 0 ? `LP ${Math.round(-v * 100)}` : `HP ${Math.round(v * 100)}`;
};

interface DjKnobProps {
  label: string;
  /** Prefix for the accessible name, for example "Deck A". */
  scope: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
  defaultValue?: number;
}

/** DESIGN.md `control-track` knob with `readout-caption` label and `readout-small` value. */
export const DjKnob = ({ label, scope, min, max, step, format, onChange, defaultValue = 0 }: DjKnobProps) => (
  <Knob
    defaultValue={defaultValue}
    format={format}
    largeStep={step * 10}
    max={max}
    min={min}
    onValueChange={onChange}
    origin={Math.min(Math.max(0, min), max)}
    resetValue={defaultValue}
    size="sm"
    step={step}
  >
    <KnobLabel className={CAPTION}>
      <span className="sr-only">{scope} </span>
      {label}
    </KnobLabel>
    <KnobDial>
      <KnobTrack />
      <KnobRange />
      <KnobPointer />
    </KnobDial>
    <KnobValue className="font-mono text-[13px] font-medium text-foreground" />
  </Knob>
);

const ChannelStrip = ({ deck }: { deck: Deck }) => {
  const engine = useEngine();
  const { cue } = useStore(engine);
  const scope = `Deck ${deck.id}`;
  return (
    <div className="flex flex-col items-center gap-3">
      <span className="font-mono text-sm font-bold tracking-[0.15em]">{deck.id}</span>
      <div className="grid grid-cols-2 items-start gap-x-3 gap-y-2">
      <DjKnob format={formatDb} label="Trim" max={12} min={-12} onChange={(v) => deck.setTrim(v)} scope={scope} step={0.5} />
      <DjKnob format={formatDb} label="Hi" max={6} min={-26} onChange={(v) => deck.setEq("high", v)} scope={scope} step={0.5} />
      <DjKnob format={formatDb} label="Mid" max={6} min={-26} onChange={(v) => deck.setEq("mid", v)} scope={scope} step={0.5} />
      <DjKnob format={formatDb} label="Low" max={6} min={-26} onChange={(v) => deck.setEq("low", v)} scope={scope} step={0.5} />
      <DjKnob format={formatFilter} label="Filter" max={1} min={-1} onChange={(v) => deck.setFilter(v)} scope={scope} step={0.01} />
      </div>
      <Pad
        active={cue[deck.id]}
        aria-label={`${scope} headphone cue`}
        className="w-full"
        onClick={() => engine.toggleCue(deck.id)}
        toggle
      >
        Cue
      </Pad>
      <div className="flex h-36 items-stretch gap-2">
        <Fader
          aria-label={`${scope} channel volume`}
          className="h-full"
          defaultValue={0}
          max={0}
          min={-60}
          onValueChange={(v) => deck.setVolume(v)}
          orientation="vertical"
          silenceAtMin
          size="lg"
          taper="audio"
          variant="console"
        >
          <FaderTrack>
            <FaderRange />
            <FaderThumb />
          </FaderTrack>
        </Fader>
        <LevelMeter
          aria-label={`${scope} level`}
          className="h-full"
          orientation="vertical"
          segments={22}
          source={deck.meterTap.meter}
          variant="segmented"
        />
      </div>
    </div>
  );
};

/** Center column of the control row: two channel strips, master, phones and crossfader. */
export const MixerPanel = () => {
  const engine = useEngine();
  const { crossfader } = useStore(engine);

  return (
    <section aria-label="Mixer" className="flex flex-col items-center gap-4 bg-background p-4">
      <div className="flex gap-5">
        <ChannelStrip deck={engine.decks.A} />
        <div className="flex flex-col items-center gap-3 border-x border-divider px-4">
          <span className={CAPTION}>Master</span>
          <DjKnob format={formatDb} label="Gain" max={6} min={-24} onChange={(v) => engine.setMasterGain(v)} scope="Master" step={0.5} />
          <DjKnob
            format={(v) => (v < 0.02 ? "CUE" : v > 0.98 ? "MST" : `${Math.round(v * 100)}%`)}
            label="Cue/Mst"
            max={1}
            min={0}
            onChange={(v) => engine.setCueMix(v)}
            scope="Headphones"
            step={0.01}
          />
          <DjKnob format={formatDb} label="Phones" max={6} min={-40} onChange={(v) => engine.setPhonesGain(v)} scope="Headphones" step={0.5} />
          <LevelMeter
            aria-label="Master level"
            className="min-h-0 flex-1"
            orientation="vertical"
            segments={28}
            source={engine.masterTap.meter}
            variant="segmented"
          />
        </div>
        <ChannelStrip deck={engine.decks.B} />
      </div>
      <div className="flex w-full items-center gap-3">
        <span className="font-mono text-sm font-bold">A</span>
        <Fader
          aria-label="Crossfader"
          className="flex-1"
          detents={[0]}
          fineStep={0.005}
          format={(v) => (v === 0 ? "Center" : v < 0 ? `A ${Math.round(-v * 100)}%` : `B ${Math.round(v * 100)}%`)}
          largeStep={0.25}
          max={1}
          min={-1}
          onValueChange={(v) => engine.setCrossfader(v)}
          orientation="horizontal"
          origin={0}
          resetValue={0}
          size="lg"
          step={0.01}
          value={crossfader}
          variant="console"
        >
          <FaderTrack>
            <FaderRange />
            <FaderThumb />
          </FaderTrack>
        </Fader>
        <span className="font-mono text-sm font-bold">B</span>
      </div>
    </section>
  );
};
