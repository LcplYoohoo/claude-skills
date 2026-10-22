#!/usr/bin/env node
'use strict';
// re-sqlite.js <db> [table] [rows=20] [--sql] — copies db (+ -wal) to a private temp dir, opens the COPY
// read-only with node:sqlite, prints schema and an optional row sample. Originals untouched. No arbitrary SQL.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

function inspect(file, table, rows = 20, withSql = false) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 're-sqlite-'));
  const copy = path.join(tmp, 'db.sqlite');
  fs.copyFileSync(file, copy);
  const digests = { db: sha(file) };
  if (fs.existsSync(file + '-wal')) { fs.copyFileSync(file + '-wal', copy + '-wal'); digests.wal = sha(file + '-wal'); }
  const journal = file + '-journal';
  if (fs.existsSync(journal) && fs.statSync(journal).size > 0) throw new Error('non-empty rollback journal beside the db: take a consistent backup first');
  const db = new DatabaseSync(copy, { readOnly: true, allowExtension: false });
  try {
    const objs = db.prepare("select type, name, tbl_name, sql from sqlite_master where name not like 'sqlite_%' order by type, name").all();
    const out = { file, digests, sqliteVersion: db.prepare('select sqlite_version() v').get().v, objects: objs.map((o) => ({ type: o.type, name: o.name, table: o.tbl_name, ...(withSql ? { sql: o.sql } : {}) })) };
    const tables = objs.filter((o) => o.type === 'table');
    out.tables = tables.map((t) => {
      const cols = db.prepare(`pragma table_info("${t.name.replace(/"/g, '""')}")`).all().map((c) => `${c.name}:${c.type || '?'}${c.pk ? ' PK' : ''}`);
      let count = null; try { count = db.prepare(`select count(*) n from "${t.name.replace(/"/g, '""')}"`).get().n; } catch { /* virtual table etc. */ }
      return { name: t.name, columns: cols, rows: count };
    });
    if (table) {
      if (!tables.some((t) => t.name === table)) throw new Error('no such table: ' + table);
      out.sample = { table, note: 'row order unspecified; a sample proves nothing about omitted rows', rows: db.prepare(`select * from "${table.replace(/"/g, '""')}" limit ?`).all(Number(rows)) };
    }
    return out;
  } finally { db.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
}
function sha(f) { return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'); }
if (require.main === module) {
  const args = process.argv.slice(2); const withSql = args.includes('--sql'); const [file, table, rows] = args.filter((a) => !a.startsWith('--'));
  if (!file) { console.error('usage: re-sqlite.js <db> [table] [rows] [--sql]'); process.exit(2); }
  console.log(JSON.stringify(inspect(file, table, rows, withSql), (k, v) => (typeof v === 'bigint' ? v.toString() : v), 2));
}
module.exports = { inspect };
