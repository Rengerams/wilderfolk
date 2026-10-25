import { describe, expect, it, vi } from "vitest"
import { prepareOcrLanguages } from "../src/pdf/ocr"

const tesseract = vi.hoisted(() => {
  type MockWorker = {
    recognize: (image: unknown) => Promise<unknown>
    terminate: () => Promise<undefined>
  }
  return {
    createWorker: vi.fn<(language: string, oem: unknown, options: unknown) => Promise<MockWorker>>(
      async () => ({
        recognize: vi.fn<MockWorker["recognize"]>(),
        terminate: vi.fn<MockWorker["terminate"]>(async () => undefined),
      }),
    ),
    OEM: { LSTM_ONLY: 1 },
  }
})

vi.mock("tesseract.js", () => tesseract)

const APP_ORIGIN = "https://pdf-studio.invalid"
const BASE = import.meta.env.BASE_URL

function lastWorkerOptions(): Record<string, string> {
  const options = tesseract.createWorker.mock.calls.at(-1)?.[2]
  if (!options || typeof options !== "object") throw new Error("no worker options were passed")
  return options as Record<string, string>
}

describe("OCR worker assets", () => {
  it("loads the worker, core and language data from the app's own files", async () => {
    await prepareOcrLanguages(["eng"], () => {})

    const options = lastWorkerOptions()
    expect(options.workerPath).toBe(`${BASE}ocr/worker.min.js`)
    expect(options.corePath).toBe(`${BASE}ocr/core`)
    expect(options.langPath).toBe(`${BASE}ocr/lang`)
  })

  it("keeps every engine file on the app's origin instead of the public CDN", async () => {
    await prepareOcrLanguages(["eng"], () => {})

    const options = lastWorkerOptions()
    for (const asset of [options.workerPath, options.corePath, options.langPath]) {
      const resolved = new URL(asset, APP_ORIGIN)
      expect(resolved.origin).toBe(APP_ORIGIN)
      expect(resolved.pathname.startsWith(`${BASE}ocr/`)).toBe(true)
    }
  })

  it("asks for one combined language pack per chosen language", async () => {
    await prepareOcrLanguages(["eng", "nld"], () => {})
    expect(tesseract.createWorker.mock.calls.at(-1)?.[0]).toBe("eng+nld")
  })
})
