/** Pause or resume an HTMLAudioElement when global mute toggles. */
export function syncHtmlAudioMute(
  htmlAudio: HTMLAudioElement | null,
  muted: boolean,
  shouldResume: boolean,
): void {
  if (!htmlAudio) return;
  if (muted) {
    htmlAudio.pause();
  } else if (shouldResume) {
    void htmlAudio.play().catch(() => undefined);
  }
}

/**
 * Element volume for one track outside the Web Audio buses: its own track gain times the music path
 * gain, clamped to 0–1 because `element.volume` throws above 1.
 */
export function htmlAudioVolumeForPath(trackVolume: number, musicPathGain: number): number {
  return Math.min(1, Math.max(0, trackVolume * musicPathGain));
}

/** Apply {@link htmlAudioVolumeForPath} to a live element. */
export function syncHtmlAudioVolume(
  htmlAudio: HTMLAudioElement | null,
  trackVolume: number,
  musicPathGain: number,
): void {
  if (!htmlAudio) return;
  htmlAudio.volume = htmlAudioVolumeForPath(trackVolume, musicPathGain);
}
