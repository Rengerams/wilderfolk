/**
 * Guards for the 2026-09-17 UI refinement campaign
 * (`docs/private/audits/2026-09-16/UI_REFINEMENT_AND_DUPLICATION_2026-09-17.md`, section B).
 *
 * Each row here is the *risk* side of a Tier-1/Tier-2 refinement whose fix is otherwise pure
 * presentation, so it is pinned the way the campaign pins its other owner reads: a behavioural
 * assertion where the rule is arithmetic, and a narrow source guard where the risk is a panel
 * re-deriving a rule or a label it does not own.
 *
 * - **R1** `useGamePersistence`'s unmount save ran with `loopRef.current === null` under
 *   `StrictMode`, and `persistGame` falls back to the `viewRef` seeded by `initGame()`, so a
 *   development page load wrote a brand-new empty colony over the single save slot.
 * - **R4** an inactive but *establishable* trade route was labelled "Unavailable" above its own
 *   enabled "Establish Route" button, while the Trade badge counted it.
 * - **R8** Growing Village, Century Mark and Great City had no progress row at all, because the
 *   owner's `switch` covered five ids and returned `null` for the rest.
 * - **R22** the raid forecast printed `Math.round(ratio × 100)` while the outcome tiers band on
 *   `>= 1.35 / 0.95 / 0.65`, so 1.345 read "135%" beside a "Costly win" badge.
 * - **R24** the leadership panel promised a "3 months" vacancy election as prose while the owner
 *   holds `VACANCY_ELECTION_DELAY_YEARS`.
 * - **R25** the recruitment price and gate were typed twice and the owner's `blockReason` was
 *   surfaced only in a `title` on a disabled button.
 * - **R29** the household panel read the raw `workingSettlers` / `idleSettlers` tick fields and
 *   counted the Leader's House beds as assignable housing.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initGame } from '../src/game/worldGen';
import { getChallengeProgress, INITIAL_CHALLENGES } from '../src/game/challenges';
import { BuildingType } from '../src/game/buildings';
import type { Building, WorldState } from '../src/game/gameTypes';

const read = (relative: string) => readFileSync(resolve(process.cwd(), relative), 'utf8');

const FIXTURE_SEED = 20_260_917;

function world(): WorldState {
  const state = initGame({ villageName: 'Refinement', size: 'medium', seed: FIXTURE_SEED });
  state.challenges = INITIAL_CHALLENGES.map((c) => ({ ...c, completed: false }));
  return state;
}

function completedPlayerHouse(id: number): Building {
  return {
    id, type: BuildingType.House, x: 100, y: 100, width: 20, height: 20, completed: true, occupants: [], rotation: 0,
  } as unknown as Building;
}

describe('R1 — the unmount save never writes a colony no loop owns', () => {
  it('guards the unmount cleanup on the loop ref', () => {
    const src = read('src/hooks/useGamePersistence.ts');
    const effect = src.match(
      /useEffect\(\(\) => \{\s*return \(\) => \{([\s\S]*?)\};\s*\}, \[loopRef\]\);/,
    );
    expect(effect, 'fixture premise: the unmount-save effect exists').not.toBeNull();
    expect(
      effect?.[1] ?? '',
      'the unmount cleanup saves without a loop again (StrictMode overwrites the save slot)',
    ).toMatch(/if \(!loopRef\.current\) return;/);
  });
});

describe('R4 — an establishable trade route is not labelled "Unavailable"', () => {
  it('labels the inactive-but-ready state from the owner result', () => {
    const panel = read('src/components/tabPanels/ProgressTabPanel.tsx');
    expect(panel).toContain("'Ready to establish'");
    expect(panel, 'the ready label is no longer gated on the owner eligibility').toMatch(
      /eligibility\.ok[\s\S]{0,80}'Ready to establish'/,
    );
  });
});

describe('R8 — every goal card reports progress from the challenge\'s own targets', () => {
  it('gives each unfinished initial challenge a non-empty current / target row', () => {
    const state = world();
    for (const challenge of INITIAL_CHALLENGES) {
      const row = getChallengeProgress({ ...challenge, completed: false }, state);
      expect(row, `${challenge.id} has no progress row`).not.toBeNull();
      expect(row?.target, challenge.id).toBeGreaterThan(0);
      expect(row?.unit.length, challenge.id).toBeGreaterThan(0);
    }
  });

  it('counts Growing Village in completed player buildings and Century Mark in years', () => {
    const state = world();
    const growing = INITIAL_CHALLENGES.find((c) => c.id === 'growing_village');
    const century = INITIAL_CHALLENGES.find((c) => c.id === 'century');
    expect(growing, 'fixture premise: the challenge exists').toBeTruthy();
    expect(century, 'fixture premise: the challenge exists').toBeTruthy();

    const before = getChallengeProgress({ ...growing!, completed: false }, state);
    expect(before).toMatchObject({ target: 5, unit: 'buildings' });
    state.buildings.push(completedPlayerHouse(9001));
    expect(getChallengeProgress({ ...growing!, completed: false }, state)?.current)
      .toBe((before?.current ?? 0) + 1);

    state.year = 42;
    expect(getChallengeProgress({ ...century!, completed: false }, state)).toMatchObject({
      current: 42, target: 100, unit: 'years',
    });
  });
});

describe('R22 — the printed defence ratio never rounds across a verdict band', () => {
  it('floors the ratio instead of rounding it up into the next tier', () => {
    const panel = read('src/game/CombatPreviewPanel.tsx');
    expect(panel).toMatch(/Math\.floor\(ratio \* 100\)/);
    expect(panel, 'a rounded ratio can print 135% beside a non-decisive badge')
      .not.toMatch(/Math\.round\(ratio \* 100\)/);
  });
});

describe('R24 — the leadership panel states the vacancy delay its owner uses', () => {
  it('interpolates the owner constant instead of promising "3 months"', () => {
    const panel = read('src/game/VillageLeadershipPanel.tsx');
    expect(panel).toContain('formatElectionDelay(VACANCY_ELECTION_DELAY_YEARS)');
    expect(panel, 'the vacancy delay is typed as prose again').not.toMatch(
      /election is held 3 months later/,
    );
  });
});

describe('R25 — recruitment is priced and gated by its owner', () => {
  it('keeps the village panel on getRecruitSettlerEligibility and RECRUITMENT_COST', () => {
    const panel = read('src/components/tabPanels/VillageTabPanel.tsx');
    expect(panel).toContain('getRecruitSettlerEligibility(state)');
    expect(panel).toContain('RECRUITMENT_COST.food');
    expect(panel).toContain('RECRUITMENT_COST.gold');
    expect(panel, 'the panel re-derives the recruitment price or gate again').not.toMatch(
      /food >= 30|gold >= 20|\(30🍖 20💰\)/,
    );
  });
});

describe('R29 — the household panel reads the village aggregation and assignable beds', () => {
  it('takes its counts and beds from computeVillageStats, and re-derives neither', () => {
    const panel = read('src/game/PopulationPanel.tsx');
    expect(panel).toContain('computeVillageStats(state)');
    // Beds come from the same aggregation (`uiSimSummary.computeVillageStats` → the growth owner's
    // `getTotalBeds`), not from a local sum of `building.occupants`. The panel stopped printing an
    // open-bed figure of its own — that figure is the People screen's stat card — so the guard here
    // is that it reads the owner's bed count rather than recomputing one.
    expect(panel).toContain('villageStats.beds');
    expect(panel, 'the raw tick counters are back').not.toMatch(/state\.workingSettlers|state\.idleSettlers/);
    expect(panel, 'the housing label counts unassignable beds again').not.toMatch(/getOpenBeds\(/);
  });
});
