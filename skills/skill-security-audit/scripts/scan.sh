#!/usr/bin/env bash
#
# scan.sh — read-only red-flag scanner for third-party Claude Skill bundles.
# Part of the skill-security-audit skill.
#
# Usage:   bash scan.sh /path/to/STAGED-skill-copy
#          (stage the bundle in a scratch dir first — never scan a skill
#           sitting in ~/.claude/skills/ or a plugin cache; see SKILL.md)
#
# Exit codes:  2 = REJECT-severity hit(s)
#              1 = CAUTION-severity hit(s) only
#              0 = no pattern hits
#
# This script ONLY runs grep/find. It never executes bundle code, never
# fetches anything, never writes anything. Safe to run on hostile bundles.
#
# A clean exit is NOT a clean bill. This automates the pattern pass; the
# manual read of every file (SKILL.md Steps 3-5) is still mandatory —
# SKILLJECT-class attacks (80.7% success rate, arXiv Feb 2026) work
# precisely by hiding where pattern scans and lazy reviewers don't look.
#
# Pattern rationale + false-positive notes: ../references/red-flag-patterns.md
# Note: scanning THIS skill's own directory will self-flag (the docs quote
# the hostile patterns as text). That is expected.

set -u

DIR="${1:-}"
if [ -z "$DIR" ] || [ ! -d "$DIR" ]; then
    echo "Usage: bash scan.sh /path/to/staged-skill-directory" >&2
    exit 64
fi

REJECT=0
CAUTION=0

report() {
    # report <SEVERITY> <label> <pattern-shown> <matches>
    local sev="$1" label="$2" pat="$3" out="$4" n
    echo ""
    echo "=== [$sev] $label ==="
    echo "    pattern: $pat"
    printf '%s\n' "$out" | head -40 | sed 's/^/    /'
    n=$(printf '%s\n' "$out" | wc -l)
    [ "$n" -gt 40 ] && echo "    ... ($n total matches, first 40 shown)"
    if [ "$sev" = "REJECT" ]; then
        REJECT=$((REJECT + 1))
    else
        CAUTION=$((CAUTION + 1))
    fi
}

scan() {
    # scan <SEVERITY> <label> <ERE pattern>
    local sev="$1" label="$2" pat="$3" out
    out=$(grep -rEniI --exclude-dir=.git -e "$pat" "$DIR" 2>/dev/null || true)
    [ -n "$out" ] && report "$sev" "$label" "$pat" "$out"
    return 0
}

echo "skill-security-audit scanner (read-only)"
echo "target: $DIR"

# ---------------------------------------------------------------------------
# File inventory — the audit must read 100% of these. Binaries are
# unauditable and therefore REJECT-severity on sight.
# ---------------------------------------------------------------------------
echo ""
echo "=== File inventory (Step 5 requires reading every one) ==="
BINARIES=0
while IFS= read -r f; do
    if [ ! -s "$f" ]; then
        kind="empty "
    elif grep -qI . "$f" 2>/dev/null; then
        kind="text  "
    else
        kind="BINARY"
        BINARIES=$((BINARIES + 1))
    fi
    echo "    [$kind] $f"
done < <(find "$DIR" -type f | sort)

if [ "$BINARIES" -gt 0 ]; then
    report REJECT "unreadable binary file(s) in bundle — cannot be audited" \
        "(binary detection via grep -I)" \
        "$BINARIES binary file(s) flagged BINARY in the inventory above"
fi

# ---------------------------------------------------------------------------
# REJECT-severity patterns
# ---------------------------------------------------------------------------

# Datadog PoC: !`cmd` executes at prompt expansion, BEFORE the model reasons.
scan REJECT "dynamic-context execution (runs at load, pre-reasoning)" \
    '!`[^`]+`'

# Reversec: bypassPermissions frontmatter -> working reverse shell.
scan REJECT "permission-system bypass" \
    'bypassPermissions|dangerously[-_]?skip[-_]?permissions'

# Unscoped Bash wildcard: every hidden instruction runs without a prompt.
scan REJECT "unscoped Bash wildcard in allowed-tools" \
    'allowed-tools:[^#]*Bash\(\*'

# Cato/MedusaLocker pattern: fetch remote code and run it post-approval.
scan REJECT "download piped to interpreter (fetch-and-execute)" \
    '(curl|wget|iwr|invoke-webrequest)[^|;]*\|[^|]*\b(sh|bash|zsh|dash|iex|invoke-expression|node|python[0-9.]*)\b'

# Encoded PowerShell exists to hide the command from humans and scanners.
scan REJECT "encoded PowerShell command" \
    '(powershell|pwsh)[^"]*\s-(e|ec|en|enc|encodedcommand)\b'

# 91% of Snyk's confirmed-malicious skills used injection language like this.
scan REJECT "secrecy instructions (hide actions from the user)" \
    'do not (tell|inform|notify|mention|reveal|alert|show)[^.]{0,40}(user|human)|without (telling|informing|notifying|alerting) the user|keep (this|it) (hidden|secret)|do not ask (the user )?(for )?(permission|approval|confirmation)'

scan REJECT "prompt-injection / instruction-override language" \
    'ignore (all |any )?(previous|prior|earlier|above) (instructions|rules)|disregard (your|all|previous|the) (instructions|rules|system prompt)|new system prompt|already (approved|authorized|consented)|is pre-?(approved|authorized)'

# Direct theft targets. A bundle naming your actual key filename = targeted.
scan REJECT "credential and secret-store paths" \
    'gh auth token|\.aws/credentials|\.ssh/id_|api-keys\.env|\.netrc|\.pgpass|wallet\.dat|keystore\.json|login data|/etc/shadow'

# Standard exfil drops. Some of these (Telegram bot API, Discord webhooks)
# have legitimate uses in your own scripts — the test is whose endpoint it is.
scan REJECT "known exfiltration / callback endpoints" \
    'webhook\.site|requestbin|pipedream\.(net|com)|ngrok\.(io|app|dev)|burpcollaborator|interactsh|oastify|canarytokens|discord(app)?\.com/api/webhooks|api\.telegram\.org/bot'

# Hooks run shell on harness events — without the skill ever being invoked.
# Prose discussing hooks is a false positive; a JSON key registering one is not.
scan REJECT "hook registration keywords (verify: config file vs prose)" \
    '(PreToolUse|PostToolUse|UserPromptSubmit|SessionStart|SubagentStop|PreCompact)'

# Disabling antivirus has exactly one purpose in a skill bundle.
scan REJECT "Defender / AMSI tampering" \
    'add-mppreference|set-mppreference|exclusionpath|disablerealtimemonitoring|amsi'

# ---------------------------------------------------------------------------
# CAUTION-severity patterns — each hit must be explained or mitigated
# ---------------------------------------------------------------------------

scan CAUTION "broad Bash grant in allowed-tools (rewrite to scoped commands)" \
    'allowed-tools:[^#]*Bash'

scan CAUTION "code-execution primitives (REJECT if fed by decode or fetch)" \
    '\beval\b|\bexec\(|child_process|execsync|spawnsync|subprocess|os\.system|start-process|invoke-expression|\biex\b'

scan CAUTION "encoding / obfuscation primitives (REJECT if output executes)" \
    'atob\(|fromcharcode|frombase64string|buffer\.from\([^)]*base64|base64 (-d|--decode)|\\\\x[0-9a-f]{2}\\\\x[0-9a-f]{2}'

scan CAUTION "hardcoded IP addresses" \
    '\b([0-9]{1,3}\.){3}[0-9]{1,3}\b'

scan CAUTION "all URLs — each must be justified by the skill's stated purpose" \
    'https?://[a-z0-9][a-z0-9./?&=_%:+-]*'

# Memory poisoning: writes here outlive the skill (SOUL.md was the named
# example in the research; adjust the list to whatever files your setup
# treats as standing instructions).
scan CAUTION "persistent memory / config references (REJECT if written to)" \
    'claude\.md|memory\.md|soul\.md|settings(\.local)?\.json|hard-limits\.json|\.claude/hooks|keybindings\.json'

scan CAUTION "persistence mechanisms (REJECT if writing; survives deletion)" \
    'schtasks|register-scheduledtask|crontab|/etc/cron|\.bashrc|\.zshrc|\.profile|\$profile|currentversion\\+run|launchagents|launchctl|startup folder'

# Reversec: sub-agent installed a backdoored npm package invisibly.
scan CAUTION "package installation (pin versions, check for typosquats)" \
    '\bnpm (i|install)\b|\bpip3? install\b|\bcargo install\b|\bgem install\b|\bgo install\b|\bnpx\b'

scan CAUTION "environment-variable access (what is read, and why?)" \
    'process\.env|os\.environ|printenv|get-childitem env|\$env:'

scan CAUTION "quiet-mode language (read in context)" \
    '\bsilently\b|without confirmation|do not display|no need to (show|mention)'

scan CAUTION "hidden-window execution" \
    '-windowstyle hidden|-w hidden'

# ---------------------------------------------------------------------------
# Invisible unicode — needs PCRE. Zero-width chars carry instructions no
# human reviewer sees; bidi overrides make displayed code differ from
# executed code.
# ---------------------------------------------------------------------------
if printf 'x' | grep -qP 'x' 2>/dev/null; then
    out=$(grep -rPnlI --exclude-dir=.git \
        -e '[\x{200B}-\x{200F}\x{202A}-\x{202E}\x{2060}-\x{2064}\x{FEFF}]' \
        "$DIR" 2>/dev/null || true)
    [ -n "$out" ] && report REJECT \
        "invisible unicode (zero-width / bidi override) in these files" \
        'PCRE [\x{200B}-\x{200F}\x{202A}-\x{202E}\x{2060}-\x{2064}\x{FEFF}]' \
        "$out"
else
    echo ""
    echo "NOTE: this grep lacks -P; invisible-unicode check was SKIPPED."
    echo "      Run it with Claude's Grep tool (ripgrep) using pattern:"
    echo "      [\\x{200B}-\\x{200F}\\x{202A}-\\x{202E}\\x{2060}-\\x{2064}\\x{FEFF}]"
    CAUTION=$((CAUTION + 1))
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "==================================================================="
echo "SUMMARY: $REJECT REJECT-severity group(s), $CAUTION CAUTION group(s)"
if [ "$REJECT" -gt 0 ]; then
    echo "Read every hit in context. Any confirmed true positive in a"
    echo "REJECT group = AUTO-REJECT per SKILL.md Step 7."
    exit 2
elif [ "$CAUTION" -gt 0 ]; then
    echo "Caution hits only. Each must be explained (false positive, line"
    echo "quoted) or mitigated before a PROCEED-WITH-CAUTION verdict."
    exit 1
else
    echo "No pattern hits. NOT a clean bill by itself — complete the"
    echo "manual read (SKILL.md Steps 3-5) and sandbox test if the bundle"
    echo "contains any script or network use."
    exit 0
fi
