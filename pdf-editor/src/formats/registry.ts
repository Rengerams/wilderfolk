import { t } from "../i18n/translate"

export type ExportFormatId = "pdf" | "png" | "jpeg" | "txt" | "docx" | "html" | "odt" | "svg"

export type FormatAdapter = {
  id: ExportFormatId
  label: string
  extension: string
  direction: "import" | "export" | "both"
  status: "ready" | "planned"
  note: string
}

/** Adding a format means adding an adapter here and an implementation in `runExport`. */
export const FORMAT_ADAPTERS: FormatAdapter[] = [
  {
    id: "pdf",
    label: "PDF document",
    extension: "pdf",
    direction: "both",
    status: "ready",
    note: "Full fidelity: pages, text, images, annotations and document details.",
  },
  {
    id: "png",
    label: "PNG images",
    extension: "png",
    direction: "export",
    status: "ready",
    note: "One lossless image per page — good for slides and printing.",
  },
  {
    id: "jpeg",
    label: "JPEG images",
    extension: "jpg",
    direction: "export",
    status: "ready",
    note: "One compact image per page — good for sharing.",
  },
  {
    id: "txt",
    label: "Plain text",
    extension: "txt",
    direction: "export",
    status: "ready",
    note: "Text of the file, including any text recognized by OCR.",
  },
  {
    id: "docx",
    label: "Word document",
    extension: "docx",
    direction: "export",
    status: "planned",
    note: "Extension slot: a plugin adapter can register this format later.",
  },
  {
    id: "html",
    label: "Web page",
    extension: "html",
    direction: "export",
    status: "planned",
    note: "Extension slot: not installed in this build.",
  },
  {
    id: "odt",
    label: "OpenDocument text",
    extension: "odt",
    direction: "export",
    status: "planned",
    note: "Extension slot: not installed in this build.",
  },
  {
    id: "svg",
    label: "Vector graphics",
    extension: "svg",
    direction: "export",
    status: "planned",
    note: "Extension slot: not installed in this build.",
  },
]

export function adapterById(id: ExportFormatId): FormatAdapter {
  const adapter = FORMAT_ADAPTERS.find((entry) => entry.id === id)
  if (!adapter) throw new Error(`Unknown format: ${id}`)
  return adapter
}

export type ExportArtifact = { filename: string; blob: Blob }

export type ExportRequest = {
  baseName: string
  buildPdf: () => Promise<Uint8Array>
  extractText: () => Promise<string>
  renderPages: (mime: "image/png" | "image/jpeg") => Promise<ExportArtifact[]>
}

export async function runExport(
  format: ExportFormatId,
  request: ExportRequest,
): Promise<ExportArtifact[]> {
  const adapter = adapterById(format)
  if (adapter.status !== "ready") {
    throw new Error(
      t("{format} is an extension slot and is not installed in this build.", {
        format: t(adapter.label),
      }),
    )
  }
  switch (format) {
    case "pdf": {
      const bytes = await request.buildPdf()
      return [
        {
          filename: `${request.baseName}.pdf`,
          blob: new Blob([bytes as BlobPart], { type: "application/pdf" }),
        },
      ]
    }
    case "txt": {
      const text = await request.extractText()
      return [
        {
          filename: `${request.baseName}.txt`,
          blob: new Blob([text], { type: "text/plain;charset=utf-8" }),
        },
      ]
    }
    case "png":
    case "jpeg":
      return request.renderPages(format === "png" ? "image/png" : "image/jpeg")
    default:
      throw new Error(
        t("{format} is not installed in this build.", { format: t(adapter.label) }),
      )
  }
}
