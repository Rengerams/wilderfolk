/**
 * Visitor camps and visitor NPCs are retired from normal gameplay.
 * Strategic rivals, raids and the independent trade-route system remain separate.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initGame } from '../src/game/worldGen';
import { rollYearlyWorldEvent } from '../src/game/groupEvents';
import { resetSimRng, setSimSeed } from '../src/game/simRng';

afterEach(() => resetSimRng());

describe('retired on-map visitor arrivals', () => {
  it('does not mount the old visitor-camp inspector or map hit test', () => {
    const root = process.cwd();
    expect(existsSync(resolve(root, 'src/components/VisitorCampPanel.tsx'))).toBe(false);
    expect(readFileSync(resolve(root, 'src/App.tsx'), 'utf8')).not.toContain('VisitorCampPanel');
    expect(readFileSync(resolve(root, 'src/hooks/useCanvasInteractions.ts'), 'utf8')).not.toContain('hitTestCamp(');
    expect(readFileSync(resolve(root, 'src/components/FrontierPanel.tsx'), 'utf8')).not.toContain('view.visitors');
  });

  it('never selects a visitor camp or creates visitor actors from yearly events', () => {
    for (let seed = 1; seed <= 32; seed++) {
      resetSimRng();
      const state = initGame({ skipTerrain: true, seed });
      setSimSeed(seed);
      const result = rollYearlyWorldEvent(
        state, state.entities, state.buildings, state.width, state.height,
        () => state.nextEntityId++,
      );

      expect(state.visitorGroups, `seed ${seed}`).toHaveLength(0);
      expect(state.entities.some((entity) => entity.faction === 'visitor'), `seed ${seed}`).toBe(false);
      expect(result.event?.id.startsWith('visitor_') ?? false, `seed ${seed}`).toBe(false);
    }
  });
});
