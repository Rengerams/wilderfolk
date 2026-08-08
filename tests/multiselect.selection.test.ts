/**
 * Regression: multi-select (shift-click) plumbing — the view carries a
 * selectedEntityIds array alongside the primary id; dead entities are pruned,
 * saves restore it, and the render snapshot exposes the full selection so all
 * selected settlers draw a ring.
 */
import { describe, it, expect } from 'vitest';
import { initGame } from '../src/game/worldGen';
import { EntityType } from '../src/game/gameTypes';
import type { Entity } from '../src/game/gameTypes';
import {
  createInitialView,
  sanitizeViewSelection,
  createViewFromSave,
} from '../src/game/viewState';
import { buildRenderSnapshot } from '../src/game/renderSnapshot';

/** Guarantee at least n alive player humans exist (clone one if the map spawns fewer). */
function ensureHumans(state: ReturnType<typeof initGame>, n: number): Entity[] {
  const alive = state.entities.filter((e) => e.type === EntityType.Human && e.alive);
  while (alive.length < n) {
    const template = alive[0]!;
    const clone: Entity = { ...template, id: 90000 + alive.length, name: `Clone${alive.length}` };
    state.entities.push(clone);
    alive.push(clone);
  }
  return alive;
}

describe('multi-select view plumbing', () => {
  it('sanitize keeps live ids and drops dead ones from selectedEntityIds', () => {
    const state = initGame();
    const [a, b, c] = ensureHumans(state, 3);
    const view = {
      ...createInitialView(state.width, state.height),
      selectedEntityIds: [a.id, b.id, c.id],
      selectedEntityId: c.id,
    };
    b.alive = false;

    const cleaned = sanitizeViewSelection(state, view);
    expect(cleaned.selectedEntityIds).toContain(a.id);
    expect(cleaned.selectedEntityIds).not.toContain(b.id);
    expect(cleaned.selectedEntityIds).toContain(c.id);
  });

  it('save/restore round-trips the multi-selection', () => {
    const state = initGame();
    const settlers = ensureHumans(state, 2);
    const view = {
      ...createInitialView(state.width, state.height),
      selectedEntityIds: settlers.map((s) => s.id),
      selectedEntityId: settlers[1]!.id,
    };

    const saved = JSON.parse(JSON.stringify({
      ...state,
      ...sanitizeViewSelection(state, view),
    }));
    const restored = createViewFromSave(saved, state);
    expect(restored.selectedEntityIds).toEqual(settlers.map((s) => s.id));
    expect(restored.selectedEntityId).toBe(settlers[1]!.id);
  });

  it('the render snapshot exposes the full multi-selection', () => {
    const state = initGame();
    const settlers = ensureHumans(state, 3);
    const view = {
      ...createInitialView(state.width, state.height),
      selectedEntityIds: settlers.map((s) => s.id),
      selectedEntityId: settlers[0]!.id,
    };
    const snap = buildRenderSnapshot(state, view);
    expect(snap.selectedEntityIds).toEqual(settlers.map((s) => s.id));
    expect(snap.selectedEntity?.id).toBe(settlers[0]!.id);
  });

  it('legacy views without selectedEntityIds fall back to the single selection', () => {
    const state = initGame();
    const first = ensureHumans(state, 1)[0]!;
    const view = {
      ...createInitialView(state.width, state.height),
      selectedEntityIds: undefined as unknown as number[],
      selectedEntityId: first.id,
    };
    const snap = buildRenderSnapshot(state, view);
    expect(snap.selectedEntityIds).toEqual([first.id]);
  });

  it('a dead primary is dropped by sanitize but the array still keeps the rest', () => {
    const state = initGame();
    const [a, b] = ensureHumans(state, 2);
    a.alive = false;
    const view = {
      ...createInitialView(state.width, state.height),
      selectedEntityIds: [a.id, b.id],
      selectedEntityId: a.id,
    };
    const cleaned = sanitizeViewSelection(state, view);
    expect(cleaned.selectedEntityId).toBeNull();
    expect(cleaned.selectedEntityIds).toEqual([b.id]);
  });
});
