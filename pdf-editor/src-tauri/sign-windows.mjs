// Signs a Windows installer or executable after a Tauri build.
// Tauri calls this once per artifact with the file path as the first argument.
import { readdirSync, existsSync } from "node:fs"
import { spawnSync } from "node:child_process"
import path from "node:path"

const DEFAULT_TIMESTAMP_URL = "http://timestamp.comodoca.com"

const pfxPath = process.env.PDF_STUDIO_SIGN_PFX
const pfxPassword = process.env.PDF_STUDIO_SIGN_PFX_PASSWORD
const thumbprint = process.env.PDF_STUDIO_SIGN_THUMBPRINT
const timestampUrl = process.env.PDF_STUDIO_SIGN_TIMESTAMP_URL || DEFAULT_TIMESTAMP_URL

function findSigntool() {
  const explicit = process.env.TAURI_WINDOWS_SIGNTOOL_PATH
  if (explicit && existsSync(explicit)) return explicit
  for (const dir of (process.env.PATH || "").split(path.delimiter)) {
    const candidate = path.join(dir, "signtool.exe")
    if (existsSync(candidate)) return candidate
  }
  for (const programDir of ["Program Files (x86)", "Program Files"]) {
    const kitsBin = path.join("C:", programDir, "Windows Kits", "10", "bin")
    if (!existsSync(kitsBin)) continue
    const versions = readdirSync(kitsBin).sort().reverse()
    for (const version of versions) {
      const candidate = path.join(kitsBin, version, "x64", "signtool.exe")
      if (existsSync(candidate)) return candidate
    }
  }
  return null
}

async function main(filePath) {
  if (!filePath) {
    console.error("No file to sign: expected the artifact path as the first argument.")
    process.exit(1)
  }
  if (!pfxPath && !thumbprint) {
    console.log(
      "No signing details in the environment; leaving this artifact unsigned. " +
        "Set PDF_STUDIO_SIGN_PFX and PDF_STUDIO_SIGN_PFX_PASSWORD, or PDF_STUDIO_SIGN_THUMBPRINT.",
    )
    return
  }
  const signtool = findSigntool()
  if (!signtool) {
    throw new Error(
      "signtool.exe was not found; install the Windows SDK or set TAURI_WINDOWS_SIGNTOOL_PATH.",
    )
  }
  const args = ["sign", "/fd", "sha256", "/tr", timestampUrl, "/td", "sha256", "/d", "PDF Studio"]
  if (pfxPath) {
    args.push("/f", pfxPath)
    if (pfxPassword) args.push("/p", pfxPassword)
  } else {
    args.push("/sha1", thumbprint)
  }
  args.push(filePath)

  const result = spawnSync(signtool, args, { stdio: "inherit", windowsHide: true })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`signtool exited with status ${result.status} for ${filePath}`)
  }
}

main(process.argv[2]).catch((error) => {
  console.error(`Code signing failed: ${error?.message ?? error}`)
  process.exit(1)
})
