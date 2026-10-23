#!/usr/bin/env node
'use strict';
/**
 * scrub.js - apply ASSERTED replacements to a staged copy. Every replacement states how many
 * matches it expects; a mismatch - including zero - aborts the run with the file and the text,
 * because a scrub that silently did nothing is indistinguishable from one that worked.
 *
 *   node scrub.js <replacements.json> [--root dir] [--dry-run]
 *
 * replacements.json:
 *   { "root": "optional base dir (else --root, else cwd)",
 *     "replacements": [
 *       { "file": "skills/x/SKILL.md", "from": "literal text", "to": "new text" },            // expect 1
 *       { "file": "skills/x/SKILL.md", "from": "literal", "to": "new", "expect": 3 },          // exactly 3
 *       { "file": "skills/x/a.js", "regex": "^## Wiring\\n[\\s\\S]*$", "flags": "m", "to": "" },// regex, expect 1
 *       { "file": "skills/x/private.md", "delete": true },                                      // remove a file
 *       { "file": "skills/x/old.js", "rename": "skills/x/scripts/old.js" }                      // move a file
 *     ] }
 *
 * Literal "from"/"to" use \n for newlines; if the target file uses CRLF, both are converted.
 * All replacements are checked BEFORE any file is written (a failing one leaves the tree untouched).
 * No network. Writes only the files named.
 */
const fs = require('fs');
const path = require('path');

function plan(spec, root) {
  const ops = [];
  const cache = new Map();
  const read = f => { if (!cache.has(f)) cache.set(f, fs.readFileSync(f, 'utf8')); return cache.get(f); };
  spec.replacements.forEach((r, i) => {
    const file = path.resolve(root, r.file);
    const label = `#${i + 1} ${r.file}`;
    if (!fs.existsSync(file)) throw new Error(`${label}: file not found`);
    if (r.delete) { ops.push({ kind: 'delete', file, label }); return; }
    if (r.rename) { ops.push({ kind: 'rename', file, to: path.resolve(root, r.rename), label }); return; }
    const text = read(file);
    const crlf = text.includes('\r\n');
    const expect = r.expect === undefined ? 1 : r.expect;
    let count, next;
    if (r.regex !== undefined) {
      const flags = (r.flags || '').replace('g', '') + 'g';
      const re = new RegExp(r.regex, flags);
      count = (text.match(re) || []).length;
      next = text.replace(re, r.to === undefined ? '' : r.to);
    } else {
      if (typeof r.from !== 'string' || r.from === '') throw new Error(`${label}: "from" missing`);
      const from = crlf ? r.from.replace(/\r?\n/g, '\r\n') : r.from;
      const to = crlf ? (r.to || '').replace(/\r?\n/g, '\r\n') : (r.to || '');
      count = text.split(from).length - 1;
      next = text.split(from).join(to);
    }
    if (count !== expect) throw new Error(`${label}: expected ${expect} match(es), found ${count} for: ${(r.from || r.regex).slice(0, 80).replace(/\n/g, '\\n')}`);
    cache.set(file, next);
    ops.push({ kind: 'write', file, label, count });
  });
  return { ops, cache };
}

function apply({ ops, cache }, dryRun) {
  const written = new Set();
  for (const op of ops) {
    if (op.kind === 'write' && !written.has(op.file)) { if (!dryRun) fs.writeFileSync(op.file, cache.get(op.file)); written.add(op.file); }
    else if (op.kind === 'delete') { if (!dryRun) fs.rmSync(op.file, { force: true }); }
    else if (op.kind === 'rename') { if (!dryRun) { fs.mkdirSync(path.dirname(op.to), { recursive: true }); fs.renameSync(op.file, op.to); } }
  }
  return ops;
}

function main(argv) {
  const args = argv.slice(2);
  const specPath = args.find(a => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--root');
  if (!specPath) { process.stderr.write('usage: node scrub.js <replacements.json> [--root dir] [--dry-run]\n'); return 2; }
  let spec;
  try { spec = JSON.parse(fs.readFileSync(specPath, 'utf8')); } catch (e) { process.stderr.write(`cannot read ${specPath}: ${e.message}\n`); return 2; }
  if (!Array.isArray(spec.replacements)) { process.stderr.write('replacements.json needs a "replacements" array\n'); return 2; }
  const rootArg = args.includes('--root') ? args[args.indexOf('--root') + 1] : null;
  const root = path.resolve(rootArg || spec.root || process.cwd());
  const dryRun = args.includes('--dry-run');
  let planned;
  try { planned = plan(spec, root); } catch (e) { process.stderr.write(`scrub ABORTED, nothing written: ${e.message}\n`); return 1; }
  const ops = apply(planned, dryRun);
  const files = new Set(ops.map(o => o.file));
  process.stdout.write(`scrub ${dryRun ? '(dry run) ' : ''}ok: ${ops.length} replacement(s) across ${files.size} file(s)\n`);
  return 0;
}

if (require.main === module) process.exit(main(process.argv));
module.exports = { plan, apply };
