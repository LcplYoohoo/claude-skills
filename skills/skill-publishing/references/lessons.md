# Lessons — what each step protects against, with the incident behind it

Dates are when it bit. Each line is the reason a step exists; delete a step and expect its incident back.

- **The frontmatter `description` is the leak that survives the first pass** (2026-09-13). The body was
  scrubbed line by line; the `description:` still said "Use when <Name> asks…". It is the most-read line
  of any skill and it sits above the fold of every listing. Sweep it first.
- **A replacement that matches nothing is a silent failure** (2026-09-15, eight separate occurrences in
  one week across tools). `s.replace(a, b)` with `a` absent returns `s` unchanged and reports nothing.
  Every replacement states its expected count; zero is a failure, not a no-op.
- **Cloned repos on Windows are CRLF; anchors written with `\n` miss** (2026-10-22). A README edit
  matched nothing because the file had `\r\n`. The scrubber detects the file's line ending and converts
  the literal; the sweep splits on `\r?\n`.
- **Inline shell-escaped scripts mangle backslashes** (2026-10-22). A path written as `C:\dev\x` inside
  a quoted `node -e` string became `C:dev<backspace>x` on disk. Replacements live in a JSON file;
  scripts live in files; the shell gets a path, not code.
- **Test from the staged tree, not the installed one** (2026-10-22). A `--self` flag pointed at a
  private tree; usage lines pointed at absolute paths; a script moved into `scripts/`. All three "worked"
  installed and would have shipped broken. Run the self-tests with the staged directory as cwd.
- **Private sibling names are a dependency in disguise.** "See `verify-work` question 2" reads as a
  dead link to anyone else. Either the sentence carries the content, or the README names the sibling
  once as unpublished.
- **The example that names your product is still a good example without it.** "Build-X flavour: the
  site's credibility is its numbers" became "a product-configurator site: its credibility is its
  numbers" and lost nothing a reader needed.
- **Commit identity is per machine** (2026-10-22). A box with no global `user.name` fails the commit
  after everything else passed. Repo-local config copied from the last commit keeps one author on the
  public history and needs no global change.
- **The local copy is not what people get.** The CDN copy is. The live check fetches every file by
  URL and sweeps the bytes that came back; a 404 or a cached old version shows up as a failure, not as
  "I pushed, so it's done".
- **The raw CDN lags the push by minutes** (2026-10-22). `raw.githubusercontent.com` served the previous
  commit's bytes for two files for over a minute after the push, and a brand-new path returned 404 for
  the first few seconds. `verify-live` prints "live bytes differ" for exactly this; wait and re-run, do
  not re-push. The commit itself can be proved immediately by comparing `git hash-object` of the staged
  file with the blob SHA from the repository contents API.
- **Verify the install location before publishing a path.** A path in a usage line that was true on
  one machine (`~/.claude/skills/<name>/scripts/x.js`) is true nowhere else; `scripts/x.js` relative
  to the skill is true everywhere the skill is.
- **Scrubbing exposes stale rules** (2026-10-22). Reading a skill line by line to remove a name found
  a rule the owner had retired a month earlier and never deleted. Fix it in the installed copy too, and
  say so in the report.
- **A pseudonym on an MIT notice is fine.** Copyright vests in the author regardless of the name used.
  Putting a legal name on an indexed public repo is the irreversible choice; it is the owner's, not the
  publisher's.
- **Function names collide with shell aliases** (2026-10-22). A PowerShell helper named `H` never ran:
  `H` is the alias for `Get-History`. Scripts that go public meet shells you did not test on; prefer
  verb-noun names and run the script once from a fresh shell.
