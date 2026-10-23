<#
.SYNOPSIS
  Read-only triage for the Claude Desktop app on Windows (MSIX, package family Claude_pzs8sxrjxfjjc).

.DESCRIPTION
  Prints what happened and why when the app died, relaunched itself, dropped Remote Control, or shows
  "another program is currently using this file". Reads: the app's own main.log, the AppX deployment
  event log, the service's state / failure actions / security descriptor / start trigger, and the
  service's own log. Changes nothing. Sends nothing. Writes only the file you name with -OutFile.

  Run it from the user's own PowerShell window, not from a process the app started: a child of the app
  sees the app's virtualized AppData.

.PARAMETER Days      How many days of event-log history to read (default 7).
.PARAMETER LogLines  How many updater / relaunch lines from main.log to print (default 40).
.PARAMETER OutFile   Also write the report to this path.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File triage.ps1
  powershell -NoProfile -ExecutionPolicy Bypass -File triage.ps1 -Days 14 -OutFile triage.txt
#>
[CmdletBinding()]
param(
  [int]$Days = 7,
  [int]$LogLines = 40,
  [string]$OutFile
)

$ErrorActionPreference = 'SilentlyContinue'
$FAMILY  = 'Claude_pzs8sxrjxfjjc'
$SERVICE = 'CoworkVMService'
$report  = New-Object System.Collections.Generic.List[string]
$verdict = New-Object System.Collections.Generic.List[string]

function Out([string]$s) { $report.Add($s) }
function Sect([string]$s)   { Out ''; Out ('=== ' + $s) }
function Short([string]$s, [int]$n) { if ($s.Length -gt $n) { $s.Substring(0, $n) + '...' } else { $s } }
function When($d) { $d.ToString('yyyy-MM-dd HH:mm:ss') }

Out ('Claude Desktop (Windows) triage - ' + (When (Get-Date)) + ' - read-only')
Out ('Machine: ' + [Environment]::OSVersion.VersionString + '   User: ' + $env:USERNAME + '   Elevated: ' +
     ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator))

# ---------------------------------------------------------------- 1. package
Sect '1. Package'
$pkg = Get-AppxPackage -Name 'Claude' | Where-Object { $_.PackageFamilyName -eq $FAMILY } | Select-Object -First 1
if ($pkg) {
  Out ("Installed : " + $pkg.PackageFullName)
  Out ("Status    : " + $pkg.Status + '   (anything but Ok = package disabled/mid-servicing: launch fails with "in use")')
  Out ("Location  : " + $pkg.InstallLocation)
  if ($pkg.Status -ne 'Ok') { $verdict.Add('D3 - package status is not Ok: it was left disabled by an interrupted update. Repair (re-register) fixes this; the recovery script does it.') }
} else {
  Out 'NOT FOUND - Get-AppxPackage Claude returned nothing for this user. Reinstall from claude.ai/download.'
  $verdict.Add('Package missing for this user - nothing below can be trusted.')
}
$procs = @(Get-Process -Name 'claude')
Out ("App processes now: " + $procs.Count)
$deleted = @(Get-ChildItem "$env:ProgramFiles\WindowsApps\Deleted" -Directory | Where-Object { $_.Name -like "$FAMILY*" -or $_.Name -like 'Claude_*' })
if ($deleted.Count -gt 0) { Out ("Leftover old package folders in WindowsApps\Deleted: " + $deleted.Count + '  (AppX event 471 "error 0x12C deleting file" = something still holds them)') }

# ---------------------------------------------------------------- 2. policy
Sect '2. Auto-update policy (documented keys: disableAutoUpdates, autoUpdaterEnforcementHours)'
$anyPolicy = $false
foreach ($hive in 'HKLM', 'HKCU') {
  $k = "$hive`:\SOFTWARE\Policies\Claude"
  if (Test-Path $k) {
    $anyPolicy = $true
    $p = Get-ItemProperty $k
    Out ("$k : disableAutoUpdates=" + $p.disableAutoUpdates + '  autoUpdaterEnforcementHours=' + $p.autoUpdaterEnforcementHours)
    if ($p.autoUpdaterEnforcementHours) { $verdict.Add('autoUpdaterEnforcementHours is set: once set, the forced restart fires when the window elapses with NO idle wait (vendor-stated). Remove it unless that is wanted.') }
  } else { Out ("$k : (not present)") }
}
if (-not $anyPolicy) { Out 'No policy keys - default behaviour: download, then relaunch after 10 min idle. assets/block-auto-updates.reg sets disableAutoUpdates=1 (needs UAC).' }

# ---------------------------------------------------------------- 3. main.log
Sect '3. The app''s own log (updater / relaunch / Remote Control lines)'
$candidates = @(
  "$env:LOCALAPPDATA\Claude\Logs\main.log",
  "$env:LOCALAPPDATA\Packages\$FAMILY\LocalCache\Local\Claude\Logs\main.log",
  "$env:LOCALAPPDATA\Packages\$FAMILY\LocalCache\Roaming\Claude\Logs\main.log",
  "$env:APPDATA\Claude\Logs\main.log"
)
$logs = @($candidates | Where-Object { Test-Path $_ } | ForEach-Object { Get-Item $_ } | Sort-Object LastWriteTime -Descending)
if ($logs.Count -eq 0) {
  Out ('main.log not found. Looked in: ' + ($candidates -join ' ; '))
} else {
  $log = $logs[0]
  Out ("Using " + $log.FullName + '   (' + [math]::Round($log.Length / 1MB, 1) + ' MB, last write ' + (When $log.LastWriteTime) + ')')
  if ($logs.Count -gt 1) { Out ('Other copies: ' + (($logs | Select-Object -Skip 1 | ForEach-Object { $_.FullName + ' @ ' + (When $_.LastWriteTime) }) -join ' ; ')) }
  $pat = '\[updater\]|\[stealth-update\]|\[stealth-relaunch\]|Version changed since last launch|beforeQuitForUpdate|enterprise policy|remote control is active|Skipping pause|Pausing session|Remote Control'
  $hits = @(Select-String -Path $log.FullName -Pattern $pat | ForEach-Object { $_.Line })
  $keep = @($hits | Where-Object { $_ -notmatch 'is still current \(latest' })   # the 20-minute "still current" heartbeat is noise
  Out ("Matching lines: " + $hits.Count + ' (' + ($hits.Count - $keep.Count) + ' heartbeat lines hidden). Last ' + $LogLines + ':')
  $keep | Select-Object -Last $LogLines | ForEach-Object { Out ('  ' + (Short $_ 150)) }

  # gaps: "Update downloaded and ready to install" -> next "Triggering stealth update"
  $ts = '^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})'
  $pendingDl = $null; $gaps = @()
  foreach ($l in $keep) {
    if ($l -match $ts) { $t = [datetime]::ParseExact($matches[1], 'yyyy-MM-dd HH:mm:ss', $null) } else { continue }
    if ($l -match 'Update downloaded and ready to install') { $pendingDl = $t }
    elseif ($l -match 'Triggering stealth update' -and $pendingDl) { $gaps += [pscustomobject]@{ Downloaded = $pendingDl; Relaunched = $t; Gap = $t - $pendingDl }; $pendingDl = $null }
  }
  if ($gaps.Count -gt 0) {
    Out ''
    Out 'Download -> forced relaunch gaps (vendor says: up to 72 h, then 10 min idle):'
    foreach ($g in $gaps) { Out ('  ' + (When $g.Downloaded) + ' -> ' + (When $g.Relaunched) + '   ' + [math]::Floor($g.Gap.TotalHours) + ' h ' + $g.Gap.Minutes + ' min') }
    $short = @($gaps | Where-Object { $_.Gap.TotalHours -lt 72 })
    if ($short.Count -gt 0) { $verdict.Add(('D1 - ' + $short.Count + ' stealth relaunch(es) fired well inside the 72-hour window the vendor describes (shortest ' + [math]::Round(($short | Sort-Object Gap | Select-Object -First 1).Gap.TotalMinutes) + ' min after download). Every relaunch drops Remote Control on every session until a message is sent in it.')) }
  }
  if ($pendingDl) { Out ('Staged and waiting: an update downloaded at ' + (When $pendingDl) + ' has not relaunched yet - it will, after 10 min idle.'); $verdict.Add('An update is staged right now; the next 10-minute idle period relaunches the app (D1).') }
  if ($keep | Where-Object { $_ -match 'enterprise policy' } | Select-Object -Last 1) { Out 'Policy line present: auto-updates are disabled by policy on this install.' }
}

# ---------------------------------------------------------------- 4. AppX events
Sect ('4. AppX deployment events for the Claude package, last ' + $Days + ' days')
$ids = 603, 574, 638, 658, 9643, 9648, 9650, 472, 649, 10000, 10007, 471
$ev = @(Get-WinEvent -FilterHashtable @{ LogName = 'Microsoft-Windows-AppXDeploymentServer/Operational'; StartTime = (Get-Date).AddDays(-$Days) } |
        Where-Object { $_.Message -match 'Claude' -and $ids -contains $_.Id } | Sort-Object TimeCreated)
$legend = @{ 603 = 'deployment started'; 574 = 'preferred version changing'; 638 = 'NOT updated: app still running'; 658 = 'deferred registration';
             9648 = 'terminating service for update'; 9650 = 'service terminated'; 9643 = 'APP FORCE-TERMINATED'; 472 = 'old version moved to Deleted';
             649 = 'repairing ACLs on register'; 10000 = 'package state -> DISABLED (servicing)'; 10007 = 'package state -> ENABLED (servicing done)'; 471 = 'delete-file error 0x12C (still held)' }
if ($ev.Count -eq 0) { Out 'None. (If the app updated in this window, the log may have rolled, or the updater used the in-app stealth path without a Store deployment.)' }
else {
  $byId = $ev | Group-Object Id | Sort-Object { [int]$_.Name }
  Out ('Counts: ' + (($byId | ForEach-Object { $_.Name + '=' + $_.Count + ' (' + $legend[[int]$_.Name] + ')' }) -join '; '))
  $show = @($ev | Where-Object { $_.Id -ne 471 } | Select-Object -Last 30)
  foreach ($e in $show) { Out ('  ' + (When $e.TimeCreated) + '  ' + $e.Id.ToString().PadLeft(5) + '  ' + $legend[$e.Id] + '  | ' + (Short ($e.Message -replace '\s+', ' ') 90)) }
  $kills = @($ev | Where-Object { $_.Id -eq 9643 })
  if ($kills.Count -gt 0) { $verdict.Add(('D2 - the updater force-terminated the running app ' + $kills.Count + ' time(s) in ' + $Days + ' days (AppX 9643). Each one also kills the service; see section 5 for why it then stays down.')) }
  # 10000 also fires for the STAGED version at deferral time, so raw counts never balance. Only the installed
  # package's own servicing matters: its last state event must be an ENABLED (10007).
  if ($pkg) {
    $mine = @($ev | Where-Object { ($_.Id -eq 10000 -or $_.Id -eq 10007) -and $_.Message -match [regex]::Escape($pkg.PackageFullName) })
    if ($mine.Count -gt 0 -and $mine[-1].Id -eq 10000) {
      Out ('Installed package ' + $pkg.PackageFullName + ': last servicing event is DISABLED (10000) with no ENABLED (10007) after it.')
      $verdict.Add('D3 - servicing of the installed package never reached ENABLED (10007): it is left disabled. Launch fails with "in use" until Repair re-registers it.')
    }
  }
}

# ---------------------------------------------------------------- 5. service
Sect ('5. Service ' + $SERVICE)
$svc = Get-Service -Name $SERVICE
if (-not $svc) { Out 'Service not found.' }
else {
  Out ('Status: ' + $svc.Status + '   StartType: ' + $svc.StartType)
  $qf = (& sc.exe qfailure $SERVICE) -join "`n"
  # When nothing is armed, sc prints only RESET_PERIOD / REBOOT_MESSAGE / COMMAND_LINE; the FAILURE_ACTIONS line appears only when an action exists.
  $hasActions = $qf -match 'FAILURE_ACTIONS'
  Out ('Failure actions armed: ' + $(if ($hasActions) { 'yes' } else { 'NO (sc qfailure lists none)' }))
  $sd  = ((& sc.exe sdshow $SERVICE) | Where-Object { $_ -match '^D:' }) -join ''
  $sid = ((& sc.exe showsid $SERVICE) | Where-Object { $_ -match 'SERVICE SID' }) -replace '.*SERVICE SID:\s*', ''
  Out ('DACL     : ' + $sd)
  Out ('Own SID  : ' + $sid)
  $dcHolders = @()
  foreach ($m in [regex]::Matches($sd, '\(A;;([A-Z]+);;;([^)]+)\)')) {
    $tokens = [regex]::Matches($m.Groups[1].Value, '..') | ForEach-Object { $_.Value }
    if ($tokens -contains 'DC') { $dcHolders += $m.Groups[2].Value }
  }
  Out ('Principals holding DC (SERVICE_CHANGE_CONFIG): ' + $(if ($dcHolders.Count) { $dcHolders -join ', ' } else { 'none' }))
  if ($sid -and $dcHolders.Count -gt 0 -and ($dcHolders -notcontains $sid) -and ($dcHolders -notcontains 'BA') -and ($dcHolders -notcontains 'SY')) {
    Out 'SID MISMATCH: the only DC grant names a service SID that is not this service''s own, and there is no BA/SY ACE. The service cannot arm its own recovery actions, and an admin start may also be denied.'
    $verdict.Add('D2 - service security descriptor grants change-config to the wrong service SID; recovery actions can never be armed, so a killed service stays down until the app starts it again or the PC reboots.')
  }
  $trig = (& sc.exe qtriggerinfo $SERVICE) -join ' '
  if ($trig -match 'pipe') { Out 'Start trigger: ETW/named-pipe trigger present - the app re-arms the service on use; disabling it does not stick.' }
}
$slog = "$env:ProgramData\Claude\Logs\cowork-service.log"
if (Test-Path $slog) {
  $w = @(Select-String -Path $slog -Pattern 'recovery actions' | Select-Object -Last 3 | ForEach-Object { $_.Line })
  if ($w.Count) { Out 'Service log, last recovery-action warnings:'; $w | ForEach-Object { Out ('  ' + (Short $_ 160)) } }
} else { Out ('Service log not found at ' + $slog) }

# ---------------------------------------------------------------- 6. SCM
Sect ('6. Service Control Manager events mentioning the service, last ' + $Days + ' days')
$scm = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; ProviderName = 'Service Control Manager'; StartTime = (Get-Date).AddDays(-$Days) } |
         Where-Object { $_.Message -match 'Claude VM|CoworkVMService' } | Sort-Object TimeCreated | Select-Object -Last 15)
if ($scm.Count -eq 0) { Out 'None.' } else { foreach ($e in $scm) { Out ('  ' + (When $e.TimeCreated) + '  ' + $e.Id + '  ' + (Short ($e.Message -replace '\s+', ' ') 110)) } }

# ---------------------------------------------------------------- verdict
Sect 'Verdict'
if ($verdict.Count -eq 0) { Out 'Nothing in the evidence matches the three known defects in this window. If the app is dead now, run scripts/fix-claude.ps1 -SurveyOnly and read its three lines.' }
else { $i = 1; foreach ($v in $verdict) { Out ("$i. $v"); $i++ } }
Out ''
Out 'Fix order: fix-claude.ps1 (start service, repair package, launch by identity) -> Settings > Apps > Claude > Repair -> Reset -> reboot.'
Out 'Prevent: quit the app before leaving it unattended; or assets/block-auto-updates.reg (UAC) to stop the self-relaunch.'
Out 'After any relaunch, Remote Control returns per session only on the first message SENT in that session.'

$text = $report -join "`r`n"
Write-Output $text
if ($OutFile) { Set-Content -Path $OutFile -Value $text -Encoding UTF8; Write-Output ''; Write-Output ('Written to ' + (Resolve-Path $OutFile)) }
