#!/usr/bin/env node
'use strict';
// re-evm.js <bytecode.hex|.bin> — function selectors from the dispatcher (PUSH4 <sel> … EQ within 4
// bytes), and the CBOR metadata trailer (last 2 bytes = its length). Selector names are NOT looked up
// (that would be an inference and a network call). Read-only.
const fs = require('fs');
const crypto = require('crypto');
const PUSH1 = 0x60, PUSH32 = 0x7f, EQ = 0x14;
function disasmWalk(code, fn) { for (let p = 0; p < code.length;) { const op = code[p]; const n = op >= PUSH1 && op <= PUSH32 ? op - PUSH1 + 1 : 0; fn(p, op, n ? code.subarray(p + 1, p + 1 + n) : null); p += 1 + n; } }
function selectors(code) {
  const found = new Map(); const ops = [];
  disasmWalk(code, (p, op, imm) => ops.push({ p, op, imm }));
  for (let i = 0; i < ops.length; i++) {
    const o = ops[i];
    if (o.op === 0x63 && o.imm && o.imm.length === 4) { // PUSH4
      for (let j = i + 1; j <= Math.min(i + 4, ops.length - 1); j++) if (ops[j].op === EQ) { const sel = '0x' + o.imm.toString('hex'); if (!found.has(sel)) found.set(sel, o.p); break; }
    }
  }
  return [...found].map(([selector, offset]) => ({ selector, offset }));
}
function cborTrailer(code) {
  if (code.length < 2) return null;
  const len = code.readUInt16BE(code.length - 2);
  if (len === 0 || len + 2 > code.length) return null;
  const payload = code.subarray(code.length - 2 - len, code.length - 2);
  let p = 0;
  const rd = () => {
    const ib = payload[p++]; const major = ib >> 5; let info = ib & 0x1f;
    if (info === 24) info = payload[p++]; else if (info === 25) { info = payload.readUInt16BE(p); p += 2; } else if (info === 26) { info = payload.readUInt32BE(p); p += 4; } else if (info > 26) throw new Error('cbor: unsupported length');
    if (major === 0) return info; if (major === 1) return -1 - info;
    if (major === 2) { const b = payload.subarray(p, p + info); p += info; return '0x' + b.toString('hex'); }
    if (major === 3) { const s = payload.subarray(p, p + info).toString('utf8'); p += info; return s; }
    if (major === 4) { const a = []; for (let i = 0; i < info; i++) a.push(rd()); return a; }
    if (major === 5) { const m = {}; for (let i = 0; i < info; i++) { const k = rd(); m[String(k)] = rd(); } return m; }
    if (major === 7 && (info === 20 || info === 21)) return info === 21; if (major === 7 && info === 22) return null;
    throw new Error('cbor: unsupported major ' + major);
  };
  try { const v = rd(); return { length: len, offset: code.length - 2 - len, metadata: v, decodedBytes: p, complete: p === len }; } catch (e) { return { length: len, offset: code.length - 2 - len, error: String(e.message) }; }
}
function inspect(file) {
  let raw = fs.readFileSync(file); let code;
  const txt = raw.toString('latin1').trim();
  if (/^(0x)?[0-9a-fA-F]+$/.test(txt)) code = Buffer.from(txt.replace(/^0x/, ''), 'hex'); else code = raw;
  const eof = code[0] === 0xef && code[1] === 0x00;
  return { file, bytes: code.length, sha256: crypto.createHash('sha256').update(code).digest('hex'), eofContainer: eof, selectors: eof ? [] : selectors(code), cbor: cborTrailer(code), note: 'selectors are dispatcher candidates (missing ≠ absent); names need a 4byte lookup = inference; init vs runtime code is unknown' };
}
if (require.main === module) {
  const file = process.argv[2];
  if (!file) { console.error('usage: re-evm.js <bytecode.hex|bin>'); process.exit(2); }
  console.log(JSON.stringify(inspect(file), null, 2));
}
module.exports = { inspect, selectors, cborTrailer };
