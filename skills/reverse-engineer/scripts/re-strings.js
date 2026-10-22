#!/usr/bin/env node
'use strict';
// re-strings.js <file> [minLen=6] [--all] — printable ASCII and UTF-16LE runs with file offsets,
// then an "interesting" tail (URLs, hosts, paths, key/secret-looking names, Go/Rust build lines).
// Read-only. Prints at most 2000 strings unless --all.
const fs = require('fs');

function* asciiRuns(buf, min) {
  let start = -1;
  for (let i = 0; i <= buf.length; i++) {
    const b = i < buf.length ? buf[i] : -1;
    const ok = b >= 0x20 && b <= 0x7e || b === 0x09;
    if (ok && start < 0) start = i;
    if (!ok && start >= 0) { if (i - start >= min) yield { off: start, enc: 'ascii', s: buf.subarray(start, i).toString('latin1') }; start = -1; }
  }
}
function* utf16Runs(buf, min) {
  // UTF-16LE strings can start at odd offsets; scan both alignments
  for (const align of [0, 1]) {
    let start = -1, n = 0;
    for (let i = align; i + 1 < buf.length; i += 2) {
      const lo = buf[i], hi = buf[i + 1];
      const ok = hi === 0 && (lo >= 0x20 && lo <= 0x7e);
      if (ok && start < 0) { start = i; n = 0; }
      if (ok) n++;
      if (!ok && start >= 0) { if (n >= min) yield { off: start, enc: 'utf16le', s: buf.subarray(start, start + n * 2).toString('utf16le') }; start = -1; }
    }
    if (start >= 0 && n >= min) yield { off: start, enc: 'utf16le', s: buf.subarray(start, start + n * 2).toString('utf16le') };
  }
}
const INTERESTING = [
  [/https?:\/\/[^\s"'<>]+/i, 'url'], [/\b[a-z0-9.-]+\.(com|net|org|io|app|dev|ai|xyz|co)\b/i, 'host'],
  [/(^|[\\/])(bin|lib|etc|usr|Users|Program Files|AppData)[\\/]/i, 'path'], [/\.(dll|so|dylib|node|exe)$/i, 'module'],
  [/(api[_-]?key|secret|token|password|passwd|bearer|private[_-]?key)/i, 'credential-looking'],
  [/^(path|mod|dep)\t\S+/, 'go-buildinfo'], [/\/rustc\/[0-9a-f]{40}\//, 'rust-toolchain'], [/Go buildinf:/, 'go-marker'],
  [/^[A-Za-z_][\w]*\.(get|post|put|delete|fetch)\b/i, 'api-call-ish'],
];

if (require.main === module) {
  const [file, minArg] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const all = process.argv.includes('--all');
  if (!file) { console.error('usage: re-strings.js <file> [minLen] [--all]'); process.exit(2); }
  const min = Number(minArg || 6);
  const buf = fs.readFileSync(file);
  const out = [];
  for (const r of asciiRuns(buf, min)) out.push(r);
  for (const r of utf16Runs(buf, min)) out.push(r);
  out.sort((a, b) => a.off - b.off);
  const interesting = [];
  for (const r of out) for (const [re, tag] of INTERESTING) if (re.test(r.s)) { interesting.push({ ...r, tag }); break; }
  const limit = all ? out.length : 2000;
  for (const r of out.slice(0, limit)) console.log(`${r.off.toString(16).padStart(8, '0')} ${r.enc === 'utf16le' ? 'U' : 'A'} ${r.s}`);
  if (out.length > limit) console.log(`… ${out.length - limit} more (use --all)`);
  console.log(`\n# interesting (${interesting.length}):`);
  for (const r of interesting.slice(0, 400)) console.log(`${r.off.toString(16).padStart(8, '0')} [${r.tag}] ${r.s.slice(0, 200)}`);
  console.log(`\n# total strings ${out.length} (ascii+utf16le, min ${min}) in ${buf.length} bytes`);
}
module.exports = { asciiRuns, utf16Runs };
