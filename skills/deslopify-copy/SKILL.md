---
name: deslopify-copy
description: De-AI and sharpen customer-facing copy — strip the 35 known AI-writing tells, then replace superlatives with verifiable specifics. For landing pages, app copy, product descriptions, outreach. NOT for code comments or internal docs.
---

# Deslopify Copy

Two passes, in order: **humanize** (remove AI-writing tells), then **convert**
(replace vague claims with specific, checkable ones). Most copy needs both;
running only the first produces clean-but-empty writing, only the second
produces specific-but-robotic writing.

## Sources — where this comes from, honestly

- **Pass 1 patterns**: [blader/humanizer](https://github.com/blader/humanizer)
  (the original, widely-forked skill), itself built on Wikipedia's "Signs of AI
  writing" guide — observations from thousands of real instances. Extracted
  2026-09-01 and re-authored here rather than installed as a third-party bundle
  (standing rule: never install a stranger's skill sight-unseen).
- **Pass 2 principle**: standard direct-response copywriting (specificity beats
  adjectives), with worked examples from a 2026-09-01 talk on design tokens and agent-readable sites.
- **House rules**: the owner's own standards outrank both — no corporate language,
  no hype, numbers first. This skill is only about the words; send gates and
  outreach rules live elsewhere.

## Scope guard — read before touching anything

- **Customer-facing copy only**: landing pages, app UI text, product
  descriptions, marketing emails, llms.txt-style summaries.
- **Do NOT apply to code comments or internal docs.** A codebase's comment
  culture is deliberately discursive and history-carrying — "cleaning" it
  destroys information. Same for extraction files, memory files, journals.
- **Never change a fact while changing its wording.** Every claim in the
  original survives, or its removal is called out in the report.
- **Technical precision beats pattern-matching.** If a "banned" word is the
  accurate term (a port really does "feature" a flare), keep it.

## Pass 1 — Humanize (the 35 tells)

Full pattern list with examples and fixes: `references/patterns.md`.
The compressed checklist — scan for each group:

| Group | The tells | Fix |
|---|---|---|
| Inflation | "pivotal," "testament," "vibrant," "renowned," "stunning," importance claims | State the fact plainly |
| AI-favorite words | "delve," "landscape," "tapestry," "foster," "intricate," "seamless" | Simpler common words |
| Weak verbs | "serves as," "boasts," "features" replacing is/has | is / has / contains |
| Forced structure | "not just X but Y," rule-of-three lists, false "from X to Y" ranges | Say the one real point |
| Hedging & filler | "in order to," stacked qualifiers, "it is believed" | Cut or commit |
| Fake depth | "at its core," "the real question," "-ing" phrases adding surface meaning ("reflecting the community's…") | Direct statement |
| Fake candor | "Honestly?", "Here's the thing," answering objections nobody raised | Delete the staging |
| Chatbot residue | "I hope this helps," "Let's dive in," heading restated in first sentence | Content only |
| Formatting slop | bold-everywhere, emoji decoration, Title Case Headings, bold-mini-heading lists, em-dash overuse | Prose, sentence case, plain lists |
| Endings | "exciting times ahead," generic optimism, dramatic fragments ("No rules. No limits.") | End on the last concrete detail |

Workflow: mark every tell in the source → rewrite keeping every claim → read
aloud → ask "what still sounds AI?" and "did any fact change?" → finalize.

## Pass 1b — Mannered prose (added 2026-09-02, from Anthropic's own Fable 5.1 doc)

A distinct tell the 35-pattern list does not name: **metaphor or flourish standing in
for a direct statement.** Anthropic's Fable 5.1 prompting guide defines it because the
model's prose got *better* on stock phrases and jargon but can run denser — and this is
the residue. Their examples: "a dial worth turning" for "a parameter worth varying";
"this point earns its keep" for "this point still matters." The phrase performs the
writer instead of carrying the idea, and drags in connotations nobody chose.

Test: **is there a literal phrase available?** If yes, use it. The one-line instruction
Anthropic documents as effective: *"Please remove all mannered prose."*

Same doc, same date, one formatting note worth knowing: Fable 5.1 already uses bold,
headers, and lists **less** than earlier models. Old anti-formatting rules written for
Opus-era bold-everywhere output can now over-correct; the fix is a rule that says when
formatting *is* appropriate, not a blanket ban.

Source: platform.claude.com → Prompting Claude Fable 5.1 → "Writing density" and
"Formatting in chat" (read 2026-09-02).

## Pass 2 — Convert (specificity beats adjectives)

Every adjective of quality is a slot where a verifiable fact should be.
The test: **could a competitor paste this sentence onto their site unchanged?**
If yes, it says nothing.

Worked examples (roofing-site set from the extraction, pattern generalizes):

| Slop | Specific |
|---|---|
| "Trusted, reliable, and built to last" | "Six nails per shingle. Every shingle." |
| "We leverage industry-leading materials for unparalleled protection" | "We source from manufacturers who test for wind, hail, and sun." |
| "The area's most trusted roofing experts" | "Only roofing, since 2001." |
| "Get started" | "Start free" |
| "Loved by thousands of happy customers" | A real number, or nothing |

Example, a car-audio configurator site: its credibility IS its numbers — sourced
Thiele-Small data, real port math, honest refusals. Copy should surface those
("real T/S data for 86 drivers, source-tagged per field") instead of claiming
quality in the abstract. When no real number exists for a claim, the claim
goes, not the honesty.

**Never invent proof (lint rule, added 2026-09-02).** Any number next to a
people-noun — "10,000+ happy users," "trusted by thousands," "5-star rated" — is a
hard flag unless the figure is real and you can point at where it comes from. A
fabricated customer count is the one slop pattern that is also a legal problem.
Source: ItsssssJack/SlopMonster rule 5 (MIT; same blader/humanizer lineage as ours).

**Where a claim is allowed to come from** (same source): a trade specification, a
customer fear, a competitive refusal ("we don't do X"), or a line already vetted.
If a sentence cannot be traced to one of those four, it is decoration — cut it.

**Optional: rival-model cleanse.** After the rewrite, have a different model family
lint the result. Unverified theory (a model can't hear its own accent); cheap enough
to try on high-stakes copy, not required.

Supporting principle (Krug, "don't make me think"): people browse, they don't
read. Each section must survive a glance — name the pain, then the mechanism.

## Reporting

Standard honesty rules apply: diff-level honesty, list of every claim
removed (with why), and no fact silently altered. On a site that auto-deploys
on push, the pass is not done until the live page has been read back.
