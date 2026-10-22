# The evidence ledger

Rewritten from REA's `references/evidence-workflows.md`, `docs/tool-design.md`,
`docs/reconstruction-readiness.md` (read 2026-10-18). The point: a finding without a citation is an
opinion, and the person reading it later cannot tell the difference unless you label it.

## Header (every findings file starts with this)

```
Target: <path> · <type from re-identify> · <size> · sha256 <full>
Gate: owned/authorized? <yes/no + how> · licence allows RE? <yes/no + where checked> · hard-no list clear? <yes>
Questions:
  Q1 <falsifiable question> — answered | partial | unresolved
  Q2 …
Copy worked on: <scratchpad path> (original untouched)
```

## Ledger rows

```
| id | label | finding | evidence | limitation |
|----|-------|---------|----------|------------|
| E1 | Observed | main process registers ipcMain.handle('export-pdf') | app.asar/src/main.js@1842..1931 (sha256 3f9c…) | channel literal; handler body not traced |
| E2 | Inferred | renderer calls it from the Export button | bundle.js module 0x3a, string "Export PDF" @ 90112; invoke('export-pdf') @ 90488 | minified; same-module containment only |
| E3 | Unknown | whether the PDF is built in-process or by a child process | — | child_process strings present but no call site matched |
| R1 | Observed (runtime) | GET api.example.com/v2/items?page=1 on load | browser pane read_network_requests 2026-10-18 09:41, requestId 17 | one session, logged-out |
```

**Labels.** *Observed*: the bytes or a runtime record show it. *Inferred*: pattern match, decompiler
rendering, source-map link, selector lookup, "the only module that could". *Unknown*: not covered,
truncated, dynamic, ambiguous, or contradicted. Contradictions are kept, not resolved by preference.

**Citations.** `path@start..end (sha256 first8…)` for bytes; `runtime: <tool> <timestamp> <id>` for
observations. The digest is of the copy you analyzed. If you page through a large output, say which
pages you read; unread pages are Unknown.

**Rules that keep the ledger honest**
- Missing in partial coverage ≠ absent.
- Static presence ≠ executed; launch success ≠ behaviour; a bundle loading ≠ every module ran.
- Two builds differing statically = candidate cause, not cause.
- Observed query-parameter names ≠ required parameters; an API-surface group ≠ a handler or a schema.
- One bounded negative search per question: say what was searched and that it was not found.
- Never widen the target or the action beyond what was declared; if "the app" is ambiguous, ask which —
  never pick an example app for the user.

## Reconstruction readiness (only when the job is "build it")

Before writing code, the obligation list:

```
| ob | what the rebuild must do | evidence ids | observed behaviour or our design choice? | owner | verified by |
|----|--------------------------|--------------|-------------------------------------------|-------|-------------|
| O1 | export the current layout as a true-scale PDF | E1, E2 | observed | owner's session | render-diff case 14 |
| O2 | file name = <title>-<date>.pdf | — | our choice | owner's session | — |
```

Ready means: every required obligation has evidence (or is marked as our own choice), an owner, and a
way to verify; no Unknown sits under a required obligation; nothing truncated or contradictory is labelled
"equivalent". A pass covers only the declared obligations — it is never a claim of equivalence with the
original. Gaps are reported as findings with a reason, not hidden in prose.

**Copying is not reconstruction.** Assets, strings, code, and data lifted from the target are governed by
the gate's licence answer. The rebuild describes behaviour and implements it in our own code.
