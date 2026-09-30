/**
 * A6 — village reputation has one writer.
 *
 * Audit `docs/private/audits/2026-09-16/duplication-deadcode.md` §A6, tracked in
 * `LIVE-FINDINGS-STATUS.md`. The owner `simHelpers.addReputation` clamps **both** ends
 * (`Math.max(0, Math.min(100, current + amount))` — "Clamps reputation strictly between 0 and 100"),
 * but 40 other sites wrote `state.villageReputation` themselves with one of two partial policies:
 *
 *   - 19 ceiling-only sites: `state.villageReputation = Math.min(100, state.villageReputation + n)`
 *   - 21 floor-only sites:   `state.villageReputation = Math.max(0, state.villageReputation - n)`
 *
 * Only the *definition* moves: for every reputation inside the documented 0..100 contract the value
 * written is exactly what the old expression wrote, because each site's own clamp end matches the
 * sign of its amount (checked for all 40 sites across 0..100 — 0 divergences). The two behavioural
 * cases below fence the two surviving policies at the end each one clamped; they would go red if the
 * fix changed an amount, a sign or a clamp end.
 *
 * The one band where a value does move is a reputation already **outside** 0..100 — the
 * "Reputation 140" HUD the same audit calls a defect. A loss surface used to leave it over the
 * ceiling (`Math.max` only); through the owner it is brought back into contract. That is the
 * behavioural red-before case, and the source guard is the second.
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
/** The over-ceiling reputation the audit's drift risk names ("Reputation 140" is possible). */
const DRIFTED_REPUTATION = REPUTATION_MAX + 20;
/** The floor-only policy the floor sites used: `Math.max(0, state.villageReputation + n)`. */
const floorOnly = (reputation: number, amount: number): number => Math.max(0, reputation + amount);
/** The ceiling-only policy the reward sites used: `Math.min(100, state.villageReputation + n)`. */
const ceilingOnly = (reputation: number, amount: number): number =>
  Math.min(REPUTATION_MAX, reputation + amount);

/**
 * Drive `storyEvents.failChildrenShelter` — a floor-only site that lost 4 reputation
 * (`state.villageReputation = Math.max(0, state.villageReputation - 4)`) — through its public
 * cadence. With no residences there are no free beds, so the next feeding check fails the quest.
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

    // Red before this slice: `Math.max(0, 120 - 4)` left 116 — still over the ceiling.
    // Through the owner the loss is applied inside the documented band: max(0, min(100, 116)) = 100.
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
    // The exact pre-fix shape this guard exists for:
    //   state.villageReputation = Math.max(0, state.villageReputation - 4);
    //   state.villageReputation = Math.min(100, state.villageReputation + 2);
    const rawWrite = /(?:state|world)\.villageReputation\s*=\s*[^=]/;
    // The only copies of the field that are not computations of it: the owner, and the two
    // worker/main transports that carry the value across the sim boundary.
    // Paths are relative to `src/`.
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
