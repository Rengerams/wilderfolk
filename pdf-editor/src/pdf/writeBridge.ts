import type { BuildInput } from "./buildPdf"

// Main-thread client for the pdf-lib build worker; see writeWorker.ts for the protocol.
type BuildRequest = { id: number; input: BuildInput }
type BuildResponse =
  | { id: number; ok: true; bytes: Uint8Array }
  | { id: number; ok: false; message: string }

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, { resolve: (bytes: Uint8Array) => void; reject: (error: Error) => void }>()

function ensureWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL("./writeWorker.ts", import.meta.url), { type: "module" })
  worker.onmessage = (event: MessageEvent<BuildResponse>) => {
    const entry = pending.get(event.data.id)
    if (!entry) return
    pending.delete(event.data.id)
    if (event.data.ok) entry.resolve(event.data.bytes)
    else entry.reject(new Error(event.data.message))
  }
  worker.onerror = () => {
    // Drop the broken worker and fail what is waiting; the next build starts a fresh one.
    const waiting = [...pending.values()]
    pending.clear()
    worker?.terminate()
    worker = null
    for (const entry of waiting) entry.reject(new Error("The PDF writer failed unexpectedly."))
  }
  return worker
}

/** Builds a PDF on the worker thread, keeping the interface free during save, export and split. */
export async function buildPdfOffThread(input: BuildInput): Promise<Uint8Array> {
  const id = nextId
  nextId += 1
  const current = ensureWorker()
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    const request: BuildRequest = { id, input }
    current.postMessage(request)
  })
}
