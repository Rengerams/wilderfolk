import { describe, expect, it } from 'vitest';
import { initGame } from '@/game/gameEngine';
import { getChallengeProgress } from '@/game/challengeProgress';
import { BuildingType } from '@/game/gameTypes';
import { createBuilding } from '@/game/worldGen';

describe('getChallengeProgress', () => {
  it('growing_village tracks buildings until the building target is met', () => {
    const state = initGame();
    state.year = 2;
    const challenge = state.challenges.find((c) => c.id === 'growing_village')!;
    for (let i = 0; i < 3; i++) {
      const b = createBuilding(BuildingType.House, 100 + i * 50, 100, 10 + i, 0);
      b.completed = true;
      state.buildings.push(b);
    }

    const progress = getChallengeProgress(challenge, state);
    expect(progress).toEqual({ current: 3, target: 5, unit: 'buildings' });
  });

  it('growing_village tracks years once buildings are complete', () => {
    const state = initGame();
    state.year = 3;
    const challenge = state.challenges.find((c) => c.id === 'growing_village')!;
    for (let i = 0; i < 5; i++) {
      const b = createBuilding(BuildingType.House, 100 + i * 50, 100, 20 + i, 0);
      b.completed = true;
      state.buildings.push(b);
    }

    const progress = getChallengeProgress(challenge, state);
    expect(progress).toEqual({ current: 3, target: 5, unit: 'years' });
  });

  it('great_city tracks population first, then buildings', () => {
    const state = initGame();
    state.humanPopulation = 40;
    const challenge = state.challenges.find((c) => c.id === 'great_city')!;

    const progress = getChallengeProgress(challenge, state);
    expect(progress).toEqual({ current: 40, target: 100, unit: 'population' });
  });

  it('great_city stays on buildings once the building target is met', () => {
    const state = initGame();
    state.humanPopulation = 60;
    const challenge = state.challenges.find((c) => c.id === 'great_city')!;
    for (let i = 0; i < 20; i++) {
      const b = createBuilding(BuildingType.House, 100 + i * 50, 100, 30 + i, 0);
      b.completed = true;
      state.buildings.push(b);
    }

    const progress = getChallengeProgress(challenge, state);
    expect(progress).toEqual({ current: 20, target: 20, unit: 'buildings' });
  });

  it('great_city tracks buildings after population target is met', () => {
    const state = initGame();
    state.humanPopulation = 120;
    const challenge = state.challenges.find((c) => c.id === 'great_city')!;
    for (let i = 0; i < 3; i++) {
      const b = createBuilding(BuildingType.House, 100 + i * 50, 100, 30 + i, 0);
      b.completed = true;
      state.buildings.push(b);
    }

    const progress = getChallengeProgress(challenge, state);
    expect(progress).toEqual({ current: 3, target: 20, unit: 'buildings' });
  });
});