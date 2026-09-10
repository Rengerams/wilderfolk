# Git Survival Guide (plain English)

You don't need to *understand* git. You need to know the ~10 commands that keep
your work safe, and the ~3 commands that can destroy it. This is that list.

---

## The golden rule

**Anything you have "committed" is basically impossible to lose.**
**Anything you haven't committed can be wiped by one command.**

So: commit often. If in doubt, commit first, fix later.

---

## Everyday commands (safe — use freely)

| When you want to… | Run | What it does |
|---|---|---|
| See what's changed / unsaved | `git status` | Shows files that are new / modified / deleted. **Run this before anything scary.** |
| Save your work as a checkpoint | `git add -A` then `git commit -m "message"` | `add` = "stage" (put files in the box), `commit` = "save the box forever". |
| Save *everything* uncommitted as a safe copy | `git stash push -m "backup"` | Sweeps unsaved changes into a safe drawer. Get them back with `git stash pop`. |
| Undo changes to ONE file only | `git restore src/game/example.ts` | Reverts just that file. Never touches anything else. |
| Look at your history | `git log --oneline` | Shows your saved checkpoints (one line each). |

## The three "no warning" commands — treat like a gun

These **permanently delete uncommitted work**. Git gives NO warning. Never run
them without a backup.

| Command | What it really does |
|---|---|
| `git checkout .` | Deletes ALL unsaved changes in every file. Gone. |
| `git reset --hard` | Throws away commits + unsaved work back to a point. Gone. |
| `git clean -fd` | Deletes every untracked file/folder (files git doesn't know about). Gone. |

**If another AI / a guide / a forum says "run git checkout ." or "git reset
--hard", stop.** Ask it to use `git stash` or a targeted `git restore <file>`
instead. You now know the exact words that nuked your work before.

---

## If you already deleted something by accident

Git keeps a hidden log of almost everything for ~30 days. Try:

```powershell
git reflog
```

You'll see a list like `6cfe296 HEAD@{0}: commit: ...`. To jump back to an entry:

```powershell
git reset --hard HEAD@{2}
```

That's how "I deleted everything" becomes "oh, it's still there." This is also
why your 5-minute SSD backups are a great second net — git reflog + SSD =
almost nothing is ever truly lost.

---

## Wilderfolk-specific reminders

- `tests/` is **local-only** (gitignored). Test files are never in git — they
  live only on your machine. Back them up with your SSD job.
- `TERAFORGE.md`, `BUG_REPORTS/`, `playtest/` are local/ignored too.
- Your real work is committed on `main` (not pushed unless you say so).

---

## Your safety aliases (installed in this repo)

If you type these, git asks you to confirm before destroying anything:

- `git nuke` → shows what's uncommitted + **asks for YES** before
  `reset --hard` + `clean -fd`.
- `git snap` → `stash push` with a timestamped message (safe copy).

Install with:
```powershell
git config --local --get alias.nuke > $null 2>&1; if ($?) { "already set" } else {
  git config --local alias.snap 'stash push -m "snapshot $(Get-Date -Format s)"'
}
```
(`alias.snap` above is a shell alias; if it doesn't behave, just use the
commands in the table — they're the safe ones anyway.)
