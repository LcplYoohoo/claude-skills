#!/usr/bin/env node
'use strict';
/**
 * verify-live.js - the publish is not done until the LIVE bytes are clean.
 *
 *   node verify-live.js <raw-base-url> <staged-dir> [--patterns file]... [--prefix skills/name]
 *
 * For every file under <staged-dir>, fetches <raw-base-url>/<prefix>/<relative path> and runs the
 * sweep patterns over what the server returned. Reports HTTP status, byte count and hits per file.
 * <prefix> defaults to the staged dir's path relative to the repo root, found by walking up to .git.
 *
 * Example:
 *   node verify-live.js https://raw.githubusercontent.com/user/repo/main ./clone/skills/foo --patterns ~/private-patterns.txt
 *
 * Exit 0 = every file 200 and clean. 1 = a miss or a hit. 2 = could not run. Needs Node 18+ (fetch).
 */
const fs = require('fs');
const path = require('path');
const { loadPatterns, walk } = require('./sweep');

function repoRoot(dir) {
  let d = path.resolve(dir);
  for (let i = 0; i < 20; i++) { if (fs.existsSync(path.join(d, '.git'))) return d; const up = path.dirname(d); if (up === d) break; d = up; }
  return null;
}

async function main(argv) {
  const args = argv.slice(2);
  const pos = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--patterns' && args[i - 1] !== '--prefix');
  const [base, dir] = pos;
  if (!base || !dir) { process.stderr.write('usage: node verify-live.js <raw-base-url> <staged-dir> [--patterns file]... [--prefix path]\n'); return 2; }
  if (!fs.existsSync(dir)) { process.stderr.write(`not found: ${dir}\n`); return 2; }
  if (typeof fetch !== 'function') { process.stderr.write('needs Node 18+ (global fetch)\n'); return 2; }
  const patFiles = [];
  if (!args.includes('--no-default')) patFiles.push(path.join(__dirname, '..', 'assets', 'patterns.example.txt'));
  args.forEach((a, i) => { if (a === '--patterns' && args[i + 1]) patFiles.push(args[i + 1]); });
  if (!patFiles.length) { process.stderr.write('no patterns: --no-default needs at least one --patterns file\n'); return 2; }
  const patterns = loadPatterns(patFiles);
  let prefix = args.includes('--prefix') ? args[args.indexOf('--prefix') + 1] : null;
  if (prefix === null) { const root = repoRoot(dir); prefix = root ? path.relative(root, path.resolve(dir)).split(path.sep).join('/') : ''; }
  const files = walk(dir, ['md', 'txt', 'js', 'mjs', 'cjs', 'ts', 'json', 'ps1', 'sh', 'cmd', 'py', 'yml', 'yaml', 'toml', 'reg', 'html', 'svg', 'css', 'pine'], []);
  let bad = 0;
  process.stdout.write(`verify-live: ${files.length} file(s) under ${base}/${prefix}\n`);
  for (const f of files) {
    const rel = path.relative(dir, f).split(path.sep).join('/');
    const url = `${base.replace(/\/$/, '')}/${prefix ? prefix + '/' : ''}${rel}`;
    let status = 0, body = '';
    try { const res = await fetch(url, { headers: { 'cache-control': 'no-cache' } }); status = res.status; body = await res.text(); }
    catch (e) { status = -1; body = ''; }
    const hits = [];
    body.split(/\r?\n/).forEach((line, i) => { for (const p of patterns) if (p.re.test(line)) { hits.push(`${i + 1}: ${line.slice(0, 120)}  [${p.src}]`); break; } });
    const ok = status === 200 && hits.length === 0;
    if (!ok) bad++;
    process.stdout.write(`  ${ok ? 'ok  ' : 'FAIL'} ${String(status).padStart(3)} ${String(body.length).padStart(7)} B  ${rel}\n`);
    for (const h of hits) process.stdout.write(`        ${h}\n`);
    if (status === 200) {
      const local = fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
      if (local !== body.replace(/\r\n/g, '\n')) process.stdout.write(`        note: live bytes differ from the staged copy (not pushed yet, or CDN cache)\n`);
    }
  }
  process.stdout.write(bad ? `${bad} file(s) not clean or not live\n` : 'all live files 200 and clean\n');
  return bad ? 1 : 0;
}

if (require.main === module) main(process.argv).then(c => process.exit(c));
