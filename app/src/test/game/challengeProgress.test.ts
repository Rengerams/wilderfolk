import { describe, expect, it } from 'vitest';
import { initGame } from '@/game/gameEngine';
import { getChallengeProgress } from '@/game/challengeProgress';
import { BuildingType } from '@/game/gameTypes';
import { createBuilding } from '@/game/worldGen';

describe('getChallengeProgress', () => {
  it('growing_village shows combined progress from buildings and years', () => {
    const state = initGame();
    state.year = 2;
    const challenge = state.challenges.find((c) => c.id === 'growing_village')!;
    for (let i = 0; i < 3; i++) {
      const b = createBuilding(BuildingType.House, 100 + i * 50, 100, 10 + i, 0);
      b.completed = true;
      state.buildings.push(b);
    }

    const progress = getChallengeProgress(challenge, state);
    expect(progress).toEqual({ current: 50, target: 100, unit: '%' });
  });

  it('growing_village stays below 100% when only buildings are complete', () => {
    const state = initGame();
    state.year = 3;
    const challenge = state.challenges.find((c) => c.id === 'growing_village')!;
    for (let i = 0; i < 5; i++) {
      const b = createBuilding(BuildingType.House, 100 + i * 50, 100, 20 + i, 0);
      b.completed = true;
      state.buildings.push(b);
    }

    const progress = getChallengeProgress(challenge, state);
    expect(progress).toEqual({ current: 80, target: 100, unit: '%' });
  });

  it('great_city shows combined progress from population and buildings', () => {
    const state = initGame();
    state.humanPopulation = 40;
    const challenge = state.challenges.find((c) => c.id === 'great_city')!;

    const progress = getChallengeProgress(challenge, state);
    expect(progress).toEqual({ current: 8, target: 100, unit: '%' });
  });

  it('great_city stays below 100% when only the building target is met', () => {
    const state = initGame();
    state.humanPopulation = 60;
    const challenge = state.challenges.find((c) => c.id === 'great_city')!;
    for (let i = 0; i < 35; i++) {
      const b = createBuilding(BuildingType.House, 100 + i * 50, 100, 30 + i, 0);
      b.completed = true;
      state.buildings.push(b);
    }

    const progress = getChallengeProgress(challenge, state);
    expect(progress).toEqual({ current: 62, target: 100, unit: '%' });
  });

  it('great_city stays below 100% when only the population target is met', () => {
    const state = initGame();
    state.humanPopulation = 260;
    const challenge = state.challenges.find((c) => c.id === 'great_city')!;
    for (let i = 0; i < 3; i++) {
      const b = createBuilding(BuildingType.House, 100 + i * 50, 100, 30 + i, 0);
      b.completed = true;
      state.buildings.push(b);
    }

    const progress = getChallengeProgress(challenge, state);
    expect(progress).toEqual({ current: 54, target: 100, unit: '%' });
  });
});