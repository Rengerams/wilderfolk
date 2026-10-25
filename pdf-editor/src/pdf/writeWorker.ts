import { buildPdfBytes, type BuildInput } from "./buildPdf"

// Worker entry: answers one build request per message, off the interface thread.
type BuildRequest = { id: number; input: BuildInput }
type BuildResponse =
  | { id: number; ok: true; bytes: Uint8Array }
  | { id: number; ok: false; message: string }

self.onmessage = async (event: MessageEvent<BuildRequest>) => {
  const { id, input } = event.data
  try {
    const bytes = await buildPdfBytes(input)
    const response: BuildResponse = { id, ok: true, bytes }
    self.postMessage(response)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const response: BuildResponse = { id, ok: false, message }
    self.postMessage(response)
  }
}
