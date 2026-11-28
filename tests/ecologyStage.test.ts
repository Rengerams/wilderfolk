import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initGame } from '../src/game/worldGen';
import type { WorldState } from '../src/game/gameTypes';
import { computeRawEcologyStress, ensureValleyEcologyOnLoad, tickValleyEcologyStage } from '../src/game/ecologyStage';
import { ValleyEcology } from '../src/game/gameConstants';
import { TICKS_PER_DAY } from '../src/game/dayCycle';
import { loadValleyStageWarnings, saveValleyStageWarnings } from '../src/game/preferences';
import { buildSaveData } from '../src/game/saveLoad';
import { createInitialView } from '../src/game/viewState';

function world(seed = 7): WorldState {
  return initGame({ villageName: 'Testholm', size: 'medium', seed });
}

/** Stand-in for the browser store, so a preference read is a real read. */
function memoryStorage(): Storage {
  const entries = new Map<string, string>();
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    },
    removeItem: (key: string) => {
      entries.delete(key);
    },
    clear: () => entries.clear(),
    key: (index: number) => [...entries.keys()][index] ?? null,
    get length() {
      return entries.size;
    },
  } as Storage;
}

describe('valley ecology stage (L17, L18)', () => {
  const valleySwitch = ValleyEcology as unknown as { ENABLED: boolean };
  let valleyWasEnabled = false;

  beforeEach(() => {
    valleyWasEnabled = valleySwitch.ENABLED;
    valleySwitch.ENABLED = true;
  });

  afterEach(() => {
    valleySwitch.ENABLED = valleyWasEnabled;
  });

  function quietValley(state: WorldState): void {
    state.buildings = [];
    state.wildlifeCounts = { ...state.wildlifeCounts, deer: 1, rabbits: 2, wolves: 3, wildkin: 0, grass: 120 };
    state.pollutionLevel = 0;
  }

  it('preserves the saved stage despite divergent instantaneous stress on repeated loads', () => {
    const state = world();
    quietValley(state);
    state.ecosystemHealth = 10;
    state.tick = TICKS_PER_DAY * 20;
    state.valleyStage = 'stable';
    state.valleyStageSinceDay = 7;
    state.valleyRawStressStreakDays = 1;
    state.valleyRawCalmStreakDays = 0;
    state.valleyLastStageNotifyDay = 6;
    expect(computeRawEcologyStress(state).stressLevel).toBe(2);

    for (let load = 0; load < 3; load++) {
      ensureValleyEcologyOnLoad(state);
      expect(state).toMatchObject({
        valleyStage: 'stable',
        valleyStageSinceDay: 7,
        valleyRawStressStreakDays: 1,
        valleyRawCalmStreakDays: 0,
        valleyLastStageNotifyDay: 6,
      });
    }
  });

  it('initializes a missing legacy stage and its missing counters', () => {
    const state = world();
    quietValley(state);
    state.ecosystemHealth = 10;
    state.tick = TICKS_PER_DAY * 20;
    state.valleyStage = undefined;
    state.valleyStageSinceDay = undefined;
    state.valleyRawStressStreakDays = undefined;
    state.valleyRawCalmStreakDays = undefined;
    state.valleyLastStageNotifyDay = undefined;
    ensureValleyEcologyOnLoad(state);
    expect(state).toMatchObject({
      valleyStage: 'strained',
      valleyStageSinceDay: 20,
      valleyRawStressStreakDays: 0,
      valleyRawCalmStreakDays: 0,
      valleyLastStageNotifyDay: -999,
    });
  });

  it('suppresses a recovery notice inside the notify cooldown', () => {
    const state = world();
    quietValley(state);
    state.ecosystemHealth = 10; // footprint driver is bad → raw stress 2
    state.valleyStage = 'stable';
    state.valleyStageSinceDay = 0;
    state.valleyLastStageNotifyDay = -999;
    state.valleyRawStressStreakDays = 3; // CONFIRM_UP_DAYS
    state.valleyRawCalmStreakDays = 0;
    state.tick = TICKS_PER_DAY * 20;
    state.eventLog = [];
    state.notifications = [];
    expect(computeRawEcologyStress(state).stressLevel).toBe(2);

    tickValleyEcologyStage(state);
    expect(state.valleyStage).toBe('strained');
    expect(state.valleyLastStageNotifyDay).toBe(20);
    expect(state.notifications.length).toBeGreaterThan(0);

    // Next day the valley recovers one step — one day after the notice, inside the 3-day cooldown.
    state.tick = TICKS_PER_DAY * 21;
    state.ecosystemHealth = 100;
    state.valleyRawStressStreakDays = 0;
    state.valleyRawCalmStreakDays = 2; // RECOVERY_LAG_DAYS
    expect(computeRawEcologyStress(state).stressLevel).toBe(0);
    const notificationsBefore = state.notifications.length;
    const eventsBefore = state.eventLog.length;

    tickValleyEcologyStage(state);

    expect(state.valleyStage).toBe('stable');
    expect(state.notifications.length).toBe(notificationsBefore);
    expect(state.eventLog.length).toBe(eventsBefore);
  });

  it('keeps the grazing driver capped at bad under extreme pressure', () => {
    const state = world();
    state.entities = []; // no living grass to regrow
    state.wildlifeCounts = { ...state.wildlifeCounts, deer: 5000, rabbits: 0, wildkin: 0, wolves: 0, grass: 1 };

    const grazing = computeRawEcologyStress(state).drivers.find((d) => d.id === 'grazing');

    expect(grazing?.stress).toBe(2);
    expect(grazing?.band).toBe('bad');
  });

  it('walks a stressed valley down to collapse and recovers it one step at a time', () => {
    const state = world();
    quietValley(state);
    state.tick = TICKS_PER_DAY * 20;
    state.ecosystemHealth = 10; // footprint driver bad → raw stress 2
    state.eventLog = [];
    state.notifications = [];
    state.bigNews = [];
    state.valleyStage = 'stable';
    state.valleyStageSinceDay = 0;
    state.valleyRawStressStreakDays = 0;
    state.valleyRawCalmStreakDays = 0;
    state.valleyLastStageNotifyDay = -999;
    const reputationBefore = state.villageReputation ?? 0;

    expect(computeRawEcologyStress(state).stressLevel).toBe(2);
    for (let day = 20; day < 23; day++) {
      state.tick = TICKS_PER_DAY * day;
      tickValleyEcologyStage(state);
    }
    expect(state.valleyStage).toBe('strained');

    for (let day = 23; day < 26; day++) {
      state.tick = TICKS_PER_DAY * day;
      tickValleyEcologyStage(state);
    }
    expect(state.valleyStage).toBe('damaged');

    // Two bad drivers is raw stress 3, the only input that may reach collapse.
    state.wildlifeCounts = { ...state.wildlifeCounts, deer: 20, rabbits: 0, wolves: 0, grass: 1 };
    expect(computeRawEcologyStress(state).stressLevel).toBe(3);
    for (let day = 26; day < 29; day++) {
      state.tick = TICKS_PER_DAY * day;
      tickValleyEcologyStage(state);
    }
    // Confirmed stress alone is not enough: damaged must dwell before the last step is allowed.
    expect(state.valleyStage).toBe('damaged');

    state.tick = TICKS_PER_DAY * 29;
    tickValleyEcologyStage(state);
    expect(state.valleyStage).toBe('collapse');
    expect(state.villageReputation).toBe(reputationBefore - 4);

    // Recovery steps back one stage per two calm days, so collapse is never a dead end.
    quietValley(state);
    state.ecosystemHealth = 100;
    for (let day = 30; day <= 35; day++) {
      state.tick = TICKS_PER_DAY * day;
      tickValleyEcologyStage(state);
      if (day === 30) expect(state.valleyStage).toBe('collapse');
      if (day === 31) expect(state.valleyStage).toBe('damaged');
      if (day === 33) expect(state.valleyStage).toBe('strained');
    }
    expect(state.valleyStage).toBe('stable');
  });

  it('holds a healthy valley at stable across a year of daily ticks', () => {
    const state = world();
    quietValley(state);
    state.tick = TICKS_PER_DAY * 20;
    state.eventLog = [];
    state.notifications = [];
    state.bigNews = [];
    expect(computeRawEcologyStress(state).stressLevel).toBe(0);

    for (let day = 20; day < 380; day++) {
      state.tick = TICKS_PER_DAY * day;
      tickValleyEcologyStage(state);
    }

    expect(state.valleyStage).toBe('stable');
    expect(state.notifications).toHaveLength(0);
    expect(state.bigNews).toHaveLength(0);
    expect(state.eventLog).toHaveLength(0);
  });
});

describe('valley stage warnings setting', () => {
  const valleySwitch = ValleyEcology as unknown as { ENABLED: boolean };
  let valleyWasEnabled = false;

  beforeEach(() => {
    valleyWasEnabled = valleySwitch.ENABLED;
    valleySwitch.ENABLED = true;
    vi.stubGlobal('localStorage', memoryStorage());
  });

  afterEach(() => {
    valleySwitch.ENABLED = valleyWasEnabled;
    vi.unstubAllGlobals();
  });

  /** A quiet valley whose only bad driver is footprint (ecosystem health 10 → raw 2). */
  function stressedValley(state: WorldState): void {
    state.buildings = [];
    state.wildlifeCounts = { ...state.wildlifeCounts, deer: 1, rabbits: 2, wolves: 3, wildkin: 0, grass: 120 };
    state.pollutionLevel = 0;
    state.ecosystemHealth = 10;
    state.valleyStage = 'stable';
    state.valleyStageSinceDay = 0;
    state.valleyRawStressStreakDays = 0;
    state.valleyRawCalmStreakDays = 0;
    state.valleyLastStageNotifyDay = -999;
    state.tick = TICKS_PER_DAY * 20;
    state.eventLog = [];
    state.notifications = [];
    state.bigNews = [];
  }

  /** One confirmed step up the ladder (stress streak already at the confirm dwell). */
  function stepUp(state: WorldState, day: number): string | undefined {
    state.valleyRawStressStreakDays = 3; // CONFIRM_UP_DAYS
    state.tick = TICKS_PER_DAY * day;
    tickValleyEcologyStage(state);
    return state.eventLog[0]?.message;
  }

  /** One confirmed step back down (calm streak already at the recovery lag). */
  function stepDown(state: WorldState, day: number): string | undefined {
    state.valleyRawCalmStreakDays = 2; // RECOVERY_LAG_DAYS
    state.tick = TICKS_PER_DAY * day;
    tickValleyEcologyStage(state);
    return state.eventLog[0]?.message;
  }

  /**
   * The ladder walk the sibling suite already covers: Stable → Strained → Stable, then
   * Stable → Strained → Damaged → Collapse → Damaged. Runs with whatever warnings setting is on.
   */
  function walkLadder(state: WorldState): {
    stages: (string | undefined)[];
    chronicle: (string | undefined)[];
    notices: number;
    news: number;
  } {
    const stages: (string | undefined)[] = [];
    const chronicle: (string | undefined)[] = [];
    const atStage = (stage: string) => {
      expect(state.valleyStage).toBe(stage);
      stages.push(state.valleyStage);
    };
    const step = (fn: (s: WorldState, d: number) => string | undefined, day: number) => {
      chronicle.push(fn(state, day));
    };

    stressedValley(state);
    expect(computeRawEcologyStress(state).stressLevel).toBe(2);
    step(stepUp, 20);
    atStage('strained');
    // Day 24 clears the owner's 3-day re-notify cooldown, so the recovery step is announced too.
    state.tick = TICKS_PER_DAY * 21;
    state.ecosystemHealth = 100;
    state.valleyRawCalmStreakDays = 2;
    expect(computeRawEcologyStress(state).stressLevel).toBe(0);
    step(stepDown, 24);
    atStage('stable');

    // One raise alone carries every interruptive surface: strained warns, damaged and collapse
    // also raise big news.
    stressedValley(state);
    state.valleyRawStressStreakDays = 3;
    step(stepUp, 20);
    atStage('strained');
    step(stepUp, 23);
    atStage('damaged');
    // Collapse needs Damaged dwell plus the two-bad-driver stress the ladder owner gates it on.
    state.wildlifeCounts = { ...state.wildlifeCounts, deer: 20, rabbits: 0, wolves: 0, grass: 1 };
    state.ecosystemHealth = 10;
    expect(computeRawEcologyStress(state).stressLevel).toBe(3);
    step(stepUp, 30);
    atStage('collapse');

    // Recovery: collapse steps back to damaged on the first calm day.
    state.ecosystemHealth = 100;
    state.wildlifeCounts = { ...state.wildlifeCounts, deer: 1, rabbits: 2, wolves: 3, wildkin: 0, grass: 120 };
    state.pollutionLevel = 0;
    state.tick = TICKS_PER_DAY * 31;
    expect(computeRawEcologyStress(state).stressLevel).toBe(0);
    step(stepDown, 31);
    atStage('damaged');

    return {
      stages,
      chronicle,
      notices: state.notifications.length,
      news: state.bigNews.length,
    };
  }

  it('defaults on, so a player who never touches it keeps the alerts', () => {
    expect(loadValleyStageWarnings()).toBe(true);
  });

  it('raises the notification and big news on a real stage change while it is on', () => {
    const state = world();
    const walk = walkLadder(state);

    expect(walk.stages).toEqual(['strained', 'stable', 'strained', 'damaged', 'collapse', 'damaged']);
    expect(walk.notices).toBeGreaterThan(0);
    expect(walk.news).toBeGreaterThan(0);
  });

  it('silences the interruptive surfaces but keeps the chronicle line while it is off', () => {
    saveValleyStageWarnings(false);
    expect(loadValleyStageWarnings()).toBe(false);
    const state = world();
    const walk = walkLadder(state);

    expect(walk.stages).toEqual(['strained', 'stable', 'strained', 'damaged', 'collapse', 'damaged']);
    expect(walk.notices).toBe(0);
    expect(walk.news).toBe(0);
    expect(walk.chronicle).toHaveLength(6);
    for (const line of walk.chronicle) {
      expect(line).toContain('Valley ecology:');
    }
    expect(walk.chronicle[0]).toContain('Stable → Strained');
    expect(walk.chronicle[1]).toContain('Strained → Stable');
    expect(walk.chronicle[4]).toContain('Damaged → Collapse');
  });

  it('still moves, persists and recovers with the warnings off', () => {
    saveValleyStageWarnings(false);
    const state = world();
    stressedValley(state);
    state.valleyRawStressStreakDays = 3;
    state.tick = TICKS_PER_DAY * 20;
    tickValleyEcologyStage(state);
    expect(state.valleyStage).toBe('strained');

    // Persistence: the moved ladder is in the save payload and survives the JSON round-trip.
    const payload = JSON.parse(
      JSON.stringify(buildSaveData(state, createInitialView(state.width, state.height))),
    ) as { valleyStage?: string; valleyLastStageNotifyDay?: number };
    expect(payload.valleyStage).toBe('strained');
    expect(payload.valleyLastStageNotifyDay).toBe(20);

    // Recovery: the calm streak still walks the stage back down, warning surfaces still silent.
    state.ecosystemHealth = 100;
    state.valleyRawCalmStreakDays = 2;
    state.tick = TICKS_PER_DAY * 21;
    tickValleyEcologyStage(state);
    expect(state.valleyStage).toBe('stable');
    expect(state.notifications).toHaveLength(0);
    expect(state.bigNews).toHaveLength(0);

    // A muted step still spends the cooldown, so turning warnings back on does not replay it.
    expect(state.valleyLastStageNotifyDay).toBe(21);
  });
});

describe('valley ecology ladder shipping state', () => {
  it('ships enabled, so the ladder runs unless the owner parks it again', () => {
    // Flipping this off is a deliberate owner decision; change this expectation with it.
    expect(ValleyEcology.ENABLED).toBe(true);
  });
});
