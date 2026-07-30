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