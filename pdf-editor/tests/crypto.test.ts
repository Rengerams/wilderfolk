import { describe, expect, it } from "vitest"
import { decryptBytes, encryptBytes } from "../src/storage/crypto"

const LEGACY_ITERATIONS = 150_000

/** Builds a record in the salt | iv | cipher layout with the pre-hardening iteration count. */
async function legacyEncrypt(bytes: Uint8Array, passphrase: string): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase).buffer as ArrayBuffer,
    "PBKDF2",
    false,
    ["deriveKey"],
  )
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt.buffer as ArrayBuffer, iterations: LEGACY_ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  )
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv.buffer as ArrayBuffer }, key, bytes as BufferSource),
  )
  const output = new Uint8Array(salt.length + iv.length + cipher.length)
  output.set(salt, 0)
  output.set(iv, salt.length)
  output.set(cipher, salt.length + iv.length)
  return output
}

describe("library encryption", () => {
  it("round-trips a document at the stronger derivation", async () => {
    const payload = new TextEncoder().encode("%PDF-1.7 round trip")
    const stored = await encryptBytes(payload, "correct horse")
    expect(await decryptBytes(stored, "correct horse")).toEqual(payload)
  })

  it("still opens documents saved with the legacy derivation", async () => {
    const payload = new TextEncoder().encode("%PDF-1.7 legacy")
    const stored = await legacyEncrypt(payload, "old record")
    expect(await decryptBytes(stored, "old record")).toEqual(payload)
  })

  it("rejects a wrong passphrase", async () => {
    const payload = new TextEncoder().encode("%PDF-1.7 secret")
    const stored = await encryptBytes(payload, "correct horse")
    await expect(decryptBytes(stored, "wrong horse")).rejects.toThrow()
  })
})
