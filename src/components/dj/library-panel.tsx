import { useRef, useState } from "react";

import {
  TrackList,
  TrackListItem,
  TrackListItemActions,
  TrackListItemContent,
  TrackListItemDescription,
  TrackListItemDuration,
  TrackListItemIndex,
  TrackListItemTitle,
} from "@/components/ui/track-list";
import { useCloud } from "@/cloud/context";
import { useEngine } from "@/engine/context";
import type { DeckId } from "@/engine/deck";
import { camelotLabel, keyName, keysCompatible } from "@/engine/key";
import type { LibraryTrack } from "@/engine/engine";
import { useStore } from "@/engine/store";
import { cn } from "@/lib/utils";
import { native } from "@/native";

import { CloudBar } from "./cloud-bar";
import { Pad } from "./pad";
import { StorageCheck } from "./storage-check";
import { CAPTION, formatClock } from "./theme";

const percent = (p?: number) => `${Math.round((p ?? 0) * 100)}%`;

const cloudLabel = (t: LibraryTrack) => {
  switch (t.cloud) {
    case "synced":
      return "In cloud";
    case "uploading":
      return `Uploading ${percent(t.progress)}`;
    case "downloading":
      return `Downloading ${percent(t.progress)}`;
    case "remote":
      return "Cloud only, download to play";
    default:
      return null;
  }
};

const COLUMNS = "grid grid-cols-[2rem_1fr_5rem_8rem_4rem_8rem] gap-3";

/** Library row: DESIGN.md `track-title`, `track-meta`, `readout-small`, and `key-match`. */
export const LibraryPanel = () => {
  const engine = useEngine();
  const cloud = useCloud();
  const { library } = useStore(engine);
  const deckA = useStore(engine.decks.A);
  const deckB = useStore(engine.decks.B);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  // Harmonic matches are judged against what is playing, or else what is loaded.
  const playingDecks = (["A", "B"] as const).filter((d) => (d === "A" ? deckA : deckB).playing);
  const referenceKeys = (playingDecks.length > 0 ? playingDecks : (["A", "B"] as const))
    .map((d) => engine.decks[d].effectiveKey)
    .filter((k) => k !== null);

  const pending = library.filter((t) => t.status === "queued" || t.status === "analyzing").length;
  const failed = library.filter((t) => t.status === "error").length;
  const status =
    library.length === 0
      ? "Library is empty."
      : `${library.length - pending - failed} tracks ready${pending ? `, ${pending} analyzing` : ""}${failed ? `, ${failed} failed to load` : ""}.`;

  const onDeck = (id: string): DeckId[] =>
    (["A", "B"] as const).filter((d) => (d === "A" ? deckA : deckB).track?.id === id);

  return (
    <section
      aria-label="Library"
      className={cn(
        "flex min-h-0 flex-col gap-3 bg-background p-4",
        dragging && "outline-2 -outline-offset-2 outline-signal outline-dashed"
      )}
      onDragLeave={() => setDragging(false)}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        engine.addFiles(e.dataTransfer.files);
      }}
    >
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className={CAPTION}>Library</h2>
        <p aria-live="polite" className="text-xs text-text-secondary" role="status">
          {status} Drop audio files here.
        </p>
        <div className="ml-auto flex gap-2">
          <Pad onClick={() => engine.addDemoTracks()} size="sm">
            + Demo tracks
          </Pad>
          <Pad
            onClick={async () => {
              if (native) engine.addNativeFiles(await native.pickAudio("files"));
              else inputRef.current?.click();
            }}
            size="sm"
          >
            + Add files
          </Pad>
          {native && (
            <Pad onClick={async () => engine.addNativeFiles(await native!.pickAudio("folder"))} size="sm">
              + Import folder
            </Pad>
          )}
          <input
            accept="audio/*"
            aria-label="Add audio files"
            className="hidden"
            multiple
            onChange={(e) => {
              if (e.target.files) engine.addFiles(e.target.files);
              e.target.value = "";
            }}
            ref={inputRef}
            type="file"
          />
        </div>
        <StorageCheck />
      </div>

      <div className="border-y border-divider py-3">
        <CloudBar />
      </div>

      <div className={cn(COLUMNS, "border-b border-divider px-2 pb-2", CAPTION)}>
        <span>#</span>
        <span>Title</span>
        <span className="text-right">BPM</span>
        <span className="text-right">Key</span>
        <span className="text-right">Time</span>
        <span className="text-right">Load</span>
      </div>

      {library.length === 0 ? (
        <div className="grid flex-1 place-items-center py-8 text-center text-sm text-text-secondary">
          <div>
            Drop MP3, WAV, or FLAC files here, or add the demo tracks.
            <div className="mt-1 text-xs text-text-tertiary">Audio stays on this computer.</div>
          </div>
        </div>
      ) : (
        <TrackList className="min-h-0 overflow-y-auto" size="sm">
          {library.map((t, i) => {
            const decks = onDeck(t.id);
            const playing = decks.some((d) => (d === "A" ? deckA : deckB).playing);
            const key = t.analysis?.key ?? t.key ?? null;
            const cloudText = cloudLabel(t);
            const match = key !== null && referenceKeys.some((k) => keysCompatible(k, key));
            return (
              <TrackListItem
                active={selected === t.id}
                className={cn(COLUMNS, "rounded-none data-active:bg-surface-control")}
                disabled={t.status !== "ready" && t.status !== "remote"}
                key={t.id}
                onDoubleClick={() => {
                  const target = !deckA.playing ? "A" : !deckB.playing ? "B" : null;
                  if (target) void engine.loadToDeck(t.id, target);
                }}
                onSelect={() => setSelected(t.id)}
                playing={playing}
              >
                <TrackListItemIndex>{i + 1}</TrackListItemIndex>
                <TrackListItemContent>
                  <TrackListItemTitle className="flex items-center gap-2">
                    {t.title}
                    {decks.map((d) => (
                      <span className="border border-foreground px-1 font-mono text-[11px] font-bold" key={d}>
                        <span className="sr-only">On deck </span>
                        {d}
                      </span>
                    ))}
                  </TrackListItemTitle>
                  <TrackListItemDescription className={cn(t.status === "error" && "text-destructive")}>
                    {t.status === "queued"
                      ? "Waiting to analyze"
                      : t.status === "analyzing"
                        ? "Analyzing"
                        : t.status === "error"
                          ? `Load failed: ${t.error}`
                          : [t.artist || "Unknown artist", cloudText].filter(Boolean).join(" · ")}
                  </TrackListItemDescription>
                </TrackListItemContent>
                <span className="text-right font-mono text-[13px] font-medium tabular-nums">
                  {t.bpm ? t.bpm.toFixed(2) : "--"}
                </span>
                <span className="flex items-center justify-end gap-1.5 font-mono text-[13px] font-medium tabular-nums">
                  {key ? `${camelotLabel(key)} ${keyName(key)}` : "--"}
                  {match && (
                    <span className="bg-signal px-1 text-[11px] tracking-[0.11em] text-on-signal uppercase">Match</span>
                  )}
                </span>
                <TrackListItemDuration className="text-right text-text-secondary">
                  {t.duration ? formatClock(t.duration).slice(0, 5) : "--"}
                </TrackListItemDuration>
                <TrackListItemActions className="justify-end">
                  {t.status === "remote" ? (
                    <Pad
                      aria-label={`Download ${t.title}`}
                      disabled={t.cloud === "downloading"}
                      onClick={() => void cloud.downloadOne(t.id).catch(() => engine.updateTrack(t.id, { cloud: "remote", progress: undefined }))}
                      size="sm"
                    >
                      {t.cloud === "downloading" ? percent(t.progress) : "Download"}
                    </Pad>
                  ) : (["A", "B"] as const).map((d) => (
                    <Pad
                      aria-label={`Load ${t.title} on deck ${d}`}
                      disabled={t.status !== "ready"}
                      key={d}
                      onClick={() => void engine.loadToDeck(t.id, d)}
                      size="sm"
                    >
                      ▸ {d}
                    </Pad>
                  ))}
                </TrackListItemActions>
              </TrackListItem>
            );
          })}
        </TrackList>
      )}
    </section>
  );
};
