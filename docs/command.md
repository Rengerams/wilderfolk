You are running in PowerShell 7 (pwsh) on Windows. This is NOT bash — the shell language is PowerShell.
GNU text tools from Git for Windows are on PATH, so a few Linux commands work, and Git Bash (a real GNU bash) is
also installed on this machine — but it only runs when you launch it explicitly. See Git Bash is also installed
below before you rely on it.

Verify this first — do not assume it.

PowerShell

$PSVersionTable.PSVersion.ToString()
If that reports 5.1, you are not in PowerShell 7. Most rules below still apply, but several PowerShell 7
behaviours do not exist there (&&, ||, default UTF-8 redirection, ImportFromPem) and guessing wrong
produces silent data corruption rather than an error. Read PowerShell 5.1 fallbacks at the bottom.

**RULE — if it reports 5.1, switch to pwsh 7 before anything else.** PowerShell 7 is installed at
`C:\powershell7\pwsh.exe` and is already on PATH (verified 2026-10-08: 7.7.0-preview.5), so:

PowerShell

& 'C:\powershell7\pwsh.exe' -NoProfile -Command '$PSVersionTable.PSVersion.ToString()'
Run your commands through that path. Only if it is missing or will not start do you fall through to the
5.1 protocol further down. This applies to **every shell, including a subagent's own** — a delegated
shell is a separate process and can report 5.1 in the same session where the parent reports 7. Check
inside the shell you are actually running, not the one that dispatched you.

That switch costs one process and buys the whole of the section below, so it is almost always cheaper
than working around 5.1 by hand.

Do not wrap commands in `cmd /c "…"` as a habit while in PowerShell 7. It is unnecessary, it hides the
real exit code behind cmd's, and it was a misreading of this check rather than a requirement. It is
only for a program whose own argv quoting PowerShell mangles — the npm wrappers qualify, most things
do not.

And if the harness keeps reporting 5.1 however many times you relaunch pwsh — because it spawns a fresh
shell for every command, so nothing you start sticks — read Starting in Windows PowerShell 5.1
immediately below. That is the protocol for harnesses like the DeepSeek Harness (DSH) desktop app v2.0,
which the owner runs (reported 2026-10-08). Its section 0 also names the three real fixes for DSH
specifically: get C:\powershell7 onto the user PATH (or set the executor's pwshPath / DSH_POWERSHELL),
use the Minimal preset when you want a persistent shell (2.0 only persists there; Standard/PTC are
one-shot), and update to a 0.2.0-rc.2-or-later build, which fixed the persistent-PowerShell completion and
exit-code bugs.

Starting in Windows PowerShell 5.1 — when the harness will not give you pwsh
Some harnesses launch Windows PowerShell 5.1 (powershell.exe), not PowerShell 7, and spawn a fresh
shell for every command. Both consequences are silent:

0. If the app is DeepSeek Harness (DSH) — fix the cause first
The owner runs the DeepSeek Harness desktop app, version 2.0 (the dsh 0.2.x line; the desktop builds carry
their own runtime, so there is no separate Node install to inspect). Three documented behaviours explain this
section exactly, and all three have real fixes — try them before falling back to the bridge:

Why you land in 5.1. The DSH pwsh executor resolves its shell in this order: an explicit pwshPath, then
PowerShell 7's well-known install locations, then PATH entries (Microsoft Store installs included), then
Windows PowerShell 5.1, then a bare pwsh executable. On this machine PowerShell 7 lives at
C:\powershell7\pwsh.exe, which is neither a well-known location nor on PATH — so DSH falls through to 5.1
and keeps doing it on every call. Fix (owner, one time): add C:\powershell7 to the user PATH and
fully restart the app (a GUI app inherits PATH at launch, so a relaunch is part of the fix), or set the
executor's explicit pwshPath knob — it is inherited from dsh-pwsh-local and lives in the shell settings
namespace of settings.yaml, unlike composition-only knobs such as cmdPath. DSH_POWERSHELL is the host's
override for the PowerShell the harness itself launches (used by things like the restart supervisor), not the
agent shell. Verify what actually resolved with dsh --dump-config, then inside a session with
$PSVersionTable.PSVersion.ToString() and (Get-Command pwsh).Source. (A --dump-config dump shows only the
host composition, so a disabled tool-pwsh row there is expected and is not evidence about the session.)

Is the shell persistent? In 2.0 that depends on the preset — do not assume either way. Persistent
PowerShell sessions landed in the Windows PTY terminal in 0.1.0-rc.8 and are enabled by default in the
Minimal preset: one owner-scoped persistent shell per agent, with cwd and exported environment surviving
across calls. Standard and PTC instead use the one-shot pwsh tool, documented as "each pwsh call starts a
fresh shell; no persistent PTY — use workdir, not cd." So with 2.0 the fresh-shell symptom usually means
the session is not in Minimal mode. Fix: switch the session to Minimal for a persistent shell (or add
a Windows preset that mounts one: dsh-all-in-pwsh — persistent pwsh with every tool bridged into it — or
dsh-mini-win, persistent Git Bash + pwsh 7, dropped into ~/.dsh/.agent-presets/; the older
dsh-coding-preset is deprecated because official minimal mode now covers it). Then verify with two commands:
set a variable, read it in the next call. Until persistence is confirmed, §3's bridge is how you carry state —
or pass workdir and re-cd every call.

Which 2.0 build matters. 0.2.0-rc.2 (2026-09-29) fixed persistent PowerShell failing to recognize
command completion, losing exit codes, or leaking internal markers when status lines have trailing spaces —
and the same line fixed persistent PowerShell starting too early and returning incomplete output, extra
waiting after a command finishes, [object Object] output when a persistent Bash/PowerShell call is
cancelled, and console windows flashing on Windows for PTC/shell commands. If the owner's build predates
those, a "weird" shell symptom may be a known fixed bug rather than something to work around: say so and
check for an update (the desktop app can install dsh from its menus; no separate Node/pnpm needed).

Pointing the executor at pwsh explicitly (owner fix, optional — verify before editing). The Windows shell
executor row on the host plane (pwsh-sandbox; the sandbox variant replaces/joins bash-sandbox) inherits the
dsh-pwsh-local config — cwd, timeoutMs, maxOutputBytes, pwshPath — so it can be given
pwshPath: 'C:\powershell7\pwsh.exe' on its row in $DSH_HOME/profiles/<profile>/cordis.patch.yml
(desktop app: profiles/desktop/). The row id must be confirmed, not assumed — run dsh --dump-config
first and match the actual row id in that profile (the dump shows the host composition only, which is
exactly where the executor lives); keep a backup of the patch file, and treat this as an owner action, since an
entry aimed at a row id that does not exist is at best ignored and at worst a startup error. The PATH fix
already covers discovery for both the one-shot executor and the persistent PTY — add this second layer only
when a path still resolves to 5.1.

Windows self-checks the owner may run (dsh-win32) — standalone only. dsh-win32 is a community (MIT) CLI
that checks the DSH Windows stack and runs a model-free acceptance test of the installed persistent pwsh tool
(PTY state retention, file I/O, ACL sandbox) in an isolated temp home, without loading or changing the user's
profile. On current hosts it must be run standalone — npx dsh-win32 setup --profile desktop --no-shortcut,
then npx dsh-win32 verify --json (repairs: doctor --json, then fix). Do not install it as a profile
bundle: its maintainer states that dsh plugin add activates a legacy bundle for older hosts, and an
enabled old bundle can block DSH startup — recovery is
npx dsh-win32@0.17.14 disable --profile <name> [--apply], which backs the profile package.json up byte for
byte and removes only its own entry. Running it needs Node 22.19+/24+ (not 23). On the desktop app these
results need translating (verified 2026-10-08): verify reports "no installed @deepseek-ai/dsh dependency
tree was found" because the app bundles its runtime — expected, not a machine fault — and doctor's
dsh_current / persistent_powershell / workspace_write / sandbox_shell warnings show version unknown
for the same missing npm tree, not a defect. The owner runs the desktop app only — no CLI (stated
2026-10-08), so verify stays off-path: making it meaningful would require installing the dsh CLI, which is
optional here and not required. What matters is tested app-side, in a session:
$PSVersionTable.PSVersion.ToString() — plus persistence (set a variable, read it in the next call; only the
Minimal preset is persistent in 2.0). Owner run-book with the recorded results:
dsh/WINDOWS-CHECKS-dsh-win32.md.

Where the app keeps things — so you neither guess nor delete it: $DSH_HOME defaults to ~/.dsh, with
global settings in settings.yaml, credentials in .credentials.yaml, sessions in storages/, and the
desktop app's own plugin profile in profiles/desktop/. That profile holds cordis.patch.yml (the
profile-level override layer — where shell rows and composition entries belong), package.json (its plugin
dependencies) and pnpm-workspace.yaml, plus cordis.yml, which the app composes/writes at startup —
do not hand-edit cordis.yml, edit the patch layer (its mtime changes on every launch; observed
2026-10-08 on the owner's machine: cordis.yml rewritten at 06:47 while the other three kept their install
date). dsh --dump-config prints the merged config without starting anything. None of it is scratch —
see the temp-file section: never delete the harness's home.

Only if none of the fixes is available (locked-down machine, old build, no PATH change permitted) does the
bridge in §3 below become the protocol.

pwsh cannot be "switched to" once and kept. Start it, and the next command is 5.1 again. cd, $env:,
variables, functions, PSDrives, $ErrorActionPreference — all gone with the process they lived in.

The 5.1 fallbacks are what protect you in the meantime. Apply them to the caller, or bridge the work into
pwsh — but never mix the two assumptions inside one command.

1. Confirm it, and find the 7.x binary
PowerShell

$PSVersionTable.PSVersion.ToString()          # 5.1 → this section applies
(Get-Command pwsh -ErrorAction SilentlyContinue).Source
Test-Path 'C:\powershell7\pwsh.exe'           # this machine's install
Test-Path "$env:ProgramFiles\PowerShell\7\pwsh.exe"
Take the first path that exists. If none does, you are in 5.1-only mode: apply the PowerShell 5.1
fallbacks at the bottom to every command, use Git Bash (see above) for text and file work, and say so in your
report. Do not install PowerShell 7 to fix this — that is an owner decision.

2. To prove the shell is fresh per command, test in the next command
Starting pwsh inside a command tells you nothing about the next one. The test is two commands:

PowerShell

# command 1 — start 7.x and let it report itself
& 'C:\powershell7\pwsh.exe' -NoLogo -NoProfile -Command '$PSVersionTable.PSVersion.ToString()'
$LASTEXITCODE
PowerShell

# command 2 — if this still says 5.1, the harness gives you a new shell every time
$PSVersionTable.PSVersion.ToString()
3. Bridge every command — two forms
Short, single-line commands — one -Command payload, single-quoted so 5.1 expands nothing (double any
' inside as ''):

PowerShell

& 'C:\powershell7\pwsh.exe' -NoLogo -NoProfile -Command 'Get-ChildItem tests -Recurse -File -Include *.ts | Select-String -Pattern "x"'
$LASTEXITCODE
Anything longer than one line — the default choice. Write the script, then run it:

PowerShell

Set-Content -Path tmp\step1.ps1 -Encoding UTF8 -Value @'
$ErrorActionPreference = 'Stop'
# ... the real work ...
exit 0
'@
& 'C:\powershell7\pwsh.exe' -NoLogo -NoProfile -ExecutionPolicy Bypass -File tmp\step1.ps1
$LASTEXITCODE
Encoding is why Set-Content -Encoding UTF8 is named. On 5.1 it writes UTF-8 with BOM, which
pwsh -File reads correctly. The reverse is not true: 5.1's > and Out-File write UTF-16LE, so never use
them to create a file another program parses.
-ExecutionPolicy Bypass is per-process, not a machine change — it stops a locked-down policy from
silently refusing the script. Use it on every -File call.
Make the bridge honest. End a script with an explicit exit when the caller depends on the code (a
thrown error also exits non-zero; a last command that merely returns a value does not). Read
$LASTEXITCODE on the very next line, in the 5.1 caller.
-NoProfile keeps the run reproducible. Drop it only when a profile command (aitree, aicopy, …) is
genuinely needed — and then note that the profile belongs to 5.1, not 7.
The bridge inherits the caller's working directory, so cd in 5.1 before the call is fine — as long as it is
in the same command.
4. What not to do
Do not set $env:, cd, or define helpers in one command and "continue" in the next — each command is a
new 5.1 process (section 2 above is the test).
Do not shim, rename, or alias powershell.exe, edit PATH, or install anything to force the version.
Propose it to the owner in one line instead; until then the bridge is the protocol.
Do not start pwsh bare or with -i — it waits on stdin and hangs the command.
Do not report "used PowerShell 7" because one bridge call printed 7.x. The session was 5.1 unless
every command was bridged.
5. Say it in the report
Shell: started in 5.1; harness spawns a fresh shell per command; work bridged through C:\powershell7\pwsh.exe -NoProfile (5.1 fallbacks applied to the caller) — or state plainly that you ran in 5.1-only mode and why.

6. The one-time owner fix (the owner does this — not you)
If the harness has no shell setting of its own, the clean fixes are to put PowerShell 7 on PATH (add
C:\powershell7 to the user PATH and restart the harness) and to set the default terminal profile to
PowerShell 7 (Windows Terminal → Settings → default profile; VS Code-style editors →
"terminal.integrated.defaultProfile.windows": "PowerShell"). Until that is done, the bridge in section 3 is
the protocol.

Available GNU tools (real GNU versions, usable as normal)
grep, sed, awk, head, tail, wc.
For sorting use Sort-Object; for finding files use Get-ChildItem -Recurse (sort and find resolve to PowerShell/Windows versions).
bash.exe (Git Bash) is also present, but that is a whole second shell rather than another text tool — see the next section.

These are PowerShell aliases, NOT Linux commands
ls, cat, rm, cp, mv, echo map to PowerShell cmdlets and do NOT accept Linux flags.

ls -la → Get-ChildItem -Force
rm -rf dir → Remove-Item dir -Recurse -Force
mkdir -p dir → New-Item -ItemType Directory -Path dir -Force
touch file → New-Item -ItemType File -Path file -Force
which cmd → Get-Command cmd
Git Bash is also installed — start it explicitly, never assume it
Git for Windows ships a real GNU bash. It is available on this machine, but it is not the shell your command
runs in: a command handed to the terminal still runs in PowerShell. Git Bash runs only when you launch it
yourself, and everything bash-flavoured is correct inside the quotes you pass to it — nothing more.

Find it — verify, do not assume. Get-Command bash.exe -ErrorAction SilentlyContinue, or
Test-Path "$env:ProgramFiles\Git\bin\bash.exe". Typical locations:
C:\Program Files\Git\bin\bash.exe (the Git Bash launcher) and
C:\Program Files\Git\usr\bin\bash.exe (the raw MSYS shell).
Run one-shot and non-interactively. & "C:\Program Files\Git\bin\bash.exe" -lc "npm run build".
-l loads the login profile (PATH, git, openssl.exe); -c runs the string and exits.
Never launch it bare. bash with no -c waits on stdin and hangs the session; the same goes for -i.
Read $LASTEXITCODE on the very next line. A native program's non-zero exit does not surface as a
PowerShell error.
Inside bash these work as normal: &&, ||, export, /dev/null, ls -la, rm -rf, sed -i,
xargs, find -print0, here-docs. None of them may leak into a PowerShell line.
Never mix the two languages in one command. & "...\bash.exe" -lc 'cd /c/proj && npm test'; if ($LASTEXITCODE -ne 0) { ... }
is fine — each language stays inside its own quoting, never straddling the boundary.
Quoting. Wrap the bash script in single quotes; inside double quotes PowerShell still expands $var
first. For anything longer than a line, write it to tmp\script.sh and run
& "C:\Program Files\Git\bin\bash.exe" -l "tmp\script.sh" (see Do not backtick-escape $ below).
MSYS path conversion. Git Bash rewrites arguments that look like Unix paths when handing them to
Windows programs: /c/Users/... becomes C:\Users\..., but switches such as /S, /upgrade, /d, and
some URLs get mangled too. When an argument must pass through byte-for-byte, set MSYS_NO_PATHCONV=1
($env:MSYS_NO_PATHCONV = '1' in the calling PowerShell, or on the same line inside the bash script).
Files written from bash are UTF-8 without BOM — the correct default, and one reason bash is a safe way
to emit a JSON fixture another program (Node, a test runner) will parse. On PowerShell 5.1 the redirection
default is UTF-16LE plus BOM instead; that trap is covered under the 5.1 fallbacks below.
Line endings. Git Bash writes LF. With core.autocrlf=true a checkout can turn the file back into
CRLF, so the bytes you wrote are not always the bytes that survive a git round-trip. Decide per file
(shell scripts and generated JSON want LF here) and check the first bytes before trusting the result.
What it does not fix. Everything outside the quotes. A >, |, 2>&1, or $env: in the surrounding
PowerShell line is still PowerShell's — Git Bash cannot rescue syntax that was never inside the bash call.
Shell syntax (PowerShell, not bash)
Environment variables: $env:VAR = "value" to set, $env:VAR to read. export does not exist.
Chaining: ; always continues, && only on success, || only on failure.
$( ... ) is a subexpression, e.g. "Files: $((Get-ChildItem).Count)".
Backtick (`) is the escape character, not command substitution.
'single quotes' are literal; "double quotes" expand variables.
Discard output with | Out-Null or > $null, never /dev/null.
Paths with spaces: always quote. To run them, use & "C:\Path With Spaces\tool.exe".
HTTP: use Invoke-RestMethod or curl.exe.
c scherm wissen
ll bestanden tonen
np kladblok openen
home naar je gebruikersmap
Get-MyIP publiek IP-adres
grep tekst zoeken
AI
clipcheck klembord tonen en controleren
clipsave klembord opslaan als bestand (clipsave test.ps1)
aicopy bestanden naar klembord (aicopy main.py)`
aitree mappenstructuur naar klembord
aierr laatste fout naar klembord
aiclip uitvoer naar klembord (ll | aiclip)
aienv systeeminfo naar klembord
Temp files — create few, name them, delete them all
The owner's standing rule: when the task ends, nothing you created is left on this machine — not in the
repository, not in %TEMP%, not in the user profile. 
AGENTS.md
 → "Temp files on the owner's machine"
holds the full policy; this section is the how-to.

Write scratch to one named directory, not scattered files:
$scratch = Join-Path $env:TEMP 'wilderfolk-agent-<task>' then New-Item -ItemType Directory -Path $scratch -Force.
One directory you created is safe to delete recursively; a file dropped in a shared folder is not.
Know the places that get forgotten: $env:TEMP / $env:TMP (usually %LOCALAPPDATA%\Temp),
C:\Windows\Temp, %USERPROFILE% (Desktop, Documents, Downloads, the profile root),
%LOCALAPPDATA%, %APPDATA%, %USERPROFILE%\.cache, %USERPROFILE%\.config, %USERPROFILE%\.npm,
throwaway Chrome/Edge/Chromium user-data and Playwright/Puppeteer directories, anything you extracted,
exported, downloaded or screenshotted outside dist/.
Delete and verify. Remove-Item $scratch -Recurse -Force; then Test-Path $scratch must return
False. A locked file survives silently — stop the watcher or dev server first (see the root-file lock
trap above), then retry.
Drain the repository's tmp/: npm run clean is the dry run, npm run clean:apply deletes tmp/,
dist/, and the throwaway browser profiles automation leaves in the OS temp dir. tmp/ has no keep-list;
promote anything worth keeping to its documented home first.
Browser automation must be given a profile directory you own —
--user-data-dir="$scratch\chrome" — and started headless; kill the process before deleting the profile,
or it recreates the files you just removed.
Report it. The Step 5 report carries a Cleanup: line naming every path you removed (verified gone) and
anything you could not remove, with the reason. "I deleted my temp files" without a path is not evidence.
Never delete what is not yours (other users' temp folders, C:\Windows\Temp wholesale, tracked repo
files, node_modules/, package-lock.json) and never empty %TEMP% wholesale. If it is unclear
whether a path is yours, ask one focused question before removing it.
The app's own home is never scratch. Everything under $DSH_HOME (default ~/.dsh — settings.yaml,
.credentials.yaml, storages/, profiles/) belongs to the DeepSeek Harness app, not to your task. The
same goes for app/plugin profiles it parks in %TEMP% (for example %TEMP%\dsh-desktop-window). Clean up
only the files you created.
Error handling
Use $ErrorActionPreference = 'Stop' in scripts.
Native programs (git, npm, python, grep) do not throw PowerShell errors. Check $LASTEXITCODE after them. Note: grep returns exit code 1 when nothing matches, which is not an error.
Non-interactive
Never run commands that wait for input. Use -Confirm:$false on cmdlets that may prompt, and non-interactive flags for native tools (npm init -y, winget install --accept-package-agreements --accept-source-agreements).
Output
For structured data: Select-Object the needed fields, then ConvertTo-Json -Depth 5. The default depth of 2 silently truncates.
Files are written as UTF-8 without BOM by default in PowerShell 7. Keep it that way, and never rely on
the default when another program will parse the file — see PowerShell 5.1 fallbacks at the bottom, where
that default is UTF-16LE instead and a BOM breaks parsers.
PowerShell Regex & Multiline Rules
When generating PowerShell code that uses Regular Expressions (Regex) or parses source code, you MUST follow these architectural rules to prevent broken matches:

1. File Ingestion & Parsing
Always use -Raw: Never let Get-Content read files as an array of lines. Always use Get-Content -Path "..." -Raw to process the file as a single, contiguous multiline string. Otherwise, multiline regex will fail silently.
2. Multi-line Regex Modifiers
Token Matching (?s): Use (?s) (Singleline/Dotall) at the absolute start of your pattern when the dot (.) needs to match across newlines (e.g., matching a block between two markers).
Line Anchors (?m): Use (?m) (Multiline) ONLY when ^ and $ need to match the start and end of individual lines within the large string.
3. Abstract Syntax Tree (AST) & Token Stripping Order
When writing scripts that analyze source code (like extracting imports, functions, or dependencies), order of operations is critical. Do not corrupt the tokens you need to extract:

Phase 1 (Sanitization): Strip block comments (/* ... */) and line comments (// ...) FIRST.
Phase 2 (Import Extraction): Extract imports/dependencies from this comment-stripped source. DO NOT strip strings yet, otherwise from '../path' becomes from '', breaking the regex engine's ability to capture the path.
Phase 3 (Behavior Analysis): Strip string literals ('...', "...") after imports are extracted, if you need to analyze code behavior without false positives from string contents (e.g., avoiding vi.mock inside strings).
4. Prevention of Code "Mangling"
The "Mangled Source" Trap: You must never strip or modify string literals before extracting paths, names, or imports. Doing so creates a "mangled" source string (e.g., converting from './module' into from ''), which corrupts the target tokens and causes regex pattern matching to return 0 results.
Self-Correction Rule: If a multiline regex returns 0 matches during execution, verify if a prior regex sanitization pass has mangled the input string by stripping quotes, backticks, or delimiters prematurely
Common traps (verified in this repository)
** is NOT recursive in -Path. Select-String -Path "tests\**\*.ts" -Pattern x silently returns
nothing — a false "no results", not an error. Always recurse through Get-ChildItem:

PowerShell

Get-ChildItem tests -Recurse -File -Include *.ts | Select-String -Pattern 'x'
Measured 2026-09-30: the -Path form matched 0 lines where the piped form matched 1738. This
produced a wrong audit conclusion before it was caught.

-like treats ? and * as wildcards — which is rarely what you meant. git status --short | Where-Object { $_ -like '??*' } matches every line, not "the untracked ones": ? means any single
character. Escape it (-like '`?`?*') or compare literally with $_.StartsWith('??'). The same trap
lives in -match (regex) and in Select-String -Path (globs) — and it is how a "0 results" or
"everything matched" reading gets mistaken for a real answer.

A running dev server can transiently lock a root file and kill your write. With vite watching the
project root, an atomic file replace can fail with
ReplaceFileW EIO (Win32 1175): <path>; the same file often reads and writes fine moments later. Before
concluding permission problems, check for a watcher (Get-NetTCPConnection -State Listen for 5173/4173,
then Get-Process -Id <pid>) and simply retry — do not escalate permissions for a transient lock.

Keep output while also reading it. ... 2>&1 | Tee-Object -FilePath tmp\log.txt | Select-Object -Last 40
writes the log and shows the tail. Redirection alone loses the console.

Read $LASTEXITCODE on the very next line. A native command's non-zero exit is easily lost after a
pipeline or another statement.

Windows is case-insensitive. 
command.md
 and COMMAND.md are the same file — never create both.

Do not backtick-escape $ when nesting shells. pwsh -Command "… \$var …" inside PowerShell mangles
the variable into a literal path prefix. Prefer a script file or a single-quoted here-string.

Expand-Archive may print Win32 internal error "Access is denied" from Write-Progress. That is
console-buffer noise; extraction still succeeds. Do not chase it. For large or nested archives use
[System.IO.Compression.ZipFile]::ExtractToDirectory($src, $dst).

Prefer curl.exe for HTTP probes. On 5.1 Invoke-WebRequest can fail against modern endpoints with
"The underlying connection was closed"; curl.exe -s -i gives the raw status and headers.

An interrupted command and a failing command both report [exit code: 1]. If you killed it, treat the
result as a termination rather than a failure, and re-run.

Git Bash is opt-in, and its syntax stops at the closing quote. bash.exe -lc "…" may contain && and
/dev/null; the line around it may not. The usual failure is a > or | on the PowerShell side of a bash
call, silently redirecting the bash process's output somewhere you did not intend.

PowerShell 5.1 fallbacks
Apply these only when the version check at the top reported 5.1. If your harness starts in 5.1 on every
command, read Starting in Windows PowerShell 5.1 first — these fallbacks apply to the caller in that setup,
while anything you bridge into pwsh does not need them.

&& and || are a parse error. Use ; plus an explicit check (if ($LASTEXITCODE -ne 0) { … }), or
run through cmd /c "a && b".
Redirection writes UTF-16LE. "text" > file.json emits a FF FE BOM and NUL bytes. For any file
another program parses — JSON fixtures especially — write it from the tool that owns it (e.g. Node's
writeFileSync(path, text, 'utf8')), or use
[System.IO.File]::WriteAllText($p, $text, [System.Text.UTF8Encoding]::new($false)).
Out-File -Encoding utf8 still adds a BOM (utf8NoBOM does not exist here). A BOM can make a JSON
parser reject an otherwise valid file.
[System.Security.Cryptography.RSA]::Create() returns RSACryptoServiceProvider, which has no
ImportFromPem. For signature or key work use openssl.exe — Git for Windows ships it at
C:\Program Files\Git\usr\bin\openssl.exe.
Invoke-RestMethod / Invoke-WebRequest use the legacy stack — prefer curl.exe (see above).
Git Bash is a safe escape hatch here. For text processing (sed, awk, sorting, JSON emission) run it
through bash.exe -lc "…": it writes UTF-8 without BOM and sidesteps both the redirection trap above and
the legacy HTTP stack. Verify the first bytes before another program parses the file.