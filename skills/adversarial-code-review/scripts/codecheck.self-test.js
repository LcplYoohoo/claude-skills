// codecheck.self-test.js — regression fixtures for codecheck.js, offline: `node scripts/codecheck.self-test.js`.
//
// WHY THIS EXISTS (2026-10-09): codecheck.js shipped with no test file, and no fixture file for it exists anywhere
// ("7/7 fixtures fire" is all OS.md recorded), so every false positive was fixed by hand and nothing stopped it coming
// back. The one that forced this file: windows-path-escape read the tail of an R-multiple label — the "R:" in
// ${triggerR}R: followed by a real newline escape — as drive R: and reported kill-switch-monitor.js:373 as CERTAIN on
// correct code. A false positive is a defect in the rule, so it gets a test like any other defect.
//
// Covers windows-path-escape only. The other six CERTAIN rules still have no persisted fixture.
//
// Both directions are tested because either alone passes vacuously: a rule that never fires passes every "stays quiet"
// case, and a rule that always fires passes every "must flag" case.
//
// Each fixture goes through the real checkFile(). Its backslashes are written {BS} and built at run time, so this file's
// own source holds no Windows-path escape for `codecheck.js --self` to report (the last check below proves it).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const { RULES, checkFile } = require('./codecheck');

const CODECHECK = path.join(__dirname, 'codecheck.js');
const RULE = 'windows-path-escape';

let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'codecheck-selftest-'));

const fx = (s) => s.split('{BS}').join('\\');
let n = 0;
const put = (line) => { const f = path.join(TMP, `fx${++n}.js`); fs.writeFileSync(f, fx(line) + '\n'); return f; };
const hits = (line) => checkFile(put(line), false).filter((h) => h.rule === RULE);

check(`the ${RULE} rule is loaded (without it every "stays quiet" case below would pass for nothing)`,
  RULES.some((r) => r.id === RULE && r.tier === 'CERTAIN'));

// ---- must be flagged: a Windows path in which a backslash starts an escape ----------------------------------------------
const FLAGGED = [
  ['C:{BS}tools', 'const p = "C:{BS}tools";'],
  ['C:{BS}new_folder', 'const p = "C:{BS}new_folder";'],
  ['C:{BS}temp in a backtick string', 'const p = `C:{BS}temp`;'],
  ['a path after a space: cd C:{BS}tools', 'run("cd C:{BS}tools");'],
  ['a path after =: PATH=C:{BS}bin', 'const e = "PATH=C:{BS}bin";'],
  ['a path after a comma', 'const l = "a.txt,C:{BS}tools";'],
  ['a path after a semicolon (a PATH list whose first entry is correctly doubled)', 'const l = "C:{BS}{BS}bin;D:{BS}tools";'],
  ['a path after (', 'const l = "open(C:{BS}tools)";'],
  ['a path after a single quote inside the string', `const l = "copy 'C:{BS}tools' x";`],
  ['a deeper segment is the one that breaks: C:{BS}Users{BS}alice{BS}temp', 'const p = "C:{BS}Users{BS}alice{BS}temp";'],
  ['a lowercase drive: c:{BS}new', 'const p = "c:{BS}new";'],
];
for (const esc of ['t', 'n', 'r', 'b', 'f', 'v']) FLAGGED.push([`D:{BS}${esc}x — the escape {BS}${esc}`, `const p = "D:{BS}${esc}x";`]);
for (const [label, line] of FLAGGED) {
  const h = hits(line);
  check(`flagged: ${fx(label)}`, h.length === 1, h.length === 1 ? '' : `${h.length} hit(s) on: ${fx(line)}`);
}

// ---- must stay quiet: correct code, or no drive letter at all ---------------------------------------------------------
const QUIET = [
  // 2026-10-09 — kill-switch-monitor.js:373, verbatim. The "R:" is the end of a "-2R:" label, preceded by the } of ${triggerR}.
  ['the reported case: ${triggerR}R: then a newline escape (kill-switch-monitor.js:373)',
    'const text = `${breached.length} simulated position(s) at or beyond ${triggerR}R:{BS}n{BS}n${lines}{BS}n{BS}n`;'],
  ['the same shape with a tab escape', 'const text = `${n}R:{BS}t${v}`;'],
  // 2026-09-16 — archify's visual-check.mjs.
  ['a word that ends in a lone letter: Chrome stderr:', 'const m = `Chrome stderr:{BS}n${stderr}`;'],
  ['a label that ends in a digit and R: -2R:', 'const m = "-2R:{BS}n";'],
  ['a label that ends in an underscore and R: stop_R:', 'const m = "stop_R:{BS}n";'],
  ['an ordinary label: Error:', 'const m = "Error:{BS}n";'],
  // 2026-09-16 — properly doubled backslashes, found flagged by the Codex review.
  ['a correctly doubled path: C:{BS}{BS}dev{BS}{BS}tools', 'const p = "C:{BS}{BS}dev{BS}{BS}tools";'],
  ['a correctly doubled path whose folder starts with an escape letter: C:{BS}{BS}new_folder', 'const p = "C:{BS}{BS}new_folder";'],
  ['a forward-slash path', 'const p = "C:/new_folder";'],
];
for (const [label, line] of QUIET) {
  const h = hits(line);
  check(`quiet: ${fx(label)}`, h.length === 0, h.length ? `flagged: ${h[0].snippet}` : '');
}

// ---- the command line: what the reproduction in the bug report actually ran -----------------------------------------
const run = (file) => cp.spawnSync(process.execPath, [CODECHECK, file], { encoding: 'utf8' });
const rBad = run(put('const p = "C:{BS}new_folder";'));
const rOk = run(put(QUIET[0][1]));
check('CLI: a broken path exits 1 and names the rule', rBad.status === 1 && rBad.stdout.includes(RULE), `exit ${rBad.status}`);
check('CLI: the reported case exits 0 with nothing found', rOk.status === 0 && /Nothing found/.test(rOk.stdout), `exit ${rOk.status}`);
const rSelf = run(__filename);
check('this test file is clean under codecheck (so `codecheck.js --self` stays clean with it in the tree)', rSelf.status === 0, `exit ${rSelf.status}`);

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* temp dir */ }
console.log(`\n${fail ? 'FAIL' : 'OK'}    ${pass}/${pass + fail} checks passed.`);
process.exit(fail ? 1 : 0);
