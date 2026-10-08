/**
 * A village can hold a hundred children who never enter a classroom, and the per-school roster said
 * nothing when no school existed. The schooling owner now answers why, and counts the village by it.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BuildingType, EntityType } from '../src/game/gameTypes';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import {
  SCHOOL_MAX_CHILDREN,
  describeSchoolingSummary,
  getSchoolingBlockReason,
  summarizeSchooling,
} from '../src/game/education';
import { SCHOOL_MIN_AGE } from '../src/game/gameConstants';
import { isOnWorkShift } from '../src/game/dayCycle';
import { summarizeTradeRouteBlocks } from '../src/game/tradeCaravans';

const CLASS_TICK = 0;
const CLASS_HOUR = 10;

function child(id: number, age: number, x = 0, y = 0): Entity {
  return {
    id,
    type: EntityType.Human,
    alive: true,
    isJuvenile: true,
    age,
    x,
    y,
  } as unknown as Entity;
}

function school(id: number, occupants: number[], x = 100, y = 100): Building {
  return {
    id,
    type: BuildingType.School,
    completed: true,
    occupants,
    x,
    y,
    width: 20,
    height: 20,
  } as unknown as Building;
}

function village(children: Entity[], buildings: Building[] = []): WorldState {
  return { entities: children, buildings, tick: CLASS_TICK } as unknown as WorldState;
}

function reasonCount(summary: ReturnType<typeof summarizeSchooling>, reason: string): number {
  return summary.outOfSchool.find((entry) => entry.reason === reason)?.count ?? 0;
}

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

describe('the schooling owner explains an empty classroom', () => {
  it('counts every school-age child under "no school built" and shows it in words', () => {
    const state = village(Array.from({ length: 12 }, (_, i) => child(i + 1, 7)));
    const summary = summarizeSchooling(state, CLASS_TICK, CLASS_HOUR);

    expect(summary.schoolAge).toBe(12);
    expect(summary.enrolled).toBe(0);
    expect(summary.outOfSchool).toEqual([{ reason: 'No school built', count: 12 }]);
    expect(describeSchoolingSummary(summary).lines).toContain('12 children — No school built');
  });

  it('prints the owner reason, not a copy of it', () => {
    const girl = child(1, 7);
    const state = village([girl]);
    const ownerReason = getSchoolingBlockReason(girl, []);
    expect(ownerReason).toBe('No school built');

    const summary = summarizeSchooling(state, CLASS_TICK, CLASS_HOUR);
    expect(summary.outOfSchool[0]!.reason).toBe(ownerReason);
    expect(describeSchoolingSummary(summary).lines[0]).toContain(ownerReason!);
  });

  it('a built and staffed school moves the children out of that bucket', () => {
    const children = Array.from({ length: 8 }, (_, i) => child(i + 1, 7, 100, 100));
    const before = summarizeSchooling(village(children, [school(50, [])]), CLASS_TICK, CLASS_HOUR);
    expect(before.outOfSchool).toEqual([{ reason: 'School has no teacher assigned', count: 8 }]);

    const staffed = summarizeSchooling(village(children, [school(50, [900])]), CLASS_TICK, CLASS_HOUR);
    expect(staffed.outOfSchool).toEqual([]);
    expect(staffed.enrolled).toBe(8);
    expect(describeSchoolingSummary(staffed).lines).toEqual([]);
  });

  it('names the full classroom and leaves no child unaccounted for', () => {
    const children = Array.from({ length: SCHOOL_MAX_CHILDREN + 5 }, (_, i) =>
      child(i + 1, 7, 100, 100));
    const summary = summarizeSchooling(village(children, [school(50, [900])]), CLASS_TICK, CLASS_HOUR);

    expect(summary.schoolAge).toBe(SCHOOL_MAX_CHILDREN + 5);
    expect(summary.enrolled).toBe(SCHOOL_MAX_CHILDREN);
    expect(summary.outOfSchool).toEqual([{ reason: 'Every classroom is full', count: 5 }]);
    expect(reasonCount(summary, 'Every classroom is full') + summary.enrolled).toBe(summary.schoolAge);
  });

  it('a child under the school age is counted apart from the school-age cohort', () => {
    const state = village([child(1, SCHOOL_MIN_AGE - 1), child(2, SCHOOL_MIN_AGE)]);
    const summary = summarizeSchooling(state, CLASS_TICK, CLASS_HOUR);

    expect(summary.tooYoung).toBe(1);
    expect(summary.schoolAge).toBe(1);
    expect(summary.outOfSchool).toEqual([{ reason: 'No school built', count: 1 }]);
    expect(describeSchoolingSummary(summary).notes).toContain(
      `1 younger than ${SCHOOL_MIN_AGE} — not school age yet.`,
    );
  });

  it('separates a child at the classroom from one still walking, only during class hours', () => {
    const state = village([child(1, 7, 100, 100), child(2, 7, 900, 900)], [school(50, [900])]);
    const summary = summarizeSchooling(state, CLASS_TICK, CLASS_HOUR);

    expect(summary.classHours).toBe(isOnWorkShift(CLASS_TICK, CLASS_HOUR));
    expect(summary.enrolled).toBe(2);
    if (summary.classHours) {
      expect(summary.inClassNow).toBe(1);
      expect(describeSchoolingSummary(summary).notes.join(' ')).toContain('still walking or busy');
    }
  });

  it('the Village panel prints the owner breakdown', () => {
    const panel = read('src/components/tabPanels/VillageTabPanel.tsx');
    expect(panel).toContain('summarizeSchooling(state, state.tick, getHourOfDay(state.tick))');
    expect(panel).toContain('describeSchoolingSummary(');
    expect(panel).toContain('{summary.headline}');
    expect(panel, 'the reason lines are computed and thrown away').toContain('{line}');
  });
});

describe('the trade owner explains why no route is open', () => {
  const resources = (overrides: Record<string, number>) =>
    ({ wood: 0, stone: 0, food: 0, gold: 0, iron: 0, ...overrides });

  it('counts the blocked routes under the owner reason', () => {
    const state = {
      villageReputation: 0,
      buildings: [],
      tradeRoutes: [
        { id: 'ready', active: false, reputationRequired: 0, resourcesGiven: resources({ gold: 10 }), resourcesReceived: resources({ wood: 10 }) },
        { id: 'rep', active: false, reputationRequired: 40, resourcesGiven: resources({ gold: 10 }), resourcesReceived: resources({ stone: 10 }) },
        { id: 'market', active: false, reputationRequired: 0, resourcesGiven: resources({ wood: 10 }), resourcesReceived: resources({ gold: 10 }) },
      ],
    } as unknown as WorldState;

    const summary = summarizeTradeRouteBlocks(state);
    expect(summary.ready).toBe(1);
    expect(summary.blocked).toHaveLength(2);
    expect(summary.blocked).toEqual(expect.arrayContaining([
      { reason: 'Build a Market before establishing trade routes', count: 1 },
      { reason: 'Need 40 reputation', count: 1 },
    ]));
  });

  it('the Progress panel prints the trade owner aggregate', () => {
    const panel = read('src/components/tabPanels/ProgressTabPanel.tsx');
    expect(panel).toContain('summarizeTradeRouteBlocks(state)');
    expect(panel).toContain('tradeBlocks.blocked.map');
  });
});
