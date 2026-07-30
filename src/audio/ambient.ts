import { audioGraph } from './graph';
import { ambientPlayer } from './trackPlayer';
import { TRACKS, TRACK_VOLUMES } from './tracks';

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** Day/night nature ambience — looping beds plus occasional one-shots. */
class AmbientNaturePlayer {
  private running = false;
  private isNight = false;
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

  setNightMode(isNight: boolean) {
    if (this.isNight === isNight) return;
    this.isNight = isNight;
    if (!this.running) return;
    void this.playLoopBed(true);
    this.rescheduleOneShot();
  }

  async start() {
    if (this.running) return;
    this.running = true;
    await this.playLoopBed(false);
    this.rescheduleOneShot();
  }

  stop() {
    this.running = false;
    this.clearOneShotTimer();
    ambientPlayer.stop(0.8);
  }

  private async playLoopBed(crossfade: boolean) {
    if (!this.running || audioGraph.isMuted) return;

    const track = this.isNight ? TRACKS.cricketFrog : TRACKS.birdsLoop;
    const vol = this.isNight ? TRACK_VOLUMES.cricketFrog : TRACK_VOLUMES.birdsLoop;

    if (crossfade) {
      await ambientPlayer.crossfadeLoop(track, 'ambient', vol, 2.5);
      return;
    }

    await ambientPlayer.playLoop(track, 'ambient', vol, 1.6);
  }

  private rescheduleOneShot() {
    this.clearOneShotTimer();
    if (!this.running) return;

    const delayMs = this.isNight
      ? randomBetween(50_000, 120_000)
      : randomBetween(10_000, 28_000);

    this.oneShotTimer = setTimeout(() => {
      void this.playOneShot();
      this.rescheduleOneShot();
    }, delayMs);
  }

  private async playOneShot() {
    if (!this.running || audioGraph.isMuted) return;

    if (this.isNight) {
      await ambientPlayer.playOneShot(
        TRACKS.wolfHowl,
        'ambient',
        TRACK_VOLUMES.wolfHowl * 0.85,
        0.92 + Math.random() * 0.12,
      );
      return;
    }

    await ambientPlayer.playOneShot(
      TRACKS.birdChirp,
      'ambient',
      TRACK_VOLUMES.birdChirp * (0.75 + Math.random() * 0.35),
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