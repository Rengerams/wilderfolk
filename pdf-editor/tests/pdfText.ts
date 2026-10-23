import { inflateSync } from "node:zlib"

/** PDF content streams are usually compressed, and drawn text may be a literal or a hex string. */
export function contentStreams(bytes: Uint8Array): string {
  const buffer = Buffer.from(bytes)
  const parts: string[] = []
  let cursor = 0
  for (;;) {
    const start = buffer.indexOf("stream", cursor)
    if (start < 0) break
    const end = buffer.indexOf("endstream", start)
    if (end < 0) break
    let chunk = buffer.subarray(start + 6, end)
    while (chunk.length > 0 && (chunk[0] === 10 || chunk[0] === 13)) chunk = chunk.subarray(1)
    try {
      parts.push(inflateSync(chunk).toString("latin1"))
    } catch {
      parts.push(chunk.toString("latin1"))
    }
    cursor = end + 9
  }
  return parts.join("\n").toLowerCase()
}

export function hasText(haystack: string, text: string): boolean {
  return (
    haystack.includes(text.toLowerCase()) ||
    haystack.includes(Buffer.from(text).toString("hex"))
  )
}
