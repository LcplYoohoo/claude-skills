---
name: decisions-ledger
description: Record a decision with its prediction and a review date (/decide), and grade past decisions against what actually happened when they come due (/decide-revisit). Use whenever the user makes or asks to log a real call — adopting a strategy setting, buying a domain, choosing a vendor, shipping or killing a feature, a sizing rule — and whenever a session-start hook or dashboard lists decisions due. This is the accountability loop: what we said would happen vs. what did.
---

# Decisions ledger

One markdown file per decision in `decisions/` at the project root, named `YYYY-MM-DD-slug.md`.
A session-start hook or a dashboard can read the frontmatter to surface what's due.
Pattern borrowed from seandavi/lifeos-template's `/decide` + `/decide-revisit`; a
trading learning journal does this per 10-trade cycle — this generalizes it to
everything else.

## /decide — record

Write the file with this exact frontmatter (the readers depend on it):

```
---
decision: <one line, past tense — what was decided>
date: YYYY-MM-DD
domain: trading | product | ventures | infra | legal | personal
review_date: YYYY-MM-DD
status: open
---
## Context
Why this came up. Numbers, not adjectives.

## Options rejected
- <option> — why not

## Prediction (falsifiable)
What we expect to be true by review_date, with a measurable threshold.
e.g. "By 2026-10-01 the hard TP will have capped ≥3 paper positions and max
drawdown will be below the no-cap baseline (31.7%)."

## Review trigger
What data answers it, and where it lives.
```

Rules: one decision per file; the prediction must be gradeable (a number, a date, a
yes/no); review_date defaults to 30 days for infra/product, 60 for strategy settings, 90
for ventures — shorter if the data arrives sooner. Backfill important past decisions
when they come up in conversation; don't invent history.

## /decide-revisit — grade

For each file with `status: open` and `review_date` ≤ today (+7 days = "soon"):
1. Pull the actual data named in "Review trigger". Observed, not recalled.
2. Append:
```
## Revisit YYYY-MM-DD
Actual: <what happened, with the number>
Grade: HELD | MISSED | TOO EARLY | WRONG QUESTION
What this changes: <the rule/setting/next decision, or "nothing">
```
3. Set `status: held | missed | too-early | reframed` (or push `review_date` forward
   once with a reason — twice means the prediction was ungradeable; reframe it).
4. If the grade changes a live setting, that is a NEW decision — record it, don't
   edit the old one.
5. Report the grades in one table. No narrative padding; the point is the scoreboard.

## Where it surfaces
- A session-start hook that prints DUE/soon items.
- A dashboard tile or a morning-brief line, if you have one.
