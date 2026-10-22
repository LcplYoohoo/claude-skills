# JavaScript, Electron and live-site analysis

Rewritten from REA's `references/javascript-applications.md`, `docs/javascript-application-workflows.md`,
`docs/electron-fuses.md`, `docs/web-runtime.md`, `docs/web-source-location.md`,
`docs/browser-scenario-contract.md` (read 2026-10-18), using what this box has.

## A. Electron app (`app.asar` + the exe)

1. **Find the pieces.** `resources/app.asar` (sometimes `app.asar.unpacked/` beside it for native
   add-ons) and the main exe. `node scripts/re-asar.js list <app.asar>` prints the index with sizes and
   offsets; `extract <app.asar> <outdir>` writes a copy.
2. **Read in this order:** `package.json` → `main` (the main process) → every `BrowserWindow`'s
   `webPreferences` (`preload`, `contextIsolation`, `nodeIntegration`, `sandbox`) → the preload's
   `contextBridge.exposeInMainWorld` surface → `ipcMain.handle` / `ipcMain.on` channel names → renderer
   bundles. **IPC pairing is Observed only when the channel is a unique string literal on both sides**;
   computed channel names stay Unknown.
3. **Fuses** (`node scripts/re-fuses.js <exe>`): one byte per fuse after a sentinel in the binary.
   `RunAsNode`, `EnableCookieEncryption`, `EnableNodeOptionsEnvironmentVariable`,
   `EnableNodeCliInspectArguments`, `EnableEmbeddedAsarIntegrityValidation`, `OnlyLoadAppFromAsar`,
   `LoadBrowserProcessSpecificV8Snapshot`, `GrantFileProtocolExtraPrivileges`, `WasmTrapHandlers`.
   `0x31` on, `0x30` off, `0x72` removed. No sentinel = Unknown, not off. These describe the shipped
   binary; they do not rule out app code enabling an inspector itself.
4. **Native add-ons** (`.node` files) are PE/ELF: strings + imports only; a JS → native "handoff" is a
   candidate until the add-on's exact digest is tied to the require.

## B. Bundles and source maps

- **Boundaries first.** Webpack: `__webpack_modules__` / `(()=>{var __webpack_modules__={` with numeric
  or path keys; Vite/Rollup: ESM with `import`/`export` kept; esbuild: `var __commonJS`/`__esm`
  wrappers. Split the bundle into modules by those wrappers before reading anything.
- **Feature location from a UI string:** `re-strings.js` or Grep the exact UI text → the module that owns
  it → follow outward (what it calls: fetch/XHR URLs, IPC channels, storage keys) and inward (what
  renders it). Literal substring matching only; regexes over minified code produce false parents.
- **Source maps:** `//# sourceMappingURL=` at the tail. If the `.map` ships, `sources` and
  `sourcesContent` give the original tree — decode is Base64-VLQ per segment (fields: generated column,
  source index, original line, original column, name index; lines are 1-based, columns 0-based in UTF-16
  units). A map is an *Inferred* link until the generated code's digest matches what the map was built
  from; a declared map proves neither deployment nor execution.
- **Version comparison:** analyze each build once; match modules by content digest → source-map identity
  → structural shape. Label each `unchanged / added / removed / changed / unknown`; only claim
  added/removed when both sides have complete coverage.
- Nothing recovered is executed. Readable-source recovery tools (Wakaru) need Linux x64 — not here.

## C. A live website — the browser pane is the instrument

Only on sites the gate cleared (your own, or terms that allow it). The built-in browser runs CDP-style
tooling already:

| Need | Tool |
|---|---|
| What the page loads and calls | `read_network_requests` (list, then fetch a body by `requestId`) — the HAR-equivalent; group by origin and path template as `re-har.js` does |
| Console / errors | `read_console_messages` |
| Structure and text | `read_page`, `get_page_text`, `find` |
| Script inventory, globals, listeners | `javascript_tool`: `performance.getEntriesByType('resource')`, `Array.from(document.scripts).map(s=>s.src)`, `Object.keys(window)` diff against a blank page, `getEventListeners` is DevTools-only — use `javascript_tool` to walk `on*` attributes and framework props instead, and say so |
| Pixels | `computer` screenshot of the pane |

Rules carried over: do not click, submit, or log in beyond what the question needs; say that the agent
performed the actions; declare what was *not* requested as not captured, not as empty; strip
authorization/cookie values before anything is written down; a request seen is Observed, a handler for it
is Inferred until its source is located; a quiet network does not mean no background work.

## D. HAR files

`node scripts/re-har.js <file.har>` → per `METHOD origin /path/{id}` group: count, statuses, MIME types,
query-parameter *names*. Numeric, UUID, hex and ISO-date path segments become `{…}` placeholders. Auth
and cookie values are dropped; token-looking query *values* are not shown either. The surface is a
grouping, not a schema — request/response shapes are read from individual records by hand, and only the
ones the question needs.
