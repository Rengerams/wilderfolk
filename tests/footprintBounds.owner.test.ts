/**
 * A13 — `isFootprintWithinMapBounds` was passed through two modules
 * (`docs/private/audits/2026-09-16/duplication-deadcode.md`, tracked in `LIVE-FINDINGS-STATUS.md`).
 *
 * The true owner is `placementUtils.ts`. `buildingActions.ts` is a declared compatibility façade
 * (`OWNERSHIP_OVERVIEW.md`: "re-export focused action owners"), so its hop is sanctioned — but it
 * reached the symbol *through* `buildingPlacementActions.ts`, which is a focused owner, not a façade,
 * giving one rule two extra advertised import paths.
 *
 * The façade now re-exports the owner directly. Remaining (fenced to another worker): the dead
 * pass-through at `buildingPlacementActions.ts:31` is still there because that file belongs to the
 * `building.x/y` coordinate family, which this change must not touch.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isFootprintWithinMapBounds as facadeBounds } from '../src/game/buildingActions';
import { isFootprintWithinMapBounds as ownerBounds } from '../src/game/placementUtils';

function readSrc(relative: string): string {
  return readFileSync(resolve(process.cwd(), relative), 'utf8');
}

const FACADE = readSrc('src/game/buildingActions.ts');
const FROM_PLACEMENT_ACTIONS =
  /export \{[^}]*\bisFootprintWithinMapBounds\b[^}]*\} from '\.\/buildingPlacementActions'/;
const FROM_OWNER = /export \{[^}]*\bisFootprintWithinMapBounds\b[^}]*\} from '\.\/placementUtils'/;

describe('A13 — the building façade takes the bounds rule from its owner', () => {
  it('no longer routes the symbol through buildingPlacementActions', () => {
    expect(
      FACADE,
      'the building façade still hops through buildingPlacementActions for the bounds rule',
    ).not.toMatch(FROM_PLACEMENT_ACTIONS);
  });

  it('re-exports the owner directly', () => {
    expect(FACADE, 'the building façade no longer names placementUtils as the owner').toMatch(FROM_OWNER);
  });

  it('hands callers the owner function, whose rule still discriminates', () => {
    // Not a copy: identity with the owner, so a re-implementation in the façade would fail here.
    expect(facadeBounds).toBe(ownerBounds);
    // 10-wide footprint flush with the inset edge is out; one 6 wu inside is in.
    expect(ownerBounds(10, 10, 5, 5, 100, 100)).toBe(false);
    expect(ownerBounds(10, 10, 11, 11, 100, 100)).toBe(true);
  });
});
