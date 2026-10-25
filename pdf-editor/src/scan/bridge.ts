import type { ImportedImage } from "../app/store"
import { loadImageElement } from "../app/files"
import { t } from "../i18n/translate"

/** Small HTTP contract implemented by the Windows-side scan bridge (see scan-bridge/). */

export type BridgeDevice = { id: string; name: string; driver?: string }

export type BridgeScanRequest = {
  paperSource: "flatbed" | "feeder"
  pageSize: "a4" | "a5" | "letter" | "legal"
  dpi: 150 | 200 | 300 | 600
  showNativeUI: boolean
  deviceId?: string
}

export const DEFAULT_BRIDGE_URL = "http://127.0.0.1:8765"

function normalizeBridgeUrl(url: string): string {
  return url.trim().replace(/\/+$/, "")
}

/** Marks failures created here so they are never re-wrapped in the generic message. */
class BridgeFailure extends Error {}

function failureMessage(error: unknown): Error {
  if (error instanceof DOMException && error.name === "AbortError") {
    return new BridgeFailure(t("The scanner did not answer in time."))
  }
  if (error instanceof BridgeFailure) return error
  return new BridgeFailure(
    t("No scan bridge answered. Start the PDF Studio scan bridge on this PC, then try again."),
  )
}

async function request<T>(url: string, init: RequestInit, timeoutMs: number): Promise<T> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    if (!response.ok) {
      throw new Error(t("The scan bridge answered {status}.", { status: response.status }))
    }
    return (await response.json()) as T
  } catch (error) {
    throw failureMessage(error)
  } finally {
    window.clearTimeout(timer)
  }
}

export async function listBridgeDevices(bridgeUrl: string): Promise<BridgeDevice[]> {
  const payload = await request<{ devices?: BridgeDevice[] } | BridgeDevice[]>(
    `${normalizeBridgeUrl(bridgeUrl)}/devices`,
    { method: "GET" },
    8_000,
  )
  return Array.isArray(payload) ? payload : (payload.devices ?? [])
}

/** Asking the bridge to scan; a feeder run can take minutes, so the timeout is generous. */
export async function scanViaBridge(
  bridgeUrl: string,
  settings: BridgeScanRequest,
): Promise<ImportedImage[]> {
  const payload = await request<{ pages?: { dataUrl: string; mime?: string }[] }>(
    `${normalizeBridgeUrl(bridgeUrl)}/scan`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    },
    10 * 60_000,
  )
  const pages = payload.pages ?? []
  if (pages.length === 0) throw new Error(t("The scanner returned no pages."))
  const images: ImportedImage[] = []
  for (const page of pages) {
    if (!page.dataUrl) continue
    const element = await loadImageElement(page.dataUrl)
    images.push({
      dataUrl: page.dataUrl,
      mime: page.mime === "image/jpeg" ? "image/jpeg" : "image/png",
      width: element.naturalWidth,
      height: element.naturalHeight,
    })
  }
  if (images.length === 0) throw new Error(t("The scanner returned no readable pages."))
  return images
}
