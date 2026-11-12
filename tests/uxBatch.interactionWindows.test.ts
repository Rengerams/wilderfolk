/**
 * Source guards for the interaction fixes: the overlay keyboard contract on the map windows and
 * the drag guard on the click path; each pins the shipped expression.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

describe('every window that opens over the map claims the keyboard', () => {
  // `GameWindow` owns only the focus trap, so each caller must claim the keyboard; these two render
  // it directly and would otherwise leave the map's hotkeys and Escape chain live behind them.
  const claimers = [
    { file: 'src/components/WorkHoursWindow.tsx', owner: 'work-hours-window' },
    { file: 'src/components/FamilyTreeWindow.tsx', owner: 'family-tree-window' },
  ];

  for (const { file, owner } of claimers) {
    it(`${file} claims and closes on Escape`, () => {
      const source = read(file);
      expect(source).toContain("from '../hooks/useOverlayKeyboard'");
      expect(source).toContain(`useOverlayKeyboard('${owner}', onClose)`);
    });
  }

  it('is not vacuous — the hook really is what claims the keyboard', () => {
    const hook = read('src/hooks/useOverlayKeyboard.ts');
    expect(hook).toContain('claimKeyboard(owner)');
    expect("useOverlayKeyboard('family-tree-window', onClose)").not.toContain('claimKeyboard');
  });
});

describe('bulk strip demolition is armed', () => {
  const interactions = read('src/hooks/useCanvasInteractions.ts');

  it('queues the collected ids instead of applying the command on mouse up', () => {
    expect(interactions).toContain('setPendingStripDemolition(buildingIds)');
    expect(interactions).toContain('confirmStripDemolition');
  });
});

describe('windows opened from a dialog stay above it', () => {
  it('opens the hours editor as a window modal when the citizen overview launches it', () => {
    expect(read('src/components/WorkHoursWindow.tsx')).toContain('onClose={onClose} centered');
  });

  it('keeps the shortcuts sheet above the dialog layer', () => {
    expect(read('src/components/ShortcutsOverlay.tsx')).toContain('z-[60]');
  });
});

describe('the family-tree generation selector matches the owner bound', () => {
  const treeWindow = read('src/components/FamilyTreeWindow.tsx');

  it('offers only generations the walk can draw', () => {
    expect(treeWindow).toContain('Math.max(1, ...tree.rows.map((row) => Math.abs(row.delta)))');
    expect(treeWindow).not.toContain('[2, 3, 4, 5, 6]');
  });

  it('counts the people in the rows it actually draws', () => {
    expect(treeWindow).toContain('visibleRows.reduce');
    expect(treeWindow).not.toContain('${tree.memberCount} people drawn');
  });
});

describe('a camera pan does not throw the selection away', () => {
  const interactions = read('src/hooks/useCanvasInteractions.ts');

  it('records the gesture travel on mouse up, while the origin still exists', () => {
    // The click event arrives after `mouseup`, which clears `clickOriginRef` — so the distance guard in
    // `handleCanvasClick` had nothing left to measure and every pan reached the deselect branch.
    expect(interactions).toContain('const pointerMovedRef = useRef(false);');
    expect(interactions).toMatch(
      /const origin = clickOriginRef\.current;\n\s*if \(origin && e\) \{\n\s*const dx = e\.clientX - origin\.x;\n\s*const dy = e\.clientY - origin\.y;\n\s*pointerMovedRef\.current = dx \* dx \+ dy \* dy > 16;/,
    );
  });

  it('leaves the click to the click path and clears the verdict', () => {
    expect(interactions).toMatch(
      /if \(pointerMovedRef\.current\) \{\n\s*pointerMovedRef\.current = false;\n\s*return;\n\s*\}/,
    );
    // A fresh gesture starts as a click, so neither a stale pan verdict nor a pending strip click
    // suppression (whose click was lost to a release outside the canvas) can swallow the next click.
    expect(interactions).toMatch(
      /pointerMovedRef\.current = false;\n\s*stripPlacedOnMouseUpRef\.current = false;\n\s*if \(gameplayActive && e\.button === 0\)/,
    );
  });
});

describe('a catalogue tile without a sprite shows the building itself', () => {
  const catalogue = read('src/components/BuildCatalogPanel.tsx');

  it('guards the image on the optional sprite path', () => {
    // `BuildingConfig.sprite` is optional for procedural decor, and `<img src>` with an absent path
    // asks the server for the page itself. The image must sit behind the guard, not beside it.
    expect(catalogue).toContain('(config.sprite || type === BuildingType.GroundReinforcement) ? (');
    expect(catalogue).toContain("'/sprites/ground_soil.png' : config.sprite");
    expect(catalogue).toContain(') : (');
    expect(catalogue).toContain('{config.emoji}');
  });
});
