# claude-skills

Claude Code skills I use on my own machine, cleaned up for other people. Nine so far.

Each one lives in `skills/<name>/` and is a plain directory — a `SKILL.md` plus whatever
references or scripts it needs. Nothing here installs anything, phones home, or runs at
load time. Read them before you use them; that is the whole point of the first one. Sibling skills some of these mention by name (`verify-work`, `web-defender`, `ship-check`) are not published yet.

## Skills

### [`skill-security-audit`](skills/skill-security-audit/)

A workflow for vetting a third-party Claude Skill, plugin, slash command, agent
definition, hook, or MCP config **before** it touches your machine.

A skill is a prompt, plus arbitrary files, plus (often) executable code, loaded into an
agent with full network access running as you. That is the same trust decision as an
unsigned `.exe` from a forum, and the ecosystem mostly does not treat it that way.

Six layers, each one tied to a documented attack rather than a hunch:

| Layer | Catches |
|---|---|
| 0 — Provenance | Known-malicious authors, impersonation of official skills, forks whose diff *is* the payload |
| 1 — Frontmatter | `bypassPermissions`, unscoped `Bash(*)`, hook registration, sub-agents with their own tool grants |
| 2 — Instruction text | Load-time command execution, secrecy language, credential targeting, hidden/encoded content |
| 3 — Bundled files | Fetch-and-execute, obfuscation, unreadable binaries, persistence, unjustified endpoints |
| 4 — Sandbox | Logic bombs and conditionally-triggered behaviour that static reading misses |
| 5 — Memory integrity | Writes to persistent instruction files, which outlive deleting the skill |

It ends in one of three verdicts — **AUTO-REJECT**, **PROCEED WITH CAUTION**, or **CLEAN
BILL** — with a decision matrix for each, and a report format that records what you
*didn't* check as well as what you did.

Ships with `scripts/scan.sh`, a read-only grep pass (exit 2 = reject-severity hits, 1 =
caution, 0 = clean) and `references/red-flag-patterns.md`, the full pattern tables with
the incident behind each one and its known false positives. The scanner never executes,
fetches, or writes anything, so it is safe to point at a hostile bundle.

**A clean scan is not a clean bill.** It means the lazy 80% of attacks aren't present.
The judgement layers still have to run.

#### Scope, and the companion chain for things you can't read

This workflow's method is reading every byte, so it only works on artifacts made of
readable text. Point it at a **compiled** application, installer, CLI or model file and
it returns REJECT every time, via auto-reject #5 ("any unreadable binary file").

That rule is right for a bundle — a skill has no business shipping an `.exe` — and wrong
for a program you meant to install. It matters because a check that always fails teaches
its operator to override it, and an override reflex is precisely what an attacker needs.

So the skill now routes by artifact class, and
[`references/compiled-artifacts.md`](skills/skill-security-audit/references/compiled-artifacts.md)
carries the other half: the **provenance chain** for artifacts that cannot be read.
Reading is replaced by proving the bytes are the publisher's, then watching what they do:

feasibility before downloading · canonical source and who uploaded the assets · size and
hash against the publisher's own digest, including *inside* nested archives · signature by
**signer subject**, not just "valid" · a tampered-copy negative control, because a
verification step you have never seen fail is not a verification step · per-file malware
scan, since folder-level scanning forces an all-or-nothing choice on a mixed bundle · a
real-process install that survives storage virtualization · a watched first run measuring
sockets, child processes and stray writes · a staged-vs-installed manifest diff · and a
logged row, because an update is new bytes and a new verdict.

It is equally explicit about what provenance does **not** buy you: it proves the bytes
came from the publisher you named, never that what they shipped is safe. A malicious
publisher passes every step.

#### Why each layer exists

The threat model is built from published work, not speculation:

- **Snyk "ToxicSkills"** — 3,984 skills scanned; 13.4% had critical flaws, 76 were
  confirmed malicious by human review. 91% of the confirmed-malicious ones paired working
  malicious code *with* prompt injection, which is why injection language in the text is
  evidence the code is dirty too.
- **Cato CTRL** — trojanized a real open-source skill so a bundled "helper" fetched and
  executed remote code after a single install-time approval. This is why updates require a
  fresh audit: trusted-then-trojaned is the whole pattern.
- **SKILLJECT** (arXiv) — 80.7% attack success rate hiding payloads in auxiliary bundled
  files rather than the visible `SKILL.md`. A review that reads only `SKILL.md` misses most
  attacks, which is why Layer 3 demands every file.
- **Datadog Security Labs** — dynamic-context backtick syntax executes shell *before* the
  model reasons about the prompt, bypassing every prompt-injection defence. Hence the rule
  to audit a copy outside any directory your harness loads skills from.
- **Reversec Labs** — `allowed-tools: Bash(*)` and `permissionMode: bypassPermissions`
  skip per-action permission prompts entirely; they demonstrated a working reverse shell.

Install it the way it tells you to install anything else: read it first, then copy the
files into `~/.claude/skills/skill-security-audit/`. Don't pipe it from a URL.

### [\`reverse-engineer\`](skills/reverse-engineer/)

Figure out how a piece of software works from what it ships — a web app, an Electron app
(asar, bundles, source maps), an APK, a .NET or native exe, a SQLite file, a WASM module, EVM
bytecode, a HAR capture — without running the target. Starts with a legal gate (do you own it or
have written authorization, and does the licence allow it), works on copies only, and ties every
finding to a byte range or a runtime observation, labelled **Observed / Inferred / Unknown**.
Eight small Node scripts (identify, strings, asar, Electron fuses, SQLite, WASM, HAR, EVM), no
dependencies, nothing executed, plus a 15-check \`scripts/selftest.js\`.

### [\`adversarial-code-review\`](skills/adversarial-code-review/)

Attack code you just wrote before you call it done. Seventeen fixed angles that find the class
of defect a re-read cannot (because a re-read uses the mental model that produced the bug), a
rationalizations table, and the discipline for handling a second reviewer's findings — classify
before acting, three cycles then stop. Built from real shipped defects; each angle names the one
that earned it. Ships \`scripts/codecheck.js\`, a zero-dependency static checker whose rules were
each earned by a real bug, with its own regression fixtures.

### [\`pine-v6-guidelines\`](skills/pine-v6-guidelines/)

Pine Script v6 guardrails: the v5-vs-v6 differences a model trained mostly on v5 will get wrong,
including four that change backtest numbers with **no compile error** (the margin default,
short-circuit \`and\`/\`or\`, \`timeframe.period\`, \`strategy.exit\` pair evaluation). Plus the
house patterns worth copying (non-repainting higher-timeframe reads, self-documenting inputs) and
a before-you-call-it-done list.

### [\`infographic\`](skills/infographic/)

Explanatory figures — stat cards, step strips, comparison panels, proportion bars, tables, 2×2
matrices, timelines — as self-contained SVG from a small JSON spec. One file, zero dependencies,
prints light-on-white by default, WCAG-checked palettes (\`--contrast\` prints the table), and a
\`source\` field the script nags you about because a figure with no provenance is a claim nobody
can check. Not for nodes-and-edges; that is a diagram tool's job.

### [\`deslopify-copy\`](skills/deslopify-copy/)

Two passes over customer-facing copy: strip the known AI-writing tells, then replace every
superlative with a verifiable specific. Pass 1's pattern list is re-authored from
[blader/humanizer](https://github.com/blader/humanizer) (MIT), itself built on Wikipedia's
"Signs of AI writing" guide; one rule is from
[ItsssssJack/SlopMonster](https://github.com/ItsssssJack/SlopMonster) (MIT). Credit for the
observations is theirs. Not for code comments or internal docs.

### [\`decisions-ledger\`](skills/decisions-ledger/)

One markdown file per real decision, with the prediction and a review date written down at the
time (\`/decide\`), and a grading pass when the date comes (\`/decide-revisit\`): what we said
would happen against what did. Pattern borrowed from seandavi/lifeos-template. The point is the
scoreboard, not the narrative.

### [`claude-desktop-windows-triage`](skills/claude-desktop-windows-triage/)

For when the Claude Desktop app on Windows dies overnight, will not reopen ("another program is
currently using this file"), restarts itself, or drops Remote Control on every Claude Code session.
One read-only PowerShell script reads the app's own log, the AppX deployment events and the service's
security descriptor and prints what happened and why — including the measured gap between "update
downloaded" and "stealth update triggered", and whether the SID holding change-config rights on
`CoworkVMService` is the service's own (on every build checked, it is not, which is why the service
stays down until a reboot). One recovery script starts and repairs without killing anything; two
`.reg` files turn the self-relaunch off and on via the documented policy key. Every claim is graded
Observed / Reported / Vendor-stated in `references/evidence.md`, with the log lines quoted.

### [`skill-publishing`](skills/skill-publishing/)

How the skills in this repo got here without my name, paths, projects or private notes coming with
them. A measured decision (per-file leak counts), a staged copy, **asserted replacements that abort
when they match nothing** (a scrub that silently did nothing looks identical to one that worked), an
identifier sweep that includes the frontmatter `description` (the line every first pass misses),
tests run from the staged tree, a README entry with attribution, a commit under the repo's existing
identity, and a check of the **live raw URLs** rather than the local copy. Three zero-dependency Node
scripts — `sweep.js`, `scrub.js`, `verify-live.js` — with a self-test, a generic patterns file you
extend privately, and `references/lessons.md`: the incident behind every step.

## Licence

MIT — see [LICENSE](LICENSE). Use it, fork it, adapt it.

The workflow is my own; the threat model summarizes published research by the groups named
above, and the credit for the findings is theirs.
