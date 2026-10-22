---
name: pine-v6-guidelines
description: Pine Script v6 authoring guardrails — the v5-vs-v6 differences a model trained mostly on v5 will write wrong, including four that change backtest numbers with no compile error (margin default, short-circuit and/or, timeframe.period, strategy.exit pair evaluation). Use whenever writing, editing, debugging, reviewing or porting ANY Pine Script — a .pine file in your project, a new indicator or strategy, a change to a live strategy, a candidate or scratch script — and whenever a script won't compile, repaints, or a backtest number moves unexpectedly. Also fires on the TradingView MCP pine_* tools (pine_set_source, pine_compile, pine_smart_compile, pine_get_errors) and on any "why is this Pine erroring" question. Every script here is //@version=6; treat v5 syntax in generated code as a bug, not a style choice.
---

# Pine Script v6 — what to get right

Every `.pine` file on this desk declares `//@version=6` (18/18 checked 2026-09-13). The risk is not
that scripts are stuck on v5 — it is that **model training data is saturated with v5**, so v5 idioms
get written into v6 files. Some error loudly. Four change results silently. Those four come first.

Source for every v5→v6 claim below: TradingView's official *To Pine Script version 6* migration
guide, read 2026-09-13. Everything else is this desk's own convention, marked as such.

---

## 1. The four silent ones — no compile error, different numbers

These are the reason this skill exists. A script that compiled fine and "looks right" can produce a
different backtest than the same logic did in v5.

### 1.1 `margin_long` / `margin_short` default changed 0 → 100
In v5, omitting them meant **no margin checks**. In v6 both default to **100**, so margin calls are
enforced and trades can be rejected or liquidated that previously were not.

A standing house rule here is **use 50, not 100/50**. What v6 adds is that *forgetting* the parameter is no longer neutral. Only 4 of
the 10 `strategy()` calls in the tree set it explicitly; the other 6 are older candidate/test
scripts, and re-running one of those under v6 is not comparable to its original recorded result.

```pinescript
// ALWAYS explicit on this desk
strategy("Name", overlay=true, initial_capital=5000, margin_long=50, margin_short=50, ...)
```

### 1.2 `and` / `or` now short-circuit
v5 evaluated both sides every bar. v6 stops as soon as the result is determined. Any `ta.*` call on
the right-hand side of a condition **may not execute on every bar**, and `ta.*` functions need to run
every bar to keep their internal history correct. The values then quietly drift.

```pinescript
// WRONG in v6 — ta.rsi() only runs on bars where trendOk is true, so its history is wrong
longOk = trendOk and ta.rsi(close, 14) < 30

// CORRECT — compute in global scope every bar, then use the value
rsiVal = ta.rsi(close, 14)
longOk = trendOk and rsiVal < 30
```

This matters directly: MACD/RSI/volume/Stoch gating in a multi-indicator strategy is exactly this
shape. Hoist every `ta.*` to a top-level variable.

### 1.3 `timeframe.period` always includes the multiplier
Daily now returns `"1D"`, not `"D"`. Weekly returns `"1W"`. Any v5-style comparison silently becomes
permanently false — a gate that never fires, with no error.

```pinescript
// WRONG in v6 — never true
isDaily = timeframe.period == "D"
// CORRECT
isDaily = timeframe.period == "1D"
```

Checked 2026-09-13: no current script compares `timeframe.period` to a literal. Keep it that way, or
use `timeframe.isdaily` / `timeframe.isweekly` instead of string comparison.

### 1.4 `strategy.exit()` no longer prefers absolute over relative
v5: absolute params (`limit`, `stop`) always took precedence over relative (`profit`, `loss`).
v6: it evaluates the specified levels and uses **whichever the market is expected to hit first**.

`backtest-conventions.md` §3 tells this desk to use `strategy.exit(stop=..., limit=...)` from the
start, and the live strategy does exactly that for TP1 and the runner leg. Using only `limit` and
`stop` (never mixing in `profit`/`loss`) keeps the behavior unambiguous — do not mix the two kinds
in one call.

---

## 2. v5 habits that fail to compile in v6

Fast reference. If generated code contains any of these, it came from v5 training data.

| v5 (wrong in v6) | v6 |
|---|---|
| `strategy.entry("L", strategy.long, when = cond)` | `when` removed → `if cond` then `strategy.entry("L", strategy.long)` |
| `plot(close, transp = 80)` | `transp` removed everywhere → `plot(close, color = color.new(c, 80))` |
| `if bar_index` (implicit int→bool) | `if bool(bar_index)` — no implicit casting |
| `na(myBool)`, `nz(myBool)`, `fixnan(myBool)` | bool has no `na` state; these reject bool. Undefined conditions are `false` |
| `myObject.field[10]` | `(myObject[10]).field` — or assign the field to a var first |
| `6[1]`, `color.red[3]` | history of a literal/const is an error; remove it |
| `plot(close, offset = seriesInt)` | `offset` must be simple or weaker |
| `linewidth = 0` | minimum is 1 |
| `plot(close, color = a, color = b)` | repeating a parameter is an error |
| `5 / 2` on const ints giving `2` | now `2.5`; wrap `int(5 / 2)` if truncation was intended |
| passing a mutable var to a `simple` param | v6 types it `series` correctly → error; restructure |
| conditional with no `else` / `switch` with no `default` feeding a unique-type param (e.g. `style`) | must guarantee a non-`na` return |

Also changed, cosmetic only: `color.red` `#FF5252`→`#F23645`, `color.teal`→`#089981`,
`color.yellow`→`#FDD835`, and `label.new()` default text is now white, not black.

---

## 3. v6 capabilities worth actually using

- **Dynamic requests are on by default.** `request.*()` accepts *series* symbol/timeframe arguments
  and may be called inside loops and functions. v5 needed `dynamic_requests = true`. This is the
  feature that makes a symbol- or timeframe-swept MTF read possible without 40 hardcoded calls —
  but the 40-call platform limit still applies, see the authoring reference §3.
- **Negative array indices**: `array.get(a, -1)` is the last element, `-2` second-to-last. Works with
  `get/set/insert/remove`.
- **Order-count overflow no longer errors.** Past ~9000 orders the oldest are trimmed instead of
  throwing; use `strategy.closedtrades.first_index` to find the first non-trimmed trade. Relevant
  only to very long backtests.
- **`for` loop bounds re-evaluate every iteration.** If the loop body mutates the array whose size is
  the bound, the bound moves. Assign the bound to a variable before the loop.

---

## 4. House patterns — copy these, they are already proven here

From a live v6 strategy that has been through many backtest sweeps:

**Non-repainting higher-timeframe read** — always this exact shape: `[1]` on the expression, explicit
`lookahead_off`.
```pinescript
wClose  = request.security(syminfo.tickerid, "W", close[1],            lookahead=barmerge.lookahead_off)
wRsiVal = request.security(syminfo.tickerid, "W", ta.rsi(close, 14)[1], lookahead=barmerge.lookahead_off)
dEma3   = request.security(syminfo.tickerid, "D", f_dEma3()[1],         lookahead=barmerge.lookahead_off)
```

**Inputs are grouped and self-documenting**, and a tested-and-rejected toggle keeps its verdict in the
label rather than being deleted:
```pinescript
useDailyGate = input.bool(false, "Enable Daily Direction Gate (TESTED 2026-07-24: hurts on every metric, leave off)", group="HTF Toggles")
```
Keep that convention. It is why the sweep history is readable a month later.

**Header comment carries the live config, the adoption decision, and the honest caveat** (leg count,
OOS sample size). New scripts get the same treatment.

---

## 5. Before calling a Pine script done

1. **Compile it — do not assume.** `pine_smart_compile`, then `pine_get_errors`. A script is not done
   because it looks right; "it compiled" is a claim that needs the tool output behind it.
2. Run your review checklist (`//@version=6`, no repainting, no `plot()` in local scope, inputs
   grouped, within platform limits).
3. **When comparing an external backtest engine to TradingView, match the chart's first LOADED bar**,
   not the date of its first trade. A mismatch there looks like a "bias" of several percent and is
   really a cold start.
4. Backtest on one exchange's feed consistently (a deep venue, not a thin one) and compare against the
   same reference numbers every time.
5. Chart discipline: read the chart through data tools, not screenshots. A screenshot proves nothing a
   reviewer can re-check.
6. Risk-limit files are owner-only. Agents read them, never write them.

---

## Scope

This skill is only the v6-vs-v5 layer. Technique (ternaries and line continuation, `plot()` scope,
platform limits, debugging, backtest conventions) belongs in your own authoring reference. Keep it
there and keep this file about what v6 changed.
