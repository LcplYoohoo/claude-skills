#!/usr/bin/env node
'use strict';
// re-fuses.js <electron-exe-or-framework> — Electron fuses from the binary's fuse wire. Read-only.
// Wire: sentinel, then [version u8][length u8][one byte per fuse]. 0x31 enabled, 0x30 disabled, 0x72 removed.
const fs = require('fs');
const SENTINEL = Buffer.from('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX', 'latin1'); // Electron's FuseV1 sentinel
const V1 = ['RunAsNode', 'EnableCookieEncryption', 'EnableNodeOptionsEnvironmentVariable', 'EnableNodeCliInspectArguments', 'EnableEmbeddedAsarIntegrityValidation', 'OnlyLoadAppFromAsar', 'LoadBrowserProcessSpecificV8Snapshot', 'GrantFileProtocolExtraPrivileges', 'WasmTrapHandlers'];
const STATE = { 0x31: 'enabled', 0x30: 'disabled', 0x72: 'removed' };

function readFuses(buf) {
  const hits = []; let from = 0;
  while (hits.length < 32) {
    const i = buf.indexOf(SENTINEL, from); if (i < 0) break;
    const p = i + SENTINEL.length;
    const version = buf[p], length = buf[p + 1];
    const fuses = [];
    for (let k = 0; k < length && p + 2 + k < buf.length; k++) { const raw = buf[p + 2 + k]; fuses.push({ index: k, name: V1[k] || `fuse${k}`, state: STATE[raw] || 'unknown', raw: '0x' + raw.toString(16) }); }
    hits.push({ sentinelOffset: i, version, length, truncated: p + 2 + length > buf.length, fuses });
    from = p + 2 + length;
  }
  return hits;
}
if (require.main === module) {
  const file = process.argv[2];
  if (!file) { console.error('usage: re-fuses.js <electron.exe>'); process.exit(2); }
  const buf = fs.readFileSync(file);
  const hits = readFuses(buf);
  if (!hits.length) { console.log(JSON.stringify({ file, size: buf.length, sentinels: 0, note: 'no fuse sentinel found: state UNKNOWN (not an Electron binary, a framework-split build, or a fuse-less version)' }, null, 2)); process.exit(0); }
  console.log(JSON.stringify({ file, size: buf.length, sentinels: hits.length, wires: hits }, null, 2));
}
module.exports = { readFuses, SENTINEL, V1 };
