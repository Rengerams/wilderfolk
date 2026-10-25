import { useMemo, useState } from "react"
import { Dialog, Field } from "./Dialog"
import { baseNameOf } from "../../app/documentActions"
import { splitDocument, type SplitRequest } from "../../app/splitActions"
import { useEditor } from "../../app/store"
import { downloadBlob } from "../../app/files"
import {
  chunkPageRanges,
  pagesPerFileValue,
  parsePageRanges,
  splitFileName,
  splitSizeLimit,
  type SplitMode,
} from "../../pdf/splitPdf"
import { useT } from "../../i18n"

const MB = 1024 * 1024

export function SplitDialog() {
  const t = useT()
  const closeDialog = useEditor((state) => state.closeDialog)
  const setStatus = useEditor((state) => state.setStatus)
  const pageCount = useEditor((state) => state.doc.pages.length)
  const documentName = useEditor((state) => state.doc.name)
  const [mode, setMode] = useState<SplitMode>("pages")
  const [pagesPerFile, setPagesPerFile] = useState("10")
  const [maxSizeMb, setMaxSizeMb] = useState("5")
  const [rangeInput, setRangeInput] = useState(`1-${Math.min(pageCount, 10)}`)
  const [busy, setBusy] = useState<{ label: string; progress: number } | null>(null)
  const [error, setError] = useState("")

  const baseName = baseNameOf(documentName)
  const pages = Number.parseInt(pagesPerFile, 10)
  const sizeMb = Number(maxSizeMb.replace(",", "."))

  const preview = useMemo(() => {
    try {
      if (mode === "pages") {
        return { count: chunkPageRanges(pageCount, pages).length, error: null }
      }
      if (mode === "ranges") {
        return { count: parsePageRanges(rangeInput, pageCount).length, error: null }
      }
      splitSizeLimit(sizeMb * MB)
      return { count: 0, error: null }
    } catch (previewError) {
      return {
        count: 0,
        error: previewError instanceof Error ? previewError.message : t("The split settings could not be read."),
      }
    }
  }, [mode, pageCount, pages, sizeMb, rangeInput, t])

  const examplePart =
    mode === "pages" && preview.error === null
      ? chunkPageRanges(pageCount, pages)[0]
      : mode === "ranges" && preview.error === null
        ? parsePageRanges(rangeInput, pageCount)[0]
        : { from: 1, to: Math.min(pageCount, 10) }
  const exampleName = splitFileName(baseName, 1, examplePart ?? { from: 1, to: 1 })

  const run = async () => {
    setError("")
    setBusy({ label: t("Preparing…"), progress: 0 })
    try {
      const request: SplitRequest =
        mode === "pages"
          ? { mode: "pages", pagesPerFile: pagesPerFileValue(pages) }
          : mode === "size"
            ? { mode: "size", maxBytes: splitSizeLimit(sizeMb * MB) }
            : { mode: "ranges", input: rangeInput }
      const outputs = await splitDocument(request, (progress, label) => setBusy({ label, progress }))
      for (const output of outputs) {
        downloadBlob(new Blob([output.bytes as BlobPart], { type: "application/pdf" }), output.filename)
      }
      setStatus(
        outputs.length === 1
          ? t("Split into {count} file.", { count: outputs.length })
          : t("Split into {count} files.", { count: outputs.length }),
      )
      closeDialog()
    } catch (splitError) {
      setError(splitError instanceof Error ? splitError.message : t("The document could not be split."))
      setBusy(null)
    }
  }

  return (
    <Dialog
      title={t("Split document")}
      onClose={closeDialog}
      footer={
        <>
          <span className="grow hint">{t("The original document stays open and unchanged.")}</span>
          <button type="button" className="btn" onClick={closeDialog} disabled={busy !== null}>
            {t("Cancel")}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void run()}
            disabled={busy !== null || pageCount === 0 || preview.error !== null}
          >
            {busy ? t("Splitting…") : t("Split PDF")}
          </button>
        </>
      }
    >
      <div className="segmented" role="tablist" aria-label={t("Split by")}>
        <button type="button" role="tab" aria-selected={mode === "pages"} onClick={() => setMode("pages")}>
          {t("By pages")}
        </button>
        <button type="button" role="tab" aria-selected={mode === "size"} onClick={() => setMode("size")}>
          {t("By size")}
        </button>
        <button type="button" role="tab" aria-selected={mode === "ranges"} onClick={() => setMode("ranges")}>
          {t("Page ranges")}
        </button>
      </div>

      {mode === "pages" ? (
        <Field label={t("Pages per file")} hint={t("The last file may hold fewer pages.")}>
          <input
            type="number"
            min={1}
            max={200}
            aria-label={t("Pages per file")}
            value={pagesPerFile}
            onChange={(event) => setPagesPerFile(event.target.value)}
          />
        </Field>
      ) : null}

      {mode === "size" ? (
        <Field
          label={t("Maximum size per file (MB)")}
          hint={t("A single page larger than this limit is saved on its own.")}
        >
          <input
            type="number"
            min={0.1}
            max={150}
            step={0.5}
            aria-label={t("Maximum size per file (MB)")}
            value={maxSizeMb}
            onChange={(event) => setMaxSizeMb(event.target.value)}
          />
        </Field>
      ) : null}

      {mode === "ranges" ? (
        <Field
          label={t("Page ranges")}
          hint={t("Each range becomes its own file, for example 1-3, 5, 8-10.")}
        >
          <input
            type="text"
            aria-label={t("Page ranges")}
            placeholder="1-3, 5, 8-10"
            value={rangeInput}
            onChange={(event) => setRangeInput(event.target.value)}
          />
        </Field>
      ) : null}

      <div className="note">
        {preview.error !== null
          ? t("Check the settings above.")
          : mode === "size"
            ? t("Each file stays under {size} MB.", { size: sizeMb })
            : preview.count === 1
              ? t("{count} file will be created.", { count: preview.count })
              : t("{count} files will be created.", { count: preview.count })}
        <br />
        <span className="hint">{t("Files are named like {name}", { name: exampleName })}</span>
      </div>

      {preview.error ? <p className="error-text">{preview.error}</p> : null}

      {busy ? (
        <div>
          <p className="hint">{busy.label}</p>
          <div className="progress">
            <span style={{ width: `${Math.round(busy.progress * 100)}%` }} />
          </div>
        </div>
      ) : null}

      {error ? <p className="error-text">{error}</p> : null}
    </Dialog>
  )
}
