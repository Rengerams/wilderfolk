# Shell Environment: PowerShell 7 on Windows

You are running in **PowerShell 7 (`pwsh`)** on Windows. This is NOT bash (but maybe it work)
GNU text tools from Git for Windows are on PATH, so a few Linux commands work, but the shell language is PowerShell.

> **Verify this first — do not assume it.**
>
> ```powershell
> $PSVersionTable.PSVersion.ToString()
> ```
>
> If that reports `5.1`, you are *not* in PowerShell 7. Most rules below still apply, but several PowerShell 7
> behaviours do not exist there (`&&`, `||`, default UTF-8 redirection, `ImportFromPem`) and guessing wrong
> produces **silent data corruption** rather than an error. Read **PowerShell 5.1 fallbacks** at the bottom.

## Available GNU tools (real GNU versions, usable as normal)
`grep`, `sed`, `awk`, `head`, `tail`, `wc`.
For sorting use `Sort-Object`; for finding files use `Get-ChildItem -Recurse` (`sort` and `find` resolve to PowerShell/Windows versions).

## These are PowerShell aliases, NOT Linux commands
`ls`, `cat`, `rm`, `cp`, `mv`, `echo` map to PowerShell cmdlets and do NOT accept Linux flags.
* `ls -la` → `Get-ChildItem -Force`
* `rm -rf dir` → `Remove-Item dir -Recurse -Force`
* `mkdir -p dir` → `New-Item -ItemType Directory -Path dir -Force`
* `touch file` → `New-Item -ItemType File -Path file -Force`
* `which cmd` → `Get-Command cmd`

## Shell syntax (PowerShell, not bash)
* Environment variables: `$env:VAR = "value"` to set, `$env:VAR` to read. `export` does not exist.
* Chaining: `;` always continues, `&&` only on success, `||` only on failure.
* `$( ... )` is a subexpression, e.g. `"Files: $((Get-ChildItem).Count)"`.
* Backtick (`` ` ``) is the escape character, not command substitution.
* `'single quotes'` are literal; `"double quotes"` expand variables.
* Discard output with `| Out-Null` or `> $null`, never `/dev/null`.
* Paths with spaces: always quote. To run them, use `& "C:\Path With Spaces\tool.exe"`.
* HTTP: use `Invoke-RestMethod` or `curl.exe`.
*  c          `scherm wissen`
*  ll         `bestanden tonen`
*  np         `kladblok openen`
* home       `naar je gebruikersmap`
* Get-MyIP   `publiek IP-adres`
* grep       `tekst zoeken`

##  AI
* clipcheck  `klembord tonen en controleren`
* clipsave   `klembord opslaan als bestand   (clipsave test.ps1)`
* aicopy     `bestanden naar klembord`        (aicopy main.py)`
* aitree     `mappenstructuur naar klembord`
* aierr      `laatste fout naar klembord`
* aiclip     `uitvoer naar klembord          (ll | aiclip)`
* aienv      `systeeminfo naar klembord`

## Error handling
* Use `$ErrorActionPreference = 'Stop'` in scripts.
* Native programs (git, npm, python, grep) do not throw PowerShell errors. Check `$LASTEXITCODE` after them. Note: `grep` returns exit code 1 when nothing matches, which is not an error.

## Non-interactive
* Never run commands that wait for input. Use `-Confirm:$false` on cmdlets that may prompt, and non-interactive flags for native tools (`npm init -y`, `winget install --accept-package-agreements --accept-source-agreements`).

## Output
* For structured data: `Select-Object` the needed fields, then `ConvertTo-Json -Depth 5`. The default depth of 2 silently truncates.
* Files are written as UTF-8 without BOM by default **in PowerShell 7**. Keep it that way, and never rely on
  the default when another program will parse the file — see **PowerShell 5.1 fallbacks** at the bottom, where
  that default is UTF-16LE instead and a BOM breaks parsers.

## PowerShell Regex & Multiline Rules

When generating PowerShell code that uses Regular Expressions (Regex) or parses source code, you MUST follow these architectural rules to prevent broken matches:

### 1. File Ingestion & Parsing
* **Always use `-Raw`:** Never let `Get-Content` read files as an array of lines. Always use `Get-Content -Path "..." -Raw` to process the file as a single, contiguous multiline string. Otherwise, multiline regex will fail silently.

### 2. Multi-line Regex Modifiers
* **Token Matching `(?s)`:** Use `(?s)` (Singleline/Dotall) at the absolute start of your pattern when the dot (`.`) needs to match across newlines (e.g., matching a block between two markers).
* **Line Anchors `(?m)`:** Use `(?m)` (Multiline) ONLY when `^` and `$` need to match the start and end of *individual lines* within the large string.

### 3. Abstract Syntax Tree (AST) & Token Stripping Order
When writing scripts that analyze source code (like extracting imports, functions, or dependencies), **order of operations is critical**. Do not corrupt the tokens you need to extract:
* **Phase 1 (Sanitization):** Strip block comments (`/* ... */`) and line comments (`// ...`) FIRST.
* **Phase 2 (Import Extraction):** Extract imports/dependencies from this comment-stripped source. **DO NOT strip strings yet**, otherwise `from '../path'` becomes `from ''`, breaking the regex engine's ability to capture the path.
* **Phase 3 (Behavior Analysis):** Strip string literals (`'...'`, `"..."`) *after* imports are extracted, if you need to analyze code behavior without false positives from string contents (e.g., avoiding `vi.mock` inside strings).

### 4. Prevention of Code "Mangling"
* **The "Mangled Source" Trap:** You must never strip or modify string literals before extracting paths, names, or imports. Doing so creates a "mangled" source string (e.g., converting `from './module'` into `from ''`), which corrupts the target tokens and causes regex pattern matching to return 0 results. 
* **Self-Correction Rule:** If a multiline regex returns 0 matches during execution, verify if a prior regex sanitization pass has mangled the input string by stripping quotes, backticks, or delimiters prematurely







## Common traps (verified in this repository)

* **`**` is NOT recursive in `-Path`.** `Select-String -Path "tests\**\*.ts" -Pattern x` silently returns
  **nothing** — a false "no results", not an error. Always recurse through `Get-ChildItem`:

  ```powershell
  Get-ChildItem tests -Recurse -File -Include *.ts | Select-String -Pattern 'x'
  ```

  Measured 2026-09-30: the `-Path` form matched **0** lines where the piped form matched **1738**. This
  produced a wrong audit conclusion before it was caught.

* **`-like` treats `?` and `*` as wildcards — which is rarely what you meant.** `git status --short |
  Where-Object { $_ -like '??*' }` matches **every** line, not "the untracked ones": `?` means any single
  character. Escape it (`` -like '`?`?*' ``) or compare literally with `$_.StartsWith('??')`. The same trap
  lives in `-match` (regex) and in `Select-String -Path` (globs) — and it is how a "0 results" or
  "everything matched" reading gets mistaken for a real answer.

* **A running dev server can transiently lock a root file and kill your write.** With `vite` watching the
  project root, an atomic file replace can fail with
  `ReplaceFileW EIO (Win32 1175): <path>`; the same file often reads and writes fine moments later. Before
  concluding permission problems, check for a watcher (`Get-NetTCPConnection -State Listen` for 5173/4173,
  then `Get-Process -Id <pid>`) and simply retry — do not escalate permissions for a transient lock.

* **Keep output while also reading it.** `... 2>&1 | Tee-Object -FilePath tmp\log.txt | Select-Object -Last 40`
  writes the log *and* shows the tail. Redirection alone loses the console.

* **Read `$LASTEXITCODE` on the very next line.** A native command's non-zero exit is easily lost after a
  pipeline or another statement.

* **Windows is case-insensitive.** `command.md` and `COMMAND.md` are the same file — never create both.

* **Do not backtick-escape `$` when nesting shells.** `pwsh -Command "… \$var …"` inside PowerShell mangles
  the variable into a literal path prefix. Prefer a script file or a single-quoted here-string.

* **`Expand-Archive` may print `Win32 internal error "Access is denied"` from `Write-Progress`.** That is
  console-buffer noise; extraction still succeeds. Do not chase it. For large or nested archives use
  `[System.IO.Compression.ZipFile]::ExtractToDirectory($src, $dst)`.

* **Prefer `curl.exe` for HTTP probes.** On 5.1 `Invoke-WebRequest` can fail against modern endpoints with
  *"The underlying connection was closed"*; `curl.exe -s -i` gives the raw status and headers.

* **An interrupted command and a failing command both report `[exit code: 1]`.** If you killed it, treat the
  result as a termination rather than a failure, and re-run.



## PowerShell 5.1 fallbacks

Apply these only when the version check at the top reported `5.1`.

* **`&&` and `||` are a parse error.** Use `;` plus an explicit check (`if ($LASTEXITCODE -ne 0) { … }`), or
  run through `cmd /c "a && b"`.
* **Redirection writes UTF-16LE.** `"text" > file.json` emits a `FF FE` BOM and NUL bytes. For any file
  another program parses — JSON fixtures especially — write it from the tool that owns it (e.g. Node's
  `writeFileSync(path, text, 'utf8')`), or use
  `[System.IO.File]::WriteAllText($p, $text, [System.Text.UTF8Encoding]::new($false))`.
* **`Out-File -Encoding utf8` still adds a BOM** (`utf8NoBOM` does not exist here). A BOM can make a JSON
  parser reject an otherwise valid file.
* **`[System.Security.Cryptography.RSA]::Create()` returns `RSACryptoServiceProvider`, which has no
  `ImportFromPem`.** For signature or key work use `openssl.exe` — Git for Windows ships it at
  `C:\Program Files\Git\usr\bin\openssl.exe`.
* **`Invoke-RestMethod` / `Invoke-WebRequest` use the legacy stack** — prefer `curl.exe` (see above).