#!/usr/bin/env node
/**
 * infographic.js — explanatory figures: stat cards, step strips, comparison panels,
 * proportion bars and strips, tables, 2×2 matrices, timelines. One JSON spec in, one
 * self-contained SVG out. Zero dependencies.
 *
 * WHY THIS EXISTS, and why it is not a dependency (sweep of ~90 repos, 2026-09-14,
 * written up at the time):
 *
 *   - archify and Mermaid do nodes-and-edges. They do NOT do step strips, comparison
 *     panels, stat cards or labelled lists. That is a real gap, and the sweep said so.
 *   - `antvis/Infographic` (MIT, 6.6k) is the closest real thing: a DSL over ~200
 *     pre-built SVG templates. Rejected — installing 200 templates to use four is not
 *     worth an audit, and each template you would actually use is 150-250 lines of SVG.
 *     Its template families (list-, sequence-, compare-, hierarchy-, relation-,
 *     quadrant, chart-) are the same shapes as the blocks below, which is reassuring.
 *   - The whole "AI infographic generator" genre is a prompt wrapped around an image
 *     model. One needed n8n + Gemini + Cloudinary to emit a single PNG. Dismissed.
 *   - ~8 infographic wrappers had NO LICENSE at all — all rights reserved by default.
 *
 * WHY NO HEADLESS BROWSER. The sweep's own note said to steal the "DSL -> HTML ->
 * Playwright screenshot" mechanism, because it outsources text layout to a browser
 * engine. That is right for repos rendering ARBITRARY user HTML. It is wrong here, for
 * the reason an earlier callout script already established: SVG's own text-anchor
 * hands glyph measurement to whatever renderer opens the file. We control the layout,
 * so the browser is only needed to turn SVG into PNG — and Edge's Print -> Save as PDF
 * already covers that. Playwright would have been ~120 MB of browser binaries, a
 * logged download and an audit, to avoid arithmetic we are doing anyway.
 *
 * WHAT CHANGED 2026-09-15 (design-craft pass; evidence and grades in
 * a design-review hand-off):
 *
 *   - CONTRAST WAS BROKEN and nobody had measured it. The accent orange as TEXT on
 *     white is 2.85:1 — below WCAG's 3:1 floor even for large text — and the old
 *     "muted" bar fill (#d8d8d8 on #f6f6f4) was 1.32:1, i.e. invisible. Text that was
 *     orange is now `accentText` (#c94112, 4.9:1 on white, 4.6:1 on a panel); fills and
 *     marks keep the brand #ff6a3d. Muted bars use `mutedFill` (3.2:1 vs the track).
 *     `--contrast` re-runs the whole table so a palette change cannot regress silently.
 *   - DATA HONESTY in `bars`: the zero baseline is always drawn; `max` pins the scale
 *     to a total so 45% cannot look like 100%; values beyond `max` are a spec error,
 *     not a clipped bar; negatives get a proper diverging baseline; `estimate: true`
 *     hatches the bar and adds a legend line. Correll, Bertini & Franconeri (CHI 2020)
 *     found a truncated axis exaggerates perceived effect size even when the chart
 *     flags the truncation — so the baseline is not optional here.
 *   - `stack` (one proportion strip) instead of a donut. Position/length judgements
 *     beat angle/area judgements in Cleveland & McGill 1984 and the Heer & Bostock 2010
 *     replication; a strip is the honest part-to-whole form.
 *   - `row` composes any blocks side by side; `steps` takes `direction: "row"`;
 *     `table`, `matrix` (2×2) and `timeline` are new. `stats` wraps past four panels.
 *   - Type moved up one notch (body 18→19, small 15→16, title 34→36, stat 46→48) after
 *     the print arithmetic: an 1100-wide figure printed across a US-letter page puts
 *     1 px at ~0.49 pt, so 15 px small text was 7.4 pt — under the 8 pt floor the print
 *     guides give for captions. `width` is the print-size lever (900 = ~20% larger).
 *   - Wrap widths are weight-aware. Measured on this box (Chromium, Segoe UI): average
 *     advance 0.448 em regular, 0.462 semibold, 0.479 bold; the constants below keep a
 *     margin for Helvetica/Arial, which run wider. Tokens longer than a line (paths,
 *     URLs) are hard-broken instead of overflowing; "\n" forces a line break.
 *
 * Usage:
 *   node infographic.js spec.json > figure.svg
 *   node infographic.js spec.json --dark > figure.svg     # screen, not print
 *   node infographic.js --example > spec.json              # one real, focused figure
 *   node infographic.js --gallery > gallery.json           # every block type, exercised
 *   node infographic.js --contrast                         # WCAG table for both palettes
 *
 * The spec — a title and a stack of blocks, rendered top to bottom:
 *
 *   {
 *     "title":    "Seeding works: 4 of 185 shared memory files have drifted",
 *     "subtitle": "647 files, six scoped sessions",             // what / where / when
 *     "width":    1100,                                          // optional, default 1100
 *     "source":   "node tools/wiring-check.js --drift — 2026-09-15",
 *     "blocks": [
 *       { "type": "stats",    "items": [ {"value": "647", "label": "memory files", "sub": "six stores"} ] },
 *       { "type": "steps",    "items": [ {"title": "Isolate", "body": "fresh worktree"} ], "direction": "row" },
 *       { "type": "compare",  "columns": [ {"heading": "Engine", "items": ["+ tested", "- 19 MB"]} ] },
 *       { "type": "bars",     "items": [ {"label": "Identical", "value": 176} ], "max": 185, "maxLabel": "185 names" },
 *       { "type": "stack",    "items": [ {"label": "Identical", "value": 176} ], "total": 185 },
 *       { "type": "table",    "columns": ["Pair", "Ratio"], "rows": [["ink on white", "17.4"]], "highlight": 0 },
 *       { "type": "matrix",   "axes": {"x": ["Cheap", "Costly"], "y": ["Real gap", "Nice"]}, "cells": [4 × {heading, items}] },
 *       { "type": "timeline", "items": [ {"date": "09-14", "title": "Sweep", "body": "~90 repos"} ] },
 *       { "type": "note",     "text": "One line of emphasis.", "label": "Caveat", "tone": "caveat" },
 *       { "type": "row",      "blocks": [ {...}, {...} ], "widths": [2, 1] }
 *     ]
 *   }
 *
 * Every block takes an optional "heading" and "caption". Nothing else is required.
 * The first five block types keep their 2026-09-15-morning field names unchanged.
 */

'use strict';

const fs = require('fs');

// --- the one knob -------------------------------------------------------------
// These move together. Raising fontSize without raising the widths just wraps text
// into more lines instead of making it read bigger — the same trap callout.js hit.
// Every colour pair that carries meaning is checked by `--contrast`; run it after any
// change here and paste the table into the commit message.

const LIGHT = {
  bg: '#ffffff',          // light-on-white by default: these get PRINTED, like cut sheets
  ink: '#1a1a1a',         // 17.4:1 on bg
  muted: '#5a5a5a',       // 6.9:1 on bg, 6.4:1 on panel — secondary text
  rule: '#d8d8d8',        // hairlines and rails only: decorative, never a data mark
  panel: '#f6f6f4',       // card and track fill
  accent: '#ff6a3d',      // the accent orange — FILLS and MARKS only (2.85:1 on white)
  accentText: '#c94112',  // the same orange family, dark enough to be TEXT: 4.9:1 bg, 4.6:1 panel
  onAccent: '#1a0d07',    // digits inside an accent disc, 6.7:1
  mutedFill: '#8a8a8a',   // a de-emphasised bar: 3.2:1 against the track (WCAG 1.4.11 needs 3:1)
  stack: ['#ff6a3d', '#8a8a8a', '#b7b3ac', '#d3cfc8', '#e6e3dd'],  // proportion-strip segments, 1st = the one that matters
};

const DARK = {
  bg: '#14120f',
  ink: '#f2efe9',
  muted: '#a49e93',
  rule: '#3a352e',
  panel: '#1f1c18',
  accent: '#ff6a3d',
  accentText: '#ff6a3d',  // on dark the brand orange already clears 4.5:1 (6.6:1 bg, 6.0:1 panel)
  onAccent: '#1a0d07',
  mutedFill: '#756f66',   // 3.4:1 against the dark track
  stack: ['#ff6a3d', '#756f66', '#57524a', '#403b35', '#2e2a25'],
};

const S = {
  pad: 48,              // outer page padding
  gapBlock: 40,         // vertical space between blocks
  titleSize: 36,        // the finding, stated as a sentence
  subtitleSize: 20,     // what / where / when
  headingSize: 22,      // a block's own heading
  bodySize: 19,         // was 18; see the print arithmetic in the header
  smallSize: 16,        // was 15; labels, table cells, captions, the source line
  statValueSize: 48,    // the hero number; shrinks to fit rather than wrapping
  lineH: 1.45,          // multiplied by font size
  radius: 10,
  colGap: 24,
  barH: 26,             // thin marks; the leftover row height is air
};

// Average glyph advance per character as a fraction of font size, by weight. Measured
// 2026-09-15 with canvas.measureText on this box (Segoe UI: 0.448 / 0.462 / 0.479 for
// 400 / 600 / 700) and padded so Helvetica and Arial, which run wider, still fit.
const EM = { 400: 0.53, 600: 0.55, 700: 0.57 };

// --- text ---------------------------------------------------------------------

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const fx = n => String(Math.round(n * 10) / 10);
const emK = w => (w >= 700 ? EM[700] : w >= 600 ? EM[600] : EM[400]);
const EMPTY = { svg: '', height: 0 };
let uidCounter = 0;
const uid = p => p + (++uidCounter);

// SVG has no auto-wrap, so lines are split by hand. The renderer still does the real
// glyph placement inside each <text>; this only decides where the breaks go.
function charsThatFit(px, fontSize, weight) {
  return Math.max(6, Math.floor(px / (fontSize * emK(weight || 400))));
}

function textW(str, fontSize, weight) {
  return String(str == null ? '' : str).length * fontSize * emK(weight || 400);
}

function wrap(text, chars) {
  const out = [];
  for (const para of String(text == null ? '' : text).split(/\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = '';
    for (let w of words) {
      while (w.length > chars) {                 // a path or URL longer than a line
        if (line) { out.push(line); line = ''; }
        out.push(w.slice(0, chars));
        w = w.slice(chars);
      }
      if (!line) line = w;
      else if ((line + ' ' + w).length <= chars) line += ' ' + w;
      else { out.push(line); line = w; }
    }
    if (line || !words.length) out.push(line);  // an empty paragraph keeps its blank line
  }
  return out.length ? out : [''];
}

function textBlock(lines, x, y, size, fill, opts) {
  const o = opts || {};
  const out = [];
  const lh = size * S.lineH;
  lines.forEach((ln, i) => {
    out.push('<text x="' + fx(x) + '" y="' + fx(y + size + i * lh) + '"'
      + ' font-size="' + size + '" fill="' + fill + '"'
      + (o.weight ? ' font-weight="' + o.weight + '"' : '')
      + (o.anchor ? ' text-anchor="' + o.anchor + '"' : '')
      + (o.spacing ? ' letter-spacing="' + o.spacing + '"' : '')
      + (o.style ? ' style="' + o.style + '"' : '')
      + '>' + esc(o.upper ? String(ln).toUpperCase() : ln) + '</text>');
  });
  return { svg: out.join('\n'), height: lines.length * lh };
}

// A wrapped title with one word orphaned on its last line reads badly. Balancing finds
// the narrowest width that still needs the same number of lines (what CSS calls
// text-wrap: balance), so the lines come out roughly equal.
function wrapBalanced(text, chars) {
  const lines = wrap(text, chars);
  if (lines.length < 2) return lines;
  const n = lines.length;
  let lo = Math.ceil(String(text).length / n);
  let hi = chars;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (wrap(text, mid).length > n) lo = mid + 1; else hi = mid;
  }
  return wrap(text, hi);
}

// wrap + textBlock in one call: text that must fit a width `w`
function para(text, x, y, w, size, fill, opts) {
  const o = opts || {};
  const chars = charsThatFit(w, size, o.weight);
  return textBlock(o.balance ? wrapBalanced(text, chars) : wrap(text, chars), x, y, size, fill, o);
}

function text(x, y, str, size, fill, opts) {
  const o = opts || {};
  return '<text x="' + fx(x) + '" y="' + fx(y) + '" font-size="' + size + '" fill="' + fill + '"'
    + (o.weight ? ' font-weight="' + o.weight + '"' : '')
    + (o.anchor ? ' text-anchor="' + o.anchor + '"' : '')
    + (o.style ? ' style="' + o.style + '"' : '')
    + '>' + esc(str) + '</text>';
}

function rect(x, y, w, h, fill, rx, extra) {
  return '<rect x="' + fx(x) + '" y="' + fx(y) + '" width="' + fx(Math.max(0, w)) + '" height="'
    + fx(Math.max(0, h)) + '" rx="' + (rx == null ? S.radius : rx) + '" fill="' + fill + '"'
    + (extra ? ' ' + extra : '') + '/>';
}

function line(x1, y1, x2, y2, stroke, width) {
  return '<line x1="' + fx(x1) + '" y1="' + fx(y1) + '" x2="' + fx(x2) + '" y2="' + fx(y2)
    + '" stroke="' + stroke + '" stroke-width="' + (width || 1) + '"/>';
}

function disc(cx, cy, r, label, C) {
  return '<circle cx="' + fx(cx) + '" cy="' + fx(cy) + '" r="' + r + '" fill="' + C.accent + '"/>'
    + text(cx, cy + (S.bodySize + 2) * 0.36, label, S.bodySize + 2, C.onAccent,
      { weight: 700, anchor: 'middle' });
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function fmt(n) {
  return Number.isInteger(n) ? String(n) : String(+n.toFixed(2));
}

function pct(v, total) {
  const p = (v / total) * 100;
  if (p > 0 && p < 1) return '<1%';
  return (p < 10 ? +p.toFixed(1) : Math.round(p)) + '%';
}

// A cell that is a number (with a unit or sign) gets right-aligned, tabular digits.
const NUMERIC = /^[~≈+\-−]?[$€£]?\d[\d,]*(\.\d+)?\s*(%|x|×|pt|px|ms|s|m|h|d|k|K|M|B|pp)?$/;

// --- blocks -------------------------------------------------------------------
// Every renderer takes (block, x, y, width, C) and returns { svg, height }.
// Measuring and drawing happen in one pass on purpose: a two-pass measure/draw split
// is where these generators normally drift out of sync with themselves.

function renderSteps(block, x, y, w, C) {
  const items = block.items || [];
  if (!items.length) return EMPTY;
  if (block.direction === 'row') return renderStepsRow(items, x, y, w, C);
  const out = [];
  let cy = y;

  const numW = 54;                       // the numbered disc lane
  const textX = x + numW + 20;
  const textW_ = w - numW - 20;

  // Discs are collected, then the rail is drawn UNDER all of them in one pass. A
  // per-row connector into the inter-row gap gives a 12px stub whenever a row is only
  // as tall as its disc — correct arithmetic, weak figure. One rail reads as a sequence.
  const discs = [];

  items.forEach((it, i) => {
    const tb = para(it.title || '', textX, cy, textW_, S.bodySize, C.ink, { weight: 600 });
    const bb = it.body
      ? para(it.body, textX, cy + tb.height + 4, textW_, S.smallSize, C.muted)
      : EMPTY;

    const rowH = Math.max(numW, tb.height + (bb.height ? bb.height + 4 : 0));
    discs.push({ cy: cy + Math.min(numW, rowH) / 2, n: i + 1 });

    out.push(tb.svg);
    if (bb.svg) out.push(bb.svg);
    cy += rowH + S.colGap;
  });

  const dx = x + numW / 2;
  const rail = discs.length > 1
    ? line(dx, discs[0].cy, dx, discs[discs.length - 1].cy, C.rule, 3) + '\n'
    : '';
  const marks = discs.map(d => disc(dx, d.cy, numW / 2, d.n, C)).join('\n');

  return { svg: rail + marks + '\n' + out.join('\n'), height: cy - y - S.colGap };
}

// The classic process strip: discs on a horizontal rail, a column of text under each.
// Uses the page width instead of stacking; right for 3–5 short steps.
function renderStepsRow(items, x, y, w, C) {
  const n = items.length;
  const cw = (w - S.colGap * (n - 1)) / n;
  const r = 27;
  const parts = [];
  let maxH = 0;

  items.forEach((it, i) => {
    const cx = x + i * (cw + S.colGap);
    let cy = y + r * 2 + 16;
    const tb = para(it.title || '', cx, cy, cw, S.bodySize, C.ink, { weight: 600 });
    parts.push(tb.svg);
    cy += tb.height;
    if (it.body) {
      const bb = para(it.body, cx, cy + 4, cw, S.smallSize, C.muted);
      parts.push(bb.svg);
      cy += 4 + bb.height;
    }
    maxH = Math.max(maxH, cy - y);
  });

  const dy = y + r;
  const rail = n > 1 ? line(x + r, dy, x + (n - 1) * (cw + S.colGap) + r, dy, C.rule, 3) : '';
  const discs = items.map((_, i) => disc(x + i * (cw + S.colGap) + r, dy, r, i + 1, C)).join('\n');
  return { svg: rail + '\n' + discs + '\n' + parts.join('\n'), height: maxH };
}

function renderStats(block, x, y, w, C) {
  const items = block.items || [];
  if (!items.length) return EMPTY;
  const perRow = Math.max(1, Number(block.perRow) || 4);
  // past perRow, split into even rows (six panels become 3 + 3, not 4 + 2)
  const rowsNeeded = Math.ceil(items.length / perRow);
  const parts = [];
  let cy = y;

  for (const row of chunk(items, Math.ceil(items.length / rowsNeeded))) {
    const n = row.length;
    const cw = (w - S.colGap * (n - 1)) / n;
    const cells = [];
    let maxH = 0;

    row.forEach((it, i) => {
      const cx = x + i * (cw + S.colGap);
      const inner = cw - 32;
      const mid = cx + cw / 2;
      const val = String(it.value == null ? '' : it.value);
      // The hero number never wraps: it shrinks to fit the panel instead. Digits are
      // wider than letters (0.575 em bold, measured), hence the 0.62 here.
      const vs = Math.max(24, Math.min(S.statValueSize, Math.floor(inner / (Math.max(1, val.length) * 0.62))));
      const vb = textBlock([val], mid, cy + 20, vs, it.accent === false ? C.ink : C.accentText,
        { weight: 700, anchor: 'middle' });
      // reading order: the number, what it counts (ink), then the comparison that gives
      // it meaning (muted) — "vs 3.2% in July"
      const lb = para(it.label || '', mid, cy + 20 + vb.height + 2, inner, S.smallSize, C.ink,
        { anchor: 'middle' });
      let h = 20 + vb.height + 2 + lb.height;
      let sb = null;
      if (it.sub) {
        sb = para(it.sub, mid, cy + h + 4, inner, S.smallSize, C.muted, { anchor: 'middle' });
        h += 4 + sb.height;
      }
      h += 20;
      maxH = Math.max(maxH, h);
      cells.push({ cx, cw, svg: vb.svg + '\n' + lb.svg + (sb ? '\n' + sb.svg : '') });
    });

    parts.push(cells.map(c => rect(c.cx, cy, c.cw, maxH, C.panel) + '\n' + c.svg).join('\n'));
    cy += maxH + S.colGap;
  }
  return { svg: parts.join('\n'), height: cy - y - S.colGap };
}

function renderCompare(block, x, y, w, C) {
  const cols = block.columns || [];
  if (!cols.length) return EMPTY;
  const n = cols.length;
  const cw = (w - S.colGap * (n - 1)) / n;
  const rendered = [];
  let maxH = 0;

  cols.forEach((col, i) => {
    const cx = x + i * (cw + S.colGap);
    const px = cx + 18;
    const inner = cw - 36;
    const parts = [];
    let cy = y + 18;

    if (col.heading) {
      const hb = para(col.heading, px, cy, inner, S.bodySize, col.accent ? C.accentText : C.ink,
        { weight: 700 });
      parts.push(hb.svg);
      cy += hb.height + 10;
      parts.push(line(px, cy, px + inner, cy, C.rule, 1));
      cy += 14;
    }

    for (const raw of (col.items || [])) {
      // "+ text" renders as a tick, "- text" as a cross; anything else as a bullet.
      const m = /^([+\-])\s+(.*)$/.exec(String(raw));
      const mark = m ? m[1] : null;
      const body = m ? m[2] : String(raw);
      const bx = px + 24;
      const bw = inner - 24;
      const tb = para(body, bx, cy, bw, S.smallSize, C.ink);
      const gy = cy + S.smallSize * 0.95;
      if (mark === '+') {
        parts.push('<path d="M' + fx(px) + ' ' + fx(gy) + ' l4.5 5.5 l9 -11" fill="none" stroke="'
          + C.accent + '" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>');
      } else if (mark === '-') {
        parts.push('<path d="M' + fx(px + 1) + ' ' + fx(gy - 5) + ' l11 11 M' + fx(px + 12) + ' '
          + fx(gy - 5) + ' l-11 11" fill="none" stroke="' + C.muted
          + '" stroke-width="2.6" stroke-linecap="round"/>');
      } else {
        parts.push('<circle cx="' + fx(px + 6) + '" cy="' + fx(gy) + '" r="3.5" fill="' + C.muted + '"/>');
      }
      parts.push(tb.svg);
      cy += tb.height + 10;
    }

    const h = cy - y + 8;
    maxH = Math.max(maxH, h);
    rendered.push({ cx, cw, svg: parts.join('\n') });
  });

  const svg = rendered.map(r => rect(r.cx, y, r.cw, maxH, C.panel) + '\n' + r.svg).join('\n');
  return { svg, height: maxH };
}

// A bar with a rounded data-end and a square baseline end, so a short bar reads as a
// bar and not a pill, and every bar visibly starts on the baseline.
function barPath(zeroX, y, len, h, neg, fill) {
  const r = Math.min(4, len / 2);
  const flat = fx(len - r);
  const d = neg
    ? 'M' + fx(zeroX) + ' ' + fx(y) + ' h-' + flat + ' a' + r + ' ' + r + ' 0 0 0 -' + r + ' ' + r
      + ' v' + fx(h - 2 * r) + ' a' + r + ' ' + r + ' 0 0 0 ' + r + ' ' + r + ' h' + flat + ' z'
    : 'M' + fx(zeroX) + ' ' + fx(y) + ' h' + flat + ' a' + r + ' ' + r + ' 0 0 1 ' + r + ' ' + r
      + ' v' + fx(h - 2 * r) + ' a' + r + ' ' + r + ' 0 0 1 -' + r + ' ' + r + ' h-' + flat + ' z';
  return '<path d="' + d + '" fill="' + fill + '"/>';
}

function renderBars(block, x, y, w, C) {
  let items = (block.items || []).map(it => Object.assign({}, it, { v: Number(it.value) || 0 }));
  if (!items.length) return EMPTY;
  // "Grey everything, then colour the one thing that matters" (Knaflic; Datawrapper's
  // grey rule): `highlight` names the bars that stay accent; every other bar is muted.
  if (block.highlight != null) {
    const keep = new Set([].concat(block.highlight).map(String));
    items = items.map((it, i) => Object.assign({}, it, { muted: !(keep.has(String(i)) || keep.has(String(it.label))) }));
  }
  if (block.sort === 'desc') items = items.slice().sort((a, b) => b.v - a.v);
  else if (block.sort === 'asc') items = items.slice().sort((a, b) => a.v - b.v);

  const hasNeg = items.some(it => it.v < 0);
  const maxAbs = Math.max(...items.map(it => Math.abs(it.v)));
  let hi = block.max != null ? Number(block.max) : maxAbs;
  if (!(hi > 0)) hi = 1;
  if (maxAbs > hi * (1 + 1e-9)) {
    throw new Error('bars: a value (' + fmt(maxAbs) + ') exceeds max ' + fmt(hi)
      + ' — a clipped bar would understate it; raise max or drop the item');
  }
  const lo = hasNeg ? -hi : 0;                       // negatives get a symmetric scale

  const labelW = Math.min(300, Math.round(w * 0.3));
  const valueW = Math.max(60, ...items.map(it =>
    textW(it.display != null ? it.display : fmt(it.v), S.smallSize, 600) + 14));
  const trackX = x + labelW + 16;
  const trackW = w - labelW - 16 - valueW - 8;
  const zeroX = trackX + ((0 - lo) / (hi - lo)) * trackW;
  const rowGap = 14;
  const lh = S.smallSize * S.lineH;
  const out = [];
  let cy = y;
  let anyEstimate = false;

  for (const it of items) {
    const lines = wrap(it.label || '', charsThatFit(labelW, S.smallSize, 400));
    const rowH = Math.max(S.barH, lines.length * lh);
    const by = cy + (rowH - S.barH) / 2;
    out.push(textBlock(lines, x, cy + (rowH - lines.length * lh) / 2 - 2, S.smallSize, C.ink).svg);
    out.push(rect(trackX, by, trackW, S.barH, C.panel, 4));
    const len = (Math.abs(it.v) / (hi - lo)) * trackW;
    if (len > 0) {
      const fill = it.estimate
        ? 'url(#' + (it.muted ? 'hatchMuted' : 'hatchAccent') + ')'
        : (it.muted ? C.mutedFill : C.accent);
      out.push(barPath(zeroX, by, len, S.barH, it.v < 0, fill));
      if (it.estimate) anyEstimate = true;
    }
    out.push(text(trackX + trackW + 8 + valueW - 6, by + S.barH / 2 + S.smallSize * 0.36,
      it.display != null ? it.display : fmt(it.v), S.smallSize, C.ink, { weight: 600, anchor: 'end' }));
    cy += rowH + rowGap;
  }
  cy -= rowGap;

  // The baseline is always drawn and always at zero. Bars scale to `max` when given,
  // otherwise to the largest value — and then the scale is printed, so the reader can
  // see whether the longest bar means "100%" or "the biggest of these".
  out.push(line(zeroX, y - 2, zeroX, cy + 2, C.muted, 1.5));
  cy += 8;
  const ty = cy + S.smallSize;
  if (hasNeg) out.push(text(trackX, ty, '−' + fmt(hi), S.smallSize, C.muted));
  out.push(text(zeroX, ty, '0', S.smallSize, C.muted, { anchor: hasNeg ? 'middle' : 'start' }));
  out.push(text(trackX + trackW, ty,
    block.maxLabel != null ? block.maxLabel
      : (block.max != null || hasNeg ? fmt(hi) : fmt(hi) + ' = largest'),
    S.smallSize, C.muted, { anchor: 'end' }));
  cy += lh;

  if (anyEstimate) {
    cy += 6;
    out.push('<rect x="' + fx(x) + '" y="' + fx(cy + 3) + '" width="26" height="14" rx="3" fill="url(#hatchAccent)"/>');
    out.push(text(x + 34, cy + 3 + 12, 'hatched = estimate, not a measurement', S.smallSize, C.muted));
    cy += lh;
  }
  return { svg: out.join('\n'), height: cy - y };
}

// One strip, the whole is the width. Part-to-whole without the angle judgements a
// donut asks for. Segment labels sit under the strip and stagger into extra rows when
// a segment is narrower than its label, with a tick back to the segment they belong to.
function renderStack(block, x, y, w, C) {
  const items = (block.items || []).map(it => Object.assign({}, it, { v: Math.max(0, Number(it.value) || 0) }));
  if (!items.length) return EMPTY;
  const sum = items.reduce((a, it) => a + it.v, 0);
  const total = block.total != null ? Number(block.total) : sum;
  if (!(total > 0)) return EMPTY;
  if (sum > total * (1 + 1e-9)) throw new Error('stack: the parts (' + fmt(sum) + ') exceed total ' + fmt(total));

  const h = 34;
  const gap = 2;
  // `highlight` (index or label) names the segment that is the finding: it gets the
  // accent, everything else takes the greys in order. Default: the first segment.
  let hiIdx = 0;
  if (block.highlight != null) {
    const k = String(block.highlight);
    const byLabel = items.findIndex(it => String(it.label) === k);
    hiIdx = byLabel >= 0 ? byLabel : (Number.isInteger(Number(k)) ? Number(k) : 0);
  }
  const clip = uid('clip');
  const out = [];
  out.push('<clipPath id="' + clip + '">' + rect(x, y, w, h, '#000', 5) + '</clipPath>');
  out.push(rect(x, y, w, h, C.panel, 5));
  out.push('<g clip-path="url(#' + clip + ')">');
  let cx = x;
  let grey = 1;
  const segs = [];
  items.forEach((it, i) => {
    const sw = (it.v / total) * w;
    const fill = i === hiIdx ? C.stack[0] : C.stack[Math.min(grey++, C.stack.length - 1)];
    if (sw > 0) out.push(rect(cx + (i ? gap : 0), y, sw - (i ? gap : 0), h, fill, 0));
    segs.push({ x: cx, w: sw, label: it.label || '', value: it.display != null ? it.display : pct(it.v, total) });
    cx += sw;
  });
  out.push('</g>');
  if (total - sum > total * 1e-9 && block.restLabel !== false) {
    segs.push({ x: cx, w: x + w - cx, label: block.restLabel || 'Other', value: pct(total - sum, total) });
  }

  const lh = S.smallSize * S.lineH;
  const rowH = lh * 2 + 8;
  const rowsEnd = [];
  let maxRow = 0;
  const placed = [];
  for (const s of segs) {
    const need = Math.max(textW(s.label, S.smallSize, 600), textW(s.value, S.smallSize, 400)) + 12;
    const lx = Math.min(s.x + 6, x + w - need);      // never past the right edge
    let r = 0;
    while (r < rowsEnd.length && rowsEnd[r] > lx - 12) r++;
    rowsEnd[r] = lx + need;
    maxRow = Math.max(maxRow, r);
    placed.push({ x: s.x, w: s.w, lx, need, row: r, label: s.label, value: s.value });
  }
  for (const p of placed) {
    const ly = y + h + 10 + p.row * rowH;
    // the tick drops from inside the segment to the top of its label row; if that
    // x runs through a label in an earlier row, slide it right within the segment
    let tx = p.x + 1;
    for (const q of placed) {
      if (q.row < p.row && tx >= q.lx - 2 && tx <= q.lx + q.need + 2) {
        tx = Math.min(p.x + Math.max(1, p.w - 1), q.lx + q.need + 3);
      }
    }
    out.push(line(tx, y + h, tx, ly, C.muted, 1));
    out.push(text(p.lx, ly + S.smallSize, p.label, S.smallSize, C.ink, { weight: 600 }));
    out.push(text(p.lx, ly + S.smallSize + lh, p.value, S.smallSize, C.muted));
  }
  return { svg: out.join('\n'), height: h + 10 + (maxRow + 1) * rowH };
}

function renderNote(block, x, y, w, C) {
  const caveat = block.tone === 'caveat';
  const parts = [];
  let cy = y + 18;
  if (block.label) {   // an eyebrow: CAVEAT, ASSUMPTION, NEXT — says what kind of claim this is
    const t = textBlock([String(block.label)], x + 24, cy, 15, caveat ? C.muted : C.accentText,
      { weight: 700, spacing: 1.2, upper: true });
    parts.push(t.svg);
    cy += t.height + 2;
  }
  const tb = para(block.text || '', x + 24, cy, w - 48, S.bodySize, C.ink);
  parts.push(tb.svg);
  cy += tb.height;
  const h = cy - y + 18;
  // A caveat is drawn dashed — the projection/uncertainty convention — with no accent
  // bar, so a hedge never looks like a finding.
  const box = caveat
    ? '<rect x="' + fx(x + 1) + '" y="' + fx(y + 1) + '" width="' + fx(w - 2) + '" height="' + fx(h - 2)
      + '" rx="' + S.radius + '" fill="none" stroke="' + C.muted + '" stroke-width="1.5" stroke-dasharray="7 5"/>'
    : rect(x, y, w, h, C.panel) + '<rect x="' + fx(x) + '" y="' + fx(y) + '" width="5" height="' + fx(h)
      + '" rx="2.5" fill="' + C.accent + '"/>';
  return { svg: box + '\n' + parts.join('\n'), height: h };
}

// Header row, hairlines between rows, numbers right-aligned with tabular digits.
// Column widths follow content length, clamped so one long cell cannot starve the rest.
function renderTable(block, x, y, w, C) {
  const cols = (block.columns || []).map(c => String(c == null ? '' : c));
  const rows = (block.rows || []).map(r => (Array.isArray(r) ? r : [r]).map(c => String(c == null ? '' : c)));
  const nc = Math.max(cols.length, ...rows.map(r => r.length), 0);
  if (!nc) return EMPTY;
  const padX = 12;
  const weights = [];
  for (let j = 0; j < nc; j++) {
    let m = (cols[j] || '').length;
    for (const r of rows) m = Math.max(m, (r[j] || '').length);
    weights.push(Math.min(36, Math.max(5, m)));
  }
  const sum = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map(k => ((w - padX * 2 * nc) * k) / sum);
  const numeric = [];
  for (let j = 0; j < nc; j++) {
    numeric.push(rows.length > 0 && rows.some(r => r[j]) && rows.every(r => !r[j] || NUMERIC.test(r[j].trim())));
  }
  const xs = [];
  let cx = x;
  for (let j = 0; j < nc; j++) { xs.push(cx); cx += widths[j] + padX * 2; }
  const cellX = j => (numeric[j] ? xs[j] + padX + widths[j] : xs[j] + padX);
  const anchor = j => (numeric[j] ? 'end' : undefined);
  const out = [];
  let cy = y;

  if (cols.length) {
    let hh = 0;
    const cells = [];
    cols.forEach((c, j) => {
      const tb = textBlock(wrap(c, charsThatFit(widths[j], S.smallSize, 700)), cellX(j), cy + 6,
        S.smallSize, C.ink, { weight: 700, anchor: anchor(j) });
      cells.push(tb.svg);
      hh = Math.max(hh, tb.height);
    });
    out.push(cells.join('\n'));
    cy += hh + 14;
    out.push(line(x, cy, x + w, cy, C.ink, 2));
  }

  rows.forEach((r, i) => {
    const hi = block.highlight === i;
    let rh = 0;
    const cells = [];
    for (let j = 0; j < nc; j++) {
      const tb = textBlock(wrap(r[j] || '', charsThatFit(widths[j], S.smallSize, hi ? 600 : 400)),
        cellX(j), cy + 9, S.smallSize, C.ink,
        { anchor: anchor(j), weight: hi ? 600 : undefined,
          style: numeric[j] ? 'font-variant-numeric: tabular-nums' : undefined });
      cells.push(tb.svg);
      rh = Math.max(rh, tb.height);
    }
    const h = rh + 18;
    if (hi) out.push(rect(x, cy, w, h, C.panel, 4));
    out.push(cells.join('\n'));
    cy += h;
    if (i < rows.length - 1) out.push(line(x, cy, x + w, cy, C.rule, 1));
  });
  return { svg: out.join('\n'), height: cy - y };
}

// Four cells in reading order: top-left, top-right, bottom-left, bottom-right.
// `axes.x` labels the two columns (under), `axes.y` the two rows (left, unrotated —
// rotated text is the first thing a reader skips). `highlight` outlines one cell.
function renderMatrix(block, x, y, w, C) {
  const cells = block.cells || [];
  if (cells.length !== 4) {
    throw new Error('matrix: needs exactly 4 cells (top-left, top-right, bottom-left, bottom-right), got ' + cells.length);
  }
  const ax = (block.axes && block.axes.x) || [];
  const ay = (block.axes && block.axes.y) || [];
  const laneW = ay.some(Boolean) ? 120 : 0;
  const gap = 16;
  const gx = x + laneW;
  const cw = (w - laneW - gap) / 2;

  // cell contents are laid out at y=0 and translated into place once the row height is known
  const cellSvg = [];
  const cellH = [];
  cells.forEach((c, i) => {
    const cx = gx + (i % 2) * (cw + gap);
    const px = cx + 18;
    const inner = cw - 36;
    const hi = block.highlight === i;
    const parts = [];
    let cy = 18;
    if (c.heading) {
      const hb = para(c.heading, px, cy, inner, S.bodySize, hi ? C.accentText : C.ink, { weight: 700 });
      parts.push(hb.svg);
      cy += hb.height + 6;
    }
    for (const raw of (c.items || [])) {
      const tb = para(raw, px + 18, cy, inner - 18, S.smallSize, C.ink);
      parts.push('<circle cx="' + fx(px + 5) + '" cy="' + fx(cy + S.smallSize * 0.66) + '" r="3.5" fill="' + C.muted + '"/>');
      parts.push(tb.svg);
      cy += tb.height + 6;
    }
    cellSvg.push(parts.join('\n'));
    cellH.push(cy + 12);
  });

  const rowH = [Math.max(cellH[0], cellH[1]), Math.max(cellH[2], cellH[3])];
  const out = [];
  let cy = y;
  [[0, 1], [2, 3]].forEach((pair, r) => {
    pair.forEach(i => {
      const cx = gx + (i % 2) * (cw + gap);
      const hi = block.highlight === i;
      out.push(rect(cx, cy, cw, rowH[r], C.panel, null,
        hi ? 'stroke="' + C.accent + '" stroke-width="2.5"' : ''));
      out.push('<g transform="translate(0,' + fx(cy) + ')">' + cellSvg[i] + '</g>');
    });
    if (laneW && ay[r]) {
      const lines = wrap(ay[r], charsThatFit(laneW - 20, S.smallSize, 600));
      const th = lines.length * S.smallSize * S.lineH;
      out.push(textBlock(lines, gx - 18, cy + (rowH[r] - th) / 2, S.smallSize, C.muted,
        { weight: 600, anchor: 'end' }).svg);
    }
    cy += rowH[r] + gap;
  });
  cy -= gap;
  if (ax.some(Boolean)) {
    cy += 10;
    let th = 0;
    [0, 1].forEach(j => {
      if (!ax[j]) return;
      const t = para(ax[j], gx + j * (cw + gap) + cw / 2, cy, cw, S.smallSize, C.muted,
        { weight: 600, anchor: 'middle' });
      out.push(t.svg);
      th = Math.max(th, t.height);
    });
    cy += th;
  }
  return { svg: out.join('\n'), height: cy - y };
}

// Dated events on a horizontal rail, evenly spaced (not time-proportional: a figure
// with three events in one week and one a year later would otherwise be unreadable —
// the dates carry the spacing). Wraps into rows of `perRow` (default 5).
function renderTimeline(block, x, y, w, C) {
  const items = block.items || [];
  if (!items.length) return EMPTY;
  const perRow = Math.max(2, Number(block.perRow) || 5);
  const rows = chunk(items, perRow);
  const r = 9;
  const out = [];
  let cy = y;

  rows.forEach((row, ri) => {
    const n = rows.length > 1 ? perRow : row.length;      // constant column width across rows
    const cw = (w - S.colGap * (n - 1)) / n;
    const ry = cy + r;
    const first = x + r;
    const last = x + (row.length - 1) * (cw + S.colGap) + r;
    const railStart = ri > 0 ? x : first;
    const railEnd = ri < rows.length - 1 ? x + w : last;
    if (railEnd > railStart) out.push(line(railStart, ry, railEnd, ry, C.rule, 3));
    let maxH = 0;
    row.forEach((it, i) => {
      const cx = x + i * (cw + S.colGap);
      out.push('<circle cx="' + fx(cx + r) + '" cy="' + fx(ry) + '" r="' + r + '" fill="' + C.accent
        + '" stroke="' + C.bg + '" stroke-width="3"/>');
      let ty = cy + r * 2 + 12;
      if (it.date != null && it.date !== '') {
        const d = para(it.date, cx, ty, cw, S.smallSize, C.accentText, { weight: 700 });
        out.push(d.svg);
        ty += d.height + 2;
      }
      const t = para(it.title || '', cx, ty, cw, S.bodySize, C.ink, { weight: 600 });
      out.push(t.svg);
      ty += t.height;
      if (it.body) {
        const b = para(it.body, cx, ty + 4, cw, S.smallSize, C.muted);
        out.push(b.svg);
        ty += 4 + b.height;
      }
      maxH = Math.max(maxH, ty - cy);
    });
    cy += maxH + 30;
  });
  return { svg: out.join('\n'), height: cy - y - 30 };
}

// Side-by-side composition of any blocks. `widths` are relative weights ([2, 1] = two
// thirds / one third). Each child keeps its own heading and caption.
function renderRow(block, x, y, w, C) {
  const blocks = block.blocks || [];
  if (!blocks.length) return EMPTY;
  const n = blocks.length;
  const given = (block.widths || []).map(Number);
  const ws = blocks.map((_, i) => (given[i] > 0 ? given[i] : 1));
  const sum = ws.reduce((a, b) => a + b, 0);
  const avail = w - S.colGap * (n - 1);
  const out = [];
  let cx = x;
  let maxH = 0;
  blocks.forEach((b, i) => {
    const cw = (avail * ws[i]) / sum;
    const r = renderBlock(b, cx, y, cw, C);
    if (r.svg) out.push(r.svg);
    maxH = Math.max(maxH, r.height);
    cx += cw + S.colGap;
  });
  return { svg: out.join('\n'), height: maxH };
}

const RENDERERS = {
  steps: renderSteps,
  stats: renderStats,
  compare: renderCompare,
  bars: renderBars,
  stack: renderStack,
  note: renderNote,
  table: renderTable,
  matrix: renderMatrix,
  timeline: renderTimeline,
  row: renderRow,
};

// heading above, caption below, the block itself between
function renderBlock(block, x, y, w, C) {
  const fn = RENDERERS[block.type];
  if (!fn) {
    throw new Error('unknown block type "' + block.type + '" — expected one of: ' + Object.keys(RENDERERS).join(', '));
  }
  const parts = [];
  let cy = y;
  if (block.heading) {
    const h = para(block.heading, x, cy, w, S.headingSize, C.ink, { weight: 600, balance: true });
    parts.push(h.svg);
    cy += h.height + 14;
  }
  const r = fn(block, x, cy, w, C);
  if (r.svg) parts.push(r.svg);
  cy += r.height;
  if (block.caption) {   // the text is a caption; the drawing carries the information
    const c = para(block.caption, x, cy + 12, w, S.smallSize, C.muted);
    parts.push(c.svg);
    cy += 12 + c.height;
  }
  return { svg: parts.join('\n'), height: cy - y };
}

// --- page ---------------------------------------------------------------------

function defs(C) {
  const hatch = (id, fill) =>
    '<pattern id="' + id + '" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">'
    + '<rect width="3" height="7" fill="' + fill + '"/></pattern>';
  return '<defs>' + hatch('hatchAccent', C.accent) + hatch('hatchMuted', C.mutedFill) + '</defs>';
}

function build(spec, C) {
  const W = Number(spec.width) || 1100;
  const x = S.pad;
  const w = W - S.pad * 2;
  const body = [defs(C)];
  let y = S.pad;

  if (spec.title) {
    const t = para(spec.title, x, y, w, S.titleSize, C.ink, { weight: 700, balance: true });
    body.push(t.svg);
    y += t.height + 6;
  }
  if (spec.subtitle) {
    const t = para(spec.subtitle, x, y, w, S.subtitleSize, C.muted);
    body.push(t.svg);
    y += t.height;
  }
  if (spec.title || spec.subtitle) {
    y += 14;
    body.push(line(x, y, x + w, y, C.accent, 3));
    y += S.gapBlock;
  }

  for (const block of (spec.blocks || [])) {
    const r = renderBlock(block, x, y, w, C);
    if (r.svg) body.push(r.svg);
    y += r.height + S.gapBlock;
  }
  y -= S.gapBlock;

  if (spec.source) {
    y += 26;
    body.push(line(x, y, x + w, y, C.rule, 1));
    y += 14;
    const t = para(spec.source, x, y, w, S.smallSize, C.muted);
    body.push(t.svg);
    y += t.height;
  }

  const H = Math.ceil(y + S.pad);
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '"'
    + ' width="' + W + '" height="' + H + '"'
    + ' font-family="-apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, Helvetica, Arial, sans-serif">\n'
    + '<rect width="' + W + '" height="' + H + '" fill="' + C.bg + '"/>\n'
    + body.join('\n') + '\n</svg>\n';
}

// --- contrast self-check ------------------------------------------------------
// WCAG 2.2 relative luminance and contrast ratio. Thresholds: 4.5:1 for text, 3:1 for
// large text (>= 24 px, or >= 18.67 px bold) and for graphical objects that carry
// meaning (1.4.11). Reported, not enforced: a designer can decide, but not by accident.

function relLum(hex) {
  const n = parseInt(hex.slice(1), 16);
  const ch = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * ch(n >> 16) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255);
}

function contrast(a, b) {
  const [hi, lo] = [relLum(a), relLum(b)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
}

function contrastReport() {
  const lines = ['WCAG contrast — text needs 4.5:1 (3:1 if large), graphical objects 3:1\n'];
  for (const [name, C] of [['light', LIGHT], ['dark', DARK]]) {
    lines.push('== ' + name);
    const checks = [
      ['ink on bg (body text)', C.ink, C.bg, 4.5],
      ['ink on panel', C.ink, C.panel, 4.5],
      ['muted on bg (labels, source)', C.muted, C.bg, 4.5],
      ['muted on panel', C.muted, C.panel, 4.5],
      ['accentText on bg', C.accentText, C.bg, 4.5],
      ['accentText on panel (stat value, headings)', C.accentText, C.panel, 4.5],
      ['onAccent in an accent disc', C.onAccent, C.accent, 4.5],
      ['mutedFill bar on its track', C.mutedFill, C.panel, 3],
      ['mutedFill bar on bg', C.mutedFill, C.bg, 3],
      ['accent bar on its track', C.accent, C.panel, 3],
      ['accent bar on bg', C.accent, C.bg, 3],
      ['stack segment 2 on segment 3 (gap + label carry it)', C.stack[1], C.stack[2], null],
      ['stack segment 3 on segment 4 (gap + label carry it)', C.stack[2], C.stack[3], null],
    ];
    for (const [label, a, b, need] of checks) {
      const r = contrast(a, b);
      const verdict = need == null ? 'info' : (r >= need ? 'PASS' : 'FAIL');
      lines.push('  ' + verdict.padEnd(4) + '  ' + r.toFixed(2).padStart(6) + '  '
        + (need == null ? '           ' : ('(needs ' + need + ')').padEnd(11)) + '  ' + label);
    }
  }
  lines.push('\nKnown and accepted: the brand accent as a FILL sits below 3:1 on the light track (every bar');
  lines.push('prints its value beside it, which is the WCAG 1.4.11 exemption); as TEXT it is never used on');
  lines.push('light — accentText is. Adjacent stack segments in a one-hue palette cannot all clear 3:1 —');
  lines.push('they are separated by a 2px surface gap and every segment carries its own label.');
  return lines.join('\n') + '\n';
}

// --- examples -----------------------------------------------------------------

const EXAMPLE = {
  title: 'Seeding works: 4 of 185 shared memory files have drifted',
  subtitle: '647 memory files across six scoped sessions, each seeded once from WORK',
  width: 1100,
  source: 'node tools/wiring-check.js --drift — 2026-09-15',
  blocks: [
    { type: 'stats', items: [
      { value: '647', label: 'memory files', sub: 'across six session stores' },
      { value: '185', label: 'names in more than one store', sub: 'the ones that can drift' },
      { value: '4', label: 'genuinely drifted', sub: '2.2% of the shared names' },
    ] },
    { type: 'stack', heading: 'Of the 185 shared names', total: 185, highlight: 'Genuinely drifted', items: [
      { label: 'Byte-identical', value: 176, display: '176 · 95%' },
      { label: 'Harness frontmatter only', value: 5, display: '5 · 2.7%' },
      { label: 'Genuinely drifted', value: 4, display: '4 · 2.2%' },
    ], caption: 'The orange segment is the finding; the greys are context.' },
    { type: 'steps', heading: 'How a drift happens', direction: 'row', items: [
      { title: 'Seed', body: 'A new session is seeded once from the WORK store.' },
      { title: 'Learn', body: 'That session learns something and writes it locally.' },
      { title: 'Diverge', body: 'Seeding is one-way, so WORK never hears about it.' },
    ] },
    { type: 'note', label: 'Caveat', tone: 'caveat',
      text: 'Drift does not set the exit code. A session legitimately holding a different version can be right.' },
  ],
};

// Every block type and every honesty feature, exercised once. Numbers that are real are
// cited in the source line; the one made-up set says so in its own heading.
const GALLERY = {
  title: 'Every block this generator draws',
  subtitle: 'The self-test figure — each block once, light and dark',
  width: 1100,
  source: 'node infographic.js --gallery — sizes from du -sm on a tools folder, 2026-09-15; PF from an engine review, 2026-09-14; contrast from --contrast',
  blocks: [
    { type: 'row', widths: [2, 1], blocks: [
      { type: 'stats', heading: 'stats — with a comparison line', items: [
        { value: '1.991', label: 'engine profit factor', sub: 'vs 1.992 on the TradingView chart' },
        { value: '217', label: 'legs, both engines', sub: 'same first loaded bar' },
        { value: '<0.1%', label: 'gap', accent: false, sub: 'was called "~7% bias" until 09-14' },
      ] },
      { type: 'note', heading: 'note — with a label', label: 'Finding',
        text: 'The old 7% gap was a cold start, not a bias. Match the first loaded bar and they agree.' },
    ] },
    { type: 'bars', heading: 'bars — disk taken by the visual toolchain, MB', sort: 'desc', items: [
      { label: 'Obsidian', value: 374 },
      { label: 'Codex CLI + sandbox', value: 377 },
      { label: 'sherpa-onnx (local speech)', value: 171 },
      { label: 'Playwright browsers (not installed)', value: 120, estimate: true, display: '~120' },
      { label: 'Python 3.13 + yt-dlp', value: 70 },
      { label: 'markmap', value: 46, muted: true },
      { label: 'archify skill', value: 6, muted: true },
      { label: 'this skill', value: 0.03, display: '0.03', muted: true },
    ], caption: 'Measured with du -sm on 2026-09-15 except the hatched bar, which is the sweep\'s estimate.' },
    { type: 'row', blocks: [
      { type: 'bars', heading: 'bars — scaled to a total (max: 185)', max: 185, maxLabel: '185 names', items: [
        { label: 'Identical', value: 176, muted: true },
        { label: 'Frontmatter only', value: 5, muted: true },
        { label: 'Drifted', value: 4 },
      ] },
      { type: 'bars', heading: 'bars — deviation (illustrative numbers)', items: [
        { label: 'Above target', value: 12, display: '+12' },
        { label: 'On target', value: 0, display: '0' },
        { label: 'Below target', value: -7, display: '−7', muted: true },
      ], caption: 'These three numbers are invented to show the form.' },
    ] },
    { type: 'stack', heading: 'stack — one proportion strip instead of a donut (highlight: 2)', total: 185, highlight: 2, items: [
      { label: 'Byte-identical', value: 176 },
      { label: 'Harness frontmatter', value: 5 },
      { label: 'Drifted', value: 4 },
    ] },
    { type: 'table', heading: 'table — the light palette against WCAG', columns: ['Pair', 'Ratio', 'Needs', 'Result'],
      rows: [
        ['ink on white (body text)', '17.4', '4.5', 'pass'],
        ['muted grey on white (labels)', '6.9', '4.5', 'pass'],
        ['accent orange as text on white', '2.85', '3.0', 'FAIL — replaced by accentText'],
        ['accentText on white', '4.94', '4.5', 'pass'],
        ['old muted bar on its track', '1.32', '3.0', 'FAIL — replaced by mutedFill'],
        ['mutedFill on its track', '3.19', '3.0', 'pass'],
      ], highlight: 2 },
    { type: 'matrix', heading: 'matrix — install it or build it, from the 2026-09-14 sweep',
      axes: { x: ['Cheap to own', 'Costly to own'], y: ['Fills a real gap', 'Nice to have'] },
      highlight: 0,
      cells: [
        { heading: 'Build it', items: ['callout.js — 150 lines', 'this generator — zero deps'] },
        { heading: 'Install it, audited', items: ['Archify (77 files, hashed)', '/watch — yt-dlp + ffmpeg'] },
        { heading: 'Use what is already there', items: ['Mermaid in artifacts', 'excalidraw.com for hand-drawn'] },
        { heading: 'Skip', items: ['antvis — 200 templates to use four', 'Playwright — 120 MB to avoid arithmetic'] },
      ] },
    { type: 'timeline', heading: 'timeline — how the visual toolkit was built', items: [
      { date: '2026-09-07', title: 'Archify audited', body: 'First diagram: the system map.' },
      { date: '09-13', title: '/watch installed', body: 'Frames from video, sandbox passed.' },
      { date: '09-14', title: 'The sweep', body: '~90 repos; verdict: build, do not install.' },
      { date: '09-14', title: 'callout.js', body: 'Labels over an image, 150 lines.' },
      { date: '09-15', title: 'infographic', body: 'Five blocks, then this pass.' },
      { date: '09-15', title: 'Design pass', body: 'Contrast fixed, five blocks added.' },
    ] },
    { type: 'compare', heading: 'compare — tick, cross, bullet', columns: [
      { heading: 'Install antvis/Infographic', items: ['+ 200 templates, MIT', '- 200 templates to use four', '- an audit per update', 'Node + a bundler'] },
      { heading: 'This generator', accent: true, items: ['+ 10 blocks, one file', '+ zero dependencies', '+ prints light-on-white', 'No animation, by design'] },
    ] },
    { type: 'steps', heading: 'steps — vertical (the default)', items: [
      { title: 'Write the spec', body: 'Title = the finding. Subtitle = what, where, when. Source = the command and the date.' },
      { title: 'Render it', body: 'node infographic.js spec.json > figure.svg' },
      { title: 'Look at it', body: 'Inline the SVG in an HTML file and open it. Never ship a layout you have not seen.' },
    ] },
    { type: 'note', tone: 'caveat', label: 'Caveat',
      text: 'The Playwright size is the sweep\'s figure, not a measurement on this box — which is exactly why its bar is hatched.' },
  ],
};

// --- cli ----------------------------------------------------------------------

function main(argv) {
  if (argv.includes('--example')) {
    process.stdout.write(JSON.stringify(EXAMPLE, null, 2) + '\n');
    return 0;
  }
  if (argv.includes('--gallery')) {
    process.stdout.write(JSON.stringify(GALLERY, null, 2) + '\n');
    return 0;
  }
  if (argv.includes('--contrast')) {
    process.stdout.write(contrastReport());
    return 0;
  }
  const file = argv.find(a => !a.startsWith('--'));
  if (!file) {
    process.stderr.write('usage: infographic.js <spec.json> [--dark] > figure.svg\n'
      + '       infographic.js --example > spec.json\n'
      + '       infographic.js --gallery > gallery.json\n'
      + '       infographic.js --contrast\n');
    return 2;
  }
  let spec;
  try {
    spec = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    process.stderr.write('cannot read spec: ' + e.message + '\n');
    return 2;
  }
  if (!spec.source) {
    process.stderr.write('warning: no "source" line — a figure with no path, command or date on it is a claim nobody can check\n');
  }
  const C = argv.includes('--dark') ? DARK : LIGHT;
  try {
    process.stdout.write(build(spec, C));
  } catch (e) {
    process.stderr.write('spec error: ' + e.message + '\n');
    return 2;
  }
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { build, contrast, contrastReport, LIGHT, DARK, S };
