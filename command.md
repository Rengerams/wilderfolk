# Shell Environment: PowerShell 7 on Windows

You are running in **PowerShell 7 (`pwsh`)** on Windows. This is NOT bash.
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

## Common traps (verified in this repository)

* **`**` is NOT recursive in `-Path`.** `Select-String -Path "tests\**\*.ts" -Pattern x` silently returns
  **nothing** — a false "no results", not an error. Always recurse through `Get-ChildItem`:

  ```powershell
  Get-ChildItem tests -Recurse -File -Include *.ts | Select-String -Pattern 'x'
  ```

  Measured 2026-09-30: the `-Path` form matched **0** lines where the piped form matched **1738**. This
  produced a wrong audit conclusion before it was caught.

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