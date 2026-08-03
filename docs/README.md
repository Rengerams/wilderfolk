# Wilderfolk — Docs home

**One place for all documentation.** Everything lives under `docs/` from now on.

| Area | Path | Tracked? |
|------|------|----------|
| **Architecture** (how the game is wired) | `docs/ARCHITECTURE.md` | ✅ public |
| **Plans** (implementation + agent handoff) | `docs/plans/` | ✅ public |
| **Design specs / research** (roadmap designs, landscape looks) | `docs/private/` · `docs/superpowers/specs/` | ❌ gitignored (local) |
| **Archived milestones** (0.5.0 roadmap, precision notes, v0.5.1 design) | `docs/archive/` | ✅ public |
| **Marketing** (0.5.0 launch copy) | `docs/MARKETING_v0.5.0.md` | ✅ public |
| **Local dev notes** (bug tracker, open problems, private changelog, eng reference) | `docs/private/` | ❌ gitignored |

**Repo-root files stay at the root by convention** (GitHub shows them automatically): `README.md` (pitch/install) · `CHANGELOG.md` (release notes) · `ROADMAP.md` (shipped features) · `AGENTS.md` (agent guide). Everything else goes in `docs/`.

**Key pointers**
- Bug tracker with `<batch>-<item>` IDs (e.g. `EK-G4`): `docs/private/BUGS_TRACKER.md`
- Open problems / gaps: `docs/private/OPEN_PROBLEMS.md`
- Dev engine reference: `docs/private/TECHNICAL.md`
- Private changelog: `docs/private/CHANGELOG_PRIVATE.md`
- Handoff for a fresh agent: `docs/plans/2026-08-02-continuation-plan.md`

**Rules**
- New docs → put them in `docs/` (plans → `docs/plans/`, design → `docs/private/` or `docs/superpowers/specs/`, done milestones → `docs/archive/`).
- Keep private content under `docs/private/` — it is gitignored and never committed.
- Update this index when the layout changes.
