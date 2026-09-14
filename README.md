# claude-skills

Claude Code skills I use on my own machine, cleaned up for other people.

Each one lives in `skills/<name>/` and is a plain directory — a `SKILL.md` plus whatever
references or scripts it needs. Nothing here installs anything, phones home, or runs at
load time. Read them before you use them; that is the whole point of the first one.

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

## Licence

MIT — see [LICENSE](LICENSE). Use it, fork it, adapt it.

The workflow is my own; the threat model summarizes published research by the groups named
above, and the credit for the findings is theirs.
