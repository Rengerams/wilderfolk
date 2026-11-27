/**
 * Settler explanation suggestions carry distinct labels, and the dashboard keys those
 * rows by label plus position, never by label alone.
 */
import { describe, expect, it } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { explainSettler } from '../src/game/dashboardData';
import { isPlayerHuman } from '../src/game/playerHuman';

describe('settler explanation labels', () => {
  it('gives a jobless and homeless settler two distinct suggestion rows', () => {
    const state = initGame({ seed: 20_260_917 });
    const settler = state.entities.find((e) => e.alive && isPlayerHuman(e) && !e.isJuvenile);
    expect(settler, 'fixture premise: an adult settler exists').toBeTruthy();
    settler!.workerBuildingId = undefined; // no workplace
    settler!.residenceBuildingId = undefined; // and no home

    const labels = explainSettler(state, settler!.id).map((l) => l.label);
    expect(labels).toContain('Suggested workplace');
    expect(labels).toContain('Suggested home');
    expect(new Set(labels).size, 'the dashboard keys these rows by label').toBe(labels.length);
  });

});
