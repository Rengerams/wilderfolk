import type { AudioLevels } from './preferences';

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
 * Element volume for one track under a preset — `levels.master × levels.music` folded in.
 *
 * An HTMLAudioElement sits outside the Web Audio bus chain, so the preset reaches it only here.
 * The result is clamped: `element.volume` throws above 1.
 */
export function htmlAudioVolumeForPreset(trackVolume: number, levels: AudioLevels): number {
  return Math.min(1, Math.max(0, trackVolume * levels.master * levels.music));
}

/** Apply {@link htmlAudioVolumeForPreset} to a live element. */
export function syncHtmlAudioVolume(
  htmlAudio: HTMLAudioElement | null,
  trackVolume: number,
  levels: AudioLevels,
): void {
  if (!htmlAudio) return;
  htmlAudio.volume = htmlAudioVolumeForPreset(trackVolume, levels);
}