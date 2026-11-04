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
import { CloudProvider } from "@/cloud/context";
import { CloudSync } from "@/cloud/sync";
import { EngineProvider } from "@/engine/context";
import type { DeckId } from "@/engine/deck";
import { Engine } from "@/engine/engine";
import { native } from "@/native";

const AUTO_LOOP_BEATS = 4;

/** One deck's keys, mirrored around the keyboard like djay Pro's default layout. */
const deckKeys = (id: DeckId, keys: { play: string; sync: string; back: string; forward: string; fx: string; cue: string; hotCues: string[]; loop: string; half: string; double: string }) => {
  const deck = (e: Engine) => e.decks[id];
  const map: Record<string, (e: Engine) => void> = {
    [keys.play]: (e) => deck(e).togglePlay(),
    [keys.sync]: (e) => deck(e).syncTo(e.other(id)),
    [keys.back]: (e) => deck(e).beatJump(-4),
    [keys.forward]: (e) => deck(e).beatJump(4),
    [keys.fx]: (e) => deck(e).setFx({ on: !deck(e).getSnapshot().fx.on }),
    [keys.cue]: (e) => deck(e).cuePress(),
    [keys.loop]: (e) => {
      const d = deck(e);
      if (d.getSnapshot().loop) d.exitLoop();
      else d.setLoop(AUTO_LOOP_BEATS);
    },
    [keys.half]: (e) => deck(e).scaleLoop(0.5),
    [keys.double]: (e) => deck(e).scaleLoop(2),
  };
  keys.hotCues.forEach((key, i) => {
    map[key] = (e) => deck(e).hotCue(i);
  });
  return map;
};

/** djay Pro's default keyboard shortcuts (keys without modifiers). */
const SHORTCUTS: Record<string, (e: Engine) => void> = {
  ...deckKeys("A", { back: "3", cue: "q", double: "d", forward: "4", fx: "5", half: "s", hotCues: ["w", "e", "r", "t"], loop: "a", play: "1", sync: "2" }),
  ...deckKeys("B", { back: "7", cue: "p", double: "k", forward: "8", fx: "6", half: "j", hotCues: ["o", "i", "u", "y"], loop: "l", play: "0", sync: "9" }),
  ArrowLeft: (e) => e.setCrossfader(Math.max(-1, e.getSnapshot().crossfader - 0.1)),
  ArrowRight: (e) => e.setCrossfader(Math.min(1, e.getSnapshot().crossfader + 0.1)),
  f: (e) => e.setCrossfader(0),
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
const cloud = new CloudSync(engine);
if (import.meta.env.DEV) Object.assign(window, { opendeck: engine, opendeckCloud: cloud });

const App = () => {
  useShortcuts(engine);

  return (
    <EngineProvider engine={engine}>
      <CloudProvider cloud={cloud}>
      <div className="min-h-svh bg-background p-4 text-foreground">
        <div className="flex flex-col gap-px border border-divider bg-divider">
          <header className="flex items-center gap-4 bg-background px-4 py-3">
            <h1 className="font-mono text-sm font-bold tracking-[0.15em] uppercase">OpenDeck</h1>
            <span className={`${CAPTION} whitespace-nowrap`}>{native ? "Desktop" : "Web"} prototype</span>
            <p className="hidden truncate font-mono text-[11px] text-text-tertiary min-[1700px]:block">
              djay layout · A: 1 play · 2 sync · Q cue · W-T hot cues · A loop | B: 0 play · 9 sync · P cue · O-Y hot cues · L loop | ←/→ F crossfader | X-M sampler
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
      </CloudProvider>
    </EngineProvider>
  );
};

export default App;
