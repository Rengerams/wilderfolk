/**
 * Keyboard ownership and typing guards in `useKeyboardControls`.
 *
 * These are **source contracts, not behavioural tests**. This tier is
 * `environment: 'node'` (`vitest.config.ts`, `include: tests/**\/*.test.ts`) with no DOM,
 * so a `KeyboardEvent` cannot be dispatched, React state cannot be mounted, and the
 * handler's ordering cannot be observed. They follow the same pattern and carry the same
 * caveat as `tests/tradeRoutes.eligibility.test.ts`: they prove the guard is still written
 * the right way round, not that the browser behaves.
 *
 * They guard the three defects in
 * `BUG_REPORTS/2026-09-17-keyboard-ignores-open-overlays.md`: an open overlay did not own
 * the keyboard, the sidebar-tab block sat above the form-control guard (so typing in the
 * Guide search switched sections), and a keyup aimed at a text field left the movement key
 * held so the map drifted.
 *
 * The 2026-09-20 audit added four: A-1 (the Valley overview claimed the keyboard, which makes
 * the game handler's own Escape branch unreachable, and had no Escape handler of its own),
 * A-3 (the first-run tutorial did not claim it), A-4 (the gameplay hotkeys were live on the
 * intro and map-setup screens) and A-6 (four selection strips signalled the active item by
 * colour alone). The claim-implies-Escape test is the general form of A-1 and would have
 * caught it on its own.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `KEYBOARD_GUARDS_ROOT` lets the red-before proof run these same guards against a mirrored
 * pre-fix tree (`tmp/red-before-keyboard`) without touching `src/`. Unset — the normal run —
 * reads the real working tree. Same knob shape as `uiSingleOwner.test.ts`.
 */
function source(relativePath: string): string {
  const root = process.env.KEYBOARD_GUARDS_ROOT ?? process.cwd();
  return readFileSync(resolve(root, relativePath), 'utf8');
}

/** Every `.ts`/`.tsx` file under `src/`, as workspace-relative POSIX paths. */
function sourceFiles(): string[] {
  const root = process.env.KEYBOARD_GUARDS_ROOT ?? process.cwd();
  const found: string[] = [];
  const walk = (relativeDir: string) => {
    for (const entry of readdirSync(resolve(root, relativeDir), { withFileTypes: true })) {
      const relative = `${relativeDir}/${entry.name}`;
      if (entry.isDirectory()) walk(relative);
      else if (relative.endsWith('.ts') || relative.endsWith('.tsx')) found.push(relative);
    }
  };
  walk('src');
  return found.sort();
}

/** `claimKeyboard`'s own owner: it defines the verb, it is not a claim site. */
const CLAIM_OWNER = 'src/game/keyboardOwnership.ts';

/**
 * The one module allowed to *apply* the claim: `useOverlayKeyboard` is the shared implementation of
 * "an open overlay owns the keyboard and handles Escape", so the overlays delegate to it instead of
 * repeating the two effects (2026-09-20 audit, clone 3). It is the claim site, and the overlays are its
 * callers — pinning the delegation rather than the old per-file literals is a strengthening, not a
 * relaxation: the previous form could not tell "the overlay uses the shared contract" from "the overlay
 * uses it *and* keeps a private effect beside it".
 */
const CLAIM_HOOK = 'src/hooks/useOverlayKeyboard.ts';

const OVERLAY_DELEGATES = [
  'src/components/GameMenu.tsx',
  'src/components/dashboard/GameDashboard.tsx',
  'src/components/CitizenOverviewScreen.tsx',
  'src/components/TutorialOverlay.tsx',
  'src/components/ShortcutsOverlay.tsx',
];

const hookSource = source('src/hooks/useKeyboardControls.ts');

describe('an open overlay owns the keyboard', () => {
  it('the game handler yields while a claim is held', () => {
    expect(hookSource).toContain('if (isKeyboardClaimed()) return;');
  });

  it('the shared overlay hook claims, releases and pays the claim with Escape', () => {
    const hook = source(CLAIM_HOOK);
    expect(hook).toContain('claimKeyboard(');
    expect(hook).toContain('releaseKeyboard(');
    // The invariant A-1 broke: `useKeyboardControls` returns while a claim is held, so the game
    // handler's own Escape branch is *unreachable* for as long as the overlay holds the claim — the
    // overlay must dismiss itself, and the hook is where that now has to be true.
    expect(hook).toMatch(/['"]Escape['"]/);
  });

  it('every overlay that takes the keyboard delegates to the shared hook', () => {
    for (const path of OVERLAY_DELEGATES) {
      const overlay = source(path);
      expect(overlay, `${path} no longer uses the shared overlay keyboard contract`).toContain(
        'useOverlayKeyboard(',
      );
      expect(overlay, `${path} claims the keyboard beside the shared hook`).not.toContain('claimKeyboard(');
    }
  });

  it('a claim is paid for with an Escape handler', () => {
    // Scans every source file rather than a list, so a new claim site cannot opt out of the test by not
    // being named here. The hook itself is the only legitimate applier now, and it is checked above.
    const claimSites = sourceFiles().filter(
      (file) => file !== CLAIM_OWNER && file !== CLAIM_HOOK && source(file).includes('claimKeyboard('),
    );

    expect(claimSites, 'the shared hook is the only claim site').toEqual([]);
  });

  it('gameplay hotkeys stop at the shortcuts sheet', () => {
    expect(hookSource).toContain('if (showShortcutsRef.current) return;');
  });
});

describe('gameplay hotkeys only run while gameplay is active', () => {
  it('the gameplayActive gate precedes the building-hotkey table lookup', () => {
    // A-4: the hook is mounted above the shell's early returns, and `isEditableTarget` is false
    // whenever focus is on a button — which is every control on the intro and map-setup screens —
    // so a digit armed a build type before a map existed and the colony started with the rail armed.
    const gate = hookSource.indexOf('if (!gameplayActiveRef.current) return;');
    const buildingHotkeys = hookSource.indexOf('const hotBuild = HOTKEY_BUILDINGS[e.key];');

    expect(gate, 'the gameplayActive gate is gone').toBeGreaterThan(-1);
    expect(buildingHotkeys).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(buildingHotkeys);
  });

  it('saving (Ctrl/Cmd+S) and the shortcuts sheet stay reachable above the gate', () => {
    // Both are meaningful with no map: the only two keys that must survive the gate.
    const gate = hookSource.indexOf('if (!gameplayActiveRef.current) return;');
    const save = hookSource.indexOf("e.key.toLowerCase() === 's'");
    const help = hookSource.indexOf("e.key === '?'");

    expect(save, 'Ctrl/Cmd+S fell below the gate').toBeGreaterThan(-1);
    expect(help, "'?' fell below the gate").toBeGreaterThan(-1);
    expect(save).toBeLessThan(gate);
    expect(help).toBeLessThan(gate);
  });
});

describe('typing into a field keeps every key', () => {
  it('the form-control guard precedes the sidebar-tab block', () => {
    const guard = hookSource.indexOf('if (inFormControl) return;');
    const tabBlock = hookSource.indexOf('resolveSidebarTabFromKey(e)');
    expect(guard).toBeGreaterThan(-1);
    expect(tabBlock).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(tabBlock);
  });

  it('keyup never skips a text-field target', () => {
    const start = hookSource.indexOf('const handleKeyUp');
    const end = hookSource.indexOf("window.addEventListener('keydown'");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const keyUpBody = hookSource.slice(start, end);
    expect(keyUpBody).toContain('keysRef.current.delete');
    expect(keyUpBody).not.toContain('isEditableTarget');
  });

  it('focus loss releases held keys and camera momentum', () => {
    expect(hookSource).toContain("window.addEventListener('blur', releaseHeldKeys)");
    expect(hookSource).toContain("document.addEventListener('visibilitychange', releaseHeldKeys)");
    expect(hookSource).toContain('keysRef.current.clear();');
  });
});

describe('a selection strip states its selection instead of only painting it', () => {
  it('A-6: the overview nav marks the current subject (aria-current)', () => {
    // The contract, on its new owner. A-6 was "four selection strips signalled the active item by
    // colour alone"; the strip this guarded was the Valley overview's nav, whose chips switched
    // sections *inside* a full-screen panel. That overlay is gone (owner: *"each subject should just
    // have its own window not stacking up"* — one window per subject, each with its own header icon),
    // so the selector set is now the header's subject doors and the current one is still stated
    // rather than painted. `aria-current` on a door, not `aria-pressed`: these are a navigation set,
    // which is what the old nav chips used it for.
    expect(source('src/components/GameHeader.tsx')).toContain('aria-current={open}');
    expect(source('src/components/GameHeader.tsx')).toContain('aria-label={`Open ${subject.label.toLowerCase()} window`}');
  });

  it('A-6: the dashboard panel tabs state their pressed state (aria-pressed)', () => {
    // Not a real tab set: the panel below carries no id and there is no roving tabindex, so roles
    // the markup cannot back would be a lie — `aria-pressed` is the honest minimum here.
    expect(source('src/components/dashboard/GameDashboard.tsx')).toContain(
      'aria-pressed={openTab === t}',
    );
  });

  it('A-6: the chronicle filter chips state their pressed state (aria-pressed)', () => {
    expect(source('src/game/EventLogPanel.tsx')).toContain('aria-pressed={filter === opt.id}');
  });

  it('A-6: the map-size choice states its pressed state (aria-pressed)', () => {
    // The preset cards above carry a visible ✓; the sizes carried nothing but colour.
    expect(source('src/game/MapSetupScreen.tsx')).toContain('aria-pressed={selected}');
  });

  it('A-8: the chronicle sub-tab strip states its pressed state (aria-pressed)', () => {
    expect(source('src/components/tabPanels/LogTabPanel.tsx')).toContain(
      'aria-pressed={logSubTab === id}',
    );
  });

  it('A-6: the map canvas is named and reachable by Tab', () => {
    // A-2 asserts the surface is announced and focusable; the actions that could be taken *on* it
    // are guarded one describe below (bug 55 / OPEN-6, the keyboard cursor).
    const stage = source('src/components/GameMapStage.tsx');
    expect(stage).toContain('role="img"');
    expect(stage).toContain('aria-label="Valley map"');
    expect(stage).toContain('tabIndex={0}');
  });

  it('A-2: the mini-map canvas is named, reachable by Tab, and activatable from the keyboard', () => {
    // It was a bare `<canvas onClick>`: no role, no name, no tab stop, so the map's only navigation
    // control was unusable without a pointer (bug 55 / OPEN-6). Role, name, tab stop and Enter are
    // the four halves of that gap.
    const map = source('src/components/MiniMap.tsx');
    expect(map).toContain('role="button"');
    expect(map).toContain('aria-label="Mini-map');
    expect(map).toContain('tabIndex={0}');
    expect(map).toContain('onKeyDown=');
    expect(map).toContain('navigateToVillage');
  });
});

describe('a destructive start asks before it deletes', () => {
  it('OPEN-14: starting a settlement with a save present arms a confirmation', () => {
    // `beginNewGameSession` calls `deleteSave()`, so the first activation must only arm the step —
    // the same shape the demolish confirm uses in `SelectedBuildingPanel`.
    const setup = source('src/game/MapSetupScreen.tsx');
    expect(setup).toContain('if (hasSave && !confirmStartArmed)');
    expect(setup).toContain('Settle anyway');
    expect(setup).toContain('Starting a new settlement deletes your saved colony');
  });

  it('OPEN-14: Enter in the name field cannot commit the destructive start on its own', () => {
    // It used to call `handleStart` directly: one keystroke while typing a name destroyed a saved
    // colony with no warning. It must route through the confirming path instead.
    const setup = source('src/game/MapSetupScreen.tsx');
    expect(setup).toContain("onKeyDown={(e) => e.key === 'Enter' && requestStart()}");
    expect(setup).not.toContain("onKeyDown={(e) => e.key === 'Enter' && handleStart()}");
  });
});

/**
 * The map canvas's keyboard path — bug 55 / OPEN-6, the half A-2 deliberately left open because it
 * "needs a design decision, not a patch".
 *
 * These are the seams the pure cursor tests (`tests/mapKeyboardCursor.test.ts`) cannot reach: whether
 * the canvas is actually wired to the cursor's key handler, whether the cursor's state is announced
 * rather than only painted, and whether the hook routes its two actions through the pointer path and
 * its ownership through the game's own claim instead of growing a second of either. The key table
 * itself is checked against `hotkeys.ts` (imported, not re-quoted) in that same pure tier.
 */
describe('the map canvas has a keyboard path', () => {
  const stage = source('src/components/GameMapStage.tsx');
  const cursor = source('src/components/useMapKeyboardCursor.ts');

  it('binds the cursor handler and advertises the keys on the canvas', () => {
    expect(stage).toContain('useMapKeyboardCursor(');
    expect(stage).toContain('onKeyDown={keyboardCursor.onKeyDown}');
    expect(stage).toContain('aria-keyshortcuts={MAP_CURSOR_KEYSHORTCUTS}');
  });

  it('announces the cursor state instead of only painting it', () => {
    // The requirement the canvas could not meet before: a keyboard user who cannot see the cursor is
    // not served. `aria-describedby` states it when the canvas takes focus; `aria-live` repeats it as
    // the cursor moves, because focus never leaves the canvas while it does.
    expect(stage).toContain('aria-describedby="map-keyboard-cursor-status"');
    const region = stage.slice(stage.indexOf('id="map-keyboard-cursor-status"'));
    expect(region.slice(0, 200)).toContain('aria-live="polite"');
    expect(region).toContain('{keyboardCursor.announcement}');
  });

  it('paints a visible marker that cannot swallow pointer input or add a second accessible node', () => {
    // The canvas ghost only exists while a build type is armed, so the cursor position needs a marker
    // of its own — positioned from the render loop (the camera moves), and decorative: the state is
    // the live region's job, not a second thing for a screen reader to read.
    expect(stage).toContain('keyboardCursor.active &&');
    const marker = stage.slice(stage.indexOf('ref={cursorMarkerRef}'));
    expect(marker.slice(0, 240)).toContain('pointer-events-none');
    expect(marker.slice(0, 240)).toContain('aria-hidden');
  });

  it('reads the app keyboard-ownership rule instead of keeping its own', () => {
    // The claim is the app's single rule (`keyboardOwnership`), read by `useKeyboardControls` and by
    // the shared overlay hook; the cursor must read it and never take a claim of its own. The
    // *behaviour* is pinned in the pure tier (`keyboardClaimed: true` ⇒ every bound key is a no-op),
    // so a change to how the claim is spelled breaks this hook and this guard together, never one
    // silently.
    expect(cursor).toContain("from '../game/keyboardOwnership'");
    expect(cursor).toMatch(/isKeyboardClaimed\s*\(/);
    expect(cursor).not.toContain('claimKeyboard(');
    expect(cursor).not.toContain('releaseKeyboard(');
  });

  it('acts through the pointer path and invents no command of its own', () => {
    // Enter dispatches the same DOM `click` a mouse produces, so placement and selection still run
    // through `useCanvasInteractions` → `applyGameAction` → `WorkerCommand`. A `proto: 1` literal, a
    // direct action call or a world mutation here would be the UI doing the simulation's job. The
    // negatives are call-shaped on purpose: the hook's own doc comment names those routes.
    expect(cursor).toMatch(/dispatchEvent\(new MouseEvent\(type/);
    expect(cursor).not.toMatch(/proto:\s*1/);
    expect(cursor).not.toMatch(/applyGameAction\s*\(/);
    expect(cursor).not.toMatch(/mutateWorld\s*\(/);
  });
});
