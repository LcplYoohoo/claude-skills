---
name: reverse-engineer
description: Figure out how a piece of software works from what it ships — a web app, an Electron/JavaScript app (asar, bundles, source maps), an APK, a .NET or native exe, a SQLite file, a WASM module, EVM bytecode, a HAR/network capture — using only tools already on this box, never running the target, with every finding tied to a byte range or a runtime observation and labelled Observed / Inferred / Unknown. Use when the user asks how an app or site does something, what is inside a file, what API a service really calls, whether two builds differ, or wants to rebuild a feature from software they own — even if they never say "reverse engineer". Always starts with the legal gate (own it or authorized, and the licence allows it); never for TradingView/LuxAlgo Pine, exchange apps, DRM/licence checks, or a competitor's API by the unofficial route.
---

# Reverse Engineer (home-built, 2026-10-18)

The method of `morluto/rea` ("Reverse Engineer Anything", MIT), rewritten for this box: the ordering,
the evidence discipline, and the per-target routes — without the MCP server, the native bundle, the
`npx @latest` install path, or the writes to `~/.claude.json`. Source read on 2026-10-18:
`.agents/skills/reverse-engineer-anything/SKILL.md` + its six references, and ~20 of `docs/`.
This skill is what replaced the need for it.

## 0. The legal gate — before a single byte is read

Two questions, answered in the findings file, every time:

1. **Do we own it, or do we have written authorization to examine it?** "I have the file" is not
   authorization. Software you own (your own app builds, your own exports), open-source code, and
   interoperability questions about tools you pay for are the plausible yes. A client's software needs the client's written yes.
2. **Does the licence or terms of service forbid reverse engineering?** Check the vendor's EULA and terms
   (keep a record of what each vendor's terms say). If it forbids it, stop and hand the question to a
   lawyer — do not reason around it.

**Hard no, regardless of the answers:** TradingView and any protected Pine script (LuxAlgo is licensed, not
owned), exchange apps and SDKs, a competitor's site "to access an API other than the official way" (the
standing bot-detection rule), anything that circumvents DRM, a licence check, an anti-cheat, or a paywall.
Those are the exact requests the original project refuses too.

## 1. The method, in order

1. **Classify by bytes, not by extension.** `node scripts/re-identify.js <file>` → type, size, SHA-256.
   Record the hash; every later claim cites it. Work on a **copy** in the scratchpad, never the original,
   never a path the target might rewrite.
2. **Write the question list first.** "How does it do X?" becomes 3–8 falsifiable questions. Each ends the
   job as *answered*, *partially answered*, or *unresolved*. Don't declare the job done while a required
   question is open; don't chase gaps that aren't on the list.
3. **Inventory before interpretation.** Entry points, files, manifests, strings, imports, routes, tables —
   the summary view first, then one question at a time. Never repeat an identical probe hoping for a
   different answer; change an input.
4. **Static facts.** Route by target (table below). Everything here is *what the bytes contain*. Static
   never proves something executes, is reachable, or is enforced.
5. **Runtime observation, only when a question needs it and only on software the gate cleared.** For a
   website, the built-in browser pane is the instrument: `read_network_requests`, `read_console_messages`,
   `read_page`, `javascript_tool` for inspection. Say plainly that *you* drove the page. Never attach a
   debugger to, inject into, or automate a third party's desktop app on this box.
6. **Ledger, then answer.** Every finding gets an evidence id, a source (path + byte range or the runtime
   call), a label — **Observed / Inferred / Unknown** — and its limitation. Template in
   `references/evidence-ledger.md`. Missing coverage means *unknown*, not *absent*.
7. **Reconstruct from the ledger, not from the vibe.** When the job is "build this feature for us":
   list the obligations (what the rebuild must do), tie each to evidence, mark what is observed behaviour
   vs our own design choice, and build with the normal tools. A rebuild that copies code or assets is not
   reconstruction — it is copying, and the gate's licence answer decides whether that is allowed at all.

## 2. Routes by target — what is on this box

| Target | First tool here | Then | Not installed by default (log the download, get the owner's OK first) |
|---|---|---|---|
| Any file | `re-identify.js`, `re-strings.js` | Grep the strings for URLs, hosts, keys, feature names, error text | — |
| Electron app | `re-asar.js` (list/extract `app.asar`), `re-fuses.js` (the exe's fuse wire) | read `package.json` main → preload → `contextBridge`/`ipcMain.handle` channels; `references/javascript-and-web.md` | Wakaru source recovery (Linux only) |
| Web bundle / site | `re-strings.js` on the bundle; source map decode by hand; built-in browser for runtime | `references/javascript-and-web.md` | — |
| HAR / network capture | `re-har.js` → API surface (method · origin · path template), statuses, MIME, param names; auth values stripped | pair with the browser pane's `read_network_requests` | tshark for pcap |
| APK (zip) | `unzip -l`, `re-strings.js` on `classes*.dex`, `assets/`, `res/raw`, `lib/` listing | `references/artifacts.md` | jadx + JDK 17 (binary XML manifest, decompile) |
| SQLite | `re-sqlite.js` — copies db+wal to temp, schema, optional 20-row sample, read-only | — | — |
| WASM | `re-wasm.js` — imports/exports/custom sections, compile-only | — | WABT for WAT text |
| EVM bytecode | `re-evm.js` — 4-byte selectors, CBOR metadata trailer | 4byte lookups are *inferences* | — |
| .NET assembly | `re-strings.js` (user strings are UTF-16), `re-identify.js` flags CLI header | — | `ilspycmd` (dotnet tool) for C# |
| Go / Rust / native exe | `re-strings.js` (Go: `path\t…` module lines; Rust: `/rustc/<hash>/` paths, `.dep-v0`) | — | Ghidra + JDK (Windows: experimental, read-only, minutes per query) |

Scripts: `~/.claude/skills/reverse-engineer/scripts/`, Node 24 built-ins only, no network, nothing executed.
Prove they still work with `node scripts/selftest.js` (builds its own fixtures, ~1 s).

## 3. Evidence rules (the part that makes it worth doing)

- Cite `path@offset..offset (sha256 abcd1234…)` or `runtime: <tool> <when>`. A claim without a citation is
  a guess and is labelled Inferred.
- **Observed** = the bytes or the runtime record show it. **Inferred** = a pattern match, a decompiler's
  rendering, a 4byte lookup, a source-map guess. **Unknown** = not covered, truncated, dynamic, or
  ambiguous. Keep all three visible in the answer; never launder Inferred into Observed.
- A static match between two builds is a *candidate*, not a cause. Absence in partial coverage is not
  absence. A bundle appearing at runtime does not prove each module ran. Launch success is not behaviour.
- Negative searches are bounded: say what was searched, how, and that nothing was found — once.
- Minified names and module ordinals are not identities; match by content digest first, then source-map
  identity, then structure, and say which tier matched.

## 4. Output

One findings file next to the work (`re-<target>-<date>.md` in the project): the gate answers, the question list with status, the ledger, the
unknowns, and — if asked to build — the obligation list. Short answer first, ledger below. Before
reporting, ask: did I check the authoritative source — the bytes, not the README?

## References

- `references/javascript-and-web.md` — bundles, source maps, asar, Electron IPC/fuses, live-site observation
- `references/artifacts.md` — zip/apk, sqlite, wasm, evm, PE/ELF, Go/Rust metadata, strings
- `references/evidence-ledger.md` — the ledger template, labels, the reconstruction-readiness check
