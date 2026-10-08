/**
 * Source guards for the interaction findings: the overlay keyboard contract in the two windows that
 * lacked it, and the drag guard on the map click path. Each case names the shipped expression it
 * replaces, so reverting a fix fails here instead of silently restoring the defect
 * (`tests/ui-a11y.contract.test.ts` is the house pattern).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

describe('every window that opens over the map claims the keyboard', () => {
  // `GameWindow` owns the focus trap only; the keyboard half is the caller's, which is why
  // `SubjectWindow` carries it. These two render `GameWindow` directly and had no claim, so the map's
  // hotkeys stayed live behind them and Escape ran the game's own chain instead of closing the window.
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

describe('a camera pan does not throw the selection away', () => {
  const interactions = read('src/hooks/useCanvasInteractions.ts');

  it('records the gesture travel on mouse up, while the origin still exists', () => {
    // The click event arrives after `mouseup`, which clears `clickOriginRef` — so the distance guard in
    // `handleCanvasClick` had nothing left to measure and every pan reached the deselect branch.
    expect(interactions).toContain('const pointerMovedRef = useRef(false);');
    expect(interactions).toMatch(
      /const origin = clickOriginRef\.current;\n\s*pointerMovedRef\.current = origin/,
    );
  });

  it('leaves the click to the click path and clears the verdict', () => {
    expect(interactions).toMatch(
      /if \(pointerMovedRef\.current\) \{\n\s*pointerMovedRef\.current = false;\n\s*return;\n\s*\}/,
    );
    // A fresh gesture starts as a click, so a stale verdict cannot swallow the next real click.
    expect(interactions).toMatch(/pointerMovedRef\.current = false;\n\s*if \(gameplayActive && e\.button === 0\)/);
  });
});
