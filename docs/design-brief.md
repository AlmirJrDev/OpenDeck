# OpenDeck design brief: booth utility

Date: 2026-11-03
Source: developer instructions in the Claude Code session of 2026-11-03.

## Audience and primary task

- Audience: DJs who mix two tracks live with a mouse, a keyboard, or a touch screen. Source: project data (`DESIGN.md`, 2026-11-03).
- Primary task: prepare, match, and mix two tracks without stopping the audio. Source: project data.
- Use condition: dark booths and clubs. The DJ reads tempo, key, and position from a distance. Status: proposed.

## Problem statement

The developer said that the current interface looks like "AI slop".
Recorded causes in the current interface (source: `DESIGN.md` extraction and accessibility review, 2026-11-03):

- Rounded cards around each area.
- A colored shadow around each active pad.
- Many unrelated accent colors: deck cyan, deck orange, effect purple, quantize lime, eight hot cue colors.
- Generic gray text tokens with low contrast on small labels.

## Developer selections

| Selection | Source |
|---|---|
| Direction "booth utility" (Teenage Engineering and equipment-screen character). | Developer, option "Utilitário de cabine" |
| Flat black surfaces. | Developer |
| White text. | Developer |
| One signal color: acid yellow. | Developer |
| Rigid grid. | Developer |
| Very large BPM numerals. | Developer |
| Thin dividers in place of cards. | Developer |
| Square corners. | Developer |
| No glow and no cards. | Developer |
| Change the layout, not only the style. | Developer, option "Repensar layout" |
| Keep the audiocn components. | Developer (earlier instruction) |
| Correct the accessibility defects from the review of 2026-11-03. | Developer instruction for this task |

## References

- Teenage Engineering products: monochrome surfaces, one signal color, numeric displays, grid alignment. Function: visual character.
- DJ equipment screens (CDJ and DJM displays): large tempo and time readouts. Function: readout hierarchy.
- Pioneer rekordbox: three-band waveform colors and Camelot keys. Function: audio data encoding. Source: `DESIGN.md` `preserve`.

## Selections to keep

- Rekordbox-style three-band waveform colors. Source: `DESIGN.md` `preserve`.
- Camelot notation for keys. Source: `DESIGN.md` `preserve`.
- Meter zone colors (ok, warn, clip). They show signal level, not interface state. Status: proposed.
- All current functions, keyboard shortcuts, and audiocn components.

## Selections to prevent

- Rounded cards, panel boxes, and colored shadows.
- Purple, cyan, orange, lime, and pink as interface colors.
- Text below 4.5:1 contrast on its actual surface.
- Focus indicators below 3:1 contrast.
- State that only color shows.

## Resolved difference

"One signal color" and the current color-coded functions cannot both apply.
Proposed resolution (status: proposed, the developer can change it):

1. Yellow is the only interface signal color. It marks active state, the playhead, and the focus outline.
2. Audio data keeps functional colors: waveform bands and meter zones.
3. Hot cues show their number. A set hot cue is white. An empty hot cue has an outline only.
4. Deck A and deck B show their letter and their position. They do not have an accent color.
5. Key compatibility shows a symbol and text (MATCH or CLASH) in addition to color.

## Proposed layout

Status: proposed.

1. Top bar: product name (h1), audio outputs, shortcut help.
2. Readout row: deck A and deck B status in two halves. Large BPM numerals, key, bar, remaining time, title.
3. Waveform row: the two zoomed waveforms at full width, deck A above deck B.
4. Control row: deck A controls, the mixer in the center, deck B controls (mirror).
5. Performance row: FX A, the sampler, FX B.
6. Library at the bottom, in its own scroll region.

Dividers separate the rows and columns. No area has its own box.

## Proposed values

Status: proposed. Final values go in `DESIGN.md`.

- Surface black, text white, secondary text light gray with 7:1 contrast or more.
- Signal yellow near #E5FF00 with black text on it.
- Readout numerals in a monospace face, tabular figures.
- Corner radius 0 for all controls.

## Unresolved

- Light mode: not requested. The design is dark only.
- Touch-screen target size above the current pad height.
- Tablet and phone layouts below the console width.
