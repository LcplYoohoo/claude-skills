# Upstream — where this is tracked, what is already there, what to add

## The tracking issue

**anthropics/claude-code#42776** — "[BUG] Claude Code Desktop fails to Relaunch on Windows due to orphaned
process file lock" — https://github.com/anthropics/claude-code/issues/42776. Open since 2026-04-02;
200+ comments by 2026-10-22, label `area:desktop`, no maintainer reply in the thread.

Already posted there, so do not repeat it — add measurements instead:

- The orphaned-lock framing and the `handle.exe` workaround (kill only the process holding the package).
- `CoworkVMService` named as the holder, with its auto-restart behaviour (2026-04).
- The `sihost.exe` capture: the modal is a shell launch error after AppX moved the old folder; relaunch by
  absolute path is the proposed cause; fix = relaunch via `shell:AppsFolder\<AUMID>` (2026-09-03).
- The Process Monitor capture: `claude.exe` exits `0xC0000001` at init in a respawn loop when the service is
  down; the "failed to configure recovery actions … Access is denied" warning; `sc qfailure` empty; the
  `sc.exe failure …` user-side mitigation and its caveat (2026-09-04).
- The warning not to arm recovery actions blindly: the service fails to disarm them on stop (2026-09-04/05).
- The cause of the "Access is denied": the DACL grants change-config to the wrong service SID (`sc sdshow`
  vs `sc showsid`), plus the measured download→relaunch gaps (10 min, 3 h 07, 6 h 12 vs the stated 72 h),
  support's written confirmation that `autoUpdaterEnforcementHours` is capped at 72 and only makes it fire
  sooner, and support's statement that bug reports get no ticket number — the four asks are listed there
  (2026-10-22, https://github.com/anthropics/claude-code/issues/42776#issuecomment-6351669343).

A separate issue (#46179) covers the service holding the package folder; #51954 and #49655 proposed the
service as the lock holder.

## The vendor documentation

- **Enterprise configuration for Claude Desktop** — https://support.claude.com/en/articles/12622667.
  Windows policy keys under `HKLM\SOFTWARE\Policies\Claude` (machine, wins) or `HKCU\…` (user):
  `disableAutoUpdates` boolean (default false; "set this when your MDM manages Claude Desktop versions"),
  `autoUpdaterEnforcementHours` integer 1–72 (default 72, "hours before Claude is forced to restart to apply
  a prepared update"). The article's PowerShell example writes both to `HKLM:`.
- **Claude status page**, September 2026: "Degraded functionality for Claude Cowork on Windows" (opened
  09-10, resolved 09-14, cause: Windows update KB5124007; fix: KB5129195).

## What support will and will not do (2026-10-22)

Support is an AI agent first. It will restate the documented behaviour, confirm there is no active incident,
and say a bug report "is now documented as part of this report". It will not issue a ticket number, cannot
track a fix, and has no visibility into engineering timelines. Sending it the log is still worth doing —
"the team reviews all product bug conversations" — but the issue above is the only place with a URL.

## What to attach when you add to the issue

1. The triage report (`scripts/triage.ps1 -OutFile triage.txt`), with the package version at the top.
2. The `main.log` updater/relaunch lines with the computed gaps, and whether any policy key is set.
3. The AppX event IDs with timestamps: 603, 638, 9643/9650, 10000/10007.
4. The `sc sdshow` / `sc showsid` pair, so the SID comparison is reproducible.
5. Which of the three defects the evidence matches, in one line each. Numbers, not adjectives.
