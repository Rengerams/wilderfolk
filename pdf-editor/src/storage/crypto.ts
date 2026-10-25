/** AES-GCM encryption for documents at rest. The passphrase only ever lives in memory. */
import { t } from "../i18n/translate"

const PBKDF2_ITERATIONS = 600_000
const LEGACY_PBKDF2_ITERATIONS = 150_000
const KEY_LENGTH = 256
const SALT_LENGTH = 16
const IV_LENGTH = 12

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase).buffer as ArrayBuffer,
    "PBKDF2",
    false,
    ["deriveKey"],
  )
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt.buffer as ArrayBuffer, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"],
  )
}

/** Layout: salt | iv | ciphertext */
export async function encryptBytes(bytes: Uint8Array, passphrase: string): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const key = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS)
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bytes as BufferSource),
  )
  const output = new Uint8Array(salt.length + iv.length + cipher.length)
  output.set(salt, 0)
  output.set(iv, salt.length)
  output.set(cipher, salt.length + iv.length)
  return output
}

export async function decryptBytes(payload: Uint8Array, passphrase: string): Promise<Uint8Array> {
  if (payload.length <= SALT_LENGTH + IV_LENGTH) {
    throw new Error(t("This stored document cannot be read."))
  }
  const salt = payload.slice(0, SALT_LENGTH)
  const iv = payload.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH)
  const cipher = payload.slice(SALT_LENGTH + IV_LENGTH)
  for (const iterations of [PBKDF2_ITERATIONS, LEGACY_PBKDF2_ITERATIONS]) {
    try {
      const key = await deriveKey(passphrase, salt, iterations)
      const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher as BufferSource)
      return new Uint8Array(plain)
    } catch {
      // The second pass still opens documents saved with the older, weaker derivation.
    }
  }
  throw new Error(t("That passphrase does not match this document."))
}
