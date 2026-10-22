# The 35 AI-writing tells — full reference

Source: [blader/humanizer](https://github.com/blader/humanizer) (extracted
2026-09-01), which codifies Wikipedia's "Signs of AI writing." Re-authored
here; examples abbreviated. Grouped as in SKILL.md.

## Content

1. **Inflated importance** — "pivotal moment," "marking," "indelible mark" → state the fact plainly.
2. **Name-dropping for credibility** — publication lists with no context → keep only citations that mean something.
3. **Shallow -ing analysis** — "symbolizing…, reflecting the community's connection" → direct statement of what the thing is.
4. **Sales language** — "vibrant," "breathtaking," "nestled," "renowned," "stunning" → factual, neutral description.
5. **Vague sources** — "experts argue," "industry reports," "some critics" → name the source or drop the claim.
6. **Formulaic challenges sections** — "Despite challenges, X continues to thrive" → specific problems or nothing.

## Language and grammar

7. **AI-favorite words** — "delve," "landscape," "tapestry," "testament," "foster," "intricate" → plain alternatives.
8. **Avoiding simple verbs** — "serves as," "boasts," "features" → "is," "has," "contains."
9. **Not-X-but-Y** — "not merely a song, it's a statement" → the main point, no forced contrast.
10. **Forced groups of three** — "innovation, inspiration, and industry insights" → natural count.
11. **Synonym cycling / repeated openings** — protagonist→main character→central figure → one consistent name; vary structure.
12. **False from-to ranges** — "from the Big Bang to the cosmic web" when there's no spectrum → plain list.
13. **Passive voice / missing subjects** — "results are preserved automatically" → name the actor when it's clearer.

## Style

14. **Em/en-dash overuse** — dashes replacing commas/periods → period, comma, colon, or rewrite. (Keep if the writer's own sample uses them.)
15. **Too much bold** — bolding terms without structural reason → remove.
16. **Lists with bold mini-headings** — "- **User Experience:** improved" → prose.
17. **Title Case Headings** → sentence case.
18. **Decorative emojis** in headings/lists → remove.
19. **Curly quotes** where the format wants straight → straight.

## Chatbot residue

20. **Chatbot text left in** — "I hope this helps," "Let me know" → delete.
21. **Knowledge-limit disclaimers** — "as of [date]," "it is believed," guessed facts → state what a source shows or omit.
22. **Overly agreeable tone** — "Great question! You're absolutely right" → substance only.

## Filler and hedging

23. **Filler phrases** — "in order to"→"to," "due to the fact that"→"because."
24. **Stacked qualifiers** — "could potentially possibly" → one qualifier max.
25. **Generic positive endings** — "the future looks bright" → end on the last concrete detail.
26. **Hyphenated-pair overuse** — hyphenate only before the noun ("high-quality report," not "the report is high-quality").
27. **Fake deeper truth** — "at its core," "what really matters," "fundamentally" → say the point.
28. **Announcing the next point** — "Let's dive in," "here's what you need to know" → just start.
29. **Heading restated in first sentence** — "## Performance / Speed matters." → delete the restatement.
30. **Writing about the previous version** — "this replaces the old approach" in docs meant for current behavior → describe current behavior; versions belong in changelogs.
31. **Forced punchlines / dramatic fragments** — "No preference. No aesthetic. No rules." → flowing sentences; short ones only for real emphasis.
32. **Formulaic sayings** — "X is the Y of Z" → the concrete claim underneath.
33. **Fake-candid openings** — "Honestly?", "Look," "Here's the thing" → direct statement.
34. **Answering unraised objections** — "I'm not saying…," "don't get me wrong" → remove the defense.
35. **Rejecting fake alternatives** — invent option, reject it in a clause, never mention again → state the actual constraint.

## Workflow (from the source skill, kept because it works)

1. Mark every tell in the source text.
2. Rewrite maintaining every claim; read aloud for rhythm.
3. Ask: "What still sounds AI?" and "Did any fact change?"
4. Finalize; apply the dash rule.
5. Report per context — for the owner: diff plus a list of anything removed and why.
