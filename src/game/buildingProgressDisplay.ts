/**
 * Presentation-only smoothing of `building.constructionProgress`, which advances once per colony day.
 * Ramps the displayed value across the day onto the authoritative value; never mutates the sim.
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
 * Upper bound on remembered buildings; the cap covers sites demolished before finishing, whose
 * sample nothing else reclaims.
 */
const MAX_PROGRESS_SAMPLES = 512;

/** The value the progress bar and the on-canvas percentage should show for this frame. */
export function displayedConstructionProgress(building: Building, tick: number): number {
  const value = building.constructionProgress;

  // Finished: drop the sample, or one entry leaks per building id ever displayed.
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