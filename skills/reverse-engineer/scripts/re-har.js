#!/usr/bin/env node
'use strict';
// re-har.js <file.har> [--records] — API surface from a HAR: METHOD origin /path/{template} → count,
// statuses, MIME types, query-parameter NAMES. Authorization/cookie VALUES are never printed. Read-only.
const fs = require('fs');
const SENSITIVE = /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|x-auth-token)$/i;
function template(p) {
  return p.split('/').map((seg) => {
    if (!seg) return seg;
    if (/^\d+$/.test(seg)) return '{n}';
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)) return '{uuid}';
    if (/^[0-9a-f]{16,}$/i.test(seg)) return '{hex}';
    if (/^\d{4}-\d{2}-\d{2}/.test(seg)) return '{date}';
    return seg;
  }).join('/');
}
function surface(har) {
  const entries = (har.log && har.log.entries) || [];
  const groups = new Map();
  for (const e of entries) {
    let u; try { u = new URL(e.request.url); } catch { continue; }
    const key = `${e.request.method} ${u.origin} ${template(u.pathname)}`;
    const g = groups.get(key) || { key, count: 0, statuses: {}, mimes: {}, queryParams: new Set(), hasAuthHeader: false, hasCookie: false };
    g.count++;
    const st = e.response && e.response.status; g.statuses[st] = (g.statuses[st] || 0) + 1;
    const mime = e.response && e.response.content && e.response.content.mimeType; if (mime) g.mimes[mime.split(';')[0]] = (g.mimes[mime.split(';')[0]] || 0) + 1;
    for (const q of u.searchParams.keys()) g.queryParams.add(q);
    for (const h of e.request.headers || []) { if (/^authorization$/i.test(h.name)) g.hasAuthHeader = true; if (/^cookie$/i.test(h.name)) g.hasCookie = true; }
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key)).map((g) => ({ ...g, queryParams: [...g.queryParams].sort() }));
}
function records(har) {
  return ((har.log && har.log.entries) || []).map((e, i) => ({ i, method: e.request.method, url: e.request.url.replace(/\/\/[^@/]+@/, '//'), status: e.response && e.response.status, mime: e.response && e.response.content && e.response.content.mimeType, reqHeaders: (e.request.headers || []).map((h) => SENSITIVE.test(h.name) ? `${h.name}: <withheld>` : `${h.name}: ${h.value}`), bodyBytes: e.response && e.response.content && e.response.content.size }));
}
if (require.main === module) {
  const file = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (!file) { console.error('usage: re-har.js <file.har> [--records]'); process.exit(2); }
  const har = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log(JSON.stringify(process.argv.includes('--records') ? records(har) : { note: 'groups, not schemas; param NAMES only; auth/cookie values withheld', surface: surface(har) }, null, 2));
}
module.exports = { surface, records, template };
