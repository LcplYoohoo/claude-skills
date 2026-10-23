---
name: skill-publishing
description: Publish a Claude Code skill (or plugin, command, hook) from a private machine to a public repo without leaking the owner's name, paths, projects, keys or private notes — and without breaking the skill. A measured decision (how much scrubbing each file needs), a staged copy, asserted replacements that fail loudly when they match nothing, an identifier sweep that includes the frontmatter description, tests run from the staged tree, a README entry with attribution, a commit under the repo's existing identity, and a verification against the LIVE raw URLs rather than the local copy. Use whenever the user wants to share, open-source, publish, "put on GitHub" or "make public" a skill, a tool, a script or a config that was built for their own machine — even if they do not say the word publish.
---

# Skill publishing — share it without sharing yourself

A personal skill is full of the person: their name in a quote, their project in an example, an absolute
path in a command, a private file named as "where the rest lives". Publishing is a copy of the skill
with the person removed and the value kept, and a proof that the removal actually happened on the bytes
that went live. Every step below exists because skipping it leaked something or broke something once
(`references/lessons.md`).

## 0. The gate — some things are never published

- **Not yours.** A third-party skill you installed from audited bytes is theirs; do not republish it.
  A skill *re-authored* from someone's work can go out with attribution and a compatible licence.
- **Personal logs dressed as references.** An incidents file, a learning journal, a client list. Rewrite
  it generic or hold the skill back; a scrub cannot fix content whose point is the private history.
- **Secrets, or files that read them.** Anything that names a key file, a vault path, a token variable
  by its real name. Also `allowed-tools` grants and hooks that assume your machine.
- **Private cross-references.** A sibling skill that is not published can be named, once, as
  unpublished in the README; it must not be a dependency.

## 1. Measure before deciding

```bash
node scripts/sweep.js <skill-dir> --patterns <your-private-patterns.txt> --counts
```

`assets/patterns.example.txt` is the generic set (home paths, cloud-drive folders, emails, key-looking
strings) and is always loaded. **Your private patterns file** (your name, handle, city, project names,
machine paths, venues, vendors) is added with `--patterns` and lives outside any repo — never commit it. The counts decide: a file with a dozen hits
is a scrub; a file whose every paragraph is a hit is a rewrite; a reference whose *content* is the hits
is a hold.

## 2. Stage a copy — never edit the installed skill

Clone the public repo into a scratch directory and copy the skill under `skills/<name>/`. The installed
skill keeps working; the staged copy is what gets scrubbed, tested and committed. Delete the staged
copy's leftovers when done.

## 3. Scrub with asserted replacements

```bash
node scripts/scrub.js replacements.json --root <clone>
```

`assets/replacements.example.json` shows the shape: file, literal `from` (or `regex`), `to`, and the
exact number of matches expected. **A replacement that matches nothing fails the run.** That is the
whole point: a scrub that silently did nothing looks identical to a scrub that worked. CRLF files are
handled (a cloned repo on Windows often is one). Prefer rewriting the sentence to deleting it; the
example that named your project is still a good example with the project name gone.

What to replace, in order of how often it is missed:

1. **The frontmatter `description`.** It is the most-read line of any skill and the first pass always
   skips it. "Use when <Name> asks…" → "Use when the user asks…".
2. Quotes attributed to the owner → "the owner" / "the question this started from".
3. Absolute paths and `~/.claude/skills/<name>/…` in usage lines → paths relative to the skill.
4. Private file names used as "see also" → drop, or describe the content in a clause.
5. Project, product, venue and vendor names used as examples → a generic noun with the same shape.
6. Dates can stay. Measured numbers can stay. Both are the evidence.

## 4. Sweep the staged tree

```bash
node scripts/sweep.js <clone>/skills/<name> --patterns <your-private-patterns.txt>
```

Exit 0 and zero hits, or back to step 3. Read the remaining hits one by one: a Windows path in a
*regex that detects Windows paths* is not a leak; your username in it is.

## 5. Test from the staged tree, not the installed one

Run the skill's own self-tests, `node --check` on every script, a PowerShell `-File` run with
`-WhatIf`/survey flags, a render of any example. Paths changed in step 3; something that worked
installed can be broken staged.

## 6. README, licence, attribution

One section per skill in the repo README: what it does, what it ships, what it is not for. Name
unpublished siblings once. If any content is re-authored from someone else's work, say whose, link it,
and check the licence is compatible (MIT → MIT is fine; AGPL content cannot go into an MIT repo). A
pseudonymous `Copyright (c) <year> <handle>` is a valid MIT notice.

## 7. Commit under the repo's existing identity

```bash
git config user.name  "$(git log --format=%an -1)"
git config user.email "$(git log --format=%ae -1)"
```

Repo-local, so a machine with no global git identity still commits, and the public history stays one
author. Commit message from a file, not inline (backticks and quotes in shells).

## 8. Verify the LIVE bytes

```bash
node scripts/verify-live.js https://raw.githubusercontent.com/<user>/<repo>/main <clone>/skills/<name> --patterns <your-private-patterns.txt>
```

Fetches every staged file at its raw URL, checks HTTP 200 and runs the sweep on what came back. The
local copy is not what people get; the CDN copy is. A publish is done when this prints zero.

## 9. Record it

Note where the public copy came from (the installed path), what was removed and why, the commit, and
the sweep result, somewhere private. The next version of the skill gets diffed against this, not
re-scrubbed from scratch.

## Files

- `scripts/sweep.js` — identifier sweep, per-file counts or full lines, exit 1 on any hit.
- `scripts/scrub.js` — asserted literal/regex replacements from JSON; CRLF-aware; fails on count mismatch.
- `scripts/verify-live.js` — fetch each staged file at its raw URL and sweep the live bytes.
- `scripts/selftest.js` — fixtures for all three (no network).
- `assets/patterns.example.txt` — the generic patterns; copy and add your private ones outside the repo.
- `assets/replacements.example.json` — the replacement file shape.
- `references/checklist.md` — the gate and the report format, one page.
- `references/lessons.md` — what each step is protecting against, with the incident behind it.
