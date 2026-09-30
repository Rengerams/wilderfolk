/**
 * A4 — the world→screen transform was duplicated inside the renderer
 * (`docs/private/audits/2026-09-16/duplication-deadcode.md`, tracked in `LIVE-FINDINGS-STATUS.md`).
 *
 * The owner is `viewState.worldToScreen` (already imported into `grid.ts` as `w2s`). Two private
 * copies restated the formula — `renderer/grid.ts:53-59` and `renderer/scent.ts:5-11` — and the grid
 * used *both* transforms in one file, so a change to the camera transform (a screen-shake term, the
 * device-pixel-ratio term, the zoom guard) would have moved the ghost but not the grid lines.
 *
 * Both are now projections of the owner. `grid.ts` keeps the two axis accessors because the D27 wiring
 * guard in `tests/visualsAudit.renderWiring.test.ts` pins the call site by name
 * (`worldToScreenX(cx, cam, cw)`); their bodies contain no formula. `scent.ts` calls the owner directly.
 *
 * The drawn geometry is unchanged for every reachable zoom (`clampCameraZoom` floors at 0.5). The only
 * behavioural difference is the owner's non-positive-zoom repair, which the copies did not honour and
 * which no play path can reach — the second test below pins that the call sites now do.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CAMERA_ZOOM_DEFAULT, worldToScreen } from '../src/game/viewState';
import { strokeGridLines } from '../src/game/renderer/grid';
import type { Camera } from '../src/game/gameTypes';

function readSrc(relative: string): string {
  return readFileSync(resolve(process.cwd(), relative), 'utf8');
}

// ---- the duplicated formula the audit quoted, per axis ----
const DUPLICATE_X = /\(\s*\w+\s*-\s*cam\.x\s*\)\s*\*\s*cam\.zoom\s*\+\s*cw\s*\/\s*2/;
const DUPLICATE_Y = /\(\s*\w+\s*-\s*cam\.y\s*\)\s*\*\s*cam\.zoom\s*\+\s*ch\s*\/\s*2/;

function camera(x: number, y: number, zoom: number): Camera {
  return { x, y, zoom, targetX: x, targetY: y, targetZoom: zoom };
}

const CW = 800;
const CH = 600;

/** Drive the real grid-line renderer with a recording context and return every `moveTo`. */
function gridLineMarks(cam: Camera): Array<{ x: number; y: number }> {
  const marks: Array<{ x: number; y: number }> = [];
  const ctx = {
    strokeStyle: '',
    lineWidth: 0,
    beginPath() {},
    stroke() {},
    moveTo(x: number, y: number) {
      marks.push({ x, y });
    },
    lineTo() {},
  } as unknown as CanvasRenderingContext2D;
  // Finite viewport so only the transform under test decides the pixels.
  const vp = { sx0: 0, ex: 60, sy0: 0, ey: 60, mx0: 0, my0: 0, majorEx: 60, majorEy: 60 };
  strokeGridLines(ctx, vp, cam, CW, CH, 20, false, '#fff', '#000', 1);
  return marks;
}

describe('A4 — the renderer draws through the single world→screen owner', () => {
  it('maps every grid line to the owner’s screen point, pixels unmoved', () => {
    for (const zoom of [0.5, 1.45, 8]) {
      const cam = camera(120, -40, zoom);
      const marks = gridLineMarks(cam);
      // Vertical lines start at y = 0 (moveTo(px, 0)); horizontal lines at x = 0 (moveTo(0, py)).
      const vertical = marks.filter((m) => m.y === 0);
      const horizontal = marks.filter((m) => m.x === 0);
      expect(vertical.length, `no vertical grid lines at zoom ${zoom}`).toBe(8);
      expect(horizontal.length, `no horizontal grid lines at zoom ${zoom}`).toBe(8);

      for (let i = 0; i < 4; i++) {
        const world = i * 20;
        // The hand-written expression the copies used, and the owner's own answer: identical.
        expect(vertical[i].x).toBe((world - cam.x) * zoom + CW / 2 + 0.5);
        expect(vertical[i].x).toBe(worldToScreen(world, cam.y, cam, CW, CH)[0] + 0.5);
        expect(horizontal[i].y).toBe((world - cam.y) * zoom + CH / 2 + 0.5);
        expect(horizontal[i].y).toBe(worldToScreen(cam.x, world, cam, CW, CH)[1] + 0.5);
      }
    }
  });

  it('honours the owner’s zoom repair instead of multiplying by a bare camera zoom', () => {
    // `clampCameraZoom` never stores this, so it is unreachable in play — but when it is handed in,
    // the owner substitutes CAMERA_ZOOM_DEFAULT and the call sites must follow the owner.
    const cam = camera(200, 100, 0);
    const first = gridLineMarks(cam).find((m) => m.y === 0)!;
    expect(first.x).toBe((0 - cam.x) * CAMERA_ZOOM_DEFAULT + CW / 2 + 0.5);
    expect(first.x).toBe(worldToScreen(0, cam.y, cam, CW, CH)[0] + 0.5);
  });

  it('leaves no hand-written transform in grid.ts or scent.ts', () => {
    const grid = readSrc('src/game/renderer/grid.ts');
    const scent = readSrc('src/game/renderer/scent.ts');
    expect(grid, 'grid.ts still restates the world→screen x formula').not.toMatch(DUPLICATE_X);
    expect(grid, 'grid.ts still restates the world→screen y formula').not.toMatch(DUPLICATE_Y);
    expect(scent, 'scent.ts still restates the world→screen x formula').not.toMatch(DUPLICATE_X);
    expect(scent, 'scent.ts still restates the world→screen y formula').not.toMatch(DUPLICATE_Y);
    expect(scent).toContain('worldToScreen');

    // Guards must not be vacuous: the pattern is fed the exact pre-fix source the audit quoted.
    expect('  return (wx - cam.x) * cam.zoom + cw / 2;').toMatch(DUPLICATE_X);
    expect('  return (wy - cam.y) * cam.zoom + ch / 2;').toMatch(DUPLICATE_Y);
  });
});
