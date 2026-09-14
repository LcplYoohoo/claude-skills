# Compiled artifacts — the provenance chain

**Read this when the thing you are vetting is a compiled application, installer, CLI, or
model file rather than a skill bundle.** The main workflow assumes every file can be read;
a compiled artifact cannot be, so reading is replaced by *provenance* — proving the bytes
you have are the bytes the publisher built, and watching what they do the first time.

## Why the main workflow's binary rule does not apply here

Auto-reject #5 — "any unreadable binary file" — is correct **for a skill bundle**, where a
`.exe` has no legitimate reason to exist and its presence is itself the finding. Applied to
a compiled application it is a guaranteed false positive: every such artifact is unreadable
by definition, so the scanner returns REJECT every time.

That matters more than it sounds. A check that always fails teaches its operator to
override it, and an override reflex is exactly what an attacker needs. One 2026 audit of an
offline speech toolkit recorded the collision plainly: `exit 2 — one REJECT group, "30
unreadable binary files"`, accepted by hand "under the provenance posture, not the skill
rule." The rule did not catch anything; it just had to be argued past.

So: **classify the artifact first.** A skill or plugin bundle containing a binary stays
REJECT. A compiled application you are deliberately installing runs the chain below instead.
A skill that merely *wraps* a separately-installed tool is two artifacts — audit the bundle
with the main workflow, and the tool with this one.

## The chain

Run these in order. Each step can end the process; none of them is optional because a later
step "probably" covers it.

### 1. Feasibility, before anything is downloaded

Does it even run here? Check the CPU/GPU requirement against the actual hardware, and the OS
against the actual OS — from the README, not the marketing page. One 2026 candidate was a
3.7 GB download that required NVIDIA CUDA on a machine with an AMD card; the README's
"Windows (CUDA)" line settled it before a byte moved.

Record the decision either way. A "no" you can point at later is worth as much as a "yes".

### 2. The canonical source, and who uploaded it

Find the project's own repository — not a mirror, not a package index, not a search result.
Then check the release page for two things people skip:

- **Who uploaded the assets.** A release where every asset is uploaded by the project's CI
  identity is a very different claim than one where a single maintainer account attached a
  binary by hand. Both can be fine; only one is reproducible.
- **Whether the distribution you are about to use is the maintained one.** Third-party
  package entries frequently exist for projects that do not maintain them — one 2026 install
  found the README saying exactly that about its own package-manager entry, which moved the
  install back to the official release.

### 3. Size and hash against the publisher's own digest

Do not hash the file and call it verified — that only proves the file did not change since
you downloaded it, which is not the question. Compare against **the publisher's published
digest**, fetched independently of the download.

On GitHub the releases API returns a `digest` field per asset; compare both it and the byte
size. If the project also publishes a checksums file, confirm the two agree with each other
— when a project's own `SHA256SUMS` disagrees with the platform's digest, stop.

**Nested archives need the inner check too.** A signed zip proves the zip; it says nothing
about the executable inside. Extract, hash the inner binary, and compare it against its own
standalone digest where the project publishes one. One 2026 release was verified at all three
levels — zip digest, inner exe digest, and the separately-published standalone digest of the
same exe — and they agreed, which is what made the install defensible.

### 4. Signature — the signer's name, not just "valid"

"Signature valid" is close to meaningless on its own; anyone can sign anything. Read the
**signer subject** and decide whether that legal entity is the one you meant to trust, and
confirm the signature is **timestamped** (an untimestamped signature stops verifying when
the certificate expires).

Two common cases:

- **Authenticode (Windows):** `Get-AuthenticodeSignature` returns the status *and* the
  signer certificate. Check the subject organization and the issuing CA.
- **minisign (Tauri apps, and others):** the installer ships a `.sig` beside it and the
  public key is published in the project's own config. Verify with the key from the
  **repository**, never a key shipped alongside the file — a key packaged with the artifact
  proves nothing, since whoever tampered with one could replace both.

**Prove the check fails before you trust it passing.** Flip one byte of a copy and confirm
the verifier rejects it. A verification step you have never seen fail is not a verification
step — it is a step that prints "OK". This is the single highest-value habit in this file,
and it costs about thirty seconds.

Some projects sign only part of a release. When an asset is outside the project's documented
signing list, that is a finding to surface and a decision for the human, not something to
wave through because the other files were signed.

### 5. Malware scan — per file, not per folder

Scan with the local endpoint product, **file by file**, and read which file each detection
names.

This is not pedantry. One 2026 toolkit came as a bundle of programs; the three files
actually needed were clean, while two *other* programs in the same archive tripped a
heuristic detection. Folder-level scanning gives one verdict for the whole bundle and
forces an all-or-nothing choice; per-file scanning let the install narrow to the three clean
files and delete the rest from the staging copy.

Also check the hash against a multi-engine service. **A service having no record of the hash
is not a clean result** — it means nobody has submitted it, which is expected for a fresh
release and tells you nothing. Record "no record" as "no record", and re-check in a week if
the artifact is staying.

Never add a scanner exclusion to make a check pass.

### 6. Install as a real process, into a real path

Two environment traps, both of which produce an install that appears to succeed and then
cannot be found:

- **Virtualized storage.** When the agent runs inside a packaged/containerized app, files it
  writes to per-user application-data paths may land in a private overlay that real processes
  never see. Install to an ordinary filesystem path outside those directories.
- **Child-process inheritance.** An installer launched as a child of that same packaged app
  inherits the same virtualized view. Launch it as an independent process — on Windows, a
  one-off scheduled task works and keeps no console window open.

### 7. Watch the first run

Run it once, deliberately, and observe. The three things worth measuring:

- **Network:** does it open sockets you did not expect? "It phones home on launch" is a
  finding even for honest software, and it is a privacy decision for the user.
- **Child processes:** anything beyond the expected console host?
- **Files:** does it write outside its own output directory?

Expected traffic is fine — a diagnostic subcommand that checks provider reachability will
reach the provider. The point is that you *know* which is which, and can say so.

### 8. Diff what you installed against what you verified

Hash the staged copy and the installed copy, and diff the two manifests. This is what proves
the installer put the verified bytes on disk rather than downloading something else
mid-install. One 2026 install reported `363 installed files, 0 hash mismatches` — which is a
sentence you can defend, unlike "the installer completed successfully".

### 9. Log the row, and the reason

One line per artifact, in one place: name, purpose, canonical source, version, exact byte
size, hash, licence, who approved it, and which checks cleared it. **An update is a new row,
not an edit** — the verdict was bound to specific bytes, and new bytes have not been checked.

Keep the refusals in the same log. The record of what you decided *not* to install, and why,
is consulted more often than you expect.

## What this chain does not give you

Say these out loud in any report, because a reader will otherwise assume they were covered:

- **It does not tell you the program is benign.** It tells you the bytes came from the
  publisher you named. A malicious publisher, or a compromised build pipeline, passes every
  step above. Provenance answers "is this what they shipped", never "is what they shipped
  safe".
- **A first-run observation is one sample.** Conditional behaviour — a delay, a date, a
  specific input — is not visible in a single watched launch.
- **A clean multi-engine scan is a lower bound.** It reflects what was known at scan time.
- **The verdict expires with the version.** Any update restarts the chain.

## Report template

Use this exact shape so two audits are comparable:

```
## Artifact: <name> <version> — <PROCEED | PROCEED WITH CONDITIONS | REJECT>
Source: <canonical repo/release URL>    Uploaded by: <CI identity or person>
Bytes: <size> — matches publisher: <yes/no>
Hash: <sha256> — matches publisher digest: <yes/no>    Inner artifact: <hash / n-a>
Signature: <scheme> — signer subject: <exact subject>  Timestamped: <yes/no>
  Negative control: <tampered copy rejected? yes/no>
Malware scan: <per-file result; name every detection and the file it named>
Multi-engine: <result, or "no record — not a clean verdict">
Install: <path> — real process: <yes/no>
First run: sockets <n, to where> · child processes <n> · files outside output dir <n>
Manifest diff: <n files, n mismatches>
Not checked: <every gap, and why>
Conditions: <what must stay true for this verdict to hold>
Re-run trigger: any version change
```

`PROCEED WITH CONDITIONS` is the honest verdict most of the time. Use it rather than
rounding up to PROCEED because the conditions seem minor — the conditions are the part a
future reader needs.
