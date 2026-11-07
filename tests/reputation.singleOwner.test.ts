/**
 * Village reputation has one writer: `simHelpers.addReputation` clamps both ends, and no site assigns
 * the field except the two transports that carry it across the sim boundary.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { WorldState } from '../src/game/gameTypes';
import { initGame } from '../src/game/worldGen';
import { TICKS_PER_DAY } from '../src/game/dayCycle';
import { tickChildrenShelter } from '../src/game/storyEvents';
import { deliverVisitorQuest } from '../src/game/visitorQuest';

const FIXTURE_SEED = 20_260_917;
/** `simHelpers.addReputation`'s documented band. */
const REPUTATION_MAX = 100;
/** A reputation already over the ceiling, which the owner's write must clamp back into the band. */
const DRIFTED_REPUTATION = REPUTATION_MAX + 20;
/** Reference floor-only policy: clamp at 0, no ceiling. */
const floorOnly = (reputation: number, amount: number): number => Math.max(0, reputation + amount);
/** Reference ceiling-only policy: clamp at 100, no floor. */
const ceilingOnly = (reputation: number, amount: number): number =>
  Math.min(REPUTATION_MAX, reputation + amount);

/**
 * Drive `storyEvents.failChildrenShelter`, a floor-only reputation loss: with no residences there are
 * no free beds, so the next feeding check fails the quest.
 */
function childrenShelterFailureAt(reputation: number): WorldState {
  const state = initGame({ villageName: 'Repute', size: 'medium', seed: FIXTURE_SEED });
  state.villageReputation = reputation;
  state.buildings = []; // no beds ⇒ `countFreeShelterBeds` returns 0
  state.tick = 2 * TICKS_PER_DAY;
  state.storyFlags = {
    children_shelter_started: TICKS_PER_DAY,
    children_shelter_until: 10 * TICKS_PER_DAY,
    children_shelter_helped: 1,
  };

  tickChildrenShelter(state);

  return state;
}

describe('village reputation has one owner (A6)', () => {
  it('brings a drifted reputation back into 0..100 on a floor-only loss site', () => {
    const state = childrenShelterFailureAt(DRIFTED_REPUTATION);

    // A floor-only loss would leave 116; the owner's clamp brings it back to the documented 100.
    expect(
      state.villageReputation,
      'a reputation loss left the village over the documented ceiling',
    ).toBeLessThanOrEqual(REPUTATION_MAX);
    expect(state.villageReputation).toBe(REPUTATION_MAX);
  });

  it('writes exactly what the old floor-only expression wrote at the floor', () => {
    const state = childrenShelterFailureAt(0);

    expect(state.villageReputation).toBe(floorOnly(0, -4));
    expect(state.villageReputation).toBe(0);
  });

  it('writes exactly what the old ceiling-only expression wrote at the ceiling', () => {
    const state = initGame({ villageName: 'Repute', size: 'medium', seed: FIXTURE_SEED });
    state.villageReputation = REPUTATION_MAX - 1;
    state.resources.wood = 50;
    state.visitorQuest = {
      id: 'quest_1',
      emoji: '🔨',
      title: 'The traveling smith',
      description: 'Deliver 20 wood.',
      goalType: 'deliver',
      goalResource: 'wood',
      goalAmount: 20,
      progress: 0,
      status: 'active',
      rewardGold: 0,
      rewardReputation: 4,
      expiresDay: 99,
    };

    expect(deliverVisitorQuest(state)).toBe(true);

    expect(state.villageReputation).toBe(ceilingOnly(REPUTATION_MAX - 1, 4));
    expect(state.villageReputation).toBe(REPUTATION_MAX);
  });

  it('leaves no raw writer outside the owner and the two transport sites', () => {
    // A raw assignment to the field, whichever clamp shape it copies.
    const rawWrite = /(?:state|world)\.villageReputation\s*=\s*[^=]/;
    // The only non-computations of the field: the owner and the two transports that carry it across
    // the sim boundary; paths are relative to `src/`.
    const allowed = new Set([
      'game/simHelpers.ts',
      'game/simBuffers/simDelta.ts',
      'game/simWorker/simPrep.ts',
    ]);
    const srcRoot = resolve(process.cwd(), 'src');
    const offenders: string[] = [];
    let scanned = 0;

    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
        } else if (full.endsWith('.ts') || full.endsWith('.tsx')) {
          scanned++;
          const rel = relative(srcRoot, full).split('\\').join('/');
          if (allowed.has(rel)) continue;
          readFileSync(full, 'utf8')
            .split('\n')
            .forEach((line, index) => {
              if (rawWrite.test(line)) offenders.push(`${rel}:${index + 1}  ${line.trim()}`);
            });
        }
      }
    };
    walk(srcRoot);

    expect(scanned).toBeGreaterThan(300); // the walk must actually cover the tree
    expect(offenders, 'raw villageReputation writers outside the owner').toEqual([]);
  });
});
