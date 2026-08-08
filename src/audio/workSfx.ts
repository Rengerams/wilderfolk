/**
 * Work & footstep ambience (Phase 3.3) — quiet, surface-aware procedural sounds.
 *
 * Footsteps: one soft tick per call, pitched by the terrain family under the
 * settler's feet. Work: a single short burst per call, rotated by the active
 * staffed production building. Both are meant to be called throttled from the
 * audio hook (every ~8–10 ticks) so they read as ambience, not noise.
 */
import { scheduleTone } from './scheduler';
import { TerrainType } from '../game/gameTypes';
import type { TerrainType as TerrainTypeName } from '../game/gameTypes';

export type WorkKind = 'chop' | 'mine' | 'hammer' | 'farm' | 'gather';

const WATER_SURFACES = new Set<TerrainTypeName>([
  TerrainType.DeepWater,
  TerrainType.ShallowWater,
  TerrainType.River,
]);

const STONE_SURFACES = new Set<TerrainTypeName>([
  TerrainType.Hills,
  TerrainType.Mountains,
  TerrainType.Rocky,
]);

/** One soft footstep — pitch/texture varies by the surface underfoot. */
export function playFootstepSfx(surface: TerrainTypeName): void {
  if (WATER_SURFACES.has(surface)) {
    // Splashy plip
    scheduleTone('sfx', 340, 0.06, 0.035, 'sine');
    scheduleTone('sfx', 260, 0.07, 0.03, 'sine', 0.03);
    return;
  }
  if (STONE_SURFACES.has(surface)) {
    // Hard short tick
    scheduleTone('sfx', 210, 0.04, 0.04, 'square');
    return;
  }
  if (surface === TerrainType.Snow) {
    // Muffled crunch
    scheduleTone('sfx', 120, 0.09, 0.045, 'sine');
    return;
  }
  if (surface === TerrainType.Forest || surface === TerrainType.DarkForest) {
    // Leafy rustle
    scheduleTone('sfx', 170, 0.06, 0.035, 'triangle');
    return;
  }
  // Grass / dirt / beach / riverbank — the soft default
  scheduleTone('sfx', 150, 0.05, 0.04, 'sine');
}

/** One work burst — short and low so it sits under the music. */
export function playWorkSfx(kind: WorkKind): void {
  switch (kind) {
    case 'chop':
      scheduleTone('sfx', 95, 0.09, 0.06, 'triangle');
      scheduleTone('sfx', 80, 0.1, 0.05, 'triangle', 0.08);
      break;
    case 'mine':
      scheduleTone('sfx', 260, 0.03, 0.045, 'square');
      scheduleTone('sfx', 140, 0.07, 0.05, 'triangle', 0.02);
      break;
    case 'hammer':
      scheduleTone('sfx', 480, 0.03, 0.04, 'square');
      scheduleTone('sfx', 320, 0.05, 0.045, 'square', 0.04);
      break;
    case 'farm':
      // Soft soil rustle
      scheduleTone('sfx', 130, 0.08, 0.04, 'sine');
      scheduleTone('sfx', 160, 0.06, 0.035, 'sine', 0.05);
      break;
    case 'gather':
      // Light pluck
      scheduleTone('sfx', 220, 0.05, 0.04, 'triangle');
      break;
  }
}
