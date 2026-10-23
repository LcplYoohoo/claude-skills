#!/usr/bin/env node
'use strict';
// selftest.js - fixtures for sweep.js and scrub.js. No network. `node selftest.js`
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const { sweep, loadPatterns } = require('./sweep');
const { plan, apply } = require('./scrub');

let pass = 0, fail = 0;
function check(name, cond, detail) { if (cond) { pass++; console.log('ok  ' + name); } else { fail++; console.log('FAIL ' + name + (detail ? ' - ' + detail : '')); } }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-publishing-'));
const dir = path.join(tmp, 'skills', 'demo');
fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
// Fixture strings are assembled at runtime so that sweeping THIS skill's own directory stays clean.
const BS = String.fromCharCode(92);
const NAME = ['Alice', 'Example'].join(' ');
const USER = 'al' + 'ice';
const MAIL = USER + '@' + 'example.com';
const WINPATH = 'C:' + BS + 'Users' + BS + USER + BS + 'tools' + BS + 'x.js';
const MACPATH = '/Users/' + USER + '/work';
const PRIV = 'WO' + 'RK/private/notes.md';
fs.writeFileSync(path.join(dir, 'SKILL.md'), [
  '---', 'name: demo', 'description: Use when ' + NAME + ' asks for a demo.', '---',
  '# Demo', '', 'Run `node ' + WINPATH + '`.', 'Mail ' + MAIL + ' for help.', 'Nothing private here.'].join('\n'));
fs.writeFileSync(path.join(dir, 'scripts', 'a.js'), "const home = '" + MACPATH + "';\nconst re = /C:" + BS + BS + "Users" + BS + BS + "/; // detects paths, not a leak\n");
fs.writeFileSync(path.join(dir, 'crlf.md'), 'line one\r\nSee ' + PRIV + '\r\nline three\r\n');
const privatePatterns = path.join(tmp, 'private-patterns.txt');
fs.writeFileSync(privatePatterns, '# private\n' + NAME + '\n\\b' + USER + '\\b\n' + 'WO' + 'RK/\n');

// --- sweep
const pats = loadPatterns([path.join(__dirname, '..', 'assets', 'patterns.example.txt'), privatePatterns]);
const r = sweep(dir, pats, ['md', 'js']);
const byFile = Object.fromEntries(r.results.map(x => [x.file.split(path.sep).join('/'), x.hits.length]));
check('sweep: scans all three files', r.files === 3, 'files=' + r.files);
check('sweep: SKILL.md description + path + email flagged (3 lines)', byFile['SKILL.md'] === 3, JSON.stringify(byFile));
check('sweep: a.js home path flagged; the escaped path-detecting regex is not a hit', byFile['scripts/a.js'] === 1, JSON.stringify(byFile));
check('sweep: CRLF file private path flagged', byFile['crlf.md'] === 1, JSON.stringify(byFile));

// --- sweep CLI exit codes
const cli = cp.spawnSync(process.execPath, [path.join(__dirname, 'sweep.js'), dir, '--patterns', privatePatterns, '--counts'], { encoding: 'utf8' });
check('sweep CLI: exit 1 with hits', cli.status === 1, 'status=' + cli.status);
const cleanDir = path.join(tmp, 'clean'); fs.mkdirSync(cleanDir); fs.writeFileSync(path.join(cleanDir, 'ok.md'), '# fine\nnothing here\n');
const cli2 = cp.spawnSync(process.execPath, [path.join(__dirname, 'sweep.js'), cleanDir], { encoding: 'utf8' });
check('sweep CLI: exit 0 when clean', cli2.status === 0 && /clean/.test(cli2.stdout), 'status=' + cli2.status);
const inside = path.join(dir, 'pats.txt'); fs.writeFileSync(inside, 'x\n');
const cli3 = cp.spawnSync(process.execPath, [path.join(__dirname, 'sweep.js'), dir, '--patterns', inside], { encoding: 'utf8' });
check('sweep CLI: warns when the patterns file is inside the swept tree', /WARNING/.test(cli3.stderr));
fs.rmSync(inside);

// --- scrub
const good = { replacements: [
  { file: 'skills/demo/SKILL.md', from: 'Use when ' + NAME + ' asks', to: 'Use when the user asks' },
  { file: 'skills/demo/SKILL.md', from: 'node ' + WINPATH, to: 'node scripts/x.js' },
  { file: 'skills/demo/SKILL.md', regex: '^Mail .*\\n', flags: 'm', to: '' },
  { file: 'skills/demo/scripts/a.js', from: MACPATH, to: '.' },
  { file: 'skills/demo/crlf.md', from: 'See ' + PRIV + '\nline three', to: 'See the notes\nline three' },
] };
let planned;
try { planned = plan(good, tmp); apply(planned, false); check('scrub: five asserted replacements applied', true); }
catch (e) { check('scrub: five asserted replacements applied', false, e.message); }
const after = fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8');
check('scrub: description rewritten', after.includes('Use when the user asks') && !after.includes(NAME));
check('scrub: regex line removed', !after.includes(MAIL));
const crlfAfter = fs.readFileSync(path.join(dir, 'crlf.md'), 'utf8');
check('scrub: CRLF file replaced with CRLF preserved', crlfAfter === 'line one\r\nSee the notes\r\nline three\r\n', JSON.stringify(crlfAfter));

const before = fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8');
let threw = false;
try { plan({ replacements: [{ file: 'skills/demo/SKILL.md', from: 'text that is not there', to: 'x' }] }, tmp); } catch (e) { threw = /expected 1 match\(es\), found 0/.test(e.message); }
check('scrub: a replacement matching nothing aborts', threw);
check('scrub: aborted run wrote nothing', fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8') === before);
let threw2 = false;
try { plan({ replacements: [{ file: 'skills/demo/SKILL.md', from: 'e', to: 'E', expect: 1 }] }, tmp); } catch (e) { threw2 = /expected 1 match\(es\), found \d+/.test(e.message); }
check('scrub: wrong expected count aborts', threw2);
const cliS = cp.spawnSync(process.execPath, [path.join(__dirname, 'scrub.js'), path.join(tmp, 'nope.json')], { encoding: 'utf8' });
check('scrub CLI: exit 2 on unreadable spec', cliS.status === 2);

// --- post-scrub sweep with private patterns is clean except the path-detecting regex
const r2 = sweep(dir, pats, ['md', 'js']);
const left = r2.results.flatMap(x => x.hits.map(h => h.text));
check('sweep after scrub: clean', left.length === 0, JSON.stringify(left));

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\nselftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
