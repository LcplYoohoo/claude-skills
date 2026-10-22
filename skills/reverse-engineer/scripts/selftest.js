#!/usr/bin/env node
'use strict';
// selftest.js — builds its own fixtures in a temp dir and checks every script. No network, nothing executed.
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { execFileSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const S = __dirname;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 're-selftest-'));
const run = (script, ...args) => execFileSync(process.execPath, [path.join(S, script), ...args], { encoding: 'utf8', windowsHide: true });
let passed = 0;
const ok = (name, cond) => { assert(cond, name); passed++; console.log('ok  ' + name); };
try {
  // 1. asar round trip + identify
  const src = path.join(tmp, 'app'); fs.mkdirSync(path.join(src, 'src'), { recursive: true });
  fs.writeFileSync(path.join(src, 'package.json'), JSON.stringify({ name: 'fixture', main: 'src/main.js' }));
  fs.writeFileSync(path.join(src, 'src', 'main.js'), "const { ipcMain } = require('electron'); ipcMain.handle('export-pdf', () => 1);\n");
  const asar = path.join(tmp, 'app.asar');
  JSON.parse(run('re-asar.js', 'pack', src, asar));
  const listing = run('re-asar.js', 'list', asar);
  ok('asar list shows both files', /package\.json/.test(listing) && /src\/main\.js/.test(listing));
  const outdir = path.join(tmp, 'out'); run('re-asar.js', 'extract', asar, outdir);
  ok('asar extract round-trips bytes', fs.readFileSync(path.join(outdir, 'src', 'main.js'), 'utf8').includes("ipcMain.handle('export-pdf'"));
  const idAsar = JSON.parse(run('re-identify.js', asar));
  ok('identify: asar by magic', idAsar.type.startsWith('asar'));
  // 2. fuses
  const fakeExe = Buffer.concat([Buffer.from('MZ junk ' + 'x'.repeat(64)), Buffer.from('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX', 'latin1'), Buffer.from([1, 9, 0x30, 0x31, 0x30, 0x31, 0x31, 0x31, 0x30, 0x30, 0x72]), Buffer.from('tail')]);
  const fexe = path.join(tmp, 'fake-electron.bin'); fs.writeFileSync(fexe, fakeExe);
  const fuses = JSON.parse(run('re-fuses.js', fexe));
  ok('fuses: sentinel found, 9 fuses, states decoded', fuses.sentinels === 1 && fuses.wires[0].fuses.length === 9 && fuses.wires[0].fuses[0].state === 'disabled' && fuses.wires[0].fuses[3].state === 'enabled' && fuses.wires[0].fuses[8].state === 'removed');
  const noFuse = JSON.parse(run('re-fuses.js', asar)); ok('fuses: no sentinel → unknown, not disabled', noFuse.sentinels === 0 && /UNKNOWN/.test(noFuse.note));
  // 3. strings
  const strs = run('re-strings.js', path.join(outdir, 'src', 'main.js'), '5');
  ok('strings: finds the IPC channel literal with an offset', /^[0-9a-f]{8} A .*export-pdf/m.test(strs));
  const u16 = path.join(tmp, 'u16.bin'); fs.writeFileSync(u16, Buffer.concat([Buffer.from([0, 1, 2]), Buffer.from('https://example.com/v1/items', 'utf16le'), Buffer.from([0, 0, 9])]));
  const strs2 = run('re-strings.js', u16); ok('strings: UTF-16LE run + url tag', /U https:\/\/example\.com\/v1\/items/.test(strs2) && /\[url\]/.test(strs2));
  // 4. sqlite
  const dbp = path.join(tmp, 'fixture.sqlite'); const db = new DatabaseSync(dbp); db.exec("create table orders(id integer primary key, sku text, qty int); insert into orders(sku,qty) values('A-1',2),('B-2',5); create view v as select sku from orders;"); db.close();
  const before = fs.readFileSync(dbp);
  const sq = JSON.parse(run('re-sqlite.js', dbp, 'orders', '1'));
  ok('sqlite: schema + 1-row sample, original untouched', sq.tables[0].name === 'orders' && sq.tables[0].rows === 2 && sq.sample.rows.length === 1 && sq.objects.some((o) => o.type === 'view') && Buffer.compare(before, fs.readFileSync(dbp)) === 0);
  ok('identify: sqlite', JSON.parse(run('re-identify.js', dbp)).type === 'SQLite 3');
  // 5. wasm: (module (import "env" "log" (func)) (func (export "add") (param i32 i32) (result i32) local.get 0 local.get 1 i32.add))
  const wasm = Buffer.from('0061736d01000000010a0260000060027f7f017f020b0103656e76036c6f670000030201010707010361646400010a09010700200020016a0b', 'hex');
  const wp = path.join(tmp, 'f.wasm'); fs.writeFileSync(wp, wasm);
  const w = JSON.parse(run('re-wasm.js', wp));
  ok('wasm: import env.log and export add, compile only', w.imports[0].module === 'env' && w.imports[0].name === 'log' && w.exports[0].name === 'add' && w.exports[0].kind === 'function');
  // 6. har
  const har = { log: { entries: [
    { request: { method: 'GET', url: 'https://api.example.com/v1/items/123?page=2&sort=asc', headers: [{ name: 'Authorization', value: 'Bearer SECRET' }] }, response: { status: 200, content: { mimeType: 'application/json; charset=utf-8', size: 10 } } },
    { request: { method: 'GET', url: 'https://api.example.com/v1/items/456?page=3', headers: [] }, response: { status: 200, content: { mimeType: 'application/json', size: 11 } } },
    { request: { method: 'POST', url: 'https://api.example.com/v1/items', headers: [{ name: 'Cookie', value: 'sid=SECRET2' }] }, response: { status: 201, content: { mimeType: 'application/json', size: 3 } } } ] } };
  const hp = path.join(tmp, 'f.har'); fs.writeFileSync(hp, JSON.stringify(har));
  const h = JSON.parse(run('re-har.js', hp));
  const g = h.surface.find((x) => x.key === 'GET https://api.example.com /v1/items/{n}');
  ok('har: path templated, 2 hits, param names, no secret values', g && g.count === 2 && g.queryParams.join(',') === 'page,sort' && g.hasAuthHeader === true && !JSON.stringify(h).includes('SECRET'));
  const recs = run('re-har.js', hp, '--records'); ok('har --records withholds auth/cookie values', /withheld/.test(recs) && !recs.includes('SECRET'));
  // 7. evm: dispatcher PUSH4 0xa9059cbb EQ PUSH4 0x70a08231 EQ … + CBOR trailer a1 64 73 6f 6c 63 43 00 08 14 (len 10 → 0x000a)
  const evm = Buffer.concat([Buffer.from('6080604052600436106100295760003560e01c8063a9059cbb1461002e57806370a082311461004d575b', 'hex'), Buffer.from('a16473 6f6c63 43 0008 14'.replace(/\s/g, ''), 'hex'), Buffer.from('000a', 'hex')]);
  const ep = path.join(tmp, 'f.evm.hex'); fs.writeFileSync(ep, '0x' + evm.toString('hex'));
  const e = JSON.parse(run('re-evm.js', ep));
  ok('evm: two selectors + cbor solc version', e.selectors.map((s) => s.selector).sort().join(',') === '0x70a08231,0xa9059cbb' && e.cbor && e.cbor.metadata.solc === '0x000814' && e.cbor.complete);
  // 8. identify text/PE
  ok('identify: JS text', JSON.parse(run('re-identify.js', path.join(outdir, 'src', 'main.js'))).type.startsWith('text'));
  ok('identify: fake MZ flagged as PE without header', /PE/.test(JSON.parse(run('re-identify.js', fexe)).type));
  console.log(`\nselftest: ${passed} checks passed`);
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
