import { useEffect } from "react";

import { AudioSetup } from "@/components/dj/audio-setup";
import { DeckControls } from "@/components/dj/deck-controls";
import { DeckReadout } from "@/components/dj/deck-readout";
import { FxPanel } from "@/components/dj/fx-panel";
import { LibraryPanel } from "@/components/dj/library-panel";
import { MixerPanel } from "@/components/dj/mixer-panel";
import { SamplerPanel } from "@/components/dj/sampler-panel";
import { CAPTION } from "@/components/dj/theme";
import { ZoomWaveform } from "@/components/dj/zoom-waveform";
import { EngineProvider } from "@/engine/context";
import { Engine } from "@/engine/engine";
import { native } from "@/native";

const SHORTCUTS: Record<string, (e: Engine) => void> = {
  z: (e) => e.decks.A.togglePlay(),
  x: (e) => e.decks.A.cuePress(),
  c: (e) => e.decks.A.syncTo(e.decks.B),
  m: (e) => e.decks.B.togglePlay(),
  n: (e) => e.decks.B.cuePress(),
  b: (e) => e.decks.B.syncTo(e.decks.A),
  "1": (e) => e.decks.A.hotCue(0),
  "2": (e) => e.decks.A.hotCue(1),
  "3": (e) => e.decks.A.hotCue(2),
  "4": (e) => e.decks.A.hotCue(3),
  "7": (e) => e.decks.B.hotCue(0),
  "8": (e) => e.decks.B.hotCue(1),
  "9": (e) => e.decks.B.hotCue(2),
  "0": (e) => e.decks.B.hotCue(3),
  ArrowLeft: (e) => e.setCrossfader(Math.max(-1, e.getSnapshot().crossfader - 0.1)),
  ArrowRight: (e) => e.setCrossfader(Math.min(1, e.getSnapshot().crossfader + 0.1)),
};

const useShortcuts = (engine: Engine) => {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const { target } = event;
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      if (target instanceof Element && target.closest("input, textarea, [contenteditable], [role=slider]")) return;
      const action = SHORTCUTS[event.key.length === 1 ? event.key.toLowerCase() : event.key];
      if (!action) return;
      event.preventDefault();
      action(engine);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [engine]);
};

const engine = new Engine();
if (import.meta.env.DEV) Object.assign(window, { opendeck: engine });

const App = () => {
  useShortcuts(engine);

  return (
    <EngineProvider engine={engine}>
      <div className="min-h-svh bg-background p-4 text-foreground">
        <div className="flex flex-col gap-px border border-divider bg-divider">
          <header className="flex items-center gap-4 bg-background px-4 py-3">
            <h1 className="font-mono text-sm font-bold tracking-[0.15em] uppercase">OpenDeck</h1>
            <span className={`${CAPTION} whitespace-nowrap`}>{native ? "Desktop" : "Web"} prototype</span>
            <p className="hidden truncate font-mono text-[11px] text-text-tertiary min-[1700px]:block">
              A: Z play · X cue · C sync · 1-4 hot cues | B: M play · N cue · B sync · 7-0 hot cues | ←/→ crossfader | Q-I sampler
            </p>
            <div className="ml-auto">
              <AudioSetup />
            </div>
          </header>

          <div className="grid grid-cols-1 gap-px xl:grid-cols-2">
            <DeckReadout deck={engine.decks.A} />
            <DeckReadout deck={engine.decks.B} mirrored />
          </div>

          {(["A", "B"] as const).map((id) => (
            <div className="relative h-28 bg-background" key={id}>
              <span aria-hidden className="pointer-events-none absolute top-1 left-2 z-10 font-mono text-[11px] font-bold">
                {id}
              </span>
              <ZoomWaveform deck={engine.decks[id]} />
            </div>
          ))}

          <div className="grid grid-cols-1 gap-px xl:grid-cols-[1fr_auto_1fr]">
            <DeckControls deck={engine.decks.A} />
            <MixerPanel />
            <DeckControls deck={engine.decks.B} mirrored />
          </div>

          <div className="grid grid-cols-1 gap-px xl:grid-cols-[1fr_minmax(0,1.15fr)_1fr]">
            <FxPanel deck={engine.decks.A} mirrored={false} />
            <SamplerPanel />
            <FxPanel deck={engine.decks.B} mirrored />
          </div>

          <LibraryPanel />
        </div>
      </div>
    </EngineProvider>
  );
};

export default App;
