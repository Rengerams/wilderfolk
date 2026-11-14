/**
 * Source contracts, not behavioural tests: this node tier cannot dispatch events, so these pin the
 * guard order and keyboard claim in `useKeyboardControls` and the shared overlay hook.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `KEYBOARD_GUARDS_ROOT` overrides the tree these guards read; unset, they read the working tree.
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
 * The shared claim site — "an open overlay owns the keyboard and handles Escape"; overlays delegate
 * to it instead of repeating the two effects.
 */
const CLAIM_HOOK = 'src/hooks/useOverlayKeyboard.ts';

const OVERLAY_DELEGATES = [
  'src/components/BattleReportScreen.tsx',
  'src/components/WarfareStatus.tsx',
  'src/components/GameMenu.tsx',
  'src/components/dashboard/GameDashboard.tsx',
  'src/components/CitizenOverviewScreen.tsx',
  'src/components/TutorialOverlay.tsx',
  'src/components/ShortcutsOverlay.tsx',
  'src/components/SpotlightLoreOverlay.tsx',
  'src/components/BattleReportScreen.tsx',
  'src/components/WarfareStatus.tsx',
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
    // `useKeyboardControls` returns while a claim is held, so the overlay must dismiss itself.
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

  it('battle and terminal fullscreen dialogs use the shared focus owner', () => {
    for (const path of ['src/components/BattleReportScreen.tsx', 'src/components/WarfareStatus.tsx']) {
      const component = source(path);
      expect(component).toContain('useModalFocus<');
      expect(component).toContain('useOverlayKeyboard(');
    }
    const battle = source('src/components/BattleReportScreen.tsx');
    expect(battle).toContain('ref={dialogRef}');
    const warfare = source('src/components/WarfareStatus.tsx');
    expect(warfare).toContain('ref={terminalRef}');
  });

  it('battle commentary transition retains an autofocus target and recovers lost focus', () => {
    const battle = source('src/components/BattleReportScreen.tsx');
    expect(battle).toContain('data-autofocus aria-label="Close battle report"');
    expect(battle).toContain('ref={stableCloseRef}');
    expect(battle).toContain('stableCloseRef.current?.focus()');
    expect(battle).toContain('[allSeen, finalReady, confirmExterminate, dialogRef]');
  });

  it('spotlight claims the keyboard and sends Escape through the same Skip scene action', () => {
    const overlay = source('src/components/SpotlightLoreOverlay.tsx');
    expect(overlay).toContain("useOverlayKeyboard('spotlight-lore', skip)");
    expect(overlay).toContain('const skip = () => {');
    expect(overlay).toContain("callbacks.current.onFinish(scene.id, 'skipped');");
    expect(overlay).toContain('onClick={skip}');
  });

  it('the raid report and warfare dialogs trap focus as well as claiming the keyboard', () => {
    for (const path of ['src/components/BattleReportScreen.tsx', 'src/components/WarfareStatus.tsx']) {
      expect(source(path), `${path} dropped the shared focus trap`).toContain('useModalFocus<HTMLDivElement>(');
    }
  });

  it('the shared confirmation traps focus and starts on Cancel', () => {
    const dialog = source('src/components/ConfirmActionDialog.tsx');
    expect(dialog).toContain('useModalFocus<HTMLDivElement>()');
    expect(dialog).toContain('useOverlayKeyboard(owner, onCancel)');
    expect(dialog).toContain('data-autofocus');
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
    // The hook is mounted above the shell's early returns and `isEditableTarget` is false for
    // buttons, so the gate must precede the building-hotkey lookup.
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

describe('a held key is one gesture', () => {
  it('ignores OS key repeat before pause and build toggles, after held movement keys are recorded', () => {
    // The node tier cannot dispatch keydowns, so this pins the guard order in the keyboard owner.
    const movementCapture = hookSource.indexOf('keysRef.current.add(');
    const repeatGuard = hookSource.indexOf('if (e.repeat) return;');
    const pause = hookSource.indexOf('togglePauseRef.current();');
    const buildRail = hookSource.indexOf('setBuildPanelOpen((open) => !open);');

    expect(repeatGuard, 'the repeat guard is gone').toBeGreaterThan(-1);
    expect(repeatGuard).toBeGreaterThan(movementCapture);
    expect(repeatGuard).toBeLessThan(pause);
    expect(repeatGuard).toBeLessThan(buildRail);
  });
});

describe('a selection strip states its selection instead of only painting it', () => {
  it('A-6: the overview nav marks the current subject (aria-current)', () => {
    // `aria-current`, not `aria-pressed`: the header's subject doors are a navigation set, and the
    // current one must be stated rather than painted.
    expect(source('src/components/GameHeader.tsx')).toContain('aria-current={open}');
    expect(source('src/components/GameHeader.tsx')).toContain('aria-label={`Open ${subject.label.toLowerCase()} window`}');
  });

  it('A-6: the dashboard panel tabs state their pressed state (aria-pressed)', () => {
    // Not a real tab set: the panel below carries no id and there is no roving tabindex, so roles
    // the markup cannot back would be a lie — `aria-pressed` is the honest minimum here.
    expect(source('src/components/dashboard/GameDashboard.tsx')).toContain(
      'aria-pressed={openTab === tab.id}',
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
    // Role, name, tab stop and Enter: without them the map's only navigation control needs a pointer.
    const map = source('src/components/MiniMap.tsx');
    expect(map).toContain('role="button"');
    expect(map).toContain('aria-label="Mini-map');
    expect(map).toContain('tabIndex={0}');
    expect(map).toContain('onKeyDown=');
    expect(map).toContain('navigateToVillage');
  });
});

describe('UX-13/14: a bulk demolition needs explicit confirmation', () => {
  it('does not send the strip demolition command until the player confirms', () => {
    const gestures = source('src/hooks/useCanvasInteractions.ts');
    const armAt = gestures.indexOf('if (buildingIds.length > 0) setPendingStripDemolition(buildingIds);');
    const confirmOwnerAt = gestures.indexOf('const confirmStripDemolition = useCallback(');
    const commandAt = gestures.indexOf("op: 'demolishStripBuildings'");
    expect(armAt).toBeGreaterThan(-1);
    expect(confirmOwnerAt).toBeGreaterThan(armAt);
    expect(commandAt).toBeGreaterThan(confirmOwnerAt);
    // A pointer gesture only arms an action: the actual command lives behind the confirmation callback.
    expect(gestures.slice(armAt, confirmOwnerAt)).not.toContain("op: 'demolishStripBuildings'");
    expect(gestures).toContain('if (!ids?.length) return;');

    const app = source('src/App.tsx');
    expect(app).toContain('{pendingStripDemolition && (');
    expect(app).toContain('owner="strip-demolition"');
    expect(app).toContain('onConfirm={confirmStripDemolition}');
    expect(app).toContain('onCancel={cancelStripDemolition}');
    expect(app).toContain('This cannot be undone.');
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
 * The map canvas's keyboard path: whether the canvas is wired to the cursor handler, whether the
 * cursor state is announced rather than only painted, and how the hook routes its two actions.
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
    // `aria-describedby` states the cursor when the canvas takes focus; `aria-live` repeats it
    // because focus never leaves the canvas while the cursor moves.
    expect(stage).toContain('aria-describedby="map-keyboard-cursor-status"');
    const region = stage.slice(stage.indexOf('id="map-keyboard-cursor-status"'));
    expect(region.slice(0, 200)).toContain('aria-live="polite"');
    expect(region).toContain('{keyboardCursor.announcement}');
  });

  it('paints a visible marker that cannot swallow pointer input or add a second accessible node', () => {
    // The marker is positioned from the render loop (the camera moves) and is decorative: the live
    // region owns the accessible state.
    expect(stage).toContain('keyboardCursor.active &&');
    const marker = stage.slice(stage.indexOf('ref={cursorMarkerRef}'));
    expect(marker.slice(0, 240)).toContain('pointer-events-none');
    expect(marker.slice(0, 240)).toContain('aria-hidden');
  });

  it('reads the app keyboard-ownership rule instead of keeping its own', () => {
    // The claim is the app's single rule, read by `useKeyboardControls` and the overlay hook; the
    // cursor reads it and never takes a claim of its own.
    expect(cursor).toContain("from '../game/keyboardOwnership'");
    expect(cursor).toMatch(/isKeyboardClaimed\s*\(/);
    expect(cursor).not.toContain('claimKeyboard(');
    expect(cursor).not.toContain('releaseKeyboard(');
  });

  it('acts through the pointer path and invents no command of its own', () => {
    // Enter dispatches the same DOM `click` a mouse produces, so placement and selection still run
    // through `useCanvasInteractions` → `applyGameAction` → `WorkerCommand`.
    expect(cursor).toMatch(/dispatchEvent\(new MouseEvent\(type/);
    expect(cursor).not.toMatch(/proto:\s*1/);
    expect(cursor).not.toMatch(/applyGameAction\s*\(/);
    expect(cursor).not.toMatch(/mutateWorld\s*\(/);
  });
});
