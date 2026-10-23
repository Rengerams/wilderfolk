import { useState } from "react"
import { Dialog, Field } from "./Dialog"
import type { DocMetadata } from "../../types"
import { useEditor } from "../../app/store"

function toInputValue(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`
}

function fromInputValue(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
}

export function MetadataDialog() {
  const closeDialog = useEditor((state) => state.closeDialog)
  const setMetadata = useEditor((state) => state.setMetadata)
  const metadata = useEditor((state) => state.doc.metadata)
  const [draft, setDraft] = useState<DocMetadata>(metadata)

  const update = (patch: Partial<DocMetadata>) => setDraft((current) => ({ ...current, ...patch }))

  return (
    <Dialog
      title="Document details"
      onClose={closeDialog}
      wide
      footer={
        <>
          <span className="grow hint">These values are written into the PDF file, and everyone who opens it sees them.</span>
          <button type="button" className="btn" onClick={closeDialog}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setMetadata(draft)
              closeDialog()
            }}
          >
            Save details
          </button>
        </>
      }
    >
      <div className="grid-2">
        <Field label="Title">
          <input
            type="text"
            aria-label="Title"
            value={draft.title}
            onChange={(event) => update({ title: event.target.value })}
            placeholder="Document title"
          />
        </Field>
        <Field label="Author (created by)">
          <input
            type="text"
            aria-label="Author (created by)"
            value={draft.author}
            onChange={(event) => update({ author: event.target.value })}
            placeholder="Your name or organisation"
          />
        </Field>
      </div>
      <Field label="Subject">
        <input
          type="text"
          aria-label="Subject"
          value={draft.subject}
          onChange={(event) => update({ subject: event.target.value })}
          placeholder="What the document is about"
        />
      </Field>
      <Field label="Keywords" hint="Separate several keywords with commas.">
        <input
          type="text"
          aria-label="Keywords"
          value={draft.keywords}
          onChange={(event) => update({ keywords: event.target.value })}
          placeholder="invoice, 2026, scan"
        />
      </Field>
      <div className="grid-2">
        <Field label="Created with (creator)">
          <input
            type="text"
            aria-label="Creator"
            value={draft.creator}
            onChange={(event) => update({ creator: event.target.value })}
          />
        </Field>
        <Field label="Produced by (producer)">
          <input
            type="text"
            aria-label="Producer"
            value={draft.producer}
            onChange={(event) => update({ producer: event.target.value })}
          />
        </Field>
        <Field label="Creation date">
          <input
            type="datetime-local"
            value={toInputValue(draft.creationDate)}
            onChange={(event) => update({ creationDate: fromInputValue(event.target.value) })}
          />
        </Field>
        <Field label="Modification date">
          <input
            type="datetime-local"
            value={toInputValue(draft.modificationDate)}
            onChange={(event) => update({ modificationDate: fromInputValue(event.target.value) })}
          />
        </Field>
      </div>
      <div className="note">
        <strong>Tip:</strong> clearing a field and saving removes that value from the file, so you can also
        strip details you do not want to share.
      </div>
    </Dialog>
  )
}
