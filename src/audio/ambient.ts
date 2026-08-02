import { audioGraph } from './graph';
import { ambientPlayer } from './trackPlayer';
import { TRACKS, TRACK_VOLUMES } from './tracks';

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * Soft continuous nature bed under gameplay music.
 * No day/night track swaps (birds → crickets was jarring every dusk/dawn).
 */
class AmbientNaturePlayer {
  private running = false;
  private oneShotTimer: ReturnType<typeof setTimeout> | null = null;

  get isRunning() {
    return this.running;
  }

  private isAudible(): boolean {
    return this.running && ambientPlayer.currentUrl != null;
  }

  async ensurePlaying(): Promise<void> {
    if (this.isAudible()) return;
    if (this.running) this.stop();
    await this.start();
  }

  /** Kept for director API — does not change beds anymore. */
  setNightMode(_isNight: boolean) {
    /* no-op: continuous ambience */
  }

  async start() {
    if (this.running) return;
    this.running = true;
    await this.playLoopBed();
    this.rescheduleOneShot();
  }

  stop() {
    this.running = false;
    this.clearOneShotTimer();
    ambientPlayer.stop(0.8);
  }

  private async playLoopBed() {
    if (!this.running || audioGraph.isMuted) return;
    // Quiet continuous birds under the music bed (same day & night)
    await ambientPlayer.playLoop(TRACKS.birdsLoop, 'ambient', TRACK_VOLUMES.birdsLoop * 0.75, 1.6);
  }

  private rescheduleOneShot() {
    this.clearOneShotTimer();
    if (!this.running) return;

    // Sparse chirps — not every few seconds
    const delayMs = randomBetween(45_000, 100_000);

    this.oneShotTimer = setTimeout(() => {
      void this.playOneShot();
      this.rescheduleOneShot();
    }, delayMs);
  }

  private async playOneShot() {
    if (!this.running || audioGraph.isMuted) return;

    await ambientPlayer.playOneShot(
      TRACKS.birdChirp,
      'ambient',
      TRACK_VOLUMES.birdChirp * (0.55 + Math.random() * 0.25),
      0.95 + Math.random() * 0.15,
    );
  }

  private clearOneShotTimer() {
    if (!this.oneShotTimer) return;
    clearTimeout(this.oneShotTimer);
    this.oneShotTimer = null;
  }
}

export const ambientNature = new AmbientNaturePlayer();