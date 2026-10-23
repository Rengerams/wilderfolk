import { useState } from "react"
import { Dialog } from "./Dialog"
import { saveDocument } from "../../app/documentActions"
import { emptyDocument, useEditor } from "../../app/store"
import { terminateOcrWorker } from "../../pdf/ocr"
import { stopCamera } from "../../scan/camera"

export function ExitDialog() {
  const closeDialog = useEditor((state) => state.closeDialog)
  const openDialog = useEditor((state) => state.openDialog)
  const setStatus = useEditor((state) => state.setStatus)
  const dirty = useEditor((state) => state.doc.dirty)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const close = () => {
    stopCamera()
    void terminateOcrWorker()
    openDialog("closed")
  }

  return (
    <Dialog
      title="Close PDF Studio?"
      onClose={closeDialog}
      footer={
        <>
          <span className="grow hint">Nothing is uploaded anywhere; saving keeps the document in your library.</span>
          <button type="button" className="btn" onClick={closeDialog} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger" onClick={close} disabled={busy}>
            Exit without saving
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              setError("")
              try {
                await saveDocument()
                setStatus("Saved and closed")
                close()
              } catch (caught) {
                const message = caught instanceof Error ? caught.message : "The document could not be saved."
                setError(message)
                setStatus(`⚠ ${message}`)
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy ? "Saving…" : dirty ? "Save and exit" : "Exit"}
          </button>
        </>
      }
    >
      <div className="note">
        {dirty
          ? "This document has changes that are not saved yet. You can save it into the library, leave without saving, or go back."
          : "Everything is saved. You can close the app whenever you like."}
      </div>
      {error ? <p className="error-text">{error}</p> : null}
    </Dialog>
  )
}

export function ClosedDialog() {
  const closeDialog = useEditor((state) => state.closeDialog)
  const replaceDocument = useEditor((state) => state.replaceDocument)

  return (
    <Dialog
      title="PDF Studio is closed"
      onClose={closeDialog}
      footer={
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            replaceDocument(emptyDocument())
            closeDialog()
          }}
        >
          Reopen PDF Studio
        </button>
      }
    >
      <div className="note">
        Your work is finished and the editor has been shut down cleanly. You can now close this window, or
        reopen the app to start another document.
      </div>
      <p className="hint">
        Opening a document again later: use <strong>Open from library</strong> for documents saved on this PC.
      </p>
    </Dialog>
  )
}
