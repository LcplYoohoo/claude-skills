<#
.SYNOPSIS
  Bring the Claude Desktop app (Windows, MSIX) back up after the updater kills it - without a reboot.

.DESCRIPTION
  The three ways it dies, and what this script does about each (evidence: ../references/evidence.md):

    1. CoworkVMService was killed and cannot restart itself. The updater force-terminates it, and its
       security descriptor grants SERVICE_CHANGE_CONFIG to the wrong SID, so Windows' auto-recovery is
       never armed.                                                   -> this script STARTS it.
    2. The package was left DISABLED. Servicing sets the package state to disabled (AppX event 10000)
       and back when it finishes (10007). If the forced terminate did not complete, it never finishes,
       the package stays disabled, and Windows reports "another program is currently using this file".
                                                                       -> this script RE-REGISTERS it,
       which is exactly what Settings > Apps > Claude > Repair does.
    3. The app simply is not running.                                  -> this script LAUNCHES it,
       by package identity (shell:AppsFolder\...!Claude), never by the path under WindowsApps, which
       changes with every update.

  SAFETY - THIS SCRIPT ONLY STARTS AND REPAIRS. It never stops or kills a process and never resets the
  app, so it cannot sign you out, close open sessions, or delete anything. The one thing worse than a
  dead app is a script that closes the sessions you still had.

.PARAMETER SurveyOnly  Print the three state lines and exit. Changes nothing.
.PARAMETER NoPause     Do not wait for Enter at the end (for running from another script).

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File fix-claude.ps1
  powershell -NoProfile -ExecutionPolicy Bypass -File fix-claude.ps1 -SurveyOnly
#>
[CmdletBinding()]
param(
  [switch]$SurveyOnly,
  [switch]$NoPause
)

$ErrorActionPreference = 'SilentlyContinue'

$SERVICE = 'CoworkVMService'
$FAMILY  = 'Claude_pzs8sxrjxfjjc'
$AUMID   = "$FAMILY!Claude"

function Say($m)  { Write-Host $m }
function Good($m) { Write-Host $m -ForegroundColor Green }
function Warn($m) { Write-Host $m -ForegroundColor Yellow }
function Bad($m)  { Write-Host $m -ForegroundColor Red }
function Pause-Unless { if (-not $NoPause) { Read-Host '  Press Enter to close' | Out-Null } }

function Get-ClaudePackage { Get-AppxPackage -Name 'Claude' | Where-Object { $_.PackageFamilyName -eq $FAMILY } | Select-Object -First 1 }

Say ''
Say '  FIX CLAUDE'
Say '  ----------'
Say ''

$didSomething = $false

# --- 1. Survey ----------------------------------------------------------------

$svc = Get-Service -Name $SERVICE
$app = @(Get-Process -Name claude)
$pkg = Get-ClaudePackage

Say ("  Claude VM Service : " + $(if ($svc) { $svc.Status } else { 'NOT FOUND' }))
Say ("  Claude app        : " + $(if ($app.Count) { "running ($($app.Count) processes)" } else { 'NOT running' }))
Say ("  App package       : " + $(if ($pkg) { "$($pkg.Version)  status=$($pkg.Status)" } else { 'NOT FOUND' }))
Say ''

if ($SurveyOnly) { Pause-Unless; exit 0 }

if (-not $pkg) {
    Bad '  Windows cannot find the Claude package for this user.'
    Bad '  Reinstall from claude.ai/download - this script cannot help with that.'
    Say ''
    Pause-Unless
    exit 1
}

# --- 2. Service ---------------------------------------------------------------

if ($svc -and $svc.Status -ne 'Running') {
    Warn '  The VM service is down. This is the thing that normally forces a reboot.'
    Say  '  Starting it...'
    Start-Service -Name $SERVICE
    Start-Sleep -Seconds 2
    $svc = Get-Service -Name $SERVICE

    if ($svc.Status -ne 'Running') {
        # Authenticated Users holds RP (SERVICE_START) in this service's DACL, so an ordinary start
        # should work. If it did not, elevation is the next thing to try.
        Warn '  A normal start did not take. Asking for administrator rights...'
        Start-Process -FilePath 'powershell.exe' -Verb RunAs -Wait -WindowStyle Hidden `
            -ArgumentList '-NoProfile','-Command',"Start-Service -Name $SERVICE"
        Start-Sleep -Seconds 2
        $svc = Get-Service -Name $SERVICE
    }

    if ($svc.Status -eq 'Running') { Good '  VM service started. No reboot needed.'; $didSomething = $true }
    else                           { Bad  '  Could not start the VM service - continuing anyway.' }
} elseif ($svc) {
    Good '  VM service is already running.'
}

# --- 3. Package state ---------------------------------------------------------
#
# Re-registering is the scripted form of Settings > Apps > Claude > Repair. It is per-user, needs no
# elevation, and touches no user data. Only do it when the app is NOT running - re-registering
# underneath a live app is asking for trouble.

function Repair-ClaudePackage {
    $p = Get-ClaudePackage
    if (-not $p) { return $false }
    $manifest = Join-Path $p.InstallLocation 'AppxManifest.xml'
    if (-not (Test-Path $manifest)) {
        Bad "  Cannot find AppxManifest.xml at $manifest"
        return $false
    }
    Say '  Repairing the app registration (this is what Settings > Repair does)...'
    Add-AppxPackage -DisableDevelopmentMode -Register $manifest
    Start-Sleep -Seconds 2
    $p = Get-ClaudePackage
    if ($p -and $p.Status -eq 'Ok') { Good '  Package repaired.'; return $true }
    Warn ("  Package status is now: " + $(if ($p) { $p.Status } else { 'missing' }))
    return $false
}

Say ''
if ($pkg.Status -ne 'Ok') {
    Warn ("  The app package is not healthy (status: $($pkg.Status)).")
    Warn '  This is the state that produces the "another program is still running" error.'
    if ($app.Count) {
        Warn '  The app is running, so the repair is being skipped to avoid breaking it.'
        Warn '  Close Claude from the taskbar, then run this again.'
    } elseif (Repair-ClaudePackage) {
        $didSomething = $true
    }
} else {
    Good '  App package is healthy.'
}

# --- 4. Launch ----------------------------------------------------------------

Say ''
if (-not $app.Count) {
    Say '  Starting Claude...'
    Start-Process 'explorer.exe' "shell:AppsFolder\$AUMID"
    Start-Sleep -Seconds 5

    if (Get-Process -Name claude) {
        Good '  Claude is starting up.'
        $didSomething = $true
    } else {
        # The commonest real-world case: launch silently does nothing because the package is disabled
        # mid-servicing. Repair, then try once more.
        Warn '  It did not come up. Repairing the registration and trying once more...'
        if (Repair-ClaudePackage) {
            Start-Process 'explorer.exe' "shell:AppsFolder\$AUMID"
            Start-Sleep -Seconds 5
        }
        if (Get-Process -Name claude) {
            Good '  Claude is starting up now. No reboot needed.'
            $didSomething = $true
        } else {
            Bad  '  Still could not start Claude.'
            Say  ''
            Say  '  Next things to try, in this order:'
            Say  '    1. Settings > Apps > Claude > Advanced options > Repair'
            Say  '    2. If that fails, Reset (signs you out, keeps your files)'
            Say  '    3. Only then, restart the PC'
            Say  ''
            Pause-Unless
            exit 1
        }
    }
} else {
    Good '  The app is already running.'
    Say  ''
    Say  '  If it is running but frozen, this script deliberately will NOT force-close it, because that'
    Say  '  would take your open sessions with it. Close it yourself from the taskbar, then run this again.'
}

# --- 5. Verdict ---------------------------------------------------------------

Say ''
if (-not $didSomething) { Say '  Nothing needed fixing - everything was already up.' }
Say '  Remote Control: after any relaunch it returns per session only on the first message you SEND there.'
Say ''
Pause-Unless
