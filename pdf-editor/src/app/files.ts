/** Browser file helpers: reading untrusted files and handing generated files back to the user. */
import { t } from "../i18n/translate"

export const IMPORT_ACCEPT = "application/pdf,.pdf,image/png,image/jpeg,.png,.jpg,.jpeg"

export const MAX_IMPORT_BYTES = 150 * 1024 * 1024

export async function readFileBytes(file: File): Promise<Uint8Array> {
  if (file.size > MAX_IMPORT_BYTES) {
    throw new Error(t("{name} is larger than 150 MB and was not opened.", { name: file.name }))
  }
  return new Uint8Array(await file.arrayBuffer())
}

export async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result)
      else reject(new Error(t("{name} could not be read.", { name: file.name })))
    }
    reader.onerror = () => reject(new Error(t("{name} could not be read.", { name: file.name })))
    reader.readAsDataURL(file)
  })
}

export function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name)
}

export function isImageFile(file: File): boolean {
  return /^image\/(png|jpeg)$/.test(file.type) || /\.(png|jpe?g)$/i.test(file.name)
}

/** Opens the system file picker; resolves with the chosen files, or null when cancelled. */
export function pickFiles(accept: string, multiple = true): Promise<File[] | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = accept
    input.multiple = multiple
    input.style.display = "none"
    document.body.appendChild(input)
    const finish = (files: File[] | null) => {
      input.remove()
      resolve(files)
    }
    input.addEventListener("change", () => {
      const files = input.files ? Array.from(input.files) : []
      finish(files.length > 0 ? files : null)
    })
    input.addEventListener("cancel", () => finish(null))
    input.click()
  })
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function dataUrlToFile(dataUrl: string, filename: string): File {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl)
  if (!match) throw new Error(t("The generated file could not be assembled."))
  const binary = atob(match[2])
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new File([bytes], filename, { type: match[1] })
}

export function loadImageElement(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(t("That image could not be read.")))
    image.src = dataUrl
  })
}
