/**
 * A5 + A7 — one owner for the ecosystem-health read and for the village labour counters
 * (`docs/private/audits/2026-09-16/duplication-deadcode.md`, tracked in `LIVE-FINDINGS-STATUS.md`).
 *
 * A5: the same ecosystem-health read was copied with four different "missing value" defaults —
 * `?? 80` in `storyEvents`/`deerParliament`, `?? 100` in `ecologyStage` and one `dashboardData`
 * metric, `?? 0` in another `dashboardData` metric, `?? 50` in `villagePortrait` — so one legacy
 * world (a save whose `state.ecosystemHealth` predates the field) read as a thriving valley in one
 * panel and a collapsed one in another. The missing value now reads as the documented midpoint
 * (`dailyEcology.getEcosystemHealth`), which is neither healthy nor collapsed.
 *
 * A7: the working/idle/imprisoned classification was aggregated twice, including the
 * `hasWorkAssignment(e) || constructionWorkers.has(e.id)` rule. A settler standing on an incomplete
 * building counted as *working* in the top-bar HUD and as an *idle adult* in the dashboard's
 * concerns for the same tick. The counters now have one aggregator (`uiSimSummary`) and the
 * dashboard, the People screen and the HUD compose it.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Building, Entity, WorldState } from '../src/game/gameTypes';
import { BuildingType, EntityType, Season, WeatherType } from '../src/game/gameTypes';
import { UNKNOWN_ECOSYSTEM_HEALTH } from '../src/game/dailyEcology';
import { collectDashboard } from '../src/game/dashboardData';
import { computeVillageStats } from '../src/game/uiSimSummary';
import { computeCitizenOverview } from '../src/game/citizenOverview';

function world(overrides: Partial<WorldState> = {}): WorldState {
  return {
    tick: 0,
    width: 400,
    height: 300,
    year: 1,
    dayInYear: 0,
    season: Season.Spring,
    weather: WeatherType.Clear,
    entities: [],
    buildings: [],
    eventLog: [],
    notifications: [],
    bigNews: [],
    floatingTexts: [],
    nextFloatingTextId: 1,
    nextEntityId: 10,
    humanPopulation: 0,
    maxHumanPopulation: 20,
    villageReputation: 50,
    resources: { wood: 0, stone: 0, food: 0, gold: 0, iron: 0 },
    storageMax: { wood: 0, stone: 0, food: 0, gold: 0, iron: 0 },
    wildlifeCounts: { grass: 0, rabbits: 0, deer: 0, wolves: 0, foxes: 0, werewolves: 0, wildkin: 0, trees: 0 },
    valleyStage: 'stable',
    ecosystemHealth: 80,
    pollutionLevel: 0,
    biodiversityIndex: 0,
    ...overrides,
  } as unknown as WorldState;
}

/** A legacy world: the save predates `ecosystemHealth`, so the key is absent, not zero. */
function worldMissingEcoHealth(): WorldState {
  const state = world() as unknown as Record<string, unknown>;
  delete state.ecosystemHealth;
  return state as unknown as WorldState;
}

function settler(id: number, overrides: Partial<Entity> = {}): Entity {
  return {
    id,
    type: EntityType.Human,
    alive: true,
    x: 0,
    y: 0,
    energy: 80,
    maxEnergy: 100,
    isJuvenile: false,
    ...overrides,
  } as unknown as Entity;
}

/** An unfinished site whose crew member has no workplace assignment of their own. */
function constructionSite(workerId: number): Building {
  return {
    id: 5,
    type: BuildingType.Farm,
    completed: false,
    occupants: [workerId],
    x: 10,
    y: 10,
    width: 20,
    height: 20,
  } as unknown as Building;
}

describe('A5 — the ecosystem-health read has one owner and one missing-value default', () => {
  it('reads one neutral value in every dashboard path, not healthy in one and collapsed in another', () => {
    const state = worldMissingEcoHealth();
    const dashboard = collectDashboard(state);

    // Pre-fix the population card read `?? 0` (a collapsed valley) while `deriveConcerns` read
    // `?? 100` (a pristine one), so the same world showed "Eco 0" with no ecosystem concern at all.
    expect(dashboard.population.ecoHealth).toBe(UNKNOWN_ECOSYSTEM_HEALTH);
    expect(UNKNOWN_ECOSYSTEM_HEALTH, 'the owner documents the neutral midpoint').toBe(50);

    const concern = dashboard.concerns.find((c) => c.id === 'ecology' || c.id === 'ecology_soft');
    expect(concern?.detail, 'the concern text reads the same value as the card').toContain('50/100');
  });

  it('leaves no reader re-deriving the default or the clamp', () => {
    const files = [
      'src/game/storyEvents.ts',
      'src/game/deerParliament.ts',
      'src/game/dashboardData.ts',
      'src/game/ecologyStage.ts',
      'src/game/villagePortrait.ts',
      'src/game/ecoBreakdown.ts',
    ];
    for (const file of files) {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8');
      expect(source, `${file} restates the missing-value default`).not.toMatch(/ecosystemHealth\s*\?\?/);
      expect(source, `${file} re-implements the 0..100 clamp`).not.toMatch(
        /Math\.max\(0,\s*Math\.min\(100,\s*value\)\)/,
      );
      expect(source, `${file} does not read the owner`).toMatch(/EcosystemHealth/);
    }
  });
});

describe('A7 — the village labour counters have one aggregator', () => {
  it('calls a settler on a construction crew working in both aggregations', () => {
    const builder = settler(1);
    const state = world({ entities: [builder], buildings: [constructionSite(1)], humanPopulation: 1 });

    const stats = computeVillageStats(state);
    const overview = computeCitizenOverview(state);
    const dashboard = collectDashboard(state);

    expect(stats.working).toBe(1);
    expect(stats.idle).toBe(0);
    // Equivalence pin: the People screen states the owner's counters, not a second scan.
    expect(overview.working).toBe(stats.working);
    expect(overview.idle).toBe(stats.idle);
    expect(overview.adults).toBe(stats.adults);
    // Pre-fix `deriveConcerns` counted `!juvenile && homeBuildingId == null` as an idle adult, so the
    // dashboard reported "1 idle adult" while the HUD reported 1 working / 0 idle for the same tick.
    expect(
      dashboard.concerns.find((c) => c.id === 'idle'),
      'the dashboard still calls a builder idle',
    ).toBeUndefined();
    // The per-settler row follows the same rule as the counters it sits next to.
    expect(dashboard.settlers[0]?.noWork).toBe(false);
  });

  it('leaves no second aggregation of the counters', () => {
    const citizen = readFileSync(resolve(process.cwd(), 'src/game/citizenOverview.ts'), 'utf8');
    expect(citizen, 'citizenOverview re-implements the construction-crew scan').not.toMatch(
      /b\.faction !== 'rival'/,
    );
    expect(citizen, 'citizenOverview does not compose the owner').toMatch(/computeVillageStats\(/);

    const dashboard = readFileSync(resolve(process.cwd(), 'src/game/dashboardData.ts'), 'utf8');
    expect(dashboard, 'the dashboard re-derives the idle-adult rule').not.toMatch(/idleAdults\+\+/);
    expect(dashboard, 'the dashboard does not compose the owner').toMatch(/computeVillageStats\(/);
  });
});
