import { useEffect, useRef, useState } from "react"
import { Camera, FolderOpen, Play, RefreshCw, ScanLine, Trash2 } from "lucide-react"
import { Dialog, Field } from "./Dialog"
import { DEFAULT_BRIDGE_URL, listBridgeDevices, type BridgeDevice } from "../../scan/bridge"
import { cameraSupported, captureFrame, startCamera, stopCamera } from "../../scan/camera"
import { IMPORT_ACCEPT, pickFiles } from "../../app/files"
import { readImageInput, saveDocument } from "../../app/documentActions"
import { finishCameraScan, runBridgeScan } from "../../app/scanActions"
import { OCR_LANGUAGES } from "../../pdf/ocr"
import { currentSettings } from "../../storage/settings"
import { useEditor, type ImportedImage } from "../../app/store"
import { useT } from "../../i18n"

type Mode = "bridge" | "camera" | "files"

export function ScanDialog() {
  const t = useT()
  const closeDialog = useEditor((state) => state.closeDialog)
  const setStatus = useEditor((state) => state.setStatus)
  const pageCount = useEditor((state) => state.doc.pages.length)
  const [mode, setMode] = useState<Mode>("bridge")
  const [bridgeUrl, setBridgeUrl] = useState(DEFAULT_BRIDGE_URL)
  const [devices, setDevices] = useState<BridgeDevice[]>([])
  const [deviceId, setDeviceId] = useState("")
  const [paperSource, setPaperSource] = useState<"flatbed" | "feeder">("feeder")
  const [pageSize, setPageSize] = useState<"a4" | "a5" | "letter" | "legal">("a4")
  const [dpi, setDpi] = useState<150 | 200 | 300 | 600>(300)
  const [nativeUi, setNativeUi] = useState(true)
  const [languages, setLanguages] = useState<string[]>(currentSettings().defaultOcrLanguages)
  const [recognize, setRecognize] = useState(true)
  const [startNew, setStartNew] = useState(pageCount === 0)
  const [pending, setPending] = useState<ImportedImage[]>([])
  const [cameraOn, setCameraOn] = useState(false)
  const [busy, setBusy] = useState<{ label: string; progress: number } | null>(null)
  const [error, setError] = useState("")
  const [outcome, setOutcome] = useState<{ pages: number; recognizedLines: number } | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  const loadDevices = async () => {
    setError("")
    try {
      const list = await listBridgeDevices(bridgeUrl)
      setDevices(list)
      setDeviceId((current) => current || (list[0]?.id ?? ""))
    } catch (caught) {
      setDevices([])
      setError(caught instanceof Error ? caught.message : t("The scan bridge could not be reached."))
    }
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const list = await listBridgeDevices(bridgeUrl)
        if (cancelled) return
        setDevices(list)
        setDeviceId((current) => current || (list[0]?.id ?? ""))
      } catch (caught) {
        if (cancelled) return
        setDevices([])
        setError(caught instanceof Error ? caught.message : t("The scan bridge could not be reached."))
      }
    })()
    return () => {
      cancelled = true
      stopCamera()
    }
  }, [bridgeUrl, t])

  const scanWithBridge = async () => {
    setError("")
    setOutcome(null)
    setBusy({ label: t("Contacting the scanner"), progress: 0.02 })
    try {
      const result = await runBridgeScan(
        {
          bridgeUrl,
          deviceId: deviceId || undefined,
          paperSource,
          pageSize,
          dpi,
          showNativeUI: nativeUi,
          recognize,
          languages,
          startNewDocument: startNew,
        },
        (label, progress) => setBusy({ label, progress }),
      )
      setOutcome(result)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : t("Scanning failed.")
      setError(message)
      setStatus(`⚠ ${message}`)
    } finally {
      setBusy(null)
    }
  }

  const addPendingImages = async () => {
    if (pending.length === 0) return
    setError("")
    setOutcome(null)
    setBusy({ label: t("Adding pages"), progress: 0.3 })
    try {
      const result = await finishCameraScan(
        pending,
        { recognize, languages, startNewDocument: startNew },
        (label, progress) => setBusy({ label, progress }),
      )
      setPending([])
      setOutcome(result)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : t("The pages could not be added.")
      setError(message)
      setStatus(`⚠ ${message}`)
    } finally {
      setBusy(null)
    }
  }

  const toggleCamera = async () => {
    setError("")
    if (cameraOn) {
      stopCamera()
      setCameraOn(false)
      return
    }
    const video = videoRef.current
    if (!video) return
    try {
      await startCamera(video)
      setCameraOn(true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("The camera could not be started."))
    }
  }

  const pickScannedFiles = async () => {
    setError("")
    const files = await pickFiles(IMPORT_ACCEPT.replace(/,application\/pdf|,\.pdf/g, ""), true)
    if (!files) return
    try {
      const images = await Promise.all(files.filter((file) => !file.type.includes("pdf")).map(readImageInput))
      setPending((current) => [...current, ...images])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("Those files could not be read."))
    }
  }

  return (
    <Dialog
      title={t("Scan pages")}
      onClose={closeDialog}
      wide
      footer={
        <>
          <span className="grow hint">
            {recognize
              ? t("Text will be recognized ({languages}) so the saved PDF is searchable.", {
                  languages: languages.join(", "),
                })
              : t("Scanned pages are added as pictures.")}
          </span>
          <button type="button" className="btn" onClick={closeDialog}>
            {t("Close")}
          </button>
          {mode === "bridge" ? (
            <button type="button" className="btn btn-primary" onClick={() => void scanWithBridge()} disabled={busy !== null}>
              <ScanLine size={15} /> {busy ? t("Scanning…") : t("Start scan")}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void addPendingImages()}
              disabled={busy !== null || pending.length === 0}
            >
              <ScanLine size={15} />{" "}
              {pending.length === 1
                ? t("Add {count} page", { count: pending.length })
                : t("Add {count} pages", { count: pending.length })}
            </button>
          )}
        </>
      }
    >
      <div className="row" role="radiogroup" aria-label={t("Scan source")}>
        <button
          type="button"
          className="btn"
          aria-pressed={mode === "bridge"}
          onClick={() => setMode("bridge")}
        >
          <ScanLine size={15} /> {t("Scanner")}
        </button>
        <button type="button" className="btn" aria-pressed={mode === "camera"} onClick={() => setMode("camera")}>
          <Camera size={15} /> {t("Camera")}
        </button>
        <button type="button" className="btn" aria-pressed={mode === "files"} onClick={() => setMode("files")}>
          <FolderOpen size={15} /> {t("Scanned files")}
        </button>
      </div>

      {mode === "bridge" ? (
        <>
          <div className="note">
            <strong>{t("Scanner hardware")}</strong>{" "}
            {t("is reached through a small local bridge that runs the scanner driver on this PC (see")}{" "}
            <code>scan-bridge/README.md</code>
            {t("). It answers on")} <code>{bridgeUrl}</code>{" "}
            {t(
              "and supports flatbed and document feeder, A4/A5/Letter/Legal, and 150–600 DPI, including the option to show the scanner's own window.",
            )}
          </div>
          <div className="row">
            <Field label={t("Bridge address")}>
              <input
                type="text"
                value={bridgeUrl}
                onChange={(event) => setBridgeUrl(event.target.value)}
                onBlur={() => void loadDevices()}
              />
            </Field>
            <button type="button" className="btn" onClick={() => void loadDevices()}>
              <RefreshCw size={15} /> {t("Find scanners")}
            </button>
          </div>
          <div className="grid-2">
            <Field label={t("Scanner")}>
              <select value={deviceId} onChange={(event) => setDeviceId(event.target.value)}>
                <option value="">
                  {devices.length === 0 ? t("No scanner found") : t("Choose a scanner")}
                </option>
                {devices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("Paper source")}>
              <select
                value={paperSource}
                onChange={(event) => setPaperSource(event.target.value as "flatbed" | "feeder")}
              >
                <option value="feeder">{t("Document feeder (all pages)")}</option>
                <option value="flatbed">{t("Flatbed (one page)")}</option>
              </select>
            </Field>
          </div>
          <div className="grid-2">
            <Field label={t("Page size")}>
              <select
                value={pageSize}
                onChange={(event) => setPageSize(event.target.value as "a4" | "a5" | "letter" | "legal")}
              >
                <option value="a4">A4</option>
                <option value="a5">A5</option>
                <option value="letter">Letter</option>
                <option value="legal">Legal</option>
              </select>
            </Field>
            <Field label={t("Resolution")}>
              <select
                value={dpi}
                onChange={(event) => setDpi(Number(event.target.value) as 150 | 200 | 300 | 600)}
              >
                <option value={150}>{t("150 dpi (fast)")}</option>
                <option value={200}>200 dpi</option>
                <option value={300}>{t("300 dpi (recommended for OCR)")}</option>
                <option value={600}>{t("600 dpi (slow, large files)")}</option>
              </select>
            </Field>
          </div>
          <label className="checkbox">
            <input type="checkbox" checked={nativeUi} onChange={(event) => setNativeUi(event.target.checked)} />
            {t("Show the scanner's own window while scanning")}
          </label>
        </>
      ) : null}

      {mode === "camera" ? (
        <>
          <div className="note">
            {cameraSupported()
              ? t("Photograph the page: hold it flat and fill the frame. Each capture becomes one page.")
              : t(
                  "This environment cannot reach a camera. Use the scanner bridge or add scanned files instead.",
                )}
          </div>
          <video
            ref={videoRef}
            style={{ width: "100%", maxHeight: 300, background: "#000", borderRadius: 6 }}
            muted
            playsInline
          />
          <div className="row">
            <button type="button" className="btn" onClick={() => void toggleCamera()}>
              <Play size={15} /> {cameraOn ? t("Stop camera") : t("Start camera")}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!cameraOn}
              onClick={() => {
                const video = videoRef.current
                if (!video) return
                try {
                  setPending((current) => [...current, captureFrame(video)])
                } catch (caught) {
                  setError(caught instanceof Error ? caught.message : t("The picture could not be taken."))
                }
              }}
            >
              <Camera size={15} /> {t("Capture page")}
            </button>
          </div>
        </>
      ) : null}

      {mode === "files" ? (
        <>
          <div className="note">
            {t(
              "Scanned pages the scanner software already saved to this PC (PNG or JPEG) can be added straight to the document and recognized.",
            )}
          </div>
          <button type="button" className="btn" onClick={() => void pickScannedFiles()}>
            <FolderOpen size={15} /> {t("Choose scanned files…")}
          </button>
        </>
      ) : null}

      {pending.length > 0 ? (
        <div className="list">
          <strong>
            {pending.length === 1
              ? t("{count} page ready", { count: pending.length })
              : t("{count} pages ready", { count: pending.length })}
          </strong>
          <div className="row">
            <span className="grow hint">
              {t("They are added to the document when you press the button below.")}
            </span>
            <button type="button" className="btn btn-quiet" onClick={() => setPending([])}>
              <Trash2 size={15} /> {t("Clear")}
            </button>
          </div>
        </div>
      ) : null}

      <h3>{t("Text recognition")}</h3>
      <label className="checkbox">
        <input type="checkbox" checked={recognize} onChange={(event) => setRecognize(event.target.checked)} />
        {t("Recognize text so the PDF becomes searchable")}
      </label>
      {recognize ? (
        <div className="checkbox-grid">
          {OCR_LANGUAGES.map((language) => (
            <label key={language.code} className="checkbox">
              <input
                type="checkbox"
                checked={languages.includes(language.code)}
                onChange={(event) =>
                  setLanguages((current) =>
                    event.target.checked
                      ? [...current, language.code]
                      : current.length > 1
                        ? current.filter((code) => code !== language.code)
                        : current,
                  )
                }
              />
              {t(language.label)}
            </label>
          ))}
        </div>
      ) : null}
      <label className="checkbox">
        <input
          type="checkbox"
          checked={startNew}
          onChange={(event) => setStartNew(event.target.checked)}
          disabled={pageCount === 0}
        />
        {t("Start a new document instead of adding to the current one")}
      </label>

      {busy ? (
        <div>
          <p className="hint">{busy.label}</p>
          <div className="progress">
            <span style={{ width: `${Math.round(busy.progress * 100)}%` }} />
          </div>
        </div>
      ) : null}
      {outcome ? (
        <p className="success-text">
          {outcome.pages === 1
            ? t("Added {count} page", { count: outcome.pages })
            : t("Added {count} pages", { count: outcome.pages })}
          {outcome.recognizedLines > 0
            ? ` ${t("and recognized {lines} lines of text.", { lines: outcome.recognizedLines })}`
            : recognize
              ? ` ${t("— no text was recognized, so the pages stay pictures.")}`
              : "."}
        </p>
      ) : null}
      {error ? <p className="error-text">{error}</p> : null}
      {outcome ? (
        <button
          type="button"
          className="btn"
          onClick={async () => {
            try {
              await saveDocument()
              closeDialog()
            } catch (caught) {
              const message = caught instanceof Error ? caught.message : t("The document could not be saved.")
              setError(message)
            }
          }}
        >
          {t("Save the scanned document now")}
        </button>
      ) : null}
    </Dialog>
  )
}
