---
version: alpha
name: OpenDeck
description: Booth-utility DJ console. Flat black, white text, one acid-yellow signal color, square corners, and large numeric readouts.
x-zsd:
  profile: "0.1"
  kind: project
  source:
    method: hybrid
    captured: 2026-11-03
    paths:
      - docs/design-brief.md
      - src/index.css
      - src/components/dj
      - src/components/ui
  review:
    status: draft
  intent:
    audience: DJs who mix two tracks live with a mouse, a keyboard, or a touch screen.
    primary-task: Prepare, match, and mix two tracks without stopping the audio.
    character: Equipment screen. Monochrome surfaces, one signal color, numeric readouts on a rigid grid.
    density: compact
    theme: dark
    references:
      - Teenage Engineering products (visual character)
      - CDJ and DJM displays (readout hierarchy)
      - Pioneer rekordbox (waveform colors and Camelot keys)
  preferences:
    must-use:
      - Flat black surfaces and white text.
      - Acid yellow as the only interface signal color.
      - A rigid grid with thin dividers between areas.
      - Square corners on all controls.
      - Very large BPM numerals.
      - audiocn components for faders, knobs, meters, waveforms, LCD readouts, and sampler pads.
    must-avoid:
      - Cards, panel boxes, and rounded corners.
      - Glow and colored shadows.
      - Accent colors other than the signal color for interface state.
      - State that only color shows.
      - Text below 4.5:1 contrast on its actual surface.
    preserve:
      - Rekordbox-style three-band waveform colors.
      - Camelot notation for musical keys.
  implementation:
    token-source: src/index.css
    component-sources:
      - src/components/dj
      - src/components/ui
    style-sources:
      - src/index.css
      - src/components/dj/theme.ts
    font-assets:
      - "@fontsource-variable/geist"
      - "@fontsource-variable/geist-mono"
    image-assets: []
    icon-assets:
      - lucide-react (select chevrons only)
  unresolved:
    - Proposed in the brief. Meter zones and waveform bands keep data colors. The developer did not confirm this yet.
    - Proposed in the brief. Hot cues and decks use numbers, letters, and position in place of colors.
    - Light mode. Not requested.
    - Touch-screen target size above pad-height.
    - Tablet and phone layouts below x-zsd.layout.console-min.
  layout:
    console-min: 1200px
    grid-columns: 12
  breakpoints:
    xl: 1280px
  border:
    width-default: 1px
    color-default: "{colors.divider}"
    color-control: "{colors.outline}"
  motion:
    duration-fast: 80ms
    easing-standard: linear
  accessibility:
    target-min: "{spacing.pad-height}"
    focus-width: 2px
    focus-offset: 2px
    focus-color: "{colors.primary}"
colors:
  primary: "#E5FF00"
  on-primary: "#000000"
  surface: "#000000"
  on-surface: "#FFFFFF"
  surface-control: "#111111"
  on-surface-control: "#FFFFFF"
  set: "#FFFFFF"
  on-set: "#000000"
  text-secondary: "#B3B3B3"
  text-tertiary: "#8F8F8F"
  outline: "#6E6E6E"
  divider: "#2E2E2E"
  error: "#FF6467"
  on-error: "#000000"
  meter-ok: "#00D492"
  meter-warn: "#FDC700"
  meter-clip: "#FF6467"
  waveform-low: "#1D4ED8"
  waveform-mid: "#F59E0B"
  waveform-high: "#F8FAFC"
typography:
  headline-sm:
    fontFamily: "Geist Mono Variable, ui-monospace, monospace"
    fontSize: 14px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: 2px
  readout-xl:
    fontFamily: "Geist Mono Variable, ui-monospace, monospace"
    fontSize: 64px
    fontWeight: 500
    lineHeight: 1
    letterSpacing: -2px
  readout-lg:
    fontFamily: "Geist Mono Variable, ui-monospace, monospace"
    fontSize: 24px
    fontWeight: 500
    lineHeight: 1.1
    letterSpacing: 0px
  readout-md:
    fontFamily: "Geist Mono Variable, ui-monospace, monospace"
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: 0px
  title-md:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: -0.2px
  body-md:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: 0px
  body-sm:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.35
    letterSpacing: 0px
  label-md:
    fontFamily: "Geist Mono Variable, ui-monospace, monospace"
    fontSize: 12px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: 0.6px
  label-sm:
    fontFamily: "Geist Mono Variable, ui-monospace, monospace"
    fontSize: 11px
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: 1.2px
spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  pad-height: 40px
  pad-height-lg: 56px
  waveform-row: 112px
rounded:
  none: 0px
  full: 9999px
components:
  pad:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.label-md}"
    rounded: "{rounded.none}"
    padding: "{spacing.xs}"
    height: "{spacing.pad-height}"
  pad-active:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.none}"
    padding: "{spacing.xs}"
    height: "{spacing.pad-height}"
  pad-set:
    backgroundColor: "{colors.set}"
    textColor: "{colors.on-set}"
    typography: "{typography.label-md}"
    rounded: "{rounded.none}"
    padding: "{spacing.xs}"
    height: "{spacing.pad-height}"
  pad-transport:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.label-md}"
    rounded: "{rounded.none}"
    padding: "{spacing.xs}"
    height: "{spacing.pad-height-lg}"
  pad-outline:
    backgroundColor: "{colors.outline}"
  control-track:
    backgroundColor: "{colors.surface-control}"
    textColor: "{colors.on-surface-control}"
    rounded: "{rounded.none}"
  readout-bpm:
    textColor: "{colors.on-surface}"
    typography: "{typography.readout-xl}"
  readout-value:
    textColor: "{colors.on-surface}"
    typography: "{typography.readout-lg}"
  readout-small:
    textColor: "{colors.on-surface}"
    typography: "{typography.readout-md}"
  readout-caption:
    textColor: "{colors.text-tertiary}"
    typography: "{typography.label-sm}"
  track-title:
    textColor: "{colors.on-surface}"
    typography: "{typography.title-md}"
  track-meta:
    textColor: "{colors.text-secondary}"
    typography: "{typography.body-sm}"
  divider-line:
    backgroundColor: "{colors.divider}"
  key-match:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.none}"
  key-clash:
    backgroundColor: "{colors.error}"
    textColor: "{colors.on-error}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.none}"
  meter-ok:
    backgroundColor: "{colors.meter-ok}"
  meter-warn:
    backgroundColor: "{colors.meter-warn}"
  meter-clip:
    backgroundColor: "{colors.meter-clip}"
  waveform-band-low:
    backgroundColor: "{colors.waveform-low}"
  waveform-band-mid:
    backgroundColor: "{colors.waveform-mid}"
  waveform-band-high:
    backgroundColor: "{colors.waveform-high}"
  waveform-strip:
    backgroundColor: "{colors.surface}"
    height: "{spacing.waveform-row}"
  dot-beat:
    backgroundColor: "{colors.primary}"
    rounded: "{rounded.full}"
  page-text:
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
  page-title:
    textColor: "{colors.on-surface}"
    typography: "{typography.headline-sm}"
  pad-label:
    textColor: "{colors.on-surface}"
    typography: "{typography.label-md}"
---

# OpenDeck

## Overview

OpenDeck is a two-deck DJ console. DJs use it to load, match, and mix two tracks live.
The interface looks like equipment: flat black, white text, and one yellow signal color.
Thin dividers on a grid separate the areas. Large numerals show tempo, key, and time.
The source brief is `docs/design-brief.md`.

## Colors

- `primary`: Use for active state, the playhead, and the focus outline. It is the only interface signal color.
- `on-primary`: Use for text on `primary` surfaces.
- `surface`: Use for the page and for pads in the off state.
- `on-surface`: Use for main text and pad labels.
- `surface-control`, `on-surface-control`: Use for fader and knob tracks.
- `set`, `on-set`: Use for a hot cue that contains a cue point.
- `text-secondary`: Use for artist names and secondary readouts.
- `text-tertiary`: Use for section labels and readout captions.
- `outline`: Use for pad boundaries.
- `divider`: Use for the lines between areas.
- `error`, `on-error`: Use for key clashes, load errors, and clip state.
- `meter-ok`, `meter-warn`, `meter-clip`: Use only for level zones in meters.
- `waveform-low`, `waveform-mid`, `waveform-high`: Use only for the three frequency bands of the zoomed waveform.

## Typography

- `headline-sm`: Use for the product name. Write it in uppercase.
- `readout-xl`: Use for the BPM of each deck.
- `readout-lg`: Use for key, bar, and remaining time.
- `readout-md`: Use for knob values, pitch, and table numbers.
- `title-md`: Use for the track title on a deck.
- `body-md`: Use as the page base text.
- `body-sm`: Use for artist names and hints.
- `label-md`: Use for pad labels. Write them in uppercase.
- `label-sm`: Use for section labels and readout captions. Write them in uppercase.

Use tabular figures for all numbers that change during playback.

## Layout

Use a grid of `x-zsd.layout.grid-columns` columns. Put these rows from top to bottom:

1. Top bar: product name, audio outputs, shortcut help.
2. Readout row: deck A in the left half, deck B in the right half.
3. Waveform row: deck A above deck B, full width.
4. Control row: deck A controls, the mixer in the center, deck B controls.
5. Performance row: FX of deck A, the sampler, FX of deck B.
6. Library, in its own scroll region.

Deck B is a mirror of deck A. Its transport pads are on the outer edge.
Use `md` for page padding and `xs` between pads. Use `lg` between groups in one area.

### Responsive behavior

The desktop window does not go below `x-zsd.layout.console-min`.
Below the `xl` breakpoint, stack the three columns of each row.

## Elevation & Depth

Do not use shadows or surface steps. Show hierarchy with position, size, and dividers.
Apply `x-zsd.border.width-default` with `divider` between areas.

## Shapes

- `none`: Use for all pads, tracks, badges, and areas.
- `full`: Use only for beat dots and phrase dots.

## Components

### Pad

Use `pad` for actions in the off state, with `pad-outline` as the boundary and `pad-label` for text.
Use `pad-active` when the function is on. Use `pad-set` for a hot cue with a cue point.
Use `pad-transport` for play and cue.
Toggle pads expose their state with `aria-pressed`.

- On hover, change the boundary to `on-surface`.
- On focus, show the focus outline from Accessibility.
- On press, invert the pad colors while the pointer is down.
- When a pad cannot operate, show the label in `text-tertiary` and keep the boundary.

### Control

Use `control-track` for faders and knobs. Use `primary` for the value fill.

### Readout

Use `readout-bpm`, `readout-value`, `readout-small`, and `readout-caption` for deck readouts.
Put the caption above its value.

### Track

Use `track-title` for the track title and `track-meta` for the artist name.

### Divider

Use `divider-line` between rows and columns. Do not draw a box around one area.

### Key

Use `key-match` when the keys of the two decks are compatible, with the text MATCH.
Use `key-clash` when they are not compatible, with the text CLASH.

### Meter

Use `meter-ok`, `meter-warn`, and `meter-clip` for level zones.

### Waveform

Use `waveform-strip` for each zoomed waveform.
Use `waveform-band-low`, `waveform-band-mid`, and `waveform-band-high` for the bands.
Show the playhead with `primary` at the horizontal center.

### Dot

Use `dot-beat` for the current beat and the current bar in a phrase.

### Page

Use `page-text` for base text and `page-title` for the product name.

## Do's and Don'ts

- Do keep `primary` as the only interface signal color.
- Do show the state of a pad with text, fill, and `aria-pressed`.
- Do align all areas to the grid and separate them with dividers.
- Do use named tokens for repeated values.
- Do not use rounded corners, cards, or shadows.
- Do not use colors to identify decks or hot cues. Use letters and numbers.
- Do not put text below 4.5:1 contrast on a surface.

## Motion

Use `x-zsd.motion.duration-fast` with `x-zsd.motion.easing-standard` for pad state changes.
The waveform scroll, the beat dots, and the meters show audio time. Do not add other motion.
With reduced motion, change pad states immediately.

## Iconography

Use text labels and transport symbols. Use `lucide-react` icons only for select chevrons.

## Accessibility

Use `x-zsd.accessibility.focus-width`, `x-zsd.accessibility.focus-offset`, and `x-zsd.accessibility.focus-color` for the focus outline on all controls.
Keep pads at `x-zsd.accessibility.target-min` or larger.
Give each control an accessible name that includes the deck.
Give the zoomed waveform keyboard control: arrows nudge the position, plus and minus change the zoom.
Announce library analysis results and load errors in a status region.

### Review checks

Check contrast of all text on black, focus on each control, and the mirrored deck B.
