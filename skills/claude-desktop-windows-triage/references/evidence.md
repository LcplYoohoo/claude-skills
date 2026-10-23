# Evidence — every claim in SKILL.md, graded

Grades: **Observed** = measured on a real Windows 11 machine, line quoted. **Reported** = posted by other
users on the public tracking issue, not reproduced here. **Vendor-stated** = Anthropic's documentation
or support, quoted. Where the grades disagree, the Observed line wins and the disagreement is stated.

Machine: Windows 11 Home 10.0.26300, x64. App from the Microsoft Store (MSIX), package family
`Claude_pzs8sxrjxfjjc`, versions 2.110.0 → 3.1623.4 across September–October 2026. Nothing below was
produced with elevation.

## D1 — the stealth relaunch

**Observed.** `main.log` (the app's own log), after a manual "restart to update" at 10:09 on 10-21:

```
2026-10-21 10:09:20 [updater] Version changed since last launch: 2.42304.2 -> 3.1623.0
2026-10-21 15:52:56 [updater] Update downloaded and ready to install { releaseName: 'Claude 3.1623.1' }
2026-10-21 19:00:12 [stealth-update] Triggering stealth update after idle timeout      <- 3 h 07 min after download
2026-10-22 02:01:05 [updater] Update downloaded and ready to install { releaseName: 'Claude 3.1623.3' }
2026-10-22 02:11:35 [stealth-update] Triggering stealth update after idle timeout      <- 10 min
2026-10-22 06:12:55 [updater] Update downloaded and ready to install { releaseName: 'Claude 3.1623.4' }
2026-10-22 12:24:35 [stealth-update] Triggering stealth update after idle timeout      <- 6 h 12 min
2026-10-22 14:26:00 [updater] Update downloaded and ready to install { releaseName: 'Claude 3.6556.1' }   <- staged
```

Three forced relaunches inside 26 hours of a manual restart. No `HKCU` or `HKLM\SOFTWARE\Policies\Claude`
keys existed, so this is default behaviour on 3.1623.x. The relaunch logs `[stealth-relaunch] Saved z-order
anchor / Saved navigation history` and `beforeQuitForUpdate handler fired` (Reported, same lines).

**Vendor-stated (support, 2026-10-22):** "Claude Desktop downloads updates automatically and applies them on
the next restart, but if the app hasn't restarted within 72 hours of a download, it forces a restart on its
own — waiting only for 10 minutes of user inactivity, with no in-app way to defer it." The 10-minute part
matches. The 72 hours does not match the Observed gaps above; support's second reply called the discrepancy
"valuable information for the engineering team" and did not dispute the numbers.

**Vendor-stated (support.claude.com article 12622667, "Enterprise configuration"):** `autoUpdaterEnforcementHours`
is an integer 1–72, default 72; `disableAutoUpdates` is a boolean, default false. Support added that setting
the hours key "changes the enforcement behavior to fire immediately when the window elapses, without waiting
for user inactivity." So the key can only make it more aggressive.

**Observed — Remote Control.** The app knows which sessions have Remote Control: `[CCD] Skipping pause for
session … - remote control is active`. After a relaunch every session is cold, and Remote Control returns
per session only on the first message sent (`first_turn` / `cold_resume`). Example: a session opened at
10:24 with nothing sent sat without Remote Control until 20:44. Idle sessions do not hold the relaunch off;
only a session actively working or a focused window does.

**Reported (one user, two captures):** the relaunch respawns `claude.exe` by absolute path inside
`WindowsApps\<version>` 2 s after AppX moved that folder to `WindowsApps\Deleted\`; the "another program is
currently using this file" modal is owned by `sihost.exe` (a shell launch error), with no process from the
package alive. Proposed cause: Electron's `app.relaunch()` uses `process.execPath`, an absolute path, where a
packaged app should relaunch by its AUMID. Not reproduced here; consistent with D3's end state.

## D2 — the service that cannot restart itself

**Observed.** AppX deployment log (`Microsoft-Windows-AppXDeploymentServer/Operational`), 2026-09-17:

```
00:43:49  603   Started deployment Add: Claude-….msix from https://downloads.claude.ai/releases/win32/x64/2.110.1/
00:44:19  638   Packages were NOT updated because affected apps are still running. Running apps: {Claude_pzs8sxrjxfjjc!Claude}
00:44:19  658   Marking 2.110.1.0 for DEFERRED registration because 2.110.0.0 is still running
00:54:50  603   RegisterByPackageFamilyName … Options ForceApplicationShutdown
00:54:51  9648  TerminateSingleService for update successful … CoworkVMService
00:54:51  9650  Successfully terminated service … CoworkVMService
00:54:51  9643  TerminateApplications successful
00:54:52  472   Moving 2.110.0.0 to WindowsApps\Deleted\
```

Same 603 → 638 → 9643/9650 signature on 13 of the previous 14 days. Nothing crashed: zero WER reports for
`claude.exe`, Crashpad `reports/` empty, no Kernel-Power 41, no resource-exhaustion event. The app was
killed and nothing brought it back. (On 3.1623.x the relaunch moved into the app's own `[stealth-update]`
path: the AppX log for 10-16…10-22 still shows 638 ×20 and the service termination 9648/9650 ×10, but no
9643 — the app now quits itself instead of being hard-killed. The service-side defect below is the same on
both.)

**Observed.** `C:\ProgramData\Claude\Logs\cowork-service.log`, on every service start, including 3.1623.4:

```
Warning: failed to disarm recovery actions for this stop: open service: Access is denied.
Warning: failed to configure recovery actions (a crashed service stays down until the Claude desktop app starts it again on next use, or the machine reboots): open service: Access is denied.
```

`sc qfailure CoworkVMService` → `RESET_PERIOD (in seconds) : 0`, no actions. The warning is accurate.

**Observed — the cause.**

```
> sc sdshow CoworkVMService
D:(A;;CCLCSWRPWPDTLOCRRC;;;AU)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;S-1-5-80-1949724575-2387902436-65106593-1201171665-3967308604)

> sc showsid CoworkVMService
SERVICE SID: S-1-5-80-690231842-763816591-443537665-320658410-1005583601
```

Authenticated Users has no `DC` (SERVICE_CHANGE_CONFIG). There is no ACE for Administrators or SYSTEM. The
one ACE granting `DC` names `S-1-5-80-1949724575-…`; the service runs as `S-1-5-80-690231842-…`
(`SERVICE_SID_TYPE UNRESTRICTED`, so its own SID is in its token and the grant would work if it named the
right principal). Service SIDs are a deterministic SHA-1 of the uppercased service name; computing
`CoworkVMService` reproduced `showsid`'s answer exactly, so the method was validated before the mismatch
was trusted. Which name produces `…1949724575…` was not identified (16 candidates tried) — probably a
leftover from an earlier service name. Re-verified unchanged on 3.1623.4.0, 2026-10-22.

**Observed.** `sc qtriggerinfo CoworkVMService`: `START_TYPE 2 AUTO_START` plus a custom ETW start trigger
(provider `1f81d131-3e60-4c76-9860-37334e4ffce3`, data `\pipe\cowork-vm-service`). The app re-arms the
service by opening that pipe, which is why "just disable the service" never sticks.

**Reported.** With the service down, `claude.exe` aborts at process init with `0xC0000001` in a respawn
loop (Process Monitor capture; `Load Image claude.exe SUCCESS` — no file lock, a startup abort). Another
user warns, from their own capture, against arming recovery actions with `sc failure`: the service fails to
*disarm* them on stop too, so half-arming can let SCM restart it during package servicing. Consistent with
the Observed "failed to disarm" line above.

**Observed.** AppX event 649 ("Trying to repair ACLs") fires on every register, so any hand-set recovery
action is expected not to survive the next update. Not tested.

## D3 — the package left disabled

**Observed.** AppX log during servicing:

```
10000  About to service package Claude_2.110.1.0 … Setting the package state to DISABLED returned with 0x0
10007  Finished servicing … Setting the singleton package state to ENABLED returned with 0x0
```

If the forced terminate does not complete cleanly, servicing never reaches 10007 and the package stays
disabled; a disabled package will not launch and Windows reports it as in use. This explains why
Settings → Repair sometimes works (it re-registers from `AppxManifest.xml`, flipping the state — the exact
`603 Deployment Register` seen at 07:09 after a manual repair) and a reboot always does (it clears the
servicing state unconditionally). Inferred from the event pair and the repair behaviour, not from a
captured disabled→launch failure.

## The update storm (why it went from weekly to daily, September 2026)

**Observed.** Windows `KB5124007` installed 2026-09-08. Anthropic's status page opened "Degraded functionality
for Claude Cowork on Windows" on 09-10 ("A Windows update released September 8 has caused Claude Cowork on
Windows [to be] unable to run local commands…"). Claude deploy operations in the AppX log rose from 1/day to
3, 5, 6 per day over 09-13…09-15; `KB5129195` installed 09-15; the incident closed 09-14 19:14 UTC. The
force-kill defect was always there; more updates meant more chances for it to fire.

## What support says about tracking (2026-10-22)

**Vendor-stated.** "We don't issue ticket numbers for bug reports. The team reviews all product bug
conversations and passes relevant information to the appropriate team … There's currently no way to track the
status of a fix." And: "We don't have visibility into engineering timelines or the status of previously
reported issues."

## Ruled out, so nobody re-runs them

OS crash, app crash, out-of-memory, disk full, a runaway overnight agent (no transcript written during the
window), transcript bloat (1.78 GB of transcripts — an early hypothesis the evidence did not support).
Ephemeral-port exhaustion bursts (Tcpip 4266/4231) were real on the test machine and traced to a VPN's
threat-protection service, not to the app; unrelated to the relaunches.
