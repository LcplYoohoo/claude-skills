#!/usr/bin/env node
'use strict';
/**
 * sweep.js - find identifier leaks in a directory tree before (and after) publishing.
 *
 *   node sweep.js <dir> [--patterns file]... [--counts] [--ext md,js,ps1,...] [--json]
 *
 * Patterns: one JavaScript regex per line, case-insensitive unless the line ends with /c.
 * Lines starting with # are comments. The generic set in ../assets/patterns.example.txt is ALWAYS
 * loaded (pass --no-default to drop it); add one or more --patterns files on top. Your PRIVATE
 * patterns (your name, handle, projects, machine paths) belong in a file outside any repo.
 *
 * Exit 0 = no hits. 1 = hits. 2 = could not run.
 * Reads only. Writes nothing. No network.
 */
const fs = require('fs');
const path = require('path');

const DEFAULT_EXT = ['md', 'txt', 'js', 'mjs', 'cjs', 'ts', 'json', 'ps1', 'psm1', 'sh', 'cmd', 'bat', 'py', 'yml', 'yaml', 'toml', 'reg', 'html', 'svg', 'css', 'pine'];

function loadPatterns(files) {
  const out = [];
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    text.split(/\r?\n/).forEach((line, i) => {
      const t = line.trim();
      if (!t || t.startsWith('#')) return;
      let src = t, flags = 'i';
      if (t.endsWith('/c')) { src = t.slice(0, -2).trim(); flags = ''; }
      try { out.push({ re: new RegExp(src, flags), src, from: path.basename(f) + ':' + (i + 1) }); }
      catch (e) { throw new Error(`bad pattern at ${f}:${i + 1}: ${t} (${e.message})`); }
    });
  }
  return out;
}

function walk(dir, exts, acc) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, exts, acc);
    else if (exts.includes(path.extname(e.name).slice(1).toLowerCase()) || !path.extname(e.name)) acc.push(p);
  }
  return acc;
}

function sweep(dir, patterns, exts, skip) {
  // Skip the pattern files themselves, and any copy of them inside the tree (same bytes): a patterns
  // file matches its own patterns by construction and is not what a reader will see as content.
  const skipSet = new Set((skip || []).map(p => path.resolve(p)));
  const skipBodies = new Set((skip || []).filter(p => fs.existsSync(p)).map(p => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n')));
  const files = walk(dir, exts, []).filter(f => {
    if (skipSet.has(path.resolve(f))) return false;
    if (skipBodies.size && path.basename(f) === 'patterns.example.txt') { try { return !skipBodies.has(fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n')); } catch { return true; } }
    return true;
  });
  const results = [];
  for (const f of files) {
    let text;
    try { text = fs.readFileSync(f, 'utf8'); } catch { continue; }
    if (text.includes('\u0000')) continue; // binary
    const hits = [];
    text.split(/\r?\n/).forEach((line, i) => {
      for (const p of patterns) {
        if (p.re.test(line)) { hits.push({ line: i + 1, pattern: p.src, text: line.length > 160 ? line.slice(0, 160) + '...' : line }); break; }
      }
    });
    if (hits.length) results.push({ file: path.relative(dir, f) || path.basename(f), hits });
  }
  return { files: files.length, results };
}

function main(argv) {
  const args = argv.slice(2);
  const dir = args.find(a => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--patterns' && args[args.indexOf(a) - 1] !== '--ext');
  if (!dir) { process.stderr.write('usage: node sweep.js <dir> [--patterns file]... [--no-default] [--counts] [--ext md,js] [--json]\n'); return 2; }
  if (!fs.existsSync(dir)) { process.stderr.write(`not found: ${dir}\n`); return 2; }
  const patFiles = [];
  if (!args.includes('--no-default')) patFiles.push(path.join(__dirname, '..', 'assets', 'patterns.example.txt'));
  args.forEach((a, i) => { if (a === '--patterns' && args[i + 1]) patFiles.push(args[i + 1]); });
  if (!patFiles.length) { process.stderr.write('no patterns: --no-default needs at least one --patterns file\n'); return 2; }
  for (const pf of patFiles) {
    if (!fs.existsSync(pf)) { process.stderr.write(`patterns file not found: ${pf}\n`); return 2; }
    const abs = path.resolve(pf), root = path.resolve(dir);
    if (abs.startsWith(root + path.sep)) process.stderr.write(`WARNING: patterns file ${pf} is INSIDE the directory being swept - a private patterns file must never be committed.\n`);
  }
  const extArg = args[args.indexOf('--ext') + 1];
  const exts = args.includes('--ext') && extArg ? extArg.split(',').map(s => s.trim().toLowerCase()) : DEFAULT_EXT;
  const patterns = loadPatterns(patFiles);
  // The patterns files themselves match their own patterns; they are never part of the published tree.
  const { files, results } = sweep(dir, patterns, exts, patFiles);
  const total = results.reduce((n, r) => n + r.hits.length, 0);

  if (args.includes('--json')) { process.stdout.write(JSON.stringify({ dir, files, patterns: patterns.length, total, results }, null, 2) + '\n'); return total ? 1 : 0; }
  process.stdout.write(`sweep: ${files} files, ${patterns.length} patterns, ${total} hit(s) in ${results.length} file(s)\n`);
  for (const r of results.sort((a, b) => b.hits.length - a.hits.length)) {
    if (args.includes('--counts')) process.stdout.write(`  ${String(r.hits.length).padStart(4)}  ${r.file}\n`);
    else { process.stdout.write(`\n${r.file}  (${r.hits.length})\n`); for (const h of r.hits) process.stdout.write(`  ${h.line}: ${h.text}\n      [${h.pattern}]\n`); }
  }
  if (!total) process.stdout.write('clean\n');
  return total ? 1 : 0;
}

if (require.main === module) process.exit(main(process.argv));
module.exports = { sweep, loadPatterns, walk };
