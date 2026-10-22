# Packages, databases, modules and binaries

Rewritten from REA's `references/native-and-artifacts.md`, `references/android-applications.md`,
`docs/sqlite-databases.md`, `docs/wasm-artifacts.md`, `docs/evm-bytecode.md`, `docs/go-binaries.md`,
`docs/rust-binaries.md`, `docs/managed-code-analysis.md` (read 2026-10-18).

## Identify, then route
`node scripts/re-identify.js <file>` reads magic bytes: PE (`MZ` + `PE\0\0`, flags a CLI/.NET header),
ELF, Mach-O (thin and fat), ZIP (apk/jar/docx are zips), asar, gzip, SQLite (`SQLite format 3\0`), WASM
(`\0asm`), PDF, JSON/JS/text. Extension disagreements are a finding, not a nuisance.

## Strings
`node scripts/re-strings.js <file> [minLen]` — ASCII and UTF-16LE runs with file offsets, plus a tail
of likely-interesting lines (URLs, hosts, file paths, `key`/`token`/`secret`-looking names, Go module
lines, Rust `/rustc/<hash>/` paths). .NET user strings are UTF-16; Go embeds its module list as
`path\t…`, `mod\t…`, `dep\t…` lines after a `Go buildinf:` marker; Rust binaries built with
`cargo-auditable` carry a `.dep-v0` section (zlib JSON) — strings will show the section name, the JSON
needs inflating by hand with `zlib.inflateSync` on the section bytes.

## APK / zip
`unzip -l app.apk` for the inventory (`classes*.dex`, `lib/<abi>/*.so`, `assets/`, `res/`,
`META-INF/` signatures, `AndroidManifest.xml`). The manifest is **binary XML** — readable strings come
out with `re-strings.js`, but permissions/activities/network-security-config in full need `apktool` or
`aapt` (not here). Dex method bodies need `jadx` + a JDK (not here). What *is* readable without them:
asset files, raw resources, string tables (partially), native library imports via strings, and package
identity from `META-INF`. A Capacitor/Cordova app keeps its web app under `assets/public/`
— that part is plain web analysis.

## SQLite
`node scripts/re-sqlite.js <db> [table] [rows]` — copies the file and any `-wal` sibling to a private
temp dir, opens the copy read-only with Node's built-in `node:sqlite`, prints tables/indexes/views/
triggers (with `CREATE` SQL on request), and samples up to 20 rows of one table. Stop the writing app or
take a consistent backup first; row order is unspecified so a sample proves nothing about omitted rows;
views and triggers are never executed; encrypted databases are out of scope. Record both digests.

## WASM
`node scripts/re-wasm.js <file.wasm>` — `WebAssembly.Module` compiles (does not run) the module and lists
imports, exports and custom-section names (`name`, `producers`, `sourceMappingURL`). Function signatures
and the text form need WABT (`wasm2wat`, not here). Matching import/export sets between two modules is
not runtime compatibility.

## EVM bytecode
`node scripts/re-evm.js <hex-or-bin>` — selectors from the dispatcher pattern (`PUSH4 <sel>` followed
within a few bytes by `EQ`), the CBOR metadata trailer (last two bytes are its length; keys usually
`ipfs`/`bzzr0`/`bzzr1`/`solc`/`experimental`). Selector → signature lookups (4byte.directory) are
Inferred; init-code vs runtime-code identity, compiler truth, and completeness of the selector list are
Unknown; an `EF00` prefix is an EOF container and unsupported.

## .NET
`re-identify.js` flags the CLI header. Type/method names and user strings are in the metadata streams
and show up in `re-strings.js` (UTF-16). A decompiler's C# is **Inferred** reconstruction, not source;
single-file hosts and IL2CPP are not unpacked. `ilspycmd` (a dotnet tool) is the download if the job
needs method bodies.

## Native (PE / ELF / Mach-O)
Without Ghidra: identify, strings, imports (the import directory names are ASCII strings — grep for
`.dll` names next to API names), resources (version info is UTF-16 strings), section names. Loader
fixups can make in-memory bytes differ from file bytes, so file offsets are the citation. Ghidra on
Windows is a 7–10-minute cold start per query and a JDK install — log the download and get the owner's OK first, and read-only.

## Firmware, pcap, crashes, signal recordings
Not installed by default. `binwalk`, `tshark`, debuggers: each is its own logged download if a
real target appears.
