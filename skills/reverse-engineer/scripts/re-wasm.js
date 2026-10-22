#!/usr/bin/env node
'use strict';
// re-wasm.js <file.wasm> — imports, exports, custom-section names via WebAssembly.Module (compile only,
// never instantiated or run). Read-only.
const fs = require('fs');
const crypto = require('crypto');
function inspect(file) {
  const buf = fs.readFileSync(file);
  if (buf.subarray(0, 4).toString('latin1') !== '\0asm') throw new Error('not a wasm module');
  const mod = new WebAssembly.Module(buf);
  const customs = {};
  for (const n of ['name', 'producers', 'sourceMappingURL', 'target_features', 'dylink.0', 'linking']) { const s = WebAssembly.Module.customSections(mod, n); if (s.length) customs[n] = s.map((b) => b.byteLength); }
  return { file, size: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex'), version: buf.readUInt32LE(4), imports: WebAssembly.Module.imports(mod), exports: WebAssembly.Module.exports(mod), customSections: customs, note: 'compiled, not instantiated; signatures/WAT need WABT' };
}
if (require.main === module) {
  const file = process.argv[2];
  if (!file) { console.error('usage: re-wasm.js <file.wasm>'); process.exit(2); }
  console.log(JSON.stringify(inspect(file), null, 2));
}
module.exports = { inspect };
