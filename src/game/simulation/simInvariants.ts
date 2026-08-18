/**
 * Simulation invariants — sanity checks run on the whole world every tick.
 *
 * The unit suite tests ~20 ticks of a clean world; this catches the silent
 * corruption class (NaN positions, negative resources, orphaned bonds, cache
 * divergence) that only surfaces after thousands of ticks of accumulated state
 * (the ER-1 byType staleness, ER-3 discarded herd, ER-6 double-drain bugs).
 *
 * Returns a list of violation strings — empty means the world is sane.
 */
import type { WorldState } from '../gameTypes';
import { EntityType } from '../gameTypes';

export function assertSimInvariants(state: WorldState): string[] {
  const violations: string[] = [];
  const alive = state.entities.filter((e) => e.alive);

  // 1. Every alive entity has a finite, in-bounds position and finite energy.
  for (const e of alive) {
    if (!Number.isFinite(e.x) || !Number.isFinite(e.y)) {
      violations.push(`tick ${state.tick}: entity #${e.id} (${e.type}) has non-finite position (${e.x}, ${e.y})`);
    } else if (e.x < 0 || e.x > state.width || e.y < 0 || e.y > state.height) {
      violations.push(`tick ${state.tick}: entity #${e.id} (${e.type}) out of bounds (${e.x}, ${e.y})`);
    }
    if (!Number.isFinite(e.energy)) {
      violations.push(`tick ${state.tick}: entity #${e.id} (${e.type}) has non-finite energy (${e.energy})`);
    }
  }

  // 2. No negative resources.
  for (const key of ['wood', 'stone', 'food', 'gold', 'iron'] as const) {
    const v = state.resources[key] as number;
    if (!Number.isFinite(v) || v < 0) {
      violations.push(`tick ${state.tick}: resource ${key} is ${v}`);
    }
  }

  // 3. No duplicate entity ids among alive entities.
  const seen = new Set<number>();
  for (const e of alive) {
    if (seen.has(e.id)) {
      violations.push(`tick ${state.tick}: duplicate entity id ${e.id}`);
    }
    seen.add(e.id);
  }

  // 4. childrenIds / partnerId / pregnantById must reference an entity that EXISTS
  // (dead is fine: widowed spouses, fathers who died mid-pregnancy — the birth
  // logic handles those as bastards. Only truly missing ids are corruption).
  const allIds = new Set(state.entities.map((e) => e.id));
  for (const e of alive) {
    if (e.partnerId != null && !allIds.has(e.partnerId)) {
      violations.push(`tick ${state.tick}: #${e.id} partnerId ${e.partnerId} missing`);
    }
    if (e.pregnantById != null && !allIds.has(e.pregnantById)) {
      violations.push(`tick ${state.tick}: #${e.id} pregnantById ${e.pregnantById} missing`);
    }
    for (const cid of e.childrenIds ?? []) {
      if (!allIds.has(cid)) {
        violations.push(`tick ${state.tick}: #${e.id} childrenIds orphan ${cid}`);
        break;
      }
    }
  }

  // 5. entityByType reflects the alive population (cache divergence check).
  if (state.entityByType) {
    let counted = 0;
    for (const bucket of Object.values(state.entityByType)) counted += bucket.length;
    if (counted !== alive.length) {
      violations.push(
        `tick ${state.tick}: entityByType has ${counted} entities but ${alive.length} alive`,
      );
    }
  }

  // 6. wildlifeCounts matches the actual population.
  if (state.wildlifeCounts) {
    const deer = alive.filter((e) => e.type === EntityType.Deer).length;
    if (deer !== (state.wildlifeCounts.deer ?? 0)) {
      violations.push(`tick ${state.tick}: wildlifeCounts.deer ${state.wildlifeCounts.deer} != actual ${deer}`);
    }
  }

  return violations;
}
