# OpenDeck

Open-source DJ software prototype (in the spirit of djay Pro / Rekordbox), built with
React, Web Audio and [audiocn](https://audiocn.dev) components. Runs in the browser or as a
desktop app (Electron).

## Run

| Command | What it does |
| --- | --- |
| `npm run dev` | Web version at http://localhost:5173 |
| `npm run electron:dev` | Desktop app with hot reload |
| `npm run electron:preview` | Desktop app from a production build |
| `npm run dist` | Unpacked Windows app in `release/win-unpacked/OpenDeck.exe` |
| `npm run dist:installer` | Windows installer (NSIS) in `release/` |

Click **+ Demo tracks** (procedurally generated house loops at
124/128/120 BPM) or drop your own MP3/WAV/FLAC files on the library.

## What works

- Two decks: play/pause, CDJ-style cue, 8 hot cues, auto loops (1–16 beats, halve/double),
  beat jump, pitch fader (±8/16/50%), pitch bend, quantize
- Automatic BPM and beat-grid detection (Web Worker), sync with tempo lock and phase alignment
- Musical key detection (chroma + Krumhansl profiles) shown in Camelot notation; the library and
  deck badges turn green for harmonic matches and red for clashes, following pitch changes
- Bar counter (bar.beat), 8-bar phrase indicator and bar numbers on the waveform
- Beat FX per deck (Rekordbox style): Echo, Ping Pong, Reverb, Flanger, Phaser, Trans, Roll and
  Crush, tempo-synced (¼–4 beats) with level and on/off; Trans and Roll start on the next beat,
  echo-type tails ring out after switching off; Vinyl Brake slows the deck to a stop
- Sampler: 8 pads (Air Horn, Siren, Laser, Riser, Impact, Rewind, Snare Roll, Scratch) on keys
  Q–I, with one-shot / hold / loop / toggle modes (right-click to change); drop any audio file
  on a pad to replace its sound
- Scrolling 3-band waveform (low/mid/high) with beat grid; drag to scrub, wheel to zoom
- Mixer: trim, 3-band EQ with kill, one-knob filter (LP/HP), channel faders, equal-power
  crossfader, master gain with limiter, level meters
- Headphone cue: per-channel CUE (pre-fader), cue/master mix and phones level, sent to a
  second audio device; master output device selection
- Desktop app: import a whole music folder or pick files with the native dialog; tracks are
  analysed in a background queue and decoded again when loaded, so large libraries fit in memory
- Storage check: **Check folder size** measures a music folder (sizes only, no upload) and shows
  whether it fits the free tier of Cloudflare R2, Vercel Blob or Supabase Storage, the monthly
  cost and download cost per computer otherwise, and the upload time. Prices live in
  `src/storage/plans.ts` with the date they were checked
- Cloud library: sign in, upload your music to Cloudflare R2 once, and download it on other
  computers into a local cache that plays offline. Track list, BPM, key and cue points sync
  through Supabase. Setup: [docs/cloud-setup.md](docs/cloud-setup.md)
- Keyboard: `Z`/`X`/`C` play/cue/sync A · `M`/`N`/`B` play/cue/sync B · `1-4` / `7-0` hot cues ·
  `←`/`→` crossfader · `Q`–`I` sampler pads

## Layout

| Path | What it is |
| --- | --- |
| `api/` | Vercel functions: signed R2 upload and download links |
| `supabase/` | Database schema for the cloud library |
| `src/cloud/` | Sign-in, sync, local cache |
| `electron/` | Desktop shell: window, `app://` protocol, file dialogs, permissions |
| `src/engine/` | Audio engine: `deck.ts`, `engine.ts` (mixer, library), `analysis.ts` (BPM, waveforms) |
| `src/components/dj/` | DJ UI: decks, mixer, library, zoomed waveform |
| `src/components/ui/`, `src/hooks/`, `src/lib/` | audiocn components and audio core (shadcn registry) |

## Roadmap

- MIDI controllers (Web MIDI is already allowed in the desktop app)
- Split-cable cue mode (cue on the left channel, master on the right) for single-output laptops
- Key lock (time-stretch without pitch change) via SoundTouch/Rubber Band in an AudioWorklet
- Playlists and crates in the cloud library
- Recording the mix, FX on the master, saving custom sampler banks
