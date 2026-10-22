#!/usr/bin/env node
/**
 * codecheck.js — a static checker built from THIS codebase's own defect history.
 * Zero dependencies, read-only, no network.
 *
 *   node scripts/codecheck.js <file-or-dir> [...]
 *   node scripts/codecheck.js <path> --hints     # include lower-confidence hints
 *   node scripts/codecheck.js <path> --json
 *   node scripts/codecheck.self-test.js          # the rules' own regression fixtures
 *
 * Exit 0 = nothing certain found. 1 = findings. 2 = could not run.
 *
 * WHY NOT ESLINT. It is mature, it is free, and it would not have caught **one single
 * defect this codebase has actually shipped**. Not the sentinel arithmetic that made a
 * tool drop its own filename argument; not the flag value that became a positional path;
 * not the regex built from a string whose `\s` was eaten before it compiled; not the
 * unguarded `JSON.parse` that took the kill-switch monitor down. A general linter finds
 * unused variables and missing semicolons in code written carelessly. The code here is
 * written carefully and fails a different way: **the implementation matches the intent,
 * and the intent was incomplete.**
 *
 * So every rule below cites the real incident that earned it. A rule with no incident does
 * not belong in this file — that is the discipline that keeps it worth running, and it is
 * the same rule the 2026-09-13 skill survey used to kill 16 of 16 candidates.
 *
 * TWO CONFIDENCE TIERS, because a checker that cries wolf gets turned off — the lesson
 * from `wiring-check` reporting 98.7% broken and `contrast.js` producing six false
 * failures on its first real stylesheet:
 *
 *   CERTAIN   The pattern is the bug. Reported by default. Near-zero false positives.
 *   HINT      The pattern is where the bug lives. Needs `--hints`, and needs a human.
 *
 * WHAT IT CANNOT DO. It reads text. It cannot know whether a check actually fires, whether
 * a picture rendered, or whether a specification was complete. Those need the twelve angles
 * in the `adversarial-code-review` skill and, for anything that ships, a look at the real
 * output. **This is the mechanical half of the pass, never the whole of it.**
 */

'use strict';

const fs = require('fs');
const path = require('path');

// --- the rules ---------------------------------------------------------------
//
// Each: id, tier, what it matches, why it is a bug, and the incident that earned it.

const RULES = [
  {
    id: 'sentinel-arithmetic',
    tier: 'CERTAIN',
    // indexOf(...) + N  or  indexOf(...) - N  used without a preceding > -1 guard.
    re: /\.indexOf\s*\([^)]*\)\s*[+\-]\s*\d/g,
    what: 'indexOf() result used in arithmetic',
    why: 'indexOf returns -1 when absent, so `idx + 1` is 0 — a valid index, not a miss.',
    earned: 'codex-review.js computed `argv.indexOf("--focus") + 1` to skip the flag value. '
      + 'With no --focus that is 0, so it dropped ARGUMENT ZERO — the filename. The tool only '
      + 'ever worked when --focus was passed, and it always was. 2026-09-16.',
    fix: 'Guard first: `const i = argv.indexOf(f); const v = i > -1 ? argv[i+1] : null;`',
  },
  {
    id: 'flag-value-as-positional',
    tier: 'CERTAIN',
    // Accepts both `a =>` and `(a) =>` — the parenthesised form was missed entirely.
    re: /\.filter\s*\(\s*\(?\s*(\w+)\s*\)?\s*=>\s*!\s*\1\s*\.startsWith\s*\(\s*['"]--/g,
    what: 'positional args filtered only by "starts with --"',
    why: 'A flag VALUE does not start with --, so it becomes a positional argument.',
    earned: '`tosvg.js --wait 3000 page.html` tried to open ./3000 as the input file; '
      + '`baseline.js --search 999 oklch` searched for "999". Same defect in three tools, '
      + 'found in one sweep by angle 8 of adversarial-code-review. 2026-09-16.',
    fix: 'Name the flags that take a value and skip the arg after each: '
      + '`const VALUED = new Set(["--wait"]); argv.filter((a,i) => !a.startsWith("--") && !VALUED.has(argv[i-1]))`',
  },
  {
    id: 'regex-from-string-escape',
    tier: 'CERTAIN',
    // new RegExp('...\s...') — a single backslash inside a normal string literal is eaten
    // by the JS string parser before RegExp ever sees it.
    // (?<!\\) — the backslash must NOT already be escaped. `new RegExp('\\bid=')` is
    // CORRECT (doubled) and this flagged it in tosvg.js and wiring-check.js on the first
    // real run: a checker whose findings are all correct code is worse than no checker.
    // Only a LONE backslash before s/d/w/b is the bug. 2026-09-16.
    re: /new RegExp\s*\(\s*['"][^'"]*(?<!\\)\\[sdwbSDWB][^'"]*['"]/g,
    what: 'RegExp built from a string containing a single-backslash escape',
    why: 'JS string parsing eats an unknown escape: "\\s" becomes "s", so /^s*/ matches '
      + 'nothing and the check silently never fires.',
    earned: 'wiring-check\'s harness-key filter became /^s*(?:modified|...)/ and matched '
      + 'zero lines. It reported every false positive again while looking like it worked. '
      + '2026-09-15.',
    fix: 'Use a regex literal, or double every backslash in the string.',
  },
  {
    id: 'unguarded-json-parse',
    tier: 'CERTAIN',
    re: /JSON\.parse\s*\(\s*(?:fs\.)?readFileSync\s*\(/g,
    what: 'JSON.parse of a file read with no try/catch on the same expression',
    why: 'One stray character in the file throws, and the caller dies with a stack trace '
      + 'instead of a usable message — or worse, a scheduled job dies silently.',
    earned: 'A risk-limits JSON file had one extra comma on 2026-09-15. The monitor that parsed it '
      + 'as its first statement could not start, so the kill switch it guarded could never '
      + 'have tripped.',
    fix: 'Wrap it and say WHICH file and WHAT was wrong: `try { ... } catch (e) { '
      + 'die("cannot parse " + p + ": " + e.message) }`',
  },
  {
    id: 'empty-catch',
    tier: 'CERTAIN',
    re: /catch\s*(?:\([^)]*\))?\s*\{\s*\}/g,
    what: 'empty catch block',
    why: 'Swallows the error AND the evidence. The failure becomes a wrong result instead '
      + 'of a stack trace.',
    earned: 'The house rule across this tree: a transform or harness that silently does '
      + 'nothing still reports a pass — eight instances across 2026-09-13/14, one of them a '
      + 'FALSE PROOF that a real bug was already fixed.',
    fix: 'If it is genuinely ignorable, say so in a comment: `catch { /* no config file */ }`',
  },
  {
    id: 'async-foreach',
    tier: 'CERTAIN',
    re: /\.forEach\s*\(\s*async\b/g,
    what: 'async callback passed to forEach',
    why: 'forEach does not await. Every callback starts, none is waited for, and the '
      + 'function returns before any of them finish.',
    earned: 'Generic, but it is the shape of every "it reported done before it was done" '
      + 'bug. Included because the cost of the mistake here is a false completion report.',
    fix: 'Use `for (const x of xs) { await ... }`, or `await Promise.all(xs.map(...))`.',
  },
  {
    id: 'windows-path-escape',
    tier: 'CERTAIN',
    // A double-quoted or backtick string containing C:\ followed by a letter that is a
    // known escape: \t \n \r \b \f \v — these silently become control characters.
    // \b before the drive letter — a SINGLE letter then a colon. Without it this matched
    // `Chrome stderr:\n${stderr}` in archify, reading "stderr:" as a drive. Found by
    // running the checker over the tree, 2026-09-16.
    // The drive letter must sit where a path STARTS: straight after the opening quote, or
    // after whitespace or one of ( = , ; ' — never after a word character or a closing }.
    // "Preceded by a NON-letter" was too loose: it let a digit, an underscore and the } of a
    // ${...} through, so `${triggerR}R:` plus a real newline escape (the end of a "-2R:"
    // label) read as drive R: and kill-switch-monitor.js:373, correct code, was reported
    // CERTAIN. 2026-10-09; fixtures in codecheck.self-test.js.
    // The group is optional because `"C:\...` puts the letter immediately after the quote —
    // making it mandatory dropped the main case and the fixture count went 7 -> 6, which is
    // how that was caught. 2026-09-16.
    // (?<!\\) before the backslash: a DOUBLED backslash is correct and must not be flagged.
    // Without it, `"C:\\dev\\tools\\markmap"` — properly escaped — was reported as CERTAIN.
    // Confirmed by Codex review and reproduced on a fixture, 2026-09-16.
    re: /["`](?:[^"`\n]*?[\s(=,;'])?[A-Za-z]:(?<!\\)\\(?!\\)(?:[^"`\n]*?(?<!\\)\\(?!\\))?[tnrbfv][^"`\n]*["`]/g,
    what: 'Windows path in a string where a backslash forms an escape sequence',
    why: 'C:\\tools becomes C:<TAB>ools. The path is silently wrong and the error appears '
      + 'somewhere else entirely.',
    earned: 'Hit FIVE times on 2026-09-15 writing docs and tools — "C:\\dev\\tools\\markmap" '
      + 'rendered as "C:\\dev<TAB>ools\\markmap" in two docs, and again '
      + 'in the Codex decide file. Forward slashes work everywhere on Windows.',
    fix: 'Use forward slashes, or double the backslashes.',
  },
  {
    id: 'error-then-success',
    tier: 'HINT',
    // A line that prints an error, with a `return 0` or `process.exit(0)` within 3 lines.
    multiline: true,
    re: /(?:stderr\.write|console\.error)\([^)]*(?:error|ERROR|failed|FAIL|cannot)[^)]*\)[\s\S]{0,160}?(?:return 0|process\.exit\(0\))/g,
    what: 'an error is reported and the function still returns success',
    why: 'Anything gating on the exit code treats the failure as a pass.',
    earned: 'codex-companion\'s `status` and `result` exit 0 on a failed job — their text is '
      + 'honest, the exit code is not. Never gate automation on them.',
    fix: 'Return non-zero from every path that printed a failure.',
  },
  {
    id: 'replace-unchecked',
    tier: 'HINT',
    re: /^\s*(?:const|let|var)?\s*\w*\s*=?\s*\w+\.replace\s*\(/gm,
    what: 'a .replace() whose effect is never asserted',
    why: 'A pattern that matches nothing returns the input unchanged and reports success. '
      + 'This is the single most repeated failure in this tree.',
    earned: 'Eight instances across 2026-09-13/14, including a transform that produced a '
      + 'FALSE PROOF that a real bug had been fixed. The rule since: assert the transform '
      + 'changed something.',
    fix: 'For anything load-bearing: `const out = s.replace(re, x); if (out === s) throw ...`',
  },
  {
    id: 'temp-file-outside-try',
    tier: 'HINT',
    multiline: true,
    re: /writeFileSync\s*\([^)]*tmp[^)]*\)[\s\S]{0,80}?\n\s*(?:let|const)?\s*\w*\s*;?\s*\n?\s*try\s*\{/g,
    what: 'a temp file written BEFORE the try that is supposed to clean it up',
    why: 'If the write itself throws after creating or truncating the file, the finally '
      + 'never runs and the file is left behind.',
    earned: 'lesson.js wrote its mermaid temp file outside the try/finally. Codex review, '
      + '2026-09-15.',
    fix: 'Move the write inside the try.',
  },
];

// --- scanning ----------------------------------------------------------------

const SKIP_DIRS = new Set(['node_modules', '.git', '.vercel', 'dist', '.next', 'android', 'ios']);

function collect(target, out) {
  let st;
  try { st = fs.statSync(target); } catch { return out; }
  if (st.isFile()) {
    if (/\.(?:js|mjs|cjs)$/i.test(target)) out.push(target);
    return out;
  }
  let entries;
  try { entries = fs.readdirSync(target, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    collect(path.join(target, e.name), out);
  }
  return out;
}

/** Line number of a character offset, 1-based. */
const lineAt = (src, idx) => src.slice(0, idx).split('\n').length;

/**
 * Is this offset inside a comment or a string? Crude but effective: the rules above match
 * code shapes, and the single biggest false-positive source is a rule matching its own
 * description in a comment — which this file is full of.
 */
function inCommentOrDoc(src, idx) {
  const lineStart = src.lastIndexOf('\n', idx - 1) + 1;
  const eol = src.indexOf('\n', idx) === -1 ? src.length : src.indexOf('\n', idx);
  const line = src.slice(lineStart, eol);
  if (/^\s*(?:\/\/|\*|\/\*)/.test(line)) return true;
  // INLINE comments too. `run(); // JSON.parse(fs.readFileSync(p))` was reported as a
  // CERTAIN defect — a checker that flags its own examples in prose is the cry-wolf
  // failure. Found by Codex review 2026-09-16.
  const slashes = line.indexOf('//');
  return slashes > -1 && (idx - lineStart) > slashes;
}

/**
 * Is this `JSON.parse` already inside a try block?
 *
 * The rule claimed "with no try/catch" and could not check it, so
 * `try { JSON.parse(...) } catch (e) { handle(e) }` — correct code — was reported CERTAIN.
 * Ten of the twenty-one findings on the first tree scan were this shape. Confirmed on a
 * fixture after Codex review, 2026-09-16.
 *
 * Walks backwards counting braces: if an unclosed `try {` encloses the offset, it is
 * guarded. Crude, and deliberately biased toward silence — a missed real defect costs less
 * than a rule nobody trusts.
 */
function insideTry(src, idx) {
  let depth = 0;
  for (let i = idx; i > 0; i--) {
    const c = src[i];
    if (c === '}') depth++;
    else if (c === '{') {
      if (depth === 0) {
        const before = src.slice(Math.max(0, i - 60), i);
        if (/\btry\s*$/.test(before)) return true;
      } else depth--;
    }
  }
  return false;
}

function checkFile(file, wantHints) {
  let src;
  try { src = fs.readFileSync(file, 'utf8'); } catch { return []; }

  // SKIP THIS FILE'S OWN RULE TABLE. Every rule description contains an example of the
  // pattern it matches, so scanning them reports the catalogue as bugs. Found on the first
  // real run: three of the eleven findings were codecheck.js quoting itself. A checker
  // whose loudest finding is its own documentation is the cry-wolf failure again.
  // SCOPED TO THIS FILE. The suppression previously applied to EVERY scanned file, so any
  // other module declaring `const RULES = [` had its real findings silently discarded.
  // Codex review, 2026-09-16.
  const isSelf = path.resolve(file) === path.resolve(__filename);
  const rulesStart = isSelf ? src.indexOf('const RULES = [') : -1;
  const rulesEnd = rulesStart > -1 ? src.indexOf('\n];', rulesStart) : -1;
  const inOwnRules = idx => rulesStart > -1 && idx > rulesStart && idx < rulesEnd;

  // A test file reads files it wrote a moment earlier and is run by hand: a throw IS the failure report
  // there, nobody is left with a silently dead job. The json rule's incident is an unattended script, so
  // it does not apply to *.self-test.js / *.test.js (15 sites across two executor self-tests were noise,
  // 2026-09-30 — a false positive is a defect in the rule).
  const isTestFile = /\.(?:self-)?test\.js$/.test(path.basename(file));

  const found = [];
  for (const rule of RULES) {
    if (rule.tier === 'HINT' && !wantHints) continue;
    rule.re.lastIndex = 0;
    let m;
    while ((m = rule.re.exec(src)) !== null) {
      if (inCommentOrDoc(src, m.index) || inOwnRules(m.index)) continue;
      // The json rule is the only one whose claim depends on surrounding context.
      if (rule.id === 'unguarded-json-parse' && (isTestFile || insideTry(src, m.index))) continue;
      found.push({
        file, line: lineAt(src, m.index), rule: rule.id, tier: rule.tier,
        what: rule.what, why: rule.why, earned: rule.earned, fix: rule.fix,
        snippet: m[0].replace(/\s+/g, ' ').slice(0, 90),
      });
      if (!rule.re.global) break;
    }
  }
  return found;
}

// --- cli ---------------------------------------------------------------------


function main(argv) {
  const wantHints = argv.includes('--hints');
  // This file had the very bug it checks for (rule flag-value-as-positional), found by
  // running itself against the tree on 2026-09-16. No flag here takes a value today, but
  // the shape is the defect and the next flag added would inherit it.
  const VALUED = new Set([]);
  let targets = argv.filter((a, i) => !a.startsWith('--') && !VALUED.has(argv[i - 1]));

  if (!targets.length) {
    process.stderr.write('usage: node codecheck.js <file-or-dir> [...] [--hints] [--json]\n');
    return 2;
  }

  // A MISSING TARGET IS AN ERROR. `codecheck.js valid.js typo.js` used to scan one file
  // and report success, implying both were clean. Codex review, 2026-09-16.
  const missing = targets.filter(t => !fs.existsSync(t));
  if (missing.length) {
    process.stderr.write('no such path: ' + missing.join(', ') + '\n');
    return 2;
  }
  const files = [];
  for (const t of targets) collect(t, files);
  if (!files.length) { process.stderr.write('no .js files found\n'); return 2; }

  const all = [];
  for (const f of files) all.push(...checkFile(f, wantHints));

  if (argv.includes('--json')) {
    console.log(JSON.stringify({ scanned: files.length, findings: all }, null, 2));
    return all.some(f => f.tier === 'CERTAIN') ? 1 : 0;
  }

  console.log('codecheck — ' + files.length + ' file(s) scanned, '
    + RULES.filter(r => r.tier === 'CERTAIN' || wantHints).length + ' rules'
    + (wantHints ? ' (incl. hints)' : ' (use --hints for lower-confidence patterns)') + '\n');

  // Group by rule: one defect class explained once, with every site listed. A per-site
  // report repeats the same paragraph N times and nobody reads the Nth.
  const byRule = new Map();
  for (const f of all) {
    if (!byRule.has(f.rule)) byRule.set(f.rule, []);
    byRule.get(f.rule).push(f);
  }
  const order = { CERTAIN: 0, HINT: 1 };
  const rules = [...byRule.entries()].sort((a, b) =>
    order[a[1][0].tier] - order[b[1][0].tier]);

  for (const [id, hits] of rules) {
    const r = hits[0];
    console.log('  ' + r.tier + '  ' + id + '   [' + hits.length + ' site'
      + (hits.length > 1 ? 's' : '') + ']');
    console.log('    ' + r.what);
    console.log('    WHY : ' + r.why);
    console.log('    PAST: ' + r.earned);
    console.log('    FIX : ' + r.fix);
    for (const h of hits.slice(0, 8)) {
      console.log('      ' + path.relative(process.cwd(), h.file).replace(/\\/g, '/')
        + ':' + h.line + '   ' + h.snippet);
    }
    if (hits.length > 8) console.log('      ... and ' + (hits.length - 8) + ' more');
    console.log('');
  }

  const certain = all.filter(f => f.tier === 'CERTAIN').length;
  const hints = all.length - certain;
  if (!all.length) {
    console.log('Nothing found. That is a real result for these rules — but they are');
    console.log('MECHANICAL. Run the twelve angles in `adversarial-code-review` for the');
    console.log('defects no pattern can see, and look at the actual output before shipping.');
  } else {
    console.log(certain + ' certain, ' + hints + ' hint(s), across ' + byRule.size + ' rule(s).');
    console.log('\nThis is the mechanical half. The twelve angles in `adversarial-code-review`');
    console.log('cover what a pattern cannot: an incomplete specification, a check that never');
    console.log('fires, a picture that rendered blank.');
  }
  return certain ? 1 : 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { RULES, checkFile };
