#!/usr/bin/env node
'use strict';
// re-asar.js list <app.asar> | extract <app.asar> <outdir> | pack <srcdir> <out.asar>
// Electron asar = [u32 4][u32 headerSize][u32 headerSize-4... ][u32 jsonLen][json index][file blobs].
// Offsets in the index are relative to the end of the (8 + headerSize) header. Read-only except `extract`
// (writes copies to outdir) and `pack` (used by selftest to build a fixture). Nothing is executed.
const fs = require('fs');
const path = require('path');

function readHeader(buf) {
  if (buf.length < 16 || buf.readUInt32LE(0) !== 4) throw new Error('not an asar: bad pickle header');
  const headerSize = buf.readUInt32LE(4);
  const jsonLen = buf.readUInt32LE(12);
  const json = buf.subarray(16, 16 + jsonLen).toString('utf8');
  return { index: JSON.parse(json), dataStart: 8 + headerSize };
}
function* walk(node, prefix = '') {
  for (const [name, v] of Object.entries(node.files || {})) {
    const p = prefix ? prefix + '/' + name : name;
    if (v.files) yield* walk(v, p);
    else yield { path: p, size: v.size, offset: v.offset !== undefined ? Number(v.offset) : null, unpacked: !!v.unpacked, link: v.link || null, executable: !!v.executable };
  }
}
function list(file) { const buf = fs.readFileSync(file); const { index, dataStart } = readHeader(buf); return { dataStart, entries: [...walk(index)] }; }
function extract(file, outdir) {
  const buf = fs.readFileSync(file); const { index, dataStart } = readHeader(buf); let n = 0;
  for (const e of walk(index)) {
    if (e.unpacked || e.offset === null) continue;
    const dest = path.join(outdir, e.path);
    if (!path.resolve(dest).startsWith(path.resolve(outdir) + path.sep)) throw new Error('path escape: ' + e.path);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf.subarray(dataStart + e.offset, dataStart + e.offset + e.size)); n++;
  }
  return n;
}
function pack(srcdir, out) {
  const files = {}; const blobs = []; let offset = 0;
  const add = (dir, node) => { for (const name of fs.readdirSync(dir).sort()) { const p = path.join(dir, name); const st = fs.statSync(p); if (st.isDirectory()) { node[name] = { files: {} }; add(p, node[name].files); } else { const b = fs.readFileSync(p); node[name] = { size: b.length, offset: String(offset) }; offset += b.length; blobs.push(b); } } };
  add(srcdir, files);
  const json = Buffer.from(JSON.stringify({ files }), 'utf8');
  const pad = (4 - (json.length % 4)) % 4;
  const headerSize = 4 + 4 + json.length + pad; // sizeField + lenField + json(+pad)
  const header = Buffer.alloc(8 + headerSize);
  header.writeUInt32LE(4, 0); header.writeUInt32LE(headerSize, 4); header.writeUInt32LE(headerSize - 4, 8); header.writeUInt32LE(json.length, 12); json.copy(header, 16);
  fs.writeFileSync(out, Buffer.concat([header, ...blobs]));
  return { entries: blobs.length, bytes: 8 + headerSize + offset };
}
if (require.main === module) {
  const [cmd, a, b] = process.argv.slice(2);
  if (cmd === 'list' && a) { const r = list(a); console.log(`# dataStart ${r.dataStart}, ${r.entries.length} entries`); for (const e of r.entries) console.log(`${String(e.size).padStart(10)} ${e.offset === null ? '      link' : String(e.offset).padStart(10)} ${e.unpacked ? 'U' : ' '} ${e.path}${e.link ? ' -> ' + e.link : ''}`); }
  else if (cmd === 'extract' && a && b) console.log(`extracted ${extract(a, b)} files to ${b}`);
  else if (cmd === 'pack' && a && b) console.log(JSON.stringify(pack(a, b)));
  else { console.error('usage: re-asar.js list <app.asar> | extract <app.asar> <outdir> | pack <srcdir> <out.asar>'); process.exit(2); }
}
module.exports = { list, extract, pack, readHeader };
