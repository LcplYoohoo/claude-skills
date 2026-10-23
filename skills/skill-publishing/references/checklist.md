# The publishing checklist — one page

## Gate (answer all four before staging)

1. **Is it ours to publish?** Written here, or re-authored from a source whose licence allows it (named
   and linked). An installed third-party skill is not ours. "I changed a few lines" is still not ours.
2. **Is the value in the method or in the private history?** Method publishes. A file whose content is
   our incidents, our clients, our numbers is rewritten generic or held.
3. **Does it depend on anything private?** A sibling skill, a tool at an absolute path, a key file, a
   hook. Dependencies are vendored into the skill, replaced, or the skill waits.
4. **Would the frontmatter `description` alone leak anything?** Read it as a stranger.

## Pipeline (each step has a command in SKILL.md)

| Step | Proof it happened |
|---|---|
| Measure: sweep `--counts` on the installed skill | per-file counts written in the decision |
| Stage a copy in the repo clone | installed skill untouched (`git status` elsewhere is empty) |
| Scrub with asserted replacements | `scrub ok: N replacement(s)`; any mismatch aborted with nothing written |
| Sweep the staged tree | `0 hit(s)` with the private patterns, or every remaining hit classified in writing |
| Test from the staged tree | self-tests / `node --check` / script dry-runs, run with cwd in the staged dir |
| README entry + attribution + licence check | section present; upstream named and linked; licence compatible |
| Commit under the repo's identity, message from a file | `git log -1 --format=%an` unchanged |
| Verify live | `verify-live` prints every file 200 and `all live files 200 and clean` |
| Record | where it came from, what was removed, commit hash, sweep result |

## Report format (what to tell the owner)

- Published: `<name>` at `<commit>`, `<n>` files. Live sweep: 0 hits.
- Removed: <the categories, not the lines> — quotes, paths, project names, private references.
- Changed to keep it working: <renamed script, dropped `--self` flag, rewritten usage lines>.
- Held back: <what and why>, with the measured cost to publish it later.
- Fixed in the installed copy while here: <anything the scrub exposed as stale or wrong>.
