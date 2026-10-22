---
name: infographic
description: Build explanatory figures — stat cards, step strips, comparison panels, proportion bars and strips, tables, 2×2 matrices, timelines — as self-contained SVG from a small JSON spec. Use when a finding, a decision, a process or a set of numbers would land better as a picture than as a paragraph, and when the shape is NOT nodes-and-edges (that is archify or Mermaid).
---

# Infographic

Turn an explanation into a figure. One JSON spec in, one self-contained SVG out, zero
dependencies. Ten block types, one file, ~1,000 lines you own.

## When this fires, and when it does not

| The shape | Use |
|---|---|
| Boxes joined by arrows — components, services, data flowing between systems | **archify** |
| A flowchart, sequence or state machine | **Mermaid** (renders natively in artifacts and chat) |
| Labels pointing at parts of a photo or diagram | **a small callout script** (labels over an image, ~150 lines of SVG math) |
| **Headline numbers, a sequence of steps, two things compared, proportions, a small table, a 2×2, a dated timeline** | **this skill** |

That last row is the gap. archify and Mermaid do nodes-and-edges; neither does a stat
card, a step strip, a comparison panel, a labelled bar or a table. Confirmed by the
~90-repo sweep on 2026-09-14.

## Run it

```bash
node scripts/infographic.js spec.json > figure.svg
node scripts/infographic.js spec.json --dark > figure.svg
node scripts/infographic.js --example > spec.json    # one real, focused figure
node scripts/infographic.js --gallery > gallery.json # every block once — the self-test
node scripts/infographic.js --contrast               # WCAG table for both palettes
```

Light is the default **because these get printed**, the same reason workshop cut
sheets are light-on-white. `--dark` only for something that will only ever be on screen.

## Look at it before you ship it

Never ship a layout you have not seen rendered. The Browser pane cannot zoom into a local
file, and a bare `.svg` cannot be screenshotted, so use Edge — already on this box — in
headless mode. Inline the SVG in an HTML file, then:

```bash
printf '<!doctype html><meta charset="utf-8"><style>html,body{margin:0}svg{display:block;width:1100px;height:auto}</style>' > figure.html
cat figure.svg >> figure.html
"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --disable-gpu --hide-scrollbars \
  --window-size=1100,1400 --screenshot="$PWD/figure.png" "file:///$PWD/figure.html"
```

Set the window height to the SVG's `viewBox` height (it is in the first line of the file).
Then `Read` the PNG. For a tall figure, `ffmpeg -i figure.png -vf "crop=1100:900:0:0" tile.png`
cuts it into readable tiles. This is also how you get a PNG for an email; a PDF is
Edge's Print → Save as PDF. No rendering dependency for either.

## The spec

A title and a stack of blocks, rendered top to bottom. Every block takes an optional
`heading` (above) and `caption` (below, muted). Nothing else is required.

```json
{
  "title": "Seeding works: 4 of 185 shared memory files have drifted",
  "subtitle": "647 memory files across six scoped sessions",
  "width": 1100,
  "source": "node tools/wiring-check.js --drift — 2026-09-15",
  "blocks": [ ... ]
}
```

| Block | Shape | Fields |
|---|---|---|
| `stats` | Headline numbers in equal panels; wraps into even rows past four | `items: [{value, label, sub?, accent?}]` — `sub` is the comparison that gives the number meaning ("vs 1.992 on the chart"); `accent: false` sets the value in ink; long values shrink instead of wrapping |
| `steps` | Numbered discs on a rail — vertical, or `direction: "row"` for a process strip across the page | `items: [{title, body?}]` |
| `compare` | Side-by-side panels | `columns: [{heading?, accent?, items: []}]` — an item starting `+ ` gets a tick, `- ` a cross, anything else a bullet |
| `bars` | Labelled horizontal bars from a drawn zero baseline | `items: [{label, value, display?, muted?, estimate?}]`, `max?`, `maxLabel?`, `highlight?` (index or label, or a list — everything else goes grey), `sort?: "desc"\|"asc"`. Negative values get a diverging baseline. A value above `max` is a spec error, never a clipped bar |
| `stack` | One proportion strip — the honest part-to-whole | `items: [{label, value, display?}]`, `total?` (default: the sum; a shortfall is drawn as `restLabel`, default "Other"), `highlight?` (index or label; default the first) |
| `table` | Header row, hairlines, numbers right-aligned in tabular digits | `columns: []`, `rows: [[...]]`, `highlight?: rowIndex` |
| `matrix` | A 2×2 | `axes: {x: [left, right], y: [top, bottom]}`, `cells: [{heading?, items?}] × 4` in reading order, `highlight?: cellIndex` |
| `timeline` | Dated events on a horizontal rail, evenly spaced, wrapping past `perRow` (5) | `items: [{date?, title, body?}]` |
| `note` | One full-width emphasis panel | `text`, `label?` (an eyebrow: "Caveat", "Assumption", "Next"), `tone?: "caveat"` draws it dashed with no accent bar, so a hedge never looks like a finding |
| `row` | Any blocks side by side | `blocks: [...]`, `widths?: [2, 1]` (relative) |

`--example` is a real figure using four of them; `--gallery` exercises all ten and every
honesty feature. Start from whichever is closer.

## Rules that make the figure good rather than merely correct

- **The title states the finding; the subtitle says what, where and when.** "4 of 185
  shared files have drifted", not "Memory drift". Titles and text are what readers
  actually recall from a figure (Borkin et al. 2016, IEEE TVCG — eye-tracking on 393
  figures) and every Economist / FT / Knaflic makeover starts there.
- **A figure carries one idea.** Four blocks is a lot. If you need six, you have two figures.
- **`source` is not optional in practice.** People check things. A figure with no path,
  command or date on it is a claim he cannot verify; the script warns on stderr when it is
  missing. Put the command that produced the numbers in it.
- **Grey everything, then colour the one thing that matters.** `highlight` on `bars` and
  `stack` does exactly that. The accent is a pointer, not decoration: when every bar is
  orange, none of them is.
- **Bars start at zero, always, and the baseline is drawn.** A truncated axis exaggerates
  the perceived effect even when the chart flags the truncation (Correll, Bertini &
  Franconeri, CHI 2020 — crowd-sourced experiments). When the numbers are parts of a
  total, set `max` to the total so 45% cannot look like 100%; the scale is printed under
  the track either way.
- **Never let a figure launder a guess as a measurement.** `estimate: true` hatches the
  bar and adds a legend line. Put "est." in `display` too. A `note` with `tone: "caveat"`
  is for the sentence that qualifies the whole figure.
- **Never invent a number to fill a `stats` panel.** If you only measured two things,
  show two.
- **Part-to-whole is a strip, not a donut.** Length judgements beat angle and area
  judgements (Cleveland & McGill 1984; replicated by Heer & Bostock 2010). That is why
  there is a `stack` block and no `donut`.
- **Text is not auto-wrapped by SVG**, so the generator wraps by hand from measured
  glyph widths. A token longer than a line (a path, a URL) is hard-broken rather than
  overflowing; `\n` forces a line break. Titles and headings are balanced so no word is
  orphaned on its own line.
- **Print arithmetic.** At the default 1100 px width printed across a US-letter page,
  1 px ≈ 0.49 pt: body 19 px ≈ 9.3 pt, small 16 px ≈ 7.8 pt — right at the 8 pt floor
  print guides give for captions. **`width` is the print-size lever**: `900` makes every
  size ~20% larger on paper at the cost of more wrapping. Dark mode is the exception —
  ask what happens when it is printed.

## Style

The one knob is the `S` and `LIGHT`/`DARK` blocks at the top of the script. They move
together — raising `bodySize` without raising the widths just wraps text into more lines
instead of making it read bigger. That trap already cost a round on `callout.js`, where
the note was *"if the labels were a little bit bigger, it'd be perfect"* and the fix
was font size **and** lane width.

Colour roles, and the numbers behind them (`--contrast` reprints the whole table):

- `accent` `#ff6a3d` — the accent orange, for **fills and marks only**: bars, discs,
  the title rule. As text on white it is 2.85:1, below WCAG's 3:1 floor even for large
  text, so it is never used as text on light.
- `accentText` `#c94112` — the same family, dark enough to be text (4.9:1 on white,
  4.6:1 on a panel). Stat values, accent headings, timeline dates. On dark, the brand
  orange itself clears 4.5:1 and is used directly.
- `mutedFill` `#8a8a8a` — a de-emphasised bar, 3.2:1 against its track. The old grey was
  1.32:1, i.e. invisible; nobody had measured it.
- `ink` / `muted` — 17.4:1 and 6.9:1 on white. `rule` is for hairlines and rails only.

After any palette change: run `--contrast`, paste the table into the commit.

## Why there is no dependency here

The sweep found the honest answer and it was "nothing worth installing":

- **`antvis/Infographic`** (MIT, ★6,645) — a DSL over ~200 pre-built SVG templates, the
  closest real thing. Rejected: installing 200 templates to use four is not worth an
  audit. Its template families — list, sequence, compare, hierarchy, relation, quadrant,
  chart — are the same shapes as the blocks above, which is reassuring, not a reason.
- **The "AI infographic generator" genre**, roughly a dozen repos — a prompt wrapped
  around an image model.
- **~8 infographic wrappers had no LICENSE file at all** — all rights reserved by default.

**And no headless-browser dependency in the generator.** SVG's `text-anchor` hands glyph
measurement to whatever renderer opens the file; we control the layout, so a browser is
only needed to turn SVG into pixels — and Edge is already on the box for that (above).
Playwright would have been ~120 MB of browser binaries, a logged download and an
audit, to avoid arithmetic we are doing anyway.

