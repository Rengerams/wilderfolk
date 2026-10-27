/**
 * Presentation-only smoothing of `building.constructionProgress`.
 *
 * The completeness value is decided **once per colony day** (`tickBuildingProgress`, daily
 * cadence — see `simulation/decisionRegistry.ts`), so a bar drawn straight from it is frozen for a
 * whole game day and then jumps: at 1x a day is 72 real seconds, and a one-day build steps ~45% in
 * one frame. Owner report: "when they building the % is not going up for completeness".
 *
 * This module does not touch the simulation. It remembers the previous authoritative value per
 * building and ramps the *displayed* number across the day, landing exactly on the authoritative
 * value as the next daily step arrives. Consumers: the canvas progress bar/number
 * (`renderer/buildings.ts`) and the building inspector's "Progress" line.
 */
import type { Building } from './gameTypes';
import { TICKS_PER_DAY } from './dayCycle';

interface ProgressSample {
  /** Displayed value when this ramp started. */
  from: number;
  /** Authoritative value this ramp is heading for. */
  to: number;
  /** Tick at which the authoritative value arrived. */
  atTick: number;
}

const samples = new Map<number, ProgressSample>();

/**
 * Upper bound on remembered buildings. A finished building drops its sample (see
 * {@link displayedConstructionProgress}), so in normal play this only ever holds builds in flight;
 * the cap covers sites demolished before they finished, whose entry nothing else would ever
 * reclaim. Same eviction shape as `shared.ts`'s `NAME_WIDTH_CACHE_MAX`.
 */
const MAX_PROGRESS_SAMPLES = 512;

/** The value the progress bar and the on-canvas percentage should show for this frame. */
export function displayedConstructionProgress(building: Building, tick: number): number {
  const value = building.constructionProgress;

  // Finished: there is nothing left to ramp (the ramp landed on the authoritative value), and
  // holding the sample would leak one entry per building id ever displayed — ids are not reused,
  // so a demolished or completed site was never reclaimed for the life of the session.
  if (value >= 100) {
    samples.delete(building.id);
    return 100;
  }

  const sample = samples.get(building.id);

  // First sight of this building, a rewind (a loaded world), or a reused id whose progress is
  // behind the sample: start a fresh ramp rather than interpolating between unrelated builds.
  if (!sample || tick < sample.atTick || value < sample.to) {
    if (samples.size >= MAX_PROGRESS_SAMPLES) {
      const oldest = samples.keys().next().value;
      if (oldest != null) samples.delete(oldest);
    }
    samples.set(building.id, { from: value, to: value, atTick: tick });
    return value;
  }

  if (value !== sample.to) {
    // A new daily step arrived. Ramp from where the display had reached toward the new value, so
    // the bar keeps moving instead of standing still and then jumping.
    const from = ramp(sample, tick);
    samples.set(building.id, { from, to: value, atTick: tick });
    return from;
  }

  return ramp(sample, tick);
}

function ramp(sample: ProgressSample, tick: number): number {
  if (sample.to <= sample.from) return sample.to;
  const progress = Math.min(1, Math.max(0, (tick - sample.atTick) / TICKS_PER_DAY));
  return sample.from + (sample.to - sample.from) * progress;
}