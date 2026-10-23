---
name: claude-desktop-windows-triage
description: Diagnose and recover the Claude Desktop app on Windows when it dies, will not reopen, restarts itself, or drops Remote Control — "another program is currently using this file", a dead app after an overnight update, Claude Code sessions unreachable from the phone, the CoworkVMService that stays down until reboot. One read-only script reads the app's own log, the Windows AppX deployment events and the service's security descriptor and prints what happened and why; one recovery script starts and repairs without killing anything; two .reg files turn the self-relaunch off and on. Use whenever the desktop app on Windows is dead, frozen, relaunched itself, lost Remote Control, or shows an MSIX/package error — even if the user just says "Claude died again".
---

# Claude Desktop on Windows — triage and recovery

The desktop app on Windows is an MSIX package from the Microsoft Store family `Claude_pzs8sxrjxfjjc`. It
updates itself by downloading a new package and relaunching, and it depends on a Windows service
(`CoworkVMService`, "Claude VM Service"). Three defects in that chain produce most of the "Claude died"
reports, and they compose into "only a reboot fixes it". Every claim below is graded in
`references/evidence.md`: **Observed** on a real machine with the log line quoted, **Reported** by other
users on the public tracking issue, or **Vendor-stated** by Anthropic's docs or support.

## 1. Run the triage first — it is read-only

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/triage.ps1            # prints a report
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/triage.ps1 -OutFile triage.txt -Days 14
```

It changes nothing. It prints, in order: the installed package and its state; the auto-update policy keys;
the updater and relaunch lines from the app's `main.log` with the **measured gap between "update downloaded"
and "stealth update triggered"**; the AppX deployment events for the Claude package (download, "apps still
running", forced termination, package disabled/enabled); the service's state, failure actions, security
descriptor and **whether the SID that holds change-config rights is the service's own**; the service log's
recovery-action warnings; and a verdict that names which of the known defects the evidence matches.

Read the verdict, then the sections it points at. Ask the user to run it from their own PowerShell window
if you are running inside the app: a process started by the app sees the app's virtualized AppData.

## 2. The three defects, and the symptom each produces

| What the user sees | Defect | Evidence line to look for |
|---|---|---|
| App closed itself while idle; every Claude Code session lost Remote Control; "I didn't touch it" | **D1 — stealth relaunch to apply an update.** The app downloads an update, waits for 10 minutes of inactivity, then quits and relaunches itself. Measured gaps from download to relaunch: **10 min, 3 h 07, 6 h 12** — not the 72 hours the vendor describes. | `main.log`: `[updater] Update downloaded and ready to install` then `[stealth-update] Triggering stealth update after idle timeout` |
| Woke up to a dead app, no error, no crash report; only a PC reboot brings it back | **D2 — the service cannot restart itself.** The updater force-terminates `CoworkVMService` (AppX event 9650) and the app (9643). The service's own recovery actions are never armed because its security descriptor grants `SERVICE_CHANGE_CONFIG` to the **wrong service SID**, so Windows never restarts it, and the app aborts at startup without it. | `cowork-service.log`: `failed to configure recovery actions … Access is denied`; `sc qfailure` empty; triage reports `SID MISMATCH` |
| "Another program is currently using this file" when launching; Repair sometimes works, reboot always does | **D3 — the package is left DISABLED.** Servicing sets the package state to disabled (AppX 10000) and back (10007); if the forced terminate did not complete, it never re-enables. A disabled package will not launch and Windows reports it as "in use". | AppX 10000 without a following 10007; `Get-AppxPackage Claude` status not `Ok` |

Other users on the public issue report the same end state from a different path: the relaunch starts the
new `claude.exe` by the absolute path inside `WindowsApps\<old version>` that AppX just moved away, and the
shell reports a sharing violation. Same message, different mechanism; the triage cannot tell them apart
from the log alone, but the fix below covers both.

## 3. Recover without a reboot

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/fix-claude.ps1               # survey, start, repair, launch
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/fix-claude.ps1 -SurveyOnly   # just report
```

In order: start the service if it is down (plain start first; it falls back to an elevation prompt only if
that fails); re-register the package if its status is not `Ok` — the scripted form of *Settings → Apps →
Claude → Repair*, per-user, no elevation, no user data touched — but only when the app is not running;
launch by package identity (`shell:AppsFolder\Claude_pzs8sxrjxfjjc!Claude`), never by the path under
`WindowsApps`, because that path changes on every update; if the launch silently does nothing, repair and
retry once. **It never kills a process and never resets the app**, so it cannot take open sessions or
sign the user out. If it still fails: Settings → Apps → Claude → Repair; then Reset (signs out, keeps
files); then reboot.

**Remote Control does not come back on its own.** After any relaunch, every Claude Code session is cold.
The app re-enables Remote Control per session only on the **first message sent** in that session; opening
the session is not enough. Tell the user: one message in each session they want reachable. (`/remote-control`
is a toggle — sending it to a session that is already on turns it off.)

## 4. Stop it happening — ranked

1. **Quit the app before leaving it unattended.** Every forced-kill incident starts with AppX event 638,
   "packages were not updated because affected apps are still running". With the app closed, the update
   registers at once and there is nothing to kill. Zero cost.
2. **Turn the self-relaunch off** with `assets/block-auto-updates.reg` (sets the documented policy value
   `HKCU\SOFTWARE\Policies\Claude\disableAutoUpdates` = 1). It is a Group Policy key, so the write needs
   the UAC prompt that double-clicking the file raises; a standard-user `reg add` gets "Access is denied".
   The app then logs `Auto-updates disabled by enterprise policy` at launch and never stages an update.
   Cost: updates become manual (Microsoft Store → Get updates). An update already staged still installs
   once. `assets/allow-auto-updates.reg` removes the value.
3. **Do not reach for `autoUpdaterEnforcementHours`.** It accepts 1–72 only (default 72) and, once set,
   fires the forced restart the moment the window elapses with no idle wait. It can only make the
   behaviour more aggressive.

## 5. Do not

- **Do not arm the service's recovery actions with `sc failure` on a hunch.** The service also fails to
  *disarm* them on stop, so arming only half the pair can let the Service Control Manager restart it in the
  middle of package servicing. And AppX "repairs ACLs" on every register, so it would not survive an update.
- **Do not disable the service.** It has an ETW start trigger on the app's named pipe
  (`\pipe\cowork-vm-service`), so the app re-arms it on next use; disabling never sticks and breaks the app.
- **Do not run a third-party "fix" that self-elevates and removes that trigger.** The one found on the
  tracking issue is unlicensed and edits machine state as administrator. Audit anything of that shape first.
- **Do not kill the app to "fix" a freeze** while sessions are open. The recovery script refuses to, on
  purpose.

## 6. Report upstream, usefully

Support does not issue ticket numbers for bug reports and has no status tracking (vendor-stated,
2026-10-22). The place an engineer can see it is the open tracking issue —
`references/upstream.md` has the link and what was already posted there, so you add measurements rather
than another "same here". Attach: the triage report, the `main.log` lines, the AppX event IDs with times,
and the `sc sdshow` / `sc showsid` pair.

## 7. Limits

Observed on package versions 2.110 through 3.1623 (September–October 2026) on Windows 11. Anthropic can
change any of this in a release; the triage script reports what it finds and names its sources, so a
changed behaviour shows up as a changed report, not a wrong verdict. The script does not read other
users' sessions, send anything anywhere, or write outside the `-OutFile` you name.

## Files

- `scripts/triage.ps1` — read-only report. PowerShell 5.1, no modules.
- `scripts/fix-claude.ps1` — start / repair / launch, never kill. `-SurveyOnly` to just look.
- `assets/block-auto-updates.reg`, `assets/allow-auto-updates.reg` — the documented policy value, on and off.
- `references/evidence.md` — every claim above with its grade and the exact line it rests on.
- `references/upstream.md` — the tracking issue, the vendor doc, what support said, what has been posted.
