#!/usr/bin/env node
'use strict';
// re-identify.js <file> — type from magic bytes (not the extension), size, sha256. Read-only.
const fs = require('fs');
const crypto = require('crypto');

function identify(buf) {
  const h = (n) => buf.subarray(0, n);
  const s = (n) => h(n).toString('latin1');
  const notes = [];
  let type = 'unknown';
  if (s(2) === 'MZ') {
    type = 'PE';
    const peOff = buf.length >= 0x40 ? buf.readUInt32LE(0x3c) : 0;
    if (peOff && peOff + 24 <= buf.length && buf.subarray(peOff, peOff + 4).toString('latin1') === 'PE\0\0') {
      const machine = buf.readUInt16LE(peOff + 4);
      const nSec = buf.readUInt16LE(peOff + 6);
      const optSize = buf.readUInt16LE(peOff + 20);
      const magic = buf.readUInt16LE(peOff + 24);
      const pe32plus = magic === 0x20b;
      notes.push(`machine=0x${machine.toString(16)} sections=${nSec} ${pe32plus ? 'PE32+' : 'PE32'}`);
      // CLI header = data directory 14 (COM descriptor)
      const ddBase = peOff + 24 + (pe32plus ? 112 : 96);
      const cliRva = ddBase + 14 * 8 + 8 <= buf.length && optSize > 0 ? buf.readUInt32LE(ddBase + 14 * 8) : 0;
      if (cliRva) { type = 'PE (.NET/CLI assembly)'; notes.push('CLI header present'); }
      const secBase = peOff + 24 + optSize;
      const names = [];
      for (let i = 0; i < nSec && secBase + (i + 1) * 40 <= buf.length; i++) names.push(buf.subarray(secBase + i * 40, secBase + i * 40 + 8).toString('latin1').replace(/\0+$/, ''));
      if (names.length) notes.push('sections: ' + names.join(' '));
      if (names.includes('.dep-v0')) notes.push('cargo-auditable .dep-v0 section (Rust)');
    } else notes.push('MZ without PE header (DOS stub only?)');
  } else if (s(4) === '\x7fELF') { type = 'ELF'; notes.push(`${buf[4] === 2 ? '64' : '32'}-bit ${buf[5] === 1 ? 'LE' : 'BE'} machine=0x${buf.readUInt16LE(18).toString(16)}`); }
  else if (['\xfe\xed\xfa\xce', '\xfe\xed\xfa\xcf', '\xce\xfa\xed\xfe', '\xcf\xfa\xed\xfe'].includes(s(4))) type = 'Mach-O (thin)';
  else if (s(4) === '\xca\xfe\xba\xbe') type = 'Mach-O (fat/universal) or Java class';
  else if (s(4) === 'PK\x03\x04') {
    type = 'ZIP';
    const names = zipNames(buf);
    if (names.includes('AndroidManifest.xml') && names.some((n) => /^classes\d*\.dex$/.test(n))) type = 'ZIP (APK)';
    else if (names.includes('META-INF/MANIFEST.MF') && names.some((n) => n.endsWith('.class'))) type = 'ZIP (JAR)';
    else if (names.includes('[Content_Types].xml')) type = 'ZIP (OOXML document)';
    notes.push(`${names.length} entries` + (names.length ? ', e.g. ' + names.slice(0, 6).join(', ') : ''));
  }
  else if (s(16) === 'SQLite format 3\0') type = 'SQLite 3';
  else if (s(4) === '\0asm') { type = 'WASM'; notes.push('version ' + buf.readUInt32LE(4)); }
  else if (s(2) === '\x1f\x8b') type = 'gzip';
  else if (s(3) === 'BZh') type = 'bzip2';
  else if (s(5) === '%PDF-') type = 'PDF';
  if (type === 'unknown' && buf.length >= 16 && buf.readUInt32LE(0) === 4) {
    // asar: [4][headerSize][headerSize-4?][jsonLen] + JSON index
    const jsonLen = buf.readUInt32LE(12);
    const head = buf.subarray(16, 16 + Math.min(jsonLen, 64)).toString('utf8');
    if (head.startsWith('{"files"')) { type = 'asar (Electron archive)'; notes.push(`index ${jsonLen} bytes`); }
  }
  if (type === 'unknown') {
    const txt = buf.subarray(0, 4096).toString('utf8');
    const printable = txt.replace(/[^\x09\x0a\x0d\x20-\x7e -￿]/g, '').length / Math.max(1, txt.length);
    if (printable > 0.95) {
      type = 'text';
      const t = txt.replace(/^(\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/))*/, '').trimStart(); // skip leading comments
      if (t.startsWith('{') || t.startsWith('[')) type = 'text (JSON?)';
      else if (/^(#!|'use strict'|"use strict"|import |export |var |let |const |\(function|!function)/.test(t)) type = 'text (JavaScript?)';
      else if (/^<\?xml|^<!doctype html|^<html/i.test(t)) type = 'text (XML/HTML)';
      if (/\/\/# sourceMappingURL=/.test(buf.subarray(Math.max(0, buf.length - 2048)).toString('utf8'))) notes.push('has sourceMappingURL');
    }
  }
  return { type, notes };
}

function zipNames(buf) {
  // walk local file headers (good enough for an inventory; central directory is authoritative)
  const names = [];
  let off = 0;
  while (off + 30 <= buf.length && buf.readUInt32LE(off) === 0x04034b50 && names.length < 20000) {
    const comp = buf.readUInt32LE(off + 18), nLen = buf.readUInt16LE(off + 26), eLen = buf.readUInt16LE(off + 28);
    const flags = buf.readUInt16LE(off + 6);
    names.push(buf.subarray(off + 30, off + 30 + nLen).toString('utf8'));
    if (flags & 8) break; // data descriptor: sizes unknown here, stop walking
    off += 30 + nLen + eLen + comp;
  }
  return names;
}

if (require.main === module) {
  const file = process.argv[2];
  if (!file) { console.error('usage: re-identify.js <file>'); process.exit(2); }
  const buf = fs.readFileSync(file);
  const { type, notes } = identify(buf);
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  console.log(JSON.stringify({ file, size: buf.length, sha256: sha, type, notes }, null, 2));
}
module.exports = { identify, zipNames };
