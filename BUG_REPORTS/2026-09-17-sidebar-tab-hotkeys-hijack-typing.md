# Sidebar-tab hotkeys hijacked typing in the in-game search fields

- Bug: the sidebar-tab hotkey block sat **above** the form-control guard, so typing `f`, `v`, `n`, `p`, `l` or `m` into the Guide or Population search box blurred the field and switched sidebar section instead of entering the character
- Status: resolved
- Date discovered: 2026-09-16 (UI-logic audit, finding F4)
- Date resolved: 2026-09-17
- Version/build: 0.6.4
- Reporter: UI-logic audit (`docs/private/audits/2026-09-16/ui-logic.md` F4), verified against the tree 2026-09-17
- Area: UI
- Owner module: `src/hooks/useKeyboardControls.ts` (tab keys defined in `src/game/hotkeys.ts`)
- Cadence: presentation (per key event)

## Status history

- 2026-09-16 — open (found by the UI-logic audit pass; never filed as a report)
- 2026-09-17 — resolved (the tab block moved below the form-control guard)

## Observed behavior

`handleKeyDown` computed `inFormControl = isEditableTarget(e.target)` and then ran the tab
block before honouring it:

```ts
if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat && gameplayActiveRef.current && !showShortcutsRef.current) {
  const tab = resolveSidebarTabFromKey(e);
  if (tab) {
    e.preventDefault();
    if (inFormControl) { (document.activeElement as HTMLElement | null)?.blur(); }
    openTab(tab);
    return;
  }
}
…
if (inFormControl) return;   // reached only after the tab block already returned
```

`TAB_HOTKEYS` maps `v/f/n/p/l/m`. Both in-game search boxes are real `<input type="search">`
elements — the Guide's Quick help (`MoreTabPanel.tsx`, placeholder "Type: swords, forge,
raid, barracks…") and the Population search (`PopulationPanel.tsx`, placeholder "Find
citizen — #12 or name…") — so the documented example `forge` stopped at `f` (Frontier),
`village` broke at `v`, and `militia` at `m`. The `blur()` branch shows the hijack was
known, and reasoned about the wrong way round.

## Expected behavior

A key typed into a text field belongs to the field. Hotkeys resume when focus leaves it.

## Reproduction steps

1. In a running game, open More → Guide.
2. Type `forge` into Quick help.
3. **Before the fix:** only `o`, `r`, `g`, `e` appear; the view jumps to the Frontier tab on the first keystroke.
4. **After the fix:** the field receives `forge` and filters the help list.

## Evidence

`tests/keyboardGuards.contract.test.ts` asserts the form-control guard precedes the tab block
in the source. Static trace of the block order and of the two input elements.

## Root cause

Ordering: the early-return guard that protects text fields was placed after one block that
performs an action and returns. The block also blurred the field, which made the hijack
deliberate-looking; with the guard first, the blur branch is unreachable and was deleted
rather than left dead.

## Regression test

Covered by `tests/keyboardGuards.contract.test.ts` (guards the ordering; see the caveat in
the F3 report — this tier has no DOM, so the guard is a source contract, not a key event).

## Invariants checked

- Modifier chords are unaffected: the block still requires no Ctrl/Meta/Alt and no key repeat.
- `Ctrl`/`Cmd`+S still saves from inside a field, because that handler remains above the guard.
- The blur branch's removal cannot change behaviour: it was only reachable when
  `inFormControl` was true, which now returns first.

## Save/migration impact

None.

## Verification result

- `npx vitest run tests/keyboardGuards.contract.test.ts` — passed (6 tests).
- `npx tsc -p tsconfig.app.json --noEmit` — passed (no output).
- `npm run lint` — 0 warnings / 0 errors.
- `npm run test:all` — passed, see the batch summary in `SUMMARY.md`.
- Not verified in a browser (no DOM tier): the claim is the block order plus the two inputs
  being real form controls, which `hotkeys.isEditableTarget` matches by tag name.

## Related commits or files

- `src/hooks/useKeyboardControls.ts` — the reordered block
- `src/game/hotkeys.ts` — `TAB_HOTKEYS` / `resolveSidebarTabFromKey`
- `src/components/tabPanels/MoreTabPanel.tsx`, `src/game/PopulationPanel.tsx` — the fields
- `docs/private/audits/2026-09-16/ui-logic.md` — finding F4

## Fix

The `if (inFormControl) return;` guard moved above the tab block and the now-unreachable
`blur()` call was deleted; the Save shortcut stays above the guard.
