import type { StoredDocMeta } from "../types"
import { t } from "../i18n/translate"
import { decryptBytes, encryptBytes } from "./crypto"
import { getPassphrase, type AppSettings } from "./settings"

export class LibraryLockedError extends Error {}

export function isLibraryLocked(error: unknown): boolean {
  return error instanceof LibraryLockedError
}

export type WriteRequest = {
  id: string
  name: string
  pages: number
  bytes: Uint8Array
  /** Ignore a newer copy already stored remotely. */
  force?: boolean
}

export interface StorageProvider {
  id: "local" | "cloud"
  label: string
  supports: { encryption: boolean; conflictDetection: boolean }
  list(): Promise<StoredDocMeta[]>
  read(id: string): Promise<Uint8Array>
  write(request: WriteRequest): Promise<StoredDocMeta>
  remove(id: string): Promise<void>
  probe?(): Promise<string>
}

const DB_NAME = "pdf-studio-library"
const DB_VERSION = 1
const RECORD_STORE = "documents"

type StoredRecord = {
  id: string
  name: string
  size: number
  pages: number
  updatedAt: string
  encrypted: boolean
  bytes: ArrayBuffer
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(RECORD_STORE)) {
        database.createObjectStore(RECORD_STORE, { keyPath: "id" })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(new Error(t("The local library is unavailable in this browser.")))
  })
}

async function runRequest<T>(
  mode: IDBTransactionMode,
  build: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase()
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(RECORD_STORE, mode)
    const request = build(transaction.objectStore(RECORD_STORE))
    // Success is signalled only when the transaction commits; an abort must surface as an error.
    transaction.oncomplete = () => {
      database.close()
      resolve(request.result)
    }
    transaction.onabort = () => {
      database.close()
      reject(request.error ?? new Error(t("The local library could not be written.")))
    }
    request.onerror = () => reject(request.error ?? new Error(t("The local library could not be written.")))
  })
}

class LocalLibraryProvider implements StorageProvider {
  readonly id = "local" as const
  readonly label = "Local library"
  readonly supports = { encryption: true, conflictDetection: false }

  async list(): Promise<StoredDocMeta[]> {
    const records = await runRequest<StoredRecord[]>("readonly", (store) => store.getAll())
    return records
      .map((record) => ({
        id: record.id,
        name: record.name,
        size: record.size,
        updatedAt: record.updatedAt,
        pages: record.pages,
        encrypted: record.encrypted,
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  async read(id: string): Promise<Uint8Array> {
    const record = await runRequest<StoredRecord | undefined>("readonly", (store) => store.get(id))
    if (!record) throw new Error(t("That document is no longer in the library."))
    const bytes = new Uint8Array(record.bytes)
    if (!record.encrypted) return bytes
    const passphrase = getPassphrase()
    if (passphrase.length === 0) {
      throw new LibraryLockedError(t("This document is encrypted. Enter your library passphrase."))
    }
    return decryptBytes(bytes, passphrase)
  }

  async write(request: WriteRequest): Promise<StoredDocMeta> {
    const passphrase = getPassphrase()
    const encrypted = this.encryptEnabled
    if (encrypted && passphrase.length === 0) {
      throw new LibraryLockedError(
        t("Set your library passphrase before saving encrypted documents."),
      )
    }
    const payload = encrypted ? await encryptBytes(request.bytes, passphrase) : request.bytes
    const record: StoredRecord = {
      id: request.id,
      name: request.name,
      size: request.bytes.byteLength,
      pages: request.pages,
      updatedAt: new Date().toISOString(),
      encrypted,
      bytes: payload.slice().buffer as ArrayBuffer,
    }
    await runRequest("readwrite", (store) => store.put(record))
    return {
      id: record.id,
      name: record.name,
      size: record.size,
      updatedAt: record.updatedAt,
      pages: record.pages,
      encrypted: record.encrypted,
    }
  }

  async remove(id: string): Promise<void> {
    await runRequest("readwrite", (store) => store.delete(id))
  }

  encryptEnabled = false
}

class HttpCloudProvider implements StorageProvider {
  readonly id = "cloud" as const
  readonly label = "Cloud storage"
  readonly supports = { encryption: false, conflictDetection: true }

  constructor(
    private readonly endpoint: string,
    private readonly token: string,
  ) {}

  private url(path: string): string {
    return `${this.endpoint.replace(/\/+$/, "")}${path}`
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return this.token.trim().length > 0
      ? { Authorization: `Bearer ${this.token}`, ...extra }
      : extra
  }

  async list(): Promise<StoredDocMeta[]> {
    const response = await fetch(this.url("/documents"), { headers: this.headers() })
    if (!response.ok) {
      throw new Error(t("Cloud storage answered {status}.", { status: response.status }))
    }
    const payload: unknown = await response.json()
    if (!Array.isArray(payload)) return []
    return (payload as StoredDocMeta[]).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  async read(id: string): Promise<Uint8Array> {
    const response = await fetch(this.url(`/documents/${encodeURIComponent(id)}`), {
      headers: this.headers(),
    })
    if (!response.ok) {
      throw new Error(t("Cloud storage answered {status}.", { status: response.status }))
    }
    return new Uint8Array(await response.arrayBuffer())
  }

  /** The endpoint is expected to answer 409 when it already holds a newer revision. */
  async write(request: WriteRequest): Promise<StoredDocMeta> {
    const updatedAt = new Date().toISOString()
    const response = await fetch(this.url(`/documents/${encodeURIComponent(request.id)}`), {
      method: "PUT",
      headers: this.headers({
        "Content-Type": "application/pdf",
        "X-Document-Name": encodeURIComponent(request.name),
        "X-Document-Pages": String(request.pages),
        "X-Document-Updated-At": updatedAt,
        ...(request.force ? { "X-Document-Force": "1" } : {}),
      }),
      body: request.bytes as BodyInit,
    })
    if (response.status === 409) {
      throw new Error(
        t("The cloud copy is newer than this one. Open it before saving, or save a copy to keep both."),
      )
    }
    if (!response.ok) {
      throw new Error(t("Cloud storage refused the upload ({status}).", { status: response.status }))
    }
    return {
      id: request.id,
      name: request.name,
      size: request.bytes.byteLength,
      updatedAt,
      pages: request.pages,
      encrypted: false,
    }
  }

  async remove(id: string): Promise<void> {
    const response = await fetch(this.url(`/documents/${encodeURIComponent(id)}`), {
      method: "DELETE",
      headers: this.headers(),
    })
    if (!response.ok) {
      throw new Error(t("Cloud storage refused the delete ({status}).", { status: response.status }))
    }
  }

  async probe(): Promise<string> {
    const documents = await this.list()
    return t(
      documents.length === 1
        ? "Connected — {count} document available."
        : "Connected — {count} documents available.",
      { count: documents.length },
    )
  }
}

export function createProvider(settings: AppSettings): StorageProvider {
  if (settings.provider === "cloud" && settings.cloudEndpoint.trim().length > 0) {
    return new HttpCloudProvider(settings.cloudEndpoint, settings.cloudToken)
  }
  const provider = new LocalLibraryProvider()
  provider.encryptEnabled = settings.encryptLibrary
  return provider
}
