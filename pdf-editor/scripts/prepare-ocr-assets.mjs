// Installs the OCR engine's worker, core and language data into public/ocr so the installer ships them.
import { copyFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const target = join(root, "public", "ocr")
const modules = join(root, "node_modules")

const LANGUAGE_DATA_URL = "https://cdn.jsdelivr.net/npm/@tesseract.js-data"
const LANGUAGE_DATA_VERSION = "4.0.0_best_int"
const CORE_BUILDS = [
  "tesseract-core-relaxedsimd-lstm",
  "tesseract-core-simd-lstm",
  "tesseract-core-lstm",
]

/** Reads the one language list the OCR dialog offers, so no offered language is missing. */
async function ocrLanguages() {
  const source = await readFile(join(root, "src", "pdf", "ocr.ts"), "utf8")
  return [...new Set([...source.matchAll(/code:\s*"([a-z]{3})"/g)].map((match) => match[1]))]
}

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/** A temporary file keeps an interrupted run from leaving a half-written language pack behind. */
async function download(url, path) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
      const partial = `${path}.part`
      await writeFile(partial, Buffer.from(await response.arrayBuffer()))
      await rename(partial, path)
      return
    } catch (error) {
      if (attempt === 3) {
        throw new Error(`Could not install ${url}: ${error instanceof Error ? error.message : error}`)
      }
      await new Promise((wait) => setTimeout(wait, attempt * 1000))
    }
  }
}

await mkdir(join(target, "core"), { recursive: true })
await mkdir(join(target, "lang"), { recursive: true })

await copyFile(join(modules, "tesseract.js", "dist", "worker.min.js"), join(target, "worker.min.js"))

for (const build of CORE_BUILDS) {
  for (const suffix of [".wasm.js", ".wasm"]) {
    const name = `${build}${suffix}`
    await copyFile(join(modules, "tesseract.js-core", name), join(target, "core", name))
  }
}

for (const language of await ocrLanguages()) {
  const file = join(target, "lang", `${language}.traineddata.gz`)
  if (await exists(file)) continue
  await download(
    `${LANGUAGE_DATA_URL}/${language}/${LANGUAGE_DATA_VERSION}/${language}.traineddata.gz`,
    file,
  )
  console.log(`installed OCR language data for ${language}`)
}

console.log("OCR engine assets are ready in public/ocr")
