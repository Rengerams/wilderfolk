import type { ImportedImage } from "../app/store"
import { t } from "../i18n/translate"

/** Camera capture for PCs without a scanner driver: photograph the page instead. */

let activeStream: MediaStream | null = null

export function cameraSupported(): boolean {
  return typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia)
}

export async function startCamera(video: HTMLVideoElement): Promise<void> {
  if (!cameraSupported()) {
    throw new Error(
      t("This browser cannot reach a camera. Use the scan bridge or import scanned files."),
    )
  }
  stopCamera()
  try {
    activeStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "environment",
        width: { ideal: 2560 },
        height: { ideal: 1440 },
      },
      audio: false,
    })
  } catch {
    throw new Error(t("The camera was refused. Allow camera access and try again."))
  }
  video.srcObject = activeStream
  await video.play()
}

export function captureFrame(video: HTMLVideoElement): ImportedImage {
  const width = video.videoWidth
  const height = video.videoHeight
  if (width === 0 || height === 0) throw new Error(t("The camera has not produced a picture yet."))
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d")
  if (!context) throw new Error(t("Canvas is not available in this browser."))
  context.drawImage(video, 0, 0, width, height)
  return {
    dataUrl: canvas.toDataURL("image/png"),
    mime: "image/png",
    width,
    height,
  }
}

export function stopCamera(): void {
  for (const track of activeStream?.getTracks() ?? []) track.stop()
  activeStream = null
}
