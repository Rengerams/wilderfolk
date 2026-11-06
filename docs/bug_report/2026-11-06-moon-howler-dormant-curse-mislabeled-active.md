# Moon Howler status labels confuse a dormant curse with active form

- Bug: UI calls a dormant Moon Howler curse 'active', miscounts transformed residents in one dashboard view, and shows outdated 20:00 nightfall text.
- Status: investigating
- Severity: medium
- Date discovered: 2026-11-06
- Version/build: main `6e9dd6bfcd525cb1df3d8960a636069f5aa240c7` (original); PR #126 documentation branch (correction)
- Reporter: static source audit
- Area: Population UI / village dashboard
- Owner module: `src/game/dashboardData.ts` and `src/game/PopulationPanel.tsx` (read-only projections); `src/game/moonHowler.ts` is the authoritative predicate owner
- Related PR: #126

## Status history
- 2026-11-06 — investigating: mislabelled persisted curse and outdated hours confirmed; corrected labels/counts on PR #126, runtime not verified.

## Observed behavior
The dashboard shows `Moon Howler curse active` whenever an alive *Human* has `moonHowlerCursed`, although this property remains true when the moon form has reverted; the dashboard also ignores transformed Werewolf-type settlers for that tally. The Population panel uses `Moon Howler curses active` for the curse count and says the night starts at 20:00, despite `MOON_HOWLER_NIGHT_START = 22`.

## Expected behavior
Display **dormant curse** when a living settler remains cursed but is currently a Human. Display **transformed/active** only for a living cursed Werewolf. State that the actual transformation window is 22:00–06:00 and that a successful cure removes the curse; a death does not count as a living curse.

## Reproduction steps
1. Compare `isActiveMoonHowler` with `countActiveMoonHowlerCurses` in `src/game/moonHowler.ts`.
2. Inspect the dashboard and Population banner source using `moonHowlerCursed` to create the 'active' label.
3. Inspect the Population panel's hardcoded 20:00–06:00 hours.
4. No UI render or browser execution was performed.

## Evidence
`isActiveMoonHowler` requires `entity.type === EntityType.Werewolf` plus the curse. `countActiveMoonHowlerCurses` counts living cursed entities regardless of temporary form. Existing dashboard count excluded Werewolf form, while Population's informational banner called the curse count active.

## Root cause
UI conflated two different authoritative facts: persistent curse vs current transformed form; UI hours were stale.

## Fix / proposed fix
PR #126 uses `countActiveMoonHowlerCurses` for living curses and `isActiveMoonHowler` for transformed forms in both projections. It explicitly distinguishes dormant and transformed labels and corrects the night hours. No new simulation state or duplicate predicates.

## Save/migration impact
None. Read-only UI change.

## Verification result
- Source-level evidence and change inspection — completed.
- Rendering, tests, typecheck, lint, build and CI — NOT RUN by owner request.
