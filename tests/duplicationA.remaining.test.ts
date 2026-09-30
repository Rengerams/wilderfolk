/**
 * Duplication family, last open rows — **A12**, **A14** and the **A17–A22** intra-file clone triage
 * (`docs/private/audits/2026-09-16/duplication-deadcode.md`; triage verdicts in
 * `_clone-triage-internal.md`; status in `LIVE-FINDINGS-STATUS.md`).
 *
 * Every source guard names the pre-fix expression, so reverting a fix fails the case instead of
 * silently re-introducing a second owner (house pattern: `tests/tradeRouteRewards.copy.test.ts`).
 * Behavioural cases pin the extracted owners against the inline code they replaced — a refactor may
 * not move a value.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { EntitySpatialGrid, gridCellAxis } from '../src/game/spatialGrid';
import { ScentGrid } from '../src/game/scentGrid';
import {
  faceVelocity,
  setVelocityToward,
  steerEntityToward,
} from '../src/game/simulation/movementSteering';
import { createSeededRng, hashSalt, mulberry32Advance, mulberry32Draw } from '../src/game/simRng';
import { human } from '../src/test/factories';

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

/** Every `.ts`/`.tsx` under `src/`, as posix-relative paths — the tree-walk the source guards scan. */
function srcFiles(dir = resolve(process.cwd(), 'src')): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...srcFiles(full));
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      found.push(resolve(full).slice(resolve(process.cwd()).length + 1).replaceAll('\\', '/'));
    }
  }
  return found;
}

describe('A12 — one owner for world→cell coordinate clamping', () => {
  it('keeps both grids on the same cell for every coordinate', () => {
    const entityGrid = new EntitySpatialGrid(800, 600, 80);
    const scentGrid = new ScentGrid(800, 600, 80);
    const probes: Array<[number, number]> = [
      [0, 0],
      [1, 79],
      [79, 1],
      [80, 80],
      [640.5, 320.25],
      [799, 599],
      [800, 600],
      [-1, -1],
      [-40, 700],
    ];
    for (const [x, y] of probes) {
      const scent = scentGrid.cellCoords(x, y);
      expect(entityGrid.cellCoords(x, y), `entity grid at (${x}, ${y})`).toEqual(scent);
      expect(scent, `both grids at (${x}, ${y})`).toEqual({
        col: gridCellAxis(x, 80, 10),
        row: gridCellAxis(y, 80, 8),
      });
    }
  });

  it('negotiates the non-finite case explicitly rather than by accident', () => {
    const entityGrid = new EntitySpatialGrid(800, 600, 80);
    const scentGrid = new ScentGrid(800, 600, 80);
    // The entity grid rejects non-finite input; the scent grid has no guard and its callers only
    // deposit finite coordinates, so the shared clamp propagates NaN. Pinned, not hidden.
    expect(entityGrid.cellCoords(Number.NaN, 10)).toBeNull();
    expect(Number.isNaN(scentGrid.cellCoords(Number.NaN, 10).col)).toBe(true);
  });

  it('keeps the clamp written once under src', () => {
    const offenders = srcFiles().filter((file) =>
      /Math\.min\(\w+(\.\w+)? - 1, Math\.max\(0, Math\.floor\(/.test(read(file)),
    );
    expect(offenders).toEqual(['src/game/spatialGrid.ts']);
  });
});

describe('A14 — one owner for "normalise a delta, set velocity, face it"', () => {
  it('sets exactly the velocity the inline expression did', () => {
    const cases: Array<{ tx: number; ty: number; speed: number; factor?: number }> = [
      { tx: 260, ty: 90, speed: 1.4, factor: 0.55 },
      { tx: 40, ty: 210, speed: 0.8, factor: 0.18 },
      { tx: -30, ty: 12, speed: 2.2, factor: 0.42 },
      { tx: 100, ty: 50, speed: 1.1, factor: 0.5 },
      { tx: 100, ty: 50, speed: 1.1 },
      { tx: 380, ty: 320, speed: 0.44, factor: 0.72 },
    ];
    for (const { tx, ty, speed, factor } of cases) {
      const entity = human(1, { x: 100, y: 50 });
      const dx = tx - entity.x;
      const dy = ty - entity.y;
      const distance = Math.hypot(dx, dy) || 1;
      const approach = factor ?? 1;
      const expectedVx = (dx / distance) * speed * approach;
      const expectedVy = (dy / distance) * speed * approach;

      if (factor === undefined) setVelocityToward(entity, tx, ty, speed);
      else steerEntityToward(entity, tx, ty, speed, factor);

      const label = `(${tx}, ${ty}) speed ${speed} factor ${approach}`;
      expect(entity.vx, `vx at ${label}`).toBe(expectedVx);
      expect(entity.vy, `vy at ${label}`).toBe(expectedVy);
      if (factor !== undefined) {
        expect(entity.spriteAngle, `spriteAngle at ${label}`).toBe(
          Math.atan2(entity.vy, entity.vx),
        );
      }
    }
  });

  it('faces the entity along its velocity, including a blended one', () => {
    const entity = human(1, { vx: -3.5, vy: 1.25 });
    faceVelocity(entity);
    expect(entity.spriteAngle).toBe(Math.atan2(1.25, -3.5));
  });

  it('faces velocity in exactly one place under src', () => {
    const offenders = srcFiles().filter((file) =>
      /spriteAngle\s*=\s*Math\.atan2\(\s*\w+\.vy,\s*\w+\.vx\s*\)/.test(read(file)),
    );
    expect(offenders).toEqual(['src/game/simulation/movementSteering.ts']);
  });

  it('routes every swept behaviour through the owner', () => {
    const swept = [
      'src/game/simulation/humanMovement.ts',
      'src/game/humanHospitalBehavior.ts',
      'src/game/humanLeisureBehavior.ts',
      'src/game/blueberryForaging.ts',
      'src/game/humanHuntingBehavior.ts',
      'src/game/hotelStay.ts',
      'src/game/pathfinding.ts',
      'src/game/tickLayerSystems.ts',
      'src/game/factionWander.ts',
      'src/game/humanTick.ts',
    ];
    for (const file of swept) {
      expect(read(file), `${file} no longer names the movement owner`).toMatch(
        /steerEntityToward\(|setVelocityToward\(|faceVelocity\(/,
      );
    }
  });
});

describe('A17 — the manual-staffing default is read from its owner', () => {
  it('keeps the building panel on workforce.isManualStaffingBuilding', () => {
    const panel = read('src/components/SelectedBuildingPanel.tsx');
    expect(panel, 'the manual-staffing default is inlined in the panel again').not.toMatch(
      /staffingMode \?\?/,
    );
    expect(panel).toContain('isManualStaffingBuilding(building)');
    expect(panel).toContain('effectiveStaffingMode === mode');
  });
});

describe('A18 — the builder-eligibility rule is one predicate', () => {
  it('keeps both the mutating assigner and the query on isEligibleBuilderForBuilding', () => {
    const source = read('src/game/buildingStaffingActions.ts');
    expect(
      source.match(/isEligibleBuilderForBuilding\(/g) ?? [],
      'the builder predicate is gone or no longer shared',
    ).toHaveLength(3);
    expect(
      source.match(/isOnConstructionCrew\(state, entity\.id/g) ?? [],
      'the builder chain is inlined again',
    ).toHaveLength(2);
  });
});

describe('A19 — the raid deadline is read through its owner on both paths', () => {
  it('keeps the outgoing path off the raw expiresAtTick field', () => {
    const source = read('src/game/frontierCombat.ts');
    const incomingStart = source.indexOf('export function tickPendingRaidEvents');
    const outgoingStart = source.indexOf('export function tickPendingOutgoingRaidEvents');
    expect(incomingStart, 'fixture premise: the incoming tick exists').toBeGreaterThan(-1);
    expect(outgoingStart, 'fixture premise: the outgoing tick exists').toBeGreaterThan(incomingStart);
    const incoming = source.slice(incomingStart, outgoingStart);
    const outgoing = source.slice(outgoingStart);
    expect(incoming).toContain('getRaidExpiresAtTick(evt)');
    expect(outgoing, 'the outgoing path reads the raw field again').not.toMatch(
      /state\.tick < evt\.expiresAtTick/,
    );
    expect(outgoing).toContain('getRaidExpiresAtTick(evt)');
  });
});

describe('A20 — closed by other work (evidence, no fix here)', () => {
  it('has no duplicated catalog upsert left to de-duplicate', () => {
    const source = read('src/game/entityCatalog.ts');
    // `EntityCatalog.applyTickDelta` (the two `catalogEntities` / `newEntities` loops) was deleted by
    // the worker-boundary pass (`simBuffers/simDelta.ts:233`); `rebuild` is the only upsert left.
    expect(source, 'applyTickDelta came back').not.toContain('applyTickDelta');
    expect(source.match(/this\.byId\.set\(/g) ?? []).toHaveLength(1);
  });
});

describe('A21 — renffrStar builds on the simRng Mulberry32 step', () => {
  it('still draws the exact values the inline generator produced', () => {
    const seed = 20240917;
    const owner = 'a21-probe';
    // The pre-fix stream body, verbatim: seed expression + pre-mix (unchanged) + the inline step.
    let s = (((seed >>> 0) ^ hashSalt(owner)) + 0x6d2b79f5) >>> 0;
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    s = (s ^ t) >>> 0;
    const expected: number[] = [];
    for (let i = 0; i < 5; i++) {
      s = (s + 0x6d2b79f5) >>> 0;
      let r = s;
      r = Math.imul(r ^ (r >>> 15), r | 1);
      r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
      expected.push(((r ^ (r >>> 14)) >>> 0) / 4294967296);
    }

    const stream = createSeededRng(seed, owner);
    for (const [index, value] of expected.entries()) {
      expect(stream(), `draw ${index} moved`).toBe(value);
    }
  });

  it('exposes the step to closure-free callers without changing it', () => {
    let s = 12345;
    const fromOwner = mulberry32Draw(mulberry32Advance(s));
    // Pre-fix inline step, verbatim.
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const inline = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    expect(fromOwner).toBe(inline);
  });

  it('keeps renffrStar off a private generator', () => {
    const star = read('src/game/renffrStar.ts');
    expect(star, 'the Mulberry32 step is inlined in renffrStar again').not.toMatch(
      /Math\.imul|0x6d2b79f5/,
    );
    expect(star).toContain('mulberry32Advance(');
    expect(star).toContain('mulberry32Draw(');
    const rng = read('src/game/simRng.ts');
    expect(rng).toContain('export function mulberry32Advance(');
    expect(rng).toContain('export function mulberry32Draw(');
  });
});

describe('A22 — the gestation jitter formula is rolled once', () => {
  it('keeps the three conception paths on rollPregnancyDueProgress', () => {
    const source = read('src/game/simulation/humanRelationships.ts');
    expect(
      source.match(/`pregnancy-due:\$\{entity\.id\}:\$\{/g) ?? [],
      'the keyed draw is copied again',
    ).toHaveLength(1);
    expect(
      source.match(/rollPregnancyDueProgress\(/g) ?? [],
      'the jitter helper is gone',
    ).toHaveLength(4);
    expect(
      source.match(/Math\.round\(PREGNANCY_TICKS \* \(0\.85 \+/g) ?? [],
      'the jitter formula is restated outside the helper',
    ).toHaveLength(1);
  });
});
